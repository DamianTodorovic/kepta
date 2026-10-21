// @vitest-environment node
// Aufgabe #60, zweiter Wurf — die Modell-Route nennt ihren Grund, und kein Pfad dieses
// Falls beruehrt eine echte Fernadresse.
//
// Was der erste Wurf nicht hatte (Leitung, 21.10. 06:08): die Haube war nur ueber dem
// "kein Anbieter"-Fall gestuelpt, ihr eignes Fangvermoegen war ungeprueft, und die
// Gegenprobe an der Regel fehlte. Ein Fall, der unter ausgeschalteter Regel gruen
// bleibt, ist kein Fall. Darum hier vier Faelle:
//   1  ohne Anbieter: 400 mit grund, und die Haube zeigt **keinen** einzigen Versuch
//   2  Selbstkontrolle der Haube: ein ausdruecklich bestellter Fernaufruf MUSS ihr
//      ins Netz gehen — wirft sie ihn nicht zurueck, ist Fall 1s Schweigen wertlos
//   3  ein Anbieter, der nicht antwortet: 502, grund, Adresse, cause-code
//   4  GET: 405 mit Allow, grund — statt der allgemeinen 404 des Faengers
// Fall 2 ruft api.openai.com **nicht** an: die Haube wirft, bevor ein Socket geoeffnet
// wird. Kein Pfad dieser Datei sendet ein Paket aus dem Rechner heraus.
//
// Gegengewiesen am unheilerten Stand (derselbe Fall gegen die Bytes von 65f7237, die
// die Default-Basis noch raten, server/router/chat.ts:157): **alle vier Faelle rot**.
// Protokoll und Zeit stehen im Lande-Papier, nicht hier.
//
// Gemessen an der laufenden Tuer 3.2.29, 05:35:35 MESZ (lsof: K3PTA PID 52383 auf
// 127.0.0.1:53439): GET 404 in 0,004882 s; POST {} 500 "Missing bearer authentication
// in header" in **0,313517 s**; POST localhost:1234/v1 500 "fetch failed" in 0,009874 s.
// Die 314 ms sind der Ausgang, den die Route ohne Frage waehlt. Der geriigte Text steht
// im eignen Quelltext 0-mal (grep -rn "Missing bearer" src server tests = 0) und im
// ausgelieferten asar 0-mal — er kann nur von api.openai.com kommen.
//
// Nicht gefahren? Doch: diese Datei ist in der eignen vollen Grube gefahren, gegen
// geheilerte und gegen unheilerte Tuer. Die Zahl des Registers kommt aus
// test-results/vitest.json, nie aus einem Pipe-Exit.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../src/core/store";
import { defaultExtensions } from "../src/core/extensions";
import { createApp } from "../server/app";
import { lauscht, niederlegen } from "./helfer/lauscher";

const PORT = 8919;
let URLE = `http://127.0.0.1:${PORT}`;

let wurzel = "";
let vorherHeim: string | undefined;
let vorherDaten: string | undefined;
let store: KeptaStore;
let hoerer: import("node:http").Server;

const echteFetch = globalThis.fetch;
let aussen: string[] = [];

/**
 * Die Haube: jeder Griff, der nicht an die eigne Tuer geht, wird **notiert** und
 * **abgewehrt**, bevor ein Socket geoeffnet wird. Sie ist damit gleichzeitig
 * Messzeug und Schutzwall — Fall 2 beweist, dass sie zubeisst.
 */
function haube() {
  aussen = [];
  globalThis.fetch = (async (ziel: string | URL | Request, init?: RequestInit) => {
    const text = typeof ziel === "string" ? ziel : String((ziel as { href?: string })?.href ?? ziel);
    if (!text.startsWith(URLE)) {
      aussen.push(text);
      throw new Error(`kein Netz im Test — die Route wollte ${text} ruehren`);
    }
    return echteFetch(text as string, init as RequestInit);
  }) as unknown as typeof fetch;
}
function enthuellen() {
  globalThis.fetch = echteFetch;
}

