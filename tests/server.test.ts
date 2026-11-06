import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import dns from "node:dns";
import request from "supertest";
import { KeptaStore } from "../src/core/store";
import { defaultExtensions } from "../src/core/extensions";
import { indexMemory } from "../src/core/engine";
import { DEFAULT_EMBED_MODEL } from "../src/core/embeddings";
import { APP_VERSION } from "../src/core/version";
// Seit #61 verlangen die Chat-Routen einen genannten Anbieter: die sechs Faelle unten
// pruefen die Upstream-Formate (SSE-Stuecke, Fehlerweitergabe, Anthropic-Textbloecke),
// nicht die Adresse. Sie nennen darum eine rueckkopfloese, an der nichts horcht — der
// fetch ist ohnehin gestubbt. Keine Erwartung ist geloescht; jede nennt jetzt, was sie
// vorher aus dem Default der Route geliehen bekam. (Grund: server/helfer/upstream.ts:68
// riet https://api.openai.com/v1, und ohne Schluessel waere das Packet draussen.)
const UPSTREAM_OHNE_HORCHER = "http://127.0.0.1:9/v1";


// server.ts startet beim Import normalerweise automatisch — mit KEPTA_NO_AUTOSTART=1
// wird nur createApp exportiert, ohne Port zu binden.
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

