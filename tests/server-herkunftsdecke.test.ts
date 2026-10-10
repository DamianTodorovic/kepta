import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import express from "express";
import request from "supertest";
import { KeptaStore } from "../src/core/store";
import { nurDieserRechner } from "../src/herkunft";

// server.ts nur importieren, nachdem AUTOSTART gesetzt ist — sonst startet der echte Server.
process.env.KEPTA_NO_AUTOSTART = "1";

let createApp: (store: KeptaStore) => import("express").Express;
let store: KeptaStore;
let app: import("express").Express;
let prevHome: string | undefined;
let dir: string;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-deckung-"));
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

interface Ende { pfad: string; method: string }

/**
 * Die Tueren der App, aus ihrem eigenen Router-Stapel gelesen — nicht aus einer
 * Handliste. Eine Handliste ist der Grund, warum eine neue Route unbemerkt ohne
 * Deckung bleiben kann: wer sie anlegt, denkt nicht an die Liste.
 */
function tueren(airApp: any): Ende[] {
  const router = airApp?._router ?? airApp?.router;
  if (!router || !Array.isArray(router.stack)) throw new Error("kein Router-Stapel — die Wache laeuft ins Leere");
  const out: Ende[] = [];
  for (const layer of router.stack) {
    const route = layer?.route;
    if (!route) continue;
    for (const [methode, gesetzt] of Object.entries(route.methods ?? {})) {
      // HEAD haengt express automatisch an jede GET-Route; keine eigene Tuer.
      if (gesetzt && methode !== "head") out.push({ pfad: route.path, method: methode });
    }
  }
  return out;
}

const FREMDER_HOST = "evil.example:3000";
const FREMDE_SEITE = "https://evil.example";
const LESEND = ["get"];
const SCHREIBEND = ["post", "put", "delete", "patch"];

/** :schienen brauchen einen konkreten Wert, sonst trifft die Anfrage keine Route. */
const fuellen = (pfad: string) => pfad.replace(/:[\w]+/g, "deckungsprobe");

describe("Herkunfts-Decke — jede Tuer einzeln hinter der Schleuse", () => {
  it("der Stapel nennt die Tueren, und es sind alle", () => {
    const alle = tueren(app);
    expect(alle.length, "keine einzige Route im Stapel gefunden").toBeGreaterThan(30);
    // Die bekannten Tueren, exemplarisch: lesen, schreiben, Agentenspiegel, die neue Bildroute.
    const pfade = new Set(alle.map((t) => t.pfad));
    // Nur die seit langem bestehenden Tueren werden namentlich verlangt. Was eine
    // spaetere Scheibe anlegt (etwa die Bildroute des Graphen), faengt automatisch die
    // Schleife unten — dafuer steht die Liste nicht von Hand.
    for (const pfad of ["/api/memories", "/api/health", "/api/settings", "/api/inbox/scan", "/api/memories/import", "/api/mcp/save", "/mcp"]) {
      expect(pfade, `${pfad} fehlt im Stapel`).toContain(pfad);
    }
  });

  it("jede lesende Tuer gibt einem fremden Host 403 — Tuer fuer Tuer", async () => {
    const lesend = tueren(app).filter((t) => LESEND.includes(t.method));
    expect(lesend.length).toBeGreaterThan(5);
    for (const tuer of lesend) {
      const r = await (request(app) as any)[tuer.method](fuellen(tuer.pfad)).set("Host", FREMDER_HOST);
      expect(r.status, `${tuer.method} ${tuer.pfad}`).toBe(403);
      expect(r.body, `${tuer.method} ${tuer.pfad}`).toEqual({ error: "Forbidden host." });
    }
  });

  it("jede schreibende Tuer gibt fremdem Host 403 — und einer fremden Seite auch", async () => {
    const schreibend = tueren(app).filter((t) => SCHREIBEND.includes(t.method));
    expect(schreibend.length).toBeGreaterThan(5);
    for (const tuer of schreibend) {
      const fremderHost = await (request(app) as any)[tuer.method](fuellen(tuer.pfad)).set("Host", FREMDER_HOST).send({});
      expect(fremderHost.status, `${tuer.method} ${tuer.pfad} (Host)`).toBe(403);
      expect(fremderHost.body, `${tuer.method} ${tuer.pfad} (Host)`).toEqual({ error: "Forbidden host." });
      // Dieselbe Tuer, lokaler Host, fremde Webseite: der Formularweg ohne Preflight.
      const fremdeSeite = await (request(app) as any)[tuer.method](fuellen(tuer.pfad))
        .set("Host", "127.0.0.1:3000").set("Origin", FREMDE_SEITE).type("form").send({ title: "x" });
      expect(fremdeSeite.status, `${tuer.method} ${tuer.pfad} (Origin)`).toBe(403);
      expect(fremdeSeite.body, `${tuer.method} ${tuer.pfad} (Origin)`).toEqual({ error: "Forbidden origin." });
    }
  });

  it("die Wache beisst: eine Tuer vor der Schleuse liefert Daten an eine fremde Webseite", async () => {
    // Der Fehlerfall, ohne server.ts anzufassen: derselbe Ablauf an einem
    // nachgebauten Stapel, in dem die Route VOR der Schleuse liegt.
    const geschuetzt = express();
    geschuetzt.use(nurDieserRechner());
    geschuetzt.get("/api/memories", (_req, res) => res.json([]));
    expect((await request(geschuetzt).get("/api/memories").set("Host", FREMDER_HOST)).status).toBe(403);

    const schlupf = express();
    schlupf.get("/api/memories", (_req, res) => res.json([{ id: "gelesen-von-woanders" }]));
    schlupf.use(nurDieserRechner());
    const durch = await request(schlupf).get("/api/memories").set("Host", FREMDER_HOST);
    expect(durch.status).toBe(200);
    expect(durch.body).toEqual([{ id: "gelesen-von-woanders" }]);
    // Und genau hier bricht die obige Tuer-fuer-Tuer-Schleife durch: dieselbe
    // Pruefung, gegen diesen Stapel losgelassen, findet die ungedeckte Tuer.
    const offen = [] as string[];
    for (const tuer of tueren(schlupf)) {
      const r = await (request(schlupf) as any)[tuer.method](fuellen(tuer.pfad)).set("Host", FREMDER_HOST);
      if (r.status !== 403) offen.push(`${tuer.method} ${tuer.pfad}`);
    }
    expect(offen).toEqual(["get /api/memories"]);
  });
});
