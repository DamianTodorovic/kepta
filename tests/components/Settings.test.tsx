// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Settings } from "../../src/components/Settings";
import { TEXTE } from "../../src/lib/uiText";

// Die Einstellungen sind die Stelle, an der ein Schluessel eingegeben, ein
// Anbieter gewechselt und die Wissensbasis gesichert wird. Fehler hier sind
// teuer: ein Schluessel, der beim Anbieterwechsel haengen bleibt, geht an den
// falschen Dienst.

/**
 * Welche Werkzeuge die Agenten wirklich bekommen, steht im Kern — nicht in
 * diesem Test und nicht in der Flaeche. Gelesen statt importiert: `src/core/mcp.ts`
 * zieht `saveWithIndex` und damit Server-Code in den jsdom-Baum.
 */
function werkzeugeAusDemKern(): string[] {
  // Gegen das Arbeitsverzeichnis, nicht gegen `import.meta.url`: im jsdom-Lauf
  // ist diese URL eine http-Adresse, und `fileURLToPath` wirft („The URL must be
  // of scheme file") — ein Rot an der Sonde, nicht an der Flaeche.
  const quelltext = readFileSync(path.resolve(process.cwd(), "src/core/mcp.ts"), "utf8");
  const anfang = quelltext.indexOf("export const TOOLS");
  if (anfang === -1) throw new Error("src/core/mcp.ts hat kein export const TOOLS — Sonde geaendert?");
  const stueck = quelltext.slice(anfang, quelltext.indexOf("\n]", anfang));
  return [...stueck.matchAll(/name:\s*"([^"]+)"/g)].map((m) => m[1]);
}

function stubFetch(over: { models?: string[]; modelsOk?: boolean; modelsError?: string } = {}) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("/api/models")) {
      if (over.modelsOk === false) return new Response(JSON.stringify({ error: over.modelsError ?? "kaputt" }), { status: 400 });
      return new Response(JSON.stringify({ models: over.models ?? ["llama3.2", "mistral"] }), { status: 200 });
    }
    if (url.includes("/api/health")) return new Response(JSON.stringify({ ok: true, count: 7, uptime: 12 }), { status: 200 });
    if (url.includes("/api/mcp/tools") || url.includes("/api/tools")) {
      return new Response(JSON.stringify({
        protocol: "2026-07-28",
        tools: werkzeugeAusDemKern().map((name) => ({ name, description: `${name} — Werkszeug aus dem Kern`, inputSchema: { type: "object" } })),
      }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }));
}

