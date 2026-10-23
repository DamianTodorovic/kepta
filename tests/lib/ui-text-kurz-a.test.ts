// @vitest-environment node
//
// Auftrag KURZ A (Leitung, 23.10. 19:50 MESZ): die gelandete Einstellungen-Zeile wird kuerzer, und
// die Laenge ist keine Geschmacksfrage, sondern eine Erwartung. Rot vor gruen  -  dieser Fall faellt am
// heutigen Text, weil er 280 Zeichen, 53 Woerter und 43 Woerter im laengsten Atemzug traegt.
//
// Die drei Zahlen sind mit derselben Sonde gemessen, die Punkt 7 gesetzt hat
// (belege-2310/p7-kurzfassung.mjs, 19:50:13 MESZ von meiner Hand nachgefahren):
//   Zeichen  = laenge des Werts
//   Woerter  = nicht-leere Folgen von Nicht-Leerzeichen
//   Atemzug  = groesste Woerterzahl zwischen [.!?]
//   gelandet: 280 / 53 / 43   |   KURZ A: 197 / 36 / 24
//
// Der Tausch darf nicht schummeln: die zwei Woerter, die die Wache `kein-fremdcode-lader` an dieser
// Zeile verlangt ("third-party code" und "managed"), bleiben drin; das Wort "plugin store" faellt aus
// der Flaeche und steht weiterhin in der README.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const WURZEL = path.resolve(__dirname, "..", "..");
const TEXT = readFileSync(path.join(WURZEL, "src/lib/uiText.ts"), "utf8");
const WERT = (TEXT.match(/"settings\.keineFremderweiterungen":\s*"((?:[^"\\]|\\.)*)"/) || [])[1] || "";

const zaehlung = (s: string) => ({
  zeichen: s.length,
  woerter: (s.match(/\S+/g) || []).length,
  atemzug: Math.max(...s.split(/[.!?]/).map((x) => (x.match(/\S+/g) || []).length)),
});

describe("KURZ A - die Einstellungen-Zeile haelt ihre Laenge", () => {
  it("die Zeile ist da und nicht leer", () => {
    expect(WERT.length).toBeGreaterThan(40);
  });

  it("sie passt in die drei Zahlen von KURZ A: 197 Zeichen, 36 Woerter, langster Atemzug 24", () => {
    const z = zaehlung(WERT);
    expect(z.zeichen).toBe(197);
    expect(z.woerter).toBe(36);
    expect(z.atemzug).toBeLessThanOrEqual(24);
  });

  it("die zwei Woerter der Wache bleiben, das dritte Wort der Abwesenheit geht", () => {
    expect(WERT).toMatch(/third-party code/);
    expect(WERT).toMatch(/managed/);
    expect(WERT).not.toMatch(/plugin store/);
  });
});
