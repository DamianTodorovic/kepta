/* P183 (#44): die Search-Model-Zeile in den Settings trägt ihre Messung.
   Der 2.11-Selbstblick riß Sprachversprechen ohne Lauf aus der Fläche; seit dem
   3.11 hält die Wache jede Sprach-Zeile auf eine Zahl. Diese Zeile kommt mit
   ihrer Zahl zurück — gemessen am ausgelieferten Baum (P181/P182,
   15 Anfrage-Paare, englische Frage gegen deutsche Notizen; je Stufe zwei
   bytegleiche Läufe): nomic 4 of 15 über die Sprachlinie (9 of 15 in ihr),
   bge-m3 10 of 15 über die Linie (9 of 15 in ihr, nach der P182-Regel).
   Kein Button wird versprochen: der Wechsel kostet die Re-Einbettung des
   ganzen Bestands — der Satz nennt das. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const text = readFileSync(path.join(process.cwd(), "src/components/Settings.tsx"), "utf8");

describe("Fläche: die Search-Model-Zeile nennt die gemessenen Zahlen", () => {
  it("nomic- und bge-Zeile tragen ihre n of m-Zahlen", () => {
    expect(text).toContain("4 of 15");
    expect(text).toContain("9 of 15");
    expect(text).toContain("10 of 15");
    expect(text).toContain("bge-m3");
  });

  it("die Zeile wird über die Health-Einbett-Modelle gesteuert, nicht hart gerendert", () => {
    expect(text).toContain("embeddings?.models");
    expect(text).toContain('data-testid="such-modell"');
    // Der Re-Einbettungs-Preis steht im Satz — kein Button-Versprechen.
    expect(text).toContain("re-embeds your whole store once");
  });
});
