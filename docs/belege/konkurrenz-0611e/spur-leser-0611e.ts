// P118 — dieselbe eigne Rangfolge wie in P112, aber mit vollem erwartet-Feld.
//
// Warum diese Datei neben der aeltern liegt und nicht sie ueberschreibt: die
// P112-Spur (`konkurrenz-0611c/spur-leser.ts:36`) schreibt `erwartet: q.relevant[0]`,
// also nur den ersten gueltigen Ausweis. Ihre Aggregat-Zeile war trotzdem richtig, weil
// P112 gegen das Korpus rechnet, nicht gegen das Feld. Aber ein Leser, der das Feld fuer
// die Erwartung haelt, maht 30 statt 34 (nomic) und 31 statt 35 (bge-m3). Diese Fassung
// schreibt die ganze Liste und prueft beim Schreiben, dass ihre Laenge zu
// `anzahl_erwartet` passt -- damit ein Verlust nicht noch einmal als Feld getarnt wird.
//
// Die Rangfolge selbst wird nicht geaendert: derselbe Aufbau (scripts/eval-store.ts),
// dieselbe Suchmaschine (src/core/engine.ts), dieselben Fragen. Ein Fall in
// `tests/konkurrenz-chroma-latte.test.ts` vergleicht die ersten Stellen mit P112.
import { writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { searchMemories } from "/Users/damiantodorovic/kepta-app/src/core/engine";
import { DEFAULT_EMBED_MODEL, embedQuery } from "/Users/damiantodorovic/kepta-app/src/core/embeddings";
import { korpusAufbauen } from "/Users/damiantodorovic/kepta-app/scripts/eval-store";
import { QUERIES } from "/Users/damiantodorovic/kepta-app/scripts/eval-corpus";

const AUS = process.argv[2]!;

async function main() {
  const sonde = await embedQuery("sonde");
  if (!sonde) throw new Error(`Der Embedder antwortet nicht (${DEFAULT_EMBED_MODEL}).`);
  const zeilen: string[] = [];
  zeilen.push(JSON.stringify({ art: "kopf", stufe: DEFAULT_EMBED_MODEL, dimensionen: sonde.length, anfragen: QUERIES.length }));
  const mit = await korpusAufbauen({ vektoren: true });
  let treffer1 = 0;
  let summe5 = 0;
  let summeMrr = 0;
  for (const [i, q] of QUERIES.entries()) {
    const res = await searchMemories(mit, { query: q.query, limit: 10 });
    const liste = res.hits.map((h) => h.memory.id);
    const relevante = new Set(q.relevant);
    const top5 = liste.slice(0, 5);
    const hit1 = top5.length > 0 && relevante.has(top5[0]!);
    const r5 = top5.filter((x) => relevante.has(x)).length / Math.min(5, Math.max(1, q.relevant.length));
    let mrr = 0;
    for (let n = 0; n < liste.length; n++) if (relevante.has(liste[n]!)) { mrr = 1 / (n + 1); break; }
    treffer1 += hit1 ? 1 : 0;
    summe5 += r5;
    summeMrr += mrr;
    zeilen.push(JSON.stringify({
      art: "suche", i, kategorie: q.kategorie, frage: q.query,
      erwartet: [...q.relevant], anzahl_erwartet: q.relevant.length,
      top: top5[0] ?? null, treffer: hit1, r5, mrr, liste,
    }));
  }
  mit.close();
  rmSync(path.dirname(mit.dbPath), { recursive: true, force: true });
  zeilen.push(JSON.stringify({
    art: "summary", stufe: DEFAULT_EMBED_MODEL, anfragen: QUERIES.length,
    hit1: treffer1 / QUERIES.length, r5: summe5 / QUERIES.length, mrr: summeMrr / QUERIES.length,
  }));
  writeFileSync(AUS, zeilen.join("\n") + "\n");
  console.log(`${DEFAULT_EMBED_MODEL}: Hit@1 ${(100 * treffer1 / QUERIES.length).toFixed(1)} % · R@5 ${(100 * summe5 / QUERIES.length).toFixed(1)} % · MRR ${(summeMrr / QUERIES.length).toFixed(3)} · Spur ${AUS}`);
}
void main();