beforeEach(() => {
  localStorage.clear();
  stubFetch();
  Object.defineProperty(URL, "createObjectURL", { value: vi.fn(() => "blob:x"), configurable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Settings: Suche (Paket 2 — UI-Funktionsparität)", () => {
  it("zeigt den Such-Abschnitt mit Suchtiefe (Default 16), Spuren-Schaltern und Treffer-Regler", () => {
    const { container } = render(<Settings />);
    expect(container.textContent).toMatch(/Search depth \(top-k\)/);
    expect(container.textContent).toMatch(/Retrieval tracks/);
    for (const spur of ["BM25", "Vectors", "Graph"]) {
      expect(screen.getByRole("checkbox", { name: `Track ${spur}` })).toBeTruthy();
    }
    expect(screen.getByLabelText(/Results shown/)).toBeTruthy();
    const tiefe = screen.getByLabelText(/Search depth/) as HTMLInputElement;
    expect(Number(tiefe.value)).toBe(16);
  });

  it("schreibt die Suchtiefe in die geteilten Präferenzen (Slider 5–32)", async () => {
    const { container } = render(<Settings />);
    const tiefe = screen.getByLabelText(/Search depth/) as HTMLInputElement;
    // React-Wert-Tracker: über den nativen Setter setzen, sonst sieht React
    // keine Änderung und das onChange feuert nicht.
    const wertSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    wertSetter.call(tiefe, "32");
    tiefe.dispatchEvent(new Event("input", { bubbles: true }));
    await waitFor(() => expect(localStorage.getItem("ki_gehirn_such_tiefe")).toBe("32"));
    expect(container.textContent).toMatch(/32/);
  });

  it("schaltet eine Spur ab — der Schalter landet in den geteilten Präferenzen", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    const graph = screen.getByRole("checkbox", { name: "Track Graph" }) as HTMLInputElement;
    expect(graph.checked).toBe(true);
    await user.click(graph);
    await waitFor(() => expect(localStorage.getItem("ki_gehirn_spur_graph")).toBe("0"));
    expect((screen.getByRole("checkbox", { name: "Track Graph" }) as HTMLInputElement).checked).toBe(false);
  });

  it("der Treffer-Regler schreibt denselben Schlüssel wie der Dashboard-Regler", async () => {
    render(<Settings />);
    const regler = screen.getByLabelText(/Results shown/) as HTMLInputElement;
    expect(Number(regler.max)).toBeGreaterThan(0);
    // Auf die letzte Stufe ("All", Wert 0) stellen:
    const wertSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    wertSetter.call(regler, String(Number(regler.max)));
    regler.dispatchEvent(new Event("input", { bubbles: true }));
    await waitFor(() => expect(localStorage.getItem("ki_gehirn_topK")).toBe("0"));
  });
});

describe("Settings: die drei Reiter", () => {
  it("startet im System-Reiter", () => {
    render(<Settings />);
    expect(screen.getByRole("button", { name: /^Save$/i })).toBeTruthy();
  });

  it("wechselt zu MCP und wieder zurueck", async () => {
    const user = userEvent.setup();
    const { container } = render(<Settings />);
    await user.click(screen.getByRole("button", { name: /MCP \/ API/i }));
    await waitFor(() => expect(container.textContent).toMatch(/One brain for every AI/));
    await user.click(screen.getByRole("button", { name: /AI & data/i }));
    await waitFor(() => expect(container.textContent).toMatch(/Data management/));
  });

  it("hat einen Device-Sync-Reiter — englisch benannt, nicht mehr Praxis-Sync", async () => {
    const user = userEvent.setup();
    const { container } = render(<Settings />);
    expect(screen.queryByRole("button", { name: /Praxis/i })).toBeNull();
    await user.click(screen.getByRole("button", { name: /Device Sync/i }));
    await waitFor(() => expect(container.textContent).toMatch(/Encrypted exchange between your own devices/));
  });
});

describe("Settings: Anbieter und Schluessel", () => {
  it("zeigt den Schluessel als Passwortfeld", () => {
    const { container } = render(<Settings />);
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
  });

  it("speichert die Einstellungen dauerhaft", async () => {
    const user = userEvent.setup();
    const { container } = render(<Settings />);
    const feld = container.querySelector('input[type="password"]') as HTMLInputElement;
    await user.type(feld, "sk-testschluessel");
    await user.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => expect(JSON.stringify(localStorage)).toContain("sk-testschluessel"));
  });

  it("nimmt den Schluessel NICHT zum naechsten Anbieter mit", async () => {
    // Sonst ginge ein Schluessel an einen Dienst, fuer den er nicht gedacht war.
    const user = userEvent.setup();
    const { container } = render(<Settings />);
    const feld = () => container.querySelector('input[type="password"]') as HTMLInputElement;
    const auswahl = container.querySelector("select") as HTMLSelectElement;
    expect(auswahl, "keine Anbieterauswahl gefunden").not.toBeNull();

    await user.type(feld(), "sk-geheim");
    await waitFor(() => expect(feld().value).toContain("sk-geheim"));

    const andere = [...auswahl.options].map((o) => o.value).filter((v) => v !== auswahl.value);
    expect(andere.length, "nur ein Anbieter zur Auswahl").toBeGreaterThan(0);
    await user.selectOptions(auswahl, andere[0]);
    await waitFor(() => expect(feld().value).not.toContain("sk-geheim"));
  });

  it("bietet mehrere Anbieter zur Auswahl", () => {
    const { container } = render(<Settings />);
    const auswahl = container.querySelector("select") as HTMLSelectElement;
    expect(auswahl.options.length).toBeGreaterThan(1);
  });
});

describe("Settings: Modelle", () => {
  it("laedt die Modell-Liste", async () => {
    const user = userEvent.setup();
    const { container } = render(<Settings />);
    const laden = [...container.querySelectorAll("button")].find((b) => /^Load$/i.test(b.textContent?.trim() ?? ""));
    if (laden) {
      await user.click(laden);
      await waitFor(() => expect(container.textContent).toMatch(/llama3\.2/));
    }
  });

  it("meldet einen Fehler im Klartext, statt still zu bleiben", async () => {
    const user = userEvent.setup();
    stubFetch({ modelsOk: false, modelsError: "Ollama nicht erreichbar" });
    const { container } = render(<Settings />);
    const laden = [...container.querySelectorAll("button")].find((b) => /^Load$/i.test(b.textContent?.trim() ?? ""));
    if (laden) {
      await user.click(laden);
      await waitFor(() => expect(container.textContent).toMatch(/Ollama nicht erreichbar/));
    }
  });

  it("sagt es, wenn gar keine Modelle da sind", async () => {
    const user = userEvent.setup();
    stubFetch({ models: [] });
    const { container } = render(<Settings />);
    const laden = [...container.querySelectorAll("button")].find((b) => /^Load$/i.test(b.textContent?.trim() ?? ""));
    if (laden) {
      await user.click(laden);
      await waitFor(() => expect(container.textContent).toMatch(/No models found/i));
    }
  });
});

