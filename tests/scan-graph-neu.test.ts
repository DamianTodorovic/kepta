// @vitest-environment node
//
// #83 (5) — der Import sagt, was am Netz **neu** ist.
//
// Damians Befund vom 14.10. (22:1x): "sein Graph waechst nicht, sein Wissen waechst
// nicht". An seiner laufenden App gemessen: 1.530 Begriffe und 1.666 Kanten bei
// 21.066 Notizen. Die Flaeche nannte nach einem Lauf, wie viele Notizen sie aufnahm —
// aber keine Zahl fuer das Netz. Wer "412 Notizen importiert" liest und sieht, dass
// der Graph gleich bleibt, kann nicht wissen, ob der Import nichts ergeben hat oder
// ob die Kanten nur ausserhalb des Fensters liegen.
//
// Darum nennt die Scan-Tuer nach einem Lauf den Zuwachs an Begriffen und Kanten,
// gemessen am ganzen Bestand (`graphBestand`), nicht am Fenster.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import fs from "fs";
import os from "os";
import path from "path";
import { lauscht, niederlegen } from "./helfer/lauscher";

process.env.KEPTA_ENCRYPTION = "off";

let wurzel = "";
let heim = "";
let server: http.Server;
let BASIS = "";
let vorherHeim: string | undefined;
let vorherDaten: string | undefined;

const schreibe = (rel: string, inhalt: string) => {
  const ziel = path.join(heim, rel);
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, inhalt);
};

async function json(pfad: string, init?: RequestInit) {
  const r = await fetch(`${BASIS}${pfad}`, init);
  return { status: r.status, body: (await r.json()) as Record<string, unknown> };
}

async function importiere(): Promise<void> {
  const start = await json("/api/scan/start", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmed: true, roots: [heim] }),
  });
  expect(start.status).toBe(200);
  for (let i = 0; i < 200; i++) {
    const s = await json("/api/scan/status");
    if (!s.body.running) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("der Lauf endete nicht");
}

beforeAll(async () => {
  wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-scan-graphneu-"));
  heim = path.join(wurzel, "heim");
  fs.mkdirSync(heim, { recursive: true });
  vorherHeim = process.env.HOME;
  vorherDaten = process.env.KEPTA_DATA_DIR;
  process.env.HOME = heim;
  process.env.KEPTA_DATA_DIR = path.join(wurzel, "daten");

  // Drei Notizen, die dieselben zwei Sachverhalte nennen — daraus entsteht ein Netz,
  // kein Haufen Blaetter: Begriffe, die zusammen genannt werden, sind gesetzt.
  schreibe("Papiere/planung.md", "# Planung\n\n## Budget\n\n## Fristen\n\nBeides zusammen.");
  schreibe("Papiere/abschluss.md", "# Abschluss\n\n## Budget\n\n## Fristen\n\nWieder zusammen.");
  schreibe("Papiere/pruefung.md", "# Pruefung\n\n## Fristen\n\n## Pruefumme\n\nUnd hier.");

  const { KeptaStore } = await import("../src/core/store");
  const { createApp } = await import("../server/app");
  const store = new KeptaStore(path.join(wurzel, "test.db"));
  const horcher = await lauscht(createApp(store), 0);
  server = horcher.server;
  BASIS = horcher.urle;
});

afterAll(async () => {
  if (server) await niederlegen(server);
  if (vorherHeim === undefined) delete process.env.HOME;
  else process.env.HOME = vorherHeim;
  if (vorherDaten === undefined) delete process.env.KEPTA_DATA_DIR;
  else process.env.KEPTA_DATA_DIR = vorherDaten;
  fs.rmSync(wurzel, { recursive: true, force: true });
});

describe("#83 (5) — der Import nennt den Zuwachs am Netz", () => {
  it("nach dem ersten Lauf stehen Begriffe und Kanten als Zahl da", async () => {
    await importiere();
    const { body } = await json("/api/scan/status");
    const zuwachs = body.graphNew as { concepts: number; edges: number } | null;
    expect(zuwachs, "die Status-Tuer nennt keinen Netz-Zuwachs").toBeTruthy();
    expect(zuwachs!.concepts, `${body.imported} Notizen importiert, aber 0 neue Begriffe — der Fall greift nicht`).toBeGreaterThan(0);
    expect(zuwachs!.edges, "neue Begriffe ohne einzige neue Kante — das ist der grosse Kreis").toBeGreaterThan(0);
  });

  it("ein zweiter Lauf ueber denselben Dateien fuegt nichts hinzu", async () => {
    await importiere();
    const { body } = await json("/api/scan/status");
    const zuwachs = body.graphNew as { concepts: number; edges: number } | null;
    expect(zuwachs, "auch der zweite Lauf nennt keinen Zuwachs").toBeTruthy();
    expect(zuwachs!.concepts, `doppelter Import legt Begriffe nach: +${zuwachs!.concepts}`).toBe(0);
    expect(zuwachs!.edges, `doppelter Import legt Kanten nach: +${zuwachs!.edges}`).toBe(0);
  });

  it("die Zahl ist der ganze Bestand, nicht das Fenster", async () => {
    const { body: bestand } = await json("/api/graph");
    const g = bestand as unknown as { bestand: { knoten: number; kanten: number }; ausriss: { begriffe: number } };
    expect(g.bestand.knoten, "die Tuer nennt keinen Bestand").toBeGreaterThan(0);
    // Der Zuwachs des letzten Laufs gegen den Bestand gehalten: Bestand ist die
    // ganze Tafel, das Fenster ist die Kappe (500). Eine Flaeche, die nur das
    // Fenster zaehlt, meldet Nullwachstum, waehrend die Tafel voll schreibt.
    expect(g.bestand.knoten).toBeGreaterThanOrEqual(g.ausriss.begriffe);
  });
});
