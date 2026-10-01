// F5 — Verschluesselung: die Beweise hinter docs/encryption-eval.md.
// Bis 2.10 hielt diese Datei fest, dass die Datenbank im Klartext liegt und ein
// PRAGMA key still verpufft. Seit 2.11 verschluesselt KEPTA die Datei (SQLite3
// Multiple Ciphers, SQLCipher-4-Format). Hier steht, was auf der Platte liegt —
// mit und ohne Schluessel. Kein Alibi, nur Befunde.
import { describe, it, expect } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { KeptaStore } from "../src/core/store";
import { defaultExtensions, type KeptaExtensions } from "../src/core/extensions";

const MARKER = "unverwechselbarer-klartext-marker-203";
const SCHLUESSEL = Buffer.alloc(32, 0xa5);

function neuerPfad(): string {
  return path.join(fs.mkdtempSync(path.join(tmpdir(), "kepta-crypt-")), "t.db");
}

function mitSchluessel(gefragt: string[] = []): KeptaExtensions {
  return { ...defaultExtensions(), keys: { keyFor: (p) => { gefragt.push(p); return SCHLUESSEL; } } };
}

/** Hauptdatei + WAL: frische Seiten liegen im WAL-Modus zunaechst in -wal. */
function dbFilesContent(dbPath: string): string {
  let out = "";
  for (const f of [dbPath, dbPath + "-wal"]) {
    try { out += fs.readFileSync(f, "latin1"); } catch { /* keine WAL */ }
  }
  return out;
}

describe("F5 — Verschluesselung", () => {
  it("Befund 1: ohne Schluessel liegt die Datei im Klartext (Tests, KEPTA_ENCRYPTION=off)", () => {
    const p = neuerPfad();
    const store = new KeptaStore(p);
    store.createMemory({ title: "Streng vertraulich", content: MARKER });
    store.db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    expect(dbFilesContent(p)).toContain(MARKER);
    expect(store.verschluesselung).toEqual({ aktiv: false });
    store.close();
  });

  it("Befund 2: mit Schluessel steht der Klartext weder in der Datei noch im WAL", () => {
    const p = neuerPfad();
    const store = new KeptaStore(p, mitSchluessel());
    store.createMemory({ title: "Streng vertraulich", content: MARKER });
    expect(dbFilesContent(p)).not.toContain(MARKER); // vor dem Checkpoint: das WAL ist mitverschluesselt
    store.db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    expect(dbFilesContent(p)).not.toContain(MARKER);
    expect(dbFilesContent(p)).not.toContain("Streng vertraulich");
    expect(fs.readFileSync(p).subarray(0, 16).toString("latin1")).not.toBe("SQLite format 3\0");
    store.close();
  });

  it("Befund 3: der Schluessel wird mit dem echten Pfad gefragt — genau einmal, vor dem Oeffnen", () => {
    const p = neuerPfad();
    const gefragt: string[] = [];
    new KeptaStore(p, mitSchluessel(gefragt)).close();
    expect(gefragt).toEqual([p]);
  });

  it("Befund 4: ein gewoehnliches SQLite (auch ein KEPTA 2.10) liest die Datei nicht", () => {
    const p = neuerPfad();
    const store = new KeptaStore(p, mitSchluessel());
    store.createMemory({ title: "x", content: MARKER });
    store.close();
    const roh = new DatabaseSync(p);
    expect(() => roh.prepare("SELECT content FROM memories").all()).toThrow(/not a database/);
    roh.close();
  });
});
