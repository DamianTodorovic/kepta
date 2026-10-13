import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import request from "supertest";
import { KeptaStore } from "../src/core/store";
import { hoererDerDatei, type DateiHoerer } from "./helfer/hoerer";
import { anlage } from "./helfer/anlage";

// server.ts nur importieren, nachdem AUTOSTART gesetzt ist.
process.env.KEPTA_NO_AUTOSTART = "1";

let createApp: (store: KeptaStore) => import("express").Express;
let dir: string;
let prevHome: string | undefined;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-spiegel-"));
  prevHome = process.env.HOME;
  process.env.HOME = dir;
  process.env.KEPTA_DATA_DIR = dir;
  // Die zwei Tueren vergleichen nur, wenn beide denselben RAHMEN haben, und der Rahmen
  // steht in der Prozess-Umwelt: `KEPTA_MAX_ACTIVE` (server.ts:431, bei JEDEM Schreiblauf
  // gelesen; eine kleine Kappe beantwortet den funften create mit 429) und
  // `KEPTA_WRITE_GATE` (server.ts:~906; an, kann ein create zu einem update werden lassen
  // und antwortet trotzdem 200, oder es ganz ablehnen — wieder 200). Vitest faehrt
  // Dateien in wiederverwendeten Forks (`pool: "forks"`, `fileParallelism: true`), und
  // `vi.stubEnv` aus einer Nachbardatei wirkt weiter, wenn sie nicht zurueckgebaut wird:
  // andere Dateien dieser Suite setzen beide Werte (`tests/server.test.ts:145,170`,
  // `tests/import-*.test.ts`, `tests/engine.test.ts:451,471`, `tests/mcp.test.ts:326`).
  // Ein Fall, der eine Umwelt erbt, die er nicht gesetzt hat, vergleicht am Ende zwei
  // Bestaende, die nie dieselben waren — gemeldet als Tuer-Streit (12.10., 16:04:17 und
  // 20:31, im Alleinlauf nie). Also: was dieser Fall braucht, setzt er selbst.
  vi.stubEnv("KEPTA_MAX_ACTIVE", "5000");
  vi.stubEnv("KEPTA_WRITE_GATE", "");
  vi.resetModules();
  ({ createApp } = await import("../server"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
});

// Zwei Horcher, keiner je Anfrage: diese Datei vergleicht zwei Tueren an zwei
// Bestaenden, also braucht sie zwei Stapel — aber dieselben zwei Zahlen in jedem
// Lauf (`tests/helfer/port-vergabe.ts`: HORCHENDE_KENNUNGEN, Slot `#b`). Der
// Nachbau vom 13.10. verlor eine offene Kette an einen fremden v4-Hoerer; ein
// Horcher, der einmal horcht und auf 127.0.0.1 gebunden ist, kann nicht verloren
// gehen (`tests/helfer/hoerer.ts`).
let hoererA: DateiHoerer;
let hoererB: DateiHoerer;

beforeAll(async () => {
  hoererA = await hoererDerDatei("tests/server-mcp-spiegel.test.ts");
  hoererB = await hoererDerDatei("tests/server-mcp-spiegel.test.ts#b");
});

afterAll(async () => {
  await hoererA.schliesse();
  await hoererB.schliesse();
});

/**
 * Ein eigener Bestand je Tuer, weil beide Kanäle am selben Bestand sonst
 * gegenseitig vorarbeiten. Seit der Horcher-Welle (13.10.) ist die Tuer kein
 * Server-Objekt mehr, das je Anfrage neu horcht, sondern der langlebige Horcher
 * ihres Slots: `tuere` "a" und "b" sind die beiden Kennungen aus der Vergabe.
 */
function instanz(markierung: string, tuere: "a" | "b") {
  const store = new KeptaStore(path.join(dir, `spiegel-${markierung}.db`));
  const hoerer = tuere === "a" ? hoererA : hoererB;
  hoerer.gebeApp(createApp(store));
  return { store, url: hoerer.url, markierung };
}

