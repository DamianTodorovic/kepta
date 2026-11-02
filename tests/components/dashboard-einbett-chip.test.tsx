// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { Dashboard } from "../../src/components/Dashboard";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import { ToastProvider } from "../../src/components/ui/Toast";
import { installiereResizeObserver } from "../helfer/canvas";
import type { Memory } from "../../src/types";

// Punkt 115, gemessen 27.10. 14:11 MESZ am ausgelieferten 3.2.66 in einer eignen Kapsel:
// 122 s nach einem Import von 600 Notizen standen **256 von 1 200** Stuecken als eingebettet
// da (die Queue arbeitet mit etwa 2,1 Stuecken je Sekunde). Auf der Wissens-Flaeche sagte der
// Chip im Streifen `gehirn-status` in diesem Zustand: `Embeddings: nomic-embed-text 256` —
// eine Zahl ohne ihre Grundgesamtheit. Die zwei Zahlen `256/1,200 embedded` standen nur im
// andern Zweig, wo die Tuer **gar kein** Modell meldet (`Dashboard.tsx:1851-1858`).
// Dieselbe Klasse wie 113 und 16: der Leser muss aus der Zahl selbst sehen koennen, ob die
// semantische Suche schon alles hat oder gerade erst baut.

const NOTIZ = (i: number): Memory => ({
  id: `m${i}`, userId: "local", title: `Notiz ${i}`, content: `Inhalt ${i}`,
  tags: ["protokoll"], type: "semantic",
  createdAt: Date.parse("2025-01-01"), updatedAt: Date.parse("2025-01-01"),
});
const seite = Array.from({ length: 5 }, (_, i) => NOTIZ(i + 1));

function stubpeTuer(embeddings: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const ziel = String(url);
    if (ziel.includes("/api/memories")) {
      return new Response(JSON.stringify({ count: seite.length, total: seite.length, memories: seite }), {
        status: 200, headers: { "content-type": "application/json", "x-kepta-total": String(seite.length) },
      });
    }
    if (ziel.includes("/api/search")) return new Response(JSON.stringify({ results: [], total: 0 }), { status: 200 });
    if (ziel.includes("/api/graph")) return new Response(JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 });
    if (ziel.includes("/api/graph/nachzug")) return new Response(JSON.stringify({ running: false, concepts: 0, edges: 0 }), { status: 200 });
    if (ziel.includes("/api/inbox/status")) return new Response(JSON.stringify({ inboxDir: "/x", files: [], watching: true }), { status: 200 });
    if (ziel.includes("/api/health")) {
      return new Response(JSON.stringify({ ok: true, count: seite.length, version: "3.2.67", embeddings, encryption: { aktiv: true } }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }));
}

const chip = async () => {
  const { container } = render(
    <AuthProvider><ThemeProvider><ToastProvider><Dashboard /></ToastProvider></ThemeProvider></AuthProvider>
  );
  const el = await waitFor(() => {
    const c = container.querySelector<HTMLElement>('[data-testid="gehirn-status"]');
    if (!c) throw new Error("kein Status-Streifen");
    if (!/Embeddings/.test(c.textContent || "")) throw new Error("kein Einbett-Chip");
    return c;
  });
  return (el.textContent || "").replace(/\s+/g, " ").trim();
};

beforeEach(() => {
  localStorage.clear();
  installiereResizeObserver();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("#115 der Einbett-Chip nennt seine Grundgesamtheit", () => {
  it("zeigt die Zahl der Stuecke gegen den Gesamtumfang, wenn ein Modell arbeitet", async () => {
    stubpeTuer({ total: 1200, embedded: 256, models: { "nomic-embed-text": 256 } });
    const text = await chip();
    expect(text, `der Chip nennt keinen Nenner: "${text}"`).toMatch(/256 of 1,200 pieces/);
  });

  it("zeigt den Umfang auch, wenn die Queue fertig ist", async () => {
    stubpeTuer({ total: 1200, embedded: 1200, models: { "nomic-embed-text": 1200 } });
    const text = await chip();
    expect(text, `der Chip nennt keinen Nenner: "${text}"`).toMatch(/1,200 of 1,200 pieces/);
  });

  it("nennt die zwei Zahlen auch im Zweig ohne Modell, mit ihrer Einheit", async () => {
    stubpeTuer({ total: 1200, embedded: 256, models: {} });
    const text = await chip();
    expect(text, `der Zweig ohne Modell ist umgefallen: "${text}"`).toMatch(/256 of 1,200 pieces ready/);
  });

  it("schweigt, wo die Tuer ueberhaupt keine Stuecke meldet", async () => {
    stubpeTuer({ total: 0, embedded: 0, models: {} });
    const { container } = render(
      <AuthProvider><ThemeProvider><ToastProvider><Dashboard /></ToastProvider></ThemeProvider></AuthProvider>
    );
    await waitFor(() => expect(container.querySelector('[data-testid="gehirn-status"]')).not.toBeNull());
    const text = (container.querySelector('[data-testid="gehirn-status"]')?.textContent || "").replace(/\s+/g, " ");
    expect(text, `eine Zahl ohne Bestand steht da: "${text}"`).not.toMatch(/Embeddings/);
  });
});
