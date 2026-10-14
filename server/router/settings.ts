// Einstellungen und adaptives Profil — im Datenordner bzw. (seit 2.11)
// verschlüsselt in der Datenbank, nicht im Browserspeicher.
//
// Die Electron-Huelle laesst sich vom Betriebssystem einen FREIEN Port geben
// (net.Server.listen(0)) und laedt das Fenster von http://127.0.0.1:<port>.
// Dieser Port ist bei jedem Start ein anderer — und localStorage haengt am
// Ursprung, also an Schema, Host UND Port. Jeder Neustart bekam damit einen
// frischen, leeren Speicher. Hier überleben die Einstellungen den Neustart,
// das Neuinstallieren der Anwendung und den Portwechsel.
import fs from "fs";
import path from "path";
import express from "express";
import { sanitizeText } from "../../src/core/sanitize";
import { uebernimmSettingsDatei } from "../helfer/settings-datei";
import { bodyOf } from "../helfer/body";
import { leseJsonDatei, schreibeJsonDatei, nebendateiSchluessel } from "../../src/core/nebendateien";
import type { AppKontext } from "../kontext";

const MAX_SETTINGS_BYTES = 64 * 1024;
/**
 * Die Obergrenze des Profils — die Zahl, mit der die Route selbst rechnet, und die
 * Grenze, die seit dem Merge dem **Bestand nach dem Zusammensetzen** gilt, nicht nur
 * dem einzelnen Request.
 *
 * Wer die Datei liest, ist gemeldet: E3 zaehlte ueber `src/`, `server/`, `electron.js`
 * und `scripts/` **zwei Schreibstellen und keine Verbraucher** — die einzigen Leser
 * sind `GET /api/profile` (Zeile 51 hier) und die Route selbst beim Merge
 * (audit-2026-10-09/E3-ERSTART.md, Abschnitt 11). Die Datei ist damit ein Speicher
 * fuer aussen und fuer die Datenbank-Replikate, nicht die Quelle des Fensters.
 */
const MAX_PROFIL_BYTES = 10_000;

/** Was die Route formsicher speichern kann — Zahlen und Arrays bleiben, was sie sind. */
type ProfilWert = string | number | boolean | (string | number)[];

/**
 * Schluessel, die die Route nicht in ein Objekt schreibt, das sie weiterreicht:
 * `__proto__` und seine zwei Nachbarn. Eine Zuweisung mit diesen Namen als Schluessel
 * veraendert die Kette des Objekts, statt ein Feld zu setzen.
 */
const VERBOTENE_SCHLUESSEL = new Set(["__proto__", "constructor", "prototype"]);

/**
 * A3-09 — dieselbe Maske wie der Kern (`kepta-core/server.ts:76`). Wortlaut und
 * Form sind absichtlich gleich: secretfoermige Namen gehen nur als Anzeige
 * heraus, gesetzt plus die letzten vier Zeichen. Die App nennt zusaetzlich die
 * Reihe, die src/lib/settings.ts aus dem Browserspeicher heruebergespiegelt hat —
 * auch darin stand der KI-Schluessel im Klartext.
 */
const GEHEIM_NAME_MUSTER = /(?:api[_-]?key|access[_-]?key|secret|token|passwort|password|passphrase|schluessel|key)$/i;
const GEHEIM_NAMEN = new Set(["ai_settings", "ki_gehirn_ai_settings"]);

function istGeheimSchluessel(name: string): boolean {
  return GEHEIM_NAMEN.has(name) || GEHEIM_NAME_MUSTER.test(name);
}

