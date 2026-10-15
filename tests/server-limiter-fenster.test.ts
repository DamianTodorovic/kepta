// @vitest-environment node
//
// #89 — Der eigene Begrenzer darf die eigene Oberfläche nicht ausbremsen.
//
// Gefunden 15.10. 04:2x von der Leitung, nicht am Quelltext, sondern im Fenster:
// die Fenster-Strasse lud zwolf Seitenladungen kurz hintereinander, und bei 820 px
// stand im Browser der nackte JSON-Leib
//   {"error":"Too many requests — please wait a moment."}
// statt des Graphen (Beleg: audit-2026-10-09/leitung-bilder/graph-820x1180.png).
// Ursache: server/app.ts setzt limiter.global VOR allen Routen, also auch auf das
// Dokument und die statischen Gueter, waehrend die Flaeche im Normalbetrieb selbst
// pollt (Dashboard.tsx:653 alle 4 s, :428 alle 12 s). Ein Nutzer kann an der eigenen
// Oberflaeche ein Kontingent verbrauchen — im Electron-Fenster ist das ein Schirm mit
// einem englischen Fehlerwort.
//
// Die zwei Richtungen, die diese Datei haelt: das Fenster geht durch, die Tuer nicht.
// (Ein Fall, der nur die eine Richtung prueft, ist halber Beweis — er wird gruen,
// wenn jemand den Begrenzer ganz loescht.)
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";
import { createApp } from "../server/app";
import { DATEN_KANTE } from "../server/helfer/limiter";
import { hoerer, hoererSchliessen } from "./helfer/hoerer";

process.env.KEPTA_NO_AUTOSTART = "1";
process.env.KEPTA_ENCRYPTION = "off";

let kappe: string;
let datei: string;
let vorherHeim: string | undefined;
let vorherDaten: string | undefined;
let speicher: KeptaStore;
let basis: string;

beforeEach(() => {
  kappe = fs.mkdtempSync(path.join(tmpdir(), "kepta-limiter-kapsel-"));
  vorherHeim = process.env.HOME;
  vorherDaten = process.env.KEPTA_DATA_DIR;
  process.env.HOME = kappe;
  process.env.KEPTA_DATA_DIR = kappe; // Haelt tests/testkapsel.test.ts — niemals Damians Heim.
  datei = path.join(kappe, "kepta.db");
  speicher = new KeptaStore(datei);
  // Ein Hoerer pro Fall, ueber das Haus-Helferstueck `tests/helfer/hoerer.ts`:
  // ein eigenes `app.listen()` neben dem Riegel waere ein zweiter Lauscher auf
  // derselben App („Listen method has been called more than once").
  const a = hoerer(createApp(speicher)).address();
  if (a === null || typeof a === "string") throw new Error("Hoerer ohne Port");
  basis = `http://127.0.0.1:${a.port}`;
});

afterEach(async () => {
  await hoererSchliessen();
  speicher.close();
  if (vorherHeim === undefined) delete process.env.HOME;
  else process.env.HOME = vorherHeim;
  if (vorherDaten === undefined) delete process.env.KEPTA_DATA_DIR;
  else process.env.KEPTA_DATA_DIR = vorherDaten;
  fs.rmSync(kappe, { recursive: true, force: true });
});

describe("#89 — das Fenster durch, die Tuer gedeckelt", () => {
  it("zweihundert Anfragen ans Fenster kennen kein Kontingent", async () => {
    const antworten: number[] = [];
    for (let i = 0; i < 200; i++) antworten.push((await fetch(`${basis}/`)).status);
    expect(antworten.filter((s) => s === 429).length, `429 zwischen ${antworten.length} Fenster-Anfragen`).toBe(0);
  });

  it("die Tuer antwortet weiterhin mit dem Leib, nicht dem Fenster", async () => {
    let abgewiesen = 0;
    let leib = "";
    // Die Zahl kommt aus der Konstanten, nicht aus dem Kopf: wer die Kante hebt,
    // hebt sie hier mit — und ein Fall, der nur 260 Anfragen schickt, wäre bei
    // einer Kante von 600 grün, ohne etwas zu pruefen.
    for (let i = 0; i < DATEN_KANTE + 25; i++) {
      const r = await fetch(`${basis}/api/health`);
      if (r.status === 429) { abgewiesen++; leib = await r.text(); break; }
    }
    expect(abgewiesen, `nach ${DATEN_KANTE + 25} Anfragen an /api/health wurde keine einzige abgewiesen`).toBeGreaterThan(0);
    expect(leib).toContain("Too many requests");
  });

  it("die MCP-Tuer zahlt mit, denn sie ist keine Oberflaeche", async () => {
    // Dieselbe Kante wie /api — der skip gilt nur fuer das, was kein Datenweg ist.
    let antwort = 0;
    for (let i = 0; i < DATEN_KANTE + 25; i++) {
      const r = await fetch(`${basis}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (r.status === 429) { antwort = r.status; break; }
    }
    expect(antwort, "die MCP-Tuer wurde nie gedrosselt").toBe(429);
  });

  it("ein statisches Gut ist kein Datenweg", async () => {
    const antworten: number[] = [];
    for (let i = 0; i < 200; i++) antworten.push((await fetch(`${basis}/assets/probiert-nicht-existiert.js`)).status);
    expect(antworten.filter((s) => s === 429).length).toBe(0);
  });
});
