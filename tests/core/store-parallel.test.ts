import { describe, it, expect, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { KeptaStore } from "../../src/core/store";

// KEPTA verspricht eine Datenbank fuer alle: Desktop-App, MCP-Server, Python-Client.
// Dann muss ein zweiter Prozess sie auch oeffnen koennen, waehrend ein erster
// gerade schreibt — sonst startet der MCP-Server nicht, sobald die App laeuft.
let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-parallel-"));
});

/** Startet einen Prozess, der die Datenbank sperrt, kurz haelt und wieder freigibt. */
function sperrerStarten(dbPfad: string, haltenMs: number): Promise<() => void> {
  const skript = `
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(${JSON.stringify(dbPfad)});
    db.exec("PRAGMA busy_timeout = 5000");
    db.exec("CREATE TABLE IF NOT EXISTS sperre (x INTEGER)");
    db.exec("BEGIN IMMEDIATE");
    db.exec("INSERT INTO sperre VALUES (1)");
    process.stdout.write("gesperrt\\n");
    setTimeout(() => { db.exec("COMMIT"); db.close(); process.exit(0); }, ${haltenMs});
  `;
  const kind = spawn(process.execPath, ["-e", skript], { stdio: ["ignore", "pipe", "pipe"] });
  return new Promise((res, rej) => {
    const uhr = setTimeout(() => rej(new Error("Sperrer meldete sich nicht")), 10_000);
    kind.stdout.on("data", (b) => {
      if (String(b).includes("gesperrt")) { clearTimeout(uhr); res(() => kind.kill()); }
    });
  });
}

describe("KeptaStore: zweiter Prozess auf derselben Datei", () => {
  it("wartet auf eine fremde Schreibsperre, statt sofort abzubrechen", async () => {
    // Vorher lief `PRAGMA journal_mode = WAL` als allererste Anweisung — also noch
    // mit Wartezeit null. Traf sie eine fremde Sperre, warf SQLite sofort SQLITE_BUSY
    // und der Server starb beim Start. Beim allerersten gemeinsamen Start scheiterten
    // so 7 von 12 Versuchen.
    const dbPfad = path.join(dir, "geteilt.db");
    const beenden = await sperrerStarten(dbPfad, 400);
    try {
      const start = Date.now();
      const store = new KeptaStore(dbPfad);
      const gedauert = Date.now() - start;

      expect(store.countMemories().active).toBe(0);
      // Es muss wirklich gewartet worden sein — sonst hat der Test nichts geprueft.
      expect(gedauert).toBeGreaterThan(100);
      store.db.close();
    } finally {
      beenden();
    }
  });

  it("setzt die Wartezeit, bevor irgendetwas eine Sperre braucht", () => {
    // Reihenfolge ist hier kein Stilfrage: busy_timeout wirkt erst ab der naechsten
    // Anweisung. Steht es hinter journal_mode, ist genau die kritische ungeschuetzt.
    const quelle = fs.readFileSync(path.join(process.cwd(), "src", "core", "store.ts"), "utf-8");
    const wartezeit = quelle.indexOf("PRAGMA busy_timeout");
    const journal = quelle.indexOf("PRAGMA journal_mode");
    expect(wartezeit).toBeGreaterThan(-1);
    expect(wartezeit).toBeLessThan(journal);
  });

  it("teilt Eintraege zwischen zwei Verbindungen auf derselben Datei", () => {
    const dbPfad = path.join(dir, "geteilt2.db");
    const a = new KeptaStore(dbPfad);
    const b = new KeptaStore(dbPfad);
    a.createMemory({ title: "Von A", content: "geschrieben" } as never);
    expect(b.listMemories().map((m) => m.title)).toContain("Von A");
    a.db.close();
    b.db.close();
  });
});
