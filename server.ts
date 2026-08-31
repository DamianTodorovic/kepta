import express from "express";
import compression from "compression";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import os from "os";

interface ChatRequest {
  providerId?: string;
  protocol?: "openai" | "anthropic";
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
}

interface MemoryRecord {
  id: string;
  userId: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

// ---------- Lokaler Datei-Speicher (kein Limit, keine Cloud) ----------

const DATA_DIR = process.env.KEPTA_DATA_DIR || process.env.KI_GEHIRN_DATA_DIR || (()=>{ try{ const kepta=path.join(os.homedir(), ".kepta"); if (fs.existsSync(kepta)) return kepta; }catch{} return path.join(os.homedir(), ".ki-gehirn"); })();
const DATA_FILE = path.join(DATA_DIR, "memories.json");

// ---------- In-Memory Cache mit mtime-Check ----------
let memoryCache: MemoryRecord[] | null = null;
let memoryCacheMtimeMs = 0;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPersistData: MemoryRecord[] | null = null;

function loadMemories(): MemoryRecord[] {
  // Debounce-Pending hat Vorrang: noch nicht geflusht, aber Cache ist aktuell
  if (pendingPersistData && memoryCache) {
    return memoryCache;
  }
  try {
    const stat = fs.statSync(DATA_FILE);
    const mtime = stat.mtimeMs;
    if (memoryCache !== null && mtime === memoryCacheMtimeMs) {
      return memoryCache;
    }
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const data = JSON.parse(raw);
    const memories: MemoryRecord[] = Array.isArray(data) ? data : [];
    memoryCache = memories;
    memoryCacheMtimeMs = mtime;
    return memories;
  } catch {
    // Datei fehlt oder nicht lesbar -> leeres Array
    if (memoryCache !== null) return memoryCache;
    try {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      const data = JSON.parse(raw);
      const memories: MemoryRecord[] = Array.isArray(data) ? data : [];
      memoryCache = memories;
      try {
        const stat = fs.statSync(DATA_FILE);
        memoryCacheMtimeMs = stat.mtimeMs;
      } catch {}
      return memories;
    } catch {
      return [];
    }
  }
}

function flushPersist() {
  if (!pendingPersistData) return;
  const dataToWrite = pendingPersistData;
  pendingPersistData = null;
  persistTimer = null;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + ".tmp";
  // atomic write: tmp + rename
  fs.writeFileSync(tmp, JSON.stringify(dataToWrite, null, 2), "utf-8");
  fs.renameSync(tmp, DATA_FILE);
  try {
    const stat = fs.statSync(DATA_FILE);
    memoryCacheMtimeMs = stat.mtimeMs;
  } catch {}
  memoryCache = [...dataToWrite];
}

function persistMemories(memories: MemoryRecord[]) {
  // sofort Cache aktualisieren
  memoryCache = [...memories];
  pendingPersistData = [...memories];
  if (persistTimer) clearTimeout(persistTimer);
  // debounce 120ms + atomic write
  persistTimer = setTimeout(flushPersist, 120);
}

// für Tests/Graceful shutdown sofort flushen
export function __flushMemoriesSync() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (pendingPersistData) flushPersist();
}

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

