// #83 (2) im Kern — das Fenster ist eine Nachbarschaft, nicht die Rangliste.
// Befund an Damians laufender App (21.066 Notizen): der Begriffsschnitt ist die
// Spitze der Rangfolge, die Kantenscheibe aber liefert Kanten, deren Enden ausserhalb
// liegen. Was die Flaeche danach zeichnet, sind Knoten ohne Halt — eine Wolke, die
// nichts zusammenhaelt. Gemessen am 14.702-Kunstbestand mit der alten Rangregel:
// 500 Begriffe, 1.402 Kanten, 41 Knoten ohne jede Kante, groesster Teil 8 in 201
// Teilen. Nach dem Wachstum: 0 Knoten ohne Halt, groesster Teil 27 in 31 Teilen.
//
// Der Kern hat keine Begriffs-Extraktion (kein begiffe.ts); Begriffe und Kanten
// kommen hier aus linkEntities und addRelation — genau die Wege, ein Mensch und der
// Agentenkanal setzt.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";

function freshStore(): KeptaStore {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-graph-nachbarschaft-"));
  return new KeptaStore(path.join(dir, "test.db"));
}

const KAPPE = 500;

describe("getGraph: das Fenster ist eine Nachbarschaft", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
  });

  afterEach(() => vi.unstubAllGlobals());

  /**
   * 24 Samen, jeder in 12 Notizen genannt; jede dieser Notizen nennt zwei eigene
   * Blaetter, und die drei Begriffe sind paarweise gesetzt — ein Same also mit 24
   * Nachbarn in einem Teil von 25 Knoten. Dazu 3.000 Staubbegriffe aus je vier
   * Notizen, ohne jede Kante: Tragweite 4 gegen 3 der Blaetter, also die Rangspitze
   * hinter den Samen. Genau die fuellt das Fenster, wenn nach Rang statt nach
   * Nachbarschaft gewaehlt wird — der Fall unten ist dann rot, nicht leer.
   */
  function teilbau(store: KeptaStore): { samen: number; staub: number } {
    for (let s = 0; s < 24; s++) {
      for (let j = 0; j < 12; j++) {
        const m = store.createMemory({ title: `Akte ${s}-${j}`, content: `Samentext ${s}-${j}` });
        const blaetter = [`beiblatt-a-${s}-${j}`, `beiblatt-b-${s}-${j}`];
        store.linkEntities(m.id, [`samen ${s}`, ...blaetter]);
        store.addRelation(`samen ${s}`, blaetter[0]!, "mentions", null);
        store.addRelation(`samen ${s}`, blaetter[1]!, "mentions", null);
        store.addRelation(blaetter[0]!, blaetter[1]!, "mentions", null);
      }
    }
    for (let i = 0; i < 3000; i++) {
      for (let k = 0; k < 4; k++) {
        const m = store.createMemory({ title: `Rand ${k} ${i}`, content: `Fliesstext ${i}` });
        store.linkEntities(m.id, [`rand ${i}`]);
      }
    }
    return { samen: 24, staub: 3000 };
  }

  it("liefert jeden Knoten an einer Kante — keinen Punkt ohne Halt", () => {
    const store = freshStore();
    teilbau(store);
    const g = store.getGraph();
    expect(g.entities.length).toBeGreaterThan(0);
    const halte = new Set<number>();
    for (const r of g.relations) {
      halte.add(r.sourceId);
      halte.add(r.targetId);
    }
    const ohne = g.entities.filter((e) => !halte.has(e.id));
    expect(ohne.map((e) => e.name), `${ohne.length} von ${g.entities.length} Knoten haelen an keiner Kante`).toHaveLength(0);
    store.close();
  });

  it("haelt die Nachbarschaft der Samen, nicht den ranghoehen Staub", () => {
    const store = freshStore();
    teilbau(store);
    const g = store.getGraph();
    const namen = new Set(g.entities.map((e) => e.name));
    expect(namen.has("samen 0"), "kein Same im Fenster").toBe(true);
    expect(namen.has("beiblatt-a-0-1"), "ein Blatt des Samens fehlt").toBe(true);
    const staub = [...namen].filter((n) => n.startsWith("rand ")).length;
    const samen = [...namen].filter((n) => n.startsWith("samen ")).length;
    expect(samen, "zu wenig Samen im Fenster").toBeGreaterThanOrEqual(12);
    expect(staub, `${staub} Staub gegen ${samen} Samen — das Fenster ist wieder eine Rangliste`).toBe(0);
    expect(g.entities.length).toBe(KAPPE);
    store.close();
  });

  it("ist in sich geschlossen: jede Kante hat beide Enden im Fenster", () => {
    const store = freshStore();
    teilbau(store);
    const g = store.getGraph();
    const ids = new Set(g.entities.map((e) => e.id));
    const aussen = g.relations.filter((r) => !ids.has(r.sourceId) || !ids.has(r.targetId));
    expect(aussen.map((r) => r.id), `${aussen.length} Kanten zeigen aus dem Fenster hinaus`).toHaveLength(0);
    // Und die Scheibe ist ein Netz, nicht ein Haufen Punkte: die Kante, die zum
    // gelieferten Knoten gehoert, muss auch geliefert sein. Ohne Wachstum liefert
    // der Rang nur Samen und Staub — Kanten hat das Fenster dann keine einzige.
    expect(g.relations.length, "das Fenster haelt an keiner Kante — 0 Kanten bei 500 Knoten").toBeGreaterThanOrEqual(
      Math.floor(g.entities.length / 2),
    );
    store.close();
  });

  it("zwei Aufrufe auf demselben Bestand liefern dieselbe Nachbarschaft", () => {
    const store = freshStore();
    teilbau(store);
    const a = store.getGraph().entities.map((e) => e.id);
    const b = store.getGraph().entities.map((e) => e.id);
    expect(b).toEqual(a);
    store.close();
  });

  it("ein Bestand ohne jede Kante bleibt sichtbar — die Nachbarschaft ist kein Mindestalter", () => {
    const store = freshStore();
    for (let i = 0; i < KAPPE + 10; i++) {
      const m = store.createMemory({ title: `Notiz ${i}`, content: `Inhalt ${i}` });
      store.linkEntities(m.id, [`begiff ${i}`]);
    }
    const g = store.getGraph();
    expect(g.entities, "ein rein begriffener Bestand zeigt einen leeren Graphen").toHaveLength(KAPPE);
    expect(g.relations).toHaveLength(0);
    store.close();
  });
});