describe("Settings: Selbstlernen", () => {
  it("merkt sich den Schalter", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    // Fest über den Namen statt "erste Checkbox" — seit Paket 2 hat der
    // Such-Abschnitt seine eigenen Schalter weiter oben auf der Fläche.
    const schalter = screen.getByRole("checkbox", { name: /Auto-learn/i });
    await user.click(schalter);
    await waitFor(() => expect(localStorage.getItem("ki_gehirn_autolearn")).toBe("true"));
    await user.click(schalter);
    await waitFor(() => expect(localStorage.getItem("ki_gehirn_autolearn")).toBe("false"));
  });
});

describe("Settings: Sicherung", () => {
  it("laedt eine JSON-Sicherung herunter und meldet es", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole("button", { name: /Download JSON backup/i }));
    await waitFor(() => expect(screen.getByText(/Backup created/i)).toBeTruthy());
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  /**
   * Der Fall oben ist gruen und schuetzt nichts: sein Stub bedient
   * `/api/memories` ueberhaupt nicht, die Sicherung ist also ein leerer Blatt
   * und die Flaeche meldet trotzdem Erfolg. SET1 hat 16.10. gemessen, was ein
   * Nutzer mit 21 066 Knoten bekommt: `getMemoriesSync()` gibt den
   * Seiten-Cache (src/lib/store.ts:64, gefuellt aus `fetch('/api/memories')`
   * ohne `alle=1`, Kappe `SEITE_STD = 100` in server/helfer/api-form.ts:78),
   * die Flaeche sagt „Backup created" und der Nutzer haelt 100 Knoten fuer
   * seine Wissensbasis. Geprueft wird hier der INHALT des Blattes, nicht die
   * Beschriftung des Knopfs.
   */
  it("sichert den ganzen Bestand, nicht die Seite, und nennt die Zahl", async () => {
    const notiz = (i: number) => ({
      id: `m${i}`, userId: "local", title: `Notiz ${i}`, content: `Inhalt ${i}`,
      tags: [], type: "semantic", createdAt: 1, updatedAt: 1,
    });
    const wegen: string[] = [];
    const blobs: Blob[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      wegen.push(String(url));
      if (String(url).includes("alle=1")) {
        return new Response(JSON.stringify(Array.from({ length: 250 }, (_, i) => notiz(i))), { status: 200 });
      }
      if (String(url).includes("/api/memories")) {
        return new Response(JSON.stringify(Array.from({ length: 100 }, (_, i) => notiz(i))), {
          status: 200, headers: { "x-kepta-total": "250", "x-kepta-begrenzt": "1" },
        });
      }
      if (String(url).includes("/api/health")) return new Response(JSON.stringify({ ok: true, count: 250, uptime: 1 }), { status: 200 });
      if (String(url).includes("/api/models")) return new Response(JSON.stringify({ models: [] }), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((b: Blob) => { blobs.push(b); return "blob:x"; }),
    });

    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole("button", { name: /Download JSON backup/i }));
    await waitFor(() => expect(screen.getByText(/Backup created/i)).toBeTruthy());

    await waitFor(() => expect(blobs.length, "die Flaeche hat ueberhaupt kein Blatt erzeugt").toBe(1));
    const gesichert = JSON.parse(await blobs[0].text());
    expect(Array.isArray(gesichert) ? gesichert.length : gesichert.memories?.length ?? 0,
      "die Sicherung haelt eine Seite, nicht den Bestand").toBe(250);
    expect(wegen.some((u) => u.includes("alle=1")),
      "kein Abruf des ganzen Bestands — der Download haengt am Seiten-Cache").toBe(true);
    expect(screen.getByText(/Backup created/i).textContent,
      "eine Sicherung ohne Zahl ist ein Versprechen ohne Beleg").toMatch(/250/);
  });
});

