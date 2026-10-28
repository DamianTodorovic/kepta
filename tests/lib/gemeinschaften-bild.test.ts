// Punkt 117, Schnitt 2: aus der Community-Rechnung ein Bild machen, und zwar erst
// die zwei reinen Helfer, die das koennen — Zuordnung mit Toenen, und die Frage, ob
// die Haufen ueberhaupt etwas anderes sagen als die Arten.
//
// Die Latte kommt aus MARKT-GRAPH-2710.md, Entscheidung 2: "ein benannter Haufen muss
// sich von der Art-Gruppe unterscheiden — sonst ist es umlackierte Art, keine Community."
import { describe, expect, it } from "vitest";

import {
  grundIstHell,
  HAUFEN_PALETTE_DUNKEL,
  HAUFEN_PALETTE_HELL,
  gemeinschaftenBaue,
  grundHexVon,
  haufenBildBaue,
  haufenNamen,
  tonAbstand,
  unterscheidetVonArt,
  type Gemeinschaftskante,
} from "../../src/lib/gemeinschaften";
import { GRUPPEN_PALETTE, kontrastVerhaeltnis } from "../../src/lib/gruppen";

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

describe("tonAbstand — das Mass, nach dem Toene gewaehlt werden", () => {
  it("gibt null fuer denselben Ton und fuer kaputte Angaben", () => {
    expect(tonAbstand("#e2703a", "#e2703a")).toBe(0);
    expect(tonAbstand("keine farbe", "#e2703a")).toBe(0);
    expect(tonAbstand("", "")).toBe(0);
  });

  it("unterscheidet Ton und Saettigung staerker als die Helligkeit", () => {
    // Gruen gegen Tuerkois: fast gleiche Helligkeit, naher Ton — genau das Paar,
    // das die alte Auswahl (nach Helligkeitsabstand) zusammen nahm.
    const grau = tonAbstand("#4fae63", "#3fbfa8");
    const weit = tonAbstand("#e2703a", "#5b7fd4");
    expect(weit).toBeGreaterThan(grau);
    expect(grau).toBeGreaterThan(0);
  });
});

