// @vitest-environment jsdom
//
// Die Ansichten von 2.13 aus Sicht einer Person, die sie benutzt: Today mit
// Widersprüchen zum Auflösen, das Dossier, die KI-Aktivität mit Audit-Log, das
// Verbinden von Apps und der Privatsphäre-Schild. Der Server ist nachgebildet.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, within, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "../../src/components/ui/Toast";
import { TodayView, besuchSeit, gruss, LETZTER_BESUCH, type Briefing } from "../../src/components/TodayView";
import { DossierView } from "../../src/components/DossierView";
import { ActivityView, AKTION, lesbareDetails } from "../../src/components/ActivityView";
import { ConnectApps, type ClientStatus } from "../../src/components/ConnectApps";
import { PrivacyShield } from "../../src/components/PrivacyShield";
import { Sidebar } from "../../src/components/Sidebar";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { ThemeProvider } from "../../src/contexts/ThemeContext";

type Antwort = { status?: number; body: unknown };
type Route = Antwort | ((url: string, init?: RequestInit) => Antwort);

function stubFetch(routen: Record<string, Route>) {
  const aufrufe: { url: string; init?: RequestInit }[] = [];
  const schluessel = Object.keys(routen).sort((a, b) => b.length - a.length);
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    aufrufe.push({ url, init });
    const k = schluessel.find((s) => url.startsWith(s));
    const r = k ? routen[k]! : { status: 404, body: { error: "not found" } };
    const a = typeof r === "function" ? r(url, init) : r;
    return new Response(typeof a.body === "string" ? a.body : JSON.stringify(a.body), { status: a.status ?? 200 });
  }));
  return aufrufe;
}

const mitToast = (el: React.ReactElement) => render(<ToastProvider>{el}</ToastProvider>);
const TAG = 86_400_000;

beforeEach(() => localStorage.clear());
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

