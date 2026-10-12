#!/usr/bin/env node
/**
 * release-beweisen.mjs — Beweis-Kette fuer einen Desktop-Bau, bevor er nach aussen geht.
 *
 *   node scripts/release-beweisen.mjs <version>            // lokale Pruefung
 *   node scripts/release-beweisen.mjs <version> --fern     // zusaenglich GitHub
 *
 * Was er prueft, und warum das jede Zeile wert ist:
 * 1. beide Architekturen liegen als dmg + zip + blockmap vor, und das native Modul in
 *    beiden Paketen ist die Electron-ABI (149) — ein DMG mit Node-ABI-Modul laeuft,
 *    das Fenster erscheint, und der Server lauscht nie. Das ist am 12.10. zweimal
 *    passiert, in zwei verschiedenen Mechanismen.
 * 2. SHA256SUMS.txt deckt genau die Dateien ab, die spaeter am Release haengen.
 * 3. latest-mac.yml nennt sha512-Groessen, die zu den echten Dateien passen.
 * 4. --fern: anonym von GitHub laden, Hash mit der lokalen Datei vergleichen, und die
 *    Asset-Liste des Release gegen meine eigene Liste halten.
 *
 * Exit 0 nur, wenn jeder Schritt gruen ist. Ein fehlender Schritt ist ein Fehler,
 * kein Ueberspringen.
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const HIER = path.resolve(import.meta.dirname, "..");
const RELEASE = path.join(HIER, "release");
const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.log("benutzung: node scripts/release-beweisen.mjs <x.y.z> [--fern]");
  process.exit(2);
}
const FERN = process.argv.includes("--fern");
const zeilen = [];
let fehler = 0;
const meld = (text, ok) => {
  zeilen.push((ok ? "  OK   " : "  FEHLER ") + text);
  if (!ok) fehler++;
};
const sha256 = (datei) => crypto.createHash("sha256").update(fs.readFileSync(datei)).digest("hex");
const sha512base64 = (datei) => crypto.createHash("sha512").update(fs.readFileSync(datei)).digest("base64");

const dateien = ["dmg", "zip", "dmg.blockmap", "zip.blockmap"].flatMap(arche =>
  ["arm64", "x64"].map(arch => `KEPTA-${version}-mac-${arch}.${arche}`)
);
for (const f of dateien) {
  const p = path.join(RELEASE, f);
  meld(`${f} vorhanden (${fs.existsSync(p) ? Math.round(fs.statSync(p).size / 1048576) + " MiB" : "fehlt"})`, fs.existsSync(p));
}

// 1) jedes gepackte Programm wirklich starten: in einer kapsel mit eigenem HOME,
//    eigener datenordner und einem frischen 64-zeichen-schluessel. Was zaehlt, ist
//    nicht die ablesbare ABI-Zahl, sondern: antwortet der server, nennt er die
//    version, und steht verschluesselung auf? Ein DMG mit Node-ABI-Modul offnet ein
//    Fenster, dessen server nie lauscht — nur der lauf beweist, dass es nicht so ist.
const { spawn } = await import("node:child_process");
const os = await import("node:os");
const KAPSELN = [
  { ordner: "mac-arm64", arch: "arm64" },
  { ordner: "mac", arch: "x64" },
];
for (const k of KAPSELN) {
  const programm = path.join(RELEASE, k.ordner, "KEPTA.app/Contents/MacOS/KEPTA");
  if (!fs.existsSync(programm)) { meld(`${k.ordner}: programm fehlt — unbewiesen`, false); continue; }
  const kapsel = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-beweis-"));
  const schluessel = crypto.randomBytes(32).toString("hex");
  const umgebung = { ...process.env, HOME: kapsel, KEPTA_DATA_DIR: path.join(kapsel, ".kepta"), KEPTA_DB_KEY: schluessel };
  const kinder = k.arch === process.arch
    ? spawn(programm, [], { cwd: kapsel, env: umgebung, stdio: "ignore", detached: true })
    : spawn("arch", ["-x86_64", programm], { cwd: kapsel, env: umgebung, stdio: "ignore", detached: true });
  const endpointPf = path.join(kapsel, ".kepta/endpoint.json");
  let gesundheit = null;
  for (let versuch = 0; versuch < 24 && !gesundheit; versuch++) {
    await new Promise(r => setTimeout(r, 1500));
    try {
      const port = JSON.parse(fs.readFileSync(endpointPf, "utf8")).port;
      const roh = execFileSync("curl", ["-s", "--max-time", "5", `http://127.0.0.1:${port}/api/health`], { encoding: "utf8" });
      gesundheit = JSON.parse(roh);
    } catch { /* noch nicht so weit */ }
  }
  try { process.kill(-kinder.pid, "SIGKILL"); } catch { try { kinder.kill("SIGKILL"); } catch { /* schon weg */ } }
  fs.rmSync(kapsel, { recursive: true, force: true });
  if (!gesundheit) {
    meld(`${k.ordner}: kein /api/health in 36 s — die app antwortet nicht (Architektur ${k.arch})`, false);
    continue;
  }
  meld(`${k.ordner}: laeuft (${k.arch}) — server antwortet, version ${gesundheit.version}, verschluesselung ${gesundheit.encryption?.aktiv ? "an" : "AUS"}`,
    gesundheit.version === version && gesundheit.encryption?.aktiv === true);
}

