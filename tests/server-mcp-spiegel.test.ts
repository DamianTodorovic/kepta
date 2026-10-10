import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import request from "supertest";
import { KeptaStore } from "../src/core/store";

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
  vi.resetModules();
  ({ createApp } = await import("../server"));
});

afterEach(() => {
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
});

/** Ein eigener Server, weil beide Kanäle am selben Bestand sonst gegenseitig vorarbeiten. */
function instanz(markierung: string) {
  const store = new KeptaStore(path.join(dir, `spiegel-${markierung}.db`));
  return { store, app: createApp(store) };
}

interface McpErgebnis { content?: { text?: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean }

/** Der Agentenweg: POST /mcp, tools/call — genau die Tuer, die F1s Regeln schon hat. */
async function mcp(app: any, name: string, args: Record<string, unknown>): Promise<McpErgebnis> {
  const r = await request(app).post("/mcp").send({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
  return r.body.result as McpErgebnis;
}

/** Der HTTP-Spiegel antwortet mit dem Kern der Sache — der Vergleich braucht beide Formen. */
const fehlerText = (ergebnis: McpErgebnis) => String(ergebnis.content?.[0]?.text ?? "").replace(/^Error:\s*/, "");
const istFehler = (ergebnis: McpErgebnis) => ergebnis.isError === true;

/** N Dubletten mit gleichem Titel: die lexikalische Spur bildet Paare, die Kappe greift. */
async function dubletten(app: any, n: number, titel = "Frist Miller Quartalsrechnung") {
  for (let i = 0; i < n; i++) {
    await request(app).post("/api/memories").send({ title: titel, content: `Quartalsrechnung bis Ende Monat, Fassung ${i}.` });
  }
}

describe("A2-13 — die HTTP-Spiegel von consolidate und forget gehen durch dieselbe Regel wie der Agentenweg", () => {
  it("dryRun:false ohne Bestaetigung: beide Tueren verweigern, beide mit demselben Wortlaut", async () => {
    const a = instanz("cons-ko-a");
    const b = instanz("cons-ko-b");
    await dubletten(a.app, 4);
    await dubletten(b.app, 4);

    const spiegel = await request(a.app).post("/api/mcp/consolidate").send({ dryRun: false });
    const agent = await mcp(b.app, "memory_consolidate", { dryRun: false });

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
    const a = instanz("cons-ja-a");
    const b = instanz("cons-ja-b");
    await dubletten(a.app, 4);
    await dubletten(b.app, 4);

    const spiegel = await request(a.app).post("/api/mcp/consolidate").send({ dryRun: false, confirm: "supersede" });
    const agent = await mcp(b.app, "memory_consolidate", { dryRun: false, confirm: "supersede" });

    expect(spiegel.status).toBe(200);
    expect(istFehler(agent)).toBe(false);
    expect(spiegel.body).toMatchObject({ dryRun: false, applied: agent.structuredContent!.applied });
    expect(spiegel.body.applied).toBeGreaterThan(0);
    // Die Antwortform des Spiegels bleibt, wie sie war: diese drei Felder sind die Zusage.
    expect(Object.keys(spiegel.body).sort()).toEqual(["applied", "begrenzt", "candidates", "dryRun"]);
    expect(spiegel.body.candidates).toHaveLength((agent.structuredContent!.candidates as unknown[]).length);
  });

  it("die Kappe wird an beiden Tueren gesagt: begrenzt ist auf beiden Wegen da", async () => {
    const a = instanz("kappe-a");
    const b = instanz("kappe-b");
    // 33 Dubletten = 528 Paare, die Kappe sitzt bei 500 pro Aufruf.
    await dubletten(a.app, 33);
    await dubletten(b.app, 33);

    const spiegel = await request(a.app).post("/api/mcp/consolidate").send({});
    const agent = await mcp(b.app, "memory_consolidate", {});

    expect(spiegel.body.begrenzt).toBe(true);
    expect(agent.structuredContent!.begrenzt).toBe(true);
    expect(spiegel.body.candidates).toHaveLength(500);
    expect((agent.structuredContent!.candidates as unknown[]).length).toBe(500);
  });

  it("forget supersede ohne Nachfolger: beide Tueren verweigern, keine Kette ins Leere", async () => {
    const a = instanz("fg-a");
    const b = instanz("fg-b");
    const idA = (await request(a.app).post("/api/memories").send({ title: "Alt A", content: "Inhalt mit Substanz." })).body.memory.id;
    const idB = (await request(b.app).post("/api/memories").send({ title: "Alt B", content: "Inhalt mit Substanz." })).body.memory.id;

    const spiegel = await request(a.app).post("/api/mcp/forget").send({ id: idA, mode: "supersede" });
    const agent = await mcp(b.app, "memory_forget", { id: idB, mode: "supersede" });

    expect(spiegel.status, "der Spiegel tat so, als waere ersetzt — ohne Nachfolger").toBe(400);
    expect(istFehler(agent)).toBe(true);
    expect(spiegel.body.error).toBe(fehlerText(agent));
    expect(a.store.getMemory(idA)!.supersededBy).toBeNull();
    expect(b.store.getMemory(idB)!.supersededBy).toBeNull();
  });

  it("private id: beide Tueren nennen exakt denselben Wortlaut wie fuer unbekannt", async () => {
    const a = instanz("priv-a");
    const b = instanz("priv-b");
    const privat = (await request(a.app).post("/api/memories").send({ title: "Privat", content: "884433geheim", scope: "private" })).body.memory.id;

    const spiegel = await request(a.app).post("/api/mcp/forget").send({ id: privat, mode: "expire" });
    const agent = await mcp(b.app, "memory_forget", { id: privat, mode: "expire" });
    const unbekanntSpiegel = await request(a.app).post("/api/mcp/forget").send({ id: "gibt-es-nicht", mode: "expire" });
    const unbekanntAgent = await mcp(b.app, "memory_forget", { id: "gibt-es-nicht", mode: "expire" });

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
    const a = instanz("exp-a");
    const b = instanz("exp-b");
    const idA = (await request(a.app).post("/api/memories").send({ title: "Preisliste", content: "Gueltig bis Widerruf." })).body.memory.id;
    const idB = (await request(b.app).post("/api/memories").send({ title: "Preisliste", content: "Gueltig bis Widerruf." })).body.memory.id;

    const spiegel = await request(a.app).post("/api/mcp/forget").send({ id: idA, mode: "expire" });
    const agent = await mcp(b.app, "memory_forget", { id: idB, mode: "expire" });

    expect(spiegel.status).toBe(200);
    expect(spiegel.body).toEqual({ forgotten: true, mode: "expire" });
    expect(agent.structuredContent).toEqual(spiegel.body);
    expect(a.store.getMemory(idA)!.validTo).not.toBeNull();
  });

  it("eine unbekannte mode: beide Tueren lehnen mit demselben Satz", async () => {
    const a = instanz("mode-a");
    const b = instanz("mode-b");
    const idA = (await request(a.app).post("/api/memories").send({ title: "Modus", content: "Inhalt mit Substanz." })).body.memory.id;
    const idB = (await request(b.app).post("/api/memories").send({ title: "Modus", content: "Inhalt mit Substanz." })).body.memory.id;

    const spiegel = await request(a.app).post("/api/mcp/forget").send({ id: idA, mode: "vergissbitte" });
    const agent = await mcp(b.app, "memory_forget", { id: idB, mode: "vergissbitte" });

    expect(spiegel.status).toBe(400);
    expect(spiegel.body.error).toBe(fehlerText(agent));
  });
  it("die Engine-Klammer gilt an beiden Tueren: threshold:0 wird auf beiden Wegen abgelehnt", async () => {
    // Die Leitung hatte das schon als schuetzend notiert; gepinnt wird es jetzt, weil
    // eine Regel, die nur an einer Tuer gilt, keine Regel ist.
    const a = instanz("klammer-a");
    const b = instanz("klammer-b");
    await dubletten(a.app, 4);
    await dubletten(b.app, 4);
    const spiegel = await request(a.app).post("/api/mcp/consolidate").send({ dryRun: false, threshold: 0, confirm: "supersede" });
    const agent = await mcp(b.app, "memory_consolidate", { dryRun: false, threshold: 0, confirm: "supersede" });
    expect(spiegel.status).toBe(400);
    expect(istFehler(agent)).toBe(true);
    expect(spiegel.body.error).toBe(fehlerText(agent));
    expect(String(spiegel.body.error)).toMatch(/threshold must be in \(0, 1\]/);
    expect(a.store.listMemories({ limit: 50 }).some((m: any) => m.supersededBy)).toBe(false);
    expect(b.store.listMemories({ limit: 50 }).some((m: any) => m.supersededBy)).toBe(false);
  });
});
