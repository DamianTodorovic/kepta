// @vitest-environment jsdom
//
// Punkt 5, Zelle 23.10. abends — die Vergabe nach Belegung (Flicken v2).
//
// Der Korpus der Faelle ist der gemessene Bestand vom 23.10., 20:03:17 MESZ:
// zwoelf Gruppen, 21 066 Knoten, fuenf belegte Toene. Knotenzahlen und heutige Toene
// stehen hier als Zahlen, weil sie AUS DEM BESTAND kommen und nicht aus dem Quelltext —
// eine Wache ueber eine Messung muss die Messung tragen.
//
// v2 gegenueber v1: die Zuordnung rechnet **im Modell** (`baueFarbGruppen`), nicht in der
// Flaeche — die G-72-Wache verlangt genau einen Modellaufruf und keinen zweiten Zaehler.
// Und sie ist **Maximin** statt belegungsgewichtet: Farben duerfen nicht wandern, wenn der
// Zeitregler den Bestand filtert. Fall 3 haelt beides fest.
//
// Gegen den Stand 87b952d (3.2.44) gefahren: **rot, und zwar an der Aufloesung der
// Importe** — `vergabeNachBelegung`, `kontrastVerhaeltnis` und `gruppenGlyph` gibt es dort
// noch nicht. Der rote Lauf steht im Protokoll der Hand, nicht in diesem Kommentar.
import { describe, it, expect, beforeEach } from "vitest";
import {
  GRUPPEN_PALETTE,
  kontrastVerhaeltnis,
  vergabeNachBelegung,
  gruppenGlyphen,
  baueFarbGruppen,
  type FarbGruppe,
} from "../../src/lib/gruppen";
import type { Memory } from "../../src/types";

const BESTAND = 21066;
const gr = (marke: string, notizen: number, farbe: string): FarbGruppe => ({
  marke,
  notizen,
  farbe,
  prozent: (100 * notizen) / BESTAND,
});
const notiz = (id: string, tags: string[]): Memory =>
  ({ id, userId: "local", title: id, content: "leib", tags, createdAt: 1, updatedAt: 1 }) as Memory;

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

beforeEach(() => localStorage.clear());

