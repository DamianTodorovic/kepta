// Gemeinsamer Korpusaufbau fuer Eval und Ablation.
//
// Vorher baute jedes Skript seinen eigenen Store: eval.ts ohne Entitaeten,
// ablation.ts mit. Damit massen die beiden verschiedene Systeme und ihre Zahlen
// waren nicht vergleichbar — ein Fehler, der genau dann auffaellt, wenn man
// anfaengt, den Zahlen zu glauben.
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";
import { indexMemory } from "../src/core/engine";
import { embedTexts, DEFAULT_EMBED_MODEL } from "../src/core/embeddings";
import { CORPUS, EVAL_NOW } from "./eval-corpus";

/** Wie die MCP-Schicht: Titel und [[Wiki-Links]] werden zu Entitaeten. */
const WIKI_LINK_RE = /\[\[([^[\]]{2,80})\]\]/g;

/**
 * v1 — die Suche, die K3PTA ersetzt hat: naives Substring-Scoring (Titel +10, Haystack
 * +5, Teilwoerter +1, Tag +3). Sie gehoert zum geteilten Werkzeug, weil zwei Skripte
 * denselben Grundzustand brauchen: `eval.ts` weist die Verbesserung an ihm aus, und
 * `eval-sprachuebergriff.ts` misst an ihm, was eine Sprachgrenze ohne Vektoren kostet.
 * Eigene Fassung in jedem Skript war der Anfang des Vergleichs, der keiner war: zwei
 * Aufbauten, zwei Suchwege, ein Wort dafuer.
 */
export function v1Suche(store: KeptaStore, query: string, limit = 5): string[] {
  const q = query.trim().toLowerCase();
  const all = store.listMemories({ limit: 1000 });
  if (!q) return all.slice(0, limit).map((m) => m.id);
  return all
    .map((m) => {
      const hay = `${m.title} ${m.content} ${m.tags.join(" ")}`.toLowerCase();
      let score = 0;
      if (m.title.toLowerCase().includes(q)) score += 10;
      if (hay.includes(q)) score += 5;
      for (const w of q.split(/\s+/).filter(Boolean)) if (hay.includes(w)) score += 1;
      for (const t of m.tags) if (t.toLowerCase().includes(q)) score += 3;
      return { id: m.id, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.id);
}

export interface AufbauOptionen {
  /** Embeddings ueber ein lokal laufendes Ollama erzeugen. */
  vektoren?: boolean;
}

export async function korpusAufbauen(opts: AufbauOptionen = {}): Promise<KeptaStore> {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-eval-"));
  const store = new KeptaStore(path.join(dir, "eval.db"));

  for (const m of CORPUS) {
    // Die Zeit gehoert zum Korpus, nicht zum Kalender: ohne diese zwei Felder setzte
    // der Speicher `Date.now()` (src/core/store.ts:759) und der Recency-Boost wanderte
    // mit der echten Uhr — derselbe Commit, zwei Zahlen. eval.ts hielt das schon immer
    // fest; der geteilte Aufbau hat es bis heute nicht mitbekommen.
    store.createMemory({
      id: m.id,
      title: m.title,
      content: m.content,
      tags: m.tags,
      validTo: m.validTo ?? null,
      createdAt: m.updatedAt ?? EVAL_NOW - 60 * 24 * 3600 * 1000,
      updatedAt: m.updatedAt ?? EVAL_NOW - 60 * 24 * 3600 * 1000,
    } as never);
    indexMemory(store, m.id);
    const links = [...m.content.matchAll(WIKI_LINK_RE)].map((x) => x[1]!.trim());
    store.linkEntities(m.id, [m.title, ...links]);
  }
  // Temporale Kette: m03 (Hamburg) wird durch m04 (Leipzig) ersetzt.
  store.supersedeMemory("m03", "m04");
  store.supersedeMemory("m53", "m54");
  store.supersedeMemory("m55", "m56");

  if (opts.vektoren) {
    for (;;) {
      const offen = store.chunksNeedingEmbedding(32, DEFAULT_EMBED_MODEL);
      if (offen.length === 0) break;
      const res = await embedTexts(offen.map((c) => c.text));
      if (!res.ok || res.embeddings.length !== offen.length) {
        throw new Error(`Embeddings fehlgeschlagen (${res.error ?? "unbekannt"}) — laeuft Ollama mit ${DEFAULT_EMBED_MODEL}?`);
      }
      offen.forEach((c, i) => store.setEmbedding(c.memoryId, c.seq, res.embeddings[i]!, DEFAULT_EMBED_MODEL));
    }
  }
  return store;
}