interface McpErgebnis { content?: { text?: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean }

/** Der Agentenweg: POST /mcp, tools/call — genau die Tuer, die F1s Regeln schon hat. */
async function mcp(url: string, name: string, args: Record<string, unknown>): Promise<McpErgebnis> {
  const r = await request(url).post("/mcp").send({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
  return r.body.result as McpErgebnis;
}

/** Der HTTP-Spiegel antwortet mit dem Kern der Sache — der Vergleich braucht beide Formen. */
const fehlerText = (ergebnis: McpErgebnis) => String(ergebnis.content?.[0]?.text ?? "").replace(/^Error:\s*/, "");
const istFehler = (ergebnis: McpErgebnis) => ergebnis.isError === true;

/**
 * N Dubletten mit gleichem Titel: die lexikalische Spur bildet Paare, die Kappe greift.
 *
 * Der Status JEDES Schreiblaufs wird geprueft, nicht nur geschickt. Grund, in eigenen
 * Worten: dieser Fall vergleichte zwei Tueren an zwei Bestaenden, und die Antwort der
 * Tueren ist eine Funktion dessen, was im Bestand liegt. Ging eine Schreibphase verloren,
 * streiten die Tueren um eine Zahl, die nie dieselbe Grundlage hatte — gemeldet wurde das
 * als Regelunterschied (`expected applied 3 to match applied 2`, 12.10. im Parallelhaufen
 * um 16:04:17 und 20:31, im Alleinlauf nie), weil `dubletten` die Antwort weggeworfen hat.
 * `schlechtBei` setzt eine Schreibphase absichtlich in den Ablehnungsfall; der Weg ist die
 * Gegenprobe, dass diese Wache etwas findet.
 */
async function dubletten(url: string, n: number, titel = "Frist Miller Quartalsrechnung", schlechtBei = -1) {
  const verloren: string[] = [];
  for (let i = 0; i < n; i++) {
    const nutzlaut = i === schlechtBei ? { title: "", content: "" } : { title: titel, content: `Quartalsrechnung bis Ende Monat, Fassung ${i}.` };
    const antwort = await request(url).post("/api/memories").send(nutzlaut);
    if (antwort.status !== 200 && antwort.status !== 201) {
      verloren.push(`Schreiblauf ${i}: ${antwort.status} ${JSON.stringify(antwort.body).slice(0, 200)}`);
    }
  }
  expect(verloren, `${n} Dubletten bestellt, ${verloren.length} Schreiblauf/-laeufe abgewiesen — die Grundlage der Tueren ist damit nicht dieselbe: ${verloren.join(" | ")}`).toEqual([]);
}

/** Beide Bestaende muessen gleich aussehen, bevor zwei Tueren vergleichen werden. */
function gleicheGrundlage(a: { store: KeptaStore }, b: { store: KeptaStore }, erwartet: number) {
  const aktivA = a.store.countMemories().active;
  const aktivB = b.store.countMemories().active;
  expect(
    [aktivA, aktivB],
    `die zwei Bestaende fassen unterschiedlich viele lebende Notizen (${aktivA} gegen ${aktivB}, erwartet ${erwartet} je Seite) — ein Tuer-Vergleich waehlt hier die Regel, nicht die Grundlage`
  ).toEqual([erwartet, erwartet]);
}

describe("A2-13 — die HTTP-Spiegel von consolidate und forget gehen durch dieselbe Regel wie der Agentenweg", () => {
  it("dryRun:false ohne Bestaetigung: beide Tueren verweigern, beide mit demselben Wortlaut", async () => {
    const a = instanz("cons-ko-a", "a");
    const b = instanz("cons-ko-b", "b");
    await dubletten(a.url, 4);
    await dubletten(b.url, 4);
    gleicheGrundlage(a, b, 4);

    const spiegel = await request(a.url).post("/api/mcp/consolidate").send({ dryRun: false });
    const agent = await mcp(b.url, "memory_consolidate", { dryRun: false });

    expect(spiegel.status, "der Spiegel hat ohne Bestaetigung angewendet").toBe(400);
    expect(istFehler(agent)).toBe(true);
    expect(spiegel.body.error).toBe(fehlerText(agent));
    expect(String(spiegel.body.error)).toMatch(/confirm:"supersede"/);
    // Und es wurde nichts angewendet — an beiden Tueren.
    expect(a.store.countMemories().active).toBe(4);
    expect(a.store.listMemories({ limit: 50 }).some((m: any) => m.supersededBy)).toBe(false);
    expect(b.store.listMemories({ limit: 50 }).some((m: any) => m.supersededBy)).toBe(false);
  });

  it("mit confirm:supersede: beide Tueren wenden an und melden dieselbe Zahl", async () => {
    const a = instanz("cons-ja-a", "a");
    const b = instanz("cons-ja-b", "b");
    await dubletten(a.url, 4);
    await dubletten(b.url, 4);
    gleicheGrundlage(a, b, 4);

    const spiegel = await request(a.url).post("/api/mcp/consolidate").send({ dryRun: false, confirm: "supersede" });
    const agent = await mcp(b.url, "memory_consolidate", { dryRun: false, confirm: "supersede" });

    expect(spiegel.status).toBe(200);
    expect(istFehler(agent)).toBe(false);
    expect(spiegel.body).toMatchObject({ dryRun: false, applied: agent.structuredContent!.applied });
    expect(spiegel.body.applied).toBeGreaterThan(0);
    // Die Antwortform des Spiegels bleibt, wie sie war: diese drei Felder sind die Zusage.
    expect(Object.keys(spiegel.body).sort()).toEqual(["applied", "begrenzt", "candidates", "dryRun"]);
    expect(spiegel.body.candidates).toHaveLength((agent.structuredContent!.candidates as unknown[]).length);
  });

  it("die Kappe wird an beiden Tueren gesagt: begrenzt ist auf beiden Wegen da", async () => {
    const a = instanz("kappe-a", "a");
    const b = instanz("kappe-b", "b");
    // 33 Dubletten = 528 Paare, die Kappe sitzt bei 500 pro Aufruf.
    await dubletten(a.url, 33);
    await dubletten(b.url, 33);
    gleicheGrundlage(a, b, 33);

    const spiegel = await request(a.url).post("/api/mcp/consolidate").send({});
    const agent = await mcp(b.url, "memory_consolidate", {});

    expect(spiegel.body.begrenzt).toBe(true);
    expect(agent.structuredContent!.begrenzt).toBe(true);
    expect(spiegel.body.candidates).toHaveLength(500);
    expect((agent.structuredContent!.candidates as unknown[]).length).toBe(500);
  });

  it("ein verlorener Schreiblauf wird benannt, bevor zwei Tueren verglichen werden", async () => {
    // Die Gegenprobe, dass `dubletten` etwas findet: die Kappe, die ein Nachbar in der
    // Prozess-Umwelt hinterlassen kann, wird hier gesetzt (server.ts:431 liest sie bei
    // JEDEM Schreiblauf). Fuenf bestellte Dubletten, Kappe 3: die erste bis vierte geht
    // durch (geprueft wird vor dem Schreiben: 3 > 3 ist falsch), die fuenfte wird mit 429
    // beantwortet — und genau die warf der Helfer frueher weg.
    const a = instanz("ver-a", "a");
    vi.stubEnv("KEPTA_MAX_ACTIVE", "3");
    let meldung = "";
    try {
      await dubletten(a.url, 5);
    } catch (e) {
      meldung = String((e as Error).message);
    }
    expect(meldung, "der Helfer liess eine abgewiesene Schreibphase laufen — dann ist der Schutz nicht da").toMatch(/Schreiblauf 4: 429/);
    expect(a.store.countMemories().active).toBe(4);
  });

  it("derselbe Streit, absichtlich gemacht: die Zahl trennt an der Grundlage, nicht an der Regel", async () => {
    // Was am 12.10. im Parallelhaufen als Tuer-Streit erschien (applied 3 gegen applied 2),
    // ist ohne einen fremden Läufer reproduzierbar: zwei Bestaende mit 4 und mit 3 Dubletten.
    // Die Regel ist dieselbe an beiden Tueren — die Zahl folgt den Paaren im Bestand.
    const a = instanz("str-a", "a");
    const b = instanz("str-b", "b");
    await dubletten(a.url, 4);
    await dubletten(b.url, 3);
    const spiegel = await request(a.url).post("/api/mcp/consolidate").send({ dryRun: false, confirm: "supersede" });
    const agent = await mcp(b.url, "memory_consolidate", { dryRun: false, confirm: "supersede" });
    expect(spiegel.body.applied).toBe(3);
    expect(agent.structuredContent!.applied).toBe(2);
    expect(() => gleicheGrundlage(a, b, 4)).toThrow(/unterschiedlich viele lebende Notizen \(4 gegen 3/);
  });

  it("forget supersede ohne Nachfolger: beide Tueren verweigern, keine Kette ins Leere", async () => {
    const a = instanz("fg-a", "a");
    const b = instanz("fg-b", "b");
    const idA = anlage(await request(a.url).post("/api/memories").send({ title: "Alt A", content: "Inhalt mit Substanz." }), "Anlage idA").body.memory.id;
    const idB = anlage(await request(b.url).post("/api/memories").send({ title: "Alt B", content: "Inhalt mit Substanz." }), "Anlage idB").body.memory.id;

    const spiegel = await request(a.url).post("/api/mcp/forget").send({ id: idA, mode: "supersede" });
    const agent = await mcp(b.url, "memory_forget", { id: idB, mode: "supersede" });

    expect(spiegel.status, "der Spiegel tat so, als waere ersetzt — ohne Nachfolger").toBe(400);
    expect(istFehler(agent)).toBe(true);
    expect(spiegel.body.error).toBe(fehlerText(agent));
    expect(a.store.getMemory(idA)!.supersededBy).toBeNull();
    expect(b.store.getMemory(idB)!.supersededBy).toBeNull();
  });

  it("private id: beide Tueren nennen exakt denselben Wortlaut wie fuer unbekannt", async () => {
    const a = instanz("priv-a", "a");
    const b = instanz("priv-b", "b");
    const privat = anlage(await request(a.url).post("/api/memories").send({ title: "Privat", content: "884433geheim", scope: "private" }), "Anlage privat").body.memory.id;

    const spiegel = await request(a.url).post("/api/mcp/forget").send({ id: privat, mode: "expire" });
    const agent = await mcp(b.url, "memory_forget", { id: privat, mode: "expire" });
    const unbekanntSpiegel = await request(a.url).post("/api/mcp/forget").send({ id: "gibt-es-nicht", mode: "expire" });
    const unbekanntAgent = await mcp(b.url, "memory_forget", { id: "gibt-es-nicht", mode: "expire" });

    // Der Wortlaut ist die Maske, nicht der Satz mit id: die id hat der Aufrufer
    // selbst gesetzt, also verraeht ihr Zurueckgeben nichts. Verglichen wird die
    // Form, indem beide ids auf denselben Platzhalter gesetzt werden.
    const maske = (text: string, id: string) => String(text).split(id).join("<id>");
    expect(spiegel.status).toBe(unbekanntSpiegel.status);
    expect(maske(spiegel.body.error, privat)).toBe(maske(unbekanntSpiegel.body.error, "gibt-es-nicht"));
    expect(maske(fehlerText(agent), privat)).toBe(maske(fehlerText(unbekanntAgent), "gibt-es-nicht"));
    expect(spiegel.body.error).toBe(fehlerText(agent));
    expect(String(spiegel.body.error)).toMatch(/^Memory not found: /);
    // Und die private Notiz bleibt, wo sie war.
    expect(a.store.getMemory(privat)!.validTo).toBeNull();
  });

  it("forget expire: die Erfolgsmeldung des Spiegels bleibt formgleich mit dem Agentenkanal", async () => {
    const a = instanz("exp-a", "a");
    const b = instanz("exp-b", "b");
    const idA = anlage(await request(a.url).post("/api/memories").send({ title: "Preisliste", content: "Gueltig bis Widerruf." }), "Anlage idA").body.memory.id;
    const idB = anlage(await request(b.url).post("/api/memories").send({ title: "Preisliste", content: "Gueltig bis Widerruf." }), "Anlage idB").body.memory.id;

    const spiegel = await request(a.url).post("/api/mcp/forget").send({ id: idA, mode: "expire" });
    const agent = await mcp(b.url, "memory_forget", { id: idB, mode: "expire" });

    expect(spiegel.status).toBe(200);
    expect(spiegel.body).toEqual({ forgotten: true, mode: "expire" });
    expect(agent.structuredContent).toEqual(spiegel.body);
    expect(a.store.getMemory(idA)!.validTo).not.toBeNull();
  });

  it("eine unbekannte mode: beide Tueren lehnen mit demselben Satz", async () => {
    const a = instanz("mode-a", "a");
    const b = instanz("mode-b", "b");
    const idA = anlage(await request(a.url).post("/api/memories").send({ title: "Modus", content: "Inhalt mit Substanz." }), "Anlage idA").body.memory.id;
    const idB = anlage(await request(b.url).post("/api/memories").send({ title: "Modus", content: "Inhalt mit Substanz." }), "Anlage idB").body.memory.id;

    const spiegel = await request(a.url).post("/api/mcp/forget").send({ id: idA, mode: "vergissbitte" });
    const agent = await mcp(b.url, "memory_forget", { id: idB, mode: "vergissbitte" });

    expect(spiegel.status).toBe(400);
    expect(spiegel.body.error).toBe(fehlerText(agent));
  });
  it("die Engine-Klammer gilt an beiden Tueren: threshold:0 wird auf beiden Wegen abgelehnt", async () => {
    // Die Leitung hatte das schon als schuetzend notiert; gepinnt wird es jetzt, weil
    // eine Regel, die nur an einer Tuer gilt, keine Regel ist.
    const a = instanz("klammer-a", "a");
    const b = instanz("klammer-b", "b");
    await dubletten(a.url, 4);
    await dubletten(b.url, 4);
    const spiegel = await request(a.url).post("/api/mcp/consolidate").send({ dryRun: false, threshold: 0, confirm: "supersede" });
    const agent = await mcp(b.url, "memory_consolidate", { dryRun: false, threshold: 0, confirm: "supersede" });
    expect(spiegel.status).toBe(400);
    expect(istFehler(agent)).toBe(true);
    expect(spiegel.body.error).toBe(fehlerText(agent));
    expect(String(spiegel.body.error)).toMatch(/threshold must be in \(0, 1\]/);
    expect(a.store.listMemories({ limit: 50 }).some((m: any) => m.supersededBy)).toBe(false);
    expect(b.store.listMemories({ limit: 50 }).some((m: any) => m.supersededBy)).toBe(false);
  });
});
