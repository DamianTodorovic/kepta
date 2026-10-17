import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Aufgabe #44 — die Zielgroessen-Latte, gemessen 17.10. im ausgelieferten Objekt
// (3.2.17, CDP, vier Breiten, sieben Ansichten, Trefferfilter):
//   unter 24 px genau EINE Steuerung, unter 44 px alle.
// Die Heilung ist eine Regel, nicht dreissig Flicken: ein Boden-Token, das am
// Telefon auf 44 px rueckt, und eine einzige Selektorliste, die es setzt.
//
// jsdom kennt keine Layoutmasze — dieser Fall prueft deshalb die Regel, nicht das
// Ergebnis. Das Ergebnis misst der Fensterlauf (audit-2026-10-09/ZIELGROESSE-17-10.md).
// Wofuer dieser Fall gut ist: er schlaegt, sobald jemand die Regel wieder weg
// nimmt, sie auf eine Klasse verengt, oder den Telefonboden unter die Schreibtisch-
// kante setzt. Drei Dinge, die in den letzten Wochen alle schon vorgekommen sind.

const css = fs.readFileSync(path.join(process.cwd(), "src/index.css"), "utf8");

/** Der Leib einer Regel, von ihrem Anker bis zum schliessenden `}` auf eigener Zeile. */
function blockBody(anker: string): string {
  const i = css.indexOf(anker);
  if (i < 0) return "";
  const ende = css.indexOf("\n}", i);
  return ende < 0 ? css.slice(i + anker.length) : css.slice(i + anker.length, ende);
}

/** Der Selektor, der eine Deklaration tragt — ohne Kommentar-Zeilen. */
function selektorVon(deklIndex: number): string {
  const start = css.lastIndexOf("}", deklIndex) + 1;
  const offnen = css.indexOf("{", deklIndex);
  return css.slice(start, offnen).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
}

const px = (wert: string) => Number.parseFloat(wert);
const boden = (text: string) => [...text.matchAll(/--ziel-boden:\s*([^;]+);/g)].map((m) => px(m[1]));

describe("Zielgroessen-Latte in src/index.css", () => {
  it("setzt den Boden in genau einer Regel — nicht in dreissig Flicken", () => {
    const stellen = [...css.matchAll(/min-height:\s*var\(--ziel-boden\)/g)];
    expect(stellen.length, `${stellen.length} Stellen setzen den Boden; es soll eine einzige Regel sein`).toBe(1);
  });

  it("traegt jede anfassbare Steuerung und keine blende Beschriftung", () => {
    const [stelle] = [...css.matchAll(/min-height:\s*var\(--ziel-boden\)/g)];
    expect(stelle, "die Boden-Regel fehlt — damit ist auch dieser Fall blind").toBeTruthy();
    const selektor = selektorVon(stelle!.index);
    for (const teil of ["button", "a[href]", "select", "summary", ".switch", 'input:not([type="hidden"])']) {
      expect(selektor, `die Regel laesst ${teil} weg`).toContain(teil);
    }
    // Die 1x1-Pixel-Felder hinter den Blendbeschriftungen der Schalter sind im
    // Blatt, aber kein Finger trifft sie. Aufgeblasen waeren sie trotzdem —
    // und sie wuerden die Schalter-Zeilen auseinanderschieben.
    expect(selektor, "die Regel blastet die blenden 1x1-Felder auf").toContain(":not(.sr-only)");
    expect(selektor, "die Regel blastet echte Kaestchen und Radios auf").toContain(':not([type="checkbox"])');
  });

  it("haelt die zwei Stufen fest: Schreibtisch 36 px, Telefon 44 px", () => {
    const stufe = blockBody("@media (max-width: 440px) {");
    expect(stufe, "die Telefonstufe fehlt").not.toBe("");
    const [telefon] = boden(stufe);
    const [schreibtisch] = boden(blockBody(":root {"));
    expect(schreibtisch, "--ziel-boden in :root fehlt oder liegt mehrfach").toBeDefined();
    expect(boden(blockBody(":root {"))).toHaveLength(1);
    expect(boden(stufe)).toHaveLength(1);
    // Die Latte, die das Papier beschlossen hat: am Telefon 44, auf dem
    // Schreibtisch 36 — und die Telefonstufe darf nie unter die Schreibtisch-
    // kante fallen, sonst gilt auf dem kleineren Geraet das kleinere Mass.
    expect(schreibtisch).toBeGreaterThanOrEqual(36);
    expect(telefon).toBeGreaterThanOrEqual(44);
    expect(telefon).toBeGreaterThan(schreibtisch);
  });

  it("kennt die Telefonkante aus dem Beschluss, nicht aus dem Gefuehl", () => {
    const kanten = [...css.matchAll(/@media\s*\(max-width:\s*(\d+)px\)/g)].map((m) => Number(m[1]));
    expect(kanten, "eine max-width-Stufe muss den Boden heben").toContain(440);
  });
});
