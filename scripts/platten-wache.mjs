#!/usr/bin/env node
// Die Platten-Wache: fragt den freien Platz, BEVOR ein Lauf anfängt — in zwei Stufen.
//
// Warum sie existiert: am 11.10. stand die Maschine bei 99 % — 3,2 Gi frei, Docker
// meldete „no space left on device". Ein Lauf, der mitten im Schreiben voll läuft, ist
// der teuerste Fehler im Haus: halb geschriebene Master, ein halber Bündelbau, eine
// Suite, die ihren Bericht nicht mehr hinschreiben kann. Und hier gibt es kein Zurück
// über git — uncommittete Arbeit von bis zu neun Leuten liegt auf der Platte.
//
// Warum ZWEI Stufen und nicht eine Zahl für alles: eine Schwelle von 8 Gi hätte eine
// Suite aufgehalten, die messbar 0,24 Gi braucht — die Leitung hätte die Wache
// umgestellt, und dann ist sie keine Wache. Umgekehrt hätte 2 Gi eine Frameserie
// durchgewinkt, die 2,6 Gi schreibt und das Volume unter null treibt. Also ist die
// STUFE das Argument, die Zahl folgt ihr.
//
//   LEICHT (2 Gi) — Suite, Typecheck, ein Build, ein Messlauf.
//     Gemessen 11.10. 02:5x im app-Baum: `npm run test:cov` — ganze Suite (142 Dateien),
//     131,68 s, Coverage-Läufer, json-Bericht. Freier Platz 11,67 Gi -> 11,43 Gi, also
//     0,24 Gi verbraucht; der Bericht allein (`test-results/vitest.json`) misst 3,7 MiB.
//     2 Gi sind das ~8-fache des teuersten leichten Laufs, der im Haus gefahren wird.
//     Ehrliche Lücke: dieser Lauf endete rot, coverage/ wurde nicht fertig geschrieben;
//     ein grüner Lauf schreibt einige MiB dazu, nicht einige Gi.
//   SCHWER (8 Gi) — Frame-Master, Render-Serien, `npm run build:mac`, alles, was
//     Bilderstapel schreibt.
//     Gemessene Stücke: ein 2160²-Meister kostet ~440 MB pro 250 Bilder, ein 1080²-Meister
//     ~110 MB (E2 und B1, gemessen). Sechs Szenen in 2160² sind damit ~2,6 Gi, ein DMG-Bau
//     (asar + dmg + sha) legt einige Gi dazu, und dazwischen brauchen Docker und die
//     Browserprofile Atemraum. 8 Gi = Serie + Bündel + Puffer, ohne dass die schreibende
//     Stelle mitten im Lauf kippt.
//
// Gemessen wird über den PFAD (`fs.statfs`), nicht über ein geratenes Gerät, und die
// Meldung nennt den **geprüften** Pfad — nicht das Gerät, auf dem `/` zufällig sitzt.
// Existiert der bestellte Pfad noch nicht (Kratzerordner!), wird über den nächsten
// vorhandenen Eltern gemessen, und die Meldung SAGT das.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Die zwei Stufen, Schwelle in Gi. Begründung im Kopf dieses Skripts. */
export const STUFEN = { leicht: 2, schwer: 8 };
export const KEIN_START = 75;
const GIB = 1024 ** 3;

/**
 * Der beschreibbar freie Platz auf dem Volume, auf dem `pfad` liegt — in Gi.
 * @param {string} pfad
 * @returns {number}
 */
export function freiGi(pfad) {
  return freiUndGesamt(pfad).freiGi;
}

/** @param {string} pfad */
function freiUndGesamt(pfad) {
  let ort = pfad;
  let gemessenUeber = null;
  while (ort && !fs.existsSync(ort)) {
    const parent = path.dirname(ort);
    if (!parent || parent === ort) break;
    ort = parent;
    gemessenUeber = ort;
  }
  const s = fs.statfsSync(ort);
  // bavail ist der für nicht-privilegierte Schreibende verfügbare Platz — genau der,
  // der einem Lauf unter den Händen wegläuft.
  return {
    pfad,
    freiGi: Math.round(((s.bavail * s.bsize) / GIB) * 100) / 100,
    gesamtGi: Math.round(((s.blocks * s.bsize) / GIB) * 100) / 100,
    // gesetzt nur, wenn der bestellte Pfad selbst noch nicht existierte
    gemessenUeber,
  };
}

