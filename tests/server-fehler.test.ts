// F12 — Q-19 in der Desktop-App. Die App hatte schon eine Fehlermittelware
// (server/app.ts), aber sie gab err.message ungeprueft nach aussen: bei einer 500
// stand damit der interne Grund beim Client, und die Schichten, die bootstrap.ts
// NACH createApp montiert (static und der SPA-Fallback), liegen ueberhaupt nicht
// unter ihr. Im Kern hat F3 dafuer sichererFehler gebaut — hier dieselbe Anlage,
// damit beide Baeume gleich antworten.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import request from "supertest";
import { KeptaStore } from "../src/core/store";

// ../server erst nach dieser Zeile importieren, sonst startet der echte Server.
process.env.KEPTA_NO_AUTOSTART = "1";
process.env.KEPTA_ENCRYPTION = "off";

let createApp: typeof import("../server").createApp;
let sichererFehler: typeof import("../server/app").sichererFehler;
let store: KeptaStore;
let app: import("express").Express;
let prevHome: string | undefined;
let dir: string;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-fehler-"));
  prevHome = process.env.HOME;
  process.env.HOME = dir;
  process.env.KEPTA_DATA_DIR = dir;
  vi.resetModules();
  ({ createApp } = await import("../server"));
  ({ sichererFehler } = await import("../server/app"));
  store = new KeptaStore(path.join(dir, "test.db"));
  app = createApp(store);
});

afterEach(() => {
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
});

/** A3-04 im Kern: der Stapel nannte ".../kepta-core/node_modules/raw-body/index.js:163:17". */
function zeigeNichtsVomStapel(text: string) {
  expect(text).not.toContain("/Users/");
  expect(text).not.toContain("node_modules");
  expect(text).not.toMatch(/\bat \S+ \(?/);
  expect(text).not.toContain("PayloadTooLargeError");
  expect(text).not.toContain("<!DOCTYPE html>");
}

describe("Q-19 — Fehlerantworten leaken Stapelverweise, Pfade und interne Gruende", () => {
  it("413 am globalen Limit: JSON, Grund und Groesse, kein Stapel", async () => {
    const res = await request(app)
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
    const res = await request(app)
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
    const res = await request(app)
      .post("/api/memories")
      .set("Content-Type", "application/json")
      .send(`{"title":"${geheim}", "content": `);
    expect(res.status).toBe(400);
    zeigeNichtsVomStapel(res.text);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body.error).toBeTruthy();
    expect(res.text).not.toContain(geheim);
  });

  it("eine werfende Route: 500 als JSON, der wahre Grund bleibt beim Betreiber", async () => {
    store.db.exec("DROP TABLE memories");
    const vorher = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await request(app).get("/api/memories");
    const protokolliert = vorher.mock.calls.map((c) => c.join(" ")).join("\n");
    vorher.mockRestore();
    expect(res.status).toBe(500);
    zeigeNichtsVomStapel(res.text);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body.error).toBeTruthy();
    // Nach aussen ein Satz, dem Betreiber alles: der Grund steht im Protokoll.
    expect(protokolliert).toMatch(/no such table/);
    expect(String(res.body.error)).not.toMatch(/no such table|SqliteError/);
  });

  it("413 schreibt nichts in die Datenbank", async () => {
    await request(app).post("/api/memories").send({ title: "Vorher", content: "bestand" });
    await request(app)
      .post("/api/memories")
      .set("Content-Type", "application/json")
      .send({ title: "Zu groß", content: "x".repeat(1_500_000) });
    const liste = await request(app).get("/api/memories");
    expect(liste.body).toHaveLength(1);
    expect(liste.body[0].title).toBe("Vorher");
  });

  it("die Mittelware faengt auch eine Schicht unterhalb von createApp (static/SPA in bootstrap.ts)", async () => {
    // bootstrap.ts montiert express.static und den SPA-Fallback NACH createApp —
    // Express laeuft die Schicht ab der Fehlerstelle abwaerts, also braucht die
    // Mittelware dort einen zweiten Anker. Genau den baut bootstrap.ts jetzt.
    const app2 = createApp(store);
    app2.use("/spa", (_req, _res, next) => {
      next(new Error("ENOENT: no such file or directory, open '/Users/damiantodorovic/.kepta/dist/index.html'"));
    });
    app2.use(sichererFehler);
    const res = await request(app2).get("/spa/index.html");
    expect(res.status).toBe(500);
    zeigeNichtsVomStapel(res.text);
    expect(res.text).not.toContain("index.html");
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });
});