describe("POST /api/recovery-key", () => {
  it("nur fuer eine verschluesselte Datei, nur aus dem eigenen Fenster — dann der echte Schluessel", async () => {
    expect((await request(app).post("/api/recovery-key").set("X-KEPTA-Recovery", "1")).status).toBe(404);
    let fragen = 0;
    const verschluesselt = new KeptaStore(path.join(dir, "enc.db"), {
      ...defaultExtensions(),
      keys: { ablage: "Test-Bund", keyFor: () => { fragen++; if (fragen > 2) throw new Error("Keychain locked"); return Buffer.alloc(32, 0x42); } },
    });
    const app2 = createApp(verschluesselt);
    expect((await request(app2).post("/api/recovery-key")).status).toBe(403);
    expect((await request(app2).post("/api/recovery-key").set("X-KEPTA-Recovery", "1").set("Host", "boese.example")).status).toBe(403);
    expect((await request(app2).post("/api/recovery-key").set("X-KEPTA-Recovery", "1").set("Origin", "https://boese.example")).status).toBe(403);
    const r = await request(app2).post("/api/recovery-key").set("X-KEPTA-Recovery", "1");
    expect(r.body).toEqual({ key: "42".repeat(32), storedIn: "Test-Bund" });
    expect(r.headers["cache-control"]).toBe("no-store");
    const gesperrt = await request(app2).post("/api/recovery-key").set("X-KEPTA-Recovery", "1");
    expect(gesperrt.status).toBe(500);
    // P4-2310 (c), 23.10.: der Ausnahmewortlaut bleibt im Protokoll, nach aussen geht
    // ein fester Satz mit Kennung. Bis hierher verlangte dieser Fall das Gegenteil -
    // "Keychain locked" war der fremde Wortlaut, den die Entscheidung verbietet.
    expect(gesperrt.body.error).toMatch(/recovery key could not be read/i);
    expect(gesperrt.body.error).not.toContain("Keychain locked");
    expect(gesperrt.body.grund).toBe("schluessel-nicht-lesbar");
    verschluesselt.close();
  });
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
    expect(Array.isArray(res.body.memories)).toBe(true);
    expect(res.body.count).toBe(0);
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
    expect(list.body.count).toBe(1);
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
    expect(active.body.count).toBe(0);
    const trash = await request(app).get("/api/memories?trash=1");
    expect(trash.body.count).toBe(1);
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
    expect(res.body.error).toMatch(/3 active notes, maximum is 1/);
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
    await request(app).post("/api/profile").send({ displayName: "Alex" });
    const res = await request(app).get("/api/profile");
    expect(res.body.displayName).toBe("Alex");
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
    expect(active.body.count).toBe(1);
  });

  it("POST /api/memories/bulk-delete raeumt viele auf EINMAL in den Papierkorb", async () => {
    // Der Grund fuer diese Route: einzeln geloescht lief das Aufraeumen von
    // Duplikaten in die Schreibdrossel. Die ersten sechzig
    // verschwanden, alles Weitere bekam 429 — und weil der Aufrufer den Fehler
    // verwarf, meldete die Oberflaeche trotzdem Erfolg. Von aussen sah das aus,
    // als loesche K3PTA wahllos die halbe Wissensbasis.
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await request(app).post("/api/memories").send({ title: `B${i}`, content: `Inhalt ${i}` });
      ids.push(r.body.memory.id);
    }
    const res = await request(app).post("/api/memories/bulk-delete").send({ ids: ids.slice(0, 3) });
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(3);
    expect(res.body.ids).toHaveLength(3);

    const aktiv = await request(app).get("/api/memories");
    expect(aktiv.body.count).toBe(2);
  });

  it("bulk-restore holt genau die zurueck, die bulk-delete genommen hat", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await request(app).post("/api/memories").send({ title: `C${i}`, content: `Inhalt ${i}` });
      ids.push(r.body.memory.id);
    }
    const weg = await request(app).post("/api/memories/bulk-delete").send({ ids });
    expect((await request(app).get("/api/memories")).body.count).toBe(0);

    const zurueck = await request(app).post("/api/memories/bulk-restore").send({ ids: weg.body.ids });
    expect(zurueck.body.restored).toBe(4);
    expect((await request(app).get("/api/memories")).body.count).toBe(4);
  });

  it("bulk-delete weist Unsinn ab, statt irgendetwas zu loeschen", async () => {
    const r = await request(app).post("/api/memories").send({ title: "Bleibt", content: "unangetastet" });
    const id = r.body.memory.id;

    expect((await request(app).post("/api/memories/bulk-delete").send({})).status).toBe(400);
    expect((await request(app).post("/api/memories/bulk-delete").send({ ids: "alles" })).status).toBe(400);
    const zuViele = await request(app).post("/api/memories/bulk-delete")
      .send({ ids: Array.from({ length: 5001 }, (_, i) => `x${i}`) });
    expect(zuViele.status).toBe(400);

    // Unbekannte Kennungen zaehlen als "nicht gefunden" — nichts wird geloescht.
    const fremd = await request(app).post("/api/memories/bulk-delete").send({ ids: ["gibtesnicht", "auchnicht"] });
    expect(fremd.body.deleted).toBe(0);
    expect(fremd.body.notFound).toBe(2);

    const aktiv = await request(app).get("/api/memories");
    expect(aktiv.body.count).toBe(1);
    expect(aktiv.body.memories[0].id).toBe(id);
  });

  it("Einstellungen ueberleben im Datenordner, nicht im Browserspeicher", async () => {
    // Der Grund: die Electron-Huelle laesst sich vom Betriebssystem einen FREIEN
    // Port geben und laedt das Fenster von http://127.0.0.1:<port>. Der Port ist
    // bei jedem Start ein anderer, und localStorage haengt am Ursprung. Jeder
    // Neustart bekam damit einen leeren Speicher.
    expect((await request(app).get("/api/settings")).body).toEqual({});

    // P4-13 (18.10.): der Volllauf 15:35:55 verlor hier das theme und konnte nicht
    // sagen, welcher Schenkel fehlte — die Quittung des PUT wurde weggeworfen.
    const setzt = await request(app).put("/api/settings").send({ theme: "dark", ki_gehirn_topK: "50" });
    expect(setzt.status).toBe(200);
    expect(setzt.body).toMatchObject({ ok: true, keys: 2 });
    expect(store.einstellungen().theme).toBe("dark");

    let stand = (await request(app).get("/api/settings")).body;
    expect(stand.theme).toBe("dark");
    expect(stand.ki_gehirn_topK).toBe("50");

    // Weitere Aenderungen ergaenzen, statt alles zu ersetzen.
    await request(app).put("/api/settings").send({ kepta_type_colors: '{"semantic":"#ff3366"}' });
    stand = (await request(app).get("/api/settings")).body;
    expect(stand.theme).toBe("dark");
    expect(stand.kepta_type_colors).toContain("ff3366");

    // null loescht einen einzelnen Eintrag.
    await request(app).put("/api/settings").send({ theme: null });
    stand = (await request(app).get("/api/settings")).body;
    expect(stand.theme).toBeUndefined();
    expect(stand.ki_gehirn_topK).toBe("50");
  });

  it("P4-13: ein kaputter Speicher antwortet nicht wie ein leerer", async () => {
    // Kontrolle: ein leerer Bestand ist ein Erfolg — 200 und ein leerer Leib.
    const leer = await request(app).get("/api/settings");
    expect(leer.status).toBe(200);
    expect(leer.body).toEqual({});

    // Ausfall: derselbe Weg, aber die Datenbankverbindung ist zu. Vor dem Flicken
    // antwortet die Route hier `200 {}` — von der Kontrolle nicht zu unterscheiden.
    expect((await request(app).put("/api/settings").send({ theme: "dark" })).status).toBe(200);
    store.close();
    const kaputt = await request(app).get("/api/settings");
    expect(kaputt.status).toBeGreaterThanOrEqual(500);
    expect(kaputt.body).not.toEqual({});
  });

  it("Einstellungen nehmen nur Zeichenketten und weisen Unsinn ab", async () => {
    expect((await request(app).put("/api/settings").send(["a", "b"])).status).toBe(400);
    // Nicht-Zeichenketten werden still uebergangen, statt Unerwartetes abzulegen.
    await request(app).put("/api/settings").send({ gut: "ja", schlecht: { tief: 1 }, zahl: 42 });
    const stand = (await request(app).get("/api/settings")).body;
    expect(stand.gut).toBe("ja");
    expect(stand.schlecht).toBeUndefined();
    expect(stand.zahl).toBeUndefined();
  });

  it("uebernimmt eine alte settings.json einmalig in die Datenbank und laesst keinen Klartext zurueck", async () => {
    // Bis 2.10 lag der KI-Zugangsschluessel als settings.json im Klartext neben der Datenbank.
    const datei = path.join(dir, "settings.json");
    fs.writeFileSync(datei, JSON.stringify({ theme: "dark", ai_key: "sk-alt-123", zahl: 5 }));
    store.setzeEinstellungen({ theme: "light" }); // was schon in der Datenbank steht, gewinnt
    const neu = createApp(store);
    // A3-09: der uebernommene Klartext darf von dieser Route nicht mehr zurueckkommen —
    // der Titel dieses Falls sagt "laesst keinen Klartext zurueck", und seit der Maske
    // (F13, Schritt 3) gilt das auch fuer die Antwort.
    expect((await request(neu).get("/api/settings")).body).toEqual({ theme: "light", ai_key: { gesetzt: true, ende: "-123" } });
    expect(store.einstellungen().ai_key).toBe("sk-alt-123"); // Speicher bleibt die Datenbank
    expect(fs.existsSync(datei)).toBe(false);
  });

  it("eine unlesbare settings.json bleibt unberuehrt liegen", async () => {
    const datei = path.join(dir, "settings.json");
    fs.writeFileSync(datei, "{kaputt");
    createApp(store);
    expect(fs.readFileSync(datei, "utf8")).toBe("{kaputt");
    fs.writeFileSync(datei, "[1,2]");
    createApp(store);
    expect(fs.readFileSync(datei, "utf8")).toBe("[1,2]");
  });

  it("GET /api/scan/policy erklaert vollstaendig, was gelesen wird und was nie", async () => {
    // Die geforderte klare Deklaration — nicht ein Satz im Dialog, sondern die
    // tatsaechlich geltenden Listen aus demselben Quelltext, der entscheidet.
    const res = await request(app).get("/api/scan/policy");
    expect(res.status).toBe(200);
    expect(res.body.niemals.ordner).toContain(".ssh");
    expect(res.body.niemals.ordner).toContain("keychains");
    expect(res.body.niemals.dateimuster.length).toBeGreaterThan(5);
    expect(res.body.uebersprungen.ordner).toContain("node_modules");
    expect(res.body.lesbar.endungen).toContain(".md");
    expect(res.body.grenzen.maxDateiBytes).toBeGreaterThan(0);
    expect(res.body.ihreEinstellung.wurzeln.length).toBeGreaterThan(0);
  });

  it("Scan-Einstellungen schraenken ein — und lassen sich nicht zum Oeffnen missbrauchen", async () => {
    // Das ist die Zusage, an der alles haengt: einstellbar ist, was WEITER
    // einschraenkt. Wer Schluesseldateien freischalten will, bekommt sie nicht.
    const boese = await request(app).put("/api/scan/config").send({
      endungen: [".pem", ".env", ".key"],
      maxDateiBytes: 999_999_999,
      roots: ["/etc"],
    });
    expect(boese.status).toBe(200);
    expect(boese.body.endungen).not.toContain(".pem");
    expect(boese.body.endungen).not.toContain(".env");
    expect(boese.body.maxDateiBytes).toBeLessThanOrEqual(2_000_000);
    expect(boese.body.roots.every((r: string) => !r.startsWith("/etc"))).toBe(true);

    // Eine echte Einschraenkung wird dagegen uebernommen.
    const gut = await request(app).put("/api/scan/config").send({
      endungen: [".md", ".txt"], maxDateiBytes: 500_000, zusaetzlichAusgelassen: ["Archiv"],
    });
    expect(gut.body.endungen).toEqual([".md", ".txt"]);
    expect(gut.body.maxDateiBytes).toBe(500_000);
    expect(gut.body.zusaetzlichAusgelassen).toEqual(["archiv"]);

    const gelesen = await request(app).get("/api/scan/config");
    expect(gelesen.body.endungen).toEqual([".md", ".txt"]);
  });

  it("POST /api/memories/reclassify sortiert erst nach ausdruecklicher Bestaetigung", async () => {
    // Vorher ordnete NIEMAND zu: der Scan setzte keinen Typ, alles fiel auf
    // "Fakt". An einer echten Wissensbasis waren das 3071 von 3148 Notizen.
    // Neu angelegte Notizen sind bereits richtig einsortiert — createMemory
    // ordnet zu, wenn der Aufrufer nichts sagt. Zum Nachsortieren braucht es
    // also Altbestand, der ausdruecklich falsch abgelegt wurde. Genau so sah
    // eine gewachsene Wissensbasis aus: alles "Fakt", weil niemand zuordnete.
    await request(app).post("/api/memories").send({
      title: "Drucker einrichten",
      content: "1. Kabel anschliessen\n2. Treiber laden\n3. Testseite drucken\n4. Fertig",
      type: "semantic",
    });
    await request(app).post("/api/memories").send({
      title: "Besprechung Kanzlei", content: "Fristen durchgegangen und Mandate verteilt.",
      type: "semantic",
    });

    const trocken = await request(app).post("/api/memories/reclassify").send({});
    expect(trocken.body.applied).toBe(false);
    expect(trocken.body.changed).toBeGreaterThan(0);
    expect(trocken.body.examples[0].grund).toBeTruthy();
    // Nichts geschrieben.
    expect((await request(app).get("/api/memories")).body.memories.every((m: { type: string }) => m.type === "semantic")).toBe(true);

    const echt = await request(app).post("/api/memories/reclassify").send({ apply: true });
    expect(echt.body.applied).toBe(true);
    const nachher = (await request(app).get("/api/memories")).body.memories as { title: string; type: string }[];
    expect(nachher.find((m) => m.title === "Drucker einrichten")!.type).toBe("procedural");
    expect(nachher.find((m) => m.title === "Besprechung Kanzlei")!.type).toBe("episodic");
  });

  it("POST /api/repair/imports liest PDFs neu, behaelt die Quellzeile und schreibt erst nach Bestaetigung", async () => {
    // Ein kleinstes gueltiges PDF mit einer Textzeile (Helvetica, ohne
    // eingebettete Schrift) — pdf.js liest es wie jede andere Datei.
    const minimalesPdf = (zeile: string): Buffer => {
      const text = `BT /F1 12 Tf 50 700 Td (${zeile}) Tj ET`;
      const objekte = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      ];
      let pdf = "%PDF-1.4\n";
      const stellen: number[] = [];
      objekte.forEach((o, i) => { stellen.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
      const xref = pdf.length;
      pdf += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n`
        + stellen.map((s) => `${String(s).padStart(10, "0")} 00000 n \n`).join("")
        + `trailer\n<< /Size ${objekte.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
      return Buffer.from(pdf, "latin1");
    };
    const datei = path.join(dir, "formular.pdf");
    fs.writeFileSync(datei, minimalesPdf("Gewerbe-Ummeldung nach Paragraph 14"));
    // So lagen Teile aus der alten Rohbyte-Extraktion in der Basis — zwei
    // Teile Muell, wo heute ein lesbarer Teil herauskommt:
    const eins = store.createMemory({ title: "formular — 1/2", content: `◆◆F6g◆◆ endstream\n\n— Source: ${datei}` });
    const zwei = store.createMemory({ title: "formular — 2/2", content: `/uni2219/space/hyphen\n\n— Source: ${datei}` });

    const trocken = await request(app).post("/api/repair/imports").send({});
    expect(trocken.body).toMatchObject({ applied: false, geprueft: 1, dateien: 1, aktualisiert: 1, entfernt: 1 });
    expect(store.getMemory(eins.id)!.content).toContain("◆◆");

    const echt = await request(app).post("/api/repair/imports").send({ apply: true });
    expect(echt.body).toMatchObject({ applied: true, dateien: 1, aktualisiert: 1, entfernt: 1 });
    const nachher = store.getMemory(eins.id)!;
    expect(nachher.content).toContain("Gewerbe-Ummeldung nach Paragraph 14");
    // Die Herkunft bleibt stehen — die erste Fassung (2.10.0) verlor sie.
    expect(nachher.content.endsWith(`— Source: ${datei}`)).toBe(true);
    expect(nachher.title).toBe("formular");
    // Der ueberzaehlige Teil liegt im Papierkorb — 2.10.1 loeschte endgueltig.
    const papierkorb = (await request(app).get("/api/memories?trash=1")).body.memories as { id: string }[];
    expect(papierkorb.map((m) => m.id)).toContain(zwei.id);

    // Ein zweiter Lauf findet nichts mehr und schreibt nichts neu.
    const nochmal = await request(app).post("/api/repair/imports").send({ apply: true });
    expect(nochmal.body).toMatchObject({ geprueft: 1, dateien: 0, aktualisiert: 0, entfernt: 0 });
  });

  it("POST /api/repair/imports liest kein HTML neu — generierte Seiten schreiben sich staendig um", async () => {
    // 2.10.1 las auch HTML neu. An einer echten Basis waren das vor allem
    // Coverage-Berichte, die sich bei jedem Testlauf neu schreiben: "neu lesen"
    // hiess dort, Teile durch eine ganz andere Datei zu ersetzen.
    const datei = path.join(dir, "bericht.html");
    fs.writeFileSync(datei, "<p>Heute steht hier etwas ganz anderes.</p>");
    const alt = store.createMemory({ title: "bericht", content: `Damals stand hier dies.\n\n— Source: ${datei}` });
    const antwort = await request(app).post("/api/repair/imports").send({ apply: true });
    expect(antwort.body).toMatchObject({ geprueft: 0, dateien: 0, aktualisiert: 0 });
    expect(store.getMemory(alt.id)!.content).toContain("Damals stand hier dies.");
  });

  it("POST /api/repair/imports befreit Web-Clips von Menuezeilen, die URL-Zeile bleibt", async () => {
    const clip = store.createMemory({
      title: "arXiv",
      content: "Source: https://arxiv.org/abs/1234\n\nSkip to main content\nMenu\nAttention is all you need.",
    });
    const trocken = await request(app).post("/api/repair/imports").send({});
    expect(trocken.body.clips).toBe(1);
    expect(store.getMemory(clip.id)!.content).toContain("Skip to main content");

    await request(app).post("/api/repair/imports").send({ apply: true });
    const nachher = store.getMemory(clip.id)!.content;
    expect(nachher.startsWith("Source: https://arxiv.org/abs/1234")).toBe(true);
    expect(nachher).not.toMatch(/Skip to main content|^Menu$/m);
    expect(nachher).toContain("Attention is all you need.");
  });

  it("ordnet beim Anlegen selbst zu, wenn der Aufrufer nichts sagt", async () => {
    // Die Luecke, die nach dem ersten Ausliefern auffiel: der Klassifizierer
    // hing nur am Rechner-Scan. Ein ueber MCP gespeichertes
    // "1. … 2. … 3. …" landete weiterhin als Fakt.
    const anleitung = await request(app).post("/api/memories").send({
      title: "Drucker einrichten",
      content: "1. Kabel anschliessen\n2. Treiber laden\n3. Testseite drucken\n4. Fertig",
    });
    expect(anleitung.body.memory.type).toBe("procedural");

    const termin = await request(app).post("/api/memories").send({
      title: "Besprechung Kanzlei", content: "Fristen durchgegangen und Mandate verteilt.",
    });
    expect(termin.body.memory.type).toBe("episodic");

    // Eine ausdrueckliche Angabe gewinnt immer.
    const gesetzt = await request(app).post("/api/memories").send({
      title: "Drucker einrichten 2",
      content: "1. Kabel anschliessen\n2. Treiber laden\n3. Testseite drucken",
      type: "semantic",
    });
    expect(gesetzt.body.memory.type).toBe("semantic");
  });

  it("nimmt Notizen vom Typ reference an", async () => {
    const res = await request(app).post("/api/memories").send({ title: "Beleg", content: "x", type: "reference" });
    expect(res.status).toBeLessThan(400);
    expect(res.body.memory.type).toBe("reference");
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
    expect(list.body.memories.some((m: { content: string }) => m.content.includes("Automatisch importierter"))).toBe(true);
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

describe("Die Einbett-Route redet mit demselben Ollama wie der Kern (#45)", () => {
  // Aufgesucht am 3.11. bei der Fenster-Messung von 3.2.126: die Zustands-Tafel fragt
  // POST /api/embed, und diese Route las ausschliesslich OLLAMA_HOST
  // (server/router/chat.ts, `mountChat`). Der Einbett-Laeufer des Kerns und die
  // Modelle-Liste lesen KEPTA_OLLAMA_URL (src/core/embeddings.ts, `ollamaBaseUrl`). Wer
  // den einen Dreht, sieht
  // darum eine Tafel, die einen andern Dienst meldet als der, den die Suche benutzt —
  // "Ollama answers on this computer", waehrend der Einbett-Lauf gegen eine andre Adresse
  // geht. Die Route muss denselben Loeser nehmen wie der Kern.
  const umgebung = async <T,>(werte: Record<string, string | undefined>, hin: () => Promise<T>): Promise<T> => {
    const vorher = new Map(Object.keys(werte).map((k) => [k, process.env[k]]));
    for (const [k, v] of Object.entries(werte)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      // erst await, dann zurueck: ein supertest-Objekt ist ein Thenable, kein Promise,
      // und hat darum kein .finally (gemessen 3.11. — die erste Fassung verlor so die
      // Rueckgabe der Umgebung).
      return await hin();
    } finally {
      for (const [k, v] of vorher) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };

  it("/api/embed nimmt KEPTA_OLLAMA_URL — der Kern-Knopf gilt auch fuer die Route", async () => {
    const orte: string[] = [];
    const orig = globalThis.fetch;
    globalThis.fetch = (async (u: unknown) => {
      orte.push(String(u));
      return { ok: true, json: async () => ({ embeddings: [[1, 2, 3]] }) };
    }) as unknown as typeof fetch;
    try {
      const res = await umgebung(
        { KEPTA_OLLAMA_URL: "http://127.0.0.1:9/kern-hafen", OLLAMA_HOST: undefined },
        () => request(app).post("/api/embed").send({ input: "hallo" }),
      );
      expect(res.status).toBe(200);
      expect(orte.length, "die Route hat ueberhaupt keinen Upstream angerufen").toBeGreaterThan(0);
      expect(orte[0], `die Route ging nach ${orte[0]} statt nach dem Kern-Hafen`)
        .toContain("/kern-hafen/api/embed");
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("OLLAMA_HOST bleibt der zweite Name desselben Dienstes", async () => {
    const orte: string[] = [];
    const orig = globalThis.fetch;
    globalThis.fetch = (async (u: unknown) => {
      orte.push(String(u));
      return { ok: true, json: async () => ({ embeddings: [[1]] }) };
    }) as unknown as typeof fetch;
    try {
      const res = await umgebung(
        { KEPTA_OLLAMA_URL: undefined, OLLAMA_HOST: "http://127.0.0.1:9/alt-hafen" },
        () => request(app).post("/api/embed").send({ input: "hallo" }),
      );
      expect(res.status).toBe(200);
      expect(orte[0]).toContain("/alt-hafen/api/embed");
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("KEPTA_OLLAMA_URL gewinnt gegen OLLAMA_HOST, wie im Kern", async () => {
    const orte: string[] = [];
    const orig = globalThis.fetch;
    globalThis.fetch = (async (u: unknown) => {
      orte.push(String(u));
      return { ok: true, json: async () => ({ embeddings: [[1]] }) };
    }) as unknown as typeof fetch;
    try {
      await umgebung(
        { KEPTA_OLLAMA_URL: "http://127.0.0.1:9/der-kern-holt", OLLAMA_HOST: "http://127.0.0.1:9/der-alias" },
        () => request(app).post("/api/embed").send({ input: "hallo" }),
      );
      expect(orte[0]).toContain("/der-kern-holt/api/embed");
    } finally {
      globalThis.fetch = orig;
    }
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

  it("POST /api/search nennt je Treffer die Spuren-Herkunft (Paket 2: die UI braucht die Bein-Ränge)", async () => {
    await request(app).post("/api/memories").send({ title: "Rust Backend", content: "Speichersicherheit beim Backup" });
    const res = await request(app).post("/api/search").send({ query: "Speichersicherheit", topK: 5 });
    expect(res.status).toBe(200);
    const erster = res.body.results[0];
    expect(erster).toHaveProperty("tracks");
    // Der BM25-Strang hat den Treffer gesehen — sein Rang ist eine Zahl ab 0.
    expect(typeof erster.tracks.bm25).toBe("number");
    expect(erster.tracks.bm25).toBeGreaterThanOrEqual(0);
    // Die anderen Beine sind immer da — null heißt „hat die Notiz nicht gesehen“.
    for (const bein of ["vektor", "graph", "similarity"] as const) {
      expect(erster.tracks).toHaveProperty(bein);
    }
  });

  it("POST /api/search nimmt die Spuren-Schalter entgegen (Paket 2: UI-Parität)", async () => {
    const angelegt = await request(app).post("/api/memories").send({ title: "Rust Backend", content: "Speichersicherheit beim Backup" });
    const id = ((angelegt.body.memory ?? angelegt.body) as { id: string }).id;
    // Der Graph-Strang wird über Entity-Verknüpfungen gefüllt — wie es der
    // Obsidian-Import tut. So ist der Test auch ohne Embedding-Modell deterministisch.
    store.linkEntities(id, ["Rust"]);
    // Alle Beine: BM25 sieht den Treffer.
    const alle = await request(app).post("/api/search").send({ query: "rust", topK: 5 });
    expect(alle.status).toBe(200);
    expect(alle.body.results[0].tracks.bm25).not.toBeNull();
    // BM25 aus — das Bein hat den Treffer nicht gesehen, der Graph-Strang schon.
    const ohneBm25 = await request(app).post("/api/search").send({ query: "rust", topK: 5, tracks: { bm25: false, vector: true, entity: true } });
    expect(ohneBm25.status).toBe(200);
    expect(ohneBm25.body.results.length).toBeGreaterThan(0);
    expect(ohneBm25.body.results[0].tracks.bm25).toBeNull();
    expect(ohneBm25.body.results[0].tracks.graph).not.toBeNull();
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
      .send({ protocol: "openai", baseUrl: UPSTREAM_OHNE_HORCHER, messages: [{ role: "user", content: "Hi" }] });
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
      .send({ protocol: "anthropic", baseUrl: UPSTREAM_OHNE_HORCHER, messages: [{ role: "user", content: "Hi" }] });
    expect(res.status).toBe(200);
    expect(res.text).toContain("Servus");
  });

  it("POST /api/chat/stream leitet Upstream-Fehler als SSE-error mit Grund weiter", async () => {
    globalThis.fetch = (async () =>
      ({ ok: false, status: 401, body: null, text: async () => JSON.stringify({ error: { message: "Kein Key" } }) }) as unknown as Response) as unknown as typeof fetch;
    const res = await request(app)
      .post("/api/chat/stream")
      .send({ protocol: "openai", baseUrl: UPSTREAM_OHNE_HORCHER, messages: [{ role: "user", content: "Hi" }] });
    expect(res.status).toBe(200);
    // P4-92 (24.10.): der Wortlaut des Anbieters bleibt im Protokoll; nach aussen geht ein Satz
    // in Produktsprache plus benannte Kennung. Bis hierher verlangte dieser Fall das Gegenteil -
    // "Kein Key" war der fremde Wortlaut, den die Zelle verbietet.
    expect(res.text).toContain('"grund":"anbieter-lehnt-ab"');
    expect(res.text).toMatch(/provider refused this request/i);
    expect(res.text).not.toContain("Kein Key");
  });

  it("POST /api/chat (non-streaming, OpenAI) liefert text", async () => {
    globalThis.fetch = (async () =>
      ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "Antwort" } }] }) }) as unknown as Response) as unknown as typeof fetch;
    const res = await request(app)
      .post("/api/chat")
      .send({ protocol: "openai", baseUrl: UPSTREAM_OHNE_HORCHER, messages: [{ role: "user", content: "Frage" }] });
    expect(res.status).toBe(200);
    expect(res.body.text).toBe("Antwort");
  });

  it("POST /api/chat (Anthropic) verbindet Textblöcke", async () => {
    globalThis.fetch = (async () =>
      ({ ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "A" }, { type: "text", text: "B" }] }) }) as unknown as Response) as unknown as typeof fetch;
    const res = await request(app)
      .post("/api/chat")
      .send({ protocol: "anthropic", baseUrl: UPSTREAM_OHNE_HORCHER, messages: [{ role: "user", content: "x" }] });
    expect(res.body.text).toContain("A");
    expect(res.body.text).toContain("B");
  });

  it("POST /api/chat gibt Upstream-Fehler als 500 zurück", async () => {
    globalThis.fetch = (async () =>
      ({ ok: false, status: 500, json: async () => ({ error: { message: "kaputt" } }) }) as unknown as Response) as unknown as typeof fetch;
    const res = await request(app)
      .post("/api/chat")
      .send({ protocol: "openai", baseUrl: UPSTREAM_OHNE_HORCHER, messages: [{ role: "user", content: "x" }] });
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
  let lookupSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // DNS mocken: Tests dürfen nicht vom Netz abhängen; der Clipper löst jeden
    // Public-Host via dns.promises.lookup auf (SSRF-Schutz).
    lookupSpy = vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as never);
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    lookupSpy.mockRestore();
  });

  it("POST /api/clip ohne URL → 400", async () => {
    const res = await request(app).post("/api/clip").send({});
    expect(res.status).toBe(400);
  });

  it("POST /api/clip mit unsicherer URL → 400", async () => {
    const res = await request(app).post("/api/clip").send({ url: "file:///etc/passwd" });
    expect(res.status).toBe(400);
  });

  it("POST /api/clip blockt Loopback in allen Literal-Schreibweisen (SSRF)", async () => {
    // Dezimal-IP, Hex-Form, Oktal und IPv4-mapped IPv6 — alle sind 127.0.0.1
    for (const url of ["http://2130706433/", "http://0x7f000001/", "http://0177.0.0.1/", "http://[::ffff:127.0.0.1]/", "http://127.0.0.1:3000/"]) {
      const res = await request(app).post("/api/clip").send({ url });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("SSRF");
    }
  });

  it("POST /api/clip blockt Hosts, deren DNS eine private IP liefert", async () => {
    lookupSpy.mockResolvedValue([{ address: "10.0.0.5", family: 4 }] as never);
    const res = await request(app).post("/api/clip").send({ url: "https://intranet.example.com/" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("SSRF");
  });

  it("POST /api/clip prüft jeden Redirect-Hop und blockt Ziele mit privatem Host", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return {
        ok: true,
        status: 302,
        headers: { get: () => "http://127.0.0.1/admin" },
        text: async () => "",
      } as unknown as Response;
    }) as unknown as typeof fetch;
    const res = await request(app).post("/api/clip").send({ url: "https://example.com/redirect" });
    expect(res.status).toBe(400);
    expect(calls).toBe(1); // zweiter Hop wird vor dem Fetch abgelehnt
  });

  it("POST /api/clip mit nicht auflösbarem Host → 400 statt 500", async () => {
    lookupSpy.mockRejectedValue(new Error("getaddrinfo ENOTFOUND kaputt.example") as never);
    const res = await request(app).post("/api/clip").send({ url: "https://kaputt.example/" });
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
      // F12: derselbe Vertrag wie im Kern — ein Volltausch braucht die
      // ausdrueckliche Bestaetigung, sonst antwortet die Route mit 400.
      confirm: "replace",
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
    const m = list.body.memories.find((r: { title: string }) => r.title === "Historisch");
    expect(m.updatedAt).toBe(then);
    expect(m.createdAt).toBe(then);
  });

  it("listet auch >1000 Knoten vollständig — auf dem vollen Leseweg, nicht still auf Seite 100", async () => {
    for (let i = 0; i < 1100; i++) store.createMemory({ title: `Bulk ${i}`, content: "kurz" });
    // Aufgabe #52: die Liste ist seitenweis. Die Wache gegen das stille Abschneiden
    // bleibt — sie sitzt jetzt auf `alle=1`, dem ausdruecklichen vollen Leseweg.
    const ganz = await request(app).get("/api/memories?alle=1");
    expect(ganz.status).toBe(200);
    expect(ganz.body.count).toBe(1100);
    expect(ganz.headers["x-kepta-total"]).toBe("1100");
    expect(ganz.headers["x-kepta-begrenzt"]).toBe("0");
    // Ohne Anfrage kommt die Default-Kappe, und sie nennt sich in Kopf und Zahl.
    const seite = await request(app).get("/api/memories");
    expect(seite.body.count).toBe(100);
    expect(seite.headers["x-kepta-total"]).toBe("1100");
    expect(seite.headers["x-kepta-begrenzt"]).toBe("1");
    expect(String(seite.headers["x-kepta-hinweis"])).toMatch(/100 of 1,100 notes/);
    const exp = await request(app).post("/api/export/markdown").send({});
    expect(exp.status).toBe(200);
    expect(exp.body.exported).toBe(1100);
  });
});

