// @vitest-environment node
//
// Die Enterprise-Routen von 2.13: KI-Apps und Verbinden, Prüfprotokoll,
// Privatsphäre-Schild (auch im Chat vor einem Cloud-Modell), Today,
// Widersprüche und Dossier. Alles mit Temp-Datenbank und Temp-Heimatordner.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import request from "supertest";
import { KeptaStore } from "../src/core/store";
import { saveWithIndex } from "../src/core/mcp";
import { paarSchluessel } from "../src/lib/widersprueche";
import { protokolliere as aktivitaet } from "../src/lib/aktivitaet";

process.env.KEPTA_NO_AUTOSTART = "1";
// Hermetisch: Tests dürfen nie den echten Schlüsselbund berühren (22.9. gelernt —
// ein Keychain-Zugriff aus Tests hat den echten Datenbank-Schlüssel überschrieben).
// Die Nebendateien-Verschlüsselung selbst deckt tests/nebendateien.test.ts mit
// eigenen Schlüsseln ab.
process.env.KEPTA_ENCRYPTION = "off";

let createApp: typeof import("../server").createApp;
let store: KeptaStore;
let app: import("express").Express;
let dir: string;
let home: string;
let prevHome: string | undefined;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-ent-"));
  home = fs.mkdtempSync(path.join(tmpdir(), "kepta-ent-home-"));
  prevHome = process.env.HOME;
  process.env.HOME = dir;
  process.env.KEPTA_DATA_DIR = dir;
  vi.resetModules();
  ({ createApp } = await import("../server"));
  store = new KeptaStore(path.join(dir, "test.db"));
  app = createApp(store, { umgebung: { home, plattform: "darwin", claude: () => null } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  store.close();
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
});

/** Requests that come from the app window carry its own origin. */
const ausDemFenster = (r: request.Test) => r.set("Origin", "http://127.0.0.1").set("Host", "127.0.0.1");

describe("KI-Apps und Verbinden", () => {
  it("/api/agents: neueste zuerst, lesbare Namen, der Titel der Notiz", async () => {
    const n = store.createMemory({ title: "Backup plan", content: "Nightly." });
    aktivitaet(store, { client: "claude-ai", tool: "connect", at: 1000 });
    aktivitaet(store, { client: "claude-ai", tool: "memory_save", text: "old title", memoryId: n.id, at: 2000 });
    const r = await request(app).get("/api/agents");
    expect(r.body.entries.map((e: { who: string; tool: string; text: string; noteId: string | null }) => [e.who, e.tool, e.text, e.noteId])).toEqual([
      ["Claude", "memory_save", "Backup plan", n.id],
      ["Claude", "connect", null, null],
    ]);
    expect(r.body.agents).toEqual([{ who: "Claude", lastSeen: 2000, calls: 2 }]);
    expect((await request(app).get(`/api/agents?after=${r.body.entries[0].id}`)).body.entries).toEqual([]);
  });

  it("/api/clients + Connect: trägt KEPTA ein und hält es im Protokoll fest", async () => {
    fs.mkdirSync(path.join(home, ".cursor"), { recursive: true });
    const liste = (await request(app).get("/api/clients")).body.clients;
    expect(liste.find((c: { id: string }) => c.id === "cursor")).toMatchObject({ installed: true, connected: false, canConnect: true });
    const r = await ausDemFenster(request(app).post("/api/clients/cursor/connect"));
    expect(r.status).toBe(200);
    expect(r.body.clients.find((c: { id: string }) => c.id === "cursor").connected).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(home, ".cursor", "mcp.json"), "utf8")).mcpServers.kepta).toEqual({ command: "npx", args: ["-y", "kepta-mcp"] });
    const nein = await request(app).post("/api/clients/windsurf/connect");
    expect(nein.status).toBe(400);
    expect(nein.body.error).toContain("not seem to be installed");
    expect((await request(app).post("/api/clients/..%2Fx/connect")).status).toBe(400);
    const audit = (await request(app).get("/api/audit")).body.entries;
    expect(audit[0]).toMatchObject({ actor: "You", action: "connect app", target: "Cursor" });
  });
});

