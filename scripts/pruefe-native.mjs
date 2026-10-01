// Prueft die gepackten Apps: steckt in jeder die native SQLite-Verschluesselung
// fuer die richtige Prozessorarchitektur — und laedt sie in Electron wirklich?
//
// Die App baut das Modul fuer Electron selbst, denn fuer Electron 44 gibt es
// keinen Vorab-Build. Ein Fehler dabei faellt sonst erst beim Nutzer auf: das
// Fenster geht auf, der Server nicht. Deshalb nach jedem Paketbau:
//   node scripts/pruefe-native.mjs release
// Fuer Apps der eigenen Architektur startet das Skript Electron als Node
// (ELECTRON_RUN_AS_NODE) und verschluesselt eine Probedatenbank.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MODUL = "better-sqlite3-multiple-ciphers";
const BINAER = "better_sqlite3.node";

/** Architektur einer Binaerdatei aus ihrem Kopf: Mach-O, ELF oder PE. */
export function architektur(buf) {
  if (buf.length >= 8 && buf.readUInt32LE(0) === 0xfeedfacf) {
    const cpu = buf.readUInt32LE(4);
    if (cpu === 0x0100000c) return "arm64";
    if (cpu === 0x01000007) return "x64";
    return `mach-o:${cpu.toString(16)}`;
  }
  if (buf.length >= 20 && buf.readUInt32BE(0) === 0x7f454c46) {
    const maschine = buf.readUInt16LE(18);
    if (maschine === 0xb7) return "arm64";
    if (maschine === 0x3e) return "x64";
    return `elf:${maschine.toString(16)}`;
  }
  if (buf.length >= 0x40 && buf.toString("latin1", 0, 2) === "MZ") {
    const pe = buf.readUInt32LE(0x3c);
    if (buf.length >= pe + 6 && buf.toString("latin1", pe, pe + 4) === "PE\0\0") {
      const maschine = buf.readUInt16LE(pe + 4);
      if (maschine === 0xaa64) return "arm64";
      if (maschine === 0x8664) return "x64";
      return `pe:${maschine.toString(16)}`;
    }
  }
  return "unbekannt";
}

/** electron-builder benennt die Ordner mac-arm64, linux-arm64-unpacked, win-arm64-unpacked — sonst x64. */
export function erwartet(ordner) {
  return /(^|-)arm64(-|$)/.test(ordner) ? "arm64" : "x64";
}

function finde(wurzel, name, tiefe = 0) {
  if (tiefe > 12 || !fs.existsSync(wurzel)) return [];
  const aus = [];
  for (const e of fs.readdirSync(wurzel, { withFileTypes: true })) {
    const voll = path.join(wurzel, e.name);
    if (e.isDirectory()) aus.push(...finde(voll, name, tiefe + 1));
    else if (e.name === name) aus.push(voll);
  }
  return aus;
}

/** Alle gepackten Apps unter release/: Ordner, Ressourcen, ausfuehrbare Datei, erwartete Architektur. */
export function findeApps(release) {
  const apps = [];
  for (const ordner of fs.readdirSync(release)) {
    const voll = path.join(release, ordner);
    if (!fs.statSync(voll).isDirectory()) continue;
    const kandidaten = [];
    for (const e of fs.readdirSync(voll)) {
      if (e.endsWith(".app")) {
        kandidaten.push({
          ressourcen: path.join(voll, e, "Contents", "Resources"),
          programm: path.join(voll, e, "Contents", "MacOS", e.slice(0, -4)),
        });
      }
    }
    if (fs.existsSync(path.join(voll, "resources"))) {
      const exe = fs.readdirSync(voll).find((f) => f.toLowerCase() === "kepta.exe" || f === "kepta");
      kandidaten.push({ ressourcen: path.join(voll, "resources"), programm: exe ? path.join(voll, exe) : null });
    }
    for (const k of kandidaten) {
      if (fs.existsSync(path.join(k.ressourcen, "app.asar"))) apps.push({ ordner, ...k, arch: erwartet(ordner) });
    }
  }
  return apps;
}

/** Startet Electron als Node, laedt das Modul aus der App und verschluesselt eine Probedatenbank. */
export function probelauf(app) {
  // Absolut: ein relativer Pfad waere fuer require() ein Paketname.
  const modul = path.resolve(app.ressourcen, "app.asar", "node_modules", MODUL);
  const db = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kepta-native-")), "probe.db");
  const code = [
    `const D = require(${JSON.stringify(modul)});`,
    `const d = new D(${JSON.stringify(db)});`,
    `d.pragma("cipher = 'sqlcipher'"); d.pragma("legacy = 4");`,
    `d.pragma('key = "' + "x'" + "ab".repeat(32) + "'" + '"');`,
    `d.exec("CREATE VIRTUAL TABLE t USING fts5(x); INSERT INTO t VALUES ('probetext')");`,
    `const n = d.prepare("SELECT count(*) AS n FROM t WHERE t MATCH 'probetext'").get().n;`,
    `d.close();`,
    `process.stdout.write(JSON.stringify({ n, electron: process.versions.electron || null }));`,
  ].join("\n");
  const aus = execFileSync(app.programm, ["-e", code], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    encoding: "utf8",
    timeout: 60_000,
  });
  const ergebnis = JSON.parse(aus.trim().split("\n").pop());
  const klartext = fs.readFileSync(db).includes("probetext");
  fs.rmSync(path.dirname(db), { recursive: true, force: true });
  if (ergebnis.n !== 1 || !ergebnis.electron || klartext) {
    throw new Error(`${app.ordner}: Probelauf fehlgeschlagen (${JSON.stringify(ergebnis)}, Klartext in der Datei: ${klartext})`);
  }
  return ergebnis.electron;
}

export function pruefe(release, { starten = true, protokoll = console.log } = {}) {
  const apps = findeApps(release);
  if (!apps.length) throw new Error(`Keine gepackte App unter ${release}`);
  const fehler = [];
  for (const app of apps) {
    const binaer = finde(path.join(app.ressourcen, "app.asar.unpacked", "node_modules", MODUL), BINAER);
    if (!binaer.length) {
      fehler.push(`${app.ordner}: ${BINAER} fehlt in app.asar.unpacked`);
      continue;
    }
    for (const b of binaer) {
      const arch = architektur(fs.readFileSync(b).subarray(0, 4096));
      protokoll(`${app.ordner}: ${path.relative(release, b)} → ${arch}`);
      if (arch !== app.arch) fehler.push(`${app.ordner}: ${BINAER} ist ${arch} statt ${app.arch}`);
    }
    if (starten && app.arch === process.arch && app.programm) {
      try {
        protokoll(`${app.ordner}: Probelauf in Electron ${probelauf(app)} — verschluesselt, Volltextsuche geht`);
      } catch (e) {
        fehler.push(String(e.message ?? e));
      }
    }
  }
  if (fehler.length) throw new Error(fehler.join("\n"));
  return apps.length;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const n = pruefe(process.argv[2] ?? "release", { starten: !process.argv.includes("--ohne-start") });
    console.log(`${n} App(s) geprueft — die native SQLite-Verschluesselung passt.`);
  } catch (e) {
    console.error(String(e.message ?? e));
    process.exit(1);
  }
}
