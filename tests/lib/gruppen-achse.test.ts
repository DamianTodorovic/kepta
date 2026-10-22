// @vitest-environment jsdom
//
// Punkt 5, Schlag 22.10. abends — die drei Baender sprechen Menschensprache (Modell-Haelfte).
//
// Die Flaeche pruefen die zwei Geschwister-Dateien:
// `tests/components/GraphRegal.achse.test.tsx` und `tests/components/KnowledgeGraph.achse.test.tsx`.
//
// Was der Auftrag sagt: die Baender des Regals und die Achsen des Gangs muessen dieselbe
// Sprache nennen (woran gearbeitet · von wem · wann), und die Zahl, die das Regal nennt, ist
// die Zahl des Gangs. Was er nicht erlaubt: eine zweite Rechnung. Darum haelt diese Datei:
//   * `arbeit` deckt genau die Zahl, die das Gruppen-Modell schon deckt — kein zweites Zaehlen.
//   * `zeit` traegt nur, was die fertigen Koerbe wissen; ohne Koerbe gibt es keine Zeit-Achse.
//   * eine Gruppe, die nichts trifft, bleibt als Fach stehen und sagt ihre Null.
//
// Vorher rot, gefahren gegen `813db8e` (Fassung 3.2.36): `ACHSEN` und `achseFuerMenschen`
// existieren dort nicht — der erste Lauf fiel an der Aufloesung des Imports, 20:58:12 MESZ.
import { describe, it, expect } from "vitest";
import { baueRegal } from "../../src/lib/graphHierarchy";
import { achseFuerMenschen, zaehleGruppen, ACHSEN } from "../../src/lib/gruppen";
import type { Memory } from "../../src/types";

function notiz(id: string, tags: string[], text: string): Memory {
  return {
    id, userId: "local", title: id, content: text, tags,
    createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000,
  } as Memory;
}

/** Ein Bestand, der alle drei Fragen beruehrt: Arbeit an einem Projekt, Personen, Zeit. */
function bestand(): Memory[] {
  return [
    notiz("a", ["werkstatt"], "Plan fuer die Werkstatt — Projekt und Frist"),
    notiz("b", ["werkstatt"], "Werkstatt: was fehlt — Projekt"),
    notiz("c", ["anna", "werkstatt"], "Gespraech mit Anna ueber die Werkstatt"),
    notiz("d", ["bert"], "Bert hat angerufen"),
    notiz("e", [], "Ein Gedanke ohne Marke"),
  ];
}

const einstellung = { marken: ["werkstatt"], farben: {} };


describe("achse: drei Baender, drei Mensch-Fragen, eine Zahl", () => {
  it("das Modell kennt genau drei Achsen, je mit Frage und Klick-Wort", () => {
    expect(ACHSEN.map((a) => a.id)).toEqual(["arbeit", "menschen", "zeit"]);
    for (const a of ACHSEN) {
      expect(a.frage.trim().length, "eine Achse ohne Frage").toBeGreaterThan(0);
      expect(a.klick.toLowerCase(), `Achse ${a.id} nennt keine Handlung`).toMatch(/open/);
    }
  });

  it("die Zahl je Band kommt aus dem einen Aufruf — Regal und Gang teilen sie", () => {
    const gruppen = zaehleGruppen(bestand(), einstellung);
    const regal = baueRegal(bestand());
    const achsen = achseFuerMenschen(bestand(), gruppen, regal.wann);
    expect(achsen.baender).toHaveLength(3);
    const arbeit = achsen.baender.find((b) => b.id === "arbeit");
    // Dieselbe Zahl, die das Gruppen-Modell deckt — nicht eine zweite Zaehlung.
    expect(arbeit?.notizen).toBe(gruppen.bestand - gruppen.ohneGruppe);
    const zeit = achsen.baender.find((b) => b.id === "zeit");
    // Die Zeit-Achse rechnet nicht: sie traegt, was die Koerbe schon wissen.
    expect(zeit?.notizen).toBe(regal.wann.reduce((n, k) => n + k.notizen, 0));
    expect(achsen.bestand).toBe(5);
  });

  it("ein Band ohne Treffer fuehrt sich selbst und nennt seine Null", () => {
    const gruppen = zaehleGruppen(bestand(), { marken: ["nichts-von-allem"], farben: {} });
    const achsen = achseFuerMenschen(bestand(), gruppen, baueRegal(bestand()).wann);
    const arbeit = achsen.baender.find((b) => b.id === "arbeit");
    expect(arbeit?.facher).toHaveLength(1);
    expect(arbeit?.facher[0].name).toBe("nichts-von-allem");
    expect(arbeit?.facher[0].notizen).toBe(0);
    expect(arbeit?.notizen).toBe(0);
  });

  it("die Zeit-Achse bleibt bei den Koerben und zaehlt nicht noch einmal", () => {
    const gruppen = zaehleGruppen(bestand(), einstellung);
    const regal = baueRegal(bestand());
    const achsen = achseFuerMenschen(bestand(), gruppen, regal.wann);
    const zeit = achsen.baender.find((b) => b.id === "zeit");
    const koerbSumme = regal.wann.reduce((n, k) => n + k.notizen, 0);
    expect(zeit?.notizen, "die Zeit-Achse weicht von den Koerben ab").toBe(koerbSumme);
    expect(zeit?.facher.map((f) => f.name)).toEqual(regal.wann.map((k) => k.name));
  });
});
