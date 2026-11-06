// P122 — die vier Aussendungstekste nachgezaehlt: wie viel Prozent der absoluten
// Behauptungen nach aussen nennen ein Messzeug?
//
//   node docs/belege/aussendungsatz-0611/zaehlen.mjs
//
// Der Zaehler ist absichtlich simpel und deshalb pruefbar: ein Satz gilt als
// absolute Behauptung, wenn er ein Verallgemeinerungs- oder Verneinungs-Wort
// traegt (no, never, none, all, every, only, always, guarantee, keine, keinen,
// nie, immer, alle, jeder, nur) ODER eine Zahl mit einer Einheit. Er gilt als
// mit Messzeug, wenn im selben Satz ein Pfad zu einem Test, einem Skript, einem
// Artefakt, oder eine Datei:Zeile steht. Beides wird ausgegeben, damit jemand
// widersprechen kann, ohne den Zaehler lesen zu muessen.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const grepp = (args) => String(spawnSync("grep", args, { cwd: HIER, encoding: "utf8" }).stdout ?? "");

const HIER = path.resolve(import.meta.dirname, "../../..");
const AUS = path.resolve(import.meta.dirname);
const DATEIEN = ["README.md", "SECURITY.md", "ROADMAP.md", ".github/release-notes.md"];

// Der Riss lebt in `satz-riss.mjs`, damit die Suite ihn fahren kann, ohne diesen Zaehler
// zu laufen (P128: ein Test, der ein Skript importiert, das beim Import die Platte
// beschreibt, ist kein Test mehr).
import { BLOCKMARKER, satzeAusMarkdown } from "./satz-riss.mjs";
import { absolut, maschine, zeug } from "./messregel.mjs";

// Die drei Regeln leben in `messregel.mjs` (P129), damit die Suite sie fahren kann,


const zaehlung = {};
const ohneZeug = [];
const absoluteErsterPass = {};
const blockFunde = [];
for (const f of DATEIEN) {
  const t = fs.readFileSync(path.join(HIER, f), "utf8");
  const satze = satzeAusMarkdown(t);
  const absol = satze.filter((s) => absolut.test(s));
  const mit = absol.filter((s) => zeug.test(s));
  zaehlung[f] = { saetze: satze.length, absolut: absol.length, mit_zeug: mit.length, ohne_zeug: absol.length - mit.length };
  absoluteErsterPass[f] = absol;
  absol.filter((s) => !zeug.test(s)).forEach((s) => ohneZeug.push({ datei: f, satz: s.slice(0, 220) }));
  // Der Riss wird hier an seinem eignen Ergebnis gemessen: keine Einheit darf noch
  // Block-Struktur tragen, sonst ist die Grundgesamtheit wieder eine Behauptung.
  for (const s of satze) if (BLOCKMARKER.test(s)) blockFunde.push(`${f}: ${s.slice(0, 70)}`);
}
if (blockFunde.length) {
  console.error(`FEHLER: ${blockFunde.length} Einheiten tragen noch Block-Struktur — den Riss hat es\n    nicht erwischt. Erste Fundstelle: ${blockFunde[0]}`);
  process.exitCode = 2;
}

