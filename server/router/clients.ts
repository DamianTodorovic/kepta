// --- KI-Apps: wer nutzt K3PTA, was die Agenten tun — und neue Apps verbinden ---
// Die Umgebung (wo Claude, Cursor & Co. ihre Konfiguration halten) kommt aus
// den Optionen; in der App zeigt der Eintrag auf den Server in der App selbst,
// sonst auf npx.
import express from "express";
import { letzteAktivitaet, agenten, anzeigeName } from "../../src/lib/aktivitaet";
import { finde as findeApps, verbinde as verbindeApp, standardUmgebung, NPX_EINTRAG, type Eintrag } from "../../src/lib/einrichtung";
import { schreibe as protokolliere } from "../../src/lib/pruefprotokoll";
import { mcpStartInDerApp } from "../helfer/mcp-start";
import { resolveDistDir } from "../helfer/pfad";
import { werIst } from "../helfer/werist";
import type { AppKontext } from "../kontext";

export function mountClients(app: express.Express, ctx: AppKontext): void {
  const { store } = ctx;

  const umgebung = ctx.optionen.umgebung ?? standardUmgebung();
  // In the desktop app the entry points to the server inside it. __dirname only
  // exists in the bundle — `npm run dev` runs this file as ESM, where reading it
  // bare would stop the server before it starts.
  const mcpEintrag: Eintrag =
    ctx.optionen.eintrag ?? mcpStartInDerApp(process.versions.electron, process.execPath, typeof __dirname === "string" ? __dirname : resolveDistDir()) ?? NPX_EINTRAG;

  app.get("/api/agents", (req, res) => {
    const nach = Math.max(0, Number(req.query.after) || 0);
    const entries = letzteAktivitaet(store, nach, 50).map((e) => {
      const notiz = e.memoryId ? store.getMemory(e.memoryId) : null;
      const lebt = notiz && !notiz.deletedAt ? notiz : null;
      return { id: e.id, at: e.at, who: anzeigeName(e.client), tool: e.tool, text: lebt ? lebt.title : e.text, noteId: lebt ? lebt.id : null, count: e.count };
    });
    res.json({ entries, agents: agenten(store) });
  });

  app.get("/api/clients", (_req, res) => {
    res.json({ clients: findeApps(umgebung, mcpEintrag) });
  });

  app.post("/api/clients/:id/connect", ctx.limiter.write, (req, res) => {
    const id = String(req.params.id || "");
    if (!/^[\w-]{1,40}$/.test(id)) return res.status(400).json({ error: "Unknown app." });
    const r = verbindeApp(id, umgebung, mcpEintrag);
    const clients = findeApps(umgebung, mcpEintrag);
    if (r.ok) protokolliere(store, { actor: werIst(req), action: "connect app", target: clients.find((c) => c.id === id)?.name ?? id, detail: r.backup ? `backup: ${r.backup}` : null });
    res.status(r.ok ? 200 : 400).json({ ...r, error: r.ok ? undefined : r.message, clients });
  });
}
