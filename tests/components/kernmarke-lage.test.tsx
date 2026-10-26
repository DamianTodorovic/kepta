// @vitest-environment jsdom
// Wo die Sammelmarke steht, gemessen an dem, was sie selbst ablegt.
//
// STAND: gemessen 24.10. 14:5x MESZ an Kopf bbfe047 (Fassung 3.2.54) mit dem
// Koerper `p1-marke-frei-390-cb7c53e.patch` (Punkt 1, #88) und der Leitung
// zwoelf Zeilen Helfer dazu. Erwartung OHNE den Koerper: beide Faelle ROT -
// case 1, weil die Zahl rechts neben dem Punkt stand und die Leinwand kein
// Rechteck ablegte; case 2, weil ein einmal gelegtes Rechteck stehen blieb,
// auch nachdem die Marke oberhalb der Blende gar nicht mehr malt.
//
// WARUM UBERHAUPT EINE ERWARTUNG AN EINEM DATENSATZ: die Lage ist ein Strich auf
// der Leinwand, kein DOM-Knoten. Der Koerper legt sie deshalb als Bildpunkt-
// Rechteck auf die Leinwand, und die Flaeche im Browser (390 x 844, 3 % Zoom,
// 21 066 Notizen) zeigt dasselbe Rechteck, das dieser Fall prueft.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { KnowledgeGraph } from "../../src/components/KnowledgeGraph";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger, setzeTheme } from "../helfer/canvas";
import { KANTEN_RAND_PX } from "../../src/lib/graphLayout";
import type { Memory } from "../../src/types";

let zaehler = 0;

const FELDER = ["Werkstatt", "Forschung", "Werkzeug", "Ernte"];

function note(i: number): Memory {
  zaehler++;
  const feld = FELDER[i % 4];
  const begriff = `begriff-${String(i % 500).padStart(3, "0")}`;
  return {
    id: `km${zaehler}`,
    userId: "local",
    title: `${feld} ${begriff} ${String(i + 1).padStart(5, "0")}`,
    content: "Inhalt",
    tags: [],
    type: "semantic",
    createdAt: Date.parse("2024-01-01"),
    updatedAt: Date.parse("2024-01-01"),
  } as Memory;
}

const atmen = async (ms: number) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};

/** Was die Flaeche selbst als Zoom nennt - dieselbe Zahl, die ein Mensch liest. */
function zoomProzent(view: ReturnType<typeof render>): number {
  const feld = view.container.querySelector('[title="Current zoom"]');
  return feld ? Number((feld.textContent || "").replace(/[^0-9.,]/g, "").replace(",", ".")) : NaN;
}

async function knopf(view: ReturnType<typeof render>, titel: string): Promise<HTMLButtonElement> {
  const k = [...view.container.querySelectorAll("button")].find(
    (b) => (b.getAttribute("title") || "") === titel
  ) as HTMLButtonElement | undefined;
  expect(k, `der Knopf "${titel}" steht nicht in der Flaeche`).toBeTruthy();
  return k!;
}

/** Dasselbe Gedraenge wie in der Dichte-Kappe: 1 500 Notizen, 145 Begriffe, 360 Kanten. */
async function feld() {
  const notizen = Array.from({ length: 1500 }, note);
  const begriffe = 145;
  const kanten = 360;
  const gedeckte = 216;
  const byEntity: Record<string, string[]> = {};
  const relations: { source: string; target: string; relation: string; memoryId: string | null }[] = [];
  const name = (i: number) => `begriff-${String(i).padStart(3, "0")}`;
  for (let b = 0; b < begriffe; b++) byEntity[name(b)] = [];
  for (let i = 0; i < gedeckte; i++) byEntity[name(i % begriffe)].push(notizen[i].id);
  for (let e = 0; e < kanten; e++) {
    const a = e % begriffe;
    const b = (a + 1 + Math.floor(e / begriffe)) % begriffe;
    relations.push({ source: name(a), target: name(b), relation: "erwaehnt", memoryId: null });
  }
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({
      relations,
      memoriesByEntity: byEntity,
      bestand: { knoten: notizen.length + begriffe, kanten: relations.length + gedeckte },
      deckung: { notizen: notizen.length, gedeckt: gedeckte, anteilProzent: Math.round((gedeckte / notizen.length) * 10000) / 100 },
    }), { status: 200 })
  ));
  const view = render(<KnowledgeGraph memories={notizen} onSelectMemory={() => {}} />);
  await atmen(2200);
  return view;
}

async function bisUnterDieBlende(view: ReturnType<typeof render>, zielProzent: number) {
  const raus = await knopf(view, "Zoom out");
  for (let i = 0; i < 40 && !(zoomProzent(view) <= zielProzent); i++) {
    await act(async () => { raus.click(); });
    await atmen(24);
  }
  await atmen(140);
  return zoomProzent(view);
}

function rechteck(view: ReturnType<typeof render>) {
  const c = view.container.querySelector("canvas")!;
  const roh = c.dataset.kernMarke;
  expect(roh, `kein Rechteck auf der Leinwand; dataset-Schluessel: ${JSON.stringify(Object.keys(c.dataset))}`).toBeTruthy();
  return JSON.parse(roh!) as { x: number; y: number; w: number; h: number; dotX: number; dotY: number };
}

