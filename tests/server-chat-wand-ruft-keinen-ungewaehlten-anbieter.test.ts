// @vitest-environment node
// Aufgabe #61 — die Wand vor den Chat-Routen: kein Paket an eine Adresse, die niemand
// gewaehlt hat, und keins an einen Anbieter ausserhalb dieses Rechners ohne Schluessel.
//
// Befund am committeten Stand 02bec77 (diese Hand, 14:28:28 und 14:30:31):
//   server/helfer/upstream.ts:68 — `req.baseUrl || "https://api.openai.com/v1"`
//     (die beiden Chat-Routen holen ihre Zieladresse aus diesem Helfer: :110 blockierend,
//      :131 Stream; chat.ts:24 und :41 sind dieselbe Raten-Zeile, dort aber fuer Richtlinie
//      und Privacy-Schild — nicht fuer den Aufbruch. Meine Meldung von 08:26 nannte :24/:41
//      als Sendestelle; berichtigt: die Sendestelle ist upstream.ts:68.)
//   src/lib/ai.ts:20 und :351 — Werksstandard-Grund api.openai.com mit apiKey: ''
//   src/components/Settings.tsx:308 — gibt settings.baseUrl ODER provider.baseUrl weiter
//   tests/server.test.ts 811, 826, 836, 846, 856, 866 und tests/keine-grenzen.test.ts:76 —
//     sieben gelieferte Faelle posten OHNE baseUrl und bekommen 200, weil der Stub die
//     geratene Adresse beantwortet: die Faelle waren die Deckung des Lochs.
//
// Diese Datei haelt fuenf Dinge:
//   1  /api/chat ohne Grund: 400 mit grund, und die Wand sah KEINEN Versuch
//   2  /api/chat/stream ohne Grund: 400 mit grund (kein SSE, kein halber Socket)
//   3  Anbieter ausserhalb des Rechners ohne Schluessel: 400, kein Versuch
//   4  Zahn der Wand: ein ausdruecklich gewaehlter Fernanbieter MIT Schluessel wird
//      versucht — sonst ware "kein Versuch" in 1 bis 3 bloss ein Stub, der nichts sieht
//   5  Gegenstueck: ein lokaler Anbieter ohne Schluessel wird sehr wohl bedient —
//      die Wand putzt nicht die Funktion
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

const PORT = 8921;
let URLE = `http://127.0.0.1:${PORT}`;

let wurzel = "";
let vorherHeim: string | undefined;
let vorherDaten: string | undefined;
let store: KeptaStore;
let hoerer: http.Server;
let lokalerAnbieter: http.Server;
let lokalUrl = "";
let lokalGet = 0;

const echteFetch = globalThis.fetch;
let versuche: string[] = [];

/** Die Wand im Test: notiert jeden Griff und laesst nur die eigne Tuer durch. */
function wand() {
  versuche = [];
  globalThis.fetch = (async (ziel: string | URL, init?: RequestInit) => {
    const text = typeof ziel === "string" ? ziel : String((ziel as { href?: string })?.href ?? ziel);
    if (text.startsWith(URLE) || text.startsWith(lokalUrl)) return echteFetch(text as string, init);
    versuche.push(text);
    throw new Error(`netzoeffnung verboten — die Route wollte ${text} ruehren`);
  }) as unknown as typeof fetch;
}
function enthuellen() {
  globalThis.fetch = echteFetch;
}

async function post(route: string, koerper: unknown) {
  const r = await fetch(`${URLE}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(koerper),
  });
  const text = await r.text();
  let leib: Record<string, unknown> = {};
  try { leib = JSON.parse(text) as Record<string, unknown>; } catch { /* SSE-Text hat keinen JSON-Leib */ }
  return { status: r.status, leib, text };
}
const NACHRICHT = { role: "user", content: "Was_weissst_du" };

beforeAll(async () => {
  wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-chat-wand-"));
  vorherHeim = process.env.HOME;
  vorherDaten = process.env.KEPTA_DATA_DIR;
  process.env.HOME = wurzel;
  process.env.KEPTA_DATA_DIR = wurzel;
  const datenSchluessel = new Uint8Array(crypto.randomBytes(32));
  store = new KeptaStore(path.join(wurzel, "kepta.db"), {
    ...defaultExtensions(),
    keys: { ablage: "KEPTA_DB_KEY (Messlauf)", keyFor: () => datenSchluessel },
  });
  // Ein lokaler Anbieter mit Horcher: die Wand darf nicht den Netzgriff mitputzen
  // und dabei die Funktion mitnehmen — ohne diesen Rueckweg ist "kein Versuch" wertlos.
  lokalerAnbieter = http.createServer((_req, res) => {
    lokalGet++;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: "vom lokalen Anbieter" } }] }));
  });
  await new Promise<void>((r) => lokalerAnbieter.listen(0, "127.0.0.1", r));
  lokalUrl = `http://127.0.0.1:${(lokalerAnbieter.address() as { port: number }).port}/v1`;
  const horcher = await lauscht(createApp(store), PORT);
  hoerer = horcher.server;
  URLE = horcher.urle;
});

