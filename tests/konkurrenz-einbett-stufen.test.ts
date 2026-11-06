/* Punkt 8, dritte Stufe: dieselbe Rangfolge, zwei Einbett-Stufen, gleiche Einheit.

   P111 hatte die Frage so bestellt (`P111-EINBETT-0611.md`): "unsre eigne Rangfolge mit
   bge-m3 ist nicht gemessen. Wenn reines KNN mit bge-m3 66,7 % holt und unsre Fusion mit
   nomic 75,6 %, was tut die Fusion mit bge-m3?" **Die Praemie war falsch**: dieselben Zahlen
   standen seit 3.11. im Repo (`docs/belege/tag-0311/eval-bge-m3-1404.log.txt`, 3.2.125), und
   dieser Lauf trifft sie auf die Punktstelle -- er ist eine **Reproduktion auf 3.2.189**, kein
   Neufund (geprüft in `tests/konkurrenz-sprachstufen.test.ts`). Neu ist die zweite Zahl unten:
   die Modell-Abhaengigkeit in derselben Einheit. Gefahren 6.11.2026 17:09:20 bis 17:09:32 MEZ
   mit dem Aufbau, den die App ausliefert (`scripts/eval-store.ts`, Korpus aus
   `scripts/eval-corpus.ts`), zwei Laeufe je Stufe.

   Warum nicht der Schwanz des `npm run eval`-Ausdrucks als Beweis reicht — der Fehler, den
   dieser Lauf zuerst machte: das letzte Block, das `scripts/eval.ts` malt, ist die
   Detail-Tabelle der **zweiten** Stufe (v2, ohne Vektoren). Sie ist modelgleich, also waren
   die letzten 22 Zeilen beider Laeufe bytegleich, und die Gleichheit bewies nichts. Die
   Zahl, um die es geht, steht im v3-Block darueber. Dieser Beleg malt deshalb Zeile fuer
   Zeile, und die Aggregat-Zeile jedes Laufs ist gegen die zwei v3-Zahlen des `npm run
   eval`-Ausdrucks nachgerechnet (Fall "das Aggregat der Spur ist dasselbe wie das der Auslieferung").

   Gemessen, in derselben Einheit — Anfragen von 45, deren Rangfolge sich mit dem Modell aendert:

     unsre Fusion (v3)     Hit@1 75,6 % (nomic)  ->  77,8 % (bge-m3)   netto +1 Anfrage
                           Erst-Treffer wechselt die Richtigkeit:  3 von 45 =  6,7 %
                           anderer erster Treffer ueberhaupt:      7 von 45 = 15,6 %
                           Liste unveraendert:                    16 von 45 = 35,6 %
     reines KNN (sqlite-vec)  42,2 %  ->  66,7 %                   netto +11 Anfragen
                           Erst-Treffer wechselt die Richtigkeit: 15 von 45 = 33,3 %
                           anderer erster Treffer ueberhaupt:     25 von 45 = 55,6 %
                           Liste unveraendert:                     0 von 45 =  0,0 %

   Die Lesung, die dieser Fall festhaelt: die Fusion hat den Vektor-Gewinn eingefahren, ohne
   die Rangfolge an das Modell zu haengen — beim reinen Vektor haengt sie fast ganz daran.
   Und die Gegen-Lesung, die ebenso gemessen ist: bge-m3 ist kein reiner Gewinn. Es verliert
   Recall@5 (91,1 -> 90,0) und eine ablenkende Anfrage. */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { QUERIES } from "../scripts/eval-corpus";

const WURZEL = path.resolve(import.meta.dirname, "..");
const EIGEN = path.join(WURZEL, "docs/belege/konkurrenz-0611c");
const FREMD = path.join(WURZEL, "docs/belege/konkurrenz-0611b");

const UNS_NOMIC = path.join(EIGEN, "spur-uns-nomic-0611.jsonl");
const UNS_NOMIC_ZWEI = path.join(EIGEN, "spur-uns-nomic-0611-zwei.jsonl");
const UNS_BGE = path.join(EIGEN, "spur-uns-bge-m3-0611.jsonl");
const UNS_BGE_ZWEI = path.join(EIGEN, "spur-uns-bge-m3-0611-zwei.jsonl");
const KNN_NOMIC = path.join(FREMD, "spur-sqlitevec-0611.jsonl");
const KNN_BGE = path.join(FREMD, "spur-sqlitevec-bge-m3.jsonl");
const LEDGER = path.join(WURZEL, "docs/konkurrenz.md");

const ANZAHL = QUERIES.length; // 45

