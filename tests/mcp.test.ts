import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";
import { handleRpc, TOOLS, LATEST_PROTOCOL_VERSION, SERVER_INFO, extractWikiLinks, negotiateVersion, type JsonRpcRequest, type JsonRpcResponse } from "../src/core/mcp";
import { indexMemory, consolidateMemories } from "../src/core/engine";
import { DEFAULT_EMBED_MODEL } from "../src/core/embeddings";
import { APP_VERSION } from "../src/core/version";

interface ToolResult {
  content: { type: string; text: string }[];
  structuredContent: Record<string, unknown>;
  isError?: boolean;
}

function asResult(res: JsonRpcResponse | null): Record<string, unknown> {
  if (!res || !("result" in res)) throw new Error("Erwartete JSON-RPC-Ergebnis-Antwort");
  return res.result;
}
function asError(res: JsonRpcResponse | null): { code: number; message: string } {
  if (!res || !("error" in res) || !res.error) throw new Error("Erwartete JSON-RPC-Fehler-Antwort");
  return res.error;
}
function asTool(res: JsonRpcResponse | null): ToolResult {
  return asResult(res) as unknown as ToolResult;
}

function freshStore(): KeptaStore {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-mcp-"));
  return new KeptaStore(path.join(dir, "test.db"));
}

async function rpc(store: KeptaStore, method: string, params?: Record<string, unknown>, id: string | number = 1) {
  const req: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
  return handleRpc({ store, transport: "stdio" }, req);
}

describe("MCP-Protokoll", () => {
  let store: KeptaStore;
  beforeEach(() => {
    store = freshStore();
  });

  it("initialize verhandelt 2026-07-28 und Legacy-Versionen", async () => {
    expect(asResult(await rpc(store, "initialize", { protocolVersion: "2026-07-28" })).protocolVersion).toBe("2026-07-28");
    expect(asResult(await rpc(store, "initialize", { protocolVersion: "2024-11-05" })).protocolVersion).toBe("2024-11-05");
    // Unbekannte Version → nie neuer als erfragt, sonst bricht der Client ab
    expect(asResult(await rpc(store, "initialize", { protocolVersion: "1999-01-01" })).protocolVersion).toBe("2024-11-05");
    expect(asResult(await rpc(store, "initialize", { protocolVersion: "2025-03-26" })).protocolVersion).toBe("2024-11-05");
  });

  it("server/discover liefert Server-Info + alle Tools (stateless core)", async () => {
    const res = asResult(await rpc(store, "server/discover"));
    expect(res.serverInfo).toEqual({ name: "kepta", title: "KEPTA — Agent Memory", version: APP_VERSION });
    expect(SERVER_INFO.version).toBe(APP_VERSION);
    const tools = res.tools as typeof TOOLS;
    expect(tools).toHaveLength(8);
    for (const t of tools) {
      expect(t.inputSchema).toBeDefined();
      expect(t.outputSchema).toBeDefined();
    }
  });

  it("tools/list ist deterministisch und vollständig", async () => {
    const tools = asResult(await rpc(store, "tools/list")).tools as { name: string }[];
    expect(tools.map((t) => t.name)).toEqual([
      "memory_search",
      "memory_save",
      "memory_update",
      "memory_delete",
      "memory_list",
      "memory_graph",
      "memory_consolidate",
      "memory_forget",
    ]);
  });

  it("unbekannte Methode → -32601, Notification ohne id → null", async () => {
    expect(asError(await rpc(store, "nope/xyz")).code).toBe(-32601);
    const silent = await handleRpc({ store, transport: "stdio" }, { jsonrpc: "2.0", method: "notifications/initialized" });
    expect(silent).toBeNull();
  });

  it("fehlendes jsonrpc-Feld wird als 2.0 behandelt, falscher Wert → -32600", async () => {
    // fehlend → tolerieren (ältere Clients)
    const ok = await handleRpc({ store, transport: "stdio" }, { id: 1, method: "ping" } as JsonRpcRequest);
    expect(asResult(ok)).toEqual({});
    // falscher Wert → Invalid Request
    const bad = await handleRpc({ store, transport: "stdio" }, { jsonrpc: "1.0", id: 2, method: "ping" } as unknown as JsonRpcRequest);
    expect(asError(bad).code).toBe(-32600);
  });

  it("Notification für unbekannte Methode → KEINE Response (null statt Error mit id:null)", async () => {
    const silent = await handleRpc({ store, transport: "stdio" }, { jsonrpc: "2.0", method: "nope/notification" });
    expect(silent).toBeNull();
  });

  it("memory_search mit nicht-numerischem limit nutzt sauberen Default 10 statt NaN", async () => {
    for (let i = 0; i < 3; i++) store.createMemory({ title: `Rust Treffer ${i}`, content: "Speichersicherheit" });
    const res = asTool(await rpc(store, "tools/call", { name: "memory_search", arguments: { query: "Speichersicherheit", limit: "kaputt" } }));
    const hits = res.structuredContent.hits as unknown[];
    expect(hits.length).toBeGreaterThan(0); // NaN würde alle Treffer filtern
  });

  it("memory_list mit nicht-numerischem limit/offset fällt auf Defaults zurück", async () => {
    store.createMemory({ title: "L", content: "x" });
    const res = asTool(await rpc(store, "tools/call", { name: "memory_list", arguments: { limit: "quatsch", offset: "quatsch" } }));
    expect((res.structuredContent.memories as unknown[]).length).toBe(1);
  });
});

