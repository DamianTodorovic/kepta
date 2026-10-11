// Das Manifest der Bilder: zu jedem Bild der Stand, den es zeigt.
//
//   node scripts/bilder-manifest.mjs --nachtragen docs/screenshots
//
// Warum das eigene Datei ist und nicht eine Zeile in screenshots.mjs: zwei
// Schreiber (Schusslauf und Film-Bau) würden zwei Formate erzeugen, und ein
// Bild, dessen Stand niemand mehr rekonstruieren kann, ist im Zweifel das
// Bild, das ein Papier Lügen straft. `scripts/pruefe-bild.mjs` (Regel G2) liest
// genau diese Datei.
//
// Der Normalfall schreibt der **Schusslauf**: `screenshots.mjs` ruft
// `manifestFuegeHinzu` im Augenblick des Einfangens, mit der Version aus
// `package.json` und dem Commit, der gerade HEAD ist.
//
// `--nachtragen` ist der Ausnahmeweg für Bilder, die schon vor dem Manifest
// im Repo lagen: ihr Stand wird aus dem Git-Zeiger der Datei-Erzeugungszeit
// geholt, und der Eintrag trägt `nachgetragen: true`. Ein nachgetragener
// Eintrag behauptet also, was belegbar ist, und verschleiert nicht, dass
// niemand beim Schuss dabei war.
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MANIFEST_PFAD = (wurzel) => path.join(wurzel, "docs", "bilder-manifest.json");

export function gitInfo(wurzel, zeitMs = null) {
  const args = zeitMs === null ? ["rev-parse", "--short", "HEAD"] : ["log", "-1", `--before=${new Date(zeitMs).toISOString()}`, "--format=%h"];
  try {
    const rev = execFileSync("git", args, { cwd: wurzel, encoding: "utf8" }).trim() || "unbekannt";
    const d = execFileSync("git", ["log", "-1", "--format=%cI", rev], { cwd: wurzel, encoding: "utf8" }).trim();
    let version = "unbekannt";
    try {
      const texte = execFileSync("git", ["show", `${rev}:package.json`], { cwd: wurzel, encoding: "utf8" });
      version = JSON.parse(texte).version ?? version;
    } catch { /* der Stand hat kein package.json — dann bleibt die Version unbekannt */ }
    return { rev, commitZeit: d, version };
  } catch {
    return { rev: "unbekannt", commitZeit: null, version: "unbekannt" };
  }
}

export function aktuelleVersion(wurzel) {
  try {
    return JSON.parse(fs.readFileSync(path.join(wurzel, "package.json"), "utf8")).version ?? "unbekannt";
  } catch {
    return "unbekannt";
  }
}

const sha = (pfad) => crypto.createHash("sha256").update(fs.readFileSync(pfad)).digest("hex").slice(0, 16);

export function lies(wurzel) {
  const p = MANIFEST_PFAD(wurzel);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {};
}

export function schreibe(wurzel, manifest) {
  const p = MANIFEST_PFAD(wurzel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(manifest, null, 2) + "\n");
  return p;
}

/**
 * Einträge zu einer Liste von Bilddateien. `zeitMs` ist der Augenblick, der als
 * Aufnahme gilt — der Schusslauf gibt ihn nicht, der Nachtrag schon.
 */
export function manifestFuegeHinzu(wurzel, gruppe, dateien, { zeitMs = null, anmerkung = null } = {}) {
  const manifest = lies(wurzel);
  const info = gitInfo(wurzel, zeitMs);
  const eintrag = {
    version: zeitMs === null ? aktuelleVersion(wurzel) : info.version,
    stand: info.rev,
    commitZeit: info.commitZeit,
    gebaut: new Date(zeitMs ?? Date.now()).toISOString(),
    anmerkung,
    dateien: {},
  };
  for (const d of dateien) {
    const absolut = path.isAbsolute(d) ? d : path.join(wurzel, d);
    if (!fs.existsSync(absolut)) continue;
    const stat = fs.statSync(absolut);
    eintrag.dateien[path.relative(wurzel, absolut).split(path.sep).join("/")] = {
      bytes: stat.size,
      sha256: sha(absolut),
      mtime: new Date(stat.mtimeMs).toISOString(),
    };
  }
  manifest[gruppe] = { ...(manifest[gruppe] ?? {}), ...eintrag };
  return { pfad: schreibe(wurzel, manifest), eintrag };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const gruppe = process.argv.includes("--nachtragen") ? process.argv[process.argv.indexOf("--nachtragen") + 1] : null;
  if (!gruppe) {
    console.error("bilder-manifest: --nachtragen <ordner> erwartet.");
    process.exit(2);
  }
  const ordner = path.join(wurzel, gruppe);
  const dateien = fs.readdirSync(ordner).filter((n) => /\.(png|jpe?g|gif|webp|mp4)$/i.test(n)).sort().map((n) => path.join(gruppe, n));
  if (dateien.length === 0) {
    console.error(`bilder-manifest: in ${gruppe} liegt kein Bild.`);
    process.exit(1);
  }
  // Der Stand gilt zum Zeitpunkt der ältesten Datei — alle Bilder einer Gruppe
  // entstehen in einem Lauf, und ein nachgetragener Eintrag darf nicht den
  // heutigen Commit als ihren Ursprung ausgeben.
  const aelteste = Math.min(...dateien.map((d) => fs.statSync(path.join(wurzel, d)).mtimeMs));
  const { eintrag } = manifestFuegeHinzu(wurzel, gruppe, dateien, {
    zeitMs: aelteste,
    anmerkung: "nachgetragen aus Git-Zeiger der Datei-Erzeugungszeit — beim Schuss war niemand dabei",
  });
  console.log(`bilder-manifest: ${Object.keys(eintrag.dateien).length} Bilder unter "${gruppe}" nachgetragen`);
  console.log(`  Stand ${eintrag.stand} (${eintrag.commitZeit}), Version ${eintrag.version}, Aufnahme ${eintrag.gebaut}`);
}
