// @vitest-environment jsdom
//
// Punkt 5, Feldzug 21.10. (Brief 64) — das Band haengt in einer Flaeche, die keine Zeiger
// annimmt: `KnowledgeGraph.tsx:5019` setzt auf die Legende die Klasse `pointer-events-none`,
// und was darunter steht, erbt diese Eigenschaft. An der ausgelieferten 3.2.33 gemessen
// (20:05 MESZ, eignes Profil, eigne CDP-Blocks 9364/9365/9366, Konsole 0 Eintraege):
// `document.elementFromPoint` auf die Mitte jedes der sechs Koerbe nennt `graph-canvas`,
// nie den Knopf. Der Klick geht durch ihn hindurch. Von innen aufgerufen oeffnet derselbe
// Handler die Liste sofort (offen 1, Liste 1, Stuecke 50) — tot ist die Kante, nicht die Funktion.
// Und die Liste selbst schubst den Knopf, der sie schliesst, aus dem Bild: bei 1440 px
// Fensterhoehe rutscht seine Mitte von y=628 auf y=-417, bei 390 px von 436 auf -609.
//
// Diese Datei prueft die zwei Eigenschaften, die ein Mensch braucht und keine Zahl sieht:
// der Knopf nimmt Zeiger an, und seine Liste bleibt im Bild.
//
// Der dritte Fall war die Gegen-Wache gegen einen treffbaren Panel. Er ist **bewegt**, nicht
// umgeschrieben (Leitung, Brief 22:45 MESZ): die Legende des Gangs nimmt die Hand jetzt
// absichtlich an, weil sie ohne Obergrenze ueber ihre Flaeche hinauswuchs — gemessen 849 px in
// 608 px bei 1024 x 768 und 1 053 px in 628 px bei 390 x 844 am echten Bestand (22.10.,
// `feldzug/p5-kappe-2210.md`). Was der Fall schuetzen wollte — Pan und Zoom auf der Leinwand —
// steht jetzt dort, wo es wohin gehoert: dritter Fall in
// `KnowledgeGraph.legende-kappe.test.tsx`, gemessen an der Leinwand selbst.
//
// Was jsdom nicht kann, steht offen: die Vererbung von der Legende her existiert nur im
// echten Fenster, also prueft diese Datei die Eigenschaft am Knoten selbst. Dass der
// Koordinaten-Klick danach wirklich oeffnet, ist am laufenden Fenster gemessen und in
// `feldzug/belege-2110/` belegt, nicht hier.
//
// Gegen den committeten Stand `7907189` (3.2.33) gefahren: **zwei rot, einer gruen**
// (Fall 1 und 2 vor dem Koerper, Fall 3 als Gegen-Wache gruen). Fall 3 ist am 22.10. bewegt
// worden, weil die Legende seither eine Obergrenze hat und die Hand an nimmt; die zwei
// verbleibenden Faelle wurden am Stand `638e95f` (3.2.38) neu gefahren und bleiben gruen.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { GraphRegal } from "../../src/components/GraphRegal";
import { baueRegal } from "../../src/lib/graphHierarchy";
import type { Memory } from "../../src/types";

const TAG = 86_400_000;

function notiz(id: string, titel: string, alterTage: number): Memory {
  const zeit = Date.now() - alterTage * TAG;
  return {
    id,
    userId: "local",
    title: titel,
    content: "leib",
    tags: [],
    createdAt: zeit,
    updatedAt: zeit,
  } as Memory;
}

/** Ein Bestand, der jede Korb-Kante beruehrt: heute einer, diese Woche einer, zwei zwischen
 *  zwei und vier Wochen, einer aelter als 28 Tage. Kein Korb wird aus der Welt gerechnet. */
function bestand(): Memory[] {
  return [
    notiz("heute", "heute notiert", 0.3),
    notiz("woche", "diese Woche", 3),
    notiz("alt2a", "vor drei Wochen", 20),
    notiz("alt2b", "vor zwei Wochen und einem Tag", 15),
    notiz("uralt", "vor zwei Monaten", 60),
  ];
}

/** Die eigene Zeiger-Eigenschaft eines Knotens, nicht die geerbte: jsdom kennt keine Kaskade,
 *  und genau deshalb steht sie am Knoten selbst als inline-Style. */
function eigenerZeiger(k: HTMLElement): string {
  return k.style.pointerEvents || "keine eigne";
}

afterEach(cleanup);

describe("regal: ein Wann-Korb muss eine Hand annehmen", () => {
  it("jeder der sechs Koerbe nimmt Zeiger an, weil die Legende sie abweist", () => {
    render(<GraphRegal regal={baueRegal(bestand())} ansichtsName="the tree" />);
    const koerbe = screen.getAllByTestId("regal-koerb");
    expect(koerbe).toHaveLength(6);
    for (const k of koerbe) {
      expect(eigenerZeiger(k as HTMLElement)).toBe("auto");
    }
  });

  it("die geoeffnete Liste bleibt im Bild: Obergrenze, eignes Rollen, eigner Zeiger", () => {
    render(<GraphRegal regal={baueRegal(bestand())} ansichtsName="the tree" />);
    const koerbe = screen.getAllByTestId("regal-koerb") as HTMLElement[];
    const gefuellt = koerbe.find((k) => (k.textContent ?? "").includes("this week"));
    expect(gefuellt).toBeTruthy();
    // `fireEvent`, nicht der rohe Knoten-Klick: der rohe klickt ausserhalb von `act()`,
    // React schreibt den Zustand nicht, und die Liste fehlt — ein Rot aus eigner Sonde.
    fireEvent.click(gefuellt!);
    const liste = screen.getByTestId("regal-koerb-liste") as HTMLElement;
    // Die Klasse kappt in der Form `min(320px, 45vh)`; ein parseInt auf diesem Wort gibt NaN,
    // also die erste Zahl des Werts. Dass ueberhaupt eine Zahl da ist, prueft die Modulwache.
    const kappe = Number((liste.style.maxHeight || "").match(/[0-9]+(?:\.[0-9]+)?/)?.[0] ?? 0);
    expect(kappe).toBeGreaterThan(0);
    expect(kappe).toBeLessThanOrEqual(360);
    expect(["auto", "scroll"]).toContain(liste.style.overflowY);
    // Eine Rolle, die niemand greifen kann, ist keine Rolle.
    expect(eigenerZeiger(liste)).toBe("auto");
  });
});
