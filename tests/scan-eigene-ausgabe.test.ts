// @vitest-environment node
//
// #83r — Aufnahmeprozess: K3PTA darf seine eigene Ausgabe nicht nochmal aufnehmen.
//
// Gemessen an Damians Bestand (lesend durch seine Tuer, 14.10. 23:5x): von den 500
// Begriffen seines Graph-Fensters sind **68 wortgleich in Papieren dieser Arbeitsmappe**,
// und die Papiere dahinter heissen `HERZSCHLAG.md`, `KEPTA-KOMPENDIUM-2026-10-13.md`,
// `audit-2026-10-09/*` — und `NOTFALL-SICHERUNG-22-9/markdown-export-3644/`. Der letzte
// Pfad ist ein **Export von K3PTA selbst**: Notizen, die als Markdown auf die Platte
// geschrieben und dann vom Rechner-Scan wieder eingesammelt wurden. Dasselbe Papier steht
// dann zweimal im Bestand, und seine Ueberschriften werden zu Begriffen eines anderen
// Papiers. Das ist kein Filterproblem in Prozent, das ist eine Aufnahmefrage.
//
// Die Heilung darum an der Schwelle, nicht am Wort: Ordner, deren Name die Signatur
// einer eigenen Ausgabe traegt, bleiben aussen vor. Ein Ordner `Export`, `Exporte` oder
// `export-2026-04` ist dagegen echter Bestand und wird NICHT gesperrt — die Sperre ist
// die Signatur, nicht das Wort.
import { describe, it, expect } from "vitest";
import { istUebersprungenerOrdner, UEBERSPRUNGENE_ORDNER } from "../src/scan/regeln";

describe("#83r — eine eigene Ausgabe ist kein zweiter Bestand", () => {
  it("der Exportordner von 22.9, aus dem seine Begriffe stammen, bleibt aussen vor", () => {
    expect(istUebersprungenerOrdner("markdown-export-3644")).toBe(true);
  });

  it("der Exportpfad, den die Tuer selbst schreibt, bleibt aussen vor", () => {
    // server/router/system.ts:133 schreibt `export/kepta-export-<zeitmarke>`.
    expect(istUebersprungenerOrdner("kepta-export-1763107200000")).toBe(true);
    expect(istUebersprungenerOrdner("KEPTA-Export-1763107200000")).toBe(true);
    // Und in der neuen Schreibweise des Namenszugs.
    expect(istUebersprungenerOrdner("k3pta-export-1763107200000")).toBe(true);
  });

  it("ein echter Ordner mit dem Wort Export bleibt offen — die Sperre ist eine Signatur", () => {
    for (const name of ["Export", "export", "Exporte 2026", "export-2026-04", "Exports", "markdown-notizen"]) {
      expect(istUebersprungenerOrdner(name), `„${name}" ist kein Export von K3PTA, wird aber gesperrt`).toBe(false);
    }
  });

  it("die uebrigen Regeln gelten unveraendert weiter", () => {
    expect(istUebersprungenerOrdner("node_modules")).toBe(true);
    expect(istUebersprungenerOrdner(".git")).toBe(true);
    expect(istUebersprungenerOrdner("Papiere")).toBe(false);
    // Die Liste der Klarnamen wachse nicht um Signatur-Muster: die Muster leben in
    // ihrer eigenen Pruefung, sonst liest jemand `markdown-export-3644` als Wort.
    expect(UEBERSPRUNGENE_ORDNER.some((n) => n.includes("export"))).toBe(false);
  });
});
