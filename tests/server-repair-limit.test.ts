import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import request from "supertest";
import { KeptaStore } from "../src/core/store";

// server.ts nur importieren, nachdem AUTOSTART gesetzt ist.
process.env.KEPTA_NO_AUTOSTART = "1";

let createApp: (store: KeptaStore) => import("express").Express;
let store: KeptaStore;
let app: import("express").Express;
let prevHome: string | undefined;
let dir: string;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-repair-"));
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
});

describe("A3-08 — das deklarierte 16-kb-Limit der Reparaturroute war wirkungslos", () => {
  it("lehnt 20 KB ab, statt sie mit 200 durchzuwinken", async () => {
    // A3 mass: Body 20031 bytes -> HTTP 200, 900031 -> HTTP 200. Der globale
    // Parser (1mb) hatte den Body schon verbraucht, der Routen-Parser uebersprungen.
    const res = await request(app)
      .post("/api/repair/imports")
      .set("Content-Type", "application/json")
      .send({ apply: false, fuell: "B".repeat(20_000) });
    expect(res.status).toBe(413);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body.limitBytes).toBe(16 * 1024);
  });

  it("16 KB plus ein Byte gehen nicht durch, 15 KB schon", async () => {
    const knapp = { apply: false, fuell: "B".repeat(15_000) };
    const ok = await request(app).post("/api/repair/imports").set("Content-Type", "application/json").send(knapp);
    expect(ok.status).toBe(200);
    const grenze = { apply: false, fuell: "B".repeat(17_000) };
    const ab = await request(app).post("/api/repair/imports").set("Content-Type", "application/json").send(grenze);
    expect(ab.status).toBe(413);
  });

  it("die Reparatur selbst (ohne payload) arbeitet weiter wie bisher", async () => {
    await request(app).post("/api/memories").send({ title: "Reparaturkandidat", content: "Ganz neuer Text." });
    const res = await request(app).post("/api/repair/imports").send({ apply: false });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.applied).toBe(false);
  });
});
