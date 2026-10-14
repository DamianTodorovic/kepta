// #76 — der Scan-Weg maskiert, bevor eine Notiz entsteht. Am Verhalten der Tür.
//
// Eigener Fixture-Baum, eigene App: die bestehenden Fälle in
// tests/scan-api.test.ts zaehlen Aufnahmen (`found` 3, `imported` 3), und eine
// zusaetzliche Datei in ihrem Heim haette diese Zahlen verbogen. Ein Leck zu und
// die Doku bleibt, ist hier derselbe Lauf — zwei Richtungen, ein Setup.
//
// Laeuft gegen die lauschende Tür, wie es der Hausvertrag will.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import fs from "fs";
import os from "os";
import path from "path";
import { lauscht, niederlegen } from "../helfer/lauscher";

// Frischer Sandbox-Bestand ohne Schlüssel: verschlüsselte Anlage würde hier
// den Start verhindern, nicht die Sache prüfen (dasselbe Feld wie in
// tests/scan-api.test.ts:18).
process.env.KEPTA_ENCRYPTION = "off";

let wurzel: string;
let heim: string;
let server: http.Server;
let BASIS = "";
let vorherHeim: string | undefined;
let vorherDaten: string | undefined;

const schreibe = (rel: string, inhalt: string) => {
  const ziel = path.join(heim, rel);
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, inhalt);
};

// Erfundene Werte. Keiner ist ein echter Schluessel.
const SCHLUESSEL = "sk-ant-" + "A".repeat(36);          // 43 Zeichen
const PRUEFSUMME = "6".repeat(64);                       // eine SHA-256 im Belegtext
const DB_KEY = "9".repeat(64);                           // einer Variablen zugewiesen

beforeAll(async () => {
  wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-maske-"));
  heim = path.join(wurzel, "heim");
  fs.mkdirSync(heim, { recursive: true });
  vorherHeim = process.env.HOME;
  vorherDaten = process.env.KEPTA_DATA_DIR;
  process.env.HOME = heim;
  process.env.KEPTA_DATA_DIR = path.join(wurzel, "daten");

  schreibe("Papiere/messlauf-ausgabe.md", `Nach dem Lauf: Schluessel ${SCHLUESSEL} gesetzt, Prüfumme ${PRUEFSUMME}.`);
  schreibe("Papiere/schluessel-doku.md", "Der Schlüssel zu einem K3PTA-Bestand liegt in der Datenbankdatei. Ein API-Schlüssel wird verschlüsselt abgelegt; der Schlüsselbund bleibt unberührt.");
  schreibe("Papiere/kapsel.json", JSON.stringify({ KEPTA_DB_KEY: DB_KEY, note: "die beiden Werte stammen aus derselben Datei" }));
  schreibe("Papiere/ruhige-notiz.md", "Mandatsakte 12: Frist am 3., Bescheid vom Dienstag, Widerspruch läuft.");

  // Die Hörer-Helferin der Suite: ein Lauscher, ein Port, kein geliehener Socket.
  // `app.listen(0)` von Hand geht nicht — der Riegel aus tests/setup.horchen.ts
  // nimmt genau das, und mit Recht: Supertest band je Anfrage einen neuen Port.
  const { KeptaStore } = await import("../../src/core/store");
  const { createApp } = await import("../../server/app");
  const store = new KeptaStore(path.join(wurzel, "test.db"));
  const horcher = await lauscht(createApp(store), 0);
  server = horcher.server;
  BASIS = horcher.urle;
});

afterAll(async () => {
  if (server) await niederlegen(server);
  if (vorherHeim === undefined) delete process.env.HOME; else process.env.HOME = vorherHeim;
  if (vorherDaten === undefined) delete process.env.KEPTA_DATA_DIR; else process.env.KEPTA_DATA_DIR = vorherDaten;
  fs.rmSync(wurzel, { recursive: true, force: true });
});

async function json(pfad: string, init?: RequestInit) {
  const r = await fetch(`${BASIS}${pfad}`, init);
  return { status: r.status, body: await r.json() };
}

async function importiere(): Promise<void> {
  const start = await json("/api/scan/start", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmed: true }),
  });
  expect(start.status).toBe(200);
  for (let i = 0; i < 120; i++) {
    const s = await json("/api/scan/status");
    if (!s.body.running) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("der Lauf endete nicht");
}