// Zweit Lesung: ein Zeuge darf auch im selben Abschnitt stehen (der Punkt-
// Absatz, die Tabellenzeile, die Aufzaehlung), nicht nur im selben Satz. Die
// erste Lesung war zu eng: sie sah tests/scan/regeln.test.ts nicht, obwohl der
// Satz darueber liegt.
//
// Beide Lesungen teilen sich den Nenner: hier wird derselbe Satz-Fuer-Preis-
// Riss weitergereicht und nur der Abschnitt gesucht, in dem er liegt. Wuerden
// die Saetze pro Abschnitt neu geschnitten, zaehlte die eine Lesung 131 und die
// andere 143 — zwei Zahlen mit verschiedenen Grundgesamtheiten sind kein
// Vergleich, sondern ein Versteckspiel.
const alleSaetze = {};
for (const f of DATEIEN) {
  alleSaetze[f] = satzeAusMarkdown(fs.readFileSync(path.join(HIER, f), "utf8"));
}
const abschnittsZaehlung = {};
for (const f of DATEIEN) {
  const text = fs.readFileSync(path.join(HIER, f), "utf8");
  const abschnitte = text.split(/\n\s*\n/);
  let mitz = 0;
  for (const s of alleSaetze[f]) {
    if (!absolut.test(s)) continue;
    const kern = s.replace(/\\/g, "").slice(0, 60);
    const block = abschnitte.find((b) => b.replace(/\s+/g, " ").includes(kern));
    if (block && zeug.test(block)) mitz++;
  }
  const anz = alleSaetze[f].filter((s) => absolut.test(s)).length;
  abschnittsZaehlung[f] = { absolut: anz, mit_zeug: mitz, ohne_zeug: anz - mitz };
}
const summeAbschnitt = Object.values(abschnittsZaehlung).reduce((a, z) => ({
  absolut: a.absolut + z.absolut, mit_zeug: a.mit_zeug + z.mit_zeug, ohne_zeug: a.ohne_zeug + z.ohne_zeug,
}), { absolut: 0, mit_zeug: 0, ohne_zeug: 0 });

const summe = Object.values(zaehlung).reduce((a, z) => ({
  saetze: a.saetze + z.saetze, absolut: a.absolut + z.absolut, mit_zeug: a.mit_zeug + z.mit_zeug,
  ohne_zeug: a.ohne_zeug + z.ohne_zeug,
}), { saetze: 0, absolut: 0, mit_zeug: 0, ohne_zeug: 0 });

// Der erste Zaehler traegt alles, was ein Verallgemeinerungs-Wort hat — auch
// Produktcopy ("no password to type"). Fuer die Arbeit an der Latte braucht es
// die schmalere Klasse: Saetze, die ein Werkzeug widerlegen koennte.
// Die schmalere Klasse kommt aus derselben Regel-Datei.
const pruefbar = {};
const pruefbarListe = [];
for (const f of DATEIEN) {
  const t = fs.readFileSync(path.join(HIER, f), "utf8");
  const absol = satzeAusMarkdown(t).filter((s) => absolut.test(s));
  const enge = absol.filter((s) => maschine.test(s));
  pruefbar[f] = { absolut: absol.length, maschinell: enge.length };
  // Die Liste, nicht nur ihre Laenge: das Papier verspricht „die 30 stehen als Liste im
  // Artefakt", und ein Artefakt, das nur die Summe kennt, kann die Arbeit nicht weitergeben.
  // Der Marker sagt, ob derselbe Satz schon ein Messzeug nennt oder ob er noch Arbeit ist.
  for (const s of enge) pruefbarListe.push({ datei: f, satz: s.slice(0, 220), zeuge: zeug.test(s) });
}
const summePruefbar = Object.values(pruefbar).reduce((a, z) => a + z.maschinell, 0);
// Kreuzkontrolle, eigne Liste: die erste Zaehlung (Zeile ~31) und diese Klasse (Zeile ~81)
// schneiden die vier Texte in zwei getrennten Schleifen. Waeren die Risse verschieden,
// waeren auch die Klassen verschieden -- gemessen 20:12 MEZ, als eine Abschnitts-Neuteilung
// 143 gegen 131 Saetze stellte. Die Liste muss ausserdem so lang sein wie ihre Summe.
const kreuz = Object.keys(pruefbar).reduce((a, f) => a + absoluteErsterPass[f].filter((s) => maschine.test(s)).length, 0);
if (kreuz !== summePruefbar) {
  console.error(`FEHLER: die schmale Klasse aus dem ersten Satzriss ist ${kreuz}, aus dem zweiten ${summePruefbar} — die Risse sind nicht derselbe`);
  process.exitCode = 2;
}
if (pruefbarListe.length !== summePruefbar) {
  console.error(`FEHLER: die Liste der schmalen Klasse traegt ${pruefbarListe.length} Saetze, ihre Summe sagt ${summePruefbar}`);
  process.exitCode = 2;
}

