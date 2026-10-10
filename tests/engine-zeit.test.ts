// Zeitregel der Engine — ein Grenzwert, zwei Pfade (Befund Q-13 / A4-06).
// Gemessen am Stand 343cb04: forget(mode:"expire") setzt validTo auf exakt Date.now()
// (src/core/mcp.ts:575), die Gegenwart prüfte streng `<`, die Zeitreise `<=`.
// 59 von 120 Versuchen meldeten die soeben vergessene Notiz als gültig.
//
// Die beiden Tests unten laufen deshalb mit gesteuerte Uhr: "derselbe Tick" heißt,
// dass Date.now() beim Vergessen und beim Suchen denselben Millisekundenwert hat.
// Ohne die Uhr zu stellen, wäre der Test ein Paar Millisekunden später dran und
// grün, obwohl der Befund existiert (so geschehen in der ersten Testrunde).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";
import { searchMemories, indexMemory } from "../src/core/engine";

function freshStore(): KeptaStore {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-engine-zeit-"));
  return new KeptaStore(path.join(dir, "test.db"));
}

/**
 * Der Schreibweg, den memory_forget(mode:"expire") geht — hier direkt über den Store,
 * damit dieser Test nicht an der Werkzeugscheibe (src/core/mcp.ts) hängt, die parallel
 * gearbeitet wird. Feld und Wert sind identisch: updateMemory(id, { validTo: Date.now() }).
 */
function vergessePerExpire(store: KeptaStore, id: string): void {
  store.updateMemory(id, { validTo: Date.now() });
}

const GRENZE = Date.parse("2027-01-01T12:00:00Z");

describe("Zeitregel: vergessen im selben Tick", () => {
  beforeEach(() => {
    // Kein Embedding-Dienst: das Vektor-Bein soll nicht über Ollama-Erreichbarkeit
    // entscheiden. Die Wortspur ist für diese Befunde der ganze Weg.
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    vi.useFakeTimers();
    vi.setSystemTime(GRENZE);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("meldet die Notiz abgelaufen, wenn search im selben Tick auf expire folgt", async () => {
    const store = freshStore();
    const Ziel = store.createMemory({ title: "Zugang Tresor", content: "Der Code fuer den Tresor ist 4417" });
    indexMemory(store, Ziel.id);
    store.createMemory({ title: "Zugang Tresor neu", content: "Der Tresor hat jetzt einen anderen Code, vierstellig" });

    vergessePerExpire(store, Ziel.id);
    // kein Tick, keine Millisekunde Wartzeit — derselbe Instant wie beim Vergessen
    const res = await searchMemories(store, { query: "Zugang Tresor Code" });

    const treffer = res.hits.find((h) => h.memory.id === Ziel.id);
    expect(treffer, "die soeben vergessene Notiz taucht in der Suche auf").toBeDefined();
    // Der Contract: sie darf nicht als gültig zurückkommen.
    expect(treffer!.expired).toBe(true);
  });

  it("gilt derselbe Grenzwert in Gegenwart und Zeitreise gleich", async () => {
    const store = freshStore();
    const m = store.createMemory({ title: "Kellerraum Schluessel", content: "Der Schluessel fuer den Kellerraum liegt beim Hausmeister" });
    indexMemory(store, m.id);
    store.updateMemory(m.id, { validTo: GRENZE });

    // Zeitreise auf genau den Verfallszeitpunkt: ausgeblendet (war schon vorher so).
    const reise = await searchMemories(store, { query: "Kellerraum Schluessel", asOf: GRENZE });
    expect(reise.hits.map((h) => h.memory.id)).not.toContain(m.id);

    // Gegenwart am exakt selben Instant: dieselbe Regel, also ebenfalls nicht gültig.
    const jetzt = await searchMemories(store, { query: "Kellerraum Schluessel" });
    const treffer = jetzt.hits.find((h) => h.memory.id === m.id);
    expect(treffer, "die Notiz am Verfallsinstant ist in der Suche sichtbar").toBeDefined();
    expect(treffer!.expired).toBe(true);
  });
});

// Befund A4-05: ein validFrom in der Zukunft wurde ohne asOf als Gegenwart
// ausgeliefert, mit asOf=auf-heute aber ausgeblendet — zwei Wege, zwei Antworten.
// Gemessen: total=1 ("Umzug Dresden", gueltig ab 2027) gegen total=0.
describe("gueltig ab Zukunft", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("erscheint nicht ohne asOf", async () => {
    const store = freshStore();
    const umzug = store.createMemory({
      title: "Umzug Dresden",
      content: "Der Umzug nach Dresden gilt erst ab 2027",
      validFrom: Date.now() + 365 * 24 * 3600 * 1000,
    });
    indexMemory(store, umzug.id);
    const aktuell = store.createMemory({ title: "Wohnort Hamburg", content: "Der Wohnort ist Hamburg Altona" });
    indexMemory(store, aktuell.id);

    const ohneAsOf = await searchMemories(store, { query: "Wohnort Umzug Dresden" });
    expect(ohneAsOf.hits.map((h) => h.memory.id), "die Zukunft notiert als Gegenwart").not.toContain(umzug.id);
    // die Gegenwart bleibt unberuehrt — der Filter ist keine Sperre fuer alles
    expect(ohneAsOf.hits.map((h) => h.memory.id)).toContain(aktuell.id);

    // derselbe Fall mit Zeitreise auf heute: beide Wege muessen gleich antworten
    const mitAsOf = await searchMemories(store, { query: "Wohnort Umzug Dresden", asOf: Date.now() });
    expect(mitAsOf.hits.map((h) => h.memory.id)).not.toContain(umzug.id);
    expect(mitAsOf.total).toBe(ohneAsOf.total);
  });

  it("ist ab dem Geltungsbeginn da, auch ohne asOf", async () => {
    const store = freshStore();
    const ab = Date.parse("2026-01-01T00:00:00Z");
    const m = store.createMemory({ title: "Vertrag Nordwest", content: "Der Vertrag Nordwest laeuft ab 2026", validFrom: ab });
    indexMemory(store, m.id);

    const spaeter = await searchMemories(store, { query: "Vertrag Nordwest" });
    expect(spaeter.hits.map((h) => h.memory.id)).toContain(m.id);
  });
});
