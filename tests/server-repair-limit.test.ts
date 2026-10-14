// @vitest-environment node
//
// Nebenbefund aus der F12-Scheibe, jetzt geheilt: POST /api/repair/imports deklariert
// ein 16-kb-Body-Limit (server/router/scan.ts:373), aber das Limit galt nicht. Der Kern
// mountet seinen Routen-Parser VOR dem globalen (kepta-core/server.ts:572 vor :575);
// die App registriert das globale 1mb-Limit in createApp (server/app.ts:187) und den
// Scan-Router erst danach. express.json ueberspringt einen bereits geparsten Body —
// das 16kb-Limit wurde also nie erreicht. Gemessen am alten Stand: 900 kb Leib ->
// **200** in der App, **413** im Kern (`f12-evidence/nebenbefund-repair-limit.txt`).
//
// Diese Datei haelt die Regel, nicht die Absicht: die Route muss ein 413 nennen, das
// ihre eigene Kappe und die empfangene Groesse nennt, und der Report darf nicht laufen.
//
// K-2 haelt die Klasse: die Sonde findet **drei** engere Kappen hinter dem globalen
// Parser — repair/imports (16 kb), scan/config (256 kb) und open (16 kb). Die dritte
// stand in keiner Meldung; sie war einfach da und tat nicht, was ihre Zeile sagt.
//
// Ein Horcher pro Datei auf 127.0.0.1:8819 — nie request(app) (Ursache-9-Heilung,
// tests/helfer/lauscher.ts).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KeptaStore } from "../src/core/store";
import { defaultExtensions } from "../src/core/extensions";
import { createApp } from "../server/app";
import { lauscht, niederlegen } from "./helfer/lauscher";

const PORT = 8819;
let URLE = `http://127.0.0.1:${PORT}`;

let wurzel = "";
let vorherHeim: string | undefined;
let vorherDaten: string | undefined;
let store: KeptaStore;
let hoerer: import("node:http").Server;

interface Korpus {
  ok?: boolean;
  error?: string;
  limitBytes?: number;
  receivedBytes?: number;
  [feld: string]: unknown;
}

