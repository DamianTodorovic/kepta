import { describe, it, expect } from "vitest";
import { punktwolke } from "../../src/lib/graphLayout";

// Die Marke, ab der die Fläche aufhört, ein Netz zu behaupten. Der Anlass ist
// Damians Bestand vom 13.10.: 14 702 Notizen, 37 davon an einem Begriff.

describe("punktwolke — wann das Feld kein Netz ist", () => {
  it("gilt bei seinem echten Verhältnis", () => {
    expect(punktwolke(14_702, 37)).toBe(true);
  });

  it("gilt nicht unterhalb der Bestandsgrenze", () => {
    // Eine kleine Basis darf sich als Feld zeigen, auch wenn noch nichts
    // zusammenhängt — für zwölf Notizen ist die Runde die Wahrheit, keine Lüge.
    expect(punktwolke(150, 0)).toBe(false);
    expect(punktwolke(199, 0)).toBe(false);
  });

  it("nimmt die Fünf-Prozent-Marke selbst nicht mit", () => {
    // 200 Notizen, 10 gedeckt = genau fünf Prozent: kein Befund. 9 gedeckt:
    // Befund. Die Marke heißt „unter fünf Prozent", nicht „höchstens".
    expect(punktwolke(200, 10)).toBe(false);
    expect(punktwolke(200, 9)).toBe(true);
  });

  it("gilt bei null gedeckten Notizen ab der Bestandsgrenze", () => {
    expect(punktwolke(200, 0)).toBe(true);
    expect(punktwolke(3_025, 12)).toBe(true);
  });
});
