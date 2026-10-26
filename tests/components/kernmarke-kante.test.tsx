// @vitest-environment jsdom
// Punkt 101: die Randklemme an der erzwungenen Kante.
// Der Fall trifft die Kante bei dotY = 8 GEGEN dotY = 200, mit dem UNGERUNDETEN
// Wert, den der Malweg sieht. Ohne markeKippt faellt der Fall schon beim Import -
// das ist die Gegenprobe: Marke raus, das Rot muss schlagen.
import { describe, it, expect } from "vitest";
import { markeKippt, markeLage, KERN_MARKE_SCHRIFT_PX } from "../../src/components/KnowledgeGraph";
import { randGehalten, KANTEN_RAND_PX } from "../../src/lib/graphLayout";

describe("#101 Randklemme: die Kante bei dotY = 8 gegen dotY = 200", () => {
  it("kippt bei 8, nicht bei 200", () => {
    expect(markeKippt(8), "bei dotY = 8 muss die Zahl unter den Punkt").toBe(true);
    expect(markeKippt(200), "bei dotY = 200 muss sie oben bleiben").toBe(false);
  });

  it("die Kante liegt ungerundet bei 18: 17,6 kippt, 18,0 nicht", () => {
    expect(markeKippt(17.6), "17,6 liegt unter der Kante").toBe(true);
    expect(markeKippt(17.999), "17,999 liegt unter der Kante").toBe(true);
    expect(markeKippt(18), "18,0 liegt auf der Kante").toBe(false);
    expect(markeKippt(18.4), "18,4 liegt darueber").toBe(false);
  });
});

