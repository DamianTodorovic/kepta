// Punkt 7 — "jeder muss es verstehen": der erste Census ueber die eigne Sprache.
//
// Warum ein Werkzeug und kein Gefuehl: seit dem 14.10. haengt Punkt 7 als Zahl in der
// ARBEITSLISTE, und gemessen ist daran nichts. "Verstaendlich" war bis hierher ein Urteil
// ueber Einzelfaelle, die gerade aufgefallen sind. Dieser Lauf zaehlt **alle** Saetze, die
// ein Mensch in der Flaeche liest, und zwar im ausgelieferten Objekt: ein Kandidat aus dem
// Quelltext zaehlt nur, wenn dieselbe Zeichenkette im gebauten Buendel steht. Ein Census
// ueber Bytes, die niemand bekommt, ist eine Selbstbeschreibung.
//
// Fahrt:
//   node scripts/verstaendlichkeit.mjs                       (gegen das installierte Objekt)
//   node scripts/verstaendlichkeit.mjs --gegen <pfad/app.asar>
//   node scripts/verstaendlichkeit.mjs --nur quelltext       (ohne Objekt-Gleichung, zum Bauen)
//
// Die Latte, die hier steht, ist eine gemessene Groesse und kein Wunsch:
//   SATZKAPPE 14 Woerter — ueber 14 Woertern verliert ein Mensch den Bezug im Lesen, und die
//   Hausregel fuer aussen stehende Texte ist "unter 130 Woertern pro Stueck". 80 Prozent der
//   Saetze muessen unter der Kappe bleiben; die Zahl ist eine Untergrenze, keine Schoenheit:
//   sie sagt, wie viele Saetze ueberhaupt lesbar sein muessen, damit ein Bestand von 21 066
//   Notizen nicht eine Sprache spricht, die nur seiner Erfinderin paesst.
// Was dieser Lauf NICHT entscheidet, steht unter dem Census als offene Zeile: ob ein Mensch
// den Satz *versteht*, ist eine Frage an einen Menschen, nicht an einen Zaehler.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const WURZEL = path.resolve(new URL("..", import.meta.url).pathname);
const ARG = (nam, fallb) => {
  const i = process.argv.indexOf("--" + nam);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallb;
};
const NUR_QUELLTEXT = process.argv.includes("--nur") && process.argv.includes("quelltext");
const OBJEKT = NUR_QUELLTEXT ? null : ARG("gegen", "/Applications/K3PTA.app/Contents/Resources/app.asar");
export const SATZKAPPE = 14;
const UNTER_KAPPE_MINDESTENS = 0.8;
// Die zweite Latte ist ein Riegel, kein Wunsch. Ihr Max war 8 — gemessen am ausgelieferten
// 3.2.144, nachdem ein Sprachlauf von 25 auf 8 gefallen war. Am 5.11.2026 sass der Riegel auf
// seinem eignen Anschlag: 8 Funde bei erlaubten 8, also meldete er "haelt", waehrend nichts
// mehr erlaubt war. Seit diesem Schnitt ist der Spielraum wieder real: die acht Saetze nennen
// ihren Grund oder eine Taetigkeit, gemessen 18:41 MEZ = **0** Funde, und das Max ist auf 0
// gezogen. Dazu liegt die Regel jetzt in der Suite (tests/punkt7-fachwort-traegt-grund.test.ts),
// weil ein Wert in einem Skript niemanden anruft, wenn eine Zeile ihn bricht.
// Nebenbefund des Laufs: drei der elf Funde an der Quelle waren Kommentar-Zitate im Quelltext
// (Dashboard.tsx:595, TodayView.tsx:173, Chat.tsx:152) — kein Mensch liest sie auf der Flaeche,
// also streicht der Zaehler Kommentare, bevor er Kandidaten sucht.
export const FACH_OHNE_GRUND_MAX = 0;
const LISTE = Number(ARG("liste", 12));

