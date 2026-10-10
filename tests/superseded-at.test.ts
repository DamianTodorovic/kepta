// Der Ersetzungszeitpunkt (Befund Q-12 / A4-03): die Zeitreise konnte Ersetztes nicht
// ausblenden, weil nirgends stand, WANN ersetzt wurde.
// Gemessen am Stand 343cb04: grep superseded_at src/core/store.ts src/core/migrate.ts = leer,
// PRAGMA table_info(memories) = 17 Spalten ohne diese, engine.ts:340-345 prueft im
// Zeitzweig nur validFrom/validTo. asOf 01.10.2026 lieferte "Girokonto ING" UND die am
// 10.09. ersetzte "Girokonto Postbank".
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";
import { searchMemories, indexMemory } from "../src/core/engine";

function dbPfad(): string {
  return path.join(fs.mkdtempSync(path.join(tmpdir(), "kepta-superseded-at-")), "test.db");
}

function spalten(store: KeptaStore): string[] {
  return (store.db.prepare("PRAGMA table_info(memories)").all() as { name: string }[]).map((c) => c.name);
}

/** Eine Datenbank auf den Stand VOR der Migration zurueckversetzen. */
function entferneDieSpalte(store: KeptaStore): void {
  if (spalten(store).includes("superseded_at")) {
    store.db.exec("ALTER TABLE memories DROP COLUMN superseded_at");
  }
}

describe("superseded_at: Datenbank vor der Migration", () => {
  // Beide Notizen liegen zeitlich VOR dem befragten asOf, damit die Zeitreise
  // nur an der Ersetzung haengt und nicht am Geltungsbeginn.
  const VORRAT = Date.parse("2026-09-01T08:00:00Z");

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("oeffnet nach der Migration wieder und zaehlt alle Notizen", () => {
    const pfad = dbPfad();
    const alt = new KeptaStore(pfad);
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) {
      const m = alt.createMemory({ title: `Notiz ${i}`, content: `Inhalt ${i} mit eigenem Wortlaut`, createdAt: VORRAT, updatedAt: VORRAT });
      ids.push(m.id);
    }
    const ersetzt = alt.createMemory({ title: "Girokonto Postbank", content: "Das Girokonto laeuft bei der Postbank", createdAt: VORRAT, updatedAt: VORRAT });
    const nachfolger = alt.createMemory({ title: "Girokonto ING", content: "Das Girokonto laeuft bei der ING", createdAt: VORRAT, updatedAt: VORRAT });
    ids.push(ersetzt.id, nachfolger.id);
    // so, wie eine Altdatenbank es speicherte: nur der Zeiger, kein Zeitpunkt
    alt.db.prepare("UPDATE memories SET superseded_by = ? WHERE id = ?").run(nachfolger.id, ersetzt.id);
    entferneDieSpalte(alt);
    expect(spalten(alt)).not.toContain("superseded_at");
    const vorher = alt.countMemories();
    alt.close();

    const neu = new KeptaStore(pfad);
    expect(spalten(neu), "die Migration hat die Spalte nicht nachgezogen").toContain("superseded_at");
    expect(neu.countMemories()).toEqual(vorher);
    expect(neu.listMemories({ limit: 100 }).map((m) => m.id).sort()).toEqual([...ids].sort());
    // Der Altdatensatz haelt seinen Zeiger, aber keinen erfundenen Zeitpunkt.
    const altSatz = neu.getMemory(ersetzt.id)!;
    expect(altSatz.supersededBy).toBe(nachfolger.id);
    expect(altSatz.supersededAt).toBeNull();
    neu.close();
  });

  it("laesst Altdaten ohne Zeitpunkt ungeraten — die Zeitreise blendet sie nicht aus", async () => {
    const pfad = dbPfad();
    const alt = new KeptaStore(pfad);
    const ersetzt = alt.createMemory({ title: "Girokonto Postbank", content: "Das Girokonto laeuft bei der Postbank", createdAt: VORRAT, updatedAt: VORRAT });
    const nachfolger = alt.createMemory({ title: "Girokonto ING", content: "Das Girokonto laeuft bei der ING", createdAt: VORRAT, updatedAt: VORRAT });
    alt.db.prepare("UPDATE memories SET superseded_by = ? WHERE id = ?").run(nachfolger.id, ersetzt.id);
    entferneDieSpalte(alt);
    alt.close();

    const store = new KeptaStore(pfad);
    indexMemory(store, ersetzt.id);
    indexMemory(store, nachfolger.id);
    const reise = await searchMemories(store, { query: "Girokonto", asOf: Date.parse("2026-10-01") });
    expect(reise.hits.map((h) => h.memory.id)).toContain(ersetzt.id);
    store.close();
  });
});

