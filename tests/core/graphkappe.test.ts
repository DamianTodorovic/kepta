// @vitest-environment node
// A7-08 (App-Haelfte) — die Begriffs- und Kantenscheibe der Graph-Abfrage.
//
// `getGraph()` ohne Startpunkt liefert den ganzen Bestand, gekappt: LIMIT 500
// Begriffe, LIMIT 2 000 Kanten. Beides stand **ohne ORDER BY** — welche Begriffe
// fehlen, entschied die Zeilenordnung, also die Einfügereihenfolge. Ein Bestand
// mit 934 Begriffen lieferte bei 1 500 Notizen 500 davon, und ein zentraler
// Begriff, spaet angelegt, war nicht dabei; die Flaeche haette ihn den ganzen
// Tag vermissen koennen, ohne dass etwas davon sprach.
//
// Gekaufte Groessenordnung ist keine Auskunft: die Scheibe muss die
// Bedeutungsspitze sein, nicht der Ausschnitt, den der Schreiber zufaellig
// zusaedt.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../../src/core/store";

process.env.KEPTA_NO_AUTOSTART = "1";
process.env.KEPTA_ENCRYPTION = "off";

let dir = "";
let store: KeptaStore | undefined;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-graphkappe-"));
  process.env.KEPTA_DATA_DIR = dir;
  store = new KeptaStore(path.join(dir, "t.db")) as unknown as KeptaStore;
});

afterEach(() => {
  (store as unknown as { close?: () => void })?.close?.();
  fs.rmSync(dir, { recursive: true, force: true });
});

function notiz(store: KeptaStore, i: number) {
  return store.createMemory({ title: `Notiz ${i}`, content: `Inhalt ${i}`, type: "semantic" } as never);
}

describe("getGraph: die Scheibe der Begriffe ist die Bedeutungsspitze", () => {
  it("liefert einen zentralen Begriff, auch wenn er zuletzt angelegt wurde", () => {
    // 500 Begriffe zu je einer Notiz, dann der zentrale Begriff an 40 Notizen —
    // als 501ster, also in der natuerlichen Zeilenordnung hinter der Scheibe.
    for (let i = 0; i < 500; i++) {
      const m = notiz(store!, i);
      store!.linkEntities(m.id, [`begriff ${i}`]);
    }
    for (let i = 0; i < 40; i++) {
      const m = notiz(store!, 1000 + i);
      store!.linkEntities(m.id, ["zentral"]);
    }
    const { entities } = store!.getGraph();
    expect(entities.length, "die Scheibe liefert nicht 500 Begriffe").toBe(500);
    const namen = entities.map((e) => e.name);
    expect(namen, `„zentral" (40 Traeger) fehlt, waehrend Einzelpunkte stehen: ${namen.slice(0, 5).join(", ")} …`)
      .toContain("zentral");
  });

  it("ordnet nach Traegerzahl, damit der Schnitt stabil ist", () => {
    // 600 Begriffe zu je einer Notiz, einer zu fuenf. Mit ORDER BY auf die
    // Traegerzahl steht der fuenffache vorn; ohne ihn entscheidet die
    // Einfuegereihenfolge, und der spaet Angelegte faellt aus der Scheibe.
    for (let i = 0; i < 600; i++) {
      const m = notiz(store!, i);
      store!.linkEntities(m.id, [`einzeln ${i}`]);
    }
    for (let i = 0; i < 5; i++) {
      const m = notiz(store!, 2000 + i);
      store!.linkEntities(m.id, ["fuelfach"]);
    }
    const { entities } = store!.getGraph();
    const namen = entities.map((e) => e.name);
    expect(namen).toContain("fuelfach");
    expect(namen[0], `erste gelieferte Zeile ist „${namen[0]}", nicht „fuelfach"`).toBe("fuelfach");
  });
});

describe("getGraph: die Scheibe der Kanten ist dieselbe Rechnung", () => {
  it("laesst die am besten belegten Paare nicht hinter der Zeilenordnung", () => {
    // 2 100 Kanten ueber verstreute Paare, dazu ein Paar mit 60 Belegen —
    // angelegt ZULETZT. Ohne ORDER BY faellt der starke Paarstapel aus der
    // 2 000er-Scheibe, mit ihr bleibt er.
    const E = 700;
    for (let i = 0; i < E; i++) {
      const m = notiz(store!, 3000 + i);
      store!.linkEntities(m.id, [`kante ${i}`, `andere ${i}`]);
    }
    for (let i = 0; i < 2100; i++) {
      store!.addRelation(`kante ${i % E}`, `andere ${i % E}`, `behauptet ${i}`, null);
    }
    for (let i = 0; i < 60; i++) store!.addRelation("wichtig A", "wichtig B", `belegt ${i}`, null);

    const { relations } = store!.getGraph();
    expect(relations.length, "die Kantscheibe liefert nicht 2 000").toBe(2000);
    const starke = relations.filter((r) => r.relation.startsWith("belegt ")).length;
    expect(starke, `von 60 Belegen des wichtigsten Paares stehen ${starke} im Schnitt`).toBeGreaterThan(0);
  });

  it("liefert denselben Schnitt, wenn niemand etwas schreibt", () => {
    for (let i = 0; i < 2100; i++) {
      const m = notiz(store!, 4000 + i);
      store!.linkEntities(m.id, [`x${i}`, `y${i}`]);
      store!.addRelation(`x${i}`, `y${i}`, `rel ${i}`, null);
    }
    const a = store!.getGraph().relations.map((r) => r.id).join(",");
    const b = store!.getGraph().relations.map((r) => r.id).join(",");
    expect(a).toBe(b);
  });
});