describe("Today", () => {
  const briefing = (): Briefing => ({
    since: 0,
    created: {
      total: 2,
      bySource: [{ who: "Claude", count: 1 }, { who: "You & imports", count: 1 }],
      notes: [{ id: "n1", title: "Prefers short answers", type: "semantic", at: Date.now() - 60_000, by: "Claude" }, { id: "n2", title: "My note", type: "semantic", at: Date.now() - 120_000 }],
    },
    changed: { total: 1, notes: [{ id: "n3", title: "Changed note", type: "semantic", at: Date.now() - 30_000 }] },
    expiring: [{ id: "e1", title: "Offer Lumen", type: "semantic", at: 1, validTo: Date.now() + 3 * TAG }],
    expired: [{ id: "e2", title: "Old price", type: "semantic", at: 1, validTo: Date.now() - TAG }],
    todos: { total: 3, items: [{ id: "t1", title: "Plan", text: "Call the bank" }, { id: "t1", title: "Plan", text: "Send the offer" }] },
    contradictions: [
      {
        key: "a|b",
        about: "backups run nightly",
        newer: { id: "b", title: "Backup B", sentence: "Backups now run nightly at 03:00.", value: "03:00", updatedAt: Date.now() - 1000 },
        older: { id: "a", title: "Backup A", sentence: "Backups run nightly at 02:00.", value: "02:00", updatedAt: Date.now() - 30 * TAG },
      },
      {
        key: "c|d",
        about: "license costs",
        newer: { id: "d", title: "License D", sentence: "The license costs 1500 EUR.", value: "1500 EUR", updatedAt: Date.now() - 2000 },
        older: { id: "c", title: "License C", sentence: "The license costs 1.200 €.", value: "1.200 €", updatedAt: Date.now() - 3000 },
      },
    ],
    apps: [{ who: "Claude", calls: 12, saves: 3, searches: 5 }],
  });

  it("merkt sich den letzten Besuch — beim ersten Mal ist das ein Tag", () => {
    const jetzt = 10 * TAG;
    expect(besuchSeit(jetzt)).toBe(jetzt - TAG);
    expect(localStorage.getItem(LETZTER_BESUCH)).toBe(String(jetzt));
    expect(besuchSeit(jetzt + 5000)).toBe(jetzt);
    expect(gruss(8)).toBe("Good morning");
    expect(gruss(14)).toBe("Good afternoon");
    expect(gruss(20)).toBe("Good evening");
    expect(gruss(3)).toBe("Good evening");
  });

  it("zeigt alles Wichtige — und löst einen Widerspruch mit einem Klick", async () => {
    const user = userEvent.setup();
    const aufrufe = stubFetch({
      "/api/briefing": { body: briefing() },
      "/api/contradictions/resolve": { body: { ok: true } },
    });
    const oeffne = vi.fn();
    const gehe = vi.fn();
    mitToast(<TodayView aktiv onOpenMemory={oeffne} onGo={gehe} />);
    await screen.findByText("Needs a look");
    expect(screen.getByText("03:00").tagName).toBe("STRONG");
    expect(screen.getByText(/Claude: 1 new · You & imports: 1 new · 1 changed/)).toBeTruthy();
    expect(screen.getByText("Call the bank")).toBeTruthy();
    expect(screen.getByText("and 1 more in your notes")).toBeTruthy();
    expect(screen.getByText(/valid until/)).toBeTruthy();
    expect(screen.getByText(/still true\?/)).toBeTruthy();
    expect(screen.getByText(/12 calls · 3 saved · 5 searches/)).toBeTruthy();

    await user.click(screen.getAllByRole("button", { name: "Keep the newer" })[0]!);
    await screen.findByText("Done — “Backup A” is marked as replaced by “Backup B”.");
    const aufloesen = aufrufe.find((a) => a.url === "/api/contradictions/resolve")!;
    expect(JSON.parse(String(aufloesen.init!.body))).toEqual({ keep: "b", drop: "a", both: false });

    await user.click(screen.getByRole("button", { name: "Both are right" }));
    await screen.findByText("Noted — K3PTA will not ask about these two again.");

    await user.click(screen.getByRole("button", { name: "Prefers short answers" }));
    expect(oeffne).toHaveBeenCalledWith("n1");
    await user.click(screen.getByRole("button", { name: "See everything they did" }));
    expect(gehe).toHaveBeenCalledWith("activity");
  });

  it("„Keep the older“ ersetzt die neuere; ein Fehler wird gesagt", async () => {
    const user = userEvent.setup();
    const aufrufe = stubFetch({ "/api/briefing": { body: briefing() }, "/api/contradictions/resolve": { status: 400, body: { error: "Pick the two notes that disagree." } } });
    mitToast(<TodayView aktiv onOpenMemory={vi.fn()} onGo={vi.fn()} />);
    await screen.findByText("Needs a look");
    await user.click(screen.getAllByRole("button", { name: "Keep the older" })[0]!);
    await screen.findByText("That decision was not recorded. The pair is still here. (Pick the two notes that disagree.)");
    expect(JSON.parse(String(aufrufe.find((a) => a.url === "/api/contradictions/resolve")!.init!.body))).toEqual({ keep: "a", drop: "b", both: false });
  });

  it("Zeitmaschine: der Regler holt das Briefing mit dem gewählten Fenster neu — bis hin zu „Everything“", async () => {
    const aufrufe = stubFetch({ "/api/briefing": { body: briefing() } });
    mitToast(<TodayView aktiv onOpenMemory={vi.fn()} onGo={vi.fn()} />);
    await screen.findByText("Needs a look");
    const regler = screen.getByRole("slider", { name: "Time window" });
    fireEvent.change(regler, { target: { value: "2" } }); // 7 Tage
    await waitFor(() => {
      const seit = Number(new URLSearchParams(aufrufe.at(-1)!.url.split("?")[1]).get("since"));
      expect(seit).toBeGreaterThan(Date.now() - 8 * TAG);
      expect(seit).toBeLessThanOrEqual(Date.now() - 7 * TAG + 5000);
    });
    fireEvent.change(regler, { target: { value: "4" } }); // Everything
    await screen.findByText(/in all the time K3PTA remembers/);
    expect(new URLSearchParams(aufrufe.at(-1)!.url.split("?")[1]).get("since")).toBe("0");
  });

  it("konsolidiert die Wahrheitsbewegung: abgelöst mit Nachfolger-Klick, gelöscht mit Weg zum Papierkorb", async () => {
    const bewegt = briefing();
    bewegt.superseded = { total: 1, notes: [{ id: "s1", title: "Old plan", type: "semantic", at: Date.now() - 45_000, supersededBy: "succ", replacedBy: "The successor" }] };
    bewegt.deleted = { total: 1, notes: [{ id: "d1", title: "Scratch", type: "semantic", at: Date.now() - 50_000 }] };
    const aufrufe = stubFetch({ "/api/briefing": { body: bewegt } });
    const oeffne = vi.fn();
    mitToast(<TodayView aktiv onOpenMemory={oeffne} onGo={vi.fn()} />);
    await screen.findByText("Needs a look");
    expect(screen.getByText("Old plan")).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "The successor" }));
    expect(oeffne).toHaveBeenCalledWith("succ");
    expect(screen.getByText("Scratch")).toBeTruthy();
    expect(screen.getByText(/in the trash — restore it there/)).toBeTruthy();
    // Kopf-Chip, Kategorie-Tag und „replaced by“ zeigen die Bewegung mehrfach an.
    expect(screen.getAllByText(/replaced/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/deleted/).length).toBeGreaterThanOrEqual(2);
    expect(aufrufe.filter((a) => a.url.startsWith("/api/briefing")).length).toBeGreaterThan(0);
  });

  it("ein ruhiger Tag — und ein Fehler mit „Try again“", async () => {
    const user = userEvent.setup();
    let versuche = 0;
    stubFetch({
      "/api/briefing": () => (++versuche === 1 ? { status: 500, body: { error: "DB locked" } } : { body: { ...briefing(), created: { total: 0, bySource: [], notes: [] }, changed: { total: 0, notes: [] }, contradictions: [], todos: { total: 0, items: [] }, expiring: [], expired: [], apps: [] } }),
    });
    const gehe = vi.fn();
    mitToast(<TodayView aktiv onOpenMemory={vi.fn()} onGo={gehe} />);
    await screen.findByText(/Today's briefing did not arrive\. \(DB locked\)/);
    await user.click(screen.getByRole("button", { name: /Try again/ }));
    await screen.findByText("Nothing new since your last visit.");
    expect(screen.getByText("All quiet. Nothing needs you right now.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Connect an app" }));
    expect(gehe).toHaveBeenCalledWith("activity");
  });
});

