// Biss-Beleg fuer die Bildkante: baut PNGs mit bekanntem Tinten-Kasten — und zwar mit jeder der
// funf Zeilenfilter-Anweisungen, weil genau darin der alte Fehler steckte. Ein Leser, der die
// gefilterten Bytes fuer Pixel haelt, sieht in denselben Bildern einen Kasten, den es nicht gibt.
//
// Fahrt: node scripts/pruefe-png-kante.mjs      (Ausgang 0 = der Entsorger luegt nicht)

import zlib from "node:zlib";

const SIGNATUR = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const kreuze = (typ, daten) => {
  const kopf = Buffer.alloc(8);
  kopf.writeUInt32BE(daten.length, 0);
  kopf.write(typ, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(typ, "latin1"), daten])) >>> 0, 0);
  return Buffer.concat([kopf, daten, crc]);
};

/** Ein RGBA-Bild, Zeile fuer Zeile mit der angegebenen Anweisung gefiltert. */
function baue(w, h, pixel, anweisungen) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const roh = [];
  for (let y = 0; y < h; y++) {
    const anweisung = anweisungen[y % anweisungen.length];
    const vorher = y > 0 ? pixel(y - 1) : Buffer.alloc(w * 4);
    const jetzt = pixel(y);
    const zeile = [anweisung];
    for (let x = 0; x < w * 4; x++) {
      const links = x >= 4 ? jetzt[x - 4] : 0;
      const oben = vorher[x];
      const schraeg = x >= 4 ? vorher[x - 4] : 0;
      let pr = 0;
      if (anweisung === 1) pr = links;
      else if (anweisung === 2) pr = oben;
      else if (anweisung === 3) pr = (links + oben) >> 1;
      else if (anweisung === 4) {
        const p = links + oben - schraeg;
        const pa = Math.abs(p - links), pb = Math.abs(p - oben), pc = Math.abs(p - schraeg);
        pr = pa <= pb && pa <= pc ? links : (pb <= pc ? oben : schraeg);
      }
      zeile.push((jetzt[x] - pr) & 255);
    }
    roh.push(Buffer.from(zeile));
  }
  return Buffer.concat([SIGNATUR, kreuze("IHDR", ihdr), kreuze("IDAT", zlib.deflateSync(Buffer.concat(roh))),
    kreuze("IEND", Buffer.alloc(0))]);
}

/** Ein Bild aus Grund und einem rechten, oben liegenden Tinten-Feld. */
function feld(w, h, grund, tinte, x0, x1, y0, y1, durchsichtigePunkte = [], anweisungen = [0, 1, 2, 3, 4]) {
  return baue(w, h, (y) => {
    const zeile = Buffer.alloc(w * 4);
    for (let x = 0; x < w; x++) {
      const o = x * 4;
      zeile[o] = grund[0]; zeile[o + 1] = grund[1]; zeile[o + 2] = grund[2]; zeile[o + 3] = 255;
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) {
        zeile[o] = tinte[0]; zeile[o + 1] = tinte[1]; zeile[o + 2] = tinte[2];
      }
      if (durchsichtigePunkte.some(([px, py]) => px === x && py === y)) zeile[o + 3] = 0;
    }
    return zeile;
  }, anweisungen);
}

let fehl = 0;
const urteil = (name, gemessen, erwartet) => {
  const gleich = JSON.stringify(gemessen) === JSON.stringify(erwartet);
  if (!gleich) fehl += 1;
  console.log(`  ${gleich ? "ok  " : "FEHLT"} ${name}: gemessen ${JSON.stringify(gemessen)} (erwartet ${JSON.stringify(erwartet)})`);
};

const { umrandung } = await import("./helfer/png-kante.mjs");

// 1 — der ruhige Fall: ein Feld, das keine Kante beruehrt, in allen fuenf Filtern gemalt.
const a = umrandung(feld(120, 80, [32, 32, 32], [250, 250, 250], 30, 49, 20, 39));
urteil("Kasten im gefilterten Bild", [a.x0, a.y0, a.x1, a.y1], [30, 20, 49, 39]);
urteil("Tinte gezaehlt", a.traf, 20 * 20);
urteil("keine Kante beruehrt", a.beruehrt, []);
urteil("Grund aus dem ersten Pixel", a.grund, "#202020");
urteil("der Grund ist undurchsichtig", a.alpha, 255);

// 2 — Gegenprobe: dasselbe Bild, aber jede Zeile ungefiltert (Anweisung 0). Der Kasten muss
//     gleich bleiben. Ein Leser, der die Anweisung ueberslaege, koennte das nicht von Fall 1.
const b = umrandung(feld(120, 80, [32, 32, 32], [250, 250, 250], 30, 49, 20, 39, [], [0]));
urteil("Kasten ohne Filter", [b.x0, b.y0, b.x1, b.y1], [30, 20, 49, 39]);

// 3 — das Netz laeuft ueber die rechte Kante: genau der Befund, den der Pruefer melden soll.
const c = umrandung(feld(120, 80, [32, 32, 32], [250, 250, 250], 110, 119, 20, 39));
urteil("ueberlaufende Kante", c.beruehrt, ["rechts"]);

// 4 — ein durchsichtiger Punkt im undurchsichtigen Grund traegt Tinte, obwohl die Farbe gleich ist.
const d = umrandung(feld(60, 60, [32, 32, 32], [32, 32, 32], -5, -5, -5, -5, [[10, 20]]));
urteil("durchsichtiger Punkt", [d.x0, d.y0, d.x1, d.y1, d.traf], [10, 20, 10, 20, 1]);

// 5 — ein Nicht-Bild darf keinen Kasten erfinden.
urteil("leere Kette", umrandung(Buffer.alloc(0)).meldung, "kein Bild");

// 6 — "eine Kante beruehrt" braucht eine Zahl: ein einzelner Pixel ist nicht ein Haufen, der dort
//     abgeschnitten wird. Beides wird getrennt gemeldet, und beide Faelle werden gefahren.
urteil("kein Tintenstrich an einer Kante", Object.values(a.kantigen).map((k) => k.traf), [0, 0, 0, 0]);
urteil(" zwanzig Pixels auf der rechten Kante", [c.kantigen.rechts.traf, c.kantigen.rechts.spanne], [20, [20, 39]]);
const e = umrandung(feld(60, 60, [32, 32, 32], [250, 250, 250], 59, 59, 0, 0));
urteil("ein einzelner Pixel an zwei Kanten",
  [e.beruehrt, e.kantigen.oben.traf, e.kantigen.rechts.traf], [["oben", "rechts"], 1, 1]);

console.log(fehl ? `  ${fehl} Biss-Pruefung(en) fehlgeschlagen` : "  der Entsorger liest gefilterte Zeilen richtig");
process.exit(fehl ? 1 : 0);
