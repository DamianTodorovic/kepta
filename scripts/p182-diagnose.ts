// P182-Diagnose: die umschreibung-Verluste an der bge-Stufe — was trägt welches Bein?
import { searchMemories } from "../src/core/engine";
import { korpusAufbauen } from "./eval-store";
import { QUERIES } from "./eval-corpus";

const store = await korpusAufbauen({ vektoren: true });
for (let i = 0; i < QUERIES.length; i++) {
  const q = QUERIES[i]!;
  if (q.kategorie !== "umschreibung") continue;
  const fusion = await searchMemories(store, { query: q.query, limit: 5 });
  const vektor = await searchMemories(store, { query: q.query, limit: 3, tracks: { bm25: false, vector: true, entity: false } });
  const wort = await searchMemories(store, { query: q.query, limit: 3, tracks: { bm25: true, vector: false, entity: false } });
  const f = fusion.hits.map(h => h.memory.id);
  const v = vektor.hits.map(h => h.memory.id);
  const w = wort.hits.map(h => h.memory.id);
  const hit = f[0] && q.relevant.includes(f[0]);
  console.log(`${hit ? "TREFFER" : "daneben"} | ${q.query}`);
  console.log(`   relevant: ${q.relevant.join(",")} | fusion: ${f.join(",")} | vektor: ${v.join(",")} | wort: ${w.join(",")}`);
}
