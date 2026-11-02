// Die Kante des Netzes, gemessen am exportierten Bild — nicht am Gefuehl.
//
// Ein PNG speichert seine Zeilen gefiltert (Sub, Up, Average, Paeth). Rohe Bytes aus dem
// IDAT-Strom sind deshalb keine Pixel: bis 31.10. abend hat der Fenster-Pruefer sie roh gelesen
// und einen Tinten-Kasten gemeldet, den das Bild nicht hergab. Deshalb steht die Entsorgung
// hier einmal, ausserhalb des Pruefers, und wird von einem Biss-Beleg gegen Synthetic Bilder mit
// bekanntem Kasten gefahren.
//
// Der Grund ist der erste Pixel des eignen Bildes. Was die Flaeche malt, wird gegen die Flaeche
// gemessen und nicht gegen eine vermutete Farbe.

import zlib from "node:zlib";

const KANTEN_TOLERANZ_PX = 1;
const TINTEN_ABSTAND = 24;

/** Zerlegt den Chunk-Strom und liefert die Bildflaeche als unfilterte Bytes. */
export function entpacke(png) {
  if (png.length < 32) return { meldung: "kein Bild" };
  let i = 8, w = 0, h = 0, tiefe = 8, farbe = 6, idat = Buffer.alloc(0);
  while (i + 8 <= png.length) {
    const laenge = png.readUInt32BE(i);
    const typ = png.slice(i + 4, i + 8).toString("latin1");
    const daten = png.slice(i + 8, i + 8 + laenge);
    i += 12 + laenge;
    if (typ === "IHDR") { w = daten.readUInt32BE(0); h = daten.readUInt32BE(4); tiefe = daten[8]; farbe = daten[9]; }
    else if (typ === "IDAT") idat = Buffer.concat([idat, daten]);
    else if (typ === "IEND") break;
  }
  if (!w || !h) return { meldung: "kein Bild" };
  const bpp = farbe === 6 ? 4 : farbe === 2 ? 3 : 1;
  if (tiefe !== 8 || (bpp !== 4 && bpp !== 3)) {
    return { meldung: `Bild nicht gelesen (Bit-Tiefe ${tiefe}, Farbtyp ${farbe})` };
  }
  const roh = zlib.inflateSync(idat);
  const mal = Buffer.alloc(w * h * bpp);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const anweisung = roh[pos]; pos += 1;
    const hin = y * w * bpp;
    for (let x = 0; x < w * bpp; x++) {
      const links = x >= bpp ? mal[hin + x - bpp] : 0;
      const oben = y > 0 ? mal[hin - w * bpp + x] : 0;
      const schraeg = (x >= bpp && y > 0) ? mal[hin - w * bpp + x - bpp] : 0;
      const wert = roh[pos + x];
      let v;
      if (anweisung === 0) v = wert;
      else if (anweisung === 1) v = wert + links;
      else if (anweisung === 2) v = wert + oben;
      else if (anweisung === 3) v = wert + ((links + oben) >> 1);
      else {
        const p = links + oben - schraeg;
        const pa = Math.abs(p - links), pb = Math.abs(p - oben), pc = Math.abs(p - schraeg);
        v = wert + (pa <= pb && pa <= pc ? links : (pb <= pc ? oben : schraeg));
      }
      mal[hin + x] = v & 255;
    }
    pos += w * bpp;
  }
  return { w, h, bpp, mal, farbe };
}

/** Die Umrandung aller Pixel, die nicht Grund sind, samt der freien Streifen an vier Seiten. */
export function umrandung(png) {
  const b = entpacke(png);
  if (b.meldung) return b;
  const g0 = b.mal[0], g1 = b.mal[1], g2 = b.mal[2];
  const kante = (x, y) => {
    const o = (y * b.w + x) * b.bpp;
    const durchsichtig = b.bpp === 4 && b.mal[o + 3] < 248;
    return durchsichtig || Math.max(Math.abs(b.mal[o] - g0), Math.abs(b.mal[o + 1] - g1), Math.abs(b.mal[o + 2] - g2)) > TINTEN_ABSTAND;
  };
  let x0 = b.w, y0 = b.h, x1 = -1, y1 = -1, traf = 0;
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      if (!kante(x, y)) continue;
      traf += 1;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  const grund = "#" + [g0, g1, g2].map((n) => n.toString(16).padStart(2, "0")).join("");
  const alpha = b.bpp === 4 ? b.mal[3] : 255;
  // "Eine Kante beruehrt" ist ein Urteil, das eine Zahl braucht: ein einzelner weichgezeichneter
  // Pixel in der ersten Zeile ist etwas anderes als ein Haufen, der dort abgeschnitten wird.
  // Gezaehlt wird deshalb pro Kante, wie viel ihrer Laenge wirklich Tinte traegt.
  const oben = []; const unten = []; const links = []; const rechts = [];
  for (let x = 0; x < b.w; x++) { if (kante(x, 0)) oben.push(x); if (kante(x, b.h - 1)) unten.push(x); }
  for (let y = 0; y < b.h; y++) { if (kante(0, y)) links.push(y); if (kante(b.w - 1, y)) rechts.push(y); }
  const spanne = (p) => (p.length ? [p[0], p[p.length - 1]] : null);
  const kantigen = {
    oben: { traf: oben.length, spanne: spanne(oben) },
    unten: { traf: unten.length, spanne: spanne(unten) },
    links: { traf: links.length, spanne: spanne(links) },
    rechts: { traf: rechts.length, spanne: spanne(rechts) }
  };
  // Die Kantenmarke (Punkt 1, Aufgabe 25) wird an ihrer DECKUNG erkannt, nicht an ihrem
  // Vorhandensein: ein Band malt ueber die ganze Laenge der Kante, abgeschnittene Kreise malen
  // nur an ein paar Stellen. Ein einzelner weicher Pixel ist deshalb noch keine Marke - gemessen
  // braucht die Marke mehr als neun Zehntel ihrer Kante. Die Marke sitzt eine Reihe INSERHALB,
  // weil der Grund dieses Bildes sein erstes Pixel ist: ein Band bei Zeile 0 wuerde den Grund
  // selbst austauschen und das ganze Bild zu Tinte erklaeren (gemessen 02.11. 06:17 am Biss-Fall).
  const bandMass = (seite) => {
    const laenge = seite === "oben" || seite === "unten" ? b.w : b.h;
    let ab = 0;
    for (let i = 0; i < laenge; i++) {
      const x = seite === "oben" || seite === "unten" ? i : seite === "links" ? 2 : b.w - 3;
      const y = seite === "oben" ? 2 : seite === "unten" ? b.h - 3 : i;
      if (kante(x, y)) ab += 1;
    }
    return laenge ? ab / laenge : 0;
  };
  const band = { oben: bandMass("oben"), unten: bandMass("unten"), links: bandMass("links"), rechts: bandMass("rechts") };
  const beruehrt = [
    y0 <= KANTEN_TOLERANZ_PX && "oben",
    y1 >= b.h - 1 - KANTEN_TOLERANZ_PX && "unten",
    x0 <= KANTEN_TOLERANZ_PX && "links",
    x1 >= b.w - 1 - KANTEN_TOLERANZ_PX && "rechts"].filter(Boolean);
  const freie = {
    oben: (y0 / b.h) * 100,
    unten: ((b.h - 1 - y1) / b.h) * 100,
    links: (x0 / b.w) * 100,
    rechts: ((b.w - 1 - x1) / b.w) * 100
  };
  return { w: b.w, h: b.h, x0, y0, x1, y1, traf, grund, alpha, beruehrt, freie, kantigen, band };
}