describe("Prüfprotokoll", () => {
  it("hält Änderungen aus der App und über die HTTP-API fest — aber nur gelungene", async () => {
    const neu = await ausDemFenster(request(app).post("/api/memories").send({ title: "Tax office", content: "Call on Monday." }));
    expect(neu.status).toBe(200);
    await request(app).post("/api/memory").send({ title: "From a script", content: "x" });
    await ausDemFenster(request(app).delete(`/api/memories/${neu.body.memory.id}`));
    await request(app).delete("/api/memories/gibt-es-nicht");
    await request(app).post("/api/memories/bulk-delete").send({ ids: "kaputt" });
    const r = (await request(app).get("/api/audit")).body;
    expect(r.entries.map((e: { actor: string; action: string; target: string }) => [e.actor, e.action, e.target])).toEqual([
      ["You", "delete", "Tax office"],
      ["HTTP API", "save", "From a script"],
      ["You", "save", "Tax office"],
    ]);
    expect(r.actors).toEqual(["HTTP API", "You"]);
    expect((await request(app).get("/api/audit?actor=You")).body.entries).toHaveLength(2);
    expect((await request(app).get("/api/audit/verify")).body).toEqual({ ok: true, entries: 3, brokenAt: null, truncated: false });
  });

  it("exportiert CSV — und der Export steht selbst im Protokoll", async () => {
    await request(app).post("/api/memory").send({ title: "A", content: "x" });
    const r = await request(app).get("/api/audit/export.csv");
    expect(r.headers["content-type"]).toMatch(/text\/csv/);
    expect(r.headers["content-disposition"]).toMatch(/attachment; filename="kepta-audit-\d{4}-\d{2}-\d{2}\.csv"/);
    expect(r.text.split("\n")[0]).toBe("entry,time (UTC),who,action,subject,details,seal");
    expect((await request(app).get("/api/audit")).body.entries[0]).toMatchObject({ action: "export", target: "audit log (CSV)" });
  });
});

describe("Privatsphäre-Schild", () => {
  it("Einstellungen lesen und umschalten — beides ist an, bis jemand es ausschaltet", async () => {
    expect((await request(app).get("/api/shield")).body).toMatchObject({ chat: true, apps: true, privateNotes: 0, week: { cloudChats: 0, protectedChats: 0 } });
    expect((await request(app).put("/api/shield").send({ apps: false, chat: "ja" })).body).toEqual({ chat: true, apps: false });
    expect((await request(app).get("/api/shield")).body.apps).toBe(false);
  });

  it("MCP über HTTP und die alte Such-Route: keine privaten Notizen, keine Geheimnisse", async () => {
    saveWithIndex(store, { title: "Server access", content: "Host db.intern, password: Hunter2!x" });
    const geheim = saveWithIndex(store, { title: "Blood test", content: "Blood test results", scope: "private" }).record;
    const mcp = await request(app).post("/mcp").send({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "memory_search", arguments: { query: "blood test server access" } } });
    const text = JSON.stringify(mcp.body);
    expect(text).not.toContain("Blood test results");
    expect(text).not.toContain("Hunter2");
    expect(text).toContain("[SECRET-1]");
    const alt = await request(app).post("/api/mcp/search").send({ query: "blood test server access" });
    expect(JSON.stringify(alt.body)).not.toContain("Blood test results");
    expect(alt.body.memories[0].content).toBe("Host db.intern, password: [SECRET-1]");
    expect((await request(app).post("/api/mcp/save").send({ id: geheim.id, title: "x", content: "y" })).status).toBe(403);
    expect(store.getMemory(geheim.id)!.content).toBe("Blood test results");
    const audit = (await request(app).get("/api/audit")).body.entries;
    expect(audit.map((e: { actor: string; action: string }) => e.action)).toEqual(expect.arrayContaining(["search"]));
  });

  it("Chat mit einem Cloud-Modell: nichts Persönliches geht hinaus, die Antwort zeigt die echten Werte", async () => {
    const privat = store.createMemory({ title: "Diagnosis", content: "Private medical note", scope: "private" });
    let gesendet = "";
    const upstream = vi.fn(async (_url: string, init?: RequestInit) => {
      gesendet = String(init?.body ?? "");
      const zeilen = [
        `data: ${JSON.stringify({ choices: [{ delta: { content: "Send it to [EMA" } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: "IL-1] today." } }] })}\n\n`,
        "data: [DONE]\n\n",
      ];
      return new Response(new ReadableStream({ start(c) { for (const z of zeilen) c.enqueue(new TextEncoder().encode(z)); c.close(); } }), { status: 200 });
    });
    vi.stubGlobal("fetch", upstream);
    const r = await request(app)
      .post("/api/chat/stream")
      .send({
        protocol: "openai",
        baseUrl: "https://api.example.com/v1",
        model: "m1",
        system: `Context\n\n[ID: a | TAGS:  | TITEL: Lumen]\nContact anna@lumen.example, IBAN DE89 3704 0044 0532 0130 00\n\n[ID: ${privat.id} | TAGS:  | TITEL: Diagnosis]\nPrivate medical note\n\n`,
        messages: [{ role: "user", content: "Where do I send the invoice for anna@lumen.example?" }],
      });
    expect(gesendet).not.toContain("anna@lumen.example");
    expect(gesendet).not.toContain("DE89");
    expect(gesendet).not.toContain("Private medical note");
    expect(gesendet).toContain("[EMAIL-1]");
    const ereignisse = r.text.split("\n\n").filter((z) => z.startsWith("data: ") && !z.includes("[DONE]")).map((z) => JSON.parse(z.slice(6)));
    expect(ereignisse[0]).toEqual({ shield: { hidden: { iban: 1, email: 1 }, text: "1 IBAN and 1 email address", privateNotes: 1, provider: "api.example.com" } });
    expect(ereignisse.slice(1).map((e) => e.text).join("")).toBe("Send it to anna@lumen.example today.");
    expect((await request(app).get("/api/audit")).body.entries[0]).toMatchObject({
      actor: "You",
      action: "cloud chat",
      target: "api.example.com · m1",
      detail: "1 note sent · hidden: 1 IBAN and 1 email address · 1 private note left out",
    });
  });

  it("ein Modell auf diesem Rechner sieht alles — und kommt nicht ins Cloud-Protokoll", async () => {
    let gesendet = "";
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      gesendet = String(init?.body ?? "");
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
    }));
    const r = await request(app).post("/api/chat").send({ protocol: "openai", baseUrl: "http://localhost:11434/v1", model: "llama", messages: [{ role: "user", content: "mail anna@lumen.example" }] });
    expect(r.body).toEqual({ text: "ok" });
    expect(gesendet).toContain("anna@lumen.example");
    expect((await request(app).get("/api/audit")).body.entries).toEqual([]);
  });

  it("ohne Chat-Schutz geht der Text hinaus — private Notizen bleiben trotzdem daheim", async () => {
    await request(app).put("/api/shield").send({ chat: false });
    let gesendet = "";
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      gesendet = String(init?.body ?? "");
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
    }));
    const privat = store.createMemory({ title: "P", content: "secret", scope: "private" });
    await request(app).post("/api/chat").send({ protocol: "openai", baseUrl: "https://api.example.com/v1", system: `[ID: ${privat.id} | TAGS:  | TITEL: P]\nsecret\n\n`, messages: [{ role: "user", content: "mail anna@lumen.example" }] });
    expect(gesendet).toContain("anna@lumen.example");
    expect(gesendet).not.toContain("secret");
  });
});

