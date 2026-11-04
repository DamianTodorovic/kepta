// K3PTA Core — SQLite-Storage (SQLite3 Multiple Ciphers, FTS5, WAL)
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
import { leseUmwelt } from "./umwelt";
import { begriffeAusText } from "./begiffe";
import { BEHAUPTUNGEN_MAX, SYSTEM_WOERTER, type BehauptungEingabe } from "./wortschatz";
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
// Ein Sanitizer für alle Wege: dieselben Regeln wie die App, am selben Ort gepflegt.
import { sanitizeText as cleanText, sanitizeTags as normalizeTags } from "./sanitize";
// Öffentliche Fassung unter dem alten Namen für Abnehmer (obsidian.ts, Tests).
export { sanitizeTags as normalizeTags } from "./sanitize";

const SCHEMA_VERSION = 1;
const VALID_TYPES: MemoryType[] = ["semantic", "episodic", "procedural", "reference"];
// Die Scheibe der Graph-Abfrage: 500 Begriffe und 2 000 Kanten sind unveraendert,
// neu ist, **wie** die 500 gewaehlt werden (#83-2: Nachbarschaft, nicht Rangliste).
// Der Pool ist die Rangtiefe, aus der Samen und Blaetter kommen; 8 000 Paare sind
// die Adjazenz, die der Wachstumslauf im Kopf haelt.
const GRAPH_FENSTER_KNOTEN = 500;
const GRAPH_PAAR_POOL = 8000;
const GRAPH_RANG_POOL = 4000;

/**
 * Der Etat der Rueckwaertssuche im Entity-Bein (`begriffeImWortlaut`), drei Zahlen am selben Ort.
 *
 * Die Stueck-Kappe ist ein Etat, keine Weltgrenze: gemessen 4.11. an der 40 000-Notizen-Kapsel
 * kostet eine Lesung mit 4 000 Stuecken 2,22 ms, und was ueber der Kappe faellt, sind die
 * Theilstuecke innerhalb der Woerter — die ganzen Woerter und Wortfolgen stehen zuerst in der
 * Liste und gehen nie verloren.
 */
const BEGRIFF_STUECKE_MAX = 4000;
/**
 * Bis zu dieser Laenge wird ein Wort der Anfrage in Theilstuecke zerlegt ("frist" in
 * "fristenkontrolle"). Die Zahl sitzt ueber der Laenge, die die Welt kennt: kein Begriff wird
 * laenger als 40 Zeichen gesetzt (`begiffe.ts:32`), laengere Theilstuecke kann es also nicht
 * geben, und ein kuerzerer Begriff findet sich in einem Wort bis 48 Zeichen immer.
 */
const BEGRIFF_STUECK_LAENGE = 48;
/** Mehrwortige Begriffe werden als Wortfolge bis vier Woerter gesucht — so lang ist der langste, den `begiffe.ts:33` durchlaesst. */
const BEGRIFF_WORTFOLGE_MAX = 4;

/**
 * Welche Namen der Wortlaut selbst hergibt: die ganzen Woerter, dann Wortfolgen bis
 * `BEGRIFF_WORTFOLGE_MAX` Woerter, dann die Theilstuecke innerhalb eines Wortes. In dieser
 * Reihenfolge, damit eine Kappe immer zuerst die Form trifft, die am seltensten einen Begriff
 * ergibt: die Theilstuecke innerhalb eines Wortes.
 */
function wortstueckeAus(wortlaut: string): string[] {
  const worter = wortlaut.trim().toLowerCase().split(/\s+/).filter((w) => w.length > 0);
  if (worter.length === 0) return [];
  const stuecke = new Set<string>();
  for (const w of worter) if (w.length >= 3) stuecke.add(w);
  for (let a = 0; a < worter.length; a++) {
    let folge = worter[a]!;
    for (let b = a + 1; b < worter.length && b - a < BEGRIFF_WORTFOLGE_MAX; b++) {
      folge = `${folge} ${worter[b]!}`;
      stuecke.add(folge);
    }
  }
  for (const w of worter) {
    const kern = w.slice(0, BEGRIFF_STUECK_LAENGE);
    for (let i = 0; i < kern.length; i++) {
      for (let e = i + 3; e <= kern.length && e - i <= BEGRIFF_STUECK_LAENGE; e++) stuecke.add(kern.slice(i, e));
    }
  }
  return [...stuecke].slice(0, BEGRIFF_STUECKE_MAX);
}

/**
 * Die Stufen der Tiefe, die die Flaeche zeigt und die Tuer klemmt — **eine** Zahl, nicht
 * drei Kopien: `server/router/system.ts` klemmt an diesen Werten, und der Wachtest
 * (`tests/core/graph-tiefe.test.ts`) faellt, wenn Tuer und Kern unterschiedlich rechnen.
 */
export const GRAPH_TIEFE_MIN = 1;
export const GRAPH_TIEFE_MAX = 4;

// Punkt 126 — was eine Hand als Aussage setzen kann, und welche Woerter keine Aussage sind:
// beide Antworten liegen in `src/core/wortschatz.ts`, weil Kern und Flaeche dieselbe Menge
// brauchen. Die Geschichte der zwei Listen steht dort.

export function defaultDataDir(): string {
  // Beide Namensformen (Aufgabe #64): K3PTA_DATA_DIR zuerst, KEPTA_DATA_DIR als
  // Rueckfall. Wer nur die alte Form gesetzt hat, behaelt seinen Ordner — und damit
  // seinen Bestand. Der Default bleibt `~/.kepta`: ein Zug waehre eine
  // Auslieferungstatsache, kein Texttausch.
  const env = leseUmwelt("datenordner").wert;
  if (env) return env;
  return path.join(os.homedir(), ".kepta");
}

export function defaultDbPath(): string {
  return path.join(defaultDataDir(), "kepta.db");
}

// ---------- Normalisierung (kleiner Spiegel der Server-Sanitizer) ----------

// ---------- Normalisierung: siehe src/core/sanitize.ts (der eine Sanitizer für alle Wege) ----------

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

