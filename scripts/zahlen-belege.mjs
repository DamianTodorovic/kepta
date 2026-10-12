#!/usr/bin/env node
// Zahlen-Belege — jede Kennzahl in der Doku wird an ihrem eigenen Beleg gemessen.
//
// Warum es diese Wache braucht (gemessen 12.10., Leitung): CHANGELOG.md, README.md und
// README.de.md nannten Vorher-Zahlen 7 044, 614 und 743 und zitierten dafuer
// `audit-2026-10-09/e2-code/nacht-12-10/rohdaten/vorher-gleich-12-10.log`. Der Log sagt
// paareEigen=7134, paareFlaeche=5236, ms=745. Keine bestehende Wache hat das gesehen:
// `scripts/doku-check.mjs` haelt nur die Suite-Zahl an einem Lauf fest, alles andere war
// Prosa mit Quellenangabe, und niemand hatte die Quelle geoeffnet. Der Enterprise-Baum
// kennt die strengere Regel laengst (docs/ZAHLEN-REGISTER.md + scripts/zahlen-wache.mjs);
// dieses Skript holt denselben Anspruch in Kern und App — ohne Register-Datei, weil die
// Papiere hier ihre Artefakte selbst zitieren.
//
// Regeln, minimal und hart:
//   1. Ein Zitat eines Mess-Artefakts (.log/.json/.txt/.csv) auf derselben Zeile ist der
//      Beleg. Die Wache oeffnet es und verlangt die Zahl dort — normalisiert
//      (1 019 = 1019, 98,6 = 98.6, 0,662 = 0.662) und auf die Stellenzahl des Papiers
//      gerundet (6986.42 in der JSON ist "6.986 ms" im Papier).
//   2. Gefunden? Still. Nicht gefunden? ROT, mit Datei:Zeile, Zahl, zitiertem Pfad und
//      dem, was die Datei an der bestpassen STELLE wirklich sagt.
//   3. Zitierter Pfad existiert nirgends, ist mehrdeutig oder unlesbar? ROT.
//   4. Ausnahmen nur datei-scharf (kein wildcard) und nur mit Grund im Quelltext.
//
// Die Begrenzung, die hier knowingly steht: Bestanden heisst "die Zahl steht im
// zitierten Artefakt", nicht "sie steht in der richtigen Zeile davon". Eine falsche
// Zahl, die zufaellig an anderer Stelle desselben Logs vorkommt, geht durch (die
// Fixture-Zahl 427 beweist das in tests/zahlen-belege.test.ts). Serien werden gliedweise
// geprueft, deshalb faellt ein falsches Glied trotzdem rot — aber nur, wenn ein weiteres
// Glied ebenfalls fehlt. Straenger geht es nicht, ohne korrekte Papiere rot zu machen.
//
// Classe "Zahl mit Messgroesse, aber ohne Artefakt-Zitat" ist Inventar, kein Befund —
// sonst laeuft die Wache mitten in einer Welle mit hunderten Zahlen unter lauter roten
// Zeilen unter und die vier echten Fundstellen sind nicht mehr zu sehen. Welche Dateien
// hart drauf stehen, steht in AUFPFLICHTUNGEN (datei-scharf, mit Grund) und wird nur mit
// --pflicht rot. `--inventar` zaehlt beides.
//
// Suite-Zahlen sind NICHT dieses Skripts: 982/996-Faelle und Testdatei-Anzahl haelt
// scripts/doku-check.mjs an einem echten Lauf fest — eine Zahl, eine Haendlerin.
//
// Usage:
//   node scripts/zahlen-belege.mjs                // pruefen, exit 1 bei Befund
//   node scripts/zahlen-belege.mjs --inventar     // Schaetzungen zaehlen, exit 0
//   node scripts/zahlen-belege.mjs --pflicht      // Pflichtdateien: Zahl ohne Zitat auch rot
//   node scripts/zahlen-belege.mjs --datei=PFAD   // nur eine Datei (Fixtures)
//   node scripts/zahlen-belege.mjs --wurzel=PFAD  // anderer Baum (Tests)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const ENDUNGEN = [".log", ".json", ".txt", ".csv"];

/**
 * @typedef {{datei: string, zeile: number, zahl: string, einheit?: string, art: string, zitat?: string, sageDieDatei?: string, grund?: string, alternativen?: string[]}} ZahlenBefund
 * @typedef {{datei: string, behauptungen: number, mitBeleg: number, ohneZitat: number, sollwert: number, umgeleitet: number, zweitbeleg: number, pflicht: boolean}} ZahlenInventar
 * @typedef {{zahl: string, roh: string, einheit: string, dezimalen: number, art: string, soll: boolean, zeile: number, zitate: string[], papiere: string[], verweise: string[]}} ZahlenBehauptung
 * @typedef {{werte: Set<string>, zahlenwerte: number[], zeilen: {text: string, werte: Set<string>}[], fehler?: string}} ZahlenArtefakt
 */

