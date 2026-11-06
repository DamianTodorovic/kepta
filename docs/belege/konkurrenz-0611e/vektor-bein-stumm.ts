// P120 -- wann schaltet die Engine ihr Vektor-Bein selbst ab?
//
// Anlass, gemessen 19:16:38 MEZ (P119): mit tracks {bm25:false, vector:true, entity:false}
// und KEPTA_EMBED_MODEL=bge-m3 antwortet "Hetzner" mit einer LEEREN Liste, an der
// nomic-Stufe dagegen mit vier Notizen. Der Grund steht in src/core/engine.ts:551 --
//     untergrenze = Math.max(VECTOR_FLOOR, bestSim * VECTOR_BAND)
// mit VECTOR_FLOOR = 0.58 (engine.ts:51) und VECTOR_BAND = 0.86 (engine.ts:37). Eine
// absolute Cosinus-Untergrenze ist *modelabhaengig*: bge-m3 liegt mit denselben Texten
// niedriger als nomic, und unter 0,58 faellt die ganze Kandidatenliste durch die Masche.
//
// Diese Fahrnis zaehlt den Fall an allen 45 Anfragen, je Stufe, und nennt fuer jede
// stumme Anfrage die hoechste Aehnlichkeit, die das Bein verworfen haette (zweite
// Fahrnis: vektor-stumm-sonde.py, dieselbe Cosinus-Rechnung von Hand).
//
// Fahrbar:  npx tsx docs/belege/konkurrenz-0611e/vektor-bein-stumm.ts
import { searchMemories } from "../../../src/core/engine";
import { korpusAufbauen } from "../../../scripts/eval-store";
import { QUERIES } from "../../../scripts/eval-corpus";
import { DEFAULT_EMBED_MODEL } from "../../../src/core/embeddings";

async function main() {
  const store = await korpusAufbauen({ vektoren: true });
  let stumm = 0;
  const zeilen: string[] = [];
  for (const [i, q] of QUERIES.entries()) {
    const res = await searchMemories(store, { query: q.query, limit: 10, tracks: { bm25: false, vector: true, entity: false } });
    const sims = res.hits.map((h) => h.components.vectorSimilarity).filter((x): x is number => typeof x === "number");
    const leer = res.hits.length === 0;
    if (leer) stumm++;
    zeilen.push(`${String(i).padStart(2)} ${q.kategorie.padEnd(13)} ${leer ? "STUMM" : "traegt "} ` +
      `Treffer ${String(res.hits.length).padStart(2)} ` +
      `beste Cosinus ${sims.length ? Math.max(...sims).toFixed(4) : "(keine)"} ` +
      `| ${JSON.stringify(q.query)}`);
  }
  store.close();
  const fs = await import("node:fs");
  const path = await import("node:path");
  fs.rmSync(path.dirname(store.dbPath), { recursive: true, force: true });
  console.log(`Stufe: ${DEFAULT_EMBED_MODEL}`);
  console.log(zeilen.join("\n"));
  console.log(`Vektor-Bein allein: ${stumm} von ${QUERIES.length} Anfragen liefern eine leere Liste`);
}
void main();
