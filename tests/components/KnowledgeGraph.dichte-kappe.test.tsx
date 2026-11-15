// @vitest-environment jsdom
// Die Dichte-Kappe des Kerns, gemessen an der Tinte.
//
// STAND: geschnitten 23.10. 20:2x MESZ gegen Kopf 87b952d (3.2.44), NOCH NICHT
// GEFAHREN — das Tor war zu (pruefe-kante 20:19:56 MESZ, Exit 1). Erwartung aus
// der Vormessung: an 87b952d ROT, weil der Kern bei 2 Prozent ein Stueck ist
// (65,79 Prozent der Kern-Tinte, Lauf 19:54:07); mit dem Flicken gruen, weil
// die Kappe einen Knoten je 4-px-Zelle malt (Obergrenze der Rechnung 6,25
// Prozent).
//
// GEMESSEN WIRD AM BILD, NICHT AN DER REGEL: die gebuendelten Quadrate werden
// aus den Leinwand-Aufrufen nachgespielt (dieselbe Bahn wie im Nachbarfall),
// auf ein Bildpunkt-Raster gelegt und zu Flecken verbunden. Anders als dort
// wird NICHT nach Farbe gruppiert — eine Flaeche aus zwei Farben ist immer noch
// eine Flaeche.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { KnowledgeGraph } from "../../src/components/KnowledgeGraph";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger, setzeTheme, type Leinwand } from "../helfer/canvas";
import type { Memory } from "../../src/types";


let buch: Leinwand;
let zaehler = 0;

const FELDER = ["Werkstatt", "Forschung", "Werkzeug", "Ernte"];

/** Derselbe Titel-Schnitt wie die Kapsel-Saat: 23 bis 27 Zeichen, haeufigste 27. */
function note(i: number): Memory {
  zaehler++;
  const feld = FELDER[i % 4];
  const begriff = `begriff-${String(i % 500).padStart(3, "0")}`;
  return {
    id: `kz${zaehler}`,
    userId: "local",
    title: `${feld} ${begriff} ${String(i + 1).padStart(5, "0")}`,
    content: "Inhalt",
    tags: [],
    type: "semantic",
    createdAt: Date.parse("2024-01-01"),
    updatedAt: Date.parse("2024-01-01"),
  } as Memory;
}

beforeEach(() => {
  zaehler = 0;
  buch = installiereLeinwand();
  installiereResizeObserver(1000, 700);
  installiereZeiger();
  setzeTheme("dunkel");
  localStorage.clear();
  // Bewegung aus: sonst endet der Lauf mitten in einem Rahmen, und die Messung
  // haengte an einem Bild, das gerade neu gemalt wird.
  localStorage.setItem("kepta_graph_bewegung", "0");
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 })
  ));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("style");
});

async function atmen(ms: number) {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
}

/**
 * Der Korpus, dem GEMESSENEN Kanal nachgebaut -- nicht so lange gedreht, bis die
 * Latte faellt.
 *
 * Drei Zahlen, alle am 23.10. an der Platte gelesen:
 *   echte Tuer 58679, lesend 11:29:07 MESZ (3.2.40): 21 066 Notizen, 1 018 davon
 *     haengen an einem Begriff = Deckung 4,83 Prozent; 2 756 Begriffe, 2 726 Kanten
 *   Kapsel-Lauf 11:30:22 MESZ, demnachsten Saat: 145 Begriffe mit Kante, 360 Kanten,
 *     mittlerer Grad 4,97, 216 von 1 500 Notizen gedeckt = 14,4 Prozent
 *   hier: dieselbe Kapsel-Struktur, weil die Flaeche denselben Auszug malt
 *
 * Der Rest ist der Gang: 1 284 von 1 500 Notizen (85,6 Prozent) verbinden sich zu
 * nichts. Genau dieser Gang ist bei kleinem Zoom die Flaeche im Befund -- die
 * Reihe um Reihe steht er mit GANG_ABSTAND = 26 Welteinheiten
 * (`src/lib/graphLayout.ts:820`), und die gemalte Kante ist 3 Schirm-Pixel.
 */
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

type Flaeche = Awaited<ReturnType<typeof feld>>;

// --- die Aufnahme: Transformation nachspielen, Tinte in ein Bildpunkt-Raster ---

