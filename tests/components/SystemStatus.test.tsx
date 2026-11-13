// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SystemStatus, normalisiereHealth } from "../../src/components/SystemStatus";

// Die Statusanzeige ist die Stelle, an der K3PTA behauptet, was funktioniert.
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

/**
 * Den Text einer Zeile der Tafel greifen — ueber ihre Beschriftung.
 * Eine Zeile ist ein Blatt mit dem Label plus eine Detail-Zeile darunter;
 * ihr Elternknoten traegt beide, und nur dort laesst sich lesen, was die
 * Flaeche ueber einen Zustand behauptet.
 */
function zeile(anfang: RegExp, wurzel: ParentNode = document.body): string {
  // P202, Mockup-Zeile (.zustandszeile): das Label steht als fett gebundener
  // Titel im Absatz — die Sonde liest das <b> und seinen Absatz.
  const blatt = [...wurzel.querySelectorAll("b")].find((b) => anfang.test((b.textContent ?? "").trim()));
  return blatt?.closest(".inhalt")?.textContent ?? blatt?.parentElement?.textContent ?? "";
}
const kernZeile = (wurzel: ParentNode = document.body) => zeile(/^The database on this computer/, wurzel);

describe("SystemStatus: was die App ueber sich behauptet", () => {
  // Gemessen 17.10. 16:0x am ausgelieferten Objekt 3.2.17 (CDP, eigener Portblock
  // 9941): GET /api/health braucht im Stand 2,5 s (drei Laeufe: 2,55 / 2,50 / 2,61),
  // im geoeffneten Fenster unter Nebenlast 20,1 s. Waehrend dieser Zeit sagte die
  // Tafel „Server unreachable", „The knowledge base file is not encrypted" und
  // „0 nodes" — dreimal das Gegenteil von dem, was dieselbe Tuer im selben
  // Augenblick meldete (ok true, Schluessel true, 21 066 Knoten). Eine Anzeige,
  // die waehrend des Lesens verneint, luegt.
  it("behauptet nichts, waehrend die eigene Auskunft noch unterwegs ist", async () => {
    const { container } = render(<SystemStatus />);
    // Vor dem ersten Aufloesen: genau der Zustand, in dem die Tafel 2,5 bis 20 s steht.
    const text = container.textContent ?? "";
    expect(zeile(/^The database on this computer/, container), "die Sonde sieht die Kern-Zeile nicht").not.toBe("");
    expect(text).not.toMatch(/Server unreachable/i);
    expect(text, "waehrend des Lesens ist die Verschluesselung unbekannt, nicht verneint").not.toMatch(/is not encrypted/);
    expect(kernZeile(container)).toMatch(/asking|answer/i);
    expect(zeile(/^Encrypted on this disk/, container)).toMatch(/not (known|read) yet|asking|waiting/i);
    expect(zeile(/^Knowledge base/, container)).toMatch(/not (known|read) yet|asking|waiting/i);
    // Dieselbe Klasse, dritte Zeile: die Ollama-Sonde laeuft noch, „Unreachable"
    // waere eine Behauptung ueber einen Zustand, der nicht gemessen ist.
    expect(text, "Ollama ist nicht unerreichbar, nur noch ungeprueft").not.toMatch(/Unreachable/);
    // Und sie ruft nicht nach einer Reparatur, die sie nicht braucht.
    expect(text).not.toMatch(/How to fix it/);
  });

  it("nennt keine Trefferquote, die die Eval nicht liefert", async () => {
    stubFetch({ embedOk: false });
    const { container } = render(<SystemStatus />);
    await waitFor(() => expect(container.textContent).toMatch(/Hit@1/));
    const zahlen = [...(container.textContent ?? "").matchAll(/(\d+)\s*%\s*Hit@1/g)].map((m) => Number(m[1]));
    expect(zahlen.length).toBeGreaterThan(0);
    // Die Latte kommt aus dem Beleg, nicht aus der Hand. Bis zum 3.11. stand hier ein
    // gesetzter Wert (75) — und dieser Wert war die Zahl des dritten Beins (75,6 %),
    // das damals niemand gemessen hatte: eine Kappe aus der Luft, die zufaellig neben
    // einer Messung lag, die es noch nicht gab. Jetzt gilt: keine Flaechenzahl ueber der
    // hoechsten Hit@1, die der Eval-Lauf wirklich meldet.
    const belegt = readFileSync(
      path.join(process.cwd(), "docs/belege/tag-0311/eval-drei-beine-1352.log.txt"),
      "utf8",
    );
    const gemessen = [...belegt.matchAll(/Hit@1:\s+(\d+(?:[.,]\d+)?)\s*%/g)].map((m) => Math.round(Number(m[1].replace(",", "."))));
    expect(gemessen.length, "der Eval-Beleg nennt keine Hit@1-Zahlen — diese Wache ist taub").toBeGreaterThanOrEqual(2);
    const geliefert = Math.max(...gemessen);
    for (const z of zahlen) {
      expect(z, `Die App behauptet ${z} % Hit@1 — der Beleg liefert hoechstens ${geliefert} %`).toBeLessThanOrEqual(geliefert);
    }
  });

  it("meldet den Kern als erreichbar samt Knotenzahl und MCP-Angaben", async () => {
    render(<SystemStatus />);
    // "412 notes" steht in zwei Zeilen: Kern und Wissensbasis.
    await waitFor(() => expect(screen.getAllByText(/412 notes/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/2026-07-28/).length).toBeGreaterThan(0);
    expect(screen.getByText(/8 tools/)).toBeTruthy();
  });

  it("sagt einem Menschen, was er tun kann, wenn die Auskunft wirklich ausbleibt", async () => {
    // Entwicklersprache ist hier eine Zumutung: die Flaeche liest, wer die
    // Kommandozeile nie anfasst. Der Befehl war bis 17.10. „Start the app with
    // npm run dev" — ein Weg, den ein Nutzer dieser App nicht gehen kann.
    stubFetch({ healthOk: false });
    render(<SystemStatus />);
    await waitFor(() => expect(kernZeile(document.body)).toMatch(/did not answer/i));
    const zeile = kernZeile(document.body);
    expect(zeile).not.toMatch(/npm|npx|curl|POST \/|localhost|:\d{4}/);
  });

  // K1 — gemessen 16.10. im Sandkasten (SET1-Papier 19): nach einem Neustart steht
  // auf dieser Zeile 174 ms lang „No key yet — chat stays silent until you add one"
  // samt Reparatur-Anweisung, obwohl die Verbindung in der Datenbank liegt. Der
  // Grund ist ein Griff, der die Antwort nicht abwartet: `loadAISettings()` liest
  // localStorage synchron, die Hydration aus `ai_connection` kommt asynchronous.
  // Die Nachbildung hier haelt die Hydration zurueck, damit derselbe Zustand
  // betretbar wird, ohne auf einen Zeitpunkt zu wetten.
  const providerZeile = (container: HTMLElement) => {
    // P202, Mockup-Zeile (.zustandszeile): das Label steht als fett gebundener
    // Titel im Absatz — die Sonde liest das <b> und seinen Absatz.
    const blatt = [...container.querySelectorAll("b")].find((b) => /^Provider/.test((b.textContent ?? "").trim()));
    return blatt?.closest(".inhalt")?.textContent ?? blatt?.parentElement?.textContent ?? "";
  };

  it("behauptet keinen fehlenden Schluessel, waehrend die Verbindung noch gelesen wird", async () => {
    const wartend = { los: null as (() => void) | null };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/health")) return new Response(JSON.stringify(GESUND), { status: 200 });
      if (url.includes("/api/embed")) return new Response("{}", { status: 503 });
      if (url.includes("/api/settings")) {
        await new Promise<void>((los) => { wartend.los = los; });
        return new Response("{}", { status: 200 });
      }
      return new Response("{}", { status: 200 });
    }));
    const { container } = render(<SystemStatus />);
    await waitFor(() => expect(container.textContent).toMatch(/412 notes/));
    const zeile = providerZeile(container);
    expect(zeile, "die Sonde sieht keine Provider-Zeile — Flaeche geaendert?").not.toBe("");
    expect(zeile, "sie darf nichts behaupten, bevor sie gelesen hat").not.toMatch(/No key yet/);
    expect(zeile).not.toMatch(/How to fix it/);
    expect(zeile, "stattdessen sagt sie, was sie gerade tut").toMatch(/reading the connection/i);
    wartend.los?.();
    await waitFor(() => expect(providerZeile(container)).toMatch(/No key yet/));
  });

  it("nennt die gelesene Verbindung, sobald die Hydration geantwortet hat", async () => {
    localStorage.setItem("aiVerbindung", JSON.stringify({ providerId: "openai", apiKey: "sk-set1-probe", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" }));
    const { container } = render(<SystemStatus />);
    await waitFor(() => expect(providerZeile(container)).toMatch(/API key stored\./));
    expect(providerZeile(container)).toMatch(/Provider: OpenAI/);
  });

  it("rechnet die Embedding-Abdeckung aus", async () => {
    render(<SystemStatus />);
    await waitFor(() => expect(screen.getByText(/75 % of their text is searchable by meaning/)).toBeTruthy());
  });

  it("kommt mit einer leeren Wissensbasis zurecht, ohne durch null zu teilen", async () => {
    stubFetch({ health: { ...GESUND, count: 0, embeddings: { total: 0, embedded: 0 } } });
    const { container } = render(<SystemStatus />);
    await waitFor(() => expect(screen.getByText(/No notes yet — drop files/)).toBeTruthy());
    expect(container.textContent).not.toMatch(/NaN/);
  });

  it("meldet Ollama als erreichbar oder nicht", async () => {
    const { unmount } = render(<SystemStatus />);
    await waitFor(() => expect(screen.getByText(/Ollama answers on this computer/)).toBeTruthy());
    unmount();
    stubFetch({ embedOk: false });
    render(<SystemStatus />);
    await waitFor(() => expect(screen.getByText(/No answer from Ollama/)).toBeTruthy());
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
    await waitFor(() => expect(screen.getByText(/No answer from that service/)).toBeTruthy());
    expect(document.body.textContent).not.toContain("Verbindung weg");
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
    expect(aus.container.textContent).toMatch(/restart K3PTA/);
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

// P62 (Leitung 5.11. 10:52 MEZ, Punkt 4 / #31, der dritte Census): der Test-Knopf las den
// Koerper, BEVOR er die Antwort fragte. Eine Tuer, die 500 mit einem unlesbaren Koerper
// antwortet -- ein HTML-Fehlerblatt eines Proxy, ein abgeschnittener Strom -- warf beim
// JSON-Lesen, und der Fang behauptete "No answer from that service". Die Tuer hatte
// geantwortet. Faelle zuerst: der erste ist vor dem Flicken rot, die Kontrolle ist in beiden
// Staenden gruen und haelt den Satz der Tuer, wo die Tuer einen schreibt.
describe("P62: eine geantwortete, aber unlesbare Antwort ist keine Stille", () => {
  it("nennt die 500 eines unlesbaren Koerpers, statt Abwesenheit zu behaupten", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/health")) return new Response(JSON.stringify(GESUND), { status: 200 });
      if (url.includes("/api/chat")) return new Response("<html><body>502 Bad Gateway</body></html>", { status: 500 });
      return new Response("{}", { status: 200 });
    }));
    render(<SystemStatus />);
    await user.click(screen.getByRole("button", { name: /Send a test request/i }));
    const grund = await waitFor(() => {
      const t = document.body.textContent || "";
      if (!/HTTP 500|No answer from that service/.test(t)) throw new Error(`keine Auskunft auf dem Schirm: "${t.slice(0, 240)}"`);
      return t.replace(/\s+/g, " ");
    });
    expect(grund, "500 ist eine Antwort — ihre Zahl gehoert auf den Schirm").toMatch(/HTTP 500/);
    expect(grund, "und die Zeile darf nicht Stille behaupten, wo die Tuer antwortete").not.toMatch(/No answer from that service/i);
    expect(grund, "der Grund steht auf der Flaeche, nicht erst in der Konsole").not.toMatch(/reason is in the developer console/i);
  });

  // KONTROLLE, in beiden Staenden gruen: schreibt die Tuer einen eigner Satz, bleibt er stehen.
  it("KONTROLLE: der Satz der Tuer ueberlebt die neue Reihenfolge", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/health")) return new Response(JSON.stringify(GESUND), { status: 200 });
      if (url.includes("/api/chat")) return new Response(JSON.stringify({ error: "storage unreadable" }), { status: 500 });
      return new Response("{}", { status: 200 });
    }));
    render(<SystemStatus />);
    await user.click(screen.getByRole("button", { name: /Send a test request/i }));
    const grund = await waitFor(() => {
      const t = document.body.textContent || "";
      if (!/storage unreadable/.test(t)) throw new Error(`der Satz der Tuer fehlt: "${t.slice(0, 240)}"`);
      return t.replace(/\s+/g, " ");
    });
    expect(grund).toMatch(/storage unreadable/);
    expect(grund).not.toMatch(/No answer from that service/i);
  });
});
