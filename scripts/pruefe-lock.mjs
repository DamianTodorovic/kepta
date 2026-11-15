// Wache über das Sperrschema: jede Abhängigkeit, die es nennt, muss auf dem
// Rechner genau so liegen. Kein Netzwerk, keine Deutung — zwei Dateien pro Paket.
//
// Der Anlass ist gemessen: beim Release-Hochzählen 3.1.2 → 3.1.3 hat der
// Versionssweep auch zwei ABHÄNGIGKEITEN erwischt (`bytes`,
// `@jridgewell/resolve-uri`) und sie auf eine Version gesetzt, die es auf
// registry.npmjs.org nie gab. Der CI-Lauf auf Ubuntu brach mit
// `npm error notarget No matching version found for bytes@3.1.3` ab — ein
// Bauwerkzeug-Fehler, der sich wie ein Installationsfehler liest.
//
//   node scripts/pruefe-lock.mjs        (auch als `pretest`-Schritt)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Plattform-Pakete, die auf diesem Rechner gar nicht installiert sein können. */
function fremdePlattform(eintrag) {
  if (Array.isArray(eintrag.os) && !eintrag.os.includes(process.platform)) return true;
  if (Array.isArray(eintrag.cpu) && !eintrag.cpu.includes(process.arch)) return true;
  return false;
}

/**
 * Unterschiede zwischen Sperrschema und installiertem Baum, als Zeilen.
 * Leere Liste heißt: beides geht zusammen.
 *
 * Geprüft wird die Stelle, an der der Versionssweep geschlafen hat: wo das Paket
 * auf dem Rechner liegt, muss seine Version dastehen wie im Sperrschema. Ein
 * Eintrag ohne Ordner wird nicht beanstandet — npm hält in dem Feld auch
 * Auflösungen offen, die eine flache Installation erst beim `npm ci` anlegt.
 */
export function vergleicheLock(ordner) {
  const lockPfad = path.join(ordner, "package-lock.json");
  if (!fs.existsSync(lockPfad)) return [`Kein package-lock.json in ${ordner}`];
  const pakete = JSON.parse(fs.readFileSync(lockPfad, "utf8"))?.packages ?? {};
  const abweichungen = [];
  for (const [pfad, eintrag] of Object.entries(pakete)) {
    if (!pfad.startsWith("node_modules/") || eintrag.link) continue;
    if (fremdePlattform(eintrag)) continue;
    const datenpfad = path.join(ordner, pfad, "package.json");
    if (!fs.existsSync(datenpfad)) continue;
    const installiert = JSON.parse(fs.readFileSync(datenpfad, "utf8")).version;
    if (eintrag.version && installiert !== eintrag.version) {
      abweichungen.push(`${pfad}: Sperrschema sagt ${eintrag.version}, der Rechner hat ${installiert}`);
    }
  }
  return abweichungen;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const abweichungen = vergleicheLock(process.cwd());
  if (abweichungen.length) {
    console.error(`Sperrschema und installierter Baum laufen auseinander (${abweichungen.length} Stelle${abweichungen.length === 1 ? "" : "n"}):`);
    for (const zeile of abweichungen) console.error("  " + zeile);
    console.error("Heilung: `npm install` (oder die betroffene Version im Sperrschema auf die echte, veröffentlichte stellen).");
    process.exit(1);
  }
}
