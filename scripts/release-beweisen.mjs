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
import { electronBindung } from "./pruefe-native.mjs";

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
  ["arm64", "x64"].map(arch => `K3PTA-${version}-mac-${arch}.${arche}`)
);
// Gebaut werden acht Bauteile, veroeffentlicht werden zwei. Der Rest hat keinen
// Abnehmer: die App hat keinen Auto-Updater (electron-updater und autoUpdater kommen
// im Quelltext nicht vor), also liest niemand latest-mac.yml, und ohne Updater braucht
// niemand zip oder blockmap. Gemessen an der GitHub-API am 16.11.2026 traegt der
// Release app-3.2.213 genau drei Assets: die zwei .dmg und SHA256SUMS.txt — denselben
// Kanon nennt README.md ("Downloads ship as finished .dmg installers plus
// SHA256SUMS.txt"). Diese Kette verlangte bis hierher zehn und konnte damit fuer KEINEN
// echten Release bestehen; ein Gate, das nie gruen wird, faehrt niemand, und genau
// deshalb ist der falsche Tag zwei Tage lang ungeprueft geblieben.
const VEROEFFENTLICHT = ["arm64", "x64"].map(arch => `K3PTA-${version}-mac-${arch}.dmg`);
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
// Die entpackten Bau-Ordner (release/mac-arm64, release/mac) ueberleben den Bau nicht —
// gemessen 16.11.2026: beide weg, und damit fiel der wertvollste Schritt dieser Kette
// ersatzlos aus (startet das Paket wirklich, und traegt das native Modul die
// Electron-ABI?). Ein Gate, das nach dem Bau nie wieder fahren kann, faehrt niemand.
// Gefragt wird jetzt das, was tatsaechlich ausgeliefert wird: die .app IN der .dmg.
const MOUNTS = new Map();
function appAusDmg(arch) {
  const dmg = path.join(RELEASE, `K3PTA-${version}-mac-${arch}.dmg`);
  if (!fs.existsSync(dmg)) return { grund: `${path.basename(dmg)} fehlt` };
  let punkt = MOUNTS.get(arch);
  if (!punkt) {
    let ausgabe;
    try {
      ausgabe = execFileSync("hdiutil", ["attach", "-nobrowse", "-readonly", dmg], { encoding: "utf8" });
    } catch (e) { return { grund: `${path.basename(dmg)} liess sich nicht einhaengen (${e.message})` }; }
    punkt = ausgabe.split("\n").map(z => z.split("\t").pop().trim()).find(p => p.startsWith("/Volumes/"));
    if (!punkt) return { grund: `${path.basename(dmg)} eingehaengt, aber kein Mountpoint in der Antwort` };
    MOUNTS.set(arch, punkt);
  }
  const apps = fs.readdirSync(punkt).filter(n => n.endsWith(".app"));
  if (apps.length !== 1) return { grund: `erwartet genau eine .app in ${punkt}, gefunden: ${apps.join(", ") || "keine"}` };
  return { app: path.join(punkt, apps[0]) };
}
function ausHaengen() {
  for (const [, punkt] of MOUNTS) { try { execFileSync("hdiutil", ["detach", punkt], { stdio: "ignore" }); } catch { /* schon weg */ } }
  MOUNTS.clear();
}
process.on("exit", ausHaengen);
for (const k of KAPSELN) {
  // Der Programmname kommt aus dem Ordner, nicht aus dem Kopf. Die Marke hat sich
  // schon geaendert (KEPTA -> K3PTA) und die Wache suchte weiter das alte Blatt:
  // sie meldete "programm fehlt" undliess damit den **einzigen Test** aus, der ein
  // native Binding fuer die falsche Laufzeit sieht — zwei Naechte hintereinander
  // ist ein Paket mit Node-ABI durchgerutscht, die App oeffnete ein Fenster ohne Tuer.
  const quelle = appAusDmg(k.arch);
  if (!quelle.app) { meld(`${k.ordner}: ${quelle.grund}`, false); continue; }
  const marke = path.basename(quelle.app).slice(0, -4);
  const programm = path.join(quelle.app, "Contents/MacOS", marke);
  if (!fs.existsSync(programm)) { meld(`${k.ordner}: ${programm} fehlt (Marke ${marke} aus dem Ordner gewonnen)`, false); continue; }
  // 1b) Das Binding gegen die Electron-Laufzeit, die es tragen muss — vor dem Start.
  //     Der Start haette denselben Fall auch gefunden, aber erst nach 36 s und ohne
  //     Grund („antwortet nicht"). Hier steht der Name des Fehlers, und ein Paket
  //     ohne entpacktes Modul ist keine bestandene Pruefung, sondern eine fehlende.
  //     Gefragt wird das native Binary, nicht das Paket: `bindings` bleibt im asar
  //     und ist von aussen nicht ladbar (gemessen 16.10. 12:18:50).
  const bin = path.join(quelle.app, "Contents/Resources/app.asar.unpacked/node_modules/better-sqlite3-multiple-ciphers/build/Release/better_sqlite3.node");
  if (!fs.existsSync(bin)) {
    meld(`${k.ordner}: kein entpacktes SQLite-Modul unter app.asar.unpacked — die Laufzeit bleibt ungewiss`, false);
  } else {
    const laufen = k.arch === process.arch ? undefined : (p, code) => {
      try {
        return String(execFileSync("arch", ["-x86_64", p, "-e", code], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 }) ?? "").trim();
      } catch (e) { return String(e.stderr ?? e.message ?? e); }
    };
    const bindung = electronBindung({ programm, bin, laufen });
    meld(`${k.ordner}: Binding gegen Electron (${k.arch}) — ${bindung.ok ? `passt, NODE_MODULE_VERSION ${bindung.abi ?? "gemeldet ohne Zahl"}` : bindung.grund}`, bindung.ok);
  }
  const kapsel = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-beweis-"));
  const schluessel = crypto.randomBytes(32).toString("hex");
  // ELECTRON_RUN_AS_NODE muss raus: geerbt aus der Agenten-Shell startet das Paket
  // dann als nackter Node-Kopf — Exit 0, kein Fenster, keine Tür, kein endpoint.json.
  // 22.10. hat diese eine Variable drei Builds (3.2.34/36/37) für tot erklärt.
  const umgebung = { ...process.env, HOME: kapsel, KEPTA_DATA_DIR: path.join(kapsel, ".kepta"), KEPTA_DB_KEY: schluessel };
  delete umgebung.ELECTRON_RUN_AS_NODE;
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

