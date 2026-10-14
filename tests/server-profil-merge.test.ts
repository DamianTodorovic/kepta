// @vitest-environment node
//
// #52, Nachsteuerung (3) — POST /api/profile macht seit jeher einen Volltausch:
// `schreibeJsonDatei(PROFILE_FILE, safe, ...)` schreibt, was der Aufruf sendet, und
// legt die Datei damit neu an. Ein Flaeche, die nur einen Teil sendet, loescht den
// Rest — und die App sendet teilweise: src/lib/profile.ts:99 baut das Profil aus dem
// Browserspeicher (leseProfil liefert nur, was dort liegt), src/components/
// OnboardingWizard.tsx:98 sendet sein Formular. Ein Fenster, das eine neuere
// Profilform kennt, schrieb ueber die Felder einer aelteren hinweg.
//
// Vertrag jetzt: zusammengefuehrt, nicht ersetzt. Die bereits vorhandenen Felder
// bleiben; jedes gesandte Feld ueberschreibt seinen Wert; ein Feld, dessen Wert die
// Route nicht kennt (Objekt, Zahl), ruehrt nichts. Grosswachser bleibt eine Grenze —
// und die gilt dem Bestand nach dem Merge, nicht nur dem Request.
//
// Ein Horcher pro Datei auf 127.0.0.1:8818 — nie request(app).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../src/core/store";
import { defaultExtensions } from "../src/core/extensions";
import { createApp } from "../server/app";
import { lauscht, niederlegen } from "./helfer/lauscher";

const PORT = 8818;
let URLE = `http://127.0.0.1:${PORT}`;

let wurzel = "";
let vorherHeim: string | undefined;
let vorherDaten: string | undefined;
let store: KeptaStore;
let hoerer: import("node:http").Server;

interface AntwortLeib {
  ok?: boolean;
  felderGesetzt?: number;
  felderGeaendert?: number;
  felderUnveraendert?: number;
  felderImBestand?: number;
  felderUebersprungen?: string[];
  hinweis?: string;
  error?: string;
}

