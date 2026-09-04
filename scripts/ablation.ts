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
import { searchMemories } from "../src/core/engine";
import { CORPUS, QUERIES } from "./eval-corpus";
import { korpusAufbauen } from "./eval-store";

interface Messwert {
  name: string;
  hit1: number;
  p5: number;
  mrr: number;
  treffer: number;
  /** Hit@1 je Anfragekategorie — ein Mittelwert versteckt genau das Interessante. */
  proKategorie: Record<string, number>;
}

async function messen(store: KeptaStore, name: string, tracks: { bm25: boolean; vector: boolean; entity: boolean }): Promise<Messwert> {
  let hit1 = 0, p5 = 0, mrr = 0, treffer = 0;
  const katTreffer: Record<string, number> = {};
  const katGesamt: Record<string, number> = {};
  for (const q of QUERIES) {
    katGesamt[q.kategorie] = (katGesamt[q.kategorie] ?? 0) + 1;
    const res = await searchMemories(store, { query: q.query, limit: 10, tracks });
    const ids = res.hits.map((h) => h.memory.id);
    if (ids.length > 0) treffer++;
    if (ids[0] && q.relevant.includes(ids[0])) {
      hit1++;
      katTreffer[q.kategorie] = (katTreffer[q.kategorie] ?? 0) + 1;
    }
    const top5 = ids.slice(0, 5);
    p5 += top5.filter((id) => q.relevant.includes(id)).length / 5;
    const rang = ids.findIndex((id) => q.relevant.includes(id));
    if (rang >= 0) mrr += 1 / (rang + 1);
  }
  const n = QUERIES.length;
  const proKategorie: Record<string, number> = {};
  for (const k of Object.keys(katGesamt)) proKategorie[k] = (katTreffer[k] ?? 0) / katGesamt[k]!;
  return { name, hit1: hit1 / n, p5: p5 / n, mrr: mrr / n, treffer, proKategorie };
}

const mitVektoren = !process.argv.includes("--no-vectors");
const store = await korpusAufbauen({ vektoren: mitVektoren });

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
  console.log("\n  Pp = Prozentpunkte gegenueber BM25 allein.");

  const kategorien = Object.keys(werte[0]!.proKategorie).sort();
  const anzahl: Record<string, number> = {};
  for (const q of QUERIES) anzahl[q.kategorie] = (anzahl[q.kategorie] ?? 0) + 1;
  console.log("\n  Hit@1 je Anfragekategorie — hier zeigt sich, welches Bein wofuer da ist\n");
  console.log("  Konfiguration      " + kategorien.map((k) => `${k} (${anzahl[k]})`.padStart(18)).join(""));
  console.log("  " + "─".repeat(18 + kategorien.length * 18));
  for (const w of werte) {
    console.log("  " + w.name.padEnd(18) + kategorien.map((k) => `${(w.proKategorie[k]! * 100).toFixed(0)} %`.padStart(18)).join(""));
  }
  console.log();
}
