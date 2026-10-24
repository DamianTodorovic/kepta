// @vitest-environment node
//
// Zelle #98, erster Schritt (Leitung 24.10. 15:29 MESZ): die Such-Route nennt ihre Teilzeiten.
//
// Warum diese Datei existiert: Punkt 6 mass an FUENF Booten (3.2.49, 3.2.50, 3.2.53, 3.2.54, 3.2.55)
// erste beobachtete Suchen von **589,65 bis 3 523,25 ms**, und die Gesundheit nannte in derselben
// Sekunde `gesamt` zwischen **10,88 und 11,55 ms**. An zwanzig Anfragen war in keinem einzigen Kopf
// eine Zahl, die diese Strafe traegt — die Such-Route schrieb ueberhaupt keinen Teilzeit-Kopf.
// Ohne diese Zahl ist "Fassung X kostet Y" nicht entscheidbar, auch nicht mit zwei Booten.
//
// Am Kopf 8c09f0a (3.2.55) faellt diese Datei: beide Such-Wege antworten ohne `x-kepta-teilzeiten`
// und ohne `teilzeiten` im Leib.
//
// Der Gegenfall ist NICHT die Chat-Route: ein Chat-Aufruf braucht einen Anbieter und wuerde die
// Maschine verlassen (Hausregel: kein Lauf nach aussen). `/api/mcp/tools` ist eine lesende Tuer ohne
// eigenen Messpfad und darum die ehrliche Kontrolle.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { KeptaStore } from "../src/core/store";
import { defaultExtensions } from "../src/core/extensions";
import { createApp } from "../server/app";
import { lauscht, niederlegen } from "./helfer/lauscher";

const PORT = 8958;
let URLE = `http://127.0.0.1:${PORT}`;
let wurzel = "";
let vorherHeim: string | undefined;
let vorherDaten: string | undefined;
let store: KeptaStore;
let hoerer: http.Server;

/** "vorarbeit=0.12;engine=3.40;formen=0.05;gesamt=3.60" -> Objekt mit denselben Zahlen. */
function kopfZerlegen(kopf: string): Record<string, number> {
  const aus: Record<string, number> = {};
  for (const paar of kopf.split(";")) {
    const [name, wert] = paar.split("=");
    aus[name] = Number(wert);
  }
  return aus;
}

beforeAll(async () => {
  wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-teilzeiten-"));
  vorherHeim = process.env.HOME;
  vorherDaten = process.env.KEPTA_DATA_DIR;
  process.env.HOME = wurzel;
  process.env.KEPTA_DATA_DIR = wurzel;
  const datenSchluessel = new Uint8Array(crypto.randomBytes(32));
  store = new KeptaStore(path.join(wurzel, "kepta.db"), {
    ...defaultExtensions(),
    keys: { ablage: "KEPTA_DB_KEY (Messlauf)", keyFor: () => datenSchluessel },
  });
  for (let i = 0; i < 14; i++) {
    store.createMemory({
      title: `Werkstatt ${i}`,
      content: `teilzeitenprobe am Tor Nummer ${i} mit etwas Text zum Finden`,
      tags: [],
    } as never);
  }
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

describe("#98: die Such-Route nennt, was in ihr steckt", () => {
  it("GET /api/memories/search traegt den Kopf und dieselben Zahlen im Leib", async () => {
    const ant = await fetch(`${URLE}/api/memories/search?q=teilzeitenprobe&limit=5`);
    expect(ant.status).toBe(200);
    const kopf = ant.headers.get("x-kepta-teilzeiten");
    expect(kopf, "die Route schreibt keinen Teilzeit-Kopf").toBeTruthy();
    const ausDemKopf = kopfZerlegen(kopf!);
    expect(Object.keys(ausDemKopf).sort(), `unerwartete Marken: ${kopf}`).toEqual(
      ["engine", "formen", "gesamt", "vorarbeit", "wortlese", "einbettung", "vektor"].sort()
    );
    const leib = (await ant.json()) as { teilzeiten?: Record<string, number> };
    expect(leib.teilzeiten, "der Leib nennt keine Teilzeiten").toBeTruthy();
    // Leib und Kopf nennen DIESSELBEN Zahlen, nicht zwei, die eine Mikrosekunde auseinanderliegen.
    for (const [name, wert] of Object.entries(ausDemKopf)) {
      expect(leib.teilzeiten![name], `${name} weicht ab: Kopf ${wert}, Leib ${leib.teilzeiten![name]}`).toBe(wert);
    }
    expect(leib.teilzeiten!.gesamt).toBeGreaterThanOrEqual(0);
    expect(leib.teilzeiten!.engine).toBeGreaterThanOrEqual(0);
  });

  it("POST /api/search traegt denselben Kopf und zaehlt die Rueckmeldung an die Flaeche mit", async () => {
    const ant = await fetch(`${URLE}/api/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "teilzeitenprobe", topK: 5 }),
    });
    expect(ant.status).toBe(200);
    const kopf = ant.headers.get("x-kepta-teilzeiten");
    expect(kopf, "der POST-Weg schreibt keinen Teilzeit-Kopf").toBeTruthy();
    const namen = Object.keys(kopfZerlegen(kopf!));
    expect(namen.sort(), `unerwartete Marken: ${kopf}`).toEqual(
      ["engine", "formen", "gesamt", "rueckmeldung", "vorarbeit", "wortlese", "einbettung", "vektor"].sort()
    );
    const leib = (await ant.json()) as { teilzeiten?: Record<string, number>; results: unknown[] };
    expect(leib.results.length, "die Suche liefert keine Treffer, der Fall misst ins Leere").toBeGreaterThan(0);
    expect(leib.teilzeiten!.rueckmeldung, "die Rueckmeldung an die Flaeche ist nicht gemessen").toBeTypeOf("number");
  });

  it("Gegenfall: eine lesende Tuer ohne eignen Messpfad bleibt frei von dem Kopf", async () => {
    const ant = await fetch(`${URLE}/api/mcp/tools`);
    expect(ant.status).toBe(200);
    expect(ant.headers.get("x-kepta-teilzeiten"), "der Kopf waere ueberall, nicht nur an der Suche").toBeNull();
  });
});
