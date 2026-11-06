// P118-Vorlauf: exportiert das Fixkorpus aus scripts/eval-corpus.ts in die Kapsel, damit
// die chroma-Stufe auf demselben Stand faehrt wie die sqlite-vec-Stufe (P110) und nicht
// auf einer nachgetippten Abschrift. Die Feldnamen des Korpus sind englisch
// (content/title); der Trace der Konkurrenz-Stufen nennt sie wie in P110: text/titel.
import fs from "node:fs";
import path from "node:path";
import { CORPUS, QUERIES } from "../../../scripts/eval-corpus";

const ziel = process.argv[2];
if (!ziel) throw new Error("Zieldatei fehlt");
const leib = {
  korpus: CORPUS.map((m) => ({ id: m.id, text: m.content, titel: m.title, tags: m.tags })),
  fragen: QUERIES.map((q) => ({ frage: q.query, erwartet: q.relevant, kategorie: q.kategorie })),
};
fs.mkdirSync(path.dirname(path.resolve(ziel)), { recursive: true });
fs.writeFileSync(ziel, JSON.stringify(leib, null, 1) + "\n", "utf8");
console.log(`exportiert: ${leib.korpus.length} Notizen, ${leib.fragen.length} Anfragen nach ${ziel}`);
