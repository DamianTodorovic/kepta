// @vitest-environment node
// Aufgabe #92 (24.10.), Tuer-Seite: die Stream-Route schickt bei unerreichbarem Hafen einen
// Satz in Produktsprache plus benannte Kennung - nie den Ausnahmenamen.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { KeptaStore } from "../src/core/store";

process.env.KEPTA_NO_AUTOSTART = "1";
process.env.KEPTA_ENCRYPTION = "off";

let createApp: typeof import("../server").createApp;
let store: KeptaStore;
let app: import("express").Express;
let vorherHeim: string | undefined;
let dir: string;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-stream-"));
  vorherHeim = process.env.HOME;
  process.env.HOME = dir;
  process.env.KEPTA_DATA_DIR = dir;
  vi.resetModules();
  ({ createApp } = await import("../server"));
  store = new KeptaStore(path.join(dir, "test.db"));
  app = createApp(store);
});

afterEach(() => {
  store?.close();
  if (vorherHeim === undefined) delete process.env.HOME;
  else process.env.HOME = vorherHeim;
});

describe("P4-92: ein Grund an der Stream-Route", () => {
  it("tauber Hafen: SSE-Paket mit Kennung, kein Ausnahmename", async () => {
    const r = await request(app).post("/api/chat/stream").send({
      providerId: "openai", protocol: "openai", baseUrl: "http://127.0.0.1:9/v1", apiKey: "", model: "gpt-4o-mini",
      messages: [{ role: "user", content: "hallo" }],
    });
    expect(r.status).toBe(200);
    expect(r.text).toContain('"grund":"anbieter-nicht-erreichbar"');
    expect(r.text).toMatch(/model service did not answer/i);
    expect(r.text).not.toContain("fetch failed");
    expect(r.text).not.toContain("ECONNREFUSED");
  });
});
