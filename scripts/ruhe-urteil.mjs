#!/usr/bin/env node
// ruhe-urteil — EIN Befehl, EIN Urteil ueber einen Zeitfall.
//
// Gebaut fuer die Leer-Maschine: `node scripts/ruhe-urteil.mjs`
//
// Warum ein eigenes Skript und nicht noch ein Test: der Fall in
// tests/graf-kosten.test.ts ("eine zusaetzliche Notiz haelt die Bestehenden in der
// Wander-Grenze und kostet <= 15 ms") ueberspringt sich selbst, wenn die Maschine
// belegt ist — richtig so. Aber "ich bin uebersprungen" ist noch kein Urteil. Diese
// Sonde faellt das Urteil ausserhalb der Suite, in drei Beinen, und schreibt am Ende
// GENAU EINE ZEILE:
//
//   1. RUHE   — Ruhe-Sonde vorweg. Belegt: kein Lauf, kein Urteil, Exit 75.
//               (Der Auftrag der Leitung: die Maschine bleibt verschont.)
//   2. WIEDERHOLUNG — der Fall R mal, jeder Wurf einzeln, mit Median der Mediane.
//               Ein Einzel-Durchgang sagt etwas ueber den Scheduler, nicht ueber den Pfad.
//   3. MUTATION — in einer WEGWERF-KOPIE des Arbeitsbaums (kein Klon, kein git,
//               nichts im echten Baum) wird das Geruest der Berechnung verworfen
//               (src/graf-dienst.ts:531 `alt.stellen` -> undefined). Der Fall MUSS
//               dann rot werden. Bleibt er gruen, prueft er nichts — und ein gruen
//               "echt" aus Punkt 2 waere ein Nichtstuer.
//
// Exit-Codes: 0 gruen auf ruhiger Maschine, 1 echt rot, 2 Messartefakt (nur unter
// Last rot), 3 der Fall prueft nichts, 4 Mutation nicht anbringbar, 75 kein Urteil
// (Maschine belegt).
//
// Dieses Skript fuegt nichts zusammen, was getrennt gehoert: es misst keine Schwellen
// neu, es erfindet keine Grenze. Die 15 ms bleiben die bestellte Zahl aus A9 §6.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beschlag, ruedig, sonde } from "./ruhe-sonde.mjs";
import { meldung as plattenmeldung, pruefe as plattePruefen } from "./platten-wache.mjs";

const WURZEL = process.cwd();

const arg = (name, standard) => {
  const treffer = process.argv.find((a) => a.startsWith(`--${name}=`));
  return treffer ? treffer.slice(name.length + 3) : String(standard);
};

const OPT = {
  test: arg("test", "tests/graf-kosten.test.ts"),
  fall: arg("fall", "eine zusaetzliche Notiz haelt die Bestehenden"),
  wiederholungen: Number(arg("wiederholungen", 5)),
  grenzeMs: Number(arg("grenze", 15)),
  stiche: Number(arg("stiche", 60)),
  sticheNachher: Number(arg("stiche-nachher", 12)),
  mutationsDatei: arg("mutations-datei", "src/graf-dienst.ts"),
  mutationsVorher: "alt && alt.layoutVersion === LAYOUT_VERSION ? alt.stellen : undefined",
  mutationsNachher: "undefined /* ruhe-urteil: geruest absichtlich verworfen */",
  kratzer: arg("kratzer", path.join(os.tmpdir(), `ruhe-urteil-${process.pid}`)),
};

/** Ein Lauf der einen Szene; der Median steht in ihrer eigenen Logzeile. */
function lauf(wurzel, { umgebung = {} } = {}) {
  const r = spawnSync("npx", ["vitest", "run", OPT.test, "-t", OPT.fall, "--reporter=default"], {
    cwd: wurzel,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, ...umgebung },
  });
  const aus = `${r.stdout || ""}${r.stderr || ""}`;
  // Die Zeile des Falles: "[kosten] mutation fuenf Wuerfe=...,median=12,3ms p95=..."
  const median = /median=([\d.,]+)\s*ms/.exec(aus);
  const wuerfe = /Wuerfe=([\d.,\s]+?)ms/.exec(aus);
  const skipped = /skipped/i.test(aus) && !median;
  return {
    exit: r.status ?? 99,
    medianMs: median ? Number(median[1].replace(",", ".")) : Number.NaN,
    wuerfe: wuerfe ? wuerfe[1].trim() : "",
    uebersprungen: skipped,
    aus,
  };
}

const medianAus = (werte) => {
  const s = werte.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : Number.NaN;
};

function urteil(zeile, code) {
  console.log(zeile);
  process.exit(code);
}

// ---------------------------------------------------------------- 0) PLATTE
// Ein Lauf, der mitten im Schreiben voll laeuft, kostet Arbeit, die hier nicht
// zurueckzuholen ist. Also fragt der Laeufer die Platte, bevor er die Sonde zueckt.
// Ein Messlauf ist LEICHT: gemessen braucht ein voller Suite-Lauf 0,24 Gi, die
// Stufe fragt nach 2 Gi. --platte= setzt eine eigene Zahl, wenn jemand gross kramt.
const platte = plattePruefen({ pfade: [WURZEL, os.tmpdir()], stufe: "leicht", schwelleGi: process.argv.includes("--platte=") ? Number(arg("platte")) : undefined });
if (!platte.genug) urteil(`URTEIL: ${plattenmeldung(platte)}`, 75);