describe("Die Kopfzeilen der Liste bleiben ASCII (P106)", () => {
  /* Gemessen 6.11.2026 14:05:57 MEZ: ein Gedankenstrich (U+2014) in `x-kepta-hinweis` warf
     "TypeError: Invalid character in header content" und riss 14 Testdateien mit. Der Grund
     steht zwei Zeilen ueber dem Satz, den ich geaendert hatte: "Nur ASCII -- der Wert geht in
     einen Kopf." Die Strich-Latte des Census darf einen Kopf nicht in Nicht-ASCII treiben;
     was dort einen Absatz braucht, setzt einen Doppelpunkt. */

  const asciiNur = (wert: string) => [...wert].every((c) => {
    const n = c.codePointAt(0) ?? 0;
    return n >= 0x20 && n <= 0x7e;
  });

  it("der Hinweis-Kopf der kleinen Seite nennt den Grund und bleibt ASCII", async () => {
    store.createMemory({ title: "Eine", content: "kurz" });
    const klein = await request(app).get("/api/memories");
    const wert = String(klein.headers["x-kepta-hinweis"]);
    expect(wert).toMatch(/read from offset 0/);
    expect(asciiNur(wert), `Kopfwert mit Nicht-ASCII: ${wert}`).toBe(true);
  });

  it("auch der schwere Leseweg schreibt nur ASCII in den Kopf", async () => {
    store.createMemory({ title: "Zwei", content: "kurz" });
    const ganz = await request(app).get("/api/memories?alle=1");
    const wert = String(ganz.headers["x-kepta-hinweis"]);
    expect(asciiNur(wert), `Kopfwert mit Nicht-ASCII: ${wert}`).toBe(true);
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

describe("Chat-Validierung", () => {
  it("POST /api/chat/stream ohne messages → 400 statt TypeError", async () => {
    const res = await request(app).post("/api/chat/stream").send({ protocol: "openai" });
    expect(res.status).toBe(400);
  });

  it("POST /api/chat ohne messages → 400", async () => {
    const res = await request(app).post("/api/chat").send({ protocol: "openai" });
    expect(res.status).toBe(400);
  });
});

describe("Version (eine Quelle)", () => {
  it("/api/health liefert die package.json-Version", async () => {
    const res = await request(app).get("/api/health");
    expect(res.body.version).toBe(APP_VERSION);
  });
});

describe("POST /api/memories mit Write-Gate (F2)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.KEPTA_WRITE_GATE;
  });

  function stubOllama(decision: string, vec: number[] = [1, 0, 0]): void {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, init?: { body?: string }) => {
        const u = String(url);
        if (u.endsWith("/api/chat")) {
          return { ok: true, status: 200, json: async () => ({ message: { content: `{"decision":"${decision}","reason":"test"}` } }) } as unknown as Response;
        }
        if (u.endsWith("/api/embed")) {
          const body = JSON.parse(init?.body ?? "{}") as { input: string[] };
          return { ok: true, status: 200, json: async () => ({ embeddings: body.input.map(() => vec) }) } as unknown as Response;
        }
        return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
      })
    );
  }

  function seedKandidat(): void {
    const m = store.createMemory({ id: "vorh", title: "Server Passwort", content: "hunter2" });
    indexMemory(store, m.id);
    for (const c of store.chunksNeedingEmbedding(50)) {
      store.setEmbedding(c.memoryId, c.seq, new Float32Array([1, 0, 0]), DEFAULT_EMBED_MODEL);
    }
  }

  it("UPDATE: Gate lenkt auf den bestehenden Knoten um — kein Duplikat", async () => {
    process.env.KEPTA_WRITE_GATE = "on";
    seedKandidat();
    stubOllama("UPDATE");
    const res = await request(app).post("/api/memories").send({ title: "Server Passwort neu", content: "hunter3" });
    expect(res.status).toBe(200);
    expect(res.body.gateOutcome).toBe("updated");
    expect(res.body.memory.id).toBe("vorh");
    expect(res.body.memory.title).toBe("Server Passwort neu");
    expect(res.body.writeGate.decision).toBe("UPDATE");
    expect(store.countMemories().active).toBe(1);
  });

  it("NOOP: Speichern verweigert (200 mit gateOutcome=rejected, kein memory)", async () => {
    process.env.KEPTA_WRITE_GATE = "on";
    seedKandidat();
    stubOllama("NOOP");
    const res = await request(app).post("/api/memories").send({ title: "Server Passwort", content: "hunter2" });
    expect(res.status).toBe(200);
    expect(res.body.gateOutcome).toBe("rejected");
    expect(res.body.memory).toBeUndefined();
    expect(store.countMemories().active).toBe(1);
  });

  it("Gate aus: normales Verhalten ohne Gate-Felder", async () => {
    const res = await request(app).post("/api/memories").send({ title: "Ganz neu", content: "Fremdes Thema" });
    expect(res.status).toBe(200);
    expect(res.body.memory.title).toBe("Ganz neu");
    expect(res.body.gateOutcome).toBeUndefined();
    expect(res.body.writeGate).toBeUndefined();
  });
});

