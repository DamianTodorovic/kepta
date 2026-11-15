// P119 -- wem die erste Stelle auf der Gleichstands-Anfrage gehoert.
//
// Anlass, gemessen 19:01:41 MEZ (P118): die einzige Anfrage mit einem Gleichstand auf
// Platz 1 ist "Hetzner" an der bge-Stufe. chroma setzt m16 zuerst (gilt), sqlite-vec m17
// (gilt nicht) -- beide melden Abstand 0,499727, die Aehnlichkeiten sind auf 16 Stellen
// gleich. Unsre Auslieferung setzt auf dieser Anfrage m36 an die erste Stelle, eine Notiz,
// die zur Gleichstands-Gruppe ueberhaupt nicht gehoert. Im Ledger stand seitdem der Satz,
// das tue BM25, Entitaeten *und Zeitstrahl*. Der Zeitstrahl ist damit nicht belegt: die
// Engine schaltet drei Beine (src/core/engine.ts:485 -- bm25, vector, entity), ein
// temporal-Bein gibt es als Schalter nicht. Also wird hier jedes Bein einzeln und in allen
// Paaren gefahren, und der Satz wird auf das gekuerzt, was misst.
//
// Fahrbar:  npx tsx docs/belege/konkurrenz-0611e/beine-auf-gleichstand.ts
import { searchMemories } from "../../../src/core/engine";
import { korpusAufbauen } from "../../../scripts/eval-store";
import { QUERIES } from "../../../scripts/eval-corpus";
import { DEFAULT_EMBED_MODEL } from "../../../src/core/embeddings";

const BEINE: [string, { bm25: boolean; vector: boolean; entity: boolean }][] = [
  ["alle drei Beine", { bm25: true, vector: true, entity: true }],
  ["nur BM25", { bm25: true, vector: false, entity: false }],
  ["nur Vektor", { bm25: false, vector: true, entity: false }],
  ["nur Entitaeten", { bm25: false, vector: false, entity: true }],
  ["BM25 + Vektor", { bm25: true, vector: true, entity: false }],
  ["BM25 + Entitaeten", { bm25: true, vector: false, entity: true }],
  ["Vektor + Entitaeten", { bm25: false, vector: true, entity: true }],
  ["kein Bein (leer)", { bm25: false, vector: false, entity: false }],
];

async function main() {
  const stufe = DEFAULT_EMBED_MODEL;
  const anfragen = QUERIES.filter((q) => ["Hetzner", "Deployment und Domain", "Serverzugang und Passwort",
    "Passwörter sicher verwalten", "Warum Rust statt Go?", "Welcher Server ist gemeint?"].includes(q.query));
  console.log(`Stufe: ${stufe}  Anfragen: ${anfragen.length}  (die Gleichstands-Anfragen aus P118)`);
  const store = await korpusAufbauen({ vektoren: true });
  for (const q of anfragen) {
    const erwartet = new Set(q.relevant);
    console.log(`\nAnfrage ${JSON.stringify(q.query)} [${q.kategorie}] erwartet ${[...erwartet].sort().join(", ")}`);
    for (const [name, tracks] of BEINE) {
      const res = await searchMemories(store, { query: q.query, limit: 10, tracks });
      const ids = res.hits.map((h) => h.memory.id);
      const top = ids[0] ?? "(leer)";
      console.log(`  ${name.padEnd(18)} erste Stelle ${top.padEnd(5)} ` +
        `traegt=${erwartet.has(top) ? "JA" : "nein"}  Fenster ${JSON.stringify(ids.slice(0, 5))}`);
    }
  }
  store.close();
  const fs = await import("node:fs");
  const path = await import("node:path");
  fs.rmSync(path.dirname(store.dbPath), { recursive: true, force: true });
}

void main();