const ZAHL = String.raw`\d{1,3}(?:[ ,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?`;
// Ein Serien-Glied endet an einer Zifferengrenze: ohne das (?!\d) haette "12/10/2026"
// die Serie "12 / 10 / 202" ergeben (gemessen 12.10., Fixture-Zeile "Lauf 12/10/2026").
const EINE_ZAHL = String.raw`\d{1,3}(?:[ ,]\d{3})*(?:[.,]\d+)?(?!\d)`;
const EINHEITEN = String.raw`%|Prozent|ms|Millisekunden|Sekunden|s\b|MB|GB|Gi|KiB|Knoten|nodes|Paare|pairs|Kanten|edges|fps|Bilder|frames|Zeilen|rows|Tage|days|Hits|Treffer|Welteinheiten|WE|world units|unit|units|cores|Plätzen|places`;
const EINHEIT_MUSTER = new RegExp(
  String.raw`(?<![A-Za-z0-9ÄÖÜäöüß.,/])(${ZAHL})\s+(${EINHEITEN})(?![A-Za-zÄÖÜäöüß])`,
  "g",
);
const SERIE = new RegExp(String.raw`((?:${EINE_ZAHL}\s*\/\s*){2,}${EINE_ZAHL})`, "g");
const EINHEIT_KANDIDAT = new RegExp(String.raw`^(?:${EINHEITEN})$`, "i");
// Ein Datum ist eine Serie mit Jahreszahl, nicht jede Dreiergruppe: "11 / 22 / 33 pairs"
// ist eine Messserie und war von der ersten Fassung als Datumssplitter verschluckt
// (Fixture-Fund 12.10., Zeile 17 in tests/fixtures/zahlen-belege/schlecht).
const DATUM_SERIE = new RegExp(String.raw`^\d{1,2}\s*\/\s*\d{1,2}\s*\/\s*(?:19|20)\d{2}$`);
const ARTEFAKT = /`([^`\n]*\.(?:log|json|txt|csv))`/g;
const ARTEFAKT_LINK = /\(([^()\s]*\.(?:log|json|txt|csv))\)/g;
const PAPIER = /`([^`\n]*\.md)`|\(([^()\s]*\.md)\)/g;

/**
 * Ein Soll ist keine Messung: "must stay at or above 0,3 %", "gegen die bestellten
 * 15 ms", "at 2 000 nodes is 353-375 ms against its 750 ms ceiling". Solche Zahlen
 * stueren in jedem Artefakt, weil sie nowhere gemessen sind — sie sind die Latte, und
 * die haelt ein expect im Quelltext. Die Markierung ist eng (60 Zeichen vor der Zahl)
 * und in tests/zahlen-belege.test.ts gegen ein echtes Messbeispiel getestet.
 */
const SOLL_MARKEN = /bar\b|Latte|Soll|bestell|ordered|ceiling|Budget|budget|must|muss|shall|soll|at or above|mindestens|nicht unter|at most|maximal|maximum|highstens|höchstens|pins|pinned|assert|erwartet|expected|≤|≥|bis zum|by step|not to exceed/i;

/**
 * Nicht jedes Backtick-Wort mit .json ist ein Beleg: die app eroehnt in ihrem CHANGELOG
 * auch `profile.json` und `scan-config.json`, und die sind Dateinamen in einem Satz,
 * keine Messung. Ein Zitat wird nur dann als Beleg behandelt, wenn es wie ein Protokoll
 * aussieht — ein Pfad mit Ordner, oder ein Name mit Datum/Stunde wie die Logs der
 * Scheiben ("latenz-100k-2026-09-30.json", "flaechenanteil-1441.log", "…-12-10.log").
 * Ein nicht aufloesbares, nicht protokollartiges Wort ist Erwaehnung: die Zahl gilt dann
 * als ohne Zitat, nicht als Befund.
 * @param {string} zitat
 */
export function protokollartig(zitat) {
  const sauber = zitat.replace(/^[….\s/\\-]+/, "");
  if (sauber.includes("/")) return true;
  return /\d{4}-\d{2}-\d{2}|[-_]\d{6}|[-_]\d{2,4}([-_]\d{1,2})?\.\w+$|[-_]\d{1,2}-\d{1,2}\.\w+$/.test(zitat);
}

/**
 * Zahlen, die in einem Papier des Kern-Repos stehen, deren Messung aber in einem
 * anderen Baum laeuft. Keine Freifahrt: die Wache oeffnet `belegtIn` und verlangt den
 * Wert dort — eine Ausnahme, deren eigener Beleg fehlt, ist rot.
 * Datei- UND zahlenscharf, mit Grund; ein wildcard wirft in liesAusnahmen.
 */
export const UMLEITUNGEN = [
  {
    datei: "CHANGELOG.md",
    zahl: "0.932",
    einheit: "%",
    belegtIn: "audit-2026-10-09/e2-code/nacht-12-10/rohdaten/flaechenanteil-1441.log",
    grund: "die app misst ihre eigene Flaeche; der Kern zitiert ihre Zahl in einer Zeile, die den Kern-Log nennt",
  },
  {
    datei: "CHANGELOG.md",
    zahl: "0.540",
    einheit: "%",
    belegtIn: "audit-2026-10-09/e2-code/nacht-12-10/rohdaten/flaechenanteil-1441.log",
    grund: "dieselbe Flaechenmessung der app, zweites Glied der Serie",
  },
  {
    datei: "CHANGELOG.md",
    zahl: "0.414",
    einheit: "%",
    belegtIn: "audit-2026-10-09/e2-code/nacht-12-10/rohdaten/flaechenanteil-1441.log",
    grund: "dieselbe Flaechenmessung der app, drittes Glied der Serie",
  },
];

/**
 * Die Dateien, die hart geprueft werden (Zahl ohne Zitat = Befund). Dateischarf, mit
 * Grund — ein wildcard wirft in liesAusnahmen.
 */
export const AUFPFLICHTUNGEN = [
  {
    datei: "CHANGELOG.md",
    grund: "die vorher/nachher-Zahlen der Graph-Scheibe sind hier zitiert und waren am 12.10. an vier Stellen nicht im zitierten Log",
  },
  { datei: "README.md", grund: "dieselben Zahlen stehen in der englischen Flaeche — Publikum" },
  { datei: "README.de.md", grund: "dieselben Zahlen in der deutschen Flaeche" },
];

/**
 * 1 019 = 1019, 98,6 = 98.6, 0,662 = 0.662.
 *
 * Zwei Schreiber, zwei Regeln, weil das sonst nicht aufloest ist:
 *   - Ein Papier gruppiert Tausender mit Punkt oder Leerzeichen und schreibt Nachkommastellen
 *     mit Komma ("6.986 ms", "0,662"). Eine fuehrende Null macht den Punkt zum Komma:
 *     "0.662" ist zweitausendsechsundsechzigzig, sondern 0,662 — deshalb gilt die
 *     Tausenderlesart nur, wenn die erste Gruppe nicht Null ist oder mehrere Gruppen stehen.
 *   - Ein Artefakt ist Maschinenausgabe: die groupiert nie, ihr Punkt ist immer ein
 *     Dezimalzeichen (dafuer ist `zahlAusMaschine` da, nicht diese Funktion).
 * @param {string} rohtext
 * @returns {string}
 */
export function normalisiereZahl(rohtext) {
  const t = String(rohtext).trim().replace(/[\u00a0\u202f]/g, " ");
  const gruppen = t.match(/^(\d{1,3}(?: \d{3})+)(?:[.,](\d+))?$/);
  if (gruppen) return `${gruppen[1].replace(/ /g, "")}${gruppen[2] ? `.${gruppen[2]}` : ""}`;
  const punkt = t.match(/^(\d{1,3}(?:\.\d{3})+)(?:,(\d+))?$/);
  if (punkt) {
    const gruppen = punkt[1].split(".").length - 1;
    const fuehrendeNull = punkt[1].startsWith("0.");
    if (gruppen > 1 || !fuehrendeNull) return `${punkt[1].replace(/\./g, "")}${punkt[2] ? `.${punkt[2]}` : ""}`;
    // "0.662" ist Maschinenschreibweise auch in einem Papier: eine Zahl zwischen null und
    // eins, nicht sechshundertzweiundsechzig. Faellt durch zur Dezimalzeile unten.
  }
  const komma = t.match(/^(\d{1,3}(?:,\d{3})+)(?:\.(\d+))?$/);
  if (komma && (komma[1].split(",").length > 2 || komma[2] !== undefined)) {
    return `${komma[1].replace(/,/g, "")}${komma[2] ? `.${komma[2]}` : ""}`;
  }
  const dezimal = t.match(/^(\d+)[.,](\d+)$/);
  if (dezimal) return `${dezimal[1]}.${dezimal[2]}`;
  if (/^\d+$/.test(t)) return t;
  return t.replace(/\s+/g, "");
}

/** Maschinenvalues kennen keine Tausendergruppen: Punkt und Komma sind Dezimalzeichen. */
export function zahlAusMaschine(rohtext) {
  return String(rohtext).trim().replace(/ /g, "").replace(/,/g, ".");
}

/**
 * Die zweite Lesart einer mehrdeutigen Schreibweise (1,019 = 1.019 oder 1019). Wird nicht
 * als Treffer durchgewunken, sondern in den Befund geschrieben: die Datei sagt, was sie
 * an dieser Stelle wirklich hat.
 * @param {string} rohtext
 * @returns {string|null}
 */
export function zweiteLesart(rohtext) {
  const t = String(rohtext).trim();
  if (/^\d{1,3},\d{3}$/.test(t)) return t.replace(",", "");
  if (/^\d{1,3}\.\d{3}$/.test(t)) return `${t.slice(0, t.length - 4)}.${t.slice(-3)}`;
  return null;
}

const gleich = (a, b) => normalisiereZahl(a) === normalisiereZahl(b);

/** Code und URLs sind keine Prosa — Backtick-Spaeh werden stellenweise leer gemacht. */
export function ohneCode(text) {
  return text
    .replace(/```[\s\S]*?```/g, (b) => b.replace(/[^\n]/g, " "))
    .replace(/`[^`\n]*`/g, (b) => " ".repeat(b.length));
}

/** Die Zitate einer Zeile — aus dem rohen Text, vor dem Schwärzen des Codes. */
export function zitateAus(text) {
  const out = [];
  for (const m of text.matchAll(ARTEFAKT)) out.push(m[1]);
  for (const m of text.matchAll(ARTEFAKT_LINK)) out.push(m[1]);
  return [...new Set(out)];
}

/**
 * Die Papier-Zitate (.md) einer Zeile — Beleg zweiter Hand nur, wenn das Papier eine
 * STELLE nennt ("Zeile 1150-1153", "line 3"). Ein nackter Name ist ein Querverweis:
 * "The same sentence stands in `kepta-app/docs/graph-kosten.md`" (CHANGELOG.md:25,
 * gemessen 12.10.) zeigt auf ein anderes Dokument, es beglaubigt keine Zahl — und
 * "SECURITY.md gained an Environment variables section" ebenso. Ohne diese Trennung
 * wurde aus sechs Querverweisen sechs mal "Zahl trifft ihr Zitat nicht", statt sechs
 * mal "Zahl ohne Zitat" (Erster Befund dieser Art, von der Leitung an mir gefunden).
 */
const STELLE = /(?:zeilen?|lines?)\s*\.?\s*#?\d{1,4}(?:\s*[-–]\s*\d{1,4})?|\bl\.\s*\d{1,4}\b|#\d{1,4}\b/i;

export function papiereAus(text) {
  /** @type {{pfad: string, stelle: boolean}[]} */
  const out = [];
  for (const m of text.matchAll(PAPIER)) {
    const pfad = m[1] ?? m[2];
    if (!pfad) continue;
    const nach = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 60);
    const davor = text.slice(Math.max(0, (m.index ?? 0) - 40), m.index ?? 0);
    if (!out.some((p) => p.pfad === pfad)) out.push({ pfad, stelle: STELLE.test(nach) || STELLE.test(davor) });
  }
  return out;
}

/** Die Zahl der Dezimalstellen, wie sie dasteht — Tausendergruppen sind keine. */
function dezimalen(rohtext) {
  const t = String(rohtext).trim();
  if (/^\d{1,3}(?:[ .]\d{3})+$/.test(t) || /^\d{1,3}(?:\.\d{3})+$/.test(t)) return 0;
  const m = t.match(/[.,](\d+)$/);
  return m ? m[1].length : 0;
}

/**
 * Behauptungen eines Textes: Zahl + Messgroesse, und Serien wie 37 / 935 / 7 134.
 *
 * Der Beleg gilt pro ZEILE, nicht pro Absatz: die CHANGELOG-Blöcke sind eine Zeile pro
 * Bulle und zitieren in Zeile 15 ein Log, in Zeile 16 ein anderes. Würde das Zitat des
 * Absatzes fuer alle Zeilen gelten, wären 52 richtige Zahlen rot (gemessen 12.10. auf dem
 * geheilten Stand) — und eine Wache, die richtige Papiere rot macht, wird abgeschaltet.
 * @param {string} text
 */
export function findeBehauptungen(text) {
  /** @type {{zahl: string, roh: string, einheit: string, dezimalen: number, art: string, soll: boolean, zeile: number, zitate: string[], papiere: string[]}[]} */
  const funde = [];
  let imZaun = false;
  const zeilen = text.split("\n");
  for (const [i, roh] of zeilen.entries()) {
    if (/^\s*(?:```|~~~)/.test(roh)) {
      imZaun = !imZaun;
      continue;
    }
    if (imZaun) continue;
    const zitate = zitateAus(roh);
    const papierFunde = papiereAus(roh);
    const papiere = papierFunde.filter((p) => p.stelle).map((p) => p.pfad);
    const verweise = papierFunde.filter((p) => !p.stelle).map((p) => p.pfad);
    const prosa = ohneCode(roh);
    let vorherEnde = 0;
    // Der Grund fuer eine Latte darf nicht aus dem Satz davor ererbt werden: geschaut
    // wird nur, was zwischen der letzten Behauptung und dieser hier steht (hoechstens
    // 60 Zeichen). Sonst fraesse "must stay at or above 0,3 %" jede folgende Messung.
    const soll = (index) => {
      const von = vorherEnde <= index ? Math.max(vorherEnde, index - 60) : Math.max(0, index - 60);
      return SOLL_MARKEN.test(roh.slice(von, index));
    };
    const fortschritt = (m) => {
      vorherEnde = Math.max(vorherEnde, m.index + m[0].length);
    };
    const einheitDerZeile = [];
    for (const m of prosa.matchAll(EINHEIT_MUSTER)) {
      einheitDerZeile.push(m[2]);
      funde.push({
        zahl: normalisiereZahl(m[1]),
        roh: m[1].trim(),
        einheit: m[2],
        dezimalen: dezimalen(m[1]),
        art: "einheit",
        soll: soll(m.index),
        zeile: i + 1,
        zitate,
        papiere,
        verweise,
      });
      fortschritt(m);
    }
    for (const m of prosa.matchAll(SERIE)) {
      if (DATUM_SERIE.test(m[1])) continue;
      const zahlen = m[1].split("/").map((z) => z.trim()).filter(Boolean);
      if (zahlen.every((z) => funde.some((f) => f.zeile === i + 1 && gleich(f.zahl, z)))) {
        fortschritt(m);
        continue;
      }
      // Die Messgroesse steht hinter der Serie ("65 / 311 / 745 ms") — und nur, wenn sie
      // eine bekannte Groesse ist: "614 by the surface's rule" ist kein Mass.
      const danach = prosa.slice(m.index + m[0].length).match(/^\*{0,2}\s*([A-Za-zÄÖÜäöüß%][A-Za-zÄÖÜäöüß%]*)/);
      const einheit = danach && EINHEIT_KANDIDAT.test(danach[1]) ? danach[1] : einheitDerZeile[0] ?? "";
      const istSoll = soll(m.index);
      for (const rohZahl of zahlen) {
        funde.push({
          zahl: normalisiereZahl(rohZahl),
          roh: rohZahl,
          einheit,
          dezimalen: dezimalen(rohZahl),
          art: "serie",
          soll: istSoll,
          zeile: i + 1,
          zitate,
          papiere,
          verweise,
        });
      }
      fortschritt(m);
    }
  }
  // Zweimal dieselbe Zahl auf derselben Zeile (einmal mit Einheit, einmal in der Serie)
  // waere zweimal derselbe Befund — die erste Nennung behaelt ihren Wortlaut.
  const gesehen = new Set();
  return funde.filter((f) => {
    const schluessel = `${f.zeile}:${f.zahl}`;
    if (gesehen.has(schluessel)) return false;
    gesehen.add(schluessel);
    return true;
  });
}

