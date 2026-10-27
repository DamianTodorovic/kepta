// @vitest-environment jsdom
// #54, die Klappe an der Legende — Auftrag und Latte in `BRIEF-54-KLAPPE-2710.md`.
//
// Gemessen am ausgelieferten Stueck (3.2.64, Kapsel aus 600 Notizen, 390 x 844, 01:31:34 MESZ):
// die Karte nimmt 288 von 628 Bildpunkten der Leinwand = 45,8 Prozent. Dieselbe Zahl steht
// schon am 19.10. fuer 3.2.22 (289,5 bis 331 px = 46,1 bis 52,7 %) — das Feld hat sich in
// acht Tagen nicht bewegt, nur gemessen hat es niemand geaendert.
//
// Die Geometrie ist in jsdom nicht zu halten (keine Media-Queries, keine Hohen): was dieser
// Fall haelt, ist die Regel (schmal = zu, breit = offen), der Griff, sein Wort, sein Zustand,
// die Merkpflicht und die eine Zeile, die nie fallen darf. Die 80 Bildpunkte, die die Klappe
// der Leinwand zurueckgeben muss, werden am ausgelieferten Stueck gemessen.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { KnowledgeGraph } from "../../src/components/KnowledgeGraph";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger, setzeTheme } from "../helfer/canvas";
import type { Memory } from "../../src/types";

const KENNNUNG = "graph-legende-klappe";
const SCHLUESSEL = "kepta_graph_legende";

let zaehler = 0;
function note(): Memory {
  zaehler += 1;
  return {
    id: `lk${zaehler}`, userId: "local", title: `Klappnotiz ${zaehler}`, content: "Inhalt",
    tags: ["begriff"], type: "semantic", scope: "local", confidence: 1,
    validFrom: null, validTo: null, supersededBy: null, deletedAt: null,
    createdAt: Date.parse("2024-01-01"), updatedAt: Date.parse("2024-01-01"),
  } as Memory;
}

async function zeichne() {
  const notizen = Array.from({ length: 8 }, note);
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ relations: [], memoriesByEntity: {}, bestand: { knoten: notizen.length, kanten: 0 } }), { status: 200 })
  ));
  const view = render(<KnowledgeGraph memories={notizen} onSelectMemory={() => {}} />);
  await act(async () => { await new Promise((r) => setTimeout(r, 1200)); });
  return view;
}

function knopf(view: ReturnType<typeof render>): HTMLButtonElement | undefined {
  return view.container.querySelector(`[data-testid="${KENNNUNG}"]`) as HTMLButtonElement | undefined;
}

/** Der Stand, den eine sehende Person liest: die Zahlenreihe ueber allem. */
function kopfZeile(view: ReturnType<typeof render>): string {
  return (view.container.querySelector('[data-testid="graph-kopf"]')?.textContent || "").trim();
}

beforeEach(() => {
  zaehler = 0;
  installiereLeinwand();
  installiereResizeObserver(390, 628);
  installiereZeiger();
  setzeTheme("dunkel");
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("style");
});

