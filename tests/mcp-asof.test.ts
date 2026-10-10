import { describe, it, expect, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";
import { handleRpc, TOOLS, type JsonRpcRequest } from "../src/core/mcp";

// A2-06 — die beworbene Zeitreise. README sagt "asOf queries", das inputSchema nennt das Feld
// nicht, und ein Wert wie "2020-01-01" wurde zu Number(...) = NaN und damit still als
// "heute" gelesen. Der Agent bekam Treffer, die er fuer vergangen hielt.

interface ToolResult {
  content: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

function freshStore(): KeptaStore {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-asof-"));
  return new KeptaStore(path.join(dir, "test.db"));
}

async function ruf(store: KeptaStore, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const req: JsonRpcRequest = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } };
  const res = await handleRpc({ store, transport: "stdio" }, req);
  if (!res || !("result" in res)) throw new Error("Erwartete JSON-RPC-Ergebnis-Antwort");
  return res.result as unknown as ToolResult;
}

function count(res: ToolResult): number | undefined {
  return (res.structuredContent as { count?: number })?.count;
}

describe("memory_search asOf: deklariert, gewirkt, und nicht mehr still ignoriert", () => {
  let store: KeptaStore;

  beforeEach(async () => {
    store = freshStore();
    await ruf(store, "memory_save", { title: "Backup-Fenster", content: "Das Backup laeuft nachts um drei" });
  });

  it("asOf ist im inputSchema deklariert — integer, Epoch-Millisekunden, mit Beispiel", () => {
    const search = (TOOLS as unknown as { name: string; inputSchema: { properties: Record<string, { type?: unknown; description?: string }> } }[]).find(
      (t) => t.name === "memory_search"
    )!;
    const feld = search.inputSchema.properties.asOf;
    expect(feld, "asOf fehlt im inputSchema — die beworbene Zeitreise ist nur zu erraten").toBeDefined();
    expect(String(feld.type)).toBe("integer");
    expect(`${feld.description ?? ""}`).toMatch(/epoch/i);
    expect(`${feld.description ?? ""}`).toMatch(/\d{13}/);
  });

  it("asOf wirkt: heute findet die Notiz, 1970 nicht", async () => {
    expect(count(await ruf(store, "memory_search", { query: "Backup laeuft nachts", asOf: Date.now() }))).toBeGreaterThan(0);
    expect(count(await ruf(store, "memory_search", { query: "Backup laeuft nachts", asOf: 1000 }))).toBe(0);
  });

  it("ein nicht-numerischer asOf wird abgewiesen statt als Gegenwart gelesen", async () => {
    for (const asOf of ["2020-01-01", "vorgestern", "", "   ", {}, [], true, NaN, Infinity]) {
      const res = await ruf(store, "memory_search", { query: "Backup laeuft nachts", asOf });
      expect(res.isError, `asOf=${JSON.stringify(asOf)} wurde still als heute gelesen (count=${count(res)})`).toBe(true);
      expect(res.structuredContent).toBeUndefined();
      expect(res.content[0]?.text ?? "").toMatch(/asOf/);
    }
  });

  it("eine Zahl als String und null bleiben brauchbar", async () => {
    expect(count(await ruf(store, "memory_search", { query: "Backup laeuft nachts", asOf: "1000" }))).toBe(0);
    for (const asOf of [undefined, null]) {
      const res = await ruf(store, "memory_search", { query: "Backup laeuft nachts", ...(asOf === null ? { asOf } : {}) });
      expect(res.isError, res.content[0]?.text ?? "").toBeUndefined();
      expect(count(res)).toBeGreaterThan(0);
    }
  });
});