// 1b) Artefakt-INHALT: Marker aus dem Quelltext muessen im Paket stehen.
//   Warum eine eigne Zeile: der Kapselstart oben fragt die Laufzeit ab (Version,
//   Verschluesselung) — ein Paket, dem eine Flaechenheilung fehlt, laeuft trotzdem und
//   wird fuer ausgeliefert gehalten. Gemessen 16.10.: app.asar geschrieben 17:55, der
//   Commit der Heilung 18:54; die Kette meldete "laeuft". Und zaehlen darf man nur
//   Zeichenketten: ein Bundle wird minifiziert, Kennungen (`setIsFocusMode`,
//   `QUITTUNG_MS`) kommen im Paket 0-mal vor, obwohl der Code drin ist — ein 0 bei
//   einem Identifier beweist nichts, ein 0 bei einem Text beweist alles.
const MARKER = ["data-abschnitt", "data-quittung"];
const imQuelltext = (marker) => {
  let n = 0;
  const geht = (ordner) => {
    for (const e of fs.readdirSync(ordner, { withFileTypes: true })) {
      const p = path.join(ordner, e.name);
      if (e.isDirectory()) { geht(p); continue; }
      if (!/\.(ts|tsx)$/.test(e.name)) continue;
      n += (fs.readFileSync(p, "utf8").match(new RegExp(marker, "g")) || []).length;
    }
  };
  geht(path.join(HIER, "src"));
  return n;
};
const imPaket = (asar, marker) => {
  try {
    return execFileSync("grep", ["-a", "-o", marker, asar],
      { maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] }).toString().split("\n").filter(Boolean).length;
  } catch { return 0; }
};
for (const k of KAPSELN) {
  const quelle = appAusDmg(k.arch);
  if (!quelle.app) continue;                               // Schritt 1 meldet das schon
  const asar = path.join(quelle.app, "Contents/Resources/app.asar");
  if (!fs.existsSync(asar)) { meld(`${k.ordner}: kein app.asar unter ${asar} — Inhalt ist nicht pruefbar`, false); continue; }
  for (const m of MARKER) {
    const soll = imQuelltext(m), ist = imPaket(asar, m);
    if (soll === 0) { meld(`${k.ordner}: ${m} — Quelltext nennt den Marker 0-mal, nichts zu pruefen`, true); continue; }
    meld(`${k.ordner}: ${m} — Quelltext ${soll}-mal, Paket ${ist}-mal` +
      (ist === 0 ? " — die Heilung steckt NICHT in dem Paket, das ausgeliefert wuerde" : ""), ist > 0);
  }
}

