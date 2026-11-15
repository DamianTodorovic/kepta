// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { Dashboard } from "../../src/components/Dashboard";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import { ToastProvider } from "../../src/components/ui/Toast";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger } from "../helfer/canvas";
import type { Memory } from "../../src/types";

// EIGENE DATEI, nicht angehaengt an Dashboard.test.tsx: `src/lib/prefs.ts` haelt
// seitenweiten Zustand (gelesen, laufender Leseauftrag, Entprell-Timer) und die
// Tests hier handeln von genau diesem Zustand. In einer Datei mit 56 andern
// Dashboard-Faellen waere der Modulzustand laengst "gelesen" und die Wettlaeufe
// unsichtbar — gruener Schein ohne geheilten Grund.
//
// A7-10, gemessen am 09.10. an einem neuen Datenordner mit 12 Notizen und
// frischem Browser-Profil (a7-rohdaten/wizard2.json): der Einrichtungsassistent
// stand nach 2 920 ms ueber der Flaeche, die Kopfzeile zaehlte das Bild da schon.
// A1erklaert am 10.10. den zweiten, unsichtbaren Teil: die Entscheidung ueber den
// Assistenten liegt in der Datenbank (`PREF_KEYS` traegt
// `ki_gehirn_wizard_dismissed`, `hydratePrefs()` holt sie zurueck). Beides wird
// hier getrennt gehalten: (a) WANN der Assistent kommt, (b) OB er ueberhaupt je
// kommt — und (c) dass der Spiegel die Entscheidung nicht ueberschreibt, bevor er
// sie gelesen hat.

let notizen: Memory[] = [];
let idZaehler = 0;
function note(over: Partial<Memory> = {}): Memory {
  const i = ++idZaehler;
  return {
    id: `m${i}`, userId: "local", title: `Notiz ${i}`, content: `Inhalt ${i}`, tags: [],
    type: "semantic", createdAt: Date.parse("2025-01-01"), updatedAt: Date.parse("2025-01-01"),
    ...over,
  };
}
const schlafe = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Der gewoehnliche Weg: alles antwortet sofort. Wer es langsam will, stubbt
 *  danach noch einmal — `spaeheSettings` und `ausstehenderBestand` ersetzen diesen. */
function grundstub() {
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
}

beforeEach(() => {
  localStorage.clear();
  // Der Assistent ist im Rahmen sonst ueberall weggeschaltet — hier soll er kommen.
  localStorage.removeItem("ki_gehirn_wizard_dismissed");
  notizen = [];
  idZaehler = 0;
  grundstub();
  installiereLeinwand();
  installiereResizeObserver(1440, 900);
  installiereZeiger();
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(window, "EventSource", {
    value: class { close() {} addEventListener() {} onmessage: unknown = null; onerror: unknown = null; },
    configurable: true,
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

/** Der Bestand bleibt aus, bis die Testperson ihn schickt. */
function ausstehenderBestand() {
  let los: (r: Response) => void = () => {};
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const methode = init?.method ?? "GET";
    if (u.includes("/api/memories") && methode === "GET") {
      return new Promise<Response>((resolve) => { los = resolve; });
    }
    if (u.includes("/api/inbox/status")) return new Response(JSON.stringify({ inboxDir: "/x", files: [], watching: false }), { status: 200 });
    if (u.includes("/api/health")) return new Response(JSON.stringify({ ok: true, count: 0, dbPath: "/x", embeddings: { total: 0, embedded: 0 } }), { status: 200 });
    if (u.includes("/api/team")) return new Response(JSON.stringify({ team: null }), { status: 200 });
    return new Response("{}", { status: 200 });
  }));
  return () => los(new Response(JSON.stringify([]), { status: 200 }));
}

/**
 * Die Settings-Maske antwortet spaet. `nachDerAntwort` an jedem Abruf haelt die
 * Reihenfolge fest — die Reparatur ist eine Reihenfolge, keine Anwesenheit.
 */
function spaeheSettings({ dismissiert = true, dauerMs = 900 } = {}) {
  const abrufe: { url: string; methode: string; koerper?: string; nachDerAntwort: boolean }[] = [];
  let antwortDa = false;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const methode = init?.method ?? "GET";
    abrufe.push({ url: u, methode, koerper: init?.body ? String(init.body) : undefined, nachDerAntwort: antwortDa });
    if (u.includes("/api/settings") && methode === "GET") {
      await schlafe(dauerMs);
      antwortDa = true;
      return new Response(
        JSON.stringify({ ui_prefs: JSON.stringify(dismissiert ? { ki_gehirn_wizard_dismissed: "1" } : {}) }),
        { status: 200 }
      );
    }
    if (u.includes("/api/memories") && methode === "GET") return new Response(JSON.stringify(notizen), { status: 200 });
    if (u.includes("/api/inbox/status")) return new Response(JSON.stringify({ inboxDir: "/x", files: [], watching: false }), { status: 200 });
    if (u.includes("/api/health")) return new Response(JSON.stringify({ ok: true, count: notizen.length, dbPath: "/x", embeddings: { total: 0, embedded: 0 } }), { status: 200 });
    if (u.includes("/api/team")) return new Response(JSON.stringify({ team: null }), { status: 200 });
    return new Response("{}", { status: 200 });
  }));
  return abrufe;
}

