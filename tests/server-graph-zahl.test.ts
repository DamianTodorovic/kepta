// @vitest-environment node
//
// Aufgabe #64(5) — die Zahl hinter dem Filter. GFs Befund vom 13.10. (eigener Browser,
// audit-2026-10-09/gf-screens/graph-14k-detailstufe.png): die Flaeche zeigte
// "100 entries · 0 concepts · 0 links" bei 14.702 Knoten in der Tuer. Ein Teil davon
// war die Listenkappe (heilt `tests/server-leseweg.test.ts`), der andere Teil sitzt in
// `server/router/system.ts:56`:
//
//   .filter((r) => nameById.has(r.sourceId) && nameById.has(r.targetId))
//
// A1x hat die Groessenordnung gemessen (tests/core/graphdeckung.test.ts:99-104):
// 1.593 von 2.000 Kanten auf Damians echtem Bestand, 827 von 2.000 am 14.000-Kunstbestand
// fallen durch diese Masche — **und die Antwort nannte dafuer keine Zahl**. Eine Flaeche,
// die eine Bilanzzeile zeigt und einen Bruchteil malt, verkauft den Bruchteil als das Ganze.
//
// Vertrag jetzt: die Tuer nennt ihren Ausschnitt (`ausriss`) mit vier Zahlen, die
// pruefbar zusammengehen — gezeigt + verworfen = im Auszug — und mit einem Hinweis, der
// die Ausschnittszahl gegen den Bestand stellt. Alles zusaetzlich; keine bestehende Zeile
// der Antwort veraendert sich (`tests/rest-verknuepfung.test.ts` und GFs Flaeche lesen
// `entities`, `relations`, `memoriesByEntity`, `bestand` wie vorher).
//
// Fixture nach A1x' Rezept: 2.000 Einzelblaetter (je ein Begriff, der nur diese Notiz
// nennt) + 40 Akten, die zwei Begriffe zusammen nennen. Damit schliessen beide Kappen
// (500 Begriffe, 2.000 Kanten), und der Filter hat wirklich etwas zu verwerfen.
//
// Ein Horcher pro Datei auf 127.0.0.1:8821 — nie request(app).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../src/core/store";
import { defaultExtensions } from "../src/core/extensions";
import { indexMemory } from "../src/core/engine";
import { createApp } from "../server/app";
import { lauscht, niederlegen } from "./helfer/lauscher";

const PORT = 8821;
let URLE = `http://127.0.0.1:${PORT}`;

let wurzel = "";
let vorherHeim: string | undefined;
let vorherDaten: string | undefined;
let store: KeptaStore;
let hoerer: import("node:http").Server;

/** Genau die Folge, die der Rechner-Scan faehrt: anlegen, indexieren, fertig. */
function scanNotiz(titel: string, inhalt: string): string {
  const angelegt = store.createMemory({ title: titel, content: inhalt, tags: ["machine-scan", "md"] });
  indexMemory(store, angelegt.id);
  return angelegt.id;
}

interface Ausriss {
  begriffe: number;
  kantenImAuszug: number;
  kantenGezeigt: number;
  kantenVerworfen: number;
  begrenzt: boolean;
  grund: string;
  hinweis: string;
}
interface GraphAntwort {
  entities: { id: number; name: string }[];
  relations: { id: string; source: string; target: string }[];
  bestand: { knoten: number; kanten: number };
  ausriss: Ausriss;
}

async function graph(gabe = ""): Promise<GraphAntwort> {
  const res = await fetch(`${URLE}/api/graph${gabe}`);
  return (await res.json()) as GraphAntwort;
}

