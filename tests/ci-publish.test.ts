/* P146 — README.md:427 sagt ueber die Windows- und Linux-Pakete:

     "They are built from this source and never published here, so they are untested against a
      real installer download; treat them as source builds, not as shipped products."

   Das ist eine Behauptung, die ein Werkzeug widerlegen koennte — ein einziger Publish-Schritt in
   der CI waere genug, und der Census zaehlte den Satz seit P138 in der schmalen Klasse ohne
   Messzeug. Diese Datei faehrt die Regel: jeder electron-builder-Aufruf in
   `.github/workflows/build.yml` muss `--publish never` tragen, und kein Aufruf darf veroeffentlichen.

   Gemessen 7.11. 01:58:03 MEZ vor dem Fall: 3 Builder-Aufrufe (`build:mac` :111, `build:linux`
   :204, `build:win` :310), alle drei mit `--publish never`; die einzigen anderen "publish"-Worte
   im Blatt sind Kommentare, die vor `publish.yml` warnen. */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const BAU_YML = path.resolve(import.meta.dirname, "..", ".github/workflows/build.yml");

/**
 * Die Zeilen, die einen electron-builder-Aufruf fahren, und was sie ueber Veroeffentlichung sagen.
 * Erkannt wird das Kommando, nicht die Job-Ueberschrift: derselbe Aufruf kann in einem Schritt,
 * in einer `if`-Zeile oder nach `tee` stehen.
 */
function bauZeilen(yaml: string) {
  const out: { zeile: number; text: string; veroeffentlicht: boolean }[] = [];
  yaml.split("\n").forEach((roh, i) => {
    const m = /npm run build:(mac|win|linux)\b(.*)$/.exec(roh);
    if (!m) return;
    const rest = m[2];
    out.push({ zeile: i + 1, text: roh.trim(), veroeffentlicht: !/--publish\s+never\b/.test(rest) || /--publish\s+(always|on-tag|onpass)\b/.test(rest) });
  });
  return out;
}

describe("P146, die CI veroeffentlicht die Nicht-Mac-Pakete nicht", () => {
  it("ein Aufruf ohne --publish never gilt als Veroeffentlichung", () => {
    const funde = bauZeilen("      - run: npm run build:win -- --x64");
    expect(funde.length, "der Aufruf wurde nicht erkannt").toBe(1);
    expect(funde[0].veroeffentlicht, "ein Builder ohne --publish never wurde als sicher gelesen").toBe(true);
  });

  it("ein Aufruf mit --publish always gilt als Veroeffentlichung, auch neben never", () => {
    const funde = bauZeilen("      - run: npm run build:linux -- --publish always --x64 | tee log");
    expect(funde.length).toBe(1);
    expect(funde[0].veroeffentlicht, "der Publish-Schritt wurde uebersehen").toBe(true);
    // Die Kontrolle: dieselbe Zeile mit never ist sauber.
    expect(bauZeilen("      - run: npm run build:linux -- --publish never --x64 | tee log")[0].veroeffentlicht).toBe(false);
  });

  it("am echten Blatt: drei Builder-Aufrufe, und keiner veroeffentlicht", () => {
    const yaml = fs.readFileSync(BAU_YML, "utf8");
    const zeilen = bauZeilen(yaml);
    // Gemessen 01:58:03 MEZ: mac, linux, win — je einer. Wer einen vierten Bau erfindet, zieht
    // diese Zahl nach; die Zahl ist der Nenner, nicht die Nennung.
    expect(zeilen.length, `erkannte Builder-Aufrufe sind nicht mehr drei: ${zeilen.map((z) => z.zeile).join(",")}`).toBe(3);
    const falsch = zeilen.filter((z) => z.veroeffentlicht);
    expect(falsch.map((z) => `Zeile ${z.zeile}: ${z.text}`), "die CI veroeffentlicht ein Paket").toEqual([]);
  });

  it("die zwei Job-Namen, die die deutschsprachigen Release-Notes nennen, existieren", () => {
    const yaml = fs.readFileSync(BAU_YML, "utf8");
    const noten = fs.readFileSync(path.resolve(import.meta.dirname, "..", ".github/release-notes.md"), "utf8");
    const genannt = /`release-windows`, `release-linux`/.test(noten);
    expect(genannt, "die Release-Notes nennen zwei CI-Jobs — wenn sie verschwinden, muss das hier rot werden").toBe(true);
    for (const job of ["release-windows", "release-linux"]) {
      expect(yaml, `die deutschsprachigen Notes nennen den Job ${job}, den die CI nicht hat`).toContain(`  ${job}:`);
    }
  });
});
