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
//   Saetze muessen die Kappe tragen; die Zahl ist eine Untergrenze, keine Schoenheit:
//   sie sagt, wie viele Saetze ueberhaupt lesbar sein muessen, damit ein Bestand von 21 066
//   Notizen nicht eine Sprache spricht, die nur seiner Erfinderin paesst. Die Vergleichs-
//   richtung ist ein Wort wert, weil 38 von 348 Saetzen genau darauf liegen: `traegtKappe`
//   zaehlt hoechstens 14, und ein Lauf, der an zwei Stellen verschieden rechnet, fuehrt
//   keine Zahl, die er meldet (gemessen 6.11.2026 06:45:22 MEZ).
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

/** Ein Durchgang durch den Quelltext: Funde und ihre Art, frisch, ohne Zustand zwischen
    den Aufrufen. */
/** Die Quelltextdateien einer Menge — dieselbe Liste fuer Saetze und fuer Etiketten.
    Eine eigne Liste pro Zaehler waere eine eigne Welt, und zwei Welten vergleichen sich nicht. */
export function quelltextDateien(mengen) {
  const dateien = new Set();
  for (const d of mengen) {
    const ordner = path.join(WURZEL, d);
    for (const rel of execFileSync("find", [ordner, "-name", "*.tsx", "-o", "-name", "*.ts"], { encoding: "utf8" }).split("\n")) {
      if (rel.trim()) dateien.add(rel);
    }
  }
  // "src" und "src/components" sind zwei Namen fuer einen Baum: die Listetraeger duerfen
  // denselben Pfad nicht zweimal zaehlen, sonst erbt die Grundgesamtheit eine Doppelung.
  return [...dateien];
}

/** Der Quelltext ohne Kommentare: Kommentare sind nicht die Flaeche. */
function menschenText(datei) {
  return fs
    .readFileSync(datei, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/* Jedes Muster traegt seine Art mit: was ein Mensch im Blatt liest (jsx, wort, literal),
   und was nur am Rand erscheint -- der Titel unter dem Zeiger, der Platzhalter, der
   Name fuer den Vorleser (rand). Gemessen 05:36:54 MEZ: die drei Chat-Zweige der
   Rangfolge-Erklaerung stehen als `title=` im Quelltext, 24 bis 29 Woerter lang, und
   der Census zaehlt sie wie gelesenen Flaechentext. Ob das dieselbe Latte sein darf,
   ist eine Frage an die Zahl, nicht an den Geschmack -- also zuerst beide Zahlen.
   `ausdruck` markiert die Formen, die in einer Expression stehen: dort ist die
   Satzgestalt Pflicht, weil sonst ein Klassenkleid als Satz durchgeht. */
const SATZ_MUSTER = [
  { re: /> ([^<{}]{20,400}) </g, art: "jsx" },
  // Der Vorlesername steht vor dem Rand: ein `aria-label` wird voellig gesprochen, ein
  // `title=` malt das Betriebssystem in ein Kaestchen, das beim Zeigerwandern verschwindet.
  // Zwei Medien, zwei Lesefaelle, also zwei Arten (gemessen 10:01:40 MEZ: 16 der 17
  // ueberkappen Rand-Saetze sind Titel, einer ein Vorlesername).
  { re: /\baria-label\s*=\s*"([^"]{20,400})"/g, art: "vorleser" },
  { re: /\b(?:title|placeholder)\s*=\s*"([^"]{20,400})"/g, art: "rand" },
  { re: /\b(?:label|text|message|hinweis|info)\s*=\s*"([^"]{20,400})"/g, art: "wort" },
  { re: /\baria-label\s*=\s*\{`([^`]{20,400})`\}/g, art: "vorleser", ausdruck: true },
  { re: /\b(?:title|placeholder)\s*=\s*\{`([^`]{20,400})`\}/g, art: "rand", ausdruck: true },
  { re: /\b(?:label|text|message|hinweis|info)\s*=\s*\{`([^`]{20,400})`\}/g, art: "wort", ausdruck: true },
  // P105: die Stelle, an der ein Satz ganz in einer Expression steht -- `{`…`}` als
  // JSX-Kind. Kein altes Muster sah diese Form; gemessen 12:38:50 MEZ blieben so 25
  // ausgelieferte Saelze unsichtbar, und zwei von ihnen verlangt die Inhaltssperre
  // ("Share of painted nodes per group", "No node of the core is inside this picture").
  // P105 hat beide Woerter benannt: die Schiene sagt jetzt "painted dots", das Panel
  // "No note of the core" -- gemessen 12:50:41 MEZ: URTEIL DOPPELNAMEN HALTET (0 von 958 Stellen).
  { re: />\s*\{`([^`]{20,400})`\s*\}/g, art: "jsx", ausdruck: true },
  { re: /\{\s*`([^`]{20,400})`\s*\}/g, art: "meldung", ausdruck: true },
  // P106: die Anweisungsposition. Ein Wortlaut, der in einem `return`, einem Ternaer oder
  // einem Argument steht und nur in einer Backtick-Kette lebt, war ausserhalb aller Muster --
  // gemessen 6.11.2026 13:46:32 MEZ: **130** ausgelieferte Menschensaetze in der Flaeche, 11
  // im Werkzeug, 28 beim Diener. Ohne Prosa-Test frae dieser Quelltext, denn ein
  // Klassenkleid (`flex items-center gap-2 rounded-lg`) besteht aus Huell-Woertern. Der Test
  // ist eine Folge, keine Liste: vier alphabetische Woerter hintereinander schreibt keine
  // Utility-Kette und jede Sprache.
  { re: /(?:return|case|:|=|\?|\|\||\(|,)\s*`([^`]{20,400})`/g, art: "anweisung", prosa: vierWortlauf },
  { re: /"([A-Z][^"\\]{20,300}?)"/g, art: "literal" },
  { re: /'([A-Z][^'\\]{20,300}?)'/g, art: "literal" },
];

/** Vier alphabetische Woerter hintereinander: die Form, die eine Utility-Kette nicht
    schreibt und eine Sprache schon. Gezaehlt 6.11.2026 13:46:14 MEZ an den 130 neuen
    Flaeche-Kandidaten -- kein Klassenkleid blieb darin, und kein ausgeliefertes Wortling. */
export function vierWortlauf(s) {
  let lauf = 0;
  for (const w of s.split(/\s+/)) {
    if (/^[A-Za-z]+$/.test(w)) {
      lauf++;
      if (lauf >= 4) return true;
    } else lauf = 0;
  }
  return false;
}

