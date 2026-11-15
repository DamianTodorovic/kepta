// @vitest-environment jsdom
// #102 -- der Gang wird bei kleinem Zoom zu einer Flaeche, gemessen an der Tinte.
//
// STAND: dieser Fall steht an der AUSGELIEFERTEN Fassung 3.2.40 (Kopf 87ec21e,
// app.asar 49 099 436 B, mtime 23.10. 10:58:13 MESZ) in der eignen Kratz-Kopie
// /tmp/p1-3240. Die Leitung hat 11:15 MESZ Umriss 2 (Lichten) als Heilungsrichtung
// gesetzt; dieser Fall ist die Latte, die der Koerper gruen machen muss.
//
// EIGENE BERICTIGUNG zuerst. Der Nachtlauf 22:32 MESZ meldete "die Tinte aller
// Punkte in 103 x 105 Schirm-Pixeln" und las das als den blauen Brei. Das war
// eine HUB-MASSSE meiner eignen Saat: 8 Megabegriffe, mittlerer Begriff-Grad
// 50,63 (Kapsel, lesend gemessen 11:19:52 MESZ). Der echte Bestand vernetzt
// anders -- Tuer 58679, 3.2.40, lesend 11:29:07 MESZ: 21 066 Notizen, davon 1 018
// an einem Begriff = Deckung 4,83 Prozent; 2 756 Begriffe, 2 726 Kanten, in der
// Tuer-Auskunft 500 Begriffe mit 1 448 Kanten, mittlerer Grad 5,79. Die Masse,
// die ein Mensch bei wenig Zoom sieht, ist also der GANG: die 95 Prozent Notizen,
// die an nichts haengen. Die Saat dieses Falls folgt diesem Kanal, nicht dem
// Wunschbild.
//
// URSACHE, an den gelieferten Zeilen gelesen -- weder die Kraft noch die
// Fuellfarbe, sondern eine Untergrenze auf dem Schirm ohne Deckel gegen die Reihe:
//   src/lib/graphLayout.ts:820  GANG_ABSTAND = 26
//     Der Reihenabstand des Gangs, in WELTEINHEITEN; er geht nicht mit dem Zoom.
//   src/components/KnowledgeGraph.tsx:983  MIN_KNOTEN_PX = 1.5
//   src/components/KnowledgeGraph.tsx:3155 const rr = Math.max(rrBasis, MIN_KNOTEN_PX / t.k)
//     Eine Untergrenze AUF DEM SCHIRM, durch die Division durch t.k in Welteinheiten
//     zurueckgerechnet: bei k = 0,1 ist sie 15 Welteinheiten, bei k = 0,02 ist 75.
//   src/components/KnowledgeGraph.tsx:998  KLEIN_AB_PX = 2.5
//   src/components/KnowledgeGraph.tsx:3180 und :3186 (sammeln), :3297 (fillRect je Punkt)
//     Unter 2,5 Schirm-Pixeln malt die Buendelung ein Quadrat von 2 * 1,5 = 3 px
//     Kante -- 9 px^2 Tinte je Punkt statt der 7,1 px^2 der Scheibe.
//
// DIE GRENZE, gerechnet und gemessen: zwei Quadrate der Kante 3 px hoeren auf,
// getrennt zu sein, wenn ihr Chebyshev-Abstand (max(|dx|,|dy|) -- die Metrik, in
// der achsenparallele Quadrate sich beruehren) unter 3 px plus ein Pixel
// Rasterabgleich faellt. Der Gang steht mit 26 Welteinheiten Reihenabstand, also:
//   kante 4 px / GANG_ABSTAND 26  ->  k = 0,154
// Gemessen an DIESEM Korpus, eigner Lauf 11:35:56 MESZ, Leinwand 1 000 x 700,
// Punkte / allein / groesster Fleck / engster Chebyshev-Abstand:
//   k 0,156:  600 /  600 /   1 / 4,06 px   (getrennt, ueber der Linie)
//   k 0,125:  600 /  216 /  16 / 3,25 px   (Verschmelzung beginnt, unter der Linie)
//   k 0,100:  600 /  208 / 384 / 2,60 px   (der ganze gemalte Gang = EIN Fleck)
//   k 0,033:  600 /    1 / 384 / 0,85 px
// Die Vorhersagelinie 0,154 faellt zwischen den gemessenen 0,156 und 0,125.
//
// LATTE, entschieden, weil: "gar keine Ueberlappung" waere die falsche Forderung.
// Die Untergrenze wurde gebaut, damit ein Feld von 25 000 Knoten bei 4 % nicht zu
// Staub zerfaellt (:3147-3153); wer sie streicht, holt den schwarzen Schirm
// zurueck. Was das Bild leisten muss, ist Zaehlbarkeit: die Punkte sind eine
// Menge, nicht eine Flaeche. Also muss mindestens die Haelfte der gemalten Punkte
// ein eigenes Tintenstueck behalten -- ein Fleck derselben Farbe ohne zweiten
// Punkt. Die Flaeche lichtet ihren Gang schon (384 Zeilen je Seite, "page 1 of 2"
// steht im DOM); diese Latte prueft, ob das Lichten reicht.
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

