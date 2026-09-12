// KEPTA Core — SQLite-Storage (SQLite3 Multiple Ciphers, FTS5, WAL)
// Eine Datei pro Gehirn: ~/.kepta/kepta.db. React-frei, von Server & MCP-Server geteilt.
// Mit Schluessel liegt die Datei verschluesselt auf der Platte (SQLCipher-4-Format).
//
// Nicht mehr node:sqlite: das kann keine verschluesselte Datei oeffnen, und als
// nachladbare Erweiterung gibt es die Verschluesselung nicht — sie sitzt im
// Seitencache von SQLite selbst. Deshalb eine SQLite-Fassung, die sie mitbringt.
import Database from "better-sqlite3-multiple-ciphers";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";
// Die Zuordnung ist reine, abhaengigkeitsfreie Logik — deshalb darf der Kern
// sie benutzen, ohne sich etwas einzuhandeln.
import { klassifiziere } from "./klassifikation";
import type {
  MemoryRecord,
  MemoryInput,
  MemoryPatch,
  MemoryType,
  ListOptions,
  EntityRecord,
  RelationRecord,
  ChunkRecord,
} from "./types";
import { contentTerms } from "./stopwords";
import { defaultExtensions, type KeptaExtensions, type AuditAction } from "./extensions";

const SCHEMA_VERSION = 1;
const VALID_TYPES: MemoryType[] = ["semantic", "episodic", "procedural", "reference"];

export function defaultDataDir(): string {
  const env = process.env.KEPTA_DATA_DIR;
  if (env) return env;
  return path.join(os.homedir(), ".kepta");
}

export function defaultDbPath(): string {
  return path.join(defaultDataDir(), "kepta.db");
}

// ---------- Normalisierung (kleiner Spiegel der Server-Sanitizer) ----------

export function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const t of input) {
    if (typeof t !== "string") continue;
    const tag = t.toLowerCase().trim().replace(/[^a-z0-9\-_äöüß]/g, "").slice(0, 30);
    if (tag.length >= 2 && out.length < 12) out.push(tag);
  }
  return [...new Set(out)];
}

