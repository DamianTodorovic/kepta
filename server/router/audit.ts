// --- Audit-Log: jede Änderung, die in der App oder über die HTTP-API geschieht ---
// KI-Apps über MCP erfasst src/lib/mcpwache.ts mit genau, was sie gesehen haben,
// und der Chat vermerkt, was zu einem Cloud-Modell ging (chatSchutz im Chat-Router).
// Hier: die Routen, die die Wissensbasis verändern — erst wenn sie gelungen sind.
import express from "express";
import { liste as auditListe, pruefe as auditPruefe, alsCsv as auditCsv, auswahl as auditAuswahl, schreibe as protokolliere, gelesenVon } from "../../src/lib/pruefprotokoll";
import { werIst } from "../helfer/werist";
import type { AppKontext } from "../kontext";

export function mountAudit(app: express.Express, ctx: AppKontext): void {
  const { store } = ctx;

  const titelVon = (id: string) => store.getMemory(id)?.title ?? id;
  const anzahl = (n: number, wort: string) => `${n} ${wort}${n === 1 ? "" : "s"}`;
  const idsIm = (req: express.Request) => {
    const ids = (req.body as { ids?: unknown } | undefined)?.ids;
    return Array.isArray(ids) ? ids.map(String) : [];
  };
  type Auditregel = [
    string,
    RegExp,
    (req: express.Request, m: RegExpExecArray, vorher: unknown) => { action: string; target?: string | null; detail?: string | null } | null,
    /** Looks before the handler runs — e.g. whether the note to delete exists at all. */
    ((req: express.Request, m: RegExpExecArray) => unknown)?,
  ];
  const AUDIT_REGELN: Auditregel[] = [
    [
      "POST",
      /^\/api\/memor(?:y|ies)$/,
      (req) => {
        const b = (req.body ?? {}) as { id?: unknown; title?: unknown };
        const id = typeof b.id === "string" ? b.id : null;
        return { action: id ? "update" : "save", target: typeof b.title === "string" && b.title ? b.title : id ? titelVon(id) : null, detail: id };
      },
    ],
    [
      "DELETE",
      /^\/api\/memories\/([^/]+)$/,
      (req, m, vorher) =>
        typeof vorher === "string"
          ? { action: req.query.permanent === "1" || req.query.permanent === "true" ? "delete permanently" : "delete", target: vorher, detail: decodeURIComponent(m[1]!) }
          : null,
      (req, m) => {
        // Only a note that exists (and, for the trash, is not in it already) can be deleted.
        const n = store.getMemory(decodeURIComponent(m[1]!));
        const endgueltig = req.query.permanent === "1" || req.query.permanent === "true";
        return n && (endgueltig || !n.deletedAt) ? n.title : null;
      },
    ],
    ["POST", /^\/api\/memories\/bulk-delete$/, (req) => ({ action: "delete", target: anzahl(idsIm(req).length, "note"), detail: idsIm(req).slice(0, 25).join(", ") || null })],
    ["POST", /^\/api\/memories\/bulk-restore$/, (req) => ({ action: "restore", target: anzahl(idsIm(req).length, "note") })],
    ["POST", /^\/api\/memories\/([^/]+)\/restore$/, (_req, m) => ({ action: "restore", target: titelVon(decodeURIComponent(m[1]!)), detail: decodeURIComponent(m[1]!) })],
    ["POST", /^\/api\/memories\/reclassify$/, (req) => ((req.body as { apply?: unknown } | undefined)?.apply === true ? { action: "reclassify", target: "kinds of knowledge" } : null)],
    ["POST", /^\/api\/(?:memories\/import|import\/markdown)$/, () => ({ action: "import", target: "notes" })],
    ["POST", /^\/api\/export\/markdown$/, () => ({ action: "export", target: "Markdown folder" })],
    ["POST", /^\/api\/sync\/export$/, () => ({ action: "export", target: "Device Sync bundle" })],
    ["POST", /^\/api\/sync\/import$/, () => ({ action: "import", target: "Device Sync bundle" })],
    ["POST", /^\/api\/scan\/start$/, () => ({ action: "scan", target: "this computer" })],
    ["POST", /^\/api\/clip$/, (req) => ({ action: "clip", target: String((req.body as { url?: unknown } | undefined)?.url ?? "") || null })],
    ["POST", /^\/api\/repair\/imports$/, () => ({ action: "repair", target: "imported files" })],
    ["POST", /^\/api\/recovery-key$/, () => ({ action: "show recovery key" })],
  ];

  // Muss VOR allen Fachrouten registriert werden (app.ts): sie ummanteln die
  // Antworten mit res.on("finish") — nur gelungene Änderungen (2xx/3xx) stehen im Log.
  app.use((req, res, next) => {
    for (const [methode, muster, beschreibe, vor] of AUDIT_REGELN) {
      if (req.method !== methode) continue;
      const m = muster.exec(req.path);
      if (!m) continue;
      let vorher: unknown;
      try {
        vorher = vor?.(req, m);
      } catch {
        vorher = null;
      }
      res.on("finish", () => {
        if (res.statusCode >= 400) return;
        try {
          const e = beschreibe(req, m, vorher);
          if (e) protokolliere(store, { actor: werIst(req), ...e });
        } catch {
          // the audit log never breaks a request
        }
      });
      break;
    }
    next();
  });

  app.get("/api/audit", (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    res.json({ ...auditListe(store, { actor: q.actor || undefined, action: q.action || undefined, q: q.q || undefined, vor: Number(q.before) || undefined, limit: Number(q.limit) || 100 }), ...auditAuswahl(store) });
  });
  app.get("/api/audit/verify", (_req, res) => {
    res.json(auditPruefe(store));
  });
  app.get("/api/audit/export.csv", (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const csv = auditCsv(store, { actor: q.actor || undefined, action: q.action || undefined, q: q.q || undefined });
    protokolliere(store, { actor: werIst(req), action: "export", target: "audit log (CSV)" });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="kepta-audit-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  });
  app.get("/api/memories/:id/readers", (req, res) => {
    res.json({ readers: gelesenVon(store, String(req.params.id || "")) });
  });
}