afterAll(async () => {
  enthuellen();
  if (hoerer) await niederlegen(hoerer);
  await new Promise<void>((r) => lokalerAnbieter.close(() => r()));
  store?.close();
  if (vorherHeim === undefined) delete process.env.HOME;
  else process.env.HOME = vorherHeim;
  if (vorherDaten === undefined) delete process.env.KEPTA_DATA_DIR;
  else process.env.KEPTA_DATA_DIR = vorherDaten;
  fs.rmSync(wurzel, { recursive: true, force: true });
});

describe("P4-61: keine Chat-Route ruft eine ungewaehlte Adresse", () => {
  it("/api/chat ohne Grund: 400 mit Auskunft, und die Wand sieht nichts", async () => {
    wand();
    try {
      const { status, leib } = await post("/api/chat", { protocol: "openai", messages: [NACHRICHT] });
      expect(versuche, "kein einziger Aufbruch").toEqual([]);
      expect(status, "ein fehlender Anbieter ist eine Auskunft, kein Aufbruch").toBe(400);
      expect(leib.grund).toBe("kein-anbieter");
      expect(typeof leib.error).toBe("string");
    } finally {
      enthuellen();
    }
  });

  it("/api/chat/stream ohne Grund: 400 mit Auskunft, nicht ein halber Stream", async () => {
    wand();
    try {
      const { status, leib, text } = await post("/api/chat/stream", { protocol: "openai", messages: [NACHRICHT] });
      expect(versuche, "kein Aufbruch im Stream").toEqual([]);
      expect(status).toBe(400);
      expect(leib.grund).toBe("kein-anbieter");
      expect(text, "die Antwort ist JSON, kein SSE-Rauschen").not.toContain("data: [DONE]");
    } finally {
      enthuellen();
    }
  });

  it("Fernanbieter ohne Schluessel: 400, und es geht kein Paket hinaus", async () => {
    wand();
    try {
      const { status, leib } = await post("/api/chat", {
        protocol: "openai",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "",
        messages: [NACHRICHT],
      });
      expect(versuche, "die Fernadresse wird nicht geruehrt").toEqual([]);
      expect(status).toBe(400);
      expect(leib.grund).toBe("kein-schluessel");
      expect(String(leib.error), "der Satz nennt die Adresse, die ohne Schluessel bleibt").toContain("api.openai.com");
    } finally {
      enthuellen();
    }
  });

  it("der Zahn der Wand: ein ausdruecklich gewaehlter Fernanbieter MIT Schluessel wird versucht", async () => {
    wand();
    try {
      const { status } = await post("/api/chat", {
        protocol: "openai",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-ausdruecklich-gewaehlt",
        messages: [NACHRICHT],
      });
      expect(versuche.length, "hier muss die Wand einen Griff sehen — sonst heisst 'kein Versuch' nur: nichts gemerkt").toBe(1);
      expect(versuche[0]).toContain("api.openai.com");
      expect(status, "abgewehrt durch die Wand des Tests, nicht durch die Route").toBe(500);
    } finally {
      enthuellen();
    }
  });

  it("Gegenstueck: ein lokaler Anbieter ohne Schluessel wird bedient", async () => {
    const vorher = lokalGet;
    const { status, leib } = await post("/api/chat", {
      protocol: "openai",
      baseUrl: lokalUrl,
      apiKey: "",
      messages: [NACHRICHT],
    });
    expect(status).toBe(200);
    expect(leib.text, "die Wand sperrt den Rechner nicht aus").toBe("vom lokalen Anbieter");
    expect(lokalGet, "der lokale Horcher zaehlt den Griff").toBe(vorher + 1);
  });
});