function cleanText(input: unknown, maxLen: number): string {
  if (typeof input !== "string") return "";
  let s = input.replace(/\0/g, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s.trim();
}

function clampConfidence(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 1;
  return Math.min(1, Math.max(0, n));
}

export function newId(): string {
  return `k-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
}

/** Blockierendes Warten — der Store-Konstruktor ist synchron, ein Timer liefe nie. */
function kurzSchlafen(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// ---------- Store ----------

/** Ob die Datei verschluesselt ist — und wenn nicht, warum. Nie der Schluessel selbst. */
export interface Verschluesselung {
  aktiv: boolean;
  /** Wo der Schluessel liegt: macOS Keychain, Windows DPAPI, Secret Service, KEPTA_DB_KEY. */
  ablage?: string;
  /** Bei diesem Start aus einer Klartext-Datei umgewandelt. */
  umgewandelt?: boolean;
  /** Warum die Datei (noch) nicht verschluesselt ist. */
  hinweis?: string;
}

export class KeptaStore {
  readonly db: Database.Database;
  readonly dbPath: string;
  readonly extensions: KeptaExtensions;
  readonly verschluesselung: Verschluesselung;

  constructor(dbPath: string = defaultDbPath(), extensions: KeptaExtensions = defaultExtensions()) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.dbPath = dbPath;
    this.extensions = extensions;

    // Erst der Schluessel, dann die Datei: an ihm haengt, ob sie verschluesselt
    // geoeffnet, vorher umgewandelt oder als Klartext geoeffnet wird.
    let schluessel: Uint8Array | null = null;
    let hinweis: string | undefined;
    let umgewandelt = false;
    try {
      schluessel = extensions.keys.keyFor(dbPath);
    } catch (e) {
      hinweis = fehlertext(e);
    }
    if (schluessel && schluessel.length !== 32) {
      throw new Error("The database key must be 256 bits (32 bytes) — the knowledge base was not opened.");
    }
    if (schluessel) {
      try {
        umgewandelt = verschluessleFallsKlartext(dbPath, schluessel);
      } catch (e) {
        hinweis = fehlertext(e);
        // Ohne Schluessel weiter nur bei einer (noch) unverschluesselten Datei —
        // hat ein anderer Prozess sie inzwischen umgewandelt, oeffnet sie sich mit ihm.
        if (istKlartextDatenbank(dbPath)) schluessel = null;
      }
    }

    this.db = new Database(dbPath);
    // Wartezeit zuerst: busy_timeout wirkt erst ab der naechsten Anweisung.
    this.db.exec("PRAGMA busy_timeout = 5000");
    // Der Schluessel vor jeder Anweisung, die die Datei liest.
    if (schluessel) setzeSchluessel(this.db, schluessel);
    else pruefeLesbar(this.db, hinweis);
    this.walEinschalten();
    this.db.exec("PRAGMA foreign_keys = ON");
    this.migrate();
    const ablage = extensions.keys.ablage;
    this.verschluesselung = schluessel
      ? { aktiv: true, ...(ablage ? { ablage } : {}), ...(umgewandelt ? { umgewandelt } : {}) }
      : { aktiv: false, ...(hinweis ? { hinweis } : {}) };
  }

  /**
   * WAL ist eine Eigenschaft der Datei, nicht der Verbindung: hat ein Prozess sie
   * gesetzt, gilt sie fuer alle weiteren. Fuer journal_mode ruft SQLite aber keinen
   * Busy-Handler auf — busy_timeout hilft hier nicht, der Aufruf wirft sofort
   * "database is locked". Beim ersten gemeinsamen Start von Desktop-App und
   * MCP-Server starb daran jeder zweite Versuch, bevor auch nur ein Werkzeug lief.
   *
   * Also kurz erneut versuchen, und im Zweifel ohne WAL weiterarbeiten: langsamer
   * bei parallelem Zugriff, aber benutzbar. Ein harter Abbruch waere schlimmer als
   * die schlechtere Betriebsart — zumal der andere Prozess WAL ohnehin gerade setzt.
   */
  private walEinschalten(): void {
    for (let versuch = 0; versuch < 20; versuch++) {
      if (this.journalModus() === "wal") return;
      try {
        this.db.exec("PRAGMA journal_mode = WAL");
        return;
      } catch {
        kurzSchlafen(25);
      }
    }
  }

  private journalModus(): string {
    try {
      const zeile = this.db.prepare("PRAGMA journal_mode").get() as { journal_mode?: string } | undefined;
      return String(zeile?.journal_mode ?? "").toLowerCase();
    } catch {
      return "";
    }
  }

  /**
   * Zieht die CHECK-Bedingung des Typs auf vier Werte nach.
   *
   * SQLite kann eine CHECK-Bedingung nicht aendern — die Tabelle muss neu
   * gebaut werden. Das ist der heikelste Eingriff im ganzen Speicher, denn an
   * memories haengen chunks.memory_id und memory_entities.memory_id mit
   * ON DELETE CASCADE: ein Verwerfen der Tabelle bei eingeschalteten
   * Fremdschluesseln loescht den Suchindex und den Begriffsgraphen gleich mit.
   *
   * Deshalb genau nach dem dokumentierten Verfahren:
   *   1. Fremdschluessel AUS (geht nur ausserhalb einer Transaktion),
   *   2. Ausloeser weg — sonst schreiben sie beim Kopieren doppelt in den
   *      Volltextindex,
   *   3. neue Tabelle, Zeilen mit UNVERAENDERTEN rid-Werten kopieren (der
   *      FTS-Index verweist darauf und bleibt so gueltig),
   *   4. alte weg, neue umbenennen,
   *   5. Fremdschluessel wieder AN.
   * Indizes und Ausloeser legt der Rest von migrate() gleich danach wieder an.
   *
   * Warum ueberhaupt: ohne vierten Wert landet jedes uebernommene Dokument als
   * "Fakt" in der Wissensbasis. An einem echten Bestand waren das 2320 von 2421
   * Notizen — eine Einteilung, die nichts mehr einteilt.
   */
  private erweitereTypBeschraenkung(): void {
    const zeile = this.db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='memories'")
      .get() as { sql?: string } | undefined;
    if (!zeile?.sql) return;                       // frische Datenbank
    if (zeile.sql.includes("'reference'")) return; // schon geschehen

    this.db.exec("PRAGMA foreign_keys = OFF");
    try {
      this.db.exec("BEGIN IMMEDIATE");
      this.db.exec(`
        DROP TRIGGER IF EXISTS memories_ai;
        DROP TRIGGER IF EXISTS memories_ad;
        DROP TRIGGER IF EXISTS memories_au;
        CREATE TABLE memories_neu (
          rid INTEGER PRIMARY KEY,
          id TEXT UNIQUE NOT NULL,
          scope TEXT NOT NULL DEFAULT 'local',
          type TEXT NOT NULL DEFAULT 'semantic' CHECK (type IN ('semantic','episodic','procedural','reference')),
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          tags TEXT NOT NULL DEFAULT '[]',
          confidence REAL NOT NULL DEFAULT 1.0,
          valid_from INTEGER,
          valid_to INTEGER,
          superseded_by TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          deleted_at INTEGER,
          last_access_at INTEGER,
          access_count INTEGER NOT NULL DEFAULT 0,
          utility REAL NOT NULL DEFAULT 0.5
        );
        INSERT INTO memories_neu (rid, id, scope, type, title, content, tags, confidence,
          valid_from, valid_to, superseded_by, created_at, updated_at, deleted_at,
          last_access_at, access_count, utility)
        SELECT rid, id, scope, type, title, content, tags, confidence,
          valid_from, valid_to, superseded_by, created_at, updated_at, deleted_at,
          last_access_at, access_count, utility
        FROM memories;
        DROP TABLE memories;
        ALTER TABLE memories_neu RENAME TO memories;
      `);
      this.db.exec("COMMIT");
    } catch (e) {
      try { this.db.exec("ROLLBACK"); } catch { /* keine offene Transaktion */ }
      this.db.exec("PRAGMA foreign_keys = ON");
      throw e;
    }
    this.db.exec("PRAGMA foreign_keys = ON");
  }

  private migrate() {
    this.erweitereTypBeschraenkung();
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS einstellungen (schluessel TEXT PRIMARY KEY, wert TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS memories (
        rid INTEGER PRIMARY KEY,
        id TEXT UNIQUE NOT NULL,
        scope TEXT NOT NULL DEFAULT 'local',
        type TEXT NOT NULL DEFAULT 'semantic' CHECK (type IN ('semantic','episodic','procedural','reference')),
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        confidence REAL NOT NULL DEFAULT 1.0,
        valid_from INTEGER,
        valid_to INTEGER,
        superseded_by TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        last_access_at INTEGER,
        access_count INTEGER NOT NULL DEFAULT 0,
        utility REAL NOT NULL DEFAULT 0.5
      );
      CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope);
      CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
      CREATE INDEX IF NOT EXISTS idx_memories_deleted ON memories(deleted_at);
      CREATE INDEX IF NOT EXISTS idx_memories_updated ON memories(updated_at);

      CREATE TABLE IF NOT EXISTS chunks (
        memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        text TEXT NOT NULL,
        embedding BLOB,
        embedding_model TEXT,
        PRIMARY KEY (memory_id, seq)
      );

      CREATE TABLE IF NOT EXISTS entities (
        id INTEGER PRIMARY KEY,
        name TEXT UNIQUE NOT NULL
      );
      CREATE TABLE IF NOT EXISTS memory_entities (
        memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
        entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        PRIMARY KEY (memory_id, entity_id)
      );
      CREATE TABLE IF NOT EXISTS relations (
        id INTEGER PRIMARY KEY,
        source_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        target_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        relation TEXT NOT NULL DEFAULT 'related',
        valid_from INTEGER,
        valid_to INTEGER,
        memory_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_relations_source ON relations(source_id);
      CREATE INDEX IF NOT EXISTS idx_relations_target ON relations(target_id);
    `);

    // FTS5 über externe Tabelle, via Trigger synchron gehalten
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        title, content, tags,
        content='memories', content_rowid='rid',
        tokenize='unicode61 remove_diacritics 2'
      );
      CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, title, content, tags)
        VALUES (new.rid, new.title, new.content, new.tags);
      END;
      CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, title, content, tags)
        VALUES ('delete', old.rid, old.title, old.content, old.tags);
      END;
      CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, title, content, tags)
        VALUES ('delete', old.rid, old.title, old.content, old.tags);
        INSERT INTO memories_fts(rowid, title, content, tags)
        VALUES (new.rid, new.title, new.content, new.tags);
      END;
    `);

    const row = this.db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string } | undefined;
    if (!row) {
      this.db.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', ?)").run(String(SCHEMA_VERSION));
    }
    // Additive Spalten idempotent nachziehen (ALTER schlägt fehl, wenn vorhanden)
    const columns = [
      ["last_access_at", "INTEGER"],
      ["access_count", "INTEGER NOT NULL DEFAULT 0"],
      ["utility", "REAL NOT NULL DEFAULT 0.5"],
    ] as const;
    for (const [name, type] of columns) {
      try {
        this.db.exec(`ALTER TABLE memories ADD COLUMN ${name} ${type}`);
      } catch {
        // Spalte existiert bereits
      }
    }
  }

  // ---------- Einstellungen ----------
  // Sie liegen in derselben Datei wie das Wissen und sind damit genauso
  // verschluesselt — bis 2.10 standen sie samt KI-Zugangsschluessel als
  // settings.json im Klartext daneben.

  einstellungen(): Record<string, string> {
    const aus: Record<string, string> = {};
    const zeilen = this.db.prepare("SELECT schluessel, wert FROM einstellungen ORDER BY schluessel").all() as Array<{ schluessel: string; wert: string }>;
    for (const z of zeilen) aus[z.schluessel] = z.wert;
    return aus;
  }

  /** Setzt oder loescht (null) Eintraege in einer Transaktion; liefert, wie viele es danach gibt. */
  setzeEinstellungen(aenderungen: Record<string, string | null>): number {
    const setzen = this.db.prepare(
      "INSERT INTO einstellungen (schluessel, wert) VALUES (?, ?) ON CONFLICT(schluessel) DO UPDATE SET wert = excluded.wert",
    );
    const loeschen = this.db.prepare("DELETE FROM einstellungen WHERE schluessel = ?");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const [k, v] of Object.entries(aenderungen)) {
        if (v === null) loeschen.run(k);
        else setzen.run(k, v);
      }
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    return (this.db.prepare("SELECT count(*) AS n FROM einstellungen").get() as { n: number }).n;
  }

  /**
   * Der Wiederherstellungsschluessel: derselbe 256-Bit-Schluessel, mit dem die
   * Datei verschluesselt ist, als Hex. Fuer den Knopf "Recovery key" in der
   * Oberflaeche — wer ihn im Passwort-Manager hat, oeffnet die Wissensbasis und
   * ihre Sicherungen auch auf einem neuen Rechner (KEPTA_DB_KEY oder zurueck in
   * den Schluesselbund). Im Alltag braucht ihn niemand: Store und MCP-Server
   * holen den Schluessel selbst. Null, wenn die Datei nicht verschluesselt ist.
   */
  wiederherstellungsSchluessel(): string | null {
    if (!this.verschluesselung.aktiv) return null;
    const schluessel = this.extensions.keys.keyFor(this.dbPath);
    return schluessel ? Buffer.from(schluessel).toString("hex") : null;
  }

  close() {
    this.db.close();
  }

  private actor(): { actorId: string; scope: string } {
    return this.extensions.identity.current();
  }

  audit(action: AuditAction, target?: string, detail?: Record<string, unknown>): void {
    try {
      this.extensions.audit.emit({ at: new Date().toISOString(), actorId: this.actor().actorId, action, target, detail });
    } catch {
      // audit must never break the memory
    }
  }

  // ---------- Mapping ----------

  private rowToRecord(r: Record<string, unknown>): MemoryRecord {
    let tags: string[] = [];
    try {
      const parsed = JSON.parse(String(r.tags ?? "[]"));
      if (Array.isArray(parsed)) tags = parsed;
    } catch {
      tags = [];
    }
    return {
      id: String(r.id),
      scope: String(r.scope),
      type: r.type as MemoryType,
      title: String(r.title),
      content: String(r.content),
      tags,
      confidence: Number(r.confidence),
      validFrom: (r.valid_from as number | null) ?? null,
      validTo: (r.valid_to as number | null) ?? null,
      supersededBy: (r.superseded_by as string | null) ?? null,
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
      deletedAt: (r.deleted_at as number | null) ?? null,
      lastAccessAt: (r.last_access_at as number | null) ?? null,
      accessCount: Number(r.access_count ?? 0),
      utility: Number(r.utility ?? 0.5),
    };
  }

  private static readonly COLS =
    "id, scope, type, title, content, tags, confidence, valid_from, valid_to, superseded_by, created_at, updated_at, deleted_at, last_access_at, access_count, utility";

  private getRow(id: string): Record<string, unknown> | undefined {
    return this.db.prepare(`SELECT ${KeptaStore.COLS} FROM memories WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
  }

  // ---------- CRUD ----------

  listMemories(opts: ListOptions = {}): MemoryRecord[] {
    // Kappe 5000 = Server-Limit für aktive Knoten (server.ts), damit Export/Import
    // bei vollem Gehirn nicht still abschneiden. Vollständigkeit sichern Aufrufer
    // über Paginierung (offset), nicht über einen höheren Einzel-Page-Limit.
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 5000);
    const offset = Math.max(opts.offset ?? 0, 0);
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (opts.trash) where.push("deleted_at IS NOT NULL");
    else where.push("deleted_at IS NULL");
    if (opts.type) {
      where.push("type = ?");
      params.push(opts.type);
    }
    if (opts.scope) {
      where.push("scope = ?");
      params.push(opts.scope);
    }
    if (opts.tag) {
      // LIKE-Wildcards im Tag escapen (% _ \ ") — sonst matcht z.B. "a_b" auch "axb"
      const escaped = opts.tag.toLowerCase().replace(/[\\%_"]/g, (c) => `\\${c}`);
      where.push("tags LIKE ? ESCAPE '\\'");
      params.push(`%"${escaped}"%`);
    }
    const sql = `SELECT ${KeptaStore.COLS} FROM memories WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map((r) => this.rowToRecord(r));
  }

  countMemories(): { active: number; trashed: number } {
    const active = (this.db.prepare("SELECT COUNT(*) c FROM memories WHERE deleted_at IS NULL").get() as { c: number }).c;
    const trashed = (this.db.prepare("SELECT COUNT(*) c FROM memories WHERE deleted_at IS NOT NULL").get() as { c: number }).c;
    return { active, trashed };
  }

  getMemory(id: string): MemoryRecord | null {
    const row = this.getRow(id);
    if (!row) return null;
    const record = this.rowToRecord(row);
    if (!this.extensions.policy.canRead(this.actor(), { id: record.id, scope: record.scope, type: record.type })) return null;
    this.audit("read", record.id);
    return record;
  }

  findByTitle(title: string): MemoryRecord | null {
    const row = this.db
      .prepare(`SELECT ${KeptaStore.COLS} FROM memories WHERE title = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1`)
      .get(title.trim()) as Record<string, unknown> | undefined;
    return row ? this.rowToRecord(row) : null;
  }

  createMemory(input: MemoryInput): MemoryRecord {
    const now = Date.now();
    const id = input.id?.trim() || newId();
    if (!this.extensions.policy.canWrite(this.actor(), { id, scope: input.scope ?? this.actor().scope, type: input.type ?? "semantic" })) {
      throw new Error("Schreiben verweigert (PolicyGate)");
    }
    const existing = this.getRow(id);
    if (existing) throw new Error(`Memory existiert bereits: ${id}`);
    const record: MemoryRecord = {
      id,
      scope: input.scope ?? this.actor().scope,
      // Ohne ausdrueckliche Angabe entscheiden die Regeln — nicht ein
      // Rueckfall auf "Fakt". Genau der machte die Einteilung wertlos: der
      // Rechner-Scan setzte nie einen Typ, und ein ueber MCP gespeichertes
      // "1. Kabel anschliessen 2. Treiber laden 3. Testseite drucken" landete
      // als Fakt statt als Anleitung.
      type: input.type && VALID_TYPES.includes(input.type)
        ? input.type
        : klassifiziere({ title: input.title ?? "", content: input.content ?? "", tags: input.tags }).typ,
      title: cleanText(input.title, 200) || "Untitled",
      content: cleanText(input.content, 200_000),
      tags: normalizeTags(input.tags),
      confidence: clampConfidence(input.confidence),
      validFrom: input.validFrom ?? null,
      validTo: input.validTo ?? null,
      supersededBy: null,
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now,
      deletedAt: null,
      lastAccessAt: null,
      accessCount: 0,
      utility: 0.5,
    };
    this.db
      .prepare(
        `INSERT INTO memories (id, scope, type, title, content, tags, confidence, valid_from, valid_to, superseded_by, created_at, updated_at, deleted_at, last_access_at, access_count, utility)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.scope,
        record.type,
        record.title,
        record.content,
        JSON.stringify(record.tags),
        record.confidence,
        record.validFrom,
        record.validTo,
        record.supersededBy,
        record.createdAt,
        record.updatedAt,
        record.deletedAt,
        record.lastAccessAt,
        record.accessCount,
        record.utility
      );
    this.audit("write", record.id);
    return record;
  }

  upsertMemory(input: MemoryInput): { record: MemoryRecord; created: boolean } {
    if (input.id) {
      const existing = this.getMemory(input.id);
      if (existing) {
        const updated = this.updateMemory(input.id, {
          title: input.title,
          content: input.content,
          tags: input.tags !== undefined ? normalizeTags(input.tags) : undefined,
          type: input.type,
          scope: input.scope,
          confidence: input.confidence,
          validFrom: input.validFrom,
          validTo: input.validTo,
          // Import/Resync dürfen Zeitstempel aus der Quelle erhalten (optionaler Parameter)
          updatedAt: input.updatedAt,
        });
        // updateMemory kann bei rein identischen Daten nicht null liefern, aber defensiv bleiben
        return { record: updated ?? existing, created: false };
      }
    }
    return { record: this.createMemory(input), created: true };
  }

  updateMemory(id: string, patch: MemoryPatch): MemoryRecord | null {
    const row = this.getRow(id);
    if (!row) return null;
    const sets: string[] = [];
    const params: (string | number | null)[] = [];
    if (patch.title !== undefined) {
      sets.push("title = ?");
      params.push(cleanText(patch.title, 200) || "Untitled");
    }
    if (patch.content !== undefined) {
      sets.push("content = ?");
      params.push(cleanText(patch.content, 200_000));
    }
    if (patch.tags !== undefined) {
      sets.push("tags = ?");
      params.push(JSON.stringify(normalizeTags(patch.tags)));
    }
    if (patch.type !== undefined && VALID_TYPES.includes(patch.type)) {
      sets.push("type = ?");
      params.push(patch.type);
    }
    if (patch.scope !== undefined) {
      sets.push("scope = ?");
      params.push(patch.scope);
    }
    if (patch.confidence !== undefined) {
      sets.push("confidence = ?");
      params.push(clampConfidence(patch.confidence));
    }
    if (patch.validFrom !== undefined) {
      sets.push("valid_from = ?");
      params.push(patch.validFrom);
    }
    if (patch.validTo !== undefined) {
      sets.push("valid_to = ?");
      params.push(patch.validTo);
    }
    if (patch.supersededBy !== undefined) {
      sets.push("superseded_by = ?");
      params.push(patch.supersededBy);
    }
    if (sets.length === 0) return this.rowToRecord(row);
    // Explizites updatedAt (Import/Resync) gewinnt — sonst "jetzt"
    sets.push("updated_at = ?");
    params.push(patch.updatedAt ?? Date.now());
    params.push(id);
    if (!this.extensions.policy.canWrite(this.actor(), { id, scope: String(row.scope), type: String(row.type) })) {
      throw new Error("Write denied (PolicyGate)");
    }
    this.db.prepare(`UPDATE memories SET ${sets.join(", ")} WHERE id = ?`).run(...params);
    // Content-Änderung macht Chunks + Embeddings obsolet
    if (patch.content !== undefined) this.db.prepare("DELETE FROM chunks WHERE memory_id = ?").run(id);
    this.audit("update", id);
    return this.getMemory(id);
  }

  trashMemory(id: string): boolean {
    const res = this.db.prepare("UPDATE memories SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL").run(Date.now(), id);
    const ok = Number(res.changes) > 0;
    if (ok) this.audit("delete", id);
    return ok;
  }

  restoreMemory(id: string): boolean {
    const res = this.db.prepare("UPDATE memories SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL").run(id);
    return Number(res.changes) > 0;
  }

  purgeMemory(id: string): boolean {
    const res = this.db.prepare("DELETE FROM memories WHERE id = ?").run(id);
    const ok = Number(res.changes) > 0;
    if (ok) this.audit("delete", id);
    return ok;
  }

  // ---------- Superseding (temporale Invalidierung) ----------

  supersedeMemory(oldId: string, newId: string | null): MemoryRecord | null {
    return this.updateMemory(oldId, { supersededBy: newId });
  }

  // ---------- Retention / Zugriffs-Statistik (Oblivion) ----------

  /** Suchtreffer: Zugänglichkeit aktualisieren (Frequenz + zuletzt zugegriffen) */
  recordAccess(ids: string[]): void {
    if (ids.length === 0) return;
    const now = Date.now();
    const stmt = this.db.prepare("UPDATE memories SET last_access_at = ?, access_count = access_count + 1 WHERE id = ?");
    this.db.exec("BEGIN");
    try {
      for (const id of new Set(ids)) stmt.run(now, id);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  /** Utility-Reinforcement: Memory hat zu einer Antwort beigetragen */
  reinforceMemory(id: string, delta = 0.05): void {
    this.db
      .prepare("UPDATE memories SET utility = MAX(0, MIN(1, utility + ?)) WHERE id = ?")
      .run(delta, id);
  }

  // ---------- Chunks & Embeddings ----------

  replaceChunks(memoryId: string, texts: string[]): void {
    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM chunks WHERE memory_id = ?").run(memoryId);
      const ins = this.db.prepare("INSERT INTO chunks (memory_id, seq, text, embedding, embedding_model) VALUES (?, ?, ?, NULL, NULL)");
      texts.forEach((t, seq) => ins.run(memoryId, seq, t));
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  getChunks(memoryId: string): ChunkRecord[] {
    const rows = this.db
      .prepare("SELECT memory_id, seq, text, embedding, embedding_model FROM chunks WHERE memory_id = ? ORDER BY seq")
      .all(memoryId) as Record<string, unknown>[];
    return rows.map((r) => ({
      memoryId: String(r.memory_id),
      seq: Number(r.seq),
      text: String(r.text),
      embedding: r.embedding ? blobToFloat32(r.embedding as Buffer) : null,
      embeddingModel: (r.embedding_model as string | null) ?? null,
    }));
  }

  setEmbedding(memoryId: string, seq: number, embedding: Float32Array, model: string): void {
    this.db
      .prepare("UPDATE chunks SET embedding = ?, embedding_model = ? WHERE memory_id = ? AND seq = ?")
      .run(float32ToBlob(embedding), model, memoryId, seq);
  }

  /** Chunks ohne Embedding oder mit veraltetem Modell (für die Hintergrund-Queue) */
  chunksNeedingEmbedding(limit = 64, model?: string): { memoryId: string; seq: number; text: string }[] {
    // Mit Modell-Argument zählt auch ein Modell-Mismatch als "braucht Embedding" —
    // sonst werden Chunks nach einem Modellwechsel nie neu eingebettet.
    const sql = model
      ? "SELECT memory_id, seq, text FROM chunks WHERE embedding IS NULL OR embedding_model IS NULL OR embedding_model <> ? LIMIT ?"
      : "SELECT memory_id, seq, text FROM chunks WHERE embedding IS NULL LIMIT ?";
    const rows = (
      model ? this.db.prepare(sql).all(model, limit) : this.db.prepare(sql).all(limit)
    ) as Record<string, unknown>[];
    return rows.map((r) => ({ memoryId: String(r.memory_id), seq: Number(r.seq), text: String(r.text) }));
  }

  /** Chunk-Text + Embedding aller aktiven Memories (für die Vektor-Suche) */
  allEmbeddableChunks(): { memoryId: string; seq: number; text: string; embedding: Float32Array; model: string }[] {
    const rows = this.db
      .prepare("SELECT memory_id, seq, text, embedding, embedding_model FROM chunks WHERE embedding IS NOT NULL")
      .all() as Record<string, unknown>[];
    return rows.map((r) => ({
      memoryId: String(r.memory_id),
      seq: Number(r.seq),
      text: String(r.text),
      embedding: blobToFloat32(r.embedding as Buffer),
      model: String(r.embedding_model ?? ""),
    }));
  }

  embeddingStats(): { total: number; embedded: number; models: Record<string, number> } {
    const total = (this.db.prepare("SELECT COUNT(*) c FROM chunks").get() as { c: number }).c;
    const embedded = (this.db.prepare("SELECT COUNT(*) c FROM chunks WHERE embedding IS NOT NULL").get() as { c: number }).c;
    const modelRows = this.db
      .prepare("SELECT embedding_model m, COUNT(*) c FROM chunks WHERE embedding IS NOT NULL GROUP BY embedding_model")
      .all() as Record<string, unknown>[];
    const models: Record<string, number> = {};
    for (const r of modelRows) models[String(r.m ?? "unknown")] = Number(r.c);
    return { total, embedded, models };
  }

  // ---------- Entities & Relations ----------

  private ensureEntity(name: string): number {
    const clean = name.trim().toLowerCase().slice(0, 80);
    const hit = this.db.prepare("SELECT id FROM entities WHERE name = ?").get(clean) as { id: number } | undefined;
    if (hit) return hit.id;
    const res = this.db.prepare("INSERT INTO entities (name) VALUES (?)").run(clean);
    return Number(res.lastInsertRowid);
  }

  /** Verknüpft eine Memory mit Entitäten (idempotent) */
  linkEntities(memoryId: string, names: string[]): number[] {
    const ids: number[] = [];
    for (const name of names.slice(0, 40)) {
      if (typeof name !== "string" || name.trim().length < 2) continue;
      const eid = this.ensureEntity(name);
      this.db.prepare("INSERT OR IGNORE INTO memory_entities (memory_id, entity_id) VALUES (?, ?)").run(memoryId, eid);
      ids.push(eid);
    }
    return ids;
  }

  addRelation(source: string, target: string, relation: string, memoryId: string | null, validFrom: number | null = null, validTo: number | null = null): RelationRecord {
    const sid = this.ensureEntity(source);
    const tid = this.ensureEntity(target);
    const res = this.db
      .prepare("INSERT INTO relations (source_id, target_id, relation, valid_from, valid_to, memory_id) VALUES (?, ?, ?, ?, ?, ?)")
      .run(sid, tid, relation.trim().toLowerCase().slice(0, 40) || "related", validFrom, validTo, memoryId);
    return { id: Number(res.lastInsertRowid), sourceId: sid, targetId: tid, relation, validFrom, validTo, memoryId };
  }

  getEntityByName(name: string): EntityRecord | null {
    const row = this.db.prepare("SELECT id, name FROM entities WHERE name = ?").get(name.trim().toLowerCase()) as
      | { id: number; name: string }
      | undefined;
    return row ?? null;
  }

  /** Subgraph um eine Entität (oder der ganze Graph, gekappt) */
  getGraph(entity?: string, depth = 2): {
    entities: EntityRecord[];
    relations: RelationRecord[];
  } {
    if (entity) {
      const start = this.getEntityByName(entity);
      if (!start) return { entities: [], relations: [] };
      const nodes = new Set<number>([start.id]);
      const expanded = new Set<number>();
      const seenRel = new Set<number>();
      const relations: RelationRecord[] = [];
      let frontierIds = [start.id];
      for (let d = 0; d < Math.max(1, depth); d++) {
        if (frontierIds.length === 0) break;
        const placeholders = frontierIds.map(() => "?").join(",");
        const rows = this.db
          .prepare(
            `SELECT id, source_id, target_id, relation, valid_from, valid_to, memory_id FROM relations
             WHERE source_id IN (${placeholders}) OR target_id IN (${placeholders})`
          )
          .all(...frontierIds, ...frontierIds) as Record<string, unknown>[];
        const nextIds: number[] = [];
        for (const r of rows) {
          const rel: RelationRecord = {
            id: Number(r.id),
            sourceId: Number(r.source_id),
            targetId: Number(r.target_id),
            relation: String(r.relation),
            validFrom: (r.valid_from as number | null) ?? null,
            validTo: (r.valid_to as number | null) ?? null,
            memoryId: (r.memory_id as string | null) ?? null,
          };
          if (!seenRel.has(rel.id)) {
            seenRel.add(rel.id);
            relations.push(rel);
          }
          nodes.add(rel.sourceId);
          nodes.add(rel.targetId);
          nextIds.push(rel.sourceId, rel.targetId);
        }
        for (const id of frontierIds) expanded.add(id);
        frontierIds = [...new Set(nextIds)].filter((id) => !expanded.has(id));
      }
      const ids = [...nodes];
      const placeholders = ids.map(() => "?").join(",");
      const entities = (
        this.db.prepare(`SELECT id, name FROM entities WHERE id IN (${placeholders})`).all(...ids) as Record<string, unknown>[]
      ).map((r) => ({ id: Number(r.id), name: String(r.name) }));
      return { entities, relations };
    }
    const entities = (this.db.prepare("SELECT id, name FROM entities LIMIT 500").all() as Record<string, unknown>[]).map((r) => ({
      id: Number(r.id),
      name: String(r.name),
    }));
    const relations = (
      this.db.prepare("SELECT id, source_id, target_id, relation, valid_from, valid_to, memory_id FROM relations LIMIT 2000").all() as Record<string, unknown>[]
    ).map((r) => ({
      id: Number(r.id),
      sourceId: Number(r.source_id),
      targetId: Number(r.target_id),
      relation: String(r.relation),
      validFrom: (r.valid_from as number | null) ?? null,
      validTo: (r.valid_to as number | null) ?? null,
      memoryId: (r.memory_id as string | null) ?? null,
    }));
    return { entities, relations };
  }

  /** Memory-IDs, die eine der Entitäten mentionen */
  memoryIdsForEntities(entityIds: number[]): Set<string> {
    if (entityIds.length === 0) return new Set();
    const placeholders = entityIds.map(() => "?").join(",");
    const rows = this.db
      .prepare(`SELECT DISTINCT memory_id FROM memory_entities WHERE entity_id IN (${placeholders})`)
      .all(...entityIds) as Record<string, unknown>[];
    return new Set(rows.map((r) => String(r.memory_id)));
  }

  entityNamesForMemory(memoryId: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT e.name FROM entities e JOIN memory_entities me ON me.entity_id = e.id WHERE me.memory_id = ?`
      )
      .all(memoryId) as Record<string, unknown>[];
    return rows.map((r) => String(r.name));
  }

  // ---------- FTS ----------

  ftsSearch(query: string, limit = 50): { id: string; bm25: number }[] {
    // FTS5-Syntax des Users entschärfen: Anführungszeichen pro Term.
    // contentTerms wirft zusätzlich Füllwörter weg — ohne das matchte eine Notiz
    // allein deshalb, weil sie "with" oder "die" enthält, bekam dadurch einen
    // BM25-Rang und verdrängte über die RRF-Fusion den eigentlichen Treffer.
    const terms = contentTerms(query);
    if (terms.length === 0) return [];
    const match = terms.map((t) => `"${t}"`).join(" OR ");
    try {
      const rows = this.db
        .prepare(
          `SELECT m.id, bm25(memories_fts) AS rank
           FROM memories_fts JOIN memories m ON m.rid = memories_fts.rowid
           WHERE memories_fts MATCH ? AND m.deleted_at IS NULL
           ORDER BY rank LIMIT ?`
        )
        .all(match, limit) as Record<string, unknown>[];
      return rows.map((r) => ({ id: String(r.id), bm25: Number(r.rank) }));
    } catch {
      return [];
    }
  }
}

// ---------- Float32 <-> BLOB ----------

export function float32ToBlob(vec: Float32Array): Buffer {
  const buf = Buffer.alloc(vec.length * 4);
  for (let i = 0; i < vec.length; i++) buf.writeFloatLE(vec[i]!, i * 4);
  return buf;
}

export function blobToFloat32(buf: Uint8Array): Float32Array {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out = new Float32Array(Math.floor(buf.byteLength / 4));
  for (let i = 0; i < out.length; i++) out[i] = view.getFloat32(i * 4, true);
  return out;
}

// ---------- Verschluesselung ----------

const KLARTEXT_KOPF = Buffer.from("SQLite format 3\0", "latin1");
/** Die Kopie, die waehrend der Umwandlung verschluesselt wird. */
const KOPIE = ".encrypting";
/** Sperre: nur ein KEPTA-Prozess wandelt um, die anderen warten. */
const SPERRE = ".encrypting-lock";
const VERWAIST_MS = 10 * 60_000;
const ANDERES_PROGRAMM =
  "The knowledge base is open in another program (an AI agent over MCP, an older KEPTA?) — it stays unencrypted until KEPTA has it to itself. Close the other program and restart KEPTA.";
const WIRD_UMGEWANDELT = "The knowledge base is being encrypted by another KEPTA process — try again in a moment.";

function fehlertext(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function sqliteCode(e: unknown): string {
  return String((e as { code?: unknown }).code ?? "");
}

/** Beginnt die Datei mit dem SQLite-Kopf, liegt sie im Klartext da. Fehlt sie oder ist sie leer: nein. */
export function istKlartextDatenbank(dbPath: string): boolean {
  let fd: number;
  try {
    fd = fs.openSync(dbPath, "r");
  } catch {
    return false;
  }
  try {
    const kopf = Buffer.alloc(16);
    return fs.readSync(fd, kopf, 0, 16, 0) === 16 && kopf.equals(KLARTEXT_KOPF);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * SQLCipher-4-Format (AES-256, HMAC-SHA512 je Seite) mit einem rohen
 * 256-Bit-Schluessel — kein Passwort, also auch keine Schluesselableitung, die
 * jeden Start verlangsamt. Das Format ist offen: mit dem Schluessel oeffnet jedes
 * SQLCipher-Werkzeug die Datei, KEPTA sperrt niemanden ein.
 */
function schluesselPragmas(db: Database.Database, schluessel: Uint8Array, pragma: "key" | "rekey"): void {
  db.pragma("cipher = 'sqlcipher'");
  db.pragma("legacy = 4");
  db.pragma(`${pragma} = "x'${Buffer.from(schluessel).toString("hex")}'"`);
}

function setzeSchluessel(db: Database.Database, schluessel: Uint8Array): void {
  schluesselPragmas(db, schluessel, "key");
  try {
    db.prepare("SELECT count(*) FROM sqlite_master").get();
  } catch (e) {
    db.close();
    if (sqliteCode(e) === "SQLITE_NOTADB") {
      throw new Error("The knowledge base could not be opened with its key — the key in the keychain does not belong to this database. Nothing was changed.");
    }
    throw e;
  }
}

/** Ohne Schluessel: eine verschluesselte Datei darf nicht still als leeres Gehirn weiterlaufen. */
function pruefeLesbar(db: Database.Database, hinweis: string | undefined): void {
  try {
    db.prepare("SELECT count(*) FROM sqlite_master").get();
  } catch (e) {
    db.close();
    if (sqliteCode(e) === "SQLITE_NOTADB") {
      throw new Error(`The knowledge base is encrypted, but its key is not available${hinweis ? `: ${hinweis}` : "."}`);
    }
    throw e;
  }
}

/** Zeilen je Tabelle — der Vergleich zwischen Original und verschluesselter Kopie. */
function zaehleZeilen(db: Database.Database): string {
  const tabellen = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as Array<{ name: string }>;
  return tabellen
    .map(({ name }) => `${name}:${(db.prepare(`SELECT count(*) AS n FROM "${name.replace(/"/g, '""')}"`).get() as { n: number }).n}`)
    .join(",");
}

function prozessLebt(pid: number | null): boolean {
  if (pid === null) return true; // Sperre gerade erst angelegt, noch ohne Inhalt
  if (pid === process.pid) return false; // wir wandeln nicht um, waehrend wir warten
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

function leseSperre(dbPath: string): { pid: number | null; seit: number } | null {
  let roh: string;
  let seit: number;
  try {
    roh = fs.readFileSync(dbPath + SPERRE, "utf8");
    seit = fs.statSync(dbPath + SPERRE).mtimeMs;
  } catch {
    return null;
  }
  try {
    const j = JSON.parse(roh) as { pid?: unknown; seit?: unknown };
    if (typeof j.pid === "number" && typeof j.seit === "number") return { pid: j.pid, seit: j.seit };
  } catch {
    // leer oder halb geschrieben
  }
  return { pid: null, seit };
}

/**
 * Wartet, solange ein anderer KEPTA-Prozess die Datei gerade umwandelt. Eine
 * Sperre, deren Prozess nicht mehr lebt (Absturz, Stromausfall), wird samt
 * halbfertiger Kopie weggeraeumt — das Original ist in dem Fall unberuehrt.
 */
export function warteAufUmwandlung(dbPath: string, maxWarteMs = 120_000): void {
  const bis = Date.now() + maxWarteMs;
  for (;;) {
    const sperre = leseSperre(dbPath);
    if (!sperre) return;
    if (!prozessLebt(sperre.pid) || Date.now() - sperre.seit > VERWAIST_MS) {
      fs.rmSync(dbPath + SPERRE, { force: true });
      fs.rmSync(dbPath + KOPIE, { force: true });
      return;
    }
    if (Date.now() >= bis) throw new Error(WIRD_UMGEWANDELT);
    kurzSchlafen(100);
  }
}

function sperreNehmen(dbPath: string): number | null {
  try {
    const fd = fs.openSync(dbPath + SPERRE, "wx");
    fs.writeSync(fd, JSON.stringify({ pid: process.pid, seit: Date.now() }));
    return fd;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") return null;
    throw e;
  }
}

/**
 * Wandelt eine Klartext-Datenbank beim Oeffnen um — genau ein Prozess, die
 * anderen warten. Liefert true, wenn DIESER Aufruf umgewandelt hat; wirft mit
 * einer Meldung fuer den Nutzer, wenn es gerade nicht geht (das Original bleibt dann, wie es war).
 */
export function verschluessleFallsKlartext(dbPath: string, schluessel: Uint8Array, plattform: string = process.platform): boolean {
  for (let versuch = 0; versuch < 3; versuch++) {
    warteAufUmwandlung(dbPath);
    if (!istKlartextDatenbank(dbPath)) return false;
    const sperre = sperreNehmen(dbPath);
    if (sperre === null) continue; // ein anderer KEPTA-Prozess war schneller — auf ihn warten
    try {
      if (!istKlartextDatenbank(dbPath)) return false;
      verschluessleKlartextDatenbank(dbPath, schluessel, plattform);
      return true;
    } finally {
      fs.closeSync(sperre);
      fs.rmSync(dbPath + SPERRE, { force: true });
    }
  }
  throw new Error(WIRD_UMGEWANDELT);
}

/**
 * Wandelt eine Klartext-Datenbank in eine verschluesselte um — nur, wenn KEPTA
 * sie gerade fuer sich allein hat, und so, dass in keinem Moment etwas verloren geht:
 *   1. Allein? Aus dem WAL-Modus kommt SQLite nur heraus, wenn keine andere
 *      Verbindung die Datei offen hat. Sonst: abbrechen, nichts ist passiert.
 *   2. Exklusive Sperre bis zum Schluss — niemand sonst liest oder schreibt.
 *   3. Kopie ziehen, die KOPIE verschluesseln, neu oeffnen und pruefen: gleiche
 *      Zeilen in jeder Tabelle, integrity_check "ok", kein Klartextkopf mehr.
 *   4. Die gepruefte Kopie ersetzt das Original in einem Schritt (rename).
 *   5. Die alte Datei wird genullt, solange die Sperre noch gilt: wer sie in
 *      diesem Moment noch offen hatte, findet danach nichts Lesbares mehr — statt
 *      unbemerkt auf einer verwaisten Klartextdatei weiterzuschreiben.
 * Scheitert ein Schritt vor 4, bleibt das Original unberuehrt, die Kopie verschwindet.
 */
export function verschluessleKlartextDatenbank(dbPath: string, schluessel: Uint8Array, plattform: string = process.platform): void {
  const kopie = dbPath + KOPIE;
  fs.rmSync(kopie, { force: true });
  const original = new Database(dbPath);
  let offen = true;
  try {
    original.pragma("busy_timeout = 2000");
    if (String(original.pragma("journal_mode = DELETE", { simple: true })).toLowerCase() !== "delete") {
      throw new Error(ANDERES_PROGRAMM);
    }
    original.pragma("locking_mode = EXCLUSIVE");
    original.exec("BEGIN EXCLUSIVE; COMMIT;");
    const zeilen = zaehleZeilen(original);

    fs.copyFileSync(dbPath, kopie);
    const umschluesseln = new Database(kopie);
    try {
      schluesselPragmas(umschluesseln, schluessel, "rekey");
    } finally {
      umschluesseln.close();
    }
    const probe = new Database(kopie);
    try {
      setzeSchluessel(probe, schluessel);
      if (zaehleZeilen(probe) !== zeilen) throw new Error("the encrypted copy does not hold the same rows");
      const pruefung = String(probe.pragma("integrity_check", { simple: true }));
      if (pruefung !== "ok") throw new Error(`the encrypted copy failed the integrity check (${pruefung})`);
    } finally {
      probe.close();
    }
    if (istKlartextDatenbank(kopie)) throw new Error("the copy is still plaintext");

    if (plattform === "win32") {
      // Windows ersetzt keine Datei, die irgendein Prozess offen haelt — auch nicht
      // die eigene. Hat sie in diesem Augenblick jemand anders offen, scheitert
      // das Ersetzen, und das Original bleibt unberuehrt.
      original.close();
      offen = false;
      ersetzeUnterWindows(kopie, dbPath);
    } else {
      ersetzeUndNulle(kopie, dbPath);
    }
  } catch (e) {
    fs.rmSync(kopie, { force: true });
    const text = fehlertext(e);
    if (text === ANDERES_PROGRAMM || sqliteCode(e) === "SQLITE_BUSY") throw new Error(ANDERES_PROGRAMM);
    throw new Error(`The knowledge base could not be encrypted, it stays as it was: ${text}`);
  } finally {
    if (offen) original.close();
  }
}

function ersetzeUndNulle(kopie: string, dbPath: string): void {
  const alt = fs.openSync(dbPath, "r+");
  try {
    const groesse = fs.fstatSync(alt).size;
    fs.renameSync(kopie, dbPath);
    try {
      const nullen = Buffer.alloc(1 << 16);
      for (let pos = 0; pos < groesse; pos += nullen.length) {
        fs.writeSync(alt, nullen, 0, Math.min(nullen.length, groesse - pos), pos);
      }
      fs.fsyncSync(alt);
    } catch {
      // Nullen ist Zugabe: die verschluesselte Datei liegt schon an ihrem Platz.
    }
  } finally {
    fs.closeSync(alt);
  }
}

/** Virenscanner halten Dateien unter Windows gern kurz fest — deshalb ein paar Versuche. */
export function ersetzeUnterWindows(kopie: string, dbPath: string): void {
  for (let versuch = 0; ; versuch++) {
    try {
      fs.renameSync(kopie, dbPath);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code ?? "";
      if (!["EPERM", "EBUSY", "EACCES"].includes(code)) throw e;
      if (versuch >= 4) throw new Error(ANDERES_PROGRAMM);
      kurzSchlafen(100);
    }
  }
}
