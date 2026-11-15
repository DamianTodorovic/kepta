// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { Dashboard } from "../../src/components/Dashboard";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import { ToastProvider } from "../../src/components/ui/Toast";
import { installiereResizeObserver } from "../helfer/canvas";
import { fensterZeile, kopfFensterSatz } from "../../src/components/KnowledgeGraph";

// Punkt 124, gemessen 05:28 Uhr am installierten 3.2.83 an 21 000 Notizen
// (Mappe: audit-2026-10-09/feldzug/BEFUND-124-FENSTER-2910.md). Die Tuer weiss es genau:
//
//   Fenster 500 Begriffe von 42 700 | 2 000 Kanten von 150 600 | begrenzt true
//   (ihr eigner Hinweis steht in `server/router/system.ts:158-168`)
//
// Die Flaeche liest das Feld nicht: `ausriss` kommt im Leib mit, aber kein Verbraucher
// nennt es. Was der Nutzer stattdessen sieht, ist die Rahmenzeile "1,104 of 21,000 unfolded
// notes are in this picture" — richtig als Zahl, falsch als Erwartung. Denn was ausserhalb
// des Fensters liegt, kann kein Zoom hereinholen, und kein Wort im Bild sagt das.
//
// Gehalten wird hier EINE Aussage: die Grenze wird genannt, wenn die Tuer sie meldet, und
// sie wird NICHT erfunden, wenn die Tuer schweigt (eine aeltere Tuer kennt `ausriss` nicht).

function notiz(i: number) {
  return {
    id: `s${i}`, userId: "local", title: `Notiz ${i}`, content: `Inhalt ${i}`,
    tags: ["protokoll"], type: "semantic",
    createdAt: Date.parse("2025-01-01"), updatedAt: Date.parse("2025-01-01"),
  };
}

const FELDBESTAND = 40;

function tuer(ausriss: Record<string, unknown> | null) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const ziel = String(url);
    if (ziel.includes("/api/memories?alle=1")) {
      return new Response(JSON.stringify({ count: FELDBESTAND, total: FELDBESTAND, memories: Array.from({ length: FELDBESTAND }, (_, i) => ({ ...notiz(i + 1), id: `g${i + 1}` })) }), { status: 200 });
    }
    if (ziel.includes("/api/memories")) {
      return new Response(JSON.stringify({ count: 4, total: FELDBESTAND, memories: Array.from({ length: 4 }, (_, i) => notiz(i + 1)) }), {
        status: 200, headers: { "content-type": "application/json", "x-kepta-total": String(FELDBESTAND) },
      });
    }
    if (ziel.includes("/api/graph")) {
      const leib: Record<string, unknown> = {
        relations: [{ source: "Alpha", target: "Beta", relation: "mentions", memoryId: null }],
        memoriesByEntity: { Alpha: ["g1", "g2"], Beta: ["g3"] },
        bestand: { knoten: 42700, kanten: 150600 },
      };
      if (ausriss) leib.ausriss = ausriss;
      return new Response(JSON.stringify(leib), { status: 200 });
    }
    if (ziel.includes("/api/search")) return new Response(JSON.stringify({ results: [], total: 0 }), { status: 200 });
    if (ziel.includes("/api/inbox/status")) return new Response(JSON.stringify({ inboxDir: "/x", files: [], watching: true }), { status: 200 });
    if (ziel.includes("/api/health")) return new Response(JSON.stringify({ ok: true, version: "3.2.84", encryption: { aktiv: true } }), { status: 200 });
    return new Response("{}", { status: 200 });
  }));
}

