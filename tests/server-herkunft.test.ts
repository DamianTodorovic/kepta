/* P157 — die Herkunft an der loopback-Tuer: was "a website using DNS rebinding gets nothing"
   wirklich bedeutet, und welche Maschine das haelt.

   README.md:262 verkauft seit Wochen einen Satz, den kein Fall pruefte: die Tuer bindet an
   127.0.0.1, und eine Website, die per Rebinding auf 127.0.0.1 zeigt, "bekommt nichts". Der
   Grund, warum der Satz trotzdem haelt, ist nicht die Bindung — ein Browser kann eine
   Cross-Origin-Anfrage sehr wohl absenden — sondern die Origin-Pruefung in server/app.ts:211-221:
   ein fremder Origin bekommt keinen Access-Control-Allow-Origin, also blockt der Browser das
   REINREADEN des Antwortkörpers. Genau das war ungemessen.

   Geaendert hat die Runde nichts an dieser Regel; sie hat den Zeugen geliefert. Dazu die
   Gegenkontrolle, damit die Wache keine Abschaltung ist: der localhost-Origin darf weiterhin
   seine Antwort lesen, und ein Programm ohne Origin (curl, MCP, der Electron-Hauptprozess) wird
   nicht gebremst — die Zeile README.md:262 spricht von einer *Website*, und was hier gilt, ist
   die Browser-Sicht. */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import request from "supertest";
import { KeptaStore } from "../src/core/store";

process.env.KEPTA_NO_AUTOSTART = "1";
process.env.KEPTA_ENCRYPTION = "off";

let createApp: typeof import("../server").createApp;
let app: import("express").Express;
let dir: string;
let prevHome: string | undefined;
let prevDatenordner: string | undefined;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "herkunft-"));
  // Die zwei Wande der Hauses: eigener Datenordner und eigenes HOME, damit kein Lauf
  // das echte Profil, den echten Schluesselbund oder die echte ~/.kepta beruehrt.
  prevDatenordner = process.env.KEPTA_DATA_DIR;
  prevHome = process.env.HOME;
  process.env.KEPTA_DATA_DIR = dir;
  process.env.HOME = dir;
  ({ createApp } = await import("../server"));
  app = createApp(new KeptaStore(path.join(dir, "herkunft.db")));
});

afterAll(() => {
  if (prevDatenordner === undefined) delete process.env.KEPTA_DATA_DIR;
  else process.env.KEPTA_DATA_DIR = prevDatenordner;
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("P157, die Herkunft: eine fremde Website bekommt die Antwort nicht zu lesen", () => {
  it("ein fremder Origin bekommt keinen Access-Control-Allow-Origin", async () => {
    const res = await request(app).get("/api/health").set("Origin", "https://angreifer.example");
    expect(res.status).toBeLessThan(500);
    expect(res.headers["access-control-allow-origin"], "der fremde Origin wurde freigesprochen").toBeUndefined();
  });

  it("der localhost-Origin behaelt seinen Korper — die Regel ist keine Abschaltsperre", async () => {
    const res = await request(app).get("/api/health").set("Origin", "http://127.0.0.1:5173");
    expect(res.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:5173");
    expect(res.headers.vary).toContain("Origin");
  });

  it("ein Programm ohne Origin (curl, MCP, Hauptprozess) wird nicht gebremst", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });
});
