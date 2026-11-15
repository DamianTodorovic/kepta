// @vitest-environment node
//
// Die Wache um jeden MCP-Aufruf: private Notizen sieht keine KI-App und keine
// kann sie ändern; Passwörter, Schlüssel, Karten und IBANs werden zu
// Platzhaltern, und was eine App zurückschreibt, behält die echten Werte. Im
// Protokoll steht genau, was die App bekam.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../../src/core/store";
import { saveWithIndex, type McpContext, type JsonRpcRequest } from "../../src/core/mcp";
import { bearbeiteMcp, beiVerbindung, nachWerkzeug, vorWerkzeug, ladeSchutz, PRIVAT_MELDUNG } from "../../src/lib/mcpwache";
import { liste } from "../../src/lib/pruefprotokoll";
import { letzteAktivitaet } from "../../src/lib/aktivitaet";
import { SCHILD_SCHLUESSEL } from "../../src/lib/schild";

let store: KeptaStore;
let ctx: McpContext;
let offen: { id: string };
let geheim: { id: string };
const ORIGINAL = "Host db.intern, password: Hunter2!x, mail ops@example.com";

beforeEach(() => {
  store = new KeptaStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kepta-wache-")), "t.db"));
  offen = saveWithIndex(store, { title: "Server access", content: ORIGINAL }).record;
  geheim = saveWithIndex(store, { title: "Blood test", content: "Blood test results from the lab: all fine.", scope: "private" }).record;
  ctx = { store, transport: "stdio", melde: beiVerbindung(store) };
});
afterEach(() => store.close());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = async (id: number, method: string, params?: unknown, extra: Record<string, unknown> = {}): Promise<any> => bearbeiteMcp(ctx, { jsonrpc: "2.0", id, method, params, ...extra } as JsonRpcRequest);
const werkzeug = (id: number, name: string, args: Record<string, unknown> = {}) => rpc(id, "tools/call", { name, arguments: args });

describe("Wache: private Notizen", () => {
  it("die Notiz ist wirklich privat gespeichert", () => {
    expect(store.getMemory(geheim.id)!.scope).toBe("private");
  });

  it("tauchen nicht in Suche und Liste auf", async () => {
    const suche = await werkzeug(1, "memory_search", { query: "blood test results" });
    expect(suche.result.structuredContent.hits.map((h: { title: string }) => h.title)).not.toContain("Blood test");
    expect(suche.result.content[0].text).not.toContain("Blood");
    const alle = await werkzeug(2, "memory_list");
    expect(alle.result.structuredContent).toMatchObject({ count: 1, total: 1 });
    expect(alle.result.structuredContent.memories.map((m: { title: string }) => m.title)).toEqual(["Server access"]);
  });

  it("kann keine KI-App ändern, löschen oder vergessen lassen", async () => {
    for (const [name, args] of [
      ["memory_update", { id: geheim.id, content: "überschrieben" }],
      ["memory_delete", { id: geheim.id }],
      ["memory_forget", { id: geheim.id }],
      ["memory_save", { id: geheim.id, title: "x", content: "y" }],
      ["memory_forget", { id: offen.id, mode: "supersede", supersedeBy: geheim.id }],
    ] as const) {
      const r = await werkzeug(1, name, args);
      expect(r.result, name).toEqual({ content: [{ type: "text", text: PRIVAT_MELDUNG }], isError: true });
    }
    expect(store.getMemory(geheim.id)).toMatchObject({ content: "Blood test results from the lab: all fine.", deletedAt: null, validTo: null });
    expect(store.getMemory(offen.id)!.supersededBy).toBeNull();
  });
});