describe("Today, Widersprüche, Dossier", () => {
  it("Today fasst zusammen — ein Widerspruch lässt sich mit einem Klick auflösen", async () => {
    const alt = store.createMemory({ title: "Backup A", content: "Backups run nightly at 02:00.", type: "semantic", updatedAt: 1 });
    const neu = store.createMemory({ title: "Backup B", content: "Backups now run nightly at 03:00.", type: "semantic", updatedAt: 2 });
    const b = (await request(app).get("/api/briefing?since=1")).body;
    expect(b.created.total).toBe(2);
    expect(b.contradictions).toHaveLength(1);
    expect((await request(app).post("/api/contradictions/resolve").send({ keep: neu.id, drop: neu.id })).status).toBe(400);
    expect((await request(app).post("/api/contradictions/resolve").send({ keep: neu.id, drop: alt.id })).body).toEqual({ ok: true });
    expect(store.getMemory(alt.id)!.supersededBy).toBe(neu.id);
    expect((await request(app).get("/api/briefing")).body.contradictions).toEqual([]);
  });

  it("„Everything“-Fenster: since=0 heißt die ganze Geschichte, nicht der 24h-Default (Paket 3)", async () => {
    store.createMemory({ title: "Urgestein", content: "alt", type: "semantic", createdAt: 5, updatedAt: 5 });
    const alles = (await request(app).get("/api/briefing?since=0")).body;
    expect(alles.created.total).toBe(1); // ohne den Fix liefe since=0 auf den 24h-Default und meldete 0
    const heute = (await request(app).get("/api/briefing?since=" + (Date.now() + 1000))).body;
    expect(heute.created.total).toBe(0);
  });

  it("„beides stimmt“ merkt sich das Paar", async () => {
    const a = store.createMemory({ title: "A", content: "The license costs 1.200 € per year.", type: "semantic" });
    const b = store.createMemory({ title: "B", content: "The license costs 1500 EUR per year.", type: "semantic" });
    expect((await request(app).get("/api/briefing")).body.contradictions).toHaveLength(1);
    await request(app).post("/api/contradictions/resolve").send({ keep: a.id, drop: b.id, both: true });
    expect((await request(app).get("/api/briefing")).body.contradictions).toEqual([]);
    expect(store.getMemory(b.id)!.supersededBy).toBeNull();
  });

  it("„beide gültig mit Fenster“ schließt das Fenster der älteren Notiz und markiert das Paar", async () => {
    const aeltere = store.createMemory({ title: "Old price", content: "The plan costs 1.200 € per year.", type: "semantic", createdAt: 1000, updatedAt: 1000 });
    const neuere = store.createMemory({ title: "New price", content: "The plan costs 1500 EUR per year.", type: "semantic" });
    const r = await request(app).post("/api/contradictions/resolve").send({ keep: neuere.id, drop: aeltere.id, window: true });
    expect(r.body.ok).toBe(true);
    // Das Fenster endet dort, wo die neuere Notiz beginnt.
    expect(r.body.window).toBe(neuere.updatedAt);
    const geaendert = store.getMemory(aeltere.id)!;
    expect(geaendert.validTo).toBe(neuere.updatedAt);
    expect(geaendert.supersededBy).toBeNull(); // beide bleiben gültig — niemand wird abgelöst
    // Das Paar kommt als Widerspruch nicht wieder.
    expect((await request(app).get("/api/briefing")).body.contradictions).toEqual([]);
  });

  it("„Fenster setzen“ erfindet nichts: vorhandenes Fenster bleibt, unmögliches wird nicht gesetzt", async () => {
    const aeltere = store.createMemory({ title: "Old note", content: "The plan costs 1.200 € per year.", type: "semantic" });
    const neuere = store.createMemory({ title: "New note", content: "The plan costs 1500 EUR per year.", type: "semantic" });
    store.updateMemory(aeltere.id, { validTo: 555 });
    let r = await request(app).post("/api/contradictions/resolve").send({ keep: neuere.id, drop: aeltere.id, window: true });
    expect(r.body).toEqual({ ok: true, window: null });
    expect(store.getMemory(aeltere.id)!.validTo).toBe(555); // unangetastet
    // Unmögliches Fenster: das Ende läge VOR dem Beginn der älteren Notiz.
    const frueh = store.createMemory({ title: "Early", content: "The plan costs 900 € per year.", type: "semantic", createdAt: 5, updatedAt: 5 });
    const spaet = store.createMemory({ title: "Late", content: "The plan costs 800 EUR per year.", type: "semantic", createdAt: 10, updatedAt: 10, validFrom: 10 });
    r = await request(app).post("/api/contradictions/resolve").send({ keep: frueh.id, drop: spaet.id, window: true });
    expect(r.body).toEqual({ ok: true, window: null }); // nichts erfunden, Paar trotzdem beruhigt
    expect(store.getMemory(spaet.id)!.validTo).toBeNull();
    // Genau dieses Paar kommt nicht wieder — die übrigen Kreuz-Paare des Test-Bestands bleiben unberührt.
    const liste = (await request(app).get("/api/briefing")).body.contradictions as { key: string }[];
    expect(liste.some((w) => w.key === paarSchluessel(frueh.id, spaet.id))).toBe(false);
  });

  it("Dossier mit Markdown und Vorschlägen", async () => {
    saveWithIndex(store, { title: "Atlas relaunch", content: "The Atlas relaunch starts in October.", type: "semantic", tags: ["atlas"] });
    const d = (await request(app).get("/api/dossier?topic=Atlas")).body;
    expect(d.total).toBe(1);
    expect(d.markdown).toContain("# Dossier: Atlas");
    expect((await request(app).get("/api/dossier?topic=")).status).toBe(400);
    expect((await request(app).get("/api/dossier/suggestions")).body.tags[0]).toEqual({ name: "atlas", count: 1 });
  });

  it("wer wann welche Notiz gelesen hat", async () => {
    const n = saveWithIndex(store, { title: "Atlas relaunch", content: "The Atlas relaunch starts in October." }).record;
    await request(app).post("/mcp").send({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "memory_search", arguments: { query: "atlas relaunch" } }, _meta: { clientInfo: { name: "claude-ai" } } });
    expect((await request(app).get(`/api/memories/${n.id}/readers`)).body.readers).toEqual([{ who: "Claude", times: 1, last: expect.any(Number) }]);
  });
});

describe("alle Routen laufen ohne alles", () => {
  // Kein Schlüssel, keine Stufe, kein Zähler: diese Routes answers simply 200.
  // Der Plan-Kopf ist mit den Limits weg (09.10.2026) — was blieb, ist die
  // Aussage, dass nichts gesperrt ist.
  it("Briefing, Dossier, Audit und Shield antworten jeder Installation", async () => {
    const ohne = createApp(store, { umgebung: { home, plattform: "darwin", claude: () => null } });
    for (const pfad of ["/api/briefing", "/api/dossier?topic=x", "/api/audit", "/api/shield"]) {
      const res = await request(ohne).get(pfad);
      expect(res.status, pfad).toBe(200);
      expect(res.headers, `${pfad}: kein Plan-Kopf mehr`).not.toHaveProperty("x-kepta-plan");
    }
    expect((await request(ohne).get("/api/agents")).status).toBe(200);
    expect((await request(ohne).get("/api/clients")).status).toBe(200);
  });
});