interface Befund {
  k: number;
  punkte: number;
  kantePx: number;
  tintenPix: number;
  flecken: number;
  allein: number;
  groesster: number;
  engsterAbstandPx: number;
  dichteWelt: number;
  inhaltBreite: number;
  inhaltHoehe: number;
}

/**
 * Die Tinte einer Farbe in ein Raster von Bildpunkten gesetzt und zu Flecken
 * verbunden -- 8 Nachbarn, also auch diagonal beruehrend, denn so liest ein
 * Mensch das Bild als ein Stueck. Ein Punkt zaehlt als allein, wenn sein Fleck
 * keinen zweiten Punkt traegt.
 */
function vermessen(breite: number, hoehe: number): Befund {
  const { rechtecke, k } = viereckeImRahmen();

  const nachFarbe = new Map<string, Viereck[]>();
  for (const r of rechtecke) {
    const liste = nachFarbe.get(r.farbe);
    if (liste) liste.push(r);
    else nachFarbe.set(r.farbe, [r]);
  }

  let flecken = 0;
  let tintenPix = 0;
  let allein = 0;
  let groesster = 0;
  for (const liste of nachFarbe.values()) {
    const gitter = new Uint8Array(breite * hoehe);
    for (const r of liste) {
      for (let j = Math.floor(r.y0); j < Math.ceil(r.y1); j++) {
        if (j < 0 || j >= hoehe) continue;
        for (let i = Math.floor(r.x0); i < Math.ceil(r.x1); i++) {
          if (i < 0 || i >= breite) continue;
          if (i + 0.5 >= r.x0 && i + 0.5 < r.x1 && j + 0.5 >= r.y0 && j + 0.5 < r.y1) {
            gitter[j * breite + i] = 1;
          }
        }
      }
    }

    const marken = new Int32Array(gitter.length);
    const schlange = new Int32Array(gitter.length);
    const punkteProFleck: number[] = [];
    let marke = 1;
    for (let z = 0; z < gitter.length; z++) {
      if (gitter[z] !== 1 || marken[z] !== 0) continue;
      let schreibt = 1;
      let liest = 0;
      schlange[0] = z;
      marken[z] = marke;
      let zellen = 0;
      while (liest < schreibt) {
        const zelle = schlange[liest++];
        zellen++;
        const i = zelle % breite;
        const j = (zelle - i) / breite;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            if (di === 0 && dj === 0) continue;
            const ni = i + di;
            const nj = j + dj;
            if (ni < 0 || nj < 0 || ni >= breite || nj >= hoehe) continue;
            const nz = nj * breite + ni;
            if (gitter[nz] === 1 && marken[nz] === 0) {
              marken[nz] = marke;
              schlange[schreibt++] = nz;
            }
          }
        }
      }
      flecken++;
      tintenPix += zellen;
      punkteProFleck[marke] = 0;
      marke++;
    }

    for (const r of liste) {
      const i = Math.round(r.cx);
      const j = Math.round(r.cy);
      if (i < 0 || j < 0 || i >= breite || j >= hoehe) continue;
      const zelle = j * breite + i;
      if (gitter[zelle] !== 1) continue;
      const treffer = marken[zelle];
      if (treffer > 0) punkteProFleck[treffer]++;
    }

    for (let marke2 = 1; marke2 < punkteProFleck.length; marke2++) {
      if (punkteProFleck[marke2] === 1) allein++;
      if (punkteProFleck[marke2] > groesster) groesster = punkteProFleck[marke2];
    }
  }

  const kanten = rechtecke.map((r) => r.x1 - r.x0);
  const kante = kanten.length ? Math.max(...kanten) : 0;

  // Der engste Mittenabstand und der Dichte-Abstand: die Weltflaeche, die die
  // Punkte unter sich teilen, als Seitenlaenge eines Quadrats. Dasselbe Mass, das
  // am Ausloeser-Bestand gerechnet ist (103 x 105 Schirm-Pixel bei k = 0,1 und
  // 1 500 Notizen -> 26,9 Einheiten).
  // Der engste Mittenabstand, in der Metrik, in der Quadrate sich beruehren:
  // Chebyshev (max(|dx|,|dy|)), nicht euklidisch. Zwei Quadrate von 3,00 px Kante
  // sind bei einem euklidischen Abstand von 4,30 px langst ein Fleck, wenn der
  // Abstand schiefwinklig liegt (dx 2,9 / dy 3,2) -- die euklidische Kante haette
  // den Befund bestritten, die Chebyshev-Kante bestaetigt ihn.
  let engster = Number.POSITIVE_INFINITY;
  for (let a = 0; a < rechtecke.length; a++) {
    for (let b = a + 1; b < rechtecke.length; b++) {
      const cheb = Math.max(
        Math.abs(rechtecke[a].cx - rechtecke[b].cx),
        Math.abs(rechtecke[a].cy - rechtecke[b].cy)
      );
      if (cheb < engster) engster = cheb;
    }
  }
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const r of rechtecke) {
    if (r.x0 < bx0) bx0 = r.x0;
    if (r.y0 < by0) by0 = r.y0;
    if (r.x1 > bx1) bx1 = r.x1;
    if (r.y1 > by1) by1 = r.y1;
  }
  const inhaltBreite = rechtecke.length ? bx1 - bx0 : 0;
  const inhaltHoehe = rechtecke.length ? by1 - by0 : 0;
  const flaecheWelt = rechtecke.length > 0 && k > 0
    ? (inhaltBreite / k) * (inhaltHoehe / k) / rechtecke.length
    : 0;

  return {
    k,
    punkte: rechtecke.length,
    kantePx: kante,
    tintenPix,
    flecken,
    allein,
    groesster,
    engsterAbstandPx: Number.isFinite(engster) ? engster : 0,
    dichteWelt: Math.sqrt(Math.max(0, flaecheWelt)),
    inhaltBreite,
    inhaltHoehe,
  };
}

