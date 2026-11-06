// P90, Punkt 2 und Punkt 4: eine Grenze, die ein Bedienelement ankuedigt, muss man sehen
// koennen. Die Bar dafuer ist WCAG 1.4.11 (non-text contrast) und heisst 3:1 -- nicht 4,5:1,
// denn es ist Text, der hier erklaert, sondern eine Flaeche, die abgrenzt.
//
// WARUM ES DIESE DATEI GIBT. Der Hover am "Clear chat"-Knopf rief `border-red-500/40` --
// 40 % Deckkraft von Tailwinds rot 500. Gerechnet 6.11.2026 03:09:38 MEZ mit derselben
// Umrechnung, die an den drei dokumentierten Werten der index.css geprueft ist (dunkler
// Tisch #070708, Blatt #fafaf8, dunkles Panel #252526 -- alle auf das Hex gleich):
//   hell 1,57:1, dunkel 1,65:1, und selbst ungedeckt 2,74:1.
// Die Ansage "das hier loescht alles" war als Rand praktisch unwirksam. Ein Token, das die
// Bar haelt, ist die Heilung; dieser Test ist die Wache.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const CSS = fs.readFileSync(path.resolve(import.meta.dirname, "../src/index.css"), "utf8");

type typeRgb = [number, number, number];

function oklchNachRgb(L: number, C: number, Hdeg: number): typeRgb {
  const h = (Hdeg * Math.PI) / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  // Kubikwurzel-Raum: ohne das Wuerfeln wird die ganze Rechnung zu hell (gemessen 03:09:02
  // MEZ, wo der dunkle Tisch als #646467 herauskam statt als #070708).
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  const f = (t: number) => (t <= 0.0031308 ? 12.92 * t : 1.055 * Math.pow(t, 1 / 2.4) - 0.055);
  return [
    f(4.0767416621 * l - 3.3077115913 * m + 0.230966081 * s),
    f(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    f(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ].map((v) => Math.max(0, Math.min(1, v))) as typeRgb;
}

function relativ(rgb: typeRgb): number {
  const g = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * g(rgb[0]) + 0.7152 * g(rgb[1]) + 0.0722 * g(rgb[2]);
}

function verhaeltnis(a: typeRgb, b: typeRgb): number {
  const la = relativ(a), lb = relativ(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function mischung(rgb: typeRgb, alpha: number, grund: typeRgb): typeRgb {
  return rgb.map((c, i) => c * alpha + grund[i] * (1 - alpha)) as typeRgb;
}

/** Ein Token aus einem der beiden Blenden-Abschnitte; `ab` ist der Suchanfang. */
function token(name: string, ab = 0): string | null {
  const m = CSS.slice(ab).match(new RegExp("--" + name + ":\\s*([^;]+);"));
  return m ? m[1].trim() : null;
}

function oklch(v: string | null): typeRgb | null {
  if (v === null) return null;
  const m = v.match(/oklch\(\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)/);
  if (!m) return null;
  return oklchNachRgb(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
}

const DUNKEL = CSS.indexOf(".dark {");
if (DUNKEL < 0) throw new Error("der dunkle Abschnitt fehlt in src/index.css -- die Sonde weiss nicht, wo sie lesen soll");

/** Ein Wert, der da sein muss; sonst bricht der Fall mit der Zeile, die fehlt. */
function muss(v: typeRgb | null, nam: string): typeRgb {
  if (v === null) throw new Error(`oklch-Wert fehlt oder ist keiner: ${nam}`);
  return v;
}

describe("Punkt 2 und 4: die Gefahr-Grenze tragt 3:1", () => {
  const hell = muss(oklch(token("gefahr")), "--gefahr (hell)");
  const dunkel = muss(oklch(token("gefahr", DUNKEL)), "--gefahr (dunkel)");
  const tischHell = muss(oklch(token("eb-0")), "--eb-0 (hell)");
  const panelHell = muss(oklch(token("eb-1")), "--eb-1 (hell)");
  const tischDunkel = muss(oklch(token("eb-0", DUNKEL)), "--eb-0 (dunkel)");
  const panelDunkel = muss(oklch(token("eb-1", DUNKEL)), "--eb-1 (dunkel)");

  it("die Token stehen in beiden Blenden und sind oklch", () => {
    expect(token("gefahr"), "--gefahr fehlt im hellen Abschnitt").not.toBeNull();
    expect(token("gefahr", DUNKEL), "--gefahr fehlt im dunklen Abschnitt").not.toBeNull();
  });

  it("der Rand erreicht 3:1 gegen Tisch und Panel, in beiden Blenden", () => {
    const vier = [
      ["hell gegen Tisch", verhaeltnis(hell, tischHell)],
      ["hell gegen Panel", verhaeltnis(hell, panelHell)],
      ["dunkel gegen Tisch", verhaeltnis(dunkel, tischDunkel)],
      ["dunkel gegen Panel", verhaeltnis(dunkel, panelDunkel)],
    ] as const;
    const meldung = vier.map(([n, v]) => `${n} ${v.toFixed(2)}:1`).join(", ");
    for (const [n, v] of vier) expect(v, `${n} -- alle vier: ${meldung}`).toBeGreaterThanOrEqual(3);
  });

  it("Biss-Kontrolle: die alte Form faellt durch dieselbe Rechnung", () => {
    // #ef4444 bei 40 % Deckkraft -- genau das, was der Sitz bis 3.2.177 rief.
    const rot: typeRgb = [0.937, 0.267, 0.267];
    expect(verhaeltnis(mischung(rot, 0.4, panelHell), panelHell)).toBeLessThan(3);
    expect(verhaeltnis(mischung(rot, 0.4, panelDunkel), panelDunkel)).toBeLessThan(3);
    // Und die Umrechnung selbst ist nicht erfunden: die drei dokumentierten Werte treffen.
    expect(tischDunkel.map((v) => Math.round(v * 255))).toEqual([7, 7, 8]);
    expect(panelDunkel.map((v) => Math.round(v * 255))).toEqual([37, 37, 38]);
    expect(Math.round(oklch(token("eb-2"))![2] * 255)).toBeLessThanOrEqual(250);
  });

  it("kein Baustein ruft mehr eine Gefahr-Farbe des Rahmenwerks", () => {
    const ordner = path.resolve(import.meta.dirname, "../src/components");
    const dateien = fs.readdirSync(ordner, { recursive: true })
      .filter((f) => String(f).endsWith(".tsx"))
      .map((f) => ({ rel: String(f), text: fs.readFileSync(path.join(ordner, String(f)), "utf8") }));
    expect(dateien.length).toBeGreaterThan(10);
    const palette = dateien
      .map((d) => [...d.text.matchAll(/\b(?:bg|text|border|ring)-(?:red|rose|orange|amber)-\d+(?:\/\d+)?\b/g)].map(() => d.rel))
      .flat();
    expect(palette, `Farben des Rahmenwerks aus der Gefahrenreihe: ${[...new Set(palette)].join(", ")}`).toEqual([]);
  });
});
