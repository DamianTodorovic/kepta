// P121 — die Aussendung und die Ablage, am 6.11. um 19:44 bis 19:53 MEZ vermessen.
//
// Was hier steht, ist ein Lauf, nicht ein Absatz: jeder Befund kommt aus einem
// Befehl, der in der Ausgabe nennen ist, und die Zahl hat ihren Nenner.
//
//   node docs/belege/aussendung-0611/vermessen.mjs
//
// Die Ausgabe ist zweigeteilt:
//   aussendung-0611.json  — die Messwerte selbst, ohne Uhrzeit, damit ein zweiter
//                           Lauf auf demselben Stand dieselben Bytes schreibt
//   aussendung-0611.log.txt — derselbe Lauf mit Uhrzeit, Befehl und roher Ausgabe
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const HIER = path.resolve(import.meta.dirname, "../../..");
const AUS = path.resolve(import.meta.dirname);
const RELEASE = path.join(HIER, "release");
const ARTEFakte = ["README.md", ".github/release-notes.md"];
const ASAR = "/Applications/K3PTA.app/Contents/Resources/app.asar";
const ZEIGEN = [];
const say = (t) => { ZEIGEN.push(t); console.log(t); };
const ruhren = () => new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin", hour12: false });

const sha512b64 = (p) => crypto.createHash("sha512").update(fs.readFileSync(p)).digest("base64");
const sha256hex = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const giB = (kiB) => Math.round((kiB / 1024 / 1024) * 100) / 100;
const ausDerFerne = (befehl, args) => {
  // codesign schreibt seine Beschreibung auf stderr, und execFileSync liefert nur
  // stdout — dasselbe Loch, an dem der Build einmal nur an einer Protokollzeile
  // starb (scripts/adhoc-sign.cjs:28-32). Also spawnSync, und beide Raehre zusammen.
  const r = spawnSync(befehl, args, { encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.error && !r.stdout && !r.stderr) return `BEFEHL FEHLGESCHLAGEN: ${r.error.message}`;
  return `${r.stdout ?? ""}${r.stderr ?? ""}`;
};

const mess = {};

// --- 1) die zwei Aussendungstexte: jeder absolute Pfad muss die Marke nennen ---
const produktName = JSON.parse(fs.readFileSync(path.join(HIER, "electron-builder.json"), "utf-8")).productName;
mess.pfade = { erwartet: produktName, dateien: {}, vor_dem_schlag: {}, kontrolle_strasse: null };
const pfadSonde = (t) => [
  ...[...t.matchAll(/\/Applications\/([^/\s"`)]+)\.app/g)].map((m) => m[1]),
  ...[...t.matchAll(/Contents\/MacOS\/([A-Za-z0-9_-]+)/g)].map((m) => m[1]),
];
const retired = /daily limit|unlimited day|Tageslimite|Tag ohne Grenzen|removes (only )?the (daily )?limits|entfernt nur die Limiten/i;
const gesetz = /until 3\.1\.4|bis 3\.1\.4|was removed|ist entfernt|entfernt wurde|stopped being read/i;
for (const f of ARTEFakte) {
  const text = fs.readFileSync(path.join(HIER, f), "utf-8");
  const namen = [...new Set(pfadSonde(text))];
  const alt = ausDerFerne("git", ["-C", HIER, "show", `HEAD:${f}`]);
  mess.pfade.dateien[f] = {
   stellen: pfadSonde(text).length,
   namen,
    Marke: namen.length === 1 ? namen[0] === produktName : false,
    grenzzeilen_Gegenwart: text.split("\n").filter((z) => retired.test(z) && !gesetz.test(z)).length,
  };
  mess.pfade.vor_dem_schlag[f] = {
    stellen: pfadSonde(alt).length,
    namen: [...new Set(pfadSonde(alt))],
    grenzzeilen_Gegenwart: alt.split("\n").filter((z) => retired.test(z) && !gesetz.test(z)).length,
  };
}
say(`1) Pfad- und Grenzsonde, Marke aus electron-builder.json = "${produktName}"  [${ruhren()}]`);
for (const f of ARTEFakte) {
  const n = mess.pfade.vor_dem_schlag[f], j = mess.pfade.dateien[f];
  say(`   ${f}: vor dem Schlag ${n.stellen} Pfadstellen in ${n.namen.length} Marke(n) [${n.namen.join(", ")}], ` +
    `${n.grenzzeilen_Gegenwart} Zeile(n) mit Grenze in der Gegenwart`);
  say(`   ${f}: nach dem Schlag ${j.stellen} Pfadstellen in ${j.namen.length} Marke(n) [${j.namen.join(", ")}], ` +
    `${j.grenzzeilen_Gegenwart} Zeile(n) mit Grenze in der Gegenwart`);
}
say(`   Kontrolle gegen taube Sonde: ROADMAP.md hat ${pfadSonde(fs.readFileSync(path.join(HIER, "ROADMAP.md"), "utf-8")).length} Pfadstellen`);
mess.pfade.kontrolle_strasse = pfadSonde(fs.readFileSync(path.join(HIER, "ROADMAP.md"), "utf-8")).length;

// --- 2) die Ablage: was liegt in release/, und was ist es wert ---
const dateien = fs.readdirSync(RELEASE).filter((n) => fs.statSync(path.join(RELEASE, n)).isFile());
const art = (n) => (n.match(/\.((?:dmg|zip)(?:\.blockmap)?)$/) ?? [])[1] ?? "andere";
const gruppen = {};
for (const n of dateien) {
  const g = (gruppen[art(n)] ??= { anzahl: 0, KiB: 0 });
  g.anzahl++;
  g.KiB += Math.round(fs.statSync(path.join(RELEASE, n)).size / 1024);
}
const Fassungen = [...new Set(dateien.filter((n) => /^K3PTA-/.test(n)).map((n) => n.replace(/^K3PTA-|-mac.*$/g, "")))].sort();
mess.ablage = {
  Ordner: RELEASE,
  Dateien: dateien.length,
  Fassungen: { anzahl: Fassungen.length, erste: Fassungen[0], letzte: Fassungen[Fassungen.length - 1] },
  Gruppen: gruppen,
  Summen_KiB: Object.values(gruppen).reduce((a, g) => a + g.KiB, 0),
  Summen_GiB: giB(Object.values(gruppen).reduce((a, g) => a + g.KiB, 0)),
  x64_Dateien: dateien.filter((n) => /x64/.test(n)).length,
  SHA256SUMS_Dateien: dateien.filter((n) => /SHA256SUMS/i.test(n)).length,
  entpackte_Ordner: fs.readdirSync(RELEASE).filter((n) => fs.statSync(path.join(RELEASE, n)).isDirectory()),
};
say(`\n2) release/ am ${ruhren()}: ${dateien.length} Dateien, ${Fassungen.length} Fassungen ` +
  `${Fassungen[0]}…${Fassungen[Fassungen.length - 1]}`);
for (const [a, g] of Object.entries(gruppen)) say(`   ${a.padEnd(14)} ${String(g.anzahl).padStart(3)} Stueck  ${giB(g.KiB).toFixed(2)} GiB`);
say(`   zusammen: ${mess.ablage.Summen_GiB} GiB — davon x64: ${mess.ablage.x64_Dateien}, SHA256SUMS: ${mess.ablage.SHA256SUMS_Dateien}`);

// --- 3) die einzige Summen-Quelle auf der Platte: latest-mac.yml ---
const yml = fs.readFileSync(path.join(RELEASE, "latest-mac.yml"), "utf-8");
const Eintrag = [...yml.matchAll(/- url: (\S+)\n\s+sha512: (\S+)\n\s+size: (\d+)/g)]
  .map((m) => {
    const p = path.join(RELEASE, m[1]);
    const hat = fs.existsSync(p);
    return {
      Datei: m[1],
      yml_groesse: Number(m[3]),
      ist_groesse: hat ? fs.statSync(p).size : null,
      yml_sha512: m[2],
      ist_sha512: hat ? sha512b64(p) : null,
      groesse_stimmt: hat && fs.statSync(p).size === Number(m[3]),
      sha512_stimmt: hat && sha512b64(p) === m[2],
      sha256: hat ? sha256hex(p) : null,
    };
  });
mess.summen = { yml_version: (yml.match(/^version: (\S+)$/m) ?? [])[1] ?? "?", eintraege: Eintrag,
  deckt_ab: Eintrag.length, gegen: Fassungen.length };
say(`\n3) latest-mac.yml nennt ${Eintrag.length} Dateien fuer Version ${mess.summen.yml_version}; ` +
  `beide mit grosse und sha512 geprueft: ${Eintrag.every((e) => e.groesse_stimmt && e.sha512_stimmt)}`);
for (const e of Eintrag) say(`   ${e.Datei}: grosse ${e.ist_groesse} gegen ${e.yml_groesse} (${e.groesse_stimmt ? "gleich" : "ungleich"}), ` +
  `sha512 ${e.sha512_stimmt ? "gleich" : "UNGLEICH"} — sha256 ${e.sha256?.slice(0, 16)}…`);
say(`   Die Summen-Quelle deckt ${Eintrag.length} von ${Fassungen.length * 4} Installations-Dateien der Ablage ` +
  `(${(100 * Eintrag.length / (Fassungen.length * 4)).toFixed(1)} %), also eine von ${Fassungen.length} Fassungen.`);

// --- 4) Signatur und Gatekeeper, am Installer-Bundel und am installierten ---
const signatur = (b) => {
  const text = ausDerFerne("codesign", ["-dvvv", b]);
  const zeile = (r) => (text.match(r) ?? [])[1] ?? "?";
  return {
    Identifier: zeile(/Identifier=(\S+)/),
    Signature: zeile(/Signature=(\S+)/),
    flags: zeile(/flags=(\S+)/),
    TeamIdentifier: zeile(/TeamIdentifier=(.+)/),
    CDHash: zeile(/^CDHash=(\S+)/m),
    versiegelte_Dateien: zeile(/files=(\d+)/),
    Authority: [...text.matchAll(/^Authority=(.+)$/gm)].map((m) => m[1]),
    rohe_Zeilen: text.split("\n").filter(Boolean).length,
  };
};
const wache = (b) => ausDerFerne("spctl", ["--assess", "--type", "execute", "-vvv", b]).trim().split("\n").pop();
mess.signatur = {
  installiert: { bundel: "/Applications/K3PTA.app", ...signatur("/Applications/K3PTA.app"), spctl: wache("/Applications/K3PTA.app"),
    quarantine: (ausDerFerne("xattr", ["-l", "/Applications/K3PTA.app"]).match(/quarantine/g) ?? []).length },
  installer: null,
};
const MONTAGE = "/tmp/rl0611/mnt";
fs.mkdirSync(MONTAGE, { recursive: true });
const dmg = path.join(RELEASE, `K3PTA-${mess.summen.yml_version}-mac-arm64.dmg`);
ausDerFerne("hdiutil", ["attach", "-nobrowse", "-readonly", "-mountpoint", MONTAGE, dmg]);
mess.signatur.installer = { bundel: `${MONTAGE}/K3PTA.app`, dmg: path.basename(dmg), ...signatur(`${MONTAGE}/K3PTA.app`), spctl: wache(`${MONTAGE}/K3PTA.app`) };
mess.signatur.installer.plist_version = ausDerFerne("plutil", ["-extract", "CFBundleShortVersionString", "raw", "-o", "-", `${MONTAGE}/K3PTA.app/Contents/Info.plist`]).trim();
const pruef = spawnSync("codesign", ["--verify", "--deep", "--strict", `${MONTAGE}/K3PTA.app`], { encoding: "utf8" });
mess.signatur.installer.codesign_pruefung = {
  exit: pruef.status,
  meldung: `${pruef.stdout ?? ""}${pruef.stderr ?? ""}`.trim() || "keine Meldung bei Exit 0 — die Signatur ist auf der Platte in Ordnung",
};
say(`\n4) Signatur und Gatekeeper  [${ruhren()}]`);
for (const [k, v] of Object.entries(mess.signatur)) {
  if (!v.Signature) continue;
  say(`   ${k}: ${v.rohe_Zeilen} Zeilen Beschreibung, Signature=${v.Signature} flags=${v.flags} ` +
    `TeamIdentifier=${v.TeamIdentifier} Authority-Zeilen=${v.Authority.length} CDHash=${v.CDHash} ` +
    `versiegelte Dateien=${v.versiegelte_Dateien} — spctl: ${v.spctl}`);
}
const identisch = mess.signatur.installiert.CDHash === mess.signatur.installer.CDHash;
say(`   Der Code-Hash des installierten Bundels ${identisch ? "ist" : "ist NICHT"} derselbe wie der des ` +
  `letzten Installers (${mess.signatur.installiert.CDHash} gegen ${mess.signatur.installer.CDHash}).`);
say(`   Am installierten Bundel ${mess.signatur.installiert?.quarantine ? "haengt" : "haengt kein"} com.apple.quarantine: ` +
  `${mess.signatur.installiert?.quarantine ?? 0} xattr-Nennung(en) — der Rechner hier hat die App nicht heruntergeladen.`);
say(`   Das Installer-Bundel nennt in seiner Info.plist die Fassung ${mess.signatur.installer.plist_version} — ` +
  `derselbe Name, den die Datei und latest-mac.yml tragen.`);
say(`   codesign --verify --deep --strict am Installer-Bundel: Exit ${mess.signatur.installer.codesign_pruefung.exit}, ` +
  `Meldung: ${mess.signatur.installer.codesign_pruefung.meldung.slice(0, 90)}`);
ausDerFerne("hdiutil", ["detach", MONTAGE]);

// --- 5) fuer wen die Zip- und Blockmap-Dateien da waeren: der Verbraucher im Objekt ---
const woerter = ["autoUpdater", "electron-updater", "checkForUpdates", "latest-mac", "differentialPackage"];
mess.updater = {};
for (const w of [...woerter, "memory_search"]) {
  mess.updater[w] = Number(ausDerFerne("sh", ["-c", `grep -a -o ${JSON.stringify(w)} ${JSON.stringify(ASAR)} | wc -l`]).trim());
}
say(`\n5) Verbraucher im ausgelieferten app.asar (${(fs.statSync(ASAR).size / 1048576).toFixed(0)} MiB)  [${ruhren()}]`);
for (const w of woerter) say(`   ${w.padEnd(20)} ${mess.updater[w]}-mal`);
say(`   Kontrolle, damit die Sonde nicht taub ist: memory_search ${mess.updater.memory_search}-mal`);

// --- 6) was oeffentlich herunterladbar ist (GitHub-API, gelesen, nicht geschrieben) ---
const fern = path.join(AUS, "github-releases-0611.json");
if (!fs.existsSync(fern)) {
  ausDerFerne("curl", ["-s", "-m", "25", "https://api.github.com/repos/DamianTodorovic/kepta/releases?per_page=100", "-o", fern]);
}
const releases = JSON.parse(fs.readFileSync(fern, "utf8"));
const asseten = releases.flatMap((r) => r.assets.map((a) => a.name));
mess.fern = {
  anzahl: releases.length,
  letzte: releases[0]?.tag_name,
  assete: asseten.length,
  arm64: asseten.filter((n) => /arm64/.test(n)).length,
  x64: asseten.filter((n) => /x64/.test(n)).length,
  dmg: asseten.filter((n) => /\.dmg$/.test(n)).length,
  summen: asseten.filter((n) => /SHA256SUMS/i.test(n)).length,
  stems: [...new Set(asseten.filter((n) => /\.(dmg|zip)$/.test(n)).map((n) => n.replace(/-.*/, "")))].sort(),
  koerper_3_2_1_worte: null,
};
const erste = releases.find((r) => r.tag_name === releases[0]?.tag_name);
const koerper = erste?.body ?? "";
mess.fern.koerper_3_2_1_worte = Object.fromEntries(["com.apple.quarantine", "KEPTA.app", "K3PTA.app", "Tageslimiten", "daily limit", "notar"]
  .map((w) => [w, koerper.split(w).length - 1]));
mess.fern.koerper_zeilen = koerper.split("\n").length;
say(`\n6) oeffentlich herunterladbar, aus der GitHub-API gelesen  [${ruhren()}]`);
say(`   ${releases.length} Releases, letzter Tag ${mess.fern.letzte}; ${asseten.length} Assete: ` +
  `arm64 ${mess.fern.arm64}, x64 ${mess.fern.x64}, dmg ${mess.fern.dmg}, SHA256SUMS ${mess.fern.summen}`);
say(`   Datei-Staemme in den Asseten: ${mess.fern.stems.join(", ")}`);
say(`   Der Koerper des obersten Releases (${mess.fern.koerper_zeilen} Zeilen) traegt: ` +
  Object.entries(mess.fern.koerper_3_2_1_worte).map(([k, v]) => `${k} ${v}-mal`).join(", "));

// --- 7) Platte und Kante, damit die Entscheidung eine Groesse hat ---
const df = ausDerFerne("df", ["-k", "/"]).trim().split("\n").pop().split(/\s+/);
const freiKiB = Number(df[3]);
// /tmp ist ein Symlink auf /private/tmp: du -sk /tmp meldet 0, du -sk /tmp/ meldet
// den Stapel. Erwischt am 6.11. um 19:57 MEZ, weil der erste Lauf "stapel 0 GiB"
// schrieb, waehrend dieselbe Platte 1,15 Gi Ruecklager trug.
const stapel = Number(ausDerFerne("sh", ["-c", "du -sk /tmp/ 2>/dev/null | cut -f1"]).split("\n")[0]);
const entpacktKiB = Number(ausDerFerne("sh", ["-c", `du -sk ${JSON.stringify(path.join(RELEASE, "mac-arm64"))} | cut -f1`]).trim());
const ruecklager = fs.readdirSync("/tmp").filter((n) => /^K3PTA-vor-/.test(n));
const ruecklagerKiB = ruecklager.reduce((a, n) => a + Number(ausDerFerne("sh", ["-c", `du -sk /tmp/${n} | cut -f1`]).trim()), 0);
mess.kante = {
  frei_KiB: freiKiB, frei_GiB: giB(freiKiB), stapel_KiB: stapel, stapel_GiB: giB(stapel),
  ruecklager: { ordner: ruecklager, KiB: ruecklagerKiB, GiB: giB(ruecklagerKiB) },
  ablage_GiB: mess.ablage.Summen_GiB,
 bedarf: { bau_GiB: 9.9, tausch_GiB: giB(8 * 1024 * 1024 + entpacktKiB + 153 * 1024), entpackt_KiB: entpacktKiB },
};
say(`\n7) Platte  [${ruhren()}]`);
say(`   frei ${mess.kante.frei_GiB} GiB — Bau braucht ${mess.kante.bedarf.bau_GiB} GiB, Tausch ${mess.kante.bedarf.tausch_GiB} GiB ` +
  `(Kante 8 GiB + entpacktes Objekt ${mess.kante.bedarf.entpackt_KiB} KiB + Spiel 0,15 GiB)`);
say(`   ruecklager im stapel: ${ruecklager.length} ordner (${mess.kante.ruecklager.GiB} GiB), ablage ${mess.kante.ablage_GiB} GiB, stapel insgesamt ${mess.kante.stapel_GiB} GiB`);

fs.writeFileSync(path.join(AUS, "aussendung-0611.json"), JSON.stringify(mess, null, 1) + "\n");
fs.writeFileSync(path.join(AUS, "aussendung-0611.log.txt"), ZEIGEN.join("\n") + "\n");
console.log(`\nSpur: docs/belege/aussendung-0611/aussendung-0611.json + aussendung-0611.log.txt`);
