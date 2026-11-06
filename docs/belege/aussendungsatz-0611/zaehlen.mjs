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

const absolut = /\b(no|never|none|all|every|only|always|guarantee|keine[nr]?|nie|immer|alle|jeder|nur)\b|(\d[\d., ]*(%|ms|MiB|GiB|notes|queries|of|von))/i;
const zeug = /(tests\/|scripts\/|docs\/belege\/|\.test\.tsx?\b|\.mjs\b|\.py\b|:[0-9]{2,4}\b|`[a-z0-9-]+\.(json|txt|log\.txt|jsonl)`)/i;

const zaehlung = {};
const ohneZeug = [];
for (const f of DATEIEN) {
  const t = fs.readFileSync(path.join(HIER, f), "utf8");
  const satze = t.split(/(?<=[.!?])\s+/).map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s.length > 25);
  const absol = satze.filter((s) => absolut.test(s));
  const mit = absol.filter((s) => zeug.test(s));
  zaehlung[f] = { saetze: satze.length, absolut: absol.length, mit_zeug: mit.length, ohne_zeug: absol.length - mit.length };
  absol.filter((s) => !zeug.test(s)).forEach((s) => ohneZeug.push({ datei: f, satz: s.slice(0, 220) }));
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
  alleSaetze[f] = fs.readFileSync(path.join(HIER, f), "utf8")
    .split(/(?<=[.!?])\s+/).map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s.length > 25);
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
const maschine = /\b(never|always|cannot|is not (read|touched|sent)|no [\w ]{0,40}(ever|travels|leaves|is read)|0 %|100 %)\b|\b(nie|niemals|immer nur|cannot)\b/i;
const pruefbar = {};
for (const f of DATEIEN) {
  const t = fs.readFileSync(path.join(HIER, f), "utf8");
  const absol = t.split(/(?<=[.!?])\s+/).map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s.length > 25 && absolut.test(s));
  pruefbar[f] = { absolut: absol.length, maschinell: absol.filter((s) => maschine.test(s)).length };
}
const summePruefbar = Object.values(pruefbar).reduce((a, z) => a + z.maschinell, 0);

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
say(`Dateien: ${DATEIEN.join(", ")} — getrennt durch Satzende und Leerzeichen, Saetze ueber 25 Zeichen.`);
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
  maschinell_pruefbar: pruefbar, summe_pruefbar: summePruefbar,
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
