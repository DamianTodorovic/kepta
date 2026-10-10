#!/usr/bin/env node
// KEPTA Design-Wache — Rechenerei über den Token-Werten in src/index.css.
// Kein Browser, kein Build. Sie misst, was in der Datei steht, und zwar so,
// wie der Browser es zusammensetzt: durchscheinende Flächen werden über ihren
// echten Ahnen gemischt (sonst lügen sie — D1 B.12 Punkt 5), und eine Linie
// wird gegen beide Nachbarn gerechnet.
//
// Schwellen aus audit-2026-10-09/D1-DESIGN-BENCHMARK.md Teil C:
//   Text              >= 4,5:1   (Apple HIG, alles bis 17 pt)
//   Flächen-Nachbarn  >= 1,3:1   (Z-01)
//   Kanten            >= 3:1     (WCAG 1.4.11)
//   Schrift           >= 11 px, <= 8 Stufen, keine halben Schritte (Z-04)
//   Icons             unterstes 14 px, kein Zeichen unter zwei Namen (Z-06)
//   var(--x)          jede Referenz hat eine Definition (D1-14)
//   Regeln            keine Deklaration außerhalb einer Regel (D1-14)
//
// Nutzung: node scripts/design-wache.mjs [--abschnitt flaechen|kanten|text|
//        seitenleiste|var|schrift|icons|css] [--leise]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSS_PFAD = path.join(REPO, "src/index.css");
const ICON_PFAD = path.join(REPO, "src/lib/icons.tsx");
const ICON_DATEN = path.join(REPO, "src/lib/kepta-icons.json");

const SCHWELLE = {
  text: 4.5,
  nachbar: 1.3,
  kante: 3.0,
  schriftpx: 11,
  stufen: 8,
  iconpx: 14,
};

// ---------------------------------------------------------------- CSS lesen

/** Kommentare entfernen, Zeilenzahl erhalten — Fundstellen bleiben gültig. */
function ohneKommentare(text) {
  return text.replace(/\/\*[^]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

/** Das Stylesheet: Regeln (mit @media-Kontext im Selektor) und die Waisen,
 *  also Deklarationen, die außerhalb jeder Regel stehen und verpuffen. */
function parse(text) {
  const Q = ohneKommentare(text);
  const zeileBei = (pos) => Q.slice(0, pos).split("\n").length;

  function klammerZu(offen) {
    let tief = 1;
    for (let i = offen + 1; i < Q.length; i++) {
      if (Q[i] === "{") tief++;
      else if (Q[i] === "}") { tief--; if (!tief) return i; }
    }
    return Q.length;
  }

  function dekl(von, bis) {
    const liste = [];
    let start = von;
    while (start < bis) {
      const sc = Q.indexOf(";", start);
      const wo = sc === -1 ? bis : sc;
      const stück = Q.slice(start, wo);
      if (!stück.includes("{")) {
        const m = stück.match(/^\s*([-a-zA-Z][-\w]*)\s*:\s*([\s\S]*)$/);
        if (m) {
          const einzug = stück.length - stück.trimStart().length;
          liste.push({ prop: m[1], wert: m[2].trim(), zeile: zeileBei(start + einzug) });
        }
      }
      start = wo + 1;
    }
    return liste;
  }

  const weisen = [];
  function blöcke(von, bis, medien) {
    const res = [];
    let i = von;
    let vor = "";
    const vorStart = () => i - vor.length;
    while (i < bis) {
      const c = Q[i];
      if (c === "{") {
        const sel = vor.trim().replace(/\s+/g, " ");
        const ende = klammerZu(i);
        if (/^@(media|supports|layer)/.test(sel)) res.push(...blöcke(i + 1, ende, sel));
        else if (!sel.startsWith("@")) {
          res.push({ selektor: (medien ? `${medien} :: ` : "") + sel, dekl: dekl(i + 1, ende) });
        }
        i = ende + 1; vor = ""; continue;
      }
      if (c === "}" || c === ";") {
        const stück = vor.trim();
        if (c === ";" && stück && !stück.startsWith("@") && stück.includes(":")) {
          const m = stück.match(/^([-a-zA-Z][-\w]*)\s*:\s*([\s\S]*)$/);
          if (m) {
            const einzug = vor.length - vor.trimStart().length;
            weisen.push({ prop: m[1], wert: m[2].trim(), zeile: zeileBei(vorStart() + einzug) });
          }
        }
        vor = ""; i++; continue;
      }
      vor += c; i++;
    }
    return res;
  }

  return { regeln: blöcke(0, Q.length, ""), weisen };
}

/** Alle Custom Properties, grouped nach Theme-Block. */
function tokens(regeln) {
  const map = new Map([["hell", new Map()], ["dunkel", new Map()]]);
  for (const r of regeln) {
    const sel = r.selektor;
    if (sel.includes("::")) continue; // keine Token in Medienblöcke ohne Weiteres
    const thema = /(^|,)\s*:root/.test(sel) ? "hell" : /(^|[, ])\.dark\b/.test(sel) ? "dunkel" : null;
    if (!thema) continue;
    for (const d of r.dekl) {
      if (!d.prop.startsWith("--")) continue;
      if (!map.get(thema).has(d.prop)) map.get(thema).set(d.prop, { wert: d.wert, zeile: d.zeile });
    }
  }
  return map;
}

// ---------------------------------------------------------------- Farben

const NAMED = { white: "#ffffff", black: "#000000", transparent: "rgba(0, 0, 0, 0)" };
const srgbLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const srgbGamma = (z) => (z <= 0.0031308 ? 12.92 * z : 1.055 * z ** (1 / 2.4) - 0.055);

/** OKLab → lineares sRGB (Björn Ottosson). */
function oklabToLinear(L, A, B) {
  const l_ = L + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = L - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = L - 0.0894841775 * A - 1.2914855480 * B;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

/** var(--x) und var(--x, fallback) auflösen — mit korrekter Klammertiefe. */
function loeseVars(v, themen, thema) {
  if (!v) return null;
  let out = String(v), sicher = 0;
  while (out.includes("var(") && sicher++ < 16) {
    const at = out.indexOf("var(");
    let tief = 1, j = at + 4;
    while (j < out.length && tief > 0) {
      if (out[j] === "(") tief++;
      else if (out[j] === ")") tief--;
      j++;
    }
    const innen = out.slice(at + 4, j - 1);
    const komma = splitTop(innen)[0];
    const name = komma.trim();
    const fallback = innen.slice(name.length + 1).trim();
    let wert = themen.get(thema)?.get(name)?.wert;
    if (wert === undefined && thema === "dunkel") wert = themen.get("hell")?.get(name)?.wert;
    if (wert === undefined) wert = fallback || undefined;
    if (wert === undefined) return null;
    out = out.slice(0, at) + wert + out.slice(j);
  }
  return out.includes("var(") ? null : out;
}

function splitTop(s) {
  const out = [];
  let tief = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(") tief++;
    else if (c === ")") tief--;
    else if (c === "," && tief === 0) { out.push(s.slice(start, i)); start = i + 1; }
  }
  out.push(s.slice(start));
  return out;
}

/** Ein Farbwert → {r,g,b,a}, r/g/b gamma-verschlüsseltes sRGB in 0..1, a in 0..1. */
function farbe(wert, themen, thema, tiefe = 0) {
  if (tiefe > 12 || !wert) return null;
  const v = (loeseVars(wert, themen, thema) ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  if (!v) return null;
  const benannt = NAMED[v];
  const s = benannt ?? v;

  if (/^#[0-9a-f]{3,8}$/.test(s)) {
    const h = s.slice(1);
    const teile = h.length <= 4 ? [...h].map((x) => x + x) : [...h.matchAll(/../g)].map((m) => m[0]);
    const Z = (i) => (teile[i] === undefined ? 1 : parseInt(teile[i], 16) / 255);
    return { r: Z(0), g: Z(1), b: Z(2), a: Z(3) };
  }
  let m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const t = splitTop(m[1]).flatMap((x) => x.split(/[\s,]+/)).filter(Boolean);
    const Z = (x) => (x.endsWith("%") ? (parseFloat(x) / 100) : parseFloat(x) / 255);
    const a = t[3] === undefined ? 1 : t[3].endsWith("%") ? parseFloat(t[3]) / 100 : parseFloat(t[3]);
    const c = { r: Z(t[0]), g: Z(t[1]), b: Z(t[2]), a };
    return [c.r, c.g, c.b].some(Number.isNaN) ? null : c;
  }
  m = s.match(/^hsla?\(([^)]+)\)$/);
  if (m) {
    const t = splitTop(m[1]).flatMap((x) => x.split(/[\s,]+/)).filter(Boolean);
    const a = t[3] === undefined ? 1 : parseFloat(t[3]);
    const [r, g, b] = hslToRgb(parseFloat(t[0]), parseFloat(t[1]) / 100, parseFloat(t[2]) / 100);
    return { r, g, b, a };
  }
  m = s.match(/^oklch\(([^)]+)\)$/);
  if (m) {
    const t = splitTop(m[1]).flatMap((x) => x.split(/[\s,/]+/)).filter(Boolean);
    const L = t[0].endsWith("%") ? parseFloat(t[0]) / 100 : parseFloat(t[0]);
    const C = t[1] === undefined || t[1] === "none" ? 0 : parseFloat(t[1]);
    const H = t[2] === undefined || t[2] === "none" ? 0 : parseFloat(t[2]);
    const a = t[3] === undefined ? 1 : parseFloat(t[3]);
    if (Number.isNaN(L)) return null;
    const hr = (H * Math.PI) / 180;
    const [lr, lg, lb] = oklabToLinear(L, C * Math.cos(hr), C * Math.sin(hr));
    return { r: srgbGamma(lr), g: srgbGamma(lg), b: srgbGamma(lb), a, ueber: [lr, lg, lb].some((z) => z < -0.0001 || z > 1.0001) };
  }
  m = s.match(/^color-mix\(\s*in\s+[\w-]+\s*,(.*)\)$/);
  if (m) {
    const [a1, a2] = splitTop(m[1]).map((x) => x.trim());
    const zerlege = (str) => {
      const pc = str.match(/(-?\d+(?:\.\d+)?)%$/);
      return { c: farbe(pc ? str.slice(0, pc.index) : str, themen, thema, tiefe + 1), anteil: pc ? parseFloat(pc[1]) / 100 : null };
    };
    const A = zerlege(a1), B = zerlege(a2);
    if (!A.c || !B.c) return null;
    let pa = A.anteil, pb = B.anteil;
    if (pa === null && pb === null) pa = pb = 1 / 2;
    else if (pa === null) pa = 1 - pb;
    else if (pb === null) pb = 1 - pa;
    const sum = pa + pb || 1;
    pa /= sum; pb /= sum;
    const k = (x, y) => x * pa + y * pb;
    return { r: k(A.c.r, B.c.r), g: k(A.c.g, B.c.g), b: k(A.c.b, B.c.b), a: k(A.c.a, B.c.a) };
  }
  return null;
}

/** Durchscheinende Farbe über einer Fläche mischen (Compositing in sRGB). */
function composite(fg, bg) {
  if (!fg) return null;
  if (fg.a >= 1) return { r: fg.r, g: fg.g, b: fg.b, a: 1 };
  if (!bg) return { r: fg.r, g: fg.g, b: fg.b, a: fg.a };
  const k = (c, d) => c * fg.a + d * (1 - fg.a);
  return { r: k(fg.r, bg.r), g: k(fg.g, bg.g), b: k(fg.b, bg.b), a: 1 };
}

const leuchtdichte = (c) => (c ? 0.2126 * srgbLinear(c.r) + 0.7152 * srgbLinear(c.g) + 0.0722 * srgbLinear(c.b) : null);

function kontrast(x, y) {
  const a = leuchtdichte(x), b = leuchtdichte(y);
  if (a === null || b === null) return null;
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/* Die Verhältnisse werden auf zwei Dezimalstellen gemeldet; ein exakt auf
   1,30 gelöster Wert kann durch die Rundung der oklch-Ausgabe bei 1,2997
   landen. Eine Toleranz von 0,005 ist unterhalb dessen, was ein Auge sieht,
   und oberhalb dessen, was die Rundung bewegt. */
const TOLERANZ = 0.005;
const hält = (k, ziel) => k !== null && k !== undefined && k + TOLERANZ >= ziel;

const dez = (n) => (n === null || n === undefined || Number.isNaN(n) ? "—" : n.toFixed(2).replace(".", ","));
const hex = (c) => "#" + [c.r, c.g, c.b].map((z) => Math.round(Math.max(0, Math.min(1, z)) * 255).toString(16).padStart(2, "0")).join("");

/* ============================================================
   DER GENERATOR — Linear-Regel: aus drei Variablen (Basis, Ton,
   Kontrast) wird die Leiter, nicht aus vierzig Hex-Werten.
   Die Leiter ist **verhältnisgleich**: jede Stufe ist das gleiche
   Kontrastverhältnis gegen den Vorgänger. Das ist der Grund, warum
   sie in beiden Themen aus derselben Regel kommt (D1-05: das helle
   Thema war bei Ebene 3 schwächer als das dunkle).

   Weil CSS kein pow() kann, wird die Regel hier gerechnet und als
   oklch() in die Datei geschrieben; die Wache prüft danach jeden
   Wert einzeln. Regeländerung = Generator laufen lassen, nicht
   pinseln.
   ============================================================ */

/** Leuchtdichte einer oklch-Farbe. */
const yVon = (L, C, H) => leuchtdichte(farbeVon(L, C, H));
function farbeVon(L, C, H) {
  const hr = (H * Math.PI) / 180;
  const [lr, lg, lb] = oklabToLinear(L, C * Math.cos(hr), C * Math.sin(hr));
  return { r: srgbGamma(lr), g: srgbGamma(lg), b: srgbGamma(lb), a: 1 };
}

/** die L, bei der die Farbe eine gegebene Leuchtdichte erreicht (gerichtete Suche). */
function LfuerY(zielY, C, H, von = 0, bis = 1) {
  for (let i = 0; i < 60; i++) {
    const mitte = (von + bis) / 2;
    if (yVon(mitte, C, H) < zielY) von = mitte; else bis = mitte;
  }
  return (von + bis) / 2;
}


/** sRGB → OKLab. Der Generator sampelt damit die bestehenden Marken-Töne:
 *  Ton (C/H) bleibt, nur die Lichtstufe wird neu gerechnet. */
function oklabVon(c) {
  const [R, G, B] = [c.r, c.g, c.b].map(srgbLinear);
  const l = 0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B;
  const m = 0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B;
  const s = 0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B;
  const [l_, m_, s_] = [l, m, s].map((x) => Math.cbrt(x));
  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const Bq = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
  const H = ((Math.atan2(Bq, A) * 180) / Math.PI + 360) % 360;
  return { L, C: Math.hypot(A, Bq), H, Y: leuchtdichte(c) };
}

/** Ein Ton, der ein Ziel-Verhältnis gegen eine Fläche erfüllt (in Leuchtdichte gerechnet).
 *  MIT SICHERHEITSZUSCHLAG: ein exakt auf 1,30 gelöster Wert landet durch die
 *  Rundung der ausgegebenen oklch-L oft bei 1,2999 und fällt dann der Wache zum
 *  Opfer. 0,6 % über das Ziel ist unsichtbar und hält die Grenze. */
const ZUSCHLAG = 1.006;
function loston({ gegenY, ziel, c, h, richtung }) {
  const z = ziel * ZUSCHLAG;
  const zielY = richtung > 0
    ? z * (gegenY + 0.05) - 0.05
    : (gegenY + 0.05) / z - 0.05;
  if (zielY < 0 || zielY > 1) return null; // nach unten ist bei Schwarz, nach oben bei Weiß Schluss
  return { L: LfuerY(zielY, c, h), Y: zielY };
}

/**
 * Der Maßstab, nie die Abschwächung: liegt die Marke schon über dem Ziel,
 * bleibt sie stehen (das helle Siegel ist Absicht, die dunkle Tinte auch).
 * richtung +1 = heller nötig (dunkles Thema), -1 = dunkler nötig (helles Thema).
 */
function nichtSchwaecher(richtung, brandY, bedarfY) {
  if (bedarfY === null || bedarfY === undefined) return brandY;
  return richtung > 0 ? Math.max(brandY, bedarfY) : Math.min(brandY, bedarfY);
}


// ---------------------------------------------------------------- Fundstellen

function quellDateien() {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const rel = path.posix.join(d, e.name);
      if (e.isDirectory()) walk(rel);
      else if (/\.(tsx?|css)$/.test(e.name)) out.push(rel);
    }
  };
  walk("src");
  return out.sort();
}
const DATEIEN = quellDateien();
const ZEILEN = new Map(DATEIEN.map((rel) => [rel, fs.readFileSync(path.join(REPO, rel), "utf8").split("\n")]));
const zeilenVon = (rel) => ZEILEN.get(rel) ?? [];

