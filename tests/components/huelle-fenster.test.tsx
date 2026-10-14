// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, act, screen } from "@testing-library/react";
import { Dashboard } from "../../src/components/Dashboard";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import { ToastProvider } from "../../src/components/ui/Toast";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger } from "../helfer/canvas";
import type { Memory } from "../../src/types";

// Z-14: „Sieht man am Fenster, ob die App gerade den Schlüssel hat?" Die
// Traffic-Lights dimmt macOS selbst (electron.js: hiddenInset), aber der Inhalt
// wusste davon nichts — die Auswahl blieb siegelrot, als spräche jemand anders.
// Der Rahmen setzt [data-fenster]; huelle.css dämpft davon die Chrome.
//
// GEMESSEN wird das hier an den ausgelösten Ereignissen, nicht am echten
// Fensterzustand: headless gibt es keinen Schlüssel, den man verlieren könnte.
// Die Pixelmessung der Dämpfung fährt der Browser-Lauf
// (`audit-2026-10-09/e3-code/messen.mjs`, Zweig `fenster`).

let notizen: Memory[] = [];
function note(i: number): Memory {
  return {
    id: `m${i}`, userId: "local", title: `Notiz ${i}`, content: `Inhalt ${i}`, tags: ["probe"],
    type: "semantic", createdAt: Date.parse("2026-01-01"), updatedAt: Date.parse("2026-01-01"),
  };
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("ki_gehirn_wizard_dismissed", "1");
  notizen = [1, 2, 3].map(note);
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const methode = init?.method ?? "GET";
    if (u.includes("/api/memories") && methode === "GET") return new Response(JSON.stringify(notizen), { status: 200 });
    if (u.includes("/api/inbox/status")) return new Response(JSON.stringify({ inboxDir: "/x", files: [], watching: false }), { status: 200 });
    if (u.includes("/api/health")) return new Response(JSON.stringify({ ok: true, count: notizen.length, dbPath: "/x", embeddings: { total: 0, embedded: 0 } }), { status: 200 });
    if (u.includes("/api/team")) return new Response(JSON.stringify({ team: null }), { status: 200 });
    if (u.includes("/api/activity")) return new Response("", { status: 200 });
    return new Response("{}", { status: 200 });
  }));
  installiereLeinwand();
  installiereResizeObserver(1440, 900);
  installiereZeiger();
  Element.prototype.scrollIntoView = vi.fn();
  // Derselbe App-Server meldet sich über EventSource — ohne den Stub wirft der
  // Rahmen beim Mount und der Assistent kommt nie an.
  Object.defineProperty(window, "EventSource", {
    value: class { close() {} addEventListener() {} onmessage: unknown = null; onerror: unknown = null; },
    configurable: true,
  });
  // jsdom meldet `hasFocus() === false` für jedes Blatt — das ist eine
  // Eigenheit der Umgebung, nicht der Fläche. Geprüft wird der Zustandssprung
  // aus blur/focus, also beginnt jeder Fall mit einem Fenster im Besitz.
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
});

/** Rendert die Hülle und gibt IHREN Rahmen zurück. Über das Dokument zu suchen
 *  wäre der nächste Messfehler: ein hängengelassener Altbaum beantwortet dann
 *  dem nächsten Fall seine Frage — vier Fälle fielen so nacheinander um. */
async function start(): Promise<HTMLElement> {
  const view = render(
    <ThemeProvider><AuthProvider><ToastProvider><Dashboard /></ToastProvider></AuthProvider></ThemeProvider>
  );
  await act(async () => { await new Promise((r) => setTimeout(r, 150)); });
  const rahmen = view.container.querySelector<HTMLElement>(".huelle[data-fenster]");
  if (!rahmen) throw new Error("kein Rahmen mit [data-fenster] — die Fläche weiß nichts über sich");
  return rahmen;
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Z-14: das Fenster weiß, ob es den Schlüssel hat", () => {
  it("sagt beim Start, dass es den Schlüssel hat", async () => {
    const rahmen = await start();
    expect(rahmen.getAttribute("data-fenster")).toBe("schluessel");
  });

  it("dämpft die Chrome, sobald der Schlüssel verloren geht", async () => {
    const rahmen = await start();
    window.dispatchEvent(new Event("blur"));
    await waitFor(() => expect(rahmen.getAttribute("data-fenster")).toBe("gedaempft"));
  });

  it("gibt den Schlüssel zurück, wenn er wieder da ist", async () => {
    const rahmen = await start();
    window.dispatchEvent(new Event("blur"));
    await waitFor(() => expect(rahmen.getAttribute("data-fenster")).toBe("gedaempft"));
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(rahmen.getAttribute("data-fenster")).toBe("schluessel"));
  });

  it("verliert die Auskunft nicht, wenn das Blatt unsichtbar wird", async () => {
    const rahmen = await start();
    const versteckt = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(rahmen.getAttribute("data-fenster")).toBe("gedaempft"));
    versteckt.mockRestore();
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(rahmen.getAttribute("data-fenster")).toBe("schluessel"));
  });

  it("gibt die Auskunft auch dann, wenn ein Dialog offen ist", async () => {
    // Die zweite Frage der Prüffrage: „verschwindet diese Information, wenn ein
    // Dialog offen ist?" Nein — der Schlüssel gehört dem Fenster, nicht dem
    // Täfelchen, und der Assistent ist genau der Erststart-Fall.
    localStorage.removeItem("ki_gehirn_wizard_dismissed");
    const rahmen = await start();
    await waitFor(() => expect(screen.getByText(/Set up K3PTA/)).toBeTruthy(), { timeout: 6000 });
    window.dispatchEvent(new Event("blur"));
    await waitFor(() => expect(rahmen.getAttribute("data-fenster")).toBe("gedaempft"));
    expect(screen.getByText(/Set up K3PTA/).isConnected, "der Dialog ist mit dem Rahmen verschwunden").toBe(true);
  });
});