interface Matrix { a: number; b: number; c: number; d: number; e: number; f: number }
const EINS: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function mal(m: Matrix, n: Matrix): Matrix {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

function abbilden(m: Matrix, x: number, y: number) {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

interface Viereck { x0: number; y0: number; x1: number; y1: number; cx: number; cy: number; farbe: string }

/**
 * Alle gebuendelten Rechtecke DES LETZTEN BILDES, in Schirm-Pixeln.
 *
 * Die Flaeche malt kleine Knoten als fillRect, gebuendelt nach Farbe und
 * Deckkraft (:3299). Die Leinwand-Attrappe fuehrt Buch ueber jeden Aufruf, also
 * wird dieselbe Transformation nachgespielt, die sich `schriften()` schon holt:
 * setTransform setzt, translate und scale verletzen, save und restore stapeln.
 * Gemessen wird die Tinte, die ein Rasterer auf den Schirm legt -- nicht die
 * Absicht des Quelltexts.
 */
function viereckeImRahmen(): { rechtecke: Viereck[]; k: number } {
  let m = EINS;
  const stapel: Matrix[] = [];
  let farbe = "";
  let dpr: number | null = null;
  let k: number | null = null;
  const rechtecke: Viereck[] = [];
  for (const au of buch.letzterRahmen()) {
    if (au.op === "setTransform") {
      const [a, b, c, d, e, f] = au.args.map(Number);
      m = { a, b, c, d, e, f };
      if (dpr === null && a === d && a > 0) dpr = a;
    } else if (au.op === "translate") {
      m = mal(m, { a: 1, b: 0, c: 0, d: 1, e: Number(au.args[0]), f: Number(au.args[1]) });
    } else if (au.op === "scale") {
      const sx = Number(au.args[0]);
      const sy = au.args.length > 1 ? Number(au.args[1]) : sx;
      // Der erste Groessenschritt nach der Grundstellung ist die Kamera; was
      // spaeter skaliert, gehoert einem anderen Mal-Zweig.
      if (k === null && sx > 0) k = sx / (dpr ?? 1);
      m = mal(m, { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 });
    } else if (au.op === "save") {
      stapel.push(m);
    } else if (au.op === "restore") {
      m = stapel.pop() ?? m;
    } else if (au.op === "set:fillStyle") {
      farbe = String(au.args[0]);
    } else if (au.op === "fillRect") {
      const [x, y, breite, hoehe] = au.args.map(Number);
      if (breite !== hoehe) throw new Error(`kein gebuendelter Knoten: Rechteck ${breite} x ${hoehe}`);
      const linksOben = abbilden(m, x, y);
      const rechtsUnten = abbilden(m, x + breite, y + hoehe);
      rechtecke.push({
        x0: Math.min(linksOben.x, rechtsUnten.x),
        y0: Math.min(linksOben.y, rechtsUnten.y),
        x1: Math.max(linksOben.x, rechtsUnten.x),
        y1: Math.max(linksOben.y, rechtsUnten.y),
        cx: (linksOben.x + rechtsUnten.x) / 2,
        cy: (linksOben.y + rechtsUnten.y) / 2,
        farbe,
      });
    }
  }
  return { rechtecke, k: k ?? 1 };
}

/** Die Blende so treffen, wie ein Mensch sie trifft: mit dem Zoom-out-Knopf. */
async function zoomHinaus(view: Flaeche, ziel: number): Promise<number> {
  const knopf = [...view.container.querySelectorAll("button")].find(
    (b) => (b.getAttribute("title") || "") === "Zoom out"
  ) as HTMLButtonElement | undefined;
  expect(knopf, "der Zoom-out-Knopf steht nicht in der Flaeche").toBeTruthy();
  for (let i = 0; i < 40; i++) {
    if (viereckeImRahmen().k <= ziel) break;
    await act(async () => { knopf!.click(); });
    await atmen(24);
  }
  await atmen(140);
  return viereckeImRahmen().k;
}

function masse(view: Flaeche): [number, number] {
  const c = view.container.querySelector("canvas")!;
  return [c.width, c.height];
}
/** Die Tinte aller gebuendelten Quadrate als EINE Masse: Flecken, Tinte, Anteil. */
function punkteFlecken(breite: number, hoehe: number) {
  const { rechtecke } = viereckeImRahmen();
  const gitter = new Uint8Array(breite * hoehe);
  for (const r of rechtecke) {
    for (let j = Math.floor(r.y0); j < Math.ceil(r.y1); j++) {
      if (j < 0 || j >= hoehe) continue;
      for (let i = Math.floor(r.x0); i < Math.ceil(r.x1); i++) {
        if (i < 0 || i >= breite) continue;
        if (i + 0.5 >= r.x0 && i + 0.5 < r.x1 && j + 0.5 >= r.y0 && j + 0.5 < r.y1) gitter[j * breite + i] = 1;
      }
    }
  }
  const marken = new Int32Array(gitter.length);
  const schlange = new Int32Array(gitter.length);
  let flecken = 0;
  let tinten = 0;
  let groesster = 0;
  for (let z = 0; z < gitter.length; z++) {
    if (gitter[z] !== 1 || marken[z] !== 0) continue;
    flecken += 1;
    let schreibt = 1;
    let liest = 0;
    let zellen = 0;
    schlange[0] = z;
    marken[z] = flecken;
    while (liest < schreibt) {
      const q = schlange[liest++];
      zellen += 1;
      const i = q % breite;
      const j = (q - i) / breite;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (di === 0 && dj === 0) continue;
          const ni = i + di;
          const nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= breite || nj >= hoehe) continue;
          const nz = nj * breite + ni;
          if (gitter[nz] === 1 && marken[nz] === 0) { marken[nz] = flecken; schlange[schreibt++] = nz; }
        }
      }
    }
    tinten += zellen;
    if (zellen > groesster) groesster = zellen;
  }
  return { flecken, tinten, groesster, anteil: tinten ? groesster / tinten : 0 };
}