describe("MCP-Tools", () => {
  let store: KeptaStore;
  beforeEach(() => {
    store = freshStore();
  });

  it("Privatheits-Floor: private Notizen verlassen KEPTA nie über MCP — auch nicht per scope-Anfrage", async () => {
    store.createMemory({ title: "Offen zugänglich", content: "Normale Notiz", tags: ["offen"] });
    store.createMemory({ title: "Privat!", content: "Steuer-ID 12345", scope: "private" });

    const search = asTool(await rpc(store, "tools/call", { name: "memory_search", arguments: { query: "Steuer-ID" } }));
    expect(search.structuredContent.count).toBe(0);
    // Der Agent fragt explizit nach dem privaten Scope — der Floor hält trotzdem:
    const listPrivat = asTool(await rpc(store, "tools/call", { name: "memory_list", arguments: { scope: "private" } }));
    expect((listPrivat.structuredContent.memories as unknown[]).length).toBe(0);
    // Offene Notizen bleiben sichtbar:
    const list = asTool(await rpc(store, "tools/call", { name: "memory_list", arguments: {} }));
    expect((list.structuredContent.memories as { title: string }[]).map((m) => m.title)).toEqual(["Offen zugänglich"]);
    // Und in der Suche bleibt sie auffindbar:
    const searchOffen = asTool(await rpc(store, "tools/call", { name: "memory_search", arguments: { query: "Normale Notiz" } }));
    expect(searchOffen.structuredContent.count).toBe(1);
  });

  it("memory_save → structuredContent mit Memory, memory_search findet sie", async () => {
    const saved = asTool(
      await rpc(store, "tools/call", {
        name: "memory_save",
        arguments: { title: "Deploy-Setup", content: "KEPTA läuft über [[Docker]] und PM2", tags: ["devops"], type: "procedural" },
      })
    );
    expect(saved.structuredContent.created).toBe(true);
    expect((saved.structuredContent.memory as { type: string }).type).toBe("procedural");

    const found = asTool(await rpc(store, "tools/call", { name: "memory_search", arguments: { query: "Deploy Setup" } }));
    expect(found.structuredContent.count).toBeGreaterThan(0);
    expect((found.structuredContent.hits as { title: string }[])[0]?.title).toBe("Deploy-Setup");
  });

  it("memory_save verknüpft Wiki-Links als Entitäten, memory_graph zeigt sie", async () => {
    await rpc(store, "tools/call", {
      name: "memory_save",
      arguments: { title: "Docker Setup", content: "Nutzt [[Docker]] und [[Traefik]]" },
    });
    const graph = asTool(await rpc(store, "tools/call", { name: "memory_graph", arguments: { entity: "docker", depth: 2 } }));
    const g = graph.structuredContent as { entities: { name: string }[]; relations: { source: string; target: string; relation: string }[] };
    expect(g.entities.map((e) => e.name).sort()).toEqual(["docker", "docker setup", "traefik"]);
    expect(g.relations.length).toBeGreaterThanOrEqual(2);
    expect(g.relations.every((r) => r.relation === "mentions")).toBe(true);
  });

  it("memory_update patcht, memory_forget expire setzt validTo", async () => {
    const saved = asTool(await rpc(store, "tools/call", { name: "memory_save", arguments: { title: "Alt", content: "Inhalt" } }));
    const id = (saved.structuredContent.memory as { id: string }).id;

    const upd = asTool(await rpc(store, "tools/call", { name: "memory_update", arguments: { id, title: "Neu" } }));
    expect((upd.structuredContent.memory as { title: string }).title).toBe("Neu");

    await rpc(store, "tools/call", { name: "memory_forget", arguments: { id, mode: "expire" } });
    const list = asTool(await rpc(store, "tools/call", { name: "memory_list", arguments: {} }));
    const mem = (list.structuredContent.memories as { id: string; validTo: number | null }[]).find((m) => m.id === id);
    expect(mem?.validTo).not.toBeNull();
  });

  it("memory_delete default Papierkorb, permanent endgültig", async () => {
    const saved = asTool(await rpc(store, "tools/call", { name: "memory_save", arguments: { title: "X", content: "Y" } }));
    const id = (saved.structuredContent.memory as { id: string }).id;

    await rpc(store, "tools/call", { name: "memory_delete", arguments: { id } });
    expect((asTool(await rpc(store, "tools/call", { name: "memory_list", arguments: {} })).structuredContent.count)).toBe(0);
    expect((asTool(await rpc(store, "tools/call", { name: "memory_list", arguments: { trash: true } })).structuredContent.count)).toBe(1);

    await rpc(store, "tools/call", { name: "memory_delete", arguments: { id, permanent: true } });
    expect((asTool(await rpc(store, "tools/call", { name: "memory_list", arguments: { trash: true } })).structuredContent.count)).toBe(0);
  });

  it("Fehler in tools/call → isError:true (kein JSON-RPC-Error)", async () => {
    const res = asTool(await rpc(store, "tools/call", { name: "memory_search", arguments: {} }));
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toContain("Error");
  });

  it("memory_save indiziert Chunks für die Vektor-Suche", async () => {
    await rpc(store, "tools/call", {
      name: "memory_save",
      arguments: { title: "Chunking-Test", content: "Ein sehr langer Inhalt. ".repeat(200) },
    });
    expect(store.chunksNeedingEmbedding(100).length).toBeGreaterThan(1);
  });

  it("memory_consolidate liefert dryRun-Kandidaten strukturiert", async () => {
    await rpc(store, "tools/call", { name: "memory_save", arguments: { title: "Server Passwort", content: "geheim eins" } });
    await rpc(store, "tools/call", { name: "memory_save", arguments: { title: "Server Passwort", content: "geheim eins" } });
    const res = asTool(await rpc(store, "tools/call", { name: "memory_consolidate", arguments: { dryRun: true } }));
    const sc = res.structuredContent as { dryRun: boolean; applied: number; candidates: unknown[] };
    expect(sc.dryRun).toBe(true);
    expect(sc.applied).toBe(0);
    expect(Array.isArray(sc.candidates)).toBe(true);
  });

  it("memory_forget mode=supersede markiert die Memory als ersetzt", async () => {
    const saved = asTool(await rpc(store, "tools/call", { name: "memory_save", arguments: { title: "Alt", content: "x" } }));
    const id = (saved.structuredContent.memory as { id: string }).id;
    const res = asTool(await rpc(store, "tools/call", { name: "memory_forget", arguments: { id, mode: "supersede" } }));
    expect((res.structuredContent as { forgotten: boolean }).forgotten).toBe(true);
  });

  it("memory_forget mode=delete verschiebt in den Papierkorb", async () => {
    const saved = asTool(await rpc(store, "tools/call", { name: "memory_save", arguments: { title: "Weg", content: "y" } }));
    const id = (saved.structuredContent.memory as { id: string }).id;
    await rpc(store, "tools/call", { name: "memory_forget", arguments: { id, mode: "delete" } });
    const trash = asTool(await rpc(store, "tools/call", { name: "memory_list", arguments: { trash: true } }));
    expect(trash.structuredContent.count).toBe(1);
  });

  it("memory_forget mit unbekanntem mode → isError", async () => {
    const saved = asTool(await rpc(store, "tools/call", { name: "memory_save", arguments: { title: "M", content: "z" } }));
    const id = (saved.structuredContent.memory as { id: string }).id;
    const res = asTool(await rpc(store, "tools/call", { name: "memory_forget", arguments: { id, mode: "quatsch" } }));
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toContain("mode");
  });

  it("memory_forget auf unbekannte id → isError", async () => {
    const res = asTool(await rpc(store, "tools/call", { name: "memory_forget", arguments: { id: "gibts-nicht", mode: "expire" } }));
    expect(res.isError).toBe(true);
  });

  it("unbekanntes Tool → isError mit passender Meldung", async () => {
    const res = asTool(await rpc(store, "tools/call", { name: "memory_zauberei", arguments: {} }));
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toContain("Unknown tool");
  });
});

