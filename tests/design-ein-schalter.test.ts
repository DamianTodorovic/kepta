// @vitest-environment jsdom
//
// P197: EIN Schalter-Design für ganz K3PTA.
//
// Die Geschichte dieses Tests ist Damians Bildschirmfotos vom 10./11.11.: drei
// Handbau-Schalter (Privacy-Schild, Auto-learn, Notiz-Editor „Private") trugen
// alle ihre eigenen Zahlen — und jeder stand anders kaputt: der Knopf 14 px
// über dem Pille-Rand, die 44-px-Flieger unter dem Text, der 36×36-Kreis aus
// der Tast-Boden-Regel. Daneben existierte längst der Haus-Schalter (`.switch`,
// 34×20, Knopf drin). Diese Wache hält fest: eine An/Aus-Stelle ist entweder
// der Haus-Schalter — oder sie wird rot.
//
// Geprüft wird der Quelltext der Komponenten (nicht das Bündel): jede
// `role="switch"`-Stelle trägt die Haus-Klasse, und der klassische Handbau
// (gerundete Pille mit translate-Knob ohne die Haus-Klasse) kommt nicht mehr
// vor. Schiebereglern (range) ist das Zeichen egal — sie sind keine Schalter.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const WURZEL = path.join(process.cwd(), "src", "components");
function dateien(re: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(re, { withFileTypes: true })) {
    const voll = path.join(re, e.name);
    if (e.isDirectory()) out.push(...dateien(voll));
    else if (/\.tsx$/.test(e.name)) out.push(voll);
  }
  return out;
}

describe("P197: ein Schalter-Design für ganz K3PTA", () => {
  const dateien_alle = dateien(WURZEL);

  it("jede role=\"switch\"-Stelle trägt den Haus-Schalter (.switch)", () => {
    const fremde: string[] = [];
    for (const datei of dateien_alle) {
      const text = fs.readFileSync(datei, "utf8");
      for (const m of text.matchAll(/role="switch"/g)) {
        const umgebung = text.slice(Math.max(0, m.index - 400), m.index + 200);
        if (!umgebung.includes("switch shrink-0") && !/className=\{?[`"'][^`"']*\bswitch\b/.test(umgebung)) {
          fremde.push(`${path.relative(WURZEL, datei)} @ ${text.slice(0, m.index).split("\n").length}`);
        }
      }
    }
    expect(fremde, `Handbau-Schalter ohne die Haus-Klasse: ${fremde.join(", ") || "keine"}`).toEqual([]);
  });

  it("der klassische Handbau (Pille + translate-Knob) kommt nicht mehr vor", () => {
    const handbau: string[] = [];
    for (const datei of dateien_alle) {
      const text = fs.readFileSync(datei, "utf8");
      // Das Muster aus den drei geflickten Stellen: eine gerundete Pille mit
      // einem Knob/translate-Kreis — ohne die Haus-Klasse `.switch` in derselben
      // Öffnung.
      for (const m of text.matchAll(/className="[^"]*\brounded-full\b[^"]*"[^>]*>\s*<span[^>]*(knob|bg-knopf|translate-x-)/g)) {
        const öffnung = m[0];
        if (öffnung.includes(".switch") || öffnung.includes("switch ")) continue;
        handbau.push(`${path.relative(WURZEL, datei)} :: ${öffnung.slice(0, 80)}`);
      }
    }
    expect(handbau, `Handbau-Schalter im Quelltext: ${handbau.join(" | ") || "keine"}`).toEqual([]);
  });

  it("der Haus-Schalter existiert und bleibt klein genug für seine Zeile", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "src", "index.css"), "utf8");
    const stelle = css.indexOf(".switch {");
    expect(stelle, "die Haus-Schalter-Regel fehlt").toBeGreaterThanOrEqual(0);
    const körper = css.slice(stelle, css.indexOf("}", stelle));
    expect(körper, "der Haus-Schalter verliert seine Maße").toMatch(/height:\s*20px/);
    expect(körper).toMatch(/width:\s*34px/);
    // Die Tast-Boden-Ausnahme (P197): ohne sie pumpt die Mindesthöhe den
    // Schalter auf 36×36 auf — Damians Kreis.
    expect(css).toMatch(/button\.switch[\s\S]{0,120}min-height:\s*0/);
  });
});