export function mountSettings(app: express.Express, ctx: AppKontext): void {
  const { store } = ctx;

  // --- Adaptives Profil (je Nutzer individuell) ---
  const PROFILE_FILE = path.join(ctx.datenOrdner, "profile.json");
  // Derselbe Schlüssel wie für die Wissensbasis — einmal geholt, in der
  // Closure gehalten. null = bewusster Klartext (KEPTA_ENCRYPTION=off).
  const nebendateiSchl = nebendateiSchluessel(ctx.datenOrdner);
  app.get("/api/profile", (_req, res) => {
    try {
      res.json(leseJsonDatei<Record<string, unknown>>(PROFILE_FILE, nebendateiSchl));
    } catch {
      res.json(null);
    }
  });
  app.post("/api/profile", (req, res) => {
    try {
      // Hardened: size limit + sanitize
      const body = bodyOf<Record<string, unknown>>(req);
      if (JSON.stringify(body).length > MAX_PROFIL_BYTES) return res.status(413).json({ error: "Profile too large (max 10k)" });
      // Was die Route speichern kann, bleibt in seiner Form: String, Zahl, Bool, ein
      // reines String-/Zahlen-Array. E3s Formprobe am ausgelieferten Buendel
      // (audit-2026-10-09/E3-ERSTART.md Abschnitt 11) hat gemessen, dass die alte
      // Fassung **vier von neun Feldern verbog**: Zahlen fielen ganz weg
      // (`createdAt`, `updatedAt`), ein Array wurde zur kleingeschriebenen Kommazeile
      // (`Mandatsakten` → `mandatsakten`), ein Objekt-Array zum leeren String
      // (`detectedAIs` → `""`). Was die Route nicht formsicher speichern kann, wird
      // jetzt **beim Namen genannt** — `felderUebersprungen` — und nicht still erfunden.
      const sicher: Record<string, ProfilWert> = {};
      const felderUebersprungen: string[] = [];
      for (const [k, v] of Object.entries(body || {})) {
        if (VERBOTENE_SCHLUESSEL.has(k)) { felderUebersprungen.push(k); continue; }
        if (typeof v === "string") sicher[k] = sanitizeText(v, 2000);
        else if (typeof v === "boolean") sicher[k] = v;
        else if (typeof v === "number" && Number.isFinite(v)) sicher[k] = v;
        else if (Array.isArray(v) && v.every((x) => typeof x === "string" || (typeof x === "number" && Number.isFinite(x)))) {
          sicher[k] = v.map((x) => (typeof x === "string" ? sanitizeText(x, 500) : x));
        } else felderUebersprungen.push(k);
      }
      const felderGesetzt = Object.keys(sicher).length;
      // Zusammenführen, nicht ersetzen. Die Route schrieb bisher nur, was der
      // Aufruf sandte, und legte die Datei damit neu an — ein Fenster, das einen
      // Teil sendet, löschte den Rest. src/lib/profile.ts:99 genau tut das: sein
      // Profil kommt aus dem Browserspeicher und kennt nicht jede Zeile der
      // Platte. Was gesandt wird, gewinnt; was nicht gesandt wird, bleibt.
      let bestand: Record<string, unknown> = {};
      try {
        bestand = leseJsonDatei<Record<string, unknown>>(PROFILE_FILE, nebendateiSchl) ?? {};
      } catch { /* keine oder eine unlesbare Datei — dann steht nichts da */ }
      // Arrays vergleichen wir ueber ihren Inhalt — `!==` auf zwei gleichen Arrays
      // zaehlte jedes Feld als geaendert, und die Zahl waere die Antwort des
      // Vergleichs, nicht die der Wirklichkeit gewesen.
      const gleich = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);
      const gesendet = Object.keys(sicher).length;
      const felderGeaendert = Object.entries(sicher).filter(([k, v]) => !gleich(bestand[k], v)).length;
      const felderUnveraendert = gesendet - felderGeaendert;
      const zusammengefuehrt = { ...bestand, ...sicher };
      // Die Grenze gilt dem Bestand nach dem Merge, nicht nur dem Request —
      // sonst führt jede halbgrosse Hälfte durch und die Datei wächst über die
      // 10k hinaus, die beide Lesewege voraussetzen.
      if (JSON.stringify(zusammengefuehrt).length > MAX_PROFIL_BYTES) {
        return res.status(413).json({
          error: `Profile too large (max 10k) — the merged profile would hold ${JSON.stringify(zusammengefuehrt).length} bytes. Nothing was written; the stored profile is unchanged.`,
        });
      }
      fs.mkdirSync(ctx.datenOrdner, { recursive: true });
      schreibeJsonDatei(PROFILE_FILE, zusammengefuehrt, nebendateiSchl);
      const felderImBestand = Object.keys(zusammengefuehrt).length;
      // Keine Zahl ohne Wort (Hausregel, von E3 benannt und von der Leitung angenommen):
      // `geaendert: 7` beantwortet nicht, was 7 ist — Felder, Schluessel, Notizen? Also
      // traegt jedes Feld seinen Namen an der Zahl, und die Zahl der gesetzten Felder ist
      // nicht dieselbe wie die der geaenderten (ein gleich lautendes Feld wird gesetzt,
      // aber nicht geaendert). Was die Route nicht formsicher kann, steht beim Namen.
      const einheit = (n: number, wort: string) => `${n} ${wort}${n === 1 ? "" : "s"}`;
      const hinweis = `${einheit(felderGesetzt, "field")} set`
        + `; ${felderGeaendert} of ${einheit(gesendet, "sent field")} changed`
        + `; ${einheit(felderUnveraendert, "field")} already held these values`
        + `; ${einheit(felderImBestand, "field")} stored in the profile now`
        + (felderUebersprungen.length ? `; skipped, not a string, number, boolean or plain array: ${felderUebersprungen.join(", ")}` : "");
      res.json({ ok: true, felderGesetzt, felderGeaendert, felderUnveraendert, felderImBestand, felderUebersprungen, hinweis });
    } catch {
      res.status(500).json({ error: "The profile could not be saved" });
    }
  });

  // Seit 2.11 in der (verschluesselten) Datenbank — die alte Klartextdatei wandert einmalig hinein.
  uebernimmSettingsDatei(store, path.join(ctx.datenOrdner, "settings.json"));

  app.get("/api/settings", (_req, res) => {
    let bestand: Record<string, string>;
    try {
      bestand = store.einstellungen();
    } catch {
      bestand = {};
    }
    // A3-09: diese Route war die Klartext-Tuer zu dem, was die verschluesselte
    // Datei hueltet. Geschrieben wird weiter ueber PUT, die Datenbank bleibt der
    // unveraenderte Speicher — und der Rueckweg der App (`ai_connection`, darin
    // der Schluessel nur als Umschlag) bleibt lesbar.
    const angezeit: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(bestand)) {
      if (!istGeheimSchluessel(k)) {
        angezeit[k] = v;
        continue;
      }
      // Ein kurzer Wert haelt keine vier Zeichen uebrig, die zeigen kann, ohne
      // die Haelfte preiszugeben.
      angezeit[k] = { gesetzt: true, ende: v.length >= 8 ? v.slice(-4) : null };
    }
    res.json(angezeit);
  });

  app.put("/api/settings", ctx.limiter.write, (req, res) => {
    try {
      const body = bodyOf<Record<string, unknown> | undefined>(req);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return res.status(400).json({ error: "Settings must be an object" });
      }
      const bestand = store.einstellungen();
      const aenderungen: Record<string, string | null> = {};
      // Nur Zeichenketten: der Browserspeicher kennt nichts anderes, und so
      // kann von hier auch nichts Unerwartetes in die Oberflaeche zurueckfliessen.
      for (const [k, v] of Object.entries(body)) {
        if (typeof k !== "string" || k.length === 0 || k.length > 120) continue;
        if (v === null) { aenderungen[k] = null; delete bestand[k]; continue; }
        if (typeof v !== "string") continue;
        aenderungen[k] = bestand[k] = v.slice(0, 20000);
      }
      if (JSON.stringify(bestand, null, 2).length > MAX_SETTINGS_BYTES) return res.status(413).json({ error: "Settings too large" });
      res.json({ ok: true, keys: store.setzeEinstellungen(aenderungen) });
    } catch {
      res.status(500).json({ error: "The settings could not be saved" });
    }
  });
}
