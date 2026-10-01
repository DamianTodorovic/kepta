// Inbox Auto-Import — KEPTA liest immer mit (File-Watcher).
// PDFs laufen seit 2.13-Refactoring durch dieselbe pdf.js-Extraktion wie der
// Rechner-Scan (server/helfer/text.ts): die frühere Rohbyte-Schabrasche in
// dieser Datei lieferte bei PDFs mit eingebetteten Schriften Glyph-Namen und
// Binärblöcke — derselbe Müll, der 2.10 aus dem Rechner-Scan verbannt wurde.
import path from "path";
import fs from "fs";
import express from "express";
import { indexMemory } from "../../src/core/engine";
import { sanitizeText, sanitizeTitle } from "../../src/core/sanitize";
import { isSafeFilename } from "../helfer/ssrf";
import { textAus } from "../helfer/text";
import { inboxOrdner, archiveDir } from "../helfer/inbox-pfade";
import { toApi, type MemoryRecord } from "../helfer/api-form";
import type { AppKontext } from "../kontext";

const INHALTS_ENDUNGEN = ['.txt', '.md', '.json', '.csv'];

export function mountInbox(app: express.Express, ctx: AppKontext): void {
  const { store } = ctx;
  const INBOX_DIR = inboxOrdner(ctx.datenOrdner);
  try { fs.mkdirSync(INBOX_DIR, { recursive: true }); } catch { /* schon da */ }

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
      if (!INHALTS_ENDUNGEN.includes(ext) && ext !== '.pdf' && stat.size > 500_000) return;
      let content = '';
      if (ext === '.pdf') {
        // Dieselbe Extraktion wie der Rechner-Scan: pdf.js mit CMaps, async,
        // mit ehrlichem Hinweis statt Glyph-Müll, wenn nichts zu holen ist.
        content = (await textAus(resolved)).trim();
      } else {
        content = (await fs.promises.readFile(resolved, 'utf-8')).slice(0, 50000);
        if (ext === '.json') {
          try { const j = JSON.parse(content); content = Array.isArray(j) ? JSON.stringify(j, null, 2).slice(0, 50000) : content; } catch { /* kein JSON — dann eben roh */ }
        }
      }
      if (!content.trim()) return;
      const base = path.basename(resolved, path.extname(resolved));
      // Chunking 2000
      const chunks: string[] = [];
      let start = 0; while (start < content.length) { let end = Math.min(start + 2000, content.length); if (end < content.length) { const slice = content.slice(start, end); const br = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('. ')); if (br > 1100) end = start + br + 1; } chunks.push(content.slice(start, end).trim()); start = end; }
      const existing: MemoryRecord[] = ctx.listAllMemories().map(toApi);
      for (let i = 0; i < chunks.length; i++) {
        const title = chunks.length === 1 ? base : `${base} — Teil ${i + 1}/${chunks.length}`;
        const chunkContent = sanitizeText(chunks[i]!, 50000) + `\n\n— Source: inbox ${path.basename(resolved)} ${new Date().toLocaleString('en-GB')}`;
        const isDup = existing.some(m => m.title === title && Math.abs(m.content.length - chunkContent.length) < 20);
        if (isDup) continue;
        const created = store.createMemory({ title: sanitizeTitle(title) || base.slice(0, 80), content: chunkContent, tags: ['auto-import', 'inbox', ext.replace('.', '') || 'file'] });
        indexMemory(store, created.id);
        existing.unshift(toApi(created));
      }
      // Nach dem Import wandert die Datei ins Archiv. Der Ordner hiess frueher
      // "archiv"; wo er existiert, bleibt er in Benutzung, damit bereits
      // archivierte Dateien nicht ploetzlich woanders liegen.
      try {
        const doneDir = archiveDir(ctx.datenOrdner);
        fs.mkdirSync(doneDir, { recursive: true });
        fs.renameSync(resolved, path.join(doneDir, path.basename(resolved)));
      } catch { /* bleibt liegen — der nächste Durchlauf versucht es wieder */ }
    } catch { /* eine unlesbare Datei haelt den Import nicht auf */ }
  }

  function startInboxWatcher() {
    if (inboxWatcher) return;
    try {
      inboxWatcher = fs.watch(INBOX_DIR, { persistent: false }, (_evt, filename) => {
        if (!filename) return;
        if (!isSafeFilename(filename)) return;
        const full = path.join(INBOX_DIR, filename);
        const resolved = path.resolve(full);
        if (!resolved.startsWith(path.resolve(INBOX_DIR) + path.sep)) return;
        if (inboxQueue.has(resolved)) return;
        inboxQueue.add(resolved);
        setTimeout(() => { inboxQueue.delete(resolved); if (fs.existsSync(resolved)) void autoImportFile(resolved); }, 800);
      });
    } catch { /* Ordner nicht beobachtbar — manueller Scan bleibt */ }
  }
  startInboxWatcher();

  app.get('/api/inbox/status', (_req, res) => {
    let files: string[] = [];
    try { files = fs.readdirSync(INBOX_DIR).filter(f => !f.startsWith('.') && f !== 'archiv' && f !== 'archive'); } catch { /* Ordner fehlt */ }
    let archived = 0;
    try { archived = fs.readdirSync(archiveDir(ctx.datenOrdner)).length; } catch { /* noch leer */ }
    res.json({ inboxDir: INBOX_DIR, files, archiveCount: archived, archivCount: archived, watching: !!inboxWatcher, lastScan: inboxLastScan });
  });

  app.post('/api/inbox/scan', ctx.limiter.write, async (_req, res) => {
    inboxLastScan = Date.now();
    let files: string[] = [];
    try { files = fs.readdirSync(INBOX_DIR).filter(f => !f.startsWith('.') && f !== 'archiv' && f !== 'archive').map(f => path.join(INBOX_DIR, f)); } catch { /* Ordner fehlt */ }
    let imported = 0;
    for (const f of files) { const before = store.countMemories().active; await autoImportFile(f); const after = store.countMemories().active; if (after > before) imported += (after - before); }
    res.json({ scanned: files.length, imported, inboxDir: INBOX_DIR });
  });
}
