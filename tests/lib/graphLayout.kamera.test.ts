import { describe, it, expect } from "vitest";
import { dichtesteWeltMitte } from "../../src/lib/graphLayout";

/**
 * Die Kamera des Feldes darf nicht die Weltmitte treffen, sondern muss die Mitte
 * dessen treffen, was sie malt. Gemessen 18.10. im ausgelieferten 3.2.21 an 1 500
 * Notizen: die Boxmitte lag neben dem Haufen, 35 Namen klebten rechts oben, vier
 * Titel waren vom Rand durchschnitten.
 *
 * Erfundene Masse — 800×600 ist weder sein Fenster noch das eines andern Falls.
 */
const B = 800;
const H = 600;
const K = 1;
const fenster = { w: B, h: H };

const punkt = (id: string, x: number, y: number, versteckt = false) => ({ id, x, y, versteckt });

describe("dichtesteWeltMitte — die Kamera zielt auf den Inhalt", () => {
  it("traegt den Haufen ueber zwei weit entfernte Ausreisser hinweg", () => {
    // Zwei Einzelne ganz links, ein Haufen von 20 rechts. Die Boxmitte liegt bei
    // 2 000 — in dem Feld steht nichts.
    const knoten = [punkt("a", 0, 0), punkt("b", 10, 0), ...Array.from({ length: 20 }, (_, i) => punkt(`h${i}`, 4000 + i * 5, 100 + i * 5))];
    const mitte = dichtesteWeltMitte(knoten, K, fenster, 0);
    expect(mitte, "die Sonde bekommt kein Bild").not.toBeNull();
    expect(mitte!.x, `gewaehlt ist ${mitte!.x} — das ist die Boxmitte, nicht der Haufen`).toBeGreaterThan(3900);
    expect(mitte!.y).toBeGreaterThan(90);
    expect(mitte!.y).toBeLessThan(220);
  });

  it("laesst den Rand nicht ueber den Inhalt entscheiden", () => {
    // Derselbe Haufen, aber die Luft an den Kanten soll den Ausschnitt verkleinern:
    // ein Punkt, der nur mit seinem Titel in das Bild passt, zaehlt nicht.
    const knoten = Array.from({ length: 12 }, (_, i) => punkt(`x${i}`, i * 60, 0));
    const ohneRand = dichtesteWeltMitte(knoten, K, fenster, 0)!;
    const mitRand = dichtesteWeltMitte(knoten, K, fenster, 120)!;
    expect(ohneRand.x, "ohne Rand passen alle zwolf — die Mitte ist die ihrer Box").toBeCloseTo(330, 6);
    expect(mitRand.x, "mit 120 px Luft an jeder Kante fasst das Fenster nur 560 Einheiten").not.toBe(ohneRand.x);
  });

  it("gibt die Boxmitte zurueck, wenn die ganze Welt in das Fenster passt", () => {
    const knoten = [punkt("a", 10, 10), punkt("b", 60, 40)];
    const mitte = dichtesteWeltMitte(knoten, K, fenster, 0)!;
    expect(mitte.x).toBe(35);
    expect(mitte.y).toBe(25);
  });

  it("zaehlt Verborgenes nicht mit", () => {
    // Ein versteckter Punkt ganz aussen darf die Box nicht aufblasen und damit
    // die Wahl verschieben — dasselbe Gesetz, das `layoutBounds` schon traegt.
    const sichtbar = Array.from({ length: 6 }, (_, i) => punkt(`s${i}`, 500 + i * 10, 500));
    const knoten = [...sichtbar, punkt("verborgen", -50_000, -50_000, true)];
    const mitte = dichtesteWeltMitte(knoten, K, fenster, 0)!;
    expect(mitte.x, "die Kamera folgt einem Punkt, den niemand sieht").toBeGreaterThan(490);
    expect(mitte.y).toBeGreaterThan(490);
  });

  it("sagt null, statt eine Mitte zu erfinden", () => {
    expect(dichtesteWeltMitte([], K, fenster, 0), "eine leere Welt hat keine Mitte").toBeNull();
    expect(dichtesteWeltMitte([punkt("a", 0, 0)], 0, fenster, 0), "bei Blende 0 ist kein Fenster zu rechnen").toBeNull();
    expect(dichtesteWeltMitte([punkt("a", 0, 0)], K, { w: 0, h: 0 }, 0), "eine Leinwand ohne Flaeche ist kein Bild").toBeNull();
    expect(
      dichtesteWeltMitte([punkt("a", 0, 0)], K, { w: 100, h: 100 }, 80),
      "ein Rand, der das Fenster auffrisst, darf keine Mitte vortaeuschen",
    ).toBeNull();
  });
});

