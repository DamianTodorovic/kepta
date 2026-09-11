// Stimmt die Testzahl in den READMEs mit dem echten Lauf ueberein?
//
// tests/doku-zahlen.test.ts prueft die Doku gegen eine STATISCHE Zaehlung —
// die liegt unter der Laufzeitzahl, weil it.each und Schleifen mehr Faelle
// erzeugen, als im Quelltext stehen. So konnten die READMEs "1106 Tests"
// behaupten, waehrend 1183 liefen, ohne dass es auffiel. Dieses Skript laeuft
// am Ende von `npm run test:cov` und vergleicht mit dem Ergebnis des Laufs.
//
// Regel: die Doku darf nie MEHR Tests nennen, als gelaufen sind, und hoechstens
// 3 % darunter liegen. Eine neue Handvoll Tests erzwingt also noch keine
// README-Aenderung — eine veraltete Zahl schon.
import fs from "node:fs";

const ERGEBNIS = "test-results/vitest.json";
const TOLERANZ = 0.03;

if (!fs.existsSync(ERGEBNIS)) {
  console.error(`doku-check: ${ERGEBNIS} fehlt — erst \`npm run test:cov\` laufen lassen.`);
  process.exit(1);
}
const echt = JSON.parse(fs.readFileSync(ERGEBNIS, "utf8")).numTotalTests;
const untergrenze = Math.ceil(echt * (1 - TOLERANZ));
const fehler = [];

for (const datei of ["README.md", "README.de.md"]) {
  const text = fs.readFileSync(datei, "utf8");
  const genannt = [
    ...[...text.matchAll(/\*\*(\d+)\s+(?:tests|Tests)\*\*/g)].map((m) => Number(m[1])),
    ...[...text.matchAll(/tests-(\d+)%20passing/g)].map((m) => Number(m[1])),
    ...[...text.matchAll(/#\s*(\d+)\s+(?:tests|Tests)\b/g)].map((m) => Number(m[1])),
  ];
  if (genannt.length === 0) fehler.push(`${datei}: nennt gar keine Testzahl`);
  for (const zahl of genannt) {
    if (zahl > echt) fehler.push(`${datei}: nennt ${zahl} Tests, gelaufen sind ${echt}`);
    else if (zahl < untergrenze) fehler.push(`${datei}: nennt ${zahl} Tests, gelaufen sind ${echt} — mehr als ${TOLERANZ * 100} % darunter`);
  }
}

if (fehler.length > 0) {
  console.error("doku-check: die Testzahl in der Doku passt nicht zum Lauf:\n  " + fehler.join("\n  "));
  process.exit(1);
}
console.log(`doku-check: ${echt} Tests gelaufen, die READMEs nennen eine passende Zahl.`);
