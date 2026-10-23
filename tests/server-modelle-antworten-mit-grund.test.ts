// @vitest-environment node
// Schlag 22.10. nacht, zweiter Teil: der Brief sagt, /api/models antworte mit 500, wenn kein
// Anbieter gewaehlt ist (#60). Nachgemessen am Kopf 638e95f (22:31 MESZ) in der eignen Grube:
//   - ohne Basis antwortet die Route mit 400 und grund=kein-anbieter (chat.ts:201-206) - die 500
//     ist es seit p4-t (gelandet in 02bec77) nicht mehr;
//   - 500 ist die Antwort, wenn ein Anbieter ablehnt (chat.ts:239-244, grund=anbieter-lehnt-ab)
//     oder wenn sein Leib nicht zu lesen ist (chat.ts:263, grund=antwort-nicht-lesbar). Beide
//     Haetten sitzen mit Absicht auf 500, weil tests/server.test.ts:883 genau diese Zahl erwartet.
// Diese Datei haelt beide Antworten fest, damit die Zahl nicht wieder als Vermutung umlaeuft,
// und prueft, dass an beiden 500er-Stellen ein grund mitgeht - ohne Grund kann die Flaeche
// (src/lib/tuergrund.ts) keinen Satz malen.
//
// Rein ASCII. Kein Netzgriff ueber 127.0.0.1 hinaus: die ablehnende Adresse ist ein eigner Horcher.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../src/core/store";
import { defaultExtensions } from "../src/core/extensions";
import { createApp } from "../server/app";
import { lauscht, niederlegen } from "./helfer/lauscher";

const PORT = 8941;
let URLE = `http://127.0.0.1:${PORT}`;
let wurzel = "";
let vorherHeim: string | undefined;
let vorherDaten: string | undefined;
let store: KeptaStore;
let hoerer: http.Server;
let ablehner: http.Server;
let ablehnerUrl = "";

async function modelle(koerper: unknown) {
  const r = await fetch(`${URLE}/api/models`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(koerper),
  });
  const text = await r.text();
  let leib: Record<string, unknown> = {};
  try { leib = JSON.parse(text) as Record<string, unknown>; } catch { /* keine JSON-Antwort */ }
  return { status: r.status, leib, text };
}

beforeAll(async () => {
  wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-modelle-"));
  vorherHeim = process.env.HOME;
  vorherDaten = process.env.KEPTA_DATA_DIR;
  process.env.HOME = wurzel;
  process.env.KEPTA_DATA_DIR = wurzel;
  const datenSchluessel = new Uint8Array(crypto.randomBytes(32));
  store = new KeptaStore(path.join(wurzel, "kepta.db"), {
    ...defaultExtensions(),
    keys: { ablage: "KEPTA_DB_KEY (Messlauf)", keyFor: () => datenSchluessel },
  });
  // Ein Anbieter, der ablehnt: eigener Horcher, heimische Adresse, kein Netz.
  ablehner = http.createServer((_req, res) => {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "Der Schluessel ist abgelaufen" } }));
  });
  await new Promise<void>((los) => ablehner.listen(0, "127.0.0.1", los));
  ablehnerUrl = `http://127.0.0.1:${(ablehner.address() as { port: number }).port}/v1`;
  const horcher = await lauscht(createApp(store), PORT);
  hoerer = horcher.server;
  URLE = horcher.urle;
});

afterAll(async () => {
  if (hoerer) await niederlegen(hoerer);
  await new Promise<void>((los) => ablehner.close(() => los()));
  store?.close();
  if (vorherHeim === undefined) delete process.env.HOME;
  else process.env.HOME = vorherHeim;
  if (vorherDaten === undefined) delete process.env.KEPTA_DATA_DIR;
  else process.env.KEPTA_DATA_DIR = vorherDaten;
  fs.rmSync(wurzel, { recursive: true, force: true });
});

describe("P4-60 nachgemessen: was /api/models wirklich antwortet", () => {
  it("ohne gewaehlten Anbieter: 400 mit Grund, nicht 500", async () => {
    const { status, leib } = await modelle({ protocol: "openai", baseUrl: "", apiKey: "" });
    expect(status, `Antwort: ${JSON.stringify(leib)}`).toBe(400);
    expect(leib.grund).toBe("kein-anbieter");
  });

  it("leibiger Korper (kein baseUrl-Feld): ebenfalls 400 mit Grund", async () => {
    const { status, leib } = await modelle({ protocol: "openai" });
    expect(status, `Antwort: ${JSON.stringify(leib)}`).toBe(400);
    expect(leib.grund).toBe("kein-anbieter");
  });

  it("ablehnender Anbieter: 500, und der Grund geht mit", async () => {
    const { status, leib } = await modelle({ protocol: "openai", baseUrl: ablehnerUrl, apiKey: "" });
    expect(status, `Antwort: ${JSON.stringify(leib)}`).toBe(500);
    expect(leib.grund, "eine 500 ohne Grund kann die Flaeche nicht malen").toBe("anbieter-lehnt-ab");
    expect(String(leib.error), `Abweisungs-Satz: ${JSON.stringify(leib.error)}`).toContain("abgelaufen");
    expect(leib.status).toBe(403);
  });

  it("tauber Hafen: 502 mit Grund, und die Adresse steht in der Auskunft", async () => {
    const { status, leib } = await modelle({ protocol: "openai", baseUrl: "http://127.0.0.1:9/v1", apiKey: "" });
    expect(status, `Antwort: ${JSON.stringify(leib)}`).toBe(502);
    expect(leib.grund).toBe("anbieter-nicht-erreichbar");
    expect(String(leib.url)).toContain("127.0.0.1:9");
  });

  it("lesbare Antwort eines heimischen Anbieters: 200 mit der Liste", async () => {
    const Liste = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "ein-modell" }, { id: "noch-eins" }] }));
    });
    await new Promise<void>((los) => Liste.listen(0, "127.0.0.1", los));
    const basis = `http://127.0.0.1:${(Liste.address() as { port: number }).port}/v1`;
    try {
      const { status, leib } = await modelle({ protocol: "openai", baseUrl: basis, apiKey: "" });
      expect(status, `Antwort: ${JSON.stringify(leib)}`).toBe(200);
      expect(leib.models).toEqual(["ein-modell", "noch-eins"]);
    } finally {
      await new Promise<void>((los) => Liste.close(() => los()));
    }
  });
});
