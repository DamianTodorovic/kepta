import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../../src/core/store";
import { defaultExtensions, type AuditEvent } from "../../src/core/extensions";
import { searchMemories } from "../../src/core/engine";

// FTS-Ausfall-Audit: ftsSearch darf bei einem Defekt weiter [] liefern — die
// Suche muss über Vektor- und Graph-Bein bestehen bleiben. Was sie nicht darf:
// den Fehler verschwinden lassen. Die Terme sind vorqualifiziert und auf
// \p{L}\p{N} reduziert (stopwords.ts), ein Syntaxfehler aus Nutzereingabe ist
// damit praktisch ausgeschlossen; was hier schlägt, ist ein echter Defekt.

let dir: string;
let store: KeptaStore;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-fts-"));
  store = new KeptaStore(path.join(dir, "test.db"));
});

afterEach(() => {
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function notizAnlegen(): string {
  return store.createMemory({ title: "Flügelkasse", content: "Der Geheimort der Flügelkasse im Dachboden." }).id;
}

/**
 * Der Index ist weg — der Zustand, den ein korrupter oder halb abgeräumter
 * FTS5-Zweig hinterlässt. Die drei Sync-Trigger müssen mit runter: sie schreiben
 * in memories_fts, blieben sie zurück, zerlegt die fehlende Wortspur auch jeden
 * Inhaltsschritt (createMemory, recordAccess). Das ist ein anderer Defekt als
 * "BM25-Bein fällt aus" und darf hier nicht mitgetestet werden.
 */
function indexPlatte(): void {
  store.db.exec(`
    DROP TRIGGER IF EXISTS memories_ai;
    DROP TRIGGER IF EXISTS memories_ad;
    DROP TRIGGER IF EXISTS memories_au;
    DROP TABLE memories_fts;
  `);
}

describe("FTS-Ausfall: degradiert, aber nicht unsichtbar", () => {
  it("heiler Index: ftsSearch trifft, ftsStatus meldet ok", () => {
    const id = notizAnlegen();
    expect(store.ftsSearch("Flügelkasse").map((h) => h.id)).toContain(id);
    expect(store.ftsStatus()).toEqual({ ok: true });
  });

  it("kaputter Index: ftsSearch wirft nicht, hält aber Wortlaut und Zeit fest", () => {
    notizAnlegen();
    indexPlatte();
    expect(store.ftsSearch("Flügelkasse")).toEqual([]);
    const status = store.ftsStatus();
    expect(status.ok).toBe(false);
    // Der SQLite-Wortlaut, nicht eine umformulierte Vermutung — sonst rät der
    // Leser, statt zu sehen.
    expect(status.ok === false && status.fehler).toMatch(/no such table: memories_fts/);
    expect(status.ok === false && Number.isNaN(Date.parse(status.at))).toBe(false);
  });

  it("ein Erfolg nach dem Ausfall löscht die Panne nicht — sie bleibt, bis jemand neu startet", () => {
    notizAnlegen();
    indexPlatte();
    store.ftsSearch("Flügelkasse");
    store.db.exec(`CREATE VIRTUAL TABLE memories_fts USING fts5(
      title, content, tags, content='memories', content_rowid='rid',
      tokenize='unicode61 remove_diacritics 2'
    )`);
    expect(store.ftsSearch("Flügelkasse")).toEqual([]); // leer, aber fehlerfrei
    expect(store.ftsStatus().ok).toBe(false);
  });

  it("wer einen Audit-Sink hat, bekommt die Panne ins Journal", () => {
    store.close();
    const events: AuditEvent[] = [];
    store = new KeptaStore(path.join(dir, "journal.db"), {
      ...defaultExtensions(),
      audit: { emit: (e) => events.push(e) },
    });
    notizAnlegen();
    indexPlatte();
    store.ftsSearch("Flügelkasse");
    const panne = events.find((e) => e.target === "fts");
    expect(panne?.action).toBe("search");
    expect(String(panne?.detail?.fehler)).toMatch(/no such table/);
  });

  it("die Suche überlebt: ohne Wortspur trägt das Graph-Bein die Notiz", async () => {
    const id = notizAnlegen();
    store.linkEntities(id, ["flügelkasse"]);
    const vorher = await searchMemories(store, { query: "flügelkasse", limit: 5 });
    expect(vorher.hits.map((h) => h.memory.id)).toContain(id);
    indexPlatte();
    const nachher = await searchMemories(store, { query: "flügelkasse", limit: 5 });
    expect(nachher.hits.map((h) => h.memory.id)).toContain(id);
    expect(store.ftsStatus().ok).toBe(false);
  });
});
