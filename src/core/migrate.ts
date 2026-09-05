// Einmalige, idempotente Migration des Legacy-JSON-Speichers (~/.kepta/memories.json) nach SQLite.
// Vor der Migration landet eine Sicherungskopie in ~/.kepta/backup/.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { KeptaStore } from "./store";
import type { MemoryInput } from "./types";

interface LegacyMemory {
  id?: string;
  title?: string;
  content?: string;
  tags?: unknown;
  createdAt?: number;
  updatedAt?: number;
}

export interface MigrationResult {
  migrated: number;
  skipped: boolean;
  backupPath: string | null;
}

/**
 * Wer KEPTA_DATA_DIR ausdrücklich setzt, meint dieses Verzeichnis — und nur
 * dieses. Vorher wurde zusätzlich im Home gesucht, sodass eine frisch
 * angelegte Datenbank stillschweigend die Altnotizen aus ~/.kepta oder
 * ~/.ki-gehirn aufsog. Fuer eine Kanzlei, die Mandanten ueber getrennte
 * Datenverzeichnisse trennt, waere das ein Uebersprung zwischen Mandaten;
 * beim Testen holt es fremde Daten in den Lauf. Ohne gesetztes
 * KEPTA_DATA_DIR bleiben die Home-Pfade wie bisher.
 */
export function legacyJsonPaths(): string[] {
  const datenVerzeichnis = process.env.KEPTA_DATA_DIR;
  if (datenVerzeichnis) return [path.join(datenVerzeichnis, "memories.json")];

  const home = os.homedir();
  return [path.join(home, ".kepta", "memories.json"), path.join(home, ".ki-gehirn", "memories.json")];
}

export function migrateFromLegacyJson(store: KeptaStore): MigrationResult {
  const done = store.db.prepare("SELECT value FROM meta WHERE key = 'migrated_json_v1'").get() as
    | { value: string }
    | undefined;
  if (done) return { migrated: 0, skipped: true, backupPath: null };

  let sourcePath: string | null = null;
  let raw = "";
  for (const p of legacyJsonPaths()) {
    try {
      const data = fs.readFileSync(p, "utf-8");
      if (data.trim()) {
        raw = data;
        sourcePath = p;
        break;
      }
    } catch {
      // Datei fehlt — nächste Kandidatin
    }
  }
  if (!sourcePath) {
    store.db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('migrated_json_v1', 'no-source')").run();
    return { migrated: 0, skipped: true, backupPath: null };
  }

  // Backup anlegen
  let backupPath: string | null = null;
  try {
    const backupDir = path.join(path.dirname(store.dbPath), "backup");
    fs.mkdirSync(backupDir, { recursive: true });
    backupPath = path.join(backupDir, `memories-pre-sqlite-${Date.now()}.json`);
    fs.writeFileSync(backupPath, raw, "utf-8");
  } catch {
    // Backup darf Migration nicht blockieren
  }

  let memories: LegacyMemory[] = [];
  try {
    const parsed = JSON.parse(raw);
    // Der Legacy-Speicher ist ein nacktes Array, der Backup-Export schreibt
    // {memories:[...]}. Wer ein Backup an die Legacy-Stelle legt, bekam sonst
    // stillschweigend null Knoten — samt Meldung ueber das angelegte Backup.
    if (Array.isArray(parsed)) memories = parsed;
    else if (parsed && Array.isArray((parsed as { memories?: unknown }).memories)) {
      memories = (parsed as { memories: LegacyMemory[] }).memories;
    }
  } catch {
    memories = [];
  }

  let migrated = 0;
  for (const m of memories) {
    const title = typeof m.title === "string" ? m.title : "";
    const content = typeof m.content === "string" ? m.content : "";
    if (!title && !content) continue;
    const input: MemoryInput = {
      id: typeof m.id === "string" && m.id.trim() ? m.id.trim() : undefined,
      scope: "local",
      type: "semantic",
      title: title || "Untitled",
      content,
      tags: Array.isArray(m.tags) ? (m.tags as string[]) : [],
      createdAt: typeof m.createdAt === "number" ? m.createdAt : undefined,
      updatedAt: typeof m.updatedAt === "number" ? m.updatedAt : undefined,
    };
    try {
      const existing = input.id ? store.getMemory(input.id) : null;
      if (!existing) {
        store.createMemory(input);
        migrated++;
      }
    } catch {
      // Konflikte (doppelte IDs) überspringen statt abzubrechen
    }
  }

  store.db
    .prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('migrated_json_v1', ?)")
    .run(`migrated:${migrated}:from:${sourcePath}`);
  return { migrated, skipped: false, backupPath };
}