// #109 — die zweite Haelfte von #101. Gemessen 26.10. 16:25:19 bis 16:25:22 am
// ausgelieferten 3.2.61: stand der Kernpunkt bei x 6, reichte das Rechteck bis
// −2,9 px ueber die Kante, und 16 von 62 hellen Bildpunkten der Ziffern (25,8 %)
// waren abgeschnitten; sieben px vor der rechten Kante waren es 2,1 px. Diese
// Zahlengruppe ist kein Zufall, sondern "halbe Breite minus Punkt-Abstand" — also
// wird hier genau diese Rechnung gegen das Bild gehalten.
describe("#109: die gerettete Zahl bleibt ganz im Bild und weicht dem Kasten", () => {
  const BILD = { w: 1440, h: 800 };
  // Die Breite, die die Flaeche selbst mass: 18,4 px fuer eine dreistellige Zahl
  // bei 3 Prozent (measureText an derselben Schrift, 16:25:03 MEZ).
  const BREITE = 18.4;

  it("holt die Zahl an der linken Kante in das Bild zurueck", () => {
    const lage = markeLage(6, 350, BREITE, BILD, []);
    // Die naive Lage war 6 - 9,2 = -3,2 — genau der Uebergriff, den das Bild zeigt.
    expect(lage.x, `die Zahl beginnt ausserhalb: ${lage.x}`).toBeGreaterThanOrEqual(KANTEN_RAND_PX);
    expect(lage.x + BREITE, `die Zahl endet ausserhalb: ${lage.x + BREITE}`).toBeLessThanOrEqual(BILD.w - KANTEN_RAND_PX);
    expect(lage.gehalten, "eine Zahl mitten im Bild, die vier Punkte an allen Kanten haelt, heisst eng").toBe(true);
  });

  it("haelt vier Bildpunkte an jeder der vier Kanten, bei jedem Punkt", () => {
    // Dieselben vier Waende, mit denen die Rechnung selbst arbeitet: der Rand
    // des Bildes ist ein Hindernis wie jeder Kasten.
    const waende = [
      { x: -BILD.w, y: -BILD.h, w: BILD.w, h: 3 * BILD.h },
      { x: BILD.w, y: -BILD.h, w: BILD.w, h: 3 * BILD.h },
      { x: -BILD.w, y: -BILD.h, w: 3 * BILD.w, h: BILD.h },
      { x: -BILD.w, y: BILD.h, w: 3 * BILD.w, h: BILD.h },
    ];
    for (const dotX of [0, 6, 720, 1433, 1440]) {
      for (const dotY of [8, 30, 350, 780, 800]) {
        const l = markeLage(dotX, dotY, BREITE, BILD, []);
        expect(
          randGehalten({ x: l.x, y: l.y, w: BREITE, h: KERN_MARKE_SCHRIFT_PX }, waende, KANTEN_RAND_PX),
          `Punkt (${dotX}, ${dotY}) stellt die Zahl ueber eine Kante: ${JSON.stringify(l)}`
        ).toBe(true);
      }
    }
  });

  it("rueckt die Zahl vom Kasten fort, statt sie auf ihn zu legen", () => {
    // Ein Kasten, der direkt unter der Zahl steht: die Zahl muss hoeher.
    const kasten = { x: 660, y: 340, w: 200, h: 100 };
    const lage = markeLage(700, 350, BREITE, BILD, [kasten]);
    expect(
      randGehalten({ x: lage.x, y: lage.y, w: BREITE, h: KERN_MARKE_SCHRIFT_PX }, [kasten], KANTEN_RAND_PX),
      `die Zahl liegt auf dem Kasten: ${JSON.stringify(lage)}`
    ).toBe(true);
    expect(lage.y, "die Zahl ist nicht gewichen — der Kasten steht in ihrer Zeile").toBeLessThan(340 - 11 - KANTEN_RAND_PX);
    expect(lage.gehalten, "gewichen und trotzdem 'eng'").toBe(true);
    expect(lage.gewichen, "sie ist gewichen, nennt sich aber nicht als gewichen").toBe(true);
  });

  it("springt ueber eine Karte hinweg, die hoeher ist als alle ihre Schritte", () => {
    // Gemessen 26.10. 23:51:48 am ausgelieferten Stueck bei 390 x 844: die Legenden-
    // karte nahm 275 Bildpunkte Hoehe, die Zahl fiel mit y 325 hinter sie und war
    // unsichtbar — dieselbe Klage, die der Gang-Satz schon hatte (#106). Keiner der
    // neun Schritte (15 px) kommt ueber so eine Karte; der Sprung an ihren Rand muss
    // es tun, und die Grundstellung darf sie dabei nicht verlieren.
    const kasten = { x: 2, y: 303, w: 348, h: 275 };
    const lage = markeLage(9, 344, 11.3, { w: 360, h: 628 }, [kasten]);
    const rechteck = { x: lage.x, y: lage.y, w: 11.3, h: KERN_MARKE_SCHRIFT_PX };
    expect(randGehalten(rechteck, [kasten], KANTEN_RAND_PX), `die Zahl steht hinter der Karte: ${JSON.stringify(lage)}`).toBe(true);
    expect(lage.y + rechteck.h + KANTEN_RAND_PX, "sie steht nicht ueber der Karte").toBeLessThanOrEqual(kasten.y);
    expect(lage.x, "die Kante links ist trotzdem vier Punkte halt").toBeGreaterThanOrEqual(KANTEN_RAND_PX);
    expect(lage.gehalten && lage.gewichen, "eine Lage ueber einer hohen Karte ist frei und gewichen").toBe(true);
  });

  it("gibt eine Lage zurueck, auch wenn keine frei ist — die Zahl bleibt", () => {
    // Ein Kasten ueber dem ganzen Bild: wohin sollte die Zahl auch weichen?
    const lage = markeLage(700, 350, BREITE, BILD, [{ x: -400, y: -400, w: 2240, h: 1600 }]);
    expect(Number.isFinite(lage.x) && Number.isFinite(lage.y), "keine Zahl statt einer Lage").toBe(true);
    expect(lage.gehalten, "ein Hindernis um das ganze Bild heisst nicht 'frei'").toBe(false);
  });
});