// ---------------------------------------------------------------- 1) RUHE
const vor = ruedig(sonde({ stiche: OPT.stiche }));
if (!vor.ruhig) {
  urteil(
    `URTEIL: KEIN URTEIL — Maschine belegt, kein Lauf gefahren (${vor.ursachen.join("; ")}; ${beschlag(vor.messung)})`,
    75
  );
}

// ---------------------------------------------------------------- 2) WIEDERHOLUNG
const laeufe = [];
for (let i = 0; i < OPT.wiederholungen; i++) {
  const l = lauf(WURZEL);
  const nach = ruedig(sonde({ stiche: OPT.sticheNachher }));
  laeufe.push({ nr: i + 1, ...l, ruhigNachher: nach.ruhig, ursachenNachher: nach.ursachen });
}

const roten = laeufe.filter((l) => l.exit !== 0);
const ruhigeRote = roten.filter((l) => l.ruhigNachher);
const mediane = laeufe.map((l) => l.medianMs);
const medianDerMediane = medianAus(mediane);
const groesster = Math.max(...(mediane.filter((x) => Number.isFinite(x)) || [Number.NaN]));

if (laeufe.every((l) => l.uebersprungen)) {
  urteil(`URTEIL: KEIN URTEIL — alle ${laeufe.length} Laeufe haben sich selbst uebersprungen (${beschlag(vor.messung)})`, 75);
}
if (laeufe.some((l) => Number.isNaN(l.medianMs) && l.exit === 0)) {
  urteil("URTEIL: KEIN URTEIL — ein gruener Lauf druckte keinen Median; die Meldung des Falles hat sich geaendert", 75);
}

// ---------------------------------------------------------------- 3) MUTATION
const kratzer = OPT.kratzer;
let mutationsErgebnis = null;
try {
  // Arbeitsbaum kopieren, NICHT klonen: im Klon von HEAD fehlten unbelegte, aber
  // laufende Dateien (dazu gehoert dieses Skript und seine Sonde), und die
  // Mutationsseite wuerde an einem fehlenden Import rot — ein falsch bewiesenes
  // "der Fall prueft etwas". .git bleibt draussen, es wird nichts am Zustand gedreht.
  const aussen = /(^|[\\/])(node_modules|\.git|test-results|dist|coverage|\.venv)([\\/]|$)/;
  fs.cpSync(WURZEL, kratzer, { recursive: true, filter: (quelle) => !aussen.test(quelle) });
  fs.symlinkSync(path.join(WURZEL, "node_modules"), path.join(kratzer, "node_modules"), "dir");

  const ziel = path.join(kratzer, OPT.mutationsDatei);
  const quelle = fs.readFileSync(ziel, "utf8");
  const treffer = quelle.split(OPT.mutationsVorher);
  if (treffer.length !== 2) {
    urteil(
      `URTEIL: MUTATION NICHT ANGEBRACHT — die Schwachstelle in ${OPT.mutationsDatei} ist ${treffer.length - 1} mal gefunden (erwartet genau 1); der Fall bleibt ungeprueft`,
      4
    );
  }
  fs.writeFileSync(ziel, quelle.split(OPT.mutationsVorher).join(OPT.mutationsNachher));
  mutationsErgebnis = lauf(kratzer);
} catch (fehler) {
  urteil(`URTEIL: MUTATION NICHT AUSGEFUEHRT — ${String(fehler.message).slice(0, 160)}; ohne die Schwachseiten-Probe ist kein "echt" moeglich`, 4);
} finally {
  fs.rmSync(kratzer, { recursive: true, force: true });
}

// ---------------------------------------------------------------- URTEIL
const sondeText = `${beschlag(vor.messung)}`;
const wurfText = laeufe.map((l) => (Number.isFinite(l.medianMs) ? l.medianMs.toFixed(1) : "—")).join("/");

if (mutationsErgebnis && mutationsErgebnis.exit === 0 && !mutationsErgebnis.uebersprungen) {
  urteil(
    `URTEIL: FALL PRUEFT NICHTS — mit verworfenem Geruest bleibt er gruen (median ${mutationsErgebnis.medianMs} ms gegen ${OPT.grenzeMs} ms); ruhige Laeufe: ${wurfText}. Ein gruen "echt" aus Wiederholungen beweist nichts, wenn die eingebaute Schwaeche unbemerkt bleibt`,
    3
  );
}

if (roten.length === 0) {
  urteil(
    `URTEIL: GRUEN UND WIRKSAM — ${laeufe.length}/${laeufe.length} ruhige Laeufe unter ${OPT.grenzeMs} ms (mediane der mediane ${medianDerMediane.toFixed(1)} ms, groesster ${groesster.toFixed(1)} ms; wuerfe ${wurfText}); Mutation rot bei median ${mutationsErgebnis?.medianMs} ms; ${sondeText}`,
    0
  );
}

if (ruhigeRote.length === 0) {
  urteil(
    `URTEIL: MESSARTEFAKT — ${roten.length}/${laeufe.length} Laeufe rot, aber jeder davon auf einer Maschine, die nachher belegt war (${roten.map((l) => l.ursachenNachher.join(",")).join(" | ")}); ruhige mediane: ${wurfText}; ${sondeText}`,
    2
  );
}

urteil(
  `URTEIL: ECHT ROT — ${ruhigeRote.length} von ${laeufe.length} Laeufen rot AUF RUHIGER Maschine (mediane ${wurfText}, groesster ${groesster.toFixed(1)} ms gegen Grenze ${OPT.grenzeMs} ms; ${OPT.wiederholungen} Wiederholungen, mutation ${mutationsErgebnis?.exit === 0 ? "GRUEN — prueft nichts" : `rot bei ${mutationsErgebnis?.medianMs} ms`}); ${sondeText}`,
  1
);
