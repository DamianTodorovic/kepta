#!/usr/bin/env node
// #49 — die Third-Party-Notices des Bündels kommen aus der Sperre, nicht aus dem Kopf.
// Gebaut 26.10.2026 von der Leitung, weil das ausgelieferte Stück keine Lizenz und keine Notices
// mitbrachte (gemessen 18:02 MEZ: `Contents/Resources/` kennt weder das eine noch das andere, und
// `electron-builder.json` hatte kein `extraResources`).
//
// Aufruf:
//   node scripts/sammele-notizen.mjs            — schreibt THIRD-PARTY-NOTICES.txt in den Repo-Grund
//   node scripts/sammele-notizen.mjs --pruefe   — schreibt nichts, vergleicht die Platte mit der
//                                                 Sperre und bricht ab, wenn sie nicht uebereinstimmen
//
// Zwei Regeln, die dieses Blatt haelt:
//   1. **Eintrag ohne Lizenz ist ein Abbruch, keine Luecke im Bericht.** Eine erfundene Zeile ist
//      teurer als ein fehlender Name, und ein Bericht mit einer stillen Luecke sieht vollstaendig aus.
//   2. **Gewertet wird, was mitwandert**: die Nicht-dev-Pakete der obersten Ebene von
//      `package-lock.json`. Ein Kopf aus dem Gedaechtnis war der alte Stand: das von Hand
//      geschriebene Blatt nannte 12 von 208 Paketen und fuehrte im Titel ein andres Produkt.
import fs from "node:fs";
import path from "node:path";

const WURZEL = path.resolve(new URL(".", import.meta.url).pathname, "..");
const LOCK = path.join(WURZEL, "package-lock.json");
const ZIEL = path.join(WURZEL, "THIRD-PARTY-NOTICES.txt");
const PRUEFE = process.argv.includes("--pruefe");

const paket = JSON.parse(fs.readFileSync(path.join(WURZEL, "package.json"), "utf8"));
const erbauer = JSON.parse(fs.readFileSync(path.join(WURZEL, "electron-builder.json"), "utf8"));
const PRODUKT = erbauer.productName || paket.name;
const lock = JSON.parse(fs.readFileSync(LOCK, "utf8"));
const pk = lock.packages || {};
if (lock.lockfileVersion !== 3) {
  console.error("ABBRUCH: Lockfile-Version " + lock.lockfileVersion + ", gerechnet wird mit 3 —" +
    " ein andres Schema hat andre Felder, und ein stummer Kopf wäre eine erfundene Zahl.");
  process.exit(4);
}

const zeilen = [];
const fehlende = [];
for (const [schluessel, wert] of Object.entries(pk)) {
  if (!schluessel.startsWith("node_modules/")) continue;
  if (schluessel.slice("node_modules/".length).includes("node_modules/")) continue; // nur die oberste Ebene
  if (wert.dev === true) continue;
  const name = schluessel.slice("node_modules/".length);
  const lizenz = typeof wert.license === "string" ? wert.license
    : (wert.license && typeof wert.license === "object" && typeof wert.license.type === "string") ? wert.license.type : null;
  if (!lizenz) { fehlende.push(name + "@" + (wert.version || "ohne Version")); continue; }
  zeilen.push({ name, version: wert.version || "ohne Version", lizenz });
}

if (fehlende.length) {
  console.error("ABBRUCH: " + fehlende.length + " Mitwanderer nennen in der Sperre keine Lizenz: " +
    fehlende.slice(0, 12).join(", ") + (fehlende.length > 12 ? " …" : ""));
  console.error("Ein Bericht mit einer stillen Luecke ist keine Erfuellung. Erst die Lizenz klaeren, dann die Tafel.");
  process.exit(5);
}

zeilen.sort((a, b) => a.lizenz.localeCompare(b.lizenz) || a.name.localeCompare(b.name));
const gruppen = new Map();
for (const z of zeilen) {
  if (!gruppen.has(z.lizenz)) gruppen.set(z.lizenz, []);
  gruppen.get(z.lizenz).push(z);
}

const jetzt = new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin", hour12: false, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const kopf = [
  PRODUKT + " — Third-Party-Notices",
  "".padEnd(72, "="),
  "",
  "Dieses Buendel enthaelt proprietare Software von K3PTA (Copyright (c) 2026 Damian Todorovic,",
  "alle Rechte vorbehalten — siehe die Datei LICENSE im selben Ordner) auf open-source Schultern.",
  "Die Speicher-Engine darunter (npm-Paket `kepta-mcp`) ist separat lizenziert: source-available",
  "unter BUSL-1.1, jede Fassung wird vier Jahre nach ihrem Erscheinen AGPL-3.0-or-later.",
  "",
  "Diese Tafel ist nicht von Hand gepflegt. Sie kommt aus `package-lock.json` (lockfileVersion 3),",
  "zeigt jedes Nicht-Entwickler-Paket der obersten Ebene mit der Lizenz, die die Sperre nennt, und",
  "ihr Erzeuger bricht ab, wenn ein Eintrag keine Lizenz nennt. Erzeugt mit:",
  "  node scripts/sammele-notizen.mjs",
  "",
  "Stand der Sperre: " + paket.version + " | " + zeilen.length + " Mitwanderer in " + gruppen.size +
    " Lizenzgruppen | gelesen " + jetzt,
  "",
].join("\n");

const körper = [];
for (const [lizenz, liste] of gruppen) {
  körper.push("".padEnd(72, "-"));
  körper.push(lizenz + "  (" + liste.length + (liste.length === 1 ? " Paket)" : " Pakete)"));
  körper.push("".padEnd(72, "-"));
  for (const z of liste) körper.push("  " + z.name + "@" + z.version);
  körper.push("");
}
const text = kopf + körper.join("\n") + "\n";

if (PRUEFE) {
  if (!fs.existsSync(ZIEL)) { console.error("ABBRUCH: THIRD-PARTY-NOTICES.txt fehlt im Repo-Grund — erst erzeugen."); process.exit(6); }
  const aufDerPlatte = fs.readFileSync(ZIEL, "utf8");
  const nurZahlen = (t) => (t.match(/(\d+) Mitwanderer in (\d+) Lizenzgruppen/) || []).slice(1).join("/");
  if (nurZahlen(aufDerPlatte) !== nurZahlen(text)) {
    console.error("ABBRUCH: die Tafel auf der Platte nennt " + (nurZahlen(aufDerPlatte) || "keine Zahl") +
      ", die Sperre heute " + nurZahlen(text) + " — nachziehen, nicht uebernehmen.");
    process.exit(7);
  }
  console.log("PRUEFE gruen: " + zeilen.length + " Mitwanderer in " + gruppen.size + " Gruppen, Tafel und Sperre stimmen.");
  process.exit(0);
}

fs.writeFileSync(ZIEL, text);
console.log("GESCHRIEBEN " + path.relative(WURZEL, ZIEL) + " " + Buffer.byteLength(text) + " B | " +
  zeilen.length + " Mitwanderer | " + gruppen.size + " Lizenzgruppen");
for (const [lizenz, liste] of gruppen) console.log("  " + String(liste.length).padStart(4) + "  " + lizenz);
