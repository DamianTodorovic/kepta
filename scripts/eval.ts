// K3PTA Eval — Recall@5 (gekappt) + Hit@1 + MRR der Retrieval-Engine gegen das Fixkorpus.
//
// Gekappt deshalb, weil der Nenner min(5, relevante Notizen) ist: gemessen wird, wie viel
// der gesuchten Notizen in den ersten fuenfen angekommen ist — das ist ein Recall, keine
// Precision. Der Name war hier Precision@5, und die Zahl desselben Korpus in
// scripts/ablation.ts heisst P@5 und teilt durch 5: auf demselben Bestand meldet dieser
// Lauf 81 %, jene 23 %. Zwei Metriken, zwei Namen — seit 13.10. sagt die Ausgabe auch, was
// sie meint (Leitung, nach Blick in die Rechenstelle).
//
// Vergleich in drei Beinen: v1-naive Suche (Substring-Scoring) vs. v2-Engine ohne Vektoren
// vs. v3-Engine mit Vektoren. Das dritte Bein ist das ausgelieferte: die Engine setzt
// vector=true per Default (src/core/engine.ts:395) und ignoriert fehlende Embeddings
// lautlos. Ein Korpus ohne Embeddings mass also nie das System, das der Nutzer faehrt —
// genau deshalb steht v3 hier, und wenn Ollama nicht antwortet, sagt die Ausgabe welchen
// Grund sie hat, statt still zwei Beine zu zeigen.
//
// Der Korpusbau ist gemeinsam mit der Ablation in scripts/eval-store.ts: zwei Werkzeuge,
// ein Aufbau. Vorher baute jedes seinen eigenen — eval ohne Entitaeten, ablation mit — und
// ihre Zahlen waren, obwohl sie dasselbe Wort benutzen, nicht vergleichbar.
//
// Laeuft via `npm run eval`; v1 und v2 brauchen kein Ollama, v3 schon.
import path from "node:path";
import fs from "node:fs";
import type { KeptaStore } from "../src/core/store";
import { searchMemories as engineSearch } from "../src/core/engine";
import { embedQuery, ollamaBaseUrl, DEFAULT_EMBED_MODEL } from "../src/core/embeddings";
import { korpusAufbauen, v1Suche } from "./eval-store";
import { CORPUS, QUERIES, EVAL_NOW, type EvalQuery } from "./eval-corpus";

interface Row {
  query: string;
  kategorie: EvalQuery["kategorie"];
  hit1: boolean;
  p5: number;
  mrr: number;
}

async function evaluate(searchFn: (store: KeptaStore, query: string) => Promise<string[]> | string[], store: KeptaStore): Promise<Row[]> {
  const rows: Row[] = [];
  for (const q of QUERIES) {
    const ranked = await searchFn(store, q.query);
    const top5 = ranked.slice(0, 5);
    const relevant = new Set(q.relevant);
    const hit1 = top5.length > 0 && relevant.has(top5[0]!);
    const hitsIn5 = top5.filter((id) => relevant.has(id)).length;
    const p5 = hitsIn5 / Math.min(5, Math.max(1, q.relevant.length));
    let mrr = 0;
    for (let i = 0; i < ranked.length; i++) {
      if (relevant.has(ranked[i]!)) {
        mrr = 1 / (i + 1);
        break;
      }
    }
    rows.push({ query: q.query, kategorie: q.kategorie, hit1, p5, mrr });
  }
  return rows;
}

function summarize(rows: Row[], label: string): { p5: number; hit1: number; mrr: number } {
  const p5 = rows.reduce((s, r) => s + r.p5, 0) / rows.length;
  const hit1 = rows.filter((r) => r.hit1).length / rows.length;
  const mrr = rows.reduce((s, r) => s + r.mrr, 0) / rows.length;
  console.log(`\n${label}`);
  console.log(`  Recall@5 (capped): ${(p5 * 100).toFixed(1)} %`);
  console.log(`  Hit@1:       ${(hit1 * 100).toFixed(1)} %`);
  console.log(`  MRR:         ${mrr.toFixed(3)}`);
  kategorieSpalte(rows);
  return { p5, hit1, mrr };
}

/**
 * Mittelwerte verstecken genau das Interessante: eine Engine, die lexikalische Anfragen
 * zu 100 % und Umschreibungen zu 40 % trifft, meldet einen achtbaren Gesamt-Hit@1.
 * Also pro Kategorie hinter die Zahl — die Kategorien sind in scripts/eval-corpus.ts
 * dieselben, die scripts/ablation.ts bereits je Konfiguration ausweist.
 */
