// --- Team (Enterprise, Milestone E1) ---
// Lesbare Übersicht über Edition, Seats und Rollen. Die Rollen selbst werden
// zentral verwaltet (managed-settings.json, MDM) — die App gehorcht, sie
// editiert sie nicht. Werkzeuge ohne Business-/Enterprise-Edition bekommen
// team: null und dürfen team:*-Scopes weder lesen noch schreiben (team.ts).
import express from "express";
import { teamUebersicht } from "../../src/lib/team";
import { hinterlegteLizenz } from "./license";
import type { AppKontext } from "../kontext";

export function mountTeam(app: express.Express, ctx: AppKontext): void {
  app.get("/api/team", (req, res) => {
    const lizenz = hinterlegteLizenz(ctx);
    const pruefung = lizenz?.pruefung.gueltig ? lizenz.pruefung : null;
    // Der Store-Actor heißt "local" (SINGLE_LOCAL_USER) — query.actor erlaubt
    // explizite Fragen („welche Rolle hätte gast?").
    const uebersicht = teamUebersicht(ctx.store, (req.query.actor as string | undefined) ?? "local");
    res.json({
      edition: pruefung?.edition ?? uebersicht.edition,
      seats: pruefung?.seats,
      team: uebersicht.team,
    });
  });
}
