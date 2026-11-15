// @vitest-environment node
//
// Ein Korb der Wann-Achse oeffnet seine Stuecke — der Schritt von der Menge zur Liste.
// Reine Funktion, kein DOM, keine Tuer: dieselbe Achse, dieselben Kanten wie das Band.
import { describe, it, expect } from "vitest";
import { stueckeAusKoerb, WANN_KOERBE } from "../../src/lib/graphHierarchy";
import type { Memory } from "../../src/types";

/**
 * Eine Notiz mit angesetztem Alter. Das Alter steht je Stueck da und nicht als Schritt
 * eines generators: eine feste Differenz im Fixture waere dieselbe Behauptung, die der
 * Fall pruefen soll.
 */
function notiz(kennung: string, titel: string, alterTage: number | null): Memory {
  const jetzt = Date.now();
  const zeit = alterTage === null ? 0 : jetzt - alterTage * 86_400_000;
  return {
    id: kennung,
    userId: "u-test",
    title: titel,
    content: "leib",
    tags: [],
    createdAt: zeit,
    updatedAt: zeit,
  };
}

describe("regal: ein Wann-Korb oeffnet seine Stuecke", () => {
  it("gibt dem Korb '2–4 weeks ago' seine Stuecke, neueste zuerst, und zaehlt den Rest", () => {
    const welt = [
      notiz("a", "aelter im korb", 20.5),
      notiz("b", "junger im korb", 15.2),
      notiz("c", "heute", 0.4),
      notiz("d", "vor 1-2 wochen", 8),
      notiz("e", "uralt", 40),
      notiz("f", "ohne zeit", null),
    ];

    const korb = stueckeAusKoerb(welt, "2–4 weeks ago");
    expect(korb.gesamt).toBe(2);
    expect(korb.stuecke.map((s) => s.kennung)).toEqual(["b", "a"]);
    expect(korb.uebrig).toBe(0);
    expect(korb.stuecke[0].alterTage).toBeCloseTo(15.2, 1);

    // Kein Stueck geht auf dem Weg verloren: die Summe aller Koeserbe ist der Bestand.
    const summe = WANN_KOERBE.reduce((n, k) => n + stueckeAusKoerb(welt, k).gesamt, 0);
    expect(summe).toBe(welt.length);

    // Eine Seite, die kappt, muss den Rest zahlen statt ihn zu schlucken.
    const viele = Array.from({ length: 60 }, (_, i) => notiz(`n${i}`, `n${i}`, 16 + i * 0.1));
    const gross = stueckeAusKoerb(viele, "2–4 weeks ago", 50);
    expect(gross.stuecke).toHaveLength(50);
    expect(gross.uebrig).toBe(10);
    expect(gross.gesamt).toBe(60);
    expect(gross.stuecke[0].kennung).toBe("n0");
  });
});
