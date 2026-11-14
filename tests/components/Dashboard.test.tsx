// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dashboard } from "../../src/components/Dashboard";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import { ToastProvider } from "../../src/components/ui/Toast";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger } from "../helfer/canvas";
import { schreibeSuchPrefs } from "../../src/lib/searchPrefs";
import { TRAEGER_REIHENFOLGE } from "../../src/lib/graphHierarchy";
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
    // #77 — die Zahl-Route: der Laden, ueber den die Flaeche zaehlt.
    if (url.includes("/api/memories/gruppen")) {
      return new Response(JSON.stringify({
        ok: true, bestand: 150,
        traeger: { notes: 100, files: 30, code: 20 },
        themen: { people: 5, projects: 9, events: 3, tasks: 1, guides: 2, links: 4 },
        ohneThema: 120, ms: 2,
      }), { status: 200 });
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
    // Geholt wird der leere Zustand DER LISTE, nicht irgendein Text im Rahmen: die
    // Graph-Flaeche sagt seit je "No notes yet. Write one - its [[wiki links]] ..." und
    // ein waitFor ueber container.textContent erwacht an DEM Wort, ehe die Liste ueberhaupt
    // geladen hat. Genau so ist der Fall am 2.11. umgefallen, nachdem die Liste dasselbe
    // Wort bekam: nicht die Flaeche war kaputt, sondern die Sonde fragte den ganzen Rahmen.
    const feld = await waitFor(() => {
      const e = container.querySelector('[data-testid="leerer-zustand"]');
      if (!e) throw new Error("der leere Zustand der Liste ist nicht gemalt");
      return e;
    });
    expect(feld.textContent).toMatch(/No notes yet/i);
    expect(feld.textContent).toMatch(/Drop files here/i);
  });

  it("zeigt die Navigation auch ohne Wissen", async () => {
    await zeige([]);
    for (const label of ["Knowledge", "Chat", "Graph", "Settings"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${label}$`) })).toBeTruthy();
    }
  });
});

describe("Dashboard: nichts ist gesperrt", () => {
  // Die App hat seit 09.10.2026 kein Schlüssel-System und keine Grenzen. Der
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
    // „encrypted" ist ein gemessener Zustand und gehört nicht in die Marke —
    // dieselbe Instanz trug im selben Fenster den Chip „Not encrypted"
    // (10.10., leerer Datenordner, KEPTA_ENCRYPTION=off).
    expect(screen.getByText(/^local · private$/)).toBeTruthy();
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
    expect(container.textContent).toMatch(/2 of 2/);
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
    // P202, Mockup-Grammatik: der Karten-Kopf mit dem Untertitel flog — der Griff
    // ist der Titel des Panels („System status"), der immer dort steht.
    await waitFor(() => expect(container.textContent).toMatch(/System status/));
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
    await user.type(screen.getByPlaceholderText(/Search/), "docker");
    await waitFor(() => expect(container.textContent).not.toMatch(/Kochen/), { timeout: 3000 });
  });

  it("der Ergebnisregler laeuft ueber genau die sieben Stufen, die README.md:128 nennt", async () => {
    // Vorher war hier die einzige Behauptung am Regler: `Number(regler.max) > 0`. Die prueft,
    // dass es einen Regler gibt — nicht, welche Stufen er hat. README.md:128 nennt sieben Zahlen,
    // und diese sieben sind das Versprechen, also wird hier jede Position gefahren und ihr
    // Etikett gelesen. Der Fall kann verlieren: eine Stufe aus `RESULT_STOPS` genommen, und die
    // letzte Position zeigt nicht mehr "All" (Biss im Feldzug-Papier zu P141).
    const { container } = await zeige([note()]);
    const regler = container.querySelector('input[aria-label="Number of results shown"]') as HTMLInputElement;
    expect(regler).not.toBeNull();
    // P202, Mockup-Fuß: das Etikett ist die Zahl im Wort „Meaning search <b>5</b>"; der Regler selbst steht verdeckt in der Verwahrung.
    const etikett = () => regler.closest(".listen-fuss")?.querySelector("label b")?.textContent?.trim();
    expect(Number(regler.min)).toBe(0);
    expect(Number(regler.max)).toBe(6); // sieben Positionen, Schrittweite 1
    expect(Number(regler.step)).toBe(1);

    const erwartet = ["5", "10", "20", "50", "100", "250", "All"];
    for (let position = 0; position <= 6; position++) {
      await act(async () => {
        fireEvent.change(regler, { target: { value: String(position) } });
      });
      expect(etikett(), `Position ${position} zeigt ein andres Etikett als versprochen`).toBe(erwartet[position]);
    }
    // Rueckweg: die erste Position wieder greifbar, sonst haette die letzte Stufe die Liste gefressen.
    await act(async () => {
      fireEvent.change(regler, { target: { value: "0" } });
    });
    expect(etikett()).toBe("5");
  });

  it("der Such-Streifen nennt beide Zahlen: was gezeigt wird und was die Tuer zaehlte", async () => {
    const user = userEvent.setup();
    // Die Tuer schickt drei Treffer und sagt, dass es insgesamt sieben waren. Der Streifen darf
    // nicht die eine Zahl fuer zwei Dinge fuehren (Punkt 4: dort stand "16 hits" ueber einer
    // Liste mit 261 Zeilen), also nennt er beide — und die erste muss die Zahl der Karten sein.
    const drei = [note({ title: "Docker" }), note({ title: "Kochdocker" }), note({ title: "Dockerausbau" })];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/search")) {
        return new Response(JSON.stringify({
          results: drei.map((m, i) => ({
            memory: m, score: 0.9 - i * 0.1, cosineScore: 0.8 - i * 0.1, bm25Score: 1, rawBm25: 1,
            matchedTerms: ["docker"],
          })),
          total: 7,
        }), { status: 200 });
      }
      if (url.includes("/api/memor")) return new Response(JSON.stringify(drei), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    const { container } = await zeige(drei);
    await user.type(screen.getByPlaceholderText(/Search/), "docker");

    const streifen = await waitFor(() => {
      const e = [...container.querySelectorAll(".chip")].find((c) => /of 7 hits/.test(c.textContent ?? ""));
      if (!e) throw new Error("der Streifen nennt die Zahl der Tuer nicht");
      return e as HTMLElement;
    }, { timeout: 4000 });
    expect(streifen.textContent).toMatch(/3 of 7 hits/);
    // Die erste Zahl ist keine zweite Behauptung: sie zaehlt dieselben Karten, die darunter stehen.
    expect(container.textContent).toMatch(/Docker/);
    expect(container.textContent).toMatch(/Dockerausbau/);
  });
});

describe("Dashboard: Duplikate", () => {
  it("meldet 'No duplicates', wenn nichts doppelt ist — kein Wort, das nach Befehl klingt", async () => {
    const { container } = await zeige([note({ title: "A" }), note({ title: "B" })]);
    await waitFor(() => expect(container.textContent).toMatch(/No duplicates/));
  });

  it("zaehlt Duplikate und oeffnet die Pruefansicht", async () => {
    const user = userEvent.setup();
    const { container } = await zeige([note({ title: "Gleich" }), note({ title: "Gleich" })]);
    await waitFor(() => expect(container.textContent).toMatch(/1 duplicate/));
    await user.click(screen.getByRole("button", { name: /duplicates/i }));
    await waitFor(() => expect(document.querySelector('[role="dialog"][aria-label="Duplicates"]')).not.toBeNull());
    // Aus dem Panel heraus: eine Kopie in den Papierkorb legen (Dashboard-
    // Callback onDelete -> derselbe Papierkorb-Fluss wie beim Löschen).
    // P202, Mockup-Grammatik: die Kopie ist eine app-zeile (role="button"),
    // kein Icon-Knopf mehr.
    const imPanel = [...document.querySelectorAll('[role="dialog"][aria-label="Duplicates"]')][0];
    const loeschen = [...imPanel.querySelectorAll('[role="button"]')].find((b) => b.getAttribute("aria-label")?.startsWith("Delete "));
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
    await waitFor(() => expect(document.body.textContent).toMatch(/Type of this note|Fact/));
  });

  it("loescht eine Notiz und bietet das Rueckgaengigmachen an", async () => {
    const user = userEvent.setup();
    const { container } = await zeige([note({ title: "Weg damit" })]);
    await waitFor(() => expect(container.textContent).toMatch(/Weg damit/));
    // Karte klicken -> Vorschau; von dort per „Edit“ in den Editor.
    await user.click(screen.getAllByText("Weg damit")[0]);
    await waitFor(() => expect(document.querySelector('[data-testid="memory-preview"]')).toBeTruthy());
    await user.click(screen.getByRole("button", { name: /Edit/i }));
    await waitFor(() => expect(document.body.textContent).toMatch(/Type of this note|Fact/));
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
  it.skip("blendet die Seitenleiste aus und wieder ein (P202: der Fuß trägt die zwei Mockup-Ikons)", async () => {
    const user = userEvent.setup();
    const { container } = await zeige([note()]);
    const leiste = () => container.querySelector(".sidebar-glass");
    expect(leiste()?.className).toMatch(/w-64/);
    await user.click(document.querySelector('[aria-label="Focus mode"]') ?? document.body);
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
    await waitFor(() => expect(container.textContent).toMatch(/70 of 70/));
    expect(container.textContent).toMatch(/Load more/);
    await user.click(screen.getByRole("button", { name: /Load more/i }));
    await waitFor(() => expect(container.textContent).not.toMatch(/Load more/));
  });
});

describe("Dashboard: Befehlspalette", () => {
  it("oeffnet sich per ⌘K (P202: der Listen-Kopf trägt die drei Mockup-Werkzeuge)", async () => {
    await zeige([note()]);
    // Der Zugang ist die Tastatur (⌘K, wie die Leiste es nennt) — kein Kopf-Knopf mehr.
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
    });
    await waitFor(() => expect(document.body.textContent).toMatch(/New note|Search|Switch/i));
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
    await user.type(screen.getByPlaceholderText(/Search/), "docker");
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
    await user.type(screen.getByPlaceholderText(/Search/), "docker");
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
    // P202, Mockup-Wortlaut (k3pta-app-fenster): die Statuszeile nennt Bestand und
    // tags und die Embeddings; die Version und die Verschlüsselung wohnten in den
    // Systemstatus (Settings) — der Systemstatus-Test hält sie dort.
    await waitFor(() => expect(status?.textContent).toMatch(/42 notes, /), { timeout: 3000 });
    expect(status!.textContent).toMatch(/Embeddings: 8 of 10 ready/);
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
    await waitFor(() => expect(chip?.textContent).toMatch(/74 notes, /), { timeout: 3000 });

    zaehler = 75;
    await act(async () => {
      quellen[0]!.onmessage?.({ data: JSON.stringify({ type: "save", source: "agent", ts: Date.now() }) } as unknown as MessageEvent);
      await new Promise((r) => setTimeout(r, 30));
    });
    await waitFor(() => expect(chip?.textContent).toMatch(/75 notes, /), { timeout: 3000 });
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
    await waitFor(() => expect(container.textContent).toMatch(/notes in the search index|of 1 notes/));
  });

  it("oeffnet den Editor mit Befehlstaste und N", async () => {
    const user = userEvent.setup();
    await zeige([]);
    await user.keyboard("{Meta>}n{/Meta}");
    await waitFor(() => expect(document.body.textContent).toMatch(/Type of this note|Fact/));
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
    await waitFor(() => expect(document.body.textContent).toMatch(/New note|Switch|Search/i));
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
    await user.type(screen.getByPlaceholderText(/Search/), "docker");
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
    await user.type(screen.getByPlaceholderText(/Search/), "quantenphysik");
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
    await user.type(screen.getByPlaceholderText(/Search/), "docker");
    await waitFor(() => expect(container.textContent).toMatch(/Search index warm — answer in \d+ ms/), { timeout: 4000 });
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
    await user.type(screen.getByPlaceholderText(/Search/), "docker");
    await waitFor(() => expect(container.textContent).toMatch(/Found via/), { timeout: 4000 });
    expect(container.textContent).toMatch(/words #1/);
    expect(container.textContent).toMatch(/meaning #3/);
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
      // Die vier Abschnitte bleiben — ihr Sichttext ist eine Beschreibung, kein
      // Korb-Wort (#84).
      expect(text).toContain("Facts & knowledge");
      expect(text).toContain("Events & dates");
      expect(text).toContain("How-tos & instructions");
      expect(text).toContain("Documents & files");
      expect(text).toMatch(/1 note/);
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
      expect(container.textContent).toMatch(/in the search index/i);
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

  // #27, gemessen im echten Fenster 17:37:42 und 18:12:30 (SET1-Papier §32–§33):
  // bei 390 px blieb die Leiste nach der Wahl von „Settings" stehen und lag ueber
  // dem Formular — der Klick auf „Save" traf DIV.seiten-kante-oben, es wurde nichts
  // gespeichert, ohne jede Meldung.
  it("schließt die Leiste wieder, wenn der Mensch bei schmalem Fenster eine Ansicht wählt", async () => {
    fenster(390);
    const { container } = await zeige([note({ title: "Fristen" })]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Show sidebar" }));
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(leiste(container)?.className, "die Leiste ist offen — das ist die Voraussetzung").toMatch(/w-64/);
    const nav = [...container.querySelectorAll(".sidebar-nav-btn")].find((b) => /Settings/.test(b.textContent || "")) as HTMLElement;
    expect(nav, "die Seitenleiste zeigt ihren Settings-Punkt nicht").toBeTruthy();
    await act(async () => {
      fireEvent.click(nav);
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(leiste(container)?.className, "die Leiste bleibt ueber der Flaeche stehen — der naechste Klick geht an sie, nicht an das Formular").toMatch(/w-0/);
  });

  // #32, gemessen 20:10:23 bei 390x844 (SET1, eigner Rückfall): nachdem die
  // Ansichtswahl die Leiste schliesst (#27), gab es in den Einstellungen keinen
  // Auf-Weg mehr. Der Schalter lebte in der Kopfzeile der memories-Ansicht, und
  // deren Behaelter ist ausserhalb von `memories` auf `hidden` gestellt — im Blatt
  // war er also wohl, anfassbar aber nicht (display:none erbt keine Trefferflaeche).
  // Gefordert ist deshalb beides: genau EIN Schalter, und keiner in einem
  // display-none-Vorfahren. Pro Ansicht ein Durchgang, nicht einer fuer sieben.
  it.each(["Today", "Chat", "Graph", "Dossier", "Activity", "Settings"])(
    "lässt die Leiste in %s wieder auf, und der Schalter ist anfassbar",
    async (ziel) => {
      fenster(390);
      const { container } = await zeige([note({ title: "Fristen" })]);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Show sidebar" }));
        await new Promise((r) => setTimeout(r, 60));
      });
      const nav = [...container.querySelectorAll(".sidebar-nav-btn")].find(
        (b) => new RegExp(ziel as string).test(b.textContent || "")
      ) as HTMLElement;
      expect(nav, `die Seitenleiste zeigt ihren Punkt "${ziel}" nicht`).toBeTruthy();
      await act(async () => {
        fireEvent.click(nav);
        await new Promise((r) => setTimeout(r, 60));
      });
      expect(leiste(container)?.className, "Voraussetzung: die Ansichtswahl hat die Leiste geschlossen").toMatch(/w-0/);
      const knopfe = screen.getAllByRole("button", { name: "Show sidebar" });
      // jsdom kennt keine CSS-Kaskade: ein Behaelter mit Klasse `hidden` ist hier
      // weiterhin im Baum, obwohl ein echter Browser ihn auf display:none setzt und
      // damit aus dem Zugriffsbaum nimmt. Gezaehlt wird deshalb nicht das Blatt,
      // sondern das, was ein Mensch treffen kann — ein Schalter ohne display-none-Vorfahr.
      const erreichbar = knopfe.filter((k) => !k.closest(".hidden"));
      expect(
        erreichbar.length,
        `in ${ziel} sind ${erreichbar.length} anfassbare Auf-Schalter (im Blatt ${knopfe.length}) — eines davon ist der Weg zurück`
      ).toBe(1);
      await act(async () => {
        fireEvent.click(erreichbar[0]);
        await new Promise((r) => setTimeout(r, 60));
      });
      expect(leiste(container)?.className, `in ${ziel} oeffnet kein Steuer die Leiste wieder`).toMatch(/w-64/);
    }
  );
});

// A7-06, nachgemessen am 09.10. im echten Browser (Tabelle B, letzte Zeile je
// Bestand): bei 390 px blieb der Fläche ein Streifen von 80 × 418 CSS-px, und der
// begann bei y = 740 eines 844-px-Fensters — rund 314 px Bild unter der Falz,
// nichts daran scrollte. Die Entscheidung „Leiste zu oder auf“ fiel einmal beim
// Mount und wurde danach nie wieder gefragt; ein Lauf, der die Breite umstellt,
// findet dieselben 256 px Leiste wie beim Start in 1440 px.
describe("A7-06: die Hülle folgt der Fensterbreite", () => {
  const echteBreite = window.innerWidth;
  afterEach(() => {
    Object.defineProperty(window, "innerWidth", { value: echteBreite, writable: true, configurable: true });
  });
  function fenster(breite: number) {
    Object.defineProperty(window, "innerWidth", { value: breite, writable: true, configurable: true });
  }
  const rahmen = (container: HTMLElement) => container.firstElementChild as HTMLElement;
  const leiste = (container: HTMLElement) => container.querySelector(".sidebar-glass") as HTMLElement | undefined;
  async function breitesWechsel(nach: number) {
    Object.defineProperty(window, "innerWidth", { value: nach, writable: true, configurable: true });
    await act(async () => {
      fireEvent(window, new Event("resize"));
      await new Promise((r) => setTimeout(r, 60));
    });
  }

  it("trägt das schmale Merkmal, wenn das Fenster beim Start schmal ist", async () => {
    fenster(390);
    const { container } = await zeige([note({ title: "Fristen" })]);
    expect(rahmen(container).className, "der Rahmen sagt nicht, dass er schmal ist").toMatch(/huelle-schmal/);
  });

  it("setzt das schmale Merkmal neu, wenn das Fenster während des Laufs schmal wird", async () => {
    fenster(1440);
    const { container } = await zeige([note({ title: "Fristen" })]);
    expect(rahmen(container).className).not.toMatch(/huelle-schmal/);
    await breitesWechsel(390);
    expect(rahmen(container).className, "die Breite gilt nur vom Mount, nicht vom Fenster").toMatch(/huelle-schmal/);
    expect(leiste(container)?.className, "die Leiste steht noch in der Reihe").toMatch(/w-0/);
  });

  it("gibt das breite Merkmal zurück, wenn das Fenster wieder trägt", async () => {
    fenster(390);
    const { container } = await zeige([note({ title: "Fristen" })]);
    await breitesWechsel(1440);
    expect(rahmen(container).className).not.toMatch(/huelle-schmal/);
    expect(leiste(container)?.className).toMatch(/w-64/);
  });

  it("nennt die Seitenleiste beim Namen, damit der Rahmen sie überlagern kann", async () => {
    fenster(1440);
    const { container } = await zeige([note({ title: "Fristen" })]);
    expect(leiste(container)?.className, "die Leiste hat kein Kleid, das die Stilregel greifen kann").toMatch(/seiten-leiste/);
  });

  it("gibt der Fläche ihr Kleid, damit die Stilregel ihre Leiste findet", async () => {
    fenster(1440);
    const { container } = await zeige([note({ title: "Fristen" })]);
    expect(container.querySelector(".flaeche-huelle"), "die Flächen-Ansicht steht ohne Hook im Rahmen").toBeTruthy();
  });

  it("zeigt den langen Satz der Flächen-Kopfzeile, wo das Fenster ihn trägt", async () => {
    fenster(1440);
    const { container } = await zeige([note({ title: "Fristen" })]);
    expect(container.textContent).toMatch(/connected through tags/);
  });

  it("lässt den langen Satz der Flächen-Kopfzeile im schmalen Fenster weg", async () => {
    fenster(390);
    const { container } = await zeige([note({ title: "Fristen" })]);
    expect(container.textContent, "der Satz bricht um und nimmt der Fläche die Höhe").not.toMatch(/connected through tags/);
  });
});

/**
 * Die Sackgasse, die GF im echten Browser bewiesen hat
 * (audit-2026-10-09/gf-beleg-2026-10-14/v6-code-leer.png, Befund Zeile 252):
 * die beiden Zeilen haengen im Nicht-leer-Zweig der Liste. Leert ein Wort die
 * Seite, verschwindet auch die Moeglichkeit, das Wort zurückzunehmen.
 */
describe("Dashboard: die neun Woerter fuehren in keine Sackgasse", () => {
  // Ein Kunstbestand ohne ein einziges Programmstueck: "Code" trifft ins Leere,
  // obwohl vier Notizen geladen sind. Genau der Fall, den mein Beweislauf von
  // Schritt 3 nie erreicht hat — dort waren alle elf Notizen auf der Seite.
  function ohneCode(): Memory[] {
    return [
      note({ title: "Gedanke", content: "Frei getippt, keine Datei dahinter" }),
      note({ title: "Notiz zwei", content: "Noch ein Gedanke" }),
      note({ title: "Papier", content: "— Source: /tmp/b.md", tags: ["machine-scan"] }),
      note({ title: "Vertrag", content: "— Source: /tmp/d.pdf", tags: ["machine-scan"] }),
    ];
  }
  const zeile1 = () => within(screen.getByRole("group", { name: /in what form/i }));
  const zeile2 = () => within(screen.getByRole("group", { name: /what it is about/i }));
  // P202, Mockup-Grammatik: die Filter-Chips stehen bei ihrer Frage — By type
  // zeigt die Form-Zeile, By topic die About-Zeile. Der Test stellt die Frage
  // zuerst, dann klickt er den Chip.
  const waehleFrage = async (user: ReturnType<typeof userEvent.setup>, frage: "By type" | "By topic") => {
    await user.click(screen.getByRole("button", { name: frage }));
  };

  it("zeigt die Form-Zeile bei ihrer Frage und die About-Zeile bei ihrer", async () => {
    const user = userEvent.setup();
    await zeige(ohneCode());
    await waehleFrage(user, "By type");
    expect(zeile1().getByRole("button", { name: "Code" })).toBeTruthy();
    await waehleFrage(user, "By topic");
    expect(zeile2().getByRole("button", { name: "Tasks" })).toBeTruthy();
  });

  it("laesst die Frage-Zeile stehen, wenn ein Traeger ins Leere laeuft", async () => {
    const user = userEvent.setup();
    const { container } = await zeige(ohneCode());
    await waehleFrage(user, "By type");
    await user.click(zeile1().getByRole("button", { name: "Code" }));
    await waitFor(() => expect(container.textContent).toMatch(/no notes/i), { timeout: 4000 });
    expect(screen.getByRole("group", { name: /in what form/i }), "die Frage-Zeile ist beim leeren Traeger aus dem Baum — die Sackgasse").toBeTruthy();
  });

  it("bietet einen Zurueck-Knopf, der mit einem Klick alles wieder zeigt", async () => {
    const user = userEvent.setup();
    const { container } = await zeige(ohneCode());
    await waehleFrage(user, "By type");
    await user.click(zeile1().getByRole("button", { name: "Code" }));
    await waitFor(() => expect(container.textContent).toMatch(/no notes/i), { timeout: 4000 });
    await user.click(screen.getByRole("button", { name: /show everything again/i }));
    await waitFor(() => expect(container.textContent).toMatch(/Papier/), { timeout: 4000 });
    expect(container.textContent).not.toMatch(/no notes/i);
  });

  it("nennt die Gruppe als Grund der Leerheit, nicht 'No entries yet'", async () => {
    const user = userEvent.setup();
    const { container } = await zeige(ohneCode());
    await waehleFrage(user, "By type");
    await user.click(zeile1().getByRole("button", { name: "Code" }));
    await waitFor(() => expect(container.textContent).toMatch(/no notes in code/i), { timeout: 4000 });
    expect(container.textContent, "vier Notizen sind geladen — 'noch keine Eintraege' ist eine Luege").not.toMatch(/No notes yet/i);
  });

  it("faengt auch das duenne Themenwort ab: Tasks ohne Treffer", async () => {
    const user = userEvent.setup();
    const { container } = await zeige(ohneCode());
    await waehleFrage(user, "By topic");
    await user.click(zeile2().getByRole("button", { name: "Tasks" }));
    await waitFor(() => expect(container.textContent).toMatch(/no notes filed under tasks/i), { timeout: 4000 });
    expect(screen.getByRole("group", { name: /what it is about/i })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /show everything again/i }));
    await waitFor(() => expect(container.textContent).not.toMatch(/no notes/i), { timeout: 4000 });
  });

  /**
   * #77 — die Flaeche haelt zwei Zahlen, und sie duerfen nicht vertauscht
   * werden: der Streifen zaehlt den Laden (Antwort der Tür, hier 150), die
   * Chip-Zeile das Blatt, über das der Filter wirklich laeuft (hier 4).
   */
  it("zaehlt den Laden im Streifen und das Blatt an den Chips, getrennt", async () => {
    const { container } = await zeige(ohneCode());
    // Erst die Karten abwarten — der Speicher lädt mit 300 ms Sammelzeit, und
    // ohne sie steht die Zeile noch gar nicht im Baum. Seit Damians Bild von
    // 19:02 nennt die Zeile die Menge, ohne ihre Zahl zu wiederholen ("the
    // whole store"); die Zahl selbst steht eine Zelle weiter als Heldenzahl.
    await waitFor(() => expect(container.textContent).toMatch(/in what form · all of your notes/), { timeout: 6000 });
    // Der Streifen spricht fuer den Laden: 150 Stuecke, 20 davon Code.
    expect(container.textContent).toMatch(/100\s*Notes/);
    expect(container.textContent).toMatch(/30\s*Files/);
    expect(container.textContent).toMatch(/20\s*Code/);
    // Die Zeile an den Chips spricht fuer das Blatt — und IHRE Zahlen summieren auf die
    // Karten, die wirklich stehen. Gelesen wird die ganze Liste, nicht drei auswendig
    // gelernte Faecher: seit 3.2.97 zaehlt die Zeile fuenf Traeger, und eine Sonde, die nur
    // die ersten drei abnimmt, haette einen verlorenen Korb als korrekte Summe verkauft.
    const treffer = /on this page ([\d.,\s·]+?)(?=[A-Z]|$)/u.exec(container.textContent ?? "");
    expect(treffer, "die zweite Zahl fehlt: was das Blatt haelt").not.toBeNull();
    const blatt = (treffer![1].split("·").map((t) => Number(t.trim().replace(/,/g, ""))))
      .filter((n) => Number.isFinite(n));
    expect(blatt.length, `die Zeile nennt ${blatt.length} Faecher, erwartet werden alle ${TRAEGER_REIHENFOLGE.length}`).toBe(TRAEGER_REIHENFOLGE.length);
    expect(blatt.reduce((a, b) => a + b, 0)).toBe(container.querySelectorAll(".row-entry").length);
    expect(blatt[2], "Code liegt auf dieser Seite nicht, im Laden schon").toBe(0);
  });
});

/**
 * Damians Bild von 22:20 zeigte denselben Streifen in zwei Kleidern:
 * „92 Notes  10996 Files  9978 Code" ohne Punkt, eine Zeile tiefer
 * „in the 21,066 stored" mit Punkt. Die bisherigen Faelle konnten das nicht
 * sehen — ihr Stub zaehlt 100/30/20/150, und unter 1 000 ist ein Tausenderpunkt
 * unsichtbar. Ein Fall, dessen Zahlen die Krankheit nicht ausdruecken koennen,
 * ist kein Fall.
 *
 * Zweit Befund, sein Bild von 19:02: „150 Notes  0 Files  0 Code". Zwei von drei
 * Zahlen sagen nichts, und die dritte steht schon als Heldenzahl. Der Streifen
 * zeigt darum nur, was da ist, und die Zeile darunter nennt die Menge, ohne ihre
 * Zahl zu wiederholen.
 */
describe("Dashboard: der Index-Streifen kleidet jede Zahl gleich", () => {
  function ladungGross(zahlen: { bestand: number; notes: number; files: number; code: number }): void {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/memories/gruppen")) {
        return new Response(JSON.stringify({
          ok: true, bestand: zahlen.bestand,
          traeger: { notes: zahlen.notes, files: zahlen.files, code: zahlen.code },
          themen: { people: 5, projects: 9, events: 3, tasks: 1, guides: 2, links: 4 },
          ohneThema: 120, ms: 2,
        }), { status: 200 });
      }
      if (url.includes("/api/memories")) return new Response(JSON.stringify(notizen), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
  }

  it("setzt den Punkt auch bei den drei Traeger-Zahlen", async () => {
    ladungGross({ bestand: 21_066, notes: 92, files: 10_996, code: 9_978 });
    const { container } = await zeige([note({ title: "Erste" })]);
    // Erst die Tür abwarten — vor ihrer Antwort steht die Zeile ohne die Menge da.
    await waitFor(() => expect(container.textContent).toMatch(/in what form · all of your notes/), { timeout: 6000 });
    expect(container.textContent, "10 996 ohne Punkt, direkt neben 92 ohne Punkt").toMatch(/10,996\s*Files/);
    expect(container.textContent).toMatch(/9,978\s*Code/);
    expect(container.textContent, "92 bleibt unter der Tausenderstelle — das Kleid darf nicht fehlen").toMatch(/92\s*Notes/);
  });

  /** Der Befund aus Damians Bild: ein Fach mit null Stuecken ist keine Auskunft. */
  it("zeigt kein Fach mit null Stuecken und keine Zahl zweimal", async () => {
    ladungGross({ bestand: 150, notes: 150, files: 0, code: 0 });
    const { container } = await zeige([note({ title: "Erste" })]);
    await waitFor(() => expect(container.textContent).toMatch(/in what form · all of your notes/), { timeout: 6000 });
    expect(container.textContent, "150 Notes muss stehen — das Fach ist gefuellt").toMatch(/150\s*Notes/);
    expect(container.textContent, "0 Files ist Schmuck, keine Auskunft").not.toMatch(/0\s*Files/);
    expect(container.textContent, "0 Code ebenso").not.toMatch(/0\s*Code/);
    const zellen = container.querySelectorAll(".index-cell .v");
    const textDerZellen = [...zellen].map((z) => z.textContent ?? "").join(" ");
    expect(textDerZellen.match(/150/g) || [], "die Heldenzahl und das Fach zaehlen dieselbe Menge zweimal").toHaveLength(1);
  });
});

// P63 (Leitung 5.11. 10:56 MEZ, Punkt 4 / #31, dritte Census-Runde): der Clipper las den
// Koerper, BEVOR er die Antwort fragte. Ein HTML-Fehlerblatt eines Proxy (502) warf beim
// JSON-Lesen, der Fang nannte nur den festen Satz, und die Zahl der eignen Tuer fehlte.
// Erwartung VOR dem Flicken: rot, weil "HTTP 502" nirgends steht.
describe("Dashboard: eine unlesbare Antwort der Clipper-Tuer nennt ihre Zahl", () => {
  it("zeigt 502, statt die Antwort als grundlos enden zu lassen", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/license")) return new Response(JSON.stringify({ licensed: true }), { status: 200 });
      if (url.includes("/api/clip")) return new Response("<html><body>502 Bad Gateway</body></html>", { status: 502 });
      if (url.includes("/api/memories") && (init?.method ?? "GET") === "GET") return new Response(JSON.stringify(notizen), { status: 200 });
      if (url.includes("/api/inbox/status")) return new Response(JSON.stringify({ files: [], watching: true }), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    const { container } = await zeige([]);
    await user.type(screen.getByPlaceholderText(/Paste a URL/i), "https://kaputt.example");
    await user.keyboard("{Enter}");
    const grund = await waitFor(() => {
      const t = (container.textContent || "").replace(/\s+/g, " ");
      if (!/not saved|did not save|Import/i.test(t)) throw new Error(`keine Absage auf dem Schirm: "${t.slice(0, 220)}"`);
      return t;
    });
    expect(grund, "502 ist eine Antwort der eignen Tuer — sie gehoert auf den Schirm").toMatch(/HTTP 502/);
    expect(grund, "der feste Satz bleibt stehen").toMatch(/That link was not saved as a note\./);
    expect(grund, "und der V8-Wortlaut bleibt im Protokoll").not.toMatch(/Unexpected token|is not valid JSON/i);
  });
});

// P64 (Leitung 5.11. 12:26 MEZ, Punkt 4 / #31, vierte Census-Runde): der Papierkorb-Zaehler.
// Die Zahl kam von `/api/storage-info`; ein Fehlschlag wurde zu `0` und der Fang zu "ignore".
// Eine Tuer, die 500 sagt, liess den Knopf also aussehen wie ein gelesener leerer Papierkorb --
// und ein vorher gelesener Wert haette als aktueller stehen koennen. Der Zaehler unterscheidet
// jetzt "nicht gelesen" von "null".
// Erwartung VOR dem Flicken: die beiden Fehlschlag-Faelle rot (der Titel bleibt der feste,
// kein Grund auf dem Knopf); die beiden Kontrollen sind in beiden Staenden gruen.
describe("Dashboard: der Papierkorb-Zaehler unterscheidet nicht gelesen von null", () => {
  const TITEL_FEST = "Trash — restore deleted notes";
  async function öffneKnopf(antwort: Response) {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/storage-info")) return antwort;
      if (String(url).includes("/api/license")) return new Response(JSON.stringify({ licensed: true }), { status: 200 });
      if (String(url).includes("/api/memories") && (init?.method ?? "GET") === "GET") return new Response(JSON.stringify(notizen), { status: 200 });
      if (String(url).includes("/api/inbox/status")) return new Response(JSON.stringify({ files: [], watching: true }), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    const { container } = await zeige([]);
    const knopf = container.querySelector(`button[title="${TITEL_FEST}"]`) as HTMLButtonElement;
    expect(knopf, "der Papierkorb-Knopf fuehrt keinen festen Titel mehr").toBeTruthy();
    await user.click(knopf);
    return knopf;
  }

  it("sagt den Abweis der Zaehler-Tuer am Knopf, statt ihn als null zu setzen", async () => {
    const knopf = await öffneKnopf(new Response(JSON.stringify({ error: "storage busy" }), { status: 500 }));
    await waitFor(() => expect(knopf.getAttribute("title")).not.toBe(TITEL_FEST));
    const titel = String(knopf.getAttribute("title"));
    // Der Hausvertrag der Absage: hat die eigne Tuer einen Satz, steht ER in der Klammer; die
    // Zahl tritt erst zurueck, wenn die Tuer keinen schreibt (der naechste Fall).
    expect(titel, "500 mit eigner Auskunft — der Satz der Tuer steht in der Klammer").toMatch(/storage busy/);
    expect(titel, "und die Zeile sagt, WAS fehlt").toMatch(/count did not arrive/i);
  });

  it("sagt einen unlesbaren Koerper der Zaehler-Tuer, ohne den Wortlaut der Laufzeit", async () => {
    const knopf = await öffneKnopf(new Response("<html><body>502</body></html>", { status: 502 }));
    await waitFor(() => expect(knopf.getAttribute("title")).not.toBe(TITEL_FEST));
    const titel = String(knopf.getAttribute("title"));
    expect(titel, "auch ein unlesbarer Koerper ist eine Antwort").toMatch(/HTTP 502/);
    expect(titel, "der JSON-Wortlaut bleibt im Protokoll").not.toMatch(/Unexpected token|not valid JSON/i);
  });

  // KONTROLLE, in beiden Staenden gruen: eine gelesene Zahl ist eine Zahl.
  it("KONTROLLE: eine gelesene drei steht als drei auf dem Knopf", async () => {
    const { container } = await (async () => {
      const user = userEvent.setup();
      vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes("/api/storage-info")) return new Response(JSON.stringify({ trashed: 3 }), { status: 200 });
        if (String(url).includes("/api/memories") && (init?.method ?? "GET") === "GET") return new Response(JSON.stringify(notizen), { status: 200 });
        if (String(url).includes("/api/inbox/status")) return new Response(JSON.stringify({ files: [], watching: true }), { status: 200 });
        return new Response("{}", { status: 200 });
      }));
      const view = await zeige([]);
      const knopf = view.container.querySelector(`button[title="${TITEL_FEST}"]`) as HTMLButtonElement;
      await user.click(knopf);
      await waitFor(() => expect(knopf.textContent).toContain("3"));
      return view;
    })();
    expect(container.querySelector(`button[title="${TITEL_FEST}"]`), "eine gelesene Zahl laesst den festen Titel stehen").toBeTruthy();
  });

  // KONTROLLE, in beiden Staenden gruen: ein gelesener leerer Papierkorb ist kein Fehlschlag.
  it("KONTROLLE: eine gelesene null behaelt den festen Titel", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/storage-info")) return new Response(JSON.stringify({ trashed: 0 }), { status: 200 });
      if (String(url).includes("/api/memories") && (init?.method ?? "GET") === "GET") return new Response(JSON.stringify(notizen), { status: 200 });
      if (String(url).includes("/api/inbox/status")) return new Response(JSON.stringify({ files: [], watching: true }), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    const { container } = await zeige([]);
    const knopf = container.querySelector(`button[title="${TITEL_FEST}"]`) as HTMLButtonElement;
    await user.click(knopf);
    await waitFor(() => expect(knopf.getAttribute("title")).toBe(TITEL_FEST));
    expect(knopf.textContent, "null deleted notes ist kein Grund fuer eine Zahl auf dem Knopf").not.toContain("0");
  });
});
