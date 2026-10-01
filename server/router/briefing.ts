// --- Today, Widersprüche, Dossiers ---
// Widersprüche werden über alle Fakten und Anleitungen gesucht — einmal
// berechnet und gehalten, bis sich eine Notiz ändert (oder zehn Minuten um sind).
import express from "express";
import { briefing, merkeOk, pruefnotizen, leseOk, OK_SCHLUESSEL } from "../../src/lib/briefing";
import { dossier, dossierAlsMarkdown, vorschlaege } from "../../src/lib/dossier";
import { findeWidersprueche, paarSchluessel } from "../../src/lib/widersprueche";
import { schreibe as protokolliere } from "../../src/lib/pruefprotokoll";
import { werIst } from "../helfer/werist";
import type { AppKontext } from "../kontext";

export function mountBriefing(app: express.Express, ctx: AppKontext): void {
  const { store } = ctx;
  const titelVon = (id: string) => store.getMemory(id)?.title ?? id;

  let widerspruchCache: { stand: string; zeit: number; liste: ReturnType<typeof findeWidersprueche> } | null = null;
  function aktuelleWidersprueche() {
    const z = store.db.prepare("SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), 0) AS m FROM memories WHERE deleted_at IS NULL").get() as { n: number; m: number };
    const ok = leseOk(store.einstellungen()[OK_SCHLUESSEL]);
    const stand = `${z.n}:${z.m}:${ok.size}`;
    if (!widerspruchCache || widerspruchCache.stand !== stand || Date.now() - widerspruchCache.zeit > 10 * 60_000) {
      widerspruchCache = { stand, zeit: Date.now(), liste: findeWidersprueche(pruefnotizen(store), { ok, limit: 50 }) };
    }
    return widerspruchCache.liste;
  }

  app.get("/api/briefing", (req, res) => {
    const seit = Number(req.query.since);
    res.json(briefing(store, { seit: Number.isFinite(seit) && seit > 0 ? seit : Date.now() - 86_400_000, widersprueche: aktuelleWidersprueche().slice(0, 10) }));
  });

  app.post("/api/contradictions/resolve", ctx.limiter.write, (req, res) => {
    const b = (req.body ?? {}) as { keep?: unknown; drop?: unknown; both?: unknown };
    const keep = typeof b.keep === "string" ? b.keep : "";
    const drop = typeof b.drop === "string" ? b.drop : "";
    if (!keep || !drop || keep === drop || !store.getMemory(keep) || !store.getMemory(drop)) return res.status(400).json({ error: "Pick the two notes that disagree." });
    if (b.both === true) {
      merkeOk(store, paarSchluessel(keep, drop));
      protokolliere(store, { actor: werIst(req), action: "keep both", target: `${titelVon(keep)} · ${titelVon(drop)}` });
      return res.json({ ok: true });
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
