// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SystemStatus, normalisiereHealth } from "../../src/components/SystemStatus";

// Die Statusanzeige ist die Stelle, an der KEPTA behauptet, was funktioniert.
// Genau dort stand bis zum 6.9.2026 "92 % Hit@1 in der Eval" — eine Zahl aus
// einem Korpus, den es nicht mehr gibt und die aus beiden READMEs laengst
// entfernt war. Wer hier etwas ueber sich selbst sagt, muss es belegen koennen.

const GESUND = {
  ok: true, dbPath: "/Users/a/.kepta/kepta.db", count: 412,
  embeddings: { total: 800, embedded: 600 },
  mcp: { protocol: "2026-07-28", tools: 8, http: "/mcp" },
};

function stubFetch(over: { health?: unknown; healthOk?: boolean; embedOk?: boolean; chat?: unknown; chatOk?: boolean } = {}) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("/api/health")) {
      if (over.healthOk === false) throw new Error("offline");
      return new Response(JSON.stringify(over.health ?? GESUND), { status: 200 });
    }
    if (url.includes("/api/embed")) return new Response("{}", { status: over.embedOk === false ? 503 : 200 });
    if (url.includes("/api/chat")) return new Response(JSON.stringify(over.chat ?? { text: "OK" }), { status: over.chatOk === false ? 500 : 200 });
    return new Response("{}", { status: 200 });
  }));
}

