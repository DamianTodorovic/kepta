// @vitest-environment node
//
// Warum diese Datei existiert: die Marktlatte hat einen Fremdcode-Lader (am
// installierten Obsidian-Leib gemessen: loadPlugin 38, enablePlugin 19,
// communityPlugins 6, manifest.json 7 — Punkt 3, 23.10. 11:17:09 MESZ), unsre
// Flaeche und unsre Tuer haben dieselben Woerter 0 mal. Diese Wache haelt zwei
// Dinge zusammen: (1) die Abwesenheit ist erklart, in der Flaeche und in der
// Doku, (2) sie bleibt eine Entscheidung und wird nicht still ein Lader.
//
// Rot vor gruen: vor BAU-P3-07 fallen die drei ersten Faelle (kein Satz, keine
// Stelle in der Flaeche, kein Punkt in der Doku), der vierte ist schon gruen —
// er ist der Zaun, nicht die Bestellung.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const WURZEL = path.resolve(__dirname, "..", "..");
const SCHLUESSEL = "settings.keineFremderweiterungen";

/** Alle .ts/.tsx der Flaeche und der Tuer, ohne Testordner. */
function quellDateien(ordner: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(ordner)) {
    const p = path.join(ordner, name);
    if (statSync(p).isDirectory()) { out.push(...quellDateien(p)); continue; }
    if (/\.(ts|tsx)$/.test(p) && !p.includes("tests/")) out.push(p);
  }
  return out;
}

describe("kein Fremdcode-Lader, und die Abwesenheit ist erklaert", () => {
  it("die Textsammlung der Flaeche traegt den Satz, englisch und ohne Umlaut", () => {
    const t = readFileSync(path.join(WURZEL, "src/lib/uiText.ts"), "utf8");
    const zeile = t.split("\n").find((z) => z.includes(`"${SCHLUESSEL}"`)) ?? "";
    expect(zeile.length).toBeGreaterThan(0);
    const wert = zeile.slice(zeile.indexOf('": "') + 4);
    expect(/[äöüß]/.test(wert)).toBe(false);
    expect(wert).toMatch(/third-party code/);
    expect(wert).toMatch(/free download|managed/);
  });

  it("die Flaeche zeigt den Satz, mit eigner Kennung", () => {
    const s = readFileSync(path.join(WURZEL, "src/components/Settings.tsx"), "utf8");
    expect(s).toContain('data-testid="settings-keine-fremderweiterungen"');
    expect(s).toContain(`t("${SCHLUESSEL}")`);
  });

  it("die Doku sagt, warum das keine Sperre ist", () => {
    const r = readFileSync(path.join(WURZEL, "README.md"), "utf8");
    expect(r).toMatch(/No plugin store, and that is not a lock/);
    expect(r).toMatch(/loads no third-party code/);
  });

  it("es gibt keinen Lader: vier Kennungen, die eine Fremd-Erweiterung laden wuerden, stehen 0 mal im Quelltext", () => {
    const texte = quellDateien(path.join(WURZEL, "src")).map((p) => readFileSync(p, "utf8")).join("\n");
    for (const wort of ["loadPlugin", "enablePlugin", "communityPlugins", "manifest.json"]) {
      expect([wort, texte.split(wort).length - 1]).toEqual([wort, 0]);
    }
  });
});
