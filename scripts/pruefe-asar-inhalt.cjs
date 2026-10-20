// Prueft den INHALT eines gebauten app.asar, nicht sein Verhalten.
// Aufruf: node scripts/pruefe-asar-inhalt.cjs <pfad/app.asar> [version]
//
// Grund, dass dieser Pruefer im Repo liegt und nicht auf /tmp: 3.2.16 ist nur getauscht,
// weil er zusaetzte — und bis 20:56 war er der einzige Ort, der die acht Marker kannte.
// `git ls-files scripts` nannte ihn nicht, ein geleerter /tmp-Ordner haette ihn vergessen.
//
// Gezaehlt werden nur String-Literale. Kennungen verbiegt der Minifier: gemessen am
// gebauten Paket von 20:48 traegt es `data-abschnitt` dreimal als ("data-abschnitt":"verbindung"),
// aber `ortZuletzt` (Name einer useRef-Variablen) nullmal. Ein verbotenes Marker in
// Quelltext-Syntax (ortZuletzt="anbieter") kann in einem Bundle also nie erscheinen und
// eine Pruefung darauf nie schlagen — solche Zeilen sind hier bewusst nicht drin.
const fs = require("fs");
const p = process.argv[2];
const version = process.argv[3] || "";
if (!p || !fs.existsSync(p)) {
  console.log("  KEIN ASAR unter", p);
  process.exit(2);
}
const s = fs.readFileSync(p).toString("latin1");
// was drin sein MUSS, und wie oft mindestens.
const erwartet = [
  ["data-abschnitt", 1],
  ["data-quittung", 1],
  ["widerspruch", 1],
  ["this field is not a network yet", 1],
  ["carry a concept but only", 1],
  ["58-note, 45-question", 1],
  ["Configuration saved", 1],
  ["alle=1", 1],
  // 3.2.22, gemessen am ausgelieferten Paket (app.asar 49 060 793 B, mtime 2026-10-18T20:58:45Z):
  // die Regal-Flaeche, ihr Fach mit der einen Regel, die Lebensdauer einer Quittung und ihr
  // Objekt, und die Ladefehler-Flaeche. Zaehlt nur String-Literale — Kennungen verbiegt der Minifier.
  ["graph-regal", 1],
  ["regal-woher-fach", 1],
  [".regal-woher-fach", 1],
  ["min-width:1px", 1],
  ["in two bands", 1],
  ["the three curl test commands", 1],
  ["The server did not answer", 1],
  // 3.2.23 (HEAD 59dabea, gemessen am ausgelieferten Paket: app.asar 49 065 686 B, mtime
  // 2026-10-19T12:05:15Z, gegen das vorige Objekt 49 060 793 B / 2026-10-18T20:58:45Z):
  // die Legende weicht bei schmaler Breite, und ihre Prosa-Zeile ist ein echtes Klassen-Literal
  // in `KnowledgeGraph.tsx:4966` und `src/index.css:1524` — im alten Objekt beide **0** Treffer.
  ["hud-label legende-prosa", 1],
  [".legende-prosa", 1],
  // Kein Marker fuer den Ein-Durchstich-Leseweg (`59dabea`, store.ts): seine einzigen SQL-Literale
  // ("deleted_at IS NULL" / "IS NOT NULL") standen schon im alten Objekt, ein Wort darauf waere
  // eine Pruefung, die nie schlagen kann. Der Weg ist durch seinen Fall gedeckt, nicht durch ein Literal.
  // 3.2.24 (HEAD 9881e79 plus p5-g, die generierte Spalte aus p6-health-2s und p5-i-v2). Gegen das
  // ausgelieferte 3.2.23-Objekt (49 065 686 B, mtime 2026-10-19T12:05:15Z) gemessen: alle sechs
  // Literalen dort **0** Treffer, ebenso das Wort `embedding_hat` selbst.
  ["idx_memory_entities_entity", 1],
  ["idx_chunks_hat_model", 1],
  ["FROM chunks WHERE embedding_hat = 1", 1],
  ["CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END", 1],
  ["idx_memories_deleted_id ON memories(deleted_at, id)", 1],
  ["absolute left-0 right-0 top-0 z-10 h-[3px] pointer-events-none", 1],
  // 3.2.25 (drei Flicken von der Bank, am 20.10. 14:20 angelegt; zwei weitere gingen zurueck,
  // weil ihr eigner Fall rot war). Gegen das installierte 3.2.24-Objekt gezaehlt: alle vier
  // hier genannten Literalen dort **0** Treffer.
  ["x-kepta-teilzeiten", 1],
  ["notes, in three bands", 1],
  [".graph-legende { bottom: 3.25rem", 1],
  ["graph-legende absolute left-3 bottom-3", 1],
  // P4-16 und P4-13 bleiben ohne Marker, nicht aus Bequemlichkeit: P4-16 verwendet dieselben
  // Worte wie die Extraktionszeile aus 3.2.22 ("did not answer (" steht im alten Objekt schon
  // 1 mal), P4-13 nimmt nur einen try/fang weg und schreibt kein neues Literal. Beide haengen
  // an ihren Faellen (je einer, vorher rot gemeldet), nicht an einem Wort.
];
let fehl = 0;
for (const [m, min] of erwartet) {
  const n = s.split(m).length - 1;
  const ok = n >= min;
  if (!ok) fehl++;
  console.log(`  ${ok ? "ok  " : "FEHLT"}  ${String(n).padStart(3)}  ${m}${ok ? "" : `  (erwartet >= ${min})`}`);
}
console.log(`  asar ${fs.statSync(p).size} B, mtime ${fs.statSync(p).mtime.toISOString()}${version ? `, bestellte Version ${version}` : ""}`);
if (fehl) { console.log(`  ${fehl} Pruefung(en) fehlgeschlagen`); process.exit(1); }
console.log("  Inhalt passt.");
