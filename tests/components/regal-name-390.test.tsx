// @vitest-environment jsdom
//
// #97 — die Latte, woertlich: "bei 390 px ist der Marken-Name voll oder benannt ersetzt,
// ohne die Hoehen-Kappe #81 zu verlieren."
//
// WAS DIESER FALL PRUEFT (die Lesart, ausgeschrieben, damit niemand raten muss): die REGEL,
// nicht die Pixel.
//   a) die Zeile traegt `regal-zeile`, der Marken-Name `regal-marke` — das Ziel der Heilung;
//   b) in `src/index.css` steht diese Heilung in einem @media-Block mit max-width <= 440 px
//      und setzt dort `overflow: visible` und `white-space: nowrap` — das ist die Regel
//      "bei Telefonbreite wird der Name nicht gekappt";
//   c) `truncate` DARF in der Klasse bleiben. Die Heilung ueberschreibt es bei 440 px.
//      **Ein Verbot von `truncate` waere rot GEGEN die Heilung** (Kollision im Brief 97).
//
// Die PIXEL kann jsdom nicht messen (kein Layout, keine Media-Queries). Dafuer stehen die
// zwei Bilder bei 390 x 844 im Blatt `p5-97-fall-und-bild-2410.md` — gekappt und heil,
// jedes selbst angesehen.
//
// Rot vorher: gegen den Kopf `98394b4` (3.2.51, ohne den Koerper) sind beide Faelle rot —
// die Klassen fehlen und die Regel fehlt. Gruen nachher: gegen `68d24c5` (3.2.52) mit ihm.
// Die zwei Laeufe mit Uhrzeit stehen im Blatt.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { GraphRegal } from "../../src/components/GraphRegal";
import { baueRegal } from "../../src/lib/graphHierarchy";
import { zaehleGruppen } from "../../src/lib/gruppen";
import type { Memory } from "../../src/types";

const LATTE = "#97: bei 390 px ist der Marken-Name voll oder benannt ersetzt, ohne die Hoehen-Kappe #81 zu verlieren";

function notiz(id: string, tags: string[]): Memory {
  return { id, userId: "local", title: id, content: "leib", tags, createdAt: 1, updatedAt: 1 } as Memory;
}

const bestand: Memory[] = [
  notiz("a", ["machine-scan", "json"]),
  notiz("b", ["machine-scan"]),
  notiz("c", ["kepta"]),
];

afterEach(cleanup);

describe("Regal: der Marken-Name bei Telefonbreite", () => {
  it(`traegt die Klassen an Zeile und Name — ${LATTE}`, () => {
    const m = zaehleGruppen(bestand, { marken: ["machine-scan", "json", "kepta"], farben: {} });
    render(<GraphRegal regal={baueRegal(bestand)} ansichtsName="the tree" gruppen={m} />);
    const zeilen = screen.getAllByTestId("regal-farbgruppe-zeile");
    expect(zeilen.length, "drei Zeilen").toBe(3);
    for (const z of zeilen) {
      expect(z.className, "die Zeile traegt regal-zeile").toContain("regal-zeile");
      const name = z.querySelector(".regal-marke");
      expect(name, "der Name traegt regal-marke").not.toBeNull();
      expect((name?.textContent ?? "").trim().startsWith("#"), "der Name steht da").toBe(true);
    }
  });

  it(`setzt die Heilung in einem Telefon-Block (max-width <= 440) — ${LATTE}`, () => {
    const css = readFileSync("src/index.css", "utf8");
    const bloecke = [...css.matchAll(/@media\s*\(max-width:\s*(\d+)px\)\s*\{([\s\S]*?)\n\}/g)]
      .filter((m) => m[2].includes(".regal-marke"));
    expect(bloecke.length, "ein Telefon-Block mit .regal-marke").toBeGreaterThan(0);
    const [, breite, inhalt] = bloecke[bloecke.length - 1];
    expect(Number(breite), "Telefonbreite (<= 440)").toBeLessThanOrEqual(440);
    // Das Ergebnis: der Name darf dort nicht mehr gekappt werden — truncate wird ueberschrieben.
    expect(inhalt, "overflow: visible").toMatch(/overflow:\s*visible/);
    expect(inhalt, "white-space: nowrap").toMatch(/white-space:\s*nowrap/);
  });
});
