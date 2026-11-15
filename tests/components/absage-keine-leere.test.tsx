// @vitest-environment jsdom
// Punkt 4 und 7, 2.11. abend — eine Absage, die wie eine Leere aussieht.
//
// Die Klasse ist nicht "kein Text bei Fehler" (das waere bloede), sondern: dieselbe Flaeche
// malt dasselbe Bild, ob die Tuer geantwortet hat oder nicht. Ein Nutzer kann nicht
// unterscheiden, ob nichts existiert oder ob nie gefragt wurde. Drei Stellen, von mir selbst
// gelesen — und eine davon ist eine echte Falschaussage:
//
//   * PraxisSync.tsx:39  `if (!r.ok) return;` ueber /api/sync/journal, `journal` beginnt als
//     leere Liste (:32), und :223 malt dann:
//       "Nothing recorded yet — the journal fills with the first bundle that goes out or comes in."
//     Das ist eine Behauptung ueber seinen Bestand, aus einer Absage abgeleitet.
//   * MemoryPreview.tsx:46  die Leser-Reihe wird nur gemalt `{privat || leser.length > 0}`
//     (:189). Sie verschwindet also sowohl, wenn die Audit-Tuer ablehnt, als auch wenn sie
//     geantwortet hat und NIEMAND die Notiz gelesen hat. Der zweite Fall ist die
//     privacy-Antwort, die der Nutzer haben will — und sie ist unsichtbar.
//   * MemoryPreview.tsx:73  "Earlier stands" erscheint nur bei `staende !== null` und
//     `length > 0` (:233) — dasselbe Muster: Absage und Antwort "keine Staende" malen gleich.
//
// Bewusst NICHT in dieser Scheibe: Dashboard.tsx:818 (/api/agents, `appsLive`). Dort fehlt bei
// einer Absage nur der gruene Punkt am Navigationsziel — es steht kein Satz da, der etwas
// behauptet. Ein fehlender Punkt ist keine Falschaussage, und einen Text dafuer zu erfinden
// waere Rauschen auf der Seitenleiste.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import PraxisSync from "../../src/components/PraxisSync";
import { MemoryPreview } from "../../src/components/MemoryPreview";
import { ToastProvider } from "../../src/components/ui/Toast";
import type { Memory } from "../../src/types";

const NOTIZ: Memory = {
  id: "p1", userId: "local", title: "Frist 7", content: "Die Frist 7 haelt die Kasse.",
  tags: [], type: "semantic", createdAt: Date.parse("2025-01-01"), updatedAt: Date.parse("2025-01-01"),
};

/**
 * Ein Response-Koerper ist EINMAL lesbar. Die Vorschau holt Leser UND Staende — dieselbe
 * Antwort zweimal zurueckzugeben war der Fehler, den ich heute schon einmal hatte
 * (BELEG-3.2.121 §4): die zweite Lesung wirft, und der Fall schlaegt am falschen Grund.
 * Darum eine Fabrik pro Aufruf.
 */
function vorschau(bau: () => Response) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const ziel = String(url);
    if (ziel.includes("/readers") || ziel.includes("/stande")) return bau();
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }));
  return render(<ToastProvider><MemoryPreview memory={NOTIZ} onClose={() => {}} onEdit={() => {}} /></ToastProvider>);
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Punkt 4: das Journal unterscheidet Absage von Leere", () => {
  it("behauptet nichts ueber seinen Bestand, wenn die Tuer ablehnt", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/api/sync/journal")) {
        return new Response(JSON.stringify({ error: "vault is locked" }), { status: 509 });
      }
      return new Response(JSON.stringify({ ok: true, configured: false }), { status: 200 });
    }));
    render(<ToastProvider><PraxisSync /></ToastProvider>);
    const text = await waitFor(() => {
      const t = (document.body.textContent || "").replace(/\s+/g, " ");
      if (!/did not answer|could not be read|answered 509/i.test(t)) throw new Error(`kein Grund auf dem Schirm: "${t.slice(0, 260)}"`);
      return t;
    });
    expect(text, `eine Absage wird als Leere behauptet: ${text}`).not.toMatch(/Nothing recorded yet/i);
  });

  it("sagt die Leere, wenn die Tuer wirklich geantwortet hat", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/api/sync/journal")) {
        return new Response(JSON.stringify({ entries: [], intact: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, configured: false }), { status: 200 });
    }));
    render(<ToastProvider><PraxisSync /></ToastProvider>);
    const text = await waitFor(() => {
      const t = (document.body.textContent || "").replace(/\s+/g, " ");
      if (!/Nothing recorded yet/i.test(t)) throw new Error(`die ehrliche Leere fehlt: "${t.slice(0, 260)}"`);
      return t;
    });
    expect(text).toMatch(/Nothing recorded yet/i);
    expect(text).not.toMatch(/did not answer/i);
  });
});

describe("Punkt 7: die Notiz-Vorschau nennt, wer sie gelesen hat — oder dass sie es nicht weiss", () => {
  it("zeigt die ehrliche Leere, wenn die Audit-Tuer antwortet und niemand las", async () => {
    vorschau(() => new Response(JSON.stringify({ readers: [] }), { status: 200 }));
    const text = await waitFor(() => {
      const t = (document.body.textContent || "").replace(/\s+/g, " ");
      if (!/no AI app has read/i.test(t)) throw new Error(`die Antwort "niemand" bleibt unsichtbar: "${t.slice(0, 260)}"`);
      return t;
    });
    expect(text).toMatch(/no AI app has read/i);
    expect(text).not.toMatch(/did not answer/i);
  });

  it("sagt, dass die Audit-Tuer nicht antwortete, statt die Reihe verschwinden zu lassen", async () => {
    vorschau(() => new Response(JSON.stringify({ error: "audit is busy" }), { status: 503 }));
    const text = await waitFor(() => {
      const t = (document.body.textContent || "").replace(/\s+/g, " ");
      if (!/did not answer|could not be read|answered 503/i.test(t)) throw new Error(`Absage und Leere sind ununterscheidbar: "${t.slice(0, 260)}"`);
      return t;
    });
    expect(text, `die Absage behauptet eine Leere: ${text}`).not.toMatch(/no AI app has read/i);
  });

  it("unterscheidet bei den Staenden ebenso", async () => {
    vorschau(() => new Response(JSON.stringify({ readers: [], staende: [] }), { status: 200 }));
    const ruhig = await waitFor(() => {
      const t = (document.body.textContent || "").replace(/\s+/g, " ");
      if (!/Frist 7/.test(t)) throw new Error("die Vorschau ist noch nicht da");
      return t;
    });
    expect(ruhig, `eine Antwort ohne Staende erfindet eine Warnung: ${ruhig}`).not.toMatch(/earlier versions could not be read/i);
  });
});
