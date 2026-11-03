// Der Wort-stand, aus dem Fenster-Lauf gezaehlt.
//
// Liest `wortschatz.json` (gemacht von scripts/verstaendlichkeit-im-fenster.mjs) und
// beantwortet die einzige Frage, die Punkt 7 zulaesst: welche Woerter verlangt die
// Flaeche von einem Menschen, und welche davon erklaert sie ihm selbst?
//
// Zwei Kanale zaehlen als Erklaerung, weil beide zum Messobjekt gehoeren:
//   * ein Satz im sichtbaren Leib, der das Wort traegt und laenger ist als acht Woerter
//     (eine Aufzaehlung von Knopfwoertern erklaert nichts),
//   * ein `title`-Text, der das Wort traegt — die Flaeche benutzt title als ihren
//     Erklaerungskanal, und ein Wort, das nur dort steht, ist erklaert.
//
// Aufruf: node scripts/wortschatz-zaehlen.mjs /tmp/kepta-wortschatz-29a/wortschatz.json
import fs from "node:fs";

const ZIEL = process.argv[2] || "/tmp/kepta-wortschatz-29a/wortschatz.json";
const KAPPE = 8;

/**
 * Die Liste ist meine, nicht die der Flaeche: Woerter, die ein Mensch kennen muss,
 * damit ein Etikett ihn weiterbringt. Aufgenommen ist, was ein Laie nicht aus dem
 * Wort selbst versteht — nicht, was kurz ist. Eine Familie (embed, embedding,
 * embeddings) ist ein Eintrag, sonst zaehlt dieselbe Zumutung dreimal; gezaehlt wird
 * an Wortgrenzen, weil "hub" sonst in "GitHub Models" steht.
 */
const TERMINE = [
  ["semantic", /\bsemantic\b/i],
  ["embedding", /\bembed(?:s|ed|ding|dings)?\b/i],
  ["vector", /\bvectors?\b/i],
  ["chunk", /\bchunks?\b/i],
  ["node", /\bnodes?\b/i],
  ["graph", /\bgraphs?\b/i],
  ["entity", /\b(?:entity|entities)\b/i],
  ["concept", /\bconcepts?\b/i],
  ["index", /\b(?:index|indexes|indexed|indexing)\b/i],
  ["MCP", /\bMCP\b/],
  ["token", /\btokens?\b/i],
  ["cache", /\b(?:cache|caches|cached)\b/i],
  ["sync", /\bsync(?:s|ed|ing)?\b|\bsynchron/i],
  ["dossier", /\bdossiers?\b/i],
  ["activity", /\b(?:activity|activities)\b/i],
  ["inbox", /\binboxes?\b/i],
  ["agent", /\bagents?\b/i],
  ["role", /\broles?\b/i],
  ["managed settings", /\bmanaged[\s-]settings\b/i],
  ["keychain", /\bkeychain\b/i],
  ["encryption", /\bencrypt(?:s|ed|ion|ing)?\b/i],
  ["plaintext", /\bplain\s?text\b/i],
  ["recovery key", /\brecovery keys?\b/i],
  ["duplicate", /\bduplicates?\b|\bduplicated\b/i],
  ["projection", /\bprojections?\b/i],
  ["cluster", /\bclusters?\b/i],
  ["hub", /\bhub\b/i],
  ["backlink", /\bbacklinks?\b/i],
  ["RAG", /\bRAG\b/],
  ["LLM", /\bLLMs?\b/],
  ["API", /\bAPIs?\b/],
  ["endpoint", /\bendpoints?\b/i],
  ["workspace", /\bworkspaces?\b/i],
  ["tenant", /\btenants?\b/i],
  ["audit", /\baudits?\b|\bauditing\b/i],
  ["trail", /\btrails?\b/i],
  ["seed", /\bseeds?\b/i],
  ["fold", /\bfold(?:s|ed|ing)?\b/i],
  ["orphan", /\borphans?\b|\borphaned\b/i],
];

const dat = JSON.parse(fs.readFileSync(ZIEL, "utf8"));
const seiten = Object.entries(dat.seiten || {});

const schichten = seiten.map(([name, stand]) => ({
  name,
  body: String(stand.tekst || ""),
  titel: (stand.titel || []).map(String),
}));

// Zwei oder mehr Buchstaben: mit {2,} nach dem Stamm fielen "do", "has", "not" und
// jedes andere kurze Wort raus, und die Kappe von acht Woertern waer eine Kappe von
// acht langen Woertern — eine Zahl, die ihre eigne Sonde verschiebt.
const woerter = (t) => String(t).toLowerCase().match(/[a-z][a-z'-]+/g) || [];
const gesamt = schichten.flatMap((s) => woerter(s.body)).length;
const verschieden = new Set(schichten.flatMap((s) => woerter(s.body)));

/** Ein Satz traegt das Wort, wenn er es nennt und lang genug ist, um etwas zu sagen. */
const saetze = (text) => String(text).split(/[.!?\n]/).map((x) => x.trim()).filter(Boolean);
function erklaert(muster, schicht) {
  const imLeib = saetze(schicht.body).some((x) => muster.test(x) && woerter(x).length > KAPPE);
  const imTitel = schicht.titel.some((x) => muster.test(x) && woerter(x).length > KAPPE);
  return imLeib || imTitel;
}

const zeilen = [];
for (const [wort, muster] of TERMINE) {
  const treffer = schichten.filter((s) => muster.test(s.body) || s.titel.some((x) => muster.test(x)));
  if (treffer.length === 0) continue;
  zeilen.push({ wort, seiten: treffer.map((s) => s.name), erklaert: treffer.some((s) => erklaert(muster, s)) });
}

const offen = zeilen.filter((z) => !z.erklaert);

console.log(`Korpus: ${seiten.length} Schirme, ${gesamt} Woerter, ${verschieden.size} verschiedene`);
console.log(`Terme auf der Flaeche: ${zeilen.length} von ${TERMINE.length} gelisteten`);
console.log(`davon erklaert (Satz im Leib oder title, mehr als ${KAPPE} Woerter): ${zeilen.length - offen.length}`);
console.log(`unerklaert: ${offen.length}`);
if (offen.length) {
  console.log("\nDie Liste, die ein naechster Schnitt abarbeitet:");
  for (const z of offen) console.log(`  ${z.wort}  [${z.seiten.join(", ")}]`);
}
const alleS = schichten.flatMap((s) => saetze(s.body)).filter((x) => woerter(x).length > 0);
const ueber12 = alleS.filter((x) => woerter(x).length > 12).length;
console.log(`\nSaetze: ${alleS.length}, ueber 12 Woerter: ${ueber12} (${((ueber12 / alleS.length) * 100).toFixed(1)} %)`);

fs.writeFileSync(ZIEL.replace(/\.json$/, "") + "-census.json", JSON.stringify({
  version: dat.version,
  schirme: seiten.length,
  woerter: gesamt,
  verschieden: verschieden.size,
  gelistet: TERMINE.length,
  aufFlaeche: zeilen.length,
  erklaert: zeilen.length - offen.length,
  unerklaert: offen.map((z) => z.wort),
  kappe: KAPPE,
  saetze: alleS.length,
  saetze_ueber_12: ueber12,
}, null, 1), "utf8");
console.log("Census: " + ZIEL.replace(/\.json$/, "") + "-census.json");
