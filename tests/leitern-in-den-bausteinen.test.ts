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

  it("kein Baustein malt eine Farbe aus der Rahmenwerk-Palette", () => {
    // P86: der Vertrag nennt jede Farbe -- Tinte, Tisch, Panel, Blatt, Knopf, Kante, Warn, Zu.
    // Tailwinds Palette (white, black, zinc-*, gray-*) steht ausserhalb davon. Gemessen
    // 6.11.2026 01:12:21 und 02:16:47 MEZ: **18 Sitze in 6 Bausteinen** (bg-white 11,
    // bg-zinc-800 4, text-white 1, text-zinc-900 1, text-zinc-100 1) -- und dazu eine
    // Gefahr-Stelle in einer andern Familie (border-red-500/40), die unten benannt bleibt.
    // Die eine Ausnahme ist keine Bequemlichkeit, sie ist eine offene Stelle mit Namen:
    // dem Vertrag fehlt eine Gefahr-Farbe, und die wird mit Kontrastmessung gesetzt, nicht
    // aus dem Rahmenwerk gegriffen. Die Liste wird gezaehlt und gedruckt -- wer sie still
    // erweitert, sieht den Lauf fallen.
    const verboten = /\b(?:bg|text|border|ring|from|to|via|divide|placeholder)-(?:white|black|zinc-\d+|gray-\d+|neutral-\d+|slate-\d+)\b/g;
    const sitze = dateien.map((d) => (d.text.match(verboten) ?? []).map((w) => `${w} in ${d.rel}`)).flat();
    expect(sitze, `${sitze.length} Sitze malen aus der Palette: ${[...new Set(sitze)].join(", ")}`).toEqual([]);

    // Die offene Stelle, mit Namen und Zahl -- keine Toleranzliste, die schweigt.
    const gefahr = /\b(?:bg|text|border)-(?:red|rose|orange|amber)-\d+(?:\/\d+)?\b/g;
    const offen = dateien.map((d) => (d.text.match(gefahr) ?? []).map((w) => `${w} in ${d.rel}`)).flat();
    expect(offen, `offene Gefahr-Stellen: ${offen.join(", ")}`).toEqual(["border-red-500/40 in src/components/Chat.tsx"]);
  });

  it("kein Baustein ruft eine Klasse, die das Haus nicht malt", () => {
    // P88: am ausgelieferten 3.2.176 gemessen 03:29:51 MEZ -- 455 gerufene Klassenwoerter
    // gegen 1537 Regeln im ausgelieferten CSS, und drei Woerter fanden keine Regel:
    // `prose`, `prose-sm` (Chat.tsx:1052) und `group/code` (Chat.tsx:1110). Das dritte ist
    // ein Marker des Rahmenwerks, der nie eine eigne Regel hat -- er wird in der Wache
    // gezaehlt und gedruckt, nicht verschluckt. Die zwei andern waren Ueberreste eines
    // Typography-Plugins, der nie eingetragen war: die Regel, die die Antwort wirklich
    // malt, heisst `.chat-prose` (src/index.css:664). Ein Name ohne Regel ist eine
    // Verabredung, die niemand haelt -- und der naechste Leser haelt sie fuer Stil.
    const rufer = dateien
      .map((d) => [...d.text.matchAll(/class(?:Name)?\s*=\s*(?:\{)?\s*["'`]([^"'`]*)["'`]/g)]
        .flatMap((m) => m[1].split(/\s+/))
        .filter((w) => /^(prose|prose-sm|prose-lg|prose-xl)$/.test(w))
        .map(() => d.rel))
      .flat();
    expect(rufer, `${rufer.length} Sitze rufen Typography-Klassen ohne Regel: ${[...new Set(rufer)].join(", ")}`).toEqual([]);
    // Biss-Kontrolle: derselbe Zaehler trifft einen Probesitz.
    const probe = [...'className="chat-prose prose prose-sm max-w-none"'.matchAll(/class(?:Name)?\s*=\s*["'`]([^"'`]*)["'`]/g)]
      .flatMap((m) => m[1].split(/\s+/)).filter((w) => /^(prose|prose-sm)$/.test(w));
    expect(probe).toEqual(["prose", "prose-sm"]);
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
    // P86: das Farb-Raster trifft auch die dunkle Gabelung, und ein Token-Name faellt nicht durch.
    expect("bg-white dark:bg-zinc-800 text-zinc-100".match(/\b(?:bg|text|border|ring|from|to|via|divide|placeholder)-(?:white|black|zinc-\d+|gray-\d+|neutral-\d+|slate-\d+)\b/g))
      .toEqual(["bg-white", "bg-zinc-800", "text-zinc-100"]);
    expect("bg-knopf bg-blatt text-tinte".match(/\b(?:bg|text|border|ring|from|to|via|divide|placeholder)-(?:white|black|zinc-\d+|gray-\d+|neutral-\d+|slate-\d+)\b/g)).toBeNull();
  });
});