function kategorieSpalte(rows: Row[]): void {
  const kategorien = [...new Set(rows.map((r) => r.kategorie))].sort();
  console.log("     nach Anfrageart          n   Hit@1   R@5    MRR");
  for (const k of kategorien) {
    const teil = rows.filter((r) => r.kategorie === k);
    const h1 = teil.filter((r) => r.hit1).length / teil.length;
    const r5 = teil.reduce((s, r) => s + r.p5, 0) / teil.length;
    const mr = teil.reduce((s, r) => s + r.mrr, 0) / teil.length;
    console.log(
      `  ${k.padEnd(24)} ${String(teil.length).padStart(2)}   ${(h1 * 100).toFixed(0).padStart(3)} %  ${(r5 * 100).toFixed(0).padStart(3)} %  ${mr.toFixed(2).padStart(5)}`
    );
  }
}

function raeumen(store: KeptaStore): void {
  store.close();
  fs.rmSync(path.dirname(store.dbPath), { recursive: true, force: true });
}

async function main() {
  console.log(`\nKorpus: ${CORPUS.length} Notizen, ${QUERIES.length} Anfragen, Zeitanker ${new Date(EVAL_NOW).toISOString()}`);
  console.log("Aufbau: scripts/eval-store.ts — derselbe wie scripts/ablation.ts.");

  // --- Bein 1 und 2: ohne Vektoren, damit der Lauf ohne Ollama durchgeht ---
  const ohne = await korpusAufbauen({ vektoren: false });
  const naiveRows = await evaluate(v1Suche, ohne);
  const naive = summarize(naiveRows, "── v1-Baseline (naive Substring-Suche) ──");
  const engineRows = await evaluate(async (s, q) => {
    const res = await engineSearch(s, { query: q, limit: 10 });
    return res.hits.map((h) => h.memory.id);
  }, ohne);
  const engine = summarize(engineRows, "── v2-Engine (BM25 + RRF + Temporal + Entitaeten, ohne Vektoren) ──");
  raeumen(ohne);

  console.log("\n── Verbesserung v1 -> v2 ──");
  console.log(`  Recall@5 (capped): +${(((engine.p5 - naive.p5) / Math.max(naive.p5, 1e-9)) * 100).toFixed(0)} % relativ`);
  console.log(`  Hit@1:       +${(((engine.hit1 - naive.hit1) / Math.max(naive.hit1, 1e-9)) * 100).toFixed(0)} % relativ`);

  // --- Bein 3: das ausgelieferte System, nur wenn der Embedder wirklich antwortet ---
  const sonde = await embedQuery("sonde");
  if (!sonde) {
    console.log("\n── v3-Engine (mit Vektoren) ── UEBERSPRUNGEN");
    console.log(`  Der Embedder antwortet nicht: ${ollamaBaseUrl()} · Modell ${DEFAULT_EMBED_MODEL}.`);
    console.log("  Ollama starten und das Modell laden, dann neu laufen lassen. Die zwei Beine oben");
    console.log("  sind ohne Vektoren gemessen — sie sind NICHT das ausgelieferte Retrieval.");
  } else {
    const mit = await korpusAufbauen({ vektoren: true });
    const v3Rows = await evaluate(async (s, q) => {
      const res = await engineSearch(s, { query: q, limit: 10 });
      return res.hits.map((h) => h.memory.id);
    }, mit);
    const mitVektoren = summarize(v3Rows, "── v3-Engine (BM25 + Vektor + Entitaeten — ausgeliefertes Retrieval) ──");
    raeumen(mit);
    console.log("\n── Beitrag der Vektoren (v2 -> v3) ──");
    console.log(`  Recall@5 (capped): ${mitVektoren.p5 >= engine.p5 ? "+" : ""}${(((mitVektoren.p5 - engine.p5) / Math.max(engine.p5, 1e-9)) * 100).toFixed(0)} % relativ`);
    console.log(`  Hit@1:       ${mitVektoren.hit1 >= engine.hit1 ? "+" : ""}${(((mitVektoren.hit1 - engine.hit1) / Math.max(engine.hit1, 1e-9)) * 100).toFixed(0)} % relativ`);
  }

  // Detail-Tabelle der Engine
  console.log("\nDetails (v2-Engine):");
  for (const r of engineRows) {
    const mark = r.hit1 ? "✓" : r.p5 > 0 ? "~" : "✗";
    console.log(`  ${mark} ${r.query.padEnd(40)} ${r.kategorie.padEnd(14)} R@5 gekappt ${(r.p5 * 100).toFixed(0).padStart(3)} %  MRR ${r.mrr.toFixed(2)}`);
  }
}

void main();
