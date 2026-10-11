// Die eine Quelle fuer die Testzahl.
//
// Drei Werkzeuge haben drei verschiedene Fragen beantwortet, und zwei davon
// sollten hueten: der JSON-Bericht eines FRUEHEREN Laufs (474), eine statische
// Wortzaehlung im Quelltext (687) und die Behauptung im README (476). Keine
// davon hat gefragt, wie viele Faelle in diesem Lauf durchgelaufen sind.
//
// Dieses Modul beantwortet genau die eine Frage, und beide Wachen hoeren darauf:
//   scripts/doku-check.mjs      — direkt NACH dem Lauf, am Bericht desselben Laufs.
//   tests/doku-zahlen.test.ts   — MITTEN im Lauf, am Bericht des letzten Laufs,
//                                und nur, wenn der nachweislich den aktuellen Baum
//                                beschreibt. Das ist der einzige Zeituengpunkt, den
//                                dieses Modul nicht aufloesen kann: vitest schreibt
//                                seinen Bericht am Ende des Laufs, ein Test in diesem
//                                Lauf kann ihn also nicht lesen. Die Wahrheit holt
//                                sich die Suite aus dem Bericht, der denselben Baum
//                                schon einmal vollstaendig durchlaufen hat — und die
//                                post-run-Wache doku-check prueft sie am eben gelaufenen
//                                Lauf.
//
// Regel: keine Zahl ohne beglaubigten Bericht. Fehlt der Bericht, ist er aelter als
// die juengste Testdatei oder stammt er aus einem Teillauf, sagt die Wache, dass sie
// NICHT pruefen kann — sie vergleicht dann nichts. Gruen muss der Bericht dafuer
// nicht sein: die Zahlenwache sitzt in der Suite, und ein gruenzwaengender Bericht
// sperre sie mit ihrem eigenen Fehlschlag aus. Die Gruen-Pflicht traegt
// doku-check.mjs, das nach der Suite laeuft.
//
// Die beiden Repos teilen diese Datei byte-identisch. Der Kern und die App hatten
// dieselbe Regel zweimal selbst ausformuliert und sind in fuenf Punkten
// auseinandergelaufen; was hier steht, gilt deshalb an einer Stelle.
import fs from "node:fs";
import path from "node:path";

/**
 * Ein Lauf, dessen Zahl beglaubigt ist. `ok` ist hier bewusst das Literal `true`,
 * damit `if (!bericht.ok) throw` die Felder danach verengt — die Wachen arbeiten
 * alle mit diesem einen Typ.
 * @typedef {object} BeglaubigterBericht
 * @property {true} ok
 * @property {number} zahl             Faelle, die in diesem Lauf durchgelaufen sind
 * @property {number} bestanden        davon mit gruenem Ergebnis
 * @property {number} uebersprungen    Faelle, die der Lauf nicht ausgefuehrt hat
 * @property {number} erklaertUebersprungen  davon: im Quelltext als skip/todo erklaert
 * @property {number} zurueckgewiesen   davon: zur Laufzeit abgewiesen (Ruhe, Plattform)
 * @property {number} bedingtErklaert   skipIf-Faelle im Quelltext (plattformabhaengig)
 * @property {number} zahlNachAlterRegel total minus pending — die maschinenabhaengige Zahl
 * @property {number} fehlgeschlagen
 * @property {number} dateienBericht   Testdateien, die der Bericht kennt
 * @property {number} dateienBaum      Testdateien, die der Baum hat
 * @property {string} zeit             Zeitpunkt des Berichts, lesbar
 * @property {string} tag              Tag des Berichts als YYYY-MM-DD — der Messstand, den die Doku nennen muss
 */

/**
 * Ein Bericht, dem nicht getraut werden kann. Es gibt keine Zahl, und die Wachen
 * vergleichen dann nichts.
 * @typedef {object} UnbeglaubigterBericht
 * @property {false} ok
 * @property {string} grund            warum nicht geprueft werden kann
 * @property {string} hinweis          was zu tun ist, um die Zahl zu bekommen
 */

/** @typedef {BeglaubigterBericht | UnbeglaubigterBericht} Bericht */

