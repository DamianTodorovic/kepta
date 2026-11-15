// @vitest-environment jsdom
//
// Punkt 5, Feldzug 21.10. (Brief 63) — der Korb hat eine Funktion bekommen (`stueckeAusKoerb`)
// und noch keinen Klick. Diese Datei prüft den Verbraucher: jede Korb-Zeile ist ein Knopf von
// 44 px, ein Klick öffnet die Liste seiner Stücke, der zweite schließt sie, ein leerer Korb
// antwortet ehrlich, und eine Seite, die kappt, zählt den Rest statt ihn zu verschlucken.
//
// Gegen den committeten Stand `ca91610` (3.2.31) gefahren: **vier rot** — die Fläche kennt
// keinen Knopf und keine Liste. Ihr Lauf steht im Bericht dieser Hand, nicht in dieser Datei.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

/** Ein Bestand, der jede Achsen-Kante berührt: heute eine, diese Woche eine, zwei im Korb
 *  „2–4 weeks ago", eine älter als 28 Tage. Kein Korb wird aus der Welt gerechnet. */
function bestand(): Memory[] {
  return [
    notiz("heute", "heute notiert", 0.3),
    notiz("woche", "diese Woche", 3),
    notiz("alt2a", "vor drei Wochen", 20),
    notiz("alt2b", "vor zwei Wochen und einem Tag", 15),
    notiz("uralt", "vor zwei Monaten", 60),
  ];
}

afterEach(cleanup);

describe("regal: ein Wann-Korb ist ein Klick, keine Zahl", () => {
  it("zeigt jeden Korb als Knopf von mindestens 44 px, auch den leeren", () => {
    render(<GraphRegal regal={baueRegal(bestand())} ansichtsName="the tree" />);
    const koerbe = screen.getAllByTestId("regal-koerb");
    expect(koerbe).toHaveLength(6);
    for (const k of koerbe) {
      const hoehe = Number((k.getAttribute("style") ?? "").match(/min-height:\s*([\d.]+)px/)?.[1] ?? 0);
      expect(hoehe).toBeGreaterThanOrEqual(44);
    }
    // Der leere Korb dieses Bestands ist „no date" (jede Notiz traegt eine Zeit).
    // Die Zahl steht in einem egnen Knoten neben dem Wort — ueber `textContent`
    // geprueft, nicht ueber eine Textsuche, die an der Knotengrenze scheitert.
    const leer = koerbe.find((k) => (k.textContent ?? "").includes("no date"));
    expect(leer?.textContent).toContain("no date 0");
  });

  it("oeffnet die Liste seiner Stuecke mit dem ersten Klick und schliesst sie mit dem zweiten", async () => {
    const hand = userEvent.setup();
    render(<GraphRegal regal={baueRegal(bestand())} ansichtsName="the tree" />);
    const korb = screen.getAllByTestId("regal-koerb").find((k) => k.textContent?.includes("2–4 weeks ago"));
    expect(screen.queryByTestId("regal-koerb-liste")).toBeNull();
    await hand.click(korb!);
    const liste = screen.getByTestId("regal-koerb-liste");
    expect(liste.textContent).toContain("vor drei Wochen");
    expect(liste.textContent).toContain("vor zwei Wochen und einem Tag");
    expect(korb?.getAttribute("aria-expanded")).toBe("true");
    await hand.click(korb!);
    expect(screen.queryByTestId("regal-koerb-liste")).toBeNull();
    expect(korb?.getAttribute("aria-expanded")).toBe("false");
  });

  it("sagt einem leeren Korb ehrlich, dass er leer ist, statt nichts zu tun", async () => {
    const hand = userEvent.setup();
    render(<GraphRegal regal={baueRegal(bestand())} ansichtsName="the tree" />);
    const leer = screen.getAllByTestId("regal-koerb").find((k) => k.textContent?.includes("no date"));
    await hand.click(leer!);
    expect(screen.getByTestId("regal-koerb-liste").textContent).toContain("nothing in this basket yet");
  });

  it("zaehlt den Rest, wenn die Seite kappt", async () => {
    const hand = userEvent.setup();
    const welt = Array.from({ length: 60 }, (_, i) => notiz(`n${i}`, `Stück ${i}`, 16 + i * 0.1));
    render(<GraphRegal regal={baueRegal(welt)} ansichtsName="the tree" />);
    const korb = screen.getAllByTestId("regal-koerb").find((k) => k.textContent?.includes("2–4 weeks ago"));
    await hand.click(korb!);
    const liste = screen.getByTestId("regal-koerb-liste");
    expect(liste.querySelectorAll("[data-testid='regal-koerb-stueck']")).toHaveLength(50);
    expect(liste.textContent).toContain("10 more in this basket");
  });
});
