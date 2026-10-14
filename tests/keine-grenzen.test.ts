// @vitest-environment node
//
// Warum diese Datei existiert: Damian hat entschieden, dass die herunterladbare
// K3PTA keine Schlüssel und keine Grenzen mehr kennt — „bei K3PTA gibt es kein
// Licence Key, gar nix … diese Version soll man unbegrenzt nutzen können"
// (9.10.2026). Die Fälle hier sind die neue Wahrheit, und sie sind absichtlich
// SO geschrieben, dass sie vor dem Umbau rot sind: Jeder davon traf früher auf
// eine Tagesgrenze (429 mit Upgrade-Weg), einen Zähler in der Datenbank oder
// eine Lizenzroute, die die Oberfläche befragt.
//
// Was ausdrücklich NICHT verschwindet, ist Fall 5: der Wiederherstellungsschlüssel
// und seine drei Türsteher ( eigener Host, eigene Herkunft, eigener Kopf ) sind
// Härtung, kein Preisschild. Fällt dieser Fall, wurde beim Ausmisten zu viel
// weggeworfen.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import request from "supertest";
import { KeptaStore } from "../src/core/store";
import { createApp } from "../server/app";

process.env.KEPTA_NO_AUTOSTART = "1";
process.env.KEPTA_ENCRYPTION = "off";

let datei: string;
let store: KeptaStore;
let app: ReturnType<typeof createApp>;

// Kapsel. createApp löst seinen Datenordner so auf (server/app.ts:120):
// KEPTA_DATA_DIR, sonst ~/.kepta. Ohne diese zwei Zeilen schrieb genau dieser
// Lauf am 13.10. um 14:29:48 {"beruf":"Anwältin"} in Damians echtes
// ~/.kepta/profile.json — und ersetzte die Datei, statt sie zu füllen.
// Hält tests/testkapsel.test.ts.
let kappe: string;
let vorherHeim: string | undefined;
let vorherDaten: string | undefined;

beforeEach(() => {
  kappe = fs.mkdtempSync(path.join(tmpdir(), "kepta-unbegrenzt-kapsel-"));
  vorherHeim = process.env.HOME;
  vorherDaten = process.env.KEPTA_DATA_DIR;
  process.env.HOME = kappe;
  process.env.KEPTA_DATA_DIR = kappe;
  datei = path.join(tmpdir(), `kepta-unbegrenzt-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  store = new KeptaStore(datei);
  app = createApp(store);
});

afterEach(() => {
  store.close();
  if (vorherHeim === undefined) delete process.env.HOME;
  else process.env.HOME = vorherHeim;
  if (vorherDaten === undefined) delete process.env.KEPTA_DATA_DIR;
  else process.env.KEPTA_DATA_DIR = vorherDaten;
  fs.rmSync(kappe, { recursive: true, force: true });
  for (const ende of [datei, `${datei}-wal`, `${datei}-shm`]) {
    if (fs.existsSync(ende)) fs.rmSync(ende);
  }
});

/** Ein Provider, der nie das Netz sieht — die Zahl der Durchlässe ist das Maß. */
function providerAttrappe() {
  const abruf = vi.fn(async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 })
  );
  vi.stubGlobal("fetch", abruf);
  return abruf;
}

describe("die kostenlose App ist unbegrenzt", () => {
  it("zwölf Nachrichten nacheinander gehen alle durch", async () => {
    const abruf = providerAttrappe();
    try {
      for (let i = 0; i < 12; i++) {
        const res = await request(app).post("/api/chat").send({ messages: [{ role: "user", content: "hi" }] });
        expect(res.status, `Nachricht ${i + 1}: ${res.status} · ${res.text.slice(0, 160)}`).toBe(200);
      }
      expect(abruf).toHaveBeenCalledTimes(12);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("einundzwanzig Profil-Speicherungen kennen kein Tageslimit", async () => {
    for (let i = 0; i < 21; i++) {
      const res = await request(app).post("/api/profile").send({ beruf: "Anwältin" });
      expect(res.status, `Speicherung ${i + 1}: ${res.status} · ${res.text.slice(0, 160)}`).toBe(200);
    }
  });

  it("kein Antwortkopf erzählt mehr von einem Plan oder einem Rest", async () => {
    const res = await request(app).get("/api/memories");
    expect(res.status).toBe(200);
    expect(res.headers, `Köpfe: ${JSON.stringify(res.headers).slice(0, 300)}`).not.toHaveProperty("x-kepta-plan");
    const profil = await request(app).post("/api/profile").send({ beruf: "Notar" });
    expect(profil.headers, `Köpfe: ${JSON.stringify(profil.headers).slice(0, 300)}`).not.toHaveProperty("x-kepta-remaining");
  });
});

describe("es gibt keine Schlüsselpforte mehr", () => {
  it("die Lizenz-Route antwortet nicht mehr — weder lesend noch schreibend", async () => {
    expect((await request(app).get("/api/license")).status).toBe(404);
    expect((await request(app).post("/api/license").send({ name: "Sarah Mandel", key: "TEIL-TEIL-TEIL-TEIL" })).status).toBe(404);
  });

  it("es wird kein Zähler mehr in die Einstellungen geschrieben", async () => {
    for (let i = 0; i < 3; i++) await request(app).post("/api/profile").send({ beruf: "Anwältin" });
    const schlussel = Object.keys(store.einstellungen());
    expect(
      schlussel.filter((k) => /plan_zustand|probetag|license_key|license_name/i.test(k)),
      `Einstellungen tragen Polzerspuren: ${schlussel.join(", ")}`
    ).toEqual([]);
  });

  it("nichts in der Oberfläche fragt die Lizenzroute noch ab", () => {
    const quelle = "src";
    const dateien: string[] = [];
    (function geh(ordner: string) {
      for (const eintrag of fs.readdirSync(ordner, { withFileTypes: true })) {
        const pfad = path.join(ordner, eintrag.name);
        if (eintrag.isDirectory()) geh(pfad);
        else if (/\.(ts|tsx)$/.test(eintrag.name)) dateien.push(pfad);
      }
    })(quelle);
    const tippen = dateien.filter((p) => /\/api\/license|ProUpgrade/i.test(fs.readFileSync(p, "utf-8")));
    expect(tippen, `Lizenz-Oberfläche lebt noch in: ${tippen.join(", ")}`).toEqual([]);
  });
});

describe("die Härtung bleibt stehen", () => {
  it("der Wiederherstellungsschlüssel verlangt weiter den Fenster-Kopf", async () => {
    const res = await request(app).post("/api/recovery-key");
    expect(res.status, `Text: ${res.text.slice(0, 160)}`).toBe(403);
    expect(res.body.error).toMatch(/K3PTA window/);
    const mit = await request(app).post("/api/recovery-key").set("X-KEPTA-Recovery", "1");
    expect(mit.status, `Text: ${mit.text.slice(0, 160)}`).toBe(404);
  });

  it("die Schreibbremse von 60 pro Minute ist noch da", async () => {
    const res = await request(app).post("/api/clip").send({ url: "https://example.org" });
    expect(["200", "400", "422", "502"]).toContain(String(res.status));
    const koepfe = await request(app).get("/api/memories");
    expect(koepfe.headers["ratelimit-limit"] ?? koepfe.headers["x-ratelimit-limit"], "der Schutzlimiter nennt seine Zahl")
      .toBeTruthy();
  });
});