describe("Dossier", () => {
  const dossier = {
    topic: "Atlas",
    total: 3,
    kinds: { semantic: 1, episodic: 1, procedural: 1 },
    facts: [{ id: "f1", title: "Atlas relaunch", sentence: "The Atlas relaunch starts in October.", at: 1 }],
    timeline: [{ id: "k1", title: "Atlas kickoff", sentence: "Kickoff with Mara.", at: Date.UTC(2026, 8, 1) }],
    howtos: [{ id: "h1", title: "Deploy Atlas", sentence: "Deploy Atlas", at: 1 }],
    documents: [],
    todos: [{ id: "k1", title: "Atlas kickoff", text: "send the deck" }],
    contradictions: [{ key: "x|y", about: "launch date", newer: { title: "A", value: "01.10.2026" }, older: { title: "B", value: "15.10.2026" } }],
    related: [{ tag: "lumen", count: 2 }],
    first: Date.UTC(2026, 8, 1),
    last: Date.UTC(2026, 8, 14),
    markdown: "# Dossier: Atlas\n",
  };

  it("vom Vorschlag zum Dossier — kopieren, als Notiz speichern, weiter zum verwandten Thema", async () => {
    const user = userEvent.setup();
    const kopiert = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText: kopiert }, configurable: true });
    const aufrufe = stubFetch({
      "/api/dossier/suggestions": { body: { tags: [{ name: "atlas", count: 3 }], topics: [{ name: "Atlas", count: 2 }] } },
      "/api/dossier?": (url) => ({ body: url.includes("lumen") ? { ...dossier, topic: "lumen", total: 0 } : dossier }),
      "/api/memories": { body: { memory: { id: "neu" } } },
    });
    const oeffne = vi.fn();
    mitToast(<DossierView onOpenMemory={oeffne} />);
    await user.click(await screen.findByRole("button", { name: "Atlas" }));
    await screen.findByText("Key points");
    expect(screen.getByText(/The Atlas relaunch starts in October/)).toBeTruthy();
    expect(screen.getByText(/send the deck/)).toBeTruthy();
    expect(screen.getByText("To check")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Atlas relaunch" }));
    expect(oeffne).toHaveBeenCalledWith("f1");

    await user.click(screen.getByRole("button", { name: /Copy as Markdown/ }));
    expect(kopiert).toHaveBeenCalledWith("# Dossier: Atlas\n");
    await screen.findByText("Copied");
    await user.click(screen.getByRole("button", { name: /Save as note/ }));
    await screen.findByText("Saved");
    const gespeichert = aufrufe.find((a) => a.url === "/api/memories")!;
    expect(JSON.parse(String(gespeichert.init!.body))).toEqual({ title: "Dossier: Atlas", content: "# Dossier: Atlas\n", type: "reference", tags: ["dossier"] });

    await user.click(screen.getByRole("button", { name: "#lumen" }));
    await screen.findByText(/K3PTA knows nothing about “lumen” yet/);
  });

  it("per Eingabe — und ein verständlicher Fehler", async () => {
    const user = userEvent.setup();
    stubFetch({ "/api/dossier/suggestions": { status: 500, body: {} }, "/api/dossier?": { status: 400, body: { error: "Tell K3PTA who or what the dossier is about." } } });
    mitToast(<DossierView onOpenMemory={vi.fn()} />);
    await user.type(screen.getByRole("textbox", { name: /Who or what/ }), "Zebra");
    await user.click(screen.getByRole("button", { name: /Create dossier/ }));
    await screen.findByText("The dossier did not arrive. (Tell K3PTA who or what the dossier is about.)");
  });

  it("löst Widersprüche im Fluss: neuerer gilt, beide gültig mit Fenster, oder der Editor", async () => {
    const user = userEvent.setup();
    const mitKarten = {
      ...dossier,
      contradictions: [
        { key: "nw|old", about: "launch date", newer: { id: "nw", title: "A", value: "01.10.2026" }, older: { id: "old", title: "B", value: "15.10.2026" } },
      ],
    };
    const aufrufe = stubFetch({
      "/api/dossier/suggestions": { body: { tags: [], topics: [{ name: "Atlas", count: 2 }] } },
      "/api/dossier?": { body: mitKarten },
      "/api/contradictions/resolve": { body: { ok: true } },
    });
    const editiert = vi.fn();
    mitToast(<DossierView onOpenMemory={vi.fn()} onEditMemory={editiert} />);
    await user.click(await screen.findByRole("button", { name: "Atlas" }));
    const karte = await screen.findByTestId("dossier-contradiction");
    expect(within(karte).getByText("01.10.2026")).toBeTruthy();

    await user.click(within(karte).getByRole("button", { name: "Newer wins" }));
    await within(karte).findByText("Done — “B” is marked as replaced by “A”."); // erledigt, Karte beruhigt
    expect(JSON.parse(String(aufrufe.find((a) => a.url === "/api/contradictions/resolve")!.init!.body))).toEqual({ keep: "nw", drop: "old" });

    cleanup();
    const aufrufe2 = stubFetch({
      "/api/dossier/suggestions": { body: { tags: [], topics: [{ name: "Atlas", count: 2 }] } },
      "/api/dossier?": { body: mitKarten },
      "/api/contradictions/resolve": { body: { ok: true } },
    });
    mitToast(<DossierView onOpenMemory={vi.fn()} onEditMemory={editiert} />);
    await user.click(await screen.findByRole("button", { name: "Atlas" }));
    const karte2 = await screen.findByTestId("dossier-contradiction");
    await user.click(within(karte2).getByRole("button", { name: "Both hold — cap the older" }));
    await within(karte2).findByText("Both hold — “B” now ends where “A” begins.");
    expect(JSON.parse(String(aufrufe2.filter((a) => a.url === "/api/contradictions/resolve").at(-1)!.init!.body))).toEqual({ keep: "nw", drop: "old", window: true });

    cleanup();
    stubFetch({
      "/api/dossier/suggestions": { body: { tags: [], topics: [{ name: "Atlas", count: 2 }] } },
      "/api/dossier?": { body: mitKarten },
      "/api/contradictions/resolve": { body: { ok: true } },
    });
    mitToast(<DossierView onOpenMemory={vi.fn()} onEditMemory={editiert} />);
    await user.click(await screen.findByRole("button", { name: "Atlas" }));
    const karte3 = await screen.findByTestId("dossier-contradiction");
    await user.click(within(karte3).getByRole("button", { name: "Edit" }));
    expect(editiert).toHaveBeenCalledWith("nw");
  });

  it("ein Fehler bei der Auflösung wird gesagt, nicht verschluckt", async () => {
    const user = userEvent.setup();
    const mitKarten = {
      ...dossier,
      contradictions: [
        { key: "nw|old", about: "launch date", newer: { id: "nw", title: "A", value: "01.10.2026" }, older: { id: "old", title: "B", value: "15.10.2026" } },
      ],
    };
    stubFetch({
      "/api/dossier/suggestions": { body: { tags: [], topics: [{ name: "Atlas", count: 2 }] } },
      "/api/dossier?": { body: mitKarten },
      "/api/contradictions/resolve": { status: 400, body: { error: "Pick the two notes that disagree." } },
    });
    mitToast(<DossierView onOpenMemory={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Atlas" }));
    const karte = await screen.findByTestId("dossier-contradiction");
    await user.click(within(karte).getByRole("button", { name: "Newer wins" }));
    await within(karte).findByText("That decision was not recorded. The pair is still here. (Pick the two notes that disagree.)");
  });

  it("ohne ids (alter Server-Stand) bleibt die ehrliche Textzeile ohne Aktionen — Edit öffnet den Editor für die neuere", async () => {
    const user = userEvent.setup();
    const editiert = vi.fn();
    stubFetch({
      "/api/dossier/suggestions": { body: { tags: [], topics: [{ name: "Atlas", count: 2 }] } },
      "/api/dossier?": { body: dossier },
    });
    mitToast(<DossierView onOpenMemory={vi.fn()} onEditMemory={editiert} />);
    await user.click(await screen.findByRole("button", { name: "Atlas" }));
    const karte = await screen.findByTestId("dossier-contradiction");
    expect(within(karte).queryByRole("button", { name: "Newer wins" })).toBeNull();
    expect(within(karte).getByText(/in A, but/)).toBeTruthy();
  });
});

