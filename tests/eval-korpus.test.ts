// P149 — README.md:456 sagt ueber die Messstelle: "58 notes, 45 queries, five categories".
// Die drei Zahlen standen 02:36:46 MEZ gemessen richtig im Blatt — und waren trotzdem ungehalten:
// kein Fall sah den Korpus, also konnte jede spaetere Anderoerung an `scripts/eval-corpus.ts` die
// README-Zahl still luegen machen. Genau die Klasse, die dieses Haus seit P122 zaehlt: ein Satz
// mit Zahlen ohne Zeugen.
//
// Neu ist hier nicht die Zahl, sondern was sie haelt: die Verteilung ueber die fuenf Kategorien.
// "five categories" ist naemlich die duennste Stelle des Korpus — drei von 45 Anfragen pruefen
// den Graphen, drei pruefen Gueltigkeit. Wer das nicht sieht, haelt eine Messstelle fuer breiter,
// als sie ist.
import { describe, expect, it } from "vitest";
import { CORPUS, QUERIES } from "../scripts/eval-corpus";

describe("der Eval-Korpus: was README.md:456 ueber ihn sagt", () => {
  it("58 Notizen mit eindeutigen ids, 45 Anfragen, und keine zeigt ins Leere", () => {
    expect(CORPUS.length, "die Zahl der Notizen hat sich bewegt — die README nennt sie").toBe(58);
    expect(QUERIES.length, "die Zahl der Anfragen hat sich bewegt — die README nennt sie").toBe(45);
    const ids = new Set(CORPUS.map((m) => m.id));
    expect(ids.size, `doppelte Notiz-ids: ${CORPUS.length - ids.size}`).toBe(CORPUS.length);
    const zeiger = QUERIES.flatMap((q) => q.relevant);
    const fehlend = zeiger.filter((r) => !ids.has(r));
    expect(fehlend, `Anfragen zeigen auf Notizen, die es nicht gibt: ${fehlend.join(", ")}`).toEqual([]);
    // gemessen 02:37:05 MEZ: 56 relevante Zeiger ueber 45 Anfragen — es gibt keine Anfrage ohne Ziel
    expect(zeiger.length, "die Zahl der relevanten Zeiger traegt die Behauptung 'jede Anfrage hat ein Ziel'").toBe(56);
  });

  it("fuenf Kategorien, und ihre Verteilung ist gemeldet", () => {
    const zahl = new Map<string, number>();
    for (const q of QUERIES) zahl.set(q.kategorie, (zahl.get(q.kategorie) ?? 0) + 1);
    // Gemessen 02:36:46 MEZ, in dieser Reihenfolge nach Groesse.
    expect([...zahl.entries()].sort((a, b) => b[1] - a[1])).toEqual([
      ["lexikalisch", 25],
      ["umschreibung", 10],
      ["ablenkung", 4],
      ["graph", 3],
      ["temporal", 3],
    ]);
    // Die Summe der Verteilung muss die Zahl der Anfragen sein — sonst ist eine Kategorie
    // umgetauft, ohne dass die Grundgesamtheit mitzog.
    const summe = [...zahl.values()].reduce((a, b) => a + b, 0);
    expect(summe, "die Verteilung aufaddiert sich nicht zur Zahl der Anfragen").toBe(QUERIES.length);
  });

  it("keine der fuenf Kategorien ist duenner besetzt als drei Anfragen", () => {
    // Die duennste Stelle des Korpus ist seine Behauptung wert: graph und temporal tragen
    // je drei Anfragen. Waechst der Korpus, darf eine Kategorie nicht auf null fallen, ohne
    // dass jemand die README-Zahl "five categories" neu meint.
    const zahl = new Map<string, number>();
    for (const q of QUERIES) zahl.set(q.kategorie, (zahl.get(q.kategorie) ?? 0) + 1);
    for (const [kategorie, anzahl] of [...zahl.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      expect(anzahl, `Kategorie ${kategorie} traegt nur ${anzahl} Anfragen — "five categories" waere duenner, als der Satz sagt`).toBeGreaterThanOrEqual(3);
    }
    expect([...zahl.keys()].sort(), "die Kategorie-Namen haben sich bewegt").toEqual([
      "ablenkung",
      "graph",
      "lexikalisch",
      "temporal",
      "umschreibung",
    ]);
  });
});
