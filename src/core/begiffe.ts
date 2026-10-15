// Begriffe, die in einer Notiz schon dastehen — ohne Modell, ohne Netz, ohne Erfindung.
//
// Warum diese Datei im Kern liegt: `indexMemory` (src/core/engine.ts) ist der eine
// Punkt, den jeder Schreibweg passiert — Scan, REST, Inbox, Import, Vault, Sync, MCP.
// Bis 13.10. hat nur der Vault-Weg und der Agentenkanal Begriffe gesetzt; eine Notiz
// aus dem Rechner-Scan blieb ein Blatt ohne Kante. Auf Damians echtem Bestand
// (14.702 Notizen, gemessen über /api/health) standen damit 30 Begriffe und 5 Kanten,
// und das Kraftfeld legt unverbundene Knoten auf einen Kreis: „nix außer 'nem großen
// Kreis".
//
// Was hier als Begriff gilt, ist nichts, was der Text nicht selbst sagt:
//   1. eine Markdown-Ueberschrift (`## Fristenkontrolle` → `fristenkontrolle`)
//   2. ein Wiki-Link (`[[Q4 Close]]` → `q4 close`)
// Beides steht im Bestand, beides hat niemand gelesen. Gemessen am Export desselben
// Bestands: 5.104 Ueberschriften-Zeilen, davon 51 CSS- oder Code-Zeilen, 1.465 zu kurz
// oder zu lang und 3.588 taugliche), und 372 Wiki-Links.
//
// Zeilen in einem Code-Zaun (` ``` `) zählen nicht: ein `#header { … }` aus einem
// kopierten Stylesheet ist keine Aussage der Notiz über die Welt.
const WIKI_LINK = /\[\[([^[\]]{2,80})\]\]/g;
const UEBERSCHRIFT = /^#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const ZAUN = /^\s*(```|~~~)/;
// #83: ein Begriff ist ein NAME, kein Satz, kein Label und kein Code. Gemessen an
// seiner laufenden Tuer (21.066 Notizen, Fenster 500 Knoten): 133 Namen mit
// Gedankenstrich, 109 mit Schraegstrich (die Stueckel-Titel des Scans,
// „blender_manifest — 1/2"), 92 mit Doppelpunkt, 184 mit vier oder mehr Woertern,
// mittlere Laenge 23,6. Eine Schwarzliste gegen dieses Zeichen-Gemenge laeuft der
// Messung hinterher, deshalb die umgekehrte Regel: nur Buchstaben, Ziffern,
// Leerzeichen, Punkt, Bindestrich, Und und Apostroph — beginnend mit einem
// Buchstaben oder einer Ziffer.
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} .'&-]*$/u;
const MAX_LAENGE = 40;
const MAX_WOERTER = 4;
// „Q4 Close", „Lumen & Co." enden legitimerweise auf einem Punkt („Co." ist eine
// Abkuerzung), „backup laeuft nachts." ist ein Satz. Unterschied: die Länge des
// letzten Stuecks — drei Zeichen oder weniger sind eine Abkuerzung, alles
// laengere ein Prädikat.
const endetAufSatzpunkt = (n: string) =>
  n.endsWith(".") && (n.split(" ").pop() ?? "").replace(/\.$/, "").length > 3;
// Abschnittslabels sind die Form des Papiers, nicht sein Inhalt. Gemessen am
// echten Bestand (14.701 Notizen): `fixed` 76, `tests` 71, `added` 65, `changed`
// 65, `links` 52, `wiki links` 70 Traeger — ueberwiegend Aenderungs- und
// README-Geruest. Exakter Vergleich, kein Teilwort: `fixed in 3.2.1` bleibt.
const RAHMENWORT = new Set([
  "fixed", "added", "changed", "removed", "deprecated", "tests", "links", "wiki links", "wiki-links",
  "usage", "overview", "notes", "todo", "faq", "install", "installation", "setup", "config",
  "configuration", "examples", "example", "roadmap", "changelog", "benchmarks", "deployment",
  "dependencies", "troubleshooting", "license", "contributing", "security", "api", "references",
  "inhalt", "anhang", "quellen",
]);
// Mindestens ein Buchstabe: „14702" ist eine Zahl aus einer Protokollzeile, kein
// Begriff, auch wenn sie durch die Laenge kaeme.
const BUCHSTABE = /\p{L}/u;

const normalisiere = (roh: string): string =>
  roh
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/**
 * Liest die Begriffe einer Notiz aus ihrem eigenen Text.
 * `maksimum` begrenzt die Zahl je Notiz — eine Notiz, die hundert Ueberschriften
 * hat, behauptet nicht hundert Beziehungen; die Kante ist die Aussage, nicht die Liste.
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
