// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MachineScan, formatBytes } from "../../src/components/MachineScan";
import { TRAEGER_LABELS } from "../../src/lib/graphHierarchy";

// Der Rechner-Scan ist die eingriffsstaerkste Funktion der Anwendung. Diese
// Tests halten fest, dass die Zustimmung nicht umgangen werden kann: ohne
// Vorschau und ohne BEIDE Haken bleibt der Knopf tot — und der Hinweis darauf,
// dass angeschlossene Agenten die Notizen lesen koennen, steht sichtbar da.

const VORSCHAU = {
  roots: ["/Users/a"],
  seen: 120,
  found: 12,
  truncated: false,
  skippedFolders: 4,
  skipped: [{ grund: "geheim", label: "Keys, passwords and credentials", anzahl: 6 }],
  byFolder: [{ ordner: "Dokumente", anzahl: 12 }],
  ordnerGesamt: 1,
  sample: [{ path: "/Users/a/Dokumente/Fristen.md", bytes: 3000 }],
  totalBytes: 42000,
};

function stubFetch(over: Record<string, unknown> = {}) {
  const aufrufe: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      aufrufe.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.includes("/api/scan/preview")) return new Response(JSON.stringify({ ...VORSCHAU, ...over }), { status: 200 });
      if (url.includes("/api/scan/start")) return new Response(JSON.stringify({ started: true }), { status: 200 });
      if (url.includes("/api/scan/status")) return new Response(JSON.stringify({ running: false, phase: "done", seen: 120, found: 12, imported: 12, skippedFolders: 4, truncated: false, error: null }), { status: 200 });
      return new Response("{}", { status: 200 });
    })
  );
  return aufrufe;
}

