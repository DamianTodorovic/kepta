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

  it("Biss-Kontrolle: ein Willkuerwert und ein halber Schritt werden getroffen", () => {
    const sonde = funde('<div className="text-[12.5px]" style={{ fontSize: 13 }}>');
    expect(sonde.length).toBe(2);
    expect(sonde.some((f) => f.wert === 12.5 && !Number.isInteger(f.wert))).toBe(true);
    // und ein Leiterwert in Token-Form faellt durch beide Raster
    expect(funde('<div className="fs-3 leading-none">')).toEqual([]);
  });
});