// 2) SHA256SUMS.txt
const summe = path.join(RELEASE, "SHA256SUMS.txt");
if (fs.existsSync(summe)) {
  const text = fs.readFileSync(summe, "utf8");
  const genannt = new Set([...text.matchAll(/^[0-9a-f]{64}\s+\*?(\S+)$/gm)].map(m => m[1]));
  const fehlt = dateien.filter(f => !genannt.has(f));
  const yml = genannt.has("latest-mac.yml");
  meld(`SHA256SUMS.txt deckt alle ${dateien.length} Bauteile ab${fehlt.length ? " — es fehlen: " + fehlt.join(", ") : ""}`, fehlt.length === 0);
  meld("SHA256SUMS.txt nennt latest-mac.yml", yml);
  // inhalte-pruefung: jeder hash muss zur datei auf der platte passen
  const falsch = [];
  for (const m of text.matchAll(/^([0-9a-f]{64})\s+\*?(\S+)$/gm)) {
    const p = path.join(RELEASE, m[2]);
    if (!fs.existsSync(p)) { falsch.push(`${m[2]} (datei fehlt)`); continue; }
    if (sha256(p) !== m[1]) falsch.push(`${m[2]} (hash anders)`);
  }
  meld(`alle ${genannt.size} Pruefsummen stimmen mit den Dateien auf der platte ueberein`, falsch.length === 0);
} else {
  meld("SHA256SUMS.txt fehlt", false);
}

// 3) latest-mac.yml sha512
const ymlPf = path.join(RELEASE, "latest-mac.yml");
if (fs.existsSync(ymlPf)) {
  const yml = fs.readFileSync(ymlPf, "utf8");
  meld(`latest-mac.yml nennt Version ${version}`, new RegExp(`^version: ${version.replace(/\./g, "\\.")}$`, "m").test(yml));
  const pruef = [...yml.matchAll(/- url: (\S+)\n\s+sha512: (\S+)\n\s+size: (\d+)/g)];
  const schlecht = [];
  for (const [, url, sha, groesse] of pruef) {
    const p = path.join(RELEASE, url);
    if (!fs.existsSync(p)) { schlecht.push(`${url} (fehlt)`); continue; }
    if (sha512base64(p) !== sha) schlecht.push(`${url} (sha512 anders)`);
    if (String(fs.statSync(p).size) !== groesse) schlecht.push(`${url} (groesse anders)`);
  }
  meld(`${pruef.length} Eintraege in latest-mac.yml, alle mit echtem sha512 und echtem Umfang`, pruef.length > 0 && schlecht.length === 0);
  if (schlecht.length) meld("  ↳ " + schlecht.join(", "), false);
} else meld("latest-mac.yml fehlt", false);

// 4) fern
if (FERN) {
  const tag = `app-${version}`;
  const json = JSON.parse(execFileSync("curl", ["-s", "-H", "Accept: application/vnd.github+json",
    `https://api.github.com/repos/DamianTodorovic/kepta/releases/tags/${tag}`], { encoding: "utf8" }));
  if (!json.assets) meld(`Release ${tag}: kein Zugriff oder nicht gefunden (${json.message})`, false);
  else {
    const namen = json.assets.map(a => a.name).sort();
    const erwartet = [...dateien, "latest-mac.yml", "SHA256SUMS.txt"].sort();
    meld(`Release ${tag} traegt ${namen.length} Assets: ${namen.join(", ")}`, namen.length === erwartet.length);
    meld("Asset-Namen sind genau die lokalen Bauteile", JSON.stringify(namen) === JSON.stringify(erwartet));
    const dmg = `KEPTA-${version}-mac-arm64.dmg`;
    const asset = json.assets.find(a => a.name === dmg);
    if (asset) {
      const ziel = path.join(os.tmpdir(), "fern-" + dmg);
      // browser_download_url ist der ehrliche pfad; die api-url ist eine umlenkung,
      // aus der ein zusammengebauter pfad nie eine datei macht — der erste versuch
      // lud eine 404-seite und meldete einen hash, der nicht der bauteil-hash war.
      execFileSync("curl", ["-sL", "--fail", "-o", ziel, asset.browser_download_url], { maxBuffer: 1 << 26 });
      const fern = sha256(ziel), lokal = sha256(path.join(RELEASE, dmg));
      meld(`anonym geladenes arm64-dmg (${Math.round(fs.statSync(ziel).size / 1048576)} MiB) hat denselben hash wie die lokale Datei (${fern.slice(0, 16)}…)`, fern === lokal);
      fs.rmSync(ziel, { force: true });
    } else meld(`im Release fehlt ${dmg}`, false);
  }
}

console.log(`\nBeweis-Kette fuer KEPTA ${version}:`);
console.log(zeilen.join("\n"));
console.log(fehler ? `\n${fehler} FEHLER — nicht ausliefern.` : "\nalle Beweise angetreten — auslieferbar.");
process.exit(fehler ? 1 : 0);
