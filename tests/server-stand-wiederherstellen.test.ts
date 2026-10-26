// @vitest-environment node
//
// Punkt 83, dritter Koerper, Tuer-Seite (Leitung 25.10. 13:05 MEZ (+0100)): Wiederherstellen
// ist ZWEI Schritte - ohne confirm:"restore" wird nichts geschrieben -, gratis, und die Historie
// bleibt stehen. Der Gegenfall zur Gratis-Stufe ist ein Quelltext-Zaun: kein Bezahlwort im Block.
//
// Am Kopf d3a1cd1 gibt es die Route nicht - dieser Fall faellt dort rot.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { KeptaStore } from "../src/core/store";
import { defaultExtensions } from "../src/core/extensions";
import { createApp } from "../server/app";
import { lauscht, niederlegen } from "./helfer/lauscher";

const PORT = 8955;
let URLE = `http://127.0.0.1:${PORT}`;
let wurzel = "";
let vorherHeim: string | undefined;
let vorherDaten: string | undefined;
let store: KeptaStore;
let hoerer: http.Server;
let notizId = "";
let aeltesterStand = 0;

beforeAll(async () => {
  wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-restore-tuer-"));
  vorherHeim = process.env.HOME;
  vorherDaten = process.env.KEPTA_DATA_DIR;
  process.env.HOME = wurzel;
  process.env.KEPTA_DATA_DIR = wurzel;
  const datenSchluessel = new Uint8Array(crypto.randomBytes(32));
  store = new KeptaStore(path.join(wurzel, "kepta.db"), {
    ...defaultExtensions(),
    keys: { ablage: "KEPTA_DB_KEY (Messlauf)", keyFor: () => datenSchluessel },
  });
  const m = store.createMemory({ title: "Restore", content: "eins", tags: [] } as never);
  store.updateMemory(m.id, { content: "zwei" });
  store.updateMemory(m.id, { content: "drei" });
  notizId = m.id;
  const staende = store.listStande(m.id);
  aeltesterStand = staende.staende[staende.staende.length - 1]!.id;
  const horcher = await lauscht(createApp(store), PORT);
  hoerer = horcher.server;
  URLE = horcher.urle;
});

afterAll(async () => {
  if (hoerer) await niederlegen(hoerer);
  store?.close();
  if (vorherHeim === undefined) delete process.env.HOME; else process.env.HOME = vorherHeim;
  if (vorherDaten === undefined) delete process.env.KEPTA_DATA_DIR; else process.env.KEPTA_DATA_DIR = vorherDaten;
  fs.rmSync(wurzel, { recursive: true, force: true });
});

async function rufe(standId: number | string, koerper: unknown) {
  const r = await fetch(`${URLE}/api/memories/${notizId}/stande/${standId}/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(koerper),
  });
  const text = await r.text();
  let leib: Record<string, unknown> = {};
  try { leib = JSON.parse(text) as Record<string, unknown>; } catch { /* keine JSON-Antwort */ }
  return { status: r.status, leib, text };
}

describe("Tuer: Wiederherstellen in zwei Schritten", () => {
  it("ohne confirm: 400 und nichts geschrieben", async () => {
    const vor = store.listStande(notizId);
    const textVor = store.getMemory(notizId)!.content;
    const { status, leib } = await rufe(aeltesterStand, {});
    expect(status).toBe(400);
    expect(String(leib.error)).toMatch(/confirm/);
    expect(store.listStande(notizId).total, "kein Stand durch einen abgewiesenen Ruf").toBe(vor.total);
    expect(store.getMemory(notizId)!.content).toBe(textVor);
  });

  it("mit confirm: 200, Text zeichengleich, total +1, Historie bleibt", async () => {
    const vor = store.listStande(notizId);
    const idsVor = vor.staende.map((s) => s.id);
    const { status, leib } = await rufe(aeltesterStand, { confirm: "restore" });
    expect(status).toBe(200);
    expect((leib.memory as { content: string }).content).toBe("eins");
    expect(leib.restoredFrom).toBe(aeltesterStand);
    expect(leib.total).toBe(vor.total + 1);
    const nach = store.listStande(notizId);
    expect(nach.staende.map((s) => s.id).filter((id) => idsVor.includes(id)), "alte Staende bleiben").toEqual(idsVor);
    expect(nach.staende[0]!.content, "der ersetzte Text ist der neue Stand").toBe("drei");
  });

  it("unbekannter Stand: 404, nichts geschrieben", async () => {
    const vor = store.listStande(notizId);
    const { status } = await rufe(999_999, { confirm: "restore" });
    expect(status).toBe(404);
    expect(store.listStande(notizId).total).toBe(vor.total);
  });

  it("Gratis-Stufe: der Block traegt kein Bezahlwort (Gegenfall: der Scanner findet eins)", () => {
    const quelle = fs.readFileSync(path.resolve(process.cwd(), "server/router/memories.ts"), "utf8");
    const anfang = quelle.indexOf('app.post("/api/memories/:id/stande/:standId/restore"');
    expect(anfang, "Route fehlt im Quelltext").toBeGreaterThan(0);
    const block = quelle.slice(anfang, quelle.indexOf("app.get(\"/api/memories/:id/stande\"", anfang));
    const scanner = /licen[sc]e|premium|upgrade|unlock|paywall|subscription/i;
    expect(scanner.test(block), "Bezahlwort im Wiederherstellen-Block").toBe(false);
    expect(scanner.test("Upgrade to unlock restore"), "Gegenfall: der Scanner kann verlieren").toBe(true);
  });
});