describe("extractWikiLinks", () => {
  it("extrahiert, normalisiert kleingeschrieben und dedupliziert", () => {
    expect(extractWikiLinks("siehe [[Docker]] und [[Traefik]] plus [[docker]]")).toEqual(["docker", "traefik"]);
  });
  it("respektiert Alias-Syntax [[Ziel|Anzeige]]", () => {
    expect(extractWikiLinks("[[KEPTA|das Gehirn]]")).toEqual(["kepta"]);
  });
  it("kein Link → leeres Array", () => {
    expect(extractWikiLinks("nur normaler Text")).toEqual([]);
  });
});

describe("negotiateVersion", () => {
  it("bekannte Version bleibt erhalten", () => {
    expect(negotiateVersion("2026-07-28")).toBe("2026-07-28");
    expect(negotiateVersion("2024-11-05")).toBe("2024-11-05");
  });
  it("antwortet nie neuer als erfragt — sonst steigt der Client aus", () => {
    // Dieser Test hielt frueher das Gegenteil fest: jede unbekannte Anfrage sollte
    // die neueste Version bekommen. Genau daran scheiterte Claude Desktop.
    expect(negotiateVersion("1999-01-01")).toBe("2024-11-05");
    expect(negotiateVersion(undefined)).toBe("2024-11-05");
    expect(negotiateVersion(42)).toBe("2024-11-05");
  });
  it("nur ein Client aus der Zukunft bekommt unsere neueste", () => {
    expect(negotiateVersion("2099-01-01")).toBe(LATEST_PROTOCOL_VERSION);
  });
});

