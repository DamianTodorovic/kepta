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
// Ein Begriff braucht Buchstaben und darf keine Programmzeile sein.
const TAUGLICH = /[a-zäöüß]/;
const CODEZEICHEN = /[{};<>]/;
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
// Eine Ueberschrift, die ein Satz ist, benennt nichts. Zwei Zeichen — laenge und
// Aufzaehlung — weil beides im echten Bestand vorkam („Finds Claude Desktop,
// Cursor, VS Code, Gemini CLI and more", 58 Zeichen, drei Kommas).
const SATZ_GRENZE = 48;
const MAX_KOMMAS = 1;

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
    if (n.length < 4 || n.length > SATZ_GRENZE) return;
    if (CODEZEICHEN.test(n) || !TAUGLICH.test(n)) return;
    if (RAHMENWORT.has(n)) return;
    if (n.split(",").length - 1 > MAX_KOMMAS) return;
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
