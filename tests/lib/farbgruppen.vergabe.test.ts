//
// Punkt 5, Zelle 23.10. abends — die Vergabe nach Belegung.
//
// Der Korpus dieser Faelle ist der gemessene Bestand vom 23.10., 20:03:17 MESZ:
// zwoelf Gruppen, 21 066 Knoten, fuenf belegte Toene. Knotenzahlen und heutige Toene
// stehen hier als Zahlen, weil sie AUS DEM BESTAND kommen und nicht aus dem Quelltext —
// eine Wache ueber eine Messung muss die Messung tragen.
//
// Gegen den Stand 87b952d (3.2.44) gefahren: **rot, und zwar an der Aufloesung der
// Importe** — `vergabeNachBelegung`, `kontrastVerhaeltnis` und `gruppenGlyph` gibt es dort
// noch nicht. Der rote Lauf steht im Protokoll der Hand, nicht in diesem Kommentar.
import { describe, it, expect } from "vitest";
import {
  GRUPPEN_PALETTE,
  kontrastVerhaeltnis,
  vergabeNachBelegung,
  gruppenGlyph,
  type FarbGruppe,
} from "../../src/lib/gruppen";

const BESTAND = 21066;
const gr = (marke: string, notizen: number, farbe: string): FarbGruppe => ({
  marke,
  notizen,
  farbe,
  prozent: (100 * notizen) / BESTAND,
});

/** Marke, Knoten, heutiger Ton — die Zuordnung des Hashes, wie sie die Tuer am 23.10. zeigte. */
const GRUPPEN: FarbGruppe[] = [
  gr("machine-scan", 20974, "#5b7fd4"),
  gr("md", 9063, "#5b7fd4"),
  gr("json", 8485, "#7a9b3f"),
  gr("txt", 1689, "#3fbfa8"),
  gr("html", 1321, "#e2703a"),
  gr("pdf", 206, "#d4b23f"),
  gr("csv", 133, "#3fbfa8"),
  gr("ini", 56, "#7a9b3f"),
  gr("zeitregler-test", 30, "#d4b23f"),
  gr("kepta", 18, "#e2703a"),
  gr("toml", 8, "#d4b23f"),
  gr("yml", 8, "#d4b23f"),
];
const BEWEGEN = ["md", "json", "txt"];
const tonNach = (aus: Record<string, string>, marke: string) =>
  aus[marke] ?? GRUPPEN.find((g) => g.marke === marke)!.farbe;
const geteilte = (aus: Record<string, string>) => {
  const karte = new Map<string, string[]>();
  for (const g of GRUPPEN) {
    const t = tonNach(aus, g.marke);
    karte.set(t, [...(karte.get(t) ?? []), g.marke]);
  }
  return [...karte.entries()].filter(([, gs]) => gs.length > 1);
};

describe("Vergabe nach Belegung", () => {
  it("gibt md, json und txt je einen freien Ton, nach Belegung gewichtet", () => {
    expect(vergabeNachBelegung(GRUPPEN, BEWEGEN)).toEqual({
      md: "#4fae63",
      json: "#c65b8c",
      txt: "#9a6fd0",
    });
  });

  it("laesst jede andere Gruppe auf ihrem Ton", () => {
    expect(Object.keys(vergabeNachBelegung(GRUPPEN, BEWEGEN)).sort()).toEqual([...BEWEGEN].sort());
  });

  it("waehlt fuer die groesste Gruppe den Ton mit dem hoechsten Kontrast zu Stahlblau", () => {
    const belegt = new Set(GRUPPEN.map((g) => g.farbe));
    const frei = GRUPPEN_PALETTE.filter((f) => !belegt.has(f));
    expect(frei).toHaveLength(3);
    const md = vergabeNachBelegung(GRUPPEN, BEWEGEN).md;
    for (const f of frei) {
      expect(kontrastVerhaeltnis(md, "#5b7fd4")).toBeGreaterThanOrEqual(kontrastVerhaeltnis(f, "#5b7fd4"));
    }
    expect(kontrastVerhaeltnis(md, "#5b7fd4")).toBeGreaterThan(
      Math.min(...frei.map((f) => kontrastVerhaeltnis(f, "#5b7fd4")))
    );
  });

  it("loest die Kollisionen: zwei geteilte Toene bleiben, nicht fuenf", () => {
    const koll = geteilte(vergabeNachBelegung(GRUPPEN, BEWEGEN));
    expect(koll.map(([t]) => t).sort()).toEqual(["#d4b23f", "#e2703a"]);
    expect(koll.reduce((s, [, gs]) => s + gs.length, 0)).toBe(6);
  });

  it("gibt jeder Gruppe eines geteilten Tons einen eignen Buchstaben", () => {
    for (const [ton, gs] of geteilte(vergabeNachBelegung(GRUPPEN, BEWEGEN))) {
      const buchstaben = gs.map(gruppenGlyph);
      expect(buchstaben, `Ton ${ton}`).toHaveLength(new Set(buchstaben).size);
      for (const b of buchstaben) expect(b).toMatch(/^[A-Z0-9]$/);
    }
  });

  it("rechnet den Kontrast nach WCAG und in beide Richtungen gleich", () => {
    expect(kontrastVerhaeltnis("#000000", "#ffffff")).toBeCloseTo(21, 2);
    expect(kontrastVerhaeltnis("#5b7fd4", "#4fae63")).toBeCloseTo(kontrastVerhaeltnis("#4fae63", "#5b7fd4"), 12);
  });

  it("macht nichts, wenn kein Ton frei ist oder niemand bewegt werden soll", () => {
    const voll = GRUPPEN_PALETTE.map((f, i) => gr(`g${i}`, 10, f));
    expect(vergabeNachBelegung(voll, ["g0"])).toEqual({});
    expect(vergabeNachBelegung(GRUPPEN, [])).toEqual({});
  });
});
