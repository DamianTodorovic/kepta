/* Punkt 2, zweite Haelfte: die Leiter gilt auch in den Bausteinen.

   Gemessen 5.11.2026 19:24:27 MEZ am committeten Stand (git grep gegen HEAD, die 3.2.163-
   Bytes): `src/index.css` haelt die Leiter (acht Stufen, ganzzahlig, keine unter 11 px) und
   die Wache meldet dort null Willkuerwerte -- aber die Flaeche schrieb 248 Sitze als
   `text-[Npx]` in 17 Bausteinen, in 14 verschiedenen Werten, davon 65 auf halben
   Pixelschritten. 18.10. setzte dafuer drei Kante-Regeln
   ausserhalb der Tailwind-Ebenen, die im Browser alles auf die Leiter zurueckzwangen.
   Die Regeln halten die Wirkung, aber sie sind ein Flicken: der Vertrag heisst, dass der
   Baustein selbst die Stufe nennt. Diese Datei haelt genau das -- und zwar die Form,
   damit die Wache die Verhaeltnisse weiterrechnen kann. */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const WURZEL = path.resolve(import.meta.dirname, "..");

/** Alle Baustein-Dateien der Flaeche (index.css ist nicht der Gegenstand hier). */
function bausteine() {
  const aus = execFileSync("find", [path.join(WURZEL, "src"), "-name", "*.tsx", "-o", "-name", "*.ts"], { encoding: "utf8" });
  return aus.split("\n").filter(Boolean).map((p) => ({ rel: path.relative(WURZEL, p), text: fs.readFileSync(p, "utf8") }));
}

