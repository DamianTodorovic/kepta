// KEPTA Core — SQLite-Storage (node:sqlite, FTS5, WAL)
// Eine Datei pro Gehirn: ~/.kepta/kepta.db. React-frei, von Server & MCP-Server geteilt.
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";
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

const SCHEMA_VERSION = 1;
const VALID_TYPES: MemoryType[] = ["semantic", "episodic", "procedural"];

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

// ---------- Store ----------

export class KeptaStore {
  readonly db: DatabaseSync;
  readonly dbPath: string;

  constructor(dbPath: string = defaultDbPath()) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.dbPath = dbPath;
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS memories (
        rid INTEGER PRIMARY KEY,
        id TEXT UNIQUE NOT NULL,
        scope TEXT NOT NULL DEFAULT 'local',
        type TEXT NOT NULL DEFAULT 'semantic' CHECK (type IN ('semantic','episodic','procedural')),
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

  close() {
    this.db.close();
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
    return row ? this.rowToRecord(row) : null;
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
    const existing = this.getRow(id);
    if (existing) throw new Error(`Memory existiert bereits: ${id}`);
    const record: MemoryRecord = {
      id,
      scope: input.scope ?? "local",
      type: input.type && VALID_TYPES.includes(input.type) ? input.type : "semantic",
      title: cleanText(input.title, 200) || "Ohne Titel",
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
      params.push(cleanText(patch.title, 200) || "Ohne Titel");
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
    this.db.prepare(`UPDATE memories SET ${sets.join(", ")} WHERE id = ?`).run(...params);
    // Content-Änderung macht Chunks + Embeddings obsolet
    if (patch.content !== undefined) this.db.prepare("DELETE FROM chunks WHERE memory_id = ?").run(id);
    return this.getMemory(id);
  }

  trashMemory(id: string): boolean {
    const res = this.db.prepare("UPDATE memories SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL").run(Date.now(), id);
    return Number(res.changes) > 0;
  }

  restoreMemory(id: string): boolean {
    const res = this.db.prepare("UPDATE memories SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL").run(id);
    return Number(res.changes) > 0;
  }

  purgeMemory(id: string): boolean {
    const res = this.db.prepare("DELETE FROM memories WHERE id = ?").run(id);
    return Number(res.changes) > 0;
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
    // Unicode-Klassen statt a-z0-9: kyrillische/CJK-Zeichen dürfen nicht weggefiltert werden.
    const terms = query
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1)
      .slice(0, 12);
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
