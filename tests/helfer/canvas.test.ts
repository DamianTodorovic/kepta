// @vitest-environment jsdom
//
// Die Leinwand-Attrappe musste die Wahrheit über ihre eigene Lüge lernen: sie
// maß Text mit sturen 6 px pro Zeichen — gleichgültig, welche Schriftgröße der
// Kontext gerade trägt. Der Wissensgraph verkleinert seine Etiketten mit dem
// Zoom; im Test blieben sie darum bis zu viermal zu breit und verdrängten
// Nachbarn, wo der Browser sie nebeneinander stellt. Ein Faltungstest fiel
// genau darüber durch und musste auf die Zahl der Scheiben ausweichen.
//
// Diese Datei hält die Attrappe an ihre eigene Abmachung: messen, was der
// Kontext gesetzt hat.
import { describe, it, expect, beforeEach } from "vitest";
import { installiereLeinwand } from "./canvas";

function kontext() {
  const c = document.createElement("canvas");
  return c.getContext("2d")!;
}

describe("measureText der Buchführungs-Leinwand", () => {
  beforeEach(() => {
    installiereLeinwand();
  });

  it("misst bei gesetzter Schriftgröße proportional zu ihr", () => {
    const ctx = kontext();
    ctx.font = "12px Inter";
    const klein = ctx.measureText("Wissensgraph").width;
    ctx.font = "24px Inter";
    const groß = ctx.measureText("Wissensgraph").width;
    expect(groß / klein, `12px → ${klein}, 24px → ${groß}`).toBeCloseTo(2, 5);
  });

  it("bleibt bei einer Zahl ohne Einheit nicht stehen", () => {
    const ctx = kontext();
    ctx.font = "600 13px system-ui";
    const mitGewicht = ctx.measureText("Elena").width;
    ctx.font = "13px system-ui";
    expect(mitGewicht).toBeCloseTo(ctx.measureText("Elena").width, 5);
  });

  it("misst etwas, wenn niemand eine Schrift gesetzt hat", () => {
    const ctx = kontext();
    const breite = ctx.measureText("Ohne Font gesetzt").width;
    expect(Number.isFinite(breite)).toBe(true);
    expect(breite).toBeGreaterThan(0);
  });

  it("misst den leeren Text breitenlos", () => {
    const ctx = kontext();
    ctx.font = "14px Inter";
    expect(ctx.measureText("").width).toBe(0);
  });
});
