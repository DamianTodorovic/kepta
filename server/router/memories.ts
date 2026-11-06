// Memories-CRUD: Liste, anlegen, ändern, löschen (Papierkorb), Sammeloperationen.
import crypto from "crypto";
import express from "express";
import { indexMemory, gateDecision, writeGateEnabled } from "../../src/core/engine";
import { extractWikiLinks } from "../../src/core/mcp";
import { klassifiziere, gruppen, type Traeger, type Thema } from "../../src/core/klassifikation";
import { sanitizeText, sanitizeTitle, sanitizeTags } from "../../src/core/sanitize";
import { behauptungenAus } from "../../src/core/behauptungen";
import { sanitizeScope, sanitizeId, istGueltigeId } from "../helfer/ids";
import { toApi, maxActiveMemories, grenzHinweis, MAX_BULK_IDS, SEITE_MIN, SEITE_MAX, seiteUmwelt, type MemoryRecord } from "../helfer/api-form";
import { bodyOf } from "../helfer/body";
import { zeitnahme } from "../helfer/zeitnahme";
import type { AppKontext } from "../kontext";

const GUELTIGE_TYPEN = ["semantic", "episodic", "procedural", "reference"];

// Punkt 126/127 — die Behauptungen aus dem Leib eines Speicherns lesen jetzt beide Tueren aus
// **einem** Vertrag (`src/core/behauptungen.ts`): drei Zustaende (nicht genannt = behalten,
// leer = loeschen, Liste = setzen) und dieselbe Absage in REST wie MCP. Was hier stand, war ein
// zweites Blatt; die Agentenpforte hatte keinen Vertrag zum Befolgen und verwarf das Feld still.