// Express 5 liefert req.body als undefined, wenn kein Body-Parser gegriffen hat
// (falscher Content-Type) — die Handler müssen 400 antworten, nicht als 500 crashen.
describe("Express-5-Härtung: Body ohne JSON-Content-Type", () => {
  it("POST /api/clip mit text/plain bleibt ein 400", async () => {
    const res = await request(app).post("/api/clip").set("Content-Type", "text/plain").send("kein json");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("URL");
  });

  it("POST /api/mcp/search mit text/plain bleibt ein 400", async () => {
    const res = await request(app).post("/api/mcp/search").set("Content-Type", "text/plain").send("kein json");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("query");
  });

  it("POST /api/search mit text/plain bleibt ein 200 mit leerem Ergebnis (Sanitize-Vertrag)", async () => {
    const res = await request(app).post("/api/search").set("Content-Type", "text/plain").send("kein json");
    expect(res.status).toBe(200);
    expect(res.body.hasMatch).toBe(false);
  });

  it("POST /api/models mit text/plain bleibt ein 4xx/5xx ohne Absturz — Meldung als JSON", async () => {
    // Ohne Körper nimmt die Route die Default-Basis und wählt das Netz. Ob
    // api.openai.com antwortet, ist keine Eigenschaft meines Programms — der Fall
    // ist 15.10. um 19:36 unter Last ROT geworden (200), um 19:33 GRÜN (500), auf
    // denselben Bytes. Also wird die Haube zugemacht: ein Netzfehler ist der
    // ehrliche Grenzfall, und er darf nicht in einen Absturz kippen.
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error("kein Netz im Test"); }) as unknown as typeof fetch;
    try {
      const res = await request(app).post("/api/models").set("Content-Type", "text/plain").send("kein json");
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status, "der Begrenzer darf diesen Fall nicht zufällig grün machen").not.toBe(429);
      expect(typeof res.body.error).toBe("string");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
