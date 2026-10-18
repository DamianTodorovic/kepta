// @vitest-environment jsdom
// Punkt 4 (Feldzug 18.10.) — Einstellungs-Schicht: jede Steuerung braucht eine
// Empfangsstelle, jede gruene Zeile einen Abschnitt, der sie zeigt, und jede
// Unwissenheit ein Wort, das Unwissenheit sagt.
//
// NICHT GEFAHREN. Die Leitung faehrt sie, bevor sie den Flicken setzt:
//   cd ~/kepta-app && npx vitest run tests/components/Settings.einstell-empfang.test.tsx
// Erwartung vor dem Flicken: alle dreizehn rot (sie benennen die fehlende Stelle —
// nach Konstruktion behauptet, nicht gefahren). Gefahren von der Leitung: 13 von 13 rot,
// EXIT 1 (belege-1810/p4-rot-vor-flicken.log) und 13 von 13 gruen, EXIT 0
// (p4-gruen-nach-flicken.log).
// Runde 2 (Leitungs-Brief 14:45, Schlaege 1 und 2) haengt fuenf weitere Faelle an: P4-12
// bis P4-14. Auch sie sind NICHT gefahren — Bau-Fenster zu, Platte fallend. Vor dem
// Flicken `p4-d-flick-quittung-und-sonde.patch` muessten alle fuenf rot sein, danach
// 18 gruen. Registerzeilen `tests`/`dateien`: +0 Dateien gegen ueber dem gefleckten Stand,
// +5 Faelle.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { Settings } from "../../src/components/Settings";
import { TRAEGER_REIHENFOLGE, THEMA_REIHENFOLGE } from "../../src/lib/graphHierarchy";

/** Ein Haufen Responses: alles ruhig, nur das Bestellte antwortet anders. */
type Abweichung = Partial<Record<string, (url: string, init?: { method?: string }) => Response>>;

function stubFetch(ab: Abweichung = {}) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { method?: string }) => {
    for (const [muster, bauen] of Object.entries(ab)) {
      if (url.includes(muster) && bauen) return bauen(url, init);
    }
    if (url.includes("/api/models")) return new Response(JSON.stringify({ models: [] }), { status: 200 });
    if (url.includes("/api/health")) return new Response(JSON.stringify({ ok: true, count: 7, uptime: 12 }), { status: 200 });
    if (url.includes("/api/mcp/tools")) return new Response(JSON.stringify({ tools: [] }), { status: 200 });
    if (url.includes("/api/policies")) return new Response(JSON.stringify({ managed: false, policies: {} }), { status: 200 });
    return new Response("{}", { status: 200 });
  }));
}

/** Die zwei Zeilen des Bestands: die Flaeche vertraut diese Form blind (memories.ts:230). */
function gruppenAntwort() {
  return new Response(JSON.stringify({
    bestand: 10,
    traeger: Object.fromEntries(TRAEGER_REIHENFOLGE.map((t) => [t, 0])),
    themen: Object.fromEntries(THEMA_REIHENFOLGE.map((t) => [t, 0])),
  }), { status: 200 });
}

