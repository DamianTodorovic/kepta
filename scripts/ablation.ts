// KEPTA Ablation — was traegt jedes Retrieval-Bein wirklich bei?
//
// Anlass: Das bestehende Eval misst die Engine "ohne Vektoren" und verknuepft
// keine Entitaeten. Die dort ausgewiesenen 92 % Hit@1 stammen damit aus BM25
// allein — nicht aus der Fusion, mit der sie oft zitiert werden. Ohne diese
// Messung ist "Reciprocal Rank Fusion at k=60" Vokabular, kein Beleg.
//
// Dieses Skript baut denselben Korpus auf, erzeugt echte Embeddings ueber ein
// lokal laufendes Ollama, verknuepft [[Wiki-Links]] wie die MCP-Schicht es tut,
// und misst vier Konfigurationen gegeneinander.
//
// Aufruf:  npx tsx scripts/ablation.ts        (braucht Ollama mit nomic-embed-text)
//          npx tsx scripts/ablation.ts --json
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";
import { searchMemories, indexMemory } from "../src/core/engine";
import { embedTexts, DEFAULT_EMBED_MODEL } from "../src/core/embeddings";
import { CORPUS, QUERIES, EVAL_NOW } from "./eval-corpus";

const WIKI_LINK_RE = /\[\[([^\[\]]{2,80})\]\]/g;

interface Messwert {
  name: string;
  hit1: number;
  p5: number;
  mrr: number;
  treffer: number;
}

async function korpusAufbauen(mitVektoren: boolean): Promise<KeptaStore> {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-ablation-"));
  const store = new KeptaStore(path.join(dir, "ablation.db"));

  for (const m of CORPUS) {
    store.createMemory({
      id: m.id, title: m.title, content: m.content, tags: m.tags,
      validTo: m.validTo ?? null,
    } as never);
    indexMemory(store, m.id);
    // Wie die MCP-Schicht: Titel und [[Wiki-Links]] werden zu Entitaeten.
    const links = [...m.content.matchAll(WIKI_LINK_RE)].map((x) => x[1]!.trim());
    store.linkEntities(m.id, [m.title, ...links]);
  }
  store.supersedeMemory("m03", "m04");

  if (mitVektoren) {
    // Embeddings in Stapeln erzeugen, sonst dauert es unnoetig lange.
    for (;;) {
      const offen = store.chunksNeedingEmbedding(32, DEFAULT_EMBED_MODEL);
      if (offen.length === 0) break;
      const res = await embedTexts(offen.map((c) => c.text));
      if (!res.ok || res.embeddings.length !== offen.length) {
        console.error(`  Embeddings fehlgeschlagen (${res.error ?? "unbekannt"}) — laeuft Ollama mit ${DEFAULT_EMBED_MODEL}?`);
        process.exit(1);
      }
      offen.forEach((c, i) => store.setEmbedding(c.memoryId, c.seq, res.embeddings[i]!, DEFAULT_EMBED_MODEL));
    }
  }
  return store;
}

async function messen(store: KeptaStore, name: string, tracks: { bm25: boolean; vector: boolean; entity: boolean }): Promise<Messwert> {
  let hit1 = 0, p5 = 0, mrr = 0, treffer = 0;
  for (const q of QUERIES) {
    const res = await searchMemories(store, { query: q.query, limit: 10, tracks });
    const ids = res.hits.map((h) => h.memory.id);
    if (ids.length > 0) treffer++;
    if (ids[0] && q.relevant.includes(ids[0])) hit1++;
    const top5 = ids.slice(0, 5);
    p5 += top5.filter((id) => q.relevant.includes(id)).length / 5;
    const rang = ids.findIndex((id) => q.relevant.includes(id));
    if (rang >= 0) mrr += 1 / (rang + 1);
  }
  const n = QUERIES.length;
  return { name, hit1: hit1 / n, p5: p5 / n, mrr: mrr / n, treffer };
}

const mitVektoren = !process.argv.includes("--no-vectors");
const store = await korpusAufbauen(mitVektoren);

const konfigurationen: [string, { bm25: boolean; vector: boolean; entity: boolean }][] = [
  ["BM25 allein", { bm25: true, vector: false, entity: false }],
  ["Vektor allein", { bm25: false, vector: true, entity: false }],
  ["Graph allein", { bm25: false, vector: false, entity: true }],
  ["BM25 + Vektor", { bm25: true, vector: true, entity: false }],
  ["BM25 + Graph", { bm25: true, vector: false, entity: true }],
  ["Alle drei (RRF)", { bm25: true, vector: true, entity: true }],
];

const werte: Messwert[] = [];
for (const [name, tracks] of konfigurationen) {
  if (!mitVektoren && tracks.vector) continue;
  werte.push(await messen(store, name, tracks));
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ queries: QUERIES.length, korpus: CORPUS.length, vektoren: mitVektoren, werte }, null, 2));
} else {
  console.log(`\nKEPTA Ablation — ${CORPUS.length} Notizen, ${QUERIES.length} Anfragen${mitVektoren ? "" : ", ohne Vektoren"}\n`);
  console.log("  Konfiguration      Hit@1    P@5     MRR   Anfragen mit Treffer");
  console.log("  " + "─".repeat(62));
  const basis = werte[0]!;
  for (const w of werte) {
    const delta = w === basis ? "" : `  ${w.hit1 >= basis.hit1 ? "+" : ""}${((w.hit1 - basis.hit1) * 100).toFixed(0)} Pp`;
    console.log(
      `  ${w.name.padEnd(18)} ${(w.hit1 * 100).toFixed(0).padStart(3)} %  ${(w.p5 * 100).toFixed(0).padStart(3)} %  ${w.mrr.toFixed(2)}   ${String(w.treffer).padStart(2)}/${QUERIES.length}${delta}`
    );
  }
  console.log("\n  Pp = Prozentpunkte gegenueber BM25 allein.\n");
}
