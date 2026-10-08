// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dashboard } from "../../src/components/Dashboard";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import { ToastProvider } from "../../src/components/ui/Toast";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger } from "../helfer/canvas";
import { schreibeSuchPrefs } from "../../src/lib/searchPrefs";
import type { Memory } from "../../src/types";

// Der echte PDF-Parser (pdf.js) braucht ein valides Dokument — die Tests
// fuettern Fragment-Fakes. Der Mock simuliert die Extraktion: runde Klammern
// werden gelesen (dieselbe Konvention, die das Fake benutzt).
vi.mock("../../src/lib/pdfText", () => ({
  pdfTextAusBuffer: vi.fn(async (buf: ArrayBuffer) => {
    const roh = new TextDecoder().decode(buf);
    const teile = [...roh.matchAll(/\(([^()]{2,}?)\)/g)].map((m) => m[1]);
    return teile.join("\n");
  }),
}));

// Das Dashboard ist der Rahmen um alles: Suche, Duplikate, Import, Tags,
// Papierkorb, Assistent. Es hatte bislang keinen einzigen Test — und ist mit
// 1200 Zeilen der groesste Einzelbaustein der Anwendung.

let notizen: Memory[] = [];
let geloescht: string[] = [];
let gespeichert: unknown[] = [];

let idZaehler = 0;
function note(over: Partial<Memory> = {}): Memory {
  const i = ++idZaehler;
  return {
    id: `m${i}`, userId: "local", title: `Notiz ${i}`, content: `Inhalt ${i}`,
    tags: [], type: "semantic", createdAt: Date.parse("2025-01-01"), updatedAt: Date.parse("2025-01-01"),
    ...over,
  };
}

function stubFetch() {
  geloescht = [];
  gespeichert = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const methode = init?.method ?? "GET";
    if (url.includes("/api/memor") && methode === "DELETE") {
      geloescht.push(url.split("/").pop() ?? "");
      return new Response("{}", { status: 200 });
    }
    // Der Import schreibt auf /api/memories (Plural), einzelne Notizen auf
    // /api/memory — beide Wege muessen hier ankommen.
    if (url.includes("/api/memor") && methode === "POST") {
      gespeichert.push(init?.body ? JSON.parse(String(init.body)) : null);
      return new Response(JSON.stringify(note()), { status: 200 });
    }
    if (url.includes("/api/memories")) return new Response(JSON.stringify(notizen), { status: 200 });
    if (url.includes("/api/search")) return new Response(JSON.stringify({ results: [], total: 0 }), { status: 200 });
    if (url.includes("/api/inbox/status")) return new Response(JSON.stringify({ inboxDir: "/x", files: [], watching: true }), { status: 200 });
    if (url.includes("/api/graph")) return new Response(JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 });
    if (url.includes("/api/health")) return new Response(JSON.stringify({ ok: true, count: notizen.length, dbPath: "/x", embeddings: { total: 0, embedded: 0 }, mcp: { protocol: "2026-07-28", tools: 8, http: "/mcp" } }), { status: 200 });
    if (url.includes("/api/activity")) return new Response("", { status: 200 });
    // Ohne gueltige Lizenz stuende hier der Sperrbildschirm — eine Testphase gibt es nicht.
    if (url.includes("/api/license")) return new Response(JSON.stringify({ licensed: true }), { status: 200 });
    return new Response("{}", { status: 200 });
  }));
}