beforeEach(() => {
  localStorage.clear();
  stubFetch();
  Object.defineProperty(URL, "createObjectURL", { value: vi.fn(() => "blob:x"), configurable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("P4-01: jede geaenderte Zeile hat eine Empfangsstelle", () => {
  it("meldet die Quittung an der Schluessel-Zeile, wenn nur der Schluessel geaendert wurde", async () => {
    const { container } = render(<Settings />);
    await waitFor(() => expect(container.textContent).toMatch(/Artificial intelligence/));
    const feld = screen.getByPlaceholderText(/Paste key/) as HTMLInputElement;
    fireEvent.change(feld, { target: { value: "sk-test-123" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() => expect(container.querySelector('[data-quittung="schluessel"]')).toBeTruthy());
  });

  it("meldet die Quittung an der Modell-Zeile, wenn nur das Modell geaendert wurde", async () => {
    const { container } = render(<Settings />);
    await waitFor(() => expect(container.textContent).toMatch(/Artificial intelligence/));
    const feld = screen.getByPlaceholderText(/gpt-4o-mini/) as HTMLInputElement;
    fireEvent.change(feld, { target: { value: "gpt-4o" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() => expect(container.querySelector('[data-quittung="modelle"]')).toBeTruthy());
  });
});

describe("P4-02: eine gruene Zeile nur nach bestaetigter Spiegelung", () => {
  it("sagt die Abweisung der Datenbank an der geaenderten Zeile, nicht 'Saved'", async () => {
    stubFetch({ "/api/settings": (u, init) => (init?.method === "PUT"
      ? new Response(JSON.stringify({ error: "Settings too large" }), { status: 413 })
      : new Response("{}", { status: 200 })) });
    const { container } = render(<Settings />);
    await waitFor(() => expect(container.textContent).toMatch(/Artificial intelligence/));
    const feld = screen.getByPlaceholderText(/https:\/\/api\.example\.com\/v1/) as HTMLInputElement;
    fireEvent.change(feld, { target: { value: "https://beispiel.example/v1" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() => expect(container.textContent).toMatch(/Not saved/i));
    expect(container.querySelector('[data-art="warn"]'), "die Absage gehoert an die Zeile, nicht an den Knopf").toBeTruthy();
    expect(screen.getByRole("button", { name: /Save|Configuration saved/ }).textContent,
      "ein abgewiesener Speicher darf den Knopf nicht auf 'Configuration saved' stellen").not.toMatch(/Configuration saved/);
  });
});

describe("P4-04: Unwissen heisst unklar, nie 'persoenlich'", () => {
  it("nennt die Antwort der Richtlinien-Tuer, wenn sie 429 sagt", async () => {
    stubFetch({ "/api/policies": () => new Response(JSON.stringify({ error: "Write limit" }), { status: 429 }) });
    const { container } = render(<Settings />);
    await waitFor(() => expect(container.textContent).toMatch(/unknown/i));
    expect(container.textContent).not.toMatch(/No organization policies/);
    expect(container.textContent).toMatch(/HTTP 429/);
  });

  it("zeigt beim ersten Anstrich keine Behauptung, bevor die Tuer geantwortet hat", async () => {
    let antwortVerzoegert: ((v: Response) => void) | null = null;
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url.includes("/api/policies")) return new Promise<Response>((resolve) => { antwortVerzoegert = resolve; });
      if (url.includes("/api/health")) return Promise.resolve(new Response(JSON.stringify({ ok: true, count: 0 }), { status: 200 }));
      return Promise.resolve(new Response("{}", { status: 200 }));
    }));
    const { container } = render(<Settings />);
    await waitFor(() => expect(container.textContent).toMatch(/Artificial intelligence/));
    expect(container.textContent, "bevor die Tuer antwortete, stand hier schon 'Personal install'").not.toMatch(/No organization policies|Personal install/);
    expect(antwortVerzoegert, "die Richtlinien-Tuer wurde gar nicht erst gefragt").toBeTruthy();
  });

  it("laesst die Richtliniensliste leer, wenn die Verwaltung nur Team-Rollen setzt", async () => {
    stubFetch({ "/api/policies": () => new Response(JSON.stringify({ managed: true, policies: {} }), { status: 200 }) });
    const { container } = render(<Settings />);
    await waitFor(() => expect(container.textContent).toMatch(/managed by your organization/));
    expect(container.textContent).toMatch(/no model, scan or shield rule/);
  });
});

describe("P4-05/06: Nachsortieren — Absage und Begruendung", () => {
  it("sagt, wenn die Nachsortier-Frage abgewiesen wird, statt leer zu drehen", async () => {
    stubFetch({ "/api/memories/reclassify": () => new Response(JSON.stringify({ error: "Write limit reached" }), { status: 429 }) });
    render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: /Show me what would change/ }));
    await waitFor(() => expect(screen.getByText(/Write limit reached/)).toBeTruthy());
  });

  it("zeigt die Begruendung der Route, weil der Text sie verspricht", async () => {
    stubFetch({
      "/api/memories/reclassify": () => new Response(JSON.stringify({
        ok: true, applied: false, total: 10, changed: 4,
        examples: [{ title: "Mandat A", von: "fakt", nach: "entscheidung", grund: "Beschluss-Wort" }],
      }), { status: 200 }),
      "/api/memories/gruppen": gruppenAntwort,
    });
    const { container } = render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: /Show me what would change/ }));
    await waitFor(() => expect(container.textContent).toMatch(/4 notes would change/i));
    expect(screen.getByText(/Beschluss-Wort/), "'and tells you why' ohne Grund ist eine Zahl ohne Antwort").toBeTruthy();
  });
});

