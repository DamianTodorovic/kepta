// @vitest-environment node
//
// BAU-P3-11, zweiter Schritt, Tuer-Seite (24.10. 00:1x MESZ): die Standfolge einer Notiz ist ueber
// die App-Tuer lesbar - Seite, Kappe, Kappen-Meldung, neueste zuerst - und zwar gratis: kein
// Schluessel, keine Fahne, kein Bezahlwort.
//
// Rot vor gruen: am Kopf 53e2520 antwortet /api/memories/<id>/stande mit 404 (kein Weg), der Fall
// faellt also am Verhalten. Eigener Port 8947 in meinem Block, eigener Horcher, kein Netz darueber hinaus.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../src/core/store";
import { defaultExtensions } from "../src/core/extensions";
import { createApp } from "../server/app";
import { lauscht, niederlegen } from "./helfer/lauscher";

const PORT = 8947;
let URLE = `http://127.0.0.1:${PORT}`;
let wurzel = "";
let vorherHeim: string | undefined;
let vorherDaten: string | undefined;
let store: KeptaStore;
let hoerer: import("node:http").Server;

async function anlegen(titel: string, inhalt: string) {
  const r = await fetch(`${URLE}/api/memories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: titel, content: inhalt }),
  });
  const leib = (await r.json()) as { memory?: { id: string } };
  return leib.memory as { id: string };
}

async function aendern(id: string, inhalt: string) {
  const r = await fetch(`${URLE}/api/memories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, content: inhalt }),
  });
  expect(r.status).toBe(200);
}

async function staende(id: string, query = "") {
  const r = await fetch(`${URLE}/api/memories/${id}/stande${query}`);
  const text = await r.text();
  let leib: Record<string, unknown> = {};
  try { leib = JSON.parse(text) as Record<string, unknown>; } catch { /* keine JSON-Antwort */ }
  return { status: r.status, leib, text };
}

beforeAll(async () => {
  wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-stand-tuer-"));
  vorherHeim = process.env.HOME;
  vorherDaten = process.env.KEPTA_DATA_DIR;
  process.env.HOME = wurzel;
  process.env.KEPTA_DATA_DIR = wurzel;
  const datenSchluessel = new Uint8Array(crypto.randomBytes(32));
  store = new KeptaStore(path.join(wurzel, "kepta.db"), {
    ...defaultExtensions(),
    keys: { ablage: "KEPTA_DB_KEY (Messlauf)", keyFor: () => datenSchluessel },
  });
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

describe("Tuer: die Standfolge einer Notiz, gratis und mit Seite", () => {
  it("200 mit dem alten Text, Seite, Kappe und Kappen-Meldung", async () => {
    const m = await anlegen("Tuer", "Fassung eins");
    await aendern(m.id, "Fassung zwei");
    const { status, leib } = await staende(m.id);
    expect(status).toBe(200);
    expect(leib.total).toBe(1);
    expect(leib.count).toBe(1);
    expect(leib.begrenzt).toBe(false);
    expect(typeof leib.hinweis).toBe("string");
    const liste = leib.staende as Array<{ content: string; title: string }>;
    expect(liste[0].content).toBe("Fassung eins");
    expect(liste[0].title).toBe("Tuer");
  });

  it("ohne Aenderung: 200, total 0, und der Hinweis nennt den leeren Zustand", async () => {
    const m = await anlegen("Frisch", "Noch nie geaendert");
    const { status, leib } = await staende(m.id);
    expect(status).toBe(200);
    expect(leib.total).toBe(0);
    expect(String(leib.hinweis)).toMatch(/no earlier stand/);
  });

  it("unbekannte Notiz: 404 mit Node not found", async () => {
    const { status, leib } = await staende("k-gibtesnicht-000000");
    expect(status).toBe(404);
    expect(leib.error).toBe("Node not found");
  });

  it("limit ueber der Kappe wird geklemmt und im Hinweis genannt", async () => {
    const m = await anlegen("Kappe", "eins");
    await aendern(m.id, "zwei");
    const { status, leib } = await staende(m.id, "?limit=9999");
    expect(status).toBe(200);
    expect(leib.limit).toBe(200);
    expect(String(leib.hinweis)).toMatch(/pinned to 200/);
  });
});