/**
 * Die Prüfung. `stufe` ist das Argument; `schwelleGi` ist die Tür für Messläufe, die
 * eine Zahl vergleichen wollen statt einer Stufe.
 * @param {{pfade?: string[], stufe?: "leicht" | "schwer", schwelleGi?: number}} [optionen]
 */
export function pruefe({ pfade = [process.cwd(), os.tmpdir()], stufe = "leicht", schwelleGi } = {}) {
  if (schwelleGi === undefined && STUFEN[stufe] === undefined) {
    throw new Error(`unbekannte stufe "${stufe}" — es gibt nur ${Object.keys(STUFEN).join(" und ")}`);
  }
  const schwelle = Number(schwelleGi ?? STUFEN[stufe]);
  const gemessen = [...new Set(pfade)].map((p) => freiUndGesamt(p));
  const schlechtester = gemessen.reduce((a, b) => (b.freiGi < a.freiGi ? b : a), gemessen[0]);
  const ursachen = [];
  for (const m of gemessen) {
    if (m.freiGi < schwelle) {
      const weg = m.gemessenUeber ? `, geprüft über den Eltern ${m.gemessenUeber} (${m.pfad} existiert noch nicht)` : "";
      ursachen.push(`${m.pfad}: ${m.freiGi.toFixed(2)} Gi frei von ${m.gesamtGi.toFixed(0)} Gi${weg} — unter der Schwelle ${schwelle} Gi`);
    }
  }
  return {
    genug: ursachen.length === 0,
    exitCode: ursachen.length > 0 ? KEIN_START : 0,
    wertGi: schlechtester.freiGi,
    schwelleGi: schwelle,
    stufe: schwelleGi === undefined ? stufe : `${stufe} (Schwelle gesetzt)`,
    gemessen,
    ursachen,
  };
}

/** Eine Zeile für Mensch und Log — Pfad, Wert und Stufe gehören zusammen. */
export function meldung(prüfung) {
  const orte = prüfung.gemessen
    .map((m) => `${m.pfad} ${m.freiGi.toFixed(2)} Gi${m.gemessenUeber ? ` (gemessen über ${m.gemessenUeber})` : ""}`)
    .join(", ");
  if (prüfung.genug) {
    return `platten-wache: frei — stufe ${prüfung.stufe}, Schwelle ${prüfung.schwelleGi} Gi, geprüft: ${orte}`;
  }
  return `platten-wache: KEIN START — stufe ${prüfung.stufe}, Schwelle ${prüfung.schwelleGi} Gi, geprüft: ${orte}. ${prüfung.ursachen.join(" | ")}`;
}

// Direkt aufgerufen? Dann ist die Meldung der Befund, der Exit-Code die Antwort.
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const schalter = (name) => argv.includes(`--${name}`);
  const arg = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

  if (schalter("leicht") && schalter("schwer")) {
    console.error("platten-wache: WIDERSPRUCH — --leicht und --schwer zugleich. Was der Lauf wirklich tut, weiss nur der Aufrufer.");
    process.exit(2);
  }
  const stufe = schalter("schwer") ? "schwer" : schalter("leicht") ? "leicht" : (arg("stufe") ?? "leicht");
  const schwelle = arg("schwelle") !== undefined ? Number(arg("schwelle")) : undefined;
  const pfade = (arg("pfad") ?? [process.cwd(), os.tmpdir()].join(",")).split(",").map((p) => p.trim()).filter(Boolean);

  let ergebnis;
  try {
    ergebnis = pruefe({ pfade, stufe, schwelleGi: schwelle });
  } catch (fehler) {
    console.error(`platten-wache: FEHLER — ${fehler.message}`);
    process.exit(2);
  }
  const text = meldung(ergebnis);
  if (ergebnis.genug) console.log(text);
  else console.error(text);
  process.exit(ergebnis.exitCode);
}
