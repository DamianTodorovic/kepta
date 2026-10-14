// Heim-Wache — meldet, wenn unter $HOME etwas geschrieben wird.
//
// Der Anlass ist gemessen, nicht erfunden: am 13.10.2026 trug Damians echte
// `~/.kepta/profile.json` um 14:29:48 {"beruf":"Anwältin"} — eine Zeichenkette,
// die im Produkt nirgends vorkommt, nur in tests/keine-grenzen.test.ts. Um
// 20:59:46 desselben Tags trug dieselbe Datei 6.272 Bytes in einem
// K3PTA-NEBEN1-Umschlag. Zwei Schreiblaeufe in einem Datenordner, die niemand
// bestellt hatte.
//
// Die Ursache steht in server/app.ts:120:
//
//   const datenOrdner = process.env.KEPTA_DATA_DIR || path.join(os.homedir(), ".kepta");
//
// Wer die Variable nicht setzt, baut den Server gegen die echte Anmeldung.
// tests/testkapsel.test.ts hält deshalb die Regel im Quelltext; dieses Skript
// hält die Tat. Es vergleicht zwei Zustandsaufnahmen und nennt jede Datei, die
// neu entstanden, gewachsen, geschrumpft, berührt oder verschwunden ist.
//
// Gelesen wird nur: `readdir` und `stat`, kein einziger Schreibgriff unter die
// beobachtete Wurzel. Der eigene Fingerabdruck liegt da, wo ihn der Aufrufer
// hinsagt (`--nach`), nie im Beobachteten.
//
//   node scripts/heim-wache.mjs aufnahme --nach /tmp/e3-arbeit-e3/heim-vorher.json
//   node scripts/heim-wache.mjs vergleich --von /tmp/e3-arbeit-e3/heim-vorher.json
//
// Exit 0 = keiner hat geschrieben. Exit 1 = Meldung, eine Zeile je Fund.
// --heim <pfad> verschiebt die beobachtete Wurzel (für Tests und Sandlaeufe),
// --pfad <rel> erweitert die Beobachtung, beliebig oft.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Was auf diesem Rechner unter der Anmeldung liegt, wenn ein Lauf ihn anfasst. */
export const STANDARD_PFADE = [".kepta"];

/**
 * Zustand einer Wurzel: je beobachtetem Pfad die Dateien mit Groesse und
 * Aenderungsmoment. Ein fehlender Pfad ergibt keine Eintraege — abwesend ist
 * ein gueltiger Zustand, kein Fehler.
 */
export function aufnahme(heim = os.homedir(), relativPfade = STANDARD_PFADE) {
  const dateien = {};
  for (const relativ of relativPfade) {
    const voll = path.join(heim, relativ);
    let typ = null;
    try { typ = fs.statSync(voll); } catch { /* nicht da */ }
    if (!typ) continue;
    if (typ.isFile()) {
      dateien[relativ] = { groesse: typ.size, zeit: typ.mtimeMs };
      continue;
    }
    sammle(voll, relativ, dateien, 0);
  }
  return { heim, pfade: [...relativPfade], zeit: new Date().toISOString(), dateien };
}

const TIEFE = 6;
function sammle(ordner, zweig, dateien, stufe) {
  let eintraege;
  try { eintraege = fs.readdirSync(ordner, { withFileTypes: true }); } catch { return; }
  for (const e of eintraege) {
    const voll = path.join(ordner, e.name);
    const schluessel = path.join(zweig, e.name);
    if (e.isDirectory()) {
      if (stufe < TIEFE) sammle(voll, schluessel, dateien, stufe + 1);
      continue;
    }
    try {
      const s = fs.statSync(voll);
      dateien[schluessel] = { groesse: s.size, zeit: s.mtimeMs };
    } catch { /* verschwand zwischen den beiden Griffen */ }
  }
}

/**
 * Unterschiede zwischen zwei Aufnahmen, eine Zeile je Fund. Leere Liste heißt:
 * unter der Wurzel ist nichts geschrieben worden.
 */
export function vergleicheHeim(vorher, nachher) {
  const raus = [];
  const alt = vorher.dateien, neu = nachher.dateien;
  for (const [name, wert] of Object.entries(neu)) {
    const alte = alt[name];
    if (!alte) { raus.push(`neu: ${name} (${wert.groesse} Bytes)`); continue; }
    const groesse = alte.groesse !== wert.groesse ? `Groesse ${alte.groesse} → ${wert.groesse} Bytes` : null;
    // Ein gleich grosser Inhalt mit neuem Moment ist auch eine Schreiberei —
    // der Fall von heute: derselbe Name, anderer Inhalt, gleiche Reihenfolge.
    const zeit = Math.round(alte.zeit) !== Math.round(wert.zeit) ? `beruehrt um ${new Date(wert.zeit).toISOString()}` : null;
    if (groesse || zeit) raus.push(`geaendert: ${name} — ${[groesse, zeit].filter(Boolean).join(", ")}`);
  }
  for (const name of Object.keys(alt)) {
    if (!(name in neu)) raus.push(`verschwunden: ${name}`);
  }
  return raus;
}

function leseArgumente(arg) {
  const aus = { befehl: arg[0] ?? "", heim: os.homedir(), pfade: [...STANDARD_PFADE], nach: null, von: null };
  for (let i = 1; i < arg.length; i++) {
    const k = arg[i];
    if (k === "--heim") aus.heim = arg[++i];
    else if (k === "--pfad") aus.pfade.push(arg[++i]);
    else if (k === "--nach") aus.nach = arg[++i];
    else if (k === "--von") aus.von = arg[++i];
  }
  return aus;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const o = leseArgumente(process.argv.slice(2));
  if (o.befehl === "aufnahme") {
    const text = JSON.stringify(aufnahme(o.heim, o.pfade), null, 2);
    if (o.nach) fs.writeFileSync(o.nach, text);
    else console.log(text);
  } else if (o.befehl === "vergleich") {
    if (!o.von) { console.error("vergleich braucht --von <aufnahme.json>"); process.exit(2); }
    const vorher = JSON.parse(fs.readFileSync(o.von, "utf-8"));
    const funde = vergleicheHeim(vorher, aufnahme(o.heim, o.pfade));
    if (!funde.length) {
      console.log(`ruhig: unter ${o.heim} ({${o.pfade.join(", ")}}) ist seit ${vorher.zeit} nichts geschrieben worden (${Object.keys(vorher.dateien).length} Dateien verglichen)`);
    } else {
      console.error(`SCHREIBLAUF unter ${o.heim} — ${funde.length} Fund${funde.length === 1 ? "" : "e"} seit ${vorher.zeit}:`);
      for (const zeile of funde) console.error("  " + zeile);
      process.exit(1);
    }
  } else {
    console.error("Gebrauch: node scripts/heim-wache.mjs aufnahme --nach <datei> | vergleich --von <datei> [--heim <wurzel>] [--pfad <rel>]");
    process.exit(2);
  }
}
