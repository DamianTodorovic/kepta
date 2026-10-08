// System-Routen: Health, Storage-Info, Wissensgraph, Markdown-Export,
// Dateien öffnen, CMaps für den clientseitigen PDF-Import.
import path from "path";
import os from "os";
import fs from "fs";
import express from "express";
import { spawn } from "child_process";
import { APP_VERSION } from "../../src/core/version";
import { memoryToMarkdown } from "../../src/core/obsidian";
import { TOOLS as MCP_TOOLS } from "../../src/core/mcp";
import { mcpStartInDerApp } from "../helfer/mcp-start";
import { semantikVomBestand } from "../helfer/semantik";
import { serverVerzeichnis, resolveDistDir } from "../helfer/pfad";
import type { AppKontext } from "../kontext";

export function mountSystem(app: express.Express, ctx: AppKontext): void {
  const { store } = ctx;
  const activeCount = () => store.countMemories().active;

  // --- Health ---
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      status: "ok",
      name: "kepta",
      version: APP_VERSION,
      uptime: process.uptime(),
      dbPath: store.dbPath,
      count: activeCount(),
      embeddings: store.embeddingStats(),
      encryption: store.verschluesselung,
      mcp: { protocol: "2026-07-28", tools: MCP_TOOLS.length, http: "/mcp", stdio: mcpStartInDerApp(process.versions.electron, process.execPath, typeof __dirname === "string" ? __dirname : resolveDistDir()) },
      time: new Date().toISOString(),
    });
  });

  app.get("/api/storage-info", (_req, res) => {
    res.json({
      dbPath: store.dbPath,
      count: activeCount(),
      trashed: store.countMemories().trashed,
      embeddings: store.embeddingStats(),
    });
  });

  // --- Wissensgraph (Entities + Relations) ---
  app.get("/api/graph", (req, res) => {
    const entity = typeof req.query.entity === "string" && req.query.entity.trim() ? req.query.entity.trim() : undefined;
    const depthRaw = req.query.depth ? parseInt(String(req.query.depth), 10) : 2;
    const depth = Number.isFinite(depthRaw) ? Math.min(Math.max(depthRaw, 1), 4) : 2;
    const g = store.getGraph(entity, depth);
    const nameById = new Map(g.entities.map((e) => [e.id, e.name]));
    res.json({
      entities: g.entities,
      relations: g.relations
        .filter((r) => nameById.has(r.sourceId) && nameById.has(r.targetId))
        // validFrom/validTo reisen mit. Die Relation weiß, WANN sie gilt —
        // ohne die beiden Felder sah der Zeitregler jede Behauptung als
        // „gilt heute", auch die längst geplatzte.
        .map((r) => ({
          id: r.id,
          source: nameById.get(r.sourceId)!,
          target: nameById.get(r.targetId)!,
          relation: r.relation,
          memoryId: r.memoryId,
          validFrom: r.validFrom,
          validTo: r.validTo,
        })),
      // entity → memory-IDs (für Graph-Rendering über Memories hinweg)
      memoriesByEntity: Object.fromEntries(g.entities.map((e) => [e.name, [...store.memoryIdsForEntities([e.id])]])),
      // Der ganze Bestand, nicht nur was durch die Kappen von `getGraph`
      // durchgekommen ist. Die Fläche sagt damit, dass sie einen Ausschnitt
      // zeigt, statt die gelieferte Zahl als Bestandszahl auszugeben.
      bestand: store.graphBestand(),
    });
  });

  // --- Semantische Karte: wo die Bedeutungen liegen ---
  // Die dritte Ansicht des Graphen legt jede Notiz dorthin, wohin ihr Vektor
  // zeigt. Gerechnet wird hier, damit der Renderer Plätze bekommt und keine
  // Vektoren; die Antwort trägt ausserdem mit, wie viel die zwei Achsen von den
  // Unterschieden tragen und was der Kappung zum Opfer fiel — eine Projektion,
  // die ihre eigene Verringerung verschweigt, ist ein Verkaufsgespräch.
  app.get("/api/graph/semantik", (_req, res) => {
    res.json(semantikVomBestand(store));
  });

  // Export: schreibt alle aktiven Memories als .md in ~/.kepta/export/<zeitstempel>/
  app.post("/api/export/markdown", ctx.limiter.write, (_req, res) => {
    const memories = ctx.listAllMemories();
    if (memories.length === 0) return res.status(404).json({ error: "No memories to export" });
    const dir = path.join(ctx.datenOrdner, "export", `kepta-export-${Date.now()}`);
    try {
      fs.mkdirSync(dir, { recursive: true });
      const used = new Set<string>();
      for (const m of memories) {
        const { filename, markdown } = memoryToMarkdown(m);
        let name = filename;
        let i = 2;
        while (used.has(name.toLowerCase())) {
          name = filename.replace(/\.md$/, `-${i}.md`);
          i++;
        }
        used.add(name.toLowerCase());
        fs.writeFileSync(path.join(dir, name), markdown, "utf-8");
      }
      res.json({ exported: memories.length, path: dir });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Export failed" });
    }
  });

  // Eine notierte Datei mit dem OS-Standardprogramm öffnen — der Weg zurück
  // zur Original-PDF/-HTML/-Datei, die der Scan oder der Drop eingelesen hat.
  // Doppelte Absicherung: der Server lauscht ohnehin nur auf 127.0.0.1, und
  // hier gelten dieselben Grenzen wie beim Rechner-Scan — absolut, vorhanden,
  // eine DATEI, unter dem Home-Verzeichnis.
  app.post("/api/open", ctx.limiter.write, express.json({ limit: "16kb" }), async (req, res) => {
    const pfad = typeof req.body?.pfad === "string" ? req.body.pfad.trim() : "";
    if (!pfad || !path.isAbsolute(pfad) || pfad.length > 1024) {
      return res.status(400).json({ error: "Pfad fehlt oder ist nicht absolut" });
    }
    const aufgeloest = path.resolve(pfad);
    const home = os.homedir();
    if (!aufgeloest.startsWith(home + path.sep)) {
      return res.status(403).json({ error: "Nur Dateien im Home-Verzeichnis" });
    }
    let stat: fs.Stats;
    try {
      // Asynchron: ein stat im Schreibtisch-Ordner kann auf die macOS-Freigabe warten.
      stat = await fs.promises.stat(aufgeloest);
    } catch {
      return res.status(404).json({ error: "Datei nicht gefunden" });
    }
    if (!stat.isFile()) {
      return res.status(400).json({ error: "Keine Datei" });
    }
    // start (Windows) braucht ein leeres Fenstertitel-Argument, sonst frisst
    // es den ersten Pfadteil als Titel.
    const befehl = process.platform === "darwin"
      ? { cmd: "open", args: [aufgeloest] }
      : process.platform === "win32"
        ? { cmd: "cmd", args: ["/c", "start", "", aufgeloest] }
        : { cmd: "xdg-open", args: [aufgeloest] };
    try {
      const kind = spawn(befehl.cmd, befehl.args, { detached: true, stdio: "ignore" });
      kind.unref();
    } catch (e) {
      return res.status(500).json({ error: e instanceof Error ? e.message : "Öffnen fehlgeschlagen" });
    }
    res.json({ ok: true, geoeffnet: aufgeloest });
  });

  // CMaps für den clientseitigen PDF-Import (pdf.js) — offline, ohne CDN.
  const cmapQuellen = [path.join(serverVerzeichnis(), "cmaps"), path.join(process.cwd(), "node_modules", "pdfjs-dist", "cmaps")];
  for (const quelle of cmapQuellen) {
    if (fs.existsSync(quelle)) { app.use("/cmaps", express.static(quelle)); break; }
  }
}
