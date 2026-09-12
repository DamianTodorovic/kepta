// @vitest-environment node
//
// Die Oberfläche von KEPTA Core: der lokale Server — Routen, Eingaben,
// Sicherheit gegen fremde Webseiten, Portwahl und Browserstart.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../../src/core/store";
import { APP_VERSION } from "../../src/core/version";
import {
  starteOberflaeche,
  leseUiArgumente,
  oeffneImBrowser,
  pruefeNotiz,
  MAX_KOERPER,
  STANDARD_PORT,
  type Oberflaeche,
} from "../../src/ui/server";

let store: KeptaStore;
let ui: Oberflaeche;

beforeEach(async () => {
  store = new KeptaStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kepta-ui-")), "t.db"));
  ui = await starteOberflaeche(store, { port: 0 });
});
afterEach(async () => {
  await ui.close();
  store.close();
});

interface Antwort { status: number; headers: http.IncomingHttpHeaders; text: string; json: any }

function anfrage(methode: string, pfad: string, opt: { body?: unknown; roh?: string; headers?: Record<string, string>; ohneToken?: boolean } = {}): Promise<Antwort> {
  return new Promise((ok, fail) => {
    const body = opt.roh ?? (opt.body !== undefined ? JSON.stringify(opt.body) : undefined);
    const headers: Record<string, string> = {
      host: `127.0.0.1:${ui.port}`,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(methode !== "GET" && !opt.ohneToken ? { "x-kepta-token": ui.token } : {}),
      ...opt.headers,
    };
    const r = http.request({ host: "127.0.0.1", port: ui.port, method: methode, path: pfad, headers }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (text += c));
      res.on("end", () => {
        let json: unknown;
        try { json = JSON.parse(text); } catch { /* keine JSON-Antwort */ }
        ok({ status: res.statusCode!, headers: res.headers, text, json });
      });
    });
    r.on("error", fail);
    if (body !== undefined) r.write(body);
    r.end();
  });
}

const neu = (daten: Record<string, unknown>) => anfrage("POST", "/api/notes", { body: daten });

describe("die Seite", () => {
  it("liefert HTML mit dem Sitzungs-Token, der Version und einer strengen CSP", async () => {
    const r = await anfrage("GET", "/");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toMatch(/text\/html/);
    expect(r.text).toContain(`content="${ui.token}"`);
    expect(r.text).toContain(`Core ${APP_VERSION}`);
    expect(r.headers["content-security-policy"]).toMatch(/script-src 'self'/);
    expect(r.headers["x-frame-options"]).toBe("DENY");
  });

  it("liefert Stil, Skript und Symbol mit dem richtigen Typ", async () => {
    expect((await anfrage("GET", "/app.css")).headers["content-type"]).toMatch(/text\/css/);
    expect((await anfrage("GET", "/app.js")).headers["content-type"]).toMatch(/javascript/);
    expect((await anfrage("GET", "/favicon.svg")).headers["content-type"]).toBe("image/svg+xml");
    expect((await anfrage("GET", "/gibt-es-nicht")).status).toBe(404);
    expect((await anfrage("POST", "/")).status).toBe(404);
  });
});

describe("Schutz gegen fremde Webseiten", () => {
  it("lehnt einen fremden Host ab — auch beim Lesen (DNS-Rebinding)", async () => {
    const r = await anfrage("GET", "/api/status", { headers: { host: "boese.example:80" } });
    expect(r.status).toBe(403);
  });

  it("schreibt nichts ohne Sitzungs-Token oder mit falschem", async () => {
    expect((await anfrage("POST", "/api/notes", { body: { title: "x", content: "y" }, ohneToken: true })).status).toBe(403);
    expect((await anfrage("POST", "/api/notes", { body: { title: "x", content: "y" }, headers: { "x-kepta-token": "falsch" } })).status).toBe(403);
    expect(store.countMemories().active).toBe(0);
  });

  it("lehnt eine fremde Herkunft ab, auch mit Token", async () => {
    const r = await anfrage("POST", "/api/notes", { body: { title: "x", content: "y" }, headers: { origin: "https://boese.example" } });
    expect(r.status).toBe(403);
    const eigen = await anfrage("POST", "/api/notes", { body: { title: "x", content: "y" }, headers: { origin: `http://localhost:${ui.port}` } });
    expect(eigen.status).toBe(201);
  });
});

