// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PraxisSync from "../../src/components/PraxisSync";

// Praxis-Sync ist der Teil, mit dem eine Kanzlei Mandantendaten zwischen
// Geraeten bewegt. Zwei Dinge muessen hier stimmen und werden hier festgehalten:
// die Passphrase darf nirgends liegen bleiben, und eine zu kurze darf gar nicht
// erst durchgehen.

const JOURNAL = {
  entries: [
    { seq: 1, at: "2026-09-01T10:00:00.000Z", direction: "export", peer: "mac", scope: "kanzlei", count: 12, payloadHash: "abcdef0123456789", hash: "h1" },
    { seq: 2, at: "2026-09-02T10:00:00.000Z", direction: "import", peer: "mac", scope: "kanzlei", count: 12, payloadHash: "0123456789abcdef", hash: "h2" },
  ],
  intact: true,
};

let aufrufe: { url: string; body: unknown }[];

function stubFetch(over: { journal?: unknown; exportOk?: boolean; exportBody?: unknown; importOk?: boolean; importBody?: unknown } = {}) {
  aufrufe = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    aufrufe.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.includes("/api/sync/journal")) return new Response(JSON.stringify(over.journal ?? JOURNAL), { status: 200 });
    if (url.includes("/api/sync/export")) {
      return new Response(JSON.stringify(over.exportBody ?? { bundle: { count: 12, scope: "kanzlei" } }), { status: over.exportOk === false ? 400 : 200 });
    }
    if (url.includes("/api/sync/import")) {
      return new Response(JSON.stringify(over.importBody ?? { imported: 9 }), { status: over.importOk === false ? 400 : 200 });
    }
    return new Response("{}", { status: 200 });
  }));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  stubFetch();
  // jsdom kennt File.prototype.text nicht — nachruesten, sonst prueft man die
  // Umgebung statt der Komponente.
  if (!File.prototype.text) {
    Object.defineProperty(File.prototype, "text", {
      value(this: File) {
        return new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result));
          r.onerror = () => rej(r.error);
          r.readAsText(this);
        });
      },
      configurable: true,
    });
  }
  Object.defineProperty(URL, "createObjectURL", { value: vi.fn(() => "blob:x"), configurable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const GUT = "einesehrlangepassphrase";

describe("PraxisSync: die Passphrase", () => {
  it("sperrt beide Knoepfe, solange sie fehlt", () => {
    render(<PraxisSync />);
    expect((screen.getByRole("button", { name: /Create bundle/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Read bundle/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("sagt, wie viele Zeichen noch fehlen", async () => {
    const user = userEvent.setup();
    render(<PraxisSync />);
    await user.type(screen.getByLabelText(/Passphrase/i), "kurz");
    expect(screen.getByText(/8 more/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Create bundle/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("gibt die Knoepfe erst ab der Mindestlaenge frei", async () => {
    const user = userEvent.setup();
    render(<PraxisSync />);
    await user.type(screen.getByLabelText(/Passphrase/i), GUT);
    await waitFor(() => expect((screen.getByRole("button", { name: /Create bundle/i }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("wird nirgends gespeichert — nicht im Browser, nicht im Formular-Autofill", async () => {
    const user = userEvent.setup();
    render(<PraxisSync />);
    const feld = screen.getByLabelText(/Passphrase/i) as HTMLInputElement;
    await user.type(feld, GUT);
    expect(feld.type).toBe("password");
    expect(feld.autocomplete).toBe("off");
    expect(JSON.stringify(localStorage)).not.toContain(GUT);
    expect(JSON.stringify(sessionStorage)).not.toContain(GUT);
  });

  it("sagt ausdruecklich, dass sie nirgends liegt", () => {
    render(<PraxisSync />);
    expect(screen.getByText(/Stored nowhere/i)).toBeTruthy();
    expect(screen.getByText(/not even by you/i)).toBeTruthy();
  });
});

describe("PraxisSync: Paket erzeugen", () => {
  it("schickt Passphrase und Bereich und meldet die Anzahl", async () => {
    const user = userEvent.setup();
    render(<PraxisSync />);
    await user.type(screen.getByLabelText(/Passphrase/i), GUT);
    await user.clear(screen.getByLabelText(/Scope/i));
    await user.type(screen.getByLabelText(/Scope/i), "kanzlei");
    await user.click(screen.getByRole("button", { name: /Create bundle/i }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/12 notes encrypted/));
    const ex = aufrufe.find((a) => a.url.includes("/api/sync/export"));
    expect(ex?.body).toMatchObject({ passphrase: GUT, scope: "kanzlei" });
  });

  it("meldet einen Fehler des Servers im Klartext", async () => {
    const user = userEvent.setup();
    stubFetch({ exportOk: false, exportBody: { error: "Passphrase too short" } });
    render(<PraxisSync />);
    await user.type(screen.getByLabelText(/Passphrase/i), GUT);
    await user.click(screen.getByRole("button", { name: /Create bundle/i }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Passphrase too short/));
  });

  it("laedt den Mitschnitt nach einem Export neu", async () => {
    const user = userEvent.setup();
    render(<PraxisSync />);
    await waitFor(() => expect(aufrufe.filter((a) => a.url.includes("journal"))).toHaveLength(1));
    await user.type(screen.getByLabelText(/Passphrase/i), GUT);
    await user.click(screen.getByRole("button", { name: /Create bundle/i }));
    await waitFor(() => expect(aufrufe.filter((a) => a.url.includes("journal")).length).toBeGreaterThan(1));
  });
});

describe("PraxisSync: Paket einlesen", () => {
  async function waehleDatei(inhalt: string, name = "bundle.json") {
    const eingabe = document.querySelector('input[type="file"]') as HTMLInputElement;
    const datei = new File([inhalt], name, { type: "application/json" });
    Object.defineProperty(eingabe, "files", { value: [datei], configurable: true });
    eingabe.dispatchEvent(new Event("change", { bubbles: true }));
  }

  it("weist eine Datei zurueck, die kein JSON ist — mit einer verstaendlichen Begruendung", async () => {
    const user = userEvent.setup();
    render(<PraxisSync />);
    await user.type(screen.getByLabelText(/Passphrase/i), GUT);
    await waehleDatei("das ist kein json");
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/not valid JSON/i));
  });

  it("schickt ein gueltiges Paket an den Server", async () => {
    const user = userEvent.setup();
    render(<PraxisSync />);
    await user.type(screen.getByLabelText(/Passphrase/i), GUT);
    await waehleDatei(JSON.stringify({ v: 1, scope: "kanzlei", count: 3, payload: "x" }));
    await waitFor(() => expect(aufrufe.some((a) => a.url.includes("/api/sync/import"))).toBe(true));
  });

  it("meldet ein eingelesenes Paket auf Englisch — die Meldung war noch deutsch", async () => {
    const user = userEvent.setup();
    stubFetch({ importBody: { imported: 9, skipped: 2 } });
    render(<PraxisSync />);
    await user.type(screen.getByLabelText(/Passphrase/i), GUT);
    await waehleDatei(JSON.stringify({ v: 1 }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("9 imported, 2 already there."));
  });

  it("meldet eine falsche Passphrase als Fehler statt als Erfolg", async () => {
    const user = userEvent.setup();
    stubFetch({ importOk: false, importBody: { error: "Wrong passphrase or damaged bundle" } });
    render(<PraxisSync />);
    await user.type(screen.getByLabelText(/Passphrase/i), GUT);
    await waehleDatei(JSON.stringify({ v: 1 }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Wrong passphrase/i));
  });
});

describe("PraxisSync: Mitschnitt", () => {
  it("zeigt die Vorgaenge mit Richtung, Anzahl und Bereich", async () => {
    render(<PraxisSync />);
    await waitFor(() => expect(screen.getByText("#2")).toBeTruthy());
    expect(screen.getAllByText(/12 notes/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("kanzlei").length).toBeGreaterThan(0);
  });

  it("meldet eine unversehrte Kette", async () => {
    render(<PraxisSync />);
    await waitFor(() => expect(screen.getByText(/Chain intact/i)).toBeTruthy());
  });

  it("meldet eine gebrochene Kette deutlich", async () => {
    stubFetch({ journal: { ...JOURNAL, intact: false } });
    render(<PraxisSync />);
    await waitFor(() => expect(screen.getByText(/Chain broken/i)).toBeTruthy());
  });

  it("sagt es, wenn noch nichts aufgezeichnet wurde", async () => {
    stubFetch({ journal: { entries: [], intact: true } });
    render(<PraxisSync />);
    await waitFor(() => expect(screen.getByText(/Nothing recorded yet/i)).toBeTruthy());
  });

  it("blockiert nicht, wenn der Mitschnitt nicht erreichbar ist", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("weg"); }));
    render(<PraxisSync />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Create bundle/i })).toBeTruthy());
  });
});

describe("PraxisSync: Sprache", () => {
  it("spricht Englisch wie der Rest der Anwendung", async () => {
    // Der Reiter war komplett auf Deutsch, mit "ae/oe/ue" statt Umlauten —
    // in einer sonst durchgehend englischen Oberflaeche.
    const { container } = render(<PraxisSync />);
    await waitFor(() => expect(screen.getByText(/Chain intact/i)).toBeTruthy());
    const text = container.textContent ?? "";
    for (const deutsch of ["Eintraege", "fehlgeschlagen", "Paket erzeugen", "Verschluesselter", "Mandantentrennung", "Kette unversehrt", "Praxis"]) {
      expect(text, `Oberflaeche zeigt noch: ${deutsch}`).not.toContain(deutsch);
    }
    expect(text).toMatch(/Device Sync/);
    expect(text).toMatch(/Encrypted exchange between your own devices/);
  });
});
