import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "node:http";
import crypto from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";
import { schluesselbundKeyProvider } from "../src/core/schluessel";
import { portErzwingen, portFuerDatei } from "./helfer/port-vergabe";

// Der Rueckweg der Desktop-App ist ein lesbarer Name. Seit F13 legt die App ihre
// KI-Verbindung unter `ai_connection` ab (kepta-app/src/lib/ai.ts) und den
// Schluessel darin nur als Umschlag — `ai_settings` dagegen steht auf der Liste
// der Maskierten und ist von dort nicht mehr zu holen. Was dieser Waechter
// festhaelt, ist beides: der Name bleibt lesbar, und die Maske bleibt zu.
process.env.KEPTA_NO_AUTOSTART = "1";

// Kein geschriebener Port mehr, sondern der aus dem Dateinamen: dieselbe Datei,
// dieselbe Zahl, in jedem Lauf (`tests/helfer/port-vergabe.ts`).
const PORT = portFuerDatei("tests/server-einstellungs-maske.test.ts");
let URLE = `http://127.0.0.1:${PORT}`;

// So sieht der Umschlag der App aus: Kennung, IV, Chiffretext, Tag — Base64.
const UMSCHLAG = "v1." + crypto.randomBytes(48).toString("base64");

let dir = "";
let vorher: Record<string, string | undefined>;
let store: KeptaStore;
let hoerer: http.Server;

async function anfrage(pfad: string, init?: RequestInit): Promise<{ status: number; leib: Record<string, unknown>; text: string }> {
  const r = await fetch(`${URLE}${pfad}`, init);
  const text = await r.text();
  return { status: r.status, leib: JSON.parse(text) as Record<string, unknown>, text };
}

const setze = (aenderungen: Record<string, string | null>) =>
  anfrage("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(aenderungen),
  });

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-maske-"));
  vorher = {
    HOME: process.env.HOME,
    KEPTA_DATA_DIR: process.env.KEPTA_DATA_DIR,
    KEPTA_DB_KEY: process.env.KEPTA_DB_KEY,
  };
  process.env.HOME = dir;
  process.env.KEPTA_DATA_DIR = dir;
  // Verschluesselung laeuft mit — ein Umschlag, der nur in einer Klartextdatei
  // liegt, ist nichts wert. Der Schluessel kommt aus der Umgebung, der
  // Schluesselbund dieses Rechners wird nie beruehrt.
  process.env.KEPTA_DB_KEY = crypto.randomBytes(32).toString("hex");

  const erweitern = (await import("../src/core/extensions")).defaultExtensions();
  store = new KeptaStore(path.join(dir, "test.db"), {
    ...erweitern,
    keys: schluesselbundKeyProvider(dir),
  });
  expect(store.verschluesselung.aktiv).toBe(true);

  const { createApp } = await import("../server");
  // Ein Horcher pro Datei: der Node-Agent haelt Verbindungen warm, und ein
  // geschlossener Port mit warmem Socket loest ECONNRESET aus.
  hoerer = http.createServer(createApp(store));
  // Der Zahl-Vertrag dieser Suite: diese Datei horcht auf IHREM Port, nicht auf
  // dem erstbesten freien. Zwei Laeufe desselben Baums auf derselben Datei
  // scheitern hoerbar — ein stiller Ausweichport (wie hier frueher `listen(0)`)
  // macht einen Fehlerbericht zu einer Frage des Zeitpunkts, und eine Zahl, die
  // von einem Lauf zum naechsten wandert, ist in diesem Haus keine Zahl.
  try {
    await portErzwingen(PORT, "tests/server-einstellungs-maske.test.ts");
  } catch (e) {
    throw new Error(`${(e as Error).message} — ein zweiter Lauf desselben Baums laeuft; nicht zwei Suiten auf einem Baum.`);
  }
  await new Promise<void>((los, fehler) => {
    hoerer.once("error", fehler);
    hoerer.listen(PORT, "127.0.0.1", () => los());
  });
  URLE = `http://127.0.0.1:${PORT}`;
});

beforeEach(async () => {
  await store.setzeEinstellungen({ ai_settings: null, ai_connection: null, anthropicApiKey: null });
});

afterAll(async () => {
  await new Promise<void>((los) => hoerer?.close(() => los()));
  store?.close();
  for (const [name, wert] of Object.entries(vorher)) {
    if (wert === undefined) delete process.env[name];
    else process.env[name] = wert;
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("Waechter: die Einstellungs-Maske laesst den Rueckweg der App offen", () => {
  it("ein Umschlag unter ai_connection kommt unversehrt heraus — sonst ist das KI-Feld der App nach jedem Neustart leer", async () => {
    expect((await setze({ ai_connection: UMSCHLAG })).status).toBe(200);
    const res = await anfrage("/api/settings");
    expect(res.leib.ai_connection, "ai_connection ist der Rueckweg, ueber den die Desktop-App ihren KI-Schluessel nach einem Neustart wieder aufmacht; hinter der Maske waere das Feld still leer").toBe(UMSCHLAG);
    expect(res.text).toContain(UMSCHLAG);
    expect(store.einstellungen().ai_connection).toBe(UMSCHLAG);
  });

  it("der Waechter gilt nicht, wenn die Maske dafuer geoeffnet wird: ai_settings und api_key-Namen bleiben zu", async () => {
    const blob = JSON.stringify({ providerId: "anthropic", apiKey: "sk-ant-APP-SCHLUESSEL-9f3k2", model: "claude-sonnet-4-5" });
    await setze({ ai_settings: blob, anthropicApiKey: "sk-test-1234567890abcd" });
    const res = await anfrage("/api/settings");
    expect(res.text, "der ai_settings-Blob ist die Klartext-Tuer von A3-09; offen ihm alles andere gleichgueltig").not.toContain("sk-ant-APP-SCHLUESSEL-9f3k2");
    expect(res.leib.ai_settings, "von einem secretfoermigen Wert darf die Antwort nur das Ende nennen").toEqual({ gesetzt: true, ende: blob.slice(-4) });
    expect(res.leib.anthropicApiKey).toEqual({ gesetzt: true, ende: "abcd" });
  });

  it("loeschen geht durch die Maske hindurch — die App tilgt ihren alten Klartext-Blob damit", async () => {
    await setze({ ai_settings: "sk-ant-ALT-9f3k2-abcdef", ai_connection: UMSCHLAG });
    expect((await setze({ ai_settings: null })).status).toBe(200);
    const res = await anfrage("/api/settings");
    expect("ai_settings" in res.leib, "bleibt der geloeschte Name als Anzeige stehen, haelt die App eine Leiche").toBe(false);
    expect(res.leib.ai_connection).toBe(UMSCHLAG);
    expect(store.einstellungen().ai_settings).toBeUndefined();
  });

  it("zwei Schreibsaetze hintereinander: der letzte steht, der Rueckweg bleibt lesbar", async () => {
    await setze({ ai_connection: UMSCHLAG });
    const zweiter = "v1." + crypto.randomBytes(48).toString("base64");
    await setze({ ai_connection: zweiter });
    const res = await anfrage("/api/settings");
    expect(res.leib.ai_connection).toBe(zweiter);
    expect(res.text).not.toContain(UMSCHLAG);
  });
});
