// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { Dashboard } from "../../src/components/Dashboard";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import { ToastProvider } from "../../src/components/ui/Toast";
import { installiereResizeObserver } from "../helfer/canvas";
import type { Memory } from "../../src/types";

// Punkt 116, gemessen 27.10. 16:58:03 MESZ am ausgelieferten 3.2.67 in eigner Kapsel:
// nach einem Import von 3 000 Notizen standen 120 s spaeter **256 von 6 000** Stuecken als
// eingebettet da — die Queue arbeitet mit etwa 2,1 Stuecken je Sekunde, der Index ist also
// nach rechnerisch 47 Minuten voll. In dieser Zeit findet die semantische Suche weniger,
// als der Laden hergibt, und **keine Flaeche sagt das**. Der Chip im Status-Streifen nennt
// die Zahl (Punkt 115) — diese Zeile steht dort, wo der Mensch sucht, und sagt, was die
// Zahl fuer das Ergebnis bedeutet.

const NOTIZ = (i: number): Memory => ({
  id: `f${i}`, userId: "local", title: `Notiz ${i}`, content: `Inhalt ${i}`,
  tags: ["protokoll"], type: "semantic",
  createdAt: Date.parse("2025-01-01"), updatedAt: Date.parse("2025-01-01"),
});
const seite = Array.from({ length: 5 }, (_, i) => NOTIZ(i + 1));

function tuer(embeddings: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const ziel = String(url);
    if (ziel.includes("/api/memories")) {
      return new Response(JSON.stringify({ count: seite.length, total: seite.length, memories: seite }), {
        status: 200, headers: { "content-type": "application/json", "x-kepta-total": String(seite.length) },
      });
    }
    if (ziel.includes("/api/search")) return new Response(JSON.stringify({ results: [], total: 0 }), { status: 200 });
    if (ziel.includes("/api/graph")) return new Response(JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 });
    if (ziel.includes("/api/inbox/status")) return new Response(JSON.stringify({ inboxDir: "/x", files: [], watching: true }), { status: 200 });
    if (ziel.includes("/api/health")) {
      return new Response(JSON.stringify({ ok: true, count: seite.length, version: "3.2.68", embeddings, encryption: { aktiv: true } }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }));
}

async function zeichne() {
  const view = render(
    <AuthProvider><ThemeProvider><ToastProvider><Dashboard /></ToastProvider></ThemeProvider></AuthProvider>
  );
  await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
  return view;
}

const meldung = (container: HTMLElement) =>
  (container.querySelector('[data-testid="suche-fuellend"]')?.textContent || "").replace(/\s+/g, " ").trim();

beforeEach(() => { installiereResizeObserver(); localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("#116 die fuellende Vektorspur sagt es dort, wo gesucht wird", () => {
  it("meldet beide Zahlen, solange die Queue arbeitet", async () => {
    tuer({ total: 1200, embedded: 256, models: { "nomic-embed-text": 256 } });
    const { container } = await zeichne();
    const text = meldung(container);
    expect(text, "die Meldung fehlt, obwohl 256 von 1 200 Stuecken arbeiten").toMatch(/256 of 1,200/);
    expect(text).toMatch(/still filling/);
  });

  it("schweigt, wenn jeder Chunk seinen Vektor hat", async () => {
    tuer({ total: 1200, embedded: 1200, models: { "nomic-embed-text": 1200 } });
    const { container } = await zeichne();
    expect(meldung(container), "die Meldung steht trotz voller Deckung").toBe("");
  });

  it("schweigt, wo die Tuer ueberhaupt keine Chunks meldet", async () => {
    tuer({ total: 0, embedded: 0, models: {} });
    const { container } = await zeichne();
    expect(meldung(container), "eine Zahl ohne Bestand steht da").toBe("");
  });
});
