import express from "express";
import compression from "compression";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import os from "os";
import dns from "dns";
import { spawn } from "child_process";
import { KeptaStore } from "./src/core/store";
import { defaultExtensions } from "./src/core/extensions";
import { schluesselbundKeyProvider } from "./src/core/schluessel";
import { planeImportReparatur, mitFrist } from "./src/core/reparatur";
import { migrateFromLegacyJson } from "./src/core/migrate";
import { EmbeddingQueue } from "./src/core/embeddings";
import { searchMemories as engineSearch, indexMemory, gateDecision, writeGateEnabled, MAX_SEARCH_LIMIT } from "./src/core/engine";
import { handleRpc, TOOLS as MCP_TOOLS, saveWithIndex } from "./src/core/mcp";
import { importObsidianVault, memoryToMarkdown } from "./src/core/obsidian";
import { exportBundle, importBundle, PraxissyncJournal, type SyncBundle } from "./src/core/praxissync";
import { APP_VERSION } from "./src/core/version";
import { klassifiziere, istUnbrauchbar, htmlZuText, entferneNaviZeilen } from "./src/core/klassifikation";
import type { MemoryRecord as CoreMemory } from "./src/core/types";


// API-Form der Memories (kompatibel zum v1-Frontend: userId bleibt gesetzt)
interface MemoryRecord {
  id: string;
  userId: string;
  title: string;
  content: string;
  tags: string[];
  type?: string;
  scope?: string;
  confidence?: number;
  validFrom?: number | null;
  validTo?: number | null;
  supersededBy?: string | null;
  deletedAt?: number | null;
  createdAt: number;
  updatedAt: number;
}

// ---------- Lokaler Speicher: SQLite (src/core), vorher JSON in ~/.kepta ----------

const DATA_DIR = process.env.KEPTA_DATA_DIR || path.join(os.homedir(), ".kepta");

function trimSlash(url: string) {
  return url.replace(/\/+$/, "");
}

