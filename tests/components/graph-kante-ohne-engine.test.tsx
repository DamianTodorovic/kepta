// @vitest-environment jsdom
// Punkt 1 und 4, 2.11. — das Bild verliert seine Begriffs-Kanten, ohne ein Wort darüber.
//
// KnowledgeGraph.tsx:1962-1968 (von mir selbst gelesen, bevor dieser Fall stand):
//
//     const res = await fetch(`/api/graph?depth=${graphTiefe}`);
//     const data = await res.json();
//     if (!abgebrochen && data && Array.isArray(data.relations)) setGraphApi(data as GraphApi);
//   } catch { /* Engine nicht erreichbar — Aehnlichkeitskanten bleiben */ }
//
// Kein Status, kein Zweig, der es sagt. Was auf dem Schirm bleibt, ist ein Bild mit
// Tags- und Aehnlichkeitskanten — und die Kopfzeile behauptet weiter, das sei die Verbindung
// "through tags, similarity and knowledge entities". Genau die Zeile malt den Begriff mit,
// den die Tuer gerade nicht geliefert hat. Ein Nutzer, dessen Begriffs-Kanten fehlen, sieht
// ein duennes Bild und keinen Grund. Das trifft Punkt 1 ("der Graph gegen den Markt") und
// Punkt 4 ("keine Fehler in keinem Bereich") an derselben Stelle.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { Dashboard } from "../../src/components/Dashboard";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import { ToastProvider } from "../../src/components/ui/Toast";
import { installiereResizeObserver } from "../helfer/canvas";
import { kopfKanteSatz } from "../../src/components/KnowledgeGraph";
import type { Memory } from "../../src/types";

function notiz(i: number): Memory {
  return {
    id: `k${i}`, userId: "local", title: `Notiz ${i}`, content: `Die Frist ${i} haelt die Kasse.`,
    tags: ["saat"], type: "semantic", createdAt: Date.parse("2025-01-01"), updatedAt: Date.parse("2025-01-01"),
  };
}
const SEITE = Array.from({ length: 6 }, (_, i) => notiz(i + 1));

function tuer(bau: () => Response) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const ziel = String(url);
    if (ziel.includes("/api/memories")) {
      return new Response(JSON.stringify({ count: SEITE.length, total: SEITE.length, memories: SEITE }), {
        status: 200, headers: { "content-type": "application/json", "x-kepta-total": String(SEITE.length) },
      });
    }
    if (ziel.includes("/api/search")) return new Response(JSON.stringify({ results: [], total: 0 }), { status: 200 });
    // Ein Response-Koerper ist EINMAL lesbar. Die Flaeche holt die Route bei jedem
    // Bestandswechsel neu — einen geteilten Response zurückzugeben war ein Fehler MEINES
    // Stubs (zweite Lesung wirft, die Warnung stand ohne Anlass da), nicht der Flaeche.
    if (ziel.includes("/api/graph")) return bau();
    if (ziel.includes("/api/inbox/status")) return new Response(JSON.stringify({ inboxDir: "/x", files: [], watching: true }), { status: 200 });
    if (ziel.includes("/api/health")) {
      return new Response(JSON.stringify({ ok: true, count: SEITE.length, version: "3.2.121", embeddings: { total: 0, embedded: 0, models: {} }, encryption: { aktiv: true } }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }));
}

function rahmen() {
  return render(
    <ThemeProvider><AuthProvider><ToastProvider><Dashboard /></ToastProvider></AuthProvider></ThemeProvider>
  );
}

/** Die eigne Kopfzeile des Bildes (`KnowledgeGraph.tsx:6497`), nicht der Satz, den die
 *  Wissens-Liste darueber malt (Dashboard.tsx:2256). Mein erster Griff las den falschen:
 *  der sagt "connected through tags, similarity and knowledge entities", gehoert aber der
 *  Liste und weiss von der Kantenquelle nichts. */
function kopfZeile(container: HTMLElement) {
  return container.querySelector<HTMLElement>('[data-testid="graph-kopf"]');
}

async function warteAufKopf(container: HTMLElement) {
  await waitFor(() => expect(kopfZeile(container), "kein Graph-Kopf").toBeTruthy(), { timeout: 12000 });
  await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
  return (kopfZeile(container)!.textContent || "").replace(/\s+/g, " ");
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("ki_gehirn_wizard_dismissed", "1");
  installiereResizeObserver(1200, 800);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Punkt 1: das Bild nennt die Quelle, die ihm fehlte", () => {
  it("sagt, dass die Begriffs-Kanten nicht kamen, wenn die Tuer die Graph-Route verweigert", async () => {
    tuer(() => new Response(JSON.stringify({ error: "engine is restarting" }), { status: 503 }));
    const text = await warteAufKopf(rahmen().container);
    expect(text, `duennes Bild ohne Grund: ${text}`).toMatch(/entity links did not arrive/i);
  });

  it("sagt es ebenso, wenn die Antwort keinen Kanten-Koerper traegt", async () => {
    tuer(() => new Response(JSON.stringify({ relations: "keine Liste" }), { status: 200 }));
    const text = await warteAufKopf(rahmen().container);
    expect(text, `ein unbrauchbarer Koerper bleibt stumm: ${text}`).toMatch(/entity links did not arrive/i);
  });

  it("schweigt im ruhigen Zustand — die Zeile erzaehlt nur den Fehlschlag", async () => {
    tuer(() => new Response(JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 }));
    const text = await warteAufKopf(rahmen().container);
    expect(text, `die Warnung steht ohne Anlass: ${text}`).not.toMatch(/entity links did not arrive/i);
  });

  it("kennt den Satz als eigne Funktion, damit die Woerterbuch-Wache ihn halten kann", () => {
    expect(kopfKanteSatz("da"), "eine Funktion, die nichts liefert, ist kein Satz").toBe("");
    expect(kopfKanteSatz("kommt")).toBe("");
    expect(kopfKanteSatz("fort")).toMatch(/entity links did not arrive/i);
  });
});
