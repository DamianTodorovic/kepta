// Rechner-Scan: K3PTA sieht auf ausdruecklichen Wunsch den ganzen Rechner
// durch und sammelt Dokumente ein.
//
// Alles bleibt dabei auf dem Geraet — es gibt keine Cloud und der Kern hat
// keinen Netzzugang. Zwei Dinge sind trotzdem fest verdrahtet:
//   1. Schluessel, Zugangsdaten und Browserprofile werden NIE gelesen. Das
//      laesst sich nicht abschalten, auch nicht ueber die API — was in der
//      Wissensbasis steht, koennen angeschlossene Agenten ueber MCP lesen.
//   2. Ohne ausdrueckliche Bestaetigung passiert gar nichts; die Vorschau
//      schreibt nichts und zeigt nur, was aufgenommen WUERDE.
import path from "path";
import os from "os";
import fs from "fs";
import express from "express";
import { scanne, nachOrdner, type Dateisystem, type Fund, type ScanStand } from "../../src/scan/walker";
import { grundLabel, GEHEIME_ORDNER, GEHEIME_DATEIMUSTER, UEBERSPRUNGENE_ORDNER, LESBARE_ENDUNGEN, MAX_DATEI_BYTES, MAX_DATEIEN, MAX_TIEFE, type Ablehnungsgrund } from "../../src/scan/regeln";
import { klassifiziere, istUnbrauchbar, entferneNaviZeilen } from "../../src/core/klassifikation";
import { planeImportReparatur, mitFrist } from "../../src/core/reparatur";
import { richtlinie } from "../../src/lib/richtlinien";
import { sanitizeText, sanitizeTitle } from "../../src/core/sanitize";
import { indexMemory } from "../../src/core/engine";
import { textAus, inChunks } from "../helfer/text";
import { inboxOrdner, archiveDir } from "../helfer/inbox-pfade";
import { bodyOf } from "../helfer/body";
import { leseJsonDatei, schreibeJsonDatei, nebendateiSchluessel } from "../../src/core/nebendateien";
import type { AppKontext } from "../kontext";
import type { MemoryRecord as CoreMemory } from "../../src/core/types";

interface ScanLage {
  laeuft: boolean;
  phase: "idle" | "preview" | "import" | "done" | "cancelled";
  gesehen: number;
  gefunden: number;
  importiert: number;
  uebersprungen: number;
  /** Stuecke ohne Erkenntniswert, die gar nicht erst zu Notizen wurden. */
  verworfen?: number;
  abgeschnitten: boolean;
  gestartet: number | null;
  fehler: string | null;
}

// Datenreparatur: PDFs, deren Teile mit der alten Rohbyte-Extraktion
// eingelesen wurden (Glyph-Namen, Binärblöcke), werden anhand ihrer
// Quellen-Zeile neu gelesen. Web-Clips verlieren ihre Menüzeilen ("Skip to
// main content", Cookie-Banner) nach derselben Regel wie beim Import, ohne Netz.
//
// Ohne { apply: true } wird nur gezählt — geschrieben wird erst nach
// Bestätigung, dasselbe Muster wie beim Nachsortieren. Unveränderte Teile
// bleiben unberührt: ein zweiter Lauf schreibt nichts neu. Überzählige Teile
// wandern in den Papierkorb, nie endgültig weg.
//
// Die Quellen-Zeile bleibt an jedem Teil stehen. Die erste Fassung (2.10.0)
// schrieb nur den neuen Text zurück; an einer echten Wissensbasis waren
// danach 36 Teile aus 8 PDFs lesbar, aber ohne Herkunft.
//
// Nur PDFs: 2.10.1 las auch HTML neu. An einer echten Wissensbasis hätte das
// 70 Dateien umgeschrieben und 580 Teile endgültig gelöscht — fast alles
// Coverage-Berichte, die der Rechner-Scan mitgenommen hatte und die sich bei
// jedem Testlauf neu schreiben. "Neu lesen" hieß dort: durch eine ganz andere
// Datei ersetzen.
const NEU_LESBAR = new Set([".pdf"]);
const LESE_FRIST_MS = 30_000;
const ZUGRIFF_MELDUNG = "no answer from the file system within 30 s — macOS may be waiting for permission to read this folder (System Settings → Privacy & Security → Files and Folders)";

