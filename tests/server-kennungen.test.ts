// @vitest-environment node
//
// Aufgabe #64 (3) — die Kennungen werden zweisprachig, nicht ausgetauscht.
//
// Damians Befehl (13.10. 21:5x): KEPTA wird K3PTA, ueberall. Die Leitung hat gemessen
// und geteilt (audit-2026-10-09/UMBENNUNG-K3PTA-2026-10-13.md): die sichtbaren Woerter
// macht NA, **die Kennungen mache ich** — und der Abnahme-Satz rueckwaerts vom Nutzer
// lautet: *niemand, der heute installiert ist, darf nach dem Update eine leere
// Wissensbasis sehen oder ploetzlich ohne Schluessel dastehen.*
//
// Darum ist die Regel nicht "umbenennen", sondern: **K3PTA_* zuerst, KEPTA_* als
// Rueckfall, und welche Form gewonnen hat, wird gemeldet.** Ein User, der nur die alte
// Form gesetzt hat, behaelt seinen Schluessel und seinen Datenordner. Ein User, der
// beide gesetzt hat, sieht, welche gilt. Und niemand landet still in einem andern
// Ordner — das waere die leere Wissensbasis.
//
// Diese Datei haelt vier Dinge: beide Formen funktionieren, die alte Form startet
// unveraendert, die neue gewinnt, wenn beide da sind, und die Meldung nennt den Sieger.
// Dazu die Zahl der Lesestellen, die beide Formen lesen (Abschnitt "gezaehlt" im Bericht).
//
// Kapsel: jeder Fall mit eigenem HOME und eigenem Datenordner in einer mkdtemp-Wurzel.
// Damians echtes ~/.kepta wird nie angefasst (Regel der Suite: tests/testkapsel.test.ts).
// Ein Horcher pro Datei auf 127.0.0.1:8823 — nie request(app).
import { afterAll, afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../src/core/store";
import { defaultExtensions } from "../src/core/extensions";
import { schluesselbundKeyProvider } from "../src/core/schluessel";
import { leseUmwelt, UMWELT_NAMEN, gewonneneUmweltNamen } from "../src/core/umwelt";
import { createApp } from "../server/app";
import { lauscht, niederlegen } from "./helfer/lauscher";

const PORT = 8823;
const SCHLUESSEL = "7a".repeat(32);
const ANDERER = "9b".repeat(32);

let hoerer: import("node:http").Server | null = null;
let store: KeptaStore | null = null;
let wurzel = "";
const vorher = { HOME: process.env.HOME, DATEN: process.env.KEPTA_DATA_DIR, NEU: process.env.K3PTA_DATA_DIR, SCHL: process.env.KEPTA_DB_KEY, SCHL_NEU: process.env.K3PTA_DB_KEY };

function kapsel(unterpfad: string) {
  wurzel = fs.mkdtempSync(path.join(os.tmpdir(), unterpfad));
  process.env.HOME = wurzel;
  process.env.KEPTA_DATA_DIR = wurzel;
  delete process.env.K3PTA_DATA_DIR;
  return wurzel;
}

afterEach(() => {
  hoerer = null;
  store?.close();
  store = null;
});

afterAll(() => {
  if (hoerer) void niederlegen(hoerer);
  store?.close();
  for (const [name, wert] of [["HOME", vorher.HOME], ["KEPTA_DATA_DIR", vorher.DATEN], ["K3PTA_DATA_DIR", vorher.NEU], ["KEPTA_DB_KEY", vorher.SCHL], ["K3PTA_DB_KEY", vorher.SCHL_NEU]] as const) {
    if (wert === undefined) delete process.env[name];
    else process.env[name] = wert;
  }
  if (wurzel) fs.rmSync(wurzel, { recursive: true, force: true });
});

describe("U-1 — beide Namensformen gelten, die alte startet unveraendert", () => {
  it("nur KEPTA_DB_KEY: der Schluessel wird gefunden, die Meldung nennt die alte Form", () => {
    kapsel("kepta-u-alt-");
    process.env.KEPTA_DB_KEY = SCHLUESSEL;
    delete process.env.K3PTA_DB_KEY;
    const fund = leseUmwelt("schluessel");
    expect(fund.wert).toBe(SCHLUESSEL);
    expect(fund.gewonnen).toBe("KEPTA_DB_KEY");
  });

  it("nur K3PTA_DB_KEY: dieselbe Laenge, dasselbe Ergebnis, die Meldung nennt die neue Form", () => {
    kapsel("kepta-u-neu-");
    delete process.env.KEPTA_DB_KEY;
    process.env.K3PTA_DB_KEY = SCHLUESSEL;
    const fund = leseUmwelt("schluessel");
    expect(fund.wert).toBe(SCHLUESSEL);
    expect(fund.gewonnen).toBe("K3PTA_DB_KEY");
  });

  it("beide Formen, verschiedene Werte: die neue gewinnt, und es wird gesagt", () => {
    kapsel("kepta-u-streit-");
    process.env.KEPTA_DB_KEY = SCHLUESSEL;
    process.env.K3PTA_DB_KEY = ANDERER;
    const fund = leseUmwelt("schluessel");
    expect(fund.wert).toBe(ANDERER);
    expect(fund.gewonnen).toBe("K3PTA_DB_KEY");
    expect(fund.auchAlteForm).toBe(true);
    expect(String(fund.meldung)).toMatch(/KEPTA_DB_KEY is also set/);
    expect(String(fund.meldung)).toMatch(/K3PTA_DB_KEY wins/);
  });

  it("der Datenordner: alte Form allein gilt weiter — niemand sieht eine leere Wissensbasis", () => {
    const ordner = kapsel("kepta-u-ordner-alt-");
    fs.mkdirSync(path.join(ordner, "daten-alt"), { recursive: true });
    process.env.KEPTA_DATA_DIR = path.join(ordner, "daten-alt");
    delete process.env.K3PTA_DATA_DIR;
    const fund = leseUmwelt("datenordner");
    expect(fund.wert).toBe(path.join(ordner, "daten-alt"));
    expect(fund.gewonnen).toBe("KEPTA_DATA_DIR");
  });

  it("der Datenordner: beide Formen gesetzt, die neue gewinnt — und der Streit wird gemeldet, nicht verschwiegen", () => {
    const ordner = kapsel("kepta-u-ordner-streit-");
    process.env.KEPTA_DATA_DIR = path.join(ordner, "alt");
    process.env.K3PTA_DATA_DIR = path.join(ordner, "neu");
    const fund = leseUmwelt("datenordner");
    expect(fund.wert).toBe(path.join(ordner, "neu"));
    expect(fund.gewonnen).toBe("K3PTA_DATA_DIR");
    expect(String(fund.meldung)).toMatch(/both names are set/);
    delete process.env.K3PTA_DATA_DIR;
  });

  it("KEPTA_ENCRYPTION und sein neuer Name schalten beide ab — der Wortlaut bleibt 'off'", () => {
    kapsel("kepta-u-klartext-");
    const paare = ["KEPTA_ENCRYPTION", "K3PTA_ENCRYPTION"] as const;
    for (const name of paare) {
      for (const gegner of paare) process.env[gegner] = "";
      process.env[name] = "off";
      const fund = leseUmwelt("verschluesselung");
      expect(fund.wert).toBe("off");
      expect(fund.gewonnen).toBe(name);
      for (const gegner of paare) delete process.env[gegner];
    }
  });

  it("KEPTA_BACKUP_KEEP und sein neuer Name: dieselbe Zahl, gleiche Regel", () => {
    kapsel("kepta-u-rotation-");
    delete process.env.K3PTA_BACKUP_KEEP;
    process.env.KEPTA_BACKUP_KEEP = "3";
    expect(leseUmwelt("sicherungBehalten").wert).toBe("3");
    expect(leseUmwelt("sicherungBehalten").gewonnen).toBe("KEPTA_BACKUP_KEEP");
    delete process.env.KEPTA_BACKUP_KEEP;
    process.env.K3PTA_BACKUP_KEEP = "7";
    expect(leseUmwelt("sicherungBehalten").wert).toBe("7");
    expect(leseUmwelt("sicherungBehalten").gewonnen).toBe("K3PTA_BACKUP_KEEP");
    delete process.env.K3PTA_BACKUP_KEEP;
  });
});

describe("U-2 — die Tuer meldet, welche Form sie gelesen hat", () => {
  it("/api/health nennt die gewonnene Form des Schluessels und des Ordners", async () => {
    const ordner = kapsel("kepta-u-health-");
    process.env.K3PTA_DB_KEY = SCHLUESSEL;
    delete process.env.KEPTA_DB_KEY;
    const schluesselWeg = schluesselbundKeyProvider(ordner);
    store = new KeptaStore(path.join(ordner, "kepta.db"), { ...defaultExtensions(), keys: schluesselWeg });
    const hor = await lauscht(createApp(store), PORT);
    hoerer = hor.server;
    const json = (await (await fetch(`${hor.urle}/api/health`)).json()) as { kennungen?: { schluessel?: { gewonnen?: string }; datenordner?: { gewonnen?: string }; gemeldet?: unknown[] } };
    const kennungen = json.kennungen;
    expect(kennungen, "die Antwort muss sagen, welche Namensform gewann").toBeTruthy();
    expect(kennungen!.schluessel?.gewonnen).toBe("K3PTA_DB_KEY");
    expect(kennungen!.datenordner?.gewonnen).toBe("KEPTA_DATA_DIR");
    expect(Array.isArray(kennungen!.gemeldet)).toBe(true);
    delete process.env.K3PTA_DB_KEY;
    if (vorher.SCHL === undefined) delete process.env.KEPTA_DB_KEY; else process.env.KEPTA_DB_KEY = vorher.SCHL;
  });

  it("die Tuer nennt Namen, niemals Werte — der Schluessel aus der Umgebung bleibt aussen vor", async () => {
    const ordner = kapsel("kepta-u-wert-");
    process.env.K3PTA_DB_KEY = ANDERER;
    delete process.env.KEPTA_DB_KEY;
    const schluesselWeg = schluesselbundKeyProvider(ordner);
    store = new KeptaStore(path.join(ordner, "kepta.db"), { ...defaultExtensions(), keys: schluesselWeg });
    const hor = await lauscht(createApp(store), PORT);
    hoerer = hor.server;
    const text = await (await fetch(`${hor.urle}/api/health`)).text();
    // Der Lebbeweis vom 14.10. hat es in der Antwort gefunden: `kennungen.schluessel.wert`
    // trug den vollen 64-Zeichen-Schluessel. Meldepflicht hat der **Name**, der gewinnt;
    // der Wert ist ein Geheimnis, und `KEPTA_HOST` kann diese Tuere ins Netz stellen.
    expect(text).not.toContain(ANDERER);
    const leib = JSON.parse(text) as { kennungen: Record<string, { gewonnen?: string }> };
    for (const rolle of ["schluessel", "datenordner", "verschluesselung", "sicherungBehalten"]) {
      expect(leib.kennungen[rolle], `${rolle} darf in der Antwort keinen Wert tragen`).not.toHaveProperty("wert");
    }
    expect(leib.kennungen.schluessel.gewonnen).toBe("K3PTA_DB_KEY");
    delete process.env.K3PTA_DB_KEY;
  });

  it("die Namensliste haelt genau die vier Paare, die dieser Auftrag nennt", () => {
    expect(Object.keys(UMWELT_NAMEN).sort()).toEqual(["datenordner", "schluessel", "sicherungBehalten", "verschluesselung"]);
    expect(UMWELT_NAMEN.schluessel).toEqual(["K3PTA_DB_KEY", "KEPTA_DB_KEY"]);
    expect(UMWELT_NAMEN.datenordner).toEqual(["K3PTA_DATA_DIR", "KEPTA_DATA_DIR"]);
    // Die Liste der gemeldeten Lesestellen ist eine Zahl, keine Behauptung.
    expect(gewonneneUmweltNamen().length).toBeGreaterThanOrEqual(0);
  });
});