const MUSTER = [
  { name: "text-[Npx]", re: /text-\[([0-9.]+)px\]/g },
  { name: "fontSize: N", re: /fontSize:\s*["']?([0-9.]+)["']?/g },
  { name: "font-size: Npx", re: /font-size:\s*([0-9.]+)px/g },
];

function funde(text: string) {
  const out: { wert: number; muster: string }[] = [];
  for (const m of MUSTER) {
    m.re.lastIndex = 0;
    let e;
    while ((e = m.re.exec(text))) out.push({ wert: parseFloat(e[1]), muster: m.name });
  }
  return out;
}

describe("Punkt 2: die Schriftleiter gilt in den Bausteinen", () => {
  const dateien = bausteine();

  it("liest Bausteine, sonst prueft das hier nichts", () => {
    // Ohne Anker konnte ein leerer Fund als "sauber" durchgehen.
    expect(dateien.length).toBeGreaterThan(30);
  });

  it("kein Baustein schreibt eine Schriftgroesse als Willkuerwert", () => {
    const sitze = dateien
      .map((d) => funde(d.text).map((f) => `${d.rel}: ${f.muster} ${f.wert}px`))
      .flat();
    expect(sitze, `${sitze.length} Sitze ausserhalb der Leiter:\n  ${sitze.slice(0, 12).join("\n  ")}`).toEqual([]);
  });

  it("keine halben Pixelschritte in der Flaeche", () => {
    const halbe = dateien
      .map((d) => funde(d.text).filter((f) => !Number.isInteger(f.wert)).map((f) => `${d.rel}: ${f.wert}px`))
      .flat();
    expect(halbe, `${halbe.length} halbe Schritte: ${halbe.slice(0, 8).join(", ")}`).toEqual([]);
  });

  it("kein Baustein ruft eine Tailwind-Stufe, die unsere Leiter nicht kennt", () => {
    // text-sm (14), text-xs (12) und text-base (16) treffen eine Leiterstufe -- sie nennen sie
    // sie nennen sie nur unter Tailwinds Namen. text-lg (18) und text-3xl (30) treffen keine:
    // gemessen 5.11.2026 19:27:14 MEZ im Fenster als "18px :: text-lg" in den Statistik-Kaesten.
    const verboten = /\btext-(2xl|3xl|4xl|5xl|lg|xl)\b/g;
    const sitze = dateien.map((d) => (d.text.match(verboten) ?? []).map(() => d.rel)).flat();
    expect(sitze, `${sitze.length} Sitze rufen eine fremde Stufe: ${[...new Set(sitze)].join(", ")}`).toEqual([]);
  });

  it("kein Baustein ruft ein Gewicht, das eine nicht-variable Schrift nicht hat", () => {
    // Die Leiter kennt 400/600/700 (--fw-ruhig/halbfest/fest). Tailwinds font-medium ist 500:
    // auf macOS (variable System-Schrift) sichtbar, auf Windows (statische Segoe UI) kollabiert
    // es auf 400 -- dasselbe Produkt, zwei Hierarchien. Gemessen 5.11.2026 20:43 MEZ:
    // 77 Sitze in 19 Bausteinen, davon 34 an Steuern, 26 an Fliesstext, 17 andere.
    const verboten = /\bfont-(thin|extralight|light|medium)\b/g;
    const sitze = dateien.map((d) => (d.text.match(verboten) ?? []).map((w) => `${w} in ${d.rel}`)).flat();
    expect(sitze, `${sitze.length} Sitze rufen eine Zwischenstufe: ${[...new Set(sitze.map((x) => x.split(" in ")[0]))].join(", ")}`).toEqual([]);
  });

  it("kein Baustein nennt eine Leiterstufe unter dem Namen des Rahmenwerks", () => {
    // P84: text-xs (12), text-sm (14) und text-base (16) treffen fs-2, fs-4 und fs-5 -- sie
    // nennen sie nur fremd, und der Vertrag heisst, dass der Baustein die Stufe selbst nennt.
    // Gemessen 6.11.2026 01:13:19 MEZ: 262 Sitze in 18 Bausteinen (xs 127, sm 129, base 6),
    // der groesste Haufen in Settings.tsx (82). Der Sitz, der 3.2.173 schon bewegt hat, ist
    // text-xl -- die Zeile oben gateet ihn, diese gateet die drei Leiter-Treffer.
    const verboten = /\btext-(xs|sm|base)\b/g;
    const sitze = dateien.map((d) => (d.text.match(verboten) ?? []).map(() => d.rel)).flat();
    expect(sitze, `${sitze.length} Sitze nennen die Stufe fremd: ${[...new Set(sitze)].join(", ")}`).toEqual([]);
  });

  it("kein Baustein ruft eine Zeilenmasse, die nicht im Vertrag steht", () => {
    // P84: Tailwind bringt eigene Zeilenmassen mit (leading-relaxed 1,625, snug 1,375, none 1)
    // und als Klammerwert jede Willkuerzahl (leading-[1.75] an zwei Stellen in der Vorschau).
    // Der Vertrag kennt vier: lh-dicht 1,24, lh-lesbar 1,55, lh-prosa 1,65, lh-marke 1.
    // Gemessen 6.11.2026 01:13:19 MEZ: 38 benannte Sitze (relaxed 33, snug 3, none 2) und
    // 01:22:31 MEZ zwei Klammer-Sitze in MemoryPreview.tsx -- Rundung wird am Token gerundet,
    // nicht an der Zeile, also geht 1,75 auf lh-prosa.
    const verboten = /\bleading-(?:[a-z0-9]+|\[[^\]]+\])/g;
    const sitze = dateien.map((d) => (d.text.match(verboten) ?? []).map((w) => `${w} in ${d.rel}`)).flat();
    expect(sitze, `${sitze.length} Sitze rufen eine fremde Zeilenmasse: ${[...new Set(sitze.map((x) => x.split(" in ")[0]))].join(", ")}`).toEqual([]);
  });

  it("Biss-Kontrolle: ein Willkuerwert und ein halber Schritt werden getroffen", () => {
    const sonde = funde('<div className="text-[12.5px]" style={{ fontSize: 13 }}>');
    expect(sonde.length).toBe(2);
    expect(sonde.some((f) => f.wert === 12.5 && !Number.isInteger(f.wert))).toBe(true);
    // und ein Leiterwert in Token-Form faellt durch beide Raster
    expect(funde('<div className="fs-3 leading-none">')).toEqual([]);
    expect("text-lg".match(/\btext-(2xl|3xl|4xl|5xl|lg|xl)\b/g)).toEqual(["text-lg"]);
    // P83: text-xl (20 px) ist seit 3.2.173 verboten -- der eine Sitz heisst fs-6 lh-dicht.
    expect("text-xl".match(/\btext-(2xl|3xl|4xl|5xl|lg|xl)\b/g)).toEqual(["text-xl"]);
    expect("font-medium".match(/\bfont-(thin|extralight|light|medium)\b/g)).toEqual(["font-medium"]);
    // P84: die beiden neuen Zaehle greifen an einem Probesitz, und ein Probesatz in einem
    // String ohne Wortgrenze faellt nicht durch (context-sm enthaelt text-sm, ist aber keins).
    expect("text-xs text-sm text-base".match(/\btext-(xs|sm|base)\b/g)).toEqual(["text-xs", "text-sm", "text-base"]);
    expect("leading-relaxed leading-snug leading-none leading-[1.75]".match(/\bleading-(?:[a-z0-9]+|\[[^\]]+\])/g))
      .toEqual(["leading-relaxed", "leading-snug", "leading-none", "leading-[1.75]"]);
    expect("context-sm text-xsomething".match(/\btext-(xs|sm|base)\b/g)).toBeNull();
  });
});
