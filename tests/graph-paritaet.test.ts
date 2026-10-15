// Paritaet Kern <-> App: der Produzent muss an der Schreibe hangen, nicht am Schreibweg.
//
// Die App ruft `store.verknuepfeNotiz` in `indexMemory` und liest dabei die Begriffe aus
// dem Text der Notiz selbst (`src/core/begiffe.ts`). Der Kern hatte den Produzenten zwar
// als Methode, aber keinen Rufer in `indexMemory` und keine Leseregel: eine Notiz bekam
// nur dann Kanten, wenn der aufrufende Pfad sie von Hand mitgab — und das tat keiner
// ausser der Agenten-Tuer, und die nur fuer Wiki-Links. Jeder Import, jede Sync, jeder
// Ordner-Durchgang blieb ein Blatt ohne Kante. Fuer einen npm-Nutzer sieht der Graph
// damit anders aus als fuer einen DMG-Nutzer, obwohl beide denselben Kern meinen.
//
// Hausvertrag: kein Hoerer, kein request(app). Der Produzent sitzt im Speicher.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";
import { indexMemory } from "../src/core/engine";

function freshStore(): KeptaStore {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-paritaet-"));
  return new KeptaStore(path.join(dir, "test.db"));
}

const namen = (g: { entities: { name: string }[] }) => new Set(g.entities.map((e) => e.name));
const kantworte = (g: { relations: { relation: string }[] }) =>
  [...new Set(g.relations.map((r) => r.relation))].sort();
const kantenJe = (g: { relations: unknown[] }) => g.relations.length;

describe("indexMemory im Kern verknuepft die eigene Notiz — Paritaet zur App", () => {
  let store: KeptaStore;
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    store = freshStore();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    store.close();
  });

  it("eine Notiz ohne jeden Wiki-Link bekommt Begriffe aus ihren Ueberschriften", () => {
    const m = store.createMemory({
      title: "Fristenkontrolle",
      content: "## Fristenkontrolle\n\n## Budget 2027\n\n## Auslastung Kanzlei\n\nText ohne Links.",
    });
    indexMemory(store, m.id);
    const g = store.getGraph();
    expect(namen(g).has("budget 2027")).toBe(true);
    expect(namen(g).has("auslastung kanzlei")).toBe(true);
    expect(kantworte(g)).toContain("co-mentions");
  });

  it("ein Wiki-Link in einem Fliesstext ist ein Begriff, auch ohne Ueberschrift", () => {
    const m = store.createMemory({
      title: "Montagsrunde",
      content: "Wir ziehen [[Q4 Close]] nach und klaeren [[Vertragsverlaengerung]].",
    });
    indexMemory(store, m.id);
    const g = store.getGraph();
    expect(namen(g).has("q4 close")).toBe(true);
    expect(namen(g).has("vertragsverlaengerung")).toBe(true);
  });

  it("ein Begriff aus einem Code-Zaun erfindet keine Kante", () => {
    const m = store.createMemory({
      title: "Stylesheet",
      content: "## Farbpalette\n\n```css\n#kopfzeile { color: red; }\n## Eingabefeld\n```\n",
    });
    indexMemory(store, m.id);
    const g = store.getGraph();
    expect(namen(g).has("farbpalette")).toBe(true);
    expect(namen(g).has("kopfzeile")).toBe(false);
    expect(namen(g).has("eingabefeld")).toBe(false);
  });

  it("Satzfetzen, Rahmengoerter und Zahlen bleiben Begriffe-frei", () => {
    const m = store.createMemory({
      title: "Protokoll",
      content: "## Usage\n\n## Install\n\n## Die Kanzlei zieht den Termin deutlich weiter\n\n## 14702\n\n## Backup laeuft nachts.\n",
    });
    indexMemory(store, m.id);
    const g = store.getGraph();
    for (const falsch of ["usage", "install", "14702"]) expect(namen(g).has(falsch)).toBe(false);
    expect(namen(g).has("backup laeuft nachts")).toBe(false);
    expect(namen(g).has("die kanzlei zieht den termin deutlich weiter")).toBe(false);
  });

  it("zweimal Speichern haengt keine zweite Kante an", () => {
    const m = store.createMemory({ title: "Doppelte Aussage", content: "## Frist\n\n## Budget\n" });
    indexMemory(store, m.id);
    const zuerst = kantenJe(store.getGraph());
    indexMemory(store, m.id);
    expect(kantenJe(store.getGraph())).toBe(zuerst);
    expect(zuerst).toBeGreaterThan(0);
  });

  it("ein leerer Text setzt keine Begriffe, aber der Titel bleibt erhalten", () => {
    const m = store.createMemory({ title: "Nur ein Titel", content: "" });
    indexMemory(store, m.id);
    const g = store.getGraph();
    expect(namen(g).has("nur ein titel")).toBe(true);
    expect(kantenJe(g)).toBe(0);
  });
});
