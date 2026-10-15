// createApp — die Middleware-Kette und das Mounting der Router.
//
// Die REIHENFOLGE ist hier bewusst und darf nicht umsortiert werden:
//   1. Import-Routen mit eigenem Body-Limit (große Backups/Markdown-Batches),
//      BEVOR das globale 1mb-Limit registriert wird — express.json überspringt
//      bereits geparste Bodies, daher würde das globale Limit sie sonst mit
//      413 abweisen (P1-Kommentar, seit 2.10).
//   2. Globale Parser (1mb) und der Wiederherstellungsschlüssel.
//   3. Alle übrigen Router.
//   4. Zentrale Fehlerbehandlung ganz am Ende.
import express from "express";
import helmet from "helmet";
import compression from "compression";
import path from "path";
import os from "os";
import type { KeptaStore } from "../src/core/store";
import { leseUmwelt } from "../src/core/umwelt";
import type { MemoryRecord as CoreMemory } from "../src/core/types";
import { erstelleLimiter } from "./helfer/limiter";
import { mountActivity } from "./router/activity";
import { mountImporte } from "./router/importe";
import { mountMemories } from "./router/memories";
import { mountNachzug } from "./router/nachzug";
import { mountSearch } from "./router/search";
import { mountScan } from "./router/scan";
import { mountInbox } from "./router/inbox";
import { mountSync } from "./router/sync";
import { mountMcp } from "./router/mcp";
import { mountChat } from "./router/chat";
import { mountClip } from "./router/clip";
import { mountSettings } from "./router/settings";
import { mountRecoveryKey } from "./router/recovery-key";
import { mountSystem } from "./router/system";
import { mountAudit } from "./router/audit";
import { mountSchild } from "./router/schild";
import { mountBriefing } from "./router/briefing";
import { mountClients } from "./router/clients";
import { mountTeam } from "./router/team";
import { mountChatImport } from "./router/importe";
import { nurDieserRechner } from "../src/lib/herkunft";
import type { AppOptionen, AppKontext } from "./kontext";

export type { AppOptionen } from "./kontext";

// CORS — strikt lokal, kein * für Browser-Origins (MCP/curl ohne Origin bleibt erlaubt)
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "app://.",
  "file://",
]);

// Die App ist offen: jedes Werkzeug läuft unbegrenzt, für jede Person, die sie
// herunterlädt. Ein Schlüssel-System und Tageslimits gab es einmal (Freemium mit
// Zählern und einem gratis ersten Tag mit Polzer-Ankern) — seit 09.10.2026 ist ersatzlos weg, weil
// Damian die herunterladbare K3PTA ohne jede Grenze haben will. Was bleibt, sind
// die Schutzbremsen, die nichts mit Bezahlung zu tun haben: nur dieser Rechner
// erreicht den Server, 1mb pro Body, Drosseln gegen Brute-Force, der Knoten-
// deckel, und der Wiederherstellungsschlüssel hinter drei Türstehern.

