// @vitest-environment jsdom
// Punkt 4, zweiter Teil - die Behauptung, die an keine Antwort gebunden ist.
//
// Gemessen 02.11. 06:41 MESZ am installierten 3.2.109 im echten Fenster (Zyklus `tuerfort`): der
// eigne Kapsel-Diener wird fortgenommen, und die Flaeche bleibt, als waere nichts gewesen.
// Kein Grund auf dem Schirm, und die Index-Zeile behauptet weiter "In sync".
//
// Der Grund liegt im ausgelieferten Stand, und er ist doppelt (beide Zitate stehen wortglich im
// installierten 3.2.109, darum keine Zeilennummer, die mit dem naechsten Stand verfaellt):
//   1. `holeGesundheit` schlingt den Fehler still — `catch { /* der Server meldet sich, wenn er
//      bereit ist */ }` — und laesst den letzten Stand stehen;
//   2. das Wort selbst haelt an keiner Antwort — `agentActive ? 'Agent working' : 'In sync'`
//      steht auch dann, wenn die Tuer nie geantwortet hat; die Frage nach dem Beweis stellt
//      die Zeile gar nicht.
//
// Diese Datei haelt beide Seiten: die Behauptung faellt, wenn keine Antwort da ist, und sie
// steht, wenn eine da ist. Ein Test, der nur die erste Seite prueft, schaltet den Status ab
// und nennt das Heilung.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { Dashboard } from "../../src/components/Dashboard";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import { ToastProvider } from "../../src/components/ui/Toast";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger } from "../helfer/canvas";
import type { Memory } from "../../src/types";

const GESUND = { ok: true, version: "3.2.110", count: 12, encryption: { aktiv: true, ablage: "Keychain" },
  embeddings: { total: 12, embedded: 12, models: {} }, mcp: { tools: 8, protocol: "2026-07-28" } };

function antworte(auf: (pfad: string) => unknown) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const p = String(url);
    const wert = auf(p);
    if (wert instanceof Error) throw wert;
    return new Response(JSON.stringify(wert ?? {}), { status: wert === undefined ? 500 : 200 });
  }));
}

async function zeige() {
  const view = render(<ThemeProvider><AuthProvider><ToastProvider><Dashboard /></ToastProvider></AuthProvider></ThemeProvider>);
  await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
  return view;
}

const syncStelle = (container: HTMLElement) => {
  // P202, App-Fenster-Übernahme: die Verbindungs-Behauptung sitzt jetzt in der
  // App-Statuszeile unter der Fläche (früher: rechte Zelle des Index-Streifens) —
  // der Griff zeigt auf die neue Zeile, die Behauptungen selbst stehen unverändert.
  const stelle = container.querySelector(".flaechen-status");
  return (stelle?.textContent || "").replace(/\s+/g, " ").trim();
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("ki_gehirn_wizard_dismissed", "1");
  installiereLeinwand();
  installiereResizeObserver(1000, 700);
  installiereZeiger();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("Punkt 4: die Sync-Behauptung ist an eine Antwort gebunden", () => {
  it("steht 'In sync', wenn die Tuer geantwortet hat", async () => {
    antworte((p) => (p.includes("/api/health") ? GESUND : p.includes("/api/memories/gruppen")
      ? { bestand: 12, traeger: { notes: 12, files: 0, code: 0, daten: 0, anderes: 0 }, themen: { people: 0, projects: 0, events: 0, tasks: 0, guides: 0, links: 0 }, ohneThema: 12, themenNachTraeger: {}, ohneThemaNachTraeger: {} }
      : p.includes("/api/memor") ? [ { id: "m1", userId: "local", title: "Notiz", content: "Inhalt", tags: [], type: "semantic", createdAt: 1, updatedAt: 1 } as unknown as Memory ]
      : {}));
    const { container } = await zeige();
    expect(syncStelle(container), `die antwortende Tuer zeigt nicht 'In sync': ${syncStelle(container)}`)
      .toContain("In sync");
  });

  it("behauptet kein 'In sync', wenn die Tuer nie geantwortet hat", async () => {
    antworte(() => new Error("connection refused"));
    const { container } = await zeige();
    const stelle = syncStelle(container);
    expect(stelle, `die Stelle behauptet Sync ohne jede Antwort: ${stelle}`).not.toContain("In sync");
    expect(stelle, `die Stelle nennt keinen Grund: ${stelle}`).toMatch(/not reach|no answer|did not answer|offline/i);
  });

  it("faellt zurueck, wenn die Tuer unterwegs stirbt", async () => {
    let gesund = true;
    antworte((p) => {
      if (p.includes("/api/health")) return gesund ? GESUND : new Error("server gone");
      if (p.includes("/api/memories/gruppen")) return { bestand: 12, traeger: { notes: 12, files: 0, code: 0, daten: 0, anderes: 0 }, themen: { people: 0, projects: 0, events: 0, tasks: 0, guides: 0, links: 0 }, ohneThema: 12, themenNachTraeger: {}, ohneThemaNachTraeger: {} };
      if (p.includes("/api/memor")) return [];
      return {};
    });
    const { container } = await zeige();
    expect(syncStelle(container)).toContain("In sync");
    gesund = false;
    // Die Frage nach dem Leben der Tuer laeuft auf einem Takt; ohne den Takt bleibt der
    // Tod unsichtbar, weil die Flaeche nur beim Bergaufragen. Der Takt ist 5 s.
    await act(async () => { await new Promise((r) => setTimeout(r, 6200)); });
    const stelle = syncStelle(container);
    expect(stelle, `die Tuer ist fort, die Stelle sagt weiter: ${stelle}`).not.toContain("In sync");
  });
});
