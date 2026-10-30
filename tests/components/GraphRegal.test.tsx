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

  it("nennt den Bestand und jeden Traeger, den er fuellt — auch das kleinste", () => {
    const t = text(regal);
    expect(t).toContain(regal.bestand.toLocaleString("en-US"));
    // Gelesen wird die Liste, die `baueRegal` selbst gerechnet hat: behauptet wird der
    // Weg Modell -> Flaeche, nicht eine auswendig gelernte Zahl von Faechern. Seit 3.2.97
    // waere eine feste Drei an diesem Fixture falsch.
    expect(regal.woher.length).toBeGreaterThan(0);
    for (const f of regal.woher) expect(t, `${f.name} fehlt in der Zeile`).toContain(f.name);
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

  it("ist ausser den Wann-Koerben kein Griff: Band 1 und 2 bleiben Text", () => {
    // Eine Zeile in Band 1 und 2 ist 14 px hoch. Etwas Klickbares waere dort eine
    // Steuerung unter der Latte des Hauses (44 px). Ausgenommen sind seit 21.10. die
    // Wann-Koerbe: sie sind Knöpfe von 44 px und fuehren ihre Stuecke — geprueft wird
    // hier die Zahl der Knöpfe, damit niemand ein zweites Band anklickbar macht, ohne
    // es zu sagen. (Der Klick selbst: `GraphRegal.korb-klick.test.tsx`.)
    const html = renderToStaticMarkup(createElement(GraphRegal, { regal }));
    const knoepfe = (html.match(/<button/gu) ?? []).length;
    const latte = (html.match(/min-height:44px/gu) ?? []).length;
    expect(knoepfe).toBe(regal.wann.length);
    expect(latte).toBe(regal.wann.length);
    expect(/<a /u.test(html)).toBe(false);
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

  // --- Kupplung Traeger-NAME -> Farb-TOKEN und Reihenfolge (Punkt 5, 19.10.) ---
  //
  // Warum diese beiden Faellige hier stehen und die Design-Wache nicht ersetzen: die
  // Wache prueft Klassen gegen Regeln (scripts/design-wache.mjs:1800, Soll 0), aber niemand
  // prueft die zwei Woerter, an denen das Regal Farbe und Reihenfolge aufhaengt. Zieht
  // jemand TRAEGER_LABELS (`TRAEGER_LABELS`) um, ohne TRAEGER_TOKEN
  // (`TRAEGER_TOKEN`) nachzuziehen, faellt jedes Fach auf
  // var(--type-neutral) zurueck — drei graue Streifen, und weil TRAEGER_REIHENFOLGE
  // (`TRAEGER_REIHENFOLGE`) fuer alle -1 liefert, kippt die Reihenfolge stumm auf Menge.
  // Kein Fehler, keine Wache, kein roter Fall: bis hierher.
  //
  // Die Muster unten sind NICHT geraten: react-dom/server 19.2.8 schreibt
  //   class="regal-woher-fach" data-notizen="92" style="width:0.43672268109750306%;background:var(--type-semantic)"
  // gemessen 19.10. 11:0x an der eignen Kapsel (Beleg feldzug/belege-1910/
  // p5-react-format-berichtigt-*.log.txt), in derselben Attribut-Reihenfolge, die das
  // ausgelieferte BUndel zeigt (graph-DgfS6ZzQ.js, Fundstelle 102887). Ein "className="
  // in der Markierung waere ein Fehler der Sonde, nicht der Flaeche — die erste Fassung
  // dieses Flickens hatte genau diesen Fehler und traf 0 von 3 Segmenten.
  //
  // Was hier NICHT bewiesen wird: Pixel. Die 1-Kante des Fachs (src/index.css:988,
  // min-width:1px) und die Zeilenhoehe 14 px (GraphRegal.tsx:12) brauchen einen Viewport.
  it("die Traeger-Namen des Bestands sind die, an denen Farbe und Reihenfolge haengen", () => {
    // Seit 3.2.97 heisst JSON `Data`: derselbe Fixture-Bestand fuellt jetzt Notes, Files, Data.
    expect(regal.woher.map((f) => f.name).sort()).toEqual(["Data", "Files", "Notes"]);
  });

  it("jedes Traeger-Fach haelt ein eignes Token — kein Fach faellt aufs Restgrau", () => {
    const html = renderToStaticMarkup(createElement(GraphRegal, { regal }));
    const segmente = [...html.matchAll(
      /class="regal-woher-fach" data-notizen="\d+" style="width:[\d.]+%;background:var\((--type-[a-z-]+)\)/g,
    )].map((m) => m[1]);
    // Erste Behauptung: die Sonde sieht wirklich alle Faelle. Ohne sie waere ein leerer
    // Schnitt ein gruener Fall — genau die Form, die diesem Haus schon angerechnet wurde.
    expect(segmente.length).toBe(regal.woher.length);
    expect(new Set(segmente).size).toBe(3);
    expect([...segmente].sort()).toEqual(["--type-episodic", "--type-reference", "--type-semantic"]);
    expect(html).not.toMatch(/regal-woher-fach[^>]*--type-neutral/);
  });

  it("die Baender stehen in der Reihenfolge des Hauses, nicht in der der Menge", () => {
    const html = renderToStaticMarkup(createElement(GraphRegal, { regal }));
    const notizen = [...html.matchAll(/class="regal-woher-fach" data-notizen="(\d+)"/g)].map((m) => Number(m[1]));
    const haus = ["Notes", "Files", "Data"] as const;
    const erwartet = haus.map((name) => regal.woher.find((f) => f.name === name)?.notizen);
    expect(notizen.length).toBe(3);
    // Keine Fixture-Zahl hier drin: verglichen wird nur, was `baueRegal` selbst gerechnet
    // hat. Aendert jemand den Bestand-Fixture, darf dieser Fall nicht aus dem Grund rot.
    expect(notizen).toEqual(erwartet);
    // Das Gegenstueck: das kleinste Fach steht zuerst, nur weil das Haus Notes zuerst
    // nennt. Zieht jemand die Labels um, liefert TRAEGER_REIHENFOLGE fuer alle drei -1
    // und die Folge kippt auf Menge — dann ist sie absteigend sortiert, und dieser
    // Ausschnitt faellt.
    expect(notizen[0]).toBeLessThanOrEqual(Math.min(...notizen));
    expect(notizen).not.toEqual([...notizen].sort((a, b) => b - a));
  });
});