async function sende(leib: unknown): Promise<{ status: number; body: Korpus | null; text: string }> {
  const antwort = await fetch(`${URLE}/api/repair/imports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(leib),
  });
  const text = await antwort.text();
  let body: Korpus | null = null;
  try { body = JSON.parse(text) as Korpus; } catch { /* die Antwort ist selbst das Ergebnis */ }
  return { status: antwort.status, body, text };
}

beforeAll(async () => {
  wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-repair-limit-"));
  // Kapsel: createApp zieht ohne KEPTA_DATA_DIR ~/.kepta des Anmeldekontos an
  // (server/app.ts:120), und os.homedir() folgt HOME.
  vorherHeim = process.env.HOME;
  vorherDaten = process.env.KEPTA_DATA_DIR;
  process.env.HOME = wurzel;
  process.env.KEPTA_DATA_DIR = wurzel;
  store = new KeptaStore(path.join(wurzel, "kepta.db"), defaultExtensions());
  store.createMemory({
    title: "Clip",
    content: "Ein Web-Clip mit Source: /tmp/beleg.pdf — Source: /tmp/beleg.pdf",
    tags: ["repair-limit"],
  });
  const horcher = await lauscht(createApp(store), PORT);
  hoerer = horcher.server;
  URLE = horcher.urle;
});

afterAll(async () => {
  if (hoerer) await niederlegen(hoerer);
  store?.close();
  if (vorherHeim === undefined) delete process.env.HOME;
  else process.env.HOME = vorherHeim;
  if (vorherDaten === undefined) delete process.env.KEPTA_DATA_DIR;
  else process.env.KEPTA_DATA_DIR = vorherDaten;
  fs.rmSync(wurzel, { recursive: true, force: true });
});

describe("K-1 — das deklarierte 16-kb-Limit von POST /api/repair/imports gilt", () => {
  it("weist 900 kb mit 413 ab und nennt seine eigene Kappe", async () => {
    const { status, body } = await sende({ fueller: "x".repeat(900_000) });
    expect(status).toBe(413);
    // Der Kern sagt limitBytes/receivedBytes — die App sagt jetzt dasselbe.
    expect(body?.limitBytes).toBe(16 * 1024);
    expect(typeof body?.receivedBytes).toBe("number");
    expect(body?.receivedBytes ?? 0).toBeGreaterThan(900_000);
    expect(String(body?.error)).toMatch(/16 KB|16384/);
  });

  it("laesst eine kleine Anfrage durch — die Route ist nicht zugewachsen", async () => {
    const { status, body } = await sende({ apply: false });
    expect(status).toBe(200);
    expect(body?.error).toBeUndefined();
  });

  it("413 antwortet als JSON, nicht als HTML-Stapel", async () => {
    const { text } = await sende({ fueller: "y".repeat(900_000) });
    expect(text.startsWith("{")).toBe(true);
    expect(text).not.toMatch(/at |Error:|node_modules|\/Users\/|\/home\//);
  });
});

// K-2 ist die Klasse, nicht der Einzelfall. Ein Limit, das hinter dem globalen
// Parser mountet, ist ein Kommentar — also wird hier jede deklarierte Kappe aus
// dem Quelltext gelesen und einzeln am Horcher gemessen. Ein drittes Limit kann
// sich nicht mehr als Absicht verstecken.
const ROUTER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "server", "router");
const KAPPE = /app\.(post|put|patch)\(\s*"([^"]+)"[^)]*?express\.json\(\{\s*limit:\s*"(\d+)(kb|mb)"\s*\}\)/gi;
const GLOBALES_LIMIT = 1024 * 1024;

function deklarierteKappen() {
  const funde: { methode: string; pfad: string; bytes: number; wo: string }[] = [];
  for (const datei of fs.readdirSync(ROUTER).filter((d) => d.endsWith(".ts"))) {
    const quell = fs.readFileSync(path.join(ROUTER, datei), "utf8").split("\n");
    quell.forEach((zeile, i) => {
      for (const m of zeile.matchAll(KAPPE)) {
        const bytes = Number(m[3]) * (m[4].toLowerCase() === "mb" ? 1024 * 1024 : 1024);
        if (bytes >= GLOBALES_LIMIT) return; // weiter oder gleich dem globalen: keine engere Kappe
        funde.push({ methode: m[1].toUpperCase(), pfad: m[2], bytes, wo: `${datei}:${i + 1}` });
      }
    });
  }
  return funde;
}

describe("K-2 — jede engere Routen-Kappe gilt auch, wo sie mountet", () => {
  const funde = deklarierteKappen();

  it("die Sonde findet die engeren Kappen (ein Fund von null ist ein kaputter Griff)", () => {
    expect(funde.length).toBeGreaterThanOrEqual(2);
    expect(funde.map((f) => f.pfad)).toContain("/api/repair/imports");
    expect(funde.map((f) => f.pfad)).toContain("/api/scan/config");
  });

  it.each(funde.map((f) => [f.pfad, f.methode, f.bytes, f.wo] as const))(
    "%s (%s, Kappe %d Bytes aus %s) weist einen Leib darueber mit 413 ab",
    async (pfad, methode, bytes) => {
      const fueller = "z".repeat(bytes + 64 * 1024);
      const antwort = await fetch(`${URLE}${pfad}`, {
        method: methode,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fueller }),
      });
      const text = await antwort.text();
      let body: Korpus = {};
      try { body = JSON.parse(text) as Korpus; } catch { /* die Antwort ist selbst das Ergebnis */ }
      expect(antwort.status).toBe(413);
      expect(body.limitBytes).toBe(bytes);
      expect(String(body.error)).not.toMatch(/node_modules|\/Users\/|\/home\//);
    },
  );
});