export function mountScan(app: express.Express, ctx: AppKontext): void {
  const { store } = ctx;
  const INBOX_DIR = inboxOrdner(ctx.datenOrdner);
  // Die Scan-Konfiguration nennt die Verzeichnisse, die der Nutzer scannt —
  // Arbeitsbereiche, also sensible Metadaten. Derselbe Schlüssel wie die
  // Wissensbasis; null = bewusster Klartext (KEPTA_ENCRYPTION=off).
  const nebendateiSchl = nebendateiSchluessel(ctx.datenOrdner);

  /** node:fs hinter der Schnittstelle des Walkers — der kennt kein Dateisystem. */
  const echtesDateisystem: Dateisystem = {
    lies(ordner) {
      try {
        return fs.readdirSync(ordner, { withFileTypes: true }).map((e) => {
          let groesse = 0;
          if (e.isFile()) {
            try { groesse = fs.statSync(path.join(ordner, e.name)).size; } catch { groesse = 0; }
          }
          // Symlinks werden nicht verfolgt: sonst laeuft der Scan ueber Umwege
          // doch noch in ausgeschlossene Ordner.
          return { name: e.name, istOrdner: e.isDirectory() && !e.isSymbolicLink(), groesse };
        });
      } catch {
        return [];
      }
    },
    verbinde: (a, b) => path.join(a, b),
  };

  /** Standardwurzeln: das Heimverzeichnis. Nichts oberhalb davon. */
  function standardWurzeln(): string[] {
    return [os.homedir()];
  }

  /** Wurzeln aus dem Aufruf pruefen — nur echte Ordner innerhalb des Heims. */
  function pruefeWurzeln(roh: unknown): string[] {
    if (!Array.isArray(roh) || roh.length === 0) {
      // Ohne Angabe gilt, was der Nutzer eingestellt hat — sonst die Vorgabe.
      // Die Datei ist verschlüsselt (ältere Klartext-Fassungen werden noch
      // verstanden und beim nächsten Schreiben überführt).
      const g = leseJsonDatei<{ roots?: unknown }>(path.join(ctx.datenOrdner, "scan-config.json"), nebendateiSchl);
      if (g && Array.isArray(g.roots) && g.roots.length > 0) return g.roots.map(String).slice(0, 8);
      return standardWurzeln();
    }
    const heim = path.resolve(os.homedir());
    const out: string[] = [];
    for (const r of roh.slice(0, 8)) {
      if (typeof r !== "string" || r.length > 4096) continue;
      const aufgeloest = path.resolve(r);
      if (aufgeloest !== heim && !aufgeloest.startsWith(heim + path.sep)) continue;
      try { if (fs.statSync(aufgeloest).isDirectory()) out.push(aufgeloest); } catch { /* weg */ }
    }
    return out.length > 0 ? out : standardWurzeln();
  }

  /** K3PTAs eigener Datenordner darf nie in den Scan — sonst frisst er sich selbst. */
  function ausgeschlossenePfade(): string[] {
    return [path.resolve(ctx.datenOrdner), path.resolve(INBOX_DIR), path.resolve(archiveDir(ctx.datenOrdner))];
  }

  let scanLage: ScanLage = {
    laeuft: false, phase: "idle", gesehen: 0, gefunden: 0, importiert: 0,
    uebersprungen: 0, abgeschnitten: false, gestartet: null, fehler: null,
  };
  let scanAbbruch = false;

  function zusammenfassung(stand: ScanStand, wurzeln: string[]) {
    const gruende = Object.entries(stand.abgelehnt)
      .map(([g, n]) => ({ grund: g, label: grundLabel(g as Ablehnungsgrund), anzahl: n }))
      .sort((a, b) => b.anzahl - a.anzahl);
    // Alle Ordner zaehlen, zwanzig zeigen: auf einem echten Heim sind es 17
    // oberste Ordner (gemessen 14.10.), und einer, den die Liste nicht zeigt,
    // kann der Nutzer nicht wegklicken. Die Gesamtzahl steht daneben, damit die
    // Liste nicht als Vollstaendigkeit gelesen wird.
    const alleOrdner = nachOrdner(stand.funde, wurzeln, Number.MAX_SAFE_INTEGER);
    return {
      roots: wurzeln,
      seen: stand.gesehen,
      found: stand.funde.length,
      truncated: stand.abgeschnitten,
      skippedFolders: stand.uebersprungeneOrdner,
      // Welche Ordner zu blieben, beim Namen — `skippedFolders` allein ist eine
      // Zahl ohne Auskunft, und nur am Namen sieht jemand, dass sein eines
      // Wunschziel mit einem Ballast-Namen zusammenfaellt.
      leftOutFolders: stand.uebersprungene.slice(0, 24),
      skipped: gruende,
      byFolder: alleOrdner.slice(0, 20),
      ordnerGesamt: alleOrdner.length,
      sample: stand.funde.slice(0, 24).map((f) => ({ path: f.pfad, bytes: f.groesse })),
      totalBytes: stand.funde.reduce((n, f) => n + f.groesse, 0),
    };
  }

  /** Laeuft den Baum ab und laesst zwischendurch die Ereignisschleife atmen. */
  async function laufe(wurzeln: string[], aufStand?: (s: ScanStand) => void): Promise<ScanStand> {
    const e = leseScanEinstellungen();
    const lauf = scanne(wurzeln, echtesDateisystem, {
      ausgeschlossen: ausgeschlossenePfade(),
      abbrechen: () => scanAbbruch,
      einstellungen: {
        endungen: e.endungen,
        maxDateiBytes: e.maxDateiBytes,
        zusaetzlichAusgelassen: e.zusaetzlichAusgelassen,
      },
    });
    let schritt = lauf.next();
    while (!schritt.done) {
      aufStand?.(schritt.value);
      await new Promise((r) => setImmediate(r));
      schritt = lauf.next();
    }
    return schritt.value;
  }

  /**
   * Die Scan-Einstellungen des Nutzers — im Datenordner, nicht im Browser.
   *
   * Was hier eingestellt wird, schraenkt WEITER ein. Oeffnen laesst sich damit
   * nichts: die harten Sperren (Schluessel, Zugangsdaten, Browserprofile,
   * Schluesselbunde, Wallets) stehen in src/scan/regeln.ts und gelten immer.
   * Eine Luecke dort waere kein Komfortverlust, sondern ein Leck — was in der
   * Wissensbasis steht, koennen angeschlossene Agenten ueber MCP lesen.
   */
  const SCAN_CONFIG_FILE = path.join(ctx.datenOrdner, "scan-config.json");

  function leseScanEinstellungen(): { roots: string[]; endungen: string[]; maxDateiBytes: number; zusaetzlichAusgelassen: string[] } {
    try {
      const roh = JSON.parse(fs.readFileSync(SCAN_CONFIG_FILE, "utf-8")) as Record<string, unknown>;
      return {
        roots: Array.isArray(roh.roots) ? roh.roots.map(String).slice(0, 8) : [],
        endungen: Array.isArray(roh.endungen)
          ? roh.endungen.map(String).filter((e) => LESBARE_ENDUNGEN.includes(e))
          : [...LESBARE_ENDUNGEN],
        maxDateiBytes: Math.min(Number(roh.maxDateiBytes) || MAX_DATEI_BYTES, MAX_DATEI_BYTES),
        zusaetzlichAusgelassen: Array.isArray(roh.zusaetzlichAusgelassen)
          ? roh.zusaetzlichAusgelassen.map(String).slice(0, 100)
          : [],
      };
    } catch {
      return { roots: [], endungen: [...LESBARE_ENDUNGEN], maxDateiBytes: MAX_DATEI_BYTES, zusaetzlichAusgelassen: [] };
    }
  }

  app.get("/api/scan/config", (_req, res) => {
    const e = leseScanEinstellungen();
    res.json({ ...e, roots: e.roots.length > 0 ? e.roots : standardWurzeln() });
  });

  app.put("/api/scan/config", ctx.limiter.write, express.json({ limit: "256kb" }), (req, res) => {
    const b = bodyOf<Record<string, unknown>>(req);
    const gewaehlt = Array.isArray(b.endungen)
      ? b.endungen.map(String).filter((x) => LESBARE_ENDUNGEN.includes(x))
      : [...LESBARE_ENDUNGEN];
    const neu = {
      roots: pruefeWurzeln(b.roots),
      endungen: gewaehlt.length > 0 ? gewaehlt : [...LESBARE_ENDUNGEN],
      maxDateiBytes: Math.min(Math.max(Number(b.maxDateiBytes) || MAX_DATEI_BYTES, 1024), MAX_DATEI_BYTES),
      zusaetzlichAusgelassen: Array.isArray(b.zusaetzlichAusgelassen)
        ? [...new Set(b.zusaetzlichAusgelassen.map((x) => String(x).toLowerCase().trim()).filter(Boolean))].slice(0, 100)
        : [],
    };
    try {
      fs.mkdirSync(ctx.datenOrdner, { recursive: true });
      schreibeJsonDatei(SCAN_CONFIG_FILE, neu, nebendateiSchl);
      res.json({ ok: true, ...neu });
    } catch {
      res.status(500).json({ error: "The scan settings could not be saved" });
    }
  });

  /**
   * Die vollstaendige Erklaerung, was K3PTA liest und was nie.
   *
   * Das ist die geforderte klare Deklaration: nicht ein Satz im Dialog, sondern
   * die tatsaechlich geltenden Listen — aus demselben Quelltext, der auch
   * entscheidet. Was hier steht, KANN nicht auseinanderlaufen.
   */
  app.get("/api/scan/policy", (_req, res) => {
    const e = leseScanEinstellungen();
    res.json({
      niemals: {
        ordner: GEHEIME_ORDNER,
        dateimuster: GEHEIME_DATEIMUSTER.map((r) => r.source),
        erklaerung: "Keys, credentials, browser profiles, keychains and wallets are never read. This cannot be switched on.",
      },
      uebersprungen: {
        ordner: UEBERSPRUNGENE_ORDNER,
        erklaerung: "System, cache and build folders hold no knowledge. Hidden folders are skipped too.",
      },
      lesbar: { endungen: LESBARE_ENDUNGEN, erklaerung: "Only these formats yield text." },
      grenzen: { maxDateiBytes: MAX_DATEI_BYTES, maxDateien: MAX_DATEIEN, maxTiefe: MAX_TIEFE },
      ihreEinstellung: {
        wurzeln: e.roots.length > 0 ? e.roots : standardWurzeln(),
        endungen: e.endungen,
        maxDateiBytes: e.maxDateiBytes,
        zusaetzlichAusgelassen: e.zusaetzlichAusgelassen,
      },
    });
  });

  // Vorschau: schreibt nichts. Zeigt, was aufgenommen wuerde — und was nicht.
  app.post("/api/scan/preview", ctx.limiter.write, async (req, res) => {
    if (scanLage.laeuft) return res.status(409).json({ error: "A scan is already running" });
    const wurzeln = pruefeWurzeln(bodyOf<{ roots?: unknown }>(req).roots);
    scanAbbruch = false;
    scanLage = { ...scanLage, laeuft: true, phase: "preview", gesehen: 0, gefunden: 0, importiert: 0, uebersprungen: 0, abgeschnitten: false, gestartet: Date.now(), fehler: null };
    try {
      const stand = await laufe(wurzeln, (s) => {
        scanLage.gesehen = s.gesehen;
        scanLage.gefunden = s.funde.length;
        scanLage.uebersprungen = s.uebersprungeneOrdner;
      });
      scanLage = { ...scanLage, laeuft: false, phase: "done", gesehen: stand.gesehen, gefunden: stand.funde.length, uebersprungen: stand.uebersprungeneOrdner, abgeschnitten: stand.abgeschnitten };
      return res.json(zusammenfassung(stand, wurzeln));
    } catch (e) {
      scanLage = { ...scanLage, laeuft: false, phase: "idle", fehler: e instanceof Error ? e.message : "Scan failed" };
      return res.status(500).json({ error: "Scan failed" });
    }
  });

  // Der eigentliche Durchlauf. Ohne bestaetigt:true passiert nichts.
  app.post("/api/scan/start", ctx.limiter.write, async (req, res) => {
    // Zentrale Richtlinie machine_scan=deny: der Rechner-Scan ist von der
    // Organisation verboten — auch der Opt-in zählt dann nicht mehr.
    if (richtlinie("machine_scan") === "deny") {
      return res.status(403).json({ error: "The computer scan is disabled by your organization's policy." });
    }
    const body = bodyOf<{ roots?: unknown; confirmed?: unknown }>(req);
    if (body.confirmed !== true) {
      return res.status(400).json({ error: "Confirmation required — send confirmed:true after the user has agreed" });
    }
    if (scanLage.laeuft) return res.status(409).json({ error: "A scan is already running" });
    const wurzeln = pruefeWurzeln(body.roots);
    scanAbbruch = false;
    scanLage = { laeuft: true, phase: "import", gesehen: 0, gefunden: 0, importiert: 0, uebersprungen: 0, abgeschnitten: false, gestartet: Date.now(), fehler: null };
    res.json({ started: true, roots: wurzeln });

    void (async () => {
      try {
        const stand = await laufe(wurzeln, (s) => {
          scanLage.gesehen = s.gesehen;
          scanLage.gefunden = s.funde.length;
          scanLage.uebersprungen = s.uebersprungeneOrdner;
        });
        scanLage.gesehen = stand.gesehen;
        scanLage.gefunden = stand.funde.length;
        scanLage.abgeschnitten = stand.abgeschnitten;

        const schonDa = new Set(ctx.listAllMemories().map((m) => m.title));
        let n = 0;
        let verworfen = 0;
        for (const f of stand.funde as Fund[]) {
          if (scanAbbruch) break;
          try {
            const text = await textAus(f.pfad);
            if (!text.trim()) continue;
            const basisName = path.basename(f.pfad, path.extname(f.pfad));
            const stuecke = inChunks(text);
            for (let i = 0; i < stuecke.length; i++) {
              const titel = stuecke.length === 1 ? basisName : `${basisName} — ${i + 1}/${stuecke.length}`;
              if (schonDa.has(titel)) continue;
              schonDa.add(titel);
              // Traegt dieses Stueck ueberhaupt Wissen? Was hier durchfaellt,
              // wird gar nicht erst zu einer Notiz — statt spaeter muehsam
              // wieder aussortiert zu werden.
              const urteil = istUnbrauchbar(stuecke[i]);
              if (urteil.unbrauchbar) { verworfen++; continue; }
              const inhalt = sanitizeText(`${stuecke[i]}\n\n— Source: ${f.pfad}`, 50000);
              // Jede Notiz bekommt eine Art zugewiesen, mit nachlesbarem Grund.
              // Vorher setzte der Scan gar keinen Typ, und alles fiel auf
              // "Fakt" zurueck: 3071 von 3148 Notizen.
              const zuordnung = klassifiziere({
                title: titel, content: stuecke[i],
                tags: ["machine-scan"], quelle: f.pfad,
              });
              const angelegt = store.createMemory({
                title: sanitizeTitle(titel) || basisName.slice(0, 80),
                content: inhalt,
                type: zuordnung.typ,
                tags: ["machine-scan", path.extname(f.pfad).replace(".", "") || "file"],
              });
              indexMemory(store, angelegt.id);
              n++;
              scanLage.importiert = n;
              // Waehrend eines langen Imports darf der DB-Waechter nicht
              // dazwischenrufen, es habe jemand von aussen geschrieben.
              ctx.markiereEigeneAenderung();
            }
          } catch { /* eine unlesbare Datei haelt den Durchlauf nicht auf */ }
          if (n % 25 === 0) await new Promise((r) => setImmediate(r));
        }
        scanLage = { ...scanLage, laeuft: false, phase: scanAbbruch ? "cancelled" : "done", importiert: n, verworfen };
        ctx.publishActivity({ type: "save", source: "app", title: `Machine scan: ${n} notes` });
      } catch (e) {
        scanLage = { ...scanLage, laeuft: false, phase: "idle", fehler: e instanceof Error ? e.message : "Scan failed" };
      }
    })();
  });

  app.get("/api/scan/status", (_req, res) => {
    res.json({
      running: scanLage.laeuft,
      phase: scanLage.phase,
      seen: scanLage.gesehen,
      found: scanLage.gefunden,
      imported: scanLage.importiert,
      skippedFolders: scanLage.uebersprungen,
      truncated: scanLage.abgeschnitten,
      startedAt: scanLage.gestartet,
      error: scanLage.fehler,
    });
  });

  app.post("/api/scan/cancel", (_req, res) => {
    scanAbbruch = true;
    res.json({ cancelling: scanLage.laeuft });
  });

  app.post("/api/repair/imports", ctx.limiter.write, express.json({ limit: "16kb" }), async (req, res) => {
    const anwenden = bodyOf<{ apply?: unknown }>(req).apply === true;
    const alle = ctx.listAllMemories();
    const nachQuelle = new Map<string, CoreMemory[]>();
    for (const m of alle) {
      const treffer = /—\s*Source:\s*(\S.*)$/m.exec(m.content);
      if (!treffer) continue;
      const p = treffer[1]!.trim();
      if (!path.isAbsolute(p)) continue;
      const liste = nachQuelle.get(p) ?? [];
      liste.push(m);
      nachQuelle.set(p, liste);
    }
    let geprueft = 0, dateien = 0, aktualisiert = 0, entfernt = 0, erstellt = 0, clips = 0;
    const fehler: string[] = [];
    for (const [pfad, gruppe] of nachQuelle) {
      if (!NEU_LESBAR.has(path.extname(pfad).toLowerCase())) continue;
      const stat = await fs.promises.stat(pfad).catch(() => null);
      if (!stat?.isFile()) continue;
      geprueft++;
      try {
        const text = await mitFrist(textAus(pfad), LESE_FRIST_MS, ZUGRIFF_MELDUNG);
        const plan = planeImportReparatur(
          gruppe.map((m) => ({ id: m.id, title: m.title, content: m.content })),
          inChunks(text, 2000),
          { anhang: `\n\n— Source: ${pfad}` }
        );
        const bisher = new Map(gruppe.map((m) => [m.id, m] as const));
        const updates = plan.updates
          .map((u) => ({ id: u.id, title: sanitizeTitle(u.title) || u.title, content: sanitizeText(u.content, 50000) }))
          .filter((u) => {
            const vorher = bisher.get(u.id);
            return !vorher || vorher.title !== u.title || vorher.content !== u.content;
          });
        if (updates.length === 0 && plan.entfaelle.length === 0 && plan.neu.length === 0) continue;
        dateien++;
        aktualisiert += updates.length;
        entfernt += plan.entfaelle.length;
        erstellt += plan.neu.length;
        if (!anwenden) continue;
        for (const u of updates) {
          store.updateMemory(u.id, { title: u.title, content: u.content });
          indexMemory(store, u.id);
        }
        // In den Papierkorb, nicht endgültig — K3PTA löscht nie ohne Rückweg.
        for (const id of plan.entfaelle) store.trashMemory(id);
        const vorlage = gruppe[0]!;
        for (const t of plan.neu) {
          const created = store.createMemory({
            title: sanitizeTitle(t.title) || t.title, content: sanitizeText(t.content, 50000), tags: vorlage.tags,
            type: vorlage.type, scope: vorlage.scope, confidence: vorlage.confidence,
          });
          indexMemory(store, created.id);
        }
      } catch (e) {
        fehler.push(`${pfad}: ${e instanceof Error ? e.message : "unbekannt"}`);
        // Keine Antwort vom Dateisystem: nicht weiter warten. Jede weitere Datei
        // aus demselben Ordner bliebe genauso haengen und hielte einen Thread
        // des Dateisystems fest.
        if (e instanceof Error && e.message === ZUGRIFF_MELDUNG) break;
      }
    }
    // Web-Clips: "Source: <url>" steht vorn. Neu geholt wird nichts.
    const volleZeilen = (s: string) => s.split("\n").filter((z) => z.trim()).length;
    for (const m of alle) {
      if (!/^Source:\s*https?:\/\//i.test(m.content)) continue;
      const sauber = entferneNaviZeilen(m.content);
      if (volleZeilen(sauber) >= volleZeilen(m.content)) continue;
      clips++;
      if (anwenden) {
        store.updateMemory(m.id, { content: sauber });
        indexMemory(store, m.id);
      }
    }
    if (anwenden && (dateien > 0 || clips > 0)) ctx.markiereEigeneAenderung();
    res.json({ ok: true, applied: anwenden, geprueft, dateien, aktualisiert, entfernt, erstellt, clips, fehler: fehler.slice(0, 5) });
  });
}