/** Der Bericht, den die test-Scripts schreiben; `test-results/` ist git-ignoriert. */
export const BERICHT_PFAD = path.join("test-results", "vitest.json");

/** Felder, ohne die der Bericht wertlos ist (andere Reporter, anderes vitest). */
const NOTWENDIGE_FELDER = ["numTotalTests", "numPassedTests", "numFailedTests", "numPendingTests", "testResults"];

export const HINWEIS =
  "Der Bericht entsteht nur durch einen Lauf: `npm test` (oder `npm run test:cov`) — beide schreiben `test-results/vitest.json` und enden mit `node scripts/doku-check.mjs`. Ein Test kann den Bericht seines eigenen Laufs nicht lesen (vitest schreibt ihn am Ende), also ist der erste Lauf nach einem Checkout oder nach einer Aenderung an der Suite die Messung und der zweite die Pruefung.";

/**
 * Der Tag des Berichts — darauf genau haengt die Zahl in der Doku. UTC, nicht
 * lokale Zeit: derselbe Commit, ein Runner in UTC und ein Rechner in CEST
 * mussen denselben Messstand sehen. Um 00:01 CEST ist der Tag sonst schon
 * weiter als der des Runner-Laufs von 22:01 UTC — und die Wache verweigert
 * eine Zahl, die vollstaendig richtig ist.
 */
const tagVon = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Der Moment des Berichts, in UTC und mit Sekunden — zwei Aenderungen in
 *  derselben Minute sind der Alltag, wenn mehrere an einem Baum arbeiten. */
const datum = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ") + " UTC";

/** Alle Testdateien, die vitest einsammelt: alle `.test.ts`/`.test.tsx` unter `tests/`, relativ, sortiert. */
export function testDateien(wurzel = process.cwd()) {
  const sammle = (ordner) => {
    /** @type {string[]} */
    const funde = [];
    if (!fs.existsSync(ordner)) return funde;
    for (const eintrag of fs.readdirSync(ordner, { withFileTypes: true })) {
      if (eintrag.name === "node_modules" || eintrag.name.startsWith(".")) continue;
      const voll = path.join(ordner, eintrag.name);
      if (eintrag.isDirectory()) funde.push(...sammle(voll));
      else if (eintrag.name.endsWith(".test.ts") || eintrag.name.endsWith(".test.tsx")) {
        funde.push(path.relative(wurzel, voll).split(path.sep).join("/"));
      }
    }
    return funde;
  };
  return sammle(path.join(wurzel, "tests")).sort();
}

/**
 * Der Bericht schreibt die Dateinamen je nach Version absolut oder relativ.
 * Zurueck bleibt der Pfad im Baum, null fuer etwas, das keiner Testdatei entspricht.
 */
function relativAusBericht(name) {
  const p = String(name ?? "").split(path.sep).join("/");
  const i = p.indexOf("/tests/");
  if (i >= 0) return p.slice(i + 1);
  return p.startsWith("tests/") ? p : null;
}

/** Die READMEs, die eine Testzahl nennen duerfen. README.de.md nur, wo es sie gibt. */
export function readmeDateien(wurzel = process.cwd()) {
  return ["README.md", "README.de.md"].filter((d) => fs.existsSync(path.join(wurzel, d)));
}

/**
 * Die Behauptungen, die ein Text als Testzahl in die Welt setzt — mit Art und
 * Zeile. Das Abzeichen ist eine eigene Art, weil es ein Bild ist: kein Suchwort
 * fuehrt dorthin, und eine Zahl, die dort altert, sieht niemand. Die Wache muss
 * also sagen koennen, WELCHE Stelle luegt, nicht nur, dass eine von dreien es tut.
 * @param {string} text
 * @returns {{zahl: number, art: string, zeile: number}[]}
 */