async function sende(profil: Record<string, unknown>) {
  const antwort = await fetch(`${URLE}/api/profile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(profil),
  });
  const text = await antwort.text();
  let korpus: AntwortLeib = {};
  try { korpus = JSON.parse(text) as AntwortLeib; } catch { /* die Antwort ist selbst das Ergebnis */ }
  return { status: antwort.status, korpus, text };
}

async function lese(): Promise<Record<string, unknown> | null> {
  const antwort = await fetch(`${URLE}/api/profile`);
  const text = await antwort.text();
  try { return JSON.parse(text) as Record<string, unknown> | null; } catch { return null; }
}

beforeAll(async () => {
  wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-profilmerge-"));
  // Die umgebung-Option ganz unten aendert den Datenordner NICHT: server/app.ts:120
  // loest ihn über `process.env.KEPTA_DATA_DIR || os.homedir()/.kepta`, und HOME ist
  // os.homedir(). Ohne die beiden Zeilen hier schreibt diese Datei in den echten
  // Datenordner des Rechners — am 13.10. dreimal passiert (19:54, 19:55, 21:14),
  // gemeldet an die Leitung, und haelt jetzt tests/testkapsel.test.ts.
  vorherHeim = process.env.HOME;
  vorherDaten = process.env.KEPTA_DATA_DIR;
  process.env.HOME = wurzel;
  process.env.KEPTA_DATA_DIR = wurzel;
  store = new KeptaStore(path.join(wurzel, "kepta.db"), defaultExtensions());
  const horcher = await lauscht(createApp(store, { umgebung: { home: wurzel, plattform: "darwin", claude: () => null } }), PORT);
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

describe("POST /api/profile führt zusammen statt zu ersetzen", () => {
  it("ein zweiter Aufruf mit nur einem Feld läss das andere stehen", async () => {
    await sende({ displayName: "Alex" });
    const nachZweit = await sende({ topics: "Notizen, Recherche" });
    expect(nachZweit.status).toBe(200);
    const bestand = await lese();
    expect(bestand?.displayName).toBe("Alex");
    expect(bestand?.topics).toBe("Notizen, Recherche");
  });

  it("das gesandte Feld gewinnt — zusammenführen ist kein Behalten des Alten", async () => {
    await sende({ displayName: "Alex" });
    await sende({ displayName: "Beat" });
    expect((await lese())?.displayName).toBe("Beat");
  });

  // E3s Formprobe am ausgelieferten Buendel (audit-2026-10-09/E3-ERSTART.md,
  // Abschnitt 11): neun Felder gesandt, **vier verbogen oder fehlend** zurueck —
  // `createdAt`/`updatedAt` (Zahlen) **verschwanden**, `topics` wurde zur
  // kleingeschriebenen Kommazeile, `detectedAIs` (Objekt-Array) zum leeren String.
  // Die Route durfte nicht still verformen, was sie nicht kennt.
  it("Zahlen bleiben Zahlen, Arrays bleiben Arrays — die Route verbiegt kein Feld", async () => {
    const r = await sende({ createdAt: 1788744287758, topics: ["Mandatsakten", "Fristen"] });
    expect(r.status).toBe(200);
    const bestand = await lese();
    expect(bestand?.createdAt).toBe(1788744287758);
    expect(typeof bestand?.createdAt).toBe("number");
    expect(bestand?.topics).toEqual(["Mandatsakten", "Fristen"]);
  });

  it("ein Feld, das die Route nicht speichern kann, wird beim Namen genannt — nicht als leerer String", async () => {
    await sende({ displayName: "Cara", topics: ["Notizen"] });
    const seltsam = await sende({ detectedAIs: [{ name: "llama3.2" }, { name: "claude" }] });
    expect(seltsam.status).toBe(200);
    expect(seltsam.korpus.felderUebersprungen).toEqual(["detectedAIs"]);
    const bestand = await lese();
    // Vorher: `detectedAIs: ""` — die Entstellung, die E3 gemessen hat.
    expect(bestand).not.toHaveProperty("detectedAIs");
    expect(bestand?.displayName).toBe("Cara");
    expect(bestand?.topics).toEqual(["Notizen"]);
  });

  it("die Antwort nennt Zahlen mit Einheit: geänderte Felder und Bestand nach dem Merge", async () => {
    const vorher = Object.keys((await lese()) ?? {}).length;
    const erste = await sende({ profilfeldErst: "eins" });
    expect(erste.korpus.ok).toBe(true);
    expect(erste.korpus.felderGeaendert).toBe(1);
    expect(erste.korpus.felderGesetzt).toBe(1);
    expect(erste.korpus.felderUnveraendert).toBe(0);
    expect(erste.korpus.felderImBestand).toBe(vorher + 1);
    expect(String(erste.korpus.hinweis)).toMatch(/1 of 1 sent field/);
    expect(String(erste.korpus.hinweis)).toMatch(/fields? stored|stored now/);
    // Zweiter Aufruf mit einem neuen und einem unveraenderten Feld: geaendert zaehlt
    // nur, was wirklich anders wurde — die Zahl ist die Antwort, nicht der Wunsch.
    const zweite = await sende({ profilfeldErst: "eins", profilfeldZweit: "zwei" });
    expect(zweite.korpus.felderGeaendert).toBe(1);
    expect(zweite.korpus.felderGesetzt).toBe(2);
    expect(zweite.korpus.felderUnveraendert).toBe(1);
    expect(zweite.korpus.felderImBestand).toBe(vorher + 2);
    expect(String(zweite.korpus.hinweis)).toMatch(/1 field already held these values/);
  });

  it("keine Zahl ohne Wort: die Antwort traegt Einheitsnamen, nicht `geaendert`/`gesamt`", async () => {
    // E3 mass am ausgelieferten Stand `{"ok":true,"geaendert":7,"gesamt":7}` und die
    // Leitung nahm ihren Vorschlag an: was hier 7 nennt, sind **Felder**. Also heissen
    // die Zahlen so, und die verworfenen Felder werden beim Namen genannt.
    const r = await sende({ einheitsprobe: "Wert" });
    expect(r.korpus.felderGesetzt).toBe(1);
    expect(typeof r.korpus.felderImBestand).toBe("number");
    expect(Array.isArray(r.korpus.felderUebersprungen)).toBe(true);
    // Die alten, wortlosen Namen sind weg — sonst raten die Flaechen weiter.
    expect(r.korpus).not.toHaveProperty("geaendert");
    expect(r.korpus).not.toHaveProperty("gesamt");
    expect(r.korpus).not.toHaveProperty("uebersprungen");
    expect(String(r.korpus.hinweis)).toMatch(/1 field set/i);
  });

  it("die Grössengrenze gilt dem Bestand nach dem Merge, nicht nur dem Request — und nichts wird geschrieben", async () => {
    // sanitizeText kürzt jedes Feld auf 2000 Zeichen — also drei Felder je Anfrage.
    const fueller = "x".repeat(2000);
    await sende({ notiz1: fueller, notiz2: fueller, notiz3: fueller });
    const davor = await lese();
    const zuviel = await sende({ notiz4: fueller, notiz5: fueller, notiz6: fueller });
    expect(zuviel.status).toBe(413);
    expect(String(zuviel.korpus?.error)).toMatch(/10/);
    expect(String(zuviel.korpus?.error)).toMatch(/nothing was written|nichts/i);
    const danach = await lese();
    expect(danach).toEqual(davor);
  });

  it("boolsche Felder bleiben boolsch, String-Arrays bleiben Arrays mit ihrer Grossschreibung", async () => {
    await sende({ dunkel: true, useCases: ["schreiben", "Planen"] });
    const bestand = await lese();
    expect(bestand?.dunkel).toBe(true);
    expect(bestand?.useCases).toEqual(["schreiben", "Planen"]);
  });
});