/** Die Saetze eines Quelltextes, mit Art und Fundstelle. */
export function satzAusText(t, datei) {
  const funde = [];
  const rel = datei.replace(WURZEL + "/", "");
  if (AUSSCHLUSS_PFAD.test(rel)) return funde;
  for (const { re, art, ausdruck, prosa } of SATZ_MUSTER) {
    re.lastIndex = 0;
    let e;
    while ((e = re.exec(t))) {
      const s = glaetteInterpolation(e[1]);
      if (!istBenutzersprache(s, { gestaltPflicht: !!ausdruck })) continue;
      if (prosa && !prosa(s)) continue;
      if (AUSSCHLUSS_WORT.test(s)) continue;
      funde.push({ s, roh: e[1], art, ausdruck: !!ausdruck, quelle: rel });
    }
  }
  return funde;
}

function sammle(mengen) {
  const funde = new Map();
  const arten = new Map();
  const formen = new Map();
  const rohe = new Map();
  // Kommentare sind nicht die Flaeche. Gemessen 5.11.2026 18:39 MEZ: drei der elf Funde
  // waren Begruendungszeilen im Quelltext (Dashboard.tsx:595, TodayView.tsx:173, Chat.tsx:152),
  // die einen fruehern Befund zitieren — ein Mensch liest sie nirgends. Ein Zaehler, der
  // Zitate aus dem Bau-text fuehrt, meldet Mangel, wo ein Vermerk steht.
  for (const datei of quelltextDateien(mengen)) {
    for (const f of satzAusText(menschenText(datei), datei)) {
      if (!funde.has(f.s)) funde.set(f.s, f.quelle);
      if (!arten.has(f.s)) arten.set(f.s, f.art);
      if (!formen.has(f.s)) formen.set(f.s, f.ausdruck);
      if (!rohe.has(f.s)) rohe.set(f.s, f.roh);
    }
  }
  return { funde, arten, formen, rohe };
}

/** Kandidaten aus dem Quelltext: JSX-Text, Titel, Beschriftung, Platzhalter, Meldung. */
export function kandidatenAusQuelltext(mengen) {
  return sammle(mengen).funde;
}

/** Zu welchem Muster ein Satz gefunden wurde: "rand" (Titel, Platzhalter), "vorleser"
    (aria-label) oder eine der sichtbaren Arten (jsx, wort, literal). */
export function artenAusQuelltext(mengen) {
  return sammle(mengen).arten;
}

/** Eine Interpolation wird zum Platzhalter `N`, weil ein Mensch an der Stelle eine Zahl oder
    ein Wort sieht, nicht die Rechnung. Ohne diese Glaettung warf der Riegel jeden Satz raus,
    der eine Zahl einsetzt -- gemessen 12:38:50 MEZ: 25 Kandidaten, darunter zwei, die die
    Inhaltssperre im ausgelieferten Objekt verlangt. */
export const glaetteInterpolation = (s) => s
  // P107: ein Plural-Anhaengsel ist kein eignes Wort. Gemessen 14:43:42 MEZ am Quelltext:
  // sieben Ketten der Art `${x === 1 ? "" : "s"}` kleben ein Suffix an; wird daraus ein
  // eignes `N`, zaehlt der Wortzaehler einen Wort zu viel, und ein Titel von 14 Woertern
  // rutscht ueber die Kappe -- die Latte fiele ueber eine Zahl, die kein Mensch liest.
  .replace(/\$\{[^{}]*===\s*1\s*\?\s*""\s*:\s*"(?:s|es)"\s*\}/g, (m) => (/"es"/.test(m) ? "es" : "s"))
  .replace(/\$\{[^{}]*\}/g, " N ")
  // P107: ein Satzzeichenklebt an das Zahlwort, weil es im ausgelieferten Text an ihm klebt.
  // Sonst stünde "offset N : the whole list" mit einem eignen Doppelpunkt-Token, und die
  // Code-Kante der Sonde wuerfe den Satz -- gemessen 14:46:25 MEZ, als der Diener-Nenner von
  // 90 auf 89 fiel, genau weil der Liste-Hinweis des Doppelpunkts wegen verschwand.
  .replace(/\sN\s+([:;,.!?)\]])/g, " N$1")
  .replace(/\s+/g, " ")
  .trim();