/** Groessen, die ein Mensch lesen kann — fuer die Fehlerantwort ohne Stapel. */
function menschenGroesse(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
  if (bytes >= 1024 * 1024) return `${+(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

/**
 * A3-04/Q-19 — die einzige Fehlermittelware, identisch zum Kern
 * (`~/kepta-core/server.ts`, sichererFehler). Die App hatte schon einen Haenger,
 * aber er gab `err.message` ungeprueft nach aussen: bei einer 500 stand der
 * interne Grund beim Client (gemessen: "no such table: memories"), bei einer 413
 * nur "request entity too large" ohne jede Groesse — und die Schichten, die
 * bootstrap.ts nach createApp montiert, lagen ueberhaupt nicht unter ihm.
 * Weder Stapel noch Pfad noch der gesandte Body gehen hinaus; der wahre Grund
 * bleibt beim Betreiber, sonst ist eine 500 unauffindbar.
 */
export function sichererFehler(err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) {
  // Abweichung vom Kern, bewusst: der Kern reicht dann an Express weiter (das
  // beendet die Antwort), die App kappt die Verbindung — ihre SSE-Zeile
  // (/api/activity) hat den Kopf schon gesendet und braucht das Ende, nicht
  // einen zweiten Versuch zu antworten.
  if (res.headersSent) {
    res.destroy();
    return;
  }
  const e = (err ?? {}) as { status?: number; statusCode?: number; type?: string; expose?: boolean; message?: string; limit?: number; length?: number };
  const status = [e.status, e.statusCode].find((s) => typeof s === "number" && s >= 400 && s <= 599) ?? 500;

  if (status === 413 || e.type === "entity.too.large") {
    const limitBytes = typeof e.limit === "number" ? e.limit : undefined;
    const receivedBytes = typeof e.length === "number" ? e.length : undefined;
    const text = "Body too large"
      + (limitBytes !== undefined ? ` — this route accepts up to ${menschenGroesse(limitBytes)}` : "")
      + (receivedBytes !== undefined ? `, this request carried ${menschenGroesse(receivedBytes)}` : "")
      + ". Nothing was stored.";
    return res.status(413).json({ error: text, limitBytes, receivedBytes });
  }

  if (status === 400 && (e.type === "entity.parse.failed" || err instanceof SyntaxError)) {
    return res.status(400).json({ error: "Body is not valid JSON — nothing was read. The body itself is not echoed back." });
  }

  if (status >= 500) {
    console.error(`kepta: request failed (${req.method} ${req.path}) — ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    return res.status(status).json({ error: "The request failed inside the server. The reason is in the server log, not in this answer." });
  }
  // 4xx mit expose:true sind nach http-errors-eigener Regel ungefaehrlich;
  // alles andere in dieser Klasse bekommt den Wortlaut ohne Detail.
  const grund = e.expose === true && typeof e.message === "string" ? e.message : "The request could not be handled.";
  res.status(status).json({ error: grund });
}