async function post(koerper: unknown): Promise<{ status: number; leib: Record<string, unknown> }> {
  const r = await fetch(`${URLE}/api/models`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(koerper),
  });
  return { status: r.status, leib: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

// Ein Horcher pro Datei, nicht einer pro Anfrage — Hausform wie
// tests/server-einstellungs-maske.test.ts:47. Kapsel: eigenes Heim, eigener Schluessel,
// nie das ~/.kepta des Anmeldekontos (createApp zieht es ohne KEPTA_DATA_DIR an).
beforeAll(async () => {
  wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-models-grund-"));
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
  enthuellen();
  if (hoerer) await niederlegen(hoerer);
  store?.close();
  if (vorherHeim === undefined) delete process.env.HOME;
  else process.env.HOME = vorherHeim;
  if (vorherDaten === undefined) delete process.env.KEPTA_DATA_DIR;
  else process.env.KEPTA_DATA_DIR = vorherDaten;
  fs.rmSync(wurzel, { recursive: true, force: true });
});

describe("P4-60: die Modell-Route nennt ihren Grund, und kein Pfad geht ins Netz", () => {
  it("ohne Anbieter: 400 mit Grund, und die Route versucht gar nichts", async () => {
    haube();
    try {
      const { status, leib } = await post({});
      // Reihenfolge mit Absicht: der Ausgang ist der schwerere Befund, darum prueft
      // die Haube zuerst. An der unheilerten Tuer ist der Fehlertext die Adresse.
      expect(aussen, "kein einziger ausgehender Versuch").toEqual([]);
      expect(status, "kein Anbieter gesetzt ist ein 4xx, kein 5xx").toBe(400);
      expect(leib.grund, "die Antwort nennt einen Grund").toBe("kein-anbieter");
      expect(typeof leib.error, "und sie laesst der Flaeche einen Satz").toBe("string");
    } finally {
      enthuellen();
    }
  });

  it("die Haube zubeisst: ein bestellter Fernaufruf wird gefangen, nicht gesendet", async () => {
    haube();
    try {
      // Ausdruecklich bestellt — dieser Aufruf ist der Gegenbeweis fuer Fall 1:
      // waere die Haube blind, koennte Fall 1 mit "kein Versuch" gruen bleiben,
      // obwohl die Tuer langst nach draussen greift.
      const { status, leib } = await post({
        protocol: "openai",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-test",
      });
      expect(aussen.length, "die Haube muss den Versuch sehen").toBe(1);
      expect(aussen[0], "und er ist die Fernadresse, die der Fall nicht verlaengs").toContain("api.openai.com");
      expect(status, "abgewehrt heisst: die Tuer antwortet mit einem Grund, nicht mit einem Socket").toBe(502);
      expect(leib.grund).toBe("anbieter-nicht-erreichbar");
    } finally {
      enthuellen();
    }
  });

  it("ein Anbieter, der nicht antwortet, nennt Adresse und Ursache", async () => {
    // Kein Netz im Spiel: 127.0.0.1:1 — eine Tuer, zu der niemand lauscht. Dasselbe
    // Bild wie localhost:1234 ohne LM Studio, nur ohne den Zufall eines echten Ports.
    const { status, leib } = await post({ protocol: "openai", baseUrl: "http://127.0.0.1:1/v1", apiKey: "" });
    expect(status, "nicht erreichbar ist 502, nicht 500").toBe(502);
    expect(leib.grund).toBe("anbieter-nicht-erreichbar");
    expect(String(leib.error), "der Satz nennt die Adresse, die niemand beantwortet").toContain("127.0.0.1:1");
    expect(String(leib.error), "fetch failed allein war der alte Zustand").not.toBe("fetch failed");
    expect(typeof leib.hinweis, "und die Ursache hat einen Namen").toBe("string");
  });

  it("ein GET sagt, warum — statt der allgemeinen 404 des Faengers", async () => {
    const r = await fetch(`${URLE}/api/models`);
    const leib = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    expect(r.status, "die Route braucht protocol, baseUrl, apiKey — also POST").toBe(405);
    expect(r.headers.get("allow"), "und sie nennt den Weg").toBe("POST");
    expect(leib.grund).toBe("nur-post");
    expect(typeof leib.error).toBe("string");
  });
});