export function istBenutzersprache(s, optionen = {}) {
  if (s.length < 20) return false;
  const woerter = s.split(/\s+/).filter(Boolean);
  if (woerter.length < 4) return false;
  if (/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+/.test(s)) return false;         // Pfade
  if (/=>|\bif\s*\(|\bfor\s*\(|\breturn\s*\(|\b(?:continue|break);|\.\w+\(|\|\||&&/.test(s)) return false;        // starke Codezeichen
  // P94: `||` und `&&` kamen neu, gemessen 05:47:59 MEZ im Baum -- ein Quelltextausdruck
  // ("b.anzahl - a.anzahl || (a.label ...") lief durch das alte Raster, weil er klein
  // anfing und kein Semikolon trug, und die Strich-Latte traf ihn als "Satz". Eine
  // Verknuepfung ist keine Prosa: kein ausgelieferter Menschensatz nennt sie.
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
  if (/%[sd]|\\n/.test(s)) return false;                               // Formatierer
  // P105: `${` war hier ein Ausschlussgrund. Seit die Interpolation geglttet wird, ist sie
  // eine Zahl im Satz -- und 25 ausgelieferte Saelze waren unsichtbar. Was bleibt, ist die
  // Gestalt: ein Satz, der in einer Expression steht, muss gross anfangen. Sonst sind
  // `className={...}`-Kleider und Pfad-Ketten auch "Saelze".
  if (optionen.gestaltPflicht && !satzgestalt) return false;
  const buchstaben = (s.match(/[A-Za-z]/g) || []).length;
  if (buchstaben / s.length < 0.6) return false;                        // Zahlenkolonnen
  // Drittes Beispiel derselben Sorte, gemessen 05:56:05 MEZ: `y.source ? 1 : x.target` aus
  // KnowledgeGraph.tsx lief durch das alte Raster -- es fuehrt ein Fragezeichen und einen
  // Doppelpunkt als eigne Woerter, und so etwas schreibt keine Flaeche an einen Menschen.
  // Die erste Regung dieser Kante (vier woerterliche Woerter als Minimum) war zu grob: sie
  // vertrieb fuenf echte Saelze -- "Redirect without a target", "Search a note, a query",
  // "e.g. find things faster", "e.g. archive, private, old", "Search (Cmd-K for commands)" --
  // um einen einzigen Ternaer zu treffen. Gemessen 06:04:57 MEZ; zwei Nenner-Latten der
  // Suite (Werkzeug 38, Diener 62) schlugen mich am naechsten Lauf zurecht (06:01:36 MEZ).
  const stuecke = s.split(/\s+/);
  // P105: das blossen `=` ist hier kein Ausschlussgrund mehr. Gemessen 6.11.2026 13:05:11 MEZ
  // am Baum: die Kante vertrieb in der ganzen Flaeche genau einen Satz -- die Graph-Legende
  // "Size = connections · Width = claims", und ein Gleichheitzeichen zwischen zwei Woertern
  // ist eine Legende, keine Zuweisung. Dieser eine Satz war der einzige, der ein Ding beim
  // falschen Namen nannte. Eine Zuweisung bleibt draussen, weil sie klein anfing
  // ("true = delete permanently"), ein Ternaer auch, weil er `?` und `:` als eigne Woerter
  // fuehrt (Biss: tests/punkt7-fachwort-traegt-grund.test.ts, "die Gleichung einer Legende").
  if (stuecke.some((w) => w === "?" || w === "::" || w === ":" || w === "!")) return false;
  if (stuecke.includes("=") && !satzgestalt) return false;
  if (/^(SELECT|INSERT|UPDATE|DELETE|PRAGMA|CREATE|ALTER|DROP|ERROR|TODO|FIXME)/i.test(s)) return false;
  return true;
}

/** Ein Token zaehlt nur als Wort, wenn ein Buchstabe oder eine Ziffer darin steht
    (\p{L}, \p{N}) -- einer aus Zeichen, die keine Sprache schreibt. */
export const WORTZEICHEN = (t) => /[\p{L}\p{N}]/u.test(t);

export function zaehle(s) {
  // Ein Wort traegt ein Wortzeichen. Gemessen 6.11.2026 06:52:17 MEZ: der Zaehler trennte nur
  // an Leerraum, und der Gedankenstrich des Hauses -- wie Pfeil und Punkt in der Legende --
  // stand als eignes Token da. 165 von 348 Flaeche-Saetzen (47,4 %) trugen mindestens eines,
  // 181 an der Zahl, und jeder wurde einen Wort zu lang gemessen. Sieben Saetze standen
  // dadurch auf der falschen Seite der Kappe: der Korpus traegt 280 von 348 (80,5 %) mit dem
  // Strich als Wort, 287 von 348 (82,5 %) ohne.
  const woerter = s.split(/\s+/).filter(WORTZEICHEN);
  const klein = s.toLowerCase();
  const fach = FACHWORTER.filter((w) => new RegExp("\\b" + w + "\\b").test(klein));
  return {
    woerter: woerter.length,
    fach,
    grund: GRUND.test(s),
    handlung: HANDLUNG.test(s),
  };
}

/**
 * Ist dieser Wortlaut in den Bytes des ausgelieferten Bundels zu finden?
 *
 * @param {{puffer: Buffer, textGlatt: string, textEntfl?: string}} suche
 * @param {string} s  der geglaettete Wortlaut, so wie der Census ihn zaehlt und meldet
 * @param {string} [roh]  der Backtick-Inhalt vor jeder Glaettung. Seine
 *   Interpolations-Loecher sind die Stellen, an denen auch das Bundel trennt -- ohne diese
 *   Form gilt die P107-Lesung an " N " weiter (P108, gemessen 15:31:15 MEZ).
 * @returns {boolean}
 */
export function imObjekt(suche, s, roh = null) {
  // Das Buendel ist Bytes, kein Text: ein Satz mit einem echten Gedankenstrich (U+2014) ist in
  // UTF-8 drei Bytes, und ein Suchlauf, der die Datei latin1 liest, findet ihn nie. Ebenso bricht
  // JSX einen langen Menschensatz ueber mehrere Quelltextzeilen, und der Compiler wirft die
  // Umbrueche weg. Darum vier Lesungen, in dieser Reihenfolge: die rohen Bytes, die HTML-
  // entlasteten Bytes, die auf Leerraum zurueckgefuehrte Form gegen eine ebenso zurueckgefuehrte
  // Datei -- und seit P94 die Flucht-entlastete Form.
  // Vierte Lesung, gemessen 05:46:43 MEZ am ausgelieferten 3.2.180: esbuild schreibt den
  // Gedankenstrich im Server-Buendel als \u2014, sechs ASCII-Zeichen. Ohne diese Entlastung
  // verschwindet der Satz aus der Gleichung, und der Diener-Nenner sinkt von 53 auf 51 --
  // die Sonde meldet dann "nicht ausgeliefert" fuer etwas, das ausgeliefert ist.
  if (suche.puffer.includes(Buffer.from(s, "utf8"))) return true;
  const entlastet = s.replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"');
  if (suche.puffer.includes(Buffer.from(entlastet, "utf8"))) return true;
  const glatt = (t) => t.replace(/\s+/g, " ").trim();
  if (suche.textGlatt.includes(glatt(s)) || suche.textGlatt.includes(glatt(entlastet))) return true;
  if (suche.textEntfl && (suche.textEntfl.includes(glatt(s)) || suche.textEntfl.includes(glatt(entlastet)))) return true;
  // P107, die fuenfte Lesung: die zerlegte Kette. Esbuild schreibt
  // `zahl(a) + " notes left out — … keeps the first " + zahl(b)` als drei Stuecke, und
  // kein "N" steht im Bundel als Wort. Gezaehlt 14:37:45 MEZ am ausgelieferten 3.2.186:
  // 145 von 498 Flaeche-Saetzen entgingen genau deshalb, 130 davon sind ausgeliefert.
  // Erkannt wird nur, was in der richtigen Folge steht: die Stuecke werden als
  // geordnete Nah-Suche gebaut, ein Rueckwaerts- oder Querbau gilt nicht. Ein Stueck
  // unter sechs Zeichen (ein Anfuhrungszeichen, ein Wortteil) wird uebergangen, sonst
  // waere die Suche zu billig; findet sich gar kein Stueck, gilt die Abweisung.
  // P108: die Stuecke sind die wahren Bundel-Stuecke, nicht meine Faltung. Gemessen
  // 15:31:15 MEZ am ausgelieferten 3.2.187 --
  //
  //   c.push(`${r(M)} claim${M===1?"":"s"} not drawn — its term is only a note title`)
  //
  // Die Glaettung macht aus "claim" + Suffix das eine Wort "claims"; genau dort trennt das
  // Bundel, und das gefaltete Wort steht nirgends in den Bytes. Wird an der Faltung
  // gesucht, verwirft die Gleichung einen Satz, den das Fenster zeigt (Legende,
  // belege-0611/fenster-187/radien-graph-panel.png). Also: die Rohform der Kette wird an
  // ihren Interpolations-Loechern zerteilt -- ein Loch mit einer Verschachtelung (eine Ebene)
  // zaehlt als ein Loch. Ohne Rohform bleibt die P107-Lesung an " N " gelten.
  const stuecke = (roh !== null
    ? String(roh).split(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g)
    : glatt(s).split(/\bN\b/)
      // P107: die Zahl steht am Rand des Satzes ("… answered N." endet mit ihr). Ein Stutzen
      // nur auf " N " liess das Punktzeichen an ihr kleben, und das Stueck war damit nicht
      // mehr der Wortlaut im Bundel -- gemessen 14:49:07 MEZ fielen genau so die
      // Settings-Meldungen durch, die lang und eindeutig ausgeliefert sind.
  )
    .map((x) => x.trim())
    .filter((x) => x.length >= 6);
  if (stuecke.length === 0) return false;
  const flaeche = [suche.textGlatt, suche.textEntfl || ""].filter(Boolean);
  const entlasteteStuecke = stuecke.map((x) => x.replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"'));
  const steht = (x) => flaeche.some((text) => text.includes(glatt(x)));
  // Ein einziges langes Stueck ist die Kette selbst: "N commitments here end after today — …"
  // hat ausser der Zahl nichts Zerlegtes, und seine Anwesenheit in den Bytes ist der Beweis.
  if (stuecke.length === 1) return steht(stuecke[0]) || steht(entlasteteStuecke[0]);
  const baue = (liste) => liste.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s\\S]{0,220}?");
  const muster = new RegExp(baue(stuecke.map(glatt)) + "|" + baue(entlasteteStuecke.map(glatt)));
  return flaeche.some((text) => muster.test(text));
}

/** Die einzige Vergleichsrichtung der Kappe. Gemessen 6.11.2026 06:45:22 MEZ am Baum: 348
    Flaeche-Saetze, davon 38 mit GENAU 14 Woetern (bei 13 sind es 20, bei 15 nur 9). Dieselbe
    Grundgesamtheit haelt mit `<= 14` bei 80,5 % und faellt mit `< 14` auf 69,5 % -- die Latte
    hing an einem Vergleich, den das Werkzeug nirgends nannte, und die zwei Lesungen desselben
    Laufs zahlten verschieden. Die Schadenregel lautet "ueber 14 Woertern verliert ein Mensch
    den Bezug": genau 14 ist nicht darueber, also traegt es. */
export function traegtKappe(woerter) {
  return woerter <= SATZKAPPE;
}

/** Die Kappe nach Art des Sitzes, als Zahlen -- nicht als eigne Latte. */
const GRUPPEN = { rand: "rand (Titel, Platzhalter)", vorleser: "vorleser (Name fuer den Vorleser)" };
export function kappenZeilen(getragen) {
  const gruppe = (z) => GRUPPEN[z.art] || "sichtbar (Blatt, Meldung, Kopfzeile)";
  const nach = new Map();
  for (const z of getragen) {
    const g = gruppe(z);
    if (!nach.has(g)) nach.set(g, { gruppe: g, n: 0, unter: 0 });
    const e = nach.get(g);
    e.n += 1;
    if (traegtKappe(z.woerter)) e.unter += 1;
  }
  return [...nach.values()];
}

/** Die Hover-Latte, absolut: kein Titel und kein Platzhalter ueber der Kappe. Ein
    Vorlesername ist ausgenommen -- er wird gesprochen, und ein Vorleser ueberschlaegt
    nichts. */
export function randUeberKappe(zeilen) {
  return zeilen.filter((z) => z.art === "rand" && !traegtKappe(z.woerter));
}

/* ---------------------------------------------------------------------------
   Die dritte Lage: das Etikett. Ein Etikett ist kein Satz — Chip, Knopf,
   Schalter-Name, Abschnittszeile. Die Kappe und der Riegel greifen ab 20
   Zeichen, und ein Chip von sieben Zeichen faellt durch beide Masken.

   Gemessen 11:26:06 MEZ am ausgelieferten 3.2.182: "bm25 #", "vector #", "graph #" stehen
   je zweimal im asar, und auf jeder Karte liest ein Mensch "Found via bm25 #2" (Bild:
   Mappe belege-0611/fenster-183-vor/spuren-nur-bm25.png). Ein Etikett hat keinen Raum fuer
   einen Grund, also darf es keine Methode nennen; die Methode gehoert dorthin, wo ein Satz
   sie erklaeren kann.
   --------------------------------------------------------------------------- */

/** Was ein Etikett lang macht: eine Zeile, die ein Knopf, ein Chip oder ein Schalter ist.
    24 Zeichen, weil "Search depth (top-k)" 21 traegt und ein Mensch diese Zeile liest. */
export const ETIKETT_MAX = 24;

/** Die Latte des Etiketts ist absolut: ein Etikett hat keinen Raum fuer einen Grund,
    also nennt es keine Methode. */
export const ETIKETT_LATTE = 0;

/** Die Namen der Verfahren, die kein Mensch kennen muss, um die Flaeche zu benutzen.
    P103 begann mit der Such-Familie (gemessen 9 Stellen); P104 haelt dieselbe Latte fuer die
    Ansichts-Familie des Graphen -- gemessen 12:03:42 MEZ: 2 Etikette, mit der
    Knopf-Argument-Form 12:04:01 MEZ: 4 Stellen. */
export const ALGORITHMEN = [
  "bm25", "fts", "fts5", "tf-idf", "tfidf", "cosine", "knn", "rrf",
  "vector", "vectors", "embedding", "embeddings", "top-k", "retrieval", "hybrid",
  "semantic", "dendrogram", "force",
];
const ALGORITHMEN_RE = new RegExp("\\b(" + ALGORITHMEN.join("|") + ")\\b", "i");
const FACH_RE = new RegExp("\\b(" + FACHWORTER.join("|") + ")\\b", "i");

/** Ein Etikett, oder ein Stueck Quelltext, das sich als eines ausgibt. */
function istEtikett(s) {
  if (!s || s.length > ETIKETT_MAX) return false;
  if (!/[A-Za-z]/.test(s)) return false;
  if (/[{}]/.test(s)) return false; // ein Ausdruck, kein Text
  if (/(===|!==|&&|\|\||=>|\bif\b|\belse\b|\breturn\b|\bcase\b)/.test(s)) return false;
  if (/[?;:]$/.test(s)) return false; // "absage ?"
  if (/^[&|;:]/.test(s)) return false; // "; themen: Record"
  if (/^[a-z][\w$]*\s*[?:=]/.test(s)) return false; // Notation, keine Benennung
  if (/\b(Record|string|number|boolean|null|undefined|true|false)\b/.test(s)) return false;
  return true;
}

/** Die Etikette eines Quelltextes: JSX-Text, Kurzattribute, und die Tupel-Form, in der
    Einstellungen ihre Zeilen halten. */
export function etikettAusText(t, datei) {
  const funde = [];
  const muster = [
    { re: />\s*([^<>\n]{1,60}?)\s*</g, art: "jsx", gruppe: 1 },
    { re: /\b(?:title|placeholder|label|text|message|badge|tag|aria-label)\s*=\s*"([^"\n]{1,60})"/g, art: "rand", gruppe: 1 },
    { re: /\b(?:label|text|message|badge|tag|aria-label)\s*=\s*\{`([^`\n]{1,60})`\}/g, art: "rand", gruppe: 1 },
    { re: /\['[\w$]+',\s*'([^'\n]{1,60})'/g, art: "spur", gruppe: 1 },
    // Die Objektform derselben Zeile: { label: 'Words', ... }. Ohne dieses Muster wäre die
    // eine Benennungsstelle, an der die Einstellungen ihre Spuren halten, unsichtbar.
    { re: /\b(?:label|wort|titel|kopf):\s*'([^'\n]{1,60})'/g, art: "spur", gruppe: 1 },
    { re: /\b(?:label|wort|titel|kopf):\s*"([^"\n]{1,60})"/g, art: "spur", gruppe: 1 },
    // Die vierte Form: ein Knopf, dem sein Wort als letztes Argument gegeben wird --
    // `segment(an, "Force view — …", klick, "Force")`. Ohne dieses Muster bliebe die
    // Ansichts-Schiene des Graphen eine blinde Stelle, genau wie vorher die Karte.
    { re: /,\s*"([A-Za-z][^"\n]{1,24})"\s*\)/g, art: "knopf", gruppe: 1 },
  ];
  for (const { re, art, gruppe } of muster) {
    re.lastIndex = 0;
    let e;
    while ((e = re.exec(t))) {
      // Ein Ausdruck in der Zeile ist keine Sprache: sein Text bleibt, seine Rechnung nicht.
      const s = e[gruppe].replace(/\{[^{}]*\}/g, "").replace(/\s+/g, " ").trim();
      if (!istEtikett(s)) continue;
      funde.push({ s, art, quelle: datei.replace(WURZEL + "/", "") });
    }
  }
  return funde;
}

export function etiketteAusQuelltext(mengen) {
  const funde = [];
  for (const datei of quelltextDateien(mengen)) {
    const rel = datei.replace(WURZEL + "/", "");
    if (AUSSCHLUSS_PFAD.test(rel)) continue;
    for (const f of etikettAusText(menschenText(datei), datei))
      if (!AUSSCHLUSS_WORT.test(f.s)) funde.push(f);
  }
  return funde;
}

export function etikettNenntAlgorithmus(etiketten) {
  return etiketten.filter((f) => ALGORITHMEN_RE.test(f.s));
}

/* ---------------------------------------------------------------------------
   Ein Ding, ein Wort. Die Flaeche hiess dasselbe Ding zwei Mal: "note" auf der
   Karte, "node" im Befehl, im Schalter und in der Legende. Gemessen 12:43:17 MEZ,
   nachdem die Expression-Saetze sichtbar wurden: vier Saetze und vier Etikette
   nannten "nodes" -- die Saetze davon hatte kein Zaehler je gesehen.
   --------------------------------------------------------------------------- */
export const DOPPELNAMEN = [
  { re: /\bnodes?\b/i, falsch: "node", richtig: "note (das Ding) oder dot (der Punkt im Bild)" },
  // Die Einwort-Form, grossgeschrieben. Grund, gemessen 13:19:22 MEZ am Baum: die Zwei-Woerter-
  // Form der Wortlaut-Inventare liess einen einzigen Fallback durch -- `victim?.title || 'Node'`
  // in Dashboard.tsx:1139 malt das Wort allein in eine Toast-Zeile. Grossbuchstabe trifft die
  // Benennung, der kleine bleibt verschont: "command": "node" ist ein Programmname, "node:fs"
  // ein Modulspecifier und "--node-rim" ein Stil-Token, und keiner davon ist ein Klartextname.
  { re: /^Nodes?$/, falsch: "Node", richtig: "Untitled (der Fallback) oder dot/note im Wortlaut" },
];

/** Ein Wortlaut, eine Stelle: die erste Form gewinnt. */
export function einmalNachWortlaut(liste) {
  const gesehen = new Map();
  for (const f of liste) if (!gesehen.has(f.s)) gesehen.set(f.s, f);
  return [...gesehen.values()];
}

/** Saetze und Etikette zusammen: die eine Liste, die ein Mensch auf der Flaeche liest.
    Dedupliziert nach Wortlaut -- ein Etikett, das zugleich ein Satz ist, wird nicht zweimal
    gezaehlt, sonst haelt die Latte eine Grundgesamtheit, die ihre eigne Doppelung zaehlt. */
export function satzAusQuelltextMitEtiketten(mengen = FLAECHE) {
  const liste = [];
  for (const datei of quelltextDateien(mengen)) {
    const t = menschenText(datei);
    for (const f of satzAusText(t, datei)) liste.push({ s: f.s, art: "satz", quelle: f.quelle });
    for (const f of etikettAusText(t, datei)) liste.push(f);
  }
  return einmalNachWortlaut(liste);
}

/* ---------------------------------------------------------------------------
   Die Reichweite der Namens-Latte. Gemessen 6.11.2026 13:08:36 MEZ meldete sie
   "HALTET (0 von 761 Stellen)", und dieselbe Suite warf vier Woerter zurueck, die in
   keinem ihrer Muster standen. Drei Luecken, jede fuer sich gezaehlt:
     - Anweisungsposition: 76 ausgelieferte Wortlaute stehen in einem Backtick ohne
       Klammer herum (`return \`…\``, `cond ? "…" : \`…\``); die Muster sahen nur die
       Formen mit JSX-Klammern und die mit Grossbuchstaben am Anfang.
     - Der Diener und der Boden: die Latte las ausschliesslich FLAECHE. Die server-Lage
       antwortet dem Menschen durch die Tür (90 ihrer Wortlaute waren ausserhalb des
       Gesichts), und `src/mcp-server.ts` gehoert zu keiner der drei Mengen.
     - Ein blosses `=` vertrieb den einen Satz, der die Regel wirklich brach.
   Darum sammelt diese Latte Wortlaute und keine Saetze: jeder String mit mindestens zwei
   Woertern, Kommentare gestrichen, Prompt-Dateien ausgeschlossen (Hausentscheid 5.11.:
   ein Prompt liest ein Modell, kein Mensch). Ein Raster, das Saelze nach ihrem Inhalt
   aussortiert, ist keine Latte, sondern ein Wunsch.
   Die Zwei-Woerter-Form ist eine Messung, keine Gewalt: gemessen 13:13:07 MEZ nennt in der
   ganzen Auslieferung kein einziger Einwort-Wortlaut das Ding beim alten Namen; die
   Funde waren ein Modulspecifier ("node:fs"), ein Programmname ("command": "node") und
   sieben Stil-Token (--node-hi und Geschwister) -- keine davon steht auf einer Flaeche.
   --------------------------------------------------------------------------- */
export const NAMEN_LAGEN = [...FLAECHE, ...DIENER, ...WERKZEUG, "src"].filter((d) => fs.existsSync(path.join(WURZEL, d)));
const WORTLAUT_MUSTER = /"([^"\\\n]{2,300})"|'([^'\\\n]{2,300})'|`([^`\\\n]{2,400})`/g;

/** Die Grundgesamtheit der Namens-Latte. Gemessen am Baum: 2 839 Wortlaute ohne den
    Ketten-Inhalt (13:12:43 MEZ), **2 983** mit ihm -- zweimal gezehrt, 13:21:26 und
    13:31:58 MEZ. Die Latte selbst haelt 0 Funde -- unter die Untergrenze darf ihr Nenner
    nicht fallen, sonst meldet ein leeres Gesicht Sauberkeit. */
export const NAMEN_MINDESTENS = 2500;

/** Jeder Wortlaut eines Quelltextes, der ein Mensch oder ein Modell woertlich liest.
    Ein Backtick frisst seine eignen Anfuehrungszeichen: gemessen 13:20:30 MEZ verschwand
    `victim?.title || 'Node'` hinter der Template-Kette und wurde als "N" geebnet, also ist
    der Inhalt einer jeden Kette ein zweites Mal offen zu legen (eine Tiefe genuegt; tiefer
    schachtelt kein ausgelieferter Wortlaut). */
export function wortlautAusText(t, datei) {
  const funde = [];
  const rel = datei.replace(WURZEL + "/", "");
  if (AUSSCHLUSS_PFAD.test(rel)) return funde;
  const zeile = (index) => t.slice(0, index).split("\n").length;
  const nimm = (text, basis, tiefe) => {
    // Ein frisches Regex je Aufruf: eine geteilte globale Sonde wuerde beim Absteigen in den
    // Ketteninhalt den `lastIndex` des oberen Laufs zuruecksetzen und ihn neu beginnen lassen.
    const muster = new RegExp(WORTLAUT_MUSTER.source, "g");
    let e;
    while ((e = muster.exec(text))) {
      const roh = e[1] ?? e[2] ?? e[3];
      const s = glaetteInterpolation(roh);
      // Zwei Woerter sind die Grundform; ein einzelnes Wort nur, wenn es die Gestalt einer
      // Benennung traegt (grossgeschrieben, bloss Buchstaben). Gemessen 13:19:22 MEZ: diese
      // Form laesst "node" (Programmname), "node:fs" (Specifier) und "--node-rim" (Stil-Token)
      // draussen und holt den einen Einwort-Fallback der Flaeche herein ('Node').
      if (!/\s/.test(s) && !/^[A-Z][A-Za-z]*$/.test(s)) continue;
      funde.push({ s, art: "wortlaut", quelle: `${rel}:${zeile(basis + e.index)}` });
      if (e[3] !== undefined && tiefe < 2) nimm(roh, basis + e.index + 1, tiefe + 1);
    }
  };
  nimm(t, 0, 0);
  return funde;
}

/** Die Liste, ueber die die Namens-Latte laeuft: Saetze, Etikette und jeder Wortlaut,
    an dem ein Mensch vorbeiscrollt oder den ein Modell woertlich zurueckgibt. */
export function wortlautInventar(mengen = NAMEN_LAGEN) {
  const liste = [];
  for (const datei of quelltextDateien(mengen)) {
    const t = menschenText(datei);
    for (const f of wortlautAusText(t, datei)) liste.push(f);
  }
  return einmalNachWortlaut(liste.concat(satzAusQuelltextMitEtiketten(mengen)));
}

export function doppelteNamen(liste) {
  return liste.filter((f) => DOPPELNAMEN.some((d) => d.re.test(f.s)));
}

/** Die breitere Klasse: jedes Etikett, das ein Fachwort nennt. Bericht, keine Latte —
    die drei Ansichts-Namen der Graph-Flaeche stehen als Trio (Force | Tree | Semantic),
    und ein einzelnes Wort zu tauschen waere keine Benennung, sondern ein Rest. */
export function etikettNenntFachwort(etiketten) {
  return etiketten.filter((f) => FACH_RE.test(f.s));
}

/** Die eigne Rechnung des Werkzeugs: die Art-Zeilen muessen auf dieselbe Grundgesamtheit und
    denselben Zaehler kommen wie das Urteil. Ein Census, der sich selbst nicht zusammenaddiert,
    meldet zwei Zahlen aus einem Lauf und fuehrt keine davon. */
export function summenPruefung(zeilen, n, unter) {
  const summe = zeilen.reduce((a, z) => a + z.n, 0);
  const subere = zeilen.reduce((a, z) => a + z.unter, 0);
  if (zeilen.some((z) => !z.gruppe)) return { ok: false, grund: "eine Art-Zeile ohne Namen" };
  if (summe !== n) return { ok: false, grund: `die Art-Zeilen zaehlen ${summe} Saetze, das Urteil ${n}` };
  if (subere !== unter) return { ok: false, grund: `die Art-Zeilen tragen ${subere}, das Urteil ${unter}` };
  return { ok: true, grund: `${summe} Saetze, ${subere} tragen` };
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
    unterKappe: getragen.filter((z) => traegtKappe(z.woerter)).length,
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
  console.log(`    mit hoechstens ${SATZKAPPE} Woertern (genau ${SATZKAPPE} traegt): ${c.unterKappe} (${c.teil(c.unterKappe)})${kappe}`);
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
    suche = {
      puffer,
      textGlatt: puffer.toString("utf8").replace(/\s+/g, " "),
      // Flucht-entlastet: \u2014 und seinesgleichen zurueck in Zeichen, damit ein Satz, der
      // so ausgeliefert wird, nicht als "fehlt" gilt. Gemessen 05:46:43 MEZ: ohne diese
      // Lesung ist die Router-Zeile im Objekt nicht zu finden, mit ihr schon.
      // Zweitens, gemessen 05:56:53 MEZ am ausgelieferten 3.2.180: der Server-Buendel
      // schreibt Umlaute als \xFC (zwei Stellen, Latin-1), nicht als \u00FC. Ohne diese
      // Form bleiben "Keine verschlu\u00e4sselte Nebendatei (Magie fehlt)." und fuenf
      // weitere Werkzeug-Saetze unsichtbar -- dieselbe Sorte Blindheit, zehn Minuten
      // nacheinander, und zum zweiten Mal von mir nicht vorhergesehen.
      textEntfl: puffer
        .toString("utf8")
        .replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/\\x([0-9a-fA-F]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/\s+/g, " "),
    };
    console.log("  Objekt: " + OBJEKT + " (" + puffer.length + " B, als Bytes und in einer leerraum-armen Lesung)");
  } else {
    console.log("  OHNE Objekt-Gleichung (--nur quelltext): die Zahl beschreibt den Baum, nicht die Auslieferung.");
  }

  const baue = (mengen) => {
    const { funde, arten, formen, rohe } = sammle(mengen);
    const zeilen = [];
    for (const [s, quelle] of funde) {
      zeilen.push({ s, quelle, art: arten.get(s) || "literal", ausdruck: formen.get(s) === true, ...zaehle(s), imObjekt: suche ? imObjekt(suche, s, rohe.get(s) ?? null) : null });
    }
    const getragen = suche ? zeilen.filter((z) => z.imObjekt) : zeilen;
    return { zeilen, getragen };
  };

  const flaeche = baue(FLAECHE);
  const werkzeug = baue(WERKZEUG);
  const diener = baue(DIENER);
  console.log(`\n  Kandidaten im Quelltext: Flaeche ${flaeche.zeilen.length}, Werkzeug ${werkzeug.zeilen.length}, Diener ${diener.zeilen.length}`);
  // P105: wie viele davon aus einer Expression kommen -- die Zahl, die vor diesem Schnitt
  // niemand sah, weil kein Muster diese Form hatte und der Riegel `${` verbot.
  const ausdruck = (zeilen) => zeilen.filter((z) => z.ausdruck).length;
  console.log(`  davon aus einer Expression: ${ausdruck(flaeche.zeilen)} von ${flaeche.zeilen.length} Saetzen (Werkzeug ${ausdruck(werkzeug.zeilen)} von ${werkzeug.zeilen.length}, Diener ${ausdruck(diener.zeilen)} von ${diener.zeilen.length})`);
  // P106: dieselbe Frage fuer die Anweisungsform. Vor diesem Schnitt war sie 0, weil kein
  // Muster sie hatte -- gemessen 13:47:24 MEZ: 130 / 11 / 28 Saetze, die ein Mensch liest.
  const anweisung = (zeilen) => zeilen.filter((z) => z.art === "anweisung").length;
  console.log(`  davon aus der Anweisungsform: ${anweisung(flaeche.zeilen)} von ${flaeche.zeilen.length} Saetzen (Werkzeug ${anweisung(werkzeug.zeilen)} von ${werkzeug.zeilen.length}, Diener ${anweisung(diener.zeilen)} von ${diener.zeilen.length})`);
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

  // Die Kappe-Latte gilt dem Corpus als Ganzes. Diese Zeilen sind die Frage dahinter, noch
  // ohne Urteil: wie viel davon ueberhaupt im Blatt steht. Gemessen 05:36:54 MEZ: die
  // laengsten Saetze der Flaeche sind Titel unter dem Zeiger (`title=` im Quelltext),
  // 24 bis 29 Woerter, und ein Hover ist nicht derselbe Lesefall wie ein Satz im Text.
  // Entscheiden, weil die Latte nicht dorthin wandern darf, wo sie am leichtesten haelt:
  // die Art-Zeilen sind Bericht, das Urteil bleibt am ganzen Korpus (06:45:22 MEZ: sichtbar
  // 236 von 286 = 82,5 %, rand 44 von 62 = 71,0 %, ganzer Korpus 80,5 % -- die engste
  // Grundgesamtheit waerer das leichteste Urteil, also bleibt der Nenner der harte).
  const artZeilen = kappenZeilen(flaeche.getragen);
  const kante = flaeche.getragen.filter((z) => z.woerter === SATZKAPPE).length;
  console.log("\n  Die Kappe nach Art des Sitzes (Flaeche, Bericht ohne Latte):");
  for (const z of artZeilen) console.log(`    ${z.gruppe}: ${z.unter} von ${z.n} mit hoechstens ${SATZKAPPE} Woertern = ${(100 * z.unter / Math.max(1, z.n)).toFixed(1)} %`);
  // Das Gewicht des Vergleichs, sichtbar gemacht: ohne die Kante faellt die Latte.
  console.log(`    an der Kante von genau ${SATZKAPPE} Woertern: ${kante} Saetze (${(100 * kante / Math.max(1, flaeche.getragen.length)).toFixed(1)} % des Korpers) — ohne sie traegt der Korpus ${cFlaeche.unterKappe - kante} von ${cFlaeche.n} = ${(100 * (cFlaeche.unterKappe - kante) / Math.max(1, cFlaeche.n)).toFixed(1)} %`);
  const summen = summenPruefung(artZeilen, cFlaeche.n, cFlaeche.unterKappe);
  console.log(`  SELBSTKONTROLLE KAPPE: ${summen.ok ? "HALTET" : "BRICHT"} (${summen.grund})`);
  if (!summen.ok) process.exitCode = 2;

  // Der Abstand zwischen Baum und Objekt, mit Namen. Gemessen 05:57:31 MEZ: drei
  // Werkzeug-Saetze stehen im Baum, nicht im Objekt -- es sind die CLI-Zeilen von
  // `src/core/chatgpt-import.ts`, die der App-Buendel nicht mitnimmt. Eine Zahl, die
  // schweigt, woher ihre Grundgesamtheit kommt, ist keine Grundgesamtheit.
  if (suche) {
    for (const [lage, gruppe] of [["Flaeche", flaeche], ["Werkzeug", werkzeug], ["Diener", diener]]) {
      const getragen = new Set(gruppe.getragen.map((z) => z.s));
      const fehl = gruppe.zeilen.filter((z) => !getragen.has(z.s));
      if (!fehl.length) { console.log(`  ${lage}: alle ${gruppe.zeilen.length} Baum-Saetze sind im Objekt`); continue; }
      console.log(`  ${lage}: ${fehl.length} von ${gruppe.zeilen.length} Baum-Saetzen NICHT im ausgelieferten Objekt`);
      for (const z of fehl) console.log(`      ${z.quelle}  ::  ${z.s.slice(0, 110)}`);
    }
  }

  // Zwei Latten, weil zwei Medien: die Korpus-Latte (Anteil) und die Hover-Latte (absolut,
  // null Titel ueber der Kappe). Der Vorlesername bleibt bei der Korpus-Latte, denn eine
  // gesprochene Laenge ist kein Lesefall. Gemessen 10:01:40 MEZ am Baum: 16 Titel ueber der
  // Kappe, der laengste 32 Woerter.
  const randFehlt = randUeberKappe(flaeche.getragen);
  const randHalten = randFehlt.length === 0;
  console.log(`\n  Titel unter dem Zeiger ueber der Kappe (${randFehlt.length}):`);
  for (const z of randFehlt) console.log(`    ${String(z.woerter).padStart(3)} Woerter  ${z.quelle}  ::  ${z.s.slice(0, 118)}`);
  console.log(`  URTEIL RAND: ${randHalten ? "HALTET" : "FAELLT"} (${randFehlt.length} Titel ueber ${SATZKAPPE} Woettern von ${kappenZeilen(flaeche.getragen).find((x) => x.gruppe === GRUPPEN.rand)?.n ?? 0} Rand-Saetzen; Biss-Kontrolle im Fall)`);

  // Die dritte Lage: das Etikett. Kappe und Riegel sehen Texte ab 20 Zeichen; ein Chip von
  // sieben faellt durch beide Masken, und auf der Flaeche liest ihn doch jeder.
  const etikette = etiketteAusQuelltext(FLAECHE);
  const etikettFehlt = etikettNenntAlgorithmus(etikette);
  const etikettHalten = etikettFehlt.length === 0;
  const fachEtikette = etikettNenntFachwort(etikette);
  console.log(`\n  Etikette, die eine Methode nennen (${etikettFehlt.length}):`);
  for (const f of etikettFehlt) console.log(`    [${f.art}] "${f.s}"  ${f.quelle}`);
  console.log(`  URTEIL ETIKETT: ${etikettHalten ? "HALTET" : "FAELLT"} (${etikettFehlt.length} von ${etikette.length} Etiketten nennen eine Methode, erlaubt ${ETIKETT_LATTE})`);
  // Bericht, keine Latte — die Stellen bleiben sichtbar, statt aus der Liste geloescht zu werden.
  console.log(`  Bericht Etikett-Fachwort: ${fachEtikette.length} Stellen nennen ein Fachwort, davon ${etikettFehlt.length} eine Methode:`);
  for (const f of fachEtikette.filter((x) => !ALGORITHMEN_RE.test(x.s)).slice(0, LISTE))
    console.log(`    [${f.art}] "${f.s}"  ${f.quelle}`);

  // Die vierte Latte: ein Ding, ein Wort. Sie laeuft ueber der Wortlaut-Inventar, weil ein
  // Name keine Satzform braucht -- gemessen 13:08:36 MEZ standen 15 von 15 Funden ausserhalb
  // der alten Liste, und die Latte meldete trotzdem HALTET.
  const lese = wortlautInventar();
  const doppel = doppelteNamen(lese);
  const doppelHalten = doppel.length === 0;
  console.log(`\n  Wortlaute, die ein Ding beim zweiten Namen nennen (${doppel.length}):`);
  for (const f of doppel.slice(0, LISTE)) console.log(`    [${f.art}] "${f.s}"  ${f.quelle}`);
  console.log(`  URTEIL DOPPELNAMEN: ${doppelHalten ? "HALTET" : "FAELLT"} (${doppel.length} von ${lese.length} Wortlauten nennen ein Ding beim zweiten Namen, erlaubt 0 -- Nenner-Untergrenze ${NAMEN_MINDESTENS} -- die Regel: ${DOPPELNAMEN.map((d) => `"${d.falsch}" -> ${d.richtig}`).join(", ")})`);

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

  // P94: der Gedankenstrich des Hauses. Gemessen 05:30:35 MEZ: vier gelieferte Saetze
  // nannten ihren Absatz mit einem nackten Bindestrich ("... machine - no key needed."),
  // und einer war ueberhaupt kein Satz -- ein Quelltextausdruck, den die Sonde als Prosa
  // zaehlte. Der Strich ist keine Zierde: der Census trennt Saetze an ihm, und ein Satz,
  // der als zwei Zaehlungen ankommt, veraendert die Zahl der Flaeche.
  const NACKTER_STRICH = /[A-Za-z,.!?] - [A-Za-z]/;
  const strichFunde = [
    ...flaeche.getragen.map((z) => ({ ...z, lage: "Flaeche" })),
    ...werkzeug.getragen.map((z) => ({ ...z, lage: "Werkzeug" })),
    ...diener.getragen.map((z) => ({ ...z, lage: "Diener" })),
  ].filter((z) => NACKTER_STRICH.test(z.s));
  console.log("\n  Satz mit nacktem Bindestrich statt Gedankenstrich (" + strichFunde.length + "):");
  for (const z of strichFunde) console.log(`    ${z.lage}  ${z.quelle}  ::  ${z.s.slice(0, 130)}`);

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
  const strichHalten = strichFunde.length === 0;
  // Biss-Kontrolle drei: dieselbe Rechnung muss die ALTE Form treffen, sonst ist die Latte
  // ein Wunsch ohne Messzeug.
  const strichBiss = NACKTER_STRICH.test("A local program on this machine - no key needed.");
  const taub = !getroffen || !blind || !strichBiss;
  const urteil = taub ? "TAUB" : kappeHalten && riegelHalten && strichHalten && randHalten && etikettHalten && doppelHalten ? "HALTET" : "FAELLT";
  console.log(`  URTEIL KAPPE: ${kappeHalten ? "HALTET" : "FAELLT"} (Flaeche: Anteil mit hoechstens ${SATZKAPPE} Woertern ${(100 * anteil).toFixed(1)} %, Latte ${100 * UNTER_KAPPE_MINDESTENS} %)`);
  // Die Marge in Saetzen, nicht in Prozent: wie viele der kurzen Saetze lang werden
  // duerfen, bevor die Latte faellt. Gemessen 05:57:31 MEZ: 276 von 345 = genau 80,000 %,
  // die Marge ist 0 -- ein einziger langer Satz kippt das Urteil.
  const marge = Math.floor(cFlaeche.unterKappe - UNTER_KAPPE_MINDESTENS * cFlaeche.n);
  console.log(`  Die Marge der Kappe: ${marge} Saetze Spiel bei ${cFlaeche.unterKappe} von ${cFlaeche.n} (${(100 * anteil).toFixed(3)} % genau)`);
  console.log(`  URTEIL STRICH: ${strichHalten ? "HALTET" : "FAELLT"} (${strichFunde.length} Saetze mit nacktem Bindestrich ueber allen drei Lagen; Biss-Kontrolle ${strichBiss ? "trifft die alte Form" : "FEHLT — die Latte hat kein Messzeug"})`);
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