const AUSGELASSEN = new Set(["node_modules", ".git", "dist", "coverage", "test-results", ".venv", "venv", ".next", "build", "fixtures", "ausser Haus"]);

/**
 * Ein Lauf ist ein Schnappschuss der Platte: der Index einer Suchbasis wird einmal
 * gebaut und geteilt — ohne das geht ein Lauf ueber 20 Papiere in fuenf Baeumen in die
 * Minute, und gemessen hat er laengst nichts mehr.
 */
const LAUF_INDEX = new Map();

/**
 * Der Index einer Suchbasis: alle Dateien mit Mess-/Papier-Endung, relativ zur Basis.
 * Einmal pro Lauf gebaut — die Papiere zitieren mit weggelassenen Ordnern
 * ("audit-2026-10-09/…" fehlt oft), und ohne Index muesste jede Citation den Baum
 * absuchen. `fixtures` ist ausgelassen: Fixture-Artefakte beweisen nichts ueber Papiere.
 * @param {string} wurzel
 * @param {Map<string, string[]>} cache
 * @returns {string[]}
 */
function indexVon(wurzel, cache) {
  const gespeichert = cache.get(wurzel);
  if (gespeichert) return gespeichert;
  /** @type {string[]} */
  const dateien = [];
  const lauf = (ordner, relativ, tiefe) => {
    if (tiefe > 8) return;
    let eintraege;
    try {
      eintraege = fs.readdirSync(ordner, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of eintraege) {
      const p = path.join(ordner, e.name);
      const rp = relativ ? `${relativ}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!AUSGELASSEN.has(e.name) && !e.name.startsWith(".")) lauf(p, rp, tiefe + 1);
      } else if ([...ENDUNGEN, ".md"].some((x) => e.name.endsWith(x))) {
        dateien.push(rp);
      }
    }
  };
  lauf(wurzel, "", 0);
  cache.set(wurzel, dateien);
  return dateien;
}

/**
 * Wo die Maschine nach Zitaten sucht: der eigene Baum, die Arbeitsmappe mit den
 * Audit-Ordnern der Scheiben, und die Nachbarbaeume — die Papiere zitieren ueber den
 * Fall hinweg (`kepta-app/docs/graph-kosten.md` steht im Kern). Reihenfolge ist Sinn:
 * ein Pfad gilt zuerst im eigenen Baum, denn `npm/README.md` heisst in Kern und App
 * gleich und ist zweimal dasselbe Wort, aber nicht zweimal dasselbe Dokument.
 * @param {string} wurzel
 */
export function suchBasis(wurzel) {
  const home = process.env.HOME ?? "";
  const mappe = process.env.KEPTA_ARBEITSMAPPE ?? path.join(home, "Desktop", "ki gehirn");
  const nachbarn = (process.env.KEPTA_NACHBARN ?? "kepta-core,kepta-app,kepta-enterprise").split(",").map((n) => path.join(home, n.trim()));
  return [...new Set([wurzel, mappe, ...nachbarn])].filter((p) => p && fs.existsSync(p));
}

/**
 * Ein Zitat aufloesen: erst der geschriebene Pfad, dann die Ende-Übereinstimmung im Index
 * — ein Papier darf Ordner auslassen ("e2-code/nacht-12-10/rohdaten/x.log" ohne den
 * audit-Ordner davor). Elision am Anfang ("…/rohdaten/x.log") ist erlaubt. Der erste Such-/
 * Trefferbasis gewinnt; innerhalb einer Basis mehrere Treffer ist ein Befund.
 * @param {string} zitat
 * @param {string[]} suche
 * @param {Map<string, string[]>} [index]
 * @returns {string[]} gefundene Pfade, absolut
 */
export function loeseZitat(zitat, suche, index = LAUF_INDEX) {
  const sauber = zitat.replace(/^[….\s/\\-]+/, "").trim();
  if (!sauber) return [];
  for (const basis of suche) {
    // Ein Pfad kann relativ zur Basis stehen ("beleg/x.log") oder relativ zur Wohnung
    // ("kepta-app/docs/graph-kosten.md" im Kern-Papier) — beides ist ein direktes Zitat.
    const orten = [path.isAbsolute(sauber) ? sauber : path.join(basis, sauber), path.join(path.dirname(basis), sauber)];
    for (const direkt of new Set(orten)) {
      if (!fs.existsSync(direkt) || !fs.statSync(direkt).isFile()) continue;
      try {
        return [fs.realpathSync(direkt)];
      } catch {
        /* verschwindet zwischen Pruefung und Zugriff */
      }
    }
  }
  const ende = sauber.startsWith("/") ? sauber.slice(1) : sauber;
  for (const basis of suche) {
    /** @type {string[]} */
    const treffer = [];
    for (const rel of indexVon(basis, index)) {
      if (rel !== ende && !rel.endsWith(`/${ende}`)) continue;
      try {
        const absolut = fs.realpathSync(path.join(basis, rel));
        if (!treffer.includes(absolut)) treffer.push(absolut);
      } catch {
        /* verschwindet zwischen Index und Zugriff */
      }
    }
    if (treffer.length > 0) return treffer;
  }
  return [];
}

/**
 * Werte eines Artefakts: alle Zahlen (normalisiert) plus die Zeilen, in denen sie stehen,
 * damit ein Befund sagen kann, was die Datei an der passenden Stelle hat.
 * @param {string} pfad
 * @returns {ZahlenArtefakt}
 */
export function werteAusArtefakt(pfad) {
  const text = fs.readFileSync(pfad, "utf8");
  /** @type {Set<string>} */
  const werte = new Set();
  /** @type {number[]} */
  const zahlenwerte = [];
  /** @type {Map<string, string[]>} */
  const schluessel = new Map();
  /** @type {{text: string, werte: Set<string>}[]} */
  const zeilen = [];
  const notiz = (name, wert) => {
    if (!name) return;
    const liste = schluessel.get(name) ?? [];
    if (!liste.includes(wert) && liste.length < 8) liste.push(wert);
    schluessel.set(name, liste);
  };
  const zahlen = (schnipsel, name) => {
    const funde = [];
    // Gruppenform zuerst: \d{1,3}(...\d{3})+ sonst zerlegt "7134" in 713 und 4.
    for (const m of schnipsel.matchAll(/\d{1,3}(?:[ ,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/g)) {
      const wert = zahlAusMaschine(m[0]);
      if (/^[\d.]+$/.test(wert)) {
        werte.add(wert);
        notiz(name, wert);
        funde.push(wert);
      }
    }
    for (const m of schnipsel.matchAll(/-?\d+(?:\.\d+)?/g)) {
      const wert = Number(m[0]);
      if (Number.isFinite(wert)) zahlenwerte.push(wert);
    }
    return funde;
  };
  if (pfad.endsWith(".json")) {
    /** @param {*} wert @param {string|null} name */
    const begehen = (wert, name) => {
      if (typeof wert === "number") {
        werte.add(String(wert));
        zahlenwerte.push(wert);
        notiz(name, String(wert));
      } else if (typeof wert === "string") {
        zahlen(wert, name);
      } else if (Array.isArray(wert)) {
        for (const v of wert) begehen(v, name);
      } else if (wert && typeof wert === "object") {
        for (const [k, v] of Object.entries(wert)) begehen(v, k);
      }
    };
    try {
      begehen(JSON.parse(text), null);
    } catch (fehler) {
      return { fehler: `kein lesbares JSON (${fehler.message.slice(0, 70)})`, werte, zahlenwerte, schluessel, zeilen };
    }
    for (const zeile of text.split("\n")) {
      if (!zeile.trim()) continue;
      zeilen.push({ text: zeile.trim().slice(0, 200), werte: new Set((zeile.match(/\d+(?:\.\d+)?/g) ?? []).map(zahlAusMaschine)) });
    }
  } else {
    for (const zeile of text.split("\n")) {
      if (!zeile.trim()) continue;
      zeilen.push({ text: zeile.trim().slice(0, 200), werte: new Set(zahlen(zeile, null)) });
      for (const paar of zeile.matchAll(/(\w+)\s*=\s*([^\s|]+)/g)) zahlen(paar[2], paar[1]);
    }
  }
  return { werte, zahlenwerte, schluessel, zeilen };
}

/**
 * Steht die Zahl im Artefakt? Genau, auf die Stellenzahl des Papiers gerundet, oder in
 * der Sekunden-/Millisekunden-Rechnung desselben Pads: `p95: 7155.84` in der JSON und
 * "7.16 s" im Papier sind dieselbe Messung, und eine Wache, die Rundung und Einheit
 * nicht kennt, macht ein korrektes Papier rot. 7 044 trifft 7134 auch gerundet nicht.
 * @param {ZahlenArtefakt} artefakt
 * @param {{zahl: string, dezimalen?: number, einheit?: string}} behauptung
 */
export function imArtefakt(artefakt, behauptung) {
  if (artefakt.werte.has(behauptung.zahl)) return true;
  const ziel = Number(behauptung.zahl);
  if (!Number.isFinite(ziel)) return false;
  const stelle = behauptung.dezimalen ?? 0;
  const faktor = /^(?:s|Sekunden)$/.test(behauptung.einheit) ? 0.001 : /^(?:ms|Millisekunden)$/.test(behauptung.einheit) ? 1000 : 1;
  for (const wert of artefakt.zahlenwerte) {
    if (wert.toFixed(stelle) === behauptung.zahl) return true;
    if (faktor !== 1) {
      const umgerechnet = wert * faktor;
      if (umgerechnet.toFixed(stelle) === behauptung.zahl) return true;
      if (Math.abs(umgerechnet - ziel) <= 0.5 * 10 ** -stelle) return true;
    }
  }
  return false;
}

/**
 * Welche Schluessel eines Artefaks zu einer Messgroesse hoeren. Die Serie im Papier
 * ("37 / 935 / 7 134 pairs") liegt in derselben Serie im Log ("paareEigen=37/935/7134"),
 * und genau das ist die Stelle, die ein Befund zeigen muss — nicht irgend eine Zeile.
 */
const EINHEIT_FAMILIE = [
  [/^(?:ms|Millisekunden)$/i, /ms|zeit|dauer|median|mean|p\d\d|latency|latenz/i],
  [/^(?:s|Sekunden)$/i, /zeit|dauer|second|sekunde|median|\bs\b/i],
  [/^(?:%|Prozent)$/i, /anteil|deckung|prozent|pct|quote|rate|verhaeltnis|ratio|recall|precision|accuracy/i],
  [/^(?:Paare|pairs)$/i, /paar|pairs?|intersect/i],
  [/^(?:Knoten|nodes)$/i, /knoten|nodes?/i],
  [/^(?:Kanten|edges)$/i, /kanten|edges?/i],
  [/^(?:Plätzen|places)$/i, /wand|platz|place/i],
  [/^(?:Bilder|frames|fps)$/i, /bild|frame|fps/i],
  [/^(?:Treffer|Hits)$/i, /treffer|hit/i],
  [/^(?:Zeilen|rows)$/i, /zeile|row|zahl/i],
  [/^(?:Welteinheiten|WE|world units|unit|units)$/i, /welt|seite|unit|kante|radius|durchmesser|tiefe/i],
  [/^(?:cores)$/i, /core|last|cpu/i],
  [/^(?:Tage|days)$/i, /tag|day|alter/i],
];

/**
 * Was das Artefakt zur selben Familie sagt — drei bis vier Schluessel, Werte in
 * Dateireihenfolge, dazu die aehnlichste Zeile. Kurzer als ein Logdump, langer als "kein Wert".
 * @param {ZahlenArtefakt} artefakt
 * @param {string} einheit
 * @param {string} zahl
 * @param {string|null} stelle
 * @returns {string}
 */
function familienText(artefakt, einheit, zahl, stelle) {
  const familie = EINHEIT_FAMILIE.find(([muster]) => muster.test(einheit ?? ""))?.[1];
  const namen = familie ? [...artefakt.schluessel.keys()].filter((k) => familie.test(k)).slice(0, 4) : [];
  const schluesselText = namen.map((k) => `${k}=${artefakt.schluessel.get(k).join("/")}`).join(" ");
  const zeilenText = stelle ? `Zeile: ${stelle}` : "";
  const text = [schluesselText, zeilenText].filter(Boolean).join(" | ");
  return text || `${artefakt.werte.size} Werte, keiner davon ${zahl}`;
}

/**
 * Die Zeile des Artefakts, die am ehesten die Stelle des Satzes trifft.
 * @param {ZahlenArtefakt} artefakt
 * @param {string[]} anker
 */
function besteZeile(artefakt, anker) {
  let beste = null;
  let score = -1;
  for (const zeile of artefakt.zeilen) {
    let traf = 0;
    for (const a of anker) if (zeile.werte.has(normalisiereZahl(a))) traf += 1;
    if (traf > score) {
      score = traf;
      beste = zeile;
    }
  }
  return score > 0 ? beste : null;
}

/**
 * Der Kern: Behauptungen gegen die zitierten Artefakte.
 * @param {{wurzel: string, datei: string, text: string, suche?: string[], pflicht?: boolean}} optionen
 * @returns {{befunde: ZahlenBefund[], inventar: ZahlenInventar}}
 */
export function pruefeDoku({ wurzel, datei, text, suche, pflicht = false }) {
  const basis = suche ?? [...new Set([path.dirname(path.join(wurzel, datei)), ...suchBasis(wurzel)])];
  const behauptungen = findeBehauptungen(text);
  /** @type {ZahlenBefund[]} */
  const befunde = [];
  /** @type {Map<string, string[]>} */
  const aufgeloest = new Map();
  /** @type {Map<string, ReturnType<typeof werteAusArtefakt>>} */
  const geoeffnet = new Map();
  /** @type {Map<string, string[]>} */
  const index = LAUF_INDEX;
  const pflichtDatei = AUFPFLICHTUNGEN.some((a) => a.datei === datei);
  let mitBeleg = 0;
  let ohneZitat = 0;
  let sollwert = 0;
  let umgeleitet = 0;
  let zweitbeleg = 0;
  for (const b of behauptungen) {
    if (b.soll) {
      sollwert += 1;
      continue;
    }
    if (b.zitate.length === 0 && b.papiere.length === 0) {
      ohneZitat += 1;
      if (pflicht && pflichtDatei) {
        befunde.push({ datei, zeile: b.zeile, zahl: b.roh, einheit: b.einheit, art: "pflicht-ohne-zitat" });
      }
      continue;
    }
    const anker = behauptungen.filter((x) => x !== b && x.zeile === b.zeile).map((x) => x.zahl);
    let belegt = false;
    /** @type {string[]} */
    const sagen = [];
    let einProtokollGeoeffnet = false;
    for (const zitat of b.zitate) {
      if (!aufgeloest.has(zitat)) aufgeloest.set(zitat, loeseZitat(zitat, basis, index));
      const gefunde = aufgeloest.get(zitat);
      if (gefunde.length === 0) {
        if (protokollartig(zitat)) {
          befunde.push({ datei, zeile: b.zeile, zahl: b.roh, einheit: b.einheit, art: "pfad-existiert-nicht", zitat });
          einProtokollGeoeffnet = true;
        }
        continue;
      }
      einProtokollGeoeffnet = true;
      if (gefunde.length > 1) {
        befunde.push({ datei, zeile: b.zeile, zahl: b.roh, art: "zitat-mehrdeutig", zitat, alternativen: gefunde });
        continue;
      }
      const absolut = gefunde[0];
      if (!geoeffnet.has(absolut)) geoeffnet.set(absolut, werteAusArtefakt(absolut));
      const artefakt = geoeffnet.get(absolut);
      if (artefakt.fehler) {
        befunde.push({ datei, zeile: b.zeile, zahl: b.roh, art: "artefakt-unlesbar", zitat, grund: artefakt.fehler });
        continue;
      }
      if (imArtefakt(artefakt, b)) {
        belegt = true;
        continue;
      }
      const stelle = besteZeile(artefakt, anker);
      sagen.push(`${path.basename(absolut)}: ${familienText(artefakt, b.einheit, b.zahl, stelle?.text ?? null)}`);
    }
    if (belegt) {
      mitBeleg += 1;
      continue;
    }
    if (!einProtokollGeoeffnet && b.papiere.length === 0) {
      // Nur Dateinamen, die keine Protokolle sind: die Zeile hat keinen Beleg, aber sie
      // luegt auch nicht — sie gehoert in die Erfassung, nicht in den Befund.
      ohneZitat += 1;
      if (pflicht && pflichtDatei) {
        befunde.push({ datei, zeile: b.zeile, zahl: b.roh, einheit: b.einheit, art: "pflicht-ohne-zitat" });
      }
      continue;
    }
    const umleitung = UMLEITUNGEN.find((u) => u.datei === datei && normalisiereZahl(u.zahl) === b.zahl && (!u.einheit || u.einheit === b.einheit));
    if (umleitung) {
      const alternativen = loeseZitat(umleitung.belegtIn, basis, index);
      const werte = alternativen.length === 1 ? werteAusArtefakt(alternativen[0]) : null;
      if (werte && !werte.fehler && imArtefakt(werte, b)) {
        umgeleitet += 1;
        continue;
      }
      befunde.push({
        datei,
        zeile: b.zeile,
        zahl: b.roh,
        einheit: b.einheit,
        art: "ausnahme-ohne-beleg",
        zitat: umleitung.belegtIn,
        sageDieDatei: alternativen.length === 0 ? "die ausgebogene Datei existiert nicht" : werte?.fehler ?? `${werte ? werte.werte.size : 0} Werte, keiner davon ${b.zahl}`,
      });
      continue;
    }
    const papierTreffer = [];
    for (const papier of b.papiere) {
      const orte = loeseZitat(papier, basis, index);
      if (orte.length === 0) {
        befunde.push({ datei, zeile: b.zeile, zahl: b.roh, einheit: b.einheit, art: "pfad-existiert-nicht", zitat: papier });
        continue;
      }
      if (orte.length > 1) {
        befunde.push({ datei, zeile: b.zeile, zahl: b.roh, art: "zitat-mehrdeutig", zitat: papier, alternativen: orte });
        continue;
      }
      if (!geoeffnet.has(orte[0])) geoeffnet.set(orte[0], werteAusArtefakt(orte[0]));
      const p = geoeffnet.get(orte[0]);
      if (p.fehler) {
        befunde.push({ datei, zeile: b.zeile, zahl: b.roh, art: "artefakt-unlesbar", zitat: papier, grund: p.fehler });
        continue;
      }
      if (imArtefakt(p, b)) {
        papierTreffer.push(path.basename(orte[0]));
      } else {
        sagen.push(`${path.basename(orte[0])}: ${familienText(p, b.einheit, b.zahl, null)}`);
      }
    }
    if (papierTreffer.length > 0) {
      zweitbeleg += 1;
      continue;
    }
    if (sagen.length > 0) {
      const lesart = zweiteLesart(b.roh);
      const kurz = sagen.slice(0, 3).join(" | ");
      befunde.push({
        datei,
        zeile: b.zeile,
        zahl: b.roh,
        einheit: b.einheit,
        art: "zahl-nicht-im-beleg",
        zitat:
          [b.zitate.join(", "), b.papiere.length > 0 ? `Beleg zweiter Hand: ${b.papiere.join(", ")}` : "", b.verweise.length > 0 ? `Querverweis (kein Beleg): ${b.verweise.join(", ")}` : ""]
            .filter(Boolean)
            .join(" | "),
        sageDieDatei: `${sagen.length > 3 ? `${sagen.length} Quellen, drei gezeigt: ` : ""}${kurz}` + (lesart ? ` (mehrdeutige Schreibweise: als ${normalisiereZahl(b.roh)} und ${lesart} gelesen)` : ""),
      });
    }
  }
  return {
    befunde,
    inventar: { datei, behauptungen: behauptungen.length, mitBeleg, ohneZitat, sollwert, umgeleitet, zweitbeleg, pflicht: pflichtDatei },
  };
}

/** Markdown-Dateien des Baums — ueber git, damit ignorierte Ordner nicht mitzaehlen. */
export function mdDateien(wurzel) {
  try {
    return execFileSync("git", ["ls-files", "-z", "*.md"], { cwd: wurzel, encoding: "utf8" })
      .split("\0")
      .filter(Boolean)
      .sort();
  } catch {
    /** @type {string[]} */
    const funde = [];
    const lauf = (ordner, tiefe) => {
      if (tiefe > 6) return;
      let eintraege;
      try {
        eintraege = fs.readdirSync(ordner, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of eintraege) {
        if (e.isDirectory()) {
          if (!AUSGELASSEN.has(e.name) && !e.name.startsWith(".")) lauf(path.join(ordner, e.name), tiefe + 1);
        } else if (e.name.endsWith(".md")) {
          funde.push(path.relative(wurzel, path.join(ordner, e.name)));
        }
      }
    };
    lauf(wurzel, 0);
    return funde.sort();
  }
}

/**
 * Ausnahmen und Pflichten. Beides ist datei-scharf und hat einen Grund; eine wildcard-
 * Ausnahme wirft, und eine Umleitung, die keinen Belegpfad nennt, wirft ebenfalls —
 * sonst ist die Ausnahmeliste ein Loch, das man sich selbst schreibt.
 * @param {Array<{datei?: string, grund?: string, zahl?: string, einheit?: string, belegtIn?: string}>} eintrag
 */
export function liesAusnahmen(eintrag) {
  for (const a of eintrag) {
    if (!a.datei || !a.grund) throw new Error(`Ausnahme ohne Datei oder Grund: ${JSON.stringify(a)}`);
    if (/[*?]/.test(a.datei)) throw new Error(`Wildcard-Ausnahme verboten (${a.datei}) — Ausnahmen sind datei-scharf`);
    const istUmleitung = "zahl" in a || "belegtIn" in a;
    if (!istUmleitung) continue;
    if (!a.zahl) throw new Error(`Umleitung ohne Zahl (${a.datei}) — Ausnahmen sind zahlenscharf`);
    if (!a.belegtIn || /[*?]/.test(a.belegtIn)) throw new Error(`Umleitung braucht einen genauen Belegpfad, nicht: ${a.belegtIn ?? "nichts"} (${a.datei} ${a.zahl})`);
  }
  return eintrag;
}

export function hauptfunktion(argv = process.argv.slice(2)) {
  const arg = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
  const wurzel = arg("wurzel") ?? process.cwd();
  liesAusnahmen([...AUFPFLICHTUNGEN, ...UMLEITUNGEN]);
  const pflicht = argv.includes("--pflicht");
  const dateien = arg("datei") ? [arg("datei")] : mdDateien(wurzel);

  /** @type {object[]} */
  const alle = [];
  /** @type {object[]} */
  const inventar = [];
  for (const datei of dateien) {
    const absolut = path.isAbsolute(datei) ? datei : path.join(wurzel, datei);
    if (!fs.existsSync(absolut)) continue;
    const ergebnis = pruefeDoku({
      wurzel,
      datei: path.relative(wurzel, absolut) || datei,
      text: fs.readFileSync(absolut, "utf8"),
      pflicht,
    });
    alle.push(...ergebnis.befunde);
    inventar.push(ergebnis.inventar);
  }
  const summe = inventar.reduce(
    (a, i) => ({
      behauptungen: a.behauptungen + i.behauptungen,
      mitBeleg: a.mitBeleg + i.mitBeleg,
      ohneZitat: a.ohneZitat + i.ohneZitat,
      sollwert: a.sollwert + i.sollwert,
      umgeleitet: a.umgeleitet + i.umgeleitet,
      zweitbeleg: a.zweitbeleg + i.zweitbeleg,
    }),
    { behauptungen: 0, mitBeleg: 0, ohneZitat: 0, sollwert: 0, umgeleitet: 0, zweitbeleg: 0 },
  );
  const nachArt = new Map();
  for (const b of alle) nachArt.set(b.art, (nachArt.get(b.art) ?? 0) + 1);

  if (argv.includes("--inventar")) {
    console.log(
      `zahlen-belege: ${dateien.length} Markdown-Dateien, ${summe.behauptungen} Messbehauptungen — ` +
        `${summe.mitBeleg} im zitierten Artefakt bestaetigt, ${summe.ohneZitat} ohne Artefakt-Zitat auf der Zeile, ` +
        `${summe.sollwert} Soll-Zahlen (Latte, keine Messung), ${summe.umgeleitet} in einem anderen Baum belegt, ` +
        `${summe.zweitbeleg} nur in einem Papier belegt, ${alle.length} Befund/Befunde${pflicht ? " (Pflicht ohne Zitat mitgezaehlt)" : ""}`
    );
    for (const i of inventar.filter((x) => x.behauptungen > 0).sort((a, b) => b.behauptungen - a.behauptungen)) {
      console.log(
        `  ${i.datei}: ${i.behauptungen} Behauptungen, ${i.mitBeleg} bestaetigt, ${i.ohneZitat} ohne Zitat, ` +
          `${i.sollwert} Soll, ${i.umgeleitet} umgelenkt, ${i.zweitbeleg} im Papier${i.pflicht ? " [Pflicht]" : ""}`
      );
    }
    return 0;
  }
  if (alle.length === 0) {
    console.log(
      `zahlen-belege: ${dateien.length} Markdown-Dateien, ${summe.behauptungen} Messbehauptungen — ` +
        `jedes zitierte Artefakt ist geoeffnet und jede Zahl darin gefunden (${summe.mitBeleg} bestaetigt, ` +
        `${summe.ohneZitat} ohne Zitat, ${summe.sollwert} Soll, ${summe.umgeleitet} umgelenkt, ${summe.zweitbeleg} im Papier` +
        `${pflicht ? ", keine Pflicht-Zahl ohne Zitat" : ", Pflichten nicht geprueft — --pflicht"})`
    );
    return 0;
  }
  console.error(
    `zahlen-belege: ${alle.length} Befund/Befunde — eine Zahl in der Doku, die ihr eigenes Zitat nicht trifft ` +
      `(${[...nachArt].map(([a, n]) => `${n} ${a}`).join(", ")}):`
  );
  for (const b of alle) {
    console.error(
      `  ${b.datei}:${b.zeile} — ${b.zahl}${b.einheit ? ` ${b.einheit}` : ""} — ${b.art}` +
        `${b.zitat ? ` (zitiert: ${b.zitat})` : ""}${b.sageDieDatei ? ` — die Datei sagt: ${b.sageDieDatei}` : ""}` +
        `${b.grund ? ` — ${b.grund}` : ""}${b.alternativen ? ` — Kandidaten: ${b.alternativen.join(", ")}` : ""}`
    );
  }
  console.error(`  geoeffnete Artefakte: ${summe.mitBeleg} von ${summe.behauptungen} Behauptungen bestaetigt, ${summe.ohneZitat} ohne Zitat`);
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = hauptfunktion();
