// F5 — Verschlüsselung-Eval: die Beweise hinter docs/encryption-eval.md.
// Diese Tests halten fest, was der SQLCipher-Steckplatz heute real kann —
// und was ein stiller PRAGMA key NICHT leistet. Kein Alibi, nur Befunde.
import { describe, it, expect } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";
import { defaultExtensions } from "../src/core/extensions";

const MARKER = "unverwechselbarer-klartext-marker-203";

function freshStore(): KeptaStore {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-crypt-"));
  return new KeptaStore(path.join(dir, "t.db"));
}

function fileContent(dbPath: string): string {
  return fs.readFileSync(dbPath, "utf8");
}

/** Hauptdatei + WAL: frische Pages liegen im WAL-Modus zunächst in -wal. */
function dbFilesContent(dbPath: string): string {
  let out = fileContent(dbPath);
  try {
    out += fileContent(dbPath + "-wal");
  } catch {
    // keine WAL vorhanden — Hauptdatei genügt
  }
  return out;
}

describe("F5 — Verschlüsselung-Eval", () => {
  it("Befund 1: die node:sqlite-DB liegt unverschlüsselt auf der Platte (Klartext nachweisbar)", () => {
    const store = freshStore();
    store.createMemory({ title: "Streng vertraulich", content: MARKER });
    store.db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    expect(dbFilesContent(store.dbPath).includes(MARKER)).toBe(true); // Motivation: Verschlüsselung at rest fehlt heute
  });

  it("Befund 2: PRAGMA key läuft still durch und verschlüsselt NICHT (SQLCipher-Gefühl ohne SQLCipher)", () => {
    const store = freshStore();
    store.createMemory({ title: "Kunde", content: MARKER });
    // SQLCipher-typischer Aufruf auf Vanilla-SQLite: kein Fehler, keine Wirkung.
    // Genau das ist das falsche Sicherheitsgefühl, das dieser Test dokumentiert.
    expect(() => store.db.exec("PRAGMA key = 'irgendein-schluessel';")).not.toThrow();
    expect(() => store.db.exec("PRAGMA cipher_page_size = 4096;")).not.toThrow();
    const reopened = new KeptaStore(store.dbPath);
    expect(reopened.getMemory(reopened.listMemories()[0]!.id)?.content).toContain(MARKER);
    reopened.db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    expect(dbFilesContent(store.dbPath).includes(MARKER)).toBe(true); // weiterhin Klartext
  });

  it("Befund 3: die KeyProvider-Naht ist der Bauplatz — keyFor wird gefragt, ohne sie zu brechen", async () => {
    const dir = path.join(fs.mkdtempSync(path.join(tmpdir(), "kepta-crypt-")), "t.db");
    const gefragt: string[] = [];
    const store = new KeptaStore(dir, {
      ...defaultExtensions(),
      keys: { keyFor: async (dbPath) => {
        gefragt.push(dbPath);
        return null; // kein Key → Store öffnet unverschlüsselt (heutiger Default)
      } },
    });
    store.createMemory({ title: "x", content: MARKER });
    store.db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    expect(gefragt).toHaveLength(1);
    expect(gefragt[0]).toBe(path.resolve(dir)); // die Naht bekommt den echten DB-Pfad
    // Ohne Implementierung dahinter bleibt die Datei Klartext — Eval-Fazit, nicht Bug:
    expect(dbFilesContent(dir).includes(MARKER)).toBe(true);
  });
});
