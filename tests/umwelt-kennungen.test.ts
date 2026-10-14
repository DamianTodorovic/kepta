/**
 * Die Umwelt-Kennungen zweisprachig (#64, Leitung 14.10.: „Kern zweisprachig machen —
 * dieselbe Regel, dieselbe Meldung, Test in beide Richtungen und der Nachweis, dass ein
 * Bestand ohne jede Variable unveraendert startet").
 *
 * Was diese Datei haelt, ist die **Abnahme rueckwaerts vom Nutzer**: niemand, der heute
 * installiert ist, darf nach dem Update eine leere Wissensbasis sehen oder ploetzlich ohne
 * Schluessel dastehen. Uebersetzt in vier Saetze, die hier jeweils ein Fall sind:
 *
 *   1. Wer nur die **alte** Form gesetzt hat, bekommt genau den Wert, den er gesetzt hat.
 *   2. Wer nur die **neue** Form setzt, bekommt sie.
 *   3. Wer **beide** setzt, sieht im `hinweis`/in `meldung`, welche gewinnt — der Streit
 *      wird nicht verschwiegen (dasselbe Hausrecht wie bei `KEPTA_BACKUP_KEEP`, wo eine
 *      still ignorierte Zahl der Fehler war).
 *   4. Wer **keine** Variable setzt, startet unveraendert: Datenordner `~/.kepta`,
 *      Schluessel aus dem Bund, Verschluesselung an.
 *
 * Dazu die zwei Stellen, an denen ein einseitiges Lesen wirklich Schaden anrichten würde:
 * `legacyJsonPaths()` (wandert mit der neuen Form allein in einen anderen Ordner und saugt
 * sonst die Altnotizen ein) und `defaultDataDir()` (der Ordner ist die Wissensbasis).
 *
 * Umwelt hygiene: jeder Fall nimmt seine Variablen zurueck (`tests/umwelt-vertrag.test.ts`
 * sieht den Zurueckbau und maelt ihn sonst als Lockerung, die die_naechste Datei erbt).
 * Ein Horcher pro Datei, auf 127.0.0.1, aus dem Vergabefenster — kein supertest gegen die App-Funktion â die Klasse steht in tests/helfer/hoerer.ts.
 */
import { afterEach, beforeAll, afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore, defaultDataDir } from "../src/core/store";
import { legacyJsonPaths } from "../src/core/migrate";
import { holeOderErzeugeSchluessel } from "../src/core/schluessel";
import { leseUmwelt, UMWELT_NAMEN, gewonneneUmweltNamen, vergissUmweltNamen } from "../src/core/umwelt";
import { hoererDerDatei, type DateiHoerer } from "./helfer/hoerer";

process.env.KEPTA_NO_AUTOSTART = "1";

const NAMEN = ["KEPTA_DB_KEY", "K3PTA_DB_KEY", "KEPTA_DATA_DIR", "K3PTA_DATA_DIR", "KEPTA_ENCRYPTION", "K3PTA_ENCRYPTION", "KEPTA_BACKUP_KEEP", "K3PTA_BACKUP_KEEP"] as const;
const SCHLUESSEL_ALT = "7a".repeat(32);
const SCHLUESSEL_NEU = "9b".repeat(32);

// Die Umwelt-Wache (`tests/umwelt-vertrag.test.ts`) sieht einen Zurueckbau nur, wenn sie
// die Vorgabe an einer benannten Schnappschuss-Variablen erkennt — also heisst sie hier
// `vorgemerkt` und der Zurueckbau laeuft ueber sie, nicht ueber eine anonyme Schleife.
const vorgemerkt: Record<string, string | undefined> = {};
for (const name of NAMEN) vorgemerkt[name] = process.env[name];

let dir = "";
let store: KeptaStore;
let app: import("express").Express;
let hoerer: DateiHoerer;
let createApp: (s: KeptaStore) => import("express").Express;

function setze(paar: Partial<Record<string, string | undefined>>): void {
  for (const name of NAMEN) delete process.env[name];
  for (const [name, wert] of Object.entries(paar)) {
    if (wert !== undefined) process.env[name] = wert;
  }
}

/** Jede Datei nimmt zurueck, was sie gelockert hat — die Wache prueft genau das. */
function umweltZurueck(): void {
  for (const [name, wert] of Object.entries(vorgemerkt)) {
    if (wert === undefined) delete process.env[name];
    else process.env[name] = wert;
  }
}

beforeAll(async () => {
  hoerer = await hoererDerDatei("tests/umwelt-kennungen.test.ts");
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-umwelt-"));
  process.env.KEPTA_DATA_DIR = dir;
  const modul = await import("../server");
  createApp = modul.createApp;
  store = new KeptaStore(path.join(dir, "kepta.db"));
  app = createApp(store);
  hoerer.gebeApp(app);
});

afterEach(() => {
  // Der Zurueckbau ist kein Schmuck: ohne ihn erbt die naechste Datei in diesem Fork
  // eine Umwelt, die dieser Fall gelockert hat.
  umweltZurueck();
  vergissUmweltNamen();
});

