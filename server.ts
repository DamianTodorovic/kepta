import express from "express";
import compression from "compression";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import os from "os";
import { KeptaStore } from "./src/core/store";
import { migrateFromLegacyJson } from "./src/core/migrate";
import { EmbeddingQueue } from "./src/core/embeddings";
import { searchMemories as engineSearch, indexMemory } from "./src/core/engine";
import { handleRpc, TOOLS as MCP_TOOLS, saveWithIndex } from "./src/core/mcp";
import { importObsidianVault, memoryToMarkdown } from "./src/core/obsidian";
import type { MemoryRecord as CoreMemory } from "./src/core/types";

interface ChatRequest {
  providerId?: string;
  protocol?: "openai" | "anthropic";
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
}

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
function sanitizeText(input: unknown, maxLen = 50000): string {
  if (typeof input !== "string") return "";
  // Entferne Null-Bytes und Steuerzeichen außer \n \r \t
  let s = input.replace(/\0/g, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  // Strip <script> tags und event handlers (XSS)
  s = s.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  s = s.replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // Entferne weitere gefährliche Tags komplett wenn onerror etc übrig
  s = s.replace(/<[^>]*\bon\w+[^>]*>/gi, (m)=> m.replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, ""));
  s = s.replace(/javascript:\s*/gi, "");
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s.trim();
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
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0.0.0.0") return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true; // link-local / AWS metadata
  if (/^0\./.test(h)) return true;
  if (h.endsWith(".local") || h.endsWith(".internal") || h === "metadata.google.internal" || h === "metadata.google") return true;
  return false;
}
function isSafeUrl(raw: string): { ok: boolean; reason?: string; url?: URL } {
  try {
    const u = new URL(raw);
    if (!["http:", "https:"].includes(u.protocol)) return { ok: false, reason: "Nur http/https erlaubt" };
    if (isPrivateHost(u.hostname)) return { ok: false, reason: "Private Hosts blockiert (SSRF Schutz)" };
    if (u.username || u.password) return { ok: false, reason: "Auth in URL nicht erlaubt" };
    // Blocke ungewöhnliche Ports (nur 80,443,3000-9000 erlaubt)
    if (u.port && !["", "80", "443", "3000","3001","5173","8080","8000","9000"].includes(u.port) && parseInt(u.port,10) < 1024) {
      // Erlaube trotzdem, aber logge — für Sicherheit blocken wir nur private
    }
    if (raw.length > 2048) return { ok: false, reason: "URL zu lang" };
    return { ok: true, url: u };
  } catch {
    return { ok: false, reason: "Ungültige URL" };
  }
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

// ---------- Upstream-Chat ----------

function buildUpstreamBody(req: ChatRequest, stream: boolean) {
  if (req.protocol === "anthropic") {
    return {
      model: req.model || "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: req.system,
      messages: req.messages,
      stream,
    };
  }
  return {
    model: req.model || "gpt-4o-mini",
    max_tokens: 4096,
    messages: [
      ...(req.system ? [{ role: "system", content: req.system }] : []),
      ...req.messages,
    ],
    stream,
  };
}

function buildUpstreamHeaders(req: ChatRequest): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (req.protocol === "anthropic") {
    headers["x-api-key"] = req.apiKey || "";
    headers["anthropic-version"] = "2023-06-01";
  } else {
    if (req.apiKey) headers["Authorization"] = `Bearer ${req.apiKey}`;
    if (req.providerId === "openrouter") {
      headers["HTTP-Referer"] = "ki-gehirn-local";
      headers["X-Title"] = "KEPTA";
    }
  }
  return headers;
}

function upstreamUrl(req: ChatRequest) {
  const base = trimSlash(req.baseUrl || (req.protocol === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com/v1"));
  return req.protocol === "anthropic" ? `${base}/v1/messages` : `${base}/chat/completions`;
}

// Zerlegt den Upstream-SSE-Stream in Textdeltas (OpenAI- und Anthropic-Format).
async function* streamUpstreamDeltas(res: Response): AsyncGenerator<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload);
        // OpenAI-Format
        const openAiDelta = json?.choices?.[0]?.delta?.content;
        if (typeof openAiDelta === "string" && openAiDelta) {
          yield openAiDelta;
          continue;
        }
        // Anthropic-Format
        if (json?.type === "content_block_delta" && json?.delta?.type === "text_delta") {
          yield json.delta.text || "";
        }
      } catch {
        // Unvollständige Zeile überspringen
      }
    }
  }
}

