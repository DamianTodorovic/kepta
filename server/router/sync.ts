// Praxis-Sync: verschluesselter Geraeteabgleich.
// Der Kern konnte das laengst, war aber an nichts angeschlossen. Hier wird er
// erreichbar: exportieren erzeugt ein AES-256-GCM-Paket, das per USB, Ordner
// oder verschluesselter Mail auf das zweite Geraet der Kanzlei wandert.
// K3PTA selbst sendet nichts — der Weg bleibt in der Hand des Nutzers.
//
// Die Passphrase wird ausschliesslich zum Ableiten des Schluessels benutzt und
// niemals protokolliert, zurueckgegeben oder in publishActivity gereicht.
import os from "os";
import path from "path";
import express from "express";
import { exportBundle, importBundle, type SyncBundle } from "../../src/core/praxissync";
import { bodyOf } from "../helfer/body";
import { nebendateiSchluessel, VerschlusstesSyncJournal } from "../../src/core/nebendateien";
import type { AppKontext } from "../kontext";

export function mountSync(app: express.Express, ctx: AppKontext): void {
  const { store } = ctx;
  // Der Paketmitschnitt nenntpeer, Umfang und Zeitpunkt jedes Syncs — Metadaten,
  // die in einer Kanzlei nichts auf der Platte zu suchen haben. Derselbe
  // Schlüssel wie die Wissensbasis; die Hash-Kette wird nach der Entschlüsselung geprüft.
  const syncJournal = new VerschlusstesSyncJournal(path.join(ctx.datenOrdner, "sync-journal.jsonl"), nebendateiSchluessel(ctx.datenOrdner));

  function passphraseAus(body: unknown): string {
    const p = (body as { passphrase?: unknown } | null)?.passphrase;
    if (typeof p !== "string" || p.length === 0) {
      throw Object.assign(new Error("Passphrase fehlt"), { status: 400 });
    }
    return p;
  }

  app.post("/api/sync/export", ctx.limiter.write, (req, res) => {
    try {
      const passphrase = passphraseAus(req.body);
      const scope = typeof req.body?.scope === "string" && req.body.scope ? String(req.body.scope) : "local";
      const sender = typeof req.body?.sender === "string" && req.body.sender ? String(req.body.sender).slice(0, 80) : os.hostname();
      const bundle = exportBundle(store, { passphrase, scope, sender, journal: syncJournal });
      // Kein publishActivity: ein Export aendert den Speicher nicht. Der Vorgang
      // steht im Mitschnitt, und dort gehoert er hin.
      res.json({ ok: true, bundle });
    } catch (e) {
      // Kurze Passphrase, gebrochener Mitschnitt, Schreibfehler — alles Zustaende,
      // die der Nutzer beheben kann, also 400 statt 500. Die Meldung stammt aus
      // dem Kern und nennt die Passphrase nie.
      const msg = e instanceof Error ? e.message : "Export fehlgeschlagen";
      res.status(400).json({ error: msg });
    }
  });

  app.post("/api/sync/import", ctx.limiter.write, (req, res) => {
    try {
      const passphrase = passphraseAus(req.body);
      const bundle = req.body?.bundle as SyncBundle | undefined;
      if (!bundle || typeof bundle !== "object") {
        return res.status(400).json({ error: "Bundle fehlt" });
      }
      const peer = typeof req.body?.peer === "string" && req.body.peer ? String(req.body.peer).slice(0, 80) : undefined;
      const ergebnis = importBundle(store, bundle, { passphrase, peer, journal: syncJournal });
      if (ergebnis.imported > 0) {
        ctx.publishActivity({ type: "save", source: "app", title: `Device Sync: ${ergebnis.imported} imported` });
      }
      res.json({ ok: true, ...ergebnis });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Import fehlgeschlagen";
      res.status(400).json({ error: msg });
    }
  });

  // Der Mitschnitt ist der nachpruefbare Teil: welche Pakete wann in welche
  // Richtung gingen — ohne deren Inhalt zu kennen. intact meldet, ob die
  // Hash-Kette unversehrt ist.
  app.get("/api/sync/journal", (_req, res) => {
    const entries = syncJournal.entries();
    res.json({ ok: true, intact: syncJournal.verify(), count: entries.length, entries });
  });
}
