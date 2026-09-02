import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import request from "supertest";
import { KeptaStore } from "../src/core/store";

// server.ts startet beim Import normalerweise automatisch — mit KEPTA_NO_AUTOSTART=1
// wird nur createApp exportiert, ohne Port zu binden.
process.env.KEPTA_NO_AUTOSTART = "1";

let createApp: (store: KeptaStore) => import("express").Express;
let store: KeptaStore;
let app: import("express").Express;
let prevHome: string | undefined;
let dir: string;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-server-"));
  prevHome = process.env.HOME;
  process.env.HOME = dir; // Profil-/Datei-Routen in tmp isolieren
  process.env.KEPTA_DATA_DIR = dir;
  vi.resetModules(); // server.ts liest DATA_DIR beim Import → pro Test frisch
  ({ createApp } = await import("../server"));
  store = new KeptaStore(path.join(dir, "test.db"));
  app = createApp(store);
});

afterEach(() => {
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
});

describe("GET /api/health", () => {
  it("liefert ok:true mit MCP-Metadaten", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.name).toBe("kepta");
    expect(res.body.mcp.tools).toBeGreaterThan(0);
  });
});

describe("/api/memories CRUD", () => {
  it("GET liefert anfangs eine leere Liste", async () => {
    const res = await request(app).get("/api/memories");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it("POST legt eine Memory an und GET findet sie", async () => {
    const post = await request(app).post("/api/memories").send({ title: "Server-Test", content: "Inhalt", tags: ["api"] });
    expect(post.status).toBe(200);
    expect(post.body.memory.title).toBe("Server-Test");

    const list = await request(app).get("/api/memories");
    expect(list.body).toHaveLength(1);
  });

  it("POST ohne Titel und Inhalt → 400", async () => {
    const res = await request(app).post("/api/memories").send({ tags: ["leer"] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it("POST mit ungültiger ID → 400", async () => {
    const res = await request(app).post("/api/memories").send({ id: "bad id!!", title: "X" });
    expect(res.status).toBe(400);
  });

  it("DELETE verschiebt in den Papierkorb", async () => {
    const post = await request(app).post("/api/memories").send({ title: "Weg", content: "x" });
    const id = post.body.memory.id;
    const del = await request(app).delete(`/api/memories/${encodeURIComponent(id)}`);
    expect(del.status).toBeLessThan(400);
    const active = await request(app).get("/api/memories");
    expect(active.body).toHaveLength(0);
    const trash = await request(app).get("/api/memories?trash=1");
    expect(trash.body).toHaveLength(1);
  });

  it("GET /api/memories/search findet über die Engine", async () => {
    await request(app).post("/api/memories").send({ title: "Rust Backend", content: "Speichersicherheit", tags: ["rust"] });
    const res = await request(app).get("/api/memories/search?q=Speichersicherheit&limit=5");
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThan(0);
    expect(res.body.memories[0].title).toBe("Rust Backend");
  });
});

describe("POST /mcp (JSON-RPC)", () => {
  it("initialize verhandelt die Protokollversion", async () => {
    const res = await request(app).post("/mcp").send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2026-07-28" } });
    expect(res.status).toBe(200);
    expect(res.body.result.protocolVersion).toBe("2026-07-28");
  });

  it("tools/list liefert alle 8 Tools", async () => {
    const res = await request(app).post("/mcp").send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect(res.body.result.tools).toHaveLength(8);
  });

  it("tools/call memory_save funktioniert end-to-end", async () => {
    const res = await request(app).post("/mcp").send({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "memory_save", arguments: { title: "Via MCP", content: "gespeichert" } },
    });
    expect(res.body.result.structuredContent.created).toBe(true);
  });

  it("ungültiger Body → 400 mit JSON-RPC-Fehler", async () => {
    const res = await request(app).post("/mcp").send([]);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(-32600);
  });

  it("Notification (ohne id) → 202 accepted", async () => {
    const res = await request(app).post("/mcp").send({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(res.status).toBe(202);
    expect(res.body.accepted).toBe(true);
  });

  it("GET /mcp → 405 (nur POST erlaubt)", async () => {
    const res = await request(app).get("/mcp");
    expect(res.status).toBe(405);
  });
});

describe("Diverse Routen", () => {
  it("GET /api/mcp/tools listet die Tools", async () => {
    const res = await request(app).get("/api/mcp/tools");
    expect(res.status).toBe(200);
  });

  it("GET /api/graph liefert Entitäten und Relationen", async () => {
    await request(app).post("/mcp").send({
      jsonrpc: "2.0", id: 9, method: "tools/call",
      params: { name: "memory_save", arguments: { title: "Docker", content: "nutzt [[Traefik]]" } },
    });
    const res = await request(app).get("/api/graph");
    expect(res.status).toBe(200);
  });

  it("GET /api/profile liefert null ohne gespeichertes Profil", async () => {
    const res = await request(app).get("/api/profile");
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("POST /api/profile speichert, GET liest zurück", async () => {
    await request(app).post("/api/profile").send({ displayName: "Damian" });
    const res = await request(app).get("/api/profile");
    expect(res.body.displayName).toBe("Damian");
  });
});

describe("Storage, Import/Export, Convenience-Routen", () => {
  it("GET /api/storage-info liefert Zähler", async () => {
    const res = await request(app).get("/api/storage-info");
    expect(res.status).toBe(200);
    expect(res.body.dbPath).toContain("test.db");
    expect(res.body).toHaveProperty("count");
  });

  it("POST /api/import/markdown importiert Notizen", async () => {
    const res = await request(app).post("/api/import/markdown").send({
      files: [{ name: "a.md", content: "Inhalt A" }, { name: "b.md", content: "---\ntitle: B\n---\nInhalt B" }],
    });
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(2);
  });

  it("POST /api/import/markdown ohne files → 400", async () => {
    const res = await request(app).post("/api/import/markdown").send({ files: [] });
    expect(res.status).toBe(400);
  });

  it("POST /api/export/markdown ohne Memories → 404", async () => {
    const res = await request(app).post("/api/export/markdown").send({});
    expect(res.status).toBe(404);
  });

  it("POST /api/export/markdown schreibt Dateien wenn Memories da sind", async () => {
    await request(app).post("/api/memories").send({ title: "Export mich", content: "Inhalt" });
    const res = await request(app).post("/api/export/markdown").send({});
    expect(res.status).toBe(200);
  });

  it("POST /api/memories/import (merge) übernimmt Einträge", async () => {
    const res = await request(app).post("/api/memories/import").send({
      memories: [{ title: "Imp1", content: "x" }, { title: "Imp2", content: "y" }],
      mode: "merge",
    });
    expect(res.status).toBe(200);
  });

  it("POST /api/memories/:id/restore holt aus dem Papierkorb zurück", async () => {
    const post = await request(app).post("/api/memories").send({ title: "R", content: "z" });
    const id = post.body.memory.id;
    await request(app).delete(`/api/memories/${encodeURIComponent(id)}`);
    const restore = await request(app).post(`/api/memories/${encodeURIComponent(id)}/restore`);
    expect(restore.status).toBeLessThan(400);
    const active = await request(app).get("/api/memories");
    expect(active.body).toHaveLength(1);
  });

  it("POST /api/mcp/search (Legacy-Wrapper) ohne query → 400", async () => {
    const res = await request(app).post("/api/mcp/search").send({});
    expect(res.status).toBe(400);
  });

  it("POST /api/mcp/search findet Treffer", async () => {
    await request(app).post("/api/memories").send({ title: "Rust", content: "Speichersicherheit" });
    const res = await request(app).post("/api/mcp/search").send({ query: "Speichersicherheit", limit: 5 });
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThan(0);
  });

  it("POST /api/mcp/save legt an", async () => {
    const res = await request(app).post("/api/mcp/save").send({ title: "Via Wrapper", content: "gespeichert" });
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(true);
  });

  it("POST /api/memories mit vorhandener id aktualisiert (UPDATE-Pfad)", async () => {
    const post = await request(app).post("/api/memories").send({ title: "Erst", content: "alt" });
    const id = post.body.memory.id;
    const upd = await request(app).post("/api/memories").send({ id, title: "Neu", content: "neuer inhalt", tags: ["x"], type: "procedural", confidence: 0.7 });
    expect(upd.status).toBe(200);
    expect(upd.body.memory.title).toBe("Neu");
    expect(upd.body.memory.type).toBe("procedural");
  });

  it("POST /api/memories UPDATE auf unbekannte id → 404", async () => {
    const res = await request(app).post("/api/memories").send({ id: "k-gibtsnicht", title: "X", content: "y" });
    expect(res.status).toBe(404);
  });

  it("POST /api/inbox/scan importiert eine abgelegte Datei automatisch", async () => {
    const inbox = path.join(dir, "inbox");
    fs.mkdirSync(inbox, { recursive: true });
    fs.writeFileSync(path.join(inbox, "notiz.txt"), "Automatisch importierter Inhalt aus der Inbox.", "utf-8");
    const res = await request(app).post("/api/inbox/scan").send({});
    expect(res.status).toBe(200);
    expect(res.body.scanned).toBeGreaterThanOrEqual(1);
    expect(res.body.imported).toBeGreaterThanOrEqual(1);
    // Die importierte Memory ist auffindbar
    const list = await request(app).get("/api/memories");
    expect(list.body.some((m: { content: string }) => m.content.includes("Automatisch importierter"))).toBe(true);
  });

  it("GET /api/tools listet Tools", async () => {
    const res = await request(app).get("/api/tools");
    expect(res.status).toBe(200);
  });

  it("GET /api/inbox/status antwortet", async () => {
    const res = await request(app).get("/api/inbox/status");
    expect(res.status).toBe(200);
  });
});

describe("Embed & Search (fetch gemockt)", () => {
  it("POST /api/embed ohne Input → 400", async () => {
    const res = await request(app).post("/api/embed").send({});
    expect(res.status).toBe(400);
  });

  it("POST /api/embed liefert Embeddings über /api/embed (Ollama gemockt)", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({ embeddings: [[1, 2, 3]] }) })) as unknown as typeof fetch;
    try {
      const res = await request(app).post("/api/embed").send({ input: "hallo" });
      expect(res.status).toBe(200);
      expect(res.body.embeddings[0]).toEqual([1, 2, 3]);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("POST /api/embed → 502 wenn Ollama nicht erreichbar", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    try {
      const res = await request(app).post("/api/embed").send({ input: "hallo" });
      expect(res.status).toBe(502);
      expect(res.body.embeddings).toBeNull();
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("POST /api/search liefert results-Shape über die Engine", async () => {
    await request(app).post("/api/memories").send({ title: "Rust Backend", content: "Speichersicherheit" });
    const res = await request(app).post("/api/search").send({ query: "Speichersicherheit", topK: 5 });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("results");
    expect(res.body.hasMatch).toBe(true);
  });

  it("POST /api/chat/stream mit ungültigem Body → 400", async () => {
    const res = await request(app).post("/api/chat/stream").send({ messages: new Array(50).fill({ role: "user", content: "x" }) });
    expect(res.status).toBe(400);
  });
});

describe("Chat-Proxy (Provider gemockt)", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  // Baut eine Fake-fetch, die je nach URL eine SSE-Stream-Response oder JSON liefert.
  function sseResponse(chunks: string[]) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(encoder.encode(c));
        controller.close();
      },
    });
    return { ok: true, status: 200, body: stream } as unknown as Response;
  }

  it("POST /api/chat/stream (OpenAI) streamt Textdeltas als SSE", async () => {
    globalThis.fetch = (async () =>
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Hallo"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" Welt"}}]}\n\n',
        "data: [DONE]\n\n",
      ])) as unknown as typeof fetch;
    const res = await request(app)
      .post("/api/chat/stream")
      .send({ protocol: "openai", messages: [{ role: "user", content: "Hi" }] });
    expect(res.status).toBe(200);
    expect(res.text).toContain("Hallo");
    expect(res.text).toContain("Welt");
    expect(res.text).toContain("[DONE]");
  });

  it("POST /api/chat/stream (Anthropic) versteht content_block_delta", async () => {
    globalThis.fetch = (async () =>
      sseResponse([
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Servus"}}\n\n',
        "data: [DONE]\n\n",
      ])) as unknown as typeof fetch;
    const res = await request(app)
      .post("/api/chat/stream")
      .send({ protocol: "anthropic", messages: [{ role: "user", content: "Hi" }] });
    expect(res.status).toBe(200);
    expect(res.text).toContain("Servus");
  });

  it("POST /api/chat/stream leitet Upstream-Fehler als SSE-error weiter", async () => {
    globalThis.fetch = (async () =>
      ({ ok: false, status: 401, body: null, text: async () => JSON.stringify({ error: { message: "Kein Key" } }) }) as unknown as Response) as unknown as typeof fetch;
    const res = await request(app)
      .post("/api/chat/stream")
      .send({ protocol: "openai", messages: [{ role: "user", content: "Hi" }] });
    expect(res.status).toBe(200);
    expect(res.text).toContain("Kein Key");
  });

  it("POST /api/chat (non-streaming, OpenAI) liefert text", async () => {
    globalThis.fetch = (async () =>
      ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "Antwort" } }] }) }) as unknown as Response) as unknown as typeof fetch;
    const res = await request(app)
      .post("/api/chat")
      .send({ protocol: "openai", messages: [{ role: "user", content: "Frage" }] });
    expect(res.status).toBe(200);
    expect(res.body.text).toBe("Antwort");
  });

  it("POST /api/chat (Anthropic) verbindet Textblöcke", async () => {
    globalThis.fetch = (async () =>
      ({ ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "A" }, { type: "text", text: "B" }] }) }) as unknown as Response) as unknown as typeof fetch;
    const res = await request(app)
      .post("/api/chat")
      .send({ protocol: "anthropic", messages: [{ role: "user", content: "x" }] });
    expect(res.body.text).toContain("A");
    expect(res.body.text).toContain("B");
  });

  it("POST /api/chat gibt Upstream-Fehler als 500 zurück", async () => {
    globalThis.fetch = (async () =>
      ({ ok: false, status: 500, json: async () => ({ error: { message: "kaputt" } }) }) as unknown as Response) as unknown as typeof fetch;
    const res = await request(app)
      .post("/api/chat")
      .send({ protocol: "openai", messages: [{ role: "user", content: "x" }] });
    expect(res.status).toBe(500);
  });

  it("POST /api/chat mit ungültigem Body → 400", async () => {
    const res = await request(app).post("/api/chat").send({ messages: new Array(99).fill({ role: "user", content: "x" }) });
    expect(res.status).toBe(400);
  });

  it("POST /api/models (OpenAI) liefert sortierte Modellliste", async () => {
    globalThis.fetch = (async () =>
      ({ ok: true, status: 200, json: async () => ({ data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] }) }) as unknown as Response) as unknown as typeof fetch;
    const res = await request(app).post("/api/models").send({ protocol: "openai", baseUrl: "https://api.openai.com/v1", apiKey: "sk-test" });
    expect(res.status).toBe(200);
    expect(res.body.models).toContain("gpt-4o");
  });

  it("POST /api/models Fehler → 500", async () => {
    globalThis.fetch = (async () =>
      ({ ok: false, status: 403, json: async () => ({ error: { message: "verboten" } }) }) as unknown as Response) as unknown as typeof fetch;
    const res = await request(app).post("/api/models").send({ protocol: "openai", baseUrl: "https://api.openai.com/v1", apiKey: "sk-x" });
    expect(res.status).toBe(500);
  });
});

describe("Clip-Route", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("POST /api/clip ohne URL → 400", async () => {
    const res = await request(app).post("/api/clip").send({});
    expect(res.status).toBe(400);
  });

  it("POST /api/clip mit unsicherer URL → 400", async () => {
    const res = await request(app).post("/api/clip").send({ url: "file:///etc/passwd" });
    expect(res.status).toBe(400);
  });

  it("POST /api/clip extrahiert Titel und Text aus HTML", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        headers: { get: () => "text/html" },
        text: async () => "<html><head><title>Testseite</title></head><body><p>Wichtiger Inhalt hier</p></body></html>",
      }) as unknown as Response) as unknown as typeof fetch;
    const res = await request(app).post("/api/clip").send({ url: "https://example.com/artikel" });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Testseite");
    expect(res.body.content).toContain("Wichtiger Inhalt");
  });
});



