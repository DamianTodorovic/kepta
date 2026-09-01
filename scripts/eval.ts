// KEPTA Eval — Precision@5 + Hit@1 + MRR der Retrieval-Engine gegen das Fixkorpus.
// Vergleich: v1-naive Suche (Substring-Scoring) vs. v2-Engine (BM25+RRF+Temporal).
// Läuft deterministisch offline (keine Vektoren), via `npm run eval`.
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";
import { searchMemories as engineSearch, indexMemory } from "../src/core/engine";
import { CORPUS, QUERIES, EVAL_NOW, type EvalMemory } from "./eval-corpus";

interface Row {
  query: string;
  hit1: boolean;
  p5: number;
  mrr: number;
}

/** v1-Suche: naives Substring-Scoring (Titel +10, Haystack +5, Teilwörter +1, Tag +3) */
function naiveSearch(store: KeptaStore, query: string, limit = 5): string[] {
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
    rows.push({ query: q.query, hit1, p5, mrr });
  }
  return rows;
}

function summarize(rows: Row[], label: string): { p5: number; hit1: number; mrr: number } {
  const p5 = rows.reduce((s, r) => s + r.p5, 0) / rows.length;
  const hit1 = rows.filter((r) => r.hit1).length / rows.length;
  const mrr = rows.reduce((s, r) => s + r.mrr, 0) / rows.length;
  console.log(`\n${label}`);
  console.log(`  Precision@5: ${(p5 * 100).toFixed(1)} %`);
  console.log(`  Hit@1:       ${(hit1 * 100).toFixed(1)} %`);
  console.log(`  MRR:         ${mrr.toFixed(3)}`);
  return { p5, hit1, mrr };
}

async function main() {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-eval-"));
  const store = new KeptaStore(path.join(dir, "eval.db"));

  const now = EVAL_NOW;
  for (const m of CORPUS) {
    store.createMemory({
      id: m.id,
      title: m.title,
      content: m.content,
      tags: m.tags,
      validTo: m.validTo ?? null,
      createdAt: m.updatedAt ?? now - 60 * 24 * 3600 * 1000,
      updatedAt: m.updatedAt ?? now - 60 * 24 * 3600 * 1000,
    });
  }
  // Temporale Kette: m03 (Berlin) wird durch m04 (München) ersetzt
  store.supersedeMemory("m03", "m04");
  // Duplikat-Paar m16/m17 bleibt — Engine-Konsolidierung würde es finden

  // --- v1-Baseline ---
  const naiveRows = await evaluate((s, q) => naiveSearch(s, q), store);
  const naive = summarize(naiveRows, "── v1-Baseline (naive Substring-Suche) ──");

  // --- v2-Engine (rein lexikalisch, kein Ollama nötig) ---
  const engineRows = await evaluate(async (s, q) => {
    const res = await engineSearch(s, { query: q, limit: 10 });
    return res.hits.map((h) => h.memory.id);
  }, store);
  const engine = summarize(engineRows, "── v2-Engine (BM25 + RRF + Temporal, ohne Vektoren) ──");

  console.log("\n── Verbesserung ──");
  console.log(`  Precision@5: +${(((engine.p5 - naive.p5) / Math.max(naive.p5, 1e-9)) * 100).toFixed(0)} % relativ`);
  console.log(`  Hit@1:       +${(((engine.hit1 - naive.hit1) / Math.max(naive.hit1, 1e-9)) * 100).toFixed(0)} % relativ`);

  // Detail-Tabelle der Engine
  console.log("\nDetails (Engine):");
  for (const r of engineRows) {
    const mark = r.hit1 ? "✓" : r.p5 > 0 ? "~" : "✗";
    console.log(`  ${mark} ${r.query.padEnd(40)} P@5 ${(r.p5 * 100).toFixed(0).padStart(3)} %  MRR ${r.mrr.toFixed(2)}`);
  }

  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
}

void main();
