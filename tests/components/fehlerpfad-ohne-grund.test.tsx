// @vitest-environment jsdom
// Punkt 4, 2.11. — drei Stellen, an denen ein Fehlschlag keinen Grund hatte.
//
// Der Fehlerpfad-Zensus nannte mehr, als 3.2.119 heilte. Ich habe jede Zeile selbst gelesen;
// dabei fiel eine Behauptung des Zensus weg: der ERSTE Ladeweg von ActivityView
// (ActivityView.tsx:163-176) prueft `r.ok` und hat ein `.catch`. Was fehlt, sind die zwei
// andern Wege derselben Flaeche:
//
//   * ActivityView.tsx:182 `weitere()` — "Load more" holt die naechste Seite mit
//     `await (await fetch(...)).json()`. Kein Status, kein catch. Bei einer 500 bleibt der
//     Knopf stehen, als haette er nichts getan, und die Ablehnung geht unbehandelt weg.
//   * ActivityView.tsx:190 `pruefen()` — try/finally **ohne** catch. Die Siegel-Pruefung
//     wirft, der Ladezustand endet, und auf dem Schirm steht still, was vorher stand.
//   * TodayView.tsx:170 liest `.json()` VOR `r.ok`. Ein HTML-Fehlerblatt (Proxy, 502) ergibt
//     als Nutzertext: "Unexpected token '<', "<!DOCTYPE"... is not valid JSON".
//   * Dashboard.tsx:548 `refreshInbox()` — `if (!r.ok) return;` plus `catch {}`. Die Platte
//     sagt "Inbox…" fuer immer (:1769), auch wenn der Diener seit Minuten nicht antwortet.
//     Derselbe Klasse wie 3.2.111, wo die Tuer ihre drei Zustaende bekam.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActivityView } from "../../src/components/ActivityView";
import { TodayView } from "../../src/components/TodayView";
import { Dashboard } from "../../src/components/Dashboard";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import { ToastProvider } from "../../src/components/ui/Toast";
import { installiereResizeObserver } from "../helfer/canvas";

const HTML_FEHLERBLATT = "<!DOCTYPE html><html><body>Bad Gateway</body></html>";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("ki_gehirn_wizard_dismissed", "1");
  installiereResizeObserver(1200, 800);
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("Punkt 4: die Aktivitaet nennt einen Grund, wenn ihre Knopfe scheitern", () => {
  it("sagt, warum 'Load more' nicht weiterkommt, statt stillzustehen", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const ziel = String(url);
      if (ziel.includes("/api/audit?") && ziel.includes("before=")) {
        return new Response(JSON.stringify({ error: "the audit chain is busy" }), { status: 500 });
      }
      if (ziel.includes("/api/audit")) {
        return new Response(JSON.stringify({
          entries: [{ id: 7, actor: "claude", action: "read", memoryId: "m1", at: 1 }],
          more: true, actors: ["claude"], actions: ["read"],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));
    const user = userEvent.setup();
    render(<ActivityView aktiv onOpenMemory={() => {}} />);
    await user.click(await screen.findByRole("tab", { name: /audit/i }));
    const knopf = await screen.findByRole("button", { name: /Load more/i }, { timeout: 6000 });
    await user.click(knopf);
    const grund = await waitFor(() => {
      const t = screen.getByTestId("activity-view").textContent || "";
      if (!/did not answer|answered 500|could not load|failed/i.test(t)) throw new Error(`kein Grund auf dem Schirm: "${t.slice(0, 200)}"`);
      return t;
    });
    expect(grund).toMatch(/500|did not answer|could not load/i);
  });

  it("meldet einen Fehlschlag der Siegel-Pruefung, statt das Alte stehen zu lassen", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const ziel = String(url);
      if (ziel.includes("/api/audit/verify")) return new Response("nope", { status: 503 });
      if (ziel.includes("/api/audit")) {
        return new Response(JSON.stringify({ entries: [], more: false, actors: [], actions: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));
    const user = userEvent.setup();
    render(<ActivityView aktiv onOpenMemory={() => {}} />);
    await user.click(await screen.findByRole("tab", { name: /audit/i }));
    const pruef = await screen.findByRole("button", { name: /Check integrity/i }, { timeout: 6000 });
    await user.click(pruef);
    const grund = await waitFor(() => {
      const t = screen.getByTestId("activity-view").textContent || "";
      if (!/check failed|could not check|did not answer|503/i.test(t)) throw new Error(`die Pruefung meldet nichts: "${t.slice(0, 220)}"`);
      return t;
    });
    expect(grund).toMatch(/check failed|could not check|503/i);
  });
});

describe("Punkt 4: das Taegliche nennt den Status, nicht den Parser", () => {
  it("uesetzt ein HTML-Fehlerblatt in einen Satz, den ein Mensch versteht", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const ziel = String(url);
      if (ziel.includes("/api/briefing")) return new Response(HTML_FEHLERBLATT, { status: 502 });
      if (ziel.includes("/api/memories")) return new Response(JSON.stringify({ memories: [], count: 0, total: 0 }), { status: 200 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));
    render(
      <ThemeProvider><AuthProvider><ToastProvider>
        <TodayView aktiv onOpenMemory={() => {}} onGo={() => {}} />
      </ToastProvider></AuthProvider></ThemeProvider>
    );
    const text = await waitFor(() => {
      const t = document.body.textContent || "";
      if (!/could not be loaded|did not answer|502|failed/i.test(t)) throw new Error(`kein Nutzersatz: "${t.slice(0, 200)}"`);
      return t.replace(/\s+/g, " ");
    });
    expect(text, `der Parser redet mit dem Nutzer: ${text}`).not.toMatch(/Unexpected token|is not valid JSON/i);
    expect(text, `die Zahl des Status fehlt: ${text}`).toMatch(/502/);
  });
});

describe("Punkt 4: die Inbox haelt ihren Zustand ausser 'ich lade noch'", () => {
  it("sagt, dass der Ordner nicht antwortet, statt ewig 'Inbox…' zu melden", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const ziel = String(url);
      if (ziel.includes("/api/inbox/status")) return new Response(JSON.stringify({ error: "watcher is off" }), { status: 500 });
      if (ziel.includes("/api/health")) return new Response(JSON.stringify({ ok: true, count: 0, version: "3.2.120", encryption: { aktiv: true }, embeddings: { total: 0, embedded: 0 }, mcp: { tools: 8, protocol: "2026-07-28" } }), { status: 200 });
      return new Response(JSON.stringify({ memories: [], count: 0, total: 0 }), { status: 200, headers: { "content-type": "application/json" } });
    }));
    const { container } = render(
      <ThemeProvider><AuthProvider><ToastProvider><Dashboard /></ToastProvider></AuthProvider></ThemeProvider>
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 500)); });
    const text = (container.textContent || "").replace(/\s+/g, " ");
    expect(text, `die Inbox tut noch so, als lade sie: ${text.slice(0, 300)}`).toMatch(/no answer from the inbox/i);
    expect(text, `der ewige Auslassungspunkt steht noch da: ${text.slice(0, 300)}`).not.toMatch(/Inbox…/);
  });
});

