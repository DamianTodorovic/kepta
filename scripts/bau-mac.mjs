#!/usr/bin/env node
/**
 * bau-mac.mjs — der Mac-Bau mit drei Pflichten, die die Skript-Zeile vorher nicht hatte.
 *
 * 1. Argumente weiterreichen. Die CI baut `npm run build:mac -- --publish never --arm64
 *    --x64` (.github/workflows/build.yml:111). npm haengt zusaetzliche Argumente an das
 *    ENDE der Skript-Zeile; in einer &&-Kette landen sie damit beim letzten Befehl der
 *    Kette und nicht bei electron-builder. Seit die Bau-Quittung (2.) als dritter Befehl
 *    in derselben Kette stand, waere `--arm64` bei `git rev-parse` angekommen. Also ein
 *    eignes Skript, das die Argumente selbst an electron-builder uebergibt.
 *
 * 2. Die Bau-Quittung schreiben: release/BAU-COMMIT.txt nennt den Commit, aus dem die
 *    Pakete stammen. Ohne sie kann scripts/release-beweisen.mjs Schritt 5 nicht pruefen,
 *    ob der Release-Tag auf denselben Commit zeigt. Genau dieser Bruch hat app-3.2.213
 *    zwei Tage lang einen fremden Quelltext bescheinigt: Tag 064671a (13.11., Kern-Linie),
 *    Bau 3ca25a4 (15.11., App-Linie), kein gemeinsamer Vorfahr, 133 Dateien ausgelieferter
 *    Code dazwischen.
 *
 * 3. Das native Modul mit der richtigen ABI einlegen. @electron/rebuild meldet im Bau-Log
 *    "finished moduleName=better-sqlite3-multiple-ciphers arch=arm64" und laesst
 *    node_modules/.../build/Release/better_sqlite3.node trotzdem stehen, wie es ist —
 *    gemessen am 16.11.2026 eine Node-Fassung mit NODE_MODULE_VERSION 147, waehrend das
 *    gepackte Electron 44.4.1 die 149 verlangt. Das Paket oeffnet dann ein Fenster, dessen
 *    Server nie lauscht (derselbe Fall, den der Kopf von release-beweisen.mjs fuer den
 *    12.10. zweimal beschreibt). Die fertigen Electron-Builds liegen ungenutzt in
 *    bin/darwin-<arch>-<abi>/ derselben Abhaengigkeit; dieses Skript legt die passende
 *    Fassung vor jedem Architektur-Durchgang nach build/Release und stellt danach die
 *    Node-Fassung zurueck, damit `npm test` nach einem Paketbau nicht hunderte Fehler
 *    mit irrefuehrender Meldung zeigt (AGENTS.md nennt diese Falle).
 *    Arch fuer Arch, weil in build/Release jeweils nur eine Fassung passt.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HIER = path.resolve(import.meta.dirname, "..");
const argumente = process.argv.slice(2);
const MODUL = path.join(HIER, "node_modules", "better-sqlite3-multiple-ciphers");
const ZIEL = path.join(MODUL, "build", "Release", "better_sqlite3.node");
// Die Sicherung liegt AUSSERHALB des Modulbaums, und das hat zwei gemessene Gruende
// (16.11.2026, erster 3.2.214-Bau). Erstens packt electron-builder alles mit, was nicht
// `*.node` heisst: `better_sqlite3.node.vor-bau` neben dem Binary endete im arm64-Paket
// (6313 Dateien gegen 6312 im x64-Paket), ein Node-Binding mit fremder ABI im
// ausgelieferten Objekt. Zweitens raeumt @electron/rebuild build/Release waehrend des
// Baus — die Sicherung verschwand mit, die Rueckstellung lief ins Leere, und
// node_modules trug danach das x64-Binding: `npm test` starb in der Vor-Wache
// (bindings.js:121), nicht in einem einzigen Test. Schritt 1c der Beweis-Kette haelt
// die Payload beider Architekturen gegeneinander; die Ursache wird hier geheilt.
const SICHERUNG_ORDNER = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-bau-abi-"));
const SICHERUNG = path.join(SICHERUNG_ORDNER, "better_sqlite3.node");

function laufen(befehl, args) {
  execFileSync(befehl, args, { cwd: HIER, stdio: "inherit" });
}

function architekturen() {
  const gewaehlt = ["arm64", "x64"].filter(a => argumente.includes(`--${a}`));
  if (gewaehlt.length > 0) return gewaehlt;
  return [process.arch === "x64" ? "x64" : "arm64"];
}

/** Den Electron-Build fuer eine Architektur aus bin/ holen — hoechste ABI gewinnt. */
function electronModul(arch) {
  const bin = path.join(MODUL, "bin");
  const kaesten = fs.existsSync(bin) ? fs.readdirSync(bin).filter(n => n.startsWith(`darwin-${arch}-`)) : [];
  if (kaesten.length === 0) {
    throw new Error(`${bin} hat keinen Kasten fuer darwin-${arch} — ohne Electron-Build wird kein Paket gelegt`);
  }
  kaesten.sort((a, b) => Number(a.split("-").pop()) - Number(b.split("-").pop()));
  const kasten = kaesten[kaesten.length - 1];
  if (kaesten.length > 1) console.log(`  Hinweis: ${kaesten.length} ABI-Kaesten fuer darwin-${arch}, genommen ${kasten}`);
  const quelle = path.join(bin, kasten, "better-sqlite3-multiple-ciphers.node");
  if (!fs.existsSync(quelle)) throw new Error(`${quelle} fehlt`);
  return { kasten, quelle };
}

const archs = architekturen();
const durchgang = argumente.filter(a => a !== "--arm64" && a !== "--x64");
console.log(`bau-mac: Architekturen ${archs.join(" + ")} | an electron-builder weitergereicht: ${durchgang.join(" ") || "(nichts)"}`);

laufen("npm", ["run", "build"]);

if (fs.existsSync(ZIEL) && !fs.existsSync(SICHERUNG)) fs.copyFileSync(ZIEL, SICHERUNG);
let gebaut = 0;
try {
  for (const arch of archs) {
    const { kasten, quelle } = electronModul(arch);
    fs.copyFileSync(quelle, ZIEL);
    console.log(`  ${arch}: ${kasten} -> build/Release/better_sqlite3.node`);
    laufen(path.join(HIER, "node_modules", ".bin", "electron-builder"),
      ["--mac", `--${arch}`, "--config", "electron-builder.json", ...durchgang]);
    gebaut++;
  }
} finally {
  // Auch nach einem Abbruch: die Suite braucht die Node-Fassung, nicht die Electron-Fassung.
  if (fs.existsSync(SICHERUNG)) {
    fs.copyFileSync(SICHERUNG, ZIEL);
    console.log("  node_modules auf die Node-Fassung zurueckgestellt (die Suite braucht sie)");
  }
  fs.rmSync(SICHERUNG_ORDNER, { recursive: true, force: true });
}
if (gebaut !== archs.length) process.exit(1);

const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: HIER, encoding: "utf8" }).trim();
fs.mkdirSync(path.join(HIER, "release"), { recursive: true });
fs.writeFileSync(path.join(HIER, "release", "BAU-COMMIT.txt"), `${head}\n`);
console.log(`Bau-Quittung: ${head}`);