describe("Settings: MCP-Anschluss", () => {
  it("nennt den Weg ueber das veroeffentlichte Paket", async () => {
    const user = userEvent.setup();
    const { container } = render(<Settings />);
    await user.click(screen.getByRole("button", { name: /MCP \/ API/i }));
    await waitFor(() => expect(container.textContent).toMatch(/kepta-mcp/));
  });

  it("kopiert die Konfiguration", async () => {
    const user = userEvent.setup();
    const { container } = render(<Settings />);
    const schreibe = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText: schreibe }, configurable: true });
    await user.click(screen.getByRole("button", { name: /MCP \/ API/i }));
    const kopieren = [...container.querySelectorAll("button")].find((b) => /^Copy$/.test(b.textContent?.trim() ?? ""));
    expect(kopieren, "kein Kopier-Knopf im MCP-Reiter").toBeTruthy();
    await user.click(kopieren!);
    await waitFor(() => expect(schreibe).toHaveBeenCalled());
    await waitFor(() => expect(container.textContent).toMatch(/Copied/));
  });

  it("meldet einen Fehlschlag, statt gar nichts zu sagen", async () => {
    // Vorher stand hier ein blankes await ohne Absicherung: ohne Zwischenablage
    // gab es keine Rueckmeldung und eine unbehandelte Ausnahme.
    const user = userEvent.setup();
    const { container } = render(<Settings />);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn(async () => { throw new Error("verweigert"); }) },
      configurable: true,
    });
    await user.click(screen.getByRole("button", { name: /MCP \/ API/i }));
    const kopieren = [...container.querySelectorAll("button")].find((b) => /^Copy$/.test(b.textContent?.trim() ?? ""));
    await user.click(kopieren!);
    await waitFor(() => expect(container.textContent).toMatch(/Copying failed/));
  });
});

describe("Settings: MCP in der fertigen App", () => {
  it("empfiehlt den mitgelieferten Server — ohne Node.js und ohne npm", async () => {
    const start = { command: "/Applications/KEPTA.app/Contents/MacOS/KEPTA", args: ["/Applications/KEPTA.app/Contents/Resources/app.asar/dist/mcp-server.cjs"], env: { ELECTRON_RUN_AS_NODE: "1" } };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/health")) return new Response(JSON.stringify({ ok: true, count: 7, uptime: 12, mcp: { stdio: start } }), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    const user = userEvent.setup();
    const { container } = render(<Settings />);
    // Nach userEvent.setup(): user-event legt sonst seine eigene Zwischenablage darüber.
    const schreibe = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText: schreibe }, configurable: true });
    await user.click(screen.getByRole("button", { name: /MCP \/ API/i }));
    await waitFor(() => expect(container.textContent).toMatch(/runs inside the K3PTA app/));
    expect(container.textContent).toMatch(/no Node\.js, no npm/);
    expect(container.textContent).toMatch(/it already points to this app/);
    const kopfzeile = screen.getByText("mcp.json — runs inside the K3PTA app").parentElement!;
    await user.click(within(kopfzeile).getByRole("button", { name: /Copy/ }));
    await waitFor(() => expect(schreibe).toHaveBeenCalled());
    expect(JSON.parse(String((schreibe.mock.calls as unknown[][])[0][0]))).toEqual({ mcpServers: { kepta: start } });
  });
});