// Zwei Mengen, weil sie zwei Leser haben. **Flaeche** liest ein Mensch, **Werkzeug** liest ein
// Agent — und "jeder muss es verstehen" (Punkt 7) ist eine Frage an die Flaeche. Ein Census, der
// beide vermischt, verkauft eine Maschinenbeschreibung als Menschensatz.
export const FLAECHE = ["src/components", "src/pages", "src/lib"].filter((d) => fs.existsSync(path.join(WURZEL, d)));
export const WERKZEUG = ["src/core"].filter((d) => fs.existsSync(path.join(WURZEL, d)));

// P82: der Diener schreibt seinen Text in den Leib einer Antwort, und fuenf Stellen
// holen ihn in die Flaeche zurueck (Settings.tsx:340 und :379, Chat.tsx:680,
// store.ts:327 und :489). Eine Menge, die der Nutzer sieht, ist keine interne Notiz.
export const DIENER = ["server"].filter((d) => fs.existsSync(path.join(WURZEL, d)));

// Fachwoerter, die ein Mensch nicht mitbringt. Absichtlich die Menge, die in unserem eignen
// Wortschatz vorkommt — nicht die, die ein Papiertext haben darf.
export const FACHWORTER = [
  "embedding", "embeddings", "vector", "vectors", "cosine", "recall", "precision", "chunk",
  "chunks", "index", "latency", "token", "tokens", "mcp", "bm25", "entity", "entities",
  "semantic", "episodic", "procedural", "retrieval", "dedupe", "duplicate", "cipher",
  "sqlite", "asar", "endpoint", "daemon", "graph", "node", "nodes", "edge", "edges",
];

// Ein Satz erklaert sich, wenn er einen Grund oder eine Folge nennt.
// P82, gemessen 00:30:54 MEZ: "a mention says no more than that two terms appeared
// together" erklaert sein Fachwort, indem es die Bedeutung nennt -- das Raster sah
// darin keinen Grund. Neu gilt ein Definitionssatz -- sagen/zeigen/bedeuten *mit* einem
// that-Satz (gemessen 00:33:33 MEZ: nackt erlaubt stieg der Grund-Anteil der Flaeche von
// 27 auf 69 von 348, weil "shows" allein noch nichts erklaert; mit that-Satz ist er wieder
// eine Zahl, die etwas behauptet).
export const GRUND = /\b(because|since|so|which means|that is why|after you|when you|if you|instead of|rather than|before|until|unless)\b|\b(says|say|means|mean|shows|show|reads|read|tells|tell)\b[^.]{0,60}\bthat\b/i;
// Ein Satz handelt, wenn er dem Menschen eine Taetigkeit nennt. Die Liste ist weit, weil ein
// Zaehler, der "hover" nicht kennt, einen guten Satz als Befund verkauft: gemessen 4.11. 08:12,
// wo "No labels — hover or arrow-key to a node and its full title comes back" ohne Taetigkeit
// zaehlte. Erst die Gegenprobe macht die Zahl lesbar.
// P82: der Leser dieser Saetze ist ein Agent, und seine Taetigkeit heisst senden.
export const HANDLUNG = /\b(click|type|write|open|close|zoom|name|select|press|add|remove|switch|turn on|turn off|drag|search|unfold|fold|show|hide|save|export|edit|create|delete|try|use|hover|arrow-key|arrow keys|move|pick|choose|keep|allow|agree|start|stop|wait|paste|drop|point|hold|send|sends|sent)\b/i;

// Prompt-Texte lesen sich wie Flaeche, sind aber fuer ein Modell geschrieben. Sie zaehlen mit,
// wenn man die Sprache eines Produkts messen will, und sie zaehlen falsch, wenn man die Sprache
// fuer einen Menschen messen. Also raus, mit Namen, damit die Grundgesamtheit stimmt.
const AUSSCHLUSS_PFAD = /src\/lib\/(autolearn|.*prompt.*)\.ts$/;
const AUSSCHLUSS_WORT = /reply only|you are a|as JSON|system prompt/i;

