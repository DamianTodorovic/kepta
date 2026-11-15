// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import request from "supertest";
import { KeptaStore } from "../src/core/store";

// Die Leitung hat die Flächen umgestellt bekommen: sie lesen `x-kepta-total`
// statt ihrer Seitenlänge. Dieser Fall hält die andere Hälfte des Vertrags —
// **er wird rot, wenn die Tür `total` nicht mehr mitschickt**, und zwar laut,
// bevor eine Fläche etwas behauptet. Die Tür selbst (`server/router/memories.ts`)
// gehört F12; hier steht nur die Wache.
process.env.KEPTA_NO_AUTOSTART = "1";
process.env.KEPTA_ENCRYPTION = "off";

let createApp: typeof import("../server").createApp;
let store: KeptaStore;
let app: import("express").Express;
let dir: string;
let prevHome: string | undefined;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-total-"));
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
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function notiz(n: number) {
  store.createMemory({
    title: `Notiz ${n}`,
    content: `Inhalt ${n}`,
    tags: [],
    type: "semantic",
    createdAt: Date.parse("2024-01-01") + n * 1000,
    updatedAt: Date.parse("2024-01-01") + n * 1000,
  } as never);
}

describe("Die Liste nennt den Bestand, nicht nur ihre Seite", () => {
  it("nennt total im Leib und im Kopf über der Seite", async () => {
    for (let i = 0; i < 7; i++) notiz(i);
    const res = await request(app).get("/api/memories?limit=3");
    const leib = JSON.parse(res.text);
    // F12 hat die Antwortform umgestellt: der Leib führt den Vertrag selbst
    // (Zahl zuerst, dann die Knoten), weil ein nackter Array die Gesamtzahl nur
    // im Kopf gehabt hätte — und GFs Fläche zeigte „100 entries" bei 14.702.
    expect(Array.isArray(leib.memories), "memories ist ein Array").toBe(true);
    expect(leib.memories).toHaveLength(3);
    expect(leib.total, "der Leib nennt keinen Bestand").toBe(7);
    expect(leib.count).toBe(3);
    expect(leib.limit).toBe(3);
    expect(leib.offset).toBe(0);
    expect(leib.begrenzt).toBe(true);
    expect(res.headers["x-kepta-total"], "die Tür nennt keinen Bestand im Kopf").toBe("7");
    expect(res.headers["x-kepta-count"]).toBe("3");
    expect(res.headers["x-kepta-begrenzt"]).toBe("1");
  });

  it("nennt denselben Bestand an einer 304", async () => {
    for (let i = 0; i < 4; i++) notiz(i);
    const erste = await request(app).get("/api/memories");
    const etag = erste.headers.etag;
    expect(etag).toBeTruthy();
    expect(JSON.parse(erste.text).total).toBe(4);
    const zweite = await request(app).get("/api/memories").set("If-None-Match", etag);
    expect(zweite.status).toBe(304);
    expect(zweite.headers["x-kepta-total"], "eine 304 ohne Bestand lässt die Fläche raten").toBe("4");
  });

  it("senkt den Bestand nach dem Löschen — die Zahl veraltet nicht", async () => {
    for (let i = 0; i < 5; i++) notiz(i);
    expect(JSON.parse((await request(app).get("/api/memories")).text).total).toBe(5);
    const id = JSON.parse((await request(app).get("/api/memories?limit=1")).text).memories[0].id as string;
    await request(app).delete(`/api/memories/${id}`);
    const nachher = await request(app).get("/api/memories");
    expect(JSON.parse(nachher.text).total).toBe(4);
    expect(nachher.headers["x-kepta-total"]).toBe("4");
  });
});
