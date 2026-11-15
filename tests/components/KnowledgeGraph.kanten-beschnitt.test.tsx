// @vitest-environment jsdom
// Punkt 1, Aufgabe 25 - die Kante, die beschneidet, muss es zeigen.
//
// Gemessen am installierten 3.2.109 (`BEFUND-131-RAND-1500-1110.md`): bei 1 500 Notizen in
// 1 440 x 900 traegt die obere Bildkante in jedem Lauf Tinte - 22,0 % und 30,8 % ihrer Laenge,
// zwei Weltlagen derselben Fassung. Die Kamera schneidet nicht absichtlich, sondern weil der
// Lesbarkeits-Boden das Einpassen ueberstimmt (`P1-KAMERA-ENTSCHEIDUNG-3110.md` §8). Was fehlte,
// ist der Uebergang: ein angeschnittener Kreis wird als voller Kreis gelesen.
//
// Darum traegt jede Kante, die einen Knoten ueber den Rand hinaus laufen laesst, ein Band.
// Gerechnet wird es aus derselben Menge, die die Bilanzzeile zaehlt - Wort und Bild duerfen nie
// aus zwei Rechnungen kommen.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { kantenBeschnitt, KnowledgeGraph } from "../../src/components/KnowledgeGraph";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger, type Leinwand } from "../helfer/canvas";
import type { Memory } from "../../src/types";

let leinwand: Leinwand;
let zaehler = 0;
function note(): Memory {
  zaehler += 1;
  return {
    id: `k${zaehler}`, userId: "local", title: `Kantennotiz ${zaehler}`, content: "Inhalt",
    tags: ["begriff"], type: "semantic", scope: "local", confidence: 1,
    validFrom: null, validTo: null, supersededBy: null, deletedAt: null,
    createdAt: Date.parse("2024-01-01"), updatedAt: Date.parse("2024-01-01"),
  } as Memory;
}

beforeEach(() => {
  leinwand = installiereLeinwand();
  installiereResizeObserver(1130, 700);
  installiereZeiger();
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 })));
});
afterEach(() => { vi.unstubAllGlobals(); });

const RAHMEN = { x0: 0, y0: 0, x1: 1000, y1: 700 };
const knoten = (x: number, y: number, r = 10) => ({ x, y, r });

describe("kantenBeschnitt - welche Kante traegt einen angeschnittenen Knoten", () => {
  it("ist still, wenn alles innerhalb steht", () => {
    const k = kantenBeschnitt(RAHMEN, [knoten(500, 350), knoten(20, 20), knoten(980, 680)]);
    expect(k).toEqual({ oben: false, unten: false, links: false, rechts: false });
  });

  it("meldet oben, wenn ein Kreis ueber die obere Kante laeuft", () => {
    const k = kantenBeschnitt(RAHMEN, [knoten(500, 5, 10)]);
    expect(k.oben, "ein Kreis, der 5 Einheiten ueber der Kante hinausragt, muss sie melden").toBe(true);
    expect([k.unten, k.links, k.rechts]).toEqual([false, false, false]);
  });

  it("meldet unten und rechts zusammen, wenn beide Kanten tragen", () => {
    const k = kantenBeschnitt(RAHMEN, [knoten(995, 400, 10), knoten(400, 695, 10)]);
    expect(k).toEqual({ oben: false, unten: true, links: false, rechts: true });
  });

  it("kennt die scharfe Kante: die eigene Randlinie ist noch kein Beschnitt", () => {
    // Dieselbe Schwelle wie die strenge Rahmenzahl der Bilanz (`imRahmen`): `>= y0` gilt als
    // drin. Zwei Antworten auf dieselbe Frage duerfen nicht auseinanderlaufen.
    const k = kantenBeschnitt(RAHMEN, [knoten(500, 10, 10), knoten(500, 690, 10)]);
    expect(k).toEqual({ oben: false, unten: false, links: false, rechts: false });
    const knapp = kantenBeschnitt(RAHMEN, [knoten(500, 9.99, 10)]);
    expect(knapp.oben, "9,99 gegen Kante 0 ist ein Beschnitt, auch wenn er einen Punkt misst").toBe(true);
  });

  it("zaehlt nur, was gemalt wird - eine leere Liste kann nichts melden", () => {
    expect(kantenBeschnitt(RAHMEN, [])).toEqual({ oben: false, unten: false, links: false, rechts: false });
    // Darum ist der Fall oben kein Selbstlaeufer: er verliert, sobald eine Kante zu Unrecht
    // meldet, und er gewinnt nur, wenn ein echter Beschnitt gemeldet wird.
    expect(kantenBeschnitt(RAHMEN, [knoten(0, 350, 10)]).links).toBe(true);
  });
});

/**
 * Die Regel ist gerechnet; hier wird gemalt. Hineinzoomen ist der Weg zum Beschnitt, der ohne
 * Weltlage entscheidet: wer zoomt, schiebt Knoten ueber die Kante, und dann muss die Marke
 * stehen - und die Zeile muss genau die Kante nennen, an der das Bild ein Band malt.
 */
describe("die Kantenmarke wird gemalt, nicht nur gerechnet", () => {
  it("nach dem Hineinzoomen nennt die Zeile eine Kante, und an dieser Kante sitzt ein Band", async () => {
    const notizen = Array.from({ length: 400 }, note);
    const view = render(<KnowledgeGraph memories={notizen} onSelectMemory={() => {}} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 550)); });
    const knopf = [...view.container.querySelectorAll("button")].find((b) => (b.getAttribute("title") || "") === "Zoom in");
    expect(knopf, "kein Zoom-in-Knopf — die Flaeche ist nicht zu erreichen").toBeTruthy();
    for (let i = 0; i < 8; i++) {
      await act(async () => { knopf!.click(); await new Promise((r) => setTimeout(r, 120)); });
    }
    const zeile = view.container.querySelector<HTMLElement>('[data-testid="graph-im-bild"]');
    const gemeldeteKanten = (zeile?.dataset.kanten || "").trim();
    expect(gemeldeteKanten, "nach achtmal Hineinzoomen steht alles im Bild — die Bedingung des Falls ist nicht erfuellt").not.toBe("");
    const baender = leinwand.letzterRahmen().filter((a) => a.op === "rect").map((a) => a.args.map(Number));
    expect(baender.length, "es wird kein Band gemalt").toBeGreaterThan(0);
    // Die Marke darf nicht in den Rechteck-Kanal der Knoten: zwei gelieferte Zaehler lesen
    // dort jedes Rechteck als gebuendelten Knoten, und sie haben recht damit.
    expect(leinwand.letzterRahmen().some((a) => a.op === "fillRect"), "die Marke malt im Kanal der Knoten").toBe(false);
    for (const seite of gemeldeteKanten.split(/\s+/).filter(Boolean)) {
      const treffer = baender.some(([ax, ay, aw, ah]) =>
        seite === "oben" ? ax === 1 && ay === 1 && ah === 3 && aw > 100
          : seite === "unten" ? ah === 3 && aw > 100 && ay > 100
            : seite === "links" ? ax === 1 && ay === 1 && aw === 3 && ah > 100
              : aw === 3 && ah > 100 && ax > 100);
      expect(treffer, `die Zeile meldet "${seite}", aber an dieser Kante sitzt kein Band`).toBe(true);
    }
  });
});