/** Kandidaten aus dem Quelltext: JSX-Text, Titel, Beschriftung, Platzhalter, Meldung. */
export function kandidatenAusQuelltext(mengen) {
  const funde = new Map();
  const dateien = [];
  for (const d of mengen) {
    const ordner = path.join(WURZEL, d);
    for (const rel of execFileSync("find", [ordner, "-name", "*.tsx", "-o", "-name", "*.ts"], { encoding: "utf8" }).split("\n")) {
      if (rel.trim()) dateien.push(rel);
    }
  }
  const muster = [
    /> ([^<{}]{20,400}) </g,                       // JSX-Textknoten
    /\b(?:title|placeholder|aria-label|label|text|message|hinweis|info)\s*=\s*"([^"]{20,400})"/g,
    /\b(?:title|placeholder|aria-label|label)\s*=\s*\{`([^`]{20,400})`\}/g,
    /"([A-Z][^"\\]{20,300}?)"/g,                    // String-Literale (Meldungen, Kopfzeilen)
    /'([A-Z][^'\\]{20,300}?)'/g,
  ];
  for (const datei of dateien) {
    // Kommentare sind nicht die Flaeche. Gemessen 5.11.2026 18:39 MEZ: drei der elf Funde
    // waren Begruendungszeilen im Quelltext (Dashboard.tsx:595, TodayView.tsx:173, Chat.tsx:152),
    // die einen fruehern Befund zitieren — ein Mensch liest sie nirgends. Ein Zaehler, der
    // Zitate aus dem Bau-text fuehrt, meldet Mangel, wo ein Vermerk steht.
    const t = fs.readFileSync(datei, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const m of muster) {
      m.lastIndex = 0;
      let e;
      while ((e = m.exec(t))) {
        const s = e[1].trim();
        if (!istBenutzersprache(s)) continue;
        if (AUSSCHLUSS_PFAD.test(datei.replace(WURZEL + "/", ""))) continue;
        if (AUSSCHLUSS_WORT.test(s)) continue;
        if (!funde.has(s)) funde.set(s, datei.replace(WURZEL + "/", ""));
      }
    }
  }
  return funde;
}

export function istBenutzersprache(s) {
  if (s.length < 20) return false;
  const woerter = s.split(/\s+/).filter(Boolean);
  if (woerter.length < 4) return false;
  if (/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+/.test(s)) return false;         // Pfade
  if (/=>|\bif\(|\bfor\(|\.\w+\(/.test(s)) return false;                // starke Codezeichen
  // `{};=` treffen auch Prosa. Gemessen 5.11.2026 22:40 MEZ in `src/core`: sieben
  // Werkzeug-Saetze fielen durch das alte eine Raster, drei davon waren ausgeschrieben
  // Satze, die ein Modell wortlich liest (memory_search, memory_save, memory_consolidate).
  // Ein Satz mit Grossbuchstabe am Anfang und Satzzeichen am Ende ist keine Quelltextzeile;
  // Notation ohne diese Gestalt ("semantic=fact, episodic=event", "true = delete permanently")
  // bleibt draussen, weil sie Werte listet statt Sprache erklaert.
  // Die Gestalt entscheidet der Grossbuchstabe am Anfang -- ein Punkt am Ende ist keine
  // Bedingung: gemessen 23:25 MEZ fiel "Graph depth 1-4, default 2; use 1 for a quick
  // lookup" durch die Schlusszeichen-Kante, obwohl der Satz ohne Semikolon geliefert
  // wird. Notation bleibt draussen, weil sie klein anfing ("semantic=fact…", "true = …").
  const satzgestalt = /^[A-ZÄÖÜ]/.test(s.trim());
  if (!satzgestalt && /[{};=]/.test(s)) return false;
  if (/^[a-z-]+(:| |,)[a-z-]+/.test(s) && !/\s[a-z]+\s[a-z]+/.test(s)) return false; // CSS
  if (/%[sd]|\\n|\$\{/.test(s)) return false;                          // Formatierer
  const buchstaben = (s.match(/[A-Za-z]/g) || []).length;
  if (buchstaben / s.length < 0.6) return false;                        // Zahlenkolonnen
  if (/^(SELECT|INSERT|UPDATE|DELETE|PRAGMA|CREATE|ALTER|DROP|ERROR|TODO|FIXME)/i.test(s)) return false;
  return true;
}

export function zaehle(s) {
  const woerter = s.split(/\s+/).filter(Boolean);
  const klein = s.toLowerCase();
  const fach = FACHWORTER.filter((w) => new RegExp("\\b" + w + "\\b").test(klein));
  return {
    woerter: woerter.length,
    fach,
    grund: GRUND.test(s),
    handlung: HANDLUNG.test(s),
  };
}

function imObjekt(suche, s) {
  // Das Buendel ist Bytes, kein Text: ein Satz mit einem echten Gedankenstrich (U+2014) ist in
  // UTF-8 drei Bytes, und ein Suchlauf, der die Datei latin1 liest, findet ihn nie. Ebenso bricht
  // JSX einen langen Menschensatz ueber mehrere Quelltextzeilen, und der Compiler wirft die
  // Umbrueche weg. Darum drei Lesungen, in dieser Reihenfolge: die rohen Bytes, die HTML-
  // entlasteten Bytes, und die auf Leerraum zurueckgefuehrte Form gegen eine ebenso
  // zurueckgefuehrte Datei.
  if (suche.puffer.includes(Buffer.from(s, "utf8"))) return true;
  const entlastet = s.replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"');
  if (suche.puffer.includes(Buffer.from(entlastet, "utf8"))) return true;
  const glatt = (t) => t.replace(/\s+/g, " ").trim();
  return suche.textGlatt.includes(glatt(s)) || suche.textGlatt.includes(glatt(entlastet));
}

/** Ein Census ueber einer Menge von Saetzen, mit seiner eignen Biss-Kontrolle. */
export function zensiere(getragen) {
  const n = getragen.length;
  const teil = (k) => (100 * k / Math.max(1, n)).toFixed(1) + " %";
  // Ein Nenner, der nicht genannt ist, macht jede Prozentzahl zur Vermutung: gezaehlt wird der
  // Ausschnitt, den dieses Werkzeug sieht (Flaeche, im Objekt gefunden, ohne Prompt-Texte),
  // nicht "alle Worte, die irgendwo in der App stehen".
  return {
    n,
    unterKappe: getragen.filter((z) => z.woerter <= SATZKAPPE).length,
    mitGrund: getragen.filter((z) => z.grund).length,
    mitHandlung: getragen.filter((z) => z.handlung).length,
    mitFach: getragen.filter((z) => z.fach.length > 0).length,
    fachOhneAlles: getragen.filter((z) => z.fach.length > 0 && !z.grund && !z.handlung),
    teil,
  };
}

function melde(name, c, getragen, gate, korpus) {
  // P85, gemessen 6.11.2026 01:16:40 MEZ am ausgelieferten 3.2.173: der Werkzeug-Block schrieb
  // "18 (72.0 %) -- Latte 80 %", obwohl URTEIL KAPPE nur die Flaeche misst. Eine Latte neben
  // einer nicht gemessenen Zahl erfindet eine Regel. Also: die Zeile nennt ihren Status.
  const kappe = gate
    ? `  — Latte ${100 * UNTER_KAPPE_MINDESTENS} %`
    : "  — Bericht, keine Latte (URTEIL KAPPE misst nur die Flaeche)";
  console.log(`\n  ${name}: ${c.n} Saetze ${korpus}`);
  console.log(`    unter der Kappe von ${SATZKAPPE} Woertern: ${c.unterKappe} (${c.teil(c.unterKappe)})${kappe}`);
  console.log(`    mit Grund oder Folge: ${c.mitGrund} (${c.teil(c.mitGrund)})`);
  console.log(`    nennt dem Menschen eine Taetigkeit: ${c.mitHandlung} (${c.teil(c.mitHandlung)})`);
  console.log(`    mit mindestens einem Fachwort: ${c.mitFach} (${c.teil(c.mitFach)})`);
  console.log(`    Fachwort ohne Grund und ohne Taetigkeit: ${c.fachOhneAlles.length}`);
  // Die Zahl ohne ihre Liste ist eine Behauptung: welche Saetze meinen hier "Grund"?
  console.log("    die Saetze mit Grund oder Folge (alle, gekuerzt):");
  for (const z of getragen.filter((x) => x.grund)) console.log(`      ${z.quelle}  ::  ${z.s.slice(0, 108)}`);
  return c;
}

async function haupt() {
  let suche = null;
  if (OBJEKT) {
    if (!fs.existsSync(OBJEKT)) { console.log("KEIN OBJEKT unter " + OBJEKT); process.exitCode = 2; return; }
    const puffer = fs.readFileSync(OBJEKT);
    suche = { puffer, textGlatt: puffer.toString("utf8").replace(/\s+/g, " ") };
    console.log("  Objekt: " + OBJEKT + " (" + puffer.length + " B, als Bytes und in einer leerraum-armen Lesung)");
  } else {
    console.log("  OHNE Objekt-Gleichung (--nur quelltext): die Zahl beschreibt den Baum, nicht die Auslieferung.");
  }

  const baue = (mengen) => {
    const funde = kandidatenAusQuelltext(mengen);
    const zeilen = [];
    for (const [s, quelle] of funde) {
      zeilen.push({ s, quelle, ...zaehle(s), imObjekt: suche ? imObjekt(suche, s) : null });
    }
    const getragen = suche ? zeilen.filter((z) => z.imObjekt) : zeilen;
    return { zeilen, getragen };
  };

  const flaeche = baue(FLAECHE);
  const werkzeug = baue(WERKZEUG);
  const diener = baue(DIENER);
  console.log(`\n  Kandidaten im Quelltext: Flaeche ${flaeche.zeilen.length}, Werkzeug ${werkzeug.zeilen.length}, Diener ${diener.zeilen.length}`);
  if (suche) {
    console.log(`  die Objekt-Gleichung verwirft: Flaeche ${flaeche.zeilen.length - flaeche.getragen.length}, Werkzeug ${werkzeug.zeilen.length - werkzeug.getragen.length}, Diener ${diener.zeilen.length - diener.getragen.length}`);
  }

  const cFlaeche = zensiere(flaeche.getragen);
  const cWerkzeug = zensiere(werkzeug.getragen);
  const cDiener = zensiere(diener.getragen);
  const korpus = suche ? "im ausgelieferten Objekt" : "im Baum, nicht am ausgelieferten Objekt";
  melde("FLAECHE (ein Mensch liest)", cFlaeche, flaeche.getragen, true, korpus);
  melde("WERKZEUG (ein Agent liest)", cWerkzeug, werkzeug.getragen, false, korpus);
  melde("DIENER (ein Mensch oder ein Agent liest die Antwort mit)", cDiener, diener.getragen, false, korpus);

  const langsten = [...flaeche.getragen].sort((a, b) => b.woerter - a.woerter).slice(0, 12);
  console.log("\n  Die zwoelf laengsten Menschensaetze (Wortzahl | Quelle):");
  for (const z of langsten) console.log(`    ${String(z.woerter).padStart(3)}  ${z.quelle}  ::  ${z.s.slice(0, 118)}`);

  const alleFunde = [
    ...cFlaeche.fachOhneAlles.map((z) => ({ ...z, lage: "Flaeche" })),
    ...cWerkzeug.fachOhneAlles.map((z) => ({ ...z, lage: "Werkzeug" })),
    ...cDiener.fachOhneAlles.map((z) => ({ ...z, lage: "Diener" })),
  ];
  console.log("\n  Fachwort ohne Grund und ohne Taetigkeit (die ersten " + LISTE + " von " + alleFunde.length + "):");
  for (const z of alleFunde.slice(0, LISTE)) console.log(`    ${z.lage}  ${z.fach.join(",")}  ${z.quelle}  ::  ${z.s.slice(0, 150)}`);

  // Zwei Kontrollen, weil ein Zaehler ohne Gegenprobe eine Behauptung ist.
  // 1) Sie MUSS ein Wort sehen, das im Objekt steht (die Rate-Zeile von 3.2.143).
  const bis = "Name a claim in a note to put a word on a line";
  const getroffen = flaeche.getragen.some((z) => z.s.includes(bis));
  // 2) Sie DARF ein Wort nicht sehen, das nirgends geliefert wird (eingebauter Fehler).
  const blind = suche ? !imObjekt(suche, "Dieser Satz wurde nie ausgeliefert 4711") : true;
  console.log(`\n  Biss-Kontrolle eins: die Rate-Zeile von 3.2.143 ist im Census ${getroffen ? "getroffen" : "NICHT getroffen"}`);
  console.log(`  Biss-Kontrolle zwei: ein nie ausgelieferter Satz wird ${blind ? "richtig verworfen" : "NICHT verworfen — die Gleichung ist blind"}`);
  if (!getroffen) console.log("    -> der Census meldet nichts: seine Sonde trifft ihr eignes Ziel nicht.");

  const anteil = cFlaeche.unterKappe / Math.max(1, cFlaeche.n);
  const kappeHalten = anteil >= UNTER_KAPPE_MINDESTENS;
  const riegelHalten = [cFlaeche, cWerkzeug, cDiener].every((c) => c.fachOhneAlles.length <= FACH_OHNE_GRUND_MAX);
  const taub = !getroffen || !blind;
  const urteil = taub ? "TAUB" : kappeHalten && riegelHalten ? "HALTET" : "FAELLT";
  console.log(`  URTEIL KAPPE: ${kappeHalten ? "HALTET" : "FAELLT"} (Flaeche: Anteil unter ${SATZKAPPE} Woertern ${(100 * anteil).toFixed(1)} %, Latte ${100 * UNTER_KAPPE_MINDESTENS} %)`);
  console.log(`  URTEIL RIEGEL: ${riegelHalten ? "HAELT" : "FAELLT"} (Fachwort ohne Grund und ohne Taetigkeit: Flaeche ${cFlaeche.fachOhneAlles.length} von ${cFlaeche.n}, Werkzeug ${cWerkzeug.fachOhneAlles.length} von ${cWerkzeug.n}, Diener ${cDiener.fachOhneAlles.length} von ${cDiener.n}, Max je Gruppe ${FACH_OHNE_GRUND_MAX} — der Wert ist am 5.11. und 6.11.2026 an allen drei Lagen gemessen)`);
  console.log(`  URTEIL GRUND: die Flaeche nennt in ${cFlaeche.mitGrund} von ${cFlaeche.n} Saetzen einen Grund oder eine Folge —`);
  console.log("  das ist der Befund dieses Laufs, nicht sein Ziel: eine Zahl ohne Vergleich ist eine Messung, noch kein Urteil.");
  console.log("  OFFEN bleibt, was dieser Lauf nicht beantworten kann: ob ein Mensch den Satz *versteht*.");
  console.log("  Dafuer braucht Punkt 7 einen Menschen oder ein Gegenstueck aus dem Markt.");
  if (urteil === "FAELLT") process.exitCode = 1;
  if (urteil === "TAUB") process.exitCode = 3;
}

// Ein Import ist keine Fahrt. Bis 3.2.167 endete diese Datei auf einem nackten `haupt()`,
// also las jeder Import -- und die Suite importiert die Regel in zwei Dateien -- den Census
// gegen das installierte Objekt (49 200 915 B) und druckte siebzig Zeilen in den Lauf.
// Zeuge: 5.11.2026 22:39:38 MEZ, der Einzelfall-Lauf meldete den Census im Testausdruck.
const direkt = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);
if (direkt) await haupt();
