// Geruestwoerter der Papierform werden keine Begriffe — gemessen an seinem Bestand.
//
// A1x hat am 15.10.2026 um 18:3x MESZ die 500 Begriffsnamen seiner laufenden Tuer gegen
// die Leseregel gehalten (Beleg: Arbeitsmappe `audit-2026-10-09/belege-15-10/a1x/
// geruestwort-tuer.log.txt`). 17 von 500 = 3,4 % sind Abschnittslabels statt Inhalt:
// die deutschen aus Persona- und Dossier-Notizen, die englischen aus importierten
// READMEs und SECURITY.md-Dateien dritter Projekte.
//
// Dieselbe Messung zeigt, wo sie reinkamen: bei einer `mentions`-Kante ist die Quelle
// immer der Notiztitel (`src/core/store.ts:983`), und keiner der 17 Namen stand je auf
// der Quellseite — alle 17 kamen ueber den Leseweg. Die Liste in `src/core/begiffe.ts`
// ist also genau die Stelle, die die Messung offen hat. Der Titelknoten bleibt eine
// eigene, bewusste Offene (`src/core/store.ts:976`) und ist hier nicht die Aufgabe.
//
// Warum eine Liste und keine Laengenschere: die gemessenen Namen sind 5 bis 25 Zeichen
// lang, mittel 13,3 — sie liegen mitten in der Spanne echter Begriffe. `fristenkontrolle`
// hat 14 Zeichen, `security policy` 15; eine Schere nach Zeichenzahl traefe beide.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";
import { indexMemory } from "../src/core/engine";
import { begriffeAusText } from "../src/core/begiffe";

// Wortfuertlich die 17 Namen aus dem Belegprotokoll, in seiner Reihenfolge.
const GERUEST = [
  "ablauf",
  "was gut funktioniert",
  "bewertungen",
  "security policy",
  "documentation",
  "gesamturteil",
  "known limitations",
  "scope",
  "reporting",
  "executive summary",
  "consequences",
  "befunde",
  "not in scope",
  "supported versions",
  "reporting a vulnerability",
  "how to report",
  "what to expect",
];

function freshStore(): KeptaStore {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-geruest-"));
  return new KeptaStore(path.join(dir, "test.db"));
}

const ueberschriften = GERUEST.map((n) => `## ${n}`).join("\n\n");

describe("Geruestwoerter: die 17 gemessenen Namen bleiben draussen", () => {
  it("keiner der 17 kommt als Ueberschrift durch die Leseregel", () => {
    const durch = begriffeAusText(ueberschriften).filter((b) => GERUEST.includes(b));
    expect(durch).toEqual([]);
  });

  it("keiner der 17 kommt als Wiki-Link durch die Leseregel", () => {
    const texte = GERUEST.map((n) => `Ein Verweis auf [[${n}]] in einem Satz.`).join("\n\n");
    const durch = begriffeAusText(texte).filter((b) => GERUEST.includes(b));
    expect(durch).toEqual([]);
  });

  describe("an der Schreibe: keiner der Gemessenen wird je ein Knoten", () => {
    let store: KeptaStore;
    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
      store = freshStore();
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      store.close();
    });

    it("eine Notiz aus lauter Geruest-Ueberschriften setzt keinen dieser Knoten", () => {
      const m = store.createMemory({ title: "Dossier Praxis", content: ueberschriften });
      indexMemory(store, m.id);
      const knoten = new Set(store.getGraph().entities.map((e) => e.name.toLowerCase()));
      const durch = GERUEST.filter((n) => knoten.has(n));
      expect(durch).toEqual([]);
      expect(knoten.has("dossier praxis")).toBe(true);
    });
  });

  describe("Kontrolle: die Sperre ist exakt, nicht Teilwort und nicht Laenge", () => {
    it("Begriffe, die ein Geruestwort nur fuehren, bleiben Begriffe", () => {
      const texte =
        "## Ablauf der Frist\n\n## Security Review\n\n## Reporting tools\n\n## Bewertung der Anbieter\n";
      const b = begriffeAusText(texte);
      for (const ok of ["ablauf der frist", "security review", "reporting tools", "bewertung der anbieter"]) {
        expect(b, `${ok} muss Begriff bleiben`).toContain(ok);
      }
    });

    it("echte Begriffe liest die Regel weiter — Ueberschrift und Wiki-Link", () => {
      const b = begriffeAusText("## Fristenkontrolle\n\nWir ziehen [[Q4 Close]] nach.\n");
      expect(b).toContain("fristenkontrolle");
      expect(b).toContain("q4 close");
    });

    it("ein gemessener Name ist gesperrt, seine Form daneben nicht", () => {
      expect(begriffeAusText("## Befunde")).not.toContain("befunde");
      expect(begriffeAusText("## Befund der Woche")).toContain("befund der woche");
    });
  });
});
