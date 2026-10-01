// --- Privacy Shield + verwaltete Richtlinien ---
// Das Schild ersetzt persönliche Werte durch Platzhalter, bevor etwas zu einem
// Cloud-Modell geht; private Notizen gehen nie raus (chatSchutz im Chat-Router).
// Die Richtlinien kommen aus der verwalteten Konfiguration (MDM) — was die
// Organisation vorgibt, ohne Geheimnisse, nur Zustände.
import express from "express";
import { Schild, beschreibe, istLokaleAdresse, ohnePrivateBloecke, leseSchildEinstellungen, SCHILD_SCHLUESSEL } from "../../src/lib/schild";
import { liesVerwaltet, richtlinie } from "../../src/lib/richtlinien";
import { liste as auditListe, schreibe as protokolliere } from "../../src/lib/pruefprotokoll";
import type { KeptaStore } from "../../src/core/store";
import type { AppKontext } from "../kontext";
import { werIst } from "../helfer/werist";

/** Schild-Einstellungen des Stores — geteilt mit dem Chat-Router. */
export function schildEinstellungen(store: KeptaStore) {
  return leseSchildEinstellungen(store.einstellungen()[SCHILD_SCHLUESSEL]);
}

/** IDs aller aktiven privaten Notizen — geteilt mit dem Chat-Router. */
export function privateIds(store: KeptaStore): Set<string> {
  return new Set((store.db.prepare("SELECT id FROM memories WHERE scope = 'private' AND deleted_at IS NULL").all() as { id: string }[]).map((z) => z.id));
}

export { Schild, beschreibe, istLokaleAdresse, ohnePrivateBloecke };

export function mountSchild(app: express.Express, ctx: AppKontext): void {
  const { store } = ctx;

  app.get("/api/shield", (_req, res) => {
    const woche = Date.now() - 7 * 86_400_000;
    const chats = auditListe(store, { action: "cloud chat", limit: 500 }).entries.filter((e) => e.at > woche);
    res.json({ ...schildEinstellungen(store), privateNotes: privateIds(store).size, week: { cloudChats: chats.length, protectedChats: chats.filter((e) => /hidden:/.test(e.detail ?? "")).length } });
  });

  app.put("/api/shield", ctx.limiter.write, (req, res) => {
    const b = (req.body ?? {}) as { chat?: unknown; apps?: unknown };
    const neu = { ...schildEinstellungen(store) };
    if (typeof b.chat === "boolean") neu.chat = b.chat;
    if (typeof b.apps === "boolean") neu.apps = b.apps;
    // Zentrale Richtlinie privacy_shield=force_on: der Schutz bleibt an —
    // der Versuch, ihn abzuschalten, wird stillschweigend als "an" verbucht.
    if (richtlinie("privacy_shield") === "force_on") {
      neu.chat = true;
      neu.apps = true;
    }
    store.setzeEinstellungen({ [SCHILD_SCHLUESSEL]: JSON.stringify(neu) });
    protokolliere(store, { actor: werIst(req), action: "privacy shield", target: `cloud AI ${neu.chat ? "on" : "off"} · AI apps ${neu.apps ? "on" : "off"}` });
    res.json(neu);
  });

  // Verwaltete Konfiguration für das Organisations-Panel: welche Richtlinien
  // die Organisation vorgegeben hat — ohne Geheimnisse, nur Zustände.
  app.get("/api/policies", (_req, res) => {
    const verwaltet = liesVerwaltet();
    res.json({
      managed: verwaltet !== null,
      policies: verwaltet?.richtlinien ?? {},
      licensePreProvisioned: verwaltet?.license_key !== undefined,
    });
  });
}