describe("Wache: Geheimnisse", () => {
  it("werden zu Platzhaltern — und was die App zurückschreibt, behält die echten Werte", async () => {
    const suche = await werkzeug(1, "memory_search", { query: "server access" });
    const treffer = suche.result.structuredContent.hits.find((h: { id: string }) => h.id === offen.id);
    expect(treffer.content).toBe("Host db.intern, password: [SECRET-1], mail ops@example.com");
    expect(suche.result.content[0].text).not.toContain("Hunter2");
    await werkzeug(2, "memory_update", { id: offen.id, content: `${treffer.content} Port 5432` });
    expect(store.getMemory(offen.id)!.content).toBe(`${ORIGINAL} Port 5432`);
  });

  it("mit ausgeschaltetem Schutz sehen Apps die Werte — private Notizen bleiben trotzdem privat", async () => {
    store.setzeEinstellungen({ [SCHILD_SCHLUESSEL]: JSON.stringify({ chat: true, apps: false }) });
    const alle = await werkzeug(1, "memory_list");
    expect(alle.result.structuredContent.memories).toEqual([expect.objectContaining({ title: "Server access", content: ORIGINAL })]);
  });
});

describe("Wache: Protokoll", () => {
  it("Aktivität und Prüfprotokoll zeigen genau, was die App bekam", async () => {
    await rpc(1, "initialize", { protocolVersion: "2025-06-18", clientInfo: { name: "claude-ai" } });
    await werkzeug(2, "memory_search", { query: "blood test results server access" });
    const eintraege = liste(store).entries.reverse();
    expect(eintraege.map((e) => [e.actor, e.action])).toEqual([
      ["Claude", "connect"],
      ["Claude", "search"],
    ]);
    expect(eintraege[1]!.detail).toContain(offen.id);
    expect(eintraege[1]!.detail).not.toContain(geheim.id);
    expect(letzteAktivitaet(store).map((a) => [a.tool, a.count])).toEqual([
      ["memory_search", 1],
      ["connect", null],
    ]);
  });

  it("nennt eine App, die sich erst im Aufruf vorstellt (zustandslos), beim Namen", async () => {
    await rpc(1, "tools/call", { name: "memory_list", arguments: {} }, { _meta: { clientInfo: { name: "cursor-vscode" } } });
    expect(liste(store).entries[0]!.actor).toBe("Cursor");
  });

  it("andere Anfragen laufen unverändert durch", async () => {
    expect((await rpc(1, "tools/list")).result.tools).toHaveLength(8);
    expect((await rpc(2, "ping")).result).toEqual({});
    expect(liste(store).entries).toEqual([]);
  });
});

describe("Wache: Einzelteile", () => {
  const schutz = () => ladeSchutz(store);

  it("vorWerkzeug lässt unbekannte Notizen und fremde Werkzeuge in Ruhe", () => {
    expect(vorWerkzeug("memory_update", { id: "gibt-es-nicht", content: "x" }, store, schutz())).toEqual({ args: { id: "gibt-es-nicht", content: "x" } });
    expect(vorWerkzeug("memory_search", { query: "x" }, store, schutz())).toEqual({ args: { query: "x" } });
  });

  it("nachWerkzeug filtert Graph und Konsolidierung, lässt Fehler und Unbekanntes durch", () => {
    const s = schutz();
    const graph = nachWerkzeug("memory_graph", {}, { structuredContent: { entities: [{ name: "blood test" }, { name: "server" }], relations: [{ source: "server", target: "blood test", relation: "references" }] } }, s);
    expect(graph.structuredContent).toEqual({ entities: [{ name: "server" }], relations: [] });
    const kons = nachWerkzeug("memory_consolidate", {}, { structuredContent: { candidates: [{ keepId: offen.id, duplicateId: geheim.id }, { keepId: "a", duplicateId: "b" }] } }, s);
    expect(kons.structuredContent!.candidates).toEqual([{ keepId: "a", duplicateId: "b" }]);
    const fehler = { content: [], isError: true };
    expect(nachWerkzeug("memory_search", {}, fehler, s)).toBe(fehler);
    const fremd = { structuredContent: { x: 1 } };
    expect(nachWerkzeug("memory_other", {}, fremd, s)).toBe(fremd);
    expect(nachWerkzeug("memory_save", {}, { structuredContent: { memory: { id: geheim.id, title: "t" } } }, s).structuredContent!.memory).toBeNull();
    expect(nachWerkzeug("memory_list", { trash: true }, { structuredContent: { memories: [], total: 4 } }, s).structuredContent!.total).toBe(4);
  });
});
