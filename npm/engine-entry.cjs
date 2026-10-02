"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// npm/engine-entry.ts
var engine_entry_exports = {};
__export(engine_entry_exports, {
  APP_VERSION: () => APP_VERSION,
  DEFAULT_EMBED_MODEL: () => DEFAULT_EMBED_MODEL,
  KeptaStore: () => KeptaStore,
  MAX_SEARCH_LIMIT: () => MAX_SEARCH_LIMIT,
  PLAINTEXT_KEY: () => PLAINTEXT_KEY,
  TOOLS: () => TOOLS,
  consolidateMemories: () => consolidateMemories,
  cosineSimilarity: () => cosineSimilarity,
  defaultExtensions: () => defaultExtensions,
  indexMemory: () => indexMemory,
  saveWithIndex: () => saveWithIndex,
  searchMemories: () => searchMemories
});
module.exports = __toCommonJS(engine_entry_exports);

// src/core/store.ts
var import_better_sqlite3_multiple_ciphers = __toESM(require("better-sqlite3-multiple-ciphers"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var import_node_fs = __toESM(require("node:fs"), 1);
var import_node_os = __toESM(require("node:os"), 1);
var import_node_crypto = __toESM(require("node:crypto"), 1);

// src/core/klassifikation.ts
var ANLEITUNG_WORTE = [
  "anleitung",
  "howto",
  "how to",
  "how-to",
  "tutorial",
  "schritt fuer schritt",
  "schritt f\xFCr schritt",
  "step by step",
  "installation",
  "einrichten",
  "setup",
  "vorgehen",
  "ablauf",
  "checkliste",
  "checklist",
  "rezept",
  "recipe",
  "playbook",
  "runbook",
  "leitfaden",
  "guide"
];
var EREIGNIS_WORTE = [
  "besprechung",
  "meeting",
  "protokoll",
  "termin",
  "gespraech",
  "gespr\xE4ch",
  "sitzung",
  "call",
  "interview",
  "notiz vom",
  "tagebuch",
  "journal",
  "retrospektive",
  "retro",
  "standup",
  "stand-up",
  "workshop",
  "konferenz"
];
var BELEG_ENDUNGEN = [
  ".pdf",
  ".csv",
  ".tsv",
  ".json",
  ".xml",
  ".html",
  ".htm",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
  ".log",
  ".rtf",
  ".tex"
];
var DATUM = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{2,4}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/;
function enthaelt(text, worte) {
  for (const w of worte) if (text.includes(w)) return w;
  return null;
}
function nummerierteSchritte(inhalt) {
  let n = 0;
  for (const zeile of inhalt.split(/\r?\n/)) {
    if (/^\s*(\d{1,2}[.)]|schritt\s+\d|step\s+\d)\s+\S/i.test(zeile)) n++;
  }
  return n;
}
function aufzaehlungsZeilen(inhalt) {
  let n = 0;
  for (const zeile of inhalt.split(/\r?\n/)) if (/^\s*[-*•]\s+\S/.test(zeile)) n++;
  return n;
}
function markupAnteil(inhalt) {
  if (inhalt.length === 0) return 0;
  const tags = inhalt.match(/<[^>\n]{1,200}>/g);
  if (!tags) return 0;
  let laenge = 0;
  for (const t of tags) laenge += t.length;
  return laenge / inhalt.length;
}
function istBelegQuelle(quelle) {
  if (!quelle) return false;
  const q = quelle.toLowerCase();
  return BELEG_ENDUNGEN.some((e) => q.endsWith(e));
}
function klassifiziere(eingabe) {
  const titel = (eingabe.title ?? "").toLowerCase();
  const inhalt = eingabe.content ?? "";
  const kleinInhalt = inhalt.toLowerCase();
  const tags = (eingabe.tags ?? []).map((t) => t.toLowerCase());
  const schritte = nummerierteSchritte(inhalt);
  if (schritte >= 3) {
    return { typ: "procedural", grund: `${schritte} nummerierte Schritte erkannt` };
  }
  const anleitungWort = enthaelt(titel, ANLEITUNG_WORTE) ?? enthaelt(kleinInhalt.slice(0, 400), ANLEITUNG_WORTE);
  if (anleitungWort && (schritte >= 1 || aufzaehlungsZeilen(inhalt) >= 3 || titel.includes(anleitungWort))) {
    return { typ: "procedural", grund: `\u201E${anleitungWort}" im Text` };
  }
  const ereignisWort = enthaelt(titel, EREIGNIS_WORTE);
  if (ereignisWort) return { typ: "episodic", grund: `\u201E${ereignisWort}" im Titel` };
  if (DATUM.test(eingabe.title ?? "")) return { typ: "episodic", grund: "Datum im Titel" };
  if (tags.some((t) => EREIGNIS_WORTE.includes(t))) {
    return { typ: "episodic", grund: "Tag benennt ein Ereignis" };
  }
  if (markupAnteil(inhalt) > 0.25) {
    return { typ: "reference", grund: "ueberwiegend Auszeichnung statt Text" };
  }
  if (istBelegQuelle(eingabe.quelle)) {
    const endung = eingabe.quelle.slice(eingabe.quelle.lastIndexOf("."));
    return { typ: "reference", grund: `uebernommen aus ${endung}` };
  }
  if (tags.includes("machine-scan")) {
    return { typ: "reference", grund: "aus dem Rechner-Scan uebernommen" };
  }
  return { typ: "semantic", grund: "formulierter Text ohne Ablauf oder Datum" };
}

// src/core/stopwords.ts
var STOPWORDS_DE = /* @__PURE__ */ new Set([
  "der",
  "die",
  "das",
  "den",
  "dem",
  "des",
  "ein",
  "eine",
  "einen",
  "einem",
  "einer",
  "eines",
  "und",
  "oder",
  "aber",
  "wenn",
  "dann",
  "also",
  "auch",
  "noch",
  "schon",
  "nur",
  "sehr",
  "wie",
  "was",
  "wer",
  "wo",
  "wann",
  "warum",
  "wieso",
  "weshalb",
  "welche",
  "welcher",
  "welches",
  "dass",
  "das",
  "ist",
  "sind",
  "war",
  "waren",
  "sein",
  "hat",
  "haben",
  "hatte",
  "hatten",
  "wird",
  "werden",
  "wurde",
  "wurden",
  "kann",
  "k\xF6nnte",
  "soll",
  "sollen",
  "muss",
  "m\xFCssen",
  "will",
  "wollen",
  "m\xF6chte",
  "m\xF6chten",
  "bei",
  "mit",
  "von",
  "zu",
  "zum",
  "zur",
  "im",
  "am",
  "an",
  "auf",
  "f\xFCr",
  "\xFCber",
  "unter",
  "vor",
  "nach",
  "zwischen",
  "durch",
  "gegen",
  "ohne",
  "um",
  "aus",
  "ein",
  "aus",
  "im",
  "in",
  "als",
  "so",
  "diese",
  "dieser",
  "dieses",
  "diesen",
  "diesem",
  "jeder",
  "jede",
  "jedes",
  "viele",
  "vielen",
  "mehr",
  "weniger",
  "hier",
  "dort",
  "da",
  "dabei",
  "damit",
  "dazu",
  "darauf",
  "dar\xFCber",
  "darunter",
  "nicht",
  "kein",
  "keine",
  "keinen",
  "keinem",
  "keiner",
  "nichts",
  "alles",
  "etwas",
  "man",
  "es",
  "er",
  "sie",
  "wir",
  "ihr",
  "mein",
  "dein",
  "sein",
  "ihr",
  "unser",
  "euer"
]);
var STOPWORDS_EN = /* @__PURE__ */ new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "if",
  "then",
  "else",
  "so",
  "as",
  "at",
  "by",
  "for",
  "with",
  "about",
  "against",
  "between",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "to",
  "from",
  "up",
  "down",
  "in",
  "out",
  "on",
  "off",
  "over",
  "under",
  "again",
  "further",
  "once",
  "here",
  "there",
  "when",
  "where",
  "why",
  "how",
  "all",
  "any",
  "both",
  "each",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "no",
  "nor",
  "not",
  "only",
  "own",
  "same",
  "than",
  "too",
  "very",
  "can",
  "will",
  "just",
  "don",
  "should",
  "now",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "has",
  "have",
  "had",
  "do",
  "does",
  "did",
  "being",
  "having",
  "doing",
  "am",
  "isnt",
  "arent",
  "wasnt",
  "hasnt",
  "havent",
  "hadnt",
  "dont",
  "doesnt",
  "didnt",
  "wont",
  "wouldnt",
  "shouldnt",
  "cant",
  "cannot",
  "could",
  "would",
  "should",
  "may",
  "might",
  "must",
  "shall",
  "this",
  "that",
  "these",
  "those",
  "i",
  "me",
  "my",
  "myself",
  "we",
  "our",
  "ours",
  "you",
  "your",
  "yours",
  "he",
  "him",
  "his",
  "she",
  "her",
  "hers",
  "it",
  "its",
  "they",
  "them",
  "their",
  "what",
  "which",
  "who",
  "whom"
]);
var STOPWORDS = /* @__PURE__ */ new Set([...STOPWORDS_DE, ...STOPWORDS_EN]);
var MAX_QUERY_TERMS = 12;
function contentTerms(query) {
  const roh = query.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((t) => t.length > 1);
  if (roh.length === 0) return [];
  const ohneFuellwoerter = roh.filter((t) => !STOPWORDS.has(t));
  return (ohneFuellwoerter.length > 0 ? ohneFuellwoerter : roh).slice(0, MAX_QUERY_TERMS);
}

// src/core/extensions.ts
var ALLOW_ALL = {
  canRead: () => true,
  canWrite: () => true,
  filterResults: (_actor, rows) => rows
};
var NOOP_SINK = { emit: () => void 0 };
var PLAINTEXT_KEY = { keyFor: () => null };
var SINGLE_LOCAL_USER = {
  current: () => ({ actorId: "local", scope: "local" })
};
var NO_REPLICATION = {
  enabled: () => false,
  push: async () => void 0,
  pull: async () => void 0
};
var MANUAL_TRASH = {
  dueForDeletion: async () => [],
  onDelete: async () => ({ proof: null })
};
function defaultExtensions() {
  return {
    policy: ALLOW_ALL,
    audit: NOOP_SINK,
    keys: PLAINTEXT_KEY,
    identity: SINGLE_LOCAL_USER,
    replication: NO_REPLICATION,
    retention: MANUAL_TRASH
  };
}

