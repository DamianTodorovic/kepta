import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import request from "supertest";
import { KeptaStore } from "../src/core/store";
import { hoererDerDatei, type DateiHoerer } from "./helfer/hoerer";
import { anlage } from "./helfer/anlage";

// server.ts startet beim Import normalerweise automatisch — hier nur createApp.
process.env.KEPTA_NO_AUTOSTART = "1";

let createApp: (store: KeptaStore) => import("express").Express;
let store: KeptaStore;
let app: import("express").Express;
let prevHome: string | undefined;
let dir: string;
// Ein Horcher pro Datei, auf IHREM Port — nicht einer je Anfrage (`tests/helfer/hoerer.ts`).
let hoerer: DateiHoerer;
let URLE: string;

beforeAll(async () => {
  hoerer = await hoererDerDatei("tests/server-fehler.test.ts");
  URLE = hoerer.url;
});

afterAll(async () => {
  await hoerer.schliesse();
});

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-fehler-"));
  prevHome = process.env.HOME;
  process.env.HOME = dir;
  process.env.KEPTA_DATA_DIR = dir;
  vi.resetModules();
  ({ createApp } = await import("../server"));
  store = new KeptaStore(path.join(dir, "test.db"));
  app = createApp(store);
  hoerer.gebeApp(app);
});

afterEach(() => {
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
});

/** A3-04: der Stapel nannte "/Users/…/kepta-core/node_modules/raw-body/index.js:163:17". */
function zeigeNichtsVomStapel(text: string) {
  expect(text).not.toContain("/Users/");
  expect(text).not.toContain("node_modules");
  expect(text).not.toMatch(/\bat \S+ \(?/);
  expect(text).not.toContain("PayloadTooLargeError");
  expect(text).not.toContain("<!DOCTYPE html>");
}

describe("Q-19 — Fehlerantworten leaken Stapelverweise mit absoluten Pfaden", () => {
  it("413 am globalen Limit: JSON, Grund und Groesse, kein Stapel", async () => {
    const res = await request(URLE)
      .post("/api/memories")
      .set("Content-Type", "application/json")
      .send({ title: "X", content: "x".repeat(1_500_000) });
    expect(res.status).toBe(413);
    zeigeNichtsVomStapel(res.text);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body.error).toBeTruthy();
    expect(res.body.limitBytes).toBe(1024 * 1024);
    expect(res.body.receivedBytes).toBeGreaterThan(1_500_000);
    expect(String(res.body.error)).toContain("1 MB");
  });

  it("413 am Routen-Limit (2mb beim Import): ebenfalls JSON ohne Stapel", async () => {
    const res = await request(URLE)
      .post("/api/memories/import")
      .set("Content-Type", "application/json")
      .send({ memories: [{ title: "Zu groß", content: "x".repeat(2_500_000) }] });
    expect(res.status).toBe(413);
    zeigeNichtsVomStapel(res.text);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body.error).toBeTruthy();
    expect(res.body.limitBytes).toBe(2 * 1024 * 1024);
  });

  it("kaputtes JSON: 400 als JSON, ohne Stapel und ohne den Body zurueckzugeben", async () => {
    const geheim = "sk-GEHEIMER-WERT-das-darf-nicht-zurueck";
    const res = await request(URLE)
      .post("/api/memories")
      .set("Content-Type", "application/json")
      .send(`{"title":"${geheim}", "content": `);
    expect(res.status).toBe(400);
    zeigeNichtsVomStapel(res.text);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body.error).toBeTruthy();
    expect(res.text).not.toContain(geheim);
  });

  it("eine werfende Route: 500 als JSON, der Grund bleibt im Protokoll", async () => {
    store.db.exec("DROP TABLE memories");
    const vorher = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await request(URLE).get("/api/memories");
    const protokolliert = vorher.mock.calls.map((c) => c.join(" ")).join("\n");
    vorher.mockRestore();
    expect(res.status).toBe(500);
    zeigeNichtsVomStapel(res.text);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body.error).toBeTruthy();
    // Nach aussen nichts, dem Betreiber alles: der wahre Grund steht im Protokoll.
    expect(protokolliert).toMatch(/no such table/);
  });

  it("413 schreibt nichts in die Datenbank", async () => {
    anlage(await request(URLE).post("/api/memories").send({ title: "Vorher", content: "bestand" }), "Vorher-Notiz anlegen");
    await request(URLE)
      .post("/api/memories")
      .set("Content-Type", "application/json")
      .send({ title: "Zu groß", content: "x".repeat(1_500_000) });
    const liste = await request(URLE).get("/api/memories");
    expect(liste.body).toHaveLength(1);
    expect(liste.body[0].title).toBe("Vorher");
  });
});
