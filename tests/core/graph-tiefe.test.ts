// @vitest-environment node
// Punkt 125 — die Tiefenstufe der Graph-Abfrage bewegt das Fenster nicht.
//
// Gemessen 05:28 Uhr am installierten 3.2.83 an einer Kapsel mit 21 000 Notizen
// (Mappe: audit-2026-10-09/feldzug/BEFUND-124-FENSTER-2910.md): vier Rufe
// `/api/graph?depth=1|2|3|4` antworten **auf die Byte gleich** — 470 506 B, 500 Begiffe,
// 2 000 Kanten. Der Grund sitzt im Kern: `depth` wird nur im Entity-Zweig benutzt, der
// Weg ohne Startpunkt waechst ungebremst ueber Kanten bis an die Kappe von 500.
//
// Die Flaeche zeigt derweil eine Stufe mit dem Wort "How many steps the picture asks the
// door for around each concept". Ein Regler, der nichts veraendert, ist schlechter als
// kein Regler: er bringt einem Nutzer bei, dass unsere Knoepfe nichts bedeuten.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../../src/core/store";

process.env.KEPTA_NO_AUTOSTART = "1";
process.env.KEPTA_ENCRYPTION = "off";

let dir = "";
let store: KeptaStore | undefined;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-tiefe-"));
  process.env.KEPTA_DATA_DIR = dir;
  store = new KeptaStore(path.join(dir, "t.db")) as unknown as KeptaStore;
});

afterEach(() => {
  (store as unknown as { close?: () => void })?.close?.();
  fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * Ein Bestand, in dem die Tiefe etwas entscheidet. Drei Dinge müssen zusammenkommen,
 * und das ist der Grund, warum dieser Fall zweimal umgebaut wurde:
 *
 * 1. Die Kettenglieder müssen in der **Rangliste bleiben** (der Pool sind 4 000 Begriffe) —
 *    sonst ist keine Kante zu ihnen im Adjazenzbild, und keine Stufe kann sie erreichen.
 *    Mit 4 200 Fuell-Begiffen war genau das der Fall: Kette 1, in jeder Stufe.
 * 2. Sie dürfen **nicht selbst Samen** sein — die Kette muss tiefer rangieren als die
 *    Fuellung, sonst holt die Rangfuellung jedes Glied herein und die Stufe ist unsichtbar.
 *    Erste Fassung (ein Traeger je Glied, Fuellung ohne Kanten): 20 von 21 Gliedern in
 *    jeder Stufe, gemessen 06:14 Uhr.
 * 3. Die Kappe von 500 muss **vor** der Fuellung greifen, damit die Kette nur ueber
 *    Spruenge vom bedeutsamen Kopf zu sehen ist.
 *
 * Darum: 1 200 Fuell-Begiffe zu je zwei Traegern und sechs Kantenenden (zusammen 1 221
 * Begiffe — unter dem Pool, ueber der Kappe), eine Kette von 21 Begiffen zu je einem
 * Traeger, und am Kopf der Kette 40 Traeger, damit er der erste Same ist.
 */
function ketteUndFuellung(s: KeptaStore) {
  const KETTE = 21;
  for (let i = 0; i < KETTE - 1; i++) {
    const m = s.createMemory({ title: `Glied ${i}`, content: "x", type: "semantic" } as never);
    s.linkEntities(m.id, [`k${i}`, `k${i + 1}`]);
    s.addRelation(`k${i}`, `k${i + 1}`, "mentions", m.id);
  }
  for (let i = 0; i < 40; i++) {
    const m = s.createMemory({ title: `Kopf ${i}`, content: "x", type: "semantic" } as never);
    s.linkEntities(m.id, ["k0"]);
  }
  for (let doppelt = 0; doppelt < 2; doppelt++) {
    for (let i = 0; i < 1200; i += 4) {
      const m = s.createMemory({ title: `Fuellung ${i}-${doppelt}`, content: "x", type: "semantic" } as never);
      s.linkEntities(m.id, [`f${i}`, `f${i + 1}`, `f${i + 2}`, `f${i + 3}`]);
      for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) s.addRelation(`f${i + a}`, `f${i + b}`, "mentions", m.id);
    }
  }
}

function gliederImFenster(s: KeptaStore, tiefe: number): number[] {
  return s.getGraph(undefined, tiefe).entities.map((e) => e.name)
    .filter((n) => /^k\d+$/.test(n))
    .map((n) => Number(n.slice(1)))
    .sort((x, y) => x - y);
}

describe("getGraph: die Tiefenstufe entscheidet, wie weit das Fenster waechst", () => {
  it("jede Stufe reicht genau einen Sprung weiter die Kette hinunter", () => {
    ketteUndFuellung(store!);
    // Kopf (k0) ist in jeder Stufe der Same; was dahinter liegt, ist die Stufe selbst.
    expect(gliederImFenster(store!, 1), "Stufe 1").toEqual([0, 1]);
    expect(gliederImFenster(store!, 2), "Stufe 2").toEqual([0, 1, 2]);
    expect(gliederImFenster(store!, 3), "Stufe 3").toEqual([0, 1, 2, 3]);
    expect(gliederImFenster(store!, 4), "Stufe 4").toEqual([0, 1, 2, 3, 4]);
  });

  it("keine Stufe liefert mehr als die Kappe, und keine bleibt unter ihr", () => {
    ketteUndFuellung(store!);
    for (const tiefe of [1, 2, 3, 4]) {
      const { entities } = store!.getGraph(undefined, tiefe);
      expect(entities.length, `Tiefe ${tiefe} verlaesst die Kappe von 500`).toBe(500);
    }
  });

  it("der bedeutsame Kopf der Kette bleibt in jeder Stufe, auch ausserhalb der Kappe", () => {
    ketteUndFuellung(store!);
    for (const tiefe of [1, 4]) {
      const { entities } = store!.getGraph(undefined, tiefe);
      expect(entities.map((e) => e.name), `Tiefe ${tiefe} verliert den Kopf mit 40 Traegern`).toContain("k0");
    }
  });

  it("eine Stufe ausserhalb der Grenze klemmt auf die aeusserste, statt ein Fenster zu erfinden", () => {
    ketteUndFuellung(store!);
    expect(gliederImFenster(store!, 0), "Stufe 0 klemmt auf 1").toEqual(gliederImFenster(store!, 1));
    expect(gliederImFenster(store!, 9), "Stufe 9 klemmt auf 4").toEqual(gliederImFenster(store!, 4));
  });
});