describe("haufenBildBaue — sechs Haufen aus einer Achter-Palette", () => {
  const sechs = () => {
    const kanten: Gemeinschaftskante[] = [];
    const knoten: string[] = [];
    for (let f = 0; f < 6; f += 1) {
      const mit = Array.from({ length: 4 }, (_, i) => `f${f}-${i}`);
      knoten.push(...mit);
      for (let i = 0; i < mit.length; i += 1) {
        for (let j = i + 1; j < mit.length; j += 1) kanten.push({ a: mit[i], b: mit[j] });
      }
    }
    return haufenBildBaue(gemeinschaftenBaue(knoten, kanten));
  };

  it("waehlt sechs Toene, die sich nach Ton und Saettigung unterscheiden", () => {
    const tone = Object.values(sechs().farben);
    expect(tone).toHaveLength(6);

    let kleinster = Number.MAX_SAFE_INTEGER;
    for (let i = 0; i < tone.length; i += 1) {
      for (let j = i + 1; j < tone.length; j += 1) kleinster = Math.min(kleinster, tonAbstand(tone[i], tone[j]));
    }
    // Latte 0,15: gemessen 0,166 (tuerkis gegen moos). Die Auswahl nach
    // Helligkeitsabstand lag bei 0,110 (gruen gegen tuerkis) und faellt durch.
    expect(kleinster).toBeGreaterThanOrEqual(0.15);
  });

  it("haelt jeden Ton von der dunklen Flaeche ablesbar", () => {
    const tone = Object.values(sechs().farben);
    const gegen = tone.map((t) => kontrastVerhaeltnis(t, "#141619"));
    expect(Math.min(...gegen)).toBeGreaterThanOrEqual(3);
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

/**
 * Punkt 119, zweite Haelfte: die Tonwahl prueft einen Grund, aber die Flaeche hat ihr
 * nie einen gegeben. Diese Faelle halten beides — den Helfer, der einen gemalten
 * Bildpunkt in Hex bringt, und die Zahl der Toene, die unter 3:1 fallen, wenn der
 * Grund bekannt ist gegenueber dem Fall, dass er unbekannt bleibt.
 */
describe("#119 der Grund unter den Toenen", () => {
  const sechsKlubs = () => {
    const knoten: string[] = [];
    const kanten: Gemeinschaftskante[] = [];
    for (let k = 0; k < 6; k += 1) {
      const namen = [0, 1, 2].map((i) => `k${k}${i}`);
      knoten.push(...namen);
      for (let i = 0; i < namen.length; i += 1)
        for (let j = i + 1; j < namen.length; j += 1) kanten.push({ a: namen[i], b: namen[j] });
    }
    return { knoten, kanten };
  };

  it("liest einen gemalten Bildpunkt, raeet aber keinen oklch-Wert", () => {
    expect(grundHexVon("#38383A")).toBe("#38383a");
    expect(grundHexVon("#abc")).toBe("#aabbcc");
    expect(grundHexVon("rgb(56, 56, 58)")).toBe("#38383a");
    expect(grundHexVon("rgba(250, 250, 248, 1)")).toBe("#fafaf8");
    expect(grundHexVon("oklch(0.3428 0.0026 286)"), "oklch wird nicht umgerechnet").toBeUndefined();
    expect(grundHexVon("")).toBeUndefined();
  });

  it("waehlt weniger schwache Toene, wenn der Grund bekannt ist", () => {
    const { knoten, kanten } = sechsKlubs();
    const ergebnis = gemeinschaftenBaue(knoten, kanten);
    const schwach = (bild: ReturnType<typeof haufenBildBaue>, grund: string) =>
      Object.values(bild.farben).filter((ton) => kontrastVerhaeltnis(ton, grund) < 3).length;
    const ohne = haufenBildBaue(ergebnis);
    const hell = haufenBildBaue(ergebnis, undefined, "#fafaf8");
    const dunkel = haufenBildBaue(ergebnis, undefined, "#38383a");
    expect(Object.keys(hell.farben).length, "sechs Klubs brauchen sechs Toene").toBe(6);
    expect(schwach(hell, "#fafaf8"), `auf dem hellen Blatt: ${schwach(ohne, "#fafaf8")} ohne Grund gegen ${schwach(hell, "#fafaf8")} mit Grund`)
      .toBeLessThan(schwach(ohne, "#fafaf8"));
    expect(schwach(dunkel, "#38383a"), `auf dem dunklen Blatt: ${schwach(ohne, "#38383a")} ohne Grund gegen ${schwach(dunkel, "#38383a")} mit Grund`)
      .toBeLessThanOrEqual(schwach(ohne, "#38383a"));
  });

  it("kennt pro Blatt einen Vorrat, dessen Toene dort 3:1 halten", () => {
    // Das ist Punkt 120: der Vorrat war einer, die Prüfung zwei Blaetter. Ein Ton, der
    // gegen sein eigenes Blatt unter 3:1 faellt, ist kein zweiter Ton, sondern ein Defekt.
    for (const ton of HAUFEN_PALETTE_DUNKEL) {
      expect(kontrastVerhaeltnis(ton, "#38383a"), `${ton} gegen das dunkle Blatt`).toBeGreaterThanOrEqual(3);
    }
    for (const ton of HAUFEN_PALETTE_HELL) {
      expect(kontrastVerhaeltnis(ton, "#fafaf8"), `${ton} gegen das helle Blatt`).toBeGreaterThanOrEqual(3);
    }
    expect(grundIstHell("#fafaf8")).toBe(true);
    expect(grundIstHell("#38383a")).toBe(false);
    expect(grundIstHell("kein farbwort")).toBe(false);
  });

  it("liefert sechs brauchbare Toene, wenn der Grund genannt ist", () => {
    const { knoten, kanten } = sechsKlubs();
    const ergebnis = gemeinschaftenBaue(knoten, kanten);
    for (const [grund, name] of [["#fafaf8", "hell"], ["#38383a", "dunkel"]] as const) {
      const bild = haufenBildBaue(ergebnis, undefined, grund);
      const tone = Object.values(bild.farben);
      expect(tone.length, `${name}: sechs Klubs, sechs Toene`).toBe(6);
      const schwach = tone.filter((ton) => kontrastVerhaeltnis(ton, grund) < 3);
      expect(schwach, `${name}: Toene unter 3:1 auf ihrem eignen Blatt: ${schwach.join(" ")}`).toEqual([]);
      let min = 9;
      for (let i = 0; i < tone.length; i += 1)
        for (let j = i + 1; j < tone.length; j += 1) min = Math.min(min, tonAbstand(tone[i], tone[j]));
      expect(min, `${name}: engstes Paar der sechs Toene`).toBeGreaterThanOrEqual(0.15);
    }
  });

  it("benutzt die Gruppen-Palette, wo niemand einen Grund nennt", () => {
    const { knoten, kanten } = sechsKlubs();
    const bild = haufenBildBaue(gemeinschaftenBaue(knoten, kanten));
    for (const ton of Object.values(bild.farben)) {
      expect(GRUPPEN_PALETTE as readonly string[], `${ton} liegt nicht im Gruppen-Vorrat`).toContain(ton);
    }
  });
});
