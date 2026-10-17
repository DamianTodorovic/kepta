// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { KnowledgeGraph } from "../../src/components/KnowledgeGraph";
import { knotenRadius } from "../../src/lib/graphLayout";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger, setzeTheme } from "../helfer/canvas";
import type { Memory } from "../../src/types";

// Aufgabe #30 — die Titel-Pforte.
//
// `rr` wird auf MIN_KNOTEN_PX (1,5 Bildpunkte) angehoben, damit ein winziger
// Knoten im Feld nicht verschwindet. Bis 0e065b0 verglich die Pforte GENAU
// diesen angehobenen Wert mit ihrer Schwelle: `r * k >= 1,5 * stufe.pforte`.
// Da `r * k` durch die Anhebung nie unter 1,5 faellt, war die Bedingung bei
// jeder Stufe ausser „All" immer wahr — die Pforte konnte nicht schlagen, nur
// die Rundung tat es. Jetzt vergleicht sie `rb` (das unangehobene Mass).
//
// Was der Fall halten muss: dieselbe Stellung, in der die alte Fassung einen
// Namen zuliess, weil der Bildschirmboden ihn stuetzte, laesst ihn jetzt fallen.
// Darum steht zu beiden Seiten der Kante eine Zahl — 4 Welteinheiten sind das,
// was `knotenRadius` einer unverbundenen Notiz gibt, und 1,5 Bildpunkte ist die
// Schwelle, die der Mal-Pass an der Pforte anlegt.

let zaehler = 0;
function noten(n: number): Memory[] {
  return Array.from({ length: n }, () => {
    zaehler++;
    return {
      id: `p${zaehler}`, userId: "local", title: `Notiz ${zaehler}`, content: "Inhalt",
      tags: [], type: "semantic", createdAt: Date.parse("2024-01-01"), updatedAt: Date.parse("2024-01-01"),
    } as Memory;
  });
}

beforeEach(() => {
  installiereLeinwand();
  installiereResizeObserver(1000, 700);
  installiereZeiger();
  setzeTheme("dunkel");
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); document.documentElement.removeAttribute("style"); });

async function zeichne(memories: Memory[]) {
  const view = render(<KnowledgeGraph memories={memories} onSelectMemory={vi.fn()} />);
  await act(async () => { await new Promise((r) => setTimeout(r, 150)); });
  return view;
}
const knopf = (c: HTMLElement, t: string) => c.querySelector(`button[title="${t}"]`) as HTMLButtonElement;
const etat = (c: HTMLElement) => (c.querySelector('[data-testid="graph-benannt"]')?.textContent ?? "").trim();
/** Der Zoom, den die Flaeche selbst anzeigt — in hundertsteln, wie der Mal-Pass ihn rechnet. */
function zoom(c: HTMLElement): number {
  const text = (c.querySelector('[title="Current zoom"]')?.textContent ?? "").trim();
  const k = Number(text.replace(/[^\d.]/g, ""));
  expect(k, `Zoom-Anzeige nicht lesbar: "${text}"`).toBeGreaterThan(0);
  return k / 100;
}
async function rauszoomen(c: HTMLElement, schritte: number) {
  await act(async () => {
    for (let i = 0; i < schritte; i++) knopf(c, "Zoom out").click();
    await new Promise((r) => setTimeout(r, 80));
  });
}
/** Die Dichtestufe der Namen — ein Knopf mit ihrem Wort, wie ihn ein Mensch sieht. */
async function stufe(c: HTMLElement, wort: string) {
  const kn = [...c.querySelectorAll("button")].find((b) => b.textContent?.trim() === wort);
  expect(kn, `die Dichtestufe "${wort}" fehlt in der Leiste`).toBeTruthy();
  await act(async () => { kn!.click(); await new Promise((r) => setTimeout(r, 60)); });
}

const KNOTEN_WELT = knotenRadius(0);
const SCHWELLE = 1.5;

describe("KnowledgeGraph: die Titel-Pforte (#30)", () => {
  it("lasst einen Knoten fallen, den nur der Bildschirmboden haelt", async () => {
    const { container } = await zeichne(noten(24));
    // „Many" ist die Stufe mit der halben Pforte (0,75 Bildpunkte statt 1,5).
    // Sie ist der einzige Stand, in dem die beiden Fassungen sich trennen:
    // gegen den angehobenen Bildschirmwert (der immer auf 1,5 zu liegen kommt)
    // konnte die alte Pforte nie schlagen — ausser ueber die Rundung, und eine
    // Rundung ist kein Fall. Bei 0,75 trennen die zwei Stufen das Doppelte.
    await stufe(container, "Many");
    await rauszoomen(container, 12);
    const k = zoom(container);
    const schwelleViele = SCHWELLE * 0.5;
    // Die Rechnung, die dieser Fall stellt: das unangehobene Mass liegt unter
    // der Schwelle der Stufe, der angehobene Bildschirmwert darueber.
    expect(KNOTEN_WELT * k, `das wahre Mass bei ${(k * 100).toFixed(1)} % Zoom`).toBeLessThan(schwelleViele);
    expect(SCHWELLE, "der Bildschirmboden haelt den Knoten sichtbar — und lag bei der alten Fassung ueber der Schwelle").toBeGreaterThanOrEqual(schwelleViele);
    await waitFor(
      () => expect(etat(container), `Zoom ${(k * 100).toFixed(1)} % — die Zeile sagt: "${etat(container)}"`).toMatch(/\d+ too small for a name at this zoom/),
      { timeout: 3000, interval: 60 }
    );
    const fallen = Number((etat(container).match(/(\d+) too small/) ?? [])[1]);
    expect(fallen, "die Pforte hat keinen einzigen Kandidaten abgewiesen").toBeGreaterThan(0);
  });

  it("laesst in der eingepassten Ansicht niemanden an der Pforte fallen", async () => {
    const { container } = await zeichne(noten(24));
    const k = zoom(container);
    // Die Kontrolle: oberhalb der Schwelle darf die Pforte keine Nennung
    // kosten. Faellt dieser Satz, schlaegt die Pforte grundlos — dann ist die
    // Heilung eine Klappe, keine Schwelle.
    expect(KNOTEN_WELT * k, `bei ${(k * 100).toFixed(0)} % Zoom`).toBeGreaterThanOrEqual(SCHWELLE);
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
    expect(etat(container), `Zoom ${(k * 100).toFixed(0)} %`).not.toMatch(/too small for a name/);
  });
});
