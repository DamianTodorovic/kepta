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
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-permanent-"));
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

async function knoten(titel = "Loeschkandidat") {
  const res = await request(app).post("/api/memories").send({ title: titel, content: "Inhalt mit Substanz." });
  return String(res.body.memory.id);
}

const aktiv = async () => (await request(app).get("/api/memories")).body.length;
const paperkorb = async () => (await request(app).get("/api/memories?trash=1")).body.length;

describe("A3-11 — DELETE /api/memories/:id?permanent= nahm unbekannte Werte still als Papierkorb", () => {
  it("lehnt ?permanent=True ab, statt die Notiz in den Papierkorb zu verschieben", async () => {
    const id = await knoten();
    const res = await request(app).delete(`/api/memories/${encodeURIComponent(id)}?permanent=True`);
    expect(res.status).toBe(400);
    expect(await aktiv()).toBe(1);
    expect(await paperkorb()).toBe(0);
  });

  it("nennt in der Ablehnung die erlaubten Formen", async () => {
    const id = await knoten();
    const res = await request(app).delete(`/api/memories/${encodeURIComponent(id)}?permanent=True`);
    const text = JSON.stringify(res.body);
    expect(text).toMatch(/permanent/);
    for (const form of ["1", "0", "true", "false"]) expect(text).toContain(form);
  });

  it("lehnt jeden unbekannten Wert ab (yes, ja, leer, TWO)", async () => {
    for (const wert of ["yes", "ja", "", "TRUE-ish", "2"]) {
      const id = await knoten(`Kandidat ${wert || "leer"}`);
      const res = await request(app).delete(`/api/memories/${encodeURIComponent(id)}?permanent=${encodeURIComponent(wert)}`);
      expect(res.status).toBe(400);
    }
    expect(await aktiv()).toBe(5);
    expect(await paperkorb()).toBe(0);
  });

  it("lehnt einen doppelten Query-Wert ab, statt den ersten zu nehmen", async () => {
    const id = await knoten();
    const res = await request(app).delete(`/api/memories/${encodeURIComponent(id)}?permanent=1&permanent=0`);
    expect(res.status).toBe(400);
    expect(await aktiv()).toBe(1);
  });

  it("?permanent=1 loescht endgueltig (Quittung permanent:true, nichts im Papierkorb)", async () => {
    const id = await knoten();
    const res = await request(app).delete(`/api/memories/${encodeURIComponent(id)}?permanent=1`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, permanent: true });
    expect(await aktiv()).toBe(0);
    expect(await paperkorb()).toBe(0);
  });

  it("?permanent=true loescht endgueltig, ?permanent=false und =0 verschieben in den Papierkorb", async () => {
    const a = await knoten("a");
    const w = await request(app).delete(`/api/memories/${encodeURIComponent(a)}?permanent=true`);
    expect(w.body).toEqual({ ok: true, permanent: true });

    const b = await knoten("b");
    const f = await request(app).delete(`/api/memories/${encodeURIComponent(b)}?permanent=false`);
    expect(f.body).toEqual({ ok: true, permanent: false });
    expect(await paperkorb()).toBe(1);

    const c = await knoten("c");
    const n = await request(app).delete(`/api/memories/${encodeURIComponent(c)}?permanent=0`);
    expect(n.body).toEqual({ ok: true, permanent: false });
    expect(await paperkorb()).toBe(2);
  });

  it("ohne permanent-Feld bleibt der Papierkorb der Standard", async () => {
    const id = await knoten();
    const res = await request(app).delete(`/api/memories/${encodeURIComponent(id)}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, permanent: false });
    expect(await paperkorb()).toBe(1);
  });

  it("eine unbekannte Form loescht nichts — auch nicht im Papierkorb einer anderen Notiz", async () => {
    const id = await knoten();
    const res = await request(app).delete(`/api/memories/${encodeURIComponent(id)}?permanent=TRUE`);
    expect(res.status).toBe(400);
    expect(String(res.body.error)).not.toMatch(/undefined|object Object/);
    expect(await aktiv()).toBe(1);
    expect(await paperkorb()).toBe(0);
  });
});
