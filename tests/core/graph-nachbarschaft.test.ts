// @vitest-environment node
// #83 (2) — das Fenster ist eine Nachbarschaft, nicht die Rangliste.
//
// Sein Befund an der laufenden Tuer (21.066 Notizen, 1.530 Begriffe / 1.666 Kanten):
// das Fenster schickt 500 Begriffe und 979 Kanten. Rangfolge heisst: die 500
// bedeutsamsten Knoten, und darunter haengt ein Knoten an keinem anderen — an
// meinem 14.000-Kunstbestand waren es 128 von 500, an seinem Fenster 41 % Fetzen.
// Wer den Graphen oeffnet, sieht also eine Wolke, die nichts zusammenhaelt.
//
// Regel, die ich baue: gewaehlt wird von den Samen aus ueber Kanten, und **jeder**
// gelieferte Knoten haelt an einer gelieferten Kante. Ist die Nachbarschaft kleiner
// als das Budget, bleibt das Fenster kleiner — eine Wolke aus Staub ist kein Gewinn.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../../src/core/store";
import { indexMemory } from "../../src/core/engine";

process.env.KEPTA_NO_AUTOSTART = "1";
process.env.KEPTA_ENCRYPTION = "off";

let dir = "";
let store: KeptaStore;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-a1x-nachbarschaft-"));
  store = new KeptaStore(path.join(dir, "t.db"));
});
afterEach(() => store.close());

/** Ein Notiz-Anlage-Weg wie im Scan: anlegen, indexieren — Begriffe setzt der Kern. */
function notiz(titel: string, koepfe: string[]): void {
  const koerper = koepfe.map((k) => `## ${k}\n\nText`).join("\n\n");
  const m = store.createMemory({ title: titel, content: koerper, tags: ["machine-scan"] });
  indexMemory(store, m.id);
}

function teilbau(): void {
  // 24 Samen, jeder von 12 Notizen genannt, jede dieser Notizen nennt zusaetzlich
  // einen Begriff, den sonst nichts traegt — zusammenhaengende Nachbarschaft.
  for (let s = 0; s < 24; s++) {
    for (let j = 0; j < 12; j++) notiz(`akte ${s}-${j}`, [`samen ${s}`, `beiblatt ${s}-${j}`]);
  }
  // 3.000 Begriffe, die je zwei Notizen nennen, aber NIE mit einem Samen zusammen
  // in einer Notiz stehen: nach Traegerzahl hoch gerankt, im Netz aber eine eigene,
  // duenne Welt. Genau die fuellt die alte Rangliste das Fenster voll.
  for (let i = 0; i < 3000; i++) {
    notiz(`rand-a-${i}`, [`rand ${i}`]);
    notiz(`rand-b-${i}`, [`rand ${i}`]);
  }
}

describe("getGraph-Fenster: Nachbarschaft", () => {
  it("liefert jeden Knoten an einer Kante — keinen einzigen Punkt ohne Halt", () => {
    teilbau();
    const g = store.getGraph();
    expect(g.entities.length).toBeGreaterThan(0);
    const halte = new Set<number>();
    for (const r of g.relations) {
      halte.add(r.sourceId);
      halte.add(r.targetId);
    }
    const ohne = g.entities.filter((e) => !halte.has(e.id));
    expect(ohne.map((e) => e.name), `${ohne.length} von ${g.entities.length} Knoten haelen an keiner Kante`).toHaveLength(0);
  });

  it("haelt die Samen und ihre Nachbarschaft, nicht die ranghoehen Staubknoten", () => {
    teilbau();
    const g = store.getGraph();
    const namen = new Set(g.entities.map((e) => e.name));
    expect(namen.has("samen 0"), "kein Samen im Fenster").toBe(true);
    expect(namen.has("beiblatt 0-1"), "das Beiblatt eines Samens fehlt").toBe(true);
    // Staub darf vorkommen, aber nur, wenn er an einer Kante haengt — das prueft der
    // Fall oben. Hier die Groessenordnung: die 24 Samen und ihre 288 Beiblätter sind
    // 312 Knoten; das Fenster darf nicht auf 500 Staub aufgehen.
    const staub = [...namen].filter((n) => n.startsWith("rand ")).length;
    const samen = [...namen].filter((n) => n.startsWith("samen ")).length;
    expect(samen).toBeGreaterThanOrEqual(12);
    expect(staub, `${staub} Staubknoten gegen ${samen} Samen — das Fenster ist wieder eine Rangliste`).toBeLessThan(samen * 4);
  });

  it("zwei Aufrufe auf demselben Bestand liefern dieselbe Nachbarschaft", () => {
    teilbau();
    const a = store.getGraph().entities.map((e) => e.id);
    const b = store.getGraph().entities.map((e) => e.id);
    expect(b).toEqual(a);
  });

  it("ein kleiner Bestand bleibt voll sichtbar — die Nachbarschaft ist kein Mindestalter", () => {
    notiz("winzig", ["alpha", "beta"]);
    const g = store.getGraph();
    expect(new Set(g.entities.map((e) => e.name))).toEqual(new Set(["winzig", "alpha", "beta"]));
    expect(g.relations.length).toBeGreaterThan(0);
  });
});
