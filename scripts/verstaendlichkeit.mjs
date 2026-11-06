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
function sammle(mengen) {
  const funde = new Map();
  const arten = new Map();
  const dateien = [];
  for (const d of mengen) {
    const ordner = path.join(WURZEL, d);
    for (const rel of execFileSync("find", [ordner, "-name", "*.tsx", "-o", "-name", "*.ts"], { encoding: "utf8" }).split("\n")) {
      if (rel.trim()) dateien.push(rel);
    }
  }
  // Jedes Muster traegt seine Art mit: was ein Mensch im Blatt liest (jsx, wort, literal),
  // und was nur am Rand erscheint -- der Titel unter dem Zeiger, der Platzhalter, der
  // Name fuer den Vorleser (rand). Gemessen 05:36:54 MEZ: die drei Chat-Zweige der
  // Rangfolge-Erklaerung stehen als `title=` im Quelltext, 24 bis 29 Woerter lang, und
  // der Census zaehlt sie wie gelesenen Flaechentext. Ob das dieselbe Latte sein darf,
  // ist eine Frage an die Zahl, nicht an den Geschmack -- also zuerst beide Zahlen.
  const muster = [
    { re: /> ([^<{}]{20,400}) </g, art: "jsx" },
    // Der Vorlesername steht vor dem Rand: ein `aria-label` wird voellig gesprochen, ein
    // `title=` malt das Betriebssystem in ein Kaestchen, das beim Zeigerwandern verschwindet.
    // Zwei Medien, zwei Lesefaelle, also zwei Arten (gemessen 10:01:40 MEZ: 16 der 17
    // ueberkappen Rand-Saetze sind Titel, einer ein Vorlesername).
    { re: /\baria-label\s*=\s*"([^"]{20,400})"/g, art: "vorleser" },
    { re: /\b(?:title|placeholder)\s*=\s*"([^"]{20,400})"/g, art: "rand" },
    { re: /\b(?:label|text|message|hinweis|info)\s*=\s*"([^"]{20,400})"/g, art: "wort" },
    { re: /\baria-label\s*=\s*\{`([^`]{20,400})`\}/g, art: "vorleser" },
    { re: /\b(?:title|placeholder)\s*=\s*\{`([^`]{20,400})`\}/g, art: "rand" },
    { re: /\b(?:label|text|message|hinweis|info)\s*=\s*\{`([^`]{20,400})`\}/g, art: "wort" },
    { re: /"([A-Z][^"\\]{20,300}?)"/g, art: "literal" },
    { re: /'([A-Z][^'\\]{20,300}?)'/g, art: "literal" },
  ];
  for (const datei of dateien) {
    // Kommentare sind nicht die Flaeche. Gemessen 5.11.2026 18:39 MEZ: drei der elf Funde
    // waren Begruendungszeilen im Quelltext (Dashboard.tsx:595, TodayView.tsx:173, Chat.tsx:152),
    // die einen fruehern Befund zitieren — ein Mensch liest sie nirgends. Ein Zaehler, der
    // Zitate aus dem Bau-text fuehrt, meldet Mangel, wo ein Vermerk steht.
    const t = fs.readFileSync(datei, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const { re, art } of muster) {
      re.lastIndex = 0;
      let e;
      while ((e = re.exec(t))) {
        const s = e[1].trim();
        if (!istBenutzersprache(s)) continue;
        if (AUSSCHLUSS_PFAD.test(datei.replace(WURZEL + "/", ""))) continue;
        if (AUSSCHLUSS_WORT.test(s)) continue;
        if (!funde.has(s)) funde.set(s, datei.replace(WURZEL + "/", ""));
        if (!arten.has(s)) arten.set(s, art);
      }
    }
  }
  return { funde, arten };
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

export function istBenutzersprache(s) {
  if (s.length < 20) return false;
  const woerter = s.split(/\s+/).filter(Boolean);
  if (woerter.length < 4) return false;
  if (/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+/.test(s)) return false;         // Pfade
  if (/=>|\bif\(|\bfor\(|\.\w+\(|\|\||&&/.test(s)) return false;        // starke Codezeichen
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
  if (/%[sd]|\\n|\$\{/.test(s)) return false;                          // Formatierer
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
  if (stuecke.some((w) => w === "?" || w === ":" || w === "::" || w === "=" || w === "!")) return false;
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

export function imObjekt(suche, s) {
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
  return !!suche.textEntfl && (suche.textEntfl.includes(glatt(s)) || suche.textEntfl.includes(glatt(entlastet)));
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
    const { funde, arten } = sammle(mengen);
    const zeilen = [];
    for (const [s, quelle] of funde) {
      zeilen.push({ s, quelle, art: arten.get(s) || "literal", ...zaehle(s), imObjekt: suche ? imObjekt(suche, s) : null });
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
  const urteil = taub ? "TAUB" : kappeHalten && riegelHalten && strichHalten && randHalten ? "HALTET" : "FAELLT";
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