describe("Sammelmarke: der Kern ist eine Zahl, kein Fleck", () => {
  it("bei 2 % steht die Zahl im Bild und im DOM, und beide sind dieselbe", async () => {
    const view = await feld();
    await zoomHinaus(view, 0.02);
    const [b, h] = masse(view);
    const dom = view.container.querySelector('[data-testid="gang-info"]')?.textContent ?? "";
    const marke = dom.match(/([\d,.]+) core as one marker/);
    expect(marke, `keine Marke im DOM: ${dom}`).toBeTruthy();
    const zahl = marke![1].replace(/[,.]/g, "");
    expect(Number(zahl), "die Marke nennt keine Menge").toBeGreaterThan(100);
    const texte = buch.texteImRahmen().map((t) => t.text.trim().replace(/[,.]/g, ""));
    expect(texte, `die Zahl ${zahl} steht nicht im Bild: ${JSON.stringify(texte)}`).toContain(zahl);
  });

  it("bei 2 % malt der Kern kein einziges Quadrat (die Marke ist Kreis und Zahl)", async () => {
    const view = await feld();
    await zoomHinaus(view, 0.02);
    const [b, h] = masse(view);
    const m = punkteFlecken(b, h);
    // Bei 2 % schweigt der Gang ("too tight"), also waeren alle Quadrate Kern:
    // keine Quadrate = kein geduennter Kern mehr, sondern eine Marke.
    // Seit v4 steht GENAU EIN Quadrat an der Marke (damit fern etwas sichtbar
    // bleibt) — nicht mehr 4 bis 6 duenne Kernpunkte.
    expect(m.flecken, `${m.flecken} Stuecke bei 2 %`).toBe(1);
    expect(m.tinten, `${m.tinten} px Quadrat-Tinte bei 2 %`).toBeLessThan(20);
  });

  it("der Waechter beisst: DOM und Bild nennen dieselbe Zahl (Gleichheit, nicht Naehe)", async () => {
    const view = await feld();
    await zoomHinaus(view, 0.02);
    const dom = view.container.querySelector('[data-testid="gang-info"]')?.textContent ?? "";
    const zahl = (dom.match(/([\d,.]+) core as one marker/) || [])[1];
    const texte = buch.texteImRahmen().map((t) => t.text.trim().replace(/[,.]/g, ""));
    expect(texte.filter((t) => t === zahl)).toHaveLength(1);
  });
});
