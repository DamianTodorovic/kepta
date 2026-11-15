// Eine Sprachbehauptung auf der Flaeche muss ihre Messung nennen.
//
// Anlass (Selbstblick 2.11., Messung und Ablieferung 3.11.): zwei Saetze der Flaeche
// verkauften das Vektor-Bein als sprachuebergreifend — `Settings.tsx` ("Semantic
// similarity across languages") und `SystemStatus.tsx` ("with vectors it is stronger
// across languages too"). Keiner von beiden hatte je einen Lauf hinter sich. Der Lauf
// jetzt (15 Anfrage-Paare, englische Frage gegen deutsche Notizen, Ziele aus dem
// Fixkorpus geerbt): 4 von 15 Treffern mit Vektoren, 2 von 15 ohne — gemeldet in
// `docs/belege/tag-0311/sprachuebergriff-nomic-1406.log.txt`, und das mehrsprachige
// Modell `bge-m3`, das die README seit 13.9. empfiehlt, findet 3 von 15
// (`sprachuebergriff-bge-m3-1406.log.txt`). Die Woerter sind daraus gefallen.
//
// Diese Wache haelt das offen: sie prueft nicht auf ein Verbotswort, sondern darauf, ob
// jede Zeile, die ueberhaup von language redet, ihre Zahl mitfuehrt. Wer die Behauptung
// zurueckholt, muss sie belegen — oder der Fall bleibt rot.
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const wurzel = process.cwd();
const lies = (rel: string) => readFileSync(path.join(wurzel, rel), "utf8");

/**
 * Flaechen-Zeilen, die von Sprache reden, ohne ihre Messung zu nennen.
 * Ein Stringliteral mit "language" muss eine Zahl der Form "n of m" tragen — die Zahl,
 * die der Beleg meldet. Alles andere ist ein Wunsch in der Oberflaeche.
 */
function sprachzeilenOhneZahl(text: string): string[] {
  const treffen: string[] = [];
  for (const m of text.matchAll(/'([^']{0,400}[Ll]anguage[^']{0,400})'/g)) {
    const satz = m[1]!;
    if (!/\d+\s*of\s*\d+/.test(satz)) treffen.push(satz.trim().slice(0, 120));
  }
  return treffen;
}

const DATEIEN = ["src/components/Settings.tsx", "src/components/SystemStatus.tsx"];

describe("Flaeche: eine Sprachbehauptung nennt ihre Messung", () => {
  it("kein Satz der beiden Flaechen behauptet Sprachkenntnis ohne Zahl", () => {
    for (const datei of DATEIEN) {
      const fehlen = sprachzeilenOhneZahl(lies(datei));
      expect(fehlen, `${datei} behauptet Sprache ohne Beleg: ${fehlen.join(" | ")}`).toEqual([]);
    }
  });

  it("die zwei alten Saetze sind aus dem Quelltext gefallen", () => {
    const text = DATEIEN.map((d) => lies(d)).join("\n");
    expect(text).not.toMatch(/across languages/i);
    expect(text).not.toMatch(/stronger across languages/i);
    expect(text).not.toMatch(/multilingual/i);
  });

  it("der pruefer sieht eine Behauptung, die ohne Zahl dasteht", () => {
    // Gegenprobe: ohne sie waere der erste Fall eine Beschreibung eines Zustands,
    // den niemand aendern kann.
    const zurueck = "<span>'Semantic similarity across languages'</span>";
    expect(sprachzeilenOhneZahl(zurueck), "die Wache laesst die alte Behauptung durch").toEqual([
      "Semantic similarity across languages",
    ]);
    // Und mit Zahl laesst sie der Pruefer durch — die Messung darf genannt werden.
    const belegt = "<span>'across languages it found 4 of 15'</span>";
    expect(sprachzeilenOhneZahl(belegt)).toEqual([]);
  });

  it("der Beleg hinter der Zahl liegt im Repo und ist geoeffnet worden", () => {
    // Die Zahl auf der Flaeche (4 von 15) ist ohne ihren Beleg dasselbe wie vorher:
    // ein Satz, den niemand nachpruefen kann.
    const belegt = lies("docs/belege/tag-0311/sprachuebergriff-nomic-1406.log.txt");
    expect(belegt, "der Sprach-Beleg nennt keine Hit@1-Zeile — diese Wache ist taub").toMatch(/Hit@1\s+26\.7 %/);
    expect(belegt).toMatch(/15 Anfrage-Paare/);
    const zweiter = lies("docs/belege/tag-0311/sprachuebergriff-bge-m3-1406.log.txt");
    expect(zweiter, "der bge-m3-Lauf nennt keine Hit@1-Zeile").toMatch(/Hit@1\s+20\.0 %/);
  });
});