export function testbehauptungen(text) {
  const muster = [
    { art: "Fettsatz", re: /\*\*(\d+)\s+(?:tests|Tests)\*\*/g },
    { art: "Abzeichen", re: /tests-(\d+)%20passing/g },
    { art: "Befehlskommentar", re: /#\s*(\d+)\s+(?:tests|Tests)\b/g },
  ];
  const funde = [];
  for (const { art, re } of muster) {
    for (const m of text.matchAll(re)) {
      funde.push({ zahl: Number(m[1]), art, zeile: text.slice(0, m.index ?? 0).split("\n").length });
    }
  }
  return funde;
}

/** Die Zahlen, die ein Text als Testzahl nennt — die Menge seiner Behauptungen. */
export function genannteTestzahlen(text) {
  return [...new Set(testbehauptungen(text).map((b) => b.zahl))];
}

/**
 * Die Messstaende, an denen Zahlen haengen: `gemessen am 2026-10-10`,
 * `measured 2026-10-09`. Ein Datum ohne dieses Wort zaehlt nicht — die READMEs
 * nennen Daten fuer Coverage-Laeufe und Aenderungen, und keins davon darf als
 * Stand der Testzahl durchgehen.
 * @param {string} text
 * @returns {string[]} Tage als YYYY-MM-DD
 */
export function messstempel(text) {
  return [...new Set([...text.matchAll(/(?:gemessen (?:am )?|measured (?:on )?)(\d{4}-\d{2}-\d{2})/gi)].map((m) => m[1]))];
}

/**
 * Die im QUELLTEXT erklaerten Faelle, die ein Lauf nie ausfuehren kann.
 *
 * Warum das eigene Zaehlung braucht: `numPendingTests` aus dem Bericht kennt
 * zwei ganz verschiedene Dinge — einen Fall, den jemand im Quelltext als
 * `it.skip` erklaert hat, und einen Fall, den eine Ruhe-Klammer WAHREND des
 * Laufs abgewiesen hat. Der erste darf von der Zahl abgehen, der zweite nicht:
 * derselbe Commit, ein dedizierter Runner und dieser Rechner, und die Suite
 * meldet 979 gegen 977 ausgefuehrte Faelle, weil drei zeitmessende Faelle
 * von der Maschine abhaengen. Die Doku kann nicht gegen zwei Zahlen geschrieben
 * werden, also haelt die Zahl die Maschine auszuhalten hat — und der Bericht
 * meldet, was wirklich lief.
 *
 * @param {string} wurzel
 * @returns {{unbedingt: string[], bedingt: string[], grund: string | null}}
 */
export function erklaerteSkips(wurzel = process.cwd()) {
  const unbedingt = [];
  const bedingt = [];
  let grund = null;
  const muster = /^[ \t]*(?:it|test)\.(skip|todo|fixme)(\.each)?\s*\(\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/gm;
  const bedingtMuster = /^[ \t]*(?:it|test)\.(?:skipIf|runIf|skipIf|onlyIf)\s*\(/gm;
  const beschreibungMuster = /^[ \t]*(?:describe|suite)\.(skip|todo)\s*\(/gm;
  const jederFallMuster = /^[ \t]*(?:it|test)\.(skip|todo|fixme)(\.each)?\s*\(/gm;
  for (const datei of testDateien(wurzel)) {
    const quelle = fs.readFileSync(path.join(wurzel, datei), "utf-8");
    if (beschreibungMuster.test(quelle)) {
      grund = `${datei}: describe.skip — erklaerte Faelle sind nicht einzeln zaehlbar, die Zahl waere maschinenabhaengig`;
      break;
    }
    beschreibungMuster.lastIndex = 0;
    for (const m of quelle.matchAll(muster)) {
      unbedingt.push(m[3] ?? m[4] ?? m[5] ?? "");
    }
    for (const m of quelle.matchAll(jederFallMuster)) {
      if (m[2]) grund = `${datei}: it.${m[1]}.each — die Tabelle ist statisch nicht als einzelner Fall erkennbar`;
    }
    jederFallMuster.lastIndex = 0;
    for (const m of quelle.matchAll(bedingtMuster)) {
      const wo = m.index ?? 0;
      const zeile = quelle.slice(wo, quelle.indexOf("\n", wo));
      const titel = /\(\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/.exec(zeile.slice(zeile.indexOf("(")));
      bedingt.push(titel ? (titel[1] ?? titel[2] ?? titel[3] ?? "") : zeile.trim().slice(0, 60));
    }
    bedingtMuster.lastIndex = 0;
  }
  return { unbedingt, bedingt, grund };
}

/**
 * Die eine Regel, die beide Wachen anwenden: jede Zahl, die eine Doku als
 * Testzahl in die Welt setzt, muss die Zahl DIESES Laufs sein und an seinem
 * Messstand haengen. steht sie hier einmal, pruefen sie beide — die Suite und
 * das post-run-Skript — und eine Meldung nennt Zeile und Art (Fettsatz,
 * Abzeichen, Befehlskommentar). Das Abzeichen ist der Fall, den niemand fand:
 * ein Bild in Zeile 2, das keine Suche trifft und keinen Textvergleich stoert.
 *
 * @param {string} text der README-Inhalt
 * @param {{zahl: number, tag: string}} lauf der beglaubigte Lauf (aus leseBericht(), ein gleichartiger Satz genügt)
 * @param {string} datei Name der Datei, fuer die Meldung
 * @returns {string[]} Fehler; leer, wenn die Doku zu diesem Lauf passt
 */
export function dokuVergleich(text, lauf, datei) {
  const behauptungen = testbehauptungen(text);
  if (behauptungen.length === 0) return [`${datei}: nennt gar keine Testzahl mehr`];

  const fehler = [];
  for (const b of behauptungen) {
    if (b.zahl !== lauf.zahl) {
      fehler.push(`${datei}:${b.zeile} ${b.art}: nennt ${b.zahl} Tests, gelaufen sind ${lauf.zahl}`);
    }
  }

  const stempel = messstempel(text);
  if (stempel.length === 0) {
    fehler.push(`${datei}: nennt keinen Messstand ("gemessen am YYYY-MM-DD") fuer seine Testzahl`);
  } else if (!stempel.includes(lauf.tag)) {
    fehler.push(`${datei}: haengt die Zahl an ${stempel.join(" / ")}, beglaubigt ist der Lauf vom ${lauf.tag}`);
  }
  return fehler;
}

/**
 * Statische Zaehlung der it()/test()-Bloecke im Quelltext — inklusive sichtbarer
 * it.each-Tabellen.
 *
 * WARUM DAS NICHT DIE WAHRHEIT IST, sondern nur eine Plausibilitaetsgrenze nach
 * unten: erstens zaehlt ein `it.each(regeln)` hier als EIN Fall, zur Laufzeit
 * laeuft er aber so oft, wie die Liste Eintraege hat — kommt die Tabelle aus einer
 * Variablen, ist die Schaetzung zu niedrig, und bei einer Liste mit hundert
 * Regeln hundertmal zu niedrig. Zweitens entgeht ein `it.skip` dieser Zaehlung
 * ganz (die Muster kennen nur `it(`, `test(` und `it.each(`), waehrend vitests
 * numTotalTests den Fall mitzaehlt, obwohl er nie laeuft — die eine Zahl ist zu
 * tief, die andere zu hoch. Drittens steht ein Fall, den eine Helper-Fabrik baut,
 * in keiner gezaehlten Zeile.
 *
 * Deshalb: die Zahl der Doku kommt aus dem Bericht (leseBericht). Diese hier
 * prueft nur noch, dass niemand eine Zahl unterhalb des offensichtlich Moeglichen
 * behauptet — der Fehler, der hier zweimal passiert ist.
 */
export function statischeTestanzahl(wurzel = process.cwd()) {
  /** Elemente eines Array-Literals ab der oeffnenden Klammer, sonst null. */
  const tabellenLaenge = (quelle, ab) => {
    if (quelle[ab] !== "[") return null;
    let tiefe = 0;
    let elemente = 1;
    let inText = null;
    for (let i = ab; i < quelle.length; i++) {
      const c = quelle[i];
      const davor = quelle[i - 1];
      if (inText) {
        if (c === inText && davor !== "\\") inText = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        inText = c;
        continue;
      }
      if (c === "[" || c === "(" || c === "{") tiefe++;
      else if (c === "]" || c === ")" || c === "}") {
        tiefe--;
        if (tiefe === 0) {
          const inhalt = quelle.slice(ab + 1, i).trim();
          return inhalt === "" ? 0 : elemente;
        }
      } else if (c === "," && tiefe === 1) elemente++;
    }
    return null;
  };

  const zaehleDatei = (quelle) => {
    let n = 0;
    const re = /^[ \t]*(?:it|test)(\.each)?\s*\(/gm;
    let m;
    while ((m = re.exec(quelle)) !== null) {
      if (!m[1]) {
        n += 1;
        continue;
      }
      const laenge = tabellenLaenge(quelle, re.lastIndex);
      n += laenge && laenge > 0 ? laenge : 1;
    }
    return n;
  };

  let summe = 0;
  for (const datei of testDateien(wurzel)) summe += zaehleDatei(fs.readFileSync(path.join(wurzel, datei), "utf-8"));
  return summe;
}

/**
 * Der Bericht, oder der Grund, warum nicht geprueft werden kann.
 *
 * @param {{ wurzel?: string, bericht?: string }} [optionen]
 * @returns {Bericht}
 */
export function leseBericht({ wurzel = process.cwd(), bericht = BERICHT_PFAD } = {}) {
  const pfad = path.join(wurzel, bericht);
  if (!fs.existsSync(pfad)) {
    return { ok: false, grund: `${bericht} fehlt — ohne Bericht gibt es keine Zahl, und ein Wert aus der Ablage ist keiner.`, hinweis: HINWEIS };
  }

  /** @type {any} */
  let roh;
  try {
    roh = JSON.parse(fs.readFileSync(pfad, "utf8"));
  } catch (fehler) {
    return { ok: false, grund: `${bericht} ist kein lesbares JSON (${fehler.message}).`, hinweis: HINWEIS };
  }

  const fehlendeFelder = NOTWENDIGE_FELDER.filter((f) => roh[f] === undefined || roh[f] === null);
  if (fehlendeFelder.length > 0) {
    return {
      ok: false,
      grund: `${bericht} ist unvollstaendig: die Felder ${fehlendeFelder.join(", ")} fehlen — anderer Reporter, anderes vitest?`,
      hinweis: HINWEIS,
    };
  }

  const berichtZeit = fs.statSync(pfad).mtimeMs;
  const baum = testDateien(wurzel);
  let juengste = { zeit: 0, name: "" };
  for (const datei of baum) {
    const zeit = fs.statSync(path.join(wurzel, datei)).mtimeMs;
    if (zeit > juengste.zeit) juengste = { zeit, name: datei };
  }
  if (juengste.zeit > berichtZeit) {
    return {
      ok: false,
      grund:
        `${bericht} ist aelter als ${juengste.name} — er beschreibt einen Stand, der nicht mehr gilt ` +
        `(Bericht ${datum(berichtZeit)}, ${juengste.name} ${datum(juengste.zeit)}).`,
      hinweis: HINWEIS,
    };
  }
  if (baum.length === 0) {
    return { ok: false, grund: "keine Testdateien im Baum — der Waechter wuerde ins Leere laufen.", hinweis: HINWEIS };
  }

  const imBericht = new Set(roh.testResults.map((f) => relativAusBericht(f.name)).filter(Boolean));
  const fehlenGeblieben = baum.filter((d) => !imBericht.has(d));
  const unbekannt = [...imBericht].filter((d) => !baum.includes(d));
  if (fehlenGeblieben.length > 0 || unbekannt.length > 0) {
    const ennung = fehlenGeblieben.length > 0
      ? `er kennt ${imBericht.size} von ${baum.length} Testdateien — es fehlen ${fehlenGeblieben.slice(0, 3).join(", ")}`
      : `er nennt ${unbekannt.slice(0, 3).join(", ")}, die es im Baum nicht mehr gibt`;
    return {
      ok: false,
      grund: `${bericht} stammt aus einem anderen Stand: ${ennung} (Bericht ${datum(berichtZeit)}).`,
      hinweis: HINWEIS,
    };
  }

  if (roh.numFailedTests > 0) {
    // Kein Abbruch: die Zahlenwache sitzt IN der Suite. Verlangte sie hier einen
    // gruenen Lauf, koennte sie sich selbst aussperren — ihr eigener Fehlschlag
    // senkt die Zahl der bestandenen Faelle, und die Doku koennte keiner Zahl mehr
    // zustimmen. Beglaubigt wird deshalb, was gelaufen IST (unabhaengig davon, ob
    // es bestand), und die Gruen-Pflicht liegt beim post-run-Skript: doku-check
    // laeuft per `&&` nur nach einer gruenen Suite und weigert sich dort.
    // Was ein roter Lauf mit der Zahl macht, steht in den Feldern daneben.
  }

  const nichtAusgefuehrt = [];

  for (const datei of roh.testResults) {
    const eintraege = datei.assertionResults ?? [];
    for (const a of eintraege) {
      if (a.status === "pending" || a.status === "skipped" || a.status === "todo") {
        nichtAusgefuehrt.push(String(a.fullName ?? a.title ?? `${(a.ancestorTitles ?? []).join(" > ")} ${a.title ?? ""}`.trim()));
      }
    }
  }
  const faelleImBericht = roh.testResults.reduce((n, d) => n + (d.assertionResults?.length ?? 0), 0);
  const pendingGemeldet = (roh.numPendingTests ?? 0) + (roh.numTodoTests ?? 0);
  if (faelleImBericht !== roh.numTotalTests) {
    return {
      ok: false,
      grund:
        `${bericht} zaehlt anders als seine Eintraege: numTotalTests ${roh.numTotalTests}, aber ${faelleImBericht} Faelle in testResults — ` +
        "ein Bericht, dem die Faelle fehlen (Teillauf, anderer Reporter), kann keine Zahl beglaubigen.",
      hinweis: HINWEIS,
    };
  }
  const erklaert = erklaerteSkips(wurzel);
  if (erklaert.grund) {
    return { ok: false, grund: `${bericht}: ${erklaert.grund}`, hinweis: HINWEIS };
  }
  const getroffen = (titel) => nichtAusgefuehrt.some((name) => name.includes(titel) || titel.includes(name));
  const erfuellt = (titel) => roh.testResults.some((d) => (d.assertionResults ?? []).some((a) => String(a.fullName ?? a.title ?? "").includes(titel)));
  const fehlendeErklaerung = erklaert.unbedingt.filter((titel) => !getroffen(titel) && !erfuellt(titel));
  if (fehlendeErklaerung.length > 0) {
    return {
      ok: false,
      grund:
        `${bericht}: ${fehlendeErklaerung.length} im Quelltext erklaerte(r) Fall/Faelle taucht/flauchen im Bericht nicht auf ` +
        `(${fehlendeErklaerung.slice(0, 2).join(", ")}) —erklaert ist nicht dasselbe wie nicht vorhanden`,
      hinweis: HINWEIS,
    };
  }
  const erklartUebersprungen = erklaert.unbedingt.filter((titel) => getroffen(titel)).length;
  if (erklartUebersprungen > pendingGemeldet) {
    return {
      ok: false,
      grund: `${bericht}: ${erklartUebersprungen} erklaerte Faelle, aber nur ${pendingGemeldet} wurden nicht ausgefuehrt — der Bericht passt nicht zum Baum`,
      hinweis: HINWEIS,
    };
  }
  const uebersprungen = pendingGemeldet;
  const zurueckgewiesen = pendingGemeldet - erklartUebersprungen;
  return {
    ok: true,
    // Die Zahl der Faelle, die in diesem Lauf durchgelaufen sind: gesammelt minus
    // die, die der Lauf nie ausgefuehrt hat (skip, todo). In einer gruenen Suite
    // ist das dieselbe Zahl wie die der bestandenen Faelle — und nur diese ist
    // stabil, wenn ein Testfall der Wache selbst gerade rot ist.
    // erklaert (Quelltext) geht ab, zurueckgewiesen (Ruhe, Plattform) bleibt drin:
    // nur so ist die Zahl dieselbe auf Runner und Rechner.
    zahl: roh.numTotalTests - erklartUebersprungen,
    uebersprungen,
    erklaertUebersprungen: erklartUebersprungen,
    zurueckgewiesen,
    bedingtErklaert: erklaert.bedingt.length,
    zahlNachAlterRegel: roh.numTotalTests - uebersprungen,
    fehlgeschlagen: roh.numFailedTests,
    bestanden: roh.numPassedTests,
    dateienBericht: imBericht.size,
    dateienBaum: baum.length,
    zeit: datum(berichtZeit),
    tag: tagVon(berichtZeit),
  };
}
