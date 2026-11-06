// @vitest-environment node
// Punkt 19 — der Zaehler fuer verlorene Kanten war per Konstruktion taub.
//
// Der Weg, an beiden Stellen nachgelesen 16.10. 04:41 und heute 07:11 Uhr:
// `src/core/store.ts` holt die Kanten mit `WHERE r.source_id IN (knotenIds) AND
// r.target_id IN (knotenIds)` — beide Enden liegen also schon innerhalb derselben
// Begriffsscheibe. `server/router/system.ts:94` filtert danach gegen GENAU dieselbe
// Menge. Folge: `verworfen = g.relations.length - kanten.length` kann fuer dieses
// Fenster nie etwas anderes als 0 sein.
//
// Gemessen in dieser Nacht, zweimal: "Fenster 500 Begiffe / 2 000 Kanten gezeigt,
// 0 verworfen" — bei einem Bestand von 150 600 Kanten (05:28 Uhr) und bei 101 970
// (07:06 Uhr). Ein Feld, das fuer diesen Fall immer 0 meldet, ist kein Beweis fuer
// einen vollen Auszug, sondern ein Beweis dafuer, dass die Scheibe schon zu war,
// bevor jemand nachzaehlte.
//
// Heilung: ein Feld, das den Rest zaehlen DUERFTE — `kantenAusserhalb` — und ein
// Hinweis, der es nennt, damit die Zahl nicht hinter dem Feld verschwindet.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import request from "supertest";
import { KeptaStore } from "../src/core/store";
import { indexMemory } from "../src/core/engine";

process.env.KEPTA_NO_AUTOSTART = "1";
process.env.KEPTA_ENCRYPTION = "off";

let dir = "";
let store: KeptaStore;
let app: import("express").Express;
let prevHome: string | undefined;

function scanNotiz(titel: string, text: string): string {
  const angelegt = store.createMemory({ title: titel, content: text, tags: ["machine-scan", "md"] } as never);
  indexMemory(store, angelegt.id);
  return angelegt.id;
}

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-ausriss-"));
  prevHome = process.env.HOME;
  process.env.HOME = dir;
  process.env.KEPTA_DATA_DIR = dir;
  vi.resetModules();
  const { createApp } = await import("../server");
  store = new KeptaStore(path.join(dir, "t.db"));
  app = createApp(store);
  // Dasselbe Fixture wie der Deckungsfall: 2 000 Einzelblaetter und 40 Notizen, die
  // zwei Begriffe zusammen nennen — zusammen ueber 2 000 Kanten ueber 4 000 Knoten.
  for (let i = 0; i < 2000; i++) scanNotiz(`blatt ${i}`, `## einmalig ${i}\n\nText.`);
  for (let i = 0; i < 40; i++) scanNotiz(`akte ${i}`, "## Budget\n\n## Fristen\n\nText.");
});

afterEach(() => {
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
  delete process.env.KEPTA_DATA_DIR;
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("der Auszug zaehlt, was ausserhalb seines Fensters liegt", () => {
  it("das alte Feld meldet 0, und genau darum gibt es ein neues", async () => {
    const res = await request(app).get("/api/graph");
    const a = JSON.parse(res.text).ausriss;
    // Der strukturelle Wert: die Kantenscheibe ist in sich geschlossen, die Route
    // filtert gegen dieselbe Menge. Ein Fall, der hier etwas anderes erwartet,
    // wartet auf einen Fehler, den es in diesem Fenster nicht geben kann.
    expect(a.kantenVerworfen, "das alte Feld ist nicht mehr strukturell 0 — Grund pruefen").toBe(0);
    expect(a.kantenAusserhalb, "das neue Feld fehlt oder zaehlt nichts, waehrend der Bestand ueber der Kappe liegt").toBeGreaterThan(0);
  });

  it("das neue Feld ist die Differenz Bestand gegen gezeigte Kante, nie negativ", async () => {
    const leib = JSON.parse((await request(app).get("/api/graph")).text);
    expect(leib.ausriss.kantenAusserhalb).toBe(leib.bestand.kanten - leib.ausriss.kantenGezeigt);
    expect(leib.ausriss.kantenAusserhalb).toBeGreaterThanOrEqual(0);
  });

  it("der Hinweis nennt die Zahl, damit das Feld nicht hinter dem Satz verschwindet", async () => {
    const leib = JSON.parse((await request(app).get("/api/graph")).text);
    expect(leib.ausriss.hinweis, `hinweis: ${leib.ausriss.hinweis}`).toContain(`and ${leib.ausriss.kantenAusserhalb} links never reach a window this size`);
  });

  it("ein Bestand unter der Kappe meldet null aussen, nicht eine erfundene Lucke", async () => {
    const kleiner = new KeptaStore(path.join(fs.mkdtempSync(path.join(tmpdir(), "kepta-ausriss-klein-")), "t.db"));
    try {
      const { createApp } = await import("../server");
      const klein = kleiner.createMemory({
        title: "Mandant Klein", content: "## Fristen\n\nSiehe auch [[Budget]].", tags: ["machine-scan", "md"],
      } as never);
      indexMemory(kleiner, klein.id);
      const leib = JSON.parse((await request(createApp(kleiner)).get("/api/graph")).text);
      expect(leib.ausriss.begrenzt, "ein kleiner Bestand darf nicht als gekappt gelten").toBe(false);
      expect(leib.ausriss.kantenAusserhalb).toBe(0);
    } finally {
      kleiner.close();
    }
  });
});
