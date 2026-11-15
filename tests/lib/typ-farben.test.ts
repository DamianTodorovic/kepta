// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { schreibeTypFarbe, leseTypFarben, tinteAufLeiter, tintetauglich, leuchtkraft, trageTypVar } from "../../src/lib/typFarben";

// P196b (Damian, 22:32): „ich kann nicht die Farben nehmen die ich möchte" — die
// erste Fassung führte die Wahl selbst auf die Leiter und veränderte sie sichtbar.
// Der neue Vertrag: der ROH-Ton gilt auf der Fläche (Punkte, Grat, Wähler), nur
// die Schrift-Fassung (`--type-<rolle>-text`) wird automatisch lesbar geführt.

beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute("style"); });

describe("P196b: die Wahl gilt exakt auf der Fläche", () => {
  it("trägt den Roh-Ton unverändert — kein Umbau, kein Verblassen", () => {
    const ton = schreibeTypFarbe("semantic", "#cc00bb");
    expect(ton, "die Wahl wurde verändert").toBe("#cc00bb");
    expect(document.documentElement.style.getPropertyValue("--type-semantic")).toBe("#cc00bb");
  });

  it("die Schrift-Fassung liest, während die Fläche den Roh-Ton trägt", () => {
    schreibeTypFarbe("semantic", "#ff3366");
    expect(document.documentElement.style.getPropertyValue("--type-semantic")).toBe("#ff3366");
    const text = document.documentElement.style.getPropertyValue("--type-semantic-text");
    expect(text, "keine lesbare Schrift-Fassung abgeleitet").not.toBe("");
    expect(text.toLowerCase()).not.toBe("#ff3366");
    expect(tintetauglich(text)).toBe(true);
  });

  it("eine lesbare Wahl bleibt auch in der Schrift-Fassung sich selbst", () => {
    schreibeTypFarbe("procedural", "#ffee66");
    expect(document.documentElement.style.getPropertyValue("--type-procedural")).toBe("#ffee66");
    expect(document.documentElement.style.getPropertyValue("--type-procedural-text")).toBe("#ffee66");
  });

  it("speichert die Wahl und liest sie roh zurück", () => {
    schreibeTypFarbe("episodic", "#123456");
    expect(leseTypFarben().episodic).toBe("#123456");
  });

  it("weist Unfug ab, ohne zu speichern", () => {
    expect(schreibeTypFarbe("semantic", "rot")).toBeNull();
    expect(schreibeTypFarbe("halloween", "#ff0000")).toBeNull();
    expect(Object.keys(leseTypFarben())).toHaveLength(0);
  });

  it("der Leiter-Helfer: aus einem Unding null, aus einem dunklen Ton etwas Lesbares", () => {
    expect(leuchtkraft("kein-farbwert")).toBeNull();
    expect(leuchtkraft("#000000")).toBeCloseTo(0, 5);
    expect(tintetauglich(tinteAufLeiter("#0a0a0a")!)).toBe(true);
  });

  it("trageTypVar setzt alle drei Variablen (roh, hex, text)", () => {
    trageTypVar("reference", "#112233");
    const stil = document.documentElement.style;
    expect(stil.getPropertyValue("--type-reference")).toBe("#112233");
    expect(stil.getPropertyValue("--type-reference-hex")).toBe("#112233");
    expect(tintetauglich(stil.getPropertyValue("--type-reference-text"))).toBe(true);
  });
});