describe("Settings: der MCP-Reiter im Ganzen", () => {
  async function zumMcp(user: ReturnType<typeof userEvent.setup>) {
    const view = render(<Settings />);
    await user.click(screen.getByRole("button", { name: /MCP \/ API/i }));
    await waitFor(() => expect(view.container.textContent).toMatch(/One brain for every AI/));
    return view;
  }

  it("zeigt beide Wege: veroeffentlichtes Paket und eigener Checkout", async () => {
    const user = userEvent.setup();
    const { container } = await zumMcp(user);
    expect(container.textContent).toMatch(/kepta-mcp/);
    expect(container.textContent).toMatch(/dist\/mcp-server\.cjs|node/);
  });

  it("nennt den Ablageort der Claude-Konfiguration", async () => {
    const user = userEvent.setup();
    const { container } = await zumMcp(user);
    expect(container.textContent).toMatch(/claude_desktop_config\.json/);
  });

  it("listet die HTTP-Routen mit Beispielaufrufen", async () => {
    const user = userEvent.setup();
    const { container } = await zumMcp(user);
    expect(container.textContent).toMatch(/\/api\/health/);
    expect(container.textContent).toMatch(/\/api\/mcp\/search|\/api\/memories\/search/);
    expect(container.textContent).toMatch(/curl/);
  });

  it("nennt jedes Werkzeug, das die Tuer advertiert — keine abgeschriebene Shortlist", async () => {
    const kerNamen = werkzeugeAusDemKern();
    // Eine Sonde, die nichts findet, ist kein Beweis. Unter acht Namen ist die
    // Aufloesung taub — ein gruenes Urteil ueber eine halbleere Liste waere
    // genau der Fall, den dieser Test ersetzen soll.
    expect(kerNamen.length, `der Kern nennt nur ${kerNamen.length} Werkzeuge — Aufloesung pruefen`).toBeGreaterThanOrEqual(8);
    const user = userEvent.setup();
    const { container } = await zumMcp(user);
    const fehlen = kerNamen.filter((w) => !(container.textContent ?? "").includes(w));
    expect(fehlen, `auf der Flaeche fehlen: ${fehlen.join(", ")} (Kern: ${kerNamen.length}, Flaeche zeigt ${kerNamen.length - fehlen.length})`).toEqual([]);
  });

  it("zeigt, was die Tuer sagt — nicht was im Blatt geschrieben steht", async () => {
    // Der eigentliche Beweis, dass die Liste abgeleitet ist: eine Tuer erfinden,
    // die nichts von den acht weiss. Stünde auch nur ein Text der Flaeche mit der
    // Hand im Blatt, ueberlebte er diese Tuer — und genau so ist der Fehler
    // entstanden, den dieser Fall ersetzt.
    const falscheTuer = [
      { name: "memory_zebra", title: "Zebra", description: "Zebra first sentence. Second sentence must not show.", inputSchema: { properties: { q: {}, z: {} }, required: ["q"] } },
      { name: "memory_yeti", title: "Yeti", description: "Yeti talks about snow.", inputSchema: { properties: { where: {} } } },
      { name: "memory_quokka", title: "Quokka", description: "Quokka never frowns.", inputSchema: {} },
    ];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/api/mcp/tools")) {
        return new Response(JSON.stringify({ protocol: "2026-07-28", tools: falscheTuer }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, count: 0, uptime: 1, mcp: { protocol: "2026-07-28", tools: 3, http: "/mcp" } }), { status: 200 });
    }));
    const user = userEvent.setup();
    const { container } = await zumMcp(user);
    const text = container.textContent ?? "";
    // Reihenfolge: die Flaeche malt in der Reihenfolge der Tuer, nicht einer eigenen.
    const pos = (n: string) => text.indexOf(n);
    expect(pos("memory_zebra"), "zebra fehlt ganz").toBeGreaterThanOrEqual(0);
    expect(pos("memory_yeti"), "yeti fehlt ganz").toBeGreaterThan(pos("memory_zebra"));
    expect(pos("memory_quokka"), "quokka fehlt ganz").toBeGreaterThan(pos("memory_yeti"));
    // Titel und erster Satz kommen aus der Antwort, der zweite Satz bleibt draussen.
    expect(text).toContain("Zebra — Zebra first sentence.");
    expect(text).not.toContain("Second sentence must not show.");
    // Felder: Pflicht ohne ?, der Rest mit ?, leeres Schema als {}.
    expect(text).toContain("{ q, z? }");
    expect(text).toContain("{ where? }");
    // Und nichts von der alten handgesetzten Dreier-Liste darf noch zu sehen sein.
    for (const alt of ["Searches titles, content and tags", "Creates or updates a node", "Lists every node, paginated", "memory_search"]) {
      expect(text, `die Flaeche malt noch Handtext: ${alt}`).not.toContain(alt);
    }
    // Die Zahl am Rand ist die Zahl der Tuer.
    expect(text).toContain("3");
  });

  it("kopiert jede angebotene Zeile", async () => {
    const user = userEvent.setup();
    const { container } = await zumMcp(user);
    const schreibe = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText: schreibe }, configurable: true });
    const kopierKnoepfe = [...container.querySelectorAll("button")].filter((b) => /^copy$/i.test((b.textContent ?? "").trim()));
    expect(kopierKnoepfe.length).toBeGreaterThan(1);
    for (const k of kopierKnoepfe.slice(0, 3)) await user.click(k);
    await waitFor(() => expect(schreibe.mock.calls.length).toBeGreaterThanOrEqual(3));
  });

  it("meldet eine ausgefallene Werkzeug-Tuer, statt still drei Namen zu zeigen", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/api/mcp/tools")) return new Response("{}", { status: 500 });
      return new Response(JSON.stringify({ ok: true, count: 0, uptime: 1 }), { status: 200 });
    }));
    const user = userEvent.setup();
    const { container } = await zumMcp(user);
    const text = container.textContent ?? "";
    expect(text).toMatch(/tool list could not be read|did not arrive/i);
    expect(text).not.toContain("memory_search");
  });
});