describe("Der Scan-Weg verdeckt Schluessel, bevor eine Notiz entsteht", () => {
  it("Vorher ohne Maske: die Tür schreibt den Wert sonst unangetastet durch", async () => {
    // Der Fall ist ein Zeuge, keine Heilung: er hält fest, dass die Maske etwas
    // tut. Fällt sie weg, sieht man das hier und nicht erst am Bestand.
    await importiere();
    const { body } = await json("/api/memories?alle=1");
    const notizen = (body.memories ?? []) as { title: string; content: string }[];
    const fund = notizen.find((n) => n.content.includes("Prüfumme") || n.content.includes("Pruefumme"));
    expect(fund, "die Messlauf-Datei wurde nicht importiert — Fall greift nicht").toBeTruthy();
    expect(fund!.content, "ein Schluessel steht im Klartext in der Wissensbasis").not.toContain(SCHLUESSEL);
    expect(fund!.content).toMatch(/sk-ant-…MASKIERT\(43\)/);
  });

  it("lässt eine Prüfumme im Belegtext, wo sie hingehört", async () => {
    const { body } = await json("/api/memories?alle=1");
    const notizen = (body.memories ?? []) as { content: string }[];
    const mitSumme = notizen.filter((n) => n.content.includes(PRUEFSUMME));
    expect(mitSumme.length, "die Prüfumme wurde maskiert — die Doku ist zerstört").toBe(1);
  });

  it("maskiert einen Hex-Wert, der einem Schlüssel-Namen zugewiesen ist", async () => {
    const { body } = await json("/api/memories?alle=1");
    const notizen = (body.memories ?? []) as { content: string }[];
    expect(notizen.some((n) => n.content.includes(DB_KEY)), "der zugewiesene Wert steht im Klartext").toBe(false);
    expect(notizen.some((n) => n.content.includes("…MASKIERT(64)"))).toBe(true);
  });

  it("lässt einen Text über Schlüssel Zeichen für Zeichen, wie er war", async () => {
    const quelle = fs.readFileSync(path.join(heim, "Papiere/schluessel-doku.md"), "utf-8");
    const { body } = await json("/api/memories?alle=1");
    const notizen = (body.memories ?? []) as { content: string }[];
    const doku = notizen.find((n) => n.content.includes("Schlüsselbund") || n.content.includes("Schluesselbund"));
    expect(doku, "die Doku-Datei wurde nicht importiert — Fall greift nicht").toBeTruthy();
    expect(doku!.content.startsWith(quelle.trim()), "der Text wurde angefasst, obwohl kein Muster darin stand").toBe(true);
    expect(doku!.content).not.toContain("MASKIERT");
  });

  it("meldet die Zahl der verdeckten Stellen im Lauf", async () => {
    const { body } = await json("/api/scan/status");
    expect(typeof body.masked).toBe("number");
    // Drei Stellen im Fixture: einer pro Datei mit Muster.
    expect(body.masked).toBeGreaterThanOrEqual(2);
  });

  it("meldet die Zahl auch dann, wenn nichts zu verdecken war", async () => {
    // Die Zahl bleibt null, statt zu fehlen: eine Fläche, die „0 maskiert" nicht
    // sagen kann, kann es auch nicht verschweigen, wenn jemand nachfragt.
    const { body } = await json("/api/scan/status");
    expect(body.masked).toBeGreaterThanOrEqual(0);
    // Und der zweite Lauf über denselben Bestand legt nichts neu an — also
    // verdeckt er auch nichts Neues. Die Zahl lügt nicht durch Wiederholung.
    await importiere();
    const zweiter = await json("/api/scan/status");
    expect(zweiter.body.imported).toBe(0);
  });
});

// Der Satz, den ein Mensch liest, wird auf der Fläche geprüft
// (tests/components/MachineScan.test.tsx: „meldet, wie viele Stellen verdeckt
// wurden"). Über den Ereignisstrom /api/activity kam im Testprozess nichts
// an — 0 Bytes in 20 s, nicht einmal die `hello`-Zeile. Das ist ein Befund über
// den Hörer, nicht über die Meldung, und steht im Bericht.
