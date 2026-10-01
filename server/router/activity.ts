// Aktivitätshub: SSE-Stream + DB-Change-Watcher.
//
// --- DB-Change-Watcher: fremde Prozesse (MCP stdio, Claude Desktop, ZCode) ---
// schreiben direkt in die SQLite-DB ohne den Activity-Hub zu kennen. Die App
// pollt deshalb count+max(updated_at) und facht den SSE-Stream selbst an.
import express from "express";
import type { AppKontext, ActivityEvent } from "../kontext";

const DB_WATCH_MS = 4000;

export function mountActivity(app: express.Express, ctx: AppKontext): void {
  const { store } = ctx;
  let lastDbCount: number | null = null;
  let lastDbUpdatedAt: number | null = null;
  /**
   * Wann hat die App zuletzt SELBST etwas gemeldet?
   *
   * Der Waechter kann nicht sehen, WER geschrieben hat — er sieht nur, dass sich
   * die Zaehlung geaendert hat. Ohne diese Notiz meldete er auch eigene Importe
   * als "von aussen": nach einem Rechner-Scan stand "An agent saved a node" auf
   * dem Bildschirm, obwohl der Nutzer den Import gerade selbst ausgeloest hatte.
   */
  let letzteEigeneMeldung = 0;
  const dbWatcher = setInterval(() => {
    try {
      const row = store.db.prepare("SELECT COUNT(*) c, COALESCE(MAX(updated_at),0) m FROM memories").get() as { c: number; m: number };
      // Separater Zustand statt parseInt auf einem kombinierten Fingerprint-String
      if (lastDbCount !== null && (row.c !== lastDbCount || row.m !== lastDbUpdatedAt)) {
        // Nur melden, wenn die Aenderung nicht von der App selbst kam. Ein
        // fremder Prozess (MCP ueber stdio, Claude Desktop) meldet sich hier
        // nicht — genau der soll gefunden werden.
        if (Date.now() - letzteEigeneMeldung > DB_WATCH_MS + 1000) {
          ctx.publishActivity({ type: row.c > lastDbCount ? "save" : "update", source: "agent", title: "The brain was updated from outside" });
        }
      }
      lastDbCount = row.c;
      lastDbUpdatedAt = row.m;
    } catch { /* DB kurz gesperrt — nächster Tick */ }
  }, DB_WATCH_MS);
  dbWatcher.unref();

  const activityClients = new Set<express.Response>();
  const lastSearchPublish = { ts: 0 };
  ctx.publishActivity = (evt: Omit<ActivityEvent, "ts">, opts: { throttleSearchMs?: number } = {}) => {
    if (evt.type === "search" && opts.throttleSearchMs) {
      if (Date.now() - lastSearchPublish.ts < opts.throttleSearchMs) return;
      lastSearchPublish.ts = Date.now();
    }
    if (evt.source !== "agent") letzteEigeneMeldung = Date.now();
    const payload = `data: ${JSON.stringify({ ...evt, ts: Date.now() })}\n\n`;
    for (const client of activityClients) {
      try { client.write(payload); } catch { activityClients.delete(client); }
    }
  };
  ctx.markiereEigeneAenderung = () => {
    letzteEigeneMeldung = Date.now();
  };

  app.get("/api/activity", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`data: ${JSON.stringify({ type: "save", source: "app", ts: Date.now(), hello: true })}\n\n`);
    activityClients.add(res);
    const heartbeat = setInterval(() => {
      try { res.write(": hb\n\n"); } catch { /* ignore */ }
    }, 15_000);
    req.on("close", () => {
      clearInterval(heartbeat);
      activityClients.delete(res);
    });
  });
}