export interface Stand {
  id: number;
  memoryId: string;
  title: string;
  content: string;
  createdAt: number;
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
      -- Die Zaehler-Route und der Graph-Leseweg sortieren nach updated_at UND filtern
      -- deleted_at IS NULL. Einer der beiden Indizes allein genugt dem Planer nicht:
      -- erklaerplan 19.10. an einer eignen Kapsel (21 066 Zeilen) sagte je Seite
      -- "SEARCH memories USING INDEX idx_memories_deleted | USE TEMP B-TREE FOR ORDER BY".
      -- Mit diesem Index faellt der Sortierbaum ganz: erklaerplan zeigt nur noch den
      -- Index, gemessene Zeit fuer denselben Bestand auf derselben Engine
      -- (SQLite 3.53.2): 2 936 ms Schleife gegen 39 ms mit Index; zweiter Anlauf bei
      -- 27 066 Zeilen: 3 199 ms gegen 40 ms. Anlegen + ANALYZE kosten 42 ms und 0,4 MiB
      -- Datei. Schreiblast gemessen 19.10. 13:44 an derselben Kapsel: 3 000 einzelne
      -- Schreibungen 0,259 ms je Zeile ohne Index, 0,286 ms mit — +0,027 ms (10,4 %),
      -- ueber den vollen Bestand 21 066 also rund +0,57 s, verteilt ueber den Lauf.
      CREATE INDEX IF NOT EXISTS idx_memories_deleted_updated ON memories(deleted_at, updated_at DESC, rid);
      -- Titel-Spur (Punkt 6, 31.10.): der Import sucht je neue Notiz ihren Titel in
      -- findByTitle, und ohne diese Spur nimmt der Plan idx_memories_deleted_updated —
      -- bei deleted_at IS NULL also fast alle Zeilen des Bestands, sortiert nach
      -- updated_at. Gemessen am Schreibweg (6 000 Notizen in Brocken zu 500, eigne Kapsel,
      -- Vektorspur aus, 23:09 MESZ): die Phase lesen laeuft von 40,34 ms auf 590,94 ms
      -- hoch, waehrend einsetzen flach bleibt (211,20 -> 217,34). Der Index kehrt das um:
      -- Titel ist die Gleichheit, deleted_at die Filterzeile, rid haelt den Sturz bei
      -- doppeltem Titel eindeutig.
      -- (Kein Backtick in diesem Kommentar: er steht in einem Template-Literal, und ein
      -- Backtick dort schliesst die Zeichenkette — gemessen 23:14 an diesem Blatt.)
      -- Die Sortierzeile bleibt in der Spur: ohne updated_at DESC im Index gewinnt
      -- idx_memories_deleted_updated, weil er den Sortierbaum spart. Plan gemessen
      -- 23:16 MESZ vor dem zweiten Versuch: SEARCH memories USING INDEX
      -- idx_memories_deleted_updated (deleted_at=?) — die Gleichheit auf dem Titel
      -- wurde nie gesucht.
      CREATE INDEX IF NOT EXISTS idx_memories_title ON memories(title, deleted_at, updated_at DESC, rid);
      -- Standfolge (BAU-P3-11, 24.10.): der Text VOR einer Aenderung, damit ein Mensch
      -- zurueckgehen kann. Bewusst eine eigene Tabelle statt einer zweiten Zeile in
      -- 'memories': die Notiz bleibt eine Notiz, ihre Suche und ihr Graph aendern sich nicht.
      -- Geschrieben wird nur bei einem echten Textwechsel (updateMemory), nie bei Tags,
      -- Typ, Zeigern oder einem Schreibvorgang mit identischem Text.
      CREATE TABLE IF NOT EXISTS memory_stande (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memory_stande_note ON memory_stande(memory_id, created_at DESC, id DESC);
      -- Die Deckungs-Zaehlung der Graph-Route ('notizenMitBegriff()', src/core/store.ts:1362)
      -- filtert 'm.deleted_at IS NULL' und braucht von 'memories' weiter nichts als 'm.id'.
      -- Ohne diese zwei Spalten in einem Index muss sie fuer jede Trefferzeile in die
      -- Tabellenblaetter — an seiner verschluesselten Platte heisst das: jede Seite, jede
      -- Entschluesselung. Kapsel mit dem WORTLICHEN DDL-Satz von 'migrate()' (alle Indizes der
      -- beiden Tabellen, 16-Spalten-Zeilen zu ~1 400 B Inhalt, Chiffre wie 'store.ts:1490', WAL,
      -- Engine des ausgelieferten Buendels, SQLite 3.53.2), Korpus in Realstruktur: 21 066 aktive
      -- Notizen + 502 Papierkorb, 2 756 Begriffe, 3 054 Erwaehnungen auf 1 018 gedeckte.
      -- Zwei Durchlaeufe, 19.10. 20:55 und 20:57 MESZ, auf derselben Kapsel. Zeilen: vorher
      -- 21 568 / 23 568, nachher 22 568 / 24 568 — je ein Schreiblast-Zweig zu 1 000 Notizen liegt
      -- zwischen der vorher- und der nachher-Lesung. Je fuenf Anlaeufe: Zaehlung **189,42 ms** und
      -- **206,46 ms** Median (Spannen der vier
      -- waermeren Anlaeufe 188,50-210,14 und 203,51-208,33; der erste Anlauf in frischer Verbindung
      -- 197,40 und 358,64 ms) gegen **2,51 ms** und **2,29 ms** Median (waermere 2,32-2,60 und
      -- 2,28-2,29; erster Anlauf 6,04 und 4,32 ms) = **75x** und **90x**.
      -- Die Zahl selbst aendert der Index nicht: 1 018 gedeckte in beiden Plaenen. Plan vorher
      -- 'SEARCH m USING INDEX idx_memories_deleted', nachher 'SEARCH m USING COVERING INDEX
      -- idx_memories_deleted_id'. Anlegen 595,62 ms und 234,65 ms, Datei jeweils +0,4 MiB.
      -- Schreiblast, je 1 000 Notizen auf getrennten Zeilmengen: Durchlauf 1 0,0252 ms ohne gegen
      -- 0,0310 ms mit (+0,0058 ms je Zeile), Durchlauf 2 0,0225 ohne gegen 0,0236 mit (+0,0011 ms).
      -- Der Zuwachs ist klein, aber von Durchlauf zu Durchlauf NICHT stabil — ueber den vollen
      -- Bestand sind das 0,02 bis 0,12 s, verteilt ueber viele Schreibungen.
      -- An der Tuer gemessen (3.2.23 @ 64433, n=20): die Kontroll-Lesung ohne Begriffs-Fund
      -- kostet **p50 298,5 ms**. Von den 189-206 ms, die diese Kapsel fuer die Zahlung braucht,
      -- nimmt der Index dort alles ausser 2-3 ms; die restlichen ~90-110 ms der Kontroll-Lesung
      -- erklaert er **nicht** — dafuer fehlt ein Zeitsensor im Prozess, und die laufende Tuer
      -- traegt ausserdem weder diese Fassung noch diesen Index.
      -- Nebenbefund, gegen meine eigne Behauptung geprueft: nach diesem Index aendert das
      -- Wegfallen von 'idx_memories_deleted' (Zeile 273) an drei geprueften Lesungen (Deckung,
      -- Durchstich, Blaetterliste) keinen Plan. Das sind drei Pruefungen, nicht die ganze Route —
      -- die Raeumentscheidung bleibt die Leitung, dieser Flicken ruehrt nichts an.
      CREATE INDEX IF NOT EXISTS idx_memories_deleted_id ON memories(deleted_at, id);

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
      -- Der Primarschluessel oben deckt (memory_id, entity_id) — die Nachschlage des
      -- Graphen filtert aber NACH entity_id: server/router/system.ts:97 ruft
      -- store.memoryIdsForEntities([id]) je Begriff des Fensters, also 500 mal pro
      -- /api/graph-Abruf. Die Abfrage steht auf src/core/store.ts:1341, dieselbe Form
      -- auf src/core/store.ts:551, und src/core/engine.ts:390 ruft sie gebuendelt.
      -- Ohne Index ist das ein Vollscan je Begriff.
      -- Gemessen 19.10. 15:24 MESZ an der eignen Kapsel (SQLite 3.53.2 aus dem
      -- ausgelieferten BUndel, eigne Tabellen, sein Bestand nie geoeffnet):
      --   3 054 Erwaehnungen: 500 Nachschlaege = 22,46 ms | ein IN(500) = 0,21 ms
      --  30 540 Erwaehnungen: 500 Nachschlaege = 209,59 ms | ein IN(500) = 1,92 ms
      --  mit diesem Index: 2,25 ms statt 209,59 ms (Plan: SEARCH … USING INDEX,
      --  vorher SCAN memory_entities) — 93x.
      --  Schreiblast, gleiche Kapsel, getrennte Zeilmengen: 6 000 Erwaehnungen
      --  0,0007 ms je Zeile ohne Index, 0,0010 ms mit (+0,0003 ms, +50,6 %, absolut
      --  +2,1 ms auf 6 000 Zeilen); Anlegen 3,37 ms.
      CREATE INDEX IF NOT EXISTS idx_memory_entities_entity ON memory_entities(entity_id);
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
      CREATE INDEX IF NOT EXISTS idx_relations_memory ON relations(memory_id);
      -- Die Frage einer Notiz nach IHREN Kanten (Punkt 6, 31.10.): verknuepfeNotiz stellt
      -- sie pro geschriebener Notiz, und ohne diese Spur war der Plan "SCAN relations" —
      -- die ganze Kantentabelle fuer eine Notiz. Erklaerplan gemessen 23:3x MESZ vor dem
      -- Index: SCAN relations. Die Teilzeiten des Schreibwegs sagten dasselbe in Zahlen:
      -- begriffekanten 311,95 -> 1 378,13 ms, waehrend chunksetzen flach blieb (62,75 ->
      -- 82,07 ms) -- eine Phase, die mit dem Bestand mitlaeuft, nicht mit der Arbeit.
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

    // Dieselbe Masche fuer chunks: embeddingStats() oeffnete ohne diese Spalte jede Zeile der
    // Tabelle, weil ihr Praedikat auf einem BLOB steht — also jede Seite, also jede
    // Entschluesselung. Die generierte Spalte haelt die Wahrheit von selbst ab: sie leitet
    // `embedding IS NOT NULL` ab, sie wird von keinem Schreibweg gesetzt. An der eignen Kapsel
    // 19.10. 17:50 gezaehlt: Wahrheit 1 001, generiert 1 001, gegen embedding_model 1 000
    // (eine Zeile mit Vektor ohne Modell) — deshalb zaehlt diese Fassung NICHT die Modell-Spalte.
    try {
      this.db.exec(
        `ALTER TABLE chunks ADD COLUMN embedding_hat INTEGER GENERATED ALWAYS AS (CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END) VIRTUAL`,
      );
    } catch {
      // Spalte existiert bereits
    }
    // (embedding_hat, embedding_model) bedient beide Zahlungen ohne BLaetterbaum:
    // `WHERE embedding_hat = 1` und `… GROUP BY embedding_model`. Plan gemessen in der Kapsel:
    // vorher "SCAN chunks" (+ "USE TEMP B-TREE FOR GROUP BY"), nachher "SEARCH chunks USING INDEX".
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_chunks_hat_model ON chunks(embedding_hat, embedding_model)");
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

  /**
   * Der ganze Bestand in EINEM Durchstich, nicht in Seitenchleifen.
   *
   * Warum das hier steht: "ORDER BY updated_at DESC LIMIT ? OFFSET ?" ist ueber dem
   * nicht-eindeutigen Schluessel nicht dasselbe wie ein Durchstich. Gemessen 19.10.
   * an einer eignen Kapsel (21 066 Zeilen, drei verschiedene updated_at-Werte, also
   * maximaller Gleichstand; eigne DB, nicht Damians Bestand): **0 doppelte und 0
   * fehlende Zeilen**, die Reihenfolge war ueber zwei Anlaeufe **gleich**, aber
   * **Seite 3 der Schleife teilte keine einzige Position mit Zeile 2000..2999 des
   * Durchstichs (0/1000)**. Ein Leib, ueber dem ein ETag steht
   * (`server/router/memories.ts`, Zeile 294), haengt damit an der Blattaufteilung,
   * nicht am Bestand.
   *
   * Der zweite Grund ist die Zahl selbst: je Seite faellt ein Sortierbaum
   * ("USE TEMP B-TREE FOR ORDER BY",erklaerplan gemessen), bei 21 066 Zeilen und
   * Seite 1000 also 22 mal. Derselbe Bestand, dieselbe Engine (SQLite 3.53.2,
   * better-sqlite3 12.11.1): **2 936 ms Schleife gegen 93 ms Durchstich**.
   */
  alleMemories(opts: { trash?: boolean } = {}): MemoryRecord[] {
    const wo = opts.trash ? "deleted_at IS NOT NULL" : "deleted_at IS NULL";
    const rows = this.db.prepare(
      `SELECT ${KeptaStore.COLS} FROM memories WHERE ${wo} ORDER BY updated_at DESC`,
    ).all() as Record<string, unknown>[];
    return rows.map((r) => this.rowToRecord(r));
  }

  countMemories(): { active: number; trashed: number } {
    const active = (this.db.prepare("SELECT COUNT(*) c FROM memories WHERE deleted_at IS NULL").get() as { c: number }).c;
    const trashed = (this.db.prepare("SELECT COUNT(*) c FROM memories WHERE deleted_at IS NOT NULL").get() as { c: number }).c;
    return { active, trashed };
  }

  /**
   * Die privaten ids auf einmal — für die Kanäle, die eine Menge prüfen (Graph,
   * Konsolidierung). Dieselbe Grenze wie istPrivat(), ein Zugriff statt n
   * Abfragen.
   */
  privateMemoryIds(): Set<string> {
    const zeilen = this.db.prepare("SELECT id FROM memories WHERE scope = 'private'").all() as { id: string }[];
    return new Set(zeilen.map((z) => z.id));
  }

  /** Dieselbe Grenze wie privateMemoryIds(), aber über den Primärschlüssel — für Einzelfragen. */
  istPrivat(id: string): boolean {
    return this.db.prepare("SELECT 1 FROM memories WHERE id = ? AND scope = 'private'").get(id) !== undefined;
  }

  /**
   * Die Notizen, die eine Entität tragen. Entitäten sind abgeleitete Daten: ein
   * Knoten fällt erst, wenn ALLE seine Träger-Notizen privat sind — nennt ihn
   * auch eine offene Notiz, gehört der Name zur offenen Welt.
   */
  memoryIdsByEntity(entityIds: number[]): Map<number, string[]> {
    const map = new Map<number, string[]>();
    if (entityIds.length === 0) return map;
    const placeholders = entityIds.map(() => "?").join(",");
    const rows = this.db
      .prepare(`SELECT entity_id, memory_id FROM memory_entities WHERE entity_id IN (${placeholders})`)
      .all(...entityIds) as { entity_id: number; memory_id: string }[];
    for (const r of rows) {
      const Liste = map.get(r.entity_id);
      if (Liste) Liste.push(String(r.memory_id));
      else map.set(r.entity_id, [String(r.memory_id)]);
    }
    return map;
  }

  /**
   * Macht einen Stand wieder zur aktuellen Fassung (BAU-P3-11, dritter Koerper).
   * Ein Umschlag, drei Schritte: (1) den Text, der ersetzt wird, als neuen Stand sichern,
   * (2) die Policy fragen, (3) schreiben. Faellt (2) oder (3), rollt (1) mit zurueck -
   * ein Stand fuer eine Aenderung, die nie kam, waere ein halber Zustand.
   */
  restoreStand(memoryId: string, standId: number): MemoryRecord | null {
    const row = this.getRow(memoryId);
    if (!row) return null;
    const stand = this.db
      .prepare("SELECT title, content FROM memory_stande WHERE id = ? AND memory_id = ?")
      .get(standId, memoryId) as { title: string; content: string } | undefined;
    if (!stand) return null;
    const jetzt = Date.now();
    this.db.transaction(() => {
      this.db
        .prepare("INSERT INTO memory_stande (memory_id, title, content, created_at) VALUES (?, ?, ?, ?)")
        .run(memoryId, String(row.title), String(row.content), jetzt);
      if (!this.extensions.policy.canWrite(this.actor(), { id: memoryId, scope: String(row.scope), type: String(row.type) })) {
        throw new Error("Write denied (PolicyGate)");
      }
      this.db
        .prepare("UPDATE memories SET title = ?, content = ?, updated_at = ? WHERE id = ?")
        .run(stand.title, stand.content, jetzt, memoryId);
      this.db.prepare("DELETE FROM chunks WHERE memory_id = ?").run(memoryId);
    })();
    this.audit("update", memoryId);
    this.meldeMemorie(memoryId);
    return this.getMemory(memoryId);
  }

  /** Die Staende EINER Notiz, neueste zuerst (BAU-P3-11, gratis, ohne Schluessel). */
  listStande(
    memoryId: string,
    opts: { limit?: number; offset?: number } = {},
  ): { staende: Stand[]; total: number } {
    const limit = Math.max(0, Math.min(Math.floor(opts.limit ?? 20), 200));
    const offset = Math.max(0, Math.floor(opts.offset ?? 0));
    const kopf = this.db
      .prepare("SELECT COUNT(*) AS n FROM memory_stande WHERE memory_id = ?")
      .get(memoryId) as { n: number } | undefined;
    const total = Number(kopf?.n ?? 0);
    const rows = this.db
      .prepare(
        "SELECT id, memory_id, title, content, created_at FROM memory_stande WHERE memory_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
      )
      .all(memoryId, limit, offset) as Array<Record<string, unknown>>;
    return {
      staende: rows.map((r) => ({
        id: Number(r.id),
        memoryId: String(r.memory_id),
        title: String(r.title),
        content: String(r.content),
        createdAt: Number(r.created_at),
      })),
      total,
    };
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
    this.meldeMemorie(record.id);
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
    const jetzt = patch.updatedAt ?? Date.now();
    sets.push("updated_at = ?");
    params.push(jetzt);
    params.push(id);
    if (!this.extensions.policy.canWrite(this.actor(), { id, scope: String(row.scope), type: String(row.type) })) {
      throw new Error("Write denied (PolicyGate)");
    }
    // Standfolge (BAU-P3-11): nur ein echter Textwechsel legt einen Stand an, und der Stand
    // traegt die Zeile, die JETZT in der Tabelle steht. Beides in einem Umschlag, damit es
    // keinen halben Zustand gibt (Stand ohne Update oder Update ohne Stand).
    const neuerTitel = patch.title !== undefined ? (cleanText(patch.title, 200) || "Untitled") : String(row.title);
    const neuerInhalt = patch.content !== undefined ? cleanText(patch.content, 200_000) : String(row.content);
    const textWechselt = neuerTitel !== String(row.title) || neuerInhalt !== String(row.content);
    this.db.transaction(() => {
      if (textWechselt) {
        this.db
          .prepare("INSERT INTO memory_stande (memory_id, title, content, created_at) VALUES (?, ?, ?, ?)")
          .run(id, String(row.title), String(row.content), jetzt);
      }
      this.db.prepare(`UPDATE memories SET ${sets.join(", ")} WHERE id = ?`).run(...params);
    })();
    // Content-Änderung macht Chunks + Embeddings obsolet
    if (patch.content !== undefined) this.db.prepare("DELETE FROM chunks WHERE memory_id = ?").run(id);
    this.audit("update", id);
    this.meldeMemorie(id);
    return this.getMemory(id);
  }

  trashMemory(id: string): boolean {
    const res = this.db.prepare("UPDATE memories SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL").run(Date.now(), id);
    const ok = Number(res.changes) > 0;
    if (ok) this.audit("delete", id);
    if (ok) this.meldeMemorie(id);
    return ok;
  }

  restoreMemory(id: string): boolean {
    const res = this.db.prepare("UPDATE memories SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL").run(id);
    const ok = Number(res.changes) > 0;
    if (ok) this.meldeMemorie(id);
    return ok;
  }

  purgeMemory(id: string): boolean {
    const res = this.db.prepare("DELETE FROM memories WHERE id = ?").run(id);
    const ok = Number(res.changes) > 0;
    if (ok) this.audit("delete", id);
    if (ok) this.meldeMemorie(id);
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

  // Daten-Generation: JEDE Mutation an memories/chunks/entities/relations/
  // memory_entities hebt den Zähler. Der Suchpfad cacht daran (engine.ts) —
  // Trigger statt Methoden-Audit, damit auch direkte DB-Schreibzugriffe
  // (Importe, Reparaturen, Migrationen) den Cache zuverlässig invalidieren.
  // Bewusst LAZY: der Konstruktor muss auch auf einer exklusiv gesperrten DB
  // sauber öffnen (kurzSchlafen-Degrade, tests/extensions.test.ts) — dort darf
  // migrate() nichts schreiben. Schlägt das Setup fehl, versucht es der
  // nächste datenGeneration()-Aufruf wieder; der Sicherungs-Bump unten
  // invalidiert dann jeden vor der Aufsetzung gebauten Cache.
  private generationBereit = false;

  private midiereDatenGeneration(): void {
    if (this.generationBereit) return;
    try {
      this.db.exec(`
        INSERT OR IGNORE INTO meta (key, value) VALUES ('daten_generation', '0');
        INSERT OR IGNORE INTO meta (key, value) VALUES ('mem_generation', '0');
        INSERT OR IGNORE INTO meta (key, value) VALUES ('embed_generation', '0');
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
        CREATE TRIGGER IF NOT EXISTS embed_gen_chunks_u AFTER UPDATE OF embedding ON chunks
        WHEN NEW.embedding IS NOT OLD.embedding BEGIN
          UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'embed_generation'; END;
        CREATE TRIGGER IF NOT EXISTS embed_gen_chunks_i AFTER INSERT ON chunks
        WHEN NEW.embedding IS NOT NULL BEGIN
          UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'embed_generation'; END;
        CREATE TRIGGER IF NOT EXISTS embed_gen_chunks_d AFTER DELETE ON chunks
        WHEN OLD.embedding IS NOT NULL BEGIN
          UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'embed_generation'; END;
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
      // DB gesperrt o. ä. — Cache läuft bis zur Aufsetzung mit konstanter
      // Generation; bei gesperrter DB kann ohnehin niemand schreiben.
    }
  }

  /** Zähler aller Daten-Mutationen (Trigger-gespeist) — Cache-Schlüssel des Suchpfads. */
  datenGeneration(): number {
    this.midiereDatenGeneration();
    const row = this.db.prepare("SELECT value FROM meta WHERE key = 'daten_generation'").get() as
      | { value: string }
      | undefined;
    return Number(row?.value ?? 0);
  }

  /**
   * Zähler NUR der memories-Mutationen — Cache-Schlüssel des Erinnerungs-Caches.
   * Getrennt von datenGeneration, damit Chunk-/Graph-Writes (z. B. Embedding-
   * Nachschub) den teuren Erinnerungs-Cache nicht werfen.
   */
  memGeneration(): number {
    this.midiereDatenGeneration();
    const row = this.db.prepare("SELECT value FROM meta WHERE key = 'mem_generation'").get() as
      | { value: string }
      | undefined;
    return Number(row?.value ?? 0);
  }

  /**
   * Zaehler NUR der Schreibfaelle, die ein Embedding beruehren (setzt, aendert, loescht).
   *
   * Der Grund ist die Vektor-Spur in src/core/engine.ts: sie darf nach einer gemeldeten
   * Notiz-Aenderung ihre Zeilen fuer genau diese Notiz nachtragen, statt den ganzen Bestand
   * wieder einzulesen. Das ist nur sicher, wenn sich ausserhalb der Notizen nichts an den
   * Vektoren getan hat — und genau das sagt diese Zahl. Ein neuer Abschnitt ohne Embedding
   * (der Regel-Fall beim Schreiben) ruehrt sie nicht; der Nachzug der Hintergrund-Queue ruehrt
   * sie, und dann baut die Spur neu.
   */
  embedGeneration(): number {
    this.midiereDatenGeneration();
    const row = this.db.prepare("SELECT value FROM meta WHERE key = 'embed_generation'").get() as
      | { value: string }
      | undefined;
    return Number(row?.value ?? 0);
  }

  // ---------- Such-Cache-Delta ----------
  // Der Suchpfad (engine.ts) cacht die aktiven Erinnerungen an der Generation.
  // Statt bei jedem Write den teuren Volllauf zu erzwingen, meldet der Store
  // hier jede Memory-Mutation mit ihrer ID — die Engine patcht ihren Cache
  // deltafisch. Der Trigger bleibt als SICHERHEITSNETZ: Schreibzugriffe, die
  // keine Meldung absetzen (Roh-SQL, Importe), schieben die Generation weiter,
  // ohne zu patchen — der Generation-Vergleich erkennt das und baut voll neu.
  private memorieZuhörer = new Set<(id: string) => void>();

  onMemorieAenderung(fn: (id: string) => void): () => void {
    this.memorieZuhörer.add(fn);
    return () => this.memorieZuhörer.delete(fn);
  }

  private meldeMemorie(id: string): void {
    for (const fn of this.memorieZuhörer) fn(id);
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

  /**
   * Chunks mit Embedding NUR fuer die genannten Notizen — derselbe Zeilen-Schnitt wie
   * `allEmbeddableChunks`, nur nicht fuer die ganze Welt.
   *
   * Der Aufrufer ist die Vektor-Spur in src/core/engine.ts: nach einer gemeldeten
   * Memory-Aenderung reichen ihre eignen Zeilen, um den Vorrat nachzutragen. An der echten
   * Tuer kostete der Volllauf 188,00 ms gegen 8,85 ms am stehenden Vorrat (P51, 3.11.2026,
   * 40 000 Notizen) — dieser Schnitt ist der Weg, den Volllauf zu umgehen.
   */
  chunksFuerMemories(ids: string[]): ReturnType<KeptaStore["allEmbeddableChunks"]> {
    if (ids.length === 0) return [];
    const platz = ids.map(() => "?").join(",");
    const rows = this.db
      .prepare(`SELECT memory_id, seq, text, embedding, embedding_model FROM chunks WHERE embedding IS NOT NULL AND memory_id IN (${platz})`)
      .all(...ids) as Record<string, unknown>[];
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
    // Beiden Zahlungen laufen gegen die generierte Spalte, damit der Planer den Index benutzen
    // kann. `embedding IS NOT NULL` bleibt die Definition — die Spalte leitet sie ab, niemand setzt
    // sie. Gemessen an der echten Tuer 2 256 ms Median (n=10, 3.2.23, Port 64433, 64 163
    // Abschnitte) fuer 842 Byte, gegen 4,4 ms fuer /api/memories?limit=1 in demselben Lauf.
    const embedded = (this.db.prepare("SELECT COUNT(*) c FROM chunks WHERE embedding_hat = 1").get() as { c: number }).c;
    const modelRows = this.db
      .prepare("SELECT embedding_model m, COUNT(*) c FROM chunks WHERE embedding_hat = 1 GROUP BY embedding_model")
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

  /**
   * Setzt die Verknüpfungen einer Notiz **neu** statt sie anzuhäufen. Zwei
   * Gründe, beide gemessen: `linkEntities`/`addRelation` sind insert-only — wer
   * dieselbe Notiz zweimal speicherte, bekam dieselbe Kante zweimal; und ein
   * Wiki-Link, der aus dem Text verschwand, ließ eine Kante zurück, die
   * weiterhin behauptete, die Notiz meine sie.
   *
   * Kanten gehören zu *einer* Notiz (memory_id) und fallen mit ihr: das ist die
   * Grenze, die auch der Privatheits-Floor im Agentenkanal braucht.
   */
  verknuepfeNotiz(memoryId: string, titel: string, links: string[], behauptungen?: readonly BehauptungEingabe[]): number {
    const t = String(titel ?? "").trim().toLowerCase();
    // Der eigene Text spricht zuerst. Ueberschriften und Wiki-Links der Notiz sind
    // Begriffe, egal welcher Schreibweg gerade speichert — sonst gilt die Regel nur
    // fuer die zwei Pfade, die zufaellig selbst verknuepfen (Vault, Agentenkanal),
    // und alles aus dem Rechner-Scan bleibt ein Blatt ohne Kante.
    const notiz = this.getMemory(memoryId);
    const eigenen = notiz ? begriffeAusText(`${notiz.title}\n${notiz.content}`) : [];
    const knoten = new Set<string>();
    const paare = new Map<string, [string, string, string]>();
    for (const roh of [...eigenen, ...links]) {
      const n = String(roh ?? "").trim().toLowerCase();
      if (n.length < 2) continue;
      knoten.add(n);
      if (n !== t) paare.set(`${t}\u0000${n}`, [t, n, "mentions"]);
    }

    // Begriffe, die eine Notiz zusammen nennt, sind miteinander gesetzt — nicht
    // ueber den Titel der Notiz. Ein Titel traegt eine einzige Notiz, faellt
    // damit gegen jeden Bedeutungsschnitt, und die Route liefert ausserdem nur
    // Kanten, deren beide Enden mitgeliefert werden: ueber den Titel haengen
    // Begriffe nie aneinander, und uebrig bleibt ein Kreis aus Blaettern. Die
    // Notiz selbst ist die Aussage — wer in einem Text Budget und Fristen nennt,
    // hat sie verbunden.
    //
    // Gekappt auf die ersten acht Begriffe je Notiz: aus 14 Wuerfen wuerden 91
    // Paare, und eine lange Notiz waere ein Knotenwerk statt einer Aussage.
    // Der Titel bleibt aus der Paarbildung draussen: er haengt schon an jedem
    // seiner Begriffe, und dieselbe Kante zweimal zu setzen ist der alte Fehler.
    const fuerPaare = [...knoten].filter((k) => k !== t).slice(0, 8);
    for (let i = 0; i < fuerPaare.length; i++) {
      for (let j = i + 1; j < fuerPaare.length; j++) {
        const a = fuerPaare[i];
        const b = fuerPaare[j];
        if (!a || !b) continue;
        paare.set(a < b ? a + "|" + b : b + "|" + a, a < b ? [a, b, "co-mentions"] : [b, a, "co-mentions"]);
      }
    }

    // Punkt 126: eine Behauptung von einer Hand. Beide Enden werden Begriffe **dieser**
    // Notiz — `entitaetsNetz` (src/lib/graphLayout.ts:2200) zeichnet eine Aussage ohne
    // beurkundende Notiz nur, wenn beide Enden im Bild stehen, und ein Ende, das niemand
    // traegt, ware eine Kante ins Leere: geschrieben, gezaehlt, nicht zu sehen.
    //
    // Das Wort ist keine Zierde: ein Systemwort malt die Flaeche nie
    // (`SYSTEM_WOERTER`, src/lib/graphLayout.ts:287), also setzt der Kern es gar nicht
    // erst — lieber abgewiesen als unsichtbar gespeichert.
    // Drei Zustände, nicht zwei: **nicht genannt** (undefined) heisst "die Hand hat die
    // Behauptungen nicht angefasst" und haelt, was steht — jeder Agent, der dieselbe
    // Notiz speichert, ruft diese Funktion mit drei Feldern auf, und ein viertes Feld zu
    // erfinden, das er nicht schickt, waere das eigne Wort wegzuwischen. Ein **leeres
    // Feld** heisst dagegen "alle weg": so loescht die Oberflaeche.
    const gewuenschte = behauptungen ?? this.behauptungenVonNotiz(memoryId);
    for (const roh of gewuenschte.slice(0, BEHAUPTUNGEN_MAX)) {
      const q = String(roh?.quelle ?? "").trim().toLowerCase().slice(0, 40);
      const z = String(roh?.ziel ?? "").trim().toLowerCase().slice(0, 40);
      const w = String(roh?.wort ?? "").trim().toLowerCase().slice(0, 40);
      if (q.length < 2 || z.length < 2 || q === z) continue;
      if (w.length < 2 || SYSTEM_WOERTER.has(w)) continue;
      knoten.add(q);
      knoten.add(z);
      paare.set(`${q}\u0000${z}\u0000${w}`, [q, z, w]);
    }

    // Ein Knoten ohne Kante ist auf der Flaeche ein Punkt, kein Netz: das
    // Kraftfeld legt unverbundene Knoten auf einen Kreis. Gemessen am
    // 14.000-Notizen-Kunstbestand — jeder Titel als eigener Begriff ergab
    // 14.216 Begriffe fuer denselben Bestand, der mit dieser Regel 2.568 hat — eine
    // Ueberschwemmung aus Knoten, denen keine Kante folgt. Eine
    // Notiz, die keinen zweiten Begriff nennt, hinterlaesst darum nichts; und
    // weil das Setzen pro Notiz geschieht, fallen ihre fruheren Kanten weg,
    // sobald der letzte Begriff aus ihrem Text verschwindet.
    if (paare.size === 0) knoten.clear();
    else if (t.length >= 2) knoten.add(t);

    const setzen = this.db.transaction(() => {
      const entityIds: number[] = [];
      for (const name of [...knoten].slice(0, 40)) entityIds.push(this.ensureEntity(name));
      const erlaubt = new Set(entityIds);

      const eintrag = this.db.prepare("INSERT OR IGNORE INTO memory_entities (memory_id, entity_id) VALUES (?, ?)");
      for (const eid of entityIds) eintrag.run(memoryId, eid);
      const traeger = this.db.prepare("SELECT entity_id FROM memory_entities WHERE memory_id = ?").all(memoryId) as { entity_id: number }[];
      const entfaernen = this.db.prepare("DELETE FROM memory_entities WHERE memory_id = ? AND entity_id = ?");
      for (const r of traeger) if (!erlaubt.has(r.entity_id)) entfaernen.run(memoryId, r.entity_id);

      // Das Wort gehört zum Paar wie das Paar zur Notiz: verglichen wird
      // (Ende, Ende, Wort), nicht nur (Ende, Ende). Sonst bleibt eine Kante, die
      // frueher "mentions" hiess, unter diesem Wort stehen, obwohl dieselbe Notiz
      // sie jetzt als Mitnennung setzt — und das Paar fuehrte zwei Worte fuer
      // dieselbe Aussage.
      const vorhanden = this.db.prepare("SELECT id, source_id, target_id, relation FROM relations WHERE memory_id = ?").all(memoryId) as
        { id: number; source_id: number; target_id: number; relation: string }[];
      const gewollt = new Set<string>();
      for (const [, [quelle, ziel, wort]] of paare) {
        const sid = this.ensureEntity(quelle);
        const zid = this.ensureEntity(ziel);
        gewollt.add(`${sid}|${zid}|${wort}`);
        if (!vorhanden.some((v) => v.source_id === sid && v.target_id === zid && v.relation === wort)) {
          this.addRelation(quelle, ziel, wort, memoryId);
        }
      }
      const loeschen = this.db.prepare("DELETE FROM relations WHERE id = ?");
      for (const v of vorhanden) if (!gewollt.has(`${v.source_id}|${v.target_id}|${v.relation}`)) loeschen.run(v.id);
      return gewollt.size;
    });

    return setzen() as number;
  }

  getEntityByName(name: string): EntityRecord | null {
    const row = this.db.prepare("SELECT id, name FROM entities WHERE name = ?").get(name.trim().toLowerCase()) as
      | { id: number; name: string }
      | undefined;
    return row ?? null;
  }

  /**
   * Die Begriffe, die ein Wortlaut nennt — umgekehrt gefragt: nicht die Rangfolge der Begriffe
   * durchgehen und pruefen, welcher darin vorkommt, sondern die Stuecke des Wortlauts gegen den
   * Namensindex (`entities.name UNIQUE`) lesen.
   *
   * Warum: der Vorrat war eine Zusammenrechnung ueber den ganzen Bestand — gemessen 4.11. an der
   * 40 000-Notizen-Kapsel (40 008 Begriffe, 360 000 Kanten, 160 000 Verknuepfungen) 63,90 ms warm
   * und 123,41 ms kalt, und jeder Notiz-Schreibfall hebt `daten_generation`, an der der Vorrat in
   * `engine.ts` haengt. Die erste Anfrage nach einem Speichern zahlte sie: 134,74 ms von 157 ms
   * an der Tuer. Diese Lesung waechst stattdessen mit der Laenge der Anfrage (2,22 ms fuer
   * 4 000 Stuecke) und findet jeden Begriff, auch ausserhalb eines Pools — Treffer koennen nur
   * mehr werden.
   *
   * Die Folge ist die Reihenfolge der Anfrage, nicht die Rangfolge der Bedeutung; ein Begriff,
   * der zweimal vorkommt, zaehlt einmal.
   *
   * Was nicht gefragt wird: ein Name, der in der MITTE eines Anfrage-Wortes beginnt und in der
   * Mitte des naechsten endet. Der alte Vorrat fand ihn durch die rohe Teilzeichenkette; die
   * Stuecke hier halten die Wortgrenze. Diese Form kann kein Name annehmen, den die Flaeche je
   * setzt: Begriffe sind Woerterfolgen bis vier Woerter, kein Theil zweier Woerter
   * (`begiffe.ts:31-33`: `NAME`, `MAX_LAENGE`, `MAX_WOERTER`).
   */
  begriffeImWortlaut(wortlaut: string): { id: number; name: string }[] {
    const stuecke = wortstueckeAus(wortlaut);
    if (stuecke.length === 0) return [];
    const zeilen = this.db
      .prepare(`SELECT id, name FROM entities WHERE name IN (${stuecke.map(() => "?").join(",")})`)
      .all(...stuecke) as { id: number; name: string }[];
    const nachName = new Map(zeilen.map((z) => [z.name, Number(z.id)]));
    const funde: { id: number; name: string }[] = [];
    const schon = new Set<number>();
    for (const stueck of stuecke) {
      const id = nachName.get(stueck);
      if (id === undefined || schon.has(id)) continue;
      schon.add(id);
      funde.push({ id, name: stueck });
    }
    return funde;
  }

  /**
   * Rangfolge der Begriffe nach Bedeutung: die Zahl der Notizen, die ihn tragen,
   * **und** die Zahl der Kanten, die an ihm sitzen — zusammen, nicht hintereinander
   * (#56). Gekappt auf `pool` Zeilen: das Fenster will 500, und was hinter dem Pool
   * liegt, ist weniger bedeutsam als alles darin. Ein Begriff ausserhalb des Pools
   * kann also nie Samen sein; als Blatt eines Samens fehlt er hochstens dort, wo ein
   * Hub mit mehr Blaettern als Poolkappe steht — die Scheibe waere dann nicht die
   * Bedeutungsspitze, sondern der ganze Hub.
   */
  private graphRang(pool: number): { id: number; name: string }[] {
    return (
      this.db
        .prepare(
          `WITH grad AS (
             SELECT entity_id, SUM(n) AS n FROM (
               SELECT source_id AS entity_id, COUNT(*) AS n FROM relations GROUP BY source_id
               UNION ALL
               SELECT target_id AS entity_id, COUNT(*) AS n FROM relations GROUP BY target_id
             ) GROUP BY entity_id
           )
           SELECT e.id AS id, e.name AS name,
                  (COUNT(me.memory_id) + COALESCE(MAX(g.n), 0)) AS trag
           FROM entities e
           LEFT JOIN memory_entities me ON me.entity_id = e.id
           LEFT JOIN grad g ON g.entity_id = e.id
           GROUP BY e.id, e.name
           ORDER BY trag DESC, e.id ASC
           LIMIT ${pool}`
        )
        .all() as Record<string, unknown>[]
    ).map((r) => ({ id: Number(r.id), name: String(r.name) }));
  }

  /**
   * Die Begriffscheibe als **Nachbarschaft**, nicht als Rangliste (#83-2).
   *
   * Rueber die Rangliste: sie war die Bedeutungsspitze, aber keine zusammenhaengende
   * Menge. Gemessen an Damians laufender App — 500 Begriffe, 979 Kanten, 41 % der
   * Knoten Satzfetzen — und an meinem 14.702-Kunstbestand, wo jeder einzelne der 500
   * gelieferten Knoten an keiner Kante hielt, weil die Kantenscheibe jede Kante
   * verwirft, deren Ende nicht mitgeliefert wird. Eine Wolke, die nichts
   * zusammenhaelt, ist kein Wissensgraph.
   *
   * Darum: der erste Samen in Rangfolge wird ueber Kanten erweitert (Breadth-first,
   * die staerkere Kante zuerst), dann der naechste, bis die Kappe voll ist. Erst wenn
   * die Nachbarschaften nicht reichen, fuellt der Rest nach Rang auf — ein Bestand,
   * dessen Begriffe gar nicht verknuepft sind, darf keinen leeren Graphen zeigen.
   * Zwei Aufrufe auf demselben Bestand liefern dieselbe Folge.
   */
  private graphNachbarschaft(rang: { id: number; name: string }[], tiefe = GRAPH_TIEFE_MAX): EntityRecord[] {
    if (rang.length === 0) return [];
    const imFenster = new Set<number>();

    const nachbarn = new Map<number, { id: number; n: number }[]>();
    const paare = this.db
      .prepare(
        `SELECT source_id AS a, target_id AS b, COUNT(*) AS n
         FROM relations GROUP BY source_id, target_id
         ORDER BY n DESC, source_id ASC, target_id ASC
         LIMIT ${GRAPH_PAAR_POOL}`
      )
      .all() as { a: number; b: number; n: number }[];
    const bekannt = new Set(rang.map((e) => e.id));
    const fuege = (von: number, nb: number, n: number): void => {
      const liste = nachbarn.get(von) ?? [];
      liste.push({ id: nb, n });
      nachbarn.set(von, liste);
    };
    for (const p of paare) {
      if (!bekannt.has(p.a) || !bekannt.has(p.b)) continue;
      fuege(p.a, p.b, p.n);
      if (p.a !== p.b) fuege(p.b, p.a, p.n);
    }
    for (const list of nachbarn.values()) list.sort((x, y) => y.n - x.n || x.id - y.id);

    for (const samen of rang) {
      if (imFenster.size >= GRAPH_FENSTER_KNOTEN) break;
      if (imFenster.has(samen.id)) continue;
      imFenster.add(samen.id);
      let schnitt = [samen.id];
      // Die Stufe des Nutzers ist hier, nicht nur im Entity-Zweig: ohne diese Grenze
      // waechst ein Same ungebremst die Kette hinunter, bis die Kappe kommt, und die
      // Tiefenstufe der Flaeche bewegt nichts (gemessen 05:28 Uhr: vier Stufen, eine
      // Antwort auf die Byte — Mappe BEFUND-124-FENSTER-2910.md).
      for (let schritt = 0; schritt < Math.max(1, tiefe) && schnitt.length > 0 && imFenster.size < GRAPH_FENSTER_KNOTEN; schritt++) {
        const naechster: number[] = [];
        for (const id of schnitt) {
          for (const nb of nachbarn.get(id) ?? []) {
            if (imFenster.has(nb.id)) continue;
            imFenster.add(nb.id);
            naechster.push(nb.id);
            if (imFenster.size >= GRAPH_FENSTER_KNOTEN) break;
          }
          if (imFenster.size >= GRAPH_FENSTER_KNOTEN) break;
        }
        schnitt = naechster;
      }
    }

    for (const e of rang) {
      if (imFenster.size >= GRAPH_FENSTER_KNOTEN) break;
      imFenster.add(e.id);
    }

    return rang.filter((e) => imFenster.has(e.id)).map((e) => ({ id: e.id, name: e.name }));
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
    // #83 (2): die Rangliste ist kein Netz. Sie war es schon einmal nicht — A7-08
    // fand das `LIMIT 500` ohne ORDER BY, und A7-Vermessung sowie #56 setzten die
    // Rangformel: Traegerzahlen **und** Tragweite (Kantenenden), zusammen, nicht
    // hintereinander. Aber rangieren allein reicht nicht: an Damians laufender App
    // (21.066 Notizen) schickt das Fenster 500 Begriffe und 979 Kanten, und 41 % der
    // Knoten sind Fetzen; an meinem 14.702-Kunstbestand hielt **jeder** der 500
    // gelieferten Knoten an keiner Kante, weil die Kantenscheibe alles verwirft, was
    // ausserhalb der Begriffsliste liegt. Wer den Graphen oeffnete, sah eine Wolke,
    // die nichts zusammenhaelt.
    //
    // Darum wird jetzt von den bedeutsamsten Samen aus **ueber Kanten** gewaechselt
    // (graphNachbarschaft). Ein Knoten kommt nur ins Fenster, wenn eine Kante von
    // einem schon gewaehlten zu ihm fuehrt. Reichen die Nachbarschaften nicht bis an
    // die Kappe, fuellt der Rest nach Rang auf: ein Bestand, dessen Begriffe
    // ueberhaupt nicht verknuepft sind, darf keinen leeren Graphen zeigen
    // (guardiert von tests/core/graphkappe.test.ts).
    const entities = this.graphNachbarschaft(this.graphRang(GRAPH_RANG_POOL), Math.min(Math.max(depth, GRAPH_TIEFE_MIN), GRAPH_TIEFE_MAX));
    const knotenIds = entities.map((e) => e.id);
    // Dasselbe fuer die Kanten: was hinter einer 2 000er-Scheibe liegt, darf
    // nicht die Einfuegereihenfolge entscheiden. Paare mit mehr Belegen — drei
    // Aussagen ueber demselben Paar sind ein staerkeres Paar als eine — stehen
    // vorne. Innerhalb des Paares die aelteste zuerst, damit der Schnitt bei
    // gleichem Bestand derselbe bleibt.
    //
    // Und die Scheibe muss in sich geschlossen sein: eine Kante, deren Ende der
    // Begriffsschnitt nicht mitliefert, warf die Tuer bisher weg (`system.ts:95` filtert
    // gegen dieselbe Menge). Darum ist ihr Zaehler `kantenVerworfen` seitdem **per
    // Konstruktion 0** — gemessen 07:12 Uhr an einem 2 120-Kanten-Bestand: "dropped 0",
    // waehrend 1 771 Kanten nie ankommen. Was hier steht, ist die Heilung von 16.10.:
    // 1.593 von 2 000 Kanten auf einem echten Bestand und 1.711 von 2 000 im Test-Fixture
    // waren die Zahlen VOR dieser Scheibe; die Flaeche haette ihre Bilanz gegen eine Zahl
    // gezogen, die sie nie zeichnet. Was heute fehlt, zaehlt `ausriss.kantenAusserhalb`.
    const kantenPlaceholders = knotenIds.map(() => "?").join(",");
    const relations = knotenIds.length === 0 ? [] : (
      this.db
        .prepare(
          `WITH traeger AS (SELECT entity_id, COUNT(*) AS n FROM memory_entities GROUP BY entity_id)
           SELECT r.id, r.source_id, r.target_id, r.relation, r.valid_from, r.valid_to, r.memory_id
           FROM relations r
           LEFT JOIN (
             SELECT source_id, target_id, COUNT(*) AS paare FROM relations GROUP BY source_id, target_id
           ) p ON p.source_id = r.source_id AND p.target_id = r.target_id
           LEFT JOIN traeger ts ON ts.entity_id = r.source_id
           LEFT JOIN traeger tt ON tt.entity_id = r.target_id
           WHERE r.source_id IN (${kantenPlaceholders}) AND r.target_id IN (${kantenPlaceholders})
           ORDER BY p.paare DESC, (COALESCE(ts.n, 0) + COALESCE(tt.n, 0)) DESC, r.id ASC
           LIMIT 2000`
        )
        .all(...knotenIds, ...knotenIds) as Record<string, unknown>[]
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

  /**
   * Was die Wissensbasis WIRKLICH enthält — im Gegensatz zu dem, was `getGraph`
   * höchstens liefert. Die Kappen selbst (500 Begriffe, 2000 Kanten) sind
   * unverändert: wer mehr auf einmal schickt, bezahlt mit einer langsameren
   * Fläche, nicht mit einer besseren. Was fehlt, war die Zahl dahinter, damit
   * eine Fläche sagen kann „ich zeige einen Ausschnitt" statt „so viel ist da".
   */
  graphBestand(): { knoten: number; kanten: number } {
    const knoten = this.db.prepare("SELECT COUNT(*) AS n FROM entities").get() as { n: number };
    const kanten = this.db.prepare("SELECT COUNT(*) AS n FROM relations").get() as { n: number };
    return { knoten: Number(knoten.n), kanten: Number(kanten.n) };
  }

  /**
   * Wie viele NOTIZEN an wenigstens einem Begriff haengen — die Deckung des
   * Netzes, nicht seine Groesse. Eine Tuer, die 2.756 Begriffe und 2.726 Kanten
   * nennt, aber nicht sagt, wie viele ihrer 21.066 Notizen davon beruehrt werden,
   * laesst den Leser raten, ob das Netz knapp oder weit ist.
   *
   * Gezaehlt wird ueber `memory_entities` (der Traeger, nicht die Behauptung):
   * eine Notiz mit vier Begriffen ist eine gedeckte Notiz.
   */
  notizenMitBegriff(): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(DISTINCT me.memory_id) AS n
           FROM memory_entities me
           JOIN memories m ON m.id = me.memory_id
          WHERE m.deleted_at IS NULL`
      )
      .get() as { n: number };
    return Number(row.n);
  }

  /**
   * Punkt 124b — das Feld der Haufen-Rechnung **ohne** die Kappen des Sichtfensters.
   *
   * Warum eine eigne Auszugsmenge und nicht `getGraph`: `getGraph` liefert 500 Begriffe und
   * 2 000 Kanten (`GRAPH_FENSTER_KNOTEN`, Zeile 42; Schleife :1366-1393). Ein Haufen, der nur
   * in diesem Fenster gerechnet wird, sagt nichts über die Größe der Haufen — die Antwort wäre
   * eine Verteilung über 18 % der Begriffe, als wäre sie eine über alle. Hier steht der ganze
   * Bestand: jede aktive Notiz, jeder Begriff, jede Erwähnung, jede Behauptung.
   *
   * Der Auszug ist reine Zahlenschieberei nach oben: `src/lib/haufenordnung.ts` rechnet die
   * Verteilung, die Tür nennt sie. Diese Methode erfindet keine Rangfolge und keinen Schnitt.
   */
  haufenFeld(): {
    notizen: string[];
    begriffe: string[];
    erwaehnungen: [string, string][];
    behauptungen: { source: string; target: string }[];
  } {
    const notizen = (
      this.db.prepare("SELECT id FROM memories WHERE deleted_at IS NULL ORDER BY id").all() as { id: string }[]
    ).map((r) => String(r.id));
    const begriffe = (this.db.prepare("SELECT name FROM entities ORDER BY name").all() as { name: string }[]).map((r) =>
      String(r.name),
    );
    const erwaehnungen = (
      this.db
        .prepare(
          `SELECT me.memory_id AS notiz, e.name AS begriff
             FROM memory_entities me
             JOIN memories m ON m.id = me.memory_id
             JOIN entities e ON e.id = me.entity_id
            WHERE m.deleted_at IS NULL
            ORDER BY me.memory_id, e.name`
        )
        .all() as { notiz: string; begriff: string }[]
    ).map((r) => [String(r.notiz), String(r.begriff)] as [string, string]);
    const begriffSet = new Set(begriffe);
    const behauptungen = (
      this.db
        .prepare(
          `SELECT qs.name AS quelle, zs.name AS ziel
             FROM relations r
             JOIN entities qs ON qs.id = r.source_id
             JOIN entities zs ON zs.id = r.target_id
            ORDER BY r.id`
        )
        .all() as { quelle: string; ziel: string }[]
    )
      // Ein Ende ohne Begriff wäre eine Kante ins Leere: die Maske unten würde sie verwerfen,
      // und die Antwort hätte eine Kantenzahl, die kein Knoten trägt.
      .filter((r) => begriffSet.has(String(r.quelle)) && begriffSet.has(String(r.ziel)))
      .map((r) => ({ source: String(r.quelle), target: String(r.ziel) }));
    return { notizen, begriffe, erwaehnungen, behauptungen };
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

  /**
   * Die Behauptungen, die eine Hand an dieser Notiz gesetzt hat — nicht die Mitnennungen,
   * die aus ihrem Text wachsen. Die Oberflaeche braucht diesen Leser: ein Feld, das
   * schreibt, ohne zu zeigen, was schon steht, laesst die Person ihre eigne Aussage
   * zweimal tippen oder gar nicht mehr loeschen.
   */
  behauptungenVonNotiz(memoryId: string): BehauptungEingabe[] {
    const reihen = this.db
      .prepare(
        `SELECT q.name AS quelle, z.name AS ziel, r.relation AS wort
           FROM relations r
           JOIN entities q ON q.id = r.source_id
           JOIN entities z ON z.id = r.target_id
          WHERE r.memory_id = ?
          ORDER BY r.id`
      )
      .all(memoryId) as { quelle: string; ziel: string; wort: string }[];
    return reihen
      .filter((x) => typeof x.wort === "string" && x.wort.length > 0 && !SYSTEM_WOERTER.has(x.wort))
      .map((x) => ({ quelle: x.quelle, ziel: x.ziel, wort: x.wort }));
  }

  // ---------- FTS ----------

  ftsSearch(query: string, limit = 50): { id: string; bm25: number }[] {
    // FTS5-Syntax des Users entschärfen: Anführungszeichen pro Term.
    // contentTerms wirft zusätzlich Füllwörter weg — ohne das matchte eine Notiz
    // allein deshalb, weil sie "with" oder "die" enthält, bekam dadurch einen
    // BM25-Rang und verdrängte über die RRF-Fusion den eigentlichen Treffer.
    const terms = contentTerms(query);
    if (terms.length === 0) return [];
    // Zwei-phasig: AND-Schnitt zuerst (bei Mehr-Wort-Queries winzig — FTS5
    // schneidet die kleinste Posting-Liste), OR nur wenn AND dünner als das
    // Limit bleibt. Bei 1 Mio Erinnerungen kostet der reine OR-Scan über die
    // bm25-Rangbildung der Term-Union sonst Hunderte ms je Abfrage. Die
    // Merge-Rangbildung bleibt sauber: bm25-Werte sind korpusweit vergleichbar
    // (negativ, relevanter = kleiner), also wird vereint und nach Wert sortiert.
    const frage = (joiner: string) =>
      this.db
        .prepare(
          `SELECT m.id, bm25(memories_fts) AS rank
           FROM memories_fts JOIN memories m ON m.rid = memories_fts.rowid
           WHERE memories_fts MATCH ? AND m.deleted_at IS NULL
           ORDER BY rank LIMIT ?`
        )
        .all(terms.map((t) => `"${t}"`).join(joiner), limit) as Record<string, unknown>[];
    try {
      let rows = frage(" AND ");
      if (rows.length < limit && terms.length > 1) {
        const gesehen = new Set(rows.map((r) => String(r.id)));
        rows = [...rows, ...frage(" OR ").filter((r) => !gesehen.has(String(r.id)))];
        rows.sort((a, b) => Number(a.rank) - Number(b.rank));
        rows = rows.slice(0, limit);
      }
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
/** Sperre: nur ein K3PTA-Prozess wandelt um, die anderen warten. */
const SPERRE = ".encrypting-lock";
const VERWAIST_MS = 10 * 60_000;
const ANDERES_PROGRAMM =
  "The knowledge base is open in another program (an AI agent over MCP, an older KEPTA?) — it stays unencrypted until K3PTA has it to itself. Close the other program and restart K3PTA.";
const WIRD_UMGEWANDELT = "The knowledge base is being encrypted by another K3PTA process — try again in a moment.";

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
 * SQLCipher-Werkzeug die Datei, K3PTA sperrt niemanden ein.
 */
function schluesselPragmas(db: Database.Database, schluessel: Uint8Array, pragma: "key" | "rekey"): void {
  db.pragma("cipher = 'sqlcipher'");
  db.pragma("legacy = 4");
  db.pragma(`${pragma} = "x'${Buffer.from(schluessel).toString("hex")}'"`);
}

function setzeSchluessel(db: Database.Database, schluessel: Uint8Array, herkunft?: string): void {
  schluesselPragmas(db, schluessel, "key");
  try {
    db.prepare("SELECT count(*) FROM sqlite_master").get();
  } catch (e) {
    db.close();
    if (sqliteCode(e) === "SQLITE_NOTADB") {
      // Blattgröße prüfen, bevor ein Satz über die Datei fällt: eine Wissensbasis ist
      // immer ein Vielfaches ihrer Seitenlänge (SQLCipher: 512..65536, Potenzen von 2).
      // Die Datei heißt hier `db.name`, nicht der Pfad des Aufrufers — die Verbindung
      // ist schon geschlossen, die Bytes auf der Platte sind unverändert.
      let groesse = -1;
      try {
        groesse = fs.statSync(db.name).size;
      } catch {
        groesse = -1;
      }
      if (groesse >= 0 && groesse % 512 !== 0) {
        throw new Error(
          `The file at ${db.name} is not a SQLite database at all — ${groesse} bytes is not a multiple of any page size, ` +
            `so it is either not a database or the damaged remnant of one. No key can open it, and none was tried again. ` +
            `Nothing was changed. If a restore or another program wrote here, point KEPTA_DATA_DIR at the real knowledge base.`,
        );
      }
      throw new Error(
        `The knowledge base ${db.name} could not be opened with the 256-bit key${herkunft ? ` from ${herkunft}` : " it was given"} — ` +
          `either that is not the key this file was encrypted with, or the file itself is damaged. ` +
          `SQLite reports only "file is not a database", so K3PTA does not say which. Nothing was changed. ` +
          `SECURITY.md, "Keep a copy of the key", lists the command that reads your key back on every operating system; ` +
          `if this file was written with a key you hold yourself, set KEPTA_DB_KEY to it and start again.`,
      );
    }
    throw e;
  }
}

/** Ohne Schluessel: eine verschluesselte Datei darf nicht still als leeres Gehirn weiterlaufen. */
function pruefeLesbar(db: Database.Database, hinweis: string | undefined, herkunft?: string): void {
  try {
    db.prepare("SELECT count(*) FROM sqlite_master").get();
  } catch (e) {
    db.close();
    if (sqliteCode(e) === "SQLITE_NOTADB") {
      // Fall (c) aus A1-08: die Schluesselquelle war nicht zu erreichen. Der Grund
      // steht schon in `hinweis` — ihn schaerft die Schluesselschicht mit Quelle,
      // Wartezeit und Rueckhol-Befehl. Abgeschnitten werden darf er nicht.
      throw new Error(
        `The knowledge base is encrypted, but its key is not available${
          hinweis ? `: ${hinweis}` : herkunft ? ` from ${herkunft}` : "."
        } Nothing was changed. The file was not opened and no empty knowledge base was started over it. ` +
          `SECURITY.md, "Keep a copy of the key", lists the command that reads your key back; ` +
          `a key you hold yourself goes in KEPTA_DB_KEY (openssl rand -hex 32).`,
      );
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
 * Wartet, solange ein anderer K3PTA-Prozess die Datei gerade umwandelt. Eine
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
    if (sperre === null) continue; // ein anderer K3PTA-Prozess war schneller — auf ihn warten
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
 * Wandelt eine Klartext-Datenbank in eine verschluesselte um — nur, wenn K3PTA
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