describe("#54: die Klappe an der Legende", () => {
  it("bei schmaler Breite startet sie zu, und die Zahlenreihe bleibt stehen", async () => {
    const view = await zeichne();
    const k = knopf(view);
    expect(k, "kein Griff an der Legende — die Karte hat keine Klappe").toBeTruthy();
    expect(k!.getAttribute("aria-expanded"), "schmal startet offen, die Leinwand bleibt halb zugedeckt").toBe("false");
    // 27.10., Punkt 114: der geschlossene Titel nennt jetzt auch, was hinter der Klappe
    // liegt ("… — including what this view is missing"). Die Wache haelt weiter am Wort
    // fest, das der Griff sagt — nur nicht an dem Satz, der danach kommt.
    expect(k!.getAttribute("title"), "der Griff sagt nicht, was er oeffnet").toMatch(/^Show the legend/);
    expect(kopfZeile(view), "die Zahlenreihe ist weg — eingeklappt heisst nicht leer").toContain("notes");
    expect(
      view.container.querySelector('[data-testid="graph-farbgruppe-stand"]'),
      "der Gruppenstand steht trotz Klappe im Bild"
    ).toBeNull();
  });

  it("ein Klick oeffnet alles, der naechste klappt wieder zu", async () => {
    const view = await zeichne();
    const k = knopf(view)!;
    await act(async () => { k.click(); await new Promise((r) => setTimeout(r, 120)); });
    expect(k.getAttribute("aria-expanded"), "der Knopf sagt nach dem Oeffnen noch 'zu'").toBe("true");
    expect(k.getAttribute("title"), "nach dem Oeffnen heisst der Griff nicht 'Hide the legend'").toBe("Hide the legend");
    expect(
      view.container.querySelector('[data-testid="graph-farbgruppe-stand"]'),
      "offen, und der Gruppenstand fehlt immer noch"
    ).toBeTruthy();
    await act(async () => { k.click(); await new Promise((r) => setTimeout(r, 120)); });
    expect(k.getAttribute("aria-expanded"), "zweiter Klick hat nicht wieder zugemacht").toBe("false");
    expect(view.container.querySelector('[data-testid="graph-farbgruppe-stand"]')).toBeNull();
  });

  it("die Wahl des Menschen bleibt, auch im naechsten Offnen", async () => {
    const view = await zeichne();
    await act(async () => { knopf(view)!.click(); await new Promise((r) => setTimeout(r, 120)); });
    expect(localStorage.getItem(SCHLUESSEL), "die Klappe merkt sich nichts").toBe("offen");
    view.unmount();
    const wieder = await zeichne();
    expect(wieder.container.querySelector(`[data-testid="${KENNNUNG}"]`)!.getAttribute("aria-expanded"),
      "gemerkt 'offen', aber der naechste Start kommt zu").toBe("true");
    await act(async () => { knopf(wieder)!.click(); await new Promise((r) => setTimeout(r, 120)); });
    expect(localStorage.getItem(SCHLUESSEL), "zumachen wird nicht gemerkt").toBe("zu");
  });

  it("bei breiter Breite startet sie offen", async () => {
    installiereResizeObserver(1280, 800);
    const view = await zeichne();
    const k = knopf(view);
    expect(k, "auch breit ohne Griff").toBeTruthy();
    expect(k!.getAttribute("aria-expanded"), "breit startet zu — die Klappe gilt nur dem schmalen Feld").toBe("true");
    expect(k!.getAttribute("title")).toBe("Hide the legend");
  });

  it("der stille Ankuunfts-Zaehler faellt nie unter die Klappe", async () => {
    // `graph-farbgruppe-bild` schreibt der Mal-Pass Bild fuer Bild in einen Knoten der
    // Legende. Fiele der Knoten mit der Klappe weg, verlaere die Flaeche im stillen
    // ihre eigene Zahl — dieselbe Klasse wie #105: ein Zustand, den nichts traegt.
    const view = await zeichne();
    expect(knopf(view)!.getAttribute("aria-expanded")).toBe("false");
    expect(
      view.container.querySelector('[data-testid="graph-farbgruppe-bild"]'),
      "die Klappe hat den Ankuunfts-Zaehler mitgenommen"
    ).toBeTruthy();
  });

  it("der Griff ist ein echter Knopf, damit der Haus-Boden ihn trifft", async () => {
    // Der Boden ist eine Regel im Stylesheet, keine Klasse am Kopf: 36 px auf dem
    // Schreibtisch, 44 px ab Telefonbreite (`--ziel-boden`, index.css:776). Eine
    // `min-h-[...]`-Klasse an diesem Kopf verliert gegen diese Regel im Kaskaden-
    // Layer und waere ein totes Versprechen — gemessen 27.10. 02:19 am ausgelieferten
    // 3.2.65: 44 px bei 390 gegen 36 px bei 1440, mit Klasse am selben Kopf.
    const view = await zeichne();
    const klappe = knopf(view)!;
    expect(klappe.tagName, "der Griff ist kein button, also reicht der Haus-Boden nicht an ihn").toBe("BUTTON");
    expect(
      klappe.className,
      "der Griff stellt sich eine eigene Zielkante vor, die den Haus-Boden nur simulierte"
    ).not.toMatch(/min-[hw]-\[/u);
  });
});
