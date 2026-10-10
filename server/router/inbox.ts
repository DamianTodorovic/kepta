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

  /**
   * A3-03/Q-18: path.resolve prueft den Pfad, nie das Ziel. Ein Symlink in der
   * Inbox loeste sich bisher in jede Datei auf, die dieser Nutzer lesen kann —
   * ihr Inhalt stand als Knoten im agentensichtbaren Speicher. Darum zwei
   * Blickrichtungen: lstat auf den Eintrag selbst (er darf kein Link sein) und
   * realpath auf die echte Lage (sie muss in der Inbox liegen, auch wenn ein
   * Ordner ueber ihr weiterverlinkt ist). "kein angebot" ist der bisher stille
   * Fall Ordner: nichts abgelehnt, nichts gemeldet.
   */
  type InboxSchleuse =
    | { aufnahme: "ja"; datei: string }
    | { aufnahme: "nein"; grund: string }
    | { aufnahme: "kein angebot" };

  async function inboxGate(pfad: string): Promise<InboxSchleuse> {
    const basis = path.resolve(INBOX_DIR);
    const resolved = path.resolve(pfad);
    if (resolved !== basis && !resolved.startsWith(basis + path.sep)) return { aufnahme: "nein", grund: "not inside the inbox folder" };
    if (!isSafeFilename(path.basename(resolved))) return { aufnahme: "nein", grund: "not a usable file name" };
    const eintrag = await fs.promises.lstat(resolved).catch(() => null);
    if (!eintrag) return { aufnahme: "nein", grund: "not readable" };
    if (eintrag.isSymbolicLink()) return { aufnahme: "nein", grund: "symlink — the inbox does not follow links out of the folder" };
    // Ein Ordner in der Inbox ist keine abgelehnte Datei, sondern kein Angebot —
    // still uebergangen wie bisher (sonst meldete jeder eigene archive-Ordner eine
    // Ablehnung, und der Waechter schrieb beim ersten Import eine Warnung).
    if (!eintrag.isFile()) return { aufnahme: "kein angebot" };
    // Der Home-Pfad ist auf macOS selbst ein Link (/var -> /private/var): verglichen
    // wird deshalb die echte Lage beider Seiten, nicht der angesehene Pfad.
    const [echt, echteBasis] = await Promise.all([
      fs.promises.realpath(resolved).catch(() => null),
      fs.promises.realpath(INBOX_DIR).catch(() => null),
    ]);
    if (!echt || !echteBasis) return { aufnahme: "nein", grund: "not readable" };
    if (echt !== echteBasis && !echt.startsWith(echteBasis + path.sep)) return { aufnahme: "nein", grund: "leads out of the inbox folder" };
    return { aufnahme: "ja", datei: echt };
  }

  async function autoImportFile(filePath: string): Promise<{ grund?: string }> {
    try {
      // Hardened: nur echte Dateien innerhalb INBOX_DIR — kein Link, kein Traversal.
      const schleuse = await inboxGate(filePath);
      if (schleuse.aufnahme === "kein angebot") return {};
      if (schleuse.aufnahme === "nein") return { grund: schleuse.grund };
      const resolved = schleuse.datei;
      const stat = fs.statSync(resolved);
      if (!stat.isFile() || stat.size > 20_000_000) return {};
      const ext = path.extname(resolved).toLowerCase();
      if (!INHALTS_ENDUNGEN.includes(ext) && ext !== '.pdf' && stat.size > 500_000) return {};
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
      if (!content.trim()) return {};
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
      return {};
    } catch {
      // Eine unlesbare Datei haelt den Import nicht auf — aber ihr Grund geht
      // nach aussen, statt im Nichts zu verschwinden.
      return { grund: "could not be read" };
    }
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
        setTimeout(() => { inboxQueue.delete(resolved);
          const geprueft = path.resolve(resolved);
          if (!geprueft.startsWith(path.resolve(INBOX_DIR) + path.sep) || !fs.existsSync(geprueft)) return;
          // Der Grund geht nach aussen, statt im Nichts zu verschwinden: ein Link,
          // der abgelehnt wird, bleibt in der Inbox liegen — ohne eine Zeile, die
          // sagt warum, ist das fuer den Nutzer nur eine Datei, die nie ankam.
          void autoImportFile(geprueft).then((r) => {
            if (r.grund) console.warn(`kepta inbox: ${path.basename(geprueft)} wurde uebersprungen — ${r.grund}`);
          });
        }, 800);
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
    const skipped: { file: string; reason: string }[] = [];
    for (const f of files) {
      const before = store.countMemories().active;
      const ergebnis = await autoImportFile(f);
      const after = store.countMemories().active;
      if (after > before) imported += (after - before);
      if (ergebnis.grund) skipped.push({ file: path.basename(f), reason: ergebnis.grund });
    }
    res.json({ scanned: files.length, imported, skipped, inboxDir: INBOX_DIR });
  });
}
