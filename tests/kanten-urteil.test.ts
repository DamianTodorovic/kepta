// Die Latte an der gemeldeten Bildkante, an ihrer eignen Zahl gehalten.
//
// Anlass, gemessen 5.11. 13:58:33 und 14:01:26 MEZ am ausgelieferten 3.2.158 bei 390 x 844:
// der Fenster-Pruefer fiel rot auf "jede gemeldete Kante traegt wirklich Tinte" mit
// `["links"]`, obwohl die Flaeche im selben Lauf "33 of 34 unfolded notes are in this picture"
// schrieb und die Kantenmarke malte. Die geforderte nullte Pixelreihe kann nie Tinte tragen:
// die Marke sitzt eine CSS-Reihe innerhalb (KnowledgeGraph.tsx:4865-4868), bei doppeltem Zoom
// in Geraete-Pixeln Spalte 2 bis 7. Gezaehlt: Spalte 0 und 1 = 0 Tinte, Spalte 2 bis 7 =
// 99,7 % der Laenge. Die Latte mass an einem Koerper, den das Produkt nicht malt.
//
// Diese vier Faelle halten stattdessen Wort gegen Zahl -- und zwar in beide Richtungen, denn
// eine Latte, die nur eine Richtung prueft, ist ein Wunsch. Der Biss sitzt in Fall zwei und
// drei: erfundene Kante und verschwiegenen Rand laesst sie nicht durch.
import { describe, it, expect } from "vitest";
import { kantenUrteil } from "../scripts/helfer/kanten-urteil.mjs";

describe("Kanten-Urteil: die gemeldete Kante muss ihre Zahl haben", () => {
  it("gemeldete Kante mit Zahlen ausserhalb ist recht (der gemessene 390-px-Fall)", () => {
    const u = kantenUrteil({ gemeldete: ["links"], im: 33, von: 34 });
    expect(u.fehl).toEqual([]);
    expect(u.aussen).toBe(1);
    expect(u.begruendung).toContain("ausserhalb 1");
  });

  it("Biss: eine gemeldete Kante ohne eine einzige Zahl ausserhalb ist erfunden", () => {
    const u = kantenUrteil({ gemeldete: ["links"], im: 34, von: 34 });
    expect(u.fehl).toHaveLength(1);
    expect(u.fehl[0]).toContain("links");
    expect(u.fehl[0]).toContain("keine einzige Zahl");
  });

  it("Biss in der andern Richtung: Zahlen ausserhalb ohne gemeldete Kante sind verschwiegen", () => {
    const u = kantenUrteil({ gemeldete: [], im: 30, von: 34 });
    expect(u.fehl).toHaveLength(1);
    expect(u.fehl[0]).toContain("4 von 34");
  });

  it("Schweigen der Bilanz ist ein benannter Zweig, keine fehlende Lesung", () => {
    // `rahmenZeilentext` liefert den leeren Satz, wenn der Rahmen alles haelt; der Pruefer
    // meldet dann im = null, von = null. Das heisst null ausserhalb, nicht "kein Wert".
    expect(kantenUrteil({ gemeldete: [], im: null, von: null }).fehl).toEqual([]);
    expect(kantenUrteil({ gemeldete: ["oben"], im: null, von: null }).fehl).toHaveLength(1);
  });

  it("eine Seite, die das Haus nicht kennt, faellt ebenfalls", () => {
    const u = kantenUrteil({ gemeldete: ["sseite"], im: 33, von: 34 });
    expect(u.fehl).toHaveLength(1);
    expect(u.fehl[0]).toContain("die das Haus nicht kennt");
  });
});
