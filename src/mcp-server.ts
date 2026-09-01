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
  console.error(`[kepta MCP] Migration: ${migration.migrated} Knoten aus memories.json übernommen (Backup: ${migration.backupPath ?? "keines"})`);
}
const queue = new EmbeddingQueue(store);
queue.start();
store.db.exec("PRAGMA wal_checkpoint(PASSIVE)");

const ctx = { store, transport: "stdio" as const };

function write(res: JsonRpcResponse | null) {
  if (!res) return;
  process.stdout.write(JSON.stringify(res) + "\n");
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let req: JsonRpcRequest;
  try {
    req = JSON.parse(trimmed) as JsonRpcRequest;
  } catch (e) {
    write({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: `Parse error: ${e instanceof Error ? e.message : String(e)}` },
    });
    return;
  }
  void handleRpc(ctx, req)
    .then(write)
    .catch((e) => {
      write({
        jsonrpc: "2.0",
        id: (req.id as string | number | null) ?? null,
        error: { code: -32603, message: e instanceof Error ? e.message : String(e) },
      });
    });
});

rl.on("close", () => {
  store.close();
  process.exit(0);
});

console.error(`[kepta MCP] stdio ready — ${SERVER_INFO.name} v${SERVER_INFO.version} — db: ${store.dbPath}`);