export function createApp(store: KeptaStore, optionen: AppOptionen = {}) {
  const app = express();

  // Beide Namensformen (Aufgabe #64): K3PTA_DATA_DIR zuerst, KEPTA_DATA_DIR als
  // Rueckfall, ~/.kepta als Default. Wer nur die alte Form setzt, sieht seinen
  // Bestand — kein Zug, kein Doppelbestand.
  const datenOrdner = leseUmwelt("datenordner").wert || path.join(os.homedir(), ".kepta");

  // Only this computer — not a website open in a browser on it (src/lib/herkunft.ts).
  // First of all, so that no route registered below can be reached around it.
  app.use(nurDieserRechner({ bindHost: process.env.KEPTA_HOST }));

  // --- Vollständige Liste via Paginierung — listMemories deckelt pro Seite ---
  function listAllMemories(opts: { trash?: boolean } = {}): CoreMemory[] {
    const out: CoreMemory[] = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const page = store.listMemories({ limit: pageSize, offset, ...opts });
      out.push(...page);
      if (page.length < pageSize) break;
    }
    return out;
  }

  const limiter = erstelleLimiter();

  // Der Kontext: publishActivity/markiereEigeneAenderung fügt mountActivity
  // gleich unten wirklich hinzu (Platzhalter sind nur Absturzschutz für die
  // Zeilen dazwischen — die Reihenfolge garantiert, dass sie zuerst gebaut wird).
  const ctx: AppKontext = {
    store,
    datenOrdner,
    optionen,
    limiter,
    publishActivity: () => { /* wird von mountActivity ersetzt */ },
    markiereEigeneAenderung: () => { /* wird von mountActivity ersetzt */ },
    listAllMemories,
  };

  // --- Security Headers (hardened) ---
  app.use(helmet({
    contentSecurityPolicy: false, // API only, no inline scripts needed
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }));
  app.disable("x-powered-by");
  app.use(compression());
  app.use(limiter.global);

  app.use((req, res, next) => {
    const origin = req.headers.origin as string | undefined;
    if (!origin) {
      // Non-browser (curl, MCP stdio, Electron) — kein Origin, erlaube
      res.header("Access-Control-Allow-Origin", "*");
    } else if (ALLOWED_ORIGINS.has(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
    } else {
      // Unbekannter Origin — blocken für Browser, aber nicht für API-Abuse über curl (kein Origin-Bypass)
      // Für maximale Sicherheit: kein CORS Header → Browser blockt
    }
    res.header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");
    res.header("Access-Control-Max-Age", "86400");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // 1) Import-Routen mit eigenem Body-Limit — vor dem globalen Parser.
  mountImporte(app, ctx);

  // 1b) Anker für Limits, die sonst nur dastehen. Drei Routen des App-Servers
  //     deklarierten eine engere Kappe, als ihr Router mountet: Reparatur 16 kb,
  //     Scan-Konfiguration 256 kb (server/router/scan.ts:203 und :373) und
  //     Oeffnen 16 kb (server/router/system.ts:118). Sie mounten alle hinter dem
  //     globalen Parser — und express.json ueberspringt einen bereits geparsten
  //     Body. Der Kern loest das über die Reihenfolge (kepta-core/server.ts:572
  //     vor :575); hier bekommt jede engere Kappe ihren Parser, bevor das
  //     1mb-Limit sie bekommt. Ohne diese Anker antwortete die App auf 900 kb
  //     mit 200, der Kern mit 413. Haelt tests/server-repair-limit.test.ts: die
  //     Datei liest die deklarierten Kappen aus dem Quelltext und prueft jede
  //     einzelne am echten Horcher — ein viertes Limit kann nicht wieder als
  //     Absicht enden (es war genau so einer, /api/open, von der Sonde gefunden).
  app.use("/api/repair/imports", express.json({ limit: "16kb" }));
  app.use("/api/scan/config", express.json({ limit: "256kb" }));
  app.use("/api/open", express.json({ limit: "16kb" }));

  // 2) Globales Payload-Limit für alle übrigen Routen (1mb — 50mb war viel zu groß, DoS)
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: false }));

  // Aktivitätshub: baut publishActivity/markiereEigeneAenderung und den
  // DB-Change-Watcher; der SSE-Endpunkt wird hier registriert.
  mountActivity(app, ctx);

  // 3) Der Wiederherstellungsschlüssel — nach den Import-Routen, vor allen
  //    Fachrouten, damit sein Body-Limit und seine drei Türsteher gelten.
  mountRecoveryKey(app, ctx);

  // 4) Audit-Ummantelung zuerst — sie muss vor allen Fachrouten stehen,
  //    damit jede Änderung erfasst wird, die gleich folgt.
  mountAudit(app, ctx);

  // 5) Die Fachrouten.
  mountMemories(app, ctx);
  mountNachzug(app, ctx);
  mountSearch(app, ctx);
  mountScan(app, ctx);
  mountInbox(app, ctx);
  mountSync(app, ctx);
  mountMcp(app, ctx);
  mountChat(app, ctx);
  mountClip(app, ctx);
  mountSettings(app, ctx);
  mountSystem(app, ctx);
  mountSchild(app, ctx);
  mountBriefing(app, ctx);
  mountClients(app, ctx);
  mountTeam(app, ctx);
  mountChatImport(app, ctx);

  // 5) Zentrale Fehlerbehandlung — Express 5 leitet Rejections aus async-
  // Handlern automatisch hierher (früher landeten unbehandelte Rejections als
  // HTML-Standardseite beim Client). Die API spricht JSON, also JSON-Fehler.
  // bootstrap.ts haengt dieselbe Mittelware noch einmal an, hinter static und
  // dem SPA-Fallback: Express laeuft die Schicht ab der Fehlerstelle abwaerts.
  app.use(sichererFehler);

  return app;
}