// 1c) Beide Architekturen muessen dasselbe Programm tragen. Gemessen 16.11.2026 am
//   ersten 3.2.214-Bau: arm64 hatte 6313 Dateien im asar, x64 6312 — die Sicherung des
//   Node-Bindings (`better_sqlite3.node.vor-bau`) lag im Modulbaum und wurde mitgepackt.
//   Schritt 1 sieht das nicht: beide Pakete starten, beide melden dieselbe Version.
//   Erlaubt sind allein die nativen Binaries, die je Architektur anders sein muessen.
//   Gezahlt wird ueber die Integritaets-Hashes im asar-Kopf, nicht ueber Dateigroessen.
let asarWerkzeug = null;
try { asarWerkzeug = (await import("@electron/asar")).default; } catch { /* Schritt 1c meldet das */ }
function payloadKarte(asarPf) {
  const karte = new Map();
  const geh = (knoten, weg) => {
    for (const [name, eintrag] of Object.entries(knoten.files ?? {})) {
      const w = weg ? `${weg}/${name}` : name;
      if (eintrag.files) geh(eintrag, w);
      else karte.set(w, eintrag.integrity?.hash ?? `${eintrag.size}:${eintrag.offset}`);
    }
  };
  geh(JSON.parse(asarWerkzeug.getRawHeader(asarPf).headerString), "");
  return karte;
}
if (!asarWerkzeug) {
  meld("@electron/asar nicht ladbar — die Payload beider Architekturen ist nicht vergleichbar", false);
} else {
  const pakete = KAPSELN.map(k => ({ arch: k.arch, quelle: appAusDmg(k.arch) }));
  const fehlend = pakete.filter(p => !p.quelle.app);
  if (fehlend.length) {
    meld(`Payload-Vergleich nicht gefahren: ${fehlend.map(p => `${p.arch} (${p.quelle.grund})`).join(", ")}`, false);
  } else {
    const karten = pakete.map(p => ({ arch: p.arch, karte: payloadKarte(path.join(p.quelle.app, "Contents/Resources/app.asar")) }));
    const [a, b] = karten;
    const nurA = [...a.karte.keys()].filter(f => !b.karte.has(f));
    const nurB = [...b.karte.keys()].filter(f => !a.karte.has(f));
    meld(`beide Pakete nennen dieselben Dateien (arm64 ${a.karte.size}, x64 ${b.karte.size})` +
      (nurA.length || nurB.length ? ` — nur arm64: ${nurA.join(", ") || "keine"}; nur x64: ${nurB.join(", ") || "keine"}` : ""),
      nurA.length === 0 && nurB.length === 0);
    const anders = [...a.karte.keys()].filter(f => b.karte.has(f) && a.karte.get(f) !== b.karte.get(f));
    const fremd = anders.filter(f => !f.endsWith(".node"));
    meld(`inhaltlich verschieden sind allein die nativen Binaries (${anders.length} Dateien)` +
      (fremd.length ? ` — davon NICHT nativ: ${fremd.join(", ")}` : ""), fremd.length === 0);
  }
}

