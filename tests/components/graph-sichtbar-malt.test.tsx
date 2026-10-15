// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger, setzeTheme, type Leinwand } from "../helfer/canvas";
import type { Memory } from "../../src/types";

// Aufgabe #100, bewiesen an Damians laufender App 19:0x MESZ (CDP, eigenes
// Lesefenster, Skript `audit-2026-10-09/leitung-graph-sichtbar-beweis.mjs`):
//
//   vorher              {"sichtbar":"visible", "leinwand":"300x150", "zoom":"3"}
//   nach Groessen-Change {"sichtbar":"visible", "leinwand":"1938x1382","zoom":"3"}
//   nach Zuruecknahme    {"sichtbar":"visible", "leinwand":"1940x1384","zoom":"9"}
//
// Das Fenster war SICHTBAR und die Leinwand hatte trotzdem ihre HTML-Defaultgröße
// 300x150 — es war nie ein Bild gemalt worden. Der Grund steht in dieser Datei:
// die Bildschleife prüft `document.hidden` EINMAL, wenn der Effect läuft, und
// schmeißt dann weg. `document.hidden` ist keine Abhängigkeit, es gibt keinen
// `visibilitychange`-Hörer. Ein Graph, der zum ersten Mal in einem verdeckten
// Fenster geöffnet wird, malt in diesem Programmzyklus nie wieder — und der
// Ausschnitt, der für eine 300x150-Fläche gerechnet wurde, bleibt stehen: 3 % Zoom.
//
// Gehalten wird hier die RÜCKKEHR: verdeckt aufgerufen, sichtbar gemacht, gemalt.

let verborgen = false;
Object.defineProperty(document, "hidden", { configurable: true, get: () => verborgen });

const { KnowledgeGraph } = await import("../../src/components/KnowledgeGraph");

let buch: Leinwand;
let zaehler = 0;
function note(i: number): Memory {
  zaehler++;
  return {
    id: `v${zaehler}_${i}`, userId: "local", title: `Notiz ${zaehler}`, content: "Inhalt",
    tags: ["feld"], type: "semantic",
    createdAt: Date.parse("2024-01-01"), updatedAt: Date.parse("2024-01-01"),
  };
}

beforeEach(() => {
  verborgen = false;
  zaehler = 0;
  buch = installiereLeinwand();
  installiereResizeObserver(1000, 700);
  installiereZeiger();
  setzeTheme("dunkel");
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 })
  ));
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("style");
});

async function atmen(ms = 200) {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
}

async function flaeche(notizen: Memory[]) {
  const view = render(<KnowledgeGraph memories={notizen} onSelectMemory={() => {}} />);
  await atmen(320);
  return view;
}

/** Die Sichtbar-Meldung kommt aus dem echten Leben, nicht aus React: der Hörer
 *  setzt Zustand außerhalb jeder Reaktion — also gehört der Schlag in `act`. */
async function sichtbarWerden() {
  verborgen = false;
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
  await atmen(600);
}

async function verstecken() {
  verborgen = true;
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
  await atmen(400);
}

describe("#100 Ein verdeckt gerufener Graph malt, sobald er sichtbar wird", () => {
  it("steht die Schleife, solange das Fenster verdeckt ist (Kontrolle)", async () => {
    verborgen = true;
    const { container } = await flaeche(Array.from({ length: 24 }, (_, i) => note(i)));
    expect(buch.zahl("clearRect"), "ein verdecktes Fenster malt nicht — die Sperre selbst ist richtig").toBe(0);
    const c = container.querySelector("canvas")!;
    expect(c.width, "ohne Bild bleibt die Leinwand auf ihrem Default 300x150").toBe(300);
  });

  it("holt eine Sichtbar-Meldung die Fläche zurück aufs Blatt", async () => {
    verborgen = true;
    const { container } = await flaeche(Array.from({ length: 24 }, (_, i) => note(i)));
    await sichtbarWerden();
    expect(
      buch.zahl("clearRect"),
      "das Fenster ist sichtbar, aber es wird immer noch nicht gemalt — die Schleife startet nie neu"
    ).toBeGreaterThan(0);
    const c = container.querySelector("canvas")!;
    expect(c.width, "die Leinwand trägt weiter ihre Defaultgröße statt der beobachteten").toBeGreaterThan(300);
  });

  it("verliert ein zweites Verstecken das Bild nicht", async () => {
    // Hin und her, aber von verdeckt aus: der Hörer darf nur pausieren, nicht
    // entgültig abreißen.
    verborgen = true;
    const { container } = await flaeche(Array.from({ length: 24 }, (_, i) => note(i)));
    await sichtbarWerden();
    expect(buch.zahl("clearRect"), "der erste Rückweg malt schon nicht").toBeGreaterThan(0);
    buch.leeren();
    await verstecken();
    const framesImVersteck = buch.zahl("clearRect");
    await sichtbarWerden();
    expect(buch.zahl("clearRect"), "nach dem zweiten Sichtbarwerden malt die Fläche nicht mehr").toBeGreaterThan(framesImVersteck);
    expect(container.querySelector("canvas")!.width).toBeGreaterThan(300);
  });
});