describe("P4-07: Schalter an, Wirkung aus", () => {
  it("warnt, wenn Auto-Learn an ist aber kein Modell gesetzt ist", async () => {
    localStorage.setItem("aiVerbindung", JSON.stringify({
      providerId: "ollama", apiKey: "local", baseUrl: "http://localhost:11434/v1", model: "",
    }));
    render(<Settings />);
    const schalter = screen.getByRole("checkbox", { name: "Auto-learn" }) as HTMLInputElement;
    fireEvent.click(schalter);
    await waitFor(() => expect(screen.getByText(/no model is set/i)).toBeTruthy());
  });
});

describe("P4-08: Sicherung gegen die Zahl der Tuere", () => {
  it("meldet eine kurze Antwort als kurz, nicht als Erfolg", async () => {
    stubFetch({ "/api/memories?alle=1": () => new Response(JSON.stringify({ memories: [{ id: "a" }, { id: "b" }] }), {
      status: 200, headers: { "x-kepta-total": "21066", "x-kepta-begrenzt": "1" },
    }) });
    const { container } = render(<Settings />);
    await waitFor(() => expect(container.textContent).toMatch(/Data management/));
    const knopf = [...container.querySelectorAll("button")].find((b) => /Download JSON backup/i.test(b.textContent || "")) as HTMLButtonElement;
    fireEvent.click(knopf);
    await waitFor(() => expect(knopf.textContent).toMatch(/Backup short/i));
    expect(knopf.textContent).not.toMatch(/Backup created/);
    expect(knopf.textContent).toMatch(/21,066/);
  });
});

describe("P4-09: Kopieren ohne Zwischenablage sagt es", () => {
  it("zeigt den Fehlschlag am Basis-URL-Knopf", async () => {
    const { container } = render(<Settings />);
    await waitFor(() => expect(container.textContent).toMatch(/AI & data/));
    fireEvent.click(screen.getByRole("button", { name: /MCP \/ API/i }));
    await waitFor(() => expect(container.textContent).toMatch(/Local server/));
    const knopf = container.querySelector('button[title="Copy"]') as HTMLButtonElement;
    expect(knopf, "der Basis-URL-Knopf fuehrt keinen Titel mehr").toBeTruthy();
    fireEvent.click(knopf);
    await waitFor(() => expect(container.querySelector('button[title="Copying failed — your clipboard was blocked"]')).toBeTruthy());
  });

  it("behauptet nirgends 'All nodes' fuer eine Seite von 100", async () => {
    const { container } = render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: /MCP \/ API/i }));
    await waitFor(() => expect(container.textContent).toMatch(/HTTP Endpoints/));
    expect(container.textContent, "GET /api/memories liefert eine Seite, nicht den Bestand").not.toMatch(/All nodes/);
    expect(container.textContent).toMatch(/alle=1/);
  });
});

describe("P4-10: der leere Bestand bekommt keine Erfolgszeile", () => {
  it("sagt 'nichts zu lesen', wenn keine Datei importiert wurde", async () => {
    stubFetch({ "/api/repair/imports": () => new Response(JSON.stringify({
      geprueft: 0, dateien: 0, aktualisiert: 0, entfernt: 0, erstellt: 0, clips: 0,
    }), { status: 200 }) });
    const { container } = render(<Settings />);
    await waitFor(() => expect(container.textContent).toMatch(/Re-read imported files/));
    fireEvent.click(screen.getByRole("button", { name: /Check imported files/ }));
    await waitFor(() => expect(container.textContent).toMatch(/No imported files in this store/));
    expect(container.textContent).not.toMatch(/everything reads fine/);
  });
});

// --- P4-12/13/14 (Leitungs-Brief 18.10. 14:45): die zwei zurueckgestellten Schlaege.
// Wieder: Fall ZUERST. Ohne den Flicken von `p4-e-flick-quittung-und-sonde.patch`muessen
// diese fuenf rot sein — der Baum ist dann gefleckt von P4-01..11 und P5.

