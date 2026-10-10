// Die 500 Begriffe des ganzen Graphen (Befund A7-08, Nachtrag aus der A7-Vermessung).
// Gemessen am Stand 343cb04: store.ts:1000 `SELECT id, name FROM entities LIMIT 500`
// ohne ORDER BY — welche Begriffe uebrig bleiben, entscheidet die Zeilenordnung.
// Bei 1 500 Notizen: Bestand 934 Begriffe, geliefert 500. Ein zentraler Begriff kann
// fehlen, und der Ausschnitt wechselt, sobald Zeilen neu geschrieben werden.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";

function freshStore(): KeptaStore {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-graph-kappe-"));
  return new KeptaStore(path.join(dir, "test.db"));
}

const KAPPE = 500;

describe("getGraph: der Ausschnitt der Begriffe", () => {
  beforeEach(() => {
    // Kein Embedding-Dienst: hier geht es nur um die Begriffsauswahl des Graphen.
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
  });

  afterEach(() => vi.unstubAllGlobals());

  /**
   * KAPPE + 1 Begriffe, angelegt in einer Reihenfolge, in der der wichtigste ZULETZT
   * entsteht — er hat also die hoechste rowid und steht in der natuerlichen
   * Zeilenordnung hinten. Traegerzahlen: der zentrale Begriff hat 5, jeder andere 1.
   */
  function basis(): { store: KeptaStore; zentraler: string } {
    const store = freshStore();
    const namen: string[] = [];
    for (let i = 0; i < KAPPE + 1; i++) namen.push(`begiff-${String(i).padStart(4, "0")}`);
    const zentraler = namen[namen.length - 1]!;

    // Je eine Notiz pro gewoehnlichem Begriff, eine Notiz mit den 5 wichtigsten Traegern
    // fuer den zentralen — die Traegerzahl ist das einzige Ordnungsmerkmal, das den Ausschlag gibt.
    for (const [i, name] of namen.entries()) {
      if (name === zentraler) continue;
      const m = store.createMemory({ title: `Notiz ${i}`, content: `Inhalt ${i}` });
      store.linkEntities(m.id, [name]);
    }
    for (let j = 0; j < 5; j++) {
      const m = store.createMemory({ title: `Zentrale Notiz ${j}`, content: `Haengt am zentralen Begriff ${j}` });
      store.linkEntities(m.id, [zentraler]);
    }
    return { store, zentraler };
  }

  it("laesst den zentralen Begriff nicht draussen, nur weil er spaet angelegt wurde", () => {
    const { store, zentraler } = basis();
    const graph = store.getGraph();
    const namen = graph.entities.map((e) => e.name);
    expect(graph.entities.length).toBeLessThanOrEqual(KAPPE);
    expect(namen, "der Begriff mit den meisten Traegern fehlt im Ausschnitt").toContain(zentraler);
  });

  it("liefert die Kappe voll und in stabiler Reihenfolge", () => {
    const { store } = basis();
    const zuerst = store.getGraph();
    const danach = store.getGraph();
    expect(zuerst.entities).toHaveLength(KAPPE);
    expect(danach.entities.map((e) => e.id)).toEqual(zuerst.entities.map((e) => e.id));
  });

  it("ordnet nach Traegerzahl, gleich viele der Reihe nach", () => {
    const store = freshStore();
    // Dreier, Zweier, Einer — der Tragfaehste ZULETZT angelegt, damit die
    // natuerliche Zeilenordnung (rowid) der Bedeutungswiderspricht: ohne ORDER BY
    // kaeme die Liste gamma, beta, alpha — nach Traegerzahl geordnet alpha, beta, gamma.
    const duenn = store.createMemory({ title: "Eins", content: "eins" });
    store.linkEntities(duenn.id, ["gamma"]);
    const zweites = store.createMemory({ title: "Zwei b", content: "zwei b" });
    store.linkEntities(zweites.id, ["beta"]);
    const mittel = store.createMemory({ title: "Zwei", content: "zwei" });
    store.linkEntities(mittel.id, ["beta"]);
    const nochEins = store.createMemory({ title: "Drei c", content: "drei c" });
    store.linkEntities(nochEins.id, ["alpha"]);
    const nochEin = store.createMemory({ title: "Drei b", content: "drei b" });
    store.linkEntities(nochEin.id, ["alpha"]);
    const dick = store.createMemory({ title: "Drei", content: "drei" });
    store.linkEntities(dick.id, ["alpha"]);

    const graph = store.getGraph();
    expect(graph.entities.map((e) => e.name)).toEqual(["alpha", "beta", "gamma"]);
  });
});
