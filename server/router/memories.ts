// Memories-CRUD: Liste, anlegen, ändern, löschen (Papierkorb), Sammeloperationen.
import crypto from "crypto";
import express from "express";
import { indexMemory, gateDecision, writeGateEnabled } from "../../src/core/engine";
import { klassifiziere } from "../../src/core/klassifikation";
import { sanitizeText, sanitizeTitle, sanitizeTags } from "../../src/core/sanitize";
import { sanitizeScope, sanitizeId, istGueltigeId } from "../helfer/ids";
import { toApi, maxActiveMemories, grenzHinweis, MAX_BULK_IDS, type MemoryRecord } from "../helfer/api-form";
import { bodyOf } from "../helfer/body";
import type { AppKontext } from "../kontext";

const GUELTIGE_TYPEN = ["semantic", "episodic", "procedural", "reference"];

export function mountMemories(app: express.Express, ctx: AppKontext): void {
  const { store } = ctx;
  const activeCount = () => store.countMemories().active;

  async function handleCreateOrUpdateMemory(req: express.Request, res: express.Response) {
    const body = bodyOf<Partial<MemoryRecord> & { tags?: unknown; title?: unknown; content?: unknown }>(req);
    // Hardened: Validierung + Sanitization + Limits
    if (body && JSON.stringify(body).length > 60000) return res.status(413).json({ error: "Payload too large (max 60k)" });
    if (activeCount() > maxActiveMemories() && !body.id) return res.status(429).json({ error: `Limit reached: ${activeCount()} active nodes, maximum is ${maxActiveMemories()} — please delete some first` });

    const title = sanitizeTitle(body.title);
    const content = sanitizeText(body.content, 50000);

    if (body.id) {
      if (typeof body.id !== "string" || body.id.length > 120 || !istGueltigeId(body.id)) return res.status(400).json({ error: "Invalid id" });
      const patch: Record<string, unknown> = {};
      if (body.title !== undefined) patch.title = title;
      if (body.content !== undefined) patch.content = content;
      if (body.tags !== undefined) patch.tags = sanitizeTags(body.tags);
      if (body.type !== undefined && GUELTIGE_TYPEN.includes(String(body.type))) patch.type = body.type;
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
      ctx.publishActivity({ type: "update", source: "app", title: updated.title });
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
        ctx.publishActivity({ type: "update", source: "app", title: updated.title });
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
      type: GUELTIGE_TYPEN.includes(String(body.type)) ? (body.type as never) : undefined,
      confidence: typeof body.confidence === "number" ? Math.min(1, Math.max(0, body.confidence)) : undefined,
      validFrom: body.validFrom === null || body.validFrom === undefined ? undefined : Number(body.validFrom) || undefined,
      validTo: body.validTo === null || body.validTo === undefined ? undefined : Number(body.validTo) || undefined,
      scope: body.scope === undefined ? undefined : (sanitizeScope(body.scope) ?? undefined),
    });
    indexMemory(store, created.id);
    ctx.publishActivity({ type: "save", source: "app", title: created.title });
    return res.json({ memory: toApi(created), ...(writeGateEnabled() ? { gateOutcome: "created", writeGate: gate } : {}) });
  }

  app.post("/api/memories", ctx.limiter.write, handleCreateOrUpdateMemory);
  // Alias für MCP / einfache Clients
  app.post("/api/memory", ctx.limiter.write, handleCreateOrUpdateMemory);

  app.delete("/api/memories/:id", ctx.limiter.write, (req, res) => {
    const id = String(req.params.id || "");
    if (!istGueltigeId(id)) return res.status(400).json({ error: "Invalid id" });
    // Default: Papierkorb. ?permanent=1 löscht endgültig.
    if (req.query.permanent === "1" || req.query.permanent === "true") {
      const purged = store.purgeMemory(id);
      if (purged) ctx.publishActivity({ type: "delete", source: "app", title: id });
      return res.json({ ok: purged, permanent: true });
    }
    const trashed = store.trashMemory(id);
    if (trashed) {
      const m = store.getMemory(id);
      ctx.publishActivity({ type: "delete", source: "app", title: m?.title ?? id });
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
  app.post("/api/memories/bulk-delete", ctx.limiter.write, express.json({ limit: "1mb" }), (req, res) => {
    const roh = bodyOf<{ ids?: unknown }>(req).ids;
    if (!Array.isArray(roh)) return res.status(400).json({ error: "ids must be a list" });
    if (roh.length > MAX_BULK_IDS) return res.status(400).json({ error: `At most ${MAX_BULK_IDS} at a time` });
    const gueltig = [...new Set(roh.map((x) => String(x)))].filter((id) => istGueltigeId(id));
    const erledigt: string[] = [];
    let nichtGefunden = 0;
    for (const id of gueltig) {
      if (store.trashMemory(id)) erledigt.push(id); else nichtGefunden++;
    }
    if (erledigt.length > 0) {
      ctx.publishActivity({ type: "delete", source: "app", title: `${erledigt.length} notes moved to the trash` });
      ctx.markiereEigeneAenderung();
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
  app.post("/api/memories/reclassify", ctx.limiter.write, express.json({ limit: "1mb" }), (req, res) => {
    const anwenden = bodyOf<{ apply?: unknown }>(req).apply === true;
    const alle = ctx.listAllMemories();
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
    if (anwenden && geaendert > 0) ctx.markiereEigeneAenderung();
    res.json({ ok: true, applied: anwenden, total: alle.length, changed: geaendert, before: vorher, after: nachher, examples: beispiele });
  });

  /** Das Gegenstueck: alles aus einem Sammel-Loeschen wieder zurueckholen. */
  app.post("/api/memories/bulk-restore", ctx.limiter.write, express.json({ limit: "1mb" }), (req, res) => {
    const roh = bodyOf<{ ids?: unknown }>(req).ids;
    if (!Array.isArray(roh)) return res.status(400).json({ error: "ids must be a list" });
    if (roh.length > MAX_BULK_IDS) return res.status(400).json({ error: `At most ${MAX_BULK_IDS} at a time` });
    const gueltig = [...new Set(roh.map((x) => String(x)))].filter((id) => istGueltigeId(id));
    let zurueck = 0;
    for (const id of gueltig) if (store.restoreMemory(id)) zurueck++;
    if (zurueck > 0) ctx.markiereEigeneAenderung();
    res.json({ ok: true, restored: zurueck });
  });

  // Wiederherstellen aus dem Papierkorb
  app.post("/api/memories/:id/restore", ctx.limiter.write, (req, res) => {
    const id = String(req.params.id || "");
    if (!istGueltigeId(id)) return res.status(400).json({ error: "Invalid id" });
    const restored = store.restoreMemory(id);
    if (!restored) return res.status(404).json({ error: "Not found in the trash" });
    res.json({ ok: true, memory: toApi(store.getMemory(id)!) });
  });

  // Liste (mit ETag — das Frontend prüft sie, bevor es den ganzen Bestand lädt)
  app.get("/api/memories", (req, res) => {
    const memories = req.query.trash === "1" ? ctx.listAllMemories({ trash: true }).map(toApi) : ctx.listAllMemories().map(toApi);
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
}