describe("Aktivität und Prüfprotokoll", () => {
  it("Live: wer gerade da ist und was er tut — ohne App ein Weg zum Verbinden", async () => {
    const user = userEvent.setup();
    stubFetch({
      "/api/agents": {
        body: {
          entries: [
            { id: 2, at: Date.now() - 5000, who: "Claude", tool: "memory_save", text: "Backup plan", noteId: "n1", count: null },
            { id: 1, at: Date.now() - 9000, who: "Claude", tool: "memory_search", text: "backup", noteId: null, count: 3 },
          ],
          agents: [{ who: "Claude", lastSeen: Date.now() - 5000, calls: 2 }, { who: "Cursor", lastSeen: Date.now() - 3 * TAG, calls: 1 }],
        },
      },
      "/api/clients": { body: { clients: [] } },
    });
    const oeffne = vi.fn();
    mitToast(<ActivityView aktiv onOpenMemory={oeffne} />);
    await screen.findByText(/active now/);
    expect(screen.getByText(/3 days ago/)).toBeTruthy();
    expect(screen.getByText("“backup”")).toBeTruthy();
    expect(screen.getByText(/· 3 notes/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Backup plan" }));
    expect(oeffne).toHaveBeenCalledWith("n1");
  });

  it("Live ohne jede App: Verbinden steht gleich da", async () => {
    stubFetch({ "/api/agents": { body: { entries: [], agents: [] } }, "/api/clients": { body: { clients: [] } } });
    mitToast(<ActivityView aktiv onOpenMemory={vi.fn()} />);
    await screen.findByText(/No AI app has used K3PTA yet/);
    await screen.findByText(/No AI app found on this computer/);
  });

  it("Prüfprotokoll: lesbar, filterbar, prüfbar, exportierbar", async () => {
    const user = userEvent.setup();
    let pruefung = { ok: true, entries: 3, brokenAt: null as number | null, truncated: false };
    const aufrufe = stubFetch({
      "/api/agents": { body: { entries: [], agents: [] } },
      "/api/clients": { body: { clients: [] } },
      "/api/audit/verify": () => ({ body: pruefung }),
      "/api/audit/export.csv": { body: "entry,time\n" },
      "/api/audit": (url) => ({
        body: url.includes("before=")
          ? { entries: [{ id: 1, at: 1, actor: "You", action: "save", target: "Old", detail: null }], more: false, actors: ["Claude", "You"], actions: ["cloud chat", "save", "search"] }
          : { entries: [{ id: 3, at: Date.now(), actor: "You", action: "cloud chat", target: "api.openai.com · gpt", detail: "2 notes sent · hidden: 1 IBAN" }, { id: 2, at: Date.now(), actor: "Claude", action: "search", target: "backup", detail: "1 note: k-1 A" }], more: true, actors: ["Claude", "You"], actions: ["cloud chat", "save", "search"] },
      }),
    });
    Object.defineProperty(URL, "createObjectURL", { value: vi.fn(() => "blob:x"), configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
    mitToast(<ActivityView aktiv onOpenMemory={vi.fn()} />);
    await user.click(screen.getByRole("tab", { name: "Audit log" }));
    const liste = await screen.findByTestId("audit-list");
    expect(within(liste).getByText("asked a cloud model", { exact: false })).toBeTruthy();
    expect(within(liste).getByText("“backup”")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Old");

    await user.selectOptions(screen.getByRole("combobox", { name: "Who" }), "Claude");
    await waitFor(() => expect(aufrufe.some((a) => a.url.includes("actor=Claude"))).toBe(true));

    await user.click(screen.getByRole("button", { name: /Check integrity/ }));
    await screen.findByText("Intact — 3 entries, none changed or removed.");
    pruefung = { ok: false, entries: 3, brokenAt: 2, truncated: false };
    await user.click(screen.getByRole("button", { name: /Check integrity/ }));
    await screen.findByText("Something was changed: entry 2 does not match the one before it.");
    pruefung = { ok: false, entries: 2, brokenAt: null, truncated: true };
    await user.click(screen.getByRole("button", { name: /Check integrity/ }));
    await screen.findByText("Entries are missing at the end — the log was cut off after entry 2.");

    await user.click(screen.getByRole("button", { name: /Export CSV/ }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    expect(AKTION["cloud chat"]).toBe("asked a cloud model");
  });

  it("Prüfprotokoll zeigt Titel statt Notiz-IDs", () => {
    expect(lesbareDetails("2 notes: k-mu1dpulz-3f2a9c01 Staging server access; k-mu1dpuo2-2b9bc5d3 Prefers short answers"))
      .toBe("2 notes: Staging server access; Prefers short answers");
    expect(lesbareDetails("k-mu1dpuo2-2b9bc5d3")).toBeNull();
    expect(lesbareDetails("0 notes")).toBe("0 notes");
    expect(lesbareDetails("2 notes sent · hidden: 1 IBAN")).toBe("2 notes sent · hidden: 1 IBAN");
    expect(lesbareDetails(null)).toBeNull();
  });
});

describe("KI-Apps verbinden", () => {
  const apps = (cursorVerbunden: boolean): ClientStatus[] => [
    { id: "claude-desktop", name: "Claude Desktop", installed: false, connected: false, config: "/x", canConnect: false },
    { id: "claude-code", name: "Claude Code", installed: true, connected: false, config: "/y", canConnect: false, hint: "Run this in a terminal: claude mcp add …" },
    { id: "cursor", name: "Cursor", installed: true, connected: cursorVerbunden, config: "/z", canConnect: !cursorVerbunden },
  ];

  it("ein Klick verbindet — mit ehrlicher Rückmeldung", async () => {
    const user = userEvent.setup();
    stubFetch({
      "/api/clients/cursor/connect": { body: { ok: true, message: "Connected. Quit and reopen Cursor to load K3PTA.", clients: apps(true) } },
      "/api/clients": { body: { clients: apps(false) } },
    });
    mitToast(<ConnectApps />);
    await screen.findByText("Not installed");
    expect(screen.getByText(/claude mcp add/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Connect" }));
    await screen.findByText("Connected. Quit and reopen Cursor to load K3PTA.");
    expect(screen.getAllByText("Connected")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Connect" })).toBeNull();
  });

  it("sagt, wenn etwas schiefgeht", async () => {
    const user = userEvent.setup();
    stubFetch({
      "/api/clients/cursor/connect": { status: 400, body: { ok: false, error: "The config file is not plain JSON." } },
      "/api/clients": { body: { clients: apps(false) } },
    });
    mitToast(<ConnectApps />);
    await user.click(await screen.findByRole("button", { name: "Connect" }));
    await screen.findByText("The config file is not plain JSON.");
  });

  it("ohne Server eine klare Meldung", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    mitToast(<ConnectApps />);
    await screen.findByText(/could not look for AI apps/);
  });
});

describe("Privatsphäre-Schild", () => {
  it("zwei Schalter, die sagen, was sie tun — und eine Probe, was ein Cloud-Modell sähe", async () => {
    const user = userEvent.setup();
    const aufrufe = stubFetch({
      "/api/shield": (_url, init) => (init?.method === "PUT" ? { body: { chat: false, apps: true } } : { body: { chat: true, apps: true, privateNotes: 2, week: { cloudChats: 4, protectedChats: 3 } } }),
    });
    mitToast(<PrivacyShield />);
    const schalter = await screen.findByRole("switch", { name: "Hide personal data from cloud AI" });
    expect(schalter.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("2 private notes.")).toBeTruthy();
    expect(screen.getByText(/4 questions went to a cloud model, 3 of them with something hidden/)).toBeTruthy();
    expect(screen.getByTestId("shield-preview").textContent).toBe("Send the invoice to [EMAIL-1] — IBAN [IBAN-1], call [PHONE-1], password: [SECRET-1]");
    expect(screen.getByText("Hidden: 1 password or key, 1 IBAN, 1 email address and 1 phone number.")).toBeTruthy();

    await user.click(schalter);
    await waitFor(() => expect(schalter.getAttribute("aria-checked")).toBe("false"));
    expect(JSON.parse(String(aufrufe.find((a) => a.init?.method === "PUT")!.init!.body))).toEqual({ chat: false });

    const probe = screen.getByRole("textbox", { name: /Try it/ });
    await user.clear(probe);
    await user.type(probe, "nothing here");
    expect(screen.getByTestId("shield-preview").textContent).toBe("nothing here");
    expect(screen.getByText(/shield is off/i)).toBeTruthy();
  });

  it("die Vorschau folgt ihrem eigenen Schalter — aus heisst, dass ein Cloud-Modell den echten Text sähe", async () => {
    const user = userEvent.setup();
    const stand = { chat: true, apps: true, privateNotes: 0, week: { cloudChats: 0, protectedChats: 0 } };
    stubFetch({
      "/api/shield": (_url, init) => {
        if (init?.method === "PUT") {
          const b = JSON.parse(String(init.body)) as { chat?: boolean };
          if (typeof b.chat === "boolean") stand.chat = b.chat;
          return { body: { chat: stand.chat, apps: stand.apps } };
        }
        return { body: stand };
      },
    });
    mitToast(<PrivacyShield />);
    const vorschau = await screen.findByTestId("shield-preview");
    const schalter = await screen.findByRole("switch", { name: "Hide personal data from cloud AI" });
    expect(vorschau.textContent).toContain("[EMAIL-1]");

    await user.click(schalter);
    await waitFor(() => expect(schalter.getAttribute("aria-checked")).toBe("false"));
    expect(vorschau.textContent, "mit ausgeschaltetem Schild geht der echte Text raus — die Vorschau darf ihn nicht verstecken").toContain("anna@example.com");
    expect(vorschau.textContent).not.toContain("[EMAIL-1]");
    expect(screen.getByText(/shield is off/i)).toBeTruthy();
    expect(screen.queryByText(/^Hidden:/)).toBeNull();

    await user.click(schalter);
    await waitFor(() => expect(schalter.getAttribute("aria-checked")).toBe("true"));
    expect(vorschau.textContent).toContain("[EMAIL-1]");
    expect(screen.getByText(/^Hidden:/)).toBeTruthy();
  });

  it("nimmt einen Schalter zurück, der nicht gespeichert werden konnte", async () => {
    const user = userEvent.setup();
    stubFetch({
      "/api/shield": (_url, init) => (init?.method === "PUT" ? { status: 500, body: { error: "disk full" } } : { body: { chat: true, apps: true, privateNotes: 0, week: { cloudChats: 0, protectedChats: 0 } } }),
    });
    mitToast(<PrivacyShield />);
    const schalter = await screen.findByRole("switch", { name: "Hide secrets from AI apps" });
    expect(screen.getByText("No private notes yet.")).toBeTruthy();
    await user.click(schalter);
    await screen.findByText("The switch did not stay — it is back where it was. (disk full)");
    expect(schalter.getAttribute("aria-checked")).toBe("true");
  });
});

describe("Seitenleiste", () => {
  it("führt zu Today, Dossier und Activity — mit Punkt, wenn eine KI-App gerade arbeitet", async () => {
    const user = userEvent.setup();
    const navigiere = vi.fn();
    const { rerender } = render(
      <AuthProvider><ThemeProvider>
        <Sidebar tags={[]} selectedTags={[]} onSelectTag={vi.fn()} onClearTags={vi.fn()} currentView="today" onNavigate={navigiere} totalMemories={3} isFocusMode={false} toggleFocusMode={vi.fn()} />
      </ThemeProvider></AuthProvider>
    );
    for (const name of ["Today", "Dossier", "Activity"]) {
      await user.click(screen.getByRole("button", { name: new RegExp(`^${name}$`) }));
    }
    expect(navigiere.mock.calls.map((c) => c[0])).toEqual(["today", "dossier", "activity"]);
    expect(screen.queryByTestId("apps-live")).toBeNull();
    rerender(
      <AuthProvider><ThemeProvider>
        <Sidebar tags={[]} selectedTags={[]} onSelectTag={vi.fn()} onClearTags={vi.fn()} currentView="today" onNavigate={navigiere} totalMemories={3} appsLive isFocusMode={false} toggleFocusMode={vi.fn()} />
      </ThemeProvider></AuthProvider>
    );
    expect(screen.getByTestId("apps-live")).toBeTruthy();
  });

  it("zeigt in der Fußzeile weder eine Restlaufzeit noch einen Schlüssel-Hinweis", async () => {
    const basis = { tags: [], selectedTags: [], onSelectTag: vi.fn(), onClearTags: vi.fn(), currentView: "today" as const, onNavigate: vi.fn(), totalMemories: 3, isFocusMode: false, toggleFocusMode: vi.fn() };
    render(<AuthProvider><ThemeProvider><Sidebar {...basis} /></ThemeProvider></AuthProvider>);
    // Stufen-Modell (Damian 24.9.): die App heißt schlicht K3PTA. Seit
    // 09.10.2026 steht darunter auch kein Countdown und kein Werbe-Satz mehr —
    // es gibt weder einen gratis ersten Tag noch einen Schlüssel.
    expect(screen.getAllByText(/^K3PTA$/).length).toBeGreaterThan(0);
    expect(screen.getByText(/^local · private$/)).toBeTruthy();
    expect(screen.queryByText(/unlimited|key|limit/i)).toBeNull();
  });
});

// P61 (Leitung 5.11. 09:40:44 MEZ, Punkt 4, die andre Richtung der Herkunfts-Kante): der
// Audit-Export warf `Error("HTTP " + status)` in einen Fang, dessen Satz die Zahl nicht
// nennt -- und behauptete zusaetzlich, der Grund stehe in der Entwickler-Konsole, obwohl die
// eigne Tuer ihn auf der Flaeche haelt. Faelle zuerst: der Zahl-Fall ist vor dem Flicken rot,
// die Kontrolle ist in beiden Staenden gruen.
describe("P61: ein abgelehnter Audit-Export nennt die Zahl der eignen Tuer", () => {
  async function auditOffnen() {
    const user = userEvent.setup();
    mitToast(<ActivityView aktiv onOpenMemory={vi.fn()} />);
    await user.click(screen.getByRole("tab", { name: "Audit log" }));
    await screen.findByTestId("audit-list");
    return user;
  }

  it("nennt die 500 der Export-Tuer auf dem Schirm", async () => {
    stubFetch({
      "/api/agents": { body: { entries: [], agents: [] } },
      "/api/clients": { body: { clients: [] } },
      // ein Eintrag, sonst malt die Flaeche ihr Feld nicht und der Weg endet vor der Absage
      "/api/audit": { body: { entries: [{ id: 1, at: Date.now(), actor: "You", action: "save", target: "Notiz", detail: null }], more: false, actors: ["You"], actions: ["save"] } },
      "/api/audit/export.csv": { status: 500, body: { error: "storage unreadable" } },
    });
    const user = await auditOffnen();
    await user.click(screen.getByRole("button", { name: /Export CSV/i }));
    const grund = await waitFor(() => {
      const t = document.body.textContent || "";
      if (!/export did not run/i.test(t)) throw new Error(`die Absage fehlt: "${t.slice(0, 240)}"`);
      return t.replace(/\s+/g, " ");
    });
    expect(grund, "500 ist eine Antwort der eignen Tuer — sie gehoert auf den Schirm").toMatch(/HTTP 500/);
    expect(grund, "und der Satz verweist nicht mehr auf die Konsole, wenn die Zahl hier steht").not.toMatch(/developer console/i);
  });

  // KONTROLLE, in beiden Staenden gruen: ohne Antwort darf die Zeile weder eine Zahl erfinden
  // noch das Wort des Browsers zeigen.
  it("KONTROLLE: ein Export ohne jede Antwort bleibt ohne Zahl und ohne Fremd-Wortlaut", async () => {
    // Ein Eintrag in der Liste, sonst ist das Blatt leer und der Pruefweg findet sein Feld
    // nicht — der erste Versuch scheiterte an diesem Grund, nicht an der Absage.
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const ziel = String(url);
      if (ziel.includes("/api/audit/export.csv")) throw new TypeError("Failed to fetch");
      if (ziel.includes("/api/agents")) return new Response(JSON.stringify({ entries: [], agents: [] }), { status: 200 });
      if (ziel.includes("/api/clients")) return new Response(JSON.stringify({ clients: [] }), { status: 200 });
      if (ziel.includes("/api/audit")) return new Response(JSON.stringify({ entries: [{ id: 1, at: Date.now(), actor: "You", action: "save", target: "Notiz", detail: null }], more: false, actors: ["You"], actions: ["save"] }), { status: 200 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));
    const user = await auditOffnen();
    await user.click(screen.getByRole("button", { name: /Export CSV/i }));
    const grund = await waitFor(() => {
      const t = document.body.textContent || "";
      if (!/export did not run/i.test(t)) throw new Error(`die Absage fehlt: "${t.slice(0, 240)}"`);
      return t.replace(/\s+/g, " ");
    });
    expect(grund).not.toMatch(/HTTP \d/);
    expect(grund, "der Browser-Wortlaut bleibt beim Betreiber").not.toMatch(/Failed to fetch/i);
  });
});