describe("P4-12: Extraktionsmodell — Quittung nur nach bestaetigter Spiegelung", () => {
  it("malt keine Erfolgsmeldung, wenn beim Verlassen nichts geaendert wurde", async () => {
    const { container } = render(<Settings />);
    await waitFor(() => expect(container.textContent).toMatch(/Artificial intelligence/));
    fireEvent.click(screen.getByRole("checkbox", { name: "Auto-learn" }));
    const feld = (await waitFor(() => screen.getByPlaceholderText(/llama3\.2:3b/))) as HTMLInputElement;
    fireEvent.blur(feld);
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    expect(container.textContent, "ein Blur ohne Aenderung ist keine Speicherung").not.toMatch(/\bSaved\b/);
  });

  it("sagt die Abweisung der Spiegelung, statt 'Saved' zu malen", async () => {
    stubFetch({ "/api/settings": (u, init) => (init?.method === "PUT"
      ? new Response(JSON.stringify({ error: "Settings too large" }), { status: 413 })
      : new Response("{}", { status: 200 })) });
    const { container } = render(<Settings />);
    await waitFor(() => expect(container.textContent).toMatch(/Artificial intelligence/));
    fireEvent.click(screen.getByRole("checkbox", { name: "Auto-learn" }));
    const feld = (await waitFor(() => screen.getByPlaceholderText(/llama3\.2:3b/))) as HTMLInputElement;
    fireEvent.change(feld, { target: { value: "gemma3:4b" } });
    fireEvent.blur(feld);
    await waitFor(() => expect(container.querySelector('[data-extract-quittung="warn"]')).toBeTruthy());
    expect(container.textContent).toMatch(/Not saved/i);
  });

  it("meldet erst nach der Antwort, und dann an ihrem Platz", async () => {
    const { container } = render(<Settings />);
    await waitFor(() => expect(container.textContent).toMatch(/Artificial intelligence/));
    fireEvent.click(screen.getByRole("checkbox", { name: "Auto-learn" }));
    const feld = (await waitFor(() => screen.getByPlaceholderText(/llama3\.2:3b/))) as HTMLInputElement;
    fireEvent.change(feld, { target: { value: "gemma3:4b" } });
    fireEvent.blur(feld);
    await waitFor(() => expect(container.querySelector('[data-extract-quittung="ok"]'), "die ok-Quittung wurde nie gemalt").toBeTruthy());
    expect(container.querySelector('[data-extract-quittung="ok"]')?.textContent).toMatch(/Saved on this computer/);
  });
});

describe("P4-13: Auto-Poll — eine Liste, die niemand mehr befragt, steht nicht gruen", () => {
  it("meldet das Verstummen des Diensts, nachdem die Liste gefuellt war", async () => {
    vi.useFakeTimers();
    try {
      localStorage.setItem("aiVerbindung", JSON.stringify({
        providerId: "ollama", apiKey: "local", baseUrl: "http://localhost:11434/v1", model: "llama3.2",
      }));
      let sonde = 0;
      vi.stubGlobal("fetch", vi.fn(async (u: string) => {
        if (String(u).includes("/api/models")) {
          sonde++;
          return sonde === 1
            ? new Response(JSON.stringify({ models: ["llama3.2", "mistral"] }), { status: 200 })
            : new Response(JSON.stringify({ error: "connection refused" }), { status: 502 });
        }
        if (String(u).includes("/api/policies")) return new Response(JSON.stringify({ managed: false, policies: {} }), { status: 200 });
        if (String(u).includes("/api/health")) return new Response(JSON.stringify({ ok: true, count: 0 }), { status: 200 });
        return new Response("{}", { status: 200 });
      }));
      const { container } = render(<Settings />);
      await act(async () => { vi.advanceTimersByTime(0); });
      // Wortfrei gemessen: die datalist zeigt, dass die erste Sonde geantwortet hat —
      // der Fall darf nicht an meiner Formulierung haengen, nur an der Wirkung.
      const optionen = () => [...container.querySelectorAll("#model-list option")].map((o) => o.getAttribute("value"));
      expect(optionen(), "die erste Sonde fuellt die Liste").toContain("llama3.2");
      expect(container.querySelector('[data-sonde="weg"]'), "waehrend die Liste lebt, steht keine Absage").toBeNull();
      await act(async () => { vi.advanceTimersByTime(12_005); });
      expect(container.querySelector('[data-sonde="weg"]'), "die zweite Sonde verstummt — die Zeile muss das sagen").toBeTruthy();
      expect(optionen(), "die Liste bleibt, nur die Auskunft wechselt").toContain("llama3.2");
    } finally { vi.useRealTimers(); }
  });
});

