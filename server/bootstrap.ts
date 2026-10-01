// ---------- Bootstrap (Store, Queue, SPA-Serving, listen) ----------
// Nur dieser eine Auftrag startet von selbst (server.ts), beim Import in
// Tests bleibt er still (KEPTA_NO_AUTOSTART).
import path from "path";
import fs from "fs";
import os from "os";
import express from "express";
import { KeptaStore } from "../src/core/store";
import { defaultExtensions } from "../src/core/extensions";
import { teamPolicy, editionAusStore } from "../src/lib/team";
import { schluesselbundKeyProvider } from "../src/core/schluessel";
import { migrateFromLegacyJson } from "../src/core/migrate";
import { EmbeddingQueue } from "../src/core/embeddings";
import { aktiviereSuchCacheDelta } from "../src/core/engine";
import { TOOLS as MCP_TOOLS } from "../src/core/mcp";
import { createApp } from "./app";
import { resolveDistDir } from "./helfer/pfad";

export { createApp } from "./app";

export async function startServer() {
  const PORT = parseInt(process.env.PORT || "3000", 10);
  // Default nur Loopback — die API hat keine Auth (Memories lesen/löschen, Chat-Proxy
  // mit API-Keys). Bindung an alle Interfaces nur bewusst via KEPTA_HOST.
  const HOST = process.env.KEPTA_HOST || "127.0.0.1";

  // Der Schluessel liegt im Schluesselbund des Systems (schluessel.ts).
  const datenOrdner = process.env.KEPTA_DATA_DIR || path.join(os.homedir(), ".kepta");
  // Enterprise (Milestone E1): team:*-Scopes nach Rollen aus der verwalteten
  // Konfiguration durchsetzen. Die Edition wird live aus der Lizenz gelesen
  // (storeRef — die Lizenz kann im Betrieb aktiviert werden); nicht-team-Scopes
  // bleiben exakt wie immer, Pro verhält sich unverändert.
  const storeRef: { store: KeptaStore } = {} as { store: KeptaStore };
  const store = new KeptaStore(undefined, {
    ...defaultExtensions(),
    keys: schluesselbundKeyProvider(datenOrdner),
    ...teamPolicy({ edition: () => editionAusStore(storeRef.store) }),
  });
  storeRef.store = store;
  const migration = migrateFromLegacyJson(store);
  if (!migration.skipped) {
    console.log(`Migration: ${migration.migrated} nodes taken over from memories.json (backup: ${migration.backupPath ?? "none"})`);
  }
  const embeddingQueue = new EmbeddingQueue(store);
  embeddingQueue.start();
  // Kern 3.1.x: der Such-Cache wächst mit jedem Write delta-basiert weiter —
  // derselbe Aufruf wie im Kern-Server (server.ts: aktiviereSuchCacheDelta).
  aktiviereSuchCacheDelta(store);

  // Der Pro-Tag: die echte App (Electron-Hülle, npm start) sichert den
  // Erststart — 24 h volle Pro-Werkzeuge, dann Free mit Tageslimiten. Tests
  // bauen die App ohne diese Option und bleiben limiten-hermetisch.
  const app = createApp(store, { probetag: true });

  // Vite-Dev-Middleware: der tsx-Dev-Server (`npm run dev`) nutzt sie immer —
  // das gebündelte dist/server.cjs (`npm start`, Electron) dagegen nur, wenn KEIN
  // Build vorliegt und nicht in Produktion. Sonst liefert `npm start` ohne gesetztes
  // NODE_ENV fälschlich den Vite-Dev-Server statt des statischen dist.
  const runningFromSource = /\.[cm]?tsx?$/.test(process.argv[1] ?? "");
  const devAllowed = process.env.NODE_ENV !== "production" && !process.env.ELECTRON_RUN_AS_NODE;
  const distDir = resolveDistDir();
  const hasBuiltApp = fs.existsSync(path.join(distDir, "index.html"));
  let spaServed = false;
  if (devAllowed && (runningFromSource || !hasBuiltApp)) {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      spaServed = true;
    } catch {
      // Vite in dieser Umgebung nicht verfügbar (z.B. gepackte App) → statischer Fallback
    }
  }
  if (!spaServed) {
    app.use(express.static(distDir));
    // Express 5: benannte Wildcards — "/{*splat}" matcht auch die Wurzel "/".
    app.get('/{*splat}', (req, res) => {
      // API-Routen nicht überschreiben
      if (req.path.startsWith("/api/") || req.path === "/mcp") return res.status(404).json({ error: "Not found" });
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}${HOST === "127.0.0.1" ? "" : "  (all interfaces — KEPTA_HOST is set explicitly)"}`);
    const v = store.verschluesselung;
    console.log(`Encryption: ${v.aktiv ? `on (${v.ablage ?? "key provider"}${v.umgewandelt ? ", converted from plaintext just now" : ""})` : `OFF${v.hinweis ? ` — ${v.hinweis}` : ""}`}`);
    console.log(`Speicher: ${store.dbPath} (SQLite) | Embeddings: ${JSON.stringify(store.embeddingStats())}`);
    console.log(`API: http://localhost:${PORT}/api/health | /api/search | MCP: POST /mcp (2026-07-28, ${MCP_TOOLS.length} Tools)`);
    // Adresse hinterlegen, damit fremde Clients die App finden: die gepackte App
    // läuft auf einem zufälligen Port, ohne diese Datei wäre sie unauffindbar.
    try {
      fs.writeFileSync(
        path.join(datenOrdner, "endpoint.json"),
        JSON.stringify({ url: `http://127.0.0.1:${PORT}`, port: PORT, pid: process.pid, startedAt: new Date().toISOString() }, null, 2),
      );
    } catch { /* nicht schreibbar — Clients nutzen dann KEPTA_URL oder den Standardport */ }
    if (process.send) process.send('server-ready');
  });
  // Listen-Fehler sauber behandeln — z. B. EADDRINUSE durch getFreePort-TOCTOU in der
  // Electron-Shell: klare Logausgabe statt unbehandeltem Crash-Dialog.
  server.on("error", (err: NodeJS.ErrnoException) => {
    console.error(`Server listen error (${err.code ?? "unknown"}): ${err.message}`);
    process.exit(1);
  });
}