export function mountMemories(app: express.Express, ctx: AppKontext): void {
  const { store } = ctx;
  const activeCount = () => store.countMemories().active;

  async function handleCreateOrUpdateMemory(req: express.Request, res: express.Response) {
    const body = bodyOf<Partial<MemoryRecord> & { tags?: unknown; title?: unknown; content?: unknown }>(req);
    // Hardened: Validierung + Sanitization + Limits
    if (body && JSON.stringify(body).length > 60000) return res.status(413).json({ error: "Payload too large (max 60k)" });
    if (activeCount() > maxActiveMemories() && !body.id) return res.status(429).json({ error: `Limit reached: ${activeCount()} active notes, maximum is ${maxActiveMemories()} — please delete some first` });

    const title = sanitizeTitle(body.title);
    const content = sanitizeText(body.content, 50000);
    // Punkt 126: erst die Behauptungen pruefen, dann irgendetwas schreiben. Eine
    // halbe Notiz mit weggeworfenem Wort waer ein Verlust mit Umweg.
    const beh = behauptungenAus(body as Record<string, unknown>);
    if (beh.ablehnung) return res.status(400).json({ error: beh.ablehnung });

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
      if (!updated) return res.status(404).json({ error: "Note not found" });
      // Eine Behauptung ist auch ohne neuen Text eine Aenderung: sonst schrieb das
      // Blatt die Aussage und der Graph blieb leer, weil hier nur Text und Titel
      // zaehlen.
      if (beh.gesendet || body.content !== undefined || body.title !== undefined) {
        indexMemory(store, updated.id);
        // Eine Notiz aus der Oberfläche verknüpft sich wie eine aus dem Agentenkanal.
        store.verknuepfeNotiz(
          updated.id,
          updated.title,
          extractWikiLinks(`${updated.title} ${updated.content}`),
          beh.gesendet ? beh.liste : undefined
        );
      }
      ctx.publishActivity({ type: "update", source: "app", title: updated.title });
      return res.json({ memory: toApi(updated), behauptungen: store.behauptungenVonNotiz(updated.id).length });
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
        store.verknuepfeNotiz(
          updated.id,
          updated.title,
          extractWikiLinks(`${updated.title} ${updated.content}`),
          beh.gesendet ? beh.liste : undefined
        );
        ctx.publishActivity({ type: "update", source: "app", title: updated.title });
        return res.json({
          memory: toApi(updated), gateOutcome: "updated", writeGate: gate,
          behauptungen: store.behauptungenVonNotiz(updated.id).length,
        });
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
    store.verknuepfeNotiz(
      created.id,
      created.title,
      extractWikiLinks(`${created.title} ${created.content}`),
      beh.gesendet ? beh.liste : undefined
    );
    ctx.publishActivity({ type: "save", source: "app", title: created.title });
    // Die Zahl nennt, was **stand** nach dem Schreibgriff, nicht was geschickt wurde:
    // die Kappe des Kerns kann weniger durchlassen, und eine Antwort, die das verschweigt,
    // laesst die Person ihre Aussage erneut tippen.
    return res.json({
      memory: toApi(created),
      behauptungen: store.behauptungenVonNotiz(created.id).length,
      ...(writeGateEnabled() ? { gateOutcome: "created", writeGate: gate } : {}),
    });
  }

  app.post("/api/memories", ctx.limiter.write, handleCreateOrUpdateMemory);
  // Alias für MCP / einfache Clients
  app.post("/api/memory", ctx.limiter.write, handleCreateOrUpdateMemory);

  app.delete("/api/memories/:id", ctx.limiter.write, (req, res) => {
    const id = String(req.params.id || "");
    if (!istGueltigeId(id)) return res.status(400).json({ error: "Invalid id" });
    // Default: Papierkorb. ?permanent=1 loescht endgueltig.
    // A3-11: alles ausserhalb dieser Formen wurde still als Papierkorb behandelt —
    // "?permanent=True" verlangte endgueltig und bekam {"permanent":false}. Ein
    // Client, der loeschen wollte, hat eine Notiz im Papierkorb liegen und haelt sie
    // fuer weg. Darum: exakt eine der vier Formen, sonst Ablehnung ohne Wirkung.
    const permanentRoh = req.query.permanent;
    if (permanentRoh !== undefined && (typeof permanentRoh !== "string" || !/^(1|0|true|false)$/.test(permanentRoh))) {
      return res.status(400).json({ error: 'permanent takes exactly one of 1, 0, true, false — or leave it out for the trash. Nothing was deleted.' });
    }
    if (permanentRoh === "1" || permanentRoh === "true") {
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
   * Liste — und ab der einundsechzigsten griff die Schreibdrossel (damals 60/min, heute SCHREIB_KANTE) und
   * beantwortete alles Weitere mit 429. Weil der Aufrufer den Fehler verwarf,
   * meldete die Oberflaeche trotzdem Erfolg. Von aussen sah das aus, als
   * loesche K3PTA wahllos die halbe Wissensbasis.
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

  // Liste — seitenweis. Vorher gab es hier keinen seitenweisen Leseweg:
  // ctx.listAllMemories() zog bei JEDEM Aufruf die ganze Basis durch die Leitung
  // (an Damians Bestand 14.702 Knoten = 30.981.380 Bytes in 9,99 s), und die
  // Flaechen filterten das im Renderer. Ein Aufruf ohne `limit` liefert die
  // Default-Seite und sagt es — still 14.702 Knoten darf niemand mehr bekommen.
  //
  // Die Antwort ist ein Leib mit Zahl, nicht mehr ein nackter Array. Auftrag der
  // Leitung nach GFs Befund vom 13.10. (Flaeche: "100 entries" bei 14.702 in der
  // Tuer): **die Zahl, die eine Flaeche zeigt, muss aus dem Leib kommen** — ein
  // Renderer darf nicht auf Header-Hoffnung bauen. Das Feld heisst `memories`, wie
  // die Suchtuer es schon immer tat (`server/router/search.ts:23-28` nennt
  // {query, count, total, memories}), und drei Flaechen lesen diese Form bereits
  // (`src/lib/store.ts:55`, `src/components/Dashboard.tsx:258`,
  // `src/components/Chat.tsx:670` — alle drei akzeptieren {memories:[]}).
  // Dieselbe Zahl bleibt zusaetzlich in Koepfen (`x-kepta-*`), fuer jeden, der vor
  // dem Leib entscheiden will; die Umstellung der Flaechen ist GFs Scheibe.
  /**
   * #77 — die Bestandszahl pro Traeger und pro Thema, durch dieselben Regeln wie
   * die Flaeche. Ohne diese Route zaehlt die Flaeche das geladene Blatt (hoechstens
   * SEITE_MAX Notizen) und nennt es Bestand: ein Klick auf „Notes" (92 von 21.066)
   * trifft dann die Seite, nicht den Laden.
   *
   * Kein Puffer, mit Absicht: eine Zahl, die der Nutzer als Bestand liest, darf
   * nicht hinter einer Schreibaktion alt bleiben. Was der Lauf kostet, steht im
   * Leib (`ms`) und wird gemeldet statt versteckt.
   */
  app.get("/api/memories/gruppen", (_req, res) => {
    const started = Date.now();
    const zeit = zeitnahme();
    const traeger: Record<Traeger, number> = { notes: 0, files: 0, code: 0, daten: 0, anderes: 0 };
    const themen: Record<Thema, number> = { people: 0, projects: 0, events: 0, tasks: 0, guides: 0, links: 0 };
    // Punkt 5, dritter Schritt: zwei Raender erzaehlen nicht, welches Fach ein Thema fuellt.
    // `events` an seinem Bestand 41,1 % - in einer Prosanotiz ist ein Datum ein Termin, in
    // einer gescannten JSON-Datei ein Feld. Die Zeilen und Spalten werden aus den beiden
    // Rand-Listen gezogen, nicht nebenher neu erfunden: eine siebte_theme-Konstante konnte
    // still hinter ihrer Rand-Liste herlaufen.
    const leereZeile = () => Object.fromEntries(Object.keys(themen).map((h) => [h, 0])) as Record<Thema, number>;
    const themenNachTraeger = Object.fromEntries(
      Object.keys(traeger).map((t) => [t, leereZeile()])
    ) as Record<Traeger, Record<Thema, number>>;
    const ohneThemaNachTraeger = Object.fromEntries(
      Object.keys(traeger).map((t) => [t, 0])
    ) as Record<Traeger, number>;
    let ohneThema = 0;
    let gezahlt = 0;
    // Lesen und Klassifizieren sind zwei Arbeiten: die Route kostet 45,5–70,0 µs je Notiz
    // (Punkt 6, Leiter 20.10. 00:52–01:44, n = 8 je Stufe), und der `ms`-Wert im Leib nennt
    // beides zusammen in 1-ms-Korn. Die Marke trennt es in µs — der Leib bleibt, wie er ist.
    const alle = ctx.listAllMemories();
    zeit.marke("lesen");
    for (const m of alle) {
      const g = gruppen({ title: m.title, content: m.content, tags: m.tags });
      traeger[g.traeger] += 1;
      if (g.themen.length === 0) {
        ohneThema += 1;
        ohneThemaNachTraeger[g.traeger] += 1;
      }
      for (const t of g.themen) {
        themen[t] += 1;
        themenNachTraeger[g.traeger][t] += 1;
      }
      gezahlt += 1;
    }
    zeit.marke("klassifikation");
    res.setHeader("x-kepta-teilzeiten", zeit.kopf());
    res.json({
      ok: true, bestand: gezahlt, traeger, themen, ohneThema,
      themenNachTraeger, ohneThemaNachTraeger, ms: Date.now() - started,
    });
  });

  // Standfolge (BAU-P3-11, zweiter Schritt): die Texte VOR den Aenderungen einer Notiz,
  // neueste zuerst, mit derselben Seiten-Kappe wie die Liste. Gratis-Stufe: kein Schluessel,
  // keine Fahne, kein Bezahlwort - der Leseweg gehoert jeder Installation.
  // Wiederherstellen (BAU-P3-11, dritter Koerper): ein Stand wird die aktuelle Fassung.
  // Zwei Schritte - ohne confirm:"restore" wird nichts geschrieben. Gratis: kein Schluessel.
  // Der ersetzte Text wird im Store VORHER als Stand gesichert; die Antwort nennt die neue Zahl.
  app.post("/api/memories/:id/stande/:standId/restore", ctx.limiter.write, (req, res) => {
    const id = String(req.params.id || "");
    if (!istGueltigeId(id)) return res.status(400).json({ error: "Invalid id" });
    const standId = Number.parseInt(String(req.params.standId || ""), 10);
    if (!Number.isInteger(standId) || standId <= 0) return res.status(400).json({ error: "Invalid stand id" });
    const body = bodyOf<{ confirm?: string }>(req);
    if (!body || body.confirm !== "restore") {
      return res.status(400).json({ error: 'confirm: "restore" is required - nothing was written' });
    }
    const updated = store.restoreStand(id, standId);
    if (!updated) return res.status(404).json({ error: "No note or saved version with that id, so nothing was restored." });
    indexMemory(store, updated.id);
    store.verknuepfeNotiz(updated.id, updated.title, extractWikiLinks(`${updated.title} ${updated.content}`));
    ctx.publishActivity({ type: "update", source: "app", title: updated.title });
    const { total } = store.listStande(id, { limit: 1 });
    return res.json({ ok: true, memory: toApi(updated), restoredFrom: standId, total });
  });

  app.get("/api/memories/:id/stande", (req, res) => {
    const id = String(req.params.id);
    if (!istGueltigeId(id)) return res.status(400).json({ error: "Invalid id" });
    if (!store.getMemory(id)) return res.status(404).json({ error: "Note not found" });

    const rohLimit = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : Number.NaN;
    const gewollt = Number.isFinite(rohLimit) ? rohLimit : 20;
    const seite = Math.min(Math.max(gewollt, SEITE_MIN), SEITE_MAX);
    const rohOffset = typeof req.query.offset === "string" ? Number.parseInt(req.query.offset, 10) : 0;
    const offset = Number.isFinite(rohOffset) ? Math.max(rohOffset, 0) : 0;

    const { staende, total } = store.listStande(id, { limit: seite, offset });
    const begrenzt = offset + staende.length < total;
    const geklemmt = seite !== gewollt
      ? `limit=${gewollt} is outside ${SEITE_MIN}..${SEITE_MAX} - the page was pinned to ${seite}.`
      : undefined;
    const rest = total - offset - staende.length;
    const hinweis = [
      geklemmt,
      total === 0
        ? "This note has no earlier stand yet — it has not been edited since it was written."
        : `This page holds ${staende.length} of ${total} earlier ${total === 1 ? "stand" : "stands"}${begrenzt ? `; ${rest} more follow at offset ${offset + staende.length}` : " - the whole stand list fits in this page"}.`,
    ].filter(Boolean).join(" ");

    res.setHeader("x-kepta-begrenzt", begrenzt ? "1" : "0");
    return res.json({
      count: staende.length,
      total,
      limit: seite,
      offset,
      begrenzt,
      hinweis,
      staende: staende.map((s) => ({ id: s.id, memoryId: s.memoryId, title: s.title, content: s.content, createdAt: s.createdAt })),
    });
  });

  /**
   * Punkt 126 — die Behauptungen einer Notiz. Der Leser ist kein Schmuckstueck der
   * Oberflaeche: ein Feld, das nur schreibt, laesst die Person ihre eigne Aussage
   * erneut tippen, weil sie nicht sehen kann, was schon steht, und sie nicht loeschen
   * kann, ohne zu raten. Die Zahl unten am Feld und diese Liste sind derselbe Stand.
   */
  app.get("/api/memories/:id/behauptungen", (req, res) => {
    const id = String(req.params.id);
    if (!istGueltigeId(id)) return res.status(400).json({ error: "Invalid id" });
    if (!store.getMemory(id)) return res.status(404).json({ error: "Note not found" });
    const liste = store.behauptungenVonNotiz(id);
    return res.json({
      count: liste.length,
      behauptungen: liste,
      hinweis: liste.length === 0
        ? "This note claims nothing yet — the graph draws only mentions for it, and a mention says no more than that two terms appeared together."
        : `${liste.length} claim${liste.length === 1 ? "" : "s"} written by a hand — each one is the word on its line.`,
    });
  });

  app.get("/api/memories", (req, res) => {
    const { ganzerBestand } = leseGrenzwerte(req, res);
    if (res.headersSent) return;
    const trash = req.query.trash === "1";
    const zeit = zeitnahme();
    const bestand = store.countMemories();
    zeit.marke("zaehlung");
    const total = trash ? bestand.trashed : bestand.active;
    const einheit = trash ? "trashed notes" : "notes";

    let seite: number;
    let offset = 0;
    let geklemmt: string | undefined;
    if (ganzerBestand) {
      seite = total;
    } else {
      const umgebung = seiteUmwelt();
      const roh = typeof req.query.limit === "string" ? req.query.limit : undefined;
      const gewollt = roh === undefined ? umgebung.groesse : parseInt(roh, 10);
      seite = Math.min(Math.max(gewollt, SEITE_MIN), SEITE_MAX);
      offset = typeof req.query.offset === "string" ? parseInt(req.query.offset, 10) : 0;
      if (seite !== gewollt) {
        geklemmt = `limit=${gewollt} is outside ${SEITE_MIN}..${SEITE_MAX} - the page was pinned to ${seite}.`;
      }
      if (umgebung.unverstanden) geklemmt = [geklemmt, umgebung.unverstanden].filter(Boolean).join(" ");
    }

    // Zaehlen, Lesen und Formen sind drei Arbeiten an einem Griff; ohne Marke war der Kopf wertlos
    // fuer jede Frage, ab welcher Groesse die Route reisst (Punkt 6, Auftrag 20.10. 00:46).
    const gelesen = ganzerBestand ? ctx.listAllMemories({ trash }) : store.listMemories({ limit: seite, offset, trash });
    zeit.marke("lesen");
    const memories = gelesen.map(toApi);
    zeit.marke("formen");
    const begrenzt = offset + memories.length < total;
    const hinweis = [
      geklemmt,
      hinweisDerListe({ ganzerBestand, seite, offset, total, einheit, begrenzt }),
    ].filter(Boolean).join(" ");

    // Der Leib nennt den Vertrag selbst — Zahl zuerst, dann die Knoten. Ein nackter
    // Array haette die Gesamtzahl nur im Kopf, und GFs Flaeche zeigte "100 entries"
    // bei 14.702 in der Tuer.
    const korpus = {
      count: memories.length,
      total,
      limit: seite,
      offset,
      begrenzt,
      hinweis,
      memories,
    };
    // Seite statt Gesamtbestand: der ETag fuehrt ueber das, was gesendet wird.
    // Ueber dem ganzen String einer 31-Megabyte-Liste hing ein zweiter Vollzugriff,
    // bevor die Antwort ueberhaupt begonnen hatte.
    const body = JSON.stringify(korpus);
    zeit.marke("serialisieren");
    const hash = crypto.createHash("sha1").update(body).digest("hex");
    const etag = `"${hash}"`;
    zeit.marke("etag");
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
    res.setHeader("x-kepta-count", String(memories.length));
    res.setHeader("x-kepta-total", String(total));
    res.setHeader("x-kepta-limit", String(seite));
    res.setHeader("x-kepta-offset", String(offset));
    res.setHeader("x-kepta-begrenzt", begrenzt ? "1" : "0");
    res.setHeader("x-kepta-hinweis", hinweis);
    res.setHeader("x-kepta-teilzeiten", zeit.kopf());
    if (req.headers["if-none-match"] === etag) {
      return res.status(304).end();
    }
    res.setHeader("Content-Type", "application/json");
    res.send(body);
  });
}

/**
 * Die drei Steuerfelder der Liste-Route, strenge gelesen.
 *
 * Form pruefen, Groesse klemmen: ein limit ueber der Obergrenze wird auf die
 * Grenze gesetzt und gesagt (dasselbe Muster wie die Kernsuche mit
 * SUCHE_LIMIT_MIN/STD/MAX), eine Form, die keine Zahl ist, darf nie still als
 * "ganze Basis" oder "Seite 1" enden — das ist die Lehre aus A3-11, wo
 * `?permanent=True` schweigend etwas anderes tat. Der Rueckweg heisst alle=1
 * und steht in jeder Ablehnung.
 */
function leseGrenzwerte(req: express.Request, res: express.Response): { ganzerBestand: boolean } {
  const ganzer = req.query.alle;
  if (ganzer !== undefined && ganzer !== "1" && ganzer !== "true") {
    res.status(400).json({
      error: `alle takes exactly 1 or true - or leave it out for one page of ${seiteUmwelt().groesse} notes (limit=<${SEITE_MIN}..${SEITE_MAX}>). Nothing was read.`,
    });
    return { ganzerBestand: false };
  }
  const zaehler = (feld: string, wert: unknown, minimum: number): number | null | undefined => {
    if (wert === undefined) return undefined;
    const gueltigeForm = typeof wert === "string" && /^\d+$/.test(wert);
    if (!gueltigeForm) {
      res.status(400).json({
        error: `${feld} must be a whole number${feld === "limit" ? ` from ${SEITE_MIN} to ${SEITE_MAX}, or alle=1 for the whole base` : ` from ${minimum} up`} - ${typeof wert === "string" ? `"${wert}"` : "a repeated query value"} is neither. Nothing was read.`,
      });
      return null;
    }
    const n = parseInt(wert, 10);
    if (n < minimum) {
      res.status(400).json({
        error: `${feld} must be a whole number from ${feld === "limit" ? `${SEITE_MIN} to ${SEITE_MAX}, or alle=1 for the whole base` : `${minimum} up`} - got ${n}. Nothing was read.`,
      });
      return null;
    }
    return n;
  };
  if (zaehler("limit", req.query.limit, SEITE_MIN) === null) return { ganzerBestand: false };
  if (zaehler("offset", req.query.offset, 0) === null) return { ganzerBestand: false };
  return { ganzerBestand: ganzer === "1" || ganzer === "true" };
}

/** Zahl je mit Einheit, und nie eine Kappe, die nicht genannt ist. Nur ASCII — der Wert geht in einen Kopf. */
function hinweisDerListe(f: { ganzerBestand: boolean; seite: number; offset: number; total: number; einheit: string; begrenzt: boolean }): string {
  if (f.ganzerBestand) {
    return `alle=1 asked for the whole base: ${f.total.toLocaleString("en-US")} ${f.einheit} in one answer. This is the heavy path: page with limit= instead if a window has to render it.`;
  }
  if (!f.begrenzt) {
    return `${f.total.toLocaleString("en-US")} ${f.einheit} read from offset ${f.offset}: the whole list fits in this page (limit=${f.seite}).`;
  }
  const rest = f.total - (f.offset + f.seite);
  return `This page holds ${f.seite.toLocaleString("en-US")} of ${f.total.toLocaleString("en-US")} ${f.einheit}; ${rest.toLocaleString("en-US")} more follow at offset ${(f.offset + f.seite).toLocaleString("en-US")} (limit=<${SEITE_MIN}..${SEITE_MAX}>, offset=, alle=1 for the whole base).`;
}