// src/core/sanitize.ts
function sanitizeText(input, maxLen = 5e4) {
  if (typeof input !== "string") return "";
  let s = input.replace(/\0/g, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s.trim();
}
function sanitizeTags(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const t of input) {
    if (typeof t !== "string") continue;
    const tag = t.toLowerCase().trim().replace(/[^a-z0-9\-_äöüß]/g, "").slice(0, 30);
    if (tag && tag.length >= 2 && out.length < 12) out.push(tag);
  }
  return [...new Set(out)];
}

// src/core/store.ts
var SCHEMA_VERSION = 1;
var VALID_TYPES = ["semantic", "episodic", "procedural", "reference"];
function defaultDataDir() {
  const env = process.env.KEPTA_DATA_DIR;
  if (env) return env;
  return import_node_path.default.join(import_node_os.default.homedir(), ".kepta");
}
function defaultDbPath() {
  return import_node_path.default.join(defaultDataDir(), "kepta.db");
}
function clampConfidence(v) {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 1;
  return Math.min(1, Math.max(0, n));
}
function newId() {
  return `k-${Date.now().toString(36)}-${import_node_crypto.default.randomBytes(4).toString("hex")}`;
}
function kurzSchlafen(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
var KeptaStore = class _KeptaStore {
  constructor(dbPath = defaultDbPath(), extensions = defaultExtensions()) {
    /** Letzter FTS-Ausfall, wie er auftrat; null, solange der Index heil ist. */
    this.ftsPanne = null;
    // Daten-Generation: JEDE Mutation an memories/chunks/entities/relations/
    // memory_entities hebt den Zähler. Der Suchpfad cacht daran (engine.ts) —
    // Trigger statt Methoden-Audit, damit auch direkte DB-Schreibzugriffe
    // (Importe, Reparaturen, Migrationen) den Cache zuverlässig invalidieren.
    // Bewusst LAZY: der Konstruktor muss auch auf einer exklusiv gesperrten DB
    // sauber öffnen (kurzSchlafen-Degrade, tests/extensions.test.ts) — dort darf
    // migrate() nichts schreiben. Schlägt das Setup fehl, versucht es der
    // nächste datenGeneration()-Aufruf wieder; der Sicherungs-Bump unten
    // invalidiert dann jeden vor der Aufsetzung gebauten Cache.
    this.generationBereit = false;
    // ---------- Such-Cache-Delta ----------
    // Der Suchpfad (engine.ts) cacht die aktiven Erinnerungen an der Generation.
    // Statt bei jedem Write den teuren Volllauf zu erzwingen, meldet der Store
    // hier jede Memory-Mutation mit ihrer ID — die Engine patcht ihren Cache
    // deltafisch. Der Trigger bleibt als SICHERHEITSNETZ: Schreibzugriffe, die
    // keine Meldung absetzen (Roh-SQL, Importe), schieben die Generation weiter,
    // ohne zu patchen — der Generation-Vergleich erkennt das und baut voll neu.
    this.memorieZuh\u00F6rer = /* @__PURE__ */ new Set();
    import_node_fs.default.mkdirSync(import_node_path.default.dirname(dbPath), { recursive: true });
    this.dbPath = dbPath;
    this.extensions = extensions;
    let schluessel = null;
    let hinweis;
    let umgewandelt = false;
    try {
      schluessel = extensions.keys.keyFor(dbPath);
    } catch (e) {
      hinweis = fehlertext(e);
    }
    if (schluessel && schluessel.length !== 32) {
      throw new Error("The database key must be 256 bits (32 bytes) \u2014 the knowledge base was not opened.");
    }
    if (schluessel) {
      try {
        umgewandelt = verschluessleFallsKlartext(dbPath, schluessel);
      } catch (e) {
        hinweis = fehlertext(e);
        if (istKlartextDatenbank(dbPath)) schluessel = null;
      }
    }
    this.db = new import_better_sqlite3_multiple_ciphers.default(dbPath);
    this.db.exec("PRAGMA busy_timeout = 5000");
    if (schluessel) setzeSchluessel(this.db, schluessel);
    else pruefeLesbar(this.db, hinweis);
    this.walEinschalten();
    this.db.exec("PRAGMA foreign_keys = ON");
    this.migrate();
    const ablage = extensions.keys.ablage;
    this.verschluesselung = schluessel ? { aktiv: true, ...ablage ? { ablage } : {}, ...umgewandelt ? { umgewandelt } : {} } : { aktiv: false, ...hinweis ? { hinweis } : {} };
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
  walEinschalten() {
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
  journalModus() {
    try {
      const zeile = this.db.prepare("PRAGMA journal_mode").get();
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
  erweitereTypBeschraenkung() {
    const zeile = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='memories'").get();
    if (!zeile?.sql) return;
    if (zeile.sql.includes("'reference'")) return;
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
      try {
        this.db.exec("ROLLBACK");
      } catch {
      }
      this.db.exec("PRAGMA foreign_keys = ON");
      throw e;
    }
    this.db.exec("PRAGMA foreign_keys = ON");
  }
  migrate() {
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
    const row = this.db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get();
    if (!row) {
      this.db.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', ?)").run(String(SCHEMA_VERSION));
    }
    const columns = [
      ["last_access_at", "INTEGER"],
      ["access_count", "INTEGER NOT NULL DEFAULT 0"],
      ["utility", "REAL NOT NULL DEFAULT 0.5"]
    ];
    for (const [name, type] of columns) {
      try {
        this.db.exec(`ALTER TABLE memories ADD COLUMN ${name} ${type}`);
      } catch {
      }
    }
  }
  // ---------- Einstellungen ----------
  // Sie liegen in derselben Datei wie das Wissen und sind damit genauso
  // verschluesselt — bis 2.10 standen sie samt KI-Zugangsschluessel als
  // settings.json im Klartext daneben.
  einstellungen() {
    const aus = {};
    const zeilen = this.db.prepare("SELECT schluessel, wert FROM einstellungen ORDER BY schluessel").all();
    for (const z of zeilen) aus[z.schluessel] = z.wert;
    return aus;
  }
  /** Setzt oder loescht (null) Eintraege in einer Transaktion; liefert, wie viele es danach gibt. */
  setzeEinstellungen(aenderungen) {
    const setzen = this.db.prepare(
      "INSERT INTO einstellungen (schluessel, wert) VALUES (?, ?) ON CONFLICT(schluessel) DO UPDATE SET wert = excluded.wert"
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
    return this.db.prepare("SELECT count(*) AS n FROM einstellungen").get().n;
  }
  /**
   * Der Wiederherstellungsschluessel: derselbe 256-Bit-Schluessel, mit dem die
   * Datei verschluesselt ist, als Hex. Fuer den Knopf "Recovery key" in der
   * Oberflaeche — wer ihn im Passwort-Manager hat, oeffnet die Wissensbasis und
   * ihre Sicherungen auch auf einem neuen Rechner (KEPTA_DB_KEY oder zurueck in
   * den Schluesselbund). Im Alltag braucht ihn niemand: Store und MCP-Server
   * holen den Schluessel selbst. Null, wenn die Datei nicht verschluesselt ist.
   */
  wiederherstellungsSchluessel() {
    if (!this.verschluesselung.aktiv) return null;
    const schluessel = this.extensions.keys.keyFor(this.dbPath);
    return schluessel ? Buffer.from(schluessel).toString("hex") : null;
  }
  close() {
    this.db.close();
  }
  actor() {
    return this.extensions.identity.current();
  }
  audit(action, target, detail) {
    try {
      this.extensions.audit.emit({ at: (/* @__PURE__ */ new Date()).toISOString(), actorId: this.actor().actorId, action, target, detail });
    } catch {
    }
  }
  // ---------- Mapping ----------
  rowToRecord(r) {
    let tags = [];
    try {
      const parsed = JSON.parse(String(r.tags ?? "[]"));
      if (Array.isArray(parsed)) tags = parsed;
    } catch {
      tags = [];
    }
    return {
      id: String(r.id),
      scope: String(r.scope),
      type: r.type,
      title: String(r.title),
      content: String(r.content),
      tags,
      confidence: Number(r.confidence),
      validFrom: r.valid_from ?? null,
      validTo: r.valid_to ?? null,
      supersededBy: r.superseded_by ?? null,
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
      deletedAt: r.deleted_at ?? null,
      lastAccessAt: r.last_access_at ?? null,
      accessCount: Number(r.access_count ?? 0),
      utility: Number(r.utility ?? 0.5)
    };
  }
  static {
    this.COLS = "id, scope, type, title, content, tags, confidence, valid_from, valid_to, superseded_by, created_at, updated_at, deleted_at, last_access_at, access_count, utility";
  }
  getRow(id) {
    return this.db.prepare(`SELECT ${_KeptaStore.COLS} FROM memories WHERE id = ?`).get(id);
  }
  // ---------- CRUD ----------
  listMemories(opts = {}) {
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 5e3);
    const offset = Math.max(opts.offset ?? 0, 0);
    const where = [];
    const params = [];
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
      const escaped = opts.tag.toLowerCase().replace(/[\\%_"]/g, (c) => `\\${c}`);
      where.push("tags LIKE ? ESCAPE '\\'");
      params.push(`%"${escaped}"%`);
    }
    const sql = `SELECT ${_KeptaStore.COLS} FROM memories WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    const rows = this.db.prepare(sql).all(...params);
    return rows.map((r) => this.rowToRecord(r));
  }
  countMemories() {
    const active = this.db.prepare("SELECT COUNT(*) c FROM memories WHERE deleted_at IS NULL").get().c;
    const trashed = this.db.prepare("SELECT COUNT(*) c FROM memories WHERE deleted_at IS NOT NULL").get().c;
    return { active, trashed };
  }
  /**
   * Grundmenge des Privatheits-Floors: die IDs aller Notizen, die der Besitzer in
   * der App als privat markiert hat (scope = 'private') — auch die im Papierkorb.
   * Gelöschte mitzuzählen ist kein Detail: "wird noch 30 Tage im Papierkorb
   * gehalten" ist eine Aufbewahrung, keine Freigabe an Agenten, und ein Titel einer
   * privat gelöschten Notiz lebt als Graph-Entität weiter (siehe memory_graph).
   * Endgültig purgierte Knoten fehlen hier, haben aber auch nichts mehr zu zeigen.
   *
   * Ein einziger indizierter Scan (idx_memories_scope) statt seitenweisem
   * listMemories(): ein Vollbestand-Durchlauf mit Limit würde private Notizen
   * still verschlucken und der Floor gelte lückenhaft — genau die 22.9.-Fehler-
   * klasse beim Geräte-Sync (100 von 3.644). Bewusst ohne audit("read"): der
   * Filter ist die Suche nach dem Auszuschließenden, kein Lesen der Notiz.
   */
  privateMemoryIds() {
    const zeilen = this.db.prepare("SELECT id FROM memories WHERE scope = 'private'").all();
    return new Set(zeilen.map((z) => z.id));
  }
  /** Dieselbe Grenze wie privateMemoryIds(), aber über den Primärschlüssel — für Einzelfragen. */
  istPrivat(id) {
    return this.db.prepare("SELECT 1 FROM memories WHERE id = ? AND scope = 'private'").get(id) !== void 0;
  }
  getMemory(id) {
    const row = this.getRow(id);
    if (!row) return null;
    const record = this.rowToRecord(row);
    if (!this.extensions.policy.canRead(this.actor(), { id: record.id, scope: record.scope, type: record.type })) return null;
    this.audit("read", record.id);
    return record;
  }
  findByTitle(title) {
    const row = this.db.prepare(`SELECT ${_KeptaStore.COLS} FROM memories WHERE title = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1`).get(title.trim());
    return row ? this.rowToRecord(row) : null;
  }
  createMemory(input) {
    const now = Date.now();
    const id = input.id?.trim() || newId();
    if (!this.extensions.policy.canWrite(this.actor(), { id, scope: input.scope ?? this.actor().scope, type: input.type ?? "semantic" })) {
      throw new Error("Schreiben verweigert (PolicyGate)");
    }
    const existing = this.getRow(id);
    if (existing) throw new Error(`Memory existiert bereits: ${id}`);
    const record = {
      id,
      scope: input.scope ?? this.actor().scope,
      // Ohne ausdrueckliche Angabe entscheiden die Regeln — nicht ein
      // Rueckfall auf "Fakt". Genau der machte die Einteilung wertlos: der
      // Rechner-Scan setzte nie einen Typ, und ein ueber MCP gespeichertes
      // "1. Kabel anschliessen 2. Treiber laden 3. Testseite drucken" landete
      // als Fakt statt als Anleitung.
      type: input.type && VALID_TYPES.includes(input.type) ? input.type : klassifiziere({ title: input.title ?? "", content: input.content ?? "", tags: input.tags }).typ,
      title: sanitizeText(input.title, 200) || "Untitled",
      content: sanitizeText(input.content, 2e5),
      tags: sanitizeTags(input.tags),
      confidence: clampConfidence(input.confidence),
      validFrom: input.validFrom ?? null,
      validTo: input.validTo ?? null,
      supersededBy: null,
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now,
      deletedAt: null,
      lastAccessAt: null,
      accessCount: 0,
      utility: 0.5
    };
    this.db.prepare(
      `INSERT INTO memories (id, scope, type, title, content, tags, confidence, valid_from, valid_to, superseded_by, created_at, updated_at, deleted_at, last_access_at, access_count, utility)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
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
    this.meldeMemorie(record.id);
    return record;
  }
  upsertMemory(input) {
    if (input.id) {
      const existing = this.getMemory(input.id);
      if (existing) {
        const updated = this.updateMemory(input.id, {
          title: input.title,
          content: input.content,
          tags: input.tags !== void 0 ? sanitizeTags(input.tags) : void 0,
          type: input.type,
          scope: input.scope,
          confidence: input.confidence,
          validFrom: input.validFrom,
          validTo: input.validTo,
          // Import/Resync dürfen Zeitstempel aus der Quelle erhalten (optionaler Parameter)
          updatedAt: input.updatedAt
        });
        return { record: updated ?? existing, created: false };
      }
    }
    return { record: this.createMemory(input), created: true };
  }
  updateMemory(id, patch) {
    const row = this.getRow(id);
    if (!row) return null;
    const sets = [];
    const params = [];
    if (patch.title !== void 0) {
      sets.push("title = ?");
      params.push(sanitizeText(patch.title, 200) || "Untitled");
    }
    if (patch.content !== void 0) {
      sets.push("content = ?");
      params.push(sanitizeText(patch.content, 2e5));
    }
    if (patch.tags !== void 0) {
      sets.push("tags = ?");
      params.push(JSON.stringify(sanitizeTags(patch.tags)));
    }
    if (patch.type !== void 0 && VALID_TYPES.includes(patch.type)) {
      sets.push("type = ?");
      params.push(patch.type);
    }
    if (patch.scope !== void 0) {
      sets.push("scope = ?");
      params.push(patch.scope);
    }
    if (patch.confidence !== void 0) {
      sets.push("confidence = ?");
      params.push(clampConfidence(patch.confidence));
    }
    if (patch.validFrom !== void 0) {
      sets.push("valid_from = ?");
      params.push(patch.validFrom);
    }
    if (patch.validTo !== void 0) {
      sets.push("valid_to = ?");
      params.push(patch.validTo);
    }
    if (patch.supersededBy !== void 0) {
      sets.push("superseded_by = ?");
      params.push(patch.supersededBy);
    }
    if (sets.length === 0) return this.rowToRecord(row);
    sets.push("updated_at = ?");
    params.push(patch.updatedAt ?? Date.now());
    params.push(id);
    if (!this.extensions.policy.canWrite(this.actor(), { id, scope: String(row.scope), type: String(row.type) })) {
      throw new Error("Write denied (PolicyGate)");
    }
    this.db.prepare(`UPDATE memories SET ${sets.join(", ")} WHERE id = ?`).run(...params);
    if (patch.content !== void 0) this.db.prepare("DELETE FROM chunks WHERE memory_id = ?").run(id);
    this.audit("update", id);
    this.meldeMemorie(id);
    return this.getMemory(id);
  }
  trashMemory(id) {
    const res = this.db.prepare("UPDATE memories SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL").run(Date.now(), id);
    const ok = Number(res.changes) > 0;
    if (ok) this.audit("delete", id);
    if (ok) this.meldeMemorie(id);
    return ok;
  }
  restoreMemory(id) {
    const res = this.db.prepare("UPDATE memories SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL").run(id);
    const ok = Number(res.changes) > 0;
    if (ok) this.meldeMemorie(id);
    return ok;
  }
  purgeMemory(id) {
    const res = this.db.prepare("DELETE FROM memories WHERE id = ?").run(id);
    const ok = Number(res.changes) > 0;
    if (ok) this.audit("delete", id);
    if (ok) this.meldeMemorie(id);
    return ok;
  }
  // ---------- Superseding (temporale Invalidierung) ----------
  supersedeMemory(oldId, newId2) {
    return this.updateMemory(oldId, { supersededBy: newId2 });
  }
  // ---------- Retention / Zugriffs-Statistik (Oblivion) ----------
  /** Suchtreffer: Zugänglichkeit aktualisieren (Frequenz + zuletzt zugegriffen) */
  recordAccess(ids) {
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
  reinforceMemory(id, delta = 0.05) {
    this.db.prepare("UPDATE memories SET utility = MAX(0, MIN(1, utility + ?)) WHERE id = ?").run(delta, id);
  }
  // ---------- Chunks & Embeddings ----------
  replaceChunks(memoryId, texts) {
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
  getChunks(memoryId) {
    const rows = this.db.prepare("SELECT memory_id, seq, text, embedding, embedding_model FROM chunks WHERE memory_id = ? ORDER BY seq").all(memoryId);
    return rows.map((r) => ({
      memoryId: String(r.memory_id),
      seq: Number(r.seq),
      text: String(r.text),
      embedding: r.embedding ? blobToFloat32(r.embedding) : null,
      embeddingModel: r.embedding_model ?? null
    }));
  }
  setEmbedding(memoryId, seq, embedding, model) {
    this.db.prepare("UPDATE chunks SET embedding = ?, embedding_model = ? WHERE memory_id = ? AND seq = ?").run(float32ToBlob(embedding), model, memoryId, seq);
  }
  midiereDatenGeneration() {
    if (this.generationBereit) return;
    try {
      this.db.exec(`
        INSERT OR IGNORE INTO meta (key, value) VALUES ('daten_generation', '0');
        INSERT OR IGNORE INTO meta (key, value) VALUES ('mem_generation', '0');
        CREATE TRIGGER IF NOT EXISTS daten_gen_memories_i AFTER INSERT ON memories BEGIN
          UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'daten_generation';
          UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'mem_generation'; END;
        CREATE TRIGGER IF NOT EXISTS daten_gen_memories_u AFTER UPDATE ON memories
        WHEN NEW.title IS NOT OLD.title OR NEW.content IS NOT OLD.content
          OR NEW.tags IS NOT OLD.tags OR NEW.type IS NOT OLD.type OR NEW.scope IS NOT OLD.scope
          OR NEW.confidence IS NOT OLD.confidence OR NEW.valid_from IS NOT OLD.valid_from
          OR NEW.valid_to IS NOT OLD.valid_to OR NEW.superseded_by IS NOT OLD.superseded_by
          OR NEW.deleted_at IS NOT OLD.deleted_at OR NEW.updated_at IS NOT OLD.updated_at
          OR NEW.utility IS NOT OLD.utility
        BEGIN
          UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'daten_generation';
          UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'mem_generation'; END;
        CREATE TRIGGER IF NOT EXISTS daten_gen_memories_d AFTER DELETE ON memories BEGIN
          UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'daten_generation';
          UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'mem_generation'; END;
        CREATE TRIGGER IF NOT EXISTS daten_gen_chunks_i AFTER INSERT ON chunks BEGIN
          UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'daten_generation'; END;
        CREATE TRIGGER IF NOT EXISTS daten_gen_chunks_u AFTER UPDATE ON chunks BEGIN
          UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'daten_generation'; END;
        CREATE TRIGGER IF NOT EXISTS daten_gen_chunks_d AFTER DELETE ON chunks BEGIN
          UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'daten_generation'; END;
        CREATE TRIGGER IF NOT EXISTS daten_gen_entities_i AFTER INSERT ON entities BEGIN
          UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'daten_generation'; END;
        CREATE TRIGGER IF NOT EXISTS daten_gen_entities_u AFTER UPDATE ON entities BEGIN
          UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'daten_generation'; END;
        CREATE TRIGGER IF NOT EXISTS daten_gen_entities_d AFTER DELETE ON entities BEGIN
          UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'daten_generation'; END;
        CREATE TRIGGER IF NOT EXISTS daten_gen_mem_ent_i AFTER INSERT ON memory_entities BEGIN
          UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'daten_generation'; END;
        CREATE TRIGGER IF NOT EXISTS daten_gen_mem_ent_d AFTER DELETE ON memory_entities BEGIN
          UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'daten_generation'; END;
        CREATE TRIGGER IF NOT EXISTS daten_gen_relations_i AFTER INSERT ON relations BEGIN
          UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'daten_generation'; END;
        CREATE TRIGGER IF NOT EXISTS daten_gen_relations_u AFTER UPDATE ON relations BEGIN
          UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'daten_generation'; END;
        CREATE TRIGGER IF NOT EXISTS daten_gen_relations_d AFTER DELETE ON relations BEGIN
          UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'daten_generation'; END;
        UPDATE meta SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'daten_generation';
      `);
      this.generationBereit = true;
    } catch {
    }
  }
  /** Zähler aller Daten-Mutationen (Trigger-gespeist) — Cache-Schlüssel des Suchpfads. */
  datenGeneration() {
    this.midiereDatenGeneration();
    const row = this.db.prepare("SELECT value FROM meta WHERE key = 'daten_generation'").get();
    return Number(row?.value ?? 0);
  }
  /**
   * Zähler NUR der memories-Mutationen — Cache-Schlüssel des Erinnerungs-Caches.
   * Getrennt von datenGeneration, damit Chunk-/Graph-Writes (z. B. Embedding-
   * Nachschub) den teuren Erinnerungs-Cache nicht werfen.
   */
  memGeneration() {
    this.midiereDatenGeneration();
    const row = this.db.prepare("SELECT value FROM meta WHERE key = 'mem_generation'").get();
    return Number(row?.value ?? 0);
  }
  onMemorieAenderung(fn) {
    this.memorieZuh\u00F6rer.add(fn);
    return () => this.memorieZuh\u00F6rer.delete(fn);
  }
  meldeMemorie(id) {
    for (const fn of this.memorieZuh\u00F6rer) fn(id);
  }
  /** Chunks ohne Embedding oder mit veraltetem Modell (für die Hintergrund-Queue) */
  chunksNeedingEmbedding(limit = 64, model) {
    const sql = model ? "SELECT memory_id, seq, text FROM chunks WHERE embedding IS NULL OR embedding_model IS NULL OR embedding_model <> ? LIMIT ?" : "SELECT memory_id, seq, text FROM chunks WHERE embedding IS NULL LIMIT ?";
    const rows = model ? this.db.prepare(sql).all(model, limit) : this.db.prepare(sql).all(limit);
    return rows.map((r) => ({ memoryId: String(r.memory_id), seq: Number(r.seq), text: String(r.text) }));
  }
  /** Chunk-Text + Embedding aller aktiven Memories (für die Vektor-Suche) */
  allEmbeddableChunks() {
    const rows = this.db.prepare("SELECT memory_id, seq, text, embedding, embedding_model FROM chunks WHERE embedding IS NOT NULL").all();
    return rows.map((r) => ({
      memoryId: String(r.memory_id),
      seq: Number(r.seq),
      text: String(r.text),
      embedding: blobToFloat32(r.embedding),
      model: String(r.embedding_model ?? "")
    }));
  }
  embeddingStats() {
    const total = this.db.prepare("SELECT COUNT(*) c FROM chunks").get().c;
    const embedded = this.db.prepare("SELECT COUNT(*) c FROM chunks WHERE embedding IS NOT NULL").get().c;
    const modelRows = this.db.prepare("SELECT embedding_model m, COUNT(*) c FROM chunks WHERE embedding IS NOT NULL GROUP BY embedding_model").all();
    const models = {};
    for (const r of modelRows) models[String(r.m ?? "unknown")] = Number(r.c);
    return { total, embedded, models };
  }
  // ---------- Entities & Relations ----------
  ensureEntity(name) {
    const clean = name.trim().toLowerCase().slice(0, 80);
    const hit = this.db.prepare("SELECT id FROM entities WHERE name = ?").get(clean);
    if (hit) return hit.id;
    const res = this.db.prepare("INSERT INTO entities (name) VALUES (?)").run(clean);
    return Number(res.lastInsertRowid);
  }
  /** Verknüpft eine Memory mit Entitäten (idempotent) */
  linkEntities(memoryId, names) {
    const ids = [];
    for (const name of names.slice(0, 40)) {
      if (typeof name !== "string" || name.trim().length < 2) continue;
      const eid = this.ensureEntity(name);
      this.db.prepare("INSERT OR IGNORE INTO memory_entities (memory_id, entity_id) VALUES (?, ?)").run(memoryId, eid);
      ids.push(eid);
    }
    return ids;
  }
  addRelation(source, target, relation, memoryId, validFrom = null, validTo = null) {
    const sid = this.ensureEntity(source);
    const tid = this.ensureEntity(target);
    const res = this.db.prepare("INSERT INTO relations (source_id, target_id, relation, valid_from, valid_to, memory_id) VALUES (?, ?, ?, ?, ?, ?)").run(sid, tid, relation.trim().toLowerCase().slice(0, 40) || "related", validFrom, validTo, memoryId);
    return { id: Number(res.lastInsertRowid), sourceId: sid, targetId: tid, relation, validFrom, validTo, memoryId };
  }
  getEntityByName(name) {
    const row = this.db.prepare("SELECT id, name FROM entities WHERE name = ?").get(name.trim().toLowerCase());
    return row ?? null;
  }
  /** Subgraph um eine Entität (oder der ganze Graph, gekappt) */
  getGraph(entity, depth = 2) {
    if (entity) {
      const start = this.getEntityByName(entity);
      if (!start) return { entities: [], relations: [] };
      const nodes = /* @__PURE__ */ new Set([start.id]);
      const expanded = /* @__PURE__ */ new Set();
      const seenRel = /* @__PURE__ */ new Set();
      const relations2 = [];
      let frontierIds = [start.id];
      for (let d = 0; d < Math.max(1, depth); d++) {
        if (frontierIds.length === 0) break;
        const placeholders2 = frontierIds.map(() => "?").join(",");
        const rows = this.db.prepare(
          `SELECT id, source_id, target_id, relation, valid_from, valid_to, memory_id FROM relations
             WHERE source_id IN (${placeholders2}) OR target_id IN (${placeholders2})`
        ).all(...frontierIds, ...frontierIds);
        const nextIds = [];
        for (const r of rows) {
          const rel = {
            id: Number(r.id),
            sourceId: Number(r.source_id),
            targetId: Number(r.target_id),
            relation: String(r.relation),
            validFrom: r.valid_from ?? null,
            validTo: r.valid_to ?? null,
            memoryId: r.memory_id ?? null
          };
          if (!seenRel.has(rel.id)) {
            seenRel.add(rel.id);
            relations2.push(rel);
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
      const entities2 = this.db.prepare(`SELECT id, name FROM entities WHERE id IN (${placeholders})`).all(...ids).map((r) => ({ id: Number(r.id), name: String(r.name) }));
      return { entities: entities2, relations: relations2 };
    }
    const entities = this.db.prepare("SELECT id, name FROM entities LIMIT 500").all().map((r) => ({
      id: Number(r.id),
      name: String(r.name)
    }));
    const relations = this.db.prepare("SELECT id, source_id, target_id, relation, valid_from, valid_to, memory_id FROM relations LIMIT 2000").all().map((r) => ({
      id: Number(r.id),
      sourceId: Number(r.source_id),
      targetId: Number(r.target_id),
      relation: String(r.relation),
      validFrom: r.valid_from ?? null,
      validTo: r.valid_to ?? null,
      memoryId: r.memory_id ?? null
    }));
    return { entities, relations };
  }
  /** Memory-IDs, die eine der Entitäten mentionen */
  memoryIdsForEntities(entityIds) {
    if (entityIds.length === 0) return /* @__PURE__ */ new Set();
    const placeholders = entityIds.map(() => "?").join(",");
    const rows = this.db.prepare(`SELECT DISTINCT memory_id FROM memory_entities WHERE entity_id IN (${placeholders})`).all(...entityIds);
    return new Set(rows.map((r) => String(r.memory_id)));
  }
  entityNamesForMemory(memoryId) {
    const rows = this.db.prepare(
      `SELECT e.name FROM entities e JOIN memory_entities me ON me.entity_id = e.id WHERE me.memory_id = ?`
    ).all(memoryId);
    return rows.map((r) => String(r.name));
  }
  /**
   * entity_id → Träger-Notizen, in einem Query. memoryIdsForEntities() kann nur die
   * Sammelmenge; den Graphen filtert der Privatheits-Floor aber Knoten für Knoten,
   * und das dürften 500 Einzelabfragen sein (LIMIT 500 im ganzen Graphen).
   */
  memoryIdsByEntity(entityIds) {
    const map = /* @__PURE__ */ new Map();
    if (entityIds.length === 0) return map;
    const placeholders = entityIds.map(() => "?").join(",");
    const rows = this.db.prepare(`SELECT entity_id, memory_id FROM memory_entities WHERE entity_id IN (${placeholders})`).all(...entityIds);
    for (const r of rows) {
      const Liste = map.get(r.entity_id);
      if (Liste) Liste.push(String(r.memory_id));
      else map.set(r.entity_id, [String(r.memory_id)]);
    }
    return map;
  }
  // ---------- FTS ----------
  ftsSearch(query, limit = 50) {
    const terms = contentTerms(query);
    if (terms.length === 0) return [];
    const frage = (joiner) => this.db.prepare(
      `SELECT m.id, bm25(memories_fts) AS rank
           FROM memories_fts JOIN memories m ON m.rid = memories_fts.rowid
           WHERE memories_fts MATCH ? AND m.deleted_at IS NULL
           ORDER BY rank LIMIT ?`
    ).all(terms.map((t) => `"${t}"`).join(joiner), limit);
    try {
      let rows = frage(" AND ");
      if (rows.length < limit && terms.length > 1) {
        const gesehen = new Set(rows.map((r) => String(r.id)));
        rows = [...rows, ...frage(" OR ").filter((r) => !gesehen.has(String(r.id)))];
        rows.sort((a, b) => Number(a.rank) - Number(b.rank));
        rows = rows.slice(0, limit);
      }
      return rows.map((r) => ({ id: String(r.id), bm25: Number(r.rank) }));
    } catch (e) {
      this.ftsPanne = { at: (/* @__PURE__ */ new Date()).toISOString(), fehler: e instanceof Error ? e.message : String(e) };
      this.audit("search", "fts", { fehler: this.ftsPanne.fehler });
      return [];
    }
  }
  /**
   * Zustand der Wortspur für Statusanzeigen. `ok: true` heißt nicht "Index
   * gefüllt", sondern nur: die letzte Suche blieb fehlerfrei. Eine Panne wird
   * nie zurückgesetzt — die letzte ist die, die jemand sehen soll.
   */
  ftsStatus() {
    return this.ftsPanne ? { ok: false, ...this.ftsPanne } : { ok: true };
  }
};
function float32ToBlob(vec) {
  const buf = Buffer.alloc(vec.length * 4);
  for (let i = 0; i < vec.length; i++) buf.writeFloatLE(vec[i], i * 4);
  return buf;
}
function blobToFloat32(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out = new Float32Array(Math.floor(buf.byteLength / 4));
  for (let i = 0; i < out.length; i++) out[i] = view.getFloat32(i * 4, true);
  return out;
}
var KLARTEXT_KOPF = Buffer.from("SQLite format 3\0", "latin1");
var KOPIE = ".encrypting";
var SPERRE = ".encrypting-lock";
var VERWAIST_MS = 10 * 6e4;
var ANDERES_PROGRAMM = "The knowledge base is open in another program (an AI agent over MCP, an older KEPTA?) \u2014 it stays unencrypted until KEPTA has it to itself. Close the other program and restart KEPTA.";
var WIRD_UMGEWANDELT = "The knowledge base is being encrypted by another KEPTA process \u2014 try again in a moment.";
function fehlertext(e) {
  return e instanceof Error ? e.message : String(e);
}
function sqliteCode(e) {
  return String(e.code ?? "");
}
function istKlartextDatenbank(dbPath) {
  let fd;
  try {
    fd = import_node_fs.default.openSync(dbPath, "r");
  } catch {
    return false;
  }
  try {
    const kopf = Buffer.alloc(16);
    return import_node_fs.default.readSync(fd, kopf, 0, 16, 0) === 16 && kopf.equals(KLARTEXT_KOPF);
  } finally {
    import_node_fs.default.closeSync(fd);
  }
}
function schluesselPragmas(db, schluessel, pragma) {
  db.pragma("cipher = 'sqlcipher'");
  db.pragma("legacy = 4");
  db.pragma(`${pragma} = "x'${Buffer.from(schluessel).toString("hex")}'"`);
}
function setzeSchluessel(db, schluessel) {
  schluesselPragmas(db, schluessel, "key");
  try {
    db.prepare("SELECT count(*) FROM sqlite_master").get();
  } catch (e) {
    db.close();
    if (sqliteCode(e) === "SQLITE_NOTADB") {
      throw new Error("The knowledge base could not be opened with its key \u2014 the key in the keychain does not belong to this database. Nothing was changed.");
    }
    throw e;
  }
}
function pruefeLesbar(db, hinweis) {
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
function zaehleZeilen(db) {
  const tabellen = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  return tabellen.map(({ name }) => `${name}:${db.prepare(`SELECT count(*) AS n FROM "${name.replace(/"/g, '""')}"`).get().n}`).join(",");
}
function prozessLebt(pid) {
  if (pid === null) return true;
  if (pid === process.pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}
function leseSperre(dbPath) {
  let roh;
  let seit;
  try {
    roh = import_node_fs.default.readFileSync(dbPath + SPERRE, "utf8");
    seit = import_node_fs.default.statSync(dbPath + SPERRE).mtimeMs;
  } catch {
    return null;
  }
  try {
    const j = JSON.parse(roh);
    if (typeof j.pid === "number" && typeof j.seit === "number") return { pid: j.pid, seit: j.seit };
  } catch {
  }
  return { pid: null, seit };
}
function warteAufUmwandlung(dbPath, maxWarteMs = 12e4) {
  const bis = Date.now() + maxWarteMs;
  for (; ; ) {
    const sperre = leseSperre(dbPath);
    if (!sperre) return;
    if (!prozessLebt(sperre.pid) || Date.now() - sperre.seit > VERWAIST_MS) {
      import_node_fs.default.rmSync(dbPath + SPERRE, { force: true });
      import_node_fs.default.rmSync(dbPath + KOPIE, { force: true });
      return;
    }
    if (Date.now() >= bis) throw new Error(WIRD_UMGEWANDELT);
    kurzSchlafen(100);
  }
}
function sperreNehmen(dbPath) {
  try {
    const fd = import_node_fs.default.openSync(dbPath + SPERRE, "wx");
    import_node_fs.default.writeSync(fd, JSON.stringify({ pid: process.pid, seit: Date.now() }));
    return fd;
  } catch (e) {
    if (e.code === "EEXIST") return null;
    throw e;
  }
}
function verschluessleFallsKlartext(dbPath, schluessel, plattform = process.platform) {
  for (let versuch = 0; versuch < 3; versuch++) {
    warteAufUmwandlung(dbPath);
    if (!istKlartextDatenbank(dbPath)) return false;
    const sperre = sperreNehmen(dbPath);
    if (sperre === null) continue;
    try {
      if (!istKlartextDatenbank(dbPath)) return false;
      verschluessleKlartextDatenbank(dbPath, schluessel, plattform);
      return true;
    } finally {
      import_node_fs.default.closeSync(sperre);
      import_node_fs.default.rmSync(dbPath + SPERRE, { force: true });
    }
  }
  throw new Error(WIRD_UMGEWANDELT);
}
function verschluessleKlartextDatenbank(dbPath, schluessel, plattform = process.platform) {
  const kopie = dbPath + KOPIE;
  import_node_fs.default.rmSync(kopie, { force: true });
  const original = new import_better_sqlite3_multiple_ciphers.default(dbPath);
  let offen = true;
  try {
    original.pragma("busy_timeout = 2000");
    if (String(original.pragma("journal_mode = DELETE", { simple: true })).toLowerCase() !== "delete") {
      throw new Error(ANDERES_PROGRAMM);
    }
    original.pragma("locking_mode = EXCLUSIVE");
    original.exec("BEGIN EXCLUSIVE; COMMIT;");
    const zeilen = zaehleZeilen(original);
    import_node_fs.default.copyFileSync(dbPath, kopie);
    const umschluesseln = new import_better_sqlite3_multiple_ciphers.default(kopie);
    try {
      schluesselPragmas(umschluesseln, schluessel, "rekey");
    } finally {
      umschluesseln.close();
    }
    const probe = new import_better_sqlite3_multiple_ciphers.default(kopie);
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
      original.close();
      offen = false;
      ersetzeUnterWindows(kopie, dbPath);
    } else {
      ersetzeUndNulle(kopie, dbPath);
    }
  } catch (e) {
    import_node_fs.default.rmSync(kopie, { force: true });
    const text = fehlertext(e);
    if (text === ANDERES_PROGRAMM || sqliteCode(e) === "SQLITE_BUSY") throw new Error(ANDERES_PROGRAMM);
    throw new Error(`The knowledge base could not be encrypted, it stays as it was: ${text}`);
  } finally {
    if (offen) original.close();
  }
}
function ersetzeUndNulle(kopie, dbPath) {
  const alt = import_node_fs.default.openSync(dbPath, "r+");
  try {
    const groesse = import_node_fs.default.fstatSync(alt).size;
    import_node_fs.default.renameSync(kopie, dbPath);
    try {
      const nullen = Buffer.alloc(1 << 16);
      for (let pos = 0; pos < groesse; pos += nullen.length) {
        import_node_fs.default.writeSync(alt, nullen, 0, Math.min(nullen.length, groesse - pos), pos);
      }
      import_node_fs.default.fsyncSync(alt);
    } catch {
    }
  } finally {
    import_node_fs.default.closeSync(alt);
  }
}
function ersetzeUnterWindows(kopie, dbPath) {
  for (let versuch = 0; ; versuch++) {
    try {
      import_node_fs.default.renameSync(kopie, dbPath);
      return;
    } catch (e) {
      const code = e.code ?? "";
      if (!["EPERM", "EBUSY", "EACCES"].includes(code)) throw e;
      if (versuch >= 4) throw new Error(ANDERES_PROGRAMM);
      kurzSchlafen(100);
    }
  }
}

// src/core/embeddings.ts
var DEFAULT_EMBED_MODEL = process.env.KEPTA_EMBED_MODEL || "nomic-embed-text";
function ollamaBaseUrl() {
  return (process.env.KEPTA_OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
}
var PARAGRAPH_SPLIT = /\n\s*\n/;
function chunkText(text, opts = {}) {
  const size = Math.max(200, opts.size ?? 1200);
  const overlap = Math.min(Math.max(0, opts.overlap ?? 150), size - 100);
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];
  const paragraphs = clean.split(PARAGRAPH_SPLIT);
  const chunks = [];
  let current = "";
  for (const para of paragraphs) {
    if ((current + "\n\n" + para).length <= size) {
      current = current ? current + "\n\n" + para : para;
      continue;
    }
    if (current) chunks.push(current.trim());
    if (para.length <= size) {
      current = para;
      continue;
    }
    const sentences = para.split(/(?<=[.!?])\s+/);
    let piece = "";
    for (const s of sentences) {
      if ((piece + " " + s).length > size && piece) {
        chunks.push(piece.trim());
        piece = overlap > 0 ? piece.slice(-overlap) + " " + s : s;
      } else {
        piece = piece ? piece + " " + s : s;
      }
    }
    current = piece;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter((c) => c.length > 0);
}
async function embedTexts(inputs, model = DEFAULT_EMBED_MODEL, audit, baseUrlOverride) {
  const base = (baseUrlOverride ?? ollamaBaseUrl()).replace(/\/+$/, "");
  let host = "";
  try {
    host = new URL(base).hostname;
  } catch {
    host = base;
  }
  if (audit && !["127.0.0.1", "localhost", "::1"].includes(host)) {
    try {
      audit.emit({ at: (/* @__PURE__ */ new Date()).toISOString(), actorId: "kepta-core", action: "egress", detail: { host, model, count: inputs.length } });
    } catch {
    }
  }
  if (inputs.length === 0) return { ok: true, embeddings: [], model };
  try {
    const res = await fetch(`${base}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: inputs }),
      signal: AbortSignal.timeout(3e4)
    });
    if (!res.ok) {
      return { ok: false, embeddings: [], model, error: `Ollama ${res.status}` };
    }
    const data = await res.json();
    const vecs = (data.embeddings ?? []).map((e) => Float32Array.from(e));
    if (vecs.length !== inputs.length) {
      return { ok: false, embeddings: [], model, error: "Embedding count does not match" };
    }
    return { ok: true, embeddings: vecs, model };
  } catch (e) {
    return { ok: false, embeddings: [], model, error: e instanceof Error ? e.message : String(e) };
  }
}
async function embedQuery(text, model = DEFAULT_EMBED_MODEL) {
  const res = await embedTexts([text], model);
  return res.ok ? res.embeddings[0] ?? null : null;
}
function cosineSimilarity(a, b) {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// src/core/synonyme.ts
var PAARE = [
  ["gesichert", ["backup", "sicherung", "snapshot"]],
  ["backup", ["gesichert", "sicherung", "snapshot"]],
  ["sicherung", ["backup", "gesichert"]],
  ["snapshot", ["momentaufnahme", "backup"]],
  ["momentaufnahme", ["snapshot"]],
  ["umsatzsteuer", ["vat", "ust"]],
  ["vat", ["umsatzsteuer"]],
  ["abgegeben", ["filing", "einreichen", "deadline"]],
  ["einreichen", ["filing", "abgegeben"]],
  ["filing", ["einreichen", "abgegeben"]],
  ["passwort", ["password"]],
  ["password", ["passwort"]],
  ["kennwort", ["password", "passwort"]],
  ["datenbank", ["database", "db"]],
  ["database", ["datenbank"]],
  ["produktion", ["production"]],
  ["production", ["produktion"]],
  ["mandant", ["client", "kunde"]],
  ["kunde", ["client", "mandant"]],
  ["client", ["mandant", "kunde"]],
  ["rechnung", ["invoice"]],
  ["invoice", ["rechnung"]],
  ["frist", ["deadline"]],
  ["deadline", ["frist"]],
  ["steuer", ["tax"]],
  ["tax", ["steuer"]],
  ["loeschen", ["delete"]],
  ["l\xF6schen", ["delete"]],
  ["delete", ["loeschen", "l\xF6schen"]],
  ["wiederherstellen", ["restore"]],
  ["restore", ["wiederherstellen"]],
  ["aufbewahrung", ["retention"]],
  ["retention", ["aufbewahrung"]],
  ["vertrag", ["contract", "agreement"]],
  ["contract", ["vertrag"]],
  ["verschl\xFCsselung", ["encryption"]],
  ["verschluesselung", ["encryption"]],
  ["encryption", ["verschl\xFCsselung", "verschluesselung"]],
  ["server", ["host", "server"]],
  ["veranstaltung", ["event"]],
  ["event", ["veranstaltung"]],
  ["kosten", ["cost", "expenses"]],
  ["umsatz", ["revenue", "turnover"]],
  ["passw\xF6rter", ["passwort", "password", "manager"]],
  ["zugangsdaten", ["passwort", "password", "zugang", "login"]],
  ["wissensgraph", ["graph", "knowledge", "entit\xE4ten"]],
  ["nudeln", ["pasta", "spaghetti"]],
  ["koche", ["kochen", "rezept"]],
  ["kochen", ["rezept"]],
  ["fahrzeug", ["auto", "werkstatt"]],
  ["instand", ["werkstatt", "auto"]]
];
var LEXIKON = new Map(PAARE);
function erweitereQuery(query) {
  const roh = query.trim();
  if (!roh) return roh;
  const terme = roh.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1);
  const zusatz = [];
  for (const t of terme) {
    for (const synonym of LEXIKON.get(t) ?? []) {
      if (!terme.includes(synonym) && !zusatz.includes(synonym)) zusatz.push(synonym);
    }
  }
  return zusatz.length ? `${roh} ${zusatz.join(" ")}` : roh;
}

// src/core/engine.ts
var RRF_K = 60;
var MAX_SEARCH_LIMIT = 1e4;
var EXPIRED_FACTOR = 0.5;
var SUPERSEDED_FACTOR = 0.4;
var RECENCY_WINDOW_MS = 365 * 24 * 3600 * 1e3;
var RECENCY_MAX_BONUS = 0.15;
var VECTOR_BAND = 0.86;
var VECTOR_FLOOR = 0.58;
var RERANK_MAX_BOOST = 0.25;
var RETENTION_T_DAYS = 90;
var RETENTION_FLOOR = 0.2;
var ENTITAET_MIN_LAENGE = 3;
function stemme(w) {
  return w.replace(/(ung|en|er|es|em|e|s|n)$/, "");
}
function localRerankScore(query, r) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const terms = q.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1);
  if (terms.length === 0) return null;
  const titleSet = new Set(
    r.title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(stemme)
  );
  const contentSet = new Set(
    r.content.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(stemme)
  );
  const tagSet = new Set(r.tags.map((t) => stemme(t.toLowerCase())));
  let cov = 0;
  for (const t of terms) {
    const st = stemme(t);
    if (contentSet.has(st) || titleSet.has(st)) {
      cov += 1;
    } else if (st.length >= 4 && [...contentSet, ...titleSet].some((d) => d.startsWith(st) || st.startsWith(d))) {
      cov += 0.6;
    }
  }
  const coverage = cov / terms.length;
  let titleCov = 0;
  for (const t of terms) if (titleSet.has(stemme(t))) titleCov += 1;
  titleCov = Math.min(titleCov / terms.length, 1);
  const phraseInContent = r.content.toLowerCase().includes(q);
  const phraseInTitle = r.title.toLowerCase().includes(q);
  const tagHit = terms.some((t) => tagSet.has(stemme(t)));
  const score = coverage * 0.6 + titleCov * 0.2 + (phraseInContent ? 0.15 : 0) + (phraseInTitle ? 0.25 : 0) + (tagHit ? 0.1 : 0);
  return Math.max(0, Math.min(1, score));
}
function retentionFactor(r, now) {
  const days = r.lastAccessAt ? (now - r.lastAccessAt) / (24 * 3600 * 1e3) : 0;
  const freq = Math.min(r.accessCount, 10);
  const tau = (r.utility + freq + 0.1) * RETENTION_T_DAYS;
  return RETENTION_FLOOR + (1 - RETENTION_FLOOR) * Math.exp(-days / tau);
}
function loadActive(store) {
  const out = [];
  const limit = 5e3;
  for (let offset = 0; ; offset += limit) {
    const page = store.listMemories({ limit, offset });
    for (const record of page) {
      out.push({
        record,
        titleLower: record.title.toLowerCase(),
        contentLower: record.content.toLowerCase()
      });
    }
    if (page.length < limit) break;
  }
  return out;
}
var suchCacheStatistik = { vollaufbauten: 0, deltapatches: 0 };
var aktiverCache = /* @__PURE__ */ new WeakMap();
var deltaRegistriert = /* @__PURE__ */ new WeakSet();
function registriereDelta(store) {
  if (deltaRegistriert.has(store)) return;
  deltaRegistriert.add(store);
  store.onMemorieAenderung((id) => {
    let eintrag = aktiverCache.get(store);
    if (!eintrag) {
      if (store.countMemories().active !== 1) return;
      eintrag = { generation: 0, aktiv: [], byId: /* @__PURE__ */ new Map() };
      aktiverCache.set(store, eintrag);
    }
    const frisch = store.getMemory(id);
    if (!frisch || frisch.deletedAt !== null) {
      eintrag.aktiv = eintrag.aktiv.filter((m) => m.record.id !== id);
      eintrag.byId.delete(id);
    } else {
      const neu = {
        record: frisch,
        titleLower: frisch.title.toLowerCase(),
        contentLower: frisch.content.toLowerCase()
      };
      const alt = eintrag.byId.get(id);
      if (alt) Object.assign(alt, neu);
      else {
        eintrag.aktiv.push(neu);
        eintrag.byId.set(id, neu);
      }
    }
    suchCacheStatistik.deltapatches += 1;
    eintrag.generation = store.memGeneration();
  });
}
function aktiveErinnerungen(store) {
  registriereDelta(store);
  const generation = store.memGeneration();
  const eintrag = aktiverCache.get(store);
  if (eintrag && eintrag.generation === generation) return eintrag;
  const aktiv = loadActive(store);
  const byId = new Map(aktiv.map((m) => [m.record.id, m]));
  const frisch = { generation, aktiv, byId };
  aktiverCache.set(store, frisch);
  suchCacheStatistik.vollaufbauten += 1;
  return frisch;
}
var chunkCache = /* @__PURE__ */ new WeakMap();
function embeddbareChunks(store) {
  const generation = store.datenGeneration();
  const eintrag = chunkCache.get(store);
  if (eintrag && eintrag.generation === generation) return eintrag.chunks;
  const chunks = store.allEmbeddableChunks();
  chunkCache.set(store, { generation, chunks });
  return chunks;
}
function regexFlucht(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function wortGrenzenMuster(name) {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${regexFlucht(name)}($|[^\\p{L}\\p{N}])`, "u");
}
var graphCache = /* @__PURE__ */ new WeakMap();
function graphNamen(store) {
  const generation = store.datenGeneration();
  const eintrag = graphCache.get(store);
  if (eintrag && eintrag.generation === generation) return eintrag.namen;
  const { entities } = store.getGraph(void 0, 1);
  const namen = entities.map((e) => e.name).filter((name) => name.length >= ENTITAET_MIN_LAENGE).map((name) => ({ name, muster: wortGrenzenMuster(name) }));
  graphCache.set(store, { generation, namen });
  return namen;
}
var vektorCache = /* @__PURE__ */ new WeakMap();
function suchVektoren(store) {
  const generation = store.datenGeneration();
  const eintrag = vektorCache.get(store);
  if (eintrag && eintrag.generation === generation) return eintrag.spur;
  const liste = store.allEmbeddableChunks().filter((c) => c.model === DEFAULT_EMBED_MODEL);
  const normen = new Float32Array(liste.length);
  for (let j = 0; j < liste.length; j++) {
    const b = liste[j].embedding;
    let nb = 0;
    for (let i = 0; i < b.length; i++) nb += b[i] * b[i];
    normen[j] = Math.sqrt(nb);
  }
  const spur = { liste, normen };
  vektorCache.set(store, { generation, spur });
  return spur;
}
function entityMentionsInQuery(store, queryLower) {
  const mentions = [];
  for (const { name, muster } of graphNamen(store)) {
    if (queryLower.includes(name) && muster.test(queryLower)) mentions.push(name);
  }
  return mentions;
}
async function searchMemories(store, params) {
  const query = erweitereQuery((params.query || "").trim());
  const limit = Math.min(Math.max(params.limit ?? 10, 1), MAX_SEARCH_LIMIT);
  const queryLower = query.toLowerCase();
  const now = params.asOf ?? Date.now();
  const timeTravel = params.asOf !== void 0;
  const { aktiv: active, byId } = aktiveErinnerungen(store);
  const filters = (m) => {
    const r = m.record;
    if (params.type && r.type !== params.type) return false;
    if (params.scope && r.scope !== params.scope) return false;
    if (params.tags && params.tags.length > 0) {
      const tags = params.tags.map((t) => t.toLowerCase());
      if (!tags.every((t) => r.tags.includes(t))) return false;
    }
    if (params.validSince && r.validFrom !== null && r.validFrom < params.validSince) return false;
    if (timeTravel) {
      const start = r.validFrom ?? r.createdAt;
      if (start !== null && start > now) return false;
      if (r.validTo !== null && r.validTo <= now) return false;
    }
    return true;
  };
  const beine = {
    bm25: params.tracks?.bm25 ?? true,
    vector: params.tracks?.vector ?? true,
    entity: params.tracks?.entity ?? true
  };
  const ftsTiefe = Math.min(MAX_SEARCH_LIMIT, Math.max(500, limit * 2));
  const bm25Ranked = query && beine.bm25 ? store.ftsSearch(query, ftsTiefe).map((h) => h.id).filter((id) => byId.has(id)) : [];
  let vectorRanked = [];
  let queryVector = null;
  let usedVectors = false;
  const vectorSim = /* @__PURE__ */ new Map();
  if (query && beine.vector) {
    queryVector = await embedQuery(query);
    if (queryVector) {
      const spur = suchVektoren(store);
      const liste = spur.liste;
      const normen = spur.normen;
      let na = 0;
      for (let i = 0; i < queryVector.length; i++) na += queryVector[i] * queryVector[i];
      const normA = Math.sqrt(na);
      const bestPerMemory = /* @__PURE__ */ new Map();
      for (let j = 0; j < liste.length; j++) {
        const c = liste[j];
        if (!byId.has(c.memoryId)) continue;
        const b = c.embedding;
        let dot = 0;
        for (let i = 0; i < b.length; i++) dot += queryVector[i] * b[i];
        const sim = normA > 0 && normen[j] > 0 ? dot / (normA * normen[j]) : 0;
        const prev = bestPerMemory.get(c.memoryId);
        if (prev === void 0 || sim > prev) bestPerMemory.set(c.memoryId, sim);
      }
      if (bestPerMemory.size > 0) {
        usedVectors = true;
        for (const [id, sim] of bestPerMemory) vectorSim.set(id, sim);
        let bestSim = 0;
        for (const sim of bestPerMemory.values()) if (sim > bestSim) bestSim = sim;
        const untergrenze = Math.max(VECTOR_FLOOR, bestSim * VECTOR_BAND);
        vectorRanked = [...bestPerMemory.entries()].filter(([, sim]) => sim >= untergrenze).sort((a, b) => b[1] - a[1]).map(([id]) => id);
      }
    }
  }
  let entityRanked = [];
  if (query && beine.entity) {
    const mentions = entityMentionsInQuery(store, queryLower);
    if (mentions.length > 0) {
      const entityIds = mentions.map((name) => store.getEntityByName(name)?.id).filter((id) => id !== void 0);
      const memIds = store.memoryIdsForEntities(entityIds);
      entityRanked = [...memIds].filter((id) => byId.has(id));
    }
  }
  const scores = /* @__PURE__ */ new Map();
  const bump = (rankedList, leg) => {
    rankedList.forEach((id, idx) => {
      const entry = scores.get(id) ?? { rrf: 0, bm25Rank: null, vectorRank: null, entityRank: null };
      entry.rrf += 1 / (RRF_K + idx + 1);
      if (entry[leg] === null) entry[leg] = idx + 1;
      scores.set(id, entry);
    });
  };
  bump(bm25Ranked, "bm25Rank");
  bump(vectorRanked, "vectorRank");
  bump(entityRanked, "entityRank");
  let candidateIds = [...scores.keys()];
  if (!query) {
    candidateIds = active.slice().sort((a, b) => b.record.updatedAt - a.record.updatedAt).map((m) => m.record.id);
  }
  const queryTerms = queryLower.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1);
  const hits = [];
  for (const id of candidateIds) {
    const m = byId.get(id);
    if (!m) continue;
    if (query && !filters(m)) continue;
    if (!query && !filters(m)) continue;
    const r = m.record;
    const entry = scores.get(id);
    let score = entry?.rrf ?? 0;
    const age = Math.max(0, now - r.updatedAt);
    const recencyBonus = Math.max(0, 1 - age / RECENCY_WINDOW_MS) * RECENCY_MAX_BONUS;
    score *= 1 + recencyBonus;
    score *= 0.5 + 0.5 * r.confidence;
    score *= retentionFactor(r, now);
    const expired = !timeTravel && r.validTo !== null && r.validTo < now;
    const superseded = r.supersededBy !== null;
    if (expired) score *= EXPIRED_FACTOR;
    if (superseded) score *= SUPERSEDED_FACTOR;
    const rerank = localRerankScore(query, r);
    if (rerank !== null) score *= 1 + rerank * RERANK_MAX_BOOST;
    const matchedTerms = queryTerms.filter((t) => m.titleLower.includes(t) || m.contentLower.includes(t));
    hits.push({
      memory: r,
      score,
      components: {
        bm25Rank: entry?.bm25Rank ?? null,
        vectorRank: entry?.vectorRank ?? null,
        entityRank: entry?.entityRank ?? null,
        vectorSimilarity: vectorSim.get(id) ?? null,
        rerankScore: rerank
      },
      matchedTerms,
      expired,
      superseded
    });
  }
  const actor = store.extensions.identity.current();
  const kept = store.extensions.policy.filterResults(actor, hits.map((h) => h.memory));
  if (kept.length !== hits.length) {
    const keep = new Set(kept.map((r) => r.id));
    for (let i = hits.length - 1; i >= 0; i--) if (!keep.has(hits[i].memory.id)) hits.splice(i, 1);
  }
  hits.sort((a, b) => b.score - a.score || b.memory.updatedAt - a.memory.updatedAt);
  const top = hits.slice(0, limit);
  if (query && !timeTravel && top.length > 0) {
    store.recordAccess(top.map((h) => h.memory.id));
    const eintrag = aktiverCache.get(store);
    if (eintrag && eintrag.generation === store.memGeneration()) {
      const jetzt = Date.now();
      const imCache = new Map(eintrag.aktiv.map((a) => [a.record.id, a]));
      for (const h of top) {
        const m = imCache.get(h.memory.id);
        if (m) {
          m.record.lastAccessAt = jetzt;
          m.record.accessCount += 1;
        }
      }
    }
  }
  return { hits: top, total: hits.length, query, usedVectors };
}
function indexMemory(store, memoryId) {
  const record = store.getMemory(memoryId);
  if (!record) return;
  const texts = [`${record.title}
${record.tags.join(", ")}`, ...chunkText(record.content)];
  store.replaceChunks(memoryId, texts);
}
function jaccard(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}
async function consolidateMemories(store, opts = {}) {
  const threshold = opts.threshold ?? 0.92;
  const dryRun = opts.dryRun ?? true;
  const active = aktiveErinnerungen(store).aktiv.filter((m) => !m.record.supersededBy && !opts.ausnehmen?.has(m.record.id));
  const candidates = [];
  const chunks = embeddbareChunks(store);
  const centroids = /* @__PURE__ */ new Map();
  for (const c of chunks) {
    if (!active.some((m) => m.record.id === c.memoryId)) continue;
    const prev = centroids.get(c.memoryId);
    if (!prev) {
      centroids.set(c.memoryId, { model: c.model, vec: Float32Array.from(c.embedding), count: 1 });
    } else if (prev.model === c.model) {
      const n = prev.count + 1;
      for (let i = 0; i < prev.vec.length; i++) prev.vec[i] = (prev.vec[i] * prev.count + c.embedding[i]) / n;
      prev.count = n;
    }
  }
  const centroidList = [...centroids.entries()];
  for (let i = 0; i < centroidList.length; i++) {
    for (let j = i + 1; j < centroidList.length; j++) {
      if (centroidList[i][1].model !== centroidList[j][1].model) continue;
      const sim = cosineSimilarity(centroidList[i][1].vec, centroidList[j][1].vec);
      if (sim >= threshold) {
        const a = centroidList[i][0];
        const b = centroidList[j][0];
        const [keep, dup] = pickKeep(store, a, b);
        candidates.push({ keepId: keep, duplicateId: dup, similarity: sim, reason: "embedding" });
      }
    }
  }
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i].record;
      const b = active[j].record;
      const ta = new Set(a.title.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
      const tb = new Set(b.title.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
      if (ta.size === 0 || tb.size === 0) continue;
      let inter = 0;
      for (const w of ta) if (tb.has(w)) inter++;
      const titleSim = inter / Math.min(ta.size, tb.size);
      const tagSim = jaccard(a.tags, b.tags);
      if (titleSim >= 0.85 && (tagSim >= 0.5 || a.tags.length === 0 || b.tags.length === 0)) {
        const pairExists = candidates.some(
          (c) => c.keepId === a.id && c.duplicateId === b.id || c.keepId === b.id && c.duplicateId === a.id
        );
        if (!pairExists) {
          const [keep, dup] = pickKeep(store, a.id, b.id);
          candidates.push({ keepId: keep, duplicateId: dup, similarity: titleSim, reason: "title+tags" });
        }
      }
    }
  }
  let applied = 0;
  if (!dryRun) {
    for (const c of candidates) {
      const dublette = store.getMemory(c.duplicateId);
      const nachfolger = store.getMemory(c.keepId);
      if (dublette && !dublette.supersededBy && nachfolger && !nachfolger.supersededBy) {
        store.supersedeMemory(c.duplicateId, c.keepId);
        applied++;
      }
    }
  }
  return { candidates, applied, dryRun };
}
function pickKeep(store, a, b) {
  const ra = store.getMemory(a);
  const rb = store.getMemory(b);
  const scoreOf = (r) => r ? r.updatedAt + r.content.length * 1e3 : 0;
  return scoreOf(ra) >= scoreOf(rb) ? [a, b] : [b, a];
}

// src/core/version.ts
var APP_VERSION = "3.2.0";

// src/core/mcp.ts
var PROTOCOL_VERSIONS = ["2026-07-28", "2025-06-18", "2024-11-05"];
var stringSchema = (description) => ({ type: "string", description });
var opt = (s) => s;
var memoryOutSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    content: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    type: { type: "string", enum: ["semantic", "episodic", "procedural", "reference"] },
    scope: { type: "string" },
    confidence: { type: "number" },
    validFrom: { type: ["integer", "null"] },
    validTo: { type: ["integer", "null"] },
    supersededBy: { type: ["string", "null"] },
    createdAt: { type: "integer" },
    updatedAt: { type: "integer" }
  },
  required: ["id", "title", "content"]
};
var searchOutSchema = {
  type: "object",
  properties: {
    query: { type: "string" },
    count: { type: "integer" },
    usedVectors: { type: "boolean" },
    hits: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ...memoryOutSchema.properties,
          score: { type: "number" },
          expired: { type: "boolean" },
          superseded: { type: "boolean" },
          matchedTerms: { type: "array", items: { type: "string" } }
        },
        required: ["id", "title", "score"]
      }
    }
  },
  required: ["query", "count", "hits"]
};
var TOOLS = [
  {
    name: "memory_search",
    title: "Search memory",
    description: "Hybrid retrieval (BM25 + vectors + knowledge graph) over KEPTA memory. Expired and superseded memories are flagged as such; memories the owner marked private never appear here.",
    inputSchema: {
      type: "object",
      properties: {
        query: opt(stringSchema("Search query, in natural language")),
        limit: opt({ type: "integer", description: "Max hits (1-100, default 10)", default: 10 }),
        tags: opt({ type: "array", items: { type: "string" }, description: "Tag filter (AND)" }),
        type: opt({ type: "string", enum: ["semantic", "episodic", "procedural", "reference"] }),
        scope: opt(stringSchema("Scope filter, e.g. agent:coder or session:abc"))
      },
      required: ["query"]
    },
    outputSchema: searchOutSchema
  },
  {
    name: "memory_save",
    title: "Save memory",
    description: "Saves a knowledge node, or updates one when id is given. [[Wiki links]] in the text become linked entities.",
    inputSchema: {
      type: "object",
      properties: {
        id: opt(stringSchema("Existing id, to update instead of create")),
        title: opt(stringSchema("Title")),
        content: opt(stringSchema("Content")),
        tags: opt({ type: "array", items: { type: "string" } }),
        type: opt({ type: "string", enum: ["semantic", "episodic", "procedural", "reference"], description: "semantic=fact, episodic=event, procedural=how-to, reference=imported document" }),
        scope: opt(stringSchema('Scope, default "local". "private" keeps the memory out of every agent channel \u2014 search, list, graph, consolidate, id lookups \u2014 while the owner still sees it in the app.')),
        confidence: opt({ type: "number", description: "0..1" }),
        validFrom: opt({ type: "integer", description: "epoch milliseconds" }),
        validTo: opt({ type: "integer", description: "epoch milliseconds" })
      },
      required: ["title", "content"]
    },
    outputSchema: {
      type: "object",
      properties: {
        created: { type: "boolean" },
        memory: { ...memoryOutSchema, type: ["object", "null"] },
        // rejected → null
        duplicateWarning: { type: ["object", "null"], properties: { existingId: { type: "string" }, similarity: { type: "number" } } },
        gateOutcome: { enum: ["created", "updated", "rejected", null] },
        writeGate: {
          type: ["object", "null"],
          properties: {
            decision: { type: "string", enum: ["ADD", "UPDATE", "DELETE", "NOOP"] },
            reason: { type: "string" },
            targetId: { type: "string" }
          }
        }
      },
      required: ["created", "memory"]
    }
  },
  {
    name: "memory_update",
    title: "Update memory",
    description: "Updates fields of an existing memory (patch).",
    inputSchema: {
      type: "object",
      properties: {
        id: opt(stringSchema("Id of the memory")),
        title: opt({ type: "string" }),
        content: opt({ type: "string" }),
        tags: opt({ type: "array", items: { type: "string" } }),
        type: opt({ type: "string", enum: ["semantic", "episodic", "procedural", "reference"] }),
        confidence: opt({ type: "number" }),
        validFrom: opt({ type: ["integer", "null"] }),
        validTo: opt({ type: ["integer", "null"] })
      },
      required: ["id"]
    },
    outputSchema: { type: "object", properties: { updated: { type: "boolean" }, memory: memoryOutSchema }, required: ["updated"] }
  },
  {
    name: "memory_delete",
    title: "Delete memory",
    description: "Moves a memory to the trash (default), or deletes it for good (permanent).",
    inputSchema: {
      type: "object",
      properties: {
        id: opt(stringSchema("Id of the memory")),
        permanent: opt({ type: "boolean", description: "true = delete permanently", default: false })
      },
      required: ["id"]
    },
    outputSchema: { type: "object", properties: { trashed: { type: "boolean" }, purged: { type: "boolean" } }, required: [] }
  },
  {
    name: "memory_list",
    title: "List memories",
    description: "Lists memories, paginated and filterable. Private ones are never listed, not even when scope is asked for explicitly.",
    inputSchema: {
      type: "object",
      properties: {
        limit: opt({ type: "integer", default: 20, description: "1-200" }),
        offset: opt({ type: "integer", default: 0 }),
        type: opt({ type: "string", enum: ["semantic", "episodic", "procedural", "reference"] }),
        tag: opt({ type: "string" }),
        scope: opt({ type: "string" }),
        trash: opt({ type: "boolean", description: "Trash instead of active memories", default: false })
      }
    },
    outputSchema: {
      type: "object",
      properties: { count: { type: "integer" }, total: { type: "integer" }, memories: { type: "array", items: memoryOutSchema } },
      required: ["count", "memories"]
    }
  },
  {
    name: "memory_graph",
    title: "Knowledge graph",
    description: "Entities and relations around one entity, or the whole graph, capped.",
    inputSchema: {
      type: "object",
      properties: {
        entity: opt(stringSchema("Entity name (optional)")),
        depth: opt({ type: "integer", description: "Graph depth 1-4, default 2" })
      }
    },
    outputSchema: {
      type: "object",
      properties: {
        entities: { type: "array", items: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
        relations: {
          type: "array",
          items: {
            type: "object",
            properties: { source: { type: "string" }, target: { type: "string" }, relation: { type: "string" } },
            required: ["source", "target", "relation"]
          }
        }
      },
      required: ["entities", "relations"]
    }
  },
  {
    name: "memory_consolidate",
    title: "Consolidate memory",
    description: "Finds duplicates and contradictions by embedding similarity; without dryRun it marks the older copy as superseded.",
    inputSchema: {
      type: "object",
      properties: {
        dryRun: opt({ type: "boolean", description: "true = suggestions only (default)", default: true }),
        threshold: opt({ type: "number", description: "Similarity threshold 0..1, default 0.92" })
      }
    },
    outputSchema: {
      type: "object",
      properties: {
        dryRun: { type: "boolean" },
        applied: { type: "integer" },
        candidates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              keepId: { type: "string" },
              duplicateId: { type: "string" },
              similarity: { type: "number" },
              reason: { type: "string" }
            },
            required: ["keepId", "duplicateId", "similarity"]
          }
        }
      },
      required: ["dryRun", "candidates"]
    }
  },
  {
    name: "memory_forget",
    title: "Forget",
    description: "Temporal invalidation: expire sets valid_to to now, supersede marks the memory as replaced by supersedeBy, delete moves it to the trash.",
    inputSchema: {
      type: "object",
      properties: {
        id: opt(stringSchema("Id of the memory")),
        mode: opt({ type: "string", enum: ["expire", "supersede", "delete"], description: "default: expire" }),
        validTo: opt({ type: "integer", description: "mode=expire only, defaults to now" }),
        supersedeBy: opt(stringSchema("mode=supersede only: id of the successor memory"))
      },
      required: ["id"]
    },
    outputSchema: { type: "object", properties: { forgotten: { type: "boolean" }, mode: { type: "string" } }, required: ["forgotten"] }
  }
];
var WIKI_LINK_RE = /\[\[([^[\]]{2,80})\]\]/g;
function extractWikiLinks(text) {
  const out = [];
  for (const m of text.matchAll(WIKI_LINK_RE)) {
    const name = m[1]?.split("|")[0]?.trim().toLowerCase();
    if (name) out.push(name);
  }
  return [...new Set(out)];
}
function saveWithIndex(store, args) {
  const title = String(args.title ?? "");
  const content = String(args.content ?? "");
  if (!title.trim() || !content.trim()) throw new Error("title and content are required");
  const input = {
    id: args.id ? String(args.id) : void 0,
    title,
    content,
    tags: Array.isArray(args.tags) ? args.tags : [],
    type: args.type,
    scope: args.scope ? String(args.scope) : void 0,
    confidence: typeof args.confidence === "number" ? args.confidence : void 0,
    validFrom: typeof args.validFrom === "number" ? args.validFrom : void 0,
    validTo: typeof args.validTo === "number" ? args.validTo : void 0
  };
  const { record, created } = store.upsertMemory(input);
  indexMemory(store, record.id);
  const links = extractWikiLinks(`${record.title} ${record.content}`);
  store.linkEntities(record.id, [record.title, ...links]);
  const titleEntity = record.title.trim().toLowerCase();
  for (const link of links) {
    if (link !== titleEntity) store.addRelation(titleEntity, link, "mentions", record.id);
  }
  return { created, record: store.getMemory(record.id) };
}
var VERSIONEN_ABSTEIGEND = [...PROTOCOL_VERSIONS].sort().reverse();
var AELTESTE_PROTOCOL_VERSION = VERSIONEN_ABSTEIGEND[VERSIONEN_ABSTEIGEND.length - 1];
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  APP_VERSION,
  DEFAULT_EMBED_MODEL,
  KeptaStore,
  MAX_SEARCH_LIMIT,
  PLAINTEXT_KEY,
  TOOLS,
  consolidateMemories,
  cosineSimilarity,
  defaultExtensions,
  indexMemory,
  saveWithIndex,
  searchMemories
});
