// @vitest-environment node
// Punkt 5 (Feldzug 18.10.) — Gruppen-Schicht: das Regal-Panel muss die Zahlen sagen,
// die `baueRegal` rechnet, und es darf keinen Griff vortaeuschen.
//
// Gefahren, aber nicht im Baum: dieser Lauf braucht keinen Browser — gerendert wird
// mit `renderToStaticMarkup` in Node. 18.10. gegen die geflickte Datei: **6 gruen, 0 rot**.
// Ein Fall ist dabei erst nach seiner eigenen Berichtigung gruen geworden: die
// Breiten-Pruefung zaehlte zuerst die Streifen von Band 2 mit (601 % statt 100 %) —
// sie mass zwei verschiedene Dinge. Im Baum faehrt die Leitung:
//   cd ~/kepta-app && npx vitest run tests/components/GraphRegal.test.tsx
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GraphRegal } from "../../src/components/GraphRegal";
import { baueRegal } from "../../src/lib/graphHierarchy";
import type { Memory } from "../../src/types";

function mem(teil: Partial<Memory> & { id: string }): Memory {
  return {
    id: teil.id,
    userId: "local",
    title: teil.title ?? "",
    content: teil.content ?? "",
    tags: teil.tags ?? [],
    type: teil.type ?? "semantic",
    scope: "private",
    confidence: 1,
    createdAt: 0,
    updatedAt: 0,
  } as Memory;
}

/** Ein Bestand wie seiner: ein getippter Rest, ein Haufen Dateien, ein Haufen Code. */
function bestand(): Memory[] {
  const raus: Memory[] = [mem({ id: "notiz", title: "Von Hand", content: "Kurz notiert, ohne Datei dahinter, ohne jedes Muster." })];
  for (let i = 0; i < 400; i++) {
    const endung = ["md", "json"][i % 2];
    raus.push(mem({
      id: `s${i}`,
      type: "reference",
      title: `Stueck ${i}`,
      content: `Zeile ${i}\n— Source: /Users/jemand/Desktop/ordner-${i % 5}/datei-${i}.${endung}`,
      tags: ["machine-scan", endung],
    }));
  }
  return raus;
}

function text(regal: ReturnType<typeof baueRegal>): string {
  return renderToStaticMarkup(createElement(GraphRegal, { regal }))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

describe("GraphRegal", () => {
  const regal = baueRegal(bestand());

  it("nennt den Bestand und alle drei Traeger — auch das kleinste", () => {
    const t = text(regal);
    expect(t).toContain(regal.bestand.toLocaleString("en-US"));
    for (const name of ["Notes", "Files", "Code"]) expect(t).toContain(name);
    const notes = regal.woher.find((f) => f.name === "Notes");
    expect(notes).toBeDefined();
    expect(t).toContain(`Notes ${notes!.notizen}`);
  });

  it("setzt die Fächer in der Groessenordnung, die `baueRegal` gerechnet hat", () => {
    const t = text(regal);
    const oberste = regal.worum.slice(0, 3);
    for (const f of oberste) {
      expect(t).toContain(f.name);
      expect(t).toContain(f.notizen.toLocaleString("en-US"));
    }
    expect(oberste[0].notizen).toBeGreaterThanOrEqual(oberste[1].notizen);
  });

  it("sagt, wie viele Stuecke keinen Betreff tragen, statt die Luecke zu malen", () => {
    const t = text(regal);
    expect(regal.luecken.ohneBetreff).toBeGreaterThan(0);
    expect(t).toContain(regal.luecken.ohneBetreff.toLocaleString("en-US"));
  });

  it("ist kein Griff: keine Klickflaeche, keine Taste, kein Link", () => {
    // Eine Zeile im Panel ist 14 px hoch. Etwas Klickbares waere eine Steuerung
    // unter der Latte des Hauses (44 px) — also darf das Panel nichts vortaeuschen.
    const html = renderToStaticMarkup(createElement(GraphRegal, { regal }));
    expect(/onClick|<button|<a /u.test(html)).toBe(false);
  });

  it("zeichnet die Bandbreite als Anteil, nicht als Rangfolge", () => {
    const html = renderToStaticMarkup(createElement(GraphRegal, { regal }));
    // Nur die Segmente von Band 1 — die Streifen der Fächer in Band 2 gehen gegen das
    // groesste Fach, nicht gegen den Bestand, und zaehlen hier nicht mit.
    const breiten = [...html.matchAll(/data-notizen="\d+" style="width:([\d.]+)%/g)].map((m) => Number(m[1]));
    expect(breiten.length).toBeGreaterThanOrEqual(3);
    expect(breiten.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 0);
    expect(breiten[0]).toBeLessThan(breiten[breiten.length - 1]);
  });

  it("ein leerer Bestand wirft kein Bild und keine Zahl", () => {
    const leer = baueRegal([]);
    const t = text(leer);
    expect(t).toContain("0");
    expect(t).not.toContain("NaN");
    expect(t).not.toContain("Infinity");
  });
});
