// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { schreibeTypFarbe, leseTypFarben, tinteAufLeiter, tintetauglich, leuchtkraft } from "../../src/lib/typFarben";

// P196: der Fall von Damian (10.11.): „man kann die Farben nicht ändern" — der
// alte Weg verwies still, was als Schrift 4,5:1 verfehlte (#cc00bb hielt 3,9:1,
// #007bff 3,1:1 — gemessen 18.10.). Der neue Weg nimmt JEDE Wahl an und führt
// nur die Helligkeit auf die Leiter; der Farbton bleibt erhalten.

beforeEach(() => { localStorage.clear(); });

describe("P196: eine Farbwahl wird immer angenommen", () => {
  it("nimmt #cc00bb an — und der Ton liest danach auf beiden Papieren", () => {
    const ton = schreibeTypFarbe("semantic", "#cc00bb");
    expect(ton, "die Wahl wurde still verworfen — genau Damians Klage").not.toBeNull();
    expect(tintetauglich(ton!), "der geführte Ton liest nicht").toBe(true);
  });

  it("erhält den Farbton (rot bleibt rot, blau bleibt blau)", () => {
    const rot = schreibeTypFarbe("semantic", "#cc00bb")!;
    const blau = schreibeTypFarbe("procedural", "#0a2a8a")!;
    for (const [roh, ton] of [["#cc00bb", rot], ["#0a2a8a", blau]] as const) {
      const p = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      const [r1, g1, b1] = p(roh), [r2, g2, b2] = p(ton);
      const dominanz = (r: number, g: number, b: number) => (r >= g && r >= b ? "rot" : b >= g && b >= r ? "blau" : "grün");
      expect(dominanz(r2, g2, b2), `der Farbton kippte bei ${roh} → ${ton}`).toBe(dominanz(r1, g1, b1));
    }
  });

  it("lässt eine lesbare Wahl unverändert", () => {
    expect(tinteAufLeiter("#ffffff")).toBe("#ffffff");
  });

  it("speichert die Wahl und liest sie zurück", () => {
    schreibeTypFarbe("episodic", "#123456");
    const gelesen = leseTypFarben();
    expect(gelesen.episodic, "die Wahl überlebte den Neustart nicht").toBeDefined();
    expect(tintetauglich(gelesen.episodic!)).toBe(true);
  });

  it("weist Unfug ab, ohne zu speichern", () => {
    expect(schreibeTypFarbe("semantic", "rot")).toBeNull();
    expect(schreibeTypFarbe("halloween", "#ff0000")).toBeNull();
    expect(Object.keys(leseTypFarben())).toHaveLength(0);
  });

  it("macht aus einem Unding null und aus einem dunklen Ton etwas", () => {
    expect(leuchtkraft("kein-farbwert")).toBeNull();
    expect(leuchtkraft("#000000")).toBeCloseTo(0, 5);
  });
});
