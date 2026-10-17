// @vitest-environment jsdom
// #29 — der Titel-Etat kommt aus der Leinwand, nicht aus einer Konstanten.
//
// `MAX_LABELS = 140` war eine gesetzte Zahl. SiYuan rechnet seinen Etat aus der
// Fensterflaeche (`max(32, floor(w·h/2400))` = 540 auf seiner Buehne, GQ3
// `labelRenderer.ts:53`), wir aus dem Kopf. Gemessen an Damians echtem Bild
// (Vorlaeufer-Lauf 17.10., 1 440×900, Leinwand 1 130×740 CSS-Bildpixel):
// das Belegungsraster der Flaeche hat Zellen von `fs + 3` = 14 px, also
// floor(1130/14) × floor(740/14) = 80 × 52 = 4 160 Zellen. Ein Titel von
// 145,27 px (der Median seiner echten 26-Zeichen-Titel, im Chromium gemessen)
// belegt 2 × ceil(145,27/14) = 22 Zellen — es passen 189 Namen in sein Bild,
// nicht 140. Die Konstante lag also UNTER dem, was sein Fenster hergibt, und
// wurde, nachdem #17 die Breite gezähmt hat, zur echten Kante: im selben Lauf
// meldete die Flaeche "194 over the 140 names this picture allows".
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { render, act } from "@testing-library/react";
import { KnowledgeGraph } from "../../src/components/KnowledgeGraph";
import { titelEtatAusLeinwand } from "../../src/lib/graphLayout";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger, setzeTheme } from "../helfer/canvas";
import type { Memory } from "../../src/types";

const ZELLE = 14;
const TITEL = 148.5;

describe("titelEtatAusLeinwand", () => {
  it("rechnet Zellen pro Achse, nicht Flaeche durch Zellflaeche", () => {
    // 500/14 = 35,7 → 35 Spalten, 400/14 = 28,6 → 28 Reihen. Ueber die Flaeche
    // gerechnet kaeme ein anderer Wert heraus — die Flaeche floor_t pro Achse.
    expect(titelEtatAusLeinwand(500, 400, TITEL, ZELLE)).toBe(
      Math.floor((Math.floor(500 / ZELLE) * Math.floor(400 / ZELLE)) / (2 * Math.ceil(TITEL / ZELLE))),
    );
  });

  it("kennt fuer eine halb so grosse Leinwand einen kleineren Etat", () => {
    const gross = titelEtatAusLeinwand(1000, 700, TITEL, ZELLE);
    const klein = titelEtatAusLeinwand(500, 350, TITEL, ZELLE);
    expect(klein, "zwei Leinwaende, ein Etat — die Zahl kommt nicht aus der Leinwand").toBeLessThan(gross);
  });

  it("kennt fuer einen kleineren Titel einen groesseren Etat", () => {
    const langerTitel = titelEtatAusLeinwand(1000, 700, 148.5, ZELLE);
    const kurzerTitel = titelEtatAusLeinwand(1000, 700, 79, ZELLE);
    expect(kurzerTitel, "der Etat kennt die Breite nicht, die die Flaeche selbst baut").toBeGreaterThan(langerTitel);
  });

  it("verspricht nichts, was kein Raster aufnehmen kann", () => {
    expect(titelEtatAusLeinwand(0, 0, TITEL, ZELLE)).toBe(0);
    expect(titelEtatAusLeinwand(10, 10, TITEL, ZELLE)).toBe(0);
    expect(titelEtatAusLeinwand(1000, 700, 0, ZELLE)).toBe(0);
    expect(titelEtatAusLeinwand(1000, 700, TITEL, 0)).toBe(0);
  });
});

