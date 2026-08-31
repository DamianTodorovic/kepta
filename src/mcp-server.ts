#!/usr/bin/env node
/**
 * KEPTA — MCP Server (stdio)
 * Echter MCP-Server für Claude Desktop, Cursor, Zed, etc.
 * Protokoll: MCP 2024-11-05 über stdio (JSON-RPC 2.0, newline-delimited).
 *
 * Tools:
 *  - memory_search  { query, limit?, tags? }  -> sucht im lokalen Gehirn
 *  - memory_save    { title, content, tags?, id? } -> speichert/aktualisiert
 *  - memory_list    { limit?, offset? } -> listet alle Knoten
 *
 * Start:  npx tsx src/mcp-server.ts
 * Build:  esbuild src/mcp-server.ts --bundle --platform=node --format=cjs --outfile=dist/mcp-server.cjs
 */

import fs from "fs";
import path from "path";
import os from "os";
import readline from "readline";

// -------- Speicher (identisch zu server.ts) --------

interface MemoryRecord {
  id: string;
  userId: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

const DATA_DIR = process.env.KEPTA_DATA_DIR || process.env.KI_GEHIRN_DATA_DIR || (()=>{ try{ const k=path.join(os.homedir(), ".kepta"); if (fs.existsSync(k)) return k; }catch{} return path.join(os.homedir(), ".ki-gehirn"); })();
const DATA_FILE = path.join(DATA_DIR, "memories.json");

function loadMemories(): MemoryRecord[] {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function persistMemories(memories: MemoryRecord[]) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(memories, null, 2), "utf-8");
  fs.renameSync(tmp, DATA_FILE);
}

function searchMemories(query: string, limit = 20, tagsFilter: string[] = []): MemoryRecord[] {
  const q = query.trim().toLowerCase();
  let results = loadMemories();
  if (tagsFilter.length > 0) results = results.filter((m) => tagsFilter.every((t) => m.tags.includes(t)));
  if (!q) return results.slice(0, limit);
  const scored = results
    .map((m) => {
      const hay = `${m.title} ${m.content} ${m.tags.join(" ")}`.toLowerCase();
      let score = 0;
      if (m.title.toLowerCase().includes(q)) score += 10;
      if (hay.includes(q)) score += 5;
      for (const w of q.split(/\s+/).filter(Boolean)) if (hay.includes(w)) score += 1;
      for (const t of m.tags) if (t.toLowerCase().includes(q)) score += 3;
      return { m, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.m.updatedAt - a.m.updatedAt)
    .map((x) => x.m);
  return scored.slice(0, limit);
}

// -------- MCP Tool-Definitionen --------

const TOOLS = [
  {
    name: "memory_search",
    description: "Durchsucht KEPTA (Titel, Inhalt, Tags).",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Suchbegriff" },
        limit: { type: "number", description: "Max. Ergebnisse (default 10)", default: 10 },
        tags: { type: "array", items: { type: "string" }, description: "Tag-Filter (AND)" },
      },
      required: ["query"],
    },
  },
  {
    name: "memory_save",
    description: "Speichert einen neuen Knoten oder aktualisiert einen bestehenden (mit id).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        id: { type: "string", description: "Bestehende ID zum Aktualisieren" },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "memory_list",
    description: "Listet alle Knoten (paginiert).",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", default: 20 },
        offset: { type: "number", default: 0 },
      },
    },
  },
];

// -------- JSON-RPC helpers --------

interface RpcReq {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

function reply(id: unknown, result: unknown) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, result }) + "\n");
}
function replyError(id: unknown, code: number, message: string) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }) + "\n");
}

