// @vitest-environment jsdom
/* #49, zweiter Griff — die Absage der Liste zeigt im Fenster Satz UND Grund.

   Gemessen 3.11. 21:31 MEZ am ausgelieferten 3.2.136 im echten Fenster (390x844, der Vor-Diener
   laesst nur `/api/memories` scheitern): der Block steht, 336x192 px, ohne Ueberlauf, mit Knopf.
   Sein Leib war der Satz ein zweites Mal — "Your notes did not load. Nothing was changed." — und
   von der Tuer blieb kein Grund uebrig. Die Ueberschrift heet "The server did not answer"; was
   fehlt, ist die Zahl, die eine Nachfragende erst handlungsfahig macht (Neustart? Ordner voll?
   Fremder Vor-Diener?).

   Der Fall verlangt also beides an einem Ort: den Satz, den die App schreibt, und den Grund,
   den die Tuer gab. Die Gegenprobe haelt die andre Seite: ein leerer Bestand ohne Absage darf
   keinen Grund erfinden. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Dashboard } from "../../src/components/Dashboard";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import { ToastProvider } from "../../src/components/ui/Toast";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger } from "../helfer/canvas";

const GESUND = {
  ok: true, version: "3.2.136", count: 0,
  encryption: { aktiv: false, ablage: null },
  embeddings: { total: 0, embedded: 0, models: {} },
  mcp: { tools: 8, protocol: "2026-07-28" },
};

function tuerenDieDieListeAblehnen() {
  vi.stubGlobal("fetch", vi.fn(async (eingabe: RequestInfo | URL) => {
    const pfad = String(typeof eingabe === "string" ? eingabe : (eingabe as Request).url);
    if (pfad.startsWith("/api/memories")) {
      return new Response(JSON.stringify({ error: "storage unreadable" }), { status: 500 });
    }
    if (pfad.includes("/api/health")) return new Response(JSON.stringify(GESUND), { status: 200 });
    return new Response("{}", { status: 200 });
  }));
}

function tuerenDieAllesLiefern() {
  vi.stubGlobal("fetch", vi.fn(async (eingabe: RequestInfo | URL) => {
    const pfad = String(typeof eingabe === "string" ? eingabe : (eingabe as Request).url);
    if (pfad.startsWith("/api/memories")) {
      return new Response(JSON.stringify({ memories: [], total: 0 }), { status: 200 });
    }
    if (pfad.includes("/api/health")) return new Response(JSON.stringify(GESUND), { status: 200 });
    return new Response("{}", { status: 200 });
  }));
}

async function zeige() {
  render(<ThemeProvider><AuthProvider><ToastProvider><Dashboard /></ToastProvider></AuthProvider></ThemeProvider>);
  await waitFor(() => expect(screen.getAllByRole("button").length).toBeGreaterThan(0));
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("ki_gehirn_wizard_dismissed", "1");
  installiereLeinwand();
  installiereResizeObserver(1000, 700);
  installiereZeiger();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("#49: die Listen-Absage traegt Satz und Grund", () => {
  it("nennt an der Zeile auch die Zahl der Tuer, nicht nur den eignen Satz", async () => {
    tuerenDieDieListeAblehnen();
    await zeige();
    const feld = await screen.findByTestId("lad-fehler");
    const text = (feld.textContent || "").replace(/\s+/g, " ").trim();
    expect(text, `kein Satz im Feld: ${text}`).toMatch(/did not load/i);
    expect(text, `kein Grund in der Zeile: ${text}`).toMatch(/HTTP 500/);
  });

  it("KONTROLLE: ein leerer Bestand ohne Absage erfindet keinen Grund", async () => {
    tuerenDieAllesLiefern();
    await zeige();
    await waitFor(() => expect(screen.getAllByRole("button").length).toBeGreaterThan(0));
    expect(screen.queryByTestId("lad-fehler"), "eine gesunde Tuer darf keine Absage malen").toBeNull();
  });
});