describe("memory_save mit Write-Gate (F2)", () => {
  let store: KeptaStore;
  beforeEach(() => {
    store = freshStore();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  // Ollama doppelt gestubbt: /api/embed → fester Vektor, /api/chat → LLM-JSON.
  // Stub VOR jedem Save-Ruf installieren — sonst fängt ein Entwicklerrechner
  // mit echtem Ollama echte 768-dim-Vektoren und die Erwartungen kippen.
  function stubOllama(decision: string, vec: number[] = [1, 0, 0]): void {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, init?: { body?: string }) => {
        const u = String(url);
        if (u.endsWith("/api/chat")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ message: { content: `{"decision":"${decision}","reason":"test"}` } }),
          } as unknown as Response;
        }
        if (u.endsWith("/api/embed")) {
          const body = JSON.parse(init?.body ?? "{}") as { input: string[] };
          return { ok: true, status: 200, json: async () => ({ embeddings: body.input.map(() => vec) }) } as unknown as Response;
        }
        return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
      })
    );
  }

  function seedKandidat(): void {
    const m = store.createMemory({ id: "vorh", title: "Server Passwort", content: "hunter2" });
    indexMemory(store, m.id);
    for (const c of store.chunksNeedingEmbedding(50)) {
      store.setEmbedding(c.memoryId, c.seq, new Float32Array([1, 0, 0]), DEFAULT_EMBED_MODEL);
    }
  }

  it("UPDATE: Gate lenkt memory_save auf den bestehenden Knoten um — kein Duplikat entsteht", async () => {
    vi.stubEnv("KEPTA_WRITE_GATE", "on");
    seedKandidat();
    stubOllama("UPDATE");
    const res = asTool(await rpc(store, "tools/call", { name: "memory_save", arguments: { title: "Server Passwort neu", content: "hunter3" } }));
    const sc = res.structuredContent as { created: boolean; gateOutcome: string; memory: { id: string; title: string }; writeGate: { decision: string } };
    expect(sc.created).toBe(false);
    expect(sc.gateOutcome).toBe("updated");
    expect(sc.memory.id).toBe("vorh");
    expect(sc.memory.title).toBe("Server Passwort neu");
    expect(sc.writeGate.decision).toBe("UPDATE");
    expect(store.countMemories().active).toBe(1);
  });

  it("NOOP: Speichern verweigert — kein neuer Knoten, bestehender bleibt", async () => {
    vi.stubEnv("KEPTA_WRITE_GATE", "on");
    seedKandidat();
    stubOllama("NOOP");
    const res = asTool(await rpc(store, "tools/call", { name: "memory_save", arguments: { title: "Server Passwort", content: "hunter2" } }));
    const sc = res.structuredContent as { created: boolean; gateOutcome: string; memory: unknown; writeGate: { decision: string } };
    expect(sc.created).toBe(false);
    expect(sc.gateOutcome).toBe("rejected");
    expect(sc.memory).toBeNull();
    expect(sc.writeGate.decision).toBe("NOOP");
    expect(store.countMemories().active).toBe(1);
  });

  it("DELETE: wie NOOP — nichts gespeichert, Grund im Antworttext", async () => {
    vi.stubEnv("KEPTA_WRITE_GATE", "on");
    seedKandidat();
    stubOllama("DELETE");
    const res = asTool(await rpc(store, "tools/call", { name: "memory_save", arguments: { title: "Server Passwort", content: "hunter2" } }));
    expect((res.structuredContent as { gateOutcome: string }).gateOutcome).toBe("rejected");
    expect(store.countMemories().active).toBe(1);
  });

  it("ADD trotz aktivem Gate: normal gespeichert, gateOutcome=created", async () => {
    vi.stubEnv("KEPTA_WRITE_GATE", "on");
    stubOllama("ADD", [0, 1, 0]); // orthogonal — nichts Ähnliches vorhanden
    const res = asTool(await rpc(store, "tools/call", { name: "memory_save", arguments: { title: "Ganz neu", content: "Fremdes Thema" } }));
    const sc = res.structuredContent as { created: boolean; gateOutcome: string; memory: { title: string } };
    expect(sc.created).toBe(true);
    expect(sc.gateOutcome).toBe("created");
    expect(sc.memory.title).toBe("Ganz neu");
  });

  it("Gate aus (default): altes Verhalten, keine Gate-Felder im Ergebnis", async () => {
    vi.stubEnv("KEPTA_WRITE_GATE", "off");
    const res = asTool(await rpc(store, "tools/call", { name: "memory_save", arguments: { title: "Noch neu", content: "Anderes Thema" } }));
    const sc = res.structuredContent as { created: boolean; gateOutcome?: string; writeGate?: unknown };
    expect(sc.created).toBe(true);
    expect(sc.gateOutcome).toBeUndefined();
    expect(sc.writeGate).toBeUndefined();
  });

  it("explizites Update via id umgeht das Gate (der Agent entscheidet selbst)", async () => {
    vi.stubEnv("KEPTA_WRITE_GATE", "on");
    seedKandidat();
    stubOllama("NOOP"); // würde ohne id-Gate ablehnen
    const res = asTool(await rpc(store, "tools/call", { name: "memory_save", arguments: { id: "vorh", title: "Server Passwort X", content: "hunter4" } }));
    const sc = res.structuredContent as { created: boolean; memory: { id: string } };
    expect(sc.created).toBe(false);
    expect(sc.memory.id).toBe("vorh");
    expect((store.getMemory("vorh")?.title) ?? "").toBe("Server Passwort X");
  });
});

