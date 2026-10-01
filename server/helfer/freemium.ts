// Freemium statt Sperre: KEPTA sperrt die App nie — die Pro-Werkzeuge laufen
// ohne Schlüssel mit großzügigen TAGESLIMITEN, mit Schlüssel unbegrenzt, und
// an den ersten 24 Stunden (der Pro-Tag, probetag.ts) sogar ohne jede Grenze.
// Die Limits sind bewusst kein Phone-home (der Zähler lebt im Prozess, kein
// Account): wer die Werkzeuge ernstlich nutzt, stoßt an die Grenze und sieht,
// was Pro bringt — alle anderen merken nichts. Bei einem Neustart des
// Prozesses beginnen die Zähler neu; das ist Absicht: großzügig gegenüber dem
// Nutzer, streng genug für die Marge.
import type express from "express";
import type { AppKontext } from "../kontext";
import { probetagStatus } from "./probetag";
import { verbrauchtFuer, zaehleFuer } from "./planzustand";

export const UPGRADE_URL = process.env.KEPTA_UPGRADE_URL || "https://kepta.pro/upgrade";

/**
 * Ist der echte Checkout live? Nur wenn KEPTA_UPGRADE_URL gesetzt ist. Ohne
 * ihn zeigt der Kauf-Weg auf Damians LinkedIn — niemals auf eine tote
 * kepta.pro-Adresse (Paddle ist noch in Prüfung, der Worker steht noch nicht).
 */
export const CHECKOUT_LIVE = Boolean(process.env.KEPTA_UPGRADE_URL);

interface FreemiumRegel {
  muster: RegExp;
  methode: "GET" | "POST" | "PUT" | "DELETE";
  feature: string;
  limit: number;
  /** Nutzerlesbare Beschreibung für die Grenz-Meldung. */
  beschreibung: string;
}

// Nur die AUSSCHLAGGEBENDEN Aufrufe zählen: Status-/Konfig-Polls (Scan-Status,
// Scan-Policy) laufen nie ins Limit — die UI fragt sie im Sekundentakt ab.
const FREEMIUM_REGELN: FreemiumRegel[] = [
  { muster: /^\/api\/chat(\/|$)/, methode: "POST", feature: "chat", limit: 10, beschreibung: "chat messages" },
  { muster: /^\/api\/clip(\/|$)/, methode: "POST", feature: "clip", limit: 5, beschreibung: "clipped pages" },
  { muster: /^\/api\/models(\/|$)/, methode: "POST", feature: "models", limit: 10, beschreibung: "model lookups" },
  { muster: /^\/api\/open(\/|$)/, methode: "POST", feature: "open", limit: 5, beschreibung: "opened files" },
  { muster: /^\/api\/scan\/(preview|start)$/, methode: "POST", feature: "scan", limit: 2, beschreibung: "computer scans" },
  { muster: /^\/api\/profile$/, methode: "POST", feature: "profile", limit: 20, beschreibung: "profile saves" },
  { muster: /^\/api\/briefing(\/|$)/, methode: "GET", feature: "briefing", limit: 40, beschreibung: "daily briefings" },
  { muster: /^\/api\/dossier(\/|$)/, methode: "GET", feature: "dossier", limit: 10, beschreibung: "dossiers" },
  { muster: /^\/api\/audit(\/|$)/, methode: "GET", feature: "audit", limit: 100, beschreibung: "audit queries" },
  { muster: /^\/api\/shield(\/|$)/, methode: "GET", feature: "shield", limit: 100, beschreibung: "shield views" },
  { muster: /^\/api\/shield(\/|$)/, methode: "PUT", feature: "shield", limit: 10, beschreibung: "shield changes" },
  { muster: /^\/api\/contradictions(\/|$)/, methode: "POST", feature: "contradictions", limit: 10, beschreibung: "resolutions" },
  { muster: /^\/api\/import\/chat(\/|$)/, methode: "POST", feature: "import-chat", limit: 2, beschreibung: "AI history imports" },
];

/** Welche Regel greift für diesen Request (oder null = frei)? */
function regelFuer(req: express.Request): FreemiumRegel | null {
  for (const r of FREEMIUM_REGELN) {
    if (req.method !== r.methode) continue;
    if (r.muster.test(req.path)) return r;
  }
  return null;
}

/**
 * Die Freemium-Middleware: mit gültigem Schlüssel alles unbegrenzt; während
 * des Pro-Tags ebenfalls (24 h ab Erststart); ohne beides die Tageslimits.
 * Alle Zähler und der Pro-Tag leben PERSISTENT im Plan-Zustand (planzustand.ts,
 * verschlüsselt + authentisiert) — ein Neustart setzt nichts zurück. Sie ist
 * KEIN Gate — sie lässt durch oder antwortet 429 mit dem Upgrade-Weg.
 * Registriert nach den Import-Routen, vor allen Fachrouten (app.ts).
 */
export function mountFreemium(app: import("express").Express, ctx: AppKontext): void {
  app.use((req, res, next) => {
    if (ctx.istLizenziert()) {
      res.setHeader("X-KEPTA-Plan", "pro");
      return next();
    }
    const regel = regelFuer(req);
    if (!regel) return next();
    if (ctx.optionen.probetag && probetagStatus(ctx.store, ctx.datenOrdner).aktiv) {
      // Der Pro-Tag verhält sich für die Werkzeuge exakt wie eine Lizenz —
      // nur die Lizenz-Fußzeile und /api/license erzählen die Wahrheit.
      res.setHeader("X-KEPTA-Plan", "protag");
      return next();
    }
    const verbrauchtHeute = verbrauchtFuer(ctx.store, ctx.datenOrdner, regel.feature);
    res.setHeader("X-KEPTA-Plan", "free");
    // „Remaining" zählt den laufenden Aufruf mit: 19 heißt, nach diesem Ruf bleibt einer.
    res.setHeader("X-KEPTA-Remaining", String(Math.max(0, regel.limit - verbrauchtHeute - 1)));
    if (verbrauchtHeute >= regel.limit) {
      return res.status(429).json({
        error: `Daily free limit reached (${regel.limit} ${regel.beschreibung}/day on the free plan). Activate KEPTA Pro for unlimited use.`,
        feature: regel.feature,
        limit: regel.limit,
        upgradeUrl: UPGRADE_URL,
      });
    }
    // Nur gelungene Aufrufe zählen (2xx/3xx) — ein Fehler kostet den Nutzer nichts.
    res.on("finish", () => {
      if (res.statusCode < 400) zaehleFuer(ctx.store, ctx.datenOrdner, regel.feature);
    });
    next();
  });
}
