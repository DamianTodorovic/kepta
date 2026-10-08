// --- Team (Milestone E1) ---
// Lesbare Übersicht über die Rollen. Die Rollen selbst werden zentral verwaltet
// (managed-settings.json, MDM) — die App gehorcht, sie editiert sie nicht. Ohne
// Rollen-Datei ist team:* dicht und die Antwort trägt `team: null`.
import express from "express";
import { teamUebersicht } from "../../src/lib/team";
import type { AppKontext } from "../kontext";

export function mountTeam(app: express.Express, ctx: AppKontext): void {
  app.get("/api/team", (req, res) => {
    // Der Store-Actor heißt "local" (SINGLE_LOCAL_USER) — query.actor erlaubt
    // explizite Fragen („welche Rolle hätte gast?").
    const uebersicht = teamUebersicht((req.query.actor as string | undefined) ?? "local");
    res.json({ team: uebersicht.team });
  });
}