// Zwei Behauptungen aus der schmalen Klasse, hier auch gleich nachgegriffen.
// Die Bild-Zaehlung traegt beide Kanäle: Markdown-Bilder (`![Text](...)`) und
// `<img alt="...">` — das eine ohne `alt=`-Attribut zu zaehlen war der erste
// Fehler dieses Laufs (12 Markdown-Bilder sahen aus wie 8).
const README = fs.readFileSync(path.join(HIER, "README.md"), "utf8");
const markdownBilder = [...README.matchAll(/!\[([^\]]*)\]\([^)]*\)/g)].map((m) => m[1]);
const imgBilder = [...README.matchAll(/<img[^>]*alt="([^"]+)"/g)].map((m) => m[1]);
const alleBilder = [...markdownBilder, ...imgBilder];
const semanticBilder = alleBilder.filter((a) => /semantic/i.test(a)).length;
const satzKeinBild = /no screenshot of it here yet/.test(README);
// Die Flaechen-Dateien sind hier einzeln benannt, weil eine Sammel-Zahl ueber
// nicht existierende Pfade eine Null vorgaukelt, die nichts sieht.
const FlaechenDateien = [
  "src/components/KnowledgeGraph.tsx", "src/components/GraphRegal.tsx",
  "src/lib/graphLayout.ts", "src/lib/graphSemantik.ts", "src/lib/graphSchema.ts",
  "src/lib/graphHierarchy.ts", "src/lib/graphHerkunft.ts", "src/lib/graphTime.ts",
];
const embeddingFunde = FlaechenDateien.map((f) => {
  const p = path.join(HIER, f);
  if (!fs.existsSync(p)) return { Datei: f, vorhanden: false, funde: null };
  return { Datei: f, vorhanden: true, funde: (fs.readFileSync(p, "utf8").match(/embedding/gi) ?? []).length };
});
const embeddingInDerFlaeche = embeddingFunde.reduce((a, e) => a + (e.funde ?? 0), 0);
const testsMitEmbeddingWort = grepp(["-rl", "-E", "embedding", "tests"]).split("\n").filter(Boolean).length;


const zeilen = [];
const say = (t) => { zeilen.push(t); console.log(t); };
say(`Zeit: ${new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin", hour12: false })} MEZ`);
say(`Dateien: ${DATEIEN.join(", ")} — Einheiten ueber 25 Zeichen.`);
say("Riss: satz-riss.mjs (P128, markdown-fest). Vorher: Satzende + Leerzeichen ueber dem\n" +
  "ganzen Text, wodurch Aufzaehlungen, Tabellenzeilen und `<summary>`-Kuelsen als EIN\n" +
  "Satz zaehlten — 45 Einheiten trugen noch Block-Struktur, gemessen 21:42 MEZ in\n" +
  "  tests/aussendungs-riss.test.ts; die eigne Kontrolle hier meldet 43 unter dem\n" +
  "  zeilenweisen Naivling (21:43 MEZ).");
say("");
say("| Datei | Saetze | absolute | mit Messzeug | ohne Messzeug | Anteil ohne |");
say("|---|---|---|---|---|---|");
for (const [f, z] of Object.entries(zaehlung)) {
  say(`| \`${f}\` | ${z.saetze} | ${z.absolut} | ${z.mit_zeug} | ${z.ohne_zeug} | ${(100 * z.ohne_zeug / Math.max(1, z.absolut)).toFixed(1)} % |`);
}
say(`| **zusammen** | **${summe.saetze}** | **${summe.absolut}** | **${summe.mit_zeug}** | **${summe.ohne_zeug}** | **${(100 * summe.ohne_zeug / summe.absolut).toFixed(1)} %** |`);
say("");
say(`Nenner fuer den Anteil: ${summe.absolut} absolute Behauptungen in ${summe.saetze} Saetzen der vier Texte.`);
say("");
say(`Zweite Lesung — der Zeuge darf im selben Abschnitt stehen (Absatz, Tabelle, Aufzaehlung):`);
say(`| Datei | absolute | mit Messzeug | ohne Messzeug |`);
say(`|---|---|---|---|`);
for (const [f, z] of Object.entries(abschnittsZaehlung)) say(`| \`${f}\` | ${z.absolut} | ${z.mit_zeug} | ${z.ohne_zeug} |`);
say(`| zusammen | ${summeAbschnitt.absolut} | ${summeAbschnitt.mit_zeug} | ${summeAbschnitt.ohne_zeug} |`);
say(`   mit Messzeug im selben Abschnitt: ${summeAbschnitt.mit_zeug} von ${summeAbschnitt.absolut} ` +
  `= ${(100 * summeAbschnitt.mit_zeug / summeAbschnitt.absolut).toFixed(1)} % (gegen ${summe.mit_zeug} von ` +
  `${summe.absolut} = ${(100 * summe.mit_zeug / summe.absolut).toFixed(1)} % in der engen Lesung).`);
