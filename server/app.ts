// createApp — die Middleware-Kette und das Mounting der Router.
//
// Die REIHENFOLGE ist hier bewusst und darf nicht umsortiert werden:
//   1. Import-Routen mit eigenem Body-Limit (große Backups/Markdown-Batches),
//      BEVOR das globale 1mb-Limit registriert wird — express.json überspringt
//      bereits geparste Bodies, daher würde das globale Limit sie sonst mit
//      413 abweisen (P1-Kommentar, seit 2.10).
//   2. Globale Parser (1mb) und das Lizenz-Gate.
//   3. Alle übrigen Router.
//   4. Zentrale Fehlerbehandlung ganz am Ende.
import express from "express";
import helmet from "helmet";
import compression from "compression";
import path from "path";
import os from "os";
import type { KeptaStore } from "../src/core/store";
import type { MemoryRecord as CoreMemory } from "../src/core/types";
import { erstelleLimiter } from "./helfer/limiter";
import { mountActivity } from "./router/activity";
import { mountImporte } from "./router/importe";
import { mountMemories } from "./router/memories";
import { mountSearch } from "./router/search";
import { mountScan } from "./router/scan";
import { mountInbox } from "./router/inbox";
import { mountSync } from "./router/sync";
import { mountMcp } from "./router/mcp";
import { mountChat } from "./router/chat";
import { mountClip } from "./router/clip";
import { mountSettings } from "./router/settings";
import { mountLicense } from "./router/license";
import { mountSystem } from "./router/system";
import { mountAudit } from "./router/audit";
import { mountSchild } from "./router/schild";
import { mountBriefing } from "./router/briefing";
import { mountClients } from "./router/clients";
import { mountTeam } from "./router/team";
import { mountChatImport } from "./router/importe";
import { nurDieserRechner } from "../src/lib/herkunft";
import { mountFreemium } from "./helfer/freemium";
import { ersterStartSichern } from "./helfer/probetag";
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

// Freemium statt Sperre: die App ist nie verriegelt. Die Pro-Werkzeuge
// (chat, clip, scan, dossier …) laufen ohne Schlüssel mit großzügigen
// Tageslimiten, mit Schlüssel unbegrenzt — die Regeln stehen in
// server/helfer/freemium.ts. Frei bleibt, was der offene Kern auch kann
// (Notizen, Suche, Import, Sync, Export, MCP), die Lizenz selbst und der
// Wiederherstellungsschlüssel: die Daten sind nie Geisel der Lizenz.

export function createApp(store: KeptaStore, optionen: AppOptionen = {}) {
  const app = express();

  // Der Pro-Tag: die echte App sichert den Erststart-Zeitstempel einmal hier —
  // im Schlüsselbund und im Plan-Zustand (planzustand.ts), damit ein Neustart
  // keinen neuen Tag startet. Tests starten ohne die Option und bleiben
  // limiten-hermetisch.
  const datenOrdner = process.env.KEPTA_DATA_DIR || path.join(os.homedir(), ".kepta");
  if (optionen.probetag) ersterStartSichern(store, datenOrdner);

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
    istLizenziert: () => false, // wird von mountLicense überschrieben
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

  // 2) Globales Payload-Limit für alle übrigen Routen (1mb — 50mb war viel zu groß, DoS)
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: false }));

  // Aktivitätshub: baut publishActivity/markiereEigeneAenderung und den
  // DB-Change-Watcher; der SSE-Endpunkt wird hier registriert.
  mountActivity(app, ctx);

  // 3) Lizenz + Freemium-Limits nach den Import-Routen, vor allen Fachrouten.
  mountLicense(app, ctx);
  mountFreemium(app, ctx);

  // 4) Audit-Ummantelung zuerst — sie muss vor allen Fachrouten stehen,
  //    damit jede Änderung erfasst wird, die gleich folgt.
  mountAudit(app, ctx);

  // 5) Die Fachrouten.
  mountMemories(app, ctx);
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
  // HTML-Standardseite beim Client). Die API spricht JSON, also JSON-Fehler;
  // wer schon antwortet (SSE-Streams), bekommt nur das Ende der Verbindung.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    const status =
      (typeof err === "object" && err !== null && "status" in err && Number((err as { status: unknown }).status)) ||
      (typeof err === "object" && err !== null && "statusCode" in err && Number((err as { statusCode: unknown }).statusCode)) ||
      500;
    const gueltig = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
    const message = err instanceof Error ? err.message : "Internal server error";
    if (gueltig >= 500) console.error("Unhandled API error:", err);
    res.status(gueltig).json({ error: message });
  });

  return app;
}
