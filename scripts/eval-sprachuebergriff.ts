// Sprachuebergriff — findet die Suche, was in einer andern Sprache notiert ist?
//
// Warum es diese Messung braucht (Selbstblick am 2.11., Lauf und Ablieferung am 3.11.): zwei
// Saetze der Flaeche behaupteten es — in `Settings.tsx` "Semantic similarity across
// languages" und in `SystemStatus.tsx` "with vectors it is stronger across languages too".
// Beide standen ohne jeden Lauf da; seit dem 3.11. sind die Woerter auf eine Zahl
// zurueckgesetzt (`tests/components/flaeche-sprach-behauptung.test.ts` haelt das). Ein Satz,
// den kein Messlauf stuetzt, ist kein Merkmal, sondern ein Wunsch.
//
// Der Aufbau: dieselben Ziel-IDs wie im Fixkorpus, jede Anfrage einmal deutsch (das
// Original) und einmal englisch (die Uebertragung). Die Ziele sind geerbt, nicht
// erfunden — das Skript bricht, wenn eine deutsche Anfrage nicht im Korpus steht oder
// dort ein anderes Ziel nennt. Der Vergleich ist damit streng: gleiche Notiz, gleiche
// Kappe, nur die Sprache der Frage verschoben.
//
// Gemaessen wird eine Richtung: englische Frage gegen deutsche Notizen — die Richtung,
// in der jemand mit einem deutschen Bestand in einer englischen Oberflaeche tippt. Die
// Gegenrichtung ist nicht gemessen und wird nirgends behauptet.
//
// Aufruf: npx tsx scripts/eval-sprachuebergriff.ts
// Ohne laufendes Ollama fallen die zwei Vektor-Zeilen weg und der Grund steht da.
import path from "node:path";
import fs from "node:fs";
import type { KeptaStore } from "../src/core/store";
import { searchMemories } from "../src/core/engine";
import { embedQuery, ollamaBaseUrl, DEFAULT_EMBED_MODEL } from "../src/core/embeddings";
import { korpusAufbauen, v1Suche } from "./eval-store";
import { QUERIES, CORPUS, EVAL_NOW, type EvalQuery } from "./eval-corpus";

/** Englisch uebertragene Anfragen; `deutsch` ist der Schluessel zum geerbten Ziel. */
export const PAARE: { deutsch: string; englisch: string }[] = [
  // lexikalisch — die Frage traegt die Woerter der Notiz (in jeder Sprache eigne)
  { deutsch: "Welche Datenbank nutzen wir?", englisch: "Which database do we use?" },
  { deutsch: "Wo wohnt Alex gerade?", englisch: "Where does Alex live right now?" },
  { deutsch: "Umsatzsteuer Frist", englisch: "VAT return deadline" },
  { deutsch: "Autoversicherung kündigen", englisch: "Cancel the car insurance" },
  { deutsch: "Kaution Vermieter", englisch: "Deposit and the landlord" },
  { deutsch: "Impfungen Auffrischung", englisch: "Vaccination booster" },
  // umschreibung — anders gefragt als notiert
  { deutsch: "Was koche ich mit Nudeln?", englisch: "What can I cook with pasta?" },
  { deutsch: "Wie bewahre ich meine Zugangsdaten sicher auf?", englisch: "How do I keep my login details safe?" },
  { deutsch: "Was tue ich fuer meinen Ruecken?", englisch: "What should I do for my back?" },
  { deutsch: "Wie lege ich Geld an?", englisch: "How should I invest money?" },
  { deutsch: "Wer hilft bei einem medizinischen Notfall?", englisch: "Who can help in a medical emergency?" },
  { deutsch: "Was muss ich beim Auszug renovieren?", englisch: "What do I have to renovate when I move out?" },
  // temporal — veraltet gegen aktuell
  { deutsch: "Wie bin ich erreichbar?", englisch: "How can I be reached?" },
  { deutsch: "Welche Laufschuhe habe ich?", englisch: "Which running shoes do I have?" },
  { deutsch: "Bis wann muss die Umsatzsteuer abgegeben werden?", englisch: "By when must the VAT return be filed?" },
];

interface Zeile {
  deutsch: string;
  englisch: string;
  kategorie: EvalQuery["kategorie"];
  relevant: string[];
}

/**
 * Ziele erben, nicht erfinden: eine Zeile, deren deutsche Anfrage nicht im Korpus steht
 * oder dort ein anderes Ziel nennt, ist ein Messfehler. Also bricht der Lauf, statt eine
 * Zahl zu melden, die mit dem Korpus nichts zu tun hat.
 */
export function paarePruefen(): Zeile[] {
  const zeilen: Zeile[] = [];
  const fehlend: string[] = [];
  for (const p of PAARE) {
    const q = QUERIES.find((x) => x.query === p.deutsch);
    if (!q) {
      fehlend.push(`keine Korpus-Anfrage "${p.deutsch}"`);
      continue;
    }
    zeilen.push({ deutsch: q.query, englisch: p.englisch, kategorie: q.kategorie, relevant: [...q.relevant] });
  }
  if (fehlend.length) throw new Error(`ein Paar erbt kein Ziel aus dem Korpus: ${fehlend.join("; ")}`);
  return zeilen;
}

/** Fuer eine Zeile die Rangfolge in beiden Sprachen, in IDs. */
interface Rang {
  zeile: Zeile;
  de: string[];
  en: string[];
}

function kappe(rangs: Rang[], seite: "de" | "en"): { hit1: number; r5: number } {
  let hit1 = 0;
  let r5 = 0;
  for (const r of rangs) {
    const top = r[seite].slice(0, 5);
    const rel = new Set(r.zeile.relevant);
    if (top.length > 0 && rel.has(top[0]!)) hit1++;
    r5 += top.filter((id) => rel.has(id)).length / Math.min(5, Math.max(1, r.zeile.relevant.length));
  }
  return { hit1: hit1 / rangs.length, r5: r5 / rangs.length };
}

