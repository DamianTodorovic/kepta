import { describe, it, expect } from "vitest";
import { istHell } from "../../src/components/KnowledgeGraph";
import { knotenRadius, nodeAt, type LayoutNode } from "../../src/lib/graphLayout";

// Die Zeichenfunktion selbst laesst sich in jsdom nicht sinnvoll pruefen (es
// gibt dort keinen Canvas-Kontext). Was sich pruefen laesst, sind die reinen
// Entscheidungen, die davor stehen — und genau die haben in der Benutzung
// Schaden angerichtet.

describe("istHell: der Graph muss wissen, auf welchem Grund er malt", () => {
  // Beim Umstieg von SVG auf Canvas gingen --node-rim/--node-shade/--node-hi
  // verloren und wurden durch feste Weisswerte ersetzt. Im hellen Thema war der
  // Graph danach ein beiger Brei: weisse Glanzlichter auf hellen Kugeln vor
  // hellem Grund, ohne sichtbare Kante.
  it("erkennt helle Hintergruende", () => {
    expect(istHell("#fbf9f4")).toBe(true);
    expect(istHell("#ffffff")).toBe(true);
    expect(istHell("#fff")).toBe(true);
    expect(istHell("rgb(251, 249, 244)")).toBe(true);
  });

  it("erkennt dunkle Hintergruende", () => {
    expect(istHell("#121214")).toBe(false);
    expect(istHell("#000")).toBe(false);
    expect(istHell("rgb(18, 18, 20)")).toBe(false);
    expect(istHell("rgba(15, 15, 17, 0.6)")).toBe(false);
  });

  it("gewichtet nach Helligkeitsempfinden, nicht nach Summe", () => {
    // Reines Gruen wirkt hell, reines Blau nicht — obwohl beide denselben
    // Kanalwert haben.
    expect(istHell("#00ff00")).toBe(true);
    expect(istHell("#0000ff")).toBe(false);
  });

  it("faellt bei Unsinn auf 'dunkel' zurueck, statt zu werfen", () => {
    expect(istHell("")).toBe(false);
    expect(istHell("var(--irgendwas)")).toBe(false);
    expect(istHell("#12")).toBe(false);
  });
});

describe("Knoten lassen sich greifen — auch die kleinsten, auch weit herausgezoomt", () => {
  // Die Greifweite war einmal 4 WELT-Einheiten und schrumpfte damit mit dem
  // Zoom: bei 20 % blieben 0,8 px. Sie betraegt jetzt 12 BILDSCHIRM-Pixel.
  // Dazu das Größengesetz (Spanne 5,6 bis 26 statt 6,2 bis 18) — beides
  // zusammen darf das Greifen nicht kaputt machen.
  const GREIF_PX = 12;
  /** Dasselbe Gesetz, keine Abschrift: ein Knoten mit einer Verbindung. */
  const KLEINSTER_RADIUS = knotenRadius(1);

  function greifbar(radiusWelt: number, k: number, danebenPx: number): boolean {
    const n: LayoutNode = { id: "a", x: 0, y: 0, vx: 0, vy: 0, r: radiusWelt, pinned: false };
    // Der Zeiger sitzt "danebenPx" Bildschirmpixel neben der Mitte.
    return nodeAt([n], (x) => x.r, danebenPx / k, 0, GREIF_PX / k) !== null;
  }

  it.each([0.2, 0.5, 1, 2, 6])("trifft den kleinsten Knoten bei Zoom %s auch 10 px daneben", (k) => {
    expect(greifbar(KLEINSTER_RADIUS, k, 10)).toBe(true);
  });

  it("trifft weit herausgezoomt, wo der Knoten selbst nur ein Punkt ist", () => {
    // Bei 20 % ist ein kleiner Knoten 2,5 px gross — ohne die Zugabe in
    // Bildschirmpixeln waere er praktisch nicht zu treffen.
    expect(KLEINSTER_RADIUS * 0.2).toBeLessThan(2);
    expect(greifbar(KLEINSTER_RADIUS, 0.2, 11)).toBe(true);
  });

  it.each([0.2, 1, 6])("trifft bei Zoom %s nicht, wenn man wirklich daneben ist", (k) => {
    // "Daneben" muss in BILDSCHIRMPIXELN gedacht werden: bei 600 % Zoom sind
    // 40 px nur knapp sieben Welteinheiten und liegen noch im Knoten.
    const randPx = KLEINSTER_RADIUS * k + GREIF_PX;
    expect(greifbar(KLEINSTER_RADIUS, k, randPx * 1.5 + 10)).toBe(false);
    // Und knapp INNERHALB des Randes trifft es weiterhin.
    expect(greifbar(KLEINSTER_RADIUS, k, randPx * 0.8)).toBe(true);
  });

  it("waechst die Trefferflaeche mit dem Knoten mit", () => {
    expect(greifbar(18, 1, 25)).toBe(true);
    expect(greifbar(KLEINSTER_RADIUS, 1, 25)).toBe(false);
  });
});
