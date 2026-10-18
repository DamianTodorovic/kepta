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
