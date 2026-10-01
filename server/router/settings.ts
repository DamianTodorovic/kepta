// Einstellungen und adaptives Profil — im Datenordner bzw. (seit 2.11)
// verschlüsselt in der Datenbank, nicht im Browserspeicher.
//
// Die Electron-Huelle laesst sich vom Betriebssystem einen FREIEN Port geben
// (net.Server.listen(0)) und laedt das Fenster von http://127.0.0.1:<port>.
// Dieser Port ist bei jedem Start ein anderer — und localStorage haengt am
// Ursprung, also an Schema, Host UND Port. Jeder Neustart bekam damit einen
// frischen, leeren Speicher. Hier überleben die Einstellungen den Neustart,
// das Neuinstallieren der Anwendung und den Portwechsel.
import fs from "fs";
import path from "path";
import express from "express";
import { sanitizeText, sanitizeTags } from "../../src/core/sanitize";
import { uebernimmSettingsDatei } from "../helfer/settings-datei";
import { bodyOf } from "../helfer/body";
import { leseJsonDatei, schreibeJsonDatei, nebendateiSchluessel } from "../../src/core/nebendateien";
import type { AppKontext } from "../kontext";

const MAX_SETTINGS_BYTES = 64 * 1024;

export function mountSettings(app: express.Express, ctx: AppKontext): void {
  const { store } = ctx;

  // --- Adaptives Profil (je Nutzer individuell) ---
  const PROFILE_FILE = path.join(ctx.datenOrdner, "profile.json");
  // Derselbe Schlüssel wie für die Wissensbasis — einmal geholt, in der
  // Closure gehalten. null = bewusster Klartext (KEPTA_ENCRYPTION=off).
  const nebendateiSchl = nebendateiSchluessel(ctx.datenOrdner);
  app.get("/api/profile", (_req, res) => {
    try {
      res.json(leseJsonDatei<Record<string, unknown>>(PROFILE_FILE, nebendateiSchl));
    } catch {
      res.json(null);
    }
  });
  app.post("/api/profile", (req, res) => {
    try {
      // Hardened: size limit + sanitize
      const body = bodyOf<Record<string, unknown>>(req);
      if (JSON.stringify(body).length > 10000) return res.status(413).json({ error: "Profile too large (max 10k)" });
      const safe: Record<string, string> = {};
      for (const [k, v] of Object.entries(body || {})) {
        if (typeof v === "string") safe[k] = sanitizeText(v, 2000);
        else if (Array.isArray(v)) safe[k] = sanitizeTags(v).join(",");
        else if (typeof v === "boolean") (safe as Record<string, unknown>)[k] = v;
      }
      fs.mkdirSync(ctx.datenOrdner, { recursive: true });
      schreibeJsonDatei(PROFILE_FILE, safe, nebendateiSchl);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "The profile could not be saved" });
    }
  });

  // Seit 2.11 in der (verschluesselten) Datenbank — die alte Klartextdatei wandert einmalig hinein.
  uebernimmSettingsDatei(store, path.join(ctx.datenOrdner, "settings.json"));

  app.get("/api/settings", (_req, res) => {
    try {
      res.json(store.einstellungen());
    } catch {
      res.json({});
    }
  });

  app.put("/api/settings", ctx.limiter.write, (req, res) => {
    try {
      const body = bodyOf<Record<string, unknown> | undefined>(req);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return res.status(400).json({ error: "Settings must be an object" });
      }
      const bestand = store.einstellungen();
      const aenderungen: Record<string, string | null> = {};
      // Nur Zeichenketten: der Browserspeicher kennt nichts anderes, und so
      // kann von hier auch nichts Unerwartetes in die Oberflaeche zurueckfliessen.
      for (const [k, v] of Object.entries(body)) {
        if (typeof k !== "string" || k.length === 0 || k.length > 120) continue;
        if (v === null) { aenderungen[k] = null; delete bestand[k]; continue; }
        if (typeof v !== "string") continue;
        aenderungen[k] = bestand[k] = v.slice(0, 20000);
      }
      if (JSON.stringify(bestand, null, 2).length > MAX_SETTINGS_BYTES) return res.status(413).json({ error: "Settings too large" });
      res.json({ ok: true, keys: store.setzeEinstellungen(aenderungen) });
    } catch {
      res.status(500).json({ error: "The settings could not be saved" });
    }
  });
}
