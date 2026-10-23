// Punkt 5, Klasse #81 — die Kappe am Rahmen ist eine Rechnung, nicht drei Zahlen.
//
// Gemessen am ausgelieferten 3.2.40 (23.10., 21 066 Knoten, zwoelf Gruppen, groesster Wann-Korb
// geoeffnet): dieselbe Klasse nannte drei unverbundene Antworten — `calc(100% - 1.5rem)` an der
// Legende, `320` px an der Korb-Liste, `200` px an der Gruppen-Liste. Und die geoeffnete Korb-Liste
// lag zur Haelfte unter der Kante ihres Panels (1024 x 768: Liste y 541..861, Panel zeigt bis 732;
// 390 x 844: Liste y 665..985, Panel zeigt bis 768).
//
// **Vorher rot, gemessen:** gegen den Kopf `87ec21e` ohne diesen Koerper — `src/lib/kappe.ts`
// fehlt dort, also scheitert der Import (Uhrzeit und Protokoll im Feldzug-Block). Die Faelle **an
// der Flaeche** laufen dagegen ohne das Modul und verlieren an den kahlen Zahlen 320 und 200; sie
// stehen in `tests/components/GraphRegal.klasse.test.tsx`, die den Wert als Wort fuehrt, damit ein
// fehlendes Modul nicht als Messung durchgeht.
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { KAPPE_PANEL, kappeListe } from "../../src/lib/kappe";

describe("kappe: eine Flaeche, die mit dem Bestand waechst, kappt sich am Rahmen", () => {
  it("das Panel kappt sich an seinem Rahmen, nicht an einer gesetzten Zahl", () => {
    expect(KAPPE_PANEL.maxHeight).toBe("calc(100% - 1.5rem)");
    expect(KAPPE_PANEL.overflowY).toBe("auto");
    expect(KAPPE_PANEL.pointerEvents, "eine Rolle, die niemand greifen kann, ist keine Rolle").toBe("auto");
  });

  /**
   * Die Falle, gegen die diese Zeile schreibt: eine Listen-Kappe in `%` ist auf einem
   * Elternkasten ohne bestimmte Hoehe **keine** Kappe — `max-height: 55%` loest dort zu
   * `none` auf, und die Liste waecht genau dann ungekapped, wenn sie am langsten ist.
   */
  it("die Liste kappt sich mit min(fest, Blickfeld) und nie mit einem kahlen Prozent", () => {
    const k = kappeListe();
    expect(k.maxHeight).toBe("min(320px, 45vh)");
    expect(k.maxHeight).not.toMatch(/^\d+(\.\d+)?%$/);
    expect(k.maxHeight).toContain("vh");
    expect(k.overflowY).toBe("auto");
    expect(k.pointerEvents).toBe("auto");
  });

  it("zwei Listen derselben Klasse teilen dieselbe Kappe, und eine Ausname bleibt eine Ausname", () => {
    expect(kappeListe()).toEqual(kappeListe(320));
    expect(kappeListe(200).maxHeight).toBe("min(200px, 45vh)");
    expect(kappeListe(320, "30vh").maxHeight).toBe("min(320px, 30vh)");
  });

  /**
   * Die Klasse an den Aufrufstellen: drei Flaechen, eine Rechnung. Das ist eine Wache am
   * Quelltext — absichtlich, denn was sie haelt, ist gerade **nicht** eine Nutzerzahl, sondern
   * die Abwesenheit von drei unverbundenen Zahlen. Die Zahlen an der Flaeche haelt
   * `tests/components/GraphRegal.klasse.test.tsx`.
   */
  it("die drei Aufrufstellen lesen die Rechnung, keine von ihnen führt eine eigne Zahl", () => {
    const regal = readFileSync("src/components/GraphRegal.tsx", "utf8");
    const gang = readFileSync("src/components/KnowledgeGraph.tsx", "utf8");
    expect(regal, "das Regal importiert die Klassen-Kappe nicht").toContain('from "../lib/kappe"');
    expect(gang, "der Gang importiert die Klassen-Kappe nicht").toContain('from "../lib/kappe"');
    expect(regal.match(/style=\{kappeListe\(\)\}/g)?.length ?? 0).toBe(2);
    expect(gang.match(/style=\{KAPPE_PANEL\}/g)?.length ?? 0).toBe(1);
    expect(regal, "das Regal kappt weiter mit einer kahlen Zahl").not.toMatch(/maxHeight:\s*\d/);
    expect(gang, "die Legende führt ihre Obergrenze weiter als eigne Zahl").not.toMatch(/maxHeight:\s*"calc/);
  });
});
