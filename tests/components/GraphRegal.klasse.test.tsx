// @vitest-environment jsdom
//
// Punkt 5, Klasse #81 — Regal und Korb-Liste sind dieselbe Klasse, also tragen sie dieselbe Kappe.
//
// Was am ausgelieferten 3.2.40 gemessen ist (23.10. 11:28:59–11:29:31 MESZ, 21 066 Knoten, zwoelf
// Gruppen, groesster Wann-Korb geoeffnet; Protokoll
// `feldzug/belege-2310/p5-klasse-2310/klasse-112859.txt`):
// - Korb-Liste: y **541..861** in einem Panel, das bis **732** zeigt (1024 x 768) und
//   y **665..985** in einem bis **768** (390 x 844) — von 320 px Liste sind 191 px bzw. **103 px**
//   zu sehen, und die Flaeche sagt nichts darueber, dass darunter etwas liegt;
// - Gruppen-Liste: Kappe **200 px** bei 12 Reihen zu je 44 px = 528 px Inhalt — 38 % sichtbar;
// - drei Kaesten, drei Zahlen: `calc(100% - 1.5rem)` / `320` / `200`.
//
// Diese Datei prueft zwei Dinge, die ein Mensch braucht: (1) keine Liste im Regal kappt sich mit
// einer kahlen Zahl, sondern mit der Klassen-Kappe, und (2) ein Klick auf einen Korb holt seine
// Liste in den sichtbaren Teil des Panels. Beides wird **an der Flaeche** gelesen, nicht an einem
// Wort im Quelltext — der Attributtext zaehlt, weil jsdom ein `min()` in `max-height` nicht als
// deklarierten Wert zurueckgibt, und eine Sonde, die ihre eigene Erwartung nicht lesen kann,
// meldet sauber fuer etwas, das sie nie oeffnete.
//
// **Vorher rot, gemessen:** gegen `87ec21e` ohne diesen Koerper — Fall 1 auf `320px` und `200px`,
// Fall 2, weil kein `scrollIntoView` gerufen wird. Uhrzeit im Feldzug-Block.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { GraphRegal } from "../../src/components/GraphRegal";
import { baueRegal } from "../../src/lib/graphHierarchy";
import { baueFarbGruppen } from "../../src/lib/gruppen";
import type { Memory } from "../../src/types";

const TAG = 86_400_000;

function notiz(id: string, titel: string, alterTage: number, tags: string[]): Memory {
  const zeit = Date.now() - alterTage * TAG;
  return {
    id,
    userId: "local",
    title: titel,
    content: "leib",
    tags,
    createdAt: zeit,
    updatedAt: zeit,
  } as Memory;
}

/** Ein Bestand, der beide Listen fuellt: jeder Wann-Korb hat ein Stueck, und drei Marken sind
 *  zu Gruppen erklaert — damit keine der beiden Listen aus der Welt gerechnet wird. */
function bestand(): Memory[] {
  return [
    notiz("heute", "heute notiert", 0.3, ["machine-scan"]),
    notiz("woche", "diese Woche", 3, ["md"]),
    notiz("alt2a", "vor drei Wochen", 20, ["json"]),
    notiz("alt2b", "vor zwei Wochen und einem Tag", 15, []),
    notiz("uralt", "vor zwei Monaten", 60, []),
  ];
}

function gruppen() {
  const leib = bestand();
  return baueFarbGruppen(leib, { marken: ["machine-scan", "md", "json"], farben: {} });
}

afterEach(cleanup);

/**
 * Der Wert steht hier als Wort, nicht als Import aus `src/lib/kappe`: ein Import haette gegen
 * `87ec21e` schon beim Laden gefehlt, und eine 0 bei 0 gelesenen Flaechen ist keine Messung. So
 * laufen die Faelle an der nackten Flaeche und verlieren an der nackten Zahl. Die Klasse selbst
 * pinnt `tests/lib/kappe.test.ts`.
 */
const KLASSEN_KAPPE = "min(320px, 45vh)";

function flaecheOeffnen(korbText: RegExp) {
  render(<GraphRegal regal={baueRegal(bestand())} ansichtsName="the tree" gruppen={gruppen()} />);
  const koerbe = screen.getAllByTestId("regal-koerb") as HTMLElement[];
  const k = koerbe.find((e) => korbText.test(e.textContent ?? ""));
  expect(k, `kein Korb mit ${String(korbText)} in ${koerbe.map((e) => e.textContent).join(" | ")}`).toBeTruthy();
  fireEvent.click(k!);
  return k!;
}

describe("Klasse #81 — eine Kappe fuer die Listen des Regals", () => {
  it("keine Liste im Regal kappt sich mit einer kahlen Zahl, sondern mit der Klassen-Kappe", () => {
    flaecheOeffnen(/this week/i);
    const regal = screen.getByTestId("graph-regal") as HTMLElement;
    const mitHoehe = Array.from(regal.querySelectorAll<HTMLElement>("[style]")).filter((e) =>
      /max-height/.test(e.getAttribute("style") || "")
    );
    expect(mitHoehe.length, "keine Liste mit Kappe an der Flaeche — dieser Fall prueft nichts").toBeGreaterThanOrEqual(2);
    const erwartet = KLASSEN_KAPPE;
    for (const e of mitHoehe) {
      const stil = e.getAttribute("style") || "";
      expect(stil, `kahle Obergrenze an ${e.getAttribute("data-testid") || e.className}: ${stil}`).toContain(erwartet);
    }
  });

  it("die Gruppen-Liste traegt dieselbe Kappe wie die Korb-Liste — nicht eine eigne Zahl", () => {
    flaecheOeffnen(/this week/i);
    const regal = screen.getByTestId("graph-regal") as HTMLElement;
    const koerb = regal.querySelector('[data-testid="regal-koerb-liste"]') as HTMLElement;
    expect(koerb, "die Korb-Liste fehlt nach dem Klick").toBeTruthy();
    const band = regal.querySelector('[data-testid="regal-farbgruppe"]') as HTMLElement;
    expect(band, "das Gruppen-Band fehlt").toBeTruthy();
    const gruppenListe = Array.from(band.querySelectorAll<HTMLElement>("[style]")).find((e) =>
      /max-height/.test(e.getAttribute("style") || "")
    );
    expect(gruppenListe, "die Gruppen-Liste hat ueberhaupt keine Obergrenze").toBeTruthy();
    expect(gruppenListe!.getAttribute("style")).toBe(koerb.getAttribute("style"));
  });

  it("ein Klick auf einen Korb holt seine Liste in den sichtbaren Teil des Panels", () => {
    const spy = vi.fn();
    const vorher = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = spy;
    try {
      flaecheOeffnen(/this week/i);
      const koerb = screen.getByTestId("regal-koerb-liste") as HTMLElement;
      expect(spy, "die Liste oeffnet unter der Kante, ohne dass die Flaeche nachzieht").toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toEqual({ block: "nearest" });
      expect(koerb).toBeTruthy();
    } finally {
      Element.prototype.scrollIntoView = vorher;
    }
  });
});
