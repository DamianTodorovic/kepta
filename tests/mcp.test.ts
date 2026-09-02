import { describe, it, expect, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";
import { handleRpc, TOOLS, LATEST_PROTOCOL_VERSION, SERVER_INFO, extractWikiLinks, negotiateVersion, type JsonRpcRequest, type JsonRpcResponse } from "../src/core/mcp";
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
    // Unbekannte Version → latest
    expect(asResult(await rpc(store, "initialize", { protocolVersion: "1999-01-01" })).protocolVersion).toBe(LATEST_PROTOCOL_VERSION);
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
    expect(res.content[0]?.text).toContain("Fehler");
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
    expect(res.content[0]?.text).toContain("Unbekanntes Tool");
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
  it("unbekannte Version oder Nicht-String → latest", () => {
    expect(negotiateVersion("1999-01-01")).toBe(LATEST_PROTOCOL_VERSION);
    expect(negotiateVersion(undefined)).toBe(LATEST_PROTOCOL_VERSION);
    expect(negotiateVersion(42)).toBe(LATEST_PROTOCOL_VERSION);
  });
});