describe("Settings: Selbstlernen im Detail", () => {
  it("erklaert, wo der Schalter lebt und was er kostet", () => {
    const { container } = render(<Settings />);
    expect(container.textContent).toMatch(/ki_gehirn_autolearn/);
    expect(container.textContent).toMatch(/extraction call|background/i);
  });

  it("laesst ein eigenes Modell fuer die Extraktion setzen", async () => {
    const user = userEvent.setup();
    const { container } = render(<Settings />);
    const felder = [...container.querySelectorAll('input[type="text"]')];
    const extrakt = felder.find((f) => /gpt-4o-mini|model/i.test(f.getAttribute("placeholder") ?? ""));
    if (extrakt) {
      await user.type(extrakt, "llama3.2");
      await waitFor(() => expect((extrakt as HTMLInputElement).value).toContain("llama3.2"));
    }
  });
});

describe("Settings: Darstellung", () => {
  it("merkt sich die Textgröße — eine Sprachwahl gibt es nicht mehr, K3PTA ist englisch", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    expect(screen.queryByText("Interface language")).toBeNull();
    await user.selectOptions(screen.getByDisplayValue("100 %"), "115 %");
    expect(localStorage.getItem("ki_gehirn_zoom")).toBe("115");
    expect(document.body.style.zoom).toBe("1.15");
  });
});

describe("Settings: Importe neu lesen", () => {
  // In 2.10.0 gab es die Reparatur alter PDF-Importe nur als API-Aufruf.
  it("zaehlt erst, schreibt nach Bestaetigung und sagt, was passiert ist", async () => {
    const user = userEvent.setup();
    const koerper: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, o?: RequestInit) => {
      if (url.includes("/api/repair/imports")) {
        const body = JSON.parse(String(o?.body ?? "{}")) as { apply?: boolean };
        koerper.push(body);
        return new Response(JSON.stringify({
          ok: true, applied: body.apply === true, geprueft: 9, dateien: 2,
          aktualisiert: 5, entfernt: 1, erstellt: 0, clips: 3, fehler: [],
        }), { status: 200 });
      }
      if (url.includes("/api/health")) return new Response(JSON.stringify({ ok: true, count: 7, uptime: 12 }), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    render(<Settings />);
    await user.click(screen.getByRole("button", { name: "Check imported files" }));
    await waitFor(() => expect(screen.getByText(/2 files would be read again/)).toBeTruthy());
    // Ueberzaehlige Teile gehen in den Papierkorb — 2.10.1 loeschte sie endgueltig.
    expect(screen.getByText(/1 moved to the trash/)).toBeTruthy();
    expect(screen.getByText(/3 web clips would lose their menu lines/)).toBeTruthy();
    expect(koerper[0]).toEqual({});

    await user.click(screen.getByRole("button", { name: "Yes, repair" }));
    await waitFor(() => expect(screen.getByText(/^Done: 2 files read again/)).toBeTruthy());
    expect(koerper[1]).toEqual({ apply: true });
  });

  it("sagt ehrlich, wenn nichts zu reparieren ist", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/repair/imports")) {
        return new Response(JSON.stringify({ ok: true, applied: false, geprueft: 4, dateien: 0, aktualisiert: 0, entfernt: 0, erstellt: 0, clips: 0, fehler: [] }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    }));
    render(<Settings />);
    await user.click(screen.getByRole("button", { name: "Check imported files" }));
    await waitFor(() => expect(screen.getByText(/4 imported files checked — everything reads fine/)).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Yes, repair" })).toBeNull();
  });

  it("meldet einen Fehlschlag, statt still zu bleiben", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/repair/imports")) return new Response("{}", { status: 500 });
      return new Response("{}", { status: 200 });
    }));
    render(<Settings />);
    await user.click(screen.getByRole("button", { name: "Check imported files" }));
    await waitFor(() => expect(screen.getByText(/could not be checked/)).toBeTruthy());
  });
});

