/* P128 — der Satzriss des Zensus, in einem Blatt, damit die Suite ihn fahren kann, ohne den
   Zaehler zu laufen. Gemessen 21:19:19 MEZ: 32 von 132 "Saetzen" waren Markdown-Bloecke
   (Aufzaehlungen, Tabellenzeilen, `<summary>`-Kuelsen), laengste Einheit 3 364 Zeichen. Ein Riss,
   der zwei Bulle zusammenzieht, kann ein Messzeug nicht mehr auseinanderhalten. */

/** Satzgrenze: Punkt, Ausruf oder Frage, dann Leerraum. */
const SATZENDE = /(?<=[.!?])\s+/;

/** Was kein Mensch als einen Satz liest. */
const BLOCK = /((^|\s)- \*\*|<\/?(summary|details|p|img|sub|br|table|tr|td|ul|li)\b|\|---\||!\[[^\]]*\]\()/;

const glatt = (s) => s.replace(/\s+/g, " ").trim();

/** Markup, das kein Mensch liest: Fetzung, Zeilen-Anfuehrung, Tabellenrand. */
function leserText(zeile) {
  return zeile
    .replace(/\*\*/g, "")
    .replace(/^\s*\|/, " ")
    .replace(/\|\s*$/, " ")
    .replace(/`/g, "");
}

/**
 * Die Zeile in Leser-Einheiten: erst Bullet fuer Bullet, dann Satz fuer Satz.
 *
 * Getrennt wird nur vor einem Aufzaeicher mit Fett-Etikett (`- **Label**`), und zwar BEVOR das
 * `**` verschwindet — ein nackter Bindestrich mitten im Satz ("die heura - settles under") darf
 * keine Grenze sein; genau dieser Strich war P109s Fund.
 */
function einheitenAusZeile(zeile) {
  const roh = zeile.replace(/<[^>]*>/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
  const segmente = roh.split(/(?:^|\s)-\s+(?=\*\*\S)/).map(glatt).filter((s) => s.length > 0);
  return segmente
    .flatMap((s) => leserText(s).split(SATZENDE).map(glatt))
    .filter((s) => s.length > 25);
}

export function satzeAusMarkdown(text) {
  // Zeile fuer Zeile: ein Bullet ist eine Zeile, eine Tabellenzeile ist eine Zeile, und
  // Markup, das kein Mensch liest, steht vor dem Schnitt draussen. Innerhalb der Zeile
  // trennt weiter nur die Satzgrenze — sonst zerfaellt ein Grund-Satz in Halbsaetze.
  const out = [];
  for (const zeile of text.split("\n")) for (const e of einheitenAusZeile(zeile)) out.push(e);
  return out;
}

export { BLOCK as BLOCKMARKER };
