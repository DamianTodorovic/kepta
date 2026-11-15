// @vitest-environment node
//
// Punkt 6, zweiter Schritt (Papier `feldzug/p6-40000-und-sonde-3110.md` §10): der Schreibweg
// nennt seine Teilzeiten.
//
// Warum diese Datei existiert: an 40 000 Notizen fiel der Import auf ~1 600 Notizen pro Minute
// zurueck, und die Frage "was davon ist Einsetzen, was Indexpflegen, was Verknuepfen" war aus
// KEINEM Kopf zu lesen — `POST /api/import/markdown` schrieb ueberhaupt keinen Teilzeit-Kopf,
// anders als die lesenden Tueren. Ohne diese Zahl ist ein Urteil ueber den Schreibweg geraten.
//
// Der Gegenfall ist die Gesundheitstuer: sie traegt ihren eIGNEN Kopf mit ihren eIGNEN Marken.
// Wenn die Marken des Imports dort erschienen, waere der Messpfad an die falsche Tuer genaeht.
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

const PORT = 8971;
let URLE = `http://127.0.0.1:${PORT}`;
let wurzel = "";
let vorherHeim: string | undefined;
let vorherDaten: string | undefined;
let store: KeptaStore;
let hoerer: http.Server;

/** "lesen=0.12;einsetzen=3.40;gesamt=3.60" -> Objekt mit denselben Zahlen. */
function kopfZerlegen(kopf: string): Record<string, number> {
  const aus: Record<string, number> = {};
  for (const paar of kopf.split(";")) {
    const [name, wert] = paar.split("=");
    aus[name] = Number(wert);
  }
  return aus;
}

function saat(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    name: `Punkt6/${String(i).padStart(4, "0")}.md`,
    content: ["---", `kepta_id: punkt6-${i}`, `title: "Schreibwegprobe ${i}"`, "tags: [messlauf]",
      "type: semantic", "---", "", `Notiz ${i} verweist auf [[Begriff A]] und [[Begriff B]].`].join("\n"),
  }));
}

beforeAll(async () => {
  wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-import-teilzeiten-"));
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
  if (hoerer) await niederlegen(hoerer);
  store?.close();
  if (vorherHeim === undefined) delete process.env.HOME;
  else process.env.HOME = vorherHeim;
  if (vorherDaten === undefined) delete process.env.KEPTA_DATA_DIR;
  else process.env.KEPTA_DATA_DIR = vorherDaten;
  fs.rmSync(wurzel, { recursive: true, force: true });
});

const MARKEN = ["lesen", "einsetzen", "chunksetzen", "begriffekanten", "verknuepfen", "gesamt"];

describe("Punkt 6: der Schreibweg nennt, was in ihm steckt", () => {
  it("POST /api/import/markdown traegt den Teilzeit-Kopf mit seinen Marken", async () => {
    const ant = await fetch(`${URLE}/api/import/markdown`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files: saat(12) }),
    });
    expect(ant.ok, `die Saat ging nicht durch: ${ant.status}`).toBe(true);
    const kopf = ant.headers.get("x-kepta-teilzeiten");
    expect(kopf, "kein x-kepta-teilzeiten-Kopf am Schreibweg").toBeTruthy();
    const marken = Object.keys(kopfZerlegen(kopf!)).sort();
    expect(marken, `Marken im Kopf: ${kopf}`).toEqual([...MARKEN].sort());
  });

  it("Kopf und Leib nennen DIESSELBEN Zahlen", async () => {
    const ant = await fetch(`${URLE}/api/import/markdown`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files: saat(6) }),
    });
    const leib = (await ant.json()) as { teilzeiten?: Record<string, number> };
    const kopf = kopfZerlegen(ant.headers.get("x-kepta-teilzeiten") || "");
    expect(leib.teilzeiten, "im Leib stecken keine Teilzeiten").toBeTruthy();
    for (const marke of MARKEN) {
      expect(leib.teilzeiten![marke], `${marke}: Leib ${leib.teilzeiten![marke]} gegen Kopf ${kopf[marke]}`)
        .toBe(kopf[marke]);
    }
  });

  it("die Marken zaehlen echte Arbeit, nicht Nullen", async () => {
    const ant = await fetch(`${URLE}/api/import/markdown`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files: saat(40) }),
    });
    const werte = kopfZerlegen(ant.headers.get("x-kepta-teilzeiten") || "");
    // Ein Kopf, der nur "gesamt" traegt und sonst nichts, ist dieselbe Aussage wie kein Kopf.
    const gearbeitet = MARKEN.filter((m) => m !== "gesamt" && (werte[m] ?? 0) > 0);
    expect(gearbeitet.length, `keine einzige Phase gemessen: ${JSON.stringify(werte)}`).toBeGreaterThanOrEqual(3);
    expect(werte.gesamt, `gesamt ${werte.gesamt} ohne die Phasen zu decken`)
      .toBeGreaterThanOrEqual(Math.max(...MARKEN.map((m) => werte[m] ?? 0)) - 0.05);
  });

  it("die vier Phasen decken die ganze Zeit — keine Marke verschwindet im Objekt", async () => {
    // Der Fall, der den alten Fehler gefangen haette: die Stoppuhr schrieb je Namen EINE
    // Zahl. Bei 500 Notizen mit je vier Marken blieb die letzte stehen, und der Kopf meldete
    // "lesen=1.28" zu "gesamt=2515.10" — ein Anteil von 0,05 % fuer das Parsen eines Batches.
    const ant = await fetch(`${URLE}/api/import/markdown`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files: saat(200) }),
    });
    const werte = kopfZerlegen(ant.headers.get("x-kepta-teilzeiten") || "");
    const phasen = MARKEN.filter((m) => m !== "gesamt").reduce((s, m) => s + (werte[m] ?? 0), 0);
    expect(phasen, `die vier Phasen decken nur ${phasen.toFixed(2)} von ${werte.gesamt.toFixed(2)} ms: ${JSON.stringify(werte)}`)
      .toBeGreaterThanOrEqual(werte.gesamt * 0.5);
    expect(phasen, `der Batch von 200 Notizen kostet nur ${phasen.toFixed(2)} ms Arbeit — da wurde nichts zusammengezogen`)
      .toBeGreaterThan(50);
  });

  it("Gegenfall: die Gesundheitstuer traegt ihre eignen Marken, nicht die des Imports", async () => {
    const ant = await fetch(`${URLE}/api/health`);
    const kopf = ant.headers.get("x-kepta-teilzeiten") || "";
    expect(kopf, "die Gesundheit schreibt keinen Kopf mehr?").not.toBe("");
    expect(kopf.includes("einsetzen"), `Import-Marken an der falschen Tuer: ${kopf}`).toBe(false);
  });
});