async function start() {
  const view = render(
    <ThemeProvider><AuthProvider><ToastProvider><Dashboard /></ToastProvider></AuthProvider></ThemeProvider>
  );
  await act(async () => { await schlafe(150); });
  return view;
}

describe("A7-10: der Assistent folgt dem ersten Bild, nicht der Stoppuhr", () => {
  it("bleibt weg, solange die erste Auskunft über den Bestand aussteht", async () => {
    const schickBestand = ausstehenderBestand();
    await start();
    await act(async () => { await schlafe(3000); });
    expect(screen.queryByText(/Set up K3PTA/), "der Dialog steht über einem Bild, das noch keines ist").toBeNull();
    // Die ausstehende Anfrage bleibt nicht stehen: der Store deduppt sie, und ein
    // haengender Lauf macht den naechsten Fall in dieser Datei blind.
    await act(async () => { schickBestand(); await schlafe(80); });
  });

  it("öffnet sich auf das erste gemalte Bild statt auf 2 500 ms Wandzeit", async () => {
    notizen = [note({ title: "Fristen" }), note({ title: "Laub" })];
    const { container } = await start();
    await waitFor(() => expect(container.textContent).toMatch(/Fristen/), { timeout: 2500 });
    await waitFor(
      () => expect(screen.queryByText(/Set up K3PTA/), "der Assistent haengt an der Wanduhr, nicht am Bild").not.toBeNull(),
      { timeout: 1200 }
    );
    // Das Bild steht schon, bevor der Assistent da ist — er tritt dahinter auf.
    expect(container.textContent).toMatch(/Fristen/);
  });

  it("wartet die Datenbankentscheidung ab, bevor es den Assistenten zeigt", async () => {
    // (a) und (b) getrennt: der Wecker darf den Merker aus der Datenbank nicht
    // ueberholen. Im Kratzlauf kam der Assistent bei ~900 ms, die Hydration erst
    // bei ~900 ms — also wird gepollt, nicht spaet abgelesen.
    spaeheSettings({ dismissiert: true, dauerMs: 900 });
    notizen = [note({ title: "Fristen" })];
    const { container } = await start();
    await waitFor(() => expect(container.textContent).toMatch(/Fristen/), { timeout: 2500 });
    const gesehen: number[] = [];
    for (let i = 0; i < 8; i++) {
      await act(async () => { await schlafe(300); });
      if (screen.queryAllByText(/Set up K3PTA/).length > 0) gesehen.push(Date.now());
    }
    expect(
      { gekommen: gesehen.length, merker: localStorage.getItem("ki_gehirn_wizard_dismissed") },
      "der Timer hat den Merker in der Datenbank ueberholt"
    ).toEqual({ gekommen: 0, merker: "1" });
  });
});
