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
import { zeitnahme } from "../helfer/zeitnahme";
import { semantikVomBestand } from "../helfer/semantik";
import { leseUmwelt, gewonneneUmweltNamen, ohneWert } from "../../src/core/umwelt";
import { serverVerzeichnis, resolveDistDir } from "../helfer/pfad";
import type { AppKontext } from "../kontext";

export function mountSystem(app: express.Express, ctx: AppKontext): void {
  const { store } = ctx;
  const activeCount = () => store.countMemories().active;

  // --- Health ---
  app.get("/api/health", (_req, res) => {
    // Teilzeiten: Bestandszahl und Einbettungs-Zaehlung sind zwei Arbeiten in einer Antwort.
    // Punkt 6 musste die 2 256 ms von health am 19.10. aus der DIFFERENZ zweier Routen
    // erschliessen (storage-info ruft dieselbe Zaehlung und kostet dasselbe) — mit diesem
    // Kopf steckt die Aufteilung in der Antwort selbst.
    const zeit = zeitnahme();
    const count = activeCount();
    zeit.marke("zaehlung");
    const embeddings = store.embeddingStats();
    zeit.marke("einbettung");
    res.setHeader("x-kepta-teilzeiten", zeit.kopf());
    res.json({
      ok: true,
      status: "ok",
      name: "kepta",
      version: APP_VERSION,
      uptime: process.uptime(),
      dbPath: store.dbPath,
      count,
      embeddings,
      encryption: store.verschluesselung,
      // Aufgabe #64: welche Namensform der Umgebung wirklich läuft. Ein Betreiber,
      // der beide Formen gesetzt hat, soll es hier sehen und nicht raten müssen.
      // Gesehen wird der **Name**, nie der Wert: `ohneWert` hält den Schlüssel aus der
      // Umgebung aus der Antwort — diese Tür hängt an 127.0.0.1, bis KEPTA_HOST sie
      // ins Netz stellt.
      kennungen: {
        schluessel: ohneWert(leseUmwelt("schluessel")),
        datenordner: ohneWert(leseUmwelt("datenordner")),
        verschluesselung: ohneWert(leseUmwelt("verschluesselung")),
        sicherungBehalten: ohneWert(leseUmwelt("sicherungBehalten")),
        gemeldet: gewonneneUmweltNamen().filter((f) => f.meldung).map(ohneWert),
      },
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
    const zeit = zeitnahme();
    const g = store.getGraph(entity, depth);
    zeit.marke("fenster");
    const nameById = new Map(g.entities.map((e) => [e.id, e.name]));
    // Diese Masche war bisher eine stille Lucke: Kanten, deren anderes Ende nicht im
    // Auszug liegt, verschwanden, ohne dass die Antwort eine Zahl dafuer nannte.
    // A1x hat die Groessenordnung gemessen (tests/core/graphdeckung.test.ts:99-104):
    // 1.593 von 2.000 Kanten auf Damians echtem Bestand, 827 von 2.000 am
    // 14.000-Kunstbestand. GFs Flaeche zeigte darum "0 links" bei vollen Taschen.
    const kanten = g.relations.filter((r) => nameById.has(r.sourceId) && nameById.has(r.targetId));
    const bestand = store.graphBestand();
    zeit.marke("masche");
    // entity → memory-IDs (für Graph-Rendering über Memories hinweg)
    // Nach der Masche, vor dem Leib: die 500 Nachschlage je Begriff (eine je Knoten des
    // Fensters) sind die Stelle, an der der Index idx_memory_entities_entity
    // (src/core/store.ts:353) arbeitet. Ohne Marke war sein Gewinn an der laufenden Tuer
    // nicht zu zeigen — Punkt 6, ARBEITSLISTE.md:52.
    const memoriesByEntity = Object.fromEntries(g.entities.map((e) => [e.name, [...store.memoryIdsForEntities([e.id])]]));
    zeit.marke("begriffsmemorien");
    // Die Deckung: wie viele der aktiven Notizen an wenigstens einem Begriff
    // haengen. Eine Zahl, die nur Begriffe und Kanten nennt, laesst den Leser
    // raten, ob das Netz weit ist oder knapp — gemessen 15.10. an Damians Bestand
    // (2.756 Begriffe, 2.726 Kanten, aber nur ~1.018 von 21.066 Notizen gedeckt).
    const deckung = (() => {
      const notizen = activeCount();
      const gedeckt = store.notizenMitBegriff();
      return {
        notizen,
        gedeckt,
        anteilProzent: notizen > 0 ? Number(((100 * gedeckt) / notizen).toFixed(2)) : 0,
        // Der Weg war bis zum 16.10. ein Math.min. Beide Abfragen filtern
        // `deleted_at IS NULL` auf `memories` (`store.ts:483` gegen `:1287-1294`),
        // also konnte er nie greifen — und erzwang genau die Relation, die
        // `tests/server-nachzug.test.ts` verlangt, wodurch dieser Fall fuer immer
        // gruen war. Die Zahl bleibt unbeugt; was ueber den Bestand hinauslaeuft,
        // steht als Widerspruch da, weil der Satz die Botschaft traegt und nicht
        // eine Prozentzahl ueber 100.
        widerspruch: gedeckt > notizen ? `${gedeckt} notes carry a concept but only ${notizen} notes are active` : null,
        hinweis: "notes covered = active notes that mention at least one concept; the base's own size is in `bestand`",
      };
    })();
    zeit.marke("deckung");
    const verworfen = g.relations.length - kanten.length;
    const begrenzt = g.entities.length < bestand.knoten || kanten.length < bestand.kanten;
    // Der Kopf geht vor res.json: was Express aus dem Objekt macht (Rendern und Senden
    // des Leibs), steht darum nicht in den Teilzeiten — nur was die Route selbst tat.
    res.setHeader("x-kepta-teilzeiten", zeit.kopf());
    res.json({
      entities: g.entities,
      relations: kanten
        // validFrom/validTo reisen mit. Die Relation weiß, WANN sie gilt —
        // ohne die beiden Felder sah der Zeitregler jede Behauptung als
        // „gilt heute", auch die längst geplatzte.
        .map((r) => ({
          id: r.id,
          source: nameById.get(r.sourceId)!,
          target: nameById.get(r.targetId)!,
          // #83 (3), Paritaet zum Kern (server.ts:1204): die Namen sind der Vertrag
          // fuer die Flaeche, aber ein Verbraucher, der Knoten zaehlen oder kanten
          // zusammenfuehren will, darf nicht raten muessen, welches Ende welches ist.
          // Additiv — kein Feld entfernt, kein Format geaendert.
          sourceId: r.sourceId,
          targetId: r.targetId,
          relation: r.relation,
          memoryId: r.memoryId,
          validFrom: r.validFrom,
          validTo: r.validTo,
        })),
      memoriesByEntity,
      // Der ganze Bestand, nicht nur was durch die Kappen von `getGraph`
      // durchgekommen ist. Die Fläche sagt damit, dass sie einen Ausschnitt
      // zeigt, statt die gelieferte Zahl als Bestandszahl auszugeben.
      bestand,
      deckung,
      // Und jetzt in Zahlen, was zwischen Bestand, Kappe und Masche verloren geht —
      // gezeigt + verworfen = im Auszug, damit eine Flaeche nie eine Bilanzzahl fuer
      // einen Bruchteil ausgeben kann.
      ausriss: {
        begriffe: g.entities.length,
        kantenImAuszug: g.relations.length,
        kantenGezeigt: kanten.length,
        kantenVerworfen: verworfen,
        begrenzt,
        grund: "edges whose other end is not in this excerpt — the caps in getGraph (500 concepts, 2000 edges) and this filter decide together what a window can draw",
        hinweis: begrenzt || verworfen
          ? `This excerpt holds ${g.entities.length} of ${bestand.knoten} concepts and ${kanten.length} of ${bestand.kanten} edges; the door dropped ${verworfen} edges whose other end is outside the excerpt. The base holds ${bestand.knoten} concepts and ${bestand.kanten} edges.`
          : `This excerpt is the whole graph: ${g.entities.length} concepts and ${kanten.length} edges, nothing dropped.`,
      },
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
