// Punkt 117, Schnitt 2: aus der Community-Rechnung ein Bild machen, und zwar erst
// die zwei reinen Helfer, die das koennen — Zuordnung mit Toenen, und die Frage, ob
// die Haufen ueberhaupt etwas anderes sagen als die Arten.
//
// Die Latte kommt aus MARKT-GRAPH-2710.md, Entscheidung 2: "ein benannter Haufen muss
// sich von der Art-Gruppe unterscheiden — sonst ist es umlackierte Art, keine Community."
import { describe, expect, it } from "vitest";

import {
  gemeinschaftenBaue,
  haufenBildBaue,
  haufenNamen,
  unterscheidetVonArt,
  type Gemeinschaftskante,
} from "../../src/lib/gemeinschaften";
import { GRUPPEN_PALETTE } from "../../src/lib/gruppen";

const kante = (a: string, b: string): Gemeinschaftskante => ({ a, b });

/** Zwei Klubs zu je vier Knoten, jeder Klub durchmischt zwei Arten. */
function gemischteKlubs() {
  const knoten = ["a1", "a2", "a3", "a4", "b1", "b2", "b3", "b4"];
  const art = new Map<string, string>([
    ["a1", "episode"], ["a2", "semantic"], ["a3", "episode"], ["a4", "semantic"],
    ["b1", "semantic"], ["b2", "episode"], ["b3", "semantic"], ["b4", "episode"],
  ]);
  const kanten: Gemeinschaftskante[] = [];
  for (const gruppe of [["a1", "a2", "a3", "a4"], ["b1", "b2", "b3", "b4"]]) {
    for (let i = 0; i < gruppe.length; i += 1) {
      for (let j = i + 1; j < gruppe.length; j += 1) kanten.push(kante(gruppe[i], gruppe[j]));
    }
  }
  kanten.push(kante("a1", "b1"));
  return { knoten, art, kanten };
}

/** Dieselbe Topologie, aber jeder Klub ist eine einzige Art: Haufen == Art. */
function artgleicheKlubs() {
  const f = gemischteKlubs();
  const art = new Map<string, string>([
    ["a1", "episode"], ["a2", "episode"], ["a3", "episode"], ["a4", "episode"],
    ["b1", "semantic"], ["b2", "semantic"], ["b3", "semantic"], ["b4", "semantic"],
  ]);
  return { knoten: f.knoten, art, kanten: f.kanten };
}

