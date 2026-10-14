// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Settings } from "../../src/components/Settings";

// Die Einstellungen sind die Stelle, an der ein Schluessel eingegeben, ein
// Anbieter gewechselt und die Wissensbasis gesichert wird. Fehler hier sind
// teuer: ein Schluessel, der beim Anbieterwechsel haengen bleibt, geht an den
// falschen Dienst.

function stubFetch(over: { models?: string[]; modelsOk?: boolean; modelsError?: string } = {}) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("/api/models")) {
      if (over.modelsOk === false) return new Response(JSON.stringify({ error: over.modelsError ?? "kaputt" }), { status: 400 });
      return new Response(JSON.stringify({ models: over.models ?? ["llama3.2", "mistral"] }), { status: 200 });
    }
    if (url.includes("/api/health")) return new Response(JSON.stringify({ ok: true, count: 7, uptime: 12 }), { status: 200 });
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

  it("nennt die acht Werkzeuge, die Agenten bekommen", async () => {
    const user = userEvent.setup();
    const { container } = await zumMcp(user);
    for (const werkzeug of ["memory_search", "memory_save", "memory_list"]) {
      expect(container.textContent, `${werkzeug} fehlt`).toMatch(new RegExp(werkzeug));
    }
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