describe("Settings: was die Flaeche verspricht, zeigt sie auch", () => {
  // B5 und B6 sind dieselbe Klasse: ein Text auf der Platte verweist auf ein
  // Wort, das auf der Platte nicht steht. Gegen die GERENDERTE Flaeche gerechnet,
  // nicht gegen den Quelltext — ein Umbau der Oberflaeche zieht den Fall mit,
  // eine handgesetzte Wortliste nicht.

  it("eine Anweisung in Anfuehrung nennt nur Woerter, die wirklich dastehen", async () => {
    const { container } = render(<Settings />);
    await waitFor(() => expect(container.textContent).toMatch(/No key yet/));
    // Was ein Mensch links sieht, kommt aus TEXTE (Sidebar.tsx:57-66); was er
    // auf der Platte sieht, sind die Knöpfe dieses Schirms.
    const sitzbar = [
      ...Object.entries(TEXTE).filter(([k]) => k.startsWith("nav.")).map(([, v]) => v),
      ...[...container.querySelectorAll("button")].map((b) => (b.textContent ?? "").trim()),
    ];
    const anweisungen = [...container.querySelectorAll("div, p, span, li")]
      .filter((e) => e.children.length === 0 && /“/.test(e.textContent ?? "") && /→/.test(e.textContent ?? ""))
      .map((e) => (e.textContent ?? "").trim());
    expect(anweisungen.length, "die Sonde sieht keine Anweisung — diese Wache ist taub").toBeGreaterThan(0);
    for (const satz of anweisungen) {
      for (const m of satz.matchAll(/“([^”]{2,24})”/g)) {
        expect(sitzbar, `„${m[1]}“ steht nirgends — die Person sucht es vergeblich in: ${satz}`).toContain(m[1]);
      }
    }
  });

  it("der Platzhalter, den die Anleitung nennt, steht wirklich im Kasten", async () => {
    const user = userEvent.setup();
    const { container } = render(<Settings />);
    await user.click(screen.getByRole("button", { name: "MCP / API" }));
    const kasten = [...container.querySelectorAll("pre")].map((p) => p.textContent ?? "");
    expect(kasten.length, "die Sonde sieht keinen Konfigurationskasten — diese Wache ist taub").toBeGreaterThan(0);
    const genannt = [...container.querySelectorAll("p code")].map((c) => (c.textContent ?? "").trim()).filter((t) => t.startsWith("/"));
    expect(genannt.length, "die Sonde sieht keine Platzhalter-Anweisung — diese Wache ist taub").toBeGreaterThan(0);
    for (const p of genannt) {
      expect(kasten.join("\n"), `die Anleitung heisst „${p}“ zu ersetzen — so etwas steht in keinem Kasten`).toContain(p);
    }
  });
});

describe("Settings: die Quittung nach dem Speichern", () => {
  // Flaeche-Punkt aus dem SET1-Papier 19, von der Leitung aufgegeben und 17:32 entschieden:
  // die Quittung lebt 6 000 ms (QUITTUNG_MS, eine Lebensdauer fuer alle persistierenden). Das
  // ist an sich eine Entwurfs-Entscheidung — aber der Timer wird
  // bei jedem Speichern neu gelegt, ohne den alten zu loeschen. Wer zweimal
  // speichert, sieht die Bestaetigung der zweiten Speicherung fast sofort verschwinden.
  it("zaehlt 6 000 ms ab der letzten Speicherung, nicht ab der ersten", () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<Settings />);
      const knopf = () => container.querySelector("button[type=submit]") as HTMLButtonElement;
      expect(knopf(), "die Sonde sieht den Speichern-Knopf nicht").toBeTruthy();
      fireEvent.click(knopf());
      expect(knopf().textContent).toMatch(/Configuration saved/);
      act(() => { vi.advanceTimersByTime(1900); });
      fireEvent.click(knopf());
      act(() => { vi.advanceTimersByTime(200); });
      expect(knopf().textContent, "die zweite Speicherung hat neu zu zaehlen — der alte Timer darf ihr die Quittung nicht wegnehmen").toMatch(/Configuration saved/);
      act(() => { vi.advanceTimersByTime(6_001); });
      expect(knopf().textContent).toMatch(/Save/);
    } finally {
      vi.useRealTimers();
    }
  });
});