beforeEach(() => {
  zaehler = 0;
  installiereLeinwand();
  installiereResizeObserver(1000, 700);
  installiereZeiger();
  setzeTheme("dunkel");
  localStorage.clear();
  localStorage.setItem("kepta_graph_bewegung", "0");
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 })
  ));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("#88: die Sammelmarke steht ueber dem Punkt und sagt, wo sie steht", () => {
  it("bei 2 % liegt die Zahl ueber dem Punkt, mittig, und ihr Rechteck ist im Bild", async () => {
    const view = await feld();
    const zoom = await bisUnterDieBlende(view, 2);
    expect(zoom, `der Zoom blieb bei ${zoom} Prozent - die Marke malt erst ab 5`).toBeLessThanOrEqual(2);
    const m = rechteck(view);
    expect(m.w, "das Rechteck nennt keine Breite").toBeGreaterThan(0);
    expect(m.h, "das Rechteck nennt keine Hoehe").toBeGreaterThan(0);
    // Ueber dem Punkt: die Unterkante der Zahl reicht nicht bis zu ihm hinunter.
    expect(m.y + m.h, `Zahl-Unterkante ${m.y + m.h} liegt nicht ueber dem Punkt ${m.dotY}`).toBeLessThanOrEqual(m.dotY);
    // Mittig um den Punkt: die alte Lage begann 8 px RECHTS von ihm.
    expect(Math.abs(m.x + m.w / 2 - m.dotX), `nicht mittig: Zahlmitte ${m.x + m.w / 2} gegen Punkt ${m.dotX}`).toBeLessThanOrEqual(2);
    expect(m.x, `die Zahl beginnt rechts vom Punkt (${m.x} gegen ${m.dotX}) - das ist die alte Lage`).toBeLessThan(m.dotX);
    // Das Rechteck liegt innerhalb der Leinwand, sonst ist es halb abgeschnitten.
    const c = view.container.querySelector("canvas")!;
    expect(m.x, "die Zahl liegt links ueber der Leinwandkante").toBeGreaterThanOrEqual(0);
    expect(m.x + m.w, "die Zahl liegt rechts ueber der Leinwandkante").toBeLessThanOrEqual(c.width + 1);
    expect(m.y, "die Zahl liegt ueber der oberen Leinwandkante").toBeGreaterThanOrEqual(0);
  });

  it("ueber der Blende malt keine Marke - und die Leinwand behauptet keine Lage", async () => {
    const view = await feld();
    await bisUnterDieBlende(view, 2);
    expect(view.container.querySelector("canvas")!.dataset.kernMarke, "unter der Blende muss das Rechteck da sein").toBeTruthy();
    const rein = await knopf(view, "Zoom in");
    for (let i = 0; i < 40 && !(zoomProzent(view) >= 8); i++) {
      await act(async () => { rein.click(); });
      await atmen(24);
    }
    await atmen(140);
    expect(zoomProzent(view), "der Zoom ging nicht ueber die Blende hinaus").toBeGreaterThanOrEqual(8);
    expect(
      view.container.querySelector("canvas")!.dataset.kernMarke,
      "die Marke malt nicht mehr, aber die Leinwand traegt noch ihr altes Rechteck"
    ).toBeUndefined();
    // Dasselbe gilt fuer den Zustand der Lage: malt keine Zahl, keine Lage, kein Wort.
    expect(
      view.container.querySelector("canvas")!.dataset.kernOrt,
      "die Marke malt nicht, aber die Leinwand behauptet noch einen Zustand ihrer Lage"
    ).toBeUndefined();
  });

  it("#109: die Leinwand nennt ihre Lage, und ihr Wort gilt fuer ihre eigne Zahl", async () => {
    // Ein Fall, der den Zustand nur *ablesen* wuerde, prueft nichts: "frei" oder
    // "eng" ist jede Meldung durchgelassen. Also wird das Wort gegen die Lage
    // gehalten, die dieselbe Leinwand im selben Feld ablegt — wer "frei" sagt und
    // eine Zahl ueber der Kante legt, faellt hier.
    const view = await feld();
    await bisUnterDieBlende(view, 2);
    const c = view.container.querySelector("canvas")!;
    const m = rechteck(view);
    expect(c.dataset.kernOrt, "die Zahl malt, aber die Leinwand nennt ihren Zustand nicht").toBeTruthy();
    const gehalten =
      m.x >= KANTEN_RAND_PX &&
      m.y >= KANTEN_RAND_PX &&
      m.x + m.w <= 1000 - KANTEN_RAND_PX &&
      m.y + m.h <= 700 - KANTEN_RAND_PX;
    expect(m.x, `die Zahl beginnt ueber der linken Kante: ${m.x}`).toBeGreaterThanOrEqual(KANTEN_RAND_PX);
    expect(m.y, `die Zahl beginnt ueber der oberen Kante: ${m.y}`).toBeGreaterThanOrEqual(KANTEN_RAND_PX);
    expect(m.x + m.w, `die Zahl endet ueber der rechten Kante: ${m.x + m.w} in 1000`).toBeLessThanOrEqual(1000 - KANTEN_RAND_PX);
    expect(m.y + m.h, `die Zahl endet ueber der unteren Kante: ${m.y + m.h} in 700`).toBeLessThanOrEqual(700 - KANTEN_RAND_PX);
    expect(
      c.dataset.kernOrt,
      `die Leinwand nennt "${c.dataset.kernOrt}", aber ihre eigne Lage haelt die vier Punkte${gehalten ? "" : " nicht"}`
    ).toBe(gehalten ? "frei" : "eng");
  });
});
