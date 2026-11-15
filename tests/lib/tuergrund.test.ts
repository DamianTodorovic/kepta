// @vitest-environment node
// Aufgabe #60 und #67, dritter Teil (Leitung, 22.10.): was die Tuer heute wirklich antwortet,
// und was die Uebersetzung daraus macht.
//
// Der Brief schrieb, /api/models antworte mit 500, wenn die Adresse fehlt. Das ist seit p4-t
// (gelandet in 02bec77) nicht mehr wahr: die Route antwortet 400 mit grund=kein-anbieter
// (server/router/chat.ts:203-211 am Kopf 4e49c17). Dieser Lauf misst es, statt es zu zitieren,
// und haelt dazu den Grund fest, den die Flaeche wirklich faehrt:
//   - die Einstellungen nennen immer eine Basis (`settings.baseUrl || provider.baseUrl`,
//     Settings.tsx:308 und :349), darum ist kein-anbieter von der Flaeche aus nicht erreichbar;
//   - erreichbar sind kein-schluessel (400) und anbieter-nicht-erreichbar (502), und beide
//     bekommen hier einen Satz.
//
// Die Zahn-Probe (Mutation) steht im Beleg: grundText auf null gesetzt muss diese Datei rot
// machen - ein Fall, der unter ausgeschalteter Regel gruen bleibt, ist kein Fall.
//
// Die Datei ist rein ASCII.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KeptaStore } from "../../src/core/store";
import { defaultExtensions } from "../../src/core/extensions";
import { createApp } from "../../server/app";
import { lauscht, niederlegen } from "../helfer/lauscher";
import { grundKennungen, grundText } from "../../src/lib/tuergrund";

const PORT = 8931;
const HIER = path.dirname(fileURLToPath(import.meta.url));
let URLE = `http://127.0.0.1:${PORT}`;
let wurzel = "";
let vorherHeim: string | undefined;
let vorherDaten: string | undefined;
let store: KeptaStore;
let server: import("node:http").Server;

async function post(route: string, koerper: unknown) {
  const r = await fetch(`${URLE}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(koerper),
  });
  const text = await r.text();
  let leib: Record<string, unknown> = {};
  try { leib = JSON.parse(text) as Record<string, unknown>; } catch { /* keine JSON-Antwort */ }
  return { status: r.status, leib, text };
}

/** Die Kennungen, die die Tuer wirklich schreibt - aus ihrer Quelle gelesen, nicht erfunden. */
function kennungenAusDerTuer(): string[] {
  const quelle = fs.readFileSync(path.resolve(HIER, "../../server/router/chat.ts"), "utf8");
  return [...quelle.matchAll(/grund:\s*"([^"]+)"/g)].map((m) => m[1]).sort();
}

beforeAll(async () => {
  wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-tuergrund-"));
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
  server = horcher.server;
  URLE = horcher.urle;
});

afterAll(async () => {
  if (server) await niederlegen(server);
  store?.close();
  if (vorherHeim === undefined) delete process.env.HOME;
  else process.env.HOME = vorherHeim;
  if (vorherDaten === undefined) delete process.env.KEPTA_DATA_DIR;
  else process.env.KEPTA_DATA_DIR = vorherDaten;
  fs.rmSync(wurzel, { recursive: true, force: true });
});

describe("P4-60: was die Tuer heute antwortet, gemessen am Kopf", () => {
  it("/api/models ohne Adresse: 400 mit grund, nicht 500", async () => {
    const { status, leib } = await post("/api/models", { protocol: "openai" });
    expect(status, `Antwort: ${JSON.stringify(leib)}`).toBe(400);
    expect(leib.grund).toBe("kein-anbieter");
  });

  it("/api/models mit unhoerendem Hafen: 502 mit grund anbieter-nicht-erreichbar", async () => {
    const { status, leib } = await post("/api/models", {
      protocol: "openai",
      baseUrl: "http://127.0.0.1:9/v1",
      apiKey: "",
    });
    expect(status, `Antwort: ${JSON.stringify(leib)}`).toBe(502);
    expect(leib.grund).toBe("anbieter-nicht-erreichbar");
  });

  it("/api/chat ohne Adresse: 400 mit grund, statt die Adresse zu raten", async () => {
    const { status, leib } = await post("/api/chat", {
      protocol: "openai",
      messages: [{ role: "user", content: "Test" }],
    });
    expect(status, `Antwort: ${JSON.stringify(leib)}`).toBe(400);
    expect(leib.grund).toBe("kein-anbieter");
  });

  it("/api/chat mit fremder Adresse ohne Schluessel: 400 kein-schluessel", async () => {
    const { status, leib } = await post("/api/chat", {
      protocol: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "",
      messages: [{ role: "user", content: "Test" }],
    });
    expect(status, `Antwort: ${JSON.stringify(leib)}`).toBe(400);
    expect(leib.grund).toBe("kein-schluessel");
  });
});

describe("P4-67: die Uebersetzung der Kennung in einen Menschensatz", () => {
  it("jede Kennung der Tuer hat einen Satz mit einem naechsten Schritt", () => {
    const tuer = kennungenAusDerTuer();
    expect(tuer.length, "die Tuer schreibt keine Kennung - Sonde pruefen").toBeGreaterThan(0);
    for (const kennung of tuer) {
      const satz = grundText(kennung);
      expect(satz, `kein Satz fuer ${kennung}`).toBeTruthy();
      expect(String(satz).length, `Satz fuer ${kennung} ist zu kurz`).toBeGreaterThan(40);
      expect(String(satz), `Satz fuer ${kennung} nennt keinen Weg`).toMatch(/Settings|ollama serve|logs/i);
    }
    // Die Tabelle in der Uebersetzung darf nicht hinter der Tuer zurueckbleiben.
    expect(grundKennungen().sort(), "Uebersetzungstabelle deckt nicht die Kennungen der Tuer").toEqual(
      expect.arrayContaining(tuer),
    );
  });

  it("unbekannt, leer und fehlend bleiben ohne erfundenen Satz", () => {
    expect(grundText("ganz-neu")).toBeNull();
    expect(grundText("")).toBeNull();
    expect(grundText(undefined)).toBeNull();
    expect(grundText(null)).toBeNull();
    expect(grundText(7)).toBeNull();
  });

  it("kein Satz enthaelt ein Nicht-ASCII-Zeichen", () => {
    for (const kennung of grundKennungen()) {
      const satz = String(grundText(kennung));
      for (const zeichen of satz) {
        expect(zeichen.codePointAt(0), `${kennung} tragt Codepunkt ${zeichen.codePointAt(0)}`).toBeLessThanOrEqual(127);
      }
    }
  });
});