async function readFullAnswer(req: ChatRequest) {
  const res = await fetch(upstreamUrl(req), {
    method: "POST",
    headers: buildUpstreamHeaders(req),
    body: JSON.stringify(buildUpstreamBody(req, false)),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `API-Fehler (${res.status})`);
  }
  if (req.protocol === "anthropic") {
    return (data?.content || [])
      .filter((b: unknown) => (b as { type: string }).type === "text")
      .map((b: unknown) => (b as { text: string }).text)
      .join("\n");
  }
  return data?.choices?.[0]?.message?.content ?? "";
}

// ---------- Server ----------

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  // --- Core: SQLite-Store + Migration + Embedding-Queue ---
  const store = new KeptaStore();
  const migration = migrateFromLegacyJson(store);
  if (!migration.skipped) {
    console.log(`Migration: ${migration.migrated} Knoten aus memories.json übernommen (Backup: ${migration.backupPath ?? "keines"})`);
  }
  const embeddingQueue = new EmbeddingQueue(store);
  embeddingQueue.start();

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
  const allApiMemories = (): MemoryRecord[] => store.listMemories({ limit: 1000 }).map(toApi);

  // --- DB-Change-Watcher: fremde Prozesse (MCP stdio, Claude Desktop, ZCode) ---
  // schreiben direkt in die SQLite-DB ohne den Activity-Hub zu kennen. Die App
  // pollt deshalb count+max(updated_at) und facht den SSE-Stream selbst an.
  let lastDbFingerprint = "";
  const dbWatcher = setInterval(() => {
    try {
      const row = store.db.prepare("SELECT COUNT(*) c, COALESCE(MAX(updated_at),0) m FROM memories").get() as { c: number; m: number };
      const fp = `${row.c}:${row.m}`;
      if (lastDbFingerprint && fp !== lastDbFingerprint) {
        publishActivity({ type: row.c > parseInt(lastDbFingerprint) ? "save" : "update", source: "agent", title: "Gehirn wurde von außen aktualisiert" });
      }
      lastDbFingerprint = fp;
    } catch { /* DB kurz gesperrt — nächster Tick */ }
  }, 4000);
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
  // Limit payload — 1mb default, 50mb war viel zu groß (DoS)
  app.use(express.json({ limit: "1mb" }));
  // Für /api/memories/import und /api/memory mit größeren Batches separat höheres Limit via Route-Middleware
  app.use(express.urlencoded({ limit: "1mb", extended: false }));

  // Rate Limiting — schützt vor Brute-Force / DoS
  const globalLimiter = rateLimit({ windowMs: 60_000, max: 180, standardHeaders: true, legacyHeaders: false, message: { error: "Zu viele Anfragen — bitte kurz warten." } });
  const chatLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: "Chat Rate-Limit: max 20/min" } });
  const clipLimiter = rateLimit({ windowMs: 60_000, max: 12, standardHeaders: true, legacyHeaders: false, message: { error: "Clip Rate-Limit: max 12/min" } });
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

  // --- Health ---
  const activeCount = () => store.countMemories().active;
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      status: "ok",
      name: "kepta",
      version: "2.0.0",
      uptime: process.uptime(),
      dbPath: store.dbPath,
      count: activeCount(),
      embeddings: store.embeddingStats(),
      mcp: { protocol: "2026-07-28", tools: MCP_TOOLS.length, http: "/mcp" },
      time: new Date().toISOString(),
    });
  });

  // --- Adaptives Profil (je Nutzer individuell) ---
  const PROFILE_FILE = path.join(DATA_DIR, "profile.json");
  app.get("/api/profile", (_req, res) => {
    try {
      const raw = fs.readFileSync(PROFILE_FILE, "utf-8");
      res.json(JSON.parse(raw));
    } catch {
      res.json(null);
    }
  });
  app.post("/api/profile", (req, res) => {
    try {
      // Hardened: size limit + sanitize
      const body = req.body as Record<string,unknown>;
      if (body && JSON.stringify(body).length > 10000) return res.status(413).json({ error: "Profil zu groß (max 10k)" });
      const safe: Record<string,string> = {};
      for (const [k,v] of Object.entries(body || {})) {
        if (typeof v === "string") safe[k] = sanitizeText(v, 2000);
        else if (Array.isArray(v)) safe[k] = sanitizeTags(v).join(",") as unknown as string;
        else if (typeof v === "boolean") (safe as Record<string,unknown>)[k] = v;
      }
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(PROFILE_FILE, JSON.stringify(safe, null, 2), "utf-8");
      res.json({ ok: true });
    } catch (e:any) {
      res.status(500).json({ error: "Profil konnte nicht gespeichert werden" });
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
        const chunkContent = sanitizeText(chunks[i], 50000)+`\n\n— Quelle: Inbox ${path.basename(resolved)} ${new Date().toLocaleString('de-DE')}`;
        const isDup = existing.some(m=> m.title===title && Math.abs(m.content.length-chunkContent.length)<20);
        if (isDup) continue;
        const created = store.createMemory({ title: sanitizeTitle(title) || base.slice(0,80), content: chunkContent, tags:['auto-import','inbox', ext.replace('.','')||'file'] });
        indexMemory(store, created.id);
        existing.unshift(toApi(created));
      }
      // nach Import Datei nach inbox/archiv verschieben
      try {
        const doneDir = path.join(INBOX_DIR, 'archiv');
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

  app.get('/api/inbox/status', (_req,res)=>{
    let files: string[] = [];
    try { files = fs.readdirSync(INBOX_DIR).filter(f=> !f.startsWith('.') && f!=='archiv'); } catch {}
    let archiv = 0;
    try { archiv = fs.readdirSync(path.join(INBOX_DIR,'archiv')).length; } catch {}
    res.json({ inboxDir: INBOX_DIR, files, archivCount: archiv, watching: !!inboxWatcher, lastScan: inboxLastScan });
  });
  app.post('/api/inbox/scan', writeLimiter, async (_req,res)=>{
    inboxLastScan = Date.now();
    let files: string[] = [];
    try { files = fs.readdirSync(INBOX_DIR).filter(f=> !f.startsWith('.') && f!=='archiv').map(f=> path.join(INBOX_DIR,f)); } catch {}
    let imported = 0;
    for (const f of files) { const before = activeCount(); await autoImportFile(f); const after = activeCount(); if (after>before) imported += (after-before); }
    res.json({ scanned: files.length, imported, inboxDir: INBOX_DIR });
  });

  // --- Speicher-API ---

  app.get("/api/memories", (req, res) => {
    const memories = req.query.trash === "1" ? store.listMemories({ limit: 1000, trash: true }).map(toApi) : allApiMemories();
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
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 20;
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

  function handleCreateOrUpdateMemory(req: express.Request, res: express.Response) {
    const body = req.body as Partial<MemoryRecord> & { tags?: unknown; title?: unknown; content?: unknown };
    // Hardened: Validierung + Sanitization + Limits
    if (body && JSON.stringify(body).length > 60000) return res.status(413).json({ error: "Payload zu groß (max 60k)" });
    if (activeCount() > 5000 && !body.id) return res.status(429).json({ error: "Limit erreicht: max 5000 Knoten — bitte alte löschen" });

    const title = sanitizeTitle(body.title);
    const content = sanitizeText(body.content, 50000);

    if (body.id) {
      if (typeof body.id !== "string" || body.id.length > 120 || !/^[\w\-.:]+$/.test(body.id)) return res.status(400).json({ error: "Ungültige ID" });
      const patch: Record<string, unknown> = {};
      if (body.title !== undefined) patch.title = title;
      if (body.content !== undefined) patch.content = content;
      if (body.tags !== undefined) patch.tags = sanitizeTags(body.tags);
      if (body.type !== undefined && ["semantic", "episodic", "procedural"].includes(String(body.type))) patch.type = body.type;
      if (typeof body.confidence === "number") patch.confidence = Math.min(1, Math.max(0, body.confidence));
      if (body.validFrom !== undefined) patch.validFrom = body.validFrom === null ? null : Number(body.validFrom) || null;
      if (body.validTo !== undefined) patch.validTo = body.validTo === null ? null : Number(body.validTo) || null;
      const updated = store.updateMemory(body.id, patch);
      if (!updated) return res.status(404).json({ error: "Knoten nicht gefunden" });
      if (body.content !== undefined) indexMemory(store, updated.id);
      publishActivity({ type: "update", source: "app", title: updated.title });
      return res.json({ memory: toApi(updated) });
    }

    if (!title && !content) return res.status(400).json({ error: "Titel oder Inhalt erforderlich" });
    const created = store.createMemory({
      title: title || "Ohne Titel",
      content,
      tags: sanitizeTags(body.tags),
      type: ["semantic", "episodic", "procedural"].includes(String(body.type)) ? (body.type as never) : undefined,
      confidence: typeof body.confidence === "number" ? Math.min(1, Math.max(0, body.confidence)) : undefined,
      validFrom: body.validFrom === null || body.validFrom === undefined ? undefined : Number(body.validFrom) || undefined,
      validTo: body.validTo === null || body.validTo === undefined ? undefined : Number(body.validTo) || undefined,
    });
    indexMemory(store, created.id);
    publishActivity({ type: "save", source: "app", title: created.title });
    return res.json({ memory: toApi(created) });
  }

  app.post("/api/memories", writeLimiter, handleCreateOrUpdateMemory);
  // Alias für MCP / einfache Clients
  app.post("/api/memory", writeLimiter, handleCreateOrUpdateMemory);

  app.delete("/api/memories/:id", writeLimiter, (req, res) => {
    const id = String(req.params.id || "");
    if (!id || id.length > 120 || !/^[\w\-.:]+$/.test(id)) return res.status(400).json({ error: "Ungültige ID" });
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

  // Wiederherstellen aus dem Papierkorb
  app.post("/api/memories/:id/restore", writeLimiter, (req, res) => {
    const id = String(req.params.id || "");
    if (!id || id.length > 120 || !/^[\w\-.:]+$/.test(id)) return res.status(400).json({ error: "Ungültige ID" });
    const restored = store.restoreMemory(id);
    if (!restored) return res.status(404).json({ error: "Nicht im Papierkorb gefunden" });
    res.json({ ok: true, memory: toApi(store.getMemory(id)!) });
  });

  app.post("/api/memories/import", writeLimiter, express.json({ limit: "2mb" }), (req, res) => {
    const { memories: incoming, mode } = req.body as { memories?: Partial<MemoryRecord>[]; mode?: "merge" | "replace" };
    if (!Array.isArray(incoming)) {
      return res.status(400).json({ error: "Keine gültige Backup-Datei (memories-Array erwartet)" });
    }
    if (incoming.length > 5000) return res.status(413).json({ error: "Zu viele Knoten (max 5000)" });

    const cleaned = incoming
      .filter(m => m && typeof m === "object")
      .slice(0, 5000)
      .map((m, i) => ({
        id: (typeof m.id === "string" && /^[\w\-.:]+$/.test(m.id)) ? m.id.slice(0,120) : `import-${Date.now()}-${i}`,
        title: sanitizeTitle(m.title) || "Ohne Titel",
        content: sanitizeText(m.content, 50000) || "",
        tags: sanitizeTags(m.tags),
        createdAt: typeof m.createdAt === "number" && m.createdAt > 0 ? m.createdAt : Date.now(),
        updatedAt: typeof m.updatedAt === "number" && m.updatedAt > 0 ? m.updatedAt : Date.now(),
      })).filter(m=> m.content.length>0);

    if (mode === "replace") {
      // Endgültig leeren (Papierkorb inklusive), dann Import
      for (const m of store.listMemories({ limit: 1000, trash: true })) store.purgeMemory(m.id);
      for (const m of store.listMemories({ limit: 1000 })) store.purgeMemory(m.id);
      for (const m of cleaned) {
        const created = store.createMemory(m);
        indexMemory(store, created.id);
      }
      return res.json({ imported: cleaned.length, total: activeCount() });
    }

    let imported = 0;
    for (const m of cleaned) {
      const current = store.getMemory(m.id);
      if (!current || m.updatedAt > current.updatedAt) {
        store.upsertMemory(m);
        indexMemory(store, m.id);
        imported++;
      }
    }
    res.json({ imported, total: activeCount() });
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
  app.post("/api/import/markdown", writeLimiter, express.json({ limit: "10mb" }), (req, res) => {
    const { files, scope } = req.body as { files?: { name?: string; content?: string }[]; scope?: string };
    if (!Array.isArray(files) || files.length === 0 || files.length > 5000) {
      return res.status(400).json({ error: "files-Array (1..5000) erwartet" });
    }
    const mdFiles = files
      .filter((f) => f && typeof f.content === "string")
      .map((f) => ({ name: typeof f.name === "string" ? f.name.slice(0, 200) : "notiz.md", content: f.content as string }));
    const summary = importObsidianVault(store, mdFiles, { scope: typeof scope === "string" && scope ? scope : undefined });
    res.json(summary);
  });

  // Export: schreibt alle aktiven Memories als .md in ~/.kepta/export/<zeitstempel>/
  app.post("/api/export/markdown", writeLimiter, (_req, res) => {
    const memories = store.listMemories({ limit: 1000 });
    if (memories.length === 0) return res.status(404).json({ error: "Keine Memories zu exportieren" });
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
      res.status(500).json({ error: e instanceof Error ? e.message : "Export fehlgeschlagen" });
    }
  });

  // --- URL-Clipper: holt URL und extrahiert Titel + reinen Text ---
  app.post("/api/clip", clipLimiter, async (req, res) => {
    const { url } = req.body as { url?: string };
    if (!url || typeof url !== "string" || url.length > 2048) {
      return res.status(400).json({ error: "URL fehlt oder zu lang" });
    }
    const safe = isSafeUrl(url);
    if (!safe.ok) return res.status(400).json({ error: safe.reason });
    let parsed = safe.url!;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const r = await fetch(parsed.toString(), {
        headers: {
          "User-Agent": "KEPTA-Clipper/1.0 (+https://kepta.local)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!r.ok) return res.status(502).json({ error: `Fetch fehlgeschlagen (${r.status})` });
      const contentType = r.headers.get("content-type") || "";
      if (contentType && !/(text\/html|application\/xhtml|text\/plain|application\/xml)/i.test(contentType)) {
        // Erlaube trotzdem, aber limitiert — viele Seiten liefern falschen CT
      }
      const rawHtml = await r.text();
      if (rawHtml.length > 600000) return res.status(413).json({ error: "Seite zu groß (max 600k)" });
      const html = rawHtml;

      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const rawTitle = titleMatch ? titleMatch[1].trim() : parsed.hostname;

      let text = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<head[\s\S]*?<\/head>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<\/(p|div|h[1-6]|li|tr|br|section|article|header|footer)[^>]*>/gi, "\n")
        .replace(/<[^>]+>/g, " ");

      const entities: Record<string, string> = {
        "&amp;": "&",
        "&lt;": "<",
        "&gt;": ">",
        "&quot;": '"',
        "&#39;": "'",
        "&apos;": "'",
        "&nbsp;": " ",
        "&copy;": "©",
        "&reg;": "®",
        "&hellip;": "…",
        "&mdash;": "—",
        "&ndash;": "–",
      };
      text = text.replace(/&[a-zA-Z0-9#]+;/g, (m) => {
        if (entities[m]) return entities[m];
        const num = m.match(/^&#(\d+);$/);
        if (num) return String.fromCharCode(parseInt(num[1], 10));
        const hex = m.match(/^&#x([0-9a-fA-F]+);$/);
        if (hex) return String.fromCharCode(parseInt(hex[1], 16));
        return m;
      });

      text = text
        .replace(/\r/g, "")
        .split("\n")
        .map((l: string) => l.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join("\n\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, 50000);

      const title = sanitizeTitle(rawTitle.replace(/\s+/g, " ").replace(/&[a-zA-Z0-9#]+;/g, (m) => entities[m] || m).trim().slice(0, 300)) || sanitizeTitle(parsed.hostname).slice(0,80) || "Import";
      if (!text) return res.status(422).json({ error: "Kein Text extrahierbar" });
      const safeTitle = sanitizeTitle(title);
      const safeText = sanitizeText(text, 50000);
      res.json({ title: safeTitle, content: safeText, url: parsed.toString() });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("abort")) return res.status(504).json({ error: "Timeout beim Laden der URL" });
      res.status(500).json({ error: msg || "Clip fehlgeschlagen" });
    }
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
      return res.status(400).json({ error: "Kein Input für Embedding angegeben" });
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
          throw new Error(errText || `Ollama Fehler ${rr.status}`);
        }
        const jd: any = await rr.json();
        if (Array.isArray(jd.embedding)) embeddings.push(jd.embedding);
        else throw new Error("Ungültige Embedding-Antwort");
      }
      return res.json({ embeddings, model: modelName });
    } catch (e: any) {
      // Ollama nicht erreichbar -> dem Frontend signalisieren, damit es auf TF-IDF zurückfällt
      return res.status(502).json({ error: e.message || "Ollama nicht erreichbar", embeddings: null });
    }
  });

  // POST /api/search  -> Retrieval-Engine (BM25 + Vektoren + Graph → RRF), ein Pfad für alles
  app.post("/api/search", chatLimiter, async (req, res) => {
    const { query, topK = 5, tags, type, scope } = req.body as {
      query?: string;
      topK?: number;
      tags?: string[];
      type?: string;
      scope?: string;
    };
    const limit = Math.min(Math.max(Number(topK) || 5, 1), 100);
    const result = await engineSearch(store, {
      query: sanitizeText(query ?? "", 500),
      limit,
      tags: Array.isArray(tags) && tags.length > 0 ? sanitizeTags(tags) : undefined,
      type: type === "semantic" || type === "episodic" || type === "procedural" ? type : undefined,
      scope: typeof scope === "string" && scope ? scope : undefined,
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
      return res.status(400).json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Ungültiger JSON-RPC-Request" } });
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
    res.status(405).json({ error: "Streamable HTTP: nur POST (stateless, keine SSE-Sitzung)" });
  });

  // Legacy-kompatible Hilfsrouten (plain JSON statt JSON-RPC) — dünne Wrapper über die Engine
  app.post("/api/mcp/search", writeLimiter, async (req, res) => {
    const { query, limit = 10, tags } = req.body as { query?: string; limit?: number; tags?: string[] };
    if (!query || !query.trim()) return res.status(400).json({ error: "query erforderlich", tools: MCP_TOOLS });
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
  app.post("/api/chat/stream", chatLimiter, async (req, res) => {
    const body = req.body as ChatRequest;
    // Hardened: Validierung
    if (!body || typeof body !== "object") { try{ res.writeHead(400); res.end(JSON.stringify({error:"Ungültiger Body"})); }catch{} return; }
    if (body.messages && (!Array.isArray(body.messages) || body.messages.length > 40)) { try{ res.writeHead(400); res.end(JSON.stringify({error:"Zu viele Messages (max 40)"})); }catch{} return; }
    if (body.system && typeof body.system === "string" && body.system.length > 60000) { try{ res.writeHead(413); res.end(JSON.stringify({error:"System-Prompt zu groß"})); }catch{} return; }
    if (body.model && typeof body.model === "string" && body.model.length > 200) { try{ res.writeHead(400); res.end(JSON.stringify({error:"Modell-Name zu lang"})); }catch{} return; }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    try {
      const upstream = await fetch(upstreamUrl(body), {
        method: "POST",
        headers: buildUpstreamHeaders(body),
        body: JSON.stringify(buildUpstreamBody(body, true)),
      });

      if (!upstream.ok || !upstream.body) {
        const errText = await upstream.text();
        let message = `API-Fehler (${upstream.status})`;
        try { message = JSON.parse(errText)?.error?.message || message; } catch { /* ignore */ }
        res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
        res.write("data: [DONE]\n\n");
        return res.end();
      }

      for await (const delta of streamUpstreamDeltas(upstream)) {
        res.write(`data: ${JSON.stringify({ text: delta })}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Verbindungsfehler";
      res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    }
  });

  // Nicht-Streaming-Fallback
  app.post("/api/chat", chatLimiter, async (req, res) => {
    const body = req.body as ChatRequest;
    if (!body || typeof body !== "object") return res.status(400).json({ error: "Ungültiger Body" });
    if (body.messages && (!Array.isArray(body.messages) || body.messages.length > 40)) return res.status(400).json({ error: "Zu viele Messages (max 40)" });
    if (body.system && typeof body.system === "string" && body.system.length > 60000) return res.status(413).json({ error: "System-Prompt zu groß" });
    if (body.model && typeof body.model === "string" && body.model.length > 200) return res.status(400).json({ error: "Modell-Name zu lang" });
    try {
      const text = await readFullAnswer(body);
      res.json({ text });
    } catch (error: unknown) {
      console.error("Chat API Error:", error);
      const msg = error instanceof Error ? error.message : "Interner Serverfehler";
      res.status(500).json({ error: msg });
    }
  });

  // Verfügbare Modelle eines Anbieters abrufen
  app.post("/api/models", chatLimiter, async (req, res) => {
    const { protocol, baseUrl, apiKey } = req.body as { protocol: string; baseUrl: string; apiKey: string };
    try {
      const base = trimSlash(baseUrl || "https://api.openai.com/v1");
      const headers: Record<string, string> = {};
      if (apiKey && protocol !== "anthropic") headers["Authorization"] = `Bearer ${apiKey}`;
      if (protocol === "anthropic") {
        headers["x-api-key"] = apiKey || "";
        headers["anthropic-version"] = "2023-06-01";
      }
      const url = protocol === "anthropic" ? `${base}/v1/models` : `${base}/models`;
      const r = await fetch(url, { headers });
      const data = await r.json() as { error?: { message?: string }; data?: unknown[]; models?: unknown[] };
      if (!r.ok) throw new Error(data?.error?.message || `API-Fehler (${r.status})`);
      let models = ((data?.data || data?.models || []) as unknown[])
        .map((m: unknown) => (m as { id?: string; name?: string }).id || (m as { name?: string }).name)
        .filter(Boolean) as string[];

      // Ollama: Modelle zusätzlich über die native API laden
      if (base.includes(":11434")) {
        try {
          const tags = await fetch("http://localhost:11434/api/tags");
          if (tags.ok) {
            const tagData = await tags.json() as { models?: { name?: string }[] };
            const ollamaModels = (tagData?.models || []).map((m) => m.name).filter(Boolean) as string[];
            models = Array.from(new Set([...models, ...ollamaModels]));
          }
        } catch { /* Ollama liefert /v1/models evtl. schon */ }
      }

      res.json({ models: models.sort() });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Interner Serverfehler";
      res.status(500).json({ error: msg });
    }
  });

  // Vite middleware for development (only run when started with tsx)
  if (process.env.NODE_ENV !== "production" && !process.env.ELECTRON_RUN_AS_NODE) {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (_e) {
      console.log("Vite skipped in prod");
    }
  } else {
    const distPath = __dirname;
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      // API-Routen nicht überschreiben
      if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found" });
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`Speicher: ${store.dbPath} (SQLite) | Embeddings: ${JSON.stringify(store.embeddingStats())}`);
    console.log(`API: http://localhost:${PORT}/api/health | /api/search | MCP: POST /mcp (2026-07-28, ${MCP_TOOLS.length} Tools)`);
    if (process.send) process.send('server-ready');
  });
}

startServer();