// @vitest-environment node
// Die reine Regel hinter der Deckung: was in einer Notiz steht, ist ihr Begriff.
//
// Die Fälle sind an der Zählung des echten Bestands aufgestellt (Export
// 14.702 Notizen): 4.835 taugliche Ueberschriften, 41 Code-/CSS-Zeilen, 228 zu
// kurz oder zu lang, 372 Wiki-Links.
import { describe, it, expect } from "vitest";
import { begriffeAusText } from "../../src/core/begiffe";

describe("begriffeAusText", () => {
  it("liest Ueberschriften jeder Stufe, in Kleinschreibung", () => {
    expect(begriffeAusText("# Fristen\n## Backup Schedule\n###### Q4 Close")).toEqual(["fristen", "backup schedule", "q4 close"]);
  });

  it("liest einen Wiki-Link mitten im Satz", () => {
    expect(begriffeAusText("Siehe [[Client Portal]] fuer die Zahlen.")).toEqual(["client portal"]);
  });

  it("trennt den Anzeigeteil eines Wiki-Links ab", () => {
    expect(begriffeAusText("[[ Mara Lind | Mara ]]")).toEqual(["mara lind"]);
  });

  it("Ueberschrift und Wiki-Link auf denselben Begriff ergeben ihn einmal", () => {
    expect(begriffeAusText("## Fristen\n\nVgl. [[Fristen]].")).toEqual(["fristen"]);
  });

  it("Codezaun wird nicht gelesen, auch nicht, wenn er nachtraeglich CSS zeigt", () => {
    expect(begriffeAusText("```md\n## Falsche Ueberschrift\n```\n\n## Echte Ueberschrift")).toEqual(["echte ueberschrift"]);
  });

  it("eine CSS- oder Codezeile ausserhalb eines Zauns ist kein Begriff", () => {
    // Mit Leerzeichen nach der Raute: nur so läuft sie durch die Ueberschrift-Regel
    // und muss an den Codezeichen scheitern, nicht an der Form.
    expect(begriffeAusText("## header { color: red }")).toEqual([]);
    expect(begriffeAusText("## nav; main; aside")).toEqual([]);
  });

  it("ohne Buchstaben, kuerzer als vier oder laenger als achtzig: kein Begriff", () => {
    expect(begriffeAusText("# 2026\n## abc\n## " + "x".repeat(81))).toEqual([]);
  });

  it("ein Abschnittslabel ist kein Begriff, sondern die Form des Papiers", () => {
    // Gemessen am echten Bestand: `## Fixed` stand in 76, `## Tests` in 71,
    // `## Added` in 65 Notizen. Ein Knoten, an dem 76 Changelogs haengen, ist
    // keine Aussage der Notiz ueber die Welt, und die Flaeche haette einen
    // Nabel, den niemand gesetzt hat.
    expect(begriffeAusText("## Fixed\n\nEin Fehler lief aus.")).toEqual([]);
    expect(begriffeAusText("## Added")).toEqual([]);
    expect(begriffeAusText("## Tests")).toEqual([]);
    expect(begriffeAusText("## Wiki Links")).toEqual([]);
  });

  it("dasselbe Wort als Aussage in einem groesseren Kopf bleibt ein Begriff", () => {
    expect(begriffeAusText("## Fixed in 3.2.1")).toEqual(["fixed in 3.2.1"]);
    expect(begriffeAusText("## Tests der Flaeche")).toEqual(["tests der flaeche"]);
  });

  it("ein Satz als Ueberschrift ist kein Begriff", () => {
    // 58 Zeichen, drei Aufzaehlungen — die Ueberschrift eines Anwerbe- Absatzes.
    expect(begriffeAusText("## Finds Claude Desktop, Cursor, VS Code, Gemini CLI and more")).toEqual([]);
    expect(begriffeAusText("## Fristen der Mandanten")).toEqual(["fristen der mandanten"]);
  });



  it("leerer Text liefert nichts, kein Fehler", () => {
    expect(begriffeAusText("")).toEqual([]);
    expect(begriffeAusText("normale prose ohne zeichensetzung")).toEqual([]);
  });

  it("faehrt Whitespace zusammen — eine Ueberschrift in zwei Zeilen ist ein Begriff", () => {
    expect(begriffeAusText("## Quartals   nahe   Zahlen")).toEqual(["quartals nahe zahlen"]);
  });
});
