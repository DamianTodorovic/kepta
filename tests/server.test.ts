import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import dns from "node:dns";
import request from "supertest";
import { KeptaStore } from "../src/core/store";
import { indexMemory } from "../src/core/engine";
import { DEFAULT_EMBED_MODEL } from "../src/core/embeddings";
import { APP_VERSION } from "../src/core/version";

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
    // Ohne Schluessel (Tests) sagt der Status das auch.
    expect(res.body.encryption).toEqual({ aktiv: false });
  });
});

describe("/api/memories CRUD", () => {
  it("GET liefert anfangs eine leere Liste", async () => {
    const res = await request(app).get("/api/memories");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it("POST setzt scope — die HTTP-Route ignorierte das Feld, MCP konnte es laengst", async () => {
    const res = await request(app).post("/api/memories").send({ title: "Scope", content: "x", scope: "agent:coder" });
    expect(res.status).toBe(200);
    expect(res.body.memory.scope).toBe("agent:coder");
  });

  it("POST begrenzt einen unsinnig langen scope", async () => {
    const res = await request(app).post("/api/memories").send({ title: "Scope", content: "x", scope: "a".repeat(200) });
    expect(res.status).toBe(200);
    expect(res.body.memory.scope.length).toBeLessThanOrEqual(64);
  });

  it("POST setzt supersededBy beim Aendern", async () => {
    const alt = await request(app).post("/api/memories").send({ title: "Alte Adresse", content: "Hamburg" });
    const neu = await request(app).post("/api/memories").send({ title: "Neue Adresse", content: "Leipzig" });
    const res = await request(app).post("/api/memories").send({ id: alt.body.memory.id, supersededBy: neu.body.memory.id });
    expect(res.status).toBe(200);
    expect(res.body.memory.supersededBy).toBe(neu.body.memory.id);
  });

  it("POST loest eine Ersetzung wieder auf (supersededBy: null)", async () => {
    const alt = await request(app).post("/api/memories").send({ title: "A", content: "x" });
    const neu = await request(app).post("/api/memories").send({ title: "B", content: "y" });
    await request(app).post("/api/memories").send({ id: alt.body.memory.id, supersededBy: neu.body.memory.id });
    const res = await request(app).post("/api/memories").send({ id: alt.body.memory.id, supersededBy: null });
    expect(res.body.memory.supersededBy).toBeNull();
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

describe("Grenze fuer aktive Knoten", () => {
  it("Import warnt, wenn er den Bestand ueber die Grenze hebt", async () => {
    // Ein Backup darf nie abgewiesen werden — sonst verliert jemand beim
    // Wiederherstellen Daten. Aber er muss erfahren, dass er darueber liegt,
    // statt es erst zu merken, wenn das Anlegen einer einzelnen Notiz scheitert.
    const viele = Array.from({ length: 12 }, (_, i) => ({
      id: `grenze-${i}`, title: `Knoten ${i}`, content: `Inhalt ${i}`,
    }));
    vi.stubEnv("KEPTA_MAX_ACTIVE", "5");
    const res = await request(app).post("/api/memories/import").send({ memories: viele });
    vi.unstubAllEnvs();
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(12);
    expect(res.body.warning).toMatch(/5/);
  });

  it("Import ohne Ueberschreitung warnt nicht", async () => {
    const res = await request(app).post("/api/memories/import").send({
      memories: [{ id: "grenze-ok", title: "Einer", content: "x" }],
    });
    expect(res.status).toBe(200);
    expect(res.body.warning).toBeUndefined();
  });

  it("Einzelanlage nennt die tatsaechliche Grenze", async () => {
    // Erst ueber die Grenze bringen — bei leerem Bestand greift keine.
    await request(app).post("/api/memories/import").send({
      memories: [
        { id: "voll-1", title: "A", content: "x" },
        { id: "voll-2", title: "B", content: "y" },
        { id: "voll-3", title: "C", content: "z" },
      ],
    });
    vi.stubEnv("KEPTA_MAX_ACTIVE", "1");
    const res = await request(app).post("/api/memories").send({ title: "Zu viel", content: "x" });
    vi.unstubAllEnvs();
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/3 active nodes, maximum is 1/);
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

  it("ungültiger Body (Batch-Array) → 400 mit Batching-Hinweis", async () => {
    // MCP 2026-07-28 hat Batching gestrichen → einzelnes Error-Objekt -32600
    const res = await request(app).post("/mcp").send([{ jsonrpc: "2.0", id: 1, method: "ping" }]);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(-32600);
    expect(res.body.error.message).toContain("Batching");
  });

  it("fehlendes jsonrpc-Feld wird toleriert, falscher Wert → -32600", async () => {
    const ok = await request(app).post("/mcp").send({ id: 1, method: "ping" });
    expect(ok.status).toBe(200);
    expect(ok.body.result).toEqual({});
    const bad = await request(app).post("/mcp").send({ jsonrpc: "1.0", id: 2, method: "ping" });
    expect(bad.body.error.code).toBe(-32600);
  });

  it("Notification (ohne id) → 202 accepted", async () => {
    const res = await request(app).post("/mcp").send({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(res.status).toBe(202);
    expect(res.body.accepted).toBe(true);
  });

  it("Notification für unbekannte Methode → 202, kein JSON-RPC-Error mit id:null", async () => {
    const res = await request(app).post("/mcp").send({ jsonrpc: "2.0", method: "nope/notification" });
    expect(res.status).toBe(202);
    expect(res.body.accepted).toBe(true);
  });

  it("tools/call memory_search mit String-limit liefert Default-Verhalten (kein NaN)", async () => {
    await request(app).post("/api/memories").send({ title: "Rust", content: "Speichersicherheit" });
    const res = await request(app).post("/mcp").send({
      jsonrpc: "2.0", id: 7, method: "tools/call",
      params: { name: "memory_search", arguments: { query: "Speichersicherheit", limit: "kaputt" } },
    });
    expect(res.body.result.structuredContent.count).toBeGreaterThan(0);
  });

  it("GET /mcp → 405 (nur POST erlaubt)", async () => {
    const res = await request(app).get("/mcp");
    expect(res.status).toBe(405);
  });
});

describe("Import: Body-Limits, Vollständigkeit, Zeitstempel", () => {
  it("akzeptiert Import-Payload >1MB (2mb-Limit der Route, globales 1mb-Limit greift nicht)", async () => {
    const big = "x".repeat(1_200_000);
    const res = await request(app)
      .post("/api/memories/import")
      .set("Content-Type", "application/json")
      .send({ memories: [{ title: "Groß", content: big }], mode: "merge" });
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
  });

  it("weist Import-Payload über dem 2mb-Limit mit 413 ab", async () => {
    const big = "x".repeat(2_500_000);
    const res = await request(app)
      .post("/api/memories/import")
      .set("Content-Type", "application/json")
      .send({ memories: [{ title: "Zu groß", content: big }] });
    expect(res.status).toBe(413);
  });

  it("akzeptiert Markdown-Import >2MB (10mb-Limit der Route)", async () => {
    const files = [1, 2, 3].map((i) => ({ name: `note-${i}.md`, content: `# Notiz ${i}\n\n${"Inhalt. ".repeat(350_000)}` }));
    const res = await request(app)
      .post("/api/import/markdown")
      .set("Content-Type", "application/json")
      .send({ files });
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(3);
  });

  it("globales 1mb-Limit bleibt für normale Routen aktiv (413)", async () => {
    const res = await request(app)
      .post("/api/memories")
      .set("Content-Type", "application/json")
      .send({ title: "X", content: "x".repeat(1_500_000) });
    expect(res.status).toBe(413);
  });

  it("Replace-Import mit doppelten IDs → 200 (dedupliziert) statt 500", async () => {
    const res = await request(app).post("/api/memories/import").send({
      memories: [
        { id: "k-dup", title: "Erste", content: "a" },
        { id: "k-dup", title: "Zweite", content: "b" },
      ],
      mode: "replace",
    });
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    expect(res.body.total).toBe(1);
  });

  it("Merge-Import erhält createdAt/updatedAt aus der Backup-Datei", async () => {
    const then = Date.now() - 100_000;
    await request(app).post("/api/memories/import").send({
      memories: [{ title: "Historisch", content: "x", createdAt: then, updatedAt: then }],
    });
    const list = await request(app).get("/api/memories");
    const m = list.body.find((r: { title: string }) => r.title === "Historisch");
    expect(m.updatedAt).toBe(then);
    expect(m.createdAt).toBe(then);
  });

  it("listet auch >1000 Knoten vollständig (Liste und Export)", async () => {
    for (let i = 0; i < 1100; i++) store.createMemory({ title: `Bulk ${i}`, content: "kurz" });
    const list = await request(app).get("/api/memories");
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1100);
    const exp = await request(app).post("/api/export/markdown").send({});
    expect(exp.status).toBe(200);
    expect(exp.body.exported).toBe(1100);
  });
});

describe("Sanitize: Code bleibt lesbar, Steuerzeichen werden bereinigt", () => {
  it("POST /api/memories erhält legitimen Code-Beispiel-Inhalt", async () => {
    const code = 'Beispiel: <a href="javascript:void(0)">klick</a> mit onclick="alert(1)" — nur Demo-Code';
    const post = await request(app).post("/api/memories").send({ title: "Code-Notiz", content: code });
    expect(post.status).toBe(200);
    expect(post.body.memory.content).toBe(code);
  });

  it("NUL-Bytes und Steuerzeichen werden trotzdem entfernt", async () => {
    const post = await request(app).post("/api/memories").send({ title: "Steuer", content: "sauber\u0000\u0001inhalt" });
    expect(post.status).toBe(200);
    expect(post.body.memory.content).not.toMatch(/[\u0000\u0001]/);
    expect(post.body.memory.content).toContain("sauber");
    expect(post.body.memory.content).toContain("inhalt");
  });
});

describe("Version (eine Quelle)", () => {
  it("/api/health liefert die package.json-Version", async () => {
    const res = await request(app).get("/api/health");
    expect(res.body.version).toBe(APP_VERSION);
  });
});
