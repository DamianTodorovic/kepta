// @vitest-environment jsdom
// F13 — der Nachweis am echten Server.
//
// Zwei Behauptungen, ein Lauf:
//   (a) der KI-Schluessel ueberlebt den Neustart der App
//   (b) GET /api/settings enthaelt ihn im selben Lauf nicht
//
// Der Rest der Suite faehrt die Route ueber Supertest; hier lauscht die
// App-App auf 127.0.0.1:8801 (ein Hoerer pro Datei, kein wandernder Port) und
// die Gegenprobe kommt als rohe HTTP-Anfrage ohne jeden App-Code — genau so,
// wie ein beliebiger Prozess auf der Maschine sie senden wuerde.
//
// Sandkasten: HOME und KEPTA_DATA_DIR in einer Tempwurzel, selbst erzeugter
// 64-er KEPTA_DB_KEY, kein Schluesselbund des Rechners.
import { afterEach, beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../../src/core/store";
import { defaultExtensions } from "../../src/core/extensions";
import { createApp } from "../../server/app";
import { lauscht, niederlegen } from "../helfer/lauscher";
import { kiSitzung as sitzung } from "../helfer/ki-routen";

const PORT = 8801;
let urle = `http://127.0.0.1:${PORT}`;

const echteFetch = globalThis.fetch;
const frueher = {
  HOME: process.env.HOME,
  KEPTA_DATA_DIR: process.env.KEPTA_DATA_DIR,
  KEPTA_DB_KEY: process.env.KEPTA_DB_KEY,
};

let wurzel = "";
let dbPfad = "";
let datenSchluessel = "";
let store: KeptaStore;
let hoerer: import("node:http").Server;

/** Die App-Logik holt relative URLs — hier derselbe Code, nur mit Zielport. */
function holeImPage(): void {
  vi.stubGlobal("fetch", (url: string | URL | Request, init?: RequestInit) => {
    const text = String(url);
    return echteFetch(text.startsWith("/") ? `${urle}${text}` : text, init);
  });
}

async function roheEinstellungen(): Promise<string> {
  // kein Origin, kein Kopf, kein App-Code — dieselbe Anfrage wie ein fremder Prozess
  const r = await echteFetch(`${urle}/api/settings`);
  expect(r.ok).toBe(true);
  return r.text();
}

beforeAll(async () => {
  wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-f13-"));
  const heim = path.join(wurzel, "heim");
  fs.mkdirSync(heim, { recursive: true });
  dbPfad = path.join(wurzel, "kepta.db");
  datenSchluessel = crypto.randomBytes(32).toString("hex");

  process.env.HOME = heim;
  process.env.KEPTA_DATA_DIR = path.join(wurzel, "daten");
  process.env.KEPTA_DB_KEY = datenSchluessel;

  // derselbe Weg wie der Bootstrap: der Schluessel kommt aus der Umgebung, nie
  // aus dem Schluesselbund dieses Rechners
  const erweitern = defaultExtensions();
  store = new KeptaStore(dbPfad, {
    ...erweitern,
    keys: {
      ablage: "KEPTA_DB_KEY (Messlauf)",
      keyFor: () => new Uint8Array(Buffer.from(datenSchluessel, "hex")),
    },
  });
  expect(store.verschluesselung.aktiv).toBe(true);

  // bestellter Port 8801 zuerst, Ausweichport mit Ansage
  const horcher = await lauscht(createApp(store), PORT);
  hoerer = horcher.server;
  urle = horcher.urle;
}, 30_000);

afterAll(async () => {
  if (hoerer) await niederlegen(hoerer);
  store?.close();
  if (frueher.HOME === undefined) delete process.env.HOME;
  else process.env.HOME = frueher.HOME;
  if (frueher.KEPTA_DATA_DIR === undefined) delete process.env.KEPTA_DATA_DIR;
  else process.env.KEPTA_DATA_DIR = frueher.KEPTA_DATA_DIR;
  if (frueher.KEPTA_DB_KEY === undefined) delete process.env.KEPTA_DB_KEY;
  else process.env.KEPTA_DB_KEY = frueher.KEPTA_DB_KEY;
  fs.rmSync(wurzel, { recursive: true, force: true });
});

beforeEach(() => {
  localStorage.clear();
  store.setzeEinstellungen({ ai_connection: null, ai_settings: null });
  holeImPage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("F13 am echten Server: Schluessel bleibt, die API nennt ihn nicht", () => {
  it("(a) und (b) im selben Lauf — Neustart gefuellt, rohe Antwort dicht", async () => {
    const { saveAISettings, hydrateAISettings, kiSchluesselStatus } = await sitzung();
    const schluessel = `sk-ant-F13-${crypto.randomBytes(8).toString("hex")}`;
    await saveAISettings({
      providerId: "anthropic",
      apiKey: schluessel,
      baseUrl: "https://api.anthropic.com",
      model: "claude-sonnet-4-20250514",
    });

    // (b) die rohe Anfrage eines beliebigen Prozesses — ohne App-Code, ohne Kopf
    const sicht = await roheEinstellungen();
    expect(sicht).toContain("ai_connection"); // die Verbindung ist gehalten
    expect(sicht).not.toContain(schluessel); // der Schluessel nicht

    // (a) der Neustart: die Seite beginnt mit leerem Speicher
    localStorage.clear();
    const s = await hydrateAISettings();
    expect(s.providerId).toBe("anthropic");
    expect(s.model).toBe("claude-sonnet-4-20250514");
    expect(s.apiKey).toBe(schluessel);

    // und die API bleibt dicht, nachdem der Rueckweg gefahren wurde
    expect(await roheEinstellungen()).not.toContain(schluessel);

    // dichter Blick unter die Haube: die Datei auf der Platte traegt ihn auch nicht
    expect(fs.readFileSync(dbPfad).toString("latin1")).not.toContain(schluessel);

    // der Verschluss kommt aus der Ablage dieses Laufs, nicht aus der Antwort
    const status = await kiSchluesselStatus();
    expect(status.verschlossen).toBe(true);
    expect(status.ablage).toBe("KEPTA_DB_KEY (Messlauf)");
  });

  it("Wanderung an der maskierten Route: der alte Blob ist nicht mehr zu holen — und wird nicht zerstört", async () => {
    const { hydrateAISettings } = await sitzung();
    const schluessel = `sk-ant-VOR-${crypto.randomBytes(8).toString("hex")}`;
    const blob = JSON.stringify({
      providerId: "openai",
      apiKey: schluessel,
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
    });

    // so schrieb die App vor F13
    const antwort = await echteFetch(`${urle}/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ai_settings: blob }),
    });
    expect(antwort.ok).toBe(true);

    // Schritt 3: die Route gibt den Klartext nicht mehr heraus — weder an die App
    // noch an einen anderen Prozess. Die Wanderung einer Anlage von vor F13 ist
    // damit von der Auslieferungsreihenfolge abhaengig (Bericht, Abschnitt 8).
    const sichtbar = await roheEinstellungen();
    expect(sichtbar).not.toContain(schluessel);
    expect(JSON.parse(sichtbar).ai_settings).toEqual({ gesetzt: true, ende: blob.slice(-4) });

    localStorage.clear();
    const s = await hydrateAISettings();
    expect(s.apiKey).toBe(""); // nicht zu holen
    expect(s.providerId).toBe("openai"); // und doch nicht kaputt: der Default bleibt nutzbar

    // die App schreibt nichts zurueck und loescht nichts, was sie nicht halten kann
    expect(store.einstellungen().ai_settings).toBe(blob);
  });

  it("Trennen an der echten Route: kein Umschlag und kein Schluessel bleiben zurueck", async () => {
    const { saveAISettings, disconnectAI, hydrateAISettings, loadAISettings } = await sitzung();
    const schluessel = `sk-ant-WEG-${crypto.randomBytes(8).toString("hex")}`;
    await saveAISettings({
      providerId: "openai",
      apiKey: schluessel,
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
    });
    localStorage.clear();
    expect((await hydrateAISettings()).apiKey).toBe(schluessel);

    disconnectAI();
    await vi.waitFor(async () => expect(await roheEinstellungen()).not.toContain("v1."), { timeout: 5000 });

    expect(loadAISettings().apiKey).toBe("");
    const sicht = await roheEinstellungen();
    expect(sicht).not.toContain(schluessel);
    localStorage.clear();
    expect((await hydrateAISettings()).apiKey).toBe("");
  });
});