describe("P4-14: die Richtlinien-Auskunft ueberlebt den Tod der Tuer nicht", () => {
  it("ersetzt 'No organization policies' durch Unwissen, wenn der Transport abbricht", async () => {
    let verstorben = false;
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      if (String(u).includes("/api/policies")) {
        if (verstorben) throw new TypeError("Failed to fetch");
        return new Response(JSON.stringify({ managed: false, policies: {} }), { status: 200 });
      }
      if (String(u).includes("/api/models")) return new Response(JSON.stringify({ models: [] }), { status: 200 });
      if (String(u).includes("/api/health")) return new Response(JSON.stringify({ ok: true, count: 0 }), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    const { container } = render(<Settings />);
    await waitFor(() => expect(container.textContent).toMatch(/No organization policies/));
    verstorben = true;
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(container.textContent).toMatch(/unknown/i));
    expect(container.textContent).not.toMatch(/No organization policies/);
  });
});

// P4-15 (Folgesitzung 18.10. 18:27, Punkt 4 Schlag 1): die Quittung der Extraktionszeile
// haelt zwei Faelle fuer einen. src/lib/ai.ts:401 wirft `HTTP <status>` nur, wenn eine
// Antwort da war; ein Fetch ohne Antwort wirft eine TypeError. Vor dem Flicken stand in
// beiden Faellen "refused it" — die Zeile beschuldigte eine Tuer, die gar nicht fragte.
// Dasselbe Wortpaar trennt Settings.tsx:257 und :269 fuer die Richtliniens-Auskunft schon.
describe("P4-15: Extraktionsquittung — 'antwortete nicht' ist nicht 'wies ab'", () => {
  it("sagt der Transportabbruch als Stille, nicht als Abweisung", async () => {
    stubFetch({ "/api/settings": (u, init) => {
      if (init?.method === "PUT") throw new TypeError("Failed to fetch");
      return new Response("{}", { status: 200 });
    } });
    const { container } = render(<Settings />);
    await waitFor(() => expect(container.textContent).toMatch(/Artificial intelligence/));
    fireEvent.click(screen.getByRole("checkbox", { name: "Auto-learn" }));
    const feld = (await waitFor(() => screen.getByPlaceholderText(/llama3\.2:3b/))) as HTMLInputElement;
    fireEvent.change(feld, { target: { value: "gemma3:4b" } });
    fireEvent.blur(feld);
    await waitFor(() => expect(container.querySelector('[data-extract-quittung="warn"]')).toBeTruthy());
    const zeile = container.querySelector('[data-extract-quittung="warn"]')?.textContent ?? "";
    expect(zeile, "eine Tuer, die nie antwortete, kann nichts abgewiesen haben").toMatch(/did not answer/i);
    expect(zeile, "Stille heisst Stille").not.toMatch(/refused/i);
  });

  // KONTROLLE, kein neuer Befund: dieser Fall ist vor DEM Flicken gruen (die Abweisungs-Zeile
  // bleibt Wort fuer Wort gleich). Er haelt die andere Richtung — ohne ihn koennte die
  // Heilung das Wort bloeg vertauschen. Er wirft, sobald "did not answer" auch den 413 erfindet.
  it("KONTROLLE: eine echte 413-Abweisung behaelt ihr Wort und ihren Status", async () => {
    stubFetch({ "/api/settings": (u, init) => (init?.method === "PUT"
      ? new Response(JSON.stringify({ error: "Settings too large" }), { status: 413 })
      : new Response("{}", { status: 200 })) });
    const { container } = render(<Settings />);
    await waitFor(() => expect(container.textContent).toMatch(/Artificial intelligence/));
    fireEvent.click(screen.getByRole("checkbox", { name: "Auto-learn" }));
    const feld = (await waitFor(() => screen.getByPlaceholderText(/llama3\.2:3b/))) as HTMLInputElement;
    fireEvent.change(feld, { target: { value: "gemma3:4b" } });
    fireEvent.blur(feld);
    await waitFor(() => expect(container.querySelector('[data-extract-quittung="warn"]')).toBeTruthy());
    const zeile = container.querySelector('[data-extract-quittung="warn"]')?.textContent ?? "";
    expect(zeile, "413 ist eine Abweisung und muss sie nennen").toMatch(/refused it \(HTTP 413\)/);
    expect(zeile, "413 ist keine stumme Tuer").not.toMatch(/did not answer/i);
  });
});