beforeEach(() => {
  localStorage.clear();
  installiereResizeObserver();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function zeile(container: HTMLElement) {
  const e = container.querySelector('[data-testid="graph-fenster"]');
  return e ? (e.textContent ?? "").replace(/\s+/g, " ").trim() : null;
}

describe("#124 die Flaeche nennt ihr Fenster", () => {
  it("die reine Funktion: begrenzt nennt beide Verhaeltnisse", () => {
    const s = fensterZeile({ begriffe: 500, kantenGezeigt: 2000, begrenzt: true }, { knoten: 42700, kanten: 150600 });
    expect(s).toMatch(/^500 of 42,700 concepts and 2,000 of 150,600 claims reach this picture/);
    // Die Erwartung, die der Satz traegt: kein Zoom holt herein, was das Fenster laesst.
    expect(s).toMatch(/no zoom/);
  });

  it("die reine Funktion: ein volles Bild schweigt, eine fehlende Tuer raet nicht", () => {
    expect(fensterZeile({ begriffe: 12, kantenGezeigt: 9, begrenzt: false }, { knoten: 12, kanten: 9 })).toBe("");
    expect(fensterZeile(undefined, { knoten: 42700, kanten: 150600 })).toBe("");
    expect(fensterZeile({ begriffe: 500, kantenGezeigt: 2000, begrenzt: true }, undefined)).toBe("");
  });

  it("meldet die Tuer die Kappe, steht der Satz im Bild", async () => {
    tuer({ begriffe: 500, kantenImAuszug: 2000, kantenGezeigt: 2000, kantenVerworfen: 0, begrenzt: true });
    const { container } = render(
      <ThemeProvider><AuthProvider><ToastProvider><Dashboard /></ToastProvider></AuthProvider></ThemeProvider>
    );
    await waitFor(() => expect(zeile(container)).toMatch(/reach this picture/), { timeout: 8000 });
    expect(zeile(container)).toMatch(/^500 of 42,700 concepts and 2,000 of 150,600 claims/);
  });

  it("der Kopf traegt die Kurzform immer, die Langform nur hinter der Klappe", () => {
    expect(kopfFensterSatz(true)).toMatch(/window, not all of your notes/);
    expect(kopfFensterSatz(false)).toBe("");
  });

  it("steht die Kappe, nennt der KOPF sie — ohne dass jemand die Legende oeffnet", async () => {
    tuer({ begriffe: 500, kantenImAuszug: 2000, kantenGezeigt: 2000, kantenVerworfen: 0, begrenzt: true });
    const { container } = render(
      <ThemeProvider><AuthProvider><ToastProvider><Dashboard /></ToastProvider></AuthProvider></ThemeProvider>
    );
    await waitFor(() => expect(container.querySelector('[data-testid="graph-kopf"]')?.textContent)
      .toMatch(/window, not all of your notes/), { timeout: 8000 });
    // Nicht gegen die Klappe pruefen: ihre Anfangsstellung ist eine Messung des
    // Fensters, nicht dieser Funktion — am ausgelieferten Stueck stand sie 05:21 Uhr auf
    // `false` (Legende zu), in jsdom steht sie auf `true`. Behauptet wird hier nur, dass
    // der KOPF die Auskunft traegt, denn der Kopf steht in beiden Umgebungen.
  });

  it("schweigt die Kappe im Kopf, wenn die Tuer kein Fenster meldet", async () => {
    tuer({ begriffe: 12, kantenImAuszug: 9, kantenGezeigt: 9, kantenVerworfen: 0, begrenzt: false });
    const { container } = render(
      <ThemeProvider><AuthProvider><ToastProvider><Dashboard /></ToastProvider></AuthProvider></ThemeProvider>
    );
    await waitFor(() => expect(container.querySelector('[data-testid="graph-kopf"]')).toBeTruthy(), { timeout: 8000 });
    expect(container.querySelector('[data-testid="graph-kopf"]')?.textContent).not.toMatch(/window, not all of your notes/);
  });

  it("schweigt die Tuer (aeltere Fassung), erfindet die Flaeche kein Fenster", async () => {
    tuer(null);
    const { container } = render(
      <ThemeProvider><AuthProvider><ToastProvider><Dashboard /></ToastProvider></AuthProvider></ThemeProvider>
    );
    await waitFor(() => expect(container.querySelector('[data-testid="graph-kopf"]')).toBeTruthy(), { timeout: 8000 });
    expect(zeile(container)).toBe(null);
  });
});
