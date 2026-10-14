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

// #56, zweiter Teil: dieselbe Scheibe, aber fuer die Kanten.
//
// Der Kern las `SELECT ... FROM relations LIMIT 2000` ohne jede Ordnung
// (`src/core/store.ts:1033`). Was die App laengst gemessen und geheilt hat
// (A7-08, Bericht F8-GRAPH-FLAEche), fehlte hier: ohne ORDER BY entscheidet die
// rowid, welches Paar hinter der Scheibe liegt — und die rowid folgt dem
// Schreibweg, nicht der Bedeutung. Zwei Laeufe mit demselben Inhalt, aber
// verschiedener Einfuegereihenfolge, durften nicht verschiedene Antworten geben.
describe("getGraph: der Ausschnitt der Kanten", () => {
  const KANTEN_KAPPE = 2000;

  /**
   * 2 000 Einer-Beleg-Paare plus ein Paar mit 60 Belegen. zuerst sagt, ob das
   * tragende Paar ZUERST oder ZULETZT geschrieben wird — der einzige Unterschied
   * zwischen den beiden Laeufen.
   */
  function kantenBasis(zuerst: boolean): KeptaStore {
    const store = freshStore();
    const anker = store.createMemory({ title: "Anker", content: "..." }).id;
    // Das tragende Paar: 60 Belege, ein einziges Paar.
    const dicht = () => {
      for (let i = 0; i < 60; i++) store.addRelation("zentral A", "zentral B", `belegt ${i}`, anker);
    };
    // Die Fuellkante: 2 000 Paare mit je einem Beleg.
    const duenn = () => {
      for (let i = 0; i < KANTEN_KAPPE; i++) store.addRelation(`blatt ${i} q`, `blatt ${i} z`, `eins ${i}`, anker);
    };
    if (zuerst) {
      dicht();
      duenn();
    } else {
      duenn();
      dicht();
    }
    return store;
  }

  it("gibt dieselbe Antwort, egal in welcher Reihenfolge geschrieben wurde", () => {
    // Verglichen wird die Kantenliste, NICHT die id-Folge: die rowids laufen in beiden
    // Laeufen von 1 bis 2000, ein Vergleich der Zahlen waer wahr ohne etwas zu pruefen
    // (erster Wurf dieser Datei — er ging green, obwohl die Antworten verschieden
    // waren). Die `relation`-Zeile traegt den Beleg-Text je Kante, unterscheidet also
    // das zentale Paar ("belegt i") von den Fuellkanten ("eins i").
    const a = kantenBasis(true).getGraph().relations.map((r) => r.relation);
    const b = kantenBasis(false).getGraph().relations.map((r) => r.relation);
    expect(b, "zwei Laeufe ueber denselben Inhalt, verschiedene Reihenfolge").toEqual(a);
  });

  it("laesst das am besten belegte Paar nicht hinter der Scheibe fallen", () => {
    const relations = kantenBasis(false).getGraph().relations;
    expect(relations.length).toBeLessThanOrEqual(KANTEN_KAPPE);
    const starke = relations.filter((r) => r.relation.startsWith("belegt ")).length;
    expect(starke, `von 60 Belegen des zentralen Paares stehen ${starke} im Schnitt`).toBe(60);
  });

  it("haelt zwei Laeufe auf demselben Bestand identisch", () => {
    const store = kantenBasis(false);
    const zuerst = store.getGraph().relations.map((r) => r.id);
    const danach = store.getGraph().relations.map((r) => r.id);
    expect(danach).toEqual(zuerst);
    expect(zuerst.length).toBeGreaterThan(0);
  });
});
