// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { Dashboard } from "../../src/components/Dashboard";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import { ToastProvider } from "../../src/components/ui/Toast";
import { installiereResizeObserver } from "../helfer/canvas";
import type { Memory } from "../../src/types";

// Aufgabe #101, bewiesen an Damians eigenem Bild 18:34 MESZ
// (`audit-2026-10-09/e1-bilder/graph-329-pannen-1440.png`):
//
//   Kopf    „100 of 21,066 in all"
//   Bilanz  „21066 notes · 159 concepts · 1061 links"
//   Rahmen  „729 of 21066 unfolded notes are in this picture"
//
// Der Kopf las `memories.length` — die SEITE, die die Liste trägt (Dashboard.tsx:1926).
// Die Bilanz las `bildZaehlung.knoten` — das FELT, das seit 3.2.8 den ganzen Bestand
// holt (KnowledgeGraph.tsx:788-802). Zwei Wege, ein Bildschirm, und der obere ist der
// falsche: seit der Ganzbestand lädt, sagt der Kopf eine Kappung, die es nicht mehr gibt.
//
// Gehalten wird hier EINE Aussage: Kopf und Bilanz nennen dieselbe Menge, und die Menge
// kommt aus dem Feld. Die Seite darf an keiner Stelle der Graph-Zeile mehr auftauchen.

const SEITE = 100;
const FELDBESTAND = 130;

function notiz(i: number): Memory {
  return {
    id: `s${i}`, userId: "local", title: `Notiz ${i}`, content: `Inhalt ${i}`,
    tags: ["protokoll"], type: "semantic",
    createdAt: Date.parse("2025-01-01"), updatedAt: Date.parse("2025-01-01"),
  };
}

const seitenseite = Array.from({ length: SEITE }, (_, i) => notiz(i + 1));
const feldseite = Array.from({ length: FELDBESTAND }, (_, i) => ({ ...notiz(i + 1), id: `g${i + 1}` }));

function tuer(mitBestand: boolean) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const ziel = String(url);
    if (ziel.includes("/api/memories?alle=1")) {
      return new Response(JSON.stringify({ count: feldseite.length, total: FELDBESTAND, memories: feldseite }), { status: 200 });
    }
    if (ziel.includes("/api/memories")) {
      return mitBestand
        ? new Response(
          JSON.stringify({ count: SEITE, total: FELDBESTAND, limit: SEITE, offset: 0, begrenzt: true, memories: seitenseite }),
          { status: 200, headers: { "content-type": "application/json", "x-kepta-total": String(FELDBESTAND), "x-kepta-begrenzt": "1" } }
        )
        : new Response(JSON.stringify(seitenseite), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (ziel.includes("/api/search")) return new Response(JSON.stringify({ results: [], total: 0 }), { status: 200 });
    if (ziel.includes("/api/graph")) return new Response(JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 });
    if (ziel.includes("/api/inbox/status")) return new Response(JSON.stringify({ inboxDir: "/x", files: [], watching: true }), { status: 200 });
    if (ziel.includes("/api/health")) {
      return new Response(JSON.stringify(mitBestand
        ? { ok: true, count: FELDBESTAND, version: "3.2.9", embeddings: { total: 0, embedded: 0, models: {} }, encryption: { aktiv: true } }
        : { ok: true, version: "3.2.9" }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }));
}

beforeEach(() => {
  localStorage.clear();
  tuer(true);
  installiereResizeObserver();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function rahmen() {
  return render(
    <ThemeProvider><AuthProvider><ToastProvider><Dashboard /></ToastProvider></AuthProvider></ThemeProvider>
  );
}

/** Der Kopf der Graph-Zeile: das innerste div, das den langen Satz trägt. Gegen
 *  einen Vorfahren zu prüfen wäre der false green, den dashboard-bestand.test.tsx
 *  schon einmal gehabt hat — sein textContent schluckt die Bilanz darunter. */
function kopfZeile(container: HTMLElement) {
  const treffer = [...container.querySelectorAll("div")].filter((d) => /connected through tags/.test(d.textContent ?? ""));
  return treffer[treffer.length - 1] ?? null;
}

/** Die Bilanz über der Legende — sie zählt, was im Feld steht. */
function bilanz(container: HTMLElement) {
  return container.querySelector('[data-testid="graph-kopf"]')?.textContent?.trim() ?? "";
}

/** Die erste Menge in einer Zeile, im Kleid mit Tausenderpunkt. */
function ersteZahl(text: string): string {
  const m = text.match(/\d[\d,]*/);
  return m ? m[0] : "";
}

/**
 * Der ruhige Zustand: das Feld hat den Ganzbestand übernommen UND die Liste hat
 * ihre Seite. Auf nur eine der beiden Bedingungen zu warten war mein erster
 * Fehler — kurz nach dem Mount steht im Kopf die Länge der noch leeren Liste
 * („0 of 130"), und der Fall ist aus dem falschen Grund grün oder rot.
 */
async function ruhe(container: HTMLElement, ladungsMuster: RegExp) {
  await waitFor(() => expect(ersteZahl(bilanz(container))).toBe("130"), { timeout: 8000 });
  await waitFor(() => expect(container.textContent, "die Liste hat ihre Seite noch nicht").toMatch(ladungsMuster), { timeout: 8000 });
  await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
  expect(ersteZahl(bilanz(container)), "das Feld ist nicht stabil bei 130").toBe("130");
}

describe("#101 Kopf und Bilanz stellen dieselbe Menge", () => {
  it("der Kopf zählt das Feld, nicht die Seite, die die Liste trägt", async () => {
    const { container } = rahmen();
    await ruhe(container, /in the 100 loaded/);
    const kopf = kopfZeile(container);
    expect(kopf, "der Graph-Kopf ist nicht zu finden").toBeTruthy();
    expect(
      ersteZahl(kopf!.textContent ?? ""),
      `der Kopf zählt ${ersteZahl(kopf!.textContent ?? "")}, die Bilanz zählt ${ersteZahl(bilanz(container))} — zwei Mengen, ein Bildschirm`
    ).toBe(ersteZahl(bilanz(container)));
  });

  it("traegt das Feld den ganzen Bestand, erfindet der Kopf keine Kappung", async () => {
    const { container } = rahmen();
    await ruhe(container, /in the 100 loaded/);
    const kopf = kopfZeile(container);
    expect(
      kopf!.textContent,
      "der Kopf behauptet eine Kappung, obwohl das Feld den ganzen Bestand trägt"
    ).not.toMatch(/of\s+130\s+in all/);
  });

  it("schweigt die Tür, folgt der Kopf trotzdem dem Feld", async () => {
    tuer(false);
    const { container } = rahmen();
    // Der Store hält Bestand und ETag im Modul: neu befragen, statt den Bestand
    // des vorherigen Falls als Schweigen der Tür auszugeben.
    const { refreshMemories } = await import("../../src/lib/store");
    await act(async () => { await refreshMemories(); });
    await ruhe(container, /100 of 100 notes/);
    const kopf = kopfZeile(container);
    expect(
      ersteZahl(kopf!.textContent ?? ""),
      `der Kopf nennt ${ersteZahl(kopf!.textContent ?? "")} — die Länge der Liste, nicht das Feld`
    ).toBe("130");
    expect(kopf!.textContent).not.toMatch(/\bof\b/);
  });
});
