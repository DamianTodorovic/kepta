import { describe, it, expect } from "vitest";
import { eigeneProzente, pruefePapier, rekorde, ausgelieferteVersion } from "../scripts/benchmark-belege.mjs";

// Die alte Wache fragte: „steht 61,5 % im Text?" — und zwang damit eine Zahl zurück
// ins Papier, die gegen 2.13.x gelaufen war, waehrend 3.2.0 ausgeliefert war. Diese
// Faelle halten die neue Richtung fest: erst der Record mit der ausgelieferten
// Version macht die Zahl zur Tatsache, und ein Rückzug muss als Rückzug dastehen.

const ALTE_SERIE = [
  { datei: "tools/longmemeval/ergebnisse/a.json", version: "2.13.22", prozente: [61.5, 29.8], fragen: 500 },
  { datei: "tools/longmemeval/ergebnisse/b.json", version: "2.13.2", prozente: [29.2, 21.6], fragen: 500 },
];
const FRISCH = [{ datei: "tools/longmemeval/ergebnisse/c.json", version: "3.2.0", prozente: [72.4, 31.1], fragen: 500 }];
const RÜCKZUG = "It is not a current measurement — no score is quoted here; the shipped engine is 3.2.0.";

describe("Benchmark-Zahlen haegen an Records vom ausgelieferten Stand", () => {
  it("findet nur unsere Zahlen, nicht die der Vergleichshersteller", () => {
    const text = [
      "Unser Bestwert liegt bei 61,5 % auf 500 Fragen.",
      "Zeps veroeffentlichte 63,8 % sind Antwortgenauigkeit einer anderen Pipeline.",
      "Fixierter Datensatz (500 Fragen, SHA-gepinnt) — kein Prozent.",
    ].join("\n");
    const funde = eigeneProzente(text);
    expect(funde.length).toBe(1);
    expect(funde[0].prozent).toBe(61.5);
    expect(funde[0].zeile).toBe(1);
  });

  it("laesst die 61,5 % des 2.13.22-Laufs NICHT durch, obwohl die Zahl da ist", () => {
    const fehler = pruefePapier({
      text: "Der Bestwert der Serie liegt bei 61,5 % auf 500 Fragen.",
      datei: "README.md",
      rekorde: ALTE_SERIE,
      version: "3.2.0",
    });
    expect(fehler.length).toBe(1);
    expect(fehler[0]).toMatch(/getragen nur von Records mit kepta_version 2\.13\.22, ausgeliefert ist 3\.2\.0/);
  });

  it("laesst einen Wert vom ausgelieferten Stand durch", () => {
    expect(pruefePapier({ text: "Die Genauigkeit des aktuellen Laufs: 72,4 % auf 500 Fragen.", datei: "README.md", rekorde: FRISCH, version: "3.2.0" })).toEqual([]);
  });

  it("erlaubt den alten Wert, wenn der Satz seine Lauf-Version nennt UND der Rückzug erklaert ist", () => {
    const text = [
      "Im 2.13.22-Lauf entschieden 29,8 % der Fragen einen Woertlich-Treffer.",
      RÜCKZUG,
    ].join("\n");
    expect(pruefePapier({ text, datei: "README.de.md", rekorde: ALTE_SERIE, version: "3.2.0" })).toEqual([]);
  });

  it("eine Zielgroesse ist keine Messbehauptung", () => {
    expect(eigeneProzente("Ziel: **LongMemEval >= 70 %**, unabhängig reproduzierbar.")).toEqual([]);
  });

  it("unterscheidet vergessene Zahl von erklaertem Rückzug", () => {
    const ohneAlles = "Der LongMemEval-Rohdatensatz liegt im Ordner tools/longmemeval/ergebnisse/.\n";
    const fehler = pruefePapier({ text: ohneAlles, datei: "README.md", rekorde: ALTE_SERIE, version: "3.2.0" });
    expect(fehler.length).toBe(1);
    expect(fehler[0]).toMatch(/erklaert den Rückzug aber nicht/);

    const mitRueckzug = `Die Serie ist kein aktueller Messwert — kein Qualitaetswert wird hier genannt; ausgeliefert ist 3.2.0.\n`;
    expect(pruefePapier({ text: mitRueckzug, datei: "README.md", rekorde: ALTE_SERIE, version: "3.2.0" })).toEqual([]);
  });

  it("verlangt die ausgelieferte Version im Erklaersatz, nicht nur ein Bekenntnis", () => {
    const text = "Kein Qualitaetswert wird hier genannt, der Nachlauf steht aus.\n";
    const fehler = pruefePapier({ text, datei: "README.md", rekorde: ALTE_SERIE, version: "3.2.0" });
    expect(fehler[0]).toMatch(/[Ee]rklärabsatz nennt die ausgelieferte Version 3\.2\.0/);
  });

  it("weist eine Zahl ab, die in keinem Record steht", () => {
    const fehler = pruefePapier({ text: "Unsere Genauigkeit liegt bei 88,0 %.", datei: "README.md", rekorde: ALTE_SERIE, version: "3.2.0" });
    expect(fehler[0]).toMatch(/kein Record .*trägt diesen Wert/);
  });

  it("liest die Records im Kern und die ausgelieferte Version aus package.json", () => {
    const version = ausgelieferteVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    const alle = rekorde();
    expect(alle.length, "keine LongMemEval-Records — die Wache liefe ins Leere").toBeGreaterThan(0);
    expect(alle.every((r) => /^\d/.test(r.version))).toBe(true);
    expect(alle.every((r) => r.prozente.length > 0), `kein Prozentwert in ${alle[0].datei}`).toBe(true);
    // Ob ein Record vom ausgelieferten Stand existiert, ist Zustand, nicht Regel —
    // deshalb steht hier keine Erwartung daran. Die Regelfaelle oben fahren mit
    ///fixtures, damit die Wache nicht gruen wird, nur weil gerade kein frischer Lauf
    // im Haus liegt.

  });
});
