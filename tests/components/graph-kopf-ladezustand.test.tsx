// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { Dashboard } from "../../src/components/Dashboard";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import { ToastProvider } from "../../src/components/ui/Toast";
import { installiereResizeObserver } from "../helfer/canvas";
import { kopfLadeSatz } from "../../src/components/KnowledgeGraph";

// Punkt 123, gemessen 04:46 Uhr am ausgelieferten 3.2.82 an 21 000 Notizen
// (audit-2026-10-09/feldzug/BEFUND-123-BODEN-21000-2910.md): der Kopf der Graph-Zeile
// lautete in den ersten Sekunden
//
//   "2 notes of 21,000 in the store · 2 concepts of 42,700 in the store · 4 links"
//
// und das war jede Zahl an diesem Ort — kein Wort davon, dass das Bild noch laeuft.
// Die Tuer antwortete derweil stabil mit 500 Begriffen und 1 422 Kanten (TUER-SPUR,
// 04:54 Uhr); die 2 kamen daher, dass der Gang sich den ganzen Bestand selbst holt
// (`/api/memories?alle=1`, KnowledgeGraph.tsx:1288) und bis dahin nur die Fensterseite
// kannte. Ein Nutzer sieht zwei Notizen und liest: mein Graph hat zwei Notizen.
//
// Gehalten wird hier EINE Aussage: der Kopf unterscheidet "kommt noch" und "die Tuer
// hat nicht geantwortet" von "das ist der Stand" — und erfindet in keinem der drei
// Faelle eine Zahl, die der andere Fall meint.

function notiz(i: number) {
  return {
    id: `s${i}`, userId: "local", title: `Notiz ${i}`, content: `Inhalt ${i}`,
    tags: ["protokoll"], type: "semantic",
    createdAt: Date.parse("2025-01-01"), updatedAt: Date.parse("2025-01-01"),
  };
}

const SEITE = Array.from({ length: 2 }, (_, i) => notiz(i + 1));

function tuer(alle: "haengt" | "gibt" | "wirft") {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const ziel = String(url);
    if (ziel.includes("/api/memories?alle=1")) {
      if (alle === "wirft") throw new Error("Tuer nicht erreichbar");
      if (alle === "haengt") return await new Promise(() => { /* laeuft noch */ });
      return new Response(JSON.stringify({ count: 40, total: 40, memories: Array.from({ length: 40 }, (_, i) => ({ ...notiz(i + 1), id: `g${i + 1}` })) }), { status: 200 });
    }
    if (ziel.includes("/api/memories")) {
      return new Response(JSON.stringify({ count: SEITE.length, total: 40, memories: SEITE }), {
        status: 200, headers: { "content-type": "application/json", "x-kepta-total": "40" },
      });
    }
    if (ziel.includes("/api/graph")) return new Response(JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 });
    if (ziel.includes("/api/search")) return new Response(JSON.stringify({ results: [], total: 0 }), { status: 200 });
    if (ziel.includes("/api/inbox/status")) return new Response(JSON.stringify({ inboxDir: "/x", files: [], watching: true }), { status: 200 });
    if (ziel.includes("/api/health")) return new Response(JSON.stringify({ ok: true, version: "3.2.83", encryption: { aktiv: true } }), { status: 200 });
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

function kopf(container: HTMLElement) {
  return container.querySelector('[data-testid="graph-kopf"]')?.textContent?.trim() ?? "";
}

describe("#123 der Kopf sagt, was mit dem Bestand noch geschieht", () => {
  it("die reine Funktion: drei Staende, drei Aussagen, keine vierte", () => {
    expect(kopfLadeSatz("kommt")).toMatch(/still arriving/);
    expect(kopfLadeSatz("fort")).toMatch(/did not answer/);
    expect(kopfLadeSatz("da")).toBe("");
  });

  it("haengt der Ganzbestand, nennt der Kopf das Bild als ankommend", async () => {
    tuer("haengt");
    const { container } = render(
      <ThemeProvider><AuthProvider><ToastProvider><Dashboard /></ToastProvider></AuthProvider></ThemeProvider>
    );
    await waitFor(() => expect(kopf(container)).toMatch(/still arriving/), { timeout: 8000 });
  });

  it("wirft die Tuer, sagt der Kopf Grund und Reichweite — nicht eine Bestandszahl", async () => {
    tuer("wirft");
    const { container } = render(
      <ThemeProvider><AuthProvider><ToastProvider><Dashboard /></ToastProvider></AuthProvider></ThemeProvider>
    );
    await waitFor(() => expect(kopf(container)).toMatch(/did not answer/), { timeout: 8000 });
  });

  it("gibt die Tuer den ganzen Bestand, schweigt der Zusatz", async () => {
    tuer("gibt");
    const { container } = render(
      <ThemeProvider><AuthProvider><ToastProvider><Dashboard /></ToastProvider></AuthProvider></ThemeProvider>
    );
    await waitFor(() => expect(kopf(container)).toMatch(/40 notes/), { timeout: 8000 });
    expect(kopf(container)).not.toMatch(/still arriving|did not answer/);
  });
});
