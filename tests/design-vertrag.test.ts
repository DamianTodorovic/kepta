// Punkt 2 (Aufgabe #10, Leitung 5.11.2026 13:40 MEZ): `design/DESIGN.md` ist der Vertrag, die
// Wachen sind die Messung. Ein Vertrag, den kein Instrument prüft, ist Prosa; ein Instrument,
// dessen Regelname im Vertrag fehlt, ist eine Zahl ohne Verabredung.
//
// Dieser Fall koppelt beide Richtungen:
//   1. jeder Regel-Sitz aus `scripts/design-wache.mjs` muss im Vertrag stehen,
//   2. jedes Instrument, das der Vertrag nennt, muss existieren.
//
// Erwartung VOR dem Vertrag: rot — die Datei `design/DESIGN.md` gab es bis heute nicht
// (gemessen 13:38 MEZ: `ls kepta-app/design` -> kein Ordner).
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const WURZEL = process.cwd();
const vertrag = path.join(WURZEL, "design", "DESIGN.md");
const wache = path.join(WURZEL, "scripts", "design-wache.mjs");

describe("Punkt 2: der Design-Vertrag hält zu seiner Wache", () => {
  it("existiert als Blatt", () => {
    expect(existsSync(vertrag), "design/DESIGN.md fehlt — es gibt keinen Vertrag, gegen den geprüft werden kann").toBe(true);
    const text = readFileSync(vertrag, "utf-8");
    expect(text.length, "ein Vertrag mit 200 Bytes ist keine Verabredung").toBeGreaterThan(3000);
  });

  it("nennt jeden Regel-Sitz, den die Wache rechnet", () => {
    const sitzText = readFileSync(wache, "utf-8");
    const sitze = [...sitzText.matchAll(/\["((?:css|schrift|icons|typfarben|farbe):[a-zöüßä:-]+)"/g)].map((m) => m[1]);
    // Der Boden ist keine Schuldzahl, die mit den Jahren fallen muss: gemessen 5.11.2026
    // 20:46 MEZ waren es drei Sitze, weil zwei Schulden getilgt sind (Größen und Gewichte in
    // den Bausteinen). Ein Boden "mehr als 3" hätte die Tilgung rot gemeldet. Also wird die
    // Form geprüft: die Blende muss die beiden strukturellen Sitze sehen, sonst ist das
    // Muster oder die Datei kaputt -- bei null Treffern wäre sie es.
    expect(sitze, "die Wache nennt keine Regel-Sitze — Muster oder Datei ist kaputt").toEqual(
      expect.arrayContaining(["css:klassen-waisen", "icons:groesse-fremd"]));
    const text = readFileSync(vertrag, "utf-8");
    const fehlend = sitze.filter((s) => !text.includes(s));
    expect(fehlend, `diese Regel-Sitze der Wache stehen in keinem Vertrag: ${fehlend.join(", ")}`).toEqual([]);
  });

  it("zitiert nur Instrumente, die es gibt", () => {
    const text = readFileSync(vertrag, "utf-8");
    const zitiert = [...text.matchAll(/`(scripts|tests)\/([A-Za-z0-9._/-]+?\.(?:mjs|cjs|ts|tsx))`/g)]
      .map((m) => `${m[1]}/${m[2]}`);
    expect(zitiert.length, "der Vertrag nennt keine Instrumente — dann hält ihn nichts").toBeGreaterThan(4);
    const fehlend = [...new Set(zitiert)].filter((p) => !existsSync(path.join(WURZEL, p)));
    expect(fehlend, `diese Instrumente nennt der Vertrag, aber sie existieren nicht: ${fehlend.join(", ")}`).toEqual([]);
  });

  // Die Zahl, die der Vertrag setzt, muss die Zahl sein, die die Wache hält — sonst steht im
  // Vertrag eine Latte, die niemand moren lässt.
  it("hat dieselbe Zahl toter Regeln wie die Wache", () => {
    const sitzText = readFileSync(wache, "utf-8");
    const sitz = /"css:klassen-waisen",\s*\{\s*sitze:\s*(\d+)/.exec(sitzText);
    expect(sitz, "die Wache hält keinen Sitz für css:klassen-waisen").toBeTruthy();
    const text = readFileSync(vertrag, "utf-8");
    expect(text, `der Vertrag nennt eine andere Zahl toter Regeln als die Wache (${sitz![1]})`)
      .toContain(`Sitz: ${sitz![1]} tote Regeln`);
  });
});
