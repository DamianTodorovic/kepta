// Die Sicherung vor dem endgueltigen Loeschen — derselbe Vertrag wie im Kern
// (`~/kepta-core/server.ts`, dort datenbanksicherung, backupAufbewahrung und
// halteSicherungen). Die App fuehrt ihre eigenen HTTP-Routen, also braucht sie
// auch diese Zeilen selbst: was F3 im Kern zu hat, wirkt nicht von dort hierher.
// Zahl, Default, Feldnamen und Warnwortlaut sind am Kern festgemacht — zwei
// Baeume, die unterschiedlich antworten, sind der Zustand, den dieser Auftrag
// abschafft.
import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { KeptaStore } from "../../src/core/store";

/**
 * Der Name, den datenbanksicherung() schreibt — an IHM wird die eigene Sicherung
 * erkannt, alles andere im Ordner ist Nutzergut und bleibt liegen. Die eine
 * Gruppe ist optional: Installationen, die vor dem Kuerzel liefen, haelten
 * Dateien mit dem blossen Zeitstempel, und die raeumen weiter mit. Erkennt der
 * Schalter die alte Form nicht mehr, hoert die Aufbewahrung bei genau den
 * aelteren Staenden auf, die den Ordner voll machen.
 */
const SICHERUNGS_NAME = /^kepta-pre-replace-(\d+)(?:-([0-9a-f]{4}))?\.db$/;

/**
 * Aufbewahrung als Zahl, nicht als Vorbehalt: der Ordner legt eine Datei je
 * Volltausch hin, und auf einer langen gelebten Installation fuellt er die Platte.
 * Dasselbe Muster wie maxActiveMemories() — bei jedem Aufruf gelesen, damit ein
 * Betreiber die Zahl ohne Neustart aendern kann. 0 ist eine Entscheidung
 * ("behalte nichts"); was keine Zahl ab null ist, faellt auf fuenf zurueck und
 * wird in der Antwort genannt. Eine Zahl still zu ignorieren war genau der
 * Fehler des permanent-Schalters.
 */
export function backupAufbewahrung(env: Record<string, string | undefined> = process.env): { behalten: number; ignoriert?: string } {
  const roh = env.KEPTA_BACKUP_KEEP;
  if (roh === undefined || roh.trim() === "") return { behalten: 5 };
  const wert = Number(roh);
  if (Number.isFinite(wert) && wert >= 0) return { behalten: Math.floor(wert) };
  return { behalten: 5, ignoriert: `KEPTA_BACKUP_KEEP="${roh}" is not a number from 0 — five backups are kept.` };
}

/**
 * Raeumt den Sicherungsordner auf die erlaubte Zahl, aelteste zuerst. Geloescht
 * wird ausschliesslich, was datenbanksicherung() selbst geschrieben hat (Name mit
 * Zeitstempel, .db, direkt in diesem Ordner) — nie ein anderer Name, nie ein
 * Ordner, nie ein Pfad daneben. Was nicht weichen will (kurz gesperrt), wird beim
 * naechsten Volltausch erneut versucht: ein Raeumfehler darf die Antwort nicht
 * umwerfen, Sicherung und Purge sind dann laengst gelaufen.
 */
export function halteSicherungen(ordner: string, behalten: number): { gehalten: number; entfernt: number } {
  let liste: string[];
  try { liste = fs.readdirSync(ordner); } catch { return { gehalten: 0, entfernt: 0 }; }
  const eigene = liste
    .map((n) => ({ n, zeit: Number(SICHERUNGS_NAME.exec(n)?.[1] ?? "") }))
    .filter((d) => d.zeit > 0)
    .sort((a, b) => b.zeit - a.zeit);
  let entfernt = 0;
  for (const d of eigene.slice(behalten)) {
    try {
      fs.rmSync(path.join(ordner, d.n), { force: true });
      entfernt++;
    } catch { /* beim naechsten Volltausch wieder */ }
  }
  return { gehalten: eigene.length - entfernt, entfernt };
}

/**
 * Bytekopie der Datenbankdatei, nicht ihr JSON-Export. Ein Export laege als
 * Klartext neben einer verschluesselten Datei und waere ein zweites, offeneres
 * Gehirn auf der Platte — die Kopie behaelt den Verschlusselungszustand der
 * Originaldatei bei. Vor der Kopie raumt der WAL in die Datei, sonst sicherte
 * man einen Bestand, der noch gar nicht in der Hauptdatei steht.
 *
 * Schlaegt sie fehl, wird nichts geloescht: den Gegenprobe-Bestand kann niemand
 * zaehlen, wenn es die Sicherung nicht gibt. Der Rueckweg ist derselbe wie im
 * Kern — die .db in einen leeren Datenordner als `kepta.db` legen und mit
 * demselben Schluessel starten.
 */
export function datenbanksicherung(store: KeptaStore): string | null {
  try {
    store.db.pragma("wal_checkpoint(TRUNCATE)");
    const ordner = path.join(path.dirname(store.dbPath), "backup");
    fs.mkdirSync(ordner, { recursive: true });
    // Das Kuerzel neben dem Zeitstempel macht den Namen eindeutig: zwei bestaetigte
    // Volltausche in derselben Millisekunde schrieben sonst dieselbe Datei, und die
    // zweite Sicherung ueberschrieb die erste — zwei versprochene Staende, einer auf
    // der Platte. Die Zahl in der Antwort blieb dabei richtig; der verlorene Stand
    // war still.
    const kuerzel = crypto.randomBytes(2).toString("hex");
    const ziel = path.join(ordner, `kepta-pre-replace-${Date.now()}-${kuerzel}.db`);
    fs.copyFileSync(store.dbPath, ziel);
    return ziel;
  } catch {
    return null;
  }
}
