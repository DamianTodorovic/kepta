import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";
import { migrateFromLegacyJson, legacyJsonPaths } from "../src/core/migrate";

// Jeder Test bekommt ein frisches tmp-Verzeichnis, das KEPTA_DATA_DIR wird —
// so zeigt legacyJsonPaths()[0] auf <tmp>/memories.json und die DB liegt daneben.
let dir: string;
let prevDataDir: string | undefined;
let prevHome: string | undefined;

function freshStore(): KeptaStore {
  return new KeptaStore(path.join(dir, "test.db"));
}

function writeLegacy(data: unknown): string {
  const p = path.join(dir, "memories.json");
  fs.writeFileSync(p, typeof data === "string" ? data : JSON.stringify(data), "utf-8");
  return p;
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-migrate-"));
  prevDataDir = process.env.KEPTA_DATA_DIR;
  prevHome = process.env.HOME;
  process.env.KEPTA_DATA_DIR = dir;
  // HOME isolieren, damit die Fallback-Pfade (~/.kepta, ~/.ki-gehirn) nicht auf
  // echte Nutzerdaten treffen und die Tests deterministisch bleiben.
  process.env.HOME = dir;
});

afterEach(() => {
  if (prevDataDir === undefined) delete process.env.KEPTA_DATA_DIR;
  else process.env.KEPTA_DATA_DIR = prevDataDir;
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
});

describe("legacyJsonPaths", () => {
  it("stellt KEPTA_DATA_DIR/memories.json an erste Stelle und liefert die Fallback-Pfade", () => {
    const paths = legacyJsonPaths();
    expect(paths[0]).toBe(path.join(dir, "memories.json"));
    expect(paths.some((p) => p.endsWith(path.join(".kepta", "memories.json")))).toBe(true);
    expect(paths.some((p) => p.endsWith(path.join(".ki-gehirn", "memories.json")))).toBe(true);
  });

  it("lässt den KEPTA_DATA_DIR-Eintrag weg, wenn die Variable fehlt", () => {
    delete process.env.KEPTA_DATA_DIR;
    const paths = legacyJsonPaths();
    expect(paths.every((p) => p.length > 0)).toBe(true);
    expect(paths.some((p) => p === path.join(dir, "memories.json"))).toBe(false);
  });
});

describe("migrateFromLegacyJson", () => {
  it("ohne Quelldatei: skipped, migrated 0, Meta-Marker 'no-source'", () => {
    const store = freshStore();
    const res = migrateFromLegacyJson(store);
    expect(res.skipped).toBe(true);
    expect(res.migrated).toBe(0);
    expect(res.backupPath).toBeNull();
    const meta = store.db.prepare("SELECT value FROM meta WHERE key = 'migrated_json_v1'").get() as
      | { value: string }
      | undefined;
    expect(meta?.value).toBe("no-source");
  });

  it("migriert gültige Einträge, legt ein Backup an und markiert die Quelle", () => {
    writeLegacy([
      { id: "leg-1", title: "Alt A", content: "Inhalt A", tags: ["rust"], createdAt: 111, updatedAt: 222 },
      { title: "Alt B", content: "Inhalt B" },
    ]);
    const store = freshStore();
    const res = migrateFromLegacyJson(store);

    expect(res.skipped).toBe(false);
    expect(res.migrated).toBe(2);
    expect(store.countMemories().active).toBe(2);

    // ID wird übernommen, Felder gemappt
    const a = store.getMemory("leg-1");
    expect(a?.title).toBe("Alt A");
    expect(a?.tags).toEqual(["rust"]);
    expect(a?.createdAt).toBe(111);

    // Backup existiert und enthält die Rohdaten
    expect(res.backupPath).not.toBeNull();
    expect(fs.existsSync(res.backupPath!)).toBe(true);
    expect(fs.readFileSync(res.backupPath!, "utf-8")).toContain("Inhalt A");

    // Meta-Marker referenziert Quelle
    const meta = store.db.prepare("SELECT value FROM meta WHERE key = 'migrated_json_v1'").get() as {
      value: string;
    };
    expect(meta.value).toContain("migrated:2");
  });

  it("ist idempotent: zweiter Lauf überspringt und dupliziert nicht", () => {
    writeLegacy([{ id: "leg-1", title: "A", content: "B" }]);
    const store = freshStore();
    expect(migrateFromLegacyJson(store).migrated).toBe(1);

    const second = migrateFromLegacyJson(store);
    expect(second.skipped).toBe(true);
    expect(second.migrated).toBe(0);
    expect(store.countMemories().active).toBe(1);
  });

  it("überspringt Einträge ohne Titel und Inhalt", () => {
    writeLegacy([
      { title: "", content: "" },
      { tags: ["leer"] },
      { title: "Gut", content: "Da" },
    ]);
    const store = freshStore();
    const res = migrateFromLegacyJson(store);
    expect(res.migrated).toBe(1);
    expect(store.countMemories().active).toBe(1);
  });

  it("überspringt bereits existierende IDs ohne Abbruch", () => {
    const store = freshStore();
    store.createMemory({ title: "Schon da", content: "vorhanden", id: "dup-1" } as never);
    writeLegacy([
      { id: "dup-1", title: "Kollision", content: "wird übersprungen" },
      { id: "neu-1", title: "Neu", content: "kommt rein" },
    ]);
    const res = migrateFromLegacyJson(store);
    // nur der neue Eintrag zählt als migriert
    expect(res.migrated).toBe(1);
    expect(store.getMemory("dup-1")?.title).toBe("Schon da");
    expect(store.getMemory("neu-1")?.title).toBe("Neu");
  });

  it("übersteht kaputtes JSON ohne Crash", () => {
    writeLegacy("{ das ist kein gültiges json ]");
    const store = freshStore();
    const res = migrateFromLegacyJson(store);
    expect(res.migrated).toBe(0);
    expect(res.skipped).toBe(false);
    expect(store.countMemories().active).toBe(0);
  });

  it("ignoriert eine leere Datei (kein Inhalt = keine Quelle)", () => {
    writeLegacy("   \n  ");
    const store = freshStore();
    const res = migrateFromLegacyJson(store);
    expect(res.skipped).toBe(true);
    expect(res.migrated).toBe(0);
  });
});
