import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../../src/core/store";
import { searchMemories, suchCacheStatistik } from "../../src/core/engine";

// Such-Cache-Audit: der Cache in engine.ts hängt an der datenGeneration
// (Trigger auf memories/chunks/entities/relations). Diese Tests stellen sicher,
// dass KEINE Schreibroute einen veralteten Cache hinterlässt — inklusive
// direkter DB-Zugriffe, die am Methoden-Audit vorbeigehen würden.

let dir: string;
let store: KeptaStore;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-cache-"));
  store = new KeptaStore(path.join(dir, "test.db"));
});

afterEach(() => {
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function treffer(query: string): Promise<string[]> {
  const res = await searchMemories(store, { query, limit: 10 });
  return res.hits.map((h) => h.memory.title);
}

describe("Such-Cache-Invalidierung über die datenGeneration", () => {
  it("die Suche sieht neue Erinnerungen sofort (createMemory invalidiert)", async () => {
    store.createMemory({ title: "Backup-Zeitplan", content: "Sonntags 03:00 läuft das Backup." });
    expect(await treffer("Backup Zeitplan")).toContain("Backup-Zeitplan");
    store.createMemory({ title: "Kunde Weber", content: "Weber ist Neukunde seit Montag." });
    expect(await treffer("Neukunde Weber")).toContain("Kunde Weber");
  });

  it("updateMemory invalidiert — neue Inhalte sind findbar, alte verschwinden", async () => {
    const notiz = store.createMemory({ title: "Alter Titel", content: "Der alte Inhalt." });
    await treffer("Alter Titel"); // Cache füllen
    store.updateMemory(notiz.id, { title: "Neuer Titel", content: "Ganz frischer Inhalt." });
    expect(await treffer("frischer Inhalt")).toContain("Neuer Titel");
    const alt = await searchMemories(store, { query: "Der alte Inhalt", limit: 10 });
    expect(alt.hits.some((h) => h.memory.content.includes("Der alte Inhalt."))).toBe(false);
  });

  it("trash und restore invalidieren", async () => {
    const notiz = store.createMemory({ title: "Flügelkasse", content: "Der Geheimort der Flügelkasse." });
    await treffer("Flügelkasse");
    store.trashMemory(notiz.id);
    expect(await treffer("Flügelkasse")).not.toContain("Flügelkasse");
    store.restoreMemory?.(notiz.id);
    expect(await treffer("Flügelkasse")).toContain("Flügelkasse");
  });

  it("supersedeMemory invalidiert — ersetzte Erinnerungen werden ausgeblendet", async () => {
    const alt = store.createMemory({ title: "Büroadresse", content: "Die Büroadresse ist Altstadt 1." });
    const neu = store.createMemory({ title: "Büroadresse neu", content: "Die Büroadresse ist Neustadt 2." });
    await treffer("Büroadresse");
    store.supersedeMemory(alt.id, neu.id);
    const trefferListe = await treffer("Büroadresse");
    expect(trefferListe).toContain("Büroadresse neu");
  });

  it("DIREKTE DB-Zugriffe invalidieren (Trigger, nicht Methoden-Audit)", async () => {
    store.createMemory({ title: "Anker", content: "Der Anker-Datensatz für den Cache." });
    await treffer("Anker"); // Cache füllen
    store.db.exec(
      `INSERT INTO memories (id, scope, type, title, content, tags, created_at, updated_at)
       VALUES ('roh-1', 'user', 'semantic', 'Roh-Import', 'Direkt per SQL eingefügt, am Methoden-Audit vorbei.', '[]', ${Date.now()}, ${Date.now()})`
    );
    expect(await treffer("Roh-Import")).toContain("Roh-Import");
  });

  it("die Generation steigt bei jeder Mutationsart", () => {
    const basis = store.datenGeneration();
    const notiz = store.createMemory({ title: "g1", content: "Inhalt g1." });
    expect(store.datenGeneration()).toBeGreaterThan(basis);
    store.updateMemory(notiz.id, { title: "g2" });
    expect(store.datenGeneration()).toBeGreaterThan(basis + 1);
    store.trashMemory(notiz.id);
    expect(store.datenGeneration()).toBeGreaterThan(basis + 2);
  });

  it("Delta-Pflege: normale Writes patchen den Cache, OHNE den Volllauf zu erzwingen", async () => {
    store.createMemory({ title: "Basis", content: "Der erste Datensatz im Cache." });
    await treffer("Basis"); // Cache bauen
    const vor = suchCacheStatistik.vollaufbauten;
    const patches = suchCacheStatistik.deltapatches;

    store.createMemory({ title: "Delta-Neu", content: "Kommt per Delta in den Cache." });
    expect(await treffer("Delta-Neu")).toContain("Delta-Neu");
    expect(suchCacheStatistik.vollaufbauten).toBe(vor); // kein Neuaufbau!
    expect(suchCacheStatistik.deltapatches).toBeGreaterThan(patches);

    const notiz = store.getMemory(store.listMemories().find((m) => m.title === "Delta-Neu")!.id)!;
    store.updateMemory(notiz.id, { content: "Delta-geänderter Inhalt." });
    expect(await treffer("Delta-geändert")).toContain("Delta-Neu");
    store.trashMemory(notiz.id);
    expect(await treffer("Delta-geändert")).not.toContain("Delta-Neu");
    store.restoreMemory(notiz.id);
    expect(await treffer("Delta-geändert")).toContain("Delta-Neu");
    store.supersedeMemory(notiz.id, null);
    const liste = await searchMemories(store, { query: "Delta-geändert", limit: 10 });
    expect(liste.hits.every((h) => h.memory.id !== notiz.id || h.memory.supersededBy === null)).toBe(true);
    expect(suchCacheStatistik.vollaufbauten).toBe(vor); // durchgehend gepatcht
  });

  it("Sicherheitsnetz: Roh-SQL ohne Meldung erzwingt den Volllauf (Generation-Verfall)", async () => {
    store.createMemory({ title: "Anker", content: "Der Anker-Datensatz für den Cache." });
    await treffer("Anker");
    const vor = suchCacheStatistik.vollaufbauten;
    store.db.exec(
      `INSERT INTO memories (id, scope, type, title, content, tags, created_at, updated_at)
       VALUES ('roh-2', 'user', 'semantic', 'Roh ohne Meldung', 'Direkt per SQL, kein Listener sieht das.', '[]', ${Date.now()}, ${Date.now()})`
    );
    expect(await treffer("Roh ohne Meldung")).toContain("Roh ohne Meldung");
    expect(suchCacheStatistik.vollaufbauten).toBe(vor + 1); // Sicherheitsnetz griff
  });
});