function searchMemories(query: string, limit = 20, tagsFilter: string[] = []): MemoryRecord[] {
  const q = query.trim().toLowerCase();
  let results = loadMemories();
  if (tagsFilter.length > 0) {
    results = results.filter(m => tagsFilter.every(t => m.tags.includes(t)));
  }
  if (!q) return results.slice(0, limit);
  const scored = results
    .map(m => {
      const hay = `${m.title} ${m.content} ${m.tags.join(" ")}`.toLowerCase();
      let score = 0;
      if (m.title.toLowerCase().includes(q)) score += 10;
      if (hay.includes(q)) score += 5;
      // Teilwort-Match
      const words = q.split(/\s+/).filter(Boolean);
      for (const w of words) if (hay.includes(w)) score += 1;
      // Tag-Boost
      for (const t of m.tags) if (t.toLowerCase().includes(q)) score += 3;
      return { m, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || b.m.updatedAt - a.m.updatedAt)
    .map(x => x.m);
  return scored.slice(0, limit);
}

// ---------- MCP Tools Definition (für /api/mcp/tools + stdio) ----------

const MCP_TOOLS = [
  {
    name: "memory_search",
    description: "Durchsucht KEPTA (Titel, Inhalt, Tags). Gibt passende Erinnerungen/Knoten zurück.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Suchbegriff (Volltext, case-insensitive)" },
        limit: { type: "number", description: "Max. Ergebnisse (default 10, max 50)", default: 10 },
        tags: { type: "array", items: { type: "string" }, description: "Optionaler Tag-Filter (AND)" },
      },
      required: ["query"],
    },
  },
  {
    name: "memory_save",
    description: "Speichert einen neuen Knoten in KEPTA oder aktualisiert einen bestehenden (wenn id angegeben).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Optionale ID zum Aktualisieren" },
        title: { type: "string", description: "Titel des Knotens" },
        content: { type: "string", description: "Inhalt / Notiz" },
        tags: { type: "array", items: { type: "string" }, description: "Tags" },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "memory_list",
    description: "Listet alle Knoten (paginiert). Nützlich für Überblick.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max. Ergebnisse (default 20)", default: 20 },
        offset: { type: "number", description: "Offset", default: 0 },
      },
    },
  },
] as const;

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

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      status: "ok",
      name: "kepta",
      version: "0.0.0",
      uptime: process.uptime(),
      dataFile: DATA_FILE,
      count: loadMemories().length,
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
      const existing = loadMemories();
      for (let i=0;i<chunks.length;i++){
        const title = chunks.length===1 ? base : `${base} — Teil ${i+1}/${chunks.length}`;
        const isDup = existing.some(m=> m.title===title && Math.abs(m.content.length-chunks[i].length)<20);
        if (isDup) continue;
        const rec: MemoryRecord = { id:`local-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, userId:'local', title: sanitizeTitle(title) || base.slice(0,80), content: sanitizeText(chunks[i], 50000)+`\n\n— Quelle: Inbox ${path.basename(resolved)} ${new Date().toLocaleString('de-DE')}`, tags:['auto-import','inbox', ext.replace('.','')||'file'], createdAt:Date.now(), updatedAt:Date.now() };
        existing.unshift(rec);
      }
      persistMemories(existing);
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
    for (const f of files) { const before = loadMemories().length; await autoImportFile(f); const after = loadMemories().length; if (after>before) imported += (after-before); }
    res.json({ scanned: files.length, imported, inboxDir: INBOX_DIR });
  });

  // --- Speicher-API ---

  app.get("/api/memories", (req, res) => {
    const memories = loadMemories();
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

  // Dokumentierte Suche: GET /api/memories/search?q=...&limit=...&tags=tag1,tag2
  app.get("/api/memories/search", (req, res) => {
    const rawQ = typeof req.query.q === "string" ? req.query.q : typeof req.query.query === "string" ? req.query.query : "";
    const q = sanitizeText(rawQ, 200);
    const limitRaw = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 20;
    const tagsRaw = typeof req.query.tags === "string" ? req.query.tags : "";
    const tags = tagsRaw ? sanitizeTags(tagsRaw.split(",").map(s => s.trim()).filter(Boolean)) : [];
    const memories = searchMemories(q, limit, tags);
    res.json({ query: q, count: memories.length, total: loadMemories().length, memories });
  });

  function handleCreateOrUpdateMemory(req: express.Request, res: express.Response) {
    const body = req.body as Partial<MemoryRecord> & { tags?: unknown; title?: unknown; content?: unknown };
    // Hardened: Validierung + Sanitization + Limits
    if (body && JSON.stringify(body).length > 60000) return res.status(413).json({ error: "Payload zu groß (max 60k)" });
    const memories = loadMemories();
    if (memories.length > 5000 && !body.id) return res.status(429).json({ error: "Limit erreicht: max 5000 Knoten — bitte alte löschen" });
    const now = Date.now();

    if (body.id) {
      if (typeof body.id !== "string" || body.id.length > 120 || !/^[\w\-.:]+$/.test(body.id)) return res.status(400).json({ error: "Ungültige ID" });
      const idx = memories.findIndex(m => m.id === body.id);
      if (idx < 0) return res.status(404).json({ error: "Knoten nicht gefunden" });
      const patch: Partial<MemoryRecord> = {};
      if (body.title !== undefined) patch.title = sanitizeTitle(body.title);
      if (body.content !== undefined) patch.content = sanitizeText(body.content, 50000);
      if (body.tags !== undefined) patch.tags = sanitizeTags(body.tags);
      memories[idx] = { ...memories[idx], ...patch, updatedAt: now } as MemoryRecord;
      persistMemories(memories);
      return res.json({ memory: memories[idx] });
    }

    const created: MemoryRecord = {
      id: `local-${now}-${Math.random().toString(36).slice(2, 8)}`,
      userId: "local",
      title: sanitizeTitle(body.title) || "Ohne Titel",
      content: sanitizeText(body.content, 50000) || "",
      tags: sanitizeTags(body.tags),
      createdAt: now,
      updatedAt: now,
    };
    if (!created.title) created.title = "Ohne Titel";
    if (created.content.length < 1) return res.status(400).json({ error: "Inhalt darf nicht leer sein" });
    persistMemories([created, ...memories]);
    return res.json({ memory: created });
  }

  app.post("/api/memories", writeLimiter, handleCreateOrUpdateMemory);
  // Alias für MCP / einfache Clients
  app.post("/api/memory", writeLimiter, handleCreateOrUpdateMemory);

  app.delete("/api/memories/:id", writeLimiter, (req, res) => {
    const id = String(req.params.id || "");
    if (!id || id.length > 120 || !/^[\w\-.:]+$/.test(id)) return res.status(400).json({ error: "Ungültige ID" });
    const memories = loadMemories();
    persistMemories(memories.filter(m => String(m.id) !== String(id)));
    res.json({ ok: true });
  });

  app.post("/api/memories/import", writeLimiter, express.json({ limit: "2mb" }), (req, res) => {
    const { memories: incoming, mode } = req.body as { memories?: Partial<MemoryRecord>[]; mode?: "merge" | "replace" };
    if (!Array.isArray(incoming)) {
      return res.status(400).json({ error: "Keine gültige Backup-Datei (memories-Array erwartet)" });
    }
    if (incoming.length > 5000) return res.status(413).json({ error: "Zu viele Knoten (max 5000)" });

    const cleaned: MemoryRecord[] = incoming
      .filter(m => m && typeof m === "object")
      .slice(0, 5000)
      .map((m, i) => ({
        id: (typeof m.id === "string" && /^[\w\-.:]+$/.test(m.id)) ? m.id.slice(0,120) : `import-${Date.now()}-${i}`,
        userId: "local",
        title: sanitizeTitle(m.title) || "Ohne Titel",
        content: sanitizeText(m.content, 50000) || "",
        tags: sanitizeTags(m.tags),
        createdAt: typeof m.createdAt === "number" && m.createdAt > 0 ? m.createdAt : Date.now(),
        updatedAt: typeof m.updatedAt === "number" && m.updatedAt > 0 ? m.updatedAt : Date.now(),
      })).filter(m=> m.content.length>0);

    if (mode === "replace") {
      persistMemories(cleaned);
      return res.json({ imported: cleaned.length, total: cleaned.length });
    }

    const existing = loadMemories();
    const byId = new Map(existing.map(m => [m.id, m]));
    let imported = 0;
    for (const m of cleaned) {
      const current = byId.get(m.id);
      if (!current) {
        byId.set(m.id, m);
        imported++;
      } else if (m.updatedAt > current.updatedAt) {
        byId.set(m.id, m);
        imported++;
      }
    }
    const merged = Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt);
    persistMemories(merged);
    res.json({ imported, total: merged.length });
  });

  app.get("/api/storage-info", (_req, res) => {
    res.json({ dataFile: DATA_FILE, count: loadMemories().length });
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

  // POST /api/search  -> Hybrid-Suche serverseitig (TF-IDF + Cosine + BM25)
  app.post("/api/search", chatLimiter, (req, res) => {
    const { query, topK = 5, tags, ngram = 1, cosineWeight = 0.5 } = req.body as {
      query?: string;
      topK?: number;
      tags?: string[];
      ngram?: number;
      cosineWeight?: number;
    };
    let memories = loadMemories();
    // Tag-Filter optional
    if (Array.isArray(tags) && tags.length > 0) {
      memories = memories.filter(m => tags.every(t => (m.tags || []).includes(t)));
    }
    if (!query || !query.trim()) {
      const sorted = [...memories].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, Math.max(0, topK));
      return res.json({
        results: sorted.map(m => ({ memory: m, score: 1, cosineScore: 1, bm25Score: 1, rawBm25: 0, matchedTerms: [] })),
        total: memories.length,
        query: query || "",
      });
    }

    // --- Minimaler In-Memory Hybrid (Spiegel von src/lib/semantic.ts, ohne Import) ---
    const STOP_DE = new Set(["der","die","das","den","dem","des","ein","eine","einen","einem","einer","eines","und","oder","aber","wenn","dann","also","auch","noch","schon","nur","sehr","wie","was","wer","wo","wann","warum","wieso","weshalb","welche","welcher","welches","dass","ist","sind","war","waren","sein","hat","haben","hatte","hatten","wird","werden","wurde","wurden","kann","könnte","soll","sollen","muss","müssen","will","wollen","möchte","möchten","bei","mit","von","zu","zum","zur","im","am","an","auf","für","über","unter","vor","nach","zwischen","durch","gegen","ohne","um","aus","in","als","so","diese","dieser","dieses","diesen","diesem","jeder","jede","jedes","viele","vielen","mehr","weniger","hier","dort","da","dabei","damit","dazu","darauf","darüber","darunter","nicht","kein","keine","keinen","keinem","keiner","nichts","alles","etwas","man","es","er","sie","wir","ihr","mein","dein","sein","unser","euer"]);
    const STOP_EN = new Set(["the","a","an","and","or","but","if","then","else","so","as","at","by","for","with","about","against","between","into","through","during","before","after","above","below","to","from","up","down","in","out","on","off","over","under","again","further","once","here","there","when","where","why","how","all","any","both","each","few","more","most","other","some","such","no","nor","not","only","own","same","than","too","very","can","will","just","don","should","now","is","are","was","were","be","been","being","has","have","had","do","does","did","am","isnt","arent","wasnt","hasnt","havent","hadnt","dont","doesnt","didnt","wont","wouldnt","shouldnt","cant","cannot","could","would","should","may","might","must","shall","this","that","these","those","i","me","my","myself","we","our","ours","you","your","yours","he","him","his","she","her","hers","it","its","they","them","their","what","which","who","whom"]);
    const STOP = new Set<string>([...STOP_DE, ...STOP_EN]);
    const tok = (text: string, n: number): string[] => {
      if (!text) return [];
      let t = text.toLowerCase().replace(/[^a-z0-9äöüß]+/g, " ");
      const raw = t.split(/\s+/).filter(Boolean).filter(x => !STOP.has(x) && x.length > 1);
      if (n <= 1) return raw;
      const out = [...raw];
      for (let nn = 2; nn <= n; nn++) for (let i = 0; i <= raw.length - nn; i++) out.push(raw.slice(i, i + nn).join("_"));
      return out;
    };
    const tokMem = (m: MemoryRecord, n: number): string[] => {
      const tt = tok(m.title || "", n);
      const cc = tok(m.content || "", n);
      const tg = (m.tags || []).flatMap(x => tok(x, n));
      return [...tt, ...tt, ...cc, ...tg];
    };
    const qTokens = tok(String(query), Math.max(1, Math.min(3, ngram as number)));
    if (qTokens.length === 0) {
      const sorted = [...memories].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, Math.max(0, topK));
      return res.json({ results: sorted.map(m => ({ memory: m, score: 1, cosineScore: 1, bm25Score: 1, rawBm25: 0, matchedTerms: [] })), total: memories.length, query });
    }
    const docTokensList = memories.map(m => tokMem(m, Math.max(1, Math.min(3, ngram as number))));
    const N = memories.length;
    const avgDL = docTokensList.reduce((s, d) => s + d.length, 0) / Math.max(1, N);
    const df = new Map<string, number>();
    for (const toks of docTokensList) { const uniq = new Set(toks); for (const term of uniq) df.set(term, (df.get(term) || 0) + 1); }
    const idfTfidf = new Map<string, number>();
    const idfBm25 = new Map<string, number>();
    for (const term of new Set([...qTokens, ...df.keys()])) {
      const f = df.get(term) || 0;
      idfTfidf.set(term, Math.log((N + 1) / (f + 1)) + 1);
      idfBm25.set(term, Math.log((N - f + 0.5) / (f + 0.5) + 1));
    }
    const tfMap = (toks: string[]): Map<string, number> => {
      const m = new Map<string, number>();
      for (const t of toks) m.set(t, (m.get(t) || 0) + 1);
      const len = toks.length || 1;
      for (const [k, v] of m) m.set(k, v / len);
      return m;
    };
    const cosine = (a: Map<string, number>, b: Map<string, number>): number => {
      let dot = 0, na = 0, nb = 0;
      const all = new Set<string>([...a.keys(), ...b.keys()]);
      for (const k of all) { const av = a.get(k) || 0, bv = b.get(k) || 0; dot += av * bv; na += av * av; nb += bv * bv; }
      return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
    };
    const qTf = tfMap(qTokens);
    const qVec = new Map<string, number>();
    for (const [term, tf] of qTf) qVec.set(term, tf * (idfTfidf.get(term) || 1));
    const cosines: number[] = [];
    const rawBm25s: number[] = [];
    const matchedList: string[][] = [];
    const k1 = 1.2, b = 0.75;
    docTokensList.forEach((toks, idx) => {
      const tf = tfMap(toks);
      const vec = new Map<string, number>();
      for (const [term, v] of tf) vec.set(term, v * (idfTfidf.get(term) || 1));
      cosines[idx] = cosine(vec, qVec);
      const counts = new Map<string, number>();
      for (const t of toks) counts.set(t, (counts.get(t) || 0) + 1);
      let bm = 0; const matched: string[] = [];
      const docLen = toks.length || 1;
      for (const qt of qTokens) {
        const tfRaw = counts.get(qt) || 0;
        if (tfRaw > 0) matched.push(qt);
        if (tfRaw === 0) continue;
        const idf = idfBm25.get(qt) || 0;
        bm += idf * ((tfRaw * (k1 + 1)) / (tfRaw + k1 * (1 - b + b * (docLen / avgDL))));
      }
      rawBm25s[idx] = bm;
      matchedList[idx] = [...new Set(matched)];
    });
    const minBm = Math.min(...rawBm25s);
    const maxBm = Math.max(...rawBm25s);
    const range = maxBm - minBm;
    const normBm = rawBm25s.map(v => (range > 1e-9 ? (v - minBm) / range : v > 0 ? 1 : 0));
    const cw = Math.max(0, Math.min(1, typeof cosineWeight === "number" ? cosineWeight : 0.5));
    const results = memories.map((m, i) => ({
      memory: m,
      score: cw * (cosines[i] || 0) + (1 - cw) * (normBm[i] || 0),
      cosineScore: cosines[i] || 0,
      bm25Score: normBm[i] || 0,
      rawBm25: rawBm25s[i] || 0,
      matchedTerms: matchedList[i] || [],
    }));
    results.sort((a, b) => b.score - a.score || b.memory.updatedAt - a.memory.updatedAt);
    const hasMatch = results.some(r => r.score > 1e-9);
    const final = hasMatch ? results.filter(r => r.score > 1e-9).slice(0, Math.max(0, topK)) : [];
    // Wenn kein Treffer aber Query vorhanden: leere Liste signalisiert Frontend, dass nichts relevant ist
    // Dashboard entscheidet, ob Fallback auf alle angezeigt wird.
    return res.json({ results: final, total: memories.length, query, hasMatch });
  });

  // --- Lokale HTTP-API: MCP-kompatibel ---

  // Tool-Liste (MCP discovery)
  app.get("/api/mcp/tools", (_req, res) => {
    res.json({ tools: MCP_TOOLS });
  });
  // Alias: /api/tools
  app.get("/api/tools", (_req, res) => {
    res.json({ tools: MCP_TOOLS });
  });

  // Einheitlicher MCP-Handler für JSON-RPC ähnlich + plain JSON
  function parseMcpBody(body: unknown): { query?: string; limit?: number; tags?: string[]; title?: string; content?: string; id?: string; name?: string; args?: Record<string, unknown> } {
    const b = body as Record<string, unknown>;
    if (!b || typeof b !== "object") return {};
    // JSON-RPC: { jsonrpc:"2.0", method:"tools/call", params:{ name, arguments:{...}} }
    if (b.params && typeof b.params === "object") {
      const p = b.params as Record<string, unknown>;
      if (p.arguments && typeof p.arguments === "object") {
        return { name: p.name as string, args: p.arguments as Record<string, unknown>, ...(p.arguments as object) } as never;
      }
      return p as never;
    }
    if (b.arguments && typeof b.arguments === "object") {
      return { name: b.name as string, args: b.arguments as Record<string, unknown>, ...(b.arguments as object) } as never;
    }
    return b as never;
  }

  // POST /api/mcp/search  — kompatibel mit plain {query,limit} und JSON-RPC
  app.post("/api/mcp/search", writeLimiter, (req, res) => {
    const parsed = parseMcpBody(req.body);
    const query = (parsed.query as string) || (req.body as { q?: string })?.q || "";
    const limitRaw = parsed.limit ?? (req.body as { limit?: number })?.limit ?? 10;
    const limit = Math.min(Math.max(parseInt(String(limitRaw), 10) || 10, 1), 50);
    const tags: string[] = Array.isArray(parsed.tags) ? (parsed.tags as string[]) : [];
    if (!query || typeof query !== "string" || !query.trim()) {
      return res.status(400).json({ error: "query erforderlich", tools: MCP_TOOLS });
    }
    const memories = searchMemories(query, limit, tags);
    const isJsonRpc = (req.body as { jsonrpc?: string })?.jsonrpc === "2.0";
    const payload = {
      query,
      count: memories.length,
      memories: memories.map(m => ({ id: m.id, title: m.title, content: m.content, tags: m.tags, updatedAt: m.updatedAt })),
    };
    if (isJsonRpc) {
      return res.json({ jsonrpc: "2.0", id: (req.body as { id?: unknown }).id ?? null, result: { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], ...payload } });
    }
    return res.json(payload);
  });

  // POST /api/mcp/save
  app.post("/api/mcp/save", writeLimiter, (req, res) => {
    const parsed = parseMcpBody(req.body);
    const title = (parsed.title as string) || (req.body as { title?: string })?.title;
    const content = (parsed.content as string) || (req.body as { content?: string })?.content;
    const tags: string[] = Array.isArray(parsed.tags) ? (parsed.tags as string[]) : Array.isArray((req.body as { tags?: unknown }).tags) ? (req.body as { tags: string[] }).tags : [];
    // Memory-ID nur aus Tool-Arguments, nicht aus JSON-RPC id (req.body.id)
    const rawId = (parsed as Record<string, unknown>).id;
    const id = typeof rawId === 'string' && rawId.trim() ? rawId.trim() : undefined;
    if (!title || !content) {
      return res.status(400).json({ error: "title und content erforderlich" });
    }
    const memories = loadMemories();
    const now = Date.now();
    const isJsonRpc = (req.body as { jsonrpc?: string })?.jsonrpc === "2.0";

    if (id) {
      const idx = memories.findIndex(m => m.id === id);
      if (idx >= 0) {
        memories[idx] = { ...memories[idx], title, content, tags: tags || memories[idx].tags, updatedAt: now };
        persistMemories(memories);
        const result = { memory: memories[idx] };
        if (isJsonRpc) return res.json({ jsonrpc: "2.0", id: (req.body as { id?: unknown }).id ?? null, result: { content: [{ type: "text", text: `Gespeichert: ${memories[idx].id}` }], ...result } });
        return res.json(result);
      }
    }

    const created: MemoryRecord = {
      id: id || `local-${now}-${Math.random().toString(36).slice(2, 8)}`,
      userId: "local",
      title,
      content,
      tags: tags || [],
      createdAt: now,
      updatedAt: now,
    };
    persistMemories([created, ...memories]);
    const result = { memory: created };
    if (isJsonRpc) return res.json({ jsonrpc: "2.0", id: (req.body as { id?: unknown }).id ?? null, result: { content: [{ type: "text", text: `Gespeichert: ${created.id}` }], ...result } });
    return res.json(result);
  });

  // Generischer JSON-RPC Endpoint für MCP-Clients: POST /api/mcp
  app.post("/api/mcp", (req, res) => {
    const body = req.body as { jsonrpc?: string; id?: unknown; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
    const method = body.method;
    const id = body.id ?? null;

    if (method === "initialize") {
      return res.json({
        jsonrpc: "2.0", id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "kepta", version: "0.0.0" },
        },
      });
    }
    if (method === "tools/list") {
      return res.json({ jsonrpc: "2.0", id, result: { tools: MCP_TOOLS } });
    }
    if (method === "tools/call") {
      const name = body.params?.name;
      const args = body.params?.arguments || {};
      if (name === "memory_search") {
        const q = String((args as Record<string, unknown>).query || "");
        const lim = Math.min(Math.max(parseInt(String((args as Record<string, unknown>).limit ?? 10), 10) || 10, 1), 50);
        const tTags = Array.isArray((args as Record<string, unknown>).tags) ? (args as { tags: string[] }).tags : [];
        if (!q.trim()) return res.json({ jsonrpc: "2.0", id, error: { code: -32602, message: "query erforderlich" } });
        const memories = searchMemories(q, lim, tTags);
        return res.json({
          jsonrpc: "2.0", id,
          result: { content: [{ type: "text", text: JSON.stringify({ query: q, count: memories.length, memories }, null, 2) }] },
        });
      }
      if (name === "memory_save") {
        const a = args as Record<string, unknown>;
        const title = String(a.title || "");
        const content = String(a.content || "");
        if (!title || !content) return res.json({ jsonrpc: "2.0", id, error: { code: -32602, message: "title und content erforderlich" } });
        const tags = Array.isArray(a.tags) ? (a.tags as string[]) : [];
        const mid = a.id ? String(a.id) : undefined;
        const memories = loadMemories();
        const now = Date.now();
        if (mid) {
          const idx = memories.findIndex(m => m.id === mid);
          if (idx >= 0) {
            memories[idx] = { ...memories[idx], title, content, tags, updatedAt: now };
            persistMemories(memories);
            return res.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `Aktualisiert: ${mid}` }] } });
          }
        }
        const created: MemoryRecord = { id: mid || `local-${now}-${Math.random().toString(36).slice(2, 8)}`, userId: "local", title, content, tags, createdAt: now, updatedAt: now };
        persistMemories([created, ...memories]);
        return res.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `Gespeichert: ${created.id}` }] } });
      }
      if (name === "memory_list") {
        const a = args as Record<string, unknown>;
        const lim = Math.min(Math.max(parseInt(String(a.limit ?? 20), 10) || 20, 1), 50);
        const off = Math.max(parseInt(String(a.offset ?? 0), 10) || 0, 0);
        const all = loadMemories();
        const slice = all.slice(off, off + lim);
        return res.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify({ count: slice.length, total: all.length, memories: slice }, null, 2) }] } });
      }
      return res.json({ jsonrpc: "2.0", id, error: { code: -32601, message: `Unbekanntes Tool: ${name}` } });
    }
    if (method === "notifications/initialized") {
      return res.json({ jsonrpc: "2.0", id, result: {} });
    }
    return res.json({ jsonrpc: "2.0", id, error: { code: -32601, message: `Unbekannte Methode: ${method}` } });
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
    console.log(`Speicher: ${DATA_FILE}`);
    console.log(`API: http://localhost:${PORT}/api/health | /api/memories/search | /api/mcp/tools`);
    if (process.send) process.send('server-ready');
  });
}

startServer();