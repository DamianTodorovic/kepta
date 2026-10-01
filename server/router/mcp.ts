// MCP über HTTP: Streamable HTTP (Protokoll 2026-07-28, stateless, POST /mcp)
// plus die Legacy-Hilfsrouten mit plain JSON.
import express from "express";
import { TOOLS as MCP_TOOLS, saveWithIndex, type McpContext } from "../../src/core/mcp";
import { searchMemories as engineSearch } from "../../src/core/engine";
import { bearbeiteMcp, beiVerbindung, ladeSchutz, nachWerkzeug, vorWerkzeug } from "../../src/lib/mcpwache";
import { schreibe as protokolliere } from "../../src/lib/pruefprotokoll";
import { toApi } from "../helfer/api-form";
import { bodyOf } from "../helfer/body";
import type { AppKontext } from "../kontext";

export function mountMcp(app: express.Express, ctx: AppKontext): void {
  const { store } = ctx;
  // One context per request: over HTTP many clients share this route, and each
  // one's name belongs to its own calls. The shield, the activity feed and the
  // audit log sit around every call (src/lib/mcpwache.ts).
  const mcpKontext = (): McpContext => ({ store, transport: "http", melde: beiVerbindung(store) });

  // Tool-Liste (Discovery)
  app.get("/api/mcp/tools", (_req, res) => {
    res.json({ tools: MCP_TOOLS, protocol: "2026-07-28" });
  });
  app.get("/api/tools", (_req, res) => {
    res.json({ tools: MCP_TOOLS, protocol: "2026-07-28" });
  });

  // Streamable HTTP (MCP 2026-07-28, stateless) — POST /mcp
  app.post("/mcp", async (req, res) => {
    const body = req.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      // JSON-Array = Batch-Request: MCP 2026-07-28 hat Batching gestrichen →
      // einzelnes Error-Objekt statt stiller 200/leerer Antwort
      return res.status(400).json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Batching is not supported (MCP 2026-07-28 removed it)" } });
    }
    try {
      const reply = await bearbeiteMcp(mcpKontext(), body as never);
      // Activity: Agenten-Aktionen sichtbar machen
      const rpcBody = body as { method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
      if (rpcBody.method === "tools/call") {
        const toolName = String(rpcBody.params?.name ?? "");
        const args = rpcBody.params?.arguments ?? {};
        if (toolName === "memory_save") ctx.publishActivity({ type: "save", source: "agent", title: String(args.title ?? "") });
        else if (toolName === "memory_search") ctx.publishActivity({ type: "search", source: "agent", title: String(args.query ?? "") }, { throttleSearchMs: 4000 });
        else if (toolName === "memory_delete" || toolName === "memory_forget") ctx.publishActivity({ type: "delete", source: "agent", title: String(args.id ?? "") });
        else if (toolName === "memory_update") ctx.publishActivity({ type: "update", source: "agent", title: String(args.id ?? "") });
        else if (toolName === "memory_consolidate") ctx.publishActivity({ type: "consolidate", source: "agent" });
      }
      if (!reply) return res.status(202).json({ accepted: true });
      return res.json(reply);
    } catch (e) {
      return res.status(500).json({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32603, message: e instanceof Error ? e.message : String(e) },
      });
    }
  });
  app.get("/mcp", (_req, res) => {
    res.status(405).json({ error: "Streamable HTTP: POST only (stateless, no SSE session)" });
  });

  // Legacy-kompatible Hilfsrouten (plain JSON statt JSON-RPC) — dünne Wrapper über die Engine
  app.post("/api/mcp/search", ctx.limiter.write, async (req, res) => {
    const { query, limit = 10, tags } = bodyOf<{ query?: string; limit?: number; tags?: string[] }>(req);
    if (!query || !query.trim()) return res.status(400).json({ error: "a query is required", tools: MCP_TOOLS });
    const result = await engineSearch(store, {
      query: String(query),
      limit: Math.min(Math.max(parseInt(String(limit), 10) || 10, 1), 50),
      tags: Array.isArray(tags) ? tags : undefined,
    });
    ctx.publishActivity({ type: "search", source: "agent", title: String(query) }, { throttleSearchMs: 4000 });
    // Agents use this route too: the same shield as over MCP.
    const roh = result.hits.map((h) => ({ id: h.memory.id, title: h.memory.title, content: h.memory.content, tags: h.memory.tags, updatedAt: h.memory.updatedAt, expired: h.expired, superseded: h.superseded, scope: h.memory.scope }));
    const geschuetzt = (nachWerkzeug("memory_search", {}, { structuredContent: { hits: roh } }, ladeSchutz(store)).structuredContent?.hits ?? []) as Record<string, unknown>[];
    const memories = geschuetzt.map((m) => {
      const { scope, ...rest } = m;
      void scope;
      return rest;
    });
    protokolliere(store, { actor: "HTTP API", action: "search", target: String(query), detail: `${memories.length} notes: ${memories.slice(0, 25).map((m) => `${m.id} ${m.title}`).join("; ")}` });
    return res.json({ query, count: memories.length, memories });
  });

  app.post("/api/mcp/save", ctx.limiter.write, async (req, res) => {
    const vor = vorWerkzeug("memory_save", bodyOf<Record<string, unknown>>(req), store, ladeSchutz(store));
    if ("fehler" in vor) return res.status(403).json({ error: vor.fehler });
    const body = vor.args;
    try {
      const { created, record } = saveWithIndex(store, body);
      ctx.publishActivity({ type: created ? "save" : "update", source: "agent", title: record.title });
      return res.json({ memory: toApi(record), created });
    } catch (e) {
      return res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });
}
