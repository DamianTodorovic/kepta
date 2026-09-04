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
import { CORPUS } from "./eval-corpus";

/** Wie die MCP-Schicht: Titel und [[Wiki-Links]] werden zu Entitaeten. */
const WIKI_LINK_RE = /\[\[([^\[\]]{2,80})\]\]/g;

export interface AufbauOptionen {
  /** Embeddings ueber ein lokal laufendes Ollama erzeugen. */
  vektoren?: boolean;
}

export async function korpusAufbauen(opts: AufbauOptionen = {}): Promise<KeptaStore> {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-eval-"));
  const store = new KeptaStore(path.join(dir, "eval.db"));

  for (const m of CORPUS) {
    store.createMemory({
      id: m.id,
      title: m.title,
      content: m.content,
      tags: m.tags,
      validTo: m.validTo ?? null,
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