describe("haufenBildBaue — Schluessel und Toene fuer die Community-Ebene", () => {
  it("ordnet jeden Knoten einem Schluessel zu und maelt die Haufen groessenordnung", () => {
    const f = gemischteKlubs();
    const bild = haufenBildBaue(gemeinschaftenBaue(f.knoten, f.kanten));

    expect(bild.zuordnung.size).toBe(8);
    expect(new Set([...bild.zuordnung.values()]).size).toBe(2);
    expect(bild.groessen).toEqual([4, 4]);
    expect(bild.groessterAnteil).toBeCloseTo(0.5, 5);
    for (const schluessel of new Set(bild.zuordnung.values())) {
      expect(bild.farben[schluessel]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("waehlt Toene mit Abstand zueinander, nicht in Reihenfolge der Palette", () => {
    const f = gemischteKlubs();
    const bild = haufenBildBaue(gemeinschaftenBaue(f.knoten, f.kanten));
    const tone = Object.values(bild.farben);

    expect(tone).toHaveLength(2);
    expect(tone[0]).not.toBe(tone[1]);
    expect(GRUPPEN_PALETTE).toContain(tone[0] as (typeof GRUPPEN_PALETTE)[number]);
    expect(GRUPPEN_PALETTE).toContain(tone[1] as (typeof GRUPPEN_PALETTE)[number]);
  });

  it("laesst Haufen ueber der Ton-Zahl neutral, und sagt welche", () => {
    // neun Klubs, keine Kanten dazwischen: neun Haufen, acht Toene — der neunte
    // bleibt neutral, weil ein erfundener Neunton die Latte der Toene braeche.
    const knoten: string[] = [];
    const kanten: Gemeinschaftskante[] = [];
    for (let k = 0; k < 9; k += 1) {
      knoten.push(`k${k}a`, `k${k}b`);
      kanten.push(kante(`k${k}a`, `k${k}b`));
    }
    const bild = haufenBildBaue(gemeinschaftenBaue(knoten, kanten));

    expect(bild.groessen.length).toBeLessThanOrEqual(GRUPPEN_PALETTE.length);
    expect(Object.keys(bild.farben).length).toBe(GRUPPEN_PALETTE.length);
    expect([...bild.zuordnung.values()].filter((s) => s === "neutral").length).toBe(2);
  });

  it("ist wiederholbar: derselbe Bestand, dieselben Toene", () => {
    const f = gemischteKlubs();
    const a = haufenBildBaue(gemeinschaftenBaue(f.knoten, f.kanten));
    const b = haufenBildBaue(gemeinschaftenBaue(f.knoten, f.kanten));

    expect(a.farben).toEqual(b.farben);
    expect([...a.zuordnung.entries()].sort()).toEqual([...b.zuordnung.entries()].sort());
  });
});

describe("haufenNamen — ein Wort je Haufen, ohne erfundenes Oberwort", () => {
  const kraeftig = [
    { id: "a1", label: "Kessel Nord" }, { id: "a2", label: "Plan Nord" },
    { id: "a3", label: "  " }, { id: "a4", label: "Brief Nord" },
    { id: "b1", label: "Kessel Sud" }, { id: "b2", label: "Plan Sud" },
    { id: "b3", label: "Brief Sud" }, { id: "b4", label: "" },
  ];
  const bildVon = () => {
    const f = gemischteKlubs();
    return haufenBildBaue(gemeinschaftenBaue(f.knoten, f.kanten));
  };

  it("nennt jeden Haufen nach dem am besten verbundenen Mitglied mit Namen", () => {
    const bild = bildVon();
    const namen = haufenNamen(bild, kraeftig, (id) => (id === "a4" || id === "b3" ? 9 : 1));

    expect(namen).toEqual(["Brief Nord", "Brief Sud"]);
  });

  it("traegt nichts vor, wenn ein Haufen keinen tragbaren Namen hat", () => {
    const bild = bildVon();
    const namen = haufenNamen(bild, [], () => 3);

    expect(namen).toEqual(["", ""]);
  });

  it("ist wiederholbar und schlaegt bei Gleichstand die fruehere Kennung", () => {
    const bild = bildVon();
    const grad = (id: string) => (id.endsWith("4") ? 7 : 2);

    // Club Nord: a4 traegt den hoechsten Grad und heisst "Brief Nord". Club Sued: b4
    // hat den hoechsten Grad, aber keinen Namen und zahlt nicht — also gewinnt bei
    // Gleichstand die fruehere Kennung, b1 "Kessel Sud".
    expect(haufenNamen(bild, kraeftig, grad)).toEqual(haufenNamen(bild, kraeftig, grad));
    expect(haufenNamen(bild, kraeftig, grad)).toEqual(["Brief Nord", "Kessel Sud"]);
    // Gleichstand ueber alles: dann entscheidet die Reihenfolge des Bestands, nicht die Map.
    expect(haufenNamen(bild, kraeftig, () => 1)).toEqual(["Kessel Nord", "Kessel Sud"]);
  });
});

describe("unterscheidetVonArt — die Latte aus dem Marktbericht", () => {
  it("laesst durch, was Arten durchmischt", () => {
    const f = gemischteKlubs();
    const urteil = unterscheidetVonArt(haufenBildBaue(gemeinschaftenBaue(f.knoten, f.kanten)), (id) => f.art.get(id) ?? "");

    expect(urteil.ja).toBe(true);
    expect(urteil.deckung).toBeLessThan(0.9);
  });

  it("weist zurueck, was nur die Art umlackiert, und nennt die Zahl", () => {
    const f = artgleicheKlubs();
    const urteil = unterscheidetVonArt(haufenBildBaue(gemeinschaftenBaue(f.knoten, f.kanten)), (id) => f.art.get(id) ?? "");

    expect(urteil.ja).toBe(false);
    expect(urteil.deckung).toBeCloseTo(1, 5);
    expect(urteil.grund).toMatch(/100/);
  });

  // Eine Null aus der Leerstelle ist kein Befund ueber die Welt. Am ausgelieferten
  // Stueck gemessen 23:08:49 (Kapsel, 144 Notizen, sechs Familien, CDP 9523): das gezeichnete
  // Netz traegt dort keine Art — die Arten-Farbe malt also nichts, und ein Haufen kann
  // nichts nachmalen. Die erste Fassung des Tors verweigerte in genau diesem Fall, weil sie
  // eine Deckung von eins meldete, die aus einer leeren Grundgesamtheit kam.
  it("laesst den Kanal, wo die Arten ueberhaupt nichts malen", () => {
    const f = gemischteKlubs();
    const urteil = unterscheidetVonArt(haufenBildBaue(gemeinschaftenBaue(f.knoten, f.kanten)), () => "");

    expect(urteil.ja).toBe(true);
    expect(urteil.deckung).toBe(0);
    expect(urteil.grund).toMatch(/kein Knoten mit Art/);
  });

  it("weist auch einen einzigen Haufen zurueck, weil eine Farbe keine Ordnung ist", () => {
    const knoten = ["x", "y", "z"];
    const kanten = [kante("x", "y"), kante("y", "z")];
    const urteil = unterscheidetVonArt(
      haufenBildBaue(gemeinschaftenBaue(knoten, kanten)),
      () => "episode",
    );

    expect(urteil.ja).toBe(false);
    expect(urteil.grund).toMatch(/ein Haufen|1 Haufen/);
  });
});