describe("Notizen", () => {
  it("der Status einer leeren Wissensbasis", async () => {
    const r = await anfrage("GET", "/api/status");
    expect(r.json).toMatchObject({ version: APP_VERSION, notes: { active: 0, trashed: 0 }, types: {}, tags: [], encryption: { aktiv: false } });
  });

  it("anlegen verlinkt [[Links]] wie über MCP und zählt Arten und Tags", async () => {
    const r = await neu({ title: "Project Atlas", content: "Relaunch for [[Lumen & Co.]].", tags: ["atlas", "client"], type: "semantic" });
    expect(r.status).toBe(201);
    expect(r.json.note).toMatchObject({ title: "Project Atlas", type: "semantic", tags: ["atlas", "client"] });
    expect(store.entityNamesForMemory(r.json.note.id).map((n) => n.toLowerCase())).toContain("lumen & co.");
    await neu({ title: "Kickoff", content: "Weekly demos.", tags: ["atlas"], type: "episodic" });
    const s = (await anfrage("GET", "/api/status")).json;
    expect(s.types).toEqual({ semantic: 1, episodic: 1 });
    expect(s.tags[0]).toEqual({ tag: "atlas", count: 2 });
  });

  it("listet nach Ansicht, Tag und Seiten", async () => {
    for (let i = 0; i < 5; i++) await neu({ title: `Note ${i}`, content: "x", type: i % 2 ? "procedural" : "semantic", tags: i < 2 ? ["eins"] : [] });
    const alle = (await anfrage("GET", "/api/notes?view=all&limit=3")).json;
    expect(alle.notes).toHaveLength(3);
    expect(alle.more).toBe(true);
    const rest = (await anfrage("GET", "/api/notes?view=all&limit=3&offset=3")).json;
    expect(rest.notes).toHaveLength(2);
    expect(rest.more).toBe(false);
    expect((await anfrage("GET", "/api/notes?view=procedural")).json.notes).toHaveLength(2);
    expect((await anfrage("GET", "/api/notes?tag=eins")).json.notes).toHaveLength(2);
    expect((await anfrage("GET", "/api/notes?view=unsinn")).status).toBe(400);
  });

  it("sucht nach Relevanz — und verlangt einen Suchbegriff", async () => {
    await neu({ title: "Backup schedule", content: "Nightly at 02:00, kept for 30 days." });
    await neu({ title: "Glossary", content: "Freeze means no feature merges." });
    const r = (await anfrage("GET", "/api/search?q=backup")).json;
    expect(r.total).toBeGreaterThan(0);
    expect(r.hits[0].note.title).toBe("Backup schedule");
    expect(typeof r.hits[0].score).toBe("number");
    expect((await anfrage("GET", "/api/search?q=%20")).status).toBe(400);
  });

  it("zeigt, bearbeitet und leert eine Gültigkeit wieder", async () => {
    const { note } = (await neu({ title: "Alt", content: "Inhalt", validTo: 2_000_000_000_000 })).json;
    expect((await anfrage("GET", `/api/notes/${note.id}`)).json.note.validTo).toBe(2_000_000_000_000);
    const r = await anfrage("PUT", `/api/notes/${note.id}`, { body: { title: "Neu", tags: ["neu"], type: "procedural" } });
    expect(r.json.note).toMatchObject({ title: "Neu", content: "Inhalt", tags: ["neu"], type: "procedural", validTo: 2_000_000_000_000 });
    const leer = await anfrage("PUT", `/api/notes/${note.id}`, { body: { validTo: null } });
    expect(leer.json.note.validTo).toBeNull();
    expect((await anfrage("GET", "/api/notes/gibt-es-nicht")).status).toBe(404);
  });

  it("Papierkorb und Wiederherstellen — Bearbeiten erst nach dem Zurückholen", async () => {
    const { note } = (await neu({ title: "Weg damit", content: "x" })).json;
    expect((await anfrage("DELETE", `/api/notes/${note.id}`)).json).toEqual({ ok: true });
    expect((await anfrage("GET", "/api/notes?view=trash")).json.notes.map((n: { id: string }) => n.id)).toEqual([note.id]);
    expect((await anfrage("GET", "/api/status")).json.notes).toEqual({ active: 0, trashed: 1 });
    expect((await anfrage("PUT", `/api/notes/${note.id}`, { body: { title: "Neu" } })).status).toBe(409);
    expect((await anfrage("GET", `/api/notes/${note.id}/restore`)).status).toBe(404);
    const zurueck = await anfrage("POST", `/api/notes/${note.id}/restore`, { body: {} });
    expect(zurueck.json.note.deletedAt).toBeNull();
    expect((await anfrage("DELETE", "/api/notes/gibt-es-nicht")).status).toBe(404);
    expect((await anfrage("PATCH", `/api/notes/${note.id}`, { body: {} })).status).toBe(404);
    expect((await anfrage("GET", "/api/gibt-es-nicht")).status).toBe(404);
  });
});

