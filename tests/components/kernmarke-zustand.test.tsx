// @vitest-environment jsdom
// #105 - die Sammelmarke darf nicht lautlos verschwinden.
//
// STAND: geschrieben 26.10.2026, 18:31 MEZ (+0100), an Kopf 9a58539 mit dem
// Koerper `p1-105-kernmarke-9a58539.patch` (Punkt 1). Erwartung OHNE den Koerper:
// alle vier Regel-Faelle ROT - die gelieferte Funktion kennt kein Feld `grund`
// und liefert bei null Knoten `NaN` als Ort, und die Legende nennt keinen Grund.
//
// WARUM OHNE EIN EINZIGES PIXEL: `kernMarke` ist exportiert und rein, der Zustand
// liegt als Wort in der Legende und als Feld an der Leinwand. Dieser Fall prueft
// Regel, Zustand und Wort. Was die Flaeche im Fenster malt, steht im Blatt
// `p1-105-kernmarke-2610.md` und wird am ausgelieferten Stueck gesehen.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  kernMarke,
  KERN_MARKE_AB_ZOOM,
  KERN_MARKE_MIN_KNOTEN,
} from "../../src/components/KnowledgeGraph";

const knoten = (n: number) => Array.from({ length: n }, (_, i) => ({ x: i * 10, y: i * 7 }));
// Eine Blende, bei der die Marke der Mechanismus ist, und eine darueber.
const KLEIN = KERN_MARKE_AB_ZOOM / 2;
const GROSS = KERN_MARKE_AB_ZOOM * 4;

describe("#105: die Marke meldet einen benannten Zustand statt Stille", () => {
  it("sieben Knoten im Bild: nicht 'weg', sondern 'zuwenig' - und die Zahl bleibt die des Bildes", () => {
    const r = kernMarke(KLEIN, knoten(KERN_MARKE_MIN_KNOTEN - 1));
    expect(r.marke, "bei sieben Knoten malt die Marke, wo sie doch abschaltet").toBe(false);
    expect(r.grund, `kein benannter Zustand zurueckgegeben, nur: ${JSON.stringify(r)}`).toBe("zuwenig");
    expect(r.zahl).toBe(KERN_MARKE_MIN_KNOTEN - 1);
    expect(Number.isFinite(r.wx), "der Ort ist kein Number").toBe(true);
  });

  it("acht Knoten im Bild: die Zahl erscheint, und sie zaehlt den Ausschnitt, nicht den Begriff", () => {
    const r = kernMarke(KLEIN, knoten(KERN_MARKE_MIN_KNOTEN));
    expect(r.grund).toBe("marke");
    expect(r.marke).toBe(true);
    // Der Ausschnitt ist die ganze Welt dieses Aufrufs. Ein Begriff mit 500
    // Knoten, von dem nur acht im Bild sind, kommt als derselbe Fall an - die
    // Zahl darf nur das sein, was das Bild zeigt.
    expect(r.zahl, "die Zahl ist nicht die Zahl des uegebenen Satzes").toBe(8);
    const vierVonFuenfhundert = kernMarke(KLEIN, knoten(4));
    expect(vierVonFuenfhundert.zahl, "ein grosser Begriff zaehlt sich selbst, nicht den Ausschnitt").toBe(4);
    expect(vierVonFuenfhundert.grund).toBe("zuwenig");
  });

  it("null Knoten im Bild: eigener Zweig, eigenes Wort, und kein Ort als NaN", () => {
    const r = kernMarke(KLEIN, knoten(0));
    expect(r.marke).toBe(false);
    expect(r.grund, "der leere Ausschnitt teilt sich seinen Zustand mit 'zuwenig'").toBe("leer");
    expect(r.zahl).toBe(0);
    expect(Number.isFinite(r.wx), `wx ist ${r.wx} - ein NaN wandert unerkannt durch die Rechung`).toBe(true);
    expect(Number.isFinite(r.wy), `wy ist ${r.wy}`).toBe(true);
  });

  it("ueber der Blende: 'blende', nicht 'leer' - die Marke ist dort nie der Mechanismus", () => {
    expect(kernMarke(GROSS, knoten(0)).grund).toBe("blende");
    expect(kernMarke(GROSS, knoten(3)).grund).toBe("blende");
    expect(kernMarke(GROSS, knoten(500)).grund).toBe("blende");
  });

  it("die Worte stehen am Koerper, und keins behauptet eine Zaehlung, die nicht stattfand", () => {
    const quelle = fs.readFileSync(
      path.join(process.cwd(), "src/components/KnowledgeGraph.tsx"),
      "utf8"
    );
    expect(quelle, "kein Wort fuer den Fall 'zuwenig'").toContain("are needed to count it as one");
    expect(quelle, "kein Wort fuer den Fall 'leer'").toContain("No note of the core is inside this picture");
    // Das Wort zum leeren Bild nennt den Grund, ohne eine Zahl des Kerns zu
    // behaupten: nichts ist hier gezaehlt, also darf nichts dastehen wie ein Befund.
    const leer = quelle.indexOf("No note of the core is inside this picture");
    const seinWort = quelle.slice(leer, leer + 320);
    expect(seinWort, "das Wort zum leeren Bild nennt eine Zahl, waehrend nichts gezaehlt ist").not.toMatch(/kernStand\.zahl/);
    // Und der Zustand liegt an der Leinwand, damit ein Fenster ihn lesen kann.
    expect(quelle, "das Zustandsfeld an der Leinwand fehlt").toContain("dataset.kernGrund");
  });
});