function handleToolsCall(name: string, args: Record<string, unknown>) {
  if (name === "memory_search") {
    const query = String(args.query ?? "");
    if (!query.trim()) throw new Error("query erforderlich");
    const limit = Math.min(Math.max(parseInt(String(args.limit ?? 10), 10) || 10, 1), 50);
    const tags = Array.isArray(args.tags) ? (args.tags as string[]) : [];
    const memories = searchMemories(query, limit, tags);
    return {
      content: [{ type: "text", text: JSON.stringify({ query, count: memories.length, memories }, null, 2) }],
    };
  }
  if (name === "memory_save") {
    const title = String(args.title ?? "");
    const content = String(args.content ?? "");
    if (!title || !content) throw new Error("title und content erforderlich");
    const tags = Array.isArray(args.tags) ? (args.tags as string[]) : [];
    const mid = args.id ? String(args.id) : undefined;
    const memories = loadMemories();
    const now = Date.now();
    if (mid) {
      const idx = memories.findIndex((m) => m.id === mid);
      if (idx >= 0) {
        memories[idx] = { ...memories[idx], title, content, tags, updatedAt: now };
        persistMemories(memories);
        return { content: [{ type: "text", text: `Aktualisiert: ${mid}` }], memory: memories[idx] };
      }
    }
    const created: MemoryRecord = {
      id: mid || `local-${now}-${Math.random().toString(36).slice(2, 8)}`,
      userId: "local",
      title,
      content,
      tags,
      createdAt: now,
      updatedAt: now,
    };
    persistMemories([created, ...memories]);
    return { content: [{ type: "text", text: `Gespeichert: ${created.id} — ${created.title}` }], memory: created };
  }
  if (name === "memory_list") {
    const limit = Math.min(Math.max(parseInt(String(args.limit ?? 20), 10) || 20, 1), 50);
    const offset = Math.max(parseInt(String(args.offset ?? 0), 10) || 0, 0);
    const all = loadMemories();
    const slice = all.slice(offset, offset + limit);
    return {
      content: [{ type: "text", text: JSON.stringify({ count: slice.length, total: all.length, memories: slice }, null, 2) }],
    };
  }
  throw new Error(`Unbekanntes Tool: ${name}`);
}

function handleRequest(req: RpcReq) {
  const id = req.id ?? null;
  const method = req.method ?? "";

  try {
    if (method === "initialize") {
      return reply(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "kepta", version: "0.0.0" },
      });
    }
    if (method === "notifications/initialized" || method === "initialized") {
      // Notification — keine Antwort nötig; falls id vorhanden, leeres result
      if (id !== null && id !== undefined) return reply(id, {});
      return;
    }
    if (method === "ping") return reply(id, {});
    if (method === "tools/list") return reply(id, { tools: TOOLS });
    if (method === "tools/call") {
      const p = req.params as { name?: string; arguments?: Record<string, unknown> };
      const name = String(p?.name ?? "");
      const args = (p?.arguments ?? {}) as Record<string, unknown>;
      const result = handleToolsCall(name, args);
      return reply(id, result);
    }
    // Fallback für alternative MCP-Clients
    if (method.startsWith("tools/")) return replyError(id, -32601, `Unbekannte Methode: ${method}`);
    if (id !== null && id !== undefined) return replyError(id, -32601, `Unbekannte Methode: ${method}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // tools/call Fehler als MCP-Fehler-Content (nicht JSON-RPC error), damit Client es anzeigt
    if (method === "tools/call") return reply(id, { content: [{ type: "text", text: `Fehler: ${msg}` }], isError: true });
    return replyError(id, -32603, msg);
  }
}

// -------- stdio loop --------

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const req = JSON.parse(trimmed) as RpcReq;
    // Batch wird nicht unterstützt — einzeln behandeln
    if (Array.isArray(req)) {
      for (const r of req as RpcReq[]) handleRequest(r);
    } else {
      handleRequest(req);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    replyError(null, -32700, `Parse error: ${msg}`);
  }
});

rl.on("close", () => process.exit(0));

// Signalisiere Bereitschaft auf stderr (nicht stdout — stdout ist JSON-RPC)
console.error(`[kepta MCP] stdio ready — data: ${DATA_FILE}`);