beforeEach(() => {
  localStorage.clear();
  // Der Assistent wuerde sonst jedes Mal aufgehen und alles verdecken.
  localStorage.setItem("ki_gehirn_wizard_dismissed", "1");
  notizen = [];
  idZaehler = 0;
  stubFetch();
  installiereLeinwand();
  installiereResizeObserver(1000, 700);
  installiereZeiger();
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(URL, "createObjectURL", { value: vi.fn(() => "blob:x"), configurable: true });
  Object.defineProperty(window, "EventSource", {
    value: class { close() {} addEventListener() {} onmessage: unknown = null; onerror: unknown = null; },
    configurable: true,
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function zeige(vorrat: Memory[] = []) {
  notizen = vorrat;
  const view = render(
    <ThemeProvider><AuthProvider><ToastProvider><Dashboard /></ToastProvider></AuthProvider></ThemeProvider>
  );
  await act(async () => { await new Promise((r) => setTimeout(r, 150)); });
  return view;
}

describe("Dashboard: der leere Zustand", () => {
  it("erklaert, was zu tun ist, statt eine leere Flaeche zu zeigen", async () => {
    const { container } = await zeige([]);
    await waitFor(() => expect(container.textContent).toMatch(/No entries yet/i));
    expect(container.textContent).toMatch(/Drop files here/i);
  });

  it("zeigt die Navigation auch ohne Wissen", async () => {
    await zeige([]);
    for (const label of ["Knowledge", "Chat", "Graph", "Settings"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${label}$`) })).toBeTruthy();
    }
  });
});

describe("Dashboard: nichts ist gesperrt", () => {
  // Die App hat seit 10.10.2026 kein Schlüssel-System und keine Grenzen. Der
  // Beweis ist nicht „sie zeigt kein Schloss", sondern: sie fragt nirgends nach
  // einer Lizenz, und die Seitenleiste wirbt mit keinem Schlüssel mehr.
  it("läuft vollständig durch, ohne die Lizenzroute je zu befragen", async () => {
    const abruf = vi.fn(async (url: string) => {
      if (url.includes("/api/team")) return new Response(JSON.stringify({ team: null }), { status: 200 });
      if (url.includes("/api/memories")) return new Response("[]", { status: 200 });
      if (url.includes("/api/inbox/status")) return new Response(JSON.stringify({ files: [], archiveCount: 0, watching: false }), { status: 200 });
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", abruf);
    await zeige([]);
    await waitFor(() => expect(screen.getByRole("button", { name: /^Knowledge$/ })).toBeTruthy());
    expect(screen.getByText(/local · private · encrypted/)).toBeTruthy();
    // Eng Gemein: „key“ steht auch beim Provider-Hinweis („No API key …“), und der
    // gehört weiter dazu. Verboten sind genau die alten Stufen-Sätze.
    expect(screen.queryByText(/removes the limits|unlimited day|daily limit|activate a key/i)).toBeNull();
    const nachLizenz = abruf.mock.calls.filter((c) => String(c[0]).includes("/api/license"));
    expect(nachLizenz, `die Lizenzroute wurde ${nachLizenz.length}× befragt`).toHaveLength(0);
  });
});

describe("Dashboard: Wissen anzeigen", () => {
  it("listet die Notizen und zaehlt sie", async () => {
    const { container } = await zeige([note({ title: "Fristen" }), note({ title: "Mandat" })]);
    await waitFor(() => expect(container.textContent).toMatch(/Fristen/));
    expect(container.textContent).toMatch(/Mandat/);
    expect(container.textContent).toMatch(/2 of 2 entries/);
  });

  it("filtert ueber die Tag-Leiste", async () => {
    const user = userEvent.setup();
    const { container } = await zeige([
      note({ title: "Akte A", tags: ["kanzlei"] }),
      note({ title: "Rezept", tags: ["kochen"] }),
    ]);
    await waitFor(() => expect(container.textContent).toMatch(/Akte A/));
    await user.click(screen.getByRole("button", { name: /kanzlei/ }));
    await waitFor(() => expect(container.textContent).not.toMatch(/Rezept/));
    expect(container.textContent).toMatch(/Akte A/);
  });

  it("wechselt in die Graph-Ansicht", async () => {
    const user = userEvent.setup();
    const { container } = await zeige([note(), note()]);
    await user.click(screen.getByRole("button", { name: /^Graph$/ }));
    await waitFor(() => expect(container.querySelector('[data-testid="graph-canvas"]')).not.toBeNull());
  });

  it("wechselt in die Einstellungen", async () => {
    const user = userEvent.setup();
    const { container } = await zeige([note()]);
    await user.click(screen.getByRole("button", { name: /^Settings$/ }));
    await waitFor(() => expect(container.textContent).toMatch(/AI connection, data and MCP/));
  });
});

describe("Dashboard: Suche", () => {
  it("filtert bei abgeschalteter Semantik ueber die Stichworte", async () => {
    const user = userEvent.setup();
    const { container } = await zeige([note({ title: "Docker" }), note({ title: "Kochen" })]);
    await waitFor(() => expect(container.textContent).toMatch(/Docker/));

    // Semantik aus -> reiner Stichwortfilter, kein Serveraufruf noetig
    const schalter = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await user.click(schalter);
    await user.type(screen.getByPlaceholderText(/Search…/), "docker");
    await waitFor(() => expect(container.textContent).not.toMatch(/Kochen/), { timeout: 3000 });
  });

  it("hat einen Ergebnisregler, der bis 'Alle' geht", async () => {
    const { container } = await zeige([note()]);
    const regler = container.querySelector('input[aria-label="Number of results shown"]') as HTMLInputElement;
    expect(regler).not.toBeNull();
    expect(Number(regler.max)).toBeGreaterThan(0);
  });
});

describe("Dashboard: Duplikate", () => {
  it("meldet 'Clean', wenn nichts doppelt ist", async () => {
    const { container } = await zeige([note({ title: "A" }), note({ title: "B" })]);
    await waitFor(() => expect(container.textContent).toMatch(/Clean/));
  });

  it("zaehlt Duplikate und oeffnet die Pruefansicht", async () => {
    const user = userEvent.setup();
    const { container } = await zeige([note({ title: "Gleich" }), note({ title: "Gleich" })]);
    await waitFor(() => expect(container.textContent).toMatch(/1 duplicate/));
    await user.click(screen.getByRole("button", { name: /duplicate.*Review/i }));
    await waitFor(() => expect(document.querySelector('[role="dialog"][aria-label="Duplicates"]')).not.toBeNull());
    // Aus dem Panel heraus: eine Kopie in den Papierkorb legen (Dashboard-
    // Callback onDelete -> derselbe Papierkorb-Fluss wie beim Löschen)
    const imPanel = [...document.querySelectorAll('[role="dialog"][aria-label="Duplicates"]')][0];
    const loeschen = [...imPanel.querySelectorAll("button")].find((b) => b.getAttribute("aria-label")?.startsWith("Delete "));
    expect(loeschen).toBeTruthy();
    await user.click(loeschen!);
    await waitFor(() => expect(geloescht.length).toBeGreaterThan(0));
  });
});

describe("Dashboard: Rechner-Scan", () => {
  it("bietet ihn in der Import-Leiste an und oeffnet die Zustimmungsfrage", async () => {
    const user = userEvent.setup();
    await zeige([note()]);
    await user.click(screen.getByRole("button", { name: /Scan this computer/i }));
    await waitFor(() => expect(document.querySelector('[role="dialog"][aria-label="Scan this computer"]')).not.toBeNull());
    expect(document.body.textContent).toMatch(/Nothing is read until you have seen what would be imported/);
  });
});

describe("Dashboard: eine Notiz anlegen und loeschen", () => {
  it("oeffnet den Editor ueber 'New'", async () => {
    const user = userEvent.setup();
    await zeige([]);
    await user.click(screen.getByRole("button", { name: /^New$/ }));
    await waitFor(() => expect(document.body.textContent).toMatch(/Memory type|Fact/));
  });

  it("loescht eine Notiz und bietet das Rueckgaengigmachen an", async () => {
    const user = userEvent.setup();
    const { container } = await zeige([note({ title: "Weg damit" })]);
    await waitFor(() => expect(container.textContent).toMatch(/Weg damit/));
    // Karte klicken -> Vorschau; von dort per „Edit“ in den Editor.
    await user.click(screen.getAllByText("Weg damit")[0]);
    await waitFor(() => expect(document.querySelector('[data-testid="memory-preview"]')).toBeTruthy());
    await user.click(screen.getByRole("button", { name: /Edit/i }));
    await waitFor(() => expect(document.body.textContent).toMatch(/Memory type|Fact/));
    // Nur im Editor suchen: die Werkzeugleiste hat einen Papierkorb-Knopf, der
    // auf dieselbe Beschreibung passt, aber die Papierkorb-ANSICHT oeffnet.
    const editor = [...document.querySelectorAll("div")]
      .filter((d) => /Edit note/.test(d.textContent ?? "") && d.querySelector("button"))
      .sort((a, b) => (a.textContent ?? "").length - (b.textContent ?? "").length)[0];
    expect(editor, "Editor nicht gefunden").toBeTruthy();
    const loeschen = [...editor.querySelectorAll("button")].find((b) =>
      /delete|trash|entfernen/i.test(`${b.getAttribute("aria-label")} ${b.title} ${b.textContent}`)
    );
    expect(loeschen, "kein Loeschknopf im Editor").toBeTruthy();
    await user.click(loeschen!);
    await waitFor(() => expect(geloescht.length).toBeGreaterThan(0));
    await waitFor(() => expect(document.body.textContent).toMatch(/moved to the trash/i));
  });
});

describe("Dashboard: Fokusmodus", () => {
  it("blendet die Seitenleiste aus und wieder ein", async () => {
    const user = userEvent.setup();
    const { container } = await zeige([note()]);
    const leiste = () => container.querySelector(".sidebar-glass");
    expect(leiste()?.className).toMatch(/w-64/);
    await user.click(screen.getByRole("button", { name: /Focus mode/i }));
    await waitFor(() => expect(leiste()?.className).toMatch(/w-0/));
    await user.click(screen.getByRole("button", { name: /Show sidebar/i }));
    await waitFor(() => expect(leiste()?.className).toMatch(/w-64/));
  });
});

describe("Dashboard: Dateien hereinholen", () => {
  it("liest eine Markdown-Datei ein und legt sie als Notiz an", async () => {
    const { container } = await zeige([]);
    const eingabe = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(eingabe, "kein Dateifeld").not.toBeNull();
    const datei = new File(["# Fristen\n\nMontags und donnerstags."], "Fristen.md", { type: "text/markdown" });
    Object.defineProperty(eingabe, "files", { value: [datei], configurable: true });
    await act(async () => {
      eingabe.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 250));
    });
    await waitFor(() => expect(gespeichert.length).toBeGreaterThan(0));
    expect(JSON.stringify(gespeichert)).toMatch(/Montags und donnerstags/);
  });

  it("nimmt auch abgelegte Dateien an", async () => {
    const { container } = await zeige([]);
    const zone = container.querySelector(".import-band") as HTMLElement | null;
    expect(zone, "keine Ablagezone").toBeTruthy();
    const datei = new File(["Ein Reiseplan."], "reise.txt", { type: "text/plain" });
    await act(async () => {
      const evt = new Event("drop", { bubbles: true, cancelable: true }) as Event & { dataTransfer?: unknown };
      Object.defineProperty(evt, "dataTransfer", { value: { files: [datei] }, configurable: true });
      zone!.dispatchEvent(evt);
      await new Promise((r) => setTimeout(r, 250));
    });
    await waitFor(() => expect(JSON.stringify(gespeichert)).toMatch(/Reiseplan/));
  });

  it("zerlegt sehr lange Texte in mehrere Notizen", async () => {
    const { container } = await zeige([]);
    const eingabe = container.querySelector('input[type="file"]') as HTMLInputElement;
    const lang = Array.from({ length: 60 }, (_, i) => `Absatz ${i}: ${"Text ".repeat(30)}`).join("\n\n");
    Object.defineProperty(eingabe, "files", { value: [new File([lang], "lang.txt", { type: "text/plain" })], configurable: true });
    await act(async () => {
      eingabe.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 400));
    });
    await waitFor(() => expect(gespeichert.length).toBeGreaterThan(1));
  });
});

describe("Dashboard: eine Seite aus dem Netz holen", () => {
  it("schickt die URL an den Clipper und meldet den Erfolg", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/license")) return new Response(JSON.stringify({ licensed: true }), { status: 200 });
      if (url.includes("/api/clip")) return new Response(JSON.stringify({ title: "Geholte Seite", count: 1 }), { status: 200 });
      if (url.includes("/api/memories") && (init?.method ?? "GET") === "GET") return new Response(JSON.stringify(notizen), { status: 200 });
      if (url.includes("/api/inbox/status")) return new Response(JSON.stringify({ files: [], watching: true }), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    const { container } = await zeige([]);
    const feld = screen.getByPlaceholderText(/Paste a URL/i);
    await user.type(feld, "https://beispiel.de/artikel");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(container.textContent).toMatch(/Geholte Seite|importiert|imported/i));
  });

  it("meldet einen Fehlschlag, statt stumm zu bleiben", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/license")) return new Response(JSON.stringify({ licensed: true }), { status: 200 });
      if (url.includes("/api/clip")) return new Response(JSON.stringify({ error: "Seite nicht erreichbar" }), { status: 400 });
      if (url.includes("/api/memories")) return new Response(JSON.stringify(notizen), { status: 200 });
      if (url.includes("/api/inbox/status")) return new Response(JSON.stringify({ files: [], watching: true }), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    const { container } = await zeige([]);
    await user.type(screen.getByPlaceholderText(/Paste a URL/i), "https://kaputt.example");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(container.textContent).toMatch(/nicht erreichbar|failed|Fehler/i));
  });
});

describe("Dashboard: Papierkorb", () => {
  it("zeigt geloeschte Eintraege und laesst sie zurueckholen", async () => {
    const user = userEvent.setup();
    const geloeschteNotiz = { ...note({ title: "Versehentlich weg" }), deletedAt: Date.now() };
    let wiederhergestellt = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/license")) return new Response(JSON.stringify({ licensed: true }), { status: 200 });
      if (url.includes("restore")) { wiederhergestellt = true; return new Response("{}", { status: 200 }); }
      if (url.includes("trash=1")) return new Response(JSON.stringify([geloeschteNotiz]), { status: 200 });
      if (url.includes("/api/memories") && (init?.method ?? "GET") === "GET") return new Response(JSON.stringify(notizen), { status: 200 });
      if (url.includes("/api/inbox/status")) return new Response(JSON.stringify({ files: [], watching: true }), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    const { container } = await zeige([note()]);
    await user.click(screen.getByRole("button", { name: /Trash/i }));
    await waitFor(() => expect(container.textContent).toMatch(/Versehentlich weg/));
    const panel = [...container.querySelectorAll("div")]
      .filter((d) => /Versehentlich weg/.test(d.textContent ?? "") && d.querySelector("button"))
      .sort((a, b) => (a.textContent ?? "").length - (b.textContent ?? "").length)[0];
    expect(panel, "Papierkorb-Ansicht nicht gefunden").toBeTruthy();
    const zurueck = [...panel.querySelectorAll("button")].find((b) => /restore|zurueck/i.test(`${b.title} ${b.getAttribute("aria-label")} ${b.textContent}`));
    expect(zurueck, "kein Wiederherstellen-Knopf").toBeTruthy();
    await user.click(zurueck!);
    await waitFor(() => expect(wiederhergestellt).toBe(true));
  });
});

describe("Dashboard: viele Notizen", () => {
  it("zeigt zunaechst eine Seite und laedt den Rest auf Wunsch nach", async () => {
    const user = userEvent.setup();
    const viele = Array.from({ length: 70 }, (_, i) => note({ title: `Eintrag ${i}` }));
    const { container } = await zeige(viele);
    await waitFor(() => expect(container.textContent).toMatch(/70 of 70 entries/));
    expect(container.textContent).toMatch(/Load more/);
    await user.click(screen.getByRole("button", { name: /Load more/i }));
    await waitFor(() => expect(container.textContent).not.toMatch(/Load more/));
  });
});

describe("Dashboard: Befehlspalette", () => {
  it("oeffnet sich per Knopf", async () => {
    const user = userEvent.setup();
    await zeige([note()]);
    const knopf = document.querySelector('button[title="Command palette"]') as HTMLButtonElement;
    expect(knopf, "kein Palette-Knopf").toBeTruthy();
    await user.click(knopf);
    await waitFor(() => expect(document.body.textContent).toMatch(/New knowledge node|Search|Switch/i));
  });
});

describe("Dashboard: Kontext kopieren", () => {
  it("legt den Chat-Kontext als Prompt in die Zwischenablage", async () => {
    const user = userEvent.setup();
    const { container } = await zeige([note({ title: "Fristen", content: "montags" })]);
    const schreibe = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText: schreibe }, configurable: true });
    const knopf = [...container.querySelectorAll("button")].find((b) => /copy as a prompt/i.test(b.title ?? ""));
    expect(knopf, "kein Kontext-Knopf").toBeTruthy();
    await user.click(knopf!);
    await waitFor(() => expect(schreibe).toHaveBeenCalled());
  });
});

describe("Dashboard: Such-Einstellungen stecken im Request (Paket 2 — Einstellung → Request-Parameter sichtbar)", () => {
  it("sendet Suchtiefe und Spuren-Schalter an jeden Search-Call", async () => {
    const user = userEvent.setup();
    let letzteAnfrage: { topK?: number; tracks?: { bm25?: boolean; vector?: boolean; entity?: boolean } } | null = null;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/license")) return new Response(JSON.stringify({ licensed: true }), { status: 200 });
      if (url.includes("/api/search")) {
        letzteAnfrage = init?.body ? JSON.parse(String(init.body)) : null;
        return new Response(JSON.stringify({ results: [], total: 0 }), { status: 200 });
      }
      if (url.includes("/api/memories")) return new Response(JSON.stringify(notizen), { status: 200 });
      if (url.includes("/api/inbox/status")) return new Response(JSON.stringify({ files: [], watching: true }), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    await zeige([note({ title: "Docker" })]);
    // So schreibt der Such-Abschnitt in den Einstellungen (topk 32, BM25 aus):
    await act(async () => {
      schreibeSuchPrefs({ tiefe: 32, spurBm25: false, spurVektor: true, spurGraph: true });
    });
    await user.type(screen.getByPlaceholderText(/Search…/), "docker");
    await waitFor(() => {
      expect(letzteAnfrage).not.toBeNull();
      expect(letzteAnfrage!.topK).toBe(32);
      expect(letzteAnfrage!.tracks).toEqual({ bm25: false, vector: true, entity: true });
    }, { timeout: 4000 });
  });

  it("hat die Suchtiefe standardmäßig nicht unter 16, ohne dass etwas eingestellt wurde", async () => {
    const user = userEvent.setup();
    let letzteAnfrage: { topK?: number } | null = null;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/license")) return new Response(JSON.stringify({ licensed: true }), { status: 200 });
      if (url.includes("/api/search")) {
        letzteAnfrage = init?.body ? JSON.parse(String(init.body)) : null;
        return new Response(JSON.stringify({ results: [], total: 0 }), { status: 200 });
      }
      if (url.includes("/api/memories")) return new Response(JSON.stringify(notizen), { status: 200 });
      if (url.includes("/api/inbox/status")) return new Response(JSON.stringify({ files: [], watching: true }), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    await zeige([note({ title: "Docker" })]);
    await user.type(screen.getByPlaceholderText(/Search…/), "docker");
    await waitFor(() => expect(letzteAnfrage).not.toBeNull(), { timeout: 4000 });
    expect(letzteAnfrage!.topK).toBeGreaterThanOrEqual(16);
  });
});

describe("Dashboard: Gehirn-Status (Paket 2 — Health auf der Fläche)", () => {
  it("zeigt Version, Erinnerungs-Zähler, Verschlüsselung und Embedding-Modell aus /api/health", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/license")) return new Response(JSON.stringify({ licensed: true }), { status: 200 });
      if (url.includes("/api/health")) return new Response(JSON.stringify({
        ok: true, version: "3.1.1", count: 42, dbPath: "/x",
        embeddings: { total: 10, embedded: 8, models: { "nomic-embed-text": 8 } },
        encryption: { aktiv: true, ablage: "macOS Keychain" },
        mcp: { protocol: "2026-07-28", tools: 8, http: "/mcp" },
      }), { status: 200 });
      if (url.includes("/api/memories")) return new Response(JSON.stringify(notizen), { status: 200 });
      if (url.includes("/api/inbox/status")) return new Response(JSON.stringify({ files: [], watching: true }), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    const { container } = await zeige([note()]);
    const status = container.querySelector('[data-testid="gehirn-status"]');
    await waitFor(() => expect(status?.textContent).toMatch(/KEPTA 3\.1\.1/), { timeout: 3000 });
    expect(status!.textContent).toMatch(/42 nodes in the brain/);
    expect(status!.textContent).toMatch(/Encrypted/);
    expect(status!.textContent).toMatch(/nomic-embed-text 8/);
  });

  it("holt den Zähler nach, sobald ein Agent schreibt", async () => {
    // Der Kopf der App fragt /api/health einmal beim Einhaengen. Ein Agent, der
    // in dieser Zeit speichert, ist auf der Flaeche sichtbar (Toast, Liste) —
    // der Zahl-Knopf blieb trotzdem stehen. In der Aufnahme vom 6.10.: „75
    // entries in the index" neben „74 nodes in the brain", waehrend gerade
    // „Claude saved „Lumen retainer — signed"" ueber dem Rand stand.
    let zaehler = 74;
    const quellen: { onmessage: ((e: MessageEvent) => void) | null; close: () => void }[] = [];
    class Attrappe {
      onmessage: ((e: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(_url: string) { quellen.push(this); }
      close() { /* nichts */ }
    }
    vi.stubGlobal("EventSource", Attrappe);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/health")) return new Response(JSON.stringify({
        ok: true, version: "3.1.2", count: zaehler, dbPath: "/x",
        embeddings: { total: 0, embedded: 0 }, mcp: { protocol: "2026-07-28", tools: 8, http: "/mcp" },
      }), { status: 200 });
      if (url.includes("/api/license")) return new Response(JSON.stringify({ licensed: true }), { status: 200 });
      if (url.includes("/api/memories")) return new Response(JSON.stringify(notizen), { status: 200 });
      if (url.includes("/api/inbox/status")) return new Response(JSON.stringify({ files: [], watching: true }), { status: 200 });
      return new Response("{}", { status: 200 });
    }));

    const { container } = await zeige([note()]);
    const chip = container.querySelector('[data-testid="gehirn-status"]');
    await waitFor(() => expect(chip?.textContent).toMatch(/74 nodes in the brain/), { timeout: 3000 });

    zaehler = 75;
    await act(async () => {
      quellen[0]!.onmessage?.({ data: JSON.stringify({ type: "save", source: "agent", ts: Date.now() }) } as unknown as MessageEvent);
      await new Promise((r) => setTimeout(r, 30));
    });
    await waitFor(() => expect(chip?.textContent).toMatch(/75 nodes in the brain/), { timeout: 3000 });
  });
});

describe("Dashboard: Tastatur", () => {
  it("wechselt die Ansichten mit Befehlstaste und Ziffer", async () => {
    const user = userEvent.setup();
    const { container } = await zeige([note()]);
    await user.keyboard("{Meta>}3{/Meta}");
    await waitFor(() => expect(container.querySelector('[data-testid="graph-canvas"]')).not.toBeNull());
    // Die Ansichten bleiben gemountet und werden nur ein-/ausgeblendet —
    // deshalb ueber den sichtbaren Inhalt pruefen, nicht ueber das Vorhandensein.
    await user.keyboard("{Meta>}1{/Meta}");
    await waitFor(() => expect(container.textContent).toMatch(/entries in the index|of 1 entries/));
  });

  it("oeffnet den Editor mit Befehlstaste und N", async () => {
    const user = userEvent.setup();
    await zeige([]);
    await user.keyboard("{Meta>}n{/Meta}");
    await waitFor(() => expect(document.body.textContent).toMatch(/Memory type|Fact/));
  });

  it("zeigt die Tastenuebersicht mit dem Fragezeichen", async () => {
    const user = userEvent.setup();
    await zeige([note()]);
    await user.keyboard("?");
    await waitFor(() => expect(document.body.textContent).toMatch(/Command palette — quick actions/i));
  });

  it("oeffnet die Befehlspalette mit Befehlstaste und K", async () => {
    const user = userEvent.setup();
    await zeige([note()]);
    await user.keyboard("{Meta>}k{/Meta}");
    await waitFor(() => expect(document.body.textContent).toMatch(/New knowledge node|Switch|Search/i));
  });
});

describe("Dashboard: Eingangsordner", () => {
  it("zeigt den Stand und stoesst einen Durchlauf an", async () => {
    const user = userEvent.setup();
    let gescannt = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/license")) return new Response(JSON.stringify({ licensed: true }), { status: 200 });
      if (url.includes("/api/inbox/scan")) { gescannt = true; return new Response(JSON.stringify({ scanned: 3, imported: 2 }), { status: 200 }); }
      if (url.includes("/api/inbox/status")) return new Response(JSON.stringify({ inboxDir: "/inbox", files: ["a.md", "b.md"], watching: true }), { status: 200 });
      if (url.includes("/api/memories")) return new Response(JSON.stringify(notizen), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    const { container } = await zeige([note()]);
    await waitFor(() => expect(container.textContent).toMatch(/2 in Inbox/));
    const scanKnopf = document.querySelector('button[title="Scan the inbox now and import"]') as HTMLButtonElement;
    expect(scanKnopf, "kein Inbox-Scan-Knopf").toBeTruthy();
    await user.click(scanKnopf);
    await waitFor(() => expect(gescannt).toBe(true));
    await waitFor(() => expect(container.textContent).toMatch(/3 files scanned|2 nodes imported/));
  });
});

describe("Dashboard: PDF-Import", () => {
  it("zieht Text aus einer einfachen PDF-Datei", async () => {
    const { container } = await zeige([]);
    const eingabe = container.querySelector('input[type="file"]') as HTMLInputElement;
    // Minimales PDF-Fragment: Text steht in runden Klammern.
    const pdf = "%PDF-1.4\n(Die Fristenkontrolle laeuft montags.) Tj\n(Verantwortlich ist das Sekretariat.) Tj\n%%EOF";
    Object.defineProperty(eingabe, "files", { value: [new File([pdf], "akte.pdf", { type: "application/pdf" })], configurable: true });
    await act(async () => {
      eingabe.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 400));
    });
    await waitFor(() => expect(JSON.stringify(gespeichert)).toMatch(/Fristenkontrolle/));
  });

  it("legt fuer eine PDF ohne lesbaren Text keine leere Notiz an", async () => {
    const { container } = await zeige([]);
    const eingabe = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(eingabe, "files", { value: [new File(["%PDF-1.4\n\u0001\u0002\u0003\n%%EOF"], "leer.pdf", { type: "application/pdf" })], configurable: true });
    await act(async () => {
      eingabe.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 400));
    });
    // Entweder gar nichts, oder ein ehrlicher Hinweis — aber keine leere Notiz.
    for (const g of gespeichert) {
      const inhalt = String((g as { content?: string }).content ?? "");
      expect(inhalt.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("Dashboard: Suche mit der Server-Engine", () => {
  it("sagt, wenn mehr passt als angezeigt wird, und zeigt auf Klick alles", async () => {
    const user = userEvent.setup();
    const treffer = Array.from({ length: 5 }, (_, i) => ({
      memory: note({ title: `Treffer ${i}` }), score: 1 - i * 0.1, cosineScore: 0.8, bm25Score: 0.5,
      rawBm25: 0, matchedTerms: ["docker"], expired: false, superseded: false,
    }));
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/license")) return new Response(JSON.stringify({ licensed: true }), { status: 200 });
      if (url.includes("/api/search")) {
        // Bei "Alle" liefert die Engine wirklich alles — sonst bliebe der
        // Hinweis "5 von 57" stehen und der Test pruefte nichts.
        const topK = init?.body ? (JSON.parse(String(init.body)) as { topK?: number }).topK ?? 5 : 5;
        const alle = topK > 100
          ? Array.from({ length: 57 }, (_, i) => ({ ...treffer[0], memory: note({ title: `Treffer ${i}` }) }))
          : treffer;
        return new Response(JSON.stringify({ results: alle, total: 57 }), { status: 200 });
      }
      if (url.includes("/api/memories")) return new Response(JSON.stringify(notizen), { status: 200 });
      if (url.includes("/api/inbox/status")) return new Response(JSON.stringify({ files: [], watching: true }), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    const { container } = await zeige([note({ title: "Docker" })]);
    await user.type(screen.getByPlaceholderText(/Search…/), "docker");
    await waitFor(() => expect(container.textContent).toMatch(/5 of 57 matches/), { timeout: 4000 });
    await user.click(screen.getByRole("button", { name: /show all/i }));
    await waitFor(() => expect(container.textContent).toMatch(/All matches/));
  });

  it("meldet ehrlich, wenn nichts passt", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/license")) return new Response(JSON.stringify({ licensed: true }), { status: 200 });
      if (url.includes("/api/search")) return new Response(JSON.stringify({ results: [], total: 0 }), { status: 200 });
      if (url.includes("/api/memories")) return new Response(JSON.stringify(notizen), { status: 200 });
      if (url.includes("/api/inbox/status")) return new Response(JSON.stringify({ files: [], watching: true }), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    const { container } = await zeige([note({ title: "Docker" })]);
    await user.type(screen.getByPlaceholderText(/Search…/), "quantenphysik");
    await waitFor(() => expect(container.textContent).toMatch(/No matches/i), { timeout: 4000 });
  });

  it("zeigt nach der ersten Antwort, dass das Gehirn warm ist (Paket 2: Such-Cache sichtbar)", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/license")) return new Response(JSON.stringify({ licensed: true }), { status: 200 });
      if (url.includes("/api/search")) return new Response(JSON.stringify({ results: [], total: 0 }), { status: 200 });
      if (url.includes("/api/memories")) return new Response(JSON.stringify(notizen), { status: 200 });
      if (url.includes("/api/inbox/status")) return new Response(JSON.stringify({ files: [], watching: true }), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    const { container } = await zeige([note({ title: "Docker" })]);
    // Vor der ersten Antwort wärmt sich das Gehirn — spätestens danach ist es warm.
    await user.type(screen.getByPlaceholderText(/Search…/), "docker");
    await waitFor(() => expect(container.textContent).toMatch(/Brain warm — answer in \d+ ms/), { timeout: 4000 });
  });

  it("zeigt je Treffer die Spuren-Herkunft (Paket 2: welches Bein die Notiz sah)", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/license")) return new Response(JSON.stringify({ licensed: true }), { status: 200 });
      if (url.includes("/api/search")) {
        return new Response(JSON.stringify({
          results: [{
            memory: note({ title: "Docker Fallback" }),
            score: 0.9, cosineScore: 0.8, bm25Score: 0.5, rawBm25: 0,
            matchedTerms: ["docker"], expired: false, superseded: false,
            tracks: { bm25: 0, vektor: 2, graph: null, similarity: 0.8 },
          }],
          total: 1,
        }), { status: 200 });
      }
      if (url.includes("/api/memories")) return new Response(JSON.stringify(notizen), { status: 200 });
      if (url.includes("/api/inbox/status")) return new Response(JSON.stringify({ files: [], watching: true }), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    const { container } = await zeige([note({ title: "Docker" })]);
    await user.type(screen.getByPlaceholderText(/Search…/), "docker");
    await waitFor(() => expect(container.textContent).toMatch(/Found via/), { timeout: 4000 });
    expect(container.textContent).toMatch(/bm25 #1/);
    expect(container.textContent).toMatch(/vector #3/);
    // Das Graph-Bein hat den Treffer nicht gesehen — kein Badge, kein Lügenfeld.
    expect(container.textContent).not.toMatch(/graph #/);
  });
});

describe("Dashboard: Gruppierungen und Vorschau", () => {
  it("gruppiert nach Typ und zeigt alle vier Abschnitte", async () => {
    const user = userEvent.setup();
    const { container } = await zeige([
      note({ title: "Fakt" }),
      note({ title: "Ereignis", type: "episodic" }),
      note({ title: "Ablauf", type: "procedural" }),
      note({ title: "Unterlage", type: "reference" }),
    ]);
    await waitFor(() => expect(container.textContent).toContain("Fakt"));
    await user.click(screen.getByRole("button", { name: "By type" }));
    await waitFor(() => {
      const text = container.textContent ?? "";
      expect(text).toContain("Facts");
      expect(text).toContain("Events");
      expect(text).toContain("How-tos");
      expect(text).toContain("Documents");
      expect(text).toMatch(/1 entry/);
    });
  });

  it("gruppiert nach Datei und bündelt Chunks unter der Quelle mit Öffnen-Knopf", async () => {
    const user = userEvent.setup();
    const { container } = await zeige([
      note({ title: "Gewerbe-Ummeldung — 1/2", content: "Seite eins.\n\n— Source: /Users/da/Docs/Gewerbe-Ummeldung.pdf" }),
      note({ title: "Gewerbe-Ummeldung — 2/2", content: "Seite zwei.\n\n— Source: /Users/da/Docs/Gewerbe-Ummeldung.pdf" }),
      note({ title: "Handnotiz" }),
    ]);
    await waitFor(() => expect(container.textContent).toContain("Gewerbe-Ummeldung"));
    await user.click(screen.getByRole("button", { name: "By file" }));
    await waitFor(() => {
      const text = container.textContent ?? "";
      expect(text).toContain("Gewerbe-Ummeldung.pdf");
      expect(text).toContain("Open file");
      // In 2.10.0 stand hier auch in der englischen Oberfläche „Ohne Quelle“.
      expect(text).toContain("No source");
    });
  });

  it("Gruppierung bleibt über ein Neuladen erhalten (localStorage)", async () => {
    const user = userEvent.setup();
    await zeige([note()]);
    await waitFor(() => expect(document.body.textContent).toContain("Notiz"));
    await user.click(screen.getByRole("button", { name: "Period" }));
    expect(localStorage.getItem("ki_gehirn_gruppierung")).toBe("zeitraum");
  });

  it("Klick auf eine Karte öffnet die Vorschau mit klickbarer Quelle statt dem Editor", async () => {
    const user = userEvent.setup();
    const { container } = await zeige([
      note({ title: "Mit Herkunft", content: "Text.\n\n— Source: /Users/da/Docs/a.pdf" }),
    ]);
    // Warten, bis die Liste geladen ist — auf langsamer CI war die Karte beim
    // Klick noch gar nicht im DOM.
    await waitFor(() => expect(container.textContent).toContain("Mit Herkunft"));
    await user.click(screen.getAllByText("Mit Herkunft")[0]);
    await waitFor(() => expect(document.querySelector('[data-testid="memory-preview"]')).toBeTruthy());
    const panel = document.querySelector('[data-testid="memory-preview"]')!;
    expect(panel.textContent).toContain("a.pdf");
    expect(panel.textContent).not.toContain("— Source:");
    expect(container.textContent).not.toMatch(/Edit note/);
  });
});

describe("Dashboard: eine Teilantwort wirft nicht die ganze Fläche", () => {
  // Die Fläche liest inbox.files.length direkt. Antwortet /api/inbox/status
  // unvollständig — Server im Hochlauf, ältere Fassung, Teilauswertung — stand
  // bisher der ganze Bildschirm da und verschwand. Derselbe Fehler, der einmal
  // den ganzen Einstellungs-Bildschirm gekostet hat.

  async function zeigeMitInbox(antwort: unknown) {
    notizen = [note({ title: "Docker" })];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/api/inbox/status")) return new Response(JSON.stringify(antwort), { status: 200 });
      if (String(url).includes("/api/license")) return new Response(JSON.stringify({ licensed: true }), { status: 200 });
      if (String(url).includes("/api/memories")) return new Response(JSON.stringify(notizen), { status: 200 });
      if (String(url).includes("/api/health")) return new Response(JSON.stringify({ ok: true, count: 1, dbPath: "/x", embeddings: { total: 0, embedded: 0 } }), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    const view = render(
      <ThemeProvider><AuthProvider><ToastProvider><Dashboard /></ToastProvider></AuthProvider></ThemeProvider>
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
    return view;
  }

  for (const [name, antwort] of [
    ["leeres Objekt", {}],
    ["null", null],
    ["files vom falschen Typ", { files: "drei", watching: true }],
  ] as const) {
    it(`hält durch, wenn die Inbox-Antwort ein ${name} ist`, async () => {
      const { container } = await zeigeMitInbox(antwort);
      // Die Fläche steht noch — und zählt sichtbar null, statt zu verschwinden.
      expect(container.textContent).toMatch(/in the index/i);
      expect(container.textContent).toMatch(/0 in Inbox/);
    });
  }
});

// #93: bei schmalem Fenster bekam die Seitenleiste 256 px und die Fläche den
// Rest — bei 390 px waren das 134 px für den Graphen, gemessen als schmaler
// Streifen mit abgeschnittener Knopfleiste. Die Leiste lässt sich einklappen;
// die Fläche entscheidet nur nicht selbst, wann das nötig ist.
describe("Bei schmalem Fenster rückt die Seitenleiste zurück", () => {
  function fenster(breite: number) {
    Object.defineProperty(window, "innerWidth", { value: breite, writable: true, configurable: true });
  }
  function leiste(container: HTMLElement) {
    return container.querySelector(".sidebar-glass");
  }

  it("startet eingeklappt, wenn das Fenster zu schmal für beide ist", async () => {
    fenster(390);
    const { container } = await zeige([note({ title: "Fristen" })]);
    expect(leiste(container)?.className, "die Leiste steht und frisst die Breite").toMatch(/w-0/);
  });

  it("startet geöffnet bei einem Fenster, das beide trägt", async () => {
    fenster(1440);
    const { container } = await zeige([note({ title: "Fristen" })]);
    expect(leiste(container)?.className).toMatch(/w-64/);
  });

  it("gibt die Leiste her, wer sie selbst wieder holt", async () => {
    fenster(390);
    const { container } = await zeige([note({ title: "Fristen" })]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Show sidebar" }));
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(leiste(container)?.className).toMatch(/w-64/);
  });
});
