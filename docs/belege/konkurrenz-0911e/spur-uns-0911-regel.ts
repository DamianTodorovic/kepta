// P180: die eigne Spur im 6.11-Format, auf dem AUSGELIEFERTEN Baum (3.2.193, mit dem
// P176-Boden-Flicken) — das Ledger muss den ausgelieferten Stand tragen, nicht den
// vom 6.11. Der Läufer baut denselben Korpus wie eval.ts (scripts/eval-store.ts,
// Vektoren über Ollama im KEPTA_EMBED_MODEL) und schreibt je Anfrage dieselben
// Feldnamen wie spur-uns-bge-m3-0611.jsonl, damit der Abgleich maschinell ist.
//
// Aufruf: KEPTA_EMBED_MODEL=bge-m3 npx tsx docs/belege/konkurrenz-0911d/spur-uns-0911.ts <stufe> <lauf>
import fs from "node:fs";
import path from "node:path";
import { searchMemories } from "../../../src/core/engine";
import { korpusAufbauen } from "../../../scripts/eval-store";
import { QUERIES } from "../../../scripts/eval-corpus";
import { einbettModell } from "../../../src/core/embeddings";

const BELEG = path.dirname(new URL(import.meta.url, "file://").pathname);
const stufe = process.argv[2] ?? "bge-m3";
const lauf = process.argv[3] === "zwei" ? "zwei" : "eins";
const SPUR = path.join(BELEG, `spur-uns-0911-regel-${stufe}-${lauf}.jsonl`);

const modell = einbettModell();
const dims = Number(process.env.KEPTA_EMBED_DIMS ?? (modell.includes("bge") ? 1024 : 768));
const out = fs.createWriteStream(SPUR);
const schreibe = (z: unknown) => out.write(JSON.stringify(z) + "\n");

schreibe({ art: "kopf", stufe: modell, dimensionen: dims, anfragen: QUERIES.length, baum: "3.2.193 + P182-Stimmen-Regel (Boden-Flicken + gewichtetes Vektor-Bein)" });
console.log(`START Stufe=${modell} Lauf=${lauf} Baum=3.2.193+Flicken`);

const store = await korpusAufbauen({ vektoren: true });

let treffer = 0, r5Summe = 0, mrrSumme = 0;
for (let i = 0; i < QUERIES.length; i++) {
  const q = QUERIES[i]!;
  const res = await searchMemories(store, { query: q.query, limit: 5 });
  const liste = res.hits.map((h) => h.memory.id);
  const top = liste[0] ?? null;
  const hit = top !== null && q.relevant.includes(top);
  const inTop5 = liste.filter((id) => q.relevant.includes(id));
  const r5 = inTop5.length / q.relevant.length;
  const rang = liste.findIndex((id) => q.relevant.includes(id)) + 1;
  const mrr = rang > 0 ? 1 / rang : 0;
  treffer += hit ? 1 : 0;
  r5Summe += r5;
  mrrSumme += mrr;
  schreibe({ art: "suche", i, kategorie: q.kategorie, frage: q.query, erwartet: q.relevant[0], anzahl_erwartet: q.relevant.length, top, treffer: hit, r5, mrr, liste });
}
const n = QUERIES.length;
schreibe({ art: "fazit", stufe: modell, lauf, hit1: treffer, hit1_prozent: Math.round(1000 * treffer / n) / 10, r5_prozent: Math.round(1000 * r5Summe / n) / 10, mrr: Math.round(1000 * mrrSumme / n) / 1000 });
console.log(`FAZIT Stufe=${modell} Lauf=${lauf}: Hit@1 ${treffer}/${n} = ${Math.round(1000 * treffer / n) / 10} % | R@5 ${Math.round(1000 * r5Summe / n) / 10} % | MRR ${Math.round(1000 * mrrSumme / n) / 1000}`);
out.end();