describe("Eingaben", () => {
  it("weist Unvollständiges, Unbekanntes und Kaputtes verständlich ab", async () => {
    expect((await neu({ title: "Nur Titel" })).json.error).toBe("A note needs some content.");
    expect((await neu({ title: "x", content: "y", type: "gedicht" })).status).toBe(400);
    expect((await neu({ title: "x".repeat(301), content: "y" })).status).toBe(400);
    expect((await neu({ title: "x", content: "y", tags: "keine liste" })).status).toBe(400);
    expect((await neu({ title: "x", content: "y", validFrom: "gestern" })).status).toBe(400);
    expect((await neu({ title: "x", content: "y", validFrom: 20, validTo: 10 })).status).toBe(400);
    expect((await anfrage("POST", "/api/notes", { roh: "{kaputt" })).json.error).toBe("The request is not valid JSON.");
    expect((await anfrage("POST", "/api/notes", { roh: "[1,2]" })).status).toBe(400);
    expect((await anfrage("POST", "/api/notes", { roh: "x".repeat(MAX_KOERPER + 10) })).status).toBe(413);
  });

  it("pruefeNotiz lässt beim Bearbeiten fehlende Felder zu", () => {
    expect(pruefeNotiz({ tags: ["a"] }, true)).toEqual({ tags: ["a"] });
    expect(() => pruefeNotiz({}, false)).toThrow("A note needs a title.");
  });
});

describe("Start", () => {
  it("nimmt einen freien Port, wenn der Wunschport belegt ist", async () => {
    const belegt = http.createServer();
    await new Promise<void>((ok) => belegt.listen(0, "127.0.0.1", ok));
    const port = (belegt.address() as { port: number }).port;
    const zweite = await starteOberflaeche(store, { port });
    expect(zweite.port).not.toBe(port);
    expect(zweite.url).toBe(`http://127.0.0.1:${zweite.port}/`);
    await zweite.close();
    await new Promise<void>((ok) => belegt.close(() => ok()));
  });

  it("liest --port und --no-open", () => {
    expect(leseUiArgumente([])).toEqual({ port: STANDARD_PORT, oeffnen: true });
    expect(leseUiArgumente(["--port", "5000", "--no-open"])).toEqual({ port: 5000, oeffnen: false });
    expect(leseUiArgumente(["--port", "kein-port"]).port).toBe(STANDARD_PORT);
  });

  it("öffnet den Browser je System — und stolpert nicht, wenn es keinen gibt", () => {
    const aufrufe: string[][] = [];
    const starte = (b: string, a: string[]) => { aufrufe.push([b, ...a]); return { on: () => undefined, unref: () => undefined }; };
    expect(oeffneImBrowser("http://127.0.0.1:1/", "darwin", starte)).toEqual(["open", "http://127.0.0.1:1/"]);
    expect(oeffneImBrowser("http://127.0.0.1:1/", "win32", starte)[0]).toBe("cmd");
    expect(oeffneImBrowser("http://127.0.0.1:1/", "linux", starte)[0]).toBe("xdg-open");
    expect(aufrufe).toHaveLength(3);
    expect(() => oeffneImBrowser("http://127.0.0.1:1/", "linux", () => { throw new Error("kein Browser"); })).not.toThrow();
  });
});
