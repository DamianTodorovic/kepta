// Begriffe, die in einer Notiz schon dastehen — ohne Modell, ohne Netz, ohne Erfindung.
//
// Zwilling von `kepta-app/src/core/begiffe.ts`. Dieselben Regeln, derselbe Name: der Kern
// ist das Paket, das Claude Desktop und Cursor ziehen, und die App ist das Programm auf dem
// Schreibtisch. Liest nur einer von beiden Begriffe, sieht ein npm-Nutzer einen anderen
// Graphen als ein DMG-Nutzer, obwohl beide denselben Kern meinen. Die Paritaet haelt
// `tests/graph-paritaet.test.ts` am Verhalten, nicht am Text.
//
// Warum die Leseregel an `indexMemory` haengt und nicht an einem Schreibweg:
// `indexMemory` (src/core/engine.ts) ist der eine Punkt, den jeder Weg passiert — Ordner-,
// Tabellen-, Claude- und ChatGPT-Import, Obsidian-Vault, Praxis-Sync, die Agenten-Tuer.
// Begriffe pro Pfad von Hand zu setzen war der alte Zustand und genau der Defekt: was der
// einzelne Pfad nicht mitgab, blieb ein Blatt ohne Kante.
//
// Was hier als Begriff gilt, ist nichts, was der Text nicht selbst sagt:
//   1. eine Markdown-Ueberschrift (`## Fristenkontrolle` → `fristenkontrolle`)
//   2. ein Wiki-Link (`[[Q4 Close]]` → `q4 close`)
// Zeilen in einem Code-Zaun (` ``` `) zaehlen nicht: ein `#header { … }` aus einem
// kopierten Stylesheet ist keine Aussage der Notiz ueber die Welt.
const WIKI_LINK = /\[\[([^[\]]{2,80})\]\]/g;
const UEBERSCHRIFT = /^#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const ZAUN = /^\s*(```|~~~)/;
// Ein Begriff ist ein NAME, kein Satz, kein Label und kein Code. Eine Schwarzliste gegen
// das Zeichen-Gemenge der Scanner-Stueckel ("blender_manifest — 1/2") laeuft der Messung
// hinterher, deshalb die umgekehrte Regel: nur Buchstaben, Ziffern, Leerzeichen, Punkt,
// Bindestrich, Und und Apostroph — beginnend mit einem Buchstaben oder einer Ziffer.
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} .'&-]*$/u;
const MAX_LAENGE = 40;
const MAX_WOERTER = 4;
// "Q4 Close", "Lumen & Co." enden legitimerweise auf einem Punkt ("Co." ist eine
// Abkuerzung), "backup laeuft nachts." ist ein Satz. Unterschied: die Laenge des letzten
// Stuecks — drei Zeichen oder weniger sind eine Abkuerzung, alles laengere ein Praedikat.
const endetAufSatzpunkt = (n: string) =>
  n.endsWith(".") && (n.split(" ").pop() ?? "").replace(/\.$/, "").length > 3;
// Abschnittslabels sind die Form des Papiers, nicht sein Inhalt: Aenderungs- und
// README-Geruest. Exakter Vergleich, kein Teilwort — "fixed in 3.2.1" bleibt Begriff.
const RAHMENWORT = new Set([
  "fixed", "added", "changed", "removed", "deprecated", "tests", "links", "wiki links", "wiki-links",
  "usage", "overview", "notes", "todo", "faq", "install", "installation", "setup", "config",
  "configuration", "examples", "example", "roadmap", "changelog", "benchmarks", "deployment",
  "dependencies", "troubleshooting", "license", "contributing", "security", "api", "references",
  "inhalt", "anhang", "quellen",
]);
// Mindestens ein Buchstabe: "14702" ist eine Zahl aus einer Protokollzeile, kein Begriff.
const BUCHSTABE = /\p{L}/u;

const normalisiere = (roh: string): string =>
  roh
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/**
 * Liest die Begriffe einer Notiz aus ihrem eigenen Text.
 * `maksimum` begrenzt die Zahl je Notiz — eine Notiz, die hundert Ueberschriften hat,
 * behauptet nicht hundert Beziehungen; die Kante ist die Aussage, nicht die Liste.
 */
export function begriffeAusText(text: string, maksimum = 40): string[] {
  if (!text) return [];
  const out: string[] = [];
  const gesehen = new Set<string>();
  let imZaun = false;

  const lege = (kandidat: string): void => {
    if (out.length >= maksimum) return;
    const n = normalisiere(kandidat.split("|")[0] ?? "");
    if (n.length < 4 || n.length > MAX_LAENGE) return;
    if (!NAME.test(n) || !BUCHSTABE.test(n)) return;
    if (n.split(" ").length > MAX_WOERTER) return;
    if (endetAufSatzpunkt(n)) return;
    if (RAHMENWORT.has(n)) return;
    if (gesehen.has(n)) return;
    gesehen.add(n);
    out.push(n);
  };

  for (const zeile of text.split("\n")) {
    if (ZAUN.test(zeile)) {
      imZaun = !imZaun;
      continue;
    }
    if (imZaun) continue;
    const kopf = zeile.match(UEBERSCHRIFT);
    if (kopf) lege(kopf[1] ?? "");
    // Ein Wiki-Link kann mitten im Satz stehen, auch in einer Zeile ohne Ueberschrift.
    for (const m of zeile.matchAll(WIKI_LINK)) if (m[1]) lege(m[1]);
  }

  return out;
}