type Suche = {
  art: "suche";
  i: number;
  kategorie: string;
  frage: string;
  top: string | null;
  treffer: boolean;
  r5: number;
  mrr: number;
  liste: string[];
};

const suchen = (pfad: string): Suche[] =>
  fs
    .readFileSync(pfad, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { art: string })
    .filter((z) => z.art === "suche") as Suche[];

const kopf = (pfad: string) => {
  const z = JSON.parse(fs.readFileSync(pfad, "utf8").split("\n")[0]!);
  expect(z.art).toBe("kopf");
  return z as { art: string; stufe: string; dimensionen: number; anfragen: number };
};

const summary = (pfad: string) => {
  const ze = fs.readFileSync(pfad, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  return ze[ze.length - 1] as { art: string; stufe: string; anfragen: number; hit1: number; r5: number; mrr: number };
};

const treffer = (z: Suche[]) => z.filter((x) => x.treffer).length;
const mittel = (z: Suche[], f: (x: Suche) => number) => z.reduce((s, x) => s + f(x), 0) / z.length;
const prozent = (n: number) => Math.round((100 * n) / ANZAHL * 10) / 10;

/** Wie viele Anfragen unter der zweiten Stufe einen andern Befund fuer die erste Stelle bekommen. */
const wechsel = (a: Suche[], b: Suche[]) => {
  const um = new Map(b.map((x) => [x.i, x]));
  let falschNachRichtig = 0;
  let richtigNachFalsch = 0;
  let andererTop = 0;
  let gleicheListe = 0;
  for (const x of a) {
    const y = um.get(x.i)!;
    if (x.treffer && !y.treffer) richtigNachFalsch++;
    else if (!x.treffer && y.treffer) falschNachRichtig++;
    if (x.top !== y.top) andererTop++;
    if (x.liste.join(",") === y.liste.join(",")) gleicheListe++;
  }
  return { richtigNachFalsch, falschNachRichtig, wechselte: richtigNachFalsch + falschNachRichtig, andererTop, gleicheListe };
};

describe("Punkt 8 / P112: zwei Einbett-Stufen, dieselbe Einheit", () => {
  it("die vier egnen Spuren existieren und tragen 45 Anfragen", () => {
    for (const p of [UNS_NOMIC, UNS_NOMIC_ZWEI, UNS_BGE, UNS_BGE_ZWEI]) expect(fs.existsSync(p), path.basename(p)).toBe(true);
    expect(suchen(UNS_NOMIC)).toHaveLength(ANZAHL);
    expect(suchen(UNS_BGE)).toHaveLength(ANZAHL);
  });

  it("die Spuren nennen ihr eignes Einbett und dessen Dimension, nicht meines Worts", () => {
    expect(kopf(UNS_NOMIC)).toEqual({ art: "kopf", stufe: "nomic-embed-text", dimensionen: 768, anfragen: ANZAHL });
    expect(kopf(UNS_BGE)).toEqual({ art: "kopf", stufe: "bge-m3", dimensionen: 1024, anfragen: ANZAHL });
  });

  it("die Fragen der Spur sind die Fragen des Auslieferungs-Korpus, in derselben Reihenfolge", () => {
    expect(suchen(UNS_NOMIC).map((x) => x.frage)).toEqual(QUERIES.map((q) => q.query));
    expect(suchen(UNS_BGE).map((x) => x.frage)).toEqual(QUERIES.map((q) => q.query));
  });

  it("Hit@1 der Fusion, aus den Zeilen gerechnet: 34 von 45 mit nomic, 35 von 45 mit bge-m3", () => {
    expect(treffer(suchen(UNS_NOMIC))).toBe(34);
    expect(treffer(suchen(UNS_BGE))).toBe(35);
    expect(prozent(treffer(suchen(UNS_NOMIC)))).toBe(75.6);
    expect(prozent(treffer(suchen(UNS_BGE)))).toBe(77.8);
  });

  it("das Aggregat der Spur ist dasselbe wie das der Auslieferung (npm run eval, v3-Bein)", () => {
    for (const [p, hit, r5] of [
      [UNS_NOMIC, 0.7556, 0.9111] as const,
      [UNS_BGE, 0.7778, 0.9] as const,
    ]) {
      const s = summary(p);
      expect(s.art, path.basename(p)).toBe("summary");
      expect(Math.round(s.hit1 * 1e4) / 1e4, path.basename(p)).toBe(hit);
      expect(Math.round(s.r5 * 1e4) / 1e4, path.basename(p)).toBe(r5);
      expect(s.anfragen).toBe(ANZAHL);
    }
    // Gegenprobe an den Zeilen selbst, damit die Summary-Zeile nicht bloss nachgeschrieben ist.
    expect(Math.round(mittel(suchen(UNS_NOMIC), (x) => x.r5) * 1e4) / 1e4).toBe(0.9111);
    expect(Math.round(mittel(suchen(UNS_BGE), (x) => x.r5) * 1e4) / 1e4).toBe(0.9);
  });

  it("zwei Laeufe je Stufe malen dieselbe Rangfolge, Zeile fuer Zeile", () => {
    for (const [a, b] of [
      [UNS_NOMIC, UNS_NOMIC_ZWEI] as const,
      [UNS_BGE, UNS_BGE_ZWEI] as const,
    ]) expect(suchen(a).map((x) => x.liste.join(","))).toEqual(suchen(b).map((x) => x.liste.join(",")));
  });

  it("die Stufe wechselt bei uns die Richtigkeit in 3 von 45 Anfragen, beim reinen Vektor in 15", () => {
    const uns = wechsel(suchen(UNS_NOMIC), suchen(UNS_BGE));
    const knn = wechsel(suchen(KNN_NOMIC), suchen(KNN_BGE));
    expect(uns.wechselte).toBe(3);
    expect(uns.richtigNachFalsch).toBe(1);
    expect(uns.falschNachRichtig).toBe(2);
    expect(knn.wechselte).toBe(15);
    expect(knn.andererTop).toBe(25);
  });

  it("die Latte: unsre Modell-Abhaengigkeit bleibt unter einem Drittel der reinen Vektor-Suche", () => {
    const uns = wechsel(suchen(UNS_NOMIC), suchen(UNS_BGE));
    const knn = wechsel(suchen(KNN_NOMIC), suchen(KNN_BGE));
    // 3 gegen 15 = ein Fueftel. Ein Viertel waere die naechste Fassung, die schon rot wird,
    // wenn die Haelfte der Wechsel des Mitbewerbers in unsre Rangfolge einziehen wuerde.
    expect(uns.wechselte * 4).toBeLessThan(knn.wechselte);
    expect(uns.andererTop * 3).toBeLessThan(knn.andererTop);
  });

  it("beim reinen Vektor bleibt keine einzige Liste unveraendert, bei uns 16 von 45", () => {
    expect(wechsel(suchen(UNS_NOMIC), suchen(UNS_BGE)).gleicheListe).toBe(16);
    expect(wechsel(suchen(KNN_NOMIC), suchen(KNN_BGE)).gleicheListe).toBe(0);
  });

  it("bge-m3 ist kein reiner Gewinn: die Stufe verliert Recall@5 und eine ablenkende Anfrage", () => {
    expect(trefferProzent(suchen(UNS_NOMIC), "umschreibung")).toBe(30);
    expect(trefferProzent(suchen(UNS_BGE), "umschreibung")).toBe(50);
    expect(trefferProzent(suchen(UNS_NOMIC), "ablenkung")).toBe(50);
    expect(trefferProzent(suchen(UNS_BGE), "ablenkung")).toBe(25);
    expect(mittel(suchen(UNS_NOMIC), (x) => x.r5)).toBeGreaterThan(mittel(suchen(UNS_BGE), (x) => x.r5));
    for (const k of ["graph", "lexikalisch", "temporal"])
      expect(trefferProzent(suchen(UNS_NOMIC), k), k).toBe(trefferProzent(suchen(UNS_BGE), k));
  });

  it("der Ledger nennt beide Stufen mit ihrer Zahl, nicht eine Stufe als die Zahl", () => {
    const text = fs.readFileSync(LEDGER, "utf8");
    const abschnitt = text.split("\n## ").find((t) => t.startsWith("P112")) ?? "";
    expect(abschnitt).toContain("75,6");
    expect(abschnitt).toContain("77,8");
    expect(abschnitt).toContain("3 von 45");
    expect(abschnitt).toContain("15 von 45");
    expect(abschnitt).toContain("0 von 45");
  });

  it("der Biss: eine Spur mit einem Wechsel mehr faellt durch die eigene Zahlung", () => {
    const echt = suchen(UNS_NOMIC);
    const gefaelscht = suchen(UNS_BGE).map((x, i) => (i === 0 ? { ...x, treffer: !x.treffer } : x));
    expect(wechsel(echt, gefaelscht).wechselte).toBe(4);
  });
});

/** Hit@1 einer Anfrageart, auf volle Prozent gerundet, am Nenner dieser Art. */
function trefferProzent(ze: Suche[], kategorie: string): number {
  const teil = ze.filter((x) => x.kategorie === kategorie);
  return Math.round((100 * treffer(teil)) / teil.length);
}