function bericht(b: Befund, w: number, h: number) {
  return JSON.stringify({
    zoom: Number(b.k.toFixed(3)),
    punkte: b.punkte,
    allein: b.allein,
    flecken: b.flecken,
    groessterFleck: b.groesster,
    kantePx: Number(b.kantePx.toFixed(2)),
    engsterAbstandPx: Number(b.engsterAbstandPx.toFixed(2)),
    dichteWelt: Number(b.dichteWelt.toFixed(1)),
    inhalt: `${Math.round(b.inhaltBreite)}x${Math.round(b.inhaltHoehe)}`,
    tintenPix: b.tintenPix,
    leinwand: `${w}x${h}`,
  });
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

describe("#102: Punkte duerfen nicht als eine Flaeche enden", () => {
  /** Was die Flaeche ueber ihren eignen Gang sagt, aus dem DOM, nicht gerechnet. */
  function gangSatz(view: Flaeche): { zahl: number; satz: string | null } {
    const leib = (view.container.textContent || "").replace(/\s+/g, " ");
    const treff = leib.match(/([\d.,]+)\s*(?:notes|Notizen)\s+connect to nothing/i);
    return { zahl: treff ? Number(treff[1].replace(/[^\d]/g, "")) : -1, satz: treff ? treff[0] : null };
  }

  it("Kontrolle: bei 15,6 % trennt dasselbe Messzeug alle Punkte", async () => {
    // Ueber der gerechneten Linie (0,154): dieselbe Sonde, derselbe Korpus, dasselbe
    // Bild -- und jeder Punkt steht fuer sich. Ohne diesen Fall waere die Latte unten
    // ein Dauer-Rot, das nichts gewinnen kann.
    const view = await feld();
    const [w, h] = masse(view);
    const k = await zoomHinaus(view, 0.16);
    expect(k, `die Blende ist nicht erreicht, gemessen ${k}`).toBeLessThanOrEqual(0.16);
    const b = vermessen(w, h);
    expect(b.punkte, "das Messzeug sieht keine gebuendelten Punkte -- es malt nichts").toBeGreaterThan(500);
    expect(b.allein, `die Sonde selbst trennt nichts: ${bericht(b, w, h)}`).toBeGreaterThanOrEqual(
      Math.ceil(b.punkte / 2)
    );
  }, 180_000);

  it("Deckungs-Kontrolle: der Gang steht im Bild, und die Flaeche sagt seine Zahl", async () => {
    // Die Latte unten gilt dem Gang, nicht einer Punktwolke nach Wahl. Also muss
    // der Gang da sein, und seine Zahl muss aus dem Mund der Flaeche kommen -- der
    // Satz im DOM ist derselbe Kanal, den das Objekt um 11:32:32 MESZ meldet
    // ("1 284 notes connect to nothing in this picture" steht auch hier).
    const view = await feld();
    const [w, h] = masse(view);
    await zoomHinaus(view, 0.1);
    const gang = gangSatz(view);
    const b = vermessen(w, h);
    expect(gang.zahl, `die Flaeche nennt keinen Gang: ${bericht(b, w, h)}`).toBeGreaterThan(1000);
    // Die Flaeche lichtet den Gang auf 384 Zeilen je Seite ("page 1 of 2") und
    // lichtet davon bei diesem Zoom jedes zweite Glied -- gemalt werden also
    // 216 Kern-Punkte plus 96 Gang-Punkte.
    expect(b.punkte, `es stehen zu wenige Punkte im Bild: ${bericht(b, w, h)}`).toBeGreaterThan(250);
    expect(b.kantePx, `die gemalte Kante ist nicht die der Buendelung: ${bericht(b, w, h)}`).toBeCloseTo(3, 6);
  }, 180_000);

  it("die Lichtung nennt ihre beiden Zahlen im Bild, und die Tinte zahlt mit", async () => {
    // Bedingung der Leitung um 11:15 MESZ: die gezogene Zahl und die nicht
    // gezogene stehen im Bild, nicht nur im Test. Geprueft wird der Ubertrag:
    // was der Satz auf der Leinwand verspricht, muss die Tinte halten.
    const view = await feld();
    const [w, h] = masse(view);
    await zoomHinaus(view, 0.16);
    const voll = vermessen(w, h);
    await zoomHinaus(view, 0.1);
    const b = vermessen(w, h);
    const satz = buch.texteImRahmen().find((t) => /painted at this zoom/i.test(t.text));
    expect(satz, `kein Satz im Bild nennt die Lichtung: ${bericht(b, w, h)}`).toBeTruthy();
    const treff = /(\d[\d,.]*)\s*painted at this zoom/.exec(satz!.text);
    const treff2 = /(\d[\d,.]*)\s*counted, not painted/.exec(satz!.text);
    expect(treff, `der Satz nennt die gezogene Zahl nicht: ${satz!.text}`).toBeTruthy();
    expect(treff2, `der Satz nennt die nicht gezogene Zahl nicht: ${satz!.text}`).toBeTruthy();
    const gemalt = Number(treff![1].replace(/[^\d]/g, ""));
    const nichtGemalt = Number(treff2![1].replace(/[^\d]/g, ""));
    // Zwei Kanale, eine Rechnung: was an Tinte fehlt, muss der Satz nennen.
    expect(voll.punkte - b.punkte, `Satz und Tinte reden aneinander vorbei: ${satz!.text} gegen ${bericht(b, w, h)}`)
      .toBe(nichtGemalt);
    expect(gemalt, `die Lichtung malt nichts: ${satz!.text}`).toBeGreaterThan(0);
    expect(b.punkte, `es wird mehr gemalt als vorher: ${bericht(b, w, h)}`).toBeLessThan(voll.punkte);
  }, 300_000);

  it("unter der sichtbaren Schwelle malt die Flaeche keinen Klecks, sie sagt die Zahl", async () => {
    // Was dieser Fall HAELT: der Gang tritt ab und nennt seine Zahl. Was er
    // nicht haelt und deshalb gemeldet ist: bei 2 % verschmilzt auch der KERN
    // (216 Punkte, engster Chebyshev-Abstand 0,70 px, ein Fleck) -- dieselbe
    // Rechnung, ein andrer Abstand: der Kern steht mit rund 85 Welteinheiten,
    // seine Linie faellt bei k = 4 / 85 = 0,047. Das ist der Folgeschlag, nicht
    // dieser Koerper (Brief nennt den Gang).
    const view = await feld();
    const [w, h] = masse(view);
    const k = await zoomHinaus(view, 0.02);
    expect(k, `die Blende ist nicht erreicht, gemessen ${k}`).toBeLessThanOrEqual(0.021);
    const b = vermessen(w, h);
    const satz = buch.texteImRahmen().find((t) => /connect to nothing/i.test(t.text));
    expect(satz, `kein Gang-Satz im Bild: ${bericht(b, w, h)}`).toBeTruthy();
    expect(
      satz!.text,
      `bei ${k} wird der Gang noch gemalt, obwohl seine Seite ein Klecks ist: ${bericht(b, w, h)}`
    ).toMatch(/too tight to paint at this zoom/);
    const treff = /(\d[\d,.]*)\s*counted, not painted/.exec(satz!.text);
    expect(treff, `der Satz nennt die nicht gezogene Zahl nicht: ${satz!.text}`).toBeTruthy();
    expect(Number(treff![1].replace(/[^\d]/g, "")), `der Satz nennt nicht die Seitengroesse: ${satz!.text}`)
      .toBe(384);
    // Die Seite des Gangs hat 384 Plaetze; gemalt werden deutlich weniger --
    // der Gang steht also nicht mehr als Raster auf dem Schirm.
    expect(b.punkte, `der Gang wird noch gemalt: ${bericht(b, w, h)}`).toBeLessThan(384);
  }, 300_000);

  it("bei 10 % endet die Haelfte der Punkte nicht allein in ihrem Tintenstueck", async () => {
    const view = await feld();
    const [w, h] = masse(view);
    const k = await zoomHinaus(view, 0.1);
    expect(k, `die Blende ist nicht erreicht, gemessen ${k}`).toBeLessThanOrEqual(0.11);
    const b = vermessen(w, h);
    expect(b.punkte, "das Messzeug sieht keine gebuendelten Punkte -- es malt nichts").toBeGreaterThan(250);
    expect(
      b.allein,
      `die Punkte enden als Flaeche, nicht als Menge: ${bericht(b, w, h)}`
    ).toBeGreaterThanOrEqual(Math.ceil(b.punkte / 2));
  }, 180_000);
});