beforeEach(() => {
  localStorage.clear();
  stubFetch();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("SystemStatus: was die App ueber sich behauptet", () => {
  it("nennt keine Trefferquote, die die Eval nicht liefert", async () => {
    stubFetch({ embedOk: false });
    const { container } = render(<SystemStatus />);
    await waitFor(() => expect(container.textContent).toMatch(/Hit@1/));
    const zahlen = [...(container.textContent ?? "").matchAll(/(\d+)\s*%\s*Hit@1/g)].map((m) => Number(m[1]));
    expect(zahlen.length).toBeGreaterThan(0);
    for (const z of zahlen) {
      expect(z, `Die App behauptet ${z} % Hit@1`).toBeLessThanOrEqual(75);
    }
  });

  it("meldet den Kern als erreichbar samt Knotenzahl und MCP-Angaben", async () => {
    render(<SystemStatus />);
    // "412 nodes" steht in zwei Zeilen: Kern und Wissensbasis.
    await waitFor(() => expect(screen.getAllByText(/412 nodes/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/2026-07-28/).length).toBeGreaterThan(0);
    expect(screen.getByText(/8 tools/)).toBeTruthy();
  });

  it("sagt klar, was zu tun ist, wenn der Server nicht antwortet", async () => {
    stubFetch({ healthOk: false });
    render(<SystemStatus />);
    await waitFor(() => expect(screen.getByText(/Server unreachable/i)).toBeTruthy());
    expect(screen.getByText(/npm run dev/)).toBeTruthy();
  });

  it("rechnet die Embedding-Abdeckung aus", async () => {
    render(<SystemStatus />);
    await waitFor(() => expect(screen.getByText(/coverage 75 %/)).toBeTruthy());
  });

  it("kommt mit einer leeren Wissensbasis zurecht, ohne durch null zu teilen", async () => {
    stubFetch({ health: { ...GESUND, count: 0, embeddings: { total: 0, embedded: 0 } } });
    const { container } = render(<SystemStatus />);
    await waitFor(() => expect(screen.getByText(/0 nodes — import notes/)).toBeTruthy());
    expect(container.textContent).not.toMatch(/NaN/);
  });

  it("meldet Ollama als erreichbar oder nicht", async () => {
    const { unmount } = render(<SystemStatus />);
    await waitFor(() => expect(screen.getByText(/Ollama reachable/)).toBeTruthy());
    unmount();
    stubFetch({ embedOk: false });
    render(<SystemStatus />);
    await waitFor(() => expect(screen.getByText(/Unreachable/)).toBeTruthy());
  });
});

describe("SystemStatus: Testanfrage", () => {
  it("meldet die Antwort des Modells", async () => {
    const user = userEvent.setup();
    render(<SystemStatus />);
    await user.click(screen.getByRole("button", { name: /Send a test request/i }));
    await waitFor(() => expect(screen.getByText(/Model answers/)).toBeTruthy());
  });

  it("meldet einen Fehler verstaendlich, statt still zu bleiben", async () => {
    const user = userEvent.setup();
    stubFetch({ chatOk: false, chat: { error: "no api key" } });
    render(<SystemStatus />);
    await user.click(screen.getByRole("button", { name: /Send a test request/i }));
    await waitFor(() => expect(screen.getByText(/no api key/)).toBeTruthy());
  });

  it("meldet auch einen Verbindungsabbruch", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/chat")) throw new Error("Verbindung weg");
      if (url.includes("/api/health")) return new Response(JSON.stringify(GESUND), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    render(<SystemStatus />);
    await user.click(screen.getByRole("button", { name: /Send a test request/i }));
    await waitFor(() => expect(screen.getByText(/Verbindung weg/)).toBeTruthy());
  });
});

describe("SystemStatus: Anschluss fuer Agenten", () => {
  it("meldet keinen Erfolg, wenn das Kopieren scheitert", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn(async () => { throw new Error("verweigert"); }) },
      configurable: true,
    });
    render(<SystemStatus />);
    await user.click(screen.getByRole("button", { name: /Copy config/i }));
    await waitFor(() => expect(screen.getByText(/Copying failed/)).toBeTruthy());
    expect(screen.queryByText(/^Copied$/)).toBeNull();
  });

  it("meldet keinen Erfolg, wenn es gar keine Zwischenablage gibt", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    render(<SystemStatus />);
    await user.click(screen.getByRole("button", { name: /Copy config/i }));
    await waitFor(() => expect(screen.getByText(/Copying failed/)).toBeTruthy());
  });

  it("gibt eine MCP-Konfiguration zum Kopieren", async () => {
    const user = userEvent.setup();
    // userEvent.setup() setzt seine EIGENE Zwischenablage — die muss danach
    // ueberschrieben werden, sonst misst man den Stub der Testbibliothek.
    const schreibe = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText: schreibe }, configurable: true });
    render(<SystemStatus />);
    expect(screen.getByText(/kepta-mcp/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Copy config/i }));
    await waitFor(() => expect(schreibe).toHaveBeenCalledWith(expect.stringContaining("kepta-mcp")));
    await waitFor(() => expect(screen.getByText(/^Copied$/)).toBeTruthy());
  });

  it("nennt auch den HTTP-Weg mit der Protokollversion", () => {
    render(<SystemStatus />);
    expect(screen.getByText(/JSON-RPC, protocol 2026-07-28/)).toBeTruthy();
  });
});