describe("Vergabe nach Belegung", () => {
  it("gibt md, json und txt je einen freien Ton — die Regel und das Modell sagen dasselbe", () => {
    expect(vergabeNachBelegung(GRUPPEN, BEWEGEN)).toEqual({
      md: "#4fae63",
      json: "#c65b8c",
      txt: "#9a6fd0",
    });
    // Derselbe Weg, den die Flaeche nimmt: EIN Modellaufruf setzt die Toene mit.
    // Die Markenliste ist die gemessene, damit der Vorrat der freien Toene derselbe ist
    // (mit nur fuenf Marken waere Messing frei und die Zuordnung eine andre).
    const bestand: Memory[] = [
      ...Array.from({ length: 5 }, (_, i) => notiz(`ms${i}`, ["machine-scan", "md"])),
      notiz("j1", ["machine-scan", "json"]),
      notiz("t1", ["machine-scan", "txt"]),
    ];
    const m = baueFarbGruppen(
      bestand,
      { marken: GRUPPEN.map((g) => g.marke), farben: {} },
      BEWEGEN
    );
    const farbe = (k: string) => m.gruppen.find((g) => g.marke === k)?.farbe;
    expect(farbe("md")).toBe("#4fae63");
    expect(farbe("json")).toBe("#c65b8c");
    expect(farbe("txt")).toBe("#9a6fd0");
    expect(farbe("machine-scan")).toBe("#5b7fd4");
    expect(farbe("html")).toBe("#e2703a");
  });

  it("laesst jede andere Gruppe auf ihrem Ton", () => {
    expect(Object.keys(vergabeNachBelegung(GRUPPEN, BEWEGEN)).sort()).toEqual([...BEWEGEN].sort());
  });

  it("waehlt je Gruppe den Ton mit dem besten schlechtesten Paar — unabhaengig von den Knotenzahlen", () => {
    const gemessen = vergabeNachBelegung(GRUPPEN, BEWEGEN);
    // Gleiche Toene, gleiche Reihenfolge, jede Belegung 1: dieselbe Zuordnung.
    // Das ist die Zusage, dass ein Zeitfilter die Farben nicht wandern laesst.
    expect(vergabeNachBelegung(GRUPPEN.map((g) => ({ ...g, notizen: 1 })), BEWEGEN)).toEqual(gemessen);
    const belegt = new Set(GRUPPEN.map((g) => g.farbe));
    const frei = GRUPPEN_PALETTE.filter((f) => !belegt.has(f));
    const bleibt = [...new Set(GRUPPEN.filter((g) => !BEWEGEN.includes(g.marke)).map((g) => g.farbe))];
    const schlechtestes = (f: string) => Math.min(...bleibt.map((t) => kontrastVerhaeltnis(f, t)));
    for (const f of frei) expect(schlechtestes(gemessen.md)).toBeGreaterThanOrEqual(schlechtestes(f));
  });

  it("loest die Kollisionen: zwei geteilte Toene bleiben, nicht fuenf", () => {
    const koll = geteilte(vergabeNachBelegung(GRUPPEN, BEWEGEN));
    expect(koll.map(([t]) => t).sort()).toEqual(["#d4b23f", "#e2703a"]);
    expect(koll.reduce((s, [, gs]) => s + gs.length, 0)).toBe(6);
  });

  it("gibt jeder Gruppe eines geteilten Tons einen eignen Buchstaben", () => {
    const glyphen = gruppenGlyphen(GRUPPEN.map((g) => g.marke));
    for (const [ton, gs] of geteilte(vergabeNachBelegung(GRUPPEN, BEWEGEN))) {
      const buchstaben = gs.map((m) => glyphen[m]);
      expect(buchstaben, `Ton ${ton}`).toHaveLength(new Set(buchstaben).size);
      for (const b of buchstaben) expect(b).toMatch(/^[A-Z0-9]{1,2}$/);
    }
  });

  // #89 — die gelandete Wache oben prueft nur INNERHALB eines geteilten Tons und schlaegt
  // darum nie rot, auch wenn zwei Gruppen verschiedenen Tons denselben Buchstaben tragen.
  // Dieser Fall prueft ALLE Paare.
  it("gibt JEDER Gruppe einen eignen Buchstaben — ueber alle Paare", () => {
    const marken = GRUPPEN.map((g) => g.marke);
    const glyphen = gruppenGlyphen(marken);
    const doppelt: string[] = [];
    for (let i = 0; i < marken.length; i++) {
      for (let j = i + 1; j < marken.length; j++) {
        if (glyphen[marken[i]] === glyphen[marken[j]]) doppelt.push(`${marken[i]}/${marken[j]}:${glyphen[marken[i]]}`);
      }
    }
    expect(doppelt, "Gruppen mit demselben Buchstaben").toEqual([]);
    expect(new Set(Object.values(glyphen)).size, "verschiedene Buchstaben").toBe(marken.length);
    for (const b of Object.values(glyphen)) expect(b).toMatch(/^[A-Z0-9]{1,2}$/);
  });

  it("rechnet den Kontrast nach WCAG und in beide Richtungen gleich", () => {
    expect(kontrastVerhaeltnis("#000000", "#ffffff")).toBeCloseTo(21, 2);
    expect(kontrastVerhaeltnis("#5b7fd4", "#4fae63")).toBeCloseTo(kontrastVerhaeltnis("#4fae63", "#5b7fd4"), 12);
  });

  it("macht nichts, wenn kein Ton frei ist oder niemand bewegt werden soll", () => {
    const voll = GRUPPEN_PALETTE.map((f, i) => gr(`g${i}`, 10, f));
    expect(vergabeNachBelegung(voll, ["g0"])).toEqual({});
    expect(vergabeNachBelegung(GRUPPEN, [])).toEqual({});
    // Und eine von Hand gesetzte Farbe schlaegt jede Rechnung.
    const m = baueFarbGruppen([notiz("a", ["md"]), notiz("b", ["machine-scan"])], { marken: ["md", "machine-scan"], farben: { md: "#123456" } }, ["md"]);
    expect(m.gruppen.find((g) => g.marke === "md")?.farbe).toBe("#123456");
  });
});