// ---------------------------------------------------------------- 1. Flächen

// Die Leiter misst die STUFEN selbst (--eb-0…2, --feld), nicht die alten
// Klassennamen: zwei Namen dürfen auf dieselbe Stufe zeigen (so ziehen die
//-components nach), sonst wäre jede Wiederverwendung ein falscher Alarm.
// Durchscheinende Flächen werden über ihren Ahnen gemischt (D1 B.12 Punkt 5).
const AHNEN = new Map([
  ["--bg-ambient-1", "--eb-0"],
  ["--bg-ambient-2", "--eb-0"],
]);
const STUFEN = ["--eb-0", "--eb-1", "--eb-2"];            // Tisch, Panel, Blatt
const FELDPAAR = ["--feld", "--eb-1"];                     // das Loch im Panel
// Alte Namen → Stufe. Die Wache prüft, dass der aufgelöste Wert auch die
// Stufenfarbe trifft (sonst malt jemand an den Klassennamen vorbei).
const EBENEN = new Map([
  ["--bg-base", "--eb-0"],
  ["--bg-panel", "--eb-1"],
  ["--glass-panel", "--eb-1"],
  ["--bg-inset-strong", "--eb-1"],
  ["--bg-hover", "--eb-1"],
  ["--glass", "--eb-2"],
  ["--glass-strong", "--eb-2"],
  ["--bg-panel-solid", "--eb-2"],
  ["--bg-inset", "--feld"],
]);
// Kanten haben ROLLEN, nicht ein Ziel: nur die Berandung eines
// Bedienelements muss 3:1 erreichen (WCAG 1.4.11), Haarlinien müssen
// überhaupt sichtbar sein (>= 1,35) und dürfen nicht brüllen.
const KANTEN = [
  ["--kante-kontrolle", SCHWELLE.kante],
  ["--kante-stark", 1.9],
  ["--kante-dekor", 1.35],
];
const KANTEN_ALIAS = new Map([["--border-hover", "--kante-kontrolle"], ["--border-strong", "--kante-stark"], ["--border-subtle", "--kante-dekor"], ["--border", "--kante-kontrolle"]]);
const kurz = (n) => n.replace(/^--(bg-|border-|eb-)?/, "").replace(/^--/, "");

function flaeche(name, themen, thema, schon = new Set()) {
  const def = themen.get(thema)?.get(name) ?? themen.get("hell")?.get(name);
  if (!def || schon.has(name)) return null;
  schon.add(name);
  let c = farbe(def.wert, themen, thema);
  const ahne = AHNEN.get(name);
  if (c && c.a < 1 && ahne) c = composite(c, flaeche(ahne, themen, thema, new Set(schon)));
  if (c && c.a < 1) c = composite(c, flaeche("--bg-base", themen, thema, new Set([name])));
  return c ? { ...c, zeile: def.zeile, wert: def.wert } : null;
}

// ---------------------------------------------------------------- 2. Text

/** Alle Token, die im Produkt wirklich als Schriftfarbe auftreten.
 *  Achtung: `border-color:` und `backdrop-*` enden ebenfalls auf „color" —
 *  die Grenze muss vor dem Wort stehen, sonst rechnet die Wache Linien als Text. */