afterAll(async () => {
  umweltZurueck();
  store?.close();
  await hoerer?.schliesse();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

describe("U-1 — der Leser kennt beide Formen und meldet die, die gewinnt", () => {
  it("die vier Paare sind die vier Rollen, neue Form zuerst", () => {
    expect(UMWELT_NAMEN.schluessel).toEqual(["K3PTA_DB_KEY", "KEPTA_DB_KEY"]);
    expect(UMWELT_NAMEN.datenordner).toEqual(["K3PTA_DATA_DIR", "KEPTA_DATA_DIR"]);
    expect(UMWELT_NAMEN.sicherungBehalten).toEqual(["K3PTA_BACKUP_KEEP", "KEPTA_BACKUP_KEEP"]);
    expect(UMWELT_NAMEN.verschluesselung).toEqual(["K3PTA_ENCRYPTION", "KEPTA_ENCRYPTION"]);
  });

  it("nur die alte Form: ihr Wert gilt, und er heisst beim alten Namen", () => {
    const fund = leseUmwelt("schluessel", { KEPTA_DB_KEY: SCHLUESSEL_ALT });
    expect(fund.wert).toBe(SCHLUESSEL_ALT);
    expect(fund.gewonnen).toBe("KEPTA_DB_KEY");
    expect(fund.auchAlteForm).toBe(false);
    expect(fund.meldung).toBeUndefined();
  });

  it("nur die neue Form: dasselbe Ergebnis, der neue Name gewinnt", () => {
    const fund = leseUmwelt("schluessel", { K3PTA_DB_KEY: SCHLUESSEL_NEU });
    expect(fund.wert).toBe(SCHLUESSEL_NEU);
    expect(fund.gewonnen).toBe("K3PTA_DB_KEY");
  });

  it("beide Formen, verschiedene Werte: die neue gewinnt und der Streit wird gesagt", () => {
    const fund = leseUmwelt("schluessel", { K3PTA_DB_KEY: SCHLUESSEL_NEU, KEPTA_DB_KEY: SCHLUESSEL_ALT });
    expect(fund.wert).toBe(SCHLUESSEL_NEU);
    expect(fund.auchAlteForm).toBe(true);
    expect(String(fund.meldung)).toMatch(/K3PTA_DB_KEY wins/);
    expect(String(fund.meldung)).toMatch(/KEPTA_DB_KEY is also set and ignored/);
    expect(gewonneneUmweltNamen().map((f) => f.rolle)).toContain("schluessel");
  });

  it("keine Form gesetzt: kein Wert, kein Sieger — die Produkteschwelle gilt unveraendert", () => {
    const fund = leseUmwelt("datenordner", {});
    expect(fund.wert).toBeUndefined();
    expect(fund.gewonnen).toBeUndefined();
    expect(gewonneneUmweltNamen()).toEqual([]);
  });

  it("ein weisser Wert ist nicht gesetzt — `K3PTA_DATA_DIR=\"\"` faellt auf die alte Form zurueck", () => {
    const fund = leseUmwelt("datenordner", { K3PTA_DATA_DIR: "   ", KEPTA_DATA_DIR: "/daten/alt" });
    expect(fund.wert).toBe("/daten/alt");
    expect(fund.gewonnen).toBe("KEPTA_DATA_DIR");
  });
});

describe("U-2 — der Ordner: ohne Variable unveraendert, mit einer Form klar", () => {
  it("ohne jede Form bleibt ~/.kepta der Datenordner — ein Bestand startet, wo er war", () => {
    setze({});
    delete process.env.KEPTA_DATA_DIR;
    delete process.env.K3PTA_DATA_DIR;
    expect(defaultDataDir()).toBe(path.join(os.homedir(), ".kepta"));
    expect(legacyJsonPaths()).toEqual([path.join(os.homedir(), ".kepta", "memories.json"), path.join(os.homedir(), ".ki-gehirn", "memories.json")]);
  });

  it("die alte Form allein gilt weiter — auch in der Wanderungs-Pfade-Liste", () => {
    setze({ KEPTA_DATA_DIR: "/daten/alt" });
    expect(defaultDataDir()).toBe("/daten/alt");
    expect(legacyJsonPaths()).toEqual(["/daten/alt/memories.json"]);
  });

  it("die neue Form allein gilt ebenso, und die Wanderung folgt ihr — nicht dem Home", () => {
    setze({ K3PTA_DATA_DIR: "/daten/neu" });
    expect(defaultDataDir()).toBe("/daten/neu");
    // Der gefaehrlichste Fall der Umbenennung: eine einseitige Lesestelle hier haette
    // die Altnotizen aus ~/.kepta in die neue Datenbank gesogen.
    expect(legacyJsonPaths()).toEqual(["/daten/neu/memories.json"]);
  });

  it("beide Formen gesetzt: die neue gewinnt, und der Ordner-Streit bleibt nicht unsichtbar", () => {
    setze({ K3PTA_DATA_DIR: "/daten/neu", KEPTA_DATA_DIR: "/daten/alt" });
    expect(defaultDataDir()).toBe("/daten/neu");
    expect(leseUmwelt("datenordner").meldung).toMatch(/both names are set/);
  });
});

describe("U-3 — der Schluessel: niemand steht ohne ihn da", () => {
  it("ein Schluessel, der nur unter KEPTA_DB_KEY steht, wird gefunden (alter Bestand, gleicher Schluessel)", () => {
    const puff = holeOderErzeugeSchluessel(null, { KEPTA_DB_KEY: SCHLUESSEL_ALT }, () => Buffer.alloc(32), () => {});
    expect(puff.toString("hex")).toBe(SCHLUESSEL_ALT);
  });

  it("unter K3PTA_DB_KEY derselbe Weg, und bei beiden Formen gewinnt der neue Wert", () => {
    expect(holeOderErzeugeSchluessel(null, { K3PTA_DB_KEY: SCHLUESSEL_NEU }, () => Buffer.alloc(32), () => {}).toString("hex")).toBe(SCHLUESSEL_NEU);
    const streit = holeOderErzeugeSchluessel(null, { K3PTA_DB_KEY: SCHLUESSEL_NEU, KEPTA_DB_KEY: SCHLUESSEL_ALT }, () => Buffer.alloc(32), () => {});
    expect(streit.toString("hex")).toBe(SCHLUESSEL_NEU);
  });

  it("eine Tippfehler-Zahl in der neuen Form wird unter ihrem eigenen Namen gemeldet", () => {
    let meldung = "";
    try {
      holeOderErzeugeSchluessel(null, { K3PTA_DB_KEY: "abc123" }, () => Buffer.alloc(32), () => {});
    } catch (e) {
      meldung = String((e as Error).message);
    }
    expect(meldung).toMatch(/K3PTA_DB_KEY must be 64 hexadecimal/);
    expect(meldung).toMatch(/got 6, need 64/);
  });
});

describe("U-4 — die Tuer meldet, welche Form laeuft", () => {
  it("/api/health nennt Sieger und Streitfall", async () => {
    setze({ K3PTA_DB_KEY: SCHLUESSEL_NEU, KEPTA_DB_KEY: SCHLUESSEL_ALT, KEPTA_DATA_DIR: dir });
    const antwort = await fetch(`${hoerer.url}/api/health`);
    expect(antwort.status, "der Horcher antwortet nicht — gegen die App-Funktion gemessen waere das eine Blindheit").toBe(200);
    const leib = await antwort.json();
    expect(leib.kennungen.schluessel.gewonnen).toBe("K3PTA_DB_KEY");
    expect(leib.kennungen.datenordner.gewonnen).toBe("KEPTA_DATA_DIR");
    expect(String(leib.kennungen.schluessel.meldung)).toMatch(/both names are set/);
    expect(leib.kennungen.gemeldet.map((f: { rolle: string }) => f.rolle)).toContain("schluessel");
  });

  it("die Tuer nennt Namen, niemals Werte — der Schluessel aus der Umgebung ist ein Geheimnis", async () => {
    // Der Lebbeweis von 14.10. hat es erwischt: `/api/health` gab `kennungen.schluessel.wert`
    // mit dem vollen 64-Zeichen-Schluessel zurueck. Die Tuere ist an 127.0.0.1 gebunden,
    // aber `KEPTA_HOST` zieht sie aufs Netz, und `ablage` nennt laengst nur die Herkunft.
    // Was die Meldeflicht verlangt, ist der **Name**, der gewinnt — sein Wert geht niemanden
    // etwas an, der die Tuer liest.
    setze({ K3PTA_DB_KEY: SCHLUESSEL_NEU, KEPTA_DATA_DIR: dir });
    const antwort = await fetch(`${hoerer.url}/api/health`);
    const text = await antwort.text();
    expect(text).not.toContain(SCHLUESSEL_NEU);
    for (const rolle of ["schluessel", "datenordner", "verschluesselung", "sicherungBehalten"]) {
      expect(JSON.parse(text).kennungen[rolle]).not.toHaveProperty("wert");
    }
    expect(JSON.parse(text).kennungen.schluessel.gewonnen).toBe("K3PTA_DB_KEY");
  });

  it("ohne Streit: `gemeldet` ist leer, die Sieger stehen trotzdem da", async () => {
    setze({ K3PTA_DB_KEY: SCHLUESSEL_NEU, KEPTA_DATA_DIR: dir });
    const leib = await (await fetch(`${hoerer.url}/api/health`)).json();
    expect(leib.kennungen.schluessel.gewonnen).toBe("K3PTA_DB_KEY");
    expect(leib.kennungen.schluessel.meldung).toBeUndefined();
    expect(leib.kennungen.gemeldet).toEqual([]);
  });
});
