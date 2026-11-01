// @vitest-environment node
//
// Punkt 5, dritter Schritt (Papier `BEFUND-130-ACHSEN-SEIN-BESTAND-1110.md` §4 und §6):
// die Achse muss sich selbst pruefen koennen.
//
// Warum diese Datei existiert: nach dem Schnitt an `projects` (3.2.107, gemessen 64,6 % ->
// 18,9 % an seinem echten Bestand) bleibt `events` mit 41,1 % stehen, und seine Regel ist eine
// Datums-Formel. In einer Prosanotiz ist ein Datum ein Termin; in einer gescannten JSON-Datei
// ist ein Datum ein Feld. Die Route nannte bis hierher nur zwei Rand-Listen (Themen je Fach,
// Facher je Menge) - aus zwei Raendern laesst sich nicht ablesen, WELCHES Fach ein Thema
// fuellt. Also: eine Kreuztabelle, dieselbe Zahlung, ein Leseweg, und weiterhin kein Inhalt
// noetig.
//
// Der Biss liegt in der Trennung: dieselbe Zahl an Terminen, einmal in `notes`, einmal in
// `daten`. Eine Route, die nur ihre Rand-Liste umkopiert, kann das nicht liefern.
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

const PORT = 8972;
let URLE = `http://127.0.0.1:${PORT}`;
let wurzel = "";
let vorherHeim: string | undefined;
let vorherDaten: string | undefined;
let store: KeptaStore;
let hoerer: http.Server;

const TRAEGER = ["notes", "files", "code", "daten", "anderes"];
const THEMEN = ["people", "projects", "events", "tasks", "guides", "links"];

type Leib = {
  ok: boolean; bestand: number;
  traeger: Record<string, number>;
  themen: Record<string, number>;
  ohneThema: number;
  themenNachTraeger?: Record<string, Record<string, number>>;
  ohneThemaNachTraeger?: Record<string, number>;
};

async function gruppen(): Promise<Leib> {
  const ant = await fetch(`${URLE}/api/memories/gruppen`);
  expect(ant.ok, `die Zahl-Route antwortet nicht: ${ant.status}`).toBe(true);
  return (await ant.json()) as Leib;
}

function lege(title: string, content: string, tags: string[]) {
  store.createMemory({ title, content, tags } as never);
}

beforeAll(async () => {
  wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-gruppen-kreuz-"));
  vorherHeim = process.env.HOME;
  vorherDaten = process.env.KEPTA_DATA_DIR;
  process.env.HOME = wurzel;
  process.env.KEPTA_DATA_DIR = wurzel;
  const datenSchluessel = new Uint8Array(crypto.randomBytes(32));
  store = new KeptaStore(path.join(wurzel, "kepta.db"), {
    ...defaultExtensions(),
    keys: { ablage: "KEPTA_DB_KEY (Messlauf)", keyFor: () => datenSchluessel },
  });
  // Drei Prosatermine, drei Datendateien mit einem Datumsfeld, ein Dokument mit einem
  // Mandanten, eine Notiz ohne jedes Signal. Summe: 8 Notizen, 6 davon mit `events`.
  for (let i = 0; i < 3; i++) lege(`Gespraech ${i}`, `Wir haben 2026-05-04 darueber geredet.`, []);
  for (let i = 0; i < 3; i++)
    lege(`Schema ${i}`, `{ "tag": "2026-05-04" }`, ["machine-scan", "json"]);
  lege("Rechnung Weber", "Mandant Meier fragt nach dem Stand.", ["machine-scan", "md"]);
  lege("Kurzer Gedanke", "Vielleicht spaeter einmal anders ansehen.", []);
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

describe("Punkt 5: die Zahl-Route kreuzt Thema und Traeger", () => {
  it("liefert die Kreuztabelle und ihre eigene Rand-Liste", async () => {
    const leib = await gruppen();
    expect(leib.themenNachTraeger, "kein themenNachTraeger im Leib").toBeTruthy();
    expect(leib.ohneThemaNachTraeger, "kein ohneThemaNachTraeger im Leib").toBeTruthy();
    // Die Tabelle ist vollstaendig: jedes Fach hat jede Zeile, auch die Null.
    for (const t of TRAEGER) {
      const zeile = leib.themenNachTraeger![t];
      expect(zeile, `das Fach ${t} fehlt in der Tabelle`).toBeTruthy();
      for (const h of THEMEN) expect(zeile[h], `${t}/${h} fehlt`).toBeTypeOf("number");
    }
  });

  it("trennt dieselbe Zahl an Terminen nach ihrem Fach — der Biss", async () => {
    const leib = await gruppen();
    expect(leib.themenNachTraeger!.notes.events, "Prosatermine zaehlen nicht in notes").toBe(3);
    expect(leib.themenNachTraeger!.daten.events, "Datumsfelder zaehlen nicht in daten").toBe(3);
    expect(leib.themenNachTraeger!.files.events ?? 0, "ein Dokument ohne Datum zaehlt mit").toBe(0);
  });

  it("jede Spalte summt auf die Rand-Liste der Themen", async () => {
    const leib = await gruppen();
    for (const h of THEMEN) {
      const summe = TRAEGER.reduce((n, t) => n + (leib.themenNachTraeger![t]?.[h] ?? 0), 0);
      expect(summe, `Thema ${h}: Rand nennt ${leib.themen[h]}, Tabelle summt ${summe}`).toBe(leib.themen[h]);
    }
  });

  it("jede Zeile summt auf ihr Fach (mit dem Feld ohne Thema)", async () => {
    const leib = await gruppen();
    for (const t of TRAEGER) {
      const zeile = leib.themenNachTraeger![t] ?? {};
      const summe = THEMEN.reduce((n, h) => n + (zeile[h] ?? 0), 0) + (leib.ohneThemaNachTraeger![t] ?? 0);
      expect(summe, `Fach ${t}: Zahl nennt ${leib.traeger[t]}, Zeile summt ${summe}`).toBe(leib.traeger[t]);
    }
  });

  it("die Rand-Liste ohne Thema ist die Summe ihrer Spalte", async () => {
    const leib = await gruppen();
    const summe = TRAEGER.reduce((n, t) => n + (leib.ohneThemaNachTraeger![t] ?? 0), 0);
    expect(summe, `ohneThema: Rand nennt ${leib.ohneThema}, Spalte summt ${summe}`).toBe(leib.ohneThema);
    expect(leib.ohneThemaNachTraeger!.notes, "die eine signallose Prosanotiz fehlt").toBe(1);
  });

  it("die Bestandsumme der Tabelle ist der Bestand — nichts wird doppelt gezaehlt", async () => {
    const leib = await gruppen();
    let zellen = 0;
    for (const t of TRAEGER) {
      const zeile = leib.themenNachTraeger![t] ?? {};
      for (const h of THEMEN) zellen += zeile[h] ?? 0;
      zellen += leib.ohneThemaNachTraeger![t] ?? 0;
    }
    // Eine Notiz kann mehrere Themen tragen, darum ist die Zellensumme >= Bestand;
    // sie darf aber nie ueber Bestand + Themen je Notiz hinauslaufen.
    const themenSumme = THEMEN.reduce((n, h) => n + leib.themen[h], 0);
    expect(zellen, "Zellensumme und Rand laufen auseinander").toBe(themenSumme + leib.ohneThema);
    expect(zellen).toBeGreaterThanOrEqual(leib.bestand);
  });
});