function textToken() {
  const found = new Map();
  for (const rel of DATEIEN) {
    zeilenVon(rel).forEach((z, i) => {
      for (const m of z.matchAll(/(?:^|[^-\w])(?:color|fontColor)\s*:\s*["']?\s*var\(\s*(--[\w-]+)/g)) {
        if (!found.has(m[1])) found.set(m[1], new Set());
        found.get(m[1]).add(`${rel}:${i + 1}`);
      }
    });
  }
  // --on-accent gehört auf die Akzentfläche, die rechnet Abschnitt 3.6
  found.delete("--on-accent");
  return found;
}


/* ============================================================
   SCHULD, BENANNT NACH BESITZER — die Wache misst die eigene Scheibe
   hart (src/index.css, src/lib/icons.tsx). Was in Bausteinen liegt, die
   andere gerade anfassen, steht hier als Liste mit Sitzungszahl: eine
   neue Abweichung macht rot, eine sitzende bleibt eine Meldung.
   Der Schlüssel ist der Text, nicht die Zeile — Bausteine verschieben sich.
   ============================================================ */
const SCHULD = new Map([
  ["schrift:größen-fremd", { sitze: 14, seit: "10.10.", wer: "E2/E3 (Bausteine)", warum: "14 verschiedene Größen in src/components (8,5 bis 44 px, davon 5 halbe Schritte); die Leiter in index.css ist gesetzt und die Bausteine ziehen nach — weniger Stufen hier ist Fortschritt, eine neue Stufe macht rot" }],
  ["schrift:gewichte-fremd", { sitze: 3, seit: "10.10.", wer: "E2/E3 (Bausteine)", warum: "500 (Tailwind font-medium), 560 und 740 — eine statische Segoe UI hat diese Stufen nicht" }],
  ["icons:groesse-fremd", { sitze: 33, seit: "10.10.", wer: "E2/E3 (Bausteine)", warum: "w-2.5/w-3-Sitzungen; die Untergrenze --icon-min in index.css hebt sie beim Rendern auf 14 px, die Klasse selbst bleibt" }],
  ["icons:name-fremd", { sitze: 2, seit: "10.10.", wer: "DS, benannt", warum: "RefreshCw->loader (der Körper IST zwei Kreiselpfeile = erneuern) und PartyPopper->rocket (Namensrest aus der Phosphor-Zeit, Bild passt zur Absicht)" }],
]);
const schuld = (key, sitze) => {
  const s = SCHULD.get(key);
  if (!s) return null;
  return { ...s, sitze, treffer: sitze <= s.sitze };
};

// ---------------------------------------------------------------- Messung

const cssText = fs.readFileSync(CSS_PFAD, "utf8");
const PAR = parse(cssText);
const themen = tokens(PAR.regeln);
const Linien = [];
const meld = (sektion, befund, zahl, schwelle, fund, ok) =>
  Linien.push({ sektion, befund, zahl, schwelle, fund, ok });

/* ============================================================
   --generieren: der Entwurfstisch. Die drei Variablen aus Linears
   Regel (Basis, Ton, Kontrast) stehen hier; alles andere folgt.
   Der Ton (C/H) wird aus der bestehenden Datei gesampelt, damit
   die Marke bleibt — nur die Lichtstufe wird gerechnet.
   ============================================================ */
const ENTWURF = {
  kontrast: 1.3,          // Verhältnis je Stufen-Nachbar (D1 Z-01)
  stufenDunkel: 3,        // Tisch, Panel, Blatt — dieselbe Zahl in beiden Themen:
  stufenHell: 3,          // das helle Thema darf kein abgeleitetes sein (D1-05).
                          // Gehobene Flächen (Menü, Toast, Composer) tragen Kante
                          // ≥ 3:1 und Schatten statt einer vierten Füllstufe.
  papier: 0.955,          // heller Anker: Blatt nahe Weiß, kein Reinweiß
  text: [8.0, 6.0, 4.65], // Ziel je Ebene gegen das härteste Gegenüber (dunkel: Blatt, hell: Tisch samt Ambient)
  kontrolle: 3.05,        // Kante eines Bedienelements (WCAG 1.4.11)
  stark: 1.9,             // sichtbare Regel
  dekor: 1.35,            // Haarlinie in einer Fläche
  aufAkzent: 4.6,         // Beschriftung auf dem Primärknopf
  akzentSchrift: 4.65,    // Akzent als Schrift
  fokus: 3.05,            // Ring gegen beide Nachbarn
};

const hoch = (y, r) => r * (y + 0.05) - 0.05;
const runter = (y, r) => (y + 0.05) / r - 0.05;
const sampeln = (name, thema) => {
  const f = flaeche(name, themen, thema);
  return f ? oklabVon(f) : null;
};

function leiterEntwurf(thema) {
  // Der Leiter-Zuschlag: ohne ihn landet die Stufe durch die Rundung der
  // Ausgabe bei 1,298 — und der hex-Fallback im gebauten Bundle wäre unter
  // der Zielmarke, die die Wache in der Quelle misst.
  const r = ENTWURF.kontrast * 1.012;
  const ton = sampeln("--bg-base", thema);
  if (!ton) return null;
  let ys = [];
  if (thema === "dunkel") {
    ys.push(Math.max(ton.Y, 0.0004));
    while (ys.length < ENTWURF.stufenDunkel && hoch(ys.at(-1), r) <= 1) ys.push(hoch(ys.at(-1), r));
  } else {
    ys = [ENTWURF.papier];
    while (ys.length < ENTWURF.stufenHell && runter(ys[0], r) >= 0.02) ys.unshift(runter(ys[0], r));
  }
  // Das Feld ist ein Schritt unter dem Panel — und nie tiefer als der Tisch.
  // Diese Klammer gilt in BEIDEN Themen; ohne sie fiele das helle Feld unter
  // den Aktendeckel und die Schrift darauf hinge bei 3,79 (von der Wache
  // erwischt am 10.10., 20:15).
  const feld = Math.max(runter(ys[1], r), ys[0]);
  return { ton, ys, feld, deckeBeweis: hoch(ys.at(-1), r) };
}

function generiere() {
  const ausgabe = {};
  for (const thema of ["dunkel", "hell"]) {
    const L = leiterEntwurf(thema);
    const { ton, ys } = L;
    const C = ton.C, H = ton.H;
    const hellste = ys.at(-1), tiefste = ys[0];
    const richtung = thema === "dunkel" ? 1 : -1;
    const blatt = ys[Math.min(2, ys.length - 1)];
    const kantengegen = thema === "dunkel" ? hellste : tiefste;
    const block = new Map();
    const sagt = (name, Y, gegen, k, note) => {
      const kk = k ?? { C, H };
      const Lw = LfuerY(Y, kk.C, kk.H);
      const c = farbeVon(Lw, kk.C, kk.H);
      const gegenC = farbeVon(LfuerY(gegen, C, H), C, H);
      const css = `  ${name}: oklch(${Lw.toFixed(4)} ${kk.C.toFixed(4)} ${kk.H.toFixed(1)});`;
      block.set(name, css);
      console.log(`  ${(name + ":").padEnd(18)} ${css.trim().padEnd(40)} ≈ ${hex(c)}  ${dez(kontrast(c, gegenC))} gegen ${note ?? "die Referenzfläche"}`);
      return c;
    };
    /** löst das Ziel gegen eine Fläche, nie schwächer als die Marke */
    const loes = (name, marke, gegenY, ziel, k) => {
      const tonX = k ?? marke ?? ton;
      const g = loston({ gegenY, ziel, c: tonX.C, h: tonX.H, richtung });
      const Y = nichtSchwaecher(richtung, tonX.Y, g ? g.Y : null);
      sagt(name, Y, gegenY, tonX, `Ziel ${dez(ziel)}`);
      return Y;
    };

    console.log(`\n###### ${thema.toUpperCase()} — Ton gesampelt: C ${C.toFixed(4)} H ${H.toFixed(1)}`);
    console.log(` Leiter (${ENTWURF.kontrast} je Schritt, ${ys.length} Stufen):`);
    ys.forEach((y, i) => sagt(`--eb-${i}`, y, i ? ys[i - 1] : y, null, i ? `--eb-${i - 1}` : "Basis"));
    console.log(` Gegenprobe nächste Stufe über ${hex(farbeVon(LfuerY(hellste, C, H), C, H))}: ${dez(L.deckeBeweis)} — ${L.deckeBeweis > 1 ? "läge über Weiß, also physikalisch unmöglich" : "würde gehen"}`);
    sagt("--feld", ys[0], ys[1], null, "--eb-1 (ein Schritt unter dem Panel, nie unter dem Tisch)");

    // Schrift hält gegen den härtesten Stapel, nicht gegen das Einzeltoken:
    // im dunklen Thema die hellste Schicht, im hellen die dunkelste — und
    // „hellste/dunkelste" kann eine Übereinanderlage sein (Ambient über dem
    // Tisch, Akzent-Tinte über dem Blatt), die kein Token-Wert zeigt.
    const hart = hartestGer(STAPEL, thema, richtung);
    const textgegen = hart.Y;
    console.log(` Schrift gegen den härtesten Stapel: ${hart.wo} → ${hex(farbeVon(LfuerY(textgegen, C, H), C, H))} (Y ${textgegen.toFixed(4)})`);
    for (const name of [...textToken().keys()].sort()) {
      if (name === "--accent" || name === "--on-accent") continue; // eigene Rechnung unten
      const def = themen.get(thema)?.get(name);
      if (def && /^var\(/.test(def.wert.trim())) continue; // Alias: geerbt, nicht gelöst
      const marke = sampeln(name, thema);
      if (!marke) continue;
      const ziel = name.startsWith("--text-") ? (ENTWURF.text[Number(name.slice(-1)) - 1] ?? ENTWURF.text.at(-1)) : ENTWURF.akzentSchrift;
      loes(name, marke, textgegen, ziel, marke);
    }

    console.log(` Kanten (bindendes Gegenüber ${hex(farbeVon(LfuerY(kantengegen, C, H), C, H))}):`);
    for (const [name, ziel] of [["--kante-kontrolle", ENTWURF.kontrolle], ["--kante-stark", ENTWURF.stark], ["--kante-dekor", ENTWURF.dekor]]) {
      loes(name, null, kantengegen, ziel);
    }

    // Akzent in ZWEI Rollen, weil Komponenten densamen Token für Schrift und für
    // Fläche benutzen: `--accent` löst die Schrift-Rolle (auf dem Blatt lesbar),
    // `--accent-fuell` hält die Masse (Siegellack) und `--on-accent` die Tinte.
    // Ein dunkles Rot kann nicht beides zugleich — das ist der Befund D1-04.
    // Markenquelle der Rolle: --accent-fuell, sobald es die gibt. Sonst sampelt
    // der Generator beim zweiten Lauf sein eigenes Ergebnis.
    const akzent = sampeln("--accent-fuell", thema) ?? sampeln("--accent", thema);
    const aufAkzent = sampeln("--on-accent", thema);
    console.log(` Akzent (gesampelt C ${akzent.C.toFixed(4)} H ${akzent.H.toFixed(1)}, Beschriftung jetzt ${hex(farbeVon(aufAkzent.L, aufAkzent.C, aufAkzent.H))}):`);
    const schriftY = loston({ gegenY: textgegen, ziel: ENTWURF.akzentSchrift, c: akzent.C, h: akzent.H, richtung });
    const akzentEndY = schriftY ? nichtSchwaecher(richtung, akzent.Y, schriftY.Y) : akzent.Y;
    sagt("--accent", akzentEndY, textgegen, akzent, "Schrift-Rolle gegen das härteste Gegenüber");
    sagt("--accent-fuell", akzent.Y, blatt, akzent, "Blatt — Massen-Rolle (Marke bleibt)");
    const tint = loston({ gegenY: akzent.Y, ziel: ENTWURF.aufAkzent, c: aufAkzent.C, h: aufAkzent.H, richtung: 1 });
    const tintY = tint ? Math.max(aufAkzent.Y, tint.Y) : aufAkzent.Y;
    sagt("--on-accent", tintY, akzent.Y, { C: aufAkzent.C, H: aufAkzent.H }, "--accent-fuell (Knopf)");
    const kante = loston({ gegenY: blatt, ziel: ENTWURF.kontrolle, c: akzent.C, h: akzent.H, richtung });
    if (kante) sagt("--accent-kante", nichtSchwaecher(richtung, akzent.Y, kante.Y), blatt, akzent, "Blatt — Knopfrand");
    const ring = loston({ gegenY: kantengegen, ziel: ENTWURF.fokus, c: akzent.C, h: akzent.H, richtung });
    if (ring) sagt("--fokus", nichtSchwaecher(richtung, akzent.Y, ring.Y), kantengegen, akzent, "Tisch — Fokusring");
    ausgabe[thema] = [...block.values()];
  }
  for (const thema of ["dunkel", "hell"]) {
    console.log(`\n----- ${thema} · zum Einfügen -----\n${thema === "hell" ? ":root {" : ".dark {"}\n${ausgabe[thema].join("\n")}\n}`);
  }
  console.log(`
Regel: Verhältnis je Stufen-Nachbar ${ENTWURF.kontrast}; Ton (C/H) bleibt, Lichtstufe folgt;
gelöst wird gegen das Blatt, nie schwächer als die Marke.
Neu berechnen: node scripts/design-wache.mjs --generieren`);
}

/** Schreibt den Entwurf in src/index.css zurück: nur eigene Werte, Aliasse
 *  bleiben Aliasse, jede geänderte Zeile wird gedruckt. Ohne Browser, ohne
 *  Build — die Regel und ihre Anwendung stehen in derselben Datei. */
function setzen() {
  let text = fs.readFileSync(CSS_PFAD, "utf8");
  let k = 0, verschont = 0;
  for (const [thema, anfang] of [["hell", ":root {"], ["dunkel", ".dark {"]]) {
    const L = leiterEntwurf(thema);
    const { ton, ys } = L;
    const C = ton.C, H = ton.H;
    const richtung = thema === "dunkel" ? 1 : -1;
    const blatt = ys[Math.min(2, ys.length - 1)];
    const want = new Map();
    ys.forEach((y, i) => want.set(`--eb-${i}`, { L: LfuerY(y, C, H), C, H }));
    want.set("--feld", { L: LfuerY(L.feld, C, H), C, H });
    const textgegen = hartestGer(STAPEL, thema, richtung).Y;
    for (const name of [...textToken().keys()]) {
      if (name === "--accent" || name === "--on-accent") continue;
      const marke = sampeln(name, thema);
      if (!marke) continue;
      const def = themen.get(thema)?.get(name);
      if (def && /^var\(/.test(def.wert.trim())) continue;
      const ziel = name.startsWith("--text-") ? (ENTWURF.text[Number(name.slice(-1)) - 1] ?? ENTWURF.text.at(-1)) : ENTWURF.akzentSchrift;
      const g = loston({ gegenY: textgegen, ziel, c: marke.C, h: marke.H, richtung });
      const Y = nichtSchwaecher(richtung, marke.Y, g ? g.Y : null);
      want.set(name, { L: LfuerY(Y, marke.C, marke.H), C: marke.C, H: marke.H });
    }
    const kantengegen = hartestGer(STAPEL, thema, richtung).Y;
    for (const [name, ziel] of [["--kante-kontrolle", ENTWURF.kontrolle], ["--kante-stark", ENTWURF.stark], ["--kante-dekor", ENTWURF.dekor]]) {
      const g = loston({ gegenY: kantengegen, ziel, c: C, h: H, richtung });
      if (g) want.set(name, { L: g.L, C, H });
    }
    const akzent = sampeln("--accent-fuell", thema) ?? sampeln("--accent", thema);
    const aufAkzent = sampeln("--on-accent", thema);
    const sY = loston({ gegenY: textgegen, ziel: ENTWURF.akzentSchrift, c: akzent.C, h: akzent.H, richtung });
    want.set("--accent", { L: LfuerY(sY ? nichtSchwaecher(richtung, akzent.Y, sY.Y) : akzent.Y, akzent.C, akzent.H), C: akzent.C, H: akzent.H });
    want.set("--accent-fuell", { L: akzent.L, C: akzent.C, H: akzent.H });
    const kante = loston({ gegenY: blatt, ziel: ENTWURF.kontrolle, c: akzent.C, h: akzent.H, richtung });
    want.set("--accent-kante", { L: kante ? nichtSchwaecher(richtung, akzent.L, kante.L) : akzent.L, C: akzent.C, H: akzent.H });
    const ring = loston({ gegenY: kantengegen, ziel: ENTWURF.fokus, c: akzent.C, h: akzent.H, richtung });
    want.set("--fokus", { L: ring ? nichtSchwaecher(richtung, akzent.L, ring.L) : akzent.L, C: akzent.C, H: akzent.H });
    want.set("--on-accent", { L: aufAkzent.L, C: aufAkzent.C, H: aufAkzent.H });

    // Stahl: die Kante muss auch über der hellsten Lage noch 3:1 halten —
    // sie lag bei 2,11 (gerechnet gegen den nackten Grund, nicht das Bild).
    const stahl = STAPEL.filter((s) => s.seite).map((s) => ({ n: s.name, c: stapel(s.lagen, "dunkel") })).filter((s) => s.c);
    if (stahl.length) {
      const ys0 = stahl.map((s) => leuchtdichte(s.c));
      const grund = Math.max(...ys0);                        // hellste Lage = wenigstes Spiel
      const k = loston({ gegenY: grund, ziel: ENTWURF.kontrolle, c: C, h: H, richtung: 1 });
      // Stahl ist themenunabhängig: derselbe Wert in beide Blöcke.
      if (k) want.set("--side-kante", { L: k.L, C, H });
    }

    const i = text.indexOf(anfang);
    if (i < 0) continue;
    const j = text.indexOf("\n}", i);
    let abschnitt = text.slice(i, j);
    for (const [name, w] of want) {
      const neu = `oklch(${w.L.toFixed(4)} ${w.C.toFixed(4)} ${w.H.toFixed(1)})`;
      const re = new RegExp(`(\\n\\s*${name}:\\s*)([^;\\n]+)(;)`);
      const m = abschnitt.match(re);
      if (!m) continue;
      if (m[2].trim().startsWith("var(")) { verschont++; continue; }
      if (m[2].trim() === neu) continue;
      abschnitt = abschnitt.replace(re, (mm, a, b, c) => { k++; console.log(`${thema}  ${name.padEnd(18)} ${b.trim()}  ->  ${neu}`); return a + neu + c; });
    }
    text = text.slice(0, i) + abschnitt + text.slice(j);
  }
  fs.writeFileSync(CSS_PFAD, text);
  console.log(`gesetzt: ${k}  ·  Aliasse verschont: ${verschont}`);
}

/* ============================================================
   SCHICHT-RECHNUNG — was der Browser übereinander legt.
   D1 B.12 Punkt 5 warnte schon vor dem Gradient; der Befund aus B1
   (10.10., Bildarbeit) zeigt die Lücke der Token-Rechnerei: auf dem
   Tisch liegen ZWEI Ambient-Schichten übereinander, und eine gewählte
   Zeile trägt Akzent-Tinte AUF dem Blatt. Token gegen Token misst das
   nicht — deshalb steht hier jeder Stapel, den das Produkt wirklich
   baut, und jede Schrift wird dagegen gerechnet.
   Reihenfolge: unten nach oben. `seite: true` = Stahl (eigene Rechnung).
   ============================================================ */
const STAPEL = [
  { name: "Tisch (Grund + beide Ambient-Schichten)", lagen: ["--eb-0", "--bg-ambient-1", "--bg-ambient-2"], text: true },
  { name: "Tisch, eine Ambient-Schicht", lagen: ["--eb-0", "--bg-ambient-1"], text: true },
  { name: "Panel", lagen: ["--eb-1"], text: true },
  { name: "Blatt (Karte)", lagen: ["--eb-2"], text: true },
  { name: "Feld", lagen: ["--feld"], text: true },
  { name: "gewählte Zeile (Akzent-Tinte auf dem Blatt)", lagen: ["--eb-2", "--accent-soft-2"], text: true },
  { name: "Textmarker (Auswahl)", lagen: ["--eb-2", "--accent-soft-2"], text: true },
  { name: "Ziehen-Band", lagen: ["--feld", "--accent-soft"], text: true },
  { name: "gehobene Fläche über dem Scrim", lagen: ["--eb-0", "--scrim", "--eb-2"], text: true },
  { name: "Stahl", lagen: ["--side-basis-2"], seite: true },
  { name: "Stahl, Hover-Lage", lagen: ["--side-basis-2", "--side-flaeche"], seite: true },
  { name: "Stahl, aktive Lage", lagen: ["--side-basis-2", "--side-auswahl"], seite: true },
];

function stapel(namen, thema, themenquelle = themen) {
  let c = null;
  for (const n of namen) {
    const def = themenquelle.get(thema)?.get(n) ?? themenquelle.get("hell")?.get(n);
    if (!def) continue;
    const f = farbe(def.wert ?? def, themenquelle, thema);
    if (!f) continue;
    c = c ? composite(f, c) : (f.a >= 1 ? f : composite(f, { r: 0, g: 0, b: 0, a: 1 }));
  }
  return c;
}

/** das härteste Gegenüber, das unter Schrift liegen kann — über ALLE Stapel */
function hartestGer(stapelListe, thema, richtung) {
  let best = null, wo = null;
  for (const s of stapelListe) {
    if (s.seite) continue;
    const c = stapel(s.lagen, thema);
    const y = leuchtdichte(c);
    if (y == null) continue;
    if (best === null || (richtung > 0 ? y > best : y < best)) { best = y; wo = s.name; }
  }
  return { Y: best, wo };
}

/**
 * --artefakt <pfad>: dieselbe Schicht-Rechnung gegen das GEBAUTE Bundle.
 * Der Bauer rechnet oklch nach hex/lab/display-p3 um und legt Alpha-Lagen als
 * 8-stellige hex-Werte ab; gemessen wird hier der hex-Kanal, also der
 * schlechteste Fall. Was sich nicht auflösen lässt, wird gemeldet — die Wache
 * darf nicht stillschweigend grün werden, weil sie etwas nicht versteht.
 */
function artefakt(pfad) {
  const th = tokens(parse(fs.readFileSync(pfad, "utf8")).regeln);
  if (!th.get("hell")?.size) { console.log("im Artefakt kein :root-Block gefunden — Prüfung unmöglich"); return 1; }
  let rot = 0; const ungelöst = [];
  console.log(`Artefakt: ${path.relative(REPO, pfad)}`);
  for (const thema of ["dunkel", "hell"]) {
    const lagen = STAPEL.map((s) => ({ ...s, c: stapel(s.lagen, thema, th) })).filter((s) => s.c);
    const fehlend = STAPEL.length - lagen.length;
    if (fehlend) ungelöst.push(`${thema}: ${fehlend} Stapel-Lage(n) nicht auflösbar`);
    const prüf = (name, ziel, nurSeitig = false, gegen = null) => {
      const def = th.get(thema)?.get(name) ?? th.get("hell")?.get(name);
      if (!def) return;
      const ro = farbe(def.wert, th, thema);
      if (!ro) { ungelöst.push(`${thema}: ${name}`); return; }
      const ort = gegen !== null ? [{ name: "Akzentfüllung", c: farbe(accentWert, th, thema) }]
        : lagen.filter((s) => !!s.seite === nurSeitig);
      let min = Infinity, wo = null;
      for (const s of ort) {
        if (!s.c) continue;
        const k = kontrast(composite(ro, s.c), s.c);
        if (k !== null && k < min) { min = k; wo = s.name; }
      }
      if (min === Infinity) return;
      const ok = min + TOLERANZ >= ziel;
      if (!ok) rot++;
      console.log(`  ${ok ? "OK   " : "ROT  "} ${thema}: ${name.padEnd(18)} ${dez(min).padStart(6)}  >= ${dez(ziel)}   ${wo}`);
    };
    console.log(`\n--- ${thema} · ${lagen.length} Stapel ---`);
    const accentWert = (th.get(thema)?.get("--accent-fuell") ?? th.get("hell")?.get("--accent-fuell"))?.wert;
    for (const n of [...textToken().keys()]) if (n !== "--on-accent") prüf(n, SCHWELLE.text);
    if (accentWert) prüf("--on-accent", SCHWELLE.text, false, true);
    prüf("--fokus", SCHWELLE.kante);
    for (const [n, z] of [["--kante-kontrolle", SCHWELLE.kante], ["--kante-stark", 1.9], ["--kante-dekor", 1.35]]) prüf(n, z);
    // Der Stahl ist themenunabhängig: nur im dunklen Durchlauf prüfen.
    if (thema === "dunkel") {
      for (const n of ["--side-text", "--side-ruhig", "--side-akzent"]) prüf(n, SCHWELLE.text, true);
      prüf("--side-kante", SCHWELLE.kante, true);
    }
    // Leiter im Artefakt
    const ys = STUFEN.map((s) => leuchtdichte(stapel([s], thema, th))).filter((y) => y != null);
    for (let i = 1; i < ys.length; i++) {
      const k = (Math.max(ys[i], ys[i - 1]) + 0.05) / (Math.min(ys[i], ys[i - 1]) + 0.05);
      const ok = k + TOLERANZ >= SCHWELLE.nachbar; if (!ok) rot++;
      console.log(`  ${ok ? "OK   " : "ROT  "} ${thema}: Leiter ${STUFEN[i - 1]} -> ${STUFEN[i]} ${dez(k).padStart(6)}  >= 1,30`);
    }
  }
  if (ungelöst.length) console.log(`\nNICHT GELÖST (nicht geprüft, nicht bestanden): ${ungelöst.join(" · ")}`);
  console.log(`\n--- Artefakt: ${rot} Befunde unter der Schwelle, ${ungelöst.length} ungelöst ---`);
  return rot ? 1 : 0;
}

if (process.argv.includes("--artefakt")) {
  const arg = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const ordner = path.join(REPO, "dist-e1", "assets");
  const pfad = arg[0] ?? (fs.existsSync(ordner) ? fs.readdirSync(ordner).filter((f) => f.endsWith(".css")).map((f) => path.join(ordner, f))[0] : null);
  if (!pfad || !fs.existsSync(pfad)) { console.log("kein Artefakt gefunden — Nutzung: --artefakt <pfad/*.css>"); process.exit(2); }
  process.exit(artefakt(pfad));
}

if (process.argv.includes("--setzen")) { setzen(); process.exit(0); }
if (process.argv.includes("--generieren")) { generiere(); process.exit(0); }

const TEXT_UNTERGRÜNDE = ["--eb-0", "--eb-1", "--eb-2", "--feld", "--bg-ambient-1", "--bg-ambient-2"];

for (const thema of ["dunkel", "hell"]) {
  const stufen = STUFEN.map((n) => ({ name: n, c: flaeche(n, themen, thema) })).filter((s) => s.c);
  if (stufen.length < 2) {
    meld("flächen", `${thema}: Stufen-Token --eb-* nicht gefunden`, `${stufen.length}`, "3 Stufen", "src/index.css", false);
  }

  // 3.1 benachbarte Stufen: 1,30 je Nachbar. Einzige zulässige Ausnahme ist
  //     eine, die niemand setzen kann: die nächste Stufe läge über Weiß.
  for (let i = 1; i < stufen.length; i++) {
    const a = stufen[i - 1], b = stufen[i];
    const k = kontrast(a.c, b.c);
    meld("flächen", `${thema}: Leiter ${a.name} -> ${b.name}`, dez(k), ">= 1,30",
      `src/index.css:${b.c.zeile} ${hex(a.c)} / ${hex(b.c)}`, hält(k, SCHWELLE.nachbar));
  }
  // 3.2 Decken-Beweis: wie viele Stufen zwischen Tisch und Weiß überhaupt passen
  const ys = stufen.map((s) => leuchtdichte(s.c));
  let anzahl = 1, y = ys[0];
  while (anzahl < 12 && hoch(y, ENTWURF.kontrast) <= 1) { y = hoch(y, ENTWURF.kontrast); anzahl++; }
  meld("flächen", `${thema}: Stufen, die zwischen Tisch und Weiß passen`, `${anzahl}`, `>= ${STUFEN.length}`,
    `Tisch ${hex(stufen[0]?.c)} Y ${ys[0]?.toFixed(4)} · 1,30 je Schritt · gebaut: ${stufen.length}`, anzahl >= STUFEN.length);

  // 3.3 jede Stufe gegen den Tisch
  for (const s of stufen.slice(1)) {
    const k = kontrast(s.c, stufen[0].c);
    meld("flächen", `${thema}: ${s.name} gegen den Tisch`, dez(k), ">= 1,30",
      `src/index.css:${s.c.zeile} ${hex(s.c)} über ${hex(stufen[0].c)}`, hält(k, SCHWELLE.nachbar));
  }
  // 3.4 das Feld: ein Schritt unter dem Panel, nie unter dem Tisch
  {
    const f = flaeche(FELDPAAR[0], themen, thema), p = flaeche(FELDPAAR[1], themen, thema);
    if (f && p) {
      const k = kontrast(f, p);
      meld("flächen", `${thema}: Feld -> Panel`, dez(k), ">= 1,30",
        `src/index.css:${f.zeile} ${hex(f)} / ${hex(p)}`, hält(k, SCHWELLE.nachbar));
    }
  }
  // 3.5 alte Flächennamen müssen auf einer Stufe auflösen — sonst malt
  //     jemand an der Leiter vorbei und die Wache sähe es nicht.
  let abweg = 0;
  for (const [name, stufe] of EBENEN) {
    const a = flaeche(name, themen, thema), b = flaeche(stufe, themen, thema);
    if (!a || !b) continue;
    if (hex(a) !== hex(b)) {
      abweg++;
      meld("flächen", `${thema}: ${name} löst nicht auf ${stufe} auf`, `${hex(a)} ≠ ${hex(b)}`, "equal",
        `src/index.css:${a.zeile}`, false);
    }
  }
  meld("flächen", `${thema}: alte Flächennamen auf Stufen`, `${EBENEN.size - abweg}/${EBENEN.size}`, "alle gleich",
    "src/index.css → --eb-*", abweg === 0);

  // 3.6 Kanten nach ROLLE, gegen jede Stufe, auf der sie liegen können
  for (const [name, ziel] of KANTEN) {
    const def = themen.get(thema)?.get(name);
    if (!def) continue;
    const ro = farbe(def.wert, themen, thema);
    if (!ro) continue;
    let min = Infinity, schwächste = null;
    for (const s of stufen) {
      const k = kontrast(composite(ro, s.c), s.c);
      if (k < min) { min = k; schwächste = s.name; }
    }
    meld("kanten", `${thema}: ${name} (Rollenziel ${dez(ziel)})`, dez(min), `>= ${dez(ziel)}`,
      `src/index.css:${def.zeile} ${hex(ro)} — schwächstes Gegenüber ${schwächste}`, hält(min, ziel));
  }
  // 3.7 die alten Kantennamen lösen auf die Rollen auf (sonst zwei Systeme)
  for (const [alias, rolle] of KANTEN_ALIAS) {
    const a = themen.get(thema)?.get(alias), b = themen.get(thema)?.get(rolle);
    if (!a || !b) continue;
    const ca = farbe(a.wert, themen, thema), cb = farbe(b.wert, themen, thema);
    const treffer = ca && cb && hex(ca) === hex(cb);
    meld("kanten", `${thema}: ${alias} = ${rolle}`, treffer ? hex(ca) : `${hex(ca)} ≠ ${hex(cb)}`, "equal",
      `src/index.css:${a.zeile}`, !!treffer);
  }

  // 3.8 Schrift: jedes als Text benutzte Token gegen jede Fläche, auf der es liegt
  const TEXT = textToken();
  for (const [name, wo] of TEXT) {
    const def = themen.get(thema)?.get(name) ?? themen.get("dunkel")?.get(name);
    if (!def) continue;
    const ro = farbe(def.wert, themen, thema);
    if (!ro) continue;
    let min = Infinity, schwächster = null;
    for (const u of TEXT_UNTERGRÜNDE) {
      const fl = flaeche(u, themen, thema);
      if (!fl) continue;
      const k = kontrast(composite(ro, fl), fl);
      if (k !== null && k < min) { min = k; schwächster = u; }
    }
    if (min === Infinity) continue;
    meld("text", `${thema}: ${name} als Schrift (schwächstes Gegenüber ${kurz(schwächster)})`, dez(min), ">= 4,50",
      `src/index.css:${def.zeile} ${hex(ro)} · benutzt z. B. ${[...wo][0]}`, hält(min, SCHWELLE.text));
  }

  // 3.9 Beschriftung auf der AkzentMASSE (--accent-fuell), nicht auf der
  //     Schrift-Rolle: der Primärknopf ist der teure Fall.
  const fuell = themen.get(thema)?.get("--accent-fuell") ?? themen.get(thema)?.get("--accent");
  const ona = themen.get(thema)?.get("--on-accent");
  if (fuell && ona) {
    const f = farbe(fuell.wert, themen, thema), o = farbe(ona.wert, themen, thema);
    const k = kontrast(composite(o, f), f);
    meld("text", `${thema}: --on-accent auf --accent-fuell (Primärknopf)`, dez(k), ">= 4,50",
      `src/index.css:${ona.zeile} ${hex(o)} auf ${hex(f)}`, hält(k, SCHWELLE.text));
  }
  // 3.10 Fokusring gegen beide Nachbarn (Ring liegt auf jeder Stufe)
  const fokus = themen.get(thema)?.get("--fokus");
  if (fokus) {
    const ro = farbe(fokus.wert, themen, thema);
    let min = Infinity, schwächste = null;
    for (const s of stufen) {
      const k = kontrast(ro, s.c);
      if (k < min) { min = k; schwächste = s.name; }
    }
    meld("text", `${thema}: --fokus (Ring 2 px) gegen die Stufe`, dez(min), ">= 3,00",
      `src/index.css:${fokus.zeile} ${hex(ro)} — schwächstes Gegenüber ${kurz(schwächste)}`, hält(min, SCHWELLE.kante));
  }
}

// 3.8 deklarierte Zeitmaße und ihre Anwendung (D1-13) — themenunabhängig,
//     deshalb einmal und nicht in beiden Runden.
for (const t of ["--dur", "--dur-fast", "--ease-apple"]) {
  const def = themen.get("hell")?.get(t) ?? themen.get("dunkel")?.get(t);
  if (!def) continue;
  const ben = DATEIEN.reduce((n, rel) => n + zeilenVon(rel).filter((z) => z.includes(`var(${t})`)).length, 0);
  meld("css", `Zeitmaß ${t} = ${def.wert}`, `${ben} Anwendungen in src/`, ">= 1", `src/index.css:${def.zeile}`, ben > 0);
}

// 4b. SCHICHT-RECHNUNG — jeder Texttoken gegen jeden Stapel, den das Produkt
//     wirklich baut (Ambient über dem Tisch, Akzent-Tinte über dem Blatt,
//     Scrim unter der gehobenen Fläche). Das ist die Zahl, die ein Kunde sieht.
{
  const TEXT = textToken();
  for (const thema of ["dunkel", "hell"]) {
    const lagen = STAPEL.filter((s) => !s.seite).map((s) => ({ ...s, c: stapel(s.lagen, thema) })).filter((s) => s.c);
    let tiefer = 0;
    for (const [name] of TEXT) {
      const def = themen.get(thema)?.get(name) ?? themen.get("dunkel")?.get(name);
      if (!def || /^var\(/.test(def.wert.trim())) continue;
      const ro = farbe(def.wert, themen, thema);
      if (!ro) continue;
      let min = Infinity, wo = null;
      for (const s of lagen) {
        const k = kontrast(composite(ro, s.c), s.c);
        if (k !== null && k < min) { min = k; wo = s.name; }
      }
      if (min === Infinity) continue;
      const ok = hält(min, SCHWELLE.text);
      if (!ok) tiefer++;
      meld("schichten", `${thema}: ${name} auf dem härtesten Stapel`, dez(min), ">= 4,50",
        `${wo} · ${hex(composite(ro, lagen.find((s) => s.name === wo).c))} auf ${hex(lagen.find((s) => s.name === wo).c)}`, ok);
    }
    // Der Ring muss auf jedem Stapel 3:1 halten, nicht nur auf der reinen Fläche
    const fokus = themen.get(thema)?.get("--fokus");
    if (fokus) {
      const ro = farbe(fokus.wert, themen, thema);
      let min = Infinity, wo = null;
      for (const s of lagen) {
        const k = kontrast(ro, s.c);
        if (k !== null && k < min) { min = k; wo = s.name; }
      }
      meld("schichten", `${thema}: --fokus (Ring) auf dem härtesten Stapel`, dez(min), ">= 3,00",
        `${wo} · ${hex(ro)} auf ${hex(lagen.find((s) => s.name === wo).c)}`, hält(min, SCHWELLE.kante));
    }
    // Und jede Fläche gegen ihre Nachbarn IMMER noch sichtbar, auch als Stapel
    meld("schichten", `${thema}: Stapel geprüft`, `${lagen.length}`, ">= 8", "STAPEL-Tabelle in der Wache", lagen.length >= 8 && tiefer === 0);
  }
  // Stahl: die drei Lagen (Grund, hover, aktiv) gegen die vier Schriftrollen
  for (const s of STAPEL.filter((x) => x.seite)) {
    const c = stapel(s.lagen, "dunkel");
    if (!c) continue;
    for (const name of ["--side-text", "--side-ruhig", "--side-akzent"]) {
      const def = themen.get("dunkel")?.get(name) ?? themen.get("hell")?.get(name);
      if (!def) continue;
      const ro = farbe(def.wert, themen, "dunkel");
      if (!ro) continue;
      const k = kontrast(composite(ro, c), c);
      meld("schichten", `Stahl · ${name} auf „${s.name}"`, dez(k), ">= 4,50", `${hex(ro)} auf ${hex(c)}`, hält(k, SCHWELLE.text));
    }
    const kante = themen.get("dunkel")?.get("--side-kante") ?? themen.get("hell")?.get("--side-kante");
    if (kante) {
      const ro = farbe(kante.wert, themen, "dunkel");
      meld("schichten", `Stahl · --side-kante auf „${s.name}"`, dez(kontrast(composite(ro, c), c)), ">= 3,00",
        `${hex(ro)} auf ${hex(c)}`, hält(kontrast(composite(ro, c), c), SCHWELLE.kante));
    }
  }
}

// ---------------------------------------------------------------- 4. Stahl-Seitenleiste

{
  const r = PAR.regeln.find((x) => x.selektor === ".sidebar-glass");
  const bg = r?.dekl.find((d) => d.prop === "background")?.wert ?? "";
  const ends = [...bg.matchAll(/#[0-9a-f]{3,8}/gi)].map((m) => farbe(m[0], themen, "dunkel")).filter(Boolean);
  if (ends.length) {
    const konst = new Map();
    zeilenVon("src/components/Sidebar.tsx").forEach((z, i) => {
      const m = z.match(/^const ([A-Z_]+)\s*=\s*['"]([^'"]+)['"]/);
      if (m) konst.set(m[1], { wert: m[2], zeile: i + 1 });
    });
    for (const [name, def] of konst) {
      const c = farbe(def.wert, themen, "dunkel");
      if (!c) continue;
      if (c.a >= 1) {
        // deckende Farbe: Schrift oder Fläche, immer gegen beide Gradient-Enden
        const min = Math.min(...ends.map((e) => kontrast(c, e)).filter((x) => x != null));
        const alsSchrift = ["TEXT_STRONG", "ACCENT_LIGHT"].includes(name);
        meld("seitenleiste", `${name} ${def.wert} über Gradient (${ends.map(hex).join(" / ")})`, dez(min),
          alsSchrift ? ">= 4,50" : ">= 3,00", `src/components/Sidebar.tsx:${def.zeile}`,
          hält(min, alsSchrift ? SCHWELLE.text : SCHWELLE.kante));
      } else {
        const min = Math.min(...ends.map((e) => kontrast(composite(c, e), e)).filter((x) => x != null));
        const schrift = name.startsWith("TEXT_");
        meld("seitenleiste", `${name} ${def.wert} über Gradient (${ends.map(hex).join(" / ")})`, dez(min),
          schrift ? ">= 4,50" : ">= 3,00", `src/components/Sidebar.tsx:${def.zeile}`,
          hält(min, schrift ? SCHWELLE.text : SCHWELLE.kante));
      }
    }
    if (konst.size) {
      meld("seitenleiste", "Farben stehen als Inline-Konstanten im Baustein", `${konst.size} Konstanten`,
        "0 (kein Theme erreicht sie)", "src/components/Sidebar.tsx:37-42", false);
    } else {
      meld("seitenleiste", "Seitenleiste zieht keine Inline-Farben mehr", "0 Konstanten", "0",
        "src/components/Sidebar.tsx", true);
    }
  }
}

// ---------------------------------------------------------------- 5. var(--x) ohne Definition

{
  const def = new Set();
  for (const rel of DATEIEN) {
    zeilenVon(rel).forEach((z) => {
      const m = z.match(/^\s*(--[\w-]+)\s*:/);
      if (m) def.add(m[1]);
    });
  }
  let fehlen = 0, dynamik = 0;
  for (const rel of DATEIEN) {
    zeilenVon(rel).forEach((z, i) => {
      for (const m of z.matchAll(/var\(\s*(--[\w-]*)/g)) {
        const name = m[1];
        const danach = z.slice(m.index + m[0].length);
        if (danach.startsWith("${") || name.endsWith("-")) { dynamik++; continue; }
        if (!def.has(name)) { fehlen++; meld("var", `${name} benutzt, nirgends definiert`, "keine Definition", ">= 1 Definition", `${rel}:${i + 1}`, false); }
      }
    });
  }
  meld("var", `var(--x)-Referenzen ohne Definition`, String(fehlen), "0", "src/** und src/index.css", fehlen === 0);
  meld("var", `dynamisch zusammengesetzte Referenzen (nicht prüfbar)`, String(dynamik), "—", `z. B. var(--type-<Typ>) in MemoryCard.tsx`, true);
  meld("var", `definierte Custom Properties gesamt`, String(def.size), "—", "src/**", true);
}

// ---------------------------------------------------------------- 6. Schriftgrößen

{
  const TW = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, "2xl": 24, "3xl": 30, "4xl": 36, "5xl": 48, "6xl": 60 };
  const vor = new Map();
  const merk = (px, wo, art) => {
    if (!Number.isFinite(px)) return;
    if (!vor.has(px)) vor.set(px, { wo: [], art: new Set() });
    const v = vor.get(px);
    v.art.add(art);
    if (v.wo.length < 4 && !v.wo.includes(wo)) v.wo.push(wo);
  };
  for (const rel of DATEIEN) {
    zeilenVon(rel).forEach((z, i) => {
      const wo = `${rel}:${i + 1}`;
      for (const m of z.matchAll(/font-size:\s*([0-9.]+)px/g)) merk(parseFloat(m[1]), wo, "font-size");
      for (const m of z.matchAll(/clamp\(\s*([0-9.]+)px[^,]*,[^,]*,\s*([0-9.]+)px/g)) { merk(parseFloat(m[1]), wo, "clamp tief"); merk(parseFloat(m[2]), wo, "clamp hoch"); }
      for (const m of z.matchAll(/text-\[([0-9.]+)px\]/g)) merk(parseFloat(m[1]), wo, "arbitrary");
      for (const m of z.matchAll(/\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl)\b/g)) merk(TW[m[1]], wo, "tailwind benannt");
      for (const m of z.matchAll(/fontSize:\s*["']?([0-9.]+)["']?/g)) merk(parseFloat(m[1]), wo, "inline");
    });
  }
  const vorEig = new Map();
  const merkEig = (px, wo, art) => {
    if (!Number.isFinite(px)) return;
    if (!vorEig.has(px)) vorEig.set(px, { wo: [], art: new Set() });
    const v = vorEig.get(px);
    v.art.add(art);
    if (v.wo.length < 4 && !v.wo.includes(wo)) v.wo.push(wo);
  };
  zeilenVon("src/index.css").forEach((z, i) => {
    const wo = `src/index.css:${i + 1}`;
    for (const m of z.matchAll(/font-size:\s*([0-9.]+)px/g)) merkEig(parseFloat(m[1]), wo, "font-size");
    for (const m of z.matchAll(/clamp\(\s*([0-9.]+)px[^,]*,\s*[^,]*,\s*([0-9.]+)px/g)) { merkEig(parseFloat(m[1]), wo, "clamp tief"); merkEig(parseFloat(m[2]), wo, "clamp hoch"); }
  });
  // Die Leiter selbst: --fs-*/--fw-* in index.css. Sie ist der Maßstab,
  // den die Bausteine ziehen sollen — also wird sie hart geprüft.
  const leiterStufen = [...(themen.get("hell")?.keys() ?? [])].filter((n) => /^--fs-\d+$/.test(n))
    .map((n) => ({ n, px: parseFloat(themen.get("hell").get(n).wert) }))
    .sort((a, b) => a.px - b.px);
  meld("schrift", `die Leiter --fs-* in src/index.css`, leiterStufen.map((s) => `${s.px} px`).join(" · ") || "keine",
    `<= ${SCHWELLE.stufen} Stufen, ganzzahlig, >= ${SCHWELLE.schriftpx} px`,
    leiterStufen.map((s) => `${s.n}=${s.px}`).join(" "),
    leiterStufen.length > 0 && leiterStufen.length <= SCHWELLE.stufen
    && leiterStufen.every((s) => Number.isInteger(s.px) && s.px >= SCHWELLE.schriftpx));
  const leiterGew = [...(themen.get("hell")?.keys() ?? [])].filter((n) => /^--fw-/.test(n))
    .map((n) => parseInt(themen.get("hell").get(n).wert));
  meld("schrift", `die Gewichte --fw-* in src/index.css`, leiterGew.join(" · ") || "keine",
    "nur Stufen einer statischen Schrift", "--fw-* in index.css",
    leiterGew.length > 0 && leiterGew.every((w) => [300, 400, 600, 700, 800].includes(w)));

  // Was in src/index.css noch wörtlich steht, muss auf der Leiter liegen.
  const eig = [...vorEig.keys()].sort((a, b) => a - b);
  const stufen = new Set(leiterStufen.map((s) => s.px));
  const abwegig = eig.filter((v) => !stufen.has(v));
  meld("schrift", `wörtliche Größen in src/index.css außerhalb der Leiter`, abwegig.length ? abwegig.map((v) => `${v} px (${vorEig.get(v).wo[0]})`).join(", ") : "keine",
    "keine", "src/index.css", abwegig.length === 0);
  const halbEig = eig.filter((v) => !Number.isInteger(v));
  meld("schrift", `halbe Pixelschritte in src/index.css`, halbEig.join(" · ") || "keine", "keine", "src/index.css", halbEig.length === 0);

  // Gewichte in der eigenen Datei
  const gewEig = new Map();
  zeilenVon("src/index.css").forEach((z, i) => {
    for (const m of z.matchAll(/font-weight:\s*(\d+)/g)) if (!gewEig.has(parseInt(m[1]))) gewEig.set(parseInt(m[1]), `src/index.css:${i + 1}`);
  });
  meld("schrift", `wörtliche Gewichte in src/index.css`, [...gewEig.keys()].sort((a, b) => a - b).join(" · ") || "keine",
    "keine (alle über --fw-*)", [...gewEig.values()].slice(0, 3).join(", "), gewEig.size === 0);

  // Fremdanteile: Bausteine. Benannte Schuld mit Sitzungszahl — eine neue
  // Abweichung dreht das Gate, eine sitzende bleibt eine Meldung.
  const groessenFremd = new Map();
  const fremdGewichte = new Map();
  for (const rel of DATEIEN.filter((x) => x !== "src/index.css")) {
    zeilenVon(rel).forEach((z, i) => {
      for (const m of z.matchAll(/text-\[([0-9.]+)px\]/g)) groessenFremd.set(parseFloat(m[1]), `${rel}:${i + 1}`);
      for (const m of z.matchAll(/fontSize:\s*["']?([0-9.]+)["']?/g)) groessenFremd.set(parseFloat(m[1]), `${rel}:${i + 1}`);
      for (const m of z.matchAll(/font-size:\s*([0-9.]+)px/g)) groessenFremd.set(parseFloat(m[1]), `${rel}:${i + 1}`);
      for (const m of z.matchAll(/(?:font-weight|fontWeight):\s*["']?([0-9]+)["']?/g)) fremdGewichte.set(parseInt(m[1]), `${rel}:${i + 1}`);
      for (const m of z.matchAll(/\bfont-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/g)) {
        const sk = { thin: 100, extralight: 200, light: 300, normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 };
        fremdGewichte.set(sk[m[1]], `${rel}:${i + 1}`);
      }
    });
  }
  const fremdGew = [...fremdGewichte.keys()].sort((a, b) => a - b);
  const fremdPx = [...groessenFremd.keys()].sort((a, b) => a - b);
  const sG = schuld("schrift:größen-fremd", fremdPx.length);
  meld("schrift", `Größen in den Bausteinen (fremde Scheibe)`, `${fremdPx.length} Stufen: ${fremdPx.map((v) => `${v}px`).join(" · ")}`,
    sG ? `benannt: ${sG.sitze} Stufen (${sG.wer})` : "keine",
    sG ? sG.warum : (vor.get(fremdPx[0])?.wo.join(", ") ?? "src/components"), sG ? sG.treffer : fremdPx.length === 0);
  const sW = schuld("schrift:gewichte-fremd", fremdGew.filter((w) => ![300, 400, 600, 700, 800].includes(w)).length);
  meld("schrift", `Gewichte in den Bausteinen (fremde Scheibe)`, fremdGew.join(" · "),
    sW ? `benannt: ${sW.sitze} Zwischenstufen (${sW.wer})` : "nur statisch deckbare Stufen",
    sW ? sW.warum : "src/components", sW ? sW.treffer : true);
}

// ---------------------------------------------------------------- 7. Icons

{
  const quellText = fs.readFileSync(ICON_PFAD, "utf8");
  const daten = JSON.parse(fs.readFileSync(ICON_DATEN, "utf8"));
  const zeileVon = (index) => quellText.slice(0, index).split("\n").length;
  const maker = [...quellText.matchAll(/export const ([A-Za-z0-9_]+)\s*=\s*make\(\s*"([\w-]+)"\s*\)/g)];
  const alias = [...quellText.matchAll(/export const ([A-Za-z0-9_]+)\s*=\s*([A-Z][A-Za-z0-9_]*)\s*;/g)];
  const signatur = (koerper) => [...koerper.matchAll(/\bd="[^"]*"|<(circle|rect|line|polygon|polyell|polyline|ellipse)\b[^>]*>/g)].map((m) => m[0].replace(/\s+/g, "")).join("|");

  const namen = new Map();
  for (const m of maker) {
    const icon = daten.icons[m[2]];
    namen.set(m[1], { daten: m[2], sig: icon ? signatur(icon.body) : null, zeile: zeileVon(m.index) });
  }
  for (const m of alias) namen.set(m[1], { aliasVon: m[2], zeile: zeileVon(m.index) });

  const nachSig = new Map();
  for (const [n, v] of namen) {
    if (v.aliasVon || !v.sig) continue;
    if (!nachSig.has(v.sig)) nachSig.set(v.sig, []);
    nachSig.get(v.sig).push(n);
  }
  const doppelte = [...nachSig.entries()].filter(([, ns]) => ns.length > 1);
  for (const [, ns] of doppelte) {
    for (const n of ns) {
      meld("icons", `${n} = dasselbe Bild wie ${ns.filter((x) => x !== n).join(", ")}`, `-> Dataset "${namen.get(n).daten}"`,
        "ein Name = ein Bild", `src/lib/icons.tsx:${namen.get(n).zeile}`, false);
    }
  }
  meld("icons", `Export-Namen mit identischen Pfad-Daten`, `${doppelte.length} Gruppen / ${doppelte.reduce((n, [, ns]) => n + ns.length, 0)} Namen`,
    "0", "src/lib/icons.tsx", doppelte.length === 0);
  meld("icons", `Exporte gesamt (make + Alias)`, String(namen.size), "—", "src/lib/icons.tsx", true);

  // Dataset-Ebene: zwei Dataset-Namen mit demselben Körper
  const sigDatum = new Map();
  for (const [n, v] of Object.entries(daten.icons)) {
    const s = signatur(v.body);
    if (!sigDatum.has(s)) sigDatum.set(s, []);
    sigDatum.get(s).push(n);
  }
  // Ein Zwilling im Vorrat ist nur ein Fehler, wenn ein Export ihn ruft:
  // better-icons legt mehr Zeichen ab, als die Serie zeigt.
  const gerufen = new Set([...namen.values()].map((v) => v.daten).filter(Boolean));
  const datt = [...sigDatum.entries()].filter(([, ns]) => ns.filter((n) => gerufen.has(n)).length > 1);
  const verrat = [...sigDatum.entries()].filter(([, ns]) => !(ns.filter((n) => gerufen.has(n)).length > 1));
  for (const [, ns] of verrat) {
    meld("icons", `Dataset-Zwilling, von keinem Export gerufen: ${ns.join(" == ")}`, "unreferenziert", "—",
      "src/lib/kepta-icons.json (Vorrat)", true);
  }
  for (const [, ns] of datt) {
    meld("icons", `Dataset: ${ns.join(" == ")} haben denselben Körper`, `${ns.length} Namen`, "1 Name",
      "src/lib/kepta-icons.json", false);
  }
  meld("icons", `Dataset-Namen mit identischem Körper`, `${datt.length} Gruppen`, "0", "src/lib/kepta-icons.json", datt.length === 0);

  // Erklärte Größen in den Bausteinen (statische Zählung, kein DOM)
  const groessen = new Map();
  const merk = (px, wo) => {
    if (!Number.isFinite(px) || px <= 0) return;
    if (!groessen.has(px)) groessen.set(px, []);
    groessen.get(px).push(wo);
  };
  for (const rel of DATEIEN) {
    zeilenVon(rel).forEach((z, i) => {
      for (const m of z.matchAll(/<([A-Z][A-Za-z0-9_]*)\s+className="([^"]*)"/g)) {
        if (!namen.has(m[1])) continue;
        // w-[10px] ist already px; w-4 ist ein Vielfaches der 4-px-Basis → 16 px
        const willkuer = m[2].match(/\bw-\[([0-9.]+)px\]/);
        const basis = m[2].match(/\bw-([0-9.]+)(?![\w-])/);
        const px = willkuer ? parseFloat(willkuer[1]) : basis ? parseFloat(basis[1]) * 4 : null;
        if (px) merk(px, `${m[1]} ${rel}:${i + 1}`);
      }
      for (const m of z.matchAll(/size=\{([0-9.]+)\}/g)) merk(parseFloat(m[1]), `size-Prop ${rel}:${i + 1}`);
    });
  }
  const gl = [...groessen.keys()].sort((a, b) => a - b);
  const winzig = gl.filter((g) => g < SCHWELLE.iconpx);
  const sitze = winzig.reduce((n, g) => n + groessen.get(g).length, 0);
  const sIk = schuld("icons:groesse-fremd", sitze);
  meld("icons", `erklärte Icon-Größen (Sitzungen im Quelltext)`,
    gl.map((g) => `${g}px ×${groessen.get(g).length}`).join(" "),
    sIk ? `benannt: ${sIk.sitze} Sitzungen < ${SCHWELLE.iconpx} px (${sIk.wer})` : `alle >= ${SCHWELLE.iconpx} px`,
    sIk ? sIk.warum : `${sitze} Sitzungen unter ${SCHWELLE.iconpx} px`, sIk ? sIk.treffer : winzig.length === 0);
  meld("icons", `Untergrenze in der eigenen Scheibe`, themen.get("hell")?.get("--icon-min")?.wert ?? "keine",
    `>= ${SCHWELLE.iconpx} px`, "src/index.css --icon-min + svg[aria-hidden] ",
    parseFloat(themen.get("hell")?.get("--icon-min")?.wert ?? "0") >= SCHWELLE.iconpx);
  for (const g of winzig) {
    meld("icons", `Icon auf ${g} px — Strich dann ${dez((1.5 * g) / 24)} px`, `${groessen.get(g).length} Sitzungen`,
      `>= ${SCHWELLE.iconpx} px, Strich >= 1,25 px`, groessen.get(g).slice(0, 4).join(", "), !!sIk);
  }

  // tote API
  const nimmt = /weight\?:/.test(quellText);
  const nutzt = [...quellText.matchAll(/\bweight\b/g)].length > 1;
  if (nimmt && !nutzt) {
    meld("icons", "IconProps nimmt `weight` an und ignoriert es", "API tot", "ehren oder weg",
      `src/lib/icons.tsx:${zeileVon(quellText.indexOf("weight?:"))}`, false);
  }
  // Namen, die ein fremdes Bild zeigen (Phosphor-Reste): Name <-> Dataset-Name vergleichen
  const fremd = [];
  for (const [n, v] of namen) {
    if (v.aliasVon || !v.daten) continue;
    const a = n.toLowerCase().replace(/[^a-z]/g, "");
    const b = v.daten.toLowerCase().replace(/[^a-z]/g, "");
    if (a !== b && !a.includes(b) && !b.includes(a)) fremd.push(`${n}->${v.daten}`);
  }
  const sName = schuld("icons:name-fremd", fremd.length);
  meld("icons", `Exportname passt nicht zum Dataset-Bild`, fremd.join(" ") || "keine",
    sName ? `benannt: ${sName.sitze} (${sName.wer})` : "keine",
    sName ? sName.warum : "src/lib/icons.tsx",
    sName ? sName.treffer : true);
}

// ---------------------------------------------------------------- 8. CSS-Handwerk

// Deklarationen außerhalb jeder Regel: der Browser verwirft sie still.
// Genauso war D1-14 entstanden — `text-wrap: balance` stand nach dem
// Schlusszeichen der Kartentitel-Regel und hat nichts erreicht.
for (const w of PAR.weisen) {
  meld("css", `Deklaration außerhalb einer Regel: ${w.prop}: ${w.wert}`, "wird verworfen", "0",
    `src/index.css:${w.zeile}`, false);
}
meld("css", `Deklarationen außerhalb von Regeln`, String(PAR.weisen.length), "0", "src/index.css", PAR.weisen.length === 0);

// Regeln, die auf eine Klasse zeigen, die kein Baustein benutzt — ererbter
// Auftrag: toter Stil ist kein Fehler, aber eine falsche Fährte.
{
  const klassen = new Set();
  for (const r of PAR.regeln) {
    for (const m of r.selektor.matchAll(/\.([a-zA-Z][-\w]*)/g)) klassen.add(m[1]);
  }
  const quelltext = DATEIEN.filter((rel) => rel.endsWith(".tsx")).map((rel) => zeilenVon(rel).join("\n")).join("\n");
  const tot = [...klassen].filter((k) => !quelltext.includes(k)).sort();
  meld("css", `Klassenregeln ohne Baustein (toter Stil)`, tot.length ? tot.join(" ") : "keine", "—",
    "src/index.css Selektoren gegen src/**/*.tsx", true);
}

// ---------------------------------------------------------------- Bericht

const GRUPPEN = {
  flächen: "Flächenleiter — Stufe gegen Basis und gegen den Nachbarn",
  kanten: "Trennlinien — gegen beide Nachbarn",
  text: "Schriftebenen — gegen jede Fläche, auf der sie liegt",
  schichten: "Schicht-Rechnung — Text gegen das komponierte Bild (Ambient, Tinte, Scrim, Stahl-Lagen)",
  seitenleiste: "Stahl-Seitenleiste — Inline-Farben über den Gradient-Enden",
  var: "Custom Properties — Auflösung aus src/**",
  schrift: "Schriftgrößen und Gewichte",
  icons: "Icon-Vertrag — Namen, Pfad-Daten, Größen",
  css: "CSS-Handwerk — Waisen, Zeitmaße",
};
const nur = process.argv.includes("--abschnitt") ? process.argv[process.argv.indexOf("--abschnitt") + 1] : null;
const leise = process.argv.includes("--leise");
if (process.argv.includes("--json")) {
  console.log(JSON.stringify({
    schwelle: SCHWELLE,
    rot: Linien.filter((x) => !x.ok).length,
    messungen: Linien.length,
    linien: Linien.map(({ sektion, befund, zahl, schwelle, fund, ok }) => ({ sektion, befund, zahl, schwelle, fund, ok })),
  }));
  process.exit(Linien.some((x) => !x.ok) ? 1 : 0);
}
for (const [g, titel] of Object.entries(GRUPPEN)) {
  if (nur && g !== nur) continue;
  const L = Linien.filter((x) => x.sektion === g);
  if (leise && L.every((x) => x.ok)) continue;
  console.log(`\n=== ${g} — ${titel} ===`);
  if (!L.length) console.log("  (nichts)");
  for (const x of L) {
    console.log(`${x.ok ? "  OK   " : "  ROT  "} ${x.befund.padEnd(60)} ${String(x.zahl).padStart(16)}   ${(x.schwelle + "  ").padEnd(18)} ${x.fund}`);
  }
}
const rot = Linien.filter((x) => !x.ok).length;
console.log(`\n--- Ergebnis: ${Linien.length} Messungen, ${rot} unter der Schwelle — Exit ${rot ? 1 : 0} ---`);
console.log("Bemerkung: die Wache rechnet Token gegen Token. Der Browser misst Textknoten");
console.log("inkl. opacity und Verläufen — Abweichungen um wenige Hundertstel sind dort erklärt.");
process.exit(rot ? 1 : 0);