// ---------- Security Hardening Helpers ----------
// Basis aller Speicherpfade: NUL-/Steuerzeichen bereinigen + Länge begrenzen.
// KEIN HTML-Stripping hier — das Frontend rendert Inhalte über react-markdown
// (kein dangerouslySetInnerHTML), heuristisches Strippen von "javascript:" oder
// "on*=" zerstört legitime Code-Beispiele in Memories.
function sanitizeText(input: unknown, maxLen = 50000): string {
  if (typeof input !== "string") return "";
  let s = input.replace(/\0/g, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s.trim();
}
// Zusätzliche HTML-/Event-Handler-Entschärfung NUR für Roh-HTML-Ingeste
// (URL-Clipper: fremde HTML-Seiten werden zu Text konvertiert).
function sanitizeHtmlText(input: unknown, maxLen = 50000): string {
  let s = sanitizeText(input, maxLen);
  s = s.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  s = s.replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  s = s.replace(/<[^>]*\bon\w+[^>]*>/gi, (m) => m.replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, ""));
  s = s.replace(/javascript:\s*/gi, "");
  return s;
}
function sanitizeTitle(input: unknown): string {
  return sanitizeText(input, 200).replace(/[\r\n]+/g, " ").trim();
}
function sanitizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const t of input) {
    if (typeof t !== "string") continue;
    let tag = t.toLowerCase().trim().replace(/[^a-z0-9\-_äöüß]/g, "").slice(0, 30);
    if (tag && tag.length >= 2 && out.length < 12) out.push(tag);
  }
  return [...new Set(out)];
}
function isSafeFilename(name: string): boolean {
  if (!name || name.length > 180) return false;
  if (name.includes("..") || name.includes("/") || name.includes("\\") || name.startsWith(".")) return false;
  if (/[<>:"|?*\x00-\x1F]/.test(name)) return false;
  return /^[\w.\- äöüÄÖÜß()\[\]]+$/.test(name);
}

// ---------- Suche ----------

// (Echte Suche läuft über die Retrieval-Engine in src/core/engine.ts —
//  ein Code-Pfad für UI, HTTP-API und MCP.)

// ---------- MCP Tools: Definitionen aus src/core/mcp (8 Tools, mit outputSchema) ----------

// ---------- Server ----------

/**
 * Die Einstellungen lagen bis 2.10 als settings.json im Klartext neben der
 * Datenbank — mit dem KI-Zugangsschluessel darin. Beim ersten Start wandern sie
 * in die Datenbank (mit ihr verschluesselt). Die Datei wird erst genullt und
 * entfernt, wenn jeder Wert so wieder herauskommt, wie er hineinging; was schon
 * in der Datenbank steht, gewinnt. Eine unlesbare Datei bleibt unberuehrt liegen.
 */
export function uebernimmSettingsDatei(store: KeptaStore, datei: string): number {
  let roh: string;
  let alt: unknown;
  try {
    roh = fs.readFileSync(datei, "utf-8");
    alt = JSON.parse(roh);
  } catch {
    return 0;
  }
  if (!alt || typeof alt !== "object" || Array.isArray(alt)) return 0;
  const vorhanden = store.einstellungen();
  const neu: Record<string, string> = {};
  for (const [k, v] of Object.entries(alt as Record<string, unknown>)) {
    if (typeof v === "string" && k.length > 0 && k.length <= 120 && !(k in vorhanden)) neu[k] = v.slice(0, 20000);
  }
  if (Object.keys(neu).length) store.setzeEinstellungen(neu);
  const danach = store.einstellungen();
  if (Object.entries(neu).some(([k, v]) => danach[k] !== v)) return 0;
  try {
    const laenge = Buffer.byteLength(roh);
    const fd = fs.openSync(datei, "r+");
    try {
      fs.writeSync(fd, Buffer.alloc(laenge), 0, laenge, 0);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.rmSync(datei, { force: true });
  } catch {
    // Nicht entfernbar: die Werte stehen schon in der Datenbank, beim naechsten Start neuer Versuch.
  }
  return Object.keys(neu).length;
}

export function createApp(store: KeptaStore) {
  const app = express();

  const toApi = (r: CoreMemory): MemoryRecord => ({
    id: r.id,
    userId: "local",
    title: r.title,
    content: r.content,
    tags: r.tags,
    type: r.type,
    scope: r.scope,
    confidence: r.confidence,
    validFrom: r.validFrom,
    validTo: r.validTo,
    supersededBy: r.supersededBy,
    deletedAt: r.deletedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  });
  const allApiMemories = (): MemoryRecord[] => listAllMemories().map(toApi);
  // Vollständige Liste via Paginierung — listMemories deckelt pro Seite, damit Export,
  // Trash-Listung und Replace-Import bei großen Gehirnen nichts still abschneiden.
  function listAllMemories(opts: { trash?: boolean } = {}): CoreMemory[] {
    const out: CoreMemory[] = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const page = store.listMemories({ limit: pageSize, offset, ...opts });
      out.push(...page);
      if (page.length < pageSize) break;
    }
    return out;
  }

  const DB_WATCH_MS = 4000;
  // --- DB-Change-Watcher: fremde Prozesse (MCP stdio, Claude Desktop, ZCode) ---
  // schreiben direkt in die SQLite-DB ohne den Activity-Hub zu kennen. Die App
  // pollt deshalb count+max(updated_at) und facht den SSE-Stream selbst an.
  let lastDbCount: number | null = null;
  let lastDbUpdatedAt: number | null = null;
  /**
   * Wann hat die App zuletzt SELBST etwas gemeldet?
   *
   * Der Waechter kann nicht sehen, WER geschrieben hat — er sieht nur, dass sich
   * die Zaehlung geaendert hat. Ohne diese Notiz meldete er auch eigene Importe
   * als "von aussen": nach einem Rechner-Scan stand "An agent saved a node" auf
   * dem Bildschirm, obwohl der Nutzer den Import gerade selbst ausgeloest hatte.
   */
  let letzteEigeneMeldung = 0;
  const dbWatcher = setInterval(() => {
    try {
      const row = store.db.prepare("SELECT COUNT(*) c, COALESCE(MAX(updated_at),0) m FROM memories").get() as { c: number; m: number };
      // Separater Zustand statt parseInt auf einem kombinierten Fingerprint-String
      if (lastDbCount !== null && (row.c !== lastDbCount || row.m !== lastDbUpdatedAt)) {
        // Nur melden, wenn die Aenderung nicht von der App selbst kam. Ein
        // fremder Prozess (MCP ueber stdio, Claude Desktop) meldet sich hier
        // nicht — genau der soll gefunden werden.
        if (Date.now() - letzteEigeneMeldung > DB_WATCH_MS + 1000) {
          publishActivity({ type: row.c > lastDbCount ? "save" : "update", source: "agent", title: "The brain was updated from outside" });
        }
      }
      lastDbCount = row.c;
      lastDbUpdatedAt = row.m;
    } catch { /* DB kurz gesperrt — nächster Tick */ }
  }, DB_WATCH_MS);
  dbWatcher.unref();

  interface ActivityEvent {
    type: "save" | "update" | "delete" | "search" | "consolidate";
    source: "app" | "agent";
    title?: string;
    ts: number;
  }
  const activityClients = new Set<express.Response>();
  const lastSearchPublish = { ts: 0 };
  function publishActivity(evt: Omit<ActivityEvent, "ts">, opts: { throttleSearchMs?: number } = {}) {
    if (evt.type === "search" && opts.throttleSearchMs) {
      if (Date.now() - lastSearchPublish.ts < opts.throttleSearchMs) return;
      lastSearchPublish.ts = Date.now();
    }
    if (evt.source !== "agent") letzteEigeneMeldung = Date.now();
    const payload = `data: ${JSON.stringify({ ...evt, ts: Date.now() })}\n\n`;
    for (const client of activityClients) {
      try { client.write(payload); } catch { activityClients.delete(client); }
    }
  }
  app.get("/api/activity", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`data: ${JSON.stringify({ type: "save", source: "app", ts: Date.now(), hello: true })}\n\n`);
    activityClients.add(res);
    const heartbeat = setInterval(() => {
      try { res.write(": hb\n\n"); } catch { /* ignore */ }
    }, 15_000);
    req.on("close", () => {
      clearInterval(heartbeat);
      activityClients.delete(res);
    });
  });


  // --- Security Headers (hardened) ---
  app.use(helmet({
    contentSecurityPolicy: false, // API only, no inline scripts needed
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }));
  app.disable("x-powered-by");
  app.use(compression());

  // Rate Limiting — schützt vor Brute-Force / DoS
  const globalLimiter = rateLimit({ windowMs: 60_000, max: 180, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests — please wait a moment." } });
  const chatLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: "Chat Rate-Limit: max 20/min" } });
  const clipLimiter = rateLimit({ windowMs: 60_000, max: 12, standardHeaders: true, legacyHeaders: false, message: { error: "Clip Rate-Limit: max 12/min" } });
  // Wie viele Notizen ein Sammelaufruf hoechstens anfassen darf. Gross genug
  // fuer jede Aufraeumaktion, klein genug, dass ein verirrter Aufruf nicht die
  // ganze Wissensbasis in einem Rutsch bewegt.
  const MAX_BULK_IDS = 5_000;
  const writeLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false, message: { error: "Schreib-Limit: max 60/min" } });
  app.use(globalLimiter);

  // CORS — strikt lokal, kein * für Browser-Origins (MCP/curl ohne Origin bleibt erlaubt)
  const ALLOWED_ORIGINS = new Set([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "app://.",
    "file://",
  ]);
  app.use((req, res, next) => {
    const origin = req.headers.origin as string | undefined;
    if (!origin) {
      // Non-browser (curl, MCP stdio, Electron) — kein Origin, erlaube
      res.header("Access-Control-Allow-Origin", "*");
    } else if (ALLOWED_ORIGINS.has(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
    } else {
      // Unbekannter Origin — blocken für Browser, aber nicht für API-Abuse über curl (kein Origin-Bypass)
      // Für maximale Sicherheit: kein CORS Header → Browser blockt
    }
    res.header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");
    res.header("Access-Control-Max-Age", "86400");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  const activeCount = () => store.countMemories().active;

  // --- Import-Routen VOR dem globalen Body-Limit registrieren (P1: Reihenfolge) ---
  // express.json überspringt bereits geparste Bodies — daher greift das globale
  // 1mb-Limit unten auf diesen Requests nicht mehr, und große Backups (bis 2mb)
  // bzw. Markdown-Batches (bis 10mb) werden nicht schon global mit 413 abgewiesen.
  /**
   * Obergrenze aktiver Knoten. Schuetzt vor davonlaufenden Agenten-Schreibvorgaengen.
   * Ueber KEPTA_MAX_ACTIVE einstellbar; bei jedem Aufruf gelesen, damit ein Betreiber
   * sie ohne Neustart aendern kann.
   */
  function maxActiveMemories(): number {
    const v = Number(process.env.KEPTA_MAX_ACTIVE);
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 5000;
  }

  /**
   * Ein Backup wird nie abgewiesen — sonst verliert jemand beim Wiederherstellen
   * Daten. Wer aber darueber liegt, soll es hier erfahren und nicht erst, wenn das
   * Anlegen der naechsten einzelnen Notiz mit 429 scheitert.
   */
  function grenzHinweis(): { warning?: string } {
    const max = maxActiveMemories();
    const ist = activeCount();
    return ist > max
      ? { warning: `${ist} active nodes exceed the limit of ${max}. Existing notes stay searchable, but creating new single notes is refused until you delete some.` }
      : {};
  }

  function handleMemoriesImport(req: express.Request, res: express.Response) {
    const { memories: incoming, mode } = req.body as { memories?: Partial<MemoryRecord>[]; mode?: "merge" | "replace" };
    if (!Array.isArray(incoming)) {
      return res.status(400).json({ error: "Not a valid backup file (a memories array was expected)" });
    }
    if (incoming.length > 5000) return res.status(413).json({ error: "Too many nodes (max 5000)" });

    const cleaned = incoming
      .filter(m => m && typeof m === "object")
      .slice(0, 5000)
      .map((m, i) => ({
        id: (typeof m.id === "string" && /^[\w\-.:]+$/.test(m.id)) ? m.id.slice(0,120) : `import-${Date.now()}-${i}`,
        title: sanitizeTitle(m.title) || "Untitled",
        content: sanitizeText(m.content, 50000) || "",
        tags: sanitizeTags(m.tags),
        createdAt: typeof m.createdAt === "number" && m.createdAt > 0 ? m.createdAt : Date.now(),
        updatedAt: typeof m.updatedAt === "number" && m.updatedAt > 0 ? m.updatedAt : Date.now(),
      })).filter(m=> m.content.length>0);

    if (mode === "replace") {
      // Endgültig leeren (Papierkorb inklusive), dann Import — vollständig listen, nicht gekappt
      for (const m of listAllMemories({ trash: true })) store.purgeMemory(m.id);
      for (const m of listAllMemories()) store.purgeMemory(m.id);
      // Doppelte IDs innerhalb der Backup-Datei: letzte Variante gewinnt (createMemory wirft sonst)
      const byId = new Map<string, (typeof cleaned)[number]>();
      for (const m of cleaned) byId.set(m.id, m);
      try {
        for (const m of byId.values()) {
          const created = store.createMemory(m);
          indexMemory(store, created.id);
        }
      } catch {
        return res.status(409).json({ error: "Import failed: conflicting node ids" });
      }
      return res.json({ imported: byId.size, total: activeCount(), ...grenzHinweis() });
    }

    let imported = 0;
    for (const m of cleaned) {
      const current = store.getMemory(m.id);
      if (!current || m.updatedAt > current.updatedAt) {
        // m.createdAt/updatedAt bleiben erhalten (upsertMemory reicht sie durch)
        store.upsertMemory(m);
        indexMemory(store, m.id);
        imported++;
      }
    }
    res.json({ imported, total: activeCount(), ...grenzHinweis() });
  }
  app.post("/api/memories/import", writeLimiter, express.json({ limit: "2mb" }), handleMemoriesImport);

  function handleMarkdownImport(req: express.Request, res: express.Response) {
    const { files, scope } = req.body as { files?: { name?: string; content?: string }[]; scope?: string };
    if (!Array.isArray(files) || files.length === 0 || files.length > 5000) {
      return res.status(400).json({ error: "a files array (1..5000) is required" });
    }
    const mdFiles = files
      .filter((f) => f && typeof f.content === "string")
      .map((f) => ({ name: typeof f.name === "string" ? f.name.slice(0, 200) : "notiz.md", content: f.content as string }));
    const summary = importObsidianVault(store, mdFiles, { scope: typeof scope === "string" && scope ? scope : undefined });
    res.json(summary);
  }
  app.post("/api/import/markdown", writeLimiter, express.json({ limit: "10mb" }), handleMarkdownImport);

  // Globales Payload-Limit für alle übrigen Routen (1mb — 50mb war viel zu groß, DoS)
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: false }));

  // --- Health ---
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      status: "ok",
      name: "kepta",
      version: APP_VERSION,
      uptime: process.uptime(),
      dbPath: store.dbPath,
      count: activeCount(),
      embeddings: store.embeddingStats(),
      encryption: store.verschluesselung,
      mcp: { protocol: "2026-07-28", tools: MCP_TOOLS.length, http: "/mcp" },
      time: new Date().toISOString(),
    });
  });

  // --- Adaptives Profil (je Nutzer individuell) ---
  const PROFILE_FILE = path.join(DATA_DIR, "profile.json");
  app.get("/api/settings", (_req, res) => {
    try {
      res.json(store.einstellungen());
    } catch {
      res.json({});
    }
  });

  app.put("/api/settings", writeLimiter, (req, res) => {
    try {
      const body = req.body as Record<string, unknown> | undefined;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return res.status(400).json({ error: "Settings must be an object" });
      }
      const bestand = store.einstellungen();
      const aenderungen: Record<string, string | null> = {};
      // Nur Zeichenketten: der Browserspeicher kennt nichts anderes, und so
      // kann von hier auch nichts Unerwartetes in die Oberflaeche zurueckfliessen.
      for (const [k, v] of Object.entries(body)) {
        if (typeof k !== "string" || k.length === 0 || k.length > 120) continue;
        if (v === null) { aenderungen[k] = null; delete bestand[k]; continue; }
        if (typeof v !== "string") continue;
        aenderungen[k] = bestand[k] = v.slice(0, 20000);
      }
      if (JSON.stringify(bestand, null, 2).length > MAX_SETTINGS_BYTES) return res.status(413).json({ error: "Settings too large" });
      res.json({ ok: true, keys: store.setzeEinstellungen(aenderungen) });
    } catch {
      res.status(500).json({ error: "The settings could not be saved" });
    }
  });

  // --- Inbox Auto-Import — KEPTA liest immer mit (File-Watcher) ---
  const INBOX_DIR = path.join(DATA_DIR, "inbox");
  try { fs.mkdirSync(INBOX_DIR, { recursive: true }); } catch {}
  let inboxWatcher: fs.FSWatcher | null = null;
  let inboxLastScan = 0;
  const inboxQueue = new Set<string>();

  async function autoImportFile(filePath: string) {
    try {
      // Hardened: nur Dateien innerhalb INBOX_DIR, kein Path-Traversal
      const resolved = path.resolve(filePath);
      const inboxResolved = path.resolve(INBOX_DIR);
      if (!resolved.startsWith(inboxResolved + path.sep) && resolved !== inboxResolved) return;
      const baseName = path.basename(resolved);
      if (!isSafeFilename(baseName)) return;
      const stat = fs.statSync(resolved);
      if (!stat.isFile() || stat.size > 20_000_000) return;
      const ext = path.extname(resolved).toLowerCase();
      if (!['.txt','.md','.json','.pdf','.csv'].includes(ext) && stat.size>500000) return;
      let content = '';
      if (ext === '.pdf') {
        const raw = fs.readFileSync(resolved);
        // einfache Extraktion wie Dashboard: suche (text) und hex
        const str = raw.toString('utf-8');
        const paren: string[] = [];
        const re = /\(([^()]{2,}?)\)/g; let m: RegExpExecArray | null;
        while ((m = re.exec(str)) !== null) {
          let s = m[1].replace(/\\n/g,'\n').replace(/\\\(/g,'(').replace(/\\\)/g,')').replace(/\\\\/g,'\\');
          if (s.length>2 && /[\p{L}\p{N}]/u.test(s)) paren.push(s);
        }
        content = paren.join('\n').trim().slice(0,50000) || str.replace(/[^\x20-\x7EÄÖÜäöüß\s]/g,' ').slice(0,50000);
      } else {
        content = fs.readFileSync(resolved, 'utf-8').slice(0,50000);
        if (ext==='.json') {
          try { const j=JSON.parse(content); content = Array.isArray(j) ? JSON.stringify(j,null,2).slice(0,50000) : content; } catch {}
        }
      }
      if (!content.trim()) return;
      const base = path.basename(resolved, path.extname(resolved));
      // Chunking 2000
      const chunks: string[] = [];
      let start=0; while(start<content.length){ let end=Math.min(start+2000, content.length); if(end<content.length){ const slice=content.slice(start,end); const br=Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('. ')); if(br>1100) end=start+br+1; } chunks.push(content.slice(start,end).trim()); start=end; }
      const existing = allApiMemories();
      for (let i=0;i<chunks.length;i++){
        const title = chunks.length===1 ? base : `${base} — Teil ${i+1}/${chunks.length}`;
        const chunkContent = sanitizeText(chunks[i], 50000)+`\n\n— Source: inbox ${path.basename(resolved)} ${new Date().toLocaleString('en-GB')}`;
        const isDup = existing.some(m=> m.title===title && Math.abs(m.content.length-chunkContent.length)<20);
        if (isDup) continue;
        const created = store.createMemory({ title: sanitizeTitle(title) || base.slice(0,80), content: chunkContent, tags:['auto-import','inbox', ext.replace('.','')||'file'] });
        indexMemory(store, created.id);
        existing.unshift(toApi(created));
      }
      // Nach dem Import wandert die Datei ins Archiv. Der Ordner hiess frueher
      // "archiv"; wo er existiert, bleibt er in Benutzung, damit bereits
      // archivierte Dateien nicht ploetzlich woanders liegen.
      try {
        const doneDir = archiveDir();
        fs.mkdirSync(doneDir, { recursive: true });
        fs.renameSync(resolved, path.join(doneDir, path.basename(resolved)));
      } catch {}
    } catch {}
  }

  function startInboxWatcher(){
    if (inboxWatcher) return;
    try {
      inboxWatcher = fs.watch(INBOX_DIR, { persistent: false }, (_evt, filename)=>{
        if (!filename) return;
        if (!isSafeFilename(filename)) return;
        const full = path.join(INBOX_DIR, filename);
        const resolved = path.resolve(full);
        if (!resolved.startsWith(path.resolve(INBOX_DIR) + path.sep)) return;
        if (inboxQueue.has(resolved)) return;
        inboxQueue.add(resolved);
        setTimeout(()=>{ inboxQueue.delete(resolved); if (fs.existsSync(resolved)) autoImportFile(resolved); }, 800);
      });
    } catch {}
  }
  startInboxWatcher();

  /** Archivordner der Inbox. Neu: "archive". Wo noch "archiv" liegt, bleibt es dabei. */
  function archiveDir(): string {
    const alt = path.join(INBOX_DIR, 'archiv');
    try { if (fs.existsSync(alt)) return alt; } catch { /* nicht lesbar — dann eben der neue */ }
    return path.join(INBOX_DIR, 'archive');
  }

  app.get('/api/inbox/status', (_req,res)=>{
    let files: string[] = [];
    try { files = fs.readdirSync(INBOX_DIR).filter(f=> !f.startsWith('.') && f!=='archiv' && f!=='archive'); } catch {}
    let archived = 0;
    try { archived = fs.readdirSync(archiveDir()).length; } catch {}
    res.json({ inboxDir: INBOX_DIR, files, archiveCount: archived, archivCount: archived, watching: !!inboxWatcher, lastScan: inboxLastScan });
  });
  app.post('/api/inbox/scan', writeLimiter, async (_req,res)=>{
    inboxLastScan = Date.now();
    let files: string[] = [];
    try { files = fs.readdirSync(INBOX_DIR).filter(f=> !f.startsWith('.') && f!=='archiv' && f!=='archive').map(f=> path.join(INBOX_DIR,f)); } catch {}
    let imported = 0;
    for (const f of files) { const before = activeCount(); await autoImportFile(f); const after = activeCount(); if (after>before) imported += (after-before); }
    res.json({ scanned: files.length, imported, inboxDir: INBOX_DIR });
  });

  // --- Speicher-API ---

  app.get("/api/memories", (req, res) => {
    const memories = req.query.trash === "1" ? listAllMemories({ trash: true }).map(toApi) : allApiMemories();
    const body = JSON.stringify(memories);
    const hash = crypto.createHash("sha1").update(body).digest("hex");
    const etag = `"${hash}"`;
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
    if (req.headers["if-none-match"] === etag) {
      return res.status(304).end();
    }
    res.setHeader("Content-Type", "application/json");
    res.send(body);
  });

  // Dokumentierte Suche: GET /api/memories/search?q=...&limit=...&tags=tag1,tag2 — über die Core-Engine
  app.get("/api/memories/search", async (req, res) => {
    const rawQ = typeof req.query.q === "string" ? req.query.q : typeof req.query.query === "string" ? req.query.query : "";
    const q = sanitizeText(rawQ, 200);
    const limitRaw = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 20;
    const tagsRaw = typeof req.query.tags === "string" ? req.query.tags : "";
    const tags = tagsRaw ? sanitizeTags(tagsRaw.split(",").map(s => s.trim()).filter(Boolean)) : [];
    const result = await engineSearch(store, { query: q, limit, tags: tags.length > 0 ? tags : undefined });
    res.json({
      query: q,
      count: result.hits.length,
      total: result.total,
      memories: result.hits.map(h => toApi(h.memory)),
    });
  });

  /** Scope auf eine handhabbare Form bringen: "user", "agent:coder", "session:abc". */
  function sanitizeScope(v: unknown): string | null {
    if (v === null) return null;
    if (typeof v !== "string") return null;
    const s = v.trim().toLowerCase().replace(/[^\w:.-]/g, "").slice(0, 64);
    return s || null;
  }

  /** Fremd-ID pruefen (gleiche Regel wie in den Routen), sonst null. */
  function sanitizeId(v: unknown): string | null {
    if (v === null) return null;
    if (typeof v !== "string") return null;
    return v.length <= 120 && /^[\w\-.:]+$/.test(v) ? v : null;
  }

  async function handleCreateOrUpdateMemory(req: express.Request, res: express.Response) {
    const body = req.body as Partial<MemoryRecord> & { tags?: unknown; title?: unknown; content?: unknown };
    // Hardened: Validierung + Sanitization + Limits
    if (body && JSON.stringify(body).length > 60000) return res.status(413).json({ error: "Payload too large (max 60k)" });
    if (activeCount() > maxActiveMemories() && !body.id) return res.status(429).json({ error: `Limit reached: ${activeCount()} active nodes, maximum is ${maxActiveMemories()} — please delete some first` });

    const title = sanitizeTitle(body.title);
    const content = sanitizeText(body.content, 50000);

    if (body.id) {
      if (typeof body.id !== "string" || body.id.length > 120 || !/^[\w\-.:]+$/.test(body.id)) return res.status(400).json({ error: "Invalid id" });
      const patch: Record<string, unknown> = {};
      if (body.title !== undefined) patch.title = title;
      if (body.content !== undefined) patch.content = content;
      if (body.tags !== undefined) patch.tags = sanitizeTags(body.tags);
      if (body.type !== undefined && ["semantic", "episodic", "procedural", "reference"].includes(String(body.type))) patch.type = body.type;
      if (typeof body.confidence === "number") patch.confidence = Math.min(1, Math.max(0, body.confidence));
      if (body.validFrom !== undefined) patch.validFrom = body.validFrom === null ? null : Number(body.validFrom) || null;
      if (body.validTo !== undefined) patch.validTo = body.validTo === null ? null : Number(body.validTo) || null;
      // scope und supersededBy konnte bisher nur MCP setzen, obwohl beide zum
      // Datenmodell gehoeren. Ein Client ueber HTTP schickte sie und bekam
      // stillschweigend nichts.
      if (body.scope !== undefined) patch.scope = sanitizeScope(body.scope);
      if (body.supersededBy !== undefined) patch.supersededBy = sanitizeId(body.supersededBy);
      const updated = store.updateMemory(body.id, patch);
      if (!updated) return res.status(404).json({ error: "Node not found" });
      if (body.content !== undefined) indexMemory(store, updated.id);
      publishActivity({ type: "update", source: "app", title: updated.title });
      return res.json({ memory: toApi(updated) });
    }

    if (!title && !content) return res.status(400).json({ error: "A title or content is required" });
    // F2: Write-Gate (Opt-in KEPTA_WRITE_GATE=on) — nur für NEUE Knoten; ein
    // Update via body.id ist die Entscheidung des Clients selbst.
    const gate = await gateDecision(store, title, content);
    if (gate && gate.decision === "UPDATE" && gate.targetId) {
      const updated = store.updateMemory(gate.targetId, {
        title,
        content,
        ...(body.tags !== undefined ? { tags: sanitizeTags(body.tags) } : {}),
      });
      if (updated) {
        indexMemory(store, gate.targetId);
        publishActivity({ type: "update", source: "app", title: updated.title });
        return res.json({ memory: toApi(updated), gateOutcome: "updated", writeGate: gate });
      }
      // Zielknoten zwischenzeitlich verschwunden → normal neu anlegen
    }
    if (gate && (gate.decision === "NOOP" || gate.decision === "DELETE")) {
      return res.json({ gateOutcome: "rejected", writeGate: gate });
    }
    const created = store.createMemory({
      title: title || "Untitled",
      content,
      tags: sanitizeTags(body.tags),
      type: ["semantic", "episodic", "procedural", "reference"].includes(String(body.type)) ? (body.type as never) : undefined,
      confidence: typeof body.confidence === "number" ? Math.min(1, Math.max(0, body.confidence)) : undefined,
      validFrom: body.validFrom === null || body.validFrom === undefined ? undefined : Number(body.validFrom) || undefined,
      validTo: body.validTo === null || body.validTo === undefined ? undefined : Number(body.validTo) || undefined,
      scope: body.scope === undefined ? undefined : (sanitizeScope(body.scope) ?? undefined),
    });
    indexMemory(store, created.id);
    publishActivity({ type: "save", source: "app", title: created.title });
    return res.json({ memory: toApi(created), ...(writeGateEnabled() ? { gateOutcome: "created", writeGate: gate } : {}) });
  }

  app.post("/api/memories", writeLimiter, handleCreateOrUpdateMemory);
  // Alias für MCP / einfache Clients
  app.post("/api/memory", writeLimiter, handleCreateOrUpdateMemory);

  app.delete("/api/memories/:id", writeLimiter, (req, res) => {
    const id = String(req.params.id || "");
    if (!id || id.length > 120 || !/^[\w\-.:]+$/.test(id)) return res.status(400).json({ error: "Invalid id" });
    // Default: Papierkorb. ?permanent=1 löscht endgültig.
    if (req.query.permanent === "1" || req.query.permanent === "true") {
      const purged = store.purgeMemory(id);
      if (purged) publishActivity({ type: "delete", source: "app", title: id });
      return res.json({ ok: purged, permanent: true });
    }
    const trashed = store.trashMemory(id);
    if (trashed) {
      const m = store.getMemory(id);
      publishActivity({ type: "delete", source: "app", title: m?.title ?? id });
    }
    res.json({ ok: trashed, permanent: false });
  });

  /**
   * Sammel-Loeschen: EIN Aufruf fuer viele Notizen.
   *
   * Vorher schickte das Duplikate-Fenster eine eigene Anfrage je Notiz. Bei 155
   * Duplikaten waren das 155 Anfragen, 155 Meldungen und 155-mal Neuladen der
   * Liste — und ab der einundsechzigsten griff die Schreibdrossel (60/min) und
   * beantwortete alles Weitere mit 429. Weil der Aufrufer den Fehler verwarf,
   * meldete die Oberflaeche trotzdem Erfolg. Von aussen sah das aus, als
   * loesche KEPTA wahllos die halbe Wissensbasis.
   *
   * Hier faellt alles in einen Aufruf, und die Antwort sagt genau, was geschehen
   * ist. Geloescht wird IN DEN PAPIERKORB, nie endgueltig.
   */
  app.post("/api/memories/bulk-delete", writeLimiter, express.json({ limit: "1mb" }), (req, res) => {
    const roh = (req.body as { ids?: unknown } | undefined)?.ids;
    if (!Array.isArray(roh)) return res.status(400).json({ error: "ids must be a list" });
    if (roh.length > MAX_BULK_IDS) return res.status(400).json({ error: `At most ${MAX_BULK_IDS} at a time` });
    const gueltig = [...new Set(roh.map((x) => String(x)))].filter((id) => id.length > 0 && id.length <= 120 && /^[\w\-.:]+$/.test(id));
    const erledigt: string[] = [];
    let nichtGefunden = 0;
    for (const id of gueltig) {
      if (store.trashMemory(id)) erledigt.push(id); else nichtGefunden++;
    }
    if (erledigt.length > 0) {
      publishActivity({ type: "delete", source: "app", title: `${erledigt.length} notes moved to the trash` });
      letzteEigeneMeldung = Date.now();
    }
    res.json({ ok: true, deleted: erledigt.length, notFound: nichtGefunden, ids: erledigt });
  });

  /**
   * Bestehende Notizen nachtraeglich einsortieren.
   *
   * Noetig, weil die Zuordnung frueher NIEMAND vornahm: der Typ kam allein vom
   * Aufrufer, und der Rechner-Scan setzte gar keinen — alles fiel auf "Fakt"
   * zurueck. An einer echten Wissensbasis waren das 3071 von 3148 Notizen.
   *
   * Ohne `apply: true` wird nur geschaut und gezaehlt. Erst die ausdrueckliche
   * Bestaetigung schreibt.
   */
  app.post("/api/memories/reclassify", writeLimiter, express.json({ limit: "1mb" }), (req, res) => {
    const anwenden = (req.body as { apply?: unknown } | undefined)?.apply === true;
    const alle = store.listMemories({ limit: MAX_SEARCH_LIMIT });
    const vorher: Record<string, number> = {};
    const nachher: Record<string, number> = {};
    let geaendert = 0;
    const beispiele: { title: string; von: string; nach: string; grund: string }[] = [];

    for (const m of alle) {
      vorher[m.type] = (vorher[m.type] ?? 0) + 1;
      const quelle = /—\s*Source:\s*(\S.*)$/m.exec(m.content)?.[1]?.trim();
      const z = klassifiziere({ title: m.title, content: m.content, tags: m.tags, quelle });
      nachher[z.typ] = (nachher[z.typ] ?? 0) + 1;
      if (z.typ !== m.type) {
        geaendert++;
        if (beispiele.length < 12) beispiele.push({ title: m.title.slice(0, 60), von: m.type, nach: z.typ, grund: z.grund });
        if (anwenden) store.updateMemory(m.id, { type: z.typ });
      }
    }
    if (anwenden && geaendert > 0) letzteEigeneMeldung = Date.now();
    res.json({ ok: true, applied: anwenden, total: alle.length, changed: geaendert, before: vorher, after: nachher, examples: beispiele });
  });

  /** Das Gegenstueck: alles aus einem Sammel-Loeschen wieder zurueckholen. */
  app.post("/api/memories/bulk-restore", writeLimiter, express.json({ limit: "1mb" }), (req, res) => {
    const roh = (req.body as { ids?: unknown } | undefined)?.ids;
    if (!Array.isArray(roh)) return res.status(400).json({ error: "ids must be a list" });
    if (roh.length > MAX_BULK_IDS) return res.status(400).json({ error: `At most ${MAX_BULK_IDS} at a time` });
    const gueltig = [...new Set(roh.map((x) => String(x)))].filter((id) => id.length > 0 && id.length <= 120 && /^[\w\-.:]+$/.test(id));
    let zurueck = 0;
    for (const id of gueltig) if (store.restoreMemory(id)) zurueck++;
    if (zurueck > 0) letzteEigeneMeldung = Date.now();
    res.json({ ok: true, restored: zurueck });
  });

  // Wiederherstellen aus dem Papierkorb
  app.post("/api/memories/:id/restore", writeLimiter, (req, res) => {
    const id = String(req.params.id || "");
    if (!id || id.length > 120 || !/^[\w\-.:]+$/.test(id)) return res.status(400).json({ error: "Invalid id" });
    const restored = store.restoreMemory(id);
    if (!restored) return res.status(404).json({ error: "Not found in the trash" });
    res.json({ ok: true, memory: toApi(store.getMemory(id)!) });
  });

  // (POST /api/memories/import ist mit eigenem 2mb-Body-Parser oben registriert,
  //  bevor das globale 1mb-Limit greift — siehe P1-Kommentar dort.)

  // ---------- Praxis-Sync: verschluesselter Geraeteabgleich ----------
  // Der Kern konnte das laengst, war aber an nichts angeschlossen. Hier wird er
  // erreichbar: exportieren erzeugt ein AES-256-GCM-Paket, das per USB, Ordner
  // oder verschluesselter Mail auf das zweite Geraet der Kanzlei wandert.
  // KEPTA selbst sendet nichts — der Weg bleibt in der Hand des Nutzers.
  //
  // Die Passphrase wird ausschliesslich zum Ableiten des Schluessels benutzt und
  // niemals protokolliert, zurueckgegeben oder in publishActivity gereicht.
  const syncJournal = new PraxissyncJournal(path.join(DATA_DIR, "sync-journal.jsonl"));

  function passphraseAus(body: unknown): string {
    const p = (body as { passphrase?: unknown } | null)?.passphrase;
    if (typeof p !== "string" || p.length === 0) {
      throw Object.assign(new Error("Passphrase fehlt"), { status: 400 });
    }
    return p;
  }

  app.post("/api/sync/export", writeLimiter, (req, res) => {
    try {
      const passphrase = passphraseAus(req.body);
      const scope = typeof req.body?.scope === "string" && req.body.scope ? String(req.body.scope) : "local";
      const sender = typeof req.body?.sender === "string" && req.body.sender ? String(req.body.sender).slice(0, 80) : os.hostname();
      const bundle = exportBundle(store, { passphrase, scope, sender, journal: syncJournal });
      // Kein publishActivity: ein Export aendert den Speicher nicht. Der Vorgang
      // steht im Mitschnitt, und dort gehoert er hin.
      res.json({ ok: true, bundle });
    } catch (e) {
      // Kurze Passphrase, gebrochener Mitschnitt, Schreibfehler — alles Zustaende,
      // die der Nutzer beheben kann, also 400 statt 500. Die Meldung stammt aus
      // dem Kern und nennt die Passphrase nie.
      const msg = e instanceof Error ? e.message : "Export fehlgeschlagen";
      res.status(400).json({ error: msg });
    }
  });

  app.post("/api/sync/import", writeLimiter, (req, res) => {
    try {
      const passphrase = passphraseAus(req.body);
      const bundle = req.body?.bundle as SyncBundle | undefined;
      if (!bundle || typeof bundle !== "object") {
        return res.status(400).json({ error: "Bundle fehlt" });
      }
      const peer = typeof req.body?.peer === "string" && req.body.peer ? String(req.body.peer).slice(0, 80) : undefined;
      const ergebnis = importBundle(store, bundle, { passphrase, peer, journal: syncJournal });
      if (ergebnis.imported > 0) {
        publishActivity({ type: "save", source: "app", title: `Praxis-Sync: ${ergebnis.imported} uebernommen` });
      }
      res.json({ ok: true, ...ergebnis });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Import fehlgeschlagen";
      res.status(400).json({ error: msg });
    }
  });

  // Der Mitschnitt ist der nachpruefbare Teil: welche Pakete wann in welche
  // Richtung gingen — ohne deren Inhalt zu kennen. intact meldet, ob die
  // Hash-Kette unversehrt ist.
  app.get("/api/sync/journal", (_req, res) => {
    const entries = syncJournal.entries();
    res.json({ ok: true, intact: syncJournal.verify(), count: entries.length, entries });
  });

  app.get("/api/storage-info", (_req, res) => {
    res.json({
      dbPath: store.dbPath,
      count: activeCount(),
      trashed: store.countMemories().trashed,
      embeddings: store.embeddingStats(),
    });
  });

  // --- Wissensgraph (Entities + Relations) ---
  app.get("/api/graph", (req, res) => {
    const entity = typeof req.query.entity === "string" && req.query.entity.trim() ? req.query.entity.trim() : undefined;
    const depthRaw = req.query.depth ? parseInt(String(req.query.depth), 10) : 2;
    const depth = Number.isFinite(depthRaw) ? Math.min(Math.max(depthRaw, 1), 4) : 2;
    const g = store.getGraph(entity, depth);
    const nameById = new Map(g.entities.map((e) => [e.id, e.name]));
    res.json({
      entities: g.entities,
      relations: g.relations
        .filter((r) => nameById.has(r.sourceId) && nameById.has(r.targetId))
        .map((r) => ({ id: r.id, source: nameById.get(r.sourceId)!, target: nameById.get(r.targetId)!, relation: r.relation, memoryId: r.memoryId })),
      // entity → memory-IDs (für Graph-Rendering über Memories hinweg)
      memoriesByEntity: Object.fromEntries(g.entities.map((e) => [e.name, [...store.memoryIdsForEntities([e.id])]])),
    });
  });

  // --- Obsidian-Interop: Markdown-Import/-Export ---
  // (POST /api/import/markdown ist mit eigenem 10mb-Body-Parser oben registriert.)

  // Export: schreibt alle aktiven Memories als .md in ~/.kepta/export/<zeitstempel>/
  app.post("/api/export/markdown", writeLimiter, (_req, res) => {
    const memories = listAllMemories();
    if (memories.length === 0) return res.status(404).json({ error: "No memories to export" });
    const dir = path.join(DATA_DIR, "export", `kepta-export-${Date.now()}`);
    try {
      fs.mkdirSync(dir, { recursive: true });
      const used = new Set<string>();
      for (const m of memories) {
        const { filename, markdown } = memoryToMarkdown(m);
        let name = filename;
        let i = 2;
        while (used.has(name.toLowerCase())) {
          name = filename.replace(/\.md$/, `-${i}.md`);
          i++;
        }
        used.add(name.toLowerCase());
        fs.writeFileSync(path.join(dir, name), markdown, "utf-8");
      }
      res.json({ exported: memories.length, path: dir });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Export failed" });
    }
  });

  // --- URL-Clipper: holt URL und extrahiert Titel + reinen Text ---
  // Eine notierte Datei mit dem OS-Standardprogramm öffnen — der Weg zurück
  // zur Original-PDF/-HTML/-Datei, die der Scan oder der Drop eingelesen hat.
  // Doppelte Absicherung: der Server lauscht ohnehin nur auf 127.0.0.1, und
  // hier gelten dieselben Grenzen wie beim Rechner-Scan — absolut, vorhanden,
  // eine DATEI, unter dem Home-Verzeichnis.

  // CMaps für den clientseitigen PDF-Import (pdf.js) — offline, ohne CDN.
  const cmapQuellen = [path.join(serverVerzeichnis(), "cmaps"), path.join(process.cwd(), "node_modules", "pdfjs-dist", "cmaps")];
  for (const quelle of cmapQuellen) {
    if (fs.existsSync(quelle)) { app.use("/cmaps", express.static(quelle)); break; }
  }

  // Datenreparatur: PDFs, deren Teile mit der alten Rohbyte-Extraktion
  // eingelesen wurden (Glyph-Namen, Binärblöcke), werden anhand ihrer
  // Quellen-Zeile neu gelesen. Web-Clips verlieren ihre Menüzeilen ("Skip to
  // main content", Cookie-Banner) nach derselben Regel wie beim Import, ohne Netz.
  //
  // Ohne { apply: true } wird nur gezählt — geschrieben wird erst nach
  // Bestätigung, dasselbe Muster wie beim Nachsortieren. Unveränderte Teile
  // bleiben unberührt: ein zweiter Lauf schreibt nichts neu. Überzählige Teile
  // wandern in den Papierkorb, nie endgültig weg.
  //
  // Die Quellen-Zeile bleibt an jedem Teil stehen. Die erste Fassung (2.10.0)
  // schrieb nur den neuen Text zurück; an einer echten Wissensbasis waren
  // danach 36 Teile aus 8 PDFs lesbar, aber ohne Herkunft.
  //
  // Nur PDFs: 2.10.1 las auch HTML neu. An einer echten Wissensbasis hätte das
  // 70 Dateien umgeschrieben und 580 Teile endgültig gelöscht — fast alles
  // Coverage-Berichte, die der Rechner-Scan mitgenommen hatte und die sich bei
  // jedem Testlauf neu schreiben. "Neu lesen" hieß dort: durch eine ganz andere
  // Datei ersetzen.
  const NEU_LESBAR = new Set([".pdf"]);
  const LESE_FRIST_MS = 30_000;
  const ZUGRIFF_MELDUNG = "no answer from the file system within 30 s — macOS may be waiting for permission to read this folder (System Settings → Privacy & Security → Files and Folders)";
  const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
  const MAX_SETTINGS_BYTES = 64 * 1024;

  /** pdf.js wird erst beim ersten PDF geladen — ESM-only-Paket, daher dynamischer Import. */
  type PdfjsMod = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
  let pdfjsCache: PdfjsMod | null = null;
  async function ladePdfjs(): Promise<PdfjsMod> {
    if (!pdfjsCache) pdfjsCache = await import("pdfjs-dist/legacy/build/pdf.mjs");
    return pdfjsCache;
  }

  function serverVerzeichnis(): string {
    // Gebaut (CJS-Bundle): __dirname. Dev (tsx/ESM): das Repo-Verzeichnis.
    if (typeof __dirname !== "undefined") return __dirname;
    return process.cwd();
  }

  function cMapVerzeichnis(): string {
    const neben = path.join(serverVerzeichnis(), "cmaps");
    if (fs.existsSync(neben)) return neben;
    return path.join(process.cwd(), "node_modules", "pdfjs-dist", "cmaps");
  }

  async function textAusPdf(datei: string): Promise<string> {
    const { getDocument } = await ladePdfjs();
    // Asynchron gelesen, nie synchron — warum, steht im Changelog zu 2.10.3.
    const daten = new Uint8Array(await fs.promises.readFile(datei));
    const ladeAuftrag = getDocument({
      data: daten,
      cMapUrl: cMapVerzeichnis() + path.sep,
      cMapPacked: true,
    });
    const doc = await ladeAuftrag.promise;
    try {
      const seiten: string[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const seite = await doc.getPage(i);
        const inhalt = await seite.getTextContent();
        let text = "";
        for (const item of inhalt.items) {
          if (!("str" in item)) continue;
          text += item.str;
          if ((item as { hasEOL?: boolean }).hasEOL) text += "\n";
        }
        seiten.push(text.trim());
      }
      return seiten.join("\n\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 200000);
    } finally {
      await ladeAuftrag.destroy();
    }
  }

  /** Nutzerdateien werden nie synchron gelesen — 2.10.3-Freeze, siehe Changelog. */
  async function textAus(datei: string): Promise<string> {
    const ext = path.extname(datei).toLowerCase();
    if (ext === ".pdf") {
      const text = await textAusPdf(datei);
      if (text) return text;
      // Extraktion leer -> besser ein ehrlicher Hinweis als Binärmüll.
      return "[Text konnte aus dieser PDF nicht extrahiert werden — Quelle ist über den Quellen-Chip öffnbar]";
    }
    const roh = await fs.promises.readFile(datei, "utf-8");
    if (ext === ".html" || ext === ".htm" || ext === ".xml") {
      return htmlZuText(roh).slice(0, 50000);
    }
    return roh.slice(0, 50000);
  }

  function inChunks(text: string, groesse = 2000): string[] {
    const out: string[] = [];
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + groesse, text.length);
      if (end < text.length) {
        const stueck = text.slice(start, end);
        const bruch = Math.max(stueck.lastIndexOf("\n\n"), stueck.lastIndexOf(". "));
        if (bruch > groesse * 0.55) end = start + bruch + 1;
      }
      const s = text.slice(start, end).trim();
      if (s) out.push(s);
      start = end;
    }
    return out;
  }

  app.post("/api/repair/imports", writeLimiter, express.json({ limit: "16kb" }), async (req, res) => {
    const anwenden = req.body?.apply === true;
    const alle = listAllMemories();
    const nachQuelle = new Map<string, CoreMemory[]>();
    for (const m of alle) {
      const treffer = /—\s*Source:\s*(\S.*)$/m.exec(m.content);
      if (!treffer) continue;
      const p = treffer[1].trim();
      if (!path.isAbsolute(p)) continue;
      const liste = nachQuelle.get(p) ?? [];
      liste.push(m);
      nachQuelle.set(p, liste);
    }
    let geprueft = 0, dateien = 0, aktualisiert = 0, entfernt = 0, erstellt = 0, clips = 0;
    const fehler: string[] = [];
    for (const [pfad, gruppe] of nachQuelle) {
      if (!NEU_LESBAR.has(path.extname(pfad).toLowerCase())) continue;
      const stat = await fs.promises.stat(pfad).catch(() => null);
      if (!stat?.isFile()) continue;
      geprueft++;
      try {
        const text = await mitFrist(textAus(pfad), LESE_FRIST_MS, ZUGRIFF_MELDUNG);
        const plan = planeImportReparatur(
          gruppe.map((m) => ({ id: m.id, title: m.title, content: m.content })),
          inChunks(text, 2000),
          { anhang: `\n\n— Source: ${pfad}` }
        );
        const bisher = new Map(gruppe.map((m) => [m.id, m] as const));
        const updates = plan.updates
          .map((u) => ({ id: u.id, title: sanitizeTitle(u.title) || u.title, content: sanitizeText(u.content, 50000) }))
          .filter((u) => {
            const vorher = bisher.get(u.id);
            return !vorher || vorher.title !== u.title || vorher.content !== u.content;
          });
        if (updates.length === 0 && plan.entfaelle.length === 0 && plan.neu.length === 0) continue;
        dateien++;
        aktualisiert += updates.length;
        entfernt += plan.entfaelle.length;
        erstellt += plan.neu.length;
        if (!anwenden) continue;
        for (const u of updates) {
          store.updateMemory(u.id, { title: u.title, content: u.content });
          indexMemory(store, u.id);
        }
        // In den Papierkorb, nicht endgültig — KEPTA löscht nie ohne Rückweg.
        for (const id of plan.entfaelle) store.trashMemory(id);
        const vorlage = gruppe[0];
        for (const t of plan.neu) {
          const created = store.createMemory({
            title: sanitizeTitle(t.title) || t.title, content: sanitizeText(t.content, 50000), tags: vorlage.tags,
            type: vorlage.type, scope: vorlage.scope, confidence: vorlage.confidence,
          });
          indexMemory(store, created.id);
        }
      } catch (e) {
        fehler.push(`${pfad}: ${e instanceof Error ? e.message : "unbekannt"}`);
        // Keine Antwort vom Dateisystem: nicht weiter warten. Jede weitere Datei
        // aus demselben Ordner bliebe genauso haengen und hielte einen Thread
        // des Dateisystems fest.
        if (e instanceof Error && e.message === ZUGRIFF_MELDUNG) break;
      }
    }
    // Web-Clips: "Source: <url>" steht vorn. Neu geholt wird nichts.
    const volleZeilen = (s: string) => s.split("\n").filter((z) => z.trim()).length;
    for (const m of alle) {
      if (!/^Source:\s*https?:\/\//i.test(m.content)) continue;
      const sauber = entferneNaviZeilen(m.content);
      if (volleZeilen(sauber) >= volleZeilen(m.content)) continue;
      clips++;
      if (anwenden) {
        store.updateMemory(m.id, { content: sauber });
        indexMemory(store, m.id);
      }
    }
    if (anwenden && (dateien > 0 || clips > 0)) letzteEigeneMeldung = Date.now();
    res.json({ ok: true, applied: anwenden, geprueft, dateien, aktualisiert, entfernt, erstellt, clips, fehler: fehler.slice(0, 5) });
  });


  // ---------- Semantische Hybrid-Suche + Ollama Proxy ----------
  const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
  const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";

  // POST /api/embed  -> Ollama Proxy (lokaler Fallback, nie harter Fehler für Frontend)
  app.post("/api/embed", chatLimiter, async (req, res) => {
    const { input, inputs, prompt, model } = req.body as {
      input?: string | string[];
      inputs?: string[];
      prompt?: string;
      model?: string;
    };
    const rawInput = input ?? inputs ?? prompt;
    if (rawInput === undefined || (Array.isArray(rawInput) && rawInput.length === 0) || (typeof rawInput === "string" && !rawInput.trim())) {
      return res.status(400).json({ error: "No input given for embedding" });
    }
    const texts: string[] = Array.isArray(rawInput) ? rawInput : [rawInput];
    const modelName = model || OLLAMA_EMBED_MODEL;
    const base = trimSlash(OLLAMA_HOST);

    try {
      // Neuer Ollama Endpoint: /api/embed (batch-fähig)
      const r = await fetch(`${base}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelName, input: texts }),
      });
      if (r.ok) {
        const data: any = await r.json();
        if (Array.isArray(data.embeddings)) {
          return res.json({ embeddings: data.embeddings, model: modelName });
        }
        if (Array.isArray(data.embedding)) {
          return res.json({ embeddings: [data.embedding], model: modelName });
        }
      }
      // Fallback: /api/embeddings sequentiell (ältere Ollama-Versionen)
      const embeddings: number[][] = [];
      for (const t of texts) {
        const rr = await fetch(`${base}/api/embeddings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: modelName, prompt: t }),
        });
        if (!rr.ok) {
          const errText = await rr.text().catch(() => "");
          throw new Error(errText || `Ollama error ${rr.status}`);
        }
        const jd: any = await rr.json();
        if (Array.isArray(jd.embedding)) embeddings.push(jd.embedding);
        else throw new Error("Invalid embedding response");
      }
      return res.json({ embeddings, model: modelName });
    } catch (e: any) {
      // Ollama nicht erreichbar -> dem Frontend signalisieren, damit es auf TF-IDF zurückfällt
      return res.status(502).json({ error: e.message || "Ollama is unreachable", embeddings: null });
    }
  });

  // POST /api/search  -> Retrieval-Engine (BM25 + Vektoren + Graph → RRF), ein Pfad für alles
  app.post("/api/search", chatLimiter, async (req, res) => {
    const { query, topK = 5, tags, type, scope, asOf } = req.body as {
      query?: string;
      topK?: number;
      tags?: string[];
      type?: string;
      scope?: string;
      asOf?: number;
    };
    // "Alles zu diesem Thema" muss auch alles bedeuten duerfen.
    const limit = Math.min(Math.max(Number(topK) || 5, 1), MAX_SEARCH_LIMIT);
    const result = await engineSearch(store, {
      query: sanitizeText(query ?? "", 500),
      limit,
      tags: Array.isArray(tags) && tags.length > 0 ? sanitizeTags(tags) : undefined,
      type: type === "semantic" || type === "episodic" || type === "procedural" || type === "reference" ? type : undefined,
      scope: typeof scope === "string" && scope ? scope : undefined,
      asOf: typeof asOf === "number" && Number.isFinite(asOf) ? asOf : undefined,
    });
    publishActivity({ type: "search", source: "app", title: result.query }, { throttleSearchMs: 2500 });
    // Altes Response-Shape für das Frontend (cosineScore/bm25Score sind die Einzelbeine)
    return res.json({
      results: result.hits.map(h => ({
        memory: toApi(h.memory),
        score: h.score,
        cosineScore: h.components.vectorSimilarity ?? 0,
        bm25Score: h.components.bm25Rank !== null ? 1 / (h.components.bm25Rank + 1) : 0,
        rawBm25: 0,
        matchedTerms: h.matchedTerms,
        expired: h.expired,
        superseded: h.superseded,
      })),
      total: result.total,
      query: result.query,
      hasMatch: result.hits.length > 0,
      usedVectors: result.usedVectors,
    });
  });

  // --- MCP über HTTP ---
  // Tool-Liste (Discovery)
  app.get("/api/mcp/tools", (_req, res) => {
    res.json({ tools: MCP_TOOLS, protocol: "2026-07-28" });
  });
  app.get("/api/tools", (_req, res) => {
    res.json({ tools: MCP_TOOLS, protocol: "2026-07-28" });
  });

  const mcpCtx = { store, transport: "http" as const };

  // Streamable HTTP (MCP 2026-07-28, stateless) — POST /mcp
  app.post("/mcp", async (req, res) => {
    const body = req.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      // JSON-Array = Batch-Request: MCP 2026-07-28 hat Batching gestrichen →
      // einzelnes Error-Objekt statt stiller 200/leerer Antwort
      return res.status(400).json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Batching is not supported (MCP 2026-07-28 removed it)" } });
    }
    try {
      const reply = await handleRpc(mcpCtx, body as never);
      // Activity: Agenten-Aktionen sichtbar machen
      const rpcBody = body as { method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
      if (rpcBody.method === "tools/call") {
        const toolName = String(rpcBody.params?.name ?? "");
        const args = rpcBody.params?.arguments ?? {};
        if (toolName === "memory_save") publishActivity({ type: "save", source: "agent", title: String(args.title ?? "") });
        else if (toolName === "memory_search") publishActivity({ type: "search", source: "agent", title: String(args.query ?? "") }, { throttleSearchMs: 4000 });
        else if (toolName === "memory_delete" || toolName === "memory_forget") publishActivity({ type: "delete", source: "agent", title: String(args.id ?? "") });
        else if (toolName === "memory_update") publishActivity({ type: "update", source: "agent", title: String(args.id ?? "") });
        else if (toolName === "memory_consolidate") publishActivity({ type: "consolidate", source: "agent" });
      }
      if (!reply) return res.status(202).json({ accepted: true });
      return res.json(reply);
    } catch (e) {
      return res.status(500).json({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32603, message: e instanceof Error ? e.message : String(e) },
      });
    }
  });
  app.get("/mcp", (_req, res) => {
    res.status(405).json({ error: "Streamable HTTP: POST only (stateless, no SSE session)" });
  });

  // Legacy-kompatible Hilfsrouten (plain JSON statt JSON-RPC) — dünne Wrapper über die Engine
  app.post("/api/mcp/search", writeLimiter, async (req, res) => {
    const { query, limit = 10, tags } = req.body as { query?: string; limit?: number; tags?: string[] };
    if (!query || !query.trim()) return res.status(400).json({ error: "a query is required", tools: MCP_TOOLS });
    const result = await engineSearch(store, {
      query: String(query),
      limit: Math.min(Math.max(parseInt(String(limit), 10) || 10, 1), 50),
      tags: Array.isArray(tags) ? tags : undefined,
    });
    publishActivity({ type: "search", source: "agent", title: String(query) }, { throttleSearchMs: 4000 });
    return res.json({
      query,
      count: result.hits.length,
      memories: result.hits.map(h => ({ id: h.memory.id, title: h.memory.title, content: h.memory.content, tags: h.memory.tags, updatedAt: h.memory.updatedAt, expired: h.expired, superseded: h.superseded })),
    });
  });

  app.post("/api/mcp/save", writeLimiter, async (req, res) => {
    const body = req.body as Record<string, unknown>;
    try {
      const { created, record } = saveWithIndex(store, body);
      publishActivity({ type: created ? "save" : "update", source: "agent", title: record.title });
      return res.json({ memory: toApi(record), created });
    } catch (e) {
      return res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // --- Chat ---

  // Streaming: leitet die Antwort als SSE an den Client weiter

  // Nicht-Streaming-Fallback

  // Verfügbare Modelle eines Anbieters abrufen

  return app;
}

// ---------- Bootstrap (Store, Queue, SPA-Serving, listen) ----------

// dist-Ordner ermitteln: im gebündelten Server liegt index.html neben server.cjs (dist/),
// im tsx-Dev-Lauf unter <cwd>/dist.
function resolveDistDir(): string {
  try {
    if (typeof __dirname === "string" && fs.existsSync(path.join(__dirname, "server.cjs"))) return __dirname;
  } catch { /* tsx-ESM: kein __dirname */ }
  return path.join(process.cwd(), "dist");
}

async function startServer() {
  const PORT = parseInt(process.env.PORT || "3000", 10);
  // Default nur Loopback — die API hat keine Auth (Memories lesen/löschen, Chat-Proxy
  // mit API-Keys). Bindung an alle Interfaces nur bewusst via KEPTA_HOST.
  const HOST = process.env.KEPTA_HOST || "127.0.0.1";

  // Der Schluessel liegt im Schluesselbund des Systems (schluessel.ts).
  const store = new KeptaStore(undefined, { ...defaultExtensions(), keys: schluesselbundKeyProvider(DATA_DIR) });
  const migration = migrateFromLegacyJson(store);
  if (!migration.skipped) {
    console.log(`Migration: ${migration.migrated} nodes taken over from memories.json (backup: ${migration.backupPath ?? "none"})`);
  }
  const embeddingQueue = new EmbeddingQueue(store);
  embeddingQueue.start();

  const app = createApp(store);

  // Vite-Dev-Middleware: der tsx-Dev-Server (`npm run dev`) nutzt sie immer —
  // das gebündelte dist/server.cjs (`npm start`, Electron) dagegen nur, wenn KEIN
  // Build vorliegt und nicht in Produktion. Sonst liefert `npm start` ohne gesetztes
  // NODE_ENV fälschlich den Vite-Dev-Server statt des statischen dist.
  const runningFromSource = /\.[cm]?tsx?$/.test(process.argv[1] ?? "");
  const devAllowed = process.env.NODE_ENV !== "production" && !process.env.ELECTRON_RUN_AS_NODE;
  const distDir = resolveDistDir();
  const hasBuiltApp = fs.existsSync(path.join(distDir, "index.html"));
  let spaServed = false;
  if (devAllowed && (runningFromSource || !hasBuiltApp)) {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      spaServed = true;
    } catch {
      // Vite in dieser Umgebung nicht verfügbar (z.B. gepackte App) → statischer Fallback
    }
  }
  if (!spaServed) {
    app.use(express.static(distDir));
    app.get('*', (req, res) => {
      // API-Routen nicht überschreiben
      if (req.path.startsWith("/api/") || req.path === "/mcp") return res.status(404).json({ error: "Not found" });
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}${HOST === "127.0.0.1" ? "" : "  (all interfaces — KEPTA_HOST is set explicitly)"}`);
    const v = store.verschluesselung;
    console.log(`Encryption: ${v.aktiv ? `on (${v.ablage ?? "key provider"}${v.umgewandelt ? ", converted from plaintext just now" : ""})` : `OFF${v.hinweis ? ` — ${v.hinweis}` : ""}`}`);
    console.log(`Speicher: ${store.dbPath} (SQLite) | Embeddings: ${JSON.stringify(store.embeddingStats())}`);
    console.log(`API: http://localhost:${PORT}/api/health | /api/search | MCP: POST /mcp (2026-07-28, ${MCP_TOOLS.length} Tools)`);
    // Adresse hinterlegen, damit fremde Clients die App finden: die gepackte App
    // läuft auf einem zufälligen Port, ohne diese Datei wäre sie unauffindbar.
    try {
      fs.writeFileSync(
        path.join(DATA_DIR, "endpoint.json"),
        JSON.stringify({ url: `http://127.0.0.1:${PORT}`, port: PORT, pid: process.pid, startedAt: new Date().toISOString() }, null, 2),
      );
    } catch { /* nicht schreibbar — Clients nutzen dann KEPTA_URL oder den Standardport */ }
    if (process.send) process.send('server-ready');
  });
  // Listen-Fehler sauber behandeln — z. B. EADDRINUSE durch getFreePort-TOCTOU in der
  // Electron-Shell: klare Logausgabe statt unbehandeltem Crash-Dialog.
  server.on("error", (err: NodeJS.ErrnoException) => {
    console.error(`Server listen error (${err.code ?? "unknown"}): ${err.message}`);
    process.exit(1);
  });
}

// Nur automatisch starten, wenn direkt ausgeführt (nicht beim Import in Tests).
// Das Versprechen geht nach aussen: scheitert der Start — etwa weil der
// Schluessel nicht zur verschluesselten Datenbank passt —, zeigt die
// Electron-Huelle den Grund an, statt auf einen Server zu warten, den es nie gibt.
export const serverStart: Promise<void> | undefined =
  process.env.KEPTA_NO_AUTOSTART !== "1" ? startServer() : undefined;
serverStart?.catch((e: unknown) => {
  console.error(`KEPTA could not start: ${e instanceof Error ? e.message : String(e)}`);
  if (!process.versions.electron) process.exit(1);
});