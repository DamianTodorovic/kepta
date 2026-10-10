// Import-Routen — VOR dem globalen Body-Limit registrieren (P1: Reihenfolge)!
// express.json überspringt bereits geparste Bodies — daher greift das globale
// 1mb-Limit (server/app.ts) auf diesen Requests nicht mehr, und große Backups
// (bis 2mb) bzw. Markdown-Batches (bis 10mb) werden nicht schon global mit
// 413 abgewiesen. Das Mounten übernimmt app.ts in genau dieser Reihenfolge.
import express from "express";
import path from "path";
import { importObsidianVault } from "../../src/core/obsidian";
import { chatExportZuMarkdown } from "../../src/lib/chat-export";
import { indexMemory } from "../../src/core/engine";
import { sanitizeText, sanitizeTitle, sanitizeTags } from "../../src/core/sanitize";
import { toApi, grenzHinweis } from "../helfer/api-form";
import { bodyOf } from "../helfer/body";
import { backupAufbewahrung, datenbanksicherung, halteSicherungen } from "../helfer/sicherung";
import type { AppKontext } from "../kontext";
import type { MemoryRecord } from "../helfer/api-form";

export function mountImporte(app: express.Express, ctx: AppKontext): void {
  const { store } = ctx;

  function handleMemoriesImport(req: express.Request, res: express.Response) {
    const { memories: incoming, mode, confirm, dryRun } = bodyOf<{
      memories?: Partial<MemoryRecord>[];
      mode?: "merge" | "replace";
      confirm?: unknown;
      dryRun?: unknown;
    }>(req);
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

    // A3-01/Q-16: eine Nutzlast ohne einzige nutzbare Notiz ist kein Erfolg,
    // sondern ein Fehler — und bei mode:"replace" war sie der Vollstaender, der
    // die ganze Wissensbasis loescht (gemessen: 200 {imported:0}, Bestand 0).
    if (cleaned.length === 0) {
      return res.status(400).json({ error: "No usable note in the payload (every entry needs a non-empty content) — nothing was changed." });
    }

    if (mode === "replace") {
      const vorher = store.countMemories();
      if (dryRun === true) {
        return res.json({ dryRun: true, affected: vorher, incoming: cleaned.length });
      }
      if (confirm !== "replace") {
        return res.status(400).json({
          error: `mode:"replace" purges the whole knowledge base for good — ${vorher.active} active and ${vorher.trashed} trashed nodes, trash included. Send confirm:"replace" to do it, or dryRun:true to only see how many are affected. Nothing was changed.`,
        });
      }
      // Vor dem Purge, nicht danach: was hier fehlt, ist nach dem Purge weg.
      const backupPath = datenbanksicherung(store);
      if (!backupPath) {
        return res.status(500).json({ error: "The backup could not be written — nothing is deleted without a backup. Nothing was changed." });
      }
      // Endgültig leeren (Papierkorb inklusive), dann Import — vollständig listen, nicht gekappt
      for (const m of ctx.listAllMemories({ trash: true })) store.purgeMemory(m.id);
      for (const m of ctx.listAllMemories()) store.purgeMemory(m.id);
      // Doppelte IDs innerhalb der Backup-Datei: letzte Variante gewinnt (createMemory wirft sonst)
      const byId = new Map<string, (typeof cleaned)[number]>();
      for (const m of cleaned) byId.set(m.id, m);
      let konflikt = false;
      try {
        for (const m of byId.values()) {
          const created = store.createMemory(m);
          indexMemory(store, created.id);
        }
      } catch {
        konflikt = true;
      }
      // Erst ist der letzte Schreiblauf am Ordner vorueber, dann wird gezaehlt und
      // geraeumt: die frische Sicherung ist beim Raeumen immer die neueste und kann
      // sich nicht selbst wegnehmen. Der Purge laeuft zu diesem Zeitpunkt schon —
      // die Antwort darf nicht an einer Raeumkehr scheitern, deshalb wird hier
      // nichts geworfen.
      const aufbewahrung = backupAufbewahrung();
      const raeum = halteSicherungen(path.dirname(backupPath), aufbewahrung.behalten);
      if (konflikt) {
        return res.status(409).json({
          error: `Import failed: conflicting node ids (backup: ${backupPath})`,
          backupPath,
          backupsGehalten: raeum.gehalten,
          backupsEntfernt: raeum.entfernt,
        });
      }
      const danach = store.countMemories().active;
      const warnung = [
        grenzHinweis(danach).warning,
        aufbewahrung.ignoriert,
        raeum.gehalten === 0 ? "KEPTA_BACKUP_KEEP=0 — the backup was written for this purge and deleted right after it: this purge cannot be undone from disk." : undefined,
      ].filter(Boolean).join(" ");
      return res.json({
        imported: byId.size,
        total: danach,
        purged: vorher,
        backupPath,
        backupsGehalten: raeum.gehalten,
        backupsEntfernt: raeum.entfernt,
        ...(warnung ? { warning: warnung } : {}),
      });
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
    res.json({ imported, total: store.countMemories().active, ...grenzHinweis(store.countMemories().active) });
  }
  app.post("/api/memories/import", ctx.limiter.write, express.json({ limit: "2mb" }), handleMemoriesImport);

  function handleMarkdownImport(req: express.Request, res: express.Response) {
    const { files, scope } = bodyOf<{ files?: { name?: string; content?: string }[]; scope?: string }>(req);
    if (!Array.isArray(files) || files.length === 0 || files.length > 5000) {
      return res.status(400).json({ error: "a files array (1..5000) is required" });
    }
    const mdFiles = files
      .filter((f) => f && typeof f.content === "string")
      .map((f) => ({ name: typeof f.name === "string" ? f.name.slice(0, 200) : "notiz.md", content: f.content as string }));
    const summary = importObsidianVault(store, mdFiles, { scope: typeof scope === "string" && scope ? scope : undefined });
    res.json(summary);
  }
  app.post("/api/import/markdown", ctx.limiter.write, express.json({ limit: "10mb" }), handleMarkdownImport);
}

/**
 * KI-Verlauf übernehmen: das conversations.json aus dem ChatGPT- oder
 * Claude-Export wird zu Markdown aufbereitet und über die Obsidian-Pipeline
 * importiert (Titel-Dedup: ein erneuter Import aktualisiert statt doppelt).
 * Der teuerste Schreibweg der App: 40mb Body, deshalb hinter der Schreib-Drossel.
 */
export function mountChatImport(app: express.Express, ctx: AppKontext): void {
  const { store } = ctx;
  app.post("/api/import/chat", ctx.limiter.write, express.json({ limit: "40mb" }), (req, res) => {
    const roh = typeof req.body?.content === "string" ? req.body.content : "";
    if (!roh.trim()) return res.status(400).json({ error: "content (the raw conversations.json text) is required" });
    let daten: unknown;
    try {
      daten = JSON.parse(roh);
    } catch {
      return res.status(400).json({ error: "content is not valid JSON — send the conversations.json from your export as text" });
    }
    const ergebnis = chatExportZuMarkdown(daten);
    if (!ergebnis) {
      return res.status(400).json({ error: "This file is not a ChatGPT or Claude export (no conversations with mapping or chat_messages found)." });
    }
    const scope = `${ergebnis.format}-import`;
    const summary = ergebnis.dateien.length ? importObsidianVault(store, ergebnis.dateien, { scope }) : { imported: 0, updated: 0, skipped: 0, errors: [] };
    res.json({ format: ergebnis.format, conversations: ergebnis.gespraeche, emptyConversations: ergebnis.uebersprungen, ...summary });
  });
}