describe("Die Flaeche meldet ihren Etat aus dem Fenster (#29)", () => {
  let zaehler = 0;
  const note = (): Memory => {
    zaehler++;
    return {
      id: `e${zaehler}`, userId: "local", title: `Notiz ${zaehler}`, content: "Inhalt",
      tags: [], type: "semantic", createdAt: Date.parse("2024-01-01"), updatedAt: Date.parse("2024-01-01"),
    } as Memory;
  };

  beforeEach(() => {
    installiereLeinwand();
    installiereResizeObserver(1000, 700);
    installiereZeiger();
    setzeTheme("dunkel");
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 })));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); document.documentElement.removeAttribute("style"); });

  const etat = (c: HTMLElement) => (c.querySelector('[data-testid="graph-benannt"]')?.textContent ?? "").trim();
  const budget = (c: HTMLElement) => Number((etat(c).match(/over the ([\d.,]+) names/) ?? ["0", "0"])[1].replace(/,/g, ""));
  const zoomAnzeige = (c: HTMLElement) =>
    Number(((c.querySelector('[title="Current zoom"]')?.textContent ?? "").match(/([\d.,]+)\s*%/) ?? ["0", "0"])[1].replace(",", "."));

  /** Ein Begriff mit zehn Traegern: ohne Kern ist das Bild eine Punktwolke und
   *  die Pforte wirft alles, bevor der Etat ueberhaupt fragen darf. */
  function hub(k: number) {
    const traeger = Array.from({ length: k }, (_, i) => `b${i}`);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).startsWith("/api/graph?")) {
        return new Response(JSON.stringify({
          entities: [{ id: 1, name: "Sammelbecken" }],
          relations: [{ id: "r1", source: "Sammelbecken", target: "Blatt 0", relation: "mentions", memoryId: "b0" }],
          memoriesByEntity: { Sammelbecken: traeger },
          bestand: { knoten: 1, kanten: Math.max(1, traeger.length) },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 });
    }));
  }

  /** Ein frisches Fenster mit eigener Leinwandmasse, hereingezoomt ueber die
   *  Höhen-Schalte des Gangs: erst dann entscheidet der Etat, vorher ist "zu
   *  enge Reihe" der einzige Grund. */
  async function etatBeiGroesse(breite: number, hoehe: number) {
    installiereResizeObserver(breite, hoehe);
    const view = render(
      <KnowledgeGraph memories={Array.from({ length: 1000 }, (_, i) => ({ ...note(), id: `b${i}` }))} onSelectMemory={vi.fn()} />,
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
    const rein = [...view.container.querySelectorAll("button")].find((b) => b.title === "Zoom in");
    expect(rein, "der Zoom-in-Knopf fehlt — der Fall greift nicht").toBeTruthy();
    for (let i = 0; i < 40 && zoomAnzeige(view.container) < 100; i++) {
      await act(async () => { rein!.click(); await new Promise((r) => setTimeout(r, 30)); });
    }
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
    const wert = budget(view.container);
    const zeile = etat(view.container);
    view.unmount();
    return { wert, zeile };
  }

  it("nennt eine Zahl, die mit der Leinwand wandert", async () => {
    hub(10);
    const weite = await etatBeiGroesse(1000, 700);
    expect(weite.wert, `die Zeile nennt keinen Etat: "${weite.zeile}"`).toBeGreaterThan(0);

    const enge = await etatBeiGroesse(500, 350);
    expect(enge.wert, `bei einer halben Leinwand meldet die Flaeche keinen Etat: "${enge.zeile}"`).toBeGreaterThan(0);
    expect(
      enge.wert,
      `zwei Leinwaende, ein Etat: ${weite.wert} bei 1000x700 und ${enge.wert} bei 500x350 — die Zahl kommt nicht aus dem Fenster`,
    ).toBeLessThan(weite.wert);
  });

  it("haelt keine Etat-Zahl mehr als Konstante im Quelltext", () => {
    const quelltext = readFileSync("src/components/KnowledgeGraph.tsx", "utf8");
    expect(quelltext, "MAX_LABELS steht noch in der Flaeche — der Etat ist eine gesetzte Zahl").not.toMatch(/MAX_LABELS/);
  });
});
