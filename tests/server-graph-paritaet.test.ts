// @vitest-environment node
//
// #83 (3) — Paritaet der Graph-Tuer. Der Kern (`~/kepta-core/server.ts:1204`) liefert
// die Enden einer Kante zweimal: als Namen UND als `sourceId`/`targetId`. Die App-Tuer
// (`server/router/system.ts`) gab nur die Namen. Fuer die Flaeche reicht das, fuer
// jeden anderen Verbraucher nicht: ohne Kennungen muss er Knoten ueber ihren
// Text zusammensuchen, und zwei Begriffe, die sich denselben Namen teilen, sind dann
// ein Knoten zu viel oder zu wenig. Die Zahl der Kanten gegen die der Knoten zu
// zaehlen ist ohne IDs raten.
//
// Zweitens, und das ist der eigentliche Fortschritt seit #83 (2): die Masche
// `.filter(enden im auszug)` muss nichts mehr verwerfen, weil der Begriffsschnitt
// jetzt eine Nachbarschaft ist — jedes Ende einer gelieferten Kante wird mitgeliefert.
// Ein Wert > 0 hier ist darum kein Zufall, sondern ein Rueckschritt.
//
// Hausvertrag: ein Horcher pro Datei auf 127.0.0.1, nie request(app).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../src/core/store";
import { defaultExtensions } from "../src/core/extensions";
import { indexMemory } from "../src/core/engine";
import { createApp } from "../server/app";
import { lauscht, niederlegen } from "./helfer/lauscher";

const PORT = 8831;
let URLE = `http://127.0.0.1:${PORT}`;

let wurzel = "";
let vorherHeim: string | undefined;
let vorherDaten: string | undefined;
let store: KeptaStore;
let hoerer: import("node:http").Server;

interface Kante {
  id: number;
  source: string;
  target: string;
  sourceId?: number;
  targetId?: number;
  relation: string;
}
interface GraphAntwort {
  entities: { id: number; name: string }[];
  relations: Kante[];
  memoriesByEntity: Record<string, string[]>;
  bestand: { knoten: number; kanten: number };
  ausriss: { begriffe: number; kantenImAuszug: number; kantenGezeigt: number; kantenVerworfen: number };
}

function scanNotiz(titel: string, inhalt: string): string {
  const angelegt = store.createMemory({ title: titel, content: inhalt, tags: ["machine-scan", "md"] });
  indexMemory(store, angelegt.id);
  return angelegt.id;
}

async function graph(gabe = ""): Promise<GraphAntwort> {
  const res = await fetch(`${URLE}/api/graph${gabe}`);
  return (await res.json()) as GraphAntwort;
}

beforeAll(async () => {
  wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-graphparitaet-"));
  vorherHeim = process.env.HOME;
  vorherDaten = process.env.KEPTA_DATA_DIR;
  process.env.HOME = wurzel;
  process.env.KEPTA_DATA_DIR = wurzel;
  store = new KeptaStore(path.join(wurzel, "kepta.db"), defaultExtensions());
  // Ein echtes Netz aus dem Schreibweg: sechs Akten, die je zwei Sachverhalte
  // zusammen nennen, dazu je ein eigenes Beiblatt.
  for (let i = 0; i < 6; i++) {
    scanNotiz(`akte ${i}`, `## budget\n\n## fristen\n\n## beiblatt ${i}\n\nText.`);
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

describe("#83 (3) — die App-Tuer liefert die Enden wie der Kern", () => {
  it("jede Kante fuehrt sourceId und targetId mit, und die Namen passen zu ihnen", async () => {
    const g = await graph();
    expect(g.relations.length, "der Fixture hat keine Kanten — der Fall beweist nichts").toBeGreaterThan(0);
    const nachId = new Map(g.entities.map((e) => [e.id, e.name]));
    for (const r of g.relations) {
      expect(typeof r.sourceId, `Kante ${r.id} ohne sourceId`).toBe("number");
      expect(typeof r.targetId, `Kante ${r.id} ohne targetId`).toBe("number");
      expect(nachId.get(r.sourceId!), `sourceId ${r.sourceId} ist kein gelieferter Knoten`).toBe(r.source);
      expect(nachId.get(r.targetId!), `targetId ${r.targetId} ist kein gelieferter Knoten`).toBe(r.target);
    }
  });

  it("die alten Felder bleiben, wie sie waren — die IDs sind additives Gut", async () => {
    const g = await graph();
    for (const r of g.relations) {
      expect(typeof r.source).toBe("string");
      expect(typeof r.target).toBe("string");
      expect(typeof r.relation).toBe("string");
    }
    expect(g.entities.length).toBeGreaterThan(0);
    expect(g.memoriesByEntity, "die Verknuepfung Begriff zu Notizen fehlt").toBeTruthy();
    expect(g.bestand.knoten).toBeGreaterThan(0);
    expect(g.ausriss.kantenGezeigt).toBe(g.relations.length);
  });

  it("seit dem Nachbarschaftsfenster wirft die Tuer keine Kante mehr weg", async () => {
    const g = await graph();
    expect(g.ausriss.kantenVerworfen, `${g.ausriss.kantenVerworfen} Kanten zeigen aus dem Fenster hinaus — die Scheibe ist keine Nachbarschaft mehr`).toBe(0);
    expect(g.ausriss.kantenImAuszug).toBe(g.ausriss.kantenGezeigt);
  });

  it("Tuer und Speicher nennen dieselbe Nachbarschaft", async () => {
    const g = await graph();
    const direkt = store.getGraph(undefined, 2);
    expect(g.entities.map((e) => e.id)).toEqual(direkt.entities.map((e) => e.id));
    expect(g.relations.length).toBe(direkt.relations.length);
  });
});
