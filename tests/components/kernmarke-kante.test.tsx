// @vitest-environment jsdom
// Punkt 101: die Randklemme an der erzwungenen Kante.
// Der Fall trifft die Kante bei dotY = 8 GEGEN dotY = 200, mit dem UNGERUNDETEN
// Wert, den der Malweg sieht. Ohne markeKippt faellt der Fall schon beim Import -
// das ist die Gegenprobe: Marke raus, das Rot muss schlagen.
import { describe, it, expect } from "vitest";
import { markeKippt } from "../../src/components/KnowledgeGraph";

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