describe("superseded_at: gesetzter Zeitpunkt wirkt in der Zeitreise", () => {
  const ERSETZT_AM = Date.parse("2026-09-10T09:00:00Z");

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    vi.useFakeTimers();
    vi.setSystemTime(ERSETZT_AM);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function basis(): { store: KeptaStore; ersetzt: string; nachfolger: string } {
    const store = new KeptaStore(dbPfad());
    // die ersetzte Notiz besteht seit 1.9., der Nachfolger kam am 9.9. dazu, die
    // Ersetzung geschah am 10.9. — nur so ist asOf 5.9. ein Vorher-Fall
    vi.setSystemTime(Date.parse("2026-09-01"));
    const ersetzt = store.createMemory({ title: "Girokonto Postbank", content: "Das Girokonto laeuft bei der Postbank" }).id;
    vi.setSystemTime(Date.parse("2026-09-09"));
    const nachfolger = store.createMemory({ title: "Girokonto ING", content: "Das Girokonto laeuft bei der ING" }).id;
    vi.setSystemTime(ERSETZT_AM);
    store.supersedeMemory(ersetzt, nachfolger);
    indexMemory(store, ersetzt);
    indexMemory(store, nachfolger);
    return { store, ersetzt, nachfolger };
  }

  it("setzt den Ersetzungszeitpunkt beim Ersetzen", () => {
    const { store, ersetzt } = basis();
    expect(store.getMemory(ersetzt)!.supersededAt).toBe(ERSETZT_AM);
    store.close();
  });

  it("nimmt den Zeitpunkt zurueck, wenn die Ersetzung geloescht wird", () => {
    const { store, ersetzt } = basis();
    store.supersedeMemory(ersetzt, null);
    expect(store.getMemory(ersetzt)!.supersededBy).toBeNull();
    expect(store.getMemory(ersetzt)!.supersededAt).toBeNull();
    store.close();
  });

  it("blendet Ersetztes ab dem Ersetzungszeitpunkt aus, davor zeigt es die Zeitreise", async () => {
    const { store, ersetzt, nachfolger } = basis();

    const davor = await searchMemories(store, { query: "Girokonto", asOf: Date.parse("2026-09-05") });
    expect(davor.hits.map((h) => h.memory.id)).toContain(ersetzt);
    expect(davor.hits.map((h) => h.memory.id)).not.toContain(nachfolger);

    const nachher = await searchMemories(store, { query: "Girokonto", asOf: Date.parse("2026-10-01") });
    expect(nachher.hits.map((h) => h.memory.id)).not.toContain(ersetzt);
    expect(nachher.hits.map((h) => h.memory.id)).toContain(nachfolger);
    store.close();
  });

  it("haelt Ersetztes in der Gegenwart sichtbar, nur herabgestuft", async () => {
    const { store, ersetzt, nachfolger } = basis();
    vi.setSystemTime(Date.parse("2026-10-05"));

    const res = await searchMemories(store, { query: "Girokonto" });
    expect(res.hits.map((h) => h.memory.id)).toContain(ersetzt);
    expect(res.hits[0]?.memory.id).toBe(nachfolger);
    expect(res.hits.find((h) => h.memory.id === ersetzt)?.superseded).toBe(true);
    store.close();
  });
});
