#!/usr/bin/env node
/**
 * KEPTA — MCP Server (stdio)
 * Protokoll: MCP 2026-07-28 (stateless core) mit Legacy-Fallback (2025-06-18, 2024-11-05).
 * 8 Tools mit structuredContent — Logik geteilt mit dem HTTP-Server über src/core/mcp.ts.
 *
 * Start:  npx tsx src/mcp-server.ts   |   node dist/mcp-server.cjs
 * Oberflaeche im Browser:  npx kepta-mcp ui [--port 4747] [--no-open]
 */
import { KeptaStore, defaultDataDir } from "./core/store";
import { defaultExtensions } from "./core/extensions";
import { schluesselbundKeyProvider } from "./core/schluessel";
import { migrateFromLegacyJson } from "./core/migrate";
import { EmbeddingQueue } from "./core/embeddings";
import { handleRpc, SERVER_INFO, type JsonRpcRequest, type JsonRpcResponse } from "./core/mcp";
import readline from "node:readline";
import { starteOberflaeche, oeffneImBrowser, leseUiArgumente } from "./ui/server";

/** Derselbe Schluessel wie in der App: aus dem Schluesselbund des Systems. */
function oeffneStore(): KeptaStore {
  try {
    return new KeptaStore(undefined, { ...defaultExtensions(), keys: schluesselbundKeyProvider(defaultDataDir()) });
  } catch (e) {
    console.error(`[kepta MCP] ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

/** Der MCP-Server ueber stdio — so starten ihn Claude Desktop, Cursor und Co. */
function starteMcp(): void {
  const store = oeffneStore();
  const v = store.verschluesselung;
  console.error(
    `[kepta MCP] ${store.dbPath} — ${v.aktiv ? `encrypted (${v.ablage ?? "key provider"}${v.umgewandelt ? ", converted from plaintext just now" : ""})` : `NOT encrypted${v.hinweis ? `: ${v.hinweis}` : ""}`}`,
  );
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
}

/**
 * `npx kepta-mcp ui`: die Oberflaeche von KEPTA Core im Browser, auf derselben
 * verschluesselten Datenbank. Laeuft, bis man sie mit Ctrl+C beendet.
 */
async function starteUi(argumente: string[]): Promise<void> {
  const { port, oeffnen } = leseUiArgumente(argumente);
  const store = oeffneStore();
  const ui = await starteOberflaeche(store, { port });
  const v = store.verschluesselung;
  console.log(`KEPTA Core ${SERVER_INFO.version} is running at ${ui.url}`);
  console.log(`${store.dbPath} — ${v.aktiv ? "encrypted" : `NOT encrypted${v.hinweis ? `: ${v.hinweis}` : ""}`}`);
  console.log("Press Ctrl+C to stop.");
  if (oeffnen) oeffneImBrowser(ui.url);
  const ende = () => {
    void ui.close().finally(() => {
      store.close();
      process.exit(0);
    });
  };
  process.on("SIGINT", ende);
  process.on("SIGTERM", ende);
}

if (process.argv[2] === "ui") {
  starteUi(process.argv.slice(3)).catch((e: unknown) => {
    console.error(`[kepta] ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
} else {
  starteMcp();
}