beforeEach(() => { stubFetch(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function oeffne(over: Partial<React.ComponentProps<typeof MachineScan>> = {}) {
  const onClose = vi.fn();
  const onImported = vi.fn();
  const view = render(<MachineScan open onClose={onClose} onImported={onImported} {...over} />);
  return { onClose, onImported, ...view };
}

describe("MachineScan: was der Nutzer VOR der Zustimmung sieht", () => {
  it("zeigt nichts, solange es geschlossen ist", () => {
    const { container } = render(<MachineScan open={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("nennt ungefragt, was niemals gelesen wird", () => {
    oeffne();
    expect(screen.getByText(/Never read — and you cannot switch this off/i)).toBeTruthy();
    expect(screen.getByText(/SSH and GPG keys/i)).toBeTruthy();
    expect(screen.getByText(/Browser profiles, cookies/i)).toBeTruthy();
  });

  it("sagt, dass angeschlossene Agenten die Notizen lesen koennen", () => {
    // Der Punkt, den man ohne Aufforderung sagen muss: lokal bleibt lokal, aber
    // ueber MCP liest jeder verbundene Assistent mit.
    oeffne();
    expect(screen.getByText(/every AI assistant you connect over MCP/i)).toBeTruthy();
  });

  it("beginnt ohne Vorschau und ohne Import", () => {
    oeffne();
    expect(screen.getByRole("button", { name: /Show me what would be imported/i })).toBeTruthy();
    expect(screen.getByText(/writes nothing/i)).toBeTruthy();
  });
});

describe("MachineScan: die Zustimmung laesst sich nicht umgehen", () => {
  it("haelt den Import-Knopf tot, bis beide Haken gesetzt sind", async () => {
    const user = userEvent.setup();
    oeffne();
    await user.click(screen.getByRole("button", { name: /Show me what would be imported/i }));
    const knopf = await screen.findByRole("button", { name: /Import 12 files/i });
    expect((knopf as HTMLButtonElement).disabled).toBe(true);

    const haken = screen.getAllByRole("checkbox");
    expect(haken).toHaveLength(2);
    await user.click(haken[0]);
    expect((screen.getByRole("button", { name: /Import 12 files/i }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(haken[1]);
    await waitFor(() => expect((screen.getByRole("button", { name: /Import 12 files/i }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("schickt erst nach beiden Haken ueberhaupt einen Start — und dann mit confirmed", async () => {
    const user = userEvent.setup();
    const aufrufe = stubFetch();
    oeffne();
    await user.click(screen.getByRole("button", { name: /Show me what would be imported/i }));
    await screen.findByRole("button", { name: /Import 12 files/i });
    expect(aufrufe.some((a) => a.url.includes("/start"))).toBe(false);

    for (const h of screen.getAllByRole("checkbox")) await user.click(h);
    await user.click(screen.getByRole("button", { name: /Import 12 files/i }));

    const start = aufrufe.find((a) => a.url.includes("/api/scan/start"));
    expect(start).toBeTruthy();
    expect((start!.body as { confirmed: boolean }).confirmed).toBe(true);
  });

  it("laesst nichts starten, wenn die Vorschau nichts gefunden hat", async () => {
    const user = userEvent.setup();
    vi.unstubAllGlobals();
    stubFetch({ found: 0, sample: [], byFolder: [] });
    oeffne();
    await user.click(screen.getByRole("button", { name: /Show me what would be imported/i }));
    for (const h of await screen.findAllByRole("checkbox")) await user.click(h);
    expect((screen.getByRole("button", { name: /Import 0 files/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("MachineScan: Vorschau und Abschluss", () => {
  it("zeigt Zahlen, Herkunft und Gruende der Auslassungen", async () => {
    const user = userEvent.setup();
    oeffne();
    await user.click(screen.getByRole("button", { name: /Show me what would be imported/i }));
    // P202, Mockup-Grammatik (s-scan): die Vorschau trägt die Ordner-Zeilen
    // („N files · TYPEN") und den Import-Knopf mit der Gesamt-Zahl — die drei
    // Statistik-Kästen flogen (41 kB und die 108 = gesehen − genommen mit ihnen).
    await waitFor(() => expect(screen.getAllByText(/12 files/).length).toBeGreaterThanOrEqual(1));
    expect(screen.getByRole("button", { name: /Import 12 files/i })).toBeTruthy();
    expect(screen.getAllByText(/Dokumente/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Keys, passwords and credentials/)).toBeTruthy();
  });

  it("unterscheidet die Dateien, die durchfielen, von den Ordnern, die nie betreten wurden", async () => {
    // Ein Ordner, den die Regel von vornherein nicht betritt, steht in keiner
    // Datei-Zaehlung. „0 left out" ueber vier weggelassenen Ordnern war die Zahl,
    // die im eigenen Bildbefund stand (1440 px, 14.10.). P202: die Diagnose-Zahl
    // (gesehen − genommen) flog mit den Statistik-Kästen — die Ordner-Auskunft
    // bleibt am Bild, der Zahlen-Unterschied lebt im Server-Response.
    const user = userEvent.setup();
    oeffne();
    await user.click(screen.getByRole("button", { name: /Show me what would be imported/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Import 12 files/i })).toBeTruthy());
    expect(screen.queryByText(/^left out$/)).toBeNull();
    expect(screen.getByText(/Left out — 4 folders not entered/i)).toBeTruthy();
  });

  it("sagt in der Fußzeile, was fehlt, statt einen toten Knopf zu zeigen", async () => {
    // Die beiden Haken stehen in der Liste — bei 1440×900 hinter der Faltkante.
    // Der Knopf unten ist dann grau, und der Mensch sieht keinen Grund.
    const user = userEvent.setup();
    oeffne();
    await user.click(screen.getByRole("button", { name: /Show me what would be imported/i }));
    await screen.findByRole("button", { name: /Import 12 files/i });
    expect(screen.getByText(/Tick the two points in the list to enable the import/i)).toBeTruthy();

    for (const h of screen.getAllByRole("checkbox")) await user.click(h);
    await waitFor(() => expect(screen.getByText(/Local only\. No cloud, no account/i)).toBeTruthy());
  });

  it("warnt, wenn mehr da ist als ein Durchlauf schafft", async () => {
    const user = userEvent.setup();
    vi.unstubAllGlobals();
    stubFetch({ truncated: true });
    oeffne();
    await user.click(screen.getByRole("button", { name: /Show me what would be imported/i }));
    await waitFor(() => expect(screen.getByText(/There is more than K3PTA imports in one pass/i)).toBeTruthy());
  });

  it("meldet den Abschluss zurueck", async () => {
    const user = userEvent.setup();
    const { onImported } = oeffne();
    await user.click(screen.getByRole("button", { name: /Show me what would be imported/i }));
    for (const h of await screen.findAllByRole("checkbox")) await user.click(h);
    await user.click(screen.getByRole("button", { name: /Import 12 files/i }));
    await waitFor(() => expect(onImported).toHaveBeenCalledWith(12), { timeout: 4000 });
    expect(screen.getByText(/Done — 12 notes added/i)).toBeTruthy();
  });

  it("nennt den Tag, unter dem alles wiederzufinden ist", async () => {
    const user = userEvent.setup();
    oeffne();
    await user.click(screen.getByRole("button", { name: /Show me what would be imported/i }));
    for (const h of await screen.findAllByRole("checkbox")) await user.click(h);
    await user.click(screen.getByRole("button", { name: /Import 12 files/i }));
    await waitFor(() => expect(screen.getByText(/machine-scan/)).toBeTruthy(), { timeout: 4000 });
  });

  it("zeigt einen Fehler, statt still zu scheitern", async () => {
    const user = userEvent.setup();
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Scan failed" }), { status: 500 })));
    oeffne();
    await user.click(screen.getByRole("button", { name: /Show me what would be imported/i }));
    await waitFor(() => expect(screen.getByText(/Scan failed/i)).toBeTruthy());
  });
});

describe("MachineScan: waehrend es laeuft", () => {
  /** Statusabfragen melden erst "laeuft", dann "abgebrochen". */
  function stubLaufend() {
    const aufrufe: string[] = [];
    let abgebrochen = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        aufrufe.push(url);
        if (url.includes("/api/scan/preview")) return new Response(JSON.stringify(VORSCHAU), { status: 200 });
        if (url.includes("/api/scan/start")) return new Response(JSON.stringify({ started: true }), { status: 200 });
        if (url.includes("/api/scan/cancel")) { abgebrochen = true; return new Response("{}", { status: 200 }); }
        return new Response(JSON.stringify({
          running: !abgebrochen, phase: abgebrochen ? "cancelled" : "import",
          seen: 60, found: 12, imported: abgebrochen ? 5 : 3, skippedFolders: 2, truncated: false, error: null,
        }), { status: 200 });
      })
    );
    return { aufrufe };
  }

  async function bisZumLauf(user: ReturnType<typeof userEvent.setup>) {
    oeffne();
    await user.click(screen.getByRole("button", { name: /Show me what would be imported/i }));
    for (const h of await screen.findAllByRole("checkbox")) await user.click(h);
    await user.click(screen.getByRole("button", { name: /Import 12 files/i }));
  }

  it("sperrt das Schliessen und bietet stattdessen Stoppen an", async () => {
    const user = userEvent.setup();
    vi.unstubAllGlobals();
    stubLaufend();
    await bisZumLauf(user);
    await waitFor(() => expect(screen.getByRole("button", { name: /^Stop$/i })).toBeTruthy());
    expect((screen.getByRole("button", { name: /^Close$/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/You can stop this at any time/i)).toBeTruthy();
  });

  it("stoppt auf Knopfdruck und behaelt, was schon geschrieben wurde", async () => {
    const user = userEvent.setup();
    vi.unstubAllGlobals();
    const { aufrufe } = stubLaufend();
    await bisZumLauf(user);
    await waitFor(() => expect(screen.getByRole("button", { name: /^Stop$/i })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: /^Stop$/i }));
    expect(aufrufe.some((u) => u.includes("/api/scan/cancel"))).toBe(true);
    await waitFor(() => expect(screen.getByText(/Stopped — 5 notes were already written and are kept/i)).toBeTruthy(), { timeout: 4000 });
  });
});

describe("MachineScan: schliessen", () => {
  it("schliesst mit Escape und ueber den Knopf", async () => {
    const user = userEvent.setup();
    const { onClose } = oeffne();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: /^Not now$/i }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("formatBytes", () => {
  it("rechnet in lesbare Groessen um", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 kB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("Die Maske wird gesagt, nicht still geschwiegen (#76)", () => {
  it("meldet, wie viele Schluesselstellen der Lauf verdeckt hat", async () => {
    // #76: eine Maske, ueber die nichts gesagt wird, ist eine stille Aenderung
    // am Text des Nutzers. Die Zahl steht auf dem Schirm — und nur dort, wo sie
    // etwas bedeutet: der Status nach dem Lauf.
    const user = userEvent.setup();
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/api/scan/preview")) return new Response(JSON.stringify(VORSCHAU), { status: 200 });
      if (String(url).includes("/api/scan/status")) return new Response(JSON.stringify({ running: false, phase: "done", seen: 120, found: 12, imported: 12, masked: 3, skippedFolders: 4, truncated: false, error: null }), { status: 200 });
      return new Response(JSON.stringify({ started: true }), { status: 200 });
    }));
    oeffne();
    await user.click(screen.getByRole("button", { name: /Show me what would be imported/i }));
    for (const h of await screen.findAllByRole("checkbox")) await user.click(h);
    await user.click(screen.getByRole("button", { name: /Import 12 files/i }));
    const zeile = await screen.findByTestId("maskiert-meldung");
    expect(zeile.textContent).toMatch(/3 key-shaped values were masked/);
    expect(zeile.textContent).toMatch(/sk-…MASKIERT\(43\)/);
  });

  it("zeigt die Maske nicht, wenn der Lauf nichts verdeckt hat", async () => {
    const user = userEvent.setup();
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/api/scan/preview")) return new Response(JSON.stringify(VORSCHAU), { status: 200 });
      if (String(url).includes("/api/scan/status")) return new Response(JSON.stringify({ running: false, phase: "done", seen: 120, found: 12, imported: 12, masked: 0, skippedFolders: 4, truncated: false, error: null }), { status: 200 });
      return new Response(JSON.stringify({ started: true }), { status: 200 });
    }));
    oeffne();
    await user.click(screen.getByRole("button", { name: /Show me what would be imported/i }));
    for (const h of await screen.findAllByRole("checkbox")) await user.click(h);
    await user.click(screen.getByRole("button", { name: /Import 12 files/i }));
    await waitFor(() => expect(screen.getByText(/Done — 12 notes added/i)).toBeTruthy(), { timeout: 4000 });
    expect(screen.queryByTestId("maskiert-meldung")).toBeNull();
  });
});

describe("Der Nutzer bestimmt, was und von wo gelesen wird", () => {
  // Die Forderung dahinter: "möchte ich auch explizit, dass man bei K3PTA
  // einstellen kann was genau und von wo genau er wissen herausziehen kann und
  // darf. Dies muss auch klar deklariert werden."
  const regelwerk = {
    niemals: { ordner: [".ssh", "keychains"], dateimuster: ["^\\.env$", "\\.pem$"], erklaerung: "Keys are never read." },
    uebersprungen: { ordner: ["node_modules", ".git"], erklaerung: "Build folders hold no knowledge." },
    lesbar: { endungen: [".md", ".txt", ".pdf"], erklaerung: "Only these yield text." },
    grenzen: { maxDateiBytes: 2_000_000, maxDateien: 20_000, maxTiefe: 12 },
    ihreEinstellung: { wurzeln: ["/home/x"], endungen: [".md", ".txt", ".pdf"], maxDateiBytes: 2_000_000, zusaetzlichAusgelassen: [] },
  };

  function mitRegelwerk(gesendet: { url: string; body: unknown }[]) {
    vi.stubGlobal("fetch", vi.fn(async (url: string, o?: RequestInit) => {
      if (String(url).includes("/api/scan/policy")) {
        return new Response(JSON.stringify(regelwerk), { status: 200 });
      }
      if (String(url).includes("/api/scan/config")) {
        gesendet.push({ url: String(url), body: o?.body ? JSON.parse(String(o.body)) : null });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ running: false, phase: "idle" }), { status: 200 });
    }));
  }

  it("zeigt die geltenden Regeln — auch die, die sich nicht abschalten lassen", async () => {
    const user = userEvent.setup();
    mitRegelwerk([]);
    render(<MachineScan open onClose={() => {}} />);
    await screen.findByText(/What K3PTA may read/i);

    await user.click(screen.getByRole("button", { name: /Show the full rules/i }));
    expect(screen.getByText(/The exact list that is never read/i)).toBeTruthy();
    expect(screen.getAllByText(/\.ssh/).length).toBeGreaterThan(0);
    expect(screen.getByText(/2 file patterns/i)).toBeTruthy();
    expect(screen.getAllByText(/node_modules/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Reading from:/i).textContent).toContain("/home/x");
  });

  it("merkt sich, welche Dateiarten abgewaehlt wurden", async () => {
    const user = userEvent.setup();
    const gesendet: { url: string; body: unknown }[] = [];
    mitRegelwerk(gesendet);
    render(<MachineScan open onClose={() => {}} />);
    await screen.findByText(/What K3PTA may read/i);

    await user.click(screen.getByRole("button", { name: ".pdf" }));
    await waitFor(() => expect(gesendet.length).toBeGreaterThan(0));
    const geschickt = gesendet[gesendet.length - 1].body as { endungen: string[] };
    expect(geschickt.endungen).not.toContain(".pdf");
    expect(geschickt.endungen).toContain(".md");
  });

  it("bleibt stehen, wenn die Regeln nicht zu holen sind", async () => {
    // Eine unerwartete Antwort darf den Dialog nicht leeren — beim Testen hat
    // genau das einmal den ganzen Baum abgeraeumt.
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    render(<MachineScan open onClose={() => {}} />);
    expect(await screen.findByText(/What you should know before you agree/i)).toBeTruthy();
  });
});

describe("Die Vorschau darf wirken, nicht nur informieren (#73)", () => {
  // Bis hierhin war die Herkunftsliste eine Auskunft: wer sah, dass ein
  // Kunden-Shop-Theme die Haelfte fuellt, musste den Dialog schliessen und drei
  // Worte in ein Regelfeld tippen. Auf einem echten Heim sind 17 oberste Ordner
  // (gemessen 14.10.), die Liste zeigt zwanzig — und was nicht da steht, war
  // auch nicht wegzulassen.
  function mitZaehler(zusatz: Record<string, unknown> = {}) {
    const gesendet: { url: string; body: unknown }[] = [];
    let vorschauZaehler = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, o?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/scan/preview")) {
        vorschauZaehler++;
        return new Response(JSON.stringify({ ...VORSCHAU, ...zusatz, found: vorschauZaehler === 1 ? 12 : 3 }), { status: 200 });
      }
      if (u.includes("/api/scan/config")) {
        gesendet.push({ url: u, body: o?.body ? JSON.parse(String(o.body)) : null });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    }));
    return { gesendet, vorschau: () => vorschauZaehler };
  }

  it("laesst einen Ordner per Klick weg und sieht danach eine kleinere Zahl", async () => {
    const user = userEvent.setup();
    const { gesendet, vorschau } = mitZaehler();
    render(<MachineScan open onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: /Show me what would be imported/i }));
    await user.click(await screen.findByRole("button", { name: /Leave Dokumente out of the scan/i }));

    await waitFor(() => expect(gesendet.length).toBeGreaterThan(0));
    const body = gesendet[0].body as { zusaetzlichAusgelassen: string[] };
    expect(body.zusaetzlichAusgelassen).toEqual(["Dokumente"]);
    await waitFor(() => expect(vorschau()).toBe(2), { timeout: 4000 });
    // Die neue Zahl ist die Antwort, nicht die alte: 12 -> 3.
    await waitFor(() => expect(screen.getByRole("button", { name: /Import 3 files/i })).toBeTruthy(), { timeout: 4000 });
  });

  it("zeigt, dass die Liste nicht alles ist", async () => {
    const user = userEvent.setup();
    vi.unstubAllGlobals();
    mitZaehler({ ordnerGesamt: 17 });
    render(<MachineScan open onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: /Show me what would be imported/i }));
    await waitFor(() => expect(screen.getByText(/1 of 17 folders shown/i)).toBeTruthy());
  });

  it("nimmt einen eigenen Ausschluss zurueck, ohne das Regelfeld zu suchen", async () => {
    const user = userEvent.setup();
    const { gesendet } = mitZaehler();
    // Der Nutzer hat "angelshop" schon ausgeschlossen; die Fläche zeigt ihn und
    // laesst ihn wieder fallen.
    render(<MachineScan open onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: /Show me what would be imported/i }));
    await screen.findByRole("button", { name: /Leave Dokumente out of the scan/i });
    await user.click(screen.getByRole("button", { name: /Leave Dokumente out of the scan/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Include Dokumente again/i })).toBeTruthy());
    // Der sichtbare Name bleibt der Ordner, der Zug ist die Erklaerung.
    expect(screen.getByRole("button", { name: /Include Dokumente again/i }).textContent).toBe("Dokumente ×");
    await user.click(screen.getByRole("button", { name: /Include Dokumente again/i }));
    const letzte = gesendet[gesendet.length - 1].body as { zusaetzlichAusgelassen: string[] };
    expect(letzte.zusaetzlichAusgelassen).toEqual([]);
  });

  it("macht aus einem Korb ohne Ordner keinen wirkungslosen Knopf", async () => {
    const user = userEvent.setup();
    vi.unstubAllGlobals();
    mitZaehler({ byFolder: [{ ordner: "(top level)", anzahl: 4 }] });
    render(<MachineScan open onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: /Show me what would be imported/i }));
    await screen.findByTestId("vorschau-ordner-ohne-wirkung");
    expect(screen.queryByRole("button", { name: /Leave \(top level\) out/i })).toBeNull();
  });
});

describe("Der Erststart nimmt ihr die erste Frage ab (#73)", () => {
  // Hat jemand im Assistenten "ja, sieh den Rechner durch" angekreuzt, oeffnet
  // die App diesen Dialog von selbst — mit autoPreview. Dann darf er nicht auf
  // einen Knopf warten: die Frage war schon beantwortet, was jetzt fehlt, sind
  // Zahlen. Ohne diesen Fall oeffnet sich der Dialog, zeigt einen Knopf und
  // niemand drueckt ihn.
  it("holt die Vorschau selbst, ohne dass jemand klicken muss", async () => {
    const aufrufe: string[] = [];
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      aufrufe.push(String(url));
      if (String(url).includes("/api/scan/preview")) return new Response(JSON.stringify(VORSCHAU), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    render(<MachineScan open onClose={() => {}} autoPreview />);
    await waitFor(() => expect(aufrufe.some((u) => u.includes("/api/scan/preview"))).toBe(true), { timeout: 4000 });
    await waitFor(() => expect(screen.getByRole("button", { name: /Import 12 files/i })).toBeTruthy(), { timeout: 4000 });
    expect(screen.queryByRole("button", { name: /Show me what would be imported/i })).toBeNull();
  });

  it("eroeffnet die Zahlen nicht zweimal, wenn der Schirm zweimal malt", async () => {
    const aufrufe: string[] = [];
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      aufrufe.push(String(url));
      if (String(url).includes("/api/scan/preview")) return new Response(JSON.stringify(VORSCHAU), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    const { rerender } = render(<MachineScan open onClose={() => {}} autoPreview />);
    await waitFor(() => expect(aufrufe.filter((u) => u.includes("/api/scan/preview"))).toHaveLength(1), { timeout: 4000 });
    rerender(<MachineScan open onClose={() => {}} autoPreview />);
    rerender(<MachineScan open onClose={() => {}} autoPreview />);
    await new Promise((r) => setTimeout(r, 120));
    expect(aufrufe.filter((u) => u.includes("/api/scan/preview")).length, "ein Heimlauf pro Malen, nicht einer pro Rendern").toBe(1);
  });
});

describe("Eine Teilantwort wirft den Scan-Dialog nicht raus", () => {
  // Die Fläche liest vorschau.byFolder.length und vorschau.skipped.map(...).
  // Antwortet /api/scan/preview ohne diese Felder, stand bisher ein leerer
  // Bildschirm da — React hatte den Dialog nach dem Fehler ausgehängt.
  it("hält durch, wenn die Vorschau nur Zahlen trägt", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/api/scan/preview")) return new Response(JSON.stringify({ seen: 120, found: 12 }), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    const { container } = render(<MachineScan open onClose={() => {}} onImported={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: /Show me what would be imported/i }));
    await waitFor(() => expect(container.textContent).toMatch(/12/));
    expect(container.textContent, "Der Dialog ist von der Seite verschwunden").not.toBe("");
    expect(container.textContent).not.toMatch(/Cannot read/);
  });
});