describe("Privatheits-Floor: jeder Agentenweg, nicht nur Suche und Liste", () => {
  let store: KeptaStore;
  beforeEach(() => {
    store = freshStore();
  });

  async function speichern(args: Record<string, unknown>): Promise<ToolResult> {
    return asTool(await rpc(store, "tools/call", { name: "memory_save", arguments: args }));
  }
  async function ruf(name: string, args: Record<string, unknown>): Promise<ToolResult & { isError?: boolean }> {
    return asTool(await rpc(store, "tools/call", { name, arguments: args }));
  }
  function knoten(out: Record<string, unknown>): string[] {
    return (out.entities as { name: string }[]).map((e) => e.name);
  }
  // Die id aus der Antwort des Speicherns, nicht aus privateMemoryIds() geholt:
  // sonst blinde ein Test mit, der den Floor abschaltet, und wäre sich selbst grün.
  function idVon(out: ToolResult): string {
    return (out.structuredContent as { memory: { id: string } }).memory.id;
  }

  it("memory_graph: Entität nur aus privater Notiz fällt raus, Relationen dorthin auch", async () => {
    await speichern({ title: "Offenes Projekt", content: "Fahrplan" });
    await speichern({ title: "Geheime Praxis", content: "Steuer-ID 999", scope: "private" });

    const graph = (await ruf("memory_graph", { depth: 2 })).structuredContent;
    expect(knoten(graph)).toContain("offenes projekt");
    expect(knoten(graph)).not.toContain("geheime praxis");
  });

  it("memory_graph: Name aus einer offenen Notiz bleibt, die Relation der privaten fällt", async () => {
    const offen = await speichern({ title: "Sitzung Notar", content: "Wir folgen [[Aktenzeichen 44]]" });
    const offenId = idVon(offen);
    // Dieselbe Entität aus OFFENER Sicht — sie darf nicht verschwinden. Die private
    // Notiz verlinkt zusätzlich [[Geheime Konten]]: dieser Knoten hat nur private
    // Träger-Notizen und muss samt Relation raus.
    await speichern({ title: "Aktenzeichen 44", content: "Siehe [[Geheime Konten]]", scope: "private" });

    const graph = (await ruf("memory_graph", { depth: 2 })).structuredContent;
    const namen = knoten(graph);
    expect(namen).toContain("aktenzeichen 44");
    expect(namen).not.toContain("geheime konten");
    const relationen = graph.relations as { source: string; target: string }[];
    expect(relationen.some((r) => r.target === "geheime konten")).toBe(false);
    expect(relationen.some((r) => r.source === "sitzung notar" && r.target === "aktenzeichen 44")).toBe(true);
    expect(store.getMemory(offenId)?.scope).toBe("local");
  });

  it("memory_graph: eine privat gelöschte Notiz bleibt privat — ihr Titel taucht nicht auf", async () => {
    const privat = await speichern({ title: "Geheimes Mandat", content: "Aktenzeichen 55", scope: "private" });
    store.trashMemory(idVon(privat));
    await speichern({ title: "Offene Aktenliste", content: "Nummern" });

    const graph = (await ruf("memory_graph", { depth: 2 })).structuredContent;
    expect(knoten(graph)).not.toContain("geheimes mandat");
    expect(knoten(graph)).toContain("offene aktenliste");
  });

  it("memory_consolidate meldet und ersetzt private Dupletten nicht", async () => {
    const p1 = await speichern({ title: "Geheime Praxisrechnung", content: "eins", scope: "private" });
    const p2 = await speichern({ title: "Geheime Praxisrechnung", content: "zwei länger", scope: "private" });
    await speichern({ title: "Offene Praxisrechnung", content: "eins" });
    await speichern({ title: "Offene Praxisrechnung", content: "zwei länger" });
    const privaten = [idVon(p1), idVon(p2)];

    const out = (await ruf("memory_consolidate", { dryRun: false })).structuredContent;
    const kandidaten = out.candidates as { keepId: string; duplicateId: string }[];
    expect(kandidaten.length).toBeGreaterThan(0);
    for (const k of kandidaten) {
      expect(privaten).not.toContain(k.keepId);
      expect(privaten).not.toContain(k.duplicateId);
    }
    expect(out.applied as number).toBeGreaterThan(0);
    for (const id of privaten) expect(store.getMemory(id)?.supersededBy).toBeNull();
    // Leerlauf-Schutz: dieselbe Engine ohne den Floor findet die private Duplette
    // sehr wohl — der Test oben prüft also etwas und läuft nur auf leeren Raum.
    const ohneFloor = await consolidateMemories(store, { dryRun: true });
    expect(
      ohneFloor.candidates.some((c) => privaten.some((id) => id === c.keepId || id === c.duplicateId))
    ).toBe(true);
  });

  it("Update, Delete, Forget und Save-auf-id sehen private Notizen nicht — Antwort wie bei einer unbekannten id", async () => {
    const privateNotiz = await speichern({ title: "Geheime Steuerliste", content: "4711", scope: "private" });
    const id = idVon(privateNotiz);
    const vor = store.getMemory(id)!;
    const unbekannte = "gibts-fuer-niemals";
    // Wortvergleich auf die id heruntergebrochen: private id und unbekannte id
    // dürfen sich in Text, Struktur und isError nicht unterscheiden — sonst ist
    // jede Antwort ein Existenznachweis für eine Notiz, die es für Agenten nicht gibt.
    const norm = (out: unknown, durch: string) => JSON.stringify(out).split(durch).join("<id>");

    const wege: [string, Record<string, unknown>][] = [
      ["memory_update", { id, title: "Überschrieben" }],
      ["memory_delete", { id }],
      ["memory_delete", { id, permanent: true }],
      ["memory_forget", { id, mode: "expire" }],
      ["memory_save", { id, title: "Überschrieben", content: "fremd" }],
    ];
    for (const [name, args] of wege) {
      const privat = await ruf(name, args);
      expect(privat.isError, name).toBe(true);
      const err = (privat.structuredContent as { error: string }).error;
      expect(err, name).toContain("not found");
      // Kein Wort wie "privat" — das wäre die Existenzbestätigung in Klartext.
      expect(err, name).not.toMatch(/priv/i);
      if (name === "memory_save") continue; // save legt eine unbekannte id einfach an
      const unbekannt = await ruf(name, { ...args, id: unbekannte });
      expect(norm(privat, id), name).toBe(norm(unbekannt, unbekannte));
    }

    const nach = store.getMemory(id)!;
    expect(nach.title).toBe(vor.title);
    expect(nach.deletedAt).toBeNull();
    expect(nach.validTo).toBe(vor.validTo);
  });

  it("supersedeBy auf eine private Notiz wird verweigert — der Zeiger wandert nicht in offene Treffer", async () => {
    const geheim = await speichern({ title: "Geheime Nachfolgerin", content: "4712", scope: "private" });
    const privat = idVon(geheim);
    const offneId = idVon(await speichern({ title: "Offene Vorgängerin", content: "alt" }));

    const out = await ruf("memory_forget", { id: offneId, mode: "supersede", supersedeBy: privat });
    expect(out.isError).toBe(true);
    expect((out.structuredContent as { error: string }).error).not.toMatch(/priv/i);
    expect(store.getMemory(offneId)?.supersededBy).toBeNull();
  });

  it("ein von der App gesetzter Zeiger auf eine private Nachfolgerin bleibt Agenten vorenthalten", async () => {
    const geheim = await speichern({ title: "Geheime Nachfolgerin", content: "4713", scope: "private" });
    const privat = idVon(geheim);
    const offneId = idVon(await speichern({ title: "Offene Vorgängerin", content: "alt" }));
    // Die Besitzerin consolidiert über ihren ganzen Bestand — die App darf zeigen,
    // wohin sie die Notiz ersetzt hat, der Agent nicht.
    store.supersedeMemory(offneId, privat);

    const found = await ruf("memory_search", { query: "Offene Vorgängerin" });
    const treffer = (found.structuredContent.hits as { id: string; supersededBy: string | null; superseded: boolean }[])[0]!;
    expect(treffer.id).toBe(offneId);
    expect(treffer.supersededBy).toBeNull();
    expect(treffer.superseded).toBe(true);
    const gelistet = await ruf("memory_list", {});
    const notiz = (gelistet.structuredContent.memories as { id: string; supersededBy: string | null }[])[0]!;
    expect(notiz.supersededBy).toBeNull();
    expect(JSON.stringify(found).concat(JSON.stringify(gelistet))).not.toContain(privat);
  });

  it("Write-Gate auf einer privaten Duplette: eigener Knoten statt Überschreiben, kein privater Text", async () => {
    // Der Vektor ist absichtlich identisch: findDuplicateForNew trifft die private
    // Notiz mit Ähnlichkeit 1,0. Es darf sie aber weder als Gate-Ziel noch in der
    // Begründung nennen — beides endet im Agentenkanal. Seed von Hand wie in
    // engine.test.ts, damit der Test nicht auf einen nachlaufenden Embed-Queue-Lauf
    // angewiesen ist.
    const VEK = [1, 0, 0, 0];
    const privaten = store.createMemory({ title: "Geheime Steuerliste", content: "Steuer-ID 4711", scope: "private" }).id;
    store.replaceChunks(privaten, ["Geheime Steuerliste"]);
    store.setEmbedding(privaten, 0, Float32Array.from(VEK), DEFAULT_EMBED_MODEL);
    vi.stubEnv("KEPTA_WRITE_GATE", "on");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, init?: { body?: string }) => {
        const u = String(url);
        if (u.endsWith("/api/chat")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ message: { content: `{"decision":"UPDATE","reason":"steuer-id 4711 vorhanden"}` } }),
          } as unknown as Response;
        }
        return { ok: true, status: 200, json: async () => ({ embeddings: [VEK] }) } as unknown as Response;
      })
    );
    try {
      const out = await speichern({ title: "Steuerliste Backup", content: "Steuer-ID 4711" });
      expect(out.isError).toBeUndefined();
      const sc = out.structuredContent as {
        created: boolean;
        gateOutcome: string;
        duplicateWarning: unknown;
        writeGate: { decision: string; targetId?: string };
      };
      expect(sc.created).toBe(true);
      expect(sc.gateOutcome).toBe("created");
      expect(sc.writeGate.decision).toBe("ADD");
      expect(sc.writeGate.targetId).toBeUndefined();
      expect(sc.duplicateWarning).toBeNull();
      expect(store.getMemory(privaten)?.content).toBe("Steuer-ID 4711");
      expect(store.countMemories().active).toBe(2);
      expect(JSON.stringify(out)).not.toContain(privaten);
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });
});
