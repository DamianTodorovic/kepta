import { describe, it, expect } from "vitest";
import { entitaetsNetz, type RoheRelation } from "../../src/lib/graphLayout";

// Regel der Begriffsaufnahme, gepinnt, weil ein Satz ueber sie in die Flaeche gehoert und kein
// Verdacht. Befund #113 (27.10.): die Zahlenreihe der Legende sagt "0 concepts", die Tuer liefert
// Begriffe und Kanten. Meine erste Erklaerung — "ein Begriff braucht zwei Traeger" — war beim
// Bauen dieser Fälle widerlegt: die Zwei-Traeger-Kante gilt nur fuer die ERSTE Aufnahme, danach
// nimmt jede Behauptung ihre Enden wieder auf, sofern sie kein Titel-Echo sind
// (graphLayout.ts:2181 gegen 2189-2196). Wer das nicht weiss, schreibt einen Grund in die
// Oberflaeche, der nicht gilt.
//
// Die vier Fälle sind die vier Ecken dieser Regel. Keiner ist erfunden: jeder ist dieselbe
// Funktion, derselbe Aufruf, eine andere Kante oder ein anderer Titel.

const N1 = "m1";
const N2 = "m2";
const N3 = "m3";
const sichtbar = new Set([N1, N2, N3]);

const behauptung = (quelle: string, ziel: string, memoryId: string | null): RoheRelation => ({
  source: quelle, target: ziel, relation: "mentions", memoryId,
});

const titel = new Map<string, string>([[N1, "Werkzeug eins"], [N2, "Werkzeug zwei"], [N3, "Brief drei"]]);
const titelVon = (id: string) => titel.get(id);

const namen = (netz: ReturnType<typeof entitaetsNetz>) => netz.knoten.map((k) => k.label).sort();

describe("Begriffsaufnahme im Netz: was gezeichnet wird und was nicht", () => {
  it("laesst einen Einzeltraeger-Begriff ohne Behauptung weg — das ist die Zwei-Traeger-Kante", () => {
    const netz = entitaetsNetz({ "Nordwind GmbH": [N1] }, [], sichtbar, 2, titelVon);
    expect(namen(netz)).toEqual([]);
  });

  it("nimmt denselben Einzeltraeger-Begriff wieder auf, sobald eine Behauptung auf ihn zeigt", () => {
    // Die Ecke, die meine erste Erklaerung bricht: ein Begriff mit einem Traeger wird gezeichnet,
    // wenn eine Kante an ihm haengt und die beurkundende Notiz im Bild steht.
    const netz = entitaetsNetz(
      { "Nordwind GmbH": [N1] },
      [behauptung("Nordwind GmbH", "Werkzeug eins", N1)],
      sichtbar, 2, titelVon
    );
    expect(namen(netz)).toContain("Nordwind GmbH");
  });

  it("verwirft das Titel-Echo auch dann, wenn eine Behauptung an ihm haengt", () => {
    // "Werkzeug eins" ist der Titel von m1 und wird nur von m1 getragen: das sagt, wie eine
    // Ueberschrift lautet, nicht was die Wissensbasis weiss (G-1).
    const netz = entitaetsNetz(
      { "Werkzeug eins": [N1] },
      [behauptung("Werkzeug eins", "Nordwind GmbH", N1)],
      sichtbar, 2, titelVon
    );
    expect(namen(netz)).not.toContain("Werkzeug eins");
    expect(netz.vomEchoVerschluckt, "der Verlust muss gezaehlt sein, nicht still").toBeGreaterThan(0);
  });

  it("zeichnet einen Begriff, den zwei Notizen tragen, ohne jede Behauptung", () => {
    const netz = entitaetsNetz({ "Nordwind GmbH": [N1, N2] }, [], sichtbar, 2, titelVon);
    expect(namen(netz)).toEqual(["Nordwind GmbH"]);
  });

  it("zeichnet nichts aus einer Kante ohne beurkundende Notiz, wenn ein Ende leer haengt", () => {
    // Die Gegenprobe zur Wiederaufnahme: ohne memoryId darf eine Kante nur zeichnen, was wirklich
    // von einer sichtbaren Notiz getragen wird — sonst haengt ein Begriff mit einer Kante im
    // Leeren (das graue Gitter ohne Knoten).
    const netz = entitaetsNetz(
      { "Geist A": [], "Geist B": [] },
      [behauptung("Geist A", "Geist B", null)],
      sichtbar, 2, titelVon
    );
    expect(namen(netz)).toEqual([]);
  });
});