// 2) SHA256SUMS.txt
const summe = path.join(RELEASE, "SHA256SUMS.txt");
if (fs.existsSync(summe)) {
  const text = fs.readFileSync(summe, "utf8");
  const genannt = new Set([...text.matchAll(/^[0-9a-f]{64}\s+\*?(\S+)$/gm)].map(m => m[1]));
  const fehlt = VEROEFFENTLICHT.filter(f => !genannt.has(f));
  const gebaut = [...dateien, "latest-mac.yml"];
  const fremd = [...genannt].filter(n => !gebaut.includes(n));
  meld(`SHA256SUMS.txt deckt beide veroeffentlichten .dmg ab${fehlt.length ? " — es fehlen: " + fehlt.join(", ") : ""}`, fehlt.length === 0);
  meld(`SHA256SUMS.txt nennt nichts, was nicht gebaut wurde${fremd.length ? " — fremde Namen: " + fremd.join(", ") : ""}`, fremd.length === 0);
  // inhalte-pruefung: jeder hash muss zur datei auf der platte passen
  const falsch = [];
  for (const m of text.matchAll(/^([0-9a-f]{64})\s+\*?(\S+)$/gm)) {
    const p = path.join(RELEASE, m[2]);
    if (!fs.existsSync(p)) { falsch.push(`${m[2]} (datei fehlt)`); continue; }
    if (sha256(p) !== m[1]) falsch.push(`${m[2]} (hash anders)`);
  }
  meld(`alle ${genannt.size} Pruefsummen stimmen mit den Dateien auf der platte ueberein${falsch.length ? " — " + falsch.join(", ") : ""}`, falsch.length === 0);
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
    const erwartet = [...VEROEFFENTLICHT, "SHA256SUMS.txt"].sort();
    meld(`Release ${tag} traegt ${namen.length} Assets: ${namen.join(", ")}`, namen.length === erwartet.length);
    meld("Asset-Namen sind genau die lokalen Bauteile", JSON.stringify(namen) === JSON.stringify(erwartet));
    const dmg = `K3PTA-${version}-mac-arm64.dmg`;
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

    // 5) Der Tag muss auf denselben Commit zeigen, aus dem die Pakete gebaut sind.
    //    Gemessen 16.11.2026 an app-3.2.213: der Tag zeigt auf 064671a (13.11. 21:47,
    //    "Update README.md"), die ausgelieferten .dmg stammen aber aus 3ca25a4
    //    (15.11. 22:17) — 1934 Dateien dazwischen, 133 davon ausgelieferter App-Code
    //    (electron.js, package-lock.json, src/App.tsx, src/components/*). Wer den
    //    Quelltext zum Binary auditieren will, und genau das verspricht BUSL-1.1,
    //    bekommt zwei Tage aelteren Code. Kein Schritt dieser Kette hat den Tag je
    //    angefasst, weil die Kette an Schritt 4 endete und nie jemand sie fuhr.
    //    Die Bau-Quittung schreibt `npm run build:mac` nach release/BAU-COMMIT.txt.
    //    Fehlt sie, ist die Herkunft der Pakete nicht beweisbar — Fehler, kein Freifahrt.
    const quittung = path.join(RELEASE, "BAU-COMMIT.txt");
    if (!fs.existsSync(quittung)) {
      meld("release/BAU-COMMIT.txt fehlt — ohne Bau-Quittung ist nicht beweisbar, aus welchem Commit die Pakete stammen", false);
    } else {
      const bau = fs.readFileSync(quittung, "utf8").trim();
      const ref = JSON.parse(execFileSync("curl", ["-s", "-H", "Accept: application/vnd.github+json",
        `https://api.github.com/repos/DamianTodorovic/kepta/git/ref/tags/${tag}`], { encoding: "utf8" }));
      const tagCommit = typeof ref.object?.sha === "string" ? ref.object.sha : "";
      if (!tagCommit) meld(`Tag ${tag}: auf GitHub nicht aufgeloest (${ref.message ?? "keine Antwort"})`, false);
      else {
        meld(`Tag ${tag} zeigt auf ${tagCommit.slice(0, 7)}, die Bau-Quittung nennt ${bau.slice(0, 7)}`, tagCommit === bau);
        if (tagCommit !== bau) {
          try {
            const vergleich = JSON.parse(execFileSync("curl", ["-s", "-H", "Accept: application/vnd.github+json",
              `https://api.github.com/repos/DamianTodorovic/kepta/compare/${tagCommit}...${bau}`], { encoding: "utf8" }));
            if (!Array.isArray(vergleich.files)) {
              // "No common ancestor" heisst NICHT "nicht veroeffentlicht": dieses Repo
              // traegt zwei Historien-Linien (Kern und App), die erst durch die
              // merge(k3pta)-Commits zusammenfinden. Gemessen 16.11.2026: beide Commits
              // sind per API erreichbar (HTTP 200) und beide sind Vorfahren von main —
              // der Tag sitzt nur auf der Kern-Linie, der Bau auf der App-Linie.
              meld(`  ↳ Abstand Tag→Bau nicht zaehlbar (${vergleich.message ?? "keine Antwort"}). Das schliesst nicht aus, dass beide Commits oeffentlich sind — git merge-base --is-ancestor einzeln pruefen`, false);
            } else {
              const code = vergleich.files.filter(f => /^(src\/|npm\/|electron\.js$|package(-lock)?\.json$)/.test(f.filename));
              meld(`  ↳ ${vergleich.total_commits} Commits und ${vergleich.files.length} Dateien zwischen Tag und Bau, davon ${code.length} im ausgelieferten Code`, code.length === 0);
            }
          } catch (e) { meld(`  ↳ Vergleich nicht gefahren (${e.message})`, false); }
        }
      }
    }
  }
}

console.log(`\nBeweis-Kette fuer K3PTA ${version}:`);
console.log(zeilen.join("\n"));
console.log(fehler ? `\n${fehler} FEHLER — nicht ausliefern.` : "\nalle Beweise angetreten — auslieferbar.");
process.exit(fehler ? 1 : 0);