/** Hit@1 auf den ersten fuenf — dieselbe Kappe wie in `kappe`, nur als Ja/Nein. */
function traf(r: Rang, seite: "de" | "en"): boolean {
  const top = r[seite].slice(0, 5);
  return top.length > 0 && new Set(r.zeile.relevant).has(top[0]!);
}

function zeigePaar(name: string, rangs: Rang[]): void {
  const de = kappe(rangs, "de");
  const en = kappe(rangs, "en");
  console.log(`\n  ${name}`);
  console.log(`     deutsch  Hit@1 ${(de.hit1 * 100).toFixed(1).padStart(5)} %   R@5 gekappt ${(de.r5 * 100).toFixed(1).padStart(5)} %`);
  console.log(`     englisch Hit@1 ${(en.hit1 * 100).toFixed(1).padStart(5)} %   R@5 gekappt ${(en.r5 * 100).toFixed(1).padStart(5)} %`);
  console.log(`     Sprachpreis Hit@1: ${((en.hit1 - de.hit1) * 100).toFixed(1)} Pp auf ${rangs.length} Paaren`);
  const verloren = rangs.filter((r) => traf(r, "de") && !traf(r, "en")).map((r) => r.zeile.englisch);
  const gewonnen = rangs.filter((r) => !traf(r, "de") && traf(r, "en")).map((r) => r.zeile.englisch);
  if (verloren.length) console.log(`     englisch verliert: ${verloren.join(" | ")}`);
  if (gewonnen.length) console.log(`     englisch findet mehr: ${gewonnen.join(" | ")}`);
}

async function main() {
  const zeilen = paarePruefen();
  const nachKategorie = zeilen.reduce<Record<string, number>>((a, z) => ((a[z.kategorie] = (a[z.kategorie] ?? 0) + 1), a), {});
  console.log(`\nSprachuebergriff — ${CORPUS.length} Notizen, ${PAARE.length} Anfrage-Paare, Zeitanker ${new Date(EVAL_NOW).toISOString()}`);
  console.log(`Kategorien: ${Object.entries(nachKategorie).map(([k, n]) => `${k} ${n}`).join(", ")}`);
  console.log("Ziele geerbt aus scripts/eval-corpus.ts — nur die Sprache der Frage ist verschoben.");
  console.log("Richtung: englische Anfrage gegen deutsche Notizen. Die Gegenrichtung ist nicht gemessen.");

  // --- Bein 1 und 2: ohne Vektoren ---
  const ohne = await korpusAufbauen({ vektoren: false });
  const rangsNaiv: Rang[] = [];
  const rangsV2: Rang[] = [];
  for (const z of zeilen) {
    rangsNaiv.push({ zeile: z, de: v1Suche(ohne, z.deutsch), en: v1Suche(ohne, z.englisch) });
    rangsV2.push({ zeile: z, de: (await searchMemories(ohne, { query: z.deutsch, limit: 10 })).hits.map((h) => h.memory.id), en: (await searchMemories(ohne, { query: z.englisch, limit: 10 })).hits.map((h) => h.memory.id) });
  }
  schliessen(ohne);
  zeigePaar("v1 naive Substring-Suche", rangsNaiv);
  zeigePaar("v2 Engine ohne Vektoren (BM25 + Entitaeten + temporal)", rangsV2);

  // --- Bein 3: mit Vektoren, aber nur wenn der Embedder wirklich antwortet ---
  const sonde = await embedQuery("sonde");
  if (!sonde) {
    console.log("\n  v3 Engine mit Vektoren — UEBERSPRUNGEN");
    console.log(`     Der Embedder antwortet nicht: ${ollamaBaseUrl()} · Modell ${DEFAULT_EMBED_MODEL}.`);
    console.log("     Ohne dieses Bein gibt es keine Zahl fuer die Sprachbehauptung der Flaeche.");
    return;
  }
  const mit = await korpusAufbauen({ vektoren: true });
  const rangsV3: Rang[] = [];
  const rangsNurVektor: Rang[] = [];
  for (const z of zeilen) {
    const de = (q: string, tracks?: { bm25: boolean; vector: boolean; entity: boolean }) =>
      searchMemories(mit, { query: q, limit: 10, tracks }).then((r) => r.hits.map((h) => h.memory.id));
    rangsV3.push({ zeile: z, de: await de(z.deutsch), en: await de(z.englisch) });
    // Diagnostik: traegt das Vektor-Bein die Sprachgrenze wirklich, oder vergraebt die
    // Fusion sie? Nur diese Zeile trennt die zwei Erklaerungen.
    rangsNurVektor.push({
      zeile: z,
      de: await de(z.deutsch, { bm25: false, vector: true, entity: false }),
      en: await de(z.englisch, { bm25: false, vector: true, entity: false }),
    });
  }
  schliessen(mit);
  zeigePaar("v3 Engine mit Vektoren — ausgeliefertes Retrieval", rangsV3);
  zeigePaar("nur das Vektor-Bein (ohne BM25, ohne Graph)", rangsNurVektor);
  console.log(`\n  Embedder dieses Laufs: ${DEFAULT_EMBED_MODEL} · ${ollamaBaseUrl()}`);
}

function schliessen(store: KeptaStore): void {
  store.close();
  fs.rmSync(path.dirname(store.dbPath), { recursive: true, force: true });
}

if (path.resolve(process.argv[1] ?? "") === import.meta.filename) {
  void main();
}