say("");
say(`Die schmalere Klasse — Saetze, die ein Werkzeug widerlegen koennte (never/always/cannot/0 %/100 %):`);
for (const [f, z] of Object.entries(pruefbar)) say(`   ${f.padEnd(26)} ${z.maschinell} von ${z.absolut} absoluten`);
say(`   zusammen ${summePruefbar} von ${summe.absolut} — der Rest ist Produktcopy ("no password to type"), keine Behauptung ueber eine Maschine.`);
say(`   Die Liste, in Lesereihenfolge, mit dem Marker „Zeug", wenn derselbe Satz schon ein Messzeug nennt:`);
for (const p of pruefbarListe) say(`   [${p.datei}]${p.zeuge ? " ZEUG" : "     "} ${p.satz}`);
say("");
say(`Zwei von ihnen nachgegriffen, im selben Lauf:`);
say(`   "no screenshot of it here yet" (Semantic-Ansicht): README nennt ${alleBilder.length} Bilder (${markdownBilder.length} in Markdown, ` +
  `${imgBilder.length} als <img alt>), davon ${semanticBilder} mit "Semantic"; der Satz steht ${satzKeinBild ? "noch" : "nicht mehr"} da — ` +
  `${(semanticBilder === 0 && satzKeinBild) ? "haltbar" : "Widerspruch"}.`);
say(`   "no embedding ever travels into the view": ${embeddingFunde.filter((e) => e.vorhanden).length} von ${embeddingFunde.length} ` +
  `benannten Flaechen-Dateien gelesen, zusammen ${embeddingInDerFlaeche} Nennung(en) "embedding"; das Wort liegt in ` +
  `${testsMitEmbeddingWort} Test-Dateien des Repos. Fehlende Dateien: ` +
  `${embeddingFunde.filter((e) => !e.vorhanden).map((e) => e.Datei).join(", ") || "keine"}.`);
say("");
say(`Die ${summe.ohne_zeug} ohne Messzeug, in Lesereihenfolge der Dateien (erste 40):`);
for (const o of ohneZeug.slice(0, 40)) say(`   [${o.datei}] ${o.satz}`);

fs.writeFileSync(path.join(AUS, "zaehlung-0611.json"), JSON.stringify({
  dateien: zaehlung, zusammen: summe, abschnitt: abschnittsZaehlung, zusammen_abschnitt: summeAbschnitt,
  maschinell_pruefbar: pruefbar, summe_pruefbar: summePruefbar, pruefbar_liste: pruefbarListe,
  beweise: {
    bilder_markdown: markdownBilder.length, bilder_img_tag: imgBilder.length,
    bilder_semantic: semanticBilder, readme_sagt_kein_semantic_bild: satzKeinBild,
    flaechen_dateien: embeddingFunde, embedding_in_flaechen_dateien: embeddingInDerFlaeche,
    tests_mit_embedding_wort: testsMitEmbeddingWort,
  },
  ohne_zeug: ohneZeug,
}, null, 1) + "\n");
fs.writeFileSync(path.join(AUS, "zaehlung-0611.log.txt"), zeilen.join("\n") + "\n");
console.log(`\nSpur: ${path.relative(HIER, AUS)}/zaehlung-0611.json + zaehlung-0611.log.txt`);
