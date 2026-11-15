// --- Today, Widersprüche, Dossiers ---
// Widersprüche werden über alle Fakten und Anleitungen gesucht — einmal
// berechnet und gehalten, bis sich eine Notiz ändert (oder zehn Minuten um sind).
import express from "express";
import { briefing, merkeOk, pruefnotizen, leseOk, OK_SCHLUESSEL, type Briefing } from "../../src/lib/briefing";
import { dossier, dossierAlsMarkdown, vorschlaege } from "../../src/lib/dossier";
import { findeWidersprueche, paarSchluessel } from "../../src/lib/widersprueche";
import { schreibe as protokolliere } from "../../src/lib/pruefprotokoll";
import { werIst } from "../helfer/werist";
import type { AppKontext } from "../kontext";

export function mountBriefing(app: express.Express, ctx: AppKontext): void {
  const { store } = ctx;
  const titelVon = (id: string) => store.getMemory(id)?.title ?? id;

  let widerspruchCache: { stand: string; zeit: number; liste: ReturnType<typeof findeWidersprueche> } | null = null;
  let allesBriefingCache: { stand: string; daten: Briefing } | null = null;

  function aktuelleWidersprueche() {
    const okRow = store.db.prepare("SELECT wert FROM einstellungen WHERE schluessel = ?").get(OK_SCHLUESSEL) as { wert?: string } | undefined;
    const gen = typeof store.memGeneration === "function" ? store.memGeneration() : 0;
    const stand = `${gen}:${okRow?.wert ?? ""}`;
    if (!widerspruchCache || widerspruchCache.stand !== stand || Date.now() - widerspruchCache.zeit > 10 * 60_000) {
      const ok = leseOk(okRow?.wert);
      widerspruchCache = { stand, zeit: Date.now(), liste: findeWidersprueche(pruefnotizen(store), { ok, limit: 50 }) };
    }
    return widerspruchCache.liste;
  }

  app.get("/api/briefing", (req, res) => {
    const seit = Number(req.query.since);
    const effSeit = Number.isFinite(seit) && seit >= 0 ? seit : Date.now() - 86_400_000;
    const widersprueche = aktuelleWidersprueche().slice(0, 10);
    // Paket 3 (Today 2.0): since=0 ist das „Everything“-Fenster der Zeitmaschine —
    // es darf NICHT auf den 24h-Default fallen (der gilt nur für fehlenden Müll).
    if (effSeit === 0) {
      const gen = typeof store.memGeneration === "function" ? store.memGeneration() : 0;
      let actStamp = "0";
      try {
        const row = store.db.prepare("SELECT COUNT(*) AS n, COALESCE(MAX(id), 0) AS m FROM agent_activity").get() as { n: number; m: number };
        actStamp = `${row.n}:${row.m}`;
      } catch { /* keine Agenten-Aktivität */ }
      const stand = `${gen}:${actStamp}:${widerspruchCache?.stand ?? ""}:${Math.floor(Date.now() / 60_000)}`;
      if (allesBriefingCache && allesBriefingCache.stand === stand) {
        return res.json(allesBriefingCache.daten);
      }
      const daten = briefing(store, { seit: 0, widersprueche });
      allesBriefingCache = { stand, daten };
      return res.json(daten);
    }
    res.json(briefing(store, { seit: effSeit, widersprueche }));
  });

  app.post("/api/contradictions/resolve", ctx.limiter.write, (req, res) => {
    const b = (req.body ?? {}) as { keep?: unknown; drop?: unknown; both?: unknown; window?: unknown };
    const keep = typeof b.keep === "string" ? b.keep : "";
    const drop = typeof b.drop === "string" ? b.drop : "";
    if (!keep || !drop || keep === drop || !store.getMemory(keep) || !store.getMemory(drop)) return res.status(400).json({ error: "Pick the two notes that disagree." });
    if (b.both === true) {
      merkeOk(store, paarSchluessel(keep, drop));
      protokolliere(store, { actor: werIst(req), action: "keep both", target: `${titelVon(keep)} · ${titelVon(drop)}` });
      return res.json({ ok: true });
    }
    // Paket 3 (Dossier 2.0): „Beide gültig — Fenster setzen“. Die ältere Notiz
    // gilt bis zu dem Zeitpunkt, an dem die neuere entstand; das Paar kommt
    // als Widerspruch nicht wieder. Ein vorhandenes Fenster wird nicht
    // angetastet, ein unmögliches (Ende vor Beginn) nicht erfunden — die
    // Antwort sagt ehrlich, was geschehen ist.
    if (b.window === true) {
      const neuere = store.getMemory(keep)!;
      const aeltere = store.getMemory(drop)!;
      const start = aeltere.validFrom ?? aeltere.createdAt;
      const bis = neuere.updatedAt;
      let gesetzt: number | null = null;
      if (!aeltere.validTo && bis > start) {
        const gepatcht = store.updateMemory(drop, { validTo: bis });
        if (gepatcht) gesetzt = bis;
      }
      merkeOk(store, paarSchluessel(keep, drop));
      ctx.publishActivity({ type: "update", source: "app", title: titelVon(drop) });
      protokolliere(store, {
        actor: werIst(req),
        action: "keep both (window)",
        target: `${titelVon(keep)} · ${titelVon(drop)}`,
        detail: gesetzt ? `older note now holds until ${new Date(gesetzt).toISOString()}` : "pair marked as both right — no window set",
      });
      return res.json({ ok: true, window: gesetzt });
    }
    store.supersedeMemory(drop, keep);
    ctx.publishActivity({ type: "update", source: "app", title: titelVon(drop) });
    protokolliere(store, { actor: werIst(req), action: "resolve contradiction", target: titelVon(keep), detail: `replaces ${titelVon(drop)} (${drop})` });
    res.json({ ok: true });
  });

  app.get("/api/dossier", async (req, res) => {
    try {
      const d = await dossier(store, String(req.query.topic ?? ""));
      res.json({ ...d, markdown: dossierAlsMarkdown(d) });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.get("/api/dossier/suggestions", (_req, res) => {
    res.json(vorschlaege(store));
  });
}