// --- #26 Richtung B — die Meldung an der geaenderten Zeile ---------------------
// Der Befund aus dem Browser (17:31–17:44, Protokoll 26-zustaende-b.log.txt): die
// Verbindungsmeldung erscheint an der Zeile, die angefasst wurde, und nach dem
// Zurueckrollen nicht mehr im Fenster. Beides ist hier geprueft: die STELLE (eine
// Meldung, in der geaenderten Sektion, keine an einer andern) und die DAUER
// (5 999 ms ja, 6 001 ms nein — ein Fall, der beide Enden prueft, nicht eines).
describe("Settings: #26 Richtung B — Meldung an der geaenderten Zeile", () => {
  const quittungen = (container: HTMLElement) =>
    [...container.querySelectorAll("[data-quittung]")].map((e) => e.getAttribute("data-quittung"));

  // Der leere Zustand ist der erste, den ein Mensch sieht. Heute startet `ortZuletzt`
  // mit "anbieter" — ein Speichern ohne jede Aenderung malt deshalb eine gruene Zeile
  // unter einen Anbieter, den niemand angefasst hat.
  it("malt bei Speichern ohne jede Aenderung keine Meldung an eine Zeile", () => {
    const { container } = render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    expect(quittungen(container), "die Meldung nennt eine Zeile, die nie angefasst wurde").toEqual([]);
  });

  it("meldet genau einmal, in der Sektion des geaenderten Felds, und nicht an einer andern", async () => {
    const { container } = render(<Settings />);
    await waitFor(() => expect(container.textContent).toMatch(/Artificial intelligence/));
    const feld = screen.getByPlaceholderText(/https:\/\/api\.example\.com\/v1/);
    fireEvent.change(feld, { target: { value: "https://beispiel.example/v1" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    await waitFor(() => expect(quittungen(container)).toEqual(["endpunkt"]));
    const meldung = container.querySelector("[data-quittung]") as Element;
    // enthaelt die Sektion die Meldung, oder liegt sie nur im selben Blatt?
    expect(meldung.closest("[data-abschnitt]")?.getAttribute("data-abschnitt")).toBe("verbindung");
    // und die andre Sektion bleibt leer
    const modelle = container.querySelector('[data-abschnitt="modelle"]') as HTMLElement;
    expect(modelle.querySelector("[data-quittung]")).toBeNull();
  });

  it("lebt 6 000 ms — bei 5 999 steht die Meldung, eine Millisekunde spaeter nicht mehr", async () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<Settings />);
      const feld = screen.getByPlaceholderText(/https:\/\/api\.example\.com\/v1/);
      fireEvent.change(feld, { target: { value: "https://beispiel.example/v1" } });
      fireEvent.click(screen.getByRole("button", { name: /Save/ }));
      await act(async () => { vi.advanceTimersByTime(0); });
      expect(quittungen(container)).toEqual(["endpunkt"]);
      await act(async () => { vi.advanceTimersByTime(5_999); });
      expect(quittungen(container)).toEqual(["endpunkt"]);        // 5 999: noch da
      await act(async () => { vi.advanceTimersByTime(2); });
      expect(quittungen(container)).toEqual([]);                  // 6 001: weg
    } finally {
      vi.useRealTimers();
    }
  });

  // Sicherung ohne Bestand: der leere Zustand ist der erste, den ein frisch
  // installierter Mensch sieht. Die Meldung nennt eine Zahl, keine Rundung — und sie
  // bleibt an ihrem Knopf, es malt nichts an einer Zeile des Formulars.
  it("sichert einen leeren Bestand, nennt die Null und malt keine Zeile im Formular an", async () => {
    const { container } = render(<Settings />);
    await waitFor(() => expect(container.textContent).toMatch(/Artificial intelligence/));
    const sichern = [...container.querySelectorAll("button")].find((b) => /Back up|Backup/i.test(b.textContent || "")) as HTMLButtonElement;
    expect(sichern, "der Sicherungs-Knopf steht nicht im Blatt").toBeTruthy();
    fireEvent.click(sichern);
    await waitFor(() => expect(sichern.textContent).toMatch(/Backup created/i));
    expect(sichern.textContent, "die leere Sicherung muss ihre Null nennen").toMatch(/\b0\b.*nodes/);
    expect([...container.querySelectorAll("[data-quittung]")]).toEqual([]);
  });

  it("zaehlt Knopfe getrennt: einer im Formular, keiner gebunden ausserhalb", async () => {
    const { container } = render(<Settings />);
    await waitFor(() => expect(container.querySelector("form")).toBeTruthy());
    const formular = container.querySelector("form") as HTMLFormElement;
    expect(formular.querySelectorAll('button[type="submit"]')).toHaveLength(1);
    expect([...container.querySelectorAll("button[form]")]).toHaveLength(0);
  });
});
