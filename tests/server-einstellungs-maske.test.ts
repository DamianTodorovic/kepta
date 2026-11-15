// @vitest-environment node
// Schritt 3 — die Maske in die App-Route.
//
// Der Kern maskiert GET /api/settings seit F3 (A3-09). Die App-Route gab den
// rohen Bestand heraus — auch `ai_settings` und die gespiegelte Reihe
// `ki_gehirn_ai_settings`, in beiden steht der KI-Schluessel im Klartext, wenn
// eine aeltere Version sie geschrieben hat. Diese Datei haelt beide Seiten: die
// Klappe ist zu, und der Rueckweg der App (`ai_connection`) bleibt offen.
//
// Eigener Horcher auf 127.0.0.1:8813, verschluesselte Datenbank, kein
// KEPTA_ENCRYPTION=off.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../src/core/store";
import { defaultExtensions } from "../src/core/extensions";
import { createApp } from "../server/app";
import { lauscht, niederlegen } from "./helfer/lauscher";

const PORT = 8813;
let URLE = `http://127.0.0.1:${PORT}`;

let wurzel = "";
let vorherHeim: string | undefined;
let vorherDaten: string | undefined;
let store: KeptaStore;
let hoerer: import("node:http").Server;

async function setze(aenderungen: Record<string, string | null>) {
  const r = await fetch(`${URLE}/api/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(aenderungen),
  });
  expect(r.ok).toBe(true);
  return r.json() as Promise<{ ok: boolean; keys: number }>;
}

/** Die rohe Anfrage — kein Origin, kein Kopf, kein App-Code. */
async function lese(): Promise<{ status: number; bestand: Record<string, unknown>; text: string }> {
  const r = await fetch(`${URLE}/api/settings`);
  const text = await r.text();
  return { status: r.status, bestand: JSON.parse(text) as Record<string, unknown>, text };
}

// Ein Horcher pro Datei, nicht einer pro Anfrage: der Node-Agent haelt
// Verbindungen warm, und ein geschlossener Port mit warmem Socket loest
// ECONNRESET aus — derselbe Fall, den tests/helfer/hoerer.ts erzaehlt.
beforeAll(async () => {
  wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-appmaske-"));
  // Kapsel: createApp zieht ohne KEPTA_DATA_DIR ~/.kepta des Anmeldekontos an
  // (server/app.ts:120), und os.homedir() folgt HOME. Haelt tests/testkapsel.test.ts.
  vorherHeim = process.env.HOME;
  vorherDaten = process.env.KEPTA_DATA_DIR;
  process.env.HOME = wurzel;
  process.env.KEPTA_DATA_DIR = wurzel;
  const datenSchluessel = new Uint8Array(crypto.randomBytes(32));
  store = new KeptaStore(path.join(wurzel, "kepta.db"), {
    ...defaultExtensions(),
    keys: { ablage: "KEPTA_DB_KEY (Messlauf)", keyFor: () => datenSchluessel },
  });
  // bestellter Port zuerst, Ausweichport mit Ansage (tests/helfer/lauscher.ts)
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

beforeEach(() => {
  store.setzeEinstellungen({
    anthropicApiKey: null,
    ollamaModel: null,
    ai_settings: null,
    ki_gehirn_ai_settings: null,
    ai_connection: null,
    ki_gehirn_api_key: null,
    theme: null,
  });
});

describe("Maske in der App-Route", () => {
  it("secretfoermige Namen kommen nur als Anzeige heraus", async () => {
    await setze({ anthropicApiKey: "sk-test-1234567890abcd", ollamaModel: "nomic-embed-text" });
    const { bestand, text } = await lese();
    expect(text).not.toContain("sk-test-1234567890abcd");
    expect(bestand.anthropicApiKey).toEqual({ gesetzt: true, ende: "abcd" });
    expect(bestand.ollamaModel).toBe("nomic-embed-text"); // gewoehnliche Werte bleiben lesbar
    expect(store.einstellungen().anthropicApiKey).toBe("sk-test-1234567890abcd"); // die DB bleibt der Speicher
  });

  it("der ai_settings-Blob der App ist dicht, ebenso die gespiegelte Reihe", async () => {
    const blob = JSON.stringify({ providerId: "anthropic", apiKey: "sk-ant-APP-SCHLUESSEL-9f3k2", model: "claude-sonnet-4-5" });
    await setze({ ai_settings: blob, ki_gehirn_ai_settings: blob });
    const { bestand, text } = await lese();
    expect(text, "diese beiden Reihen sind der Klartext, den A3-09 meint").not.toContain("sk-ant-APP-SCHLUESSEL-9f3k2");
    expect(bestand.ai_settings).toEqual({ gesetzt: true, ende: blob.slice(-4) });
    expect(bestand.ki_gehirn_ai_settings).toEqual({ gesetzt: true, ende: blob.slice(-4) });
  });

  it("der Rueckweg der App bleibt lesbar — ai_connection geht als Wert heraus", async () => {
    const umschlag = "v1." + crypto.randomBytes(48).toString("base64");
    await setze({ ai_connection: umschlag });
    const { bestand, text } = await lese();
    expect(bestand.ai_connection, "ohne diesen Wert findet die App ihre Verbindung nach dem Neustart nicht").toBe(umschlag);
    expect(text).toContain(umschlag);
  });

  it("loeschen funktioniert weiter", async () => {
    await setze({ ai_settings: "sk-ant-ALT-9f3k2-abcdef", ai_connection: "v1.test" });
    await setze({ ai_settings: null });
    const { bestand } = await lese();
    expect("ai_settings" in bestand).toBe(false);
    expect(bestand.ai_connection).toBe("v1.test");
  });

  it("ein zu kurzer Wert haelt kein Ende, das man zeigen koennte", async () => {
    await setze({ ki_gehirn_api_key: "kurz" });
    const { bestand } = await lese();
    expect(bestand.ki_gehirn_api_key).toEqual({ gesetzt: true, ende: null });
  });
});