beforeAll(async () => {
  wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-graphzahl-"));
  // Kapsel: createApp ohne KEPTA_DATA_DIR zieht ~/.kepta des Anmeldekontos an
  // (server/app.ts:120); os.homedir() folgt HOME. Haelt tests/testkapsel.test.ts.
  vorherHeim = process.env.HOME;
  vorherDaten = process.env.KEPTA_DATA_DIR;
  process.env.HOME = wurzel;
  process.env.KEPTA_DATA_DIR = wurzel;
  store = new KeptaStore(path.join(wurzel, "kepta.db"), defaultExtensions());
  for (let i = 0; i < 2000; i++) scanNotiz(`blatt ${i}`, `## einmalig ${i}\n\nText.`);
  for (let i = 0; i < 40; i++) scanNotiz(`akte ${i}`, "## Budget\n\n## Fristen\n\nText.");
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

describe("G-1 — die Graph-Tuer nennt, was ihre Kappen und ihr Filter verlieren", () => {
  it("der Fixture hat, was er haben muss: beide Kappen schliessen", async () => {
    const bestand = store.graphBestand();
    expect(bestand.knoten).toBeGreaterThan(500);
    expect(bestand.kanten).toBeGreaterThan(2000);
  });

  it("der Auszug haelt seine Zahlen: gezeigt + verworfen = im Auszug", async () => {
    const g = await graph();
    expect(g.ausriss, "die Antwort muss ihren Ausschnitt mit Zahlen nennen").toBeTruthy();
    const a = g.ausriss;
    expect(a.begriffe).toBe(g.entities.length);
    expect(a.kantenGezeigt).toBe(g.relations.length);
    expect(a.kantenGezeigt + a.kantenVerworfen).toBe(a.kantenImAuszug);
    expect(typeof a.grund).toBe("string");
    expect(a.grund).toMatch(/not in this excerpt|outside/);
  });

  it("was der Filter fallen laesst, ist eine Zahl — und die Zahl ist die Masche, nicht ein Wunsch", async () => {
    const g = await graph();
    // Am Arbeitsbaum ist die Masche leer: A1x' #56-Aenderung in `src/core/store.ts`
    // liefert nur Kanten zwischen den Begriffen, die er mitgibt. Am committeten Stand
    // war sie es nicht — dort mass er 827 von 2.000 Kanten (Kunstbestand) und 1.593 von
    // 2.000 (Damians Bestand), und die Tuer nannte dafuer keine Zahl. Diese Zeile prueft
    // die Zahl gegen die Masche, egal was sie liefert: stimmt sie nicht, faellt der Fall.
    const direkt = store.getGraph(undefined, 2);
    const idSet = new Set(direkt.entities.map((e) => e.id));
    const erwartet = direkt.relations.filter((r) => !idSet.has(r.sourceId) || !idSet.has(r.targetId)).length;
    expect(g.ausriss.kantenVerworfen).toBe(erwartet);
    expect(g.ausriss.kantenImAuszug).toBe(direkt.relations.length);
    expect(g.ausriss.kantenGezeigt).toBe(direkt.relations.length - erwartet);
  });

  it("begrenzt und hinweis stellen die Ausschnittszahl gegen den Bestand", async () => {
    const g = await graph();
    const a = g.ausriss;
    expect(a.begrenzt).toBe(true);
    expect(String(a.hinweis)).toMatch(/of \d+ concepts/);
    expect(String(a.hinweis)).toMatch(/of \d+ links/);
    expect(String(a.hinweis)).toMatch(/base holds \d+ concepts and \d+ links/);
    expect(String(a.hinweis)).toMatch(/dropped \d+ links/);
  });

  it("ein enger Auszug (ein Begriff, Tiefe 1) nennt dieselbe Art von Zahl", async () => {
    const g = await graph("?entity=Budget&depth=1");
    expect(g.ausriss.begrenzt).toBe(true);
    expect(g.ausriss.kantenGezeigt + g.ausriss.kantenVerworfen).toBe(g.ausriss.kantenImAuszug);
    expect(g.ausriss.kantenGezeigt).toBeGreaterThan(0);
  });

  it("nichts verloren, wenn alles im Auszug liegt: verworfen = 0, begrenzt nach Bestand", async () => {
    // Zweite Tuer, zweiter Bestand: eine Notiz mit Titel und Begriff — zwei Knoten,
    // eine Kante, beide im Auszug. Hier darf die Zahl nicht erfinden, was der Filter
    // nicht verworfen hat, und `begrenzt` muss trotzdem die Wahrheit sagen (der
    // Bestand ist voller als das, was diese Notiz zeigt, ist hier: nicht der Fall).
    const klein = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-graphzahl-klein-"));
    const vorher2 = process.env.KEPTA_DATA_DIR;
    const heim2 = process.env.HOME;
    process.env.HOME = klein;
    process.env.KEPTA_DATA_DIR = klein;
    let zweiterStore: KeptaStore | null = null;
    let zweiterHorcher: import("node:http").Server | null = null;
    try {
      zweiterStore = new KeptaStore(path.join(klein, "k.db"), defaultExtensions());
      const angelegt = zweiterStore.createMemory({ title: "Kanzlei Fristen", content: "# Fristenkontrolle\n\nMontags und donnerstags.", tags: ["md"] });
      indexMemory(zweiterStore, angelegt.id);
      const hor = await lauscht(createApp(zweiterStore), 8822);
      zweiterHorcher = hor.server;
      const json = (await (await fetch(`${hor.urle}/api/graph`)).json()) as GraphAntwort;
      expect(json.entities).toHaveLength(2);
      expect(json.relations).toHaveLength(1);
      expect(json.ausriss.kantenImAuszug).toBe(1);
      expect(json.ausriss.kantenGezeigt).toBe(1);
      expect(json.ausriss.kantenVerworfen).toBe(0);
      expect(json.ausriss.begrenzt).toBe(false);
      expect(String(json.ausriss.hinweis)).toMatch(/whole picture/);
    } finally {
      if (zweiterHorcher) await niederlegen(zweiterHorcher);
      zweiterStore?.close();
      process.env.KEPTA_DATA_DIR = vorher2;
      process.env.HOME = heim2;
      fs.rmSync(klein, { recursive: true, force: true });
    }
  });
});