describe("SystemStatus: eine kaputte Antwort darf nichts umwerfen", () => {
  // Befund vom 6.9.2026: /api/health wurde ungeprueft uebernommen und danach
  // tief ausgelesen. Fehlte "embeddings" oder "mcp", warf das Auslesen — und
  // React haengte den GANZEN Einstellungs-Bildschirm aus. Leeres Fenster, keine
  // Meldung. Eine Statusanzeige, die am Zustand zerbricht, ist wertlos.
  it.each([
    ["ohne embeddings", { ok: true, count: 5, dbPath: "/x", mcp: { protocol: "p", tools: 8, http: "/mcp" } }],
    ["ohne mcp", { ok: true, count: 5, dbPath: "/x", embeddings: { total: 1, embedded: 1 } }],
    ["voellig fremd", { models: [] }],
    ["Fehlerobjekt mit Status 200", { error: "kaputt" }],
    ["leeres Objekt", {}],
    ["null", null],
    ["Zeichenkette", "nein"],
    ["Zahl", 42],
  ])("ueberlebt eine Antwort %s", async (_name, nutzlast) => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/health")) return new Response(JSON.stringify(nutzlast), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    const { container } = render(<SystemStatus />);
    await waitFor(() => expect(container.textContent).toMatch(/System status/));
    // Der Bildschirm steht noch und zeigt keine kaputten Zahlen.
    expect(container.textContent?.length ?? 0).toBeGreaterThan(200);
    expect(container.textContent).not.toMatch(/NaN|undefined/);
  });

  it("normalisiereHealth fuellt fehlende Felder mit brauchbaren Vorgaben", () => {
    expect(normalisiereHealth(null)).toBeNull();
    expect(normalisiereHealth("nein")).toBeNull();
    expect(normalisiereHealth(7)).toBeNull();
    const h = normalisiereHealth({ ok: true })!;
    expect(h.embeddings).toEqual({ total: 0, embedded: 0 });
    expect(h.mcp.protocol).toBe("?");
    expect(h.count).toBe(0);
    expect(h.dbPath).toBe("unknown");
  });

  it("normalisiereHealth uebernimmt gueltige Werte unveraendert", () => {
    const h = normalisiereHealth({
      ok: true, count: 412, dbPath: "/a/b.db",
      embeddings: { total: 800, embedded: 600 },
      mcp: { protocol: "2026-07-28", tools: 8, http: "/mcp" },
    })!;
    expect(h).toEqual({
      ok: true, count: 412, dbPath: "/a/b.db",
      embeddings: { total: 800, embedded: 600 },
      mcp: { protocol: "2026-07-28", tools: 8, http: "/mcp" },
      encryption: { aktiv: false },
    });
  });

  it("zeigt, ob die Datei verschluesselt ist — und sonst, warum nicht", async () => {
    stubFetch({ health: { ...GESUND, encryption: { aktiv: true, ablage: "macOS Keychain" } } });
    const { container, unmount } = render(<SystemStatus />);
    await waitFor(() => expect(container.textContent).toMatch(/key in the macOS Keychain/));
    expect(container.textContent).toMatch(/AES-256/);
    unmount();

    stubFetch({ health: { ...GESUND, encryption: { aktiv: true, ablage: "Windows DPAPI" } } });
    const win = render(<SystemStatus />);
    await waitFor(() => expect(win.container.textContent).toMatch(/protected by Windows DPAPI/));
    win.unmount();

    stubFetch({ health: { ...GESUND, encryption: { aktiv: true, ablage: "KEPTA_DB_KEY" } } });
    const env = render(<SystemStatus />);
    await waitFor(() => expect(env.container.textContent).toMatch(/key from KEPTA_DB_KEY/));
    env.unmount();

    stubFetch({ health: { ...GESUND, encryption: { aktiv: false, hinweis: "The knowledge base is open in another program" } } });
    const aus = render(<SystemStatus />);
    await waitFor(() => expect(aus.container.textContent).toMatch(/open in another program/));
    expect(aus.container.textContent).toMatch(/restart KEPTA/);
    aus.unmount();

    stubFetch({ health: { ...GESUND, encryption: { aktiv: false } } });
    const ohne = render(<SystemStatus />);
    await waitFor(() => expect(ohne.container.textContent).toMatch(/file is not encrypted/));
  });

  it("wirft keine unsinnigen Zahlen aus, wenn Felder falsch typisiert sind", () => {
    const h = normalisiereHealth({ ok: "ja", count: "viele", embeddings: { total: null, embedded: NaN }, mcp: { tools: "acht" } })!;
    expect(h.ok).toBe(false);
    expect(h.count).toBe(0);
    expect(h.embeddings.total).toBe(0);
    expect(Number.isNaN(h.embeddings.embedded)).toBe(false);
    expect(h.mcp.tools).toBe(0);
  });
});
