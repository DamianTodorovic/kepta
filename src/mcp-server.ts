#!/usr/bin/env node
/**
 * KEPTA — MCP Server (stdio)
 * Protokoll: MCP 2026-07-28 (stateless core) mit Legacy-Fallback (2025-06-18, 2024-11-05).
 * 8 Tools mit structuredContent — Logik geteilt mit dem HTTP-Server über src/core/mcp.ts.
 *
 * Start:  npx tsx src/mcp-server.ts   |   node dist/mcp-server.cjs
 */
import { KeptaStore } from "./core/store";
import { migrateFromLegacyJson } from "./core/migrate";
import { EmbeddingQueue } from "./core/embeddings";
import { handleRpc, SERVER_INFO, type JsonRpcRequest, type JsonRpcResponse } from "./core/mcp";
import readline from "node:readline";

const store = new KeptaStore();
const migration = migrateFromLegacyJson(store);
if (!migration.skipped) {
  console.error(`[kepta MCP] Migration: ${migration.migrated} nodes taken over from memories.json (backup: ${migration.backupPath ?? "none"})`);
}
const queue = new EmbeddingQueue(store);
queue.start();
store.db.exec("PRAGMA wal_checkpoint(PASSIVE)");

const ctx = { store, transport: "stdio" as const };

// Antworten SERIELL auf stdout schreiben: Verarbeitung (handleRpc) bleibt parallel,
// aber die Writes dürfen sich nicht verschränken — sonst können parallele Antworten
// in falscher Reihenfolge bzw. interleaved beim Client landen.
let writeQueue: Promise<void> = Promise.resolve();
function write(res: JsonRpcResponse | null) {
  if (!res) return;
  const payload = JSON.stringify(res) + "\n";
  writeQueue = writeQueue.then(
    () => new Promise<void>((done) => process.stdout.write(payload, () => done()))
  );
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

// Exit only after every pending response has been written — async tool calls
// (search embeddings, duplicate checks) must never be lost on stdin close.
let pending = 0;
let stdinClosed = false;
function finishIfDrained(): void {
  if (stdinClosed && pending === 0) {
    store.close();
    process.exit(0);
  }
}

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    write({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: `Parse error: ${e instanceof Error ? e.message : String(e)}` },
    });
    return;
  }
  // Batch-Request (JSON-Array): MCP 2026-07-28 hat Batching gestrichen —
  // als einzelner Invalid-Request-Fehler beantworten statt still zu schlucken.
  if (Array.isArray(parsed)) {
    write({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "Batching is not supported (MCP 2026-07-28 removed it)" },
    });
    return;
  }
  const req = parsed as JsonRpcRequest;
  pending++;
  void handleRpc(ctx, req)
    .then(write)
    .catch((e) => {
      write({
        jsonrpc: "2.0",
        id: (req.id as string | number | null) ?? null,
        error: { code: -32603, message: e instanceof Error ? e.message : String(e) },
      });
    })
    .finally(() => {
      pending--;
      finishIfDrained();
    });
});

rl.on("close", () => {
  stdinClosed = true;
  finishIfDrained();
});

console.error(`[kepta MCP] stdio ready — ${SERVER_INFO.name} v${SERVER_INFO.version} — db: ${store.dbPath}`);
