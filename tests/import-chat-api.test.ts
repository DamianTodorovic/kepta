// @vitest-environment node
//
// POST /api/import/chat von Anfang bis Ende: ungültige Eingaben, beide Export-
// formate, Wiedereinlesen ohne Doppel (Titel-Dedup der Obsidian-Pipeline) und
// die Schreib-Drossel um den 40mb-Body herum.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import request from "supertest";
import { KeptaStore } from "../src/core/store";

process.env.KEPTA_NO_AUTOSTART = "1";
// Hermetisch: Tests dürfen nie den echten Schlüsselbund berühren (22.9. gelernt —
// ein Keychain-Zugriff aus Tests hat den echten Datenbank-Schlüssel überschrieben).
// Die Nebendateien-Verschlüsselung selbst deckt tests/nebendateien.test.ts mit
// eigenen Schlüsseln ab.
process.env.KEPTA_ENCRYPTION = "off";

let createApp: typeof import("../server").createApp;
let store: KeptaStore;
let app: import("express").Express;
let prevHome: string | undefined;
let dir: string;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-chatimport-"));
  prevHome = process.env.HOME;
  process.env.HOME = dir;
  process.env.KEPTA_DATA_DIR = dir;
  vi.resetModules();
  ({ createApp } = await import("../server"));
  store = new KeptaStore(path.join(dir, "test.db"));
  app = createApp(store);
});

afterEach(() => {
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
  delete process.env.KEPTA_DATA_DIR;
  // Aufgabe #112: 980 eigene Ordner unter $TMPDIR an diesem Abend, gemessen 21:27.
  fs.rmSync(dir, { recursive: true, force: true });
});

const CHATGPT = JSON.stringify([
  {
    title: "Kanzlei-Fristen",
    create_time: 1709251200,
    current_node: "k2",
    mapping: {
      root: { parent: null, children: ["k1"] },
      k1: { parent: "root", children: ["k2"], message: { author: { role: "user" }, content: { content_type: "text", parts: ["Welche Fristen gelten bei Berufung?"] } } },
      k2: { parent: "k1", children: [], message: { author: { role: "assistant" }, content: { content_type: "text", parts: ["Ein Monat ab Zustellung, § 519 ZPO."] } } },
    },
  },
]);

const CLAUDE = JSON.stringify([
  {
    uuid: "c1",
    name: "Mandatswechsel",
    created_at: "2026-02-01T09:00:00.000Z",
    chat_messages: [
      { sender: "human", text: "Was gehört in ein Entlastungsschreiben?" },
      { sender: "assistant", text: "Akteneinsicht, Quittung, Fristenliste." },
    ],
  },
]);

describe("POST /api/import/chat", () => {
  it("drei Exporte nacheinander gehen alle durch — ein Tageslimit gibt es nicht mehr", async () => {
    const frei = createApp(store);
    for (let i = 0; i < 3; i++) {
      const res = await request(frei).post("/api/import/chat").send({ content: CHATGPT });
      expect(res.status, `Import ${i + 1}: ${res.status} · ${res.text.slice(0, 140)}`).toBe(200);
    }
  });

  it("ohne Inhalt: 400; mit kaputtem JSON: 400 mit Erklärung", async () => {
    expect((await request(app).post("/api/import/chat").send({})).status).toBe(400);
    const res = await request(app).post("/api/import/chat").send({ content: "{kaputt" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not valid JSON/);
  });

  it("eine Datei, die kein Chat-Export ist: 400, nichts geschrieben", async () => {
    const res = await request(app).post("/api/import/chat").send({ content: JSON.stringify([{ beliebig: 1 }]) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not a ChatGPT or Claude export/);
    expect(store.listMemories()).toHaveLength(0);
  });

  it("ChatGPT-Export: das Gespräch wird zur durchsuchbaren Notiz mit Quelle und Tag", async () => {
    const res = await request(app).post("/api/import/chat").send({ content: CHATGPT });
    expect(res.status).toBe(200);
    expect(res.body.format).toBe("chatgpt");
    expect(res.body.conversations).toBe(1);
    expect(res.body.imported).toBe(1);
    const notiz = store.listMemories()[0]!;
    expect(notiz.title).toBe("Kanzlei-Fristen — 2024-03-01");
    expect(notiz.scope).toBe("chatgpt-import");
    expect(notiz.tags).toContain("chatgpt-import");
    expect(notiz.content).toContain("§ 519 ZPO");
    // Und sie ist sofort über die Suche findbar (indexMemory lief der Import mit):
    const suche = await request(app).post("/api/search").send({ query: "Berufung Frist" });
    expect(suche.status).toBe(200);
    expect(JSON.stringify(suche.body)).toContain("Kanzlei-Fristen");
  });

  it("Claude-Export: name wird Titel, scope claude-import", async () => {
    const res = await request(app).post("/api/import/chat").send({ content: CLAUDE });
    expect(res.status).toBe(200);
    expect(res.body.format).toBe("claude");
    expect(res.body.imported).toBe(1);
    expect(store.listMemories()[0]!.scope).toBe("claude-import");
  });

  it("denselben Export zweimal senden: kein Doppel — der Zweitlauf fasst die unveränderte Notiz nicht an", async () => {
    await request(app).post("/api/import/chat").send({ content: CHATGPT });
    const zweite = await request(app).post("/api/import/chat").send({ content: CHATGPT });
    expect(zweite.body.imported).toBe(0);
    expect(zweite.body.updated).toBe(0);
    expect(zweite.body.skipped).toBe(1); // Resync-Schutz: unverändert bleibt unverändert
    expect(store.listMemories()).toHaveLength(1);
  });

  it("beide Formate in einer Liste? Nein — das erste erkannte Format entscheidet", async () => {
    const gemischt = JSON.stringify([...JSON.parse(CHATGPT), ...JSON.parse(CLAUDE)]);
    const res = await request(app).post("/api/import/chat").send({ content: gemischt });
    expect(res.status).toBe(200);
    expect(res.body.format).toBe("chatgpt");
  });
});
