import { describe, it, expect, beforeEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../../src/core/store";
import { consolidateMemories } from "../../src/core/engine";

// Ohne Ollama: der Embedding-Zweig darf nicht ins Netz greifen.
vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));

let store: KeptaStore;
beforeEach(() => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-consolidate-"));
  store = new KeptaStore(path.join(dir, "test.db"));
});

const anlegen = (titel: string, inhalt: string) =>
  store.createMemory({ title: titel, content: inhalt, tags: ["dup"] } as never);

describe("consolidate: bereits ersetzte Memories", () => {
  it("laesst eine lebende Memory nie auf eine ersetzte zeigen", async () => {
    // A und B sind Dubletten. A wird durch C ersetzt und bekommt dabei ein frisches
    // updatedAt — nach der alten Heuristik (updatedAt + Laenge) gewann A damit als
    // "behalten", obwohl A tot ist. B haette danach auf eine ersetzte Memory gezeigt:
    // heruntergewichtet, und der Nachfolger selbst ausgemustert.
    const a = anlegen("Doppelter Titel", "Inhalt A");
    const b = anlegen("Doppelter Titel", "Inhalt B");
    const c = anlegen("Ganz etwas anderes", "Nachfolger");
    store.supersedeMemory(a.id, c.id);

    const ergebnis = await consolidateMemories(store, { dryRun: false });

    const bNachher = store.getMemory(b.id);
    expect(bNachher?.supersededBy).not.toBe(a.id);
    // Und keiner der Vorschlaege darf eine ersetzte Memory als "behalten" nennen.
    for (const k of ergebnis.candidates) {
      expect(store.getMemory(k.keepId)?.supersededBy ?? null).toBeNull();
    }
  });

  it("schlaegt ersetzte Memories gar nicht erst als Dublettenpaar vor", async () => {
    // Zwei tote Notizen sind kein Aufraeumfall — sie liegen als Verlauf da.
    const a = anlegen("Alter Stand", "Inhalt");
    const b = anlegen("Alter Stand", "Inhalt");
    const c = anlegen("Neuer Stand", "Inhalt neu");
    store.supersedeMemory(a.id, c.id);
    store.supersedeMemory(b.id, c.id);

    const ergebnis = await consolidateMemories(store, { dryRun: true });
    const betroffen = ergebnis.candidates.filter((k) => k.keepId === a.id || k.duplicateId === a.id || k.keepId === b.id || k.duplicateId === b.id);
    expect(betroffen).toEqual([]);
  });

  it("raeumt echte Dubletten weiterhin auf und behaelt die neuere", async () => {
    const alt = anlegen("Gleicher Titel", "Inhalt");
    await new Promise((r) => setTimeout(r, 5));
    const neu = anlegen("Gleicher Titel", "Inhalt");

    const ergebnis = await consolidateMemories(store, { dryRun: false });
    expect(ergebnis.applied).toBe(1);
    expect(store.getMemory(alt.id)?.supersededBy).toBe(neu.id);
    expect(store.getMemory(neu.id)?.supersededBy ?? null).toBeNull();
  });
});
