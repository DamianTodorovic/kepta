// Punkt 5 / Aufgabe #63: die Achse, an der die Liste gruppiert, ist gemessen und gewaehlt.
//
// Gemaess 5.11. 15:38:17 bis 15:38:59 MEZ an seinem Bestand durch die eigne Tuer der
// laufenden Auslieferung (21 064 Notizen): die Themen-Achse teilt in vier Faelle zwischen
// 7,90 und 48,38 % (events, projects, links, guides), 3 156 Notizen (14,98 %) tragen gar
// kein Thema, und der Traeger teilt nur in zwei Haelften (51,08 / 48,48 %). Tags sind an
// seinem Bestand Staub (30.10.: 95,17 % tragen kein Wort). Also: Gruppe nach Thema, und
// das Fach "kein Thema" ist eine benannte Gruppe, kein Rest.
//
// Die Zahl in einem Gruppenkopf muss dieselbe Menge zaehlen wie die Achsenzahl an der
// Seitenleiste -- die Route (server/router/memories.ts:299) zaehlt eine Notiz in JEDES
// ihrer Themen. Gruppiert die Flaeche nur nach dem ersten, stuenden zwei Zahlen
// desselben Wortes da, ohneerklaarten Unterschied. Dieser Fall haelt die Regel fest.
import { describe, it, expect } from "vitest";
import { themenFaecher, gruppenVonNotiz } from "../../src/lib/graphHierarchy";

describe("Themen-Faecher: dieselbe Menge wie die Achsenzahl der Tuer", () => {
  it("jedes Thema der Notiz wird ein eigner Fach-Schluessel, keins faellt unter den Tisch", () => {
    // Nicht erraten, sondern nachgerechnet: die Erwartung ist die Themenliste derselben
    // Klassifikations-Rechnung, die auch die Tuer zaehlt. Der Fall kann verlieren, wenn
    // t: nur das erste Fach nimmt, ein Thema verdoppelt oder eines verliert.
    for (const notiz of [
      { title: "Zahlung plan Alpha", content: "IBAN DE89 3704 0044 0532 0130 00, word: Hunter2!", tags: ["people"] },
      { title: "Weekly sync with Ana", content: "met ana about the migration, next steps: run the scan, read https://example.com/m", tags: ["events"] },
      { title: "Leere", content: "", tags: [] },
    ]) {
      const g = gruppenVonNotiz(notiz);
      const f = themenFaecher(notiz);
      expect(f, JSON.stringify(notiz.title)).toEqual(g.themen.length ? g.themen.map((t) => `thema:${t}`) : ["ohne-thema"]);
      expect(new Set(f).size, `ein Fach zweimal bei ${notiz.title}`).toBe(f.length);
    }
  });

  it("eine Notiz ohne jedes Thema faellt in die benannte Gruppe, nicht durchs Raster", () => {
    const f = themenFaecher({ title: "Nur ein Satz ohne jedes Signal", content: "ein Satz, kein Fach, kein Pfad", tags: [] });
    expect(f).toEqual(["ohne-thema"]);
  });

  it("Biss: die leere Notiz hat ein Fach, damit keine Zahl verlscht", () => {
    expect(themenFaecher({ title: "", content: "", tags: [] })).toEqual(["ohne-thema"]);
  });

  it("die Schluessel tragen den Achsen-Namen, damit Kopf und Seitenleiste dieselbe Sprache reden", () => {
    const f = themenFaecher({ title: "How to set up the scanner", content: "steps: plug it in, scan, check", tags: ["guide"] });
    expect(f.every((k) => k === "ohne-thema" || k.startsWith("thema:"))).toBe(true);
  });
});
