// Die eigne Antwort erkennen — damit ein fremder Hoerer nicht als Tuer durchgeht.
//
// Anlass (Volllauf am 3.11. gegen 15:5x): ein einzelner Fall in
// `tests/scan-api.test.ts` bekam 401 mit dem Leib `auth required`. Dieser Text steht in
// diesem Baum nirgends (server/, src/, tests/), in keinem abhaengigen Paket und nicht im
// Enterprise-Baum; die eigne Absage heisst "This request needs a key. Nothing was changed."
// (`server/app.ts`). Die Datei allein laeuft 20 von 20 gruen. Also antwortete etwas
// Fremdes auf eine eigne Anfrage — dieselbe Klasse wie die bekannte Ursache 9 der Suite
// (ein Lauscher ohne Host bindet auf `::`, und ein fremder v4-Hoerer antwortet).
//
// Solange eine Antwort nur an ihrer Zahl pruefbar ist, kann derselbe fremde Hoerer
// spaeter einen Fall *gruen* machen statt rot. Diese Datei haelt beides: die Tuer nennt
// sich auf jeder Antwort selbst, und ein Leib ohne diese Zeile ist nicht sie.
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";

import { KeptaStore } from "../src/core/store";
import { APP_VERSION } from "../src/core/version";
import { eigeneAntwort } from "./helfer/eigene-antwort";

const lies = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

process.env.KEPTA_NO_AUTOSTART = "1";
process.env.KEPTA_ENCRYPTION = "off";

let createApp: typeof import("../server").createApp;
let store: KeptaStore;
let app: import("express").Express;
let dir: string;
let prevHome: string | undefined;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "kepta-marke-"));
  prevHome = process.env.HOME;
  process.env.HOME = dir;
  process.env.KEPTA_DATA_DIR = dir;
  vi.resetModules();
  ({ createApp } = await import("../server"));
  store = new KeptaStore(path.join(dir, "test.db"));
  app = createApp(store);
});

afterEach(() => {
  store.close();
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
});

describe("Die eigne Tuer nennt sich auf jeder Antwort (#46)", () => {
  it("die Gegenprobe: ein Leib ohne Marke ist nicht die eigne Tuer", () => {
    // Ohne sie waeren die zwei Faelle unten eine Beschreibung eines Zustands, den
    // niemand pruefen kann.
    expect(() => eigeneAntwort({ status: 401, headers: {} } as never)).toThrow(/nicht die eigne/);
    expect(() => eigeneAntwort({ status: 200, headers: { "x-kepta-marke": `kepta/${APP_VERSION}` } } as never)).not.toThrow();
  });

  it("eine Leserin traegt die Marke, und sie nennt die eigne Version", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(eigeneAntwort(res).headers["x-kepta-marke"]).toBe(`kepta/${APP_VERSION}`);
  });

  it("auch eine Absage traegt die Marke — der fremde Hoerer antwortet nur ungefragt", async () => {
    const res = await request(app).get("/api/es-ist-hier-nichts");
    expect(res.status).toBe(404);
    expect(eigeneAntwort(res).headers["x-kepta-marke"]).toBe(`kepta/${APP_VERSION}`);
  });

  it("die Zeile sitzt vor den Tueroeffnern, nicht zwischen ihnen", () => {
    // Ein Haenger, der hinter den Routen greift, laesst 401/403-Absagen ohne Marke durch —
    // genau die Klasse von Antwort, um die es hier geht.
    const text = lies("server/app.ts");
    const marke = text.indexOf("keptaMarke");
    const schwelle = text.indexOf("nurDieserRechner(");
    expect(marke, "die Marke wird in server/app.ts nicht montiert").toBeGreaterThan(-1);
    expect(schwelle, "der Rechner-Zaun ist nicht in server/app.ts zu finden").toBeGreaterThan(-1);
    expect(marke, "die Marke haengt hinter dem Rechner-Zaun — Absagen blieben ohne sie").toBeLessThan(schwelle);
  });
});
