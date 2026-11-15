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

/** Eine Zeile, die einen neuen Block beginnt. */
const BLOCK_ANFANG = /^\s*(-\s|\*\s|#+\s|\||\d+\.\s|<)/;

/**
 * Zeilen zu Bloeschen fuegen. Ein Mensch bricht Zeilen mitten im Satz — die Datei weicht, der
 * Satz nicht. Ohne diesen Schritt zerlegte ein Umbruch die Behauptung in die eine Einheit und
 * ihr Messzeug in die naechste (gemessen 22:13:14 MEZ an SECURITY.md, direkt nachdem dieser
 * Satz bewaffnet war).
 */
function bloesche(text) {
  const out = [];
  let aktuell = [];
  const schliessen = () => {
    if (aktuell.length) out.push(aktuell.join(" "));
    aktuell = [];
  };
  for (const zeile of text.split("\n")) {
    if (!zeile.trim()) {
      schliessen();
      continue;
    }
    if (BLOCK_ANFANG.test(zeile)) {
      schliessen();
      aktuell.push(zeile.trim());
      continue;
    }
    if (aktuell.length === 0) aktuell.push(zeile.trim());
    else aktuell[aktuell.length - 1] += " " + zeile.trim();
  }
  schliessen();
  return out;
}

/**
 * P161 — Zaehne (```-Bloecke) sind kein Lesestoff. Gemessen 11:03 MEZ: 14 Einheiten der vier
 * Texte kamen aus Zaehnen, 2 davon trugen absolut-Woerter (der Mermaid-Plan "all on your
 * machine", der Python-Rest "No cream.") und standen unbewaffnet im Nenner. Kein Mensch liest
 * einen Zaun als Satz; der Riss liest nur, was ein Mensch als Prosa liest. Gekoppelt an
 * Zeilenanfaenge, weil alle 20 Zaun-Zeilen der vier Texte am Spaltenanfang stehen (gemessen).
 */
function ohneZaun(text) {
  const out = [];
  let imZaun = false;
  for (const zeile of text.split("\n")) {
    if (/^```/.test(zeile)) {
      imZaun = !imZaun;
      continue;
    }
    if (!imZaun) out.push(zeile);
  }
  return out.join("\n");
}

export function satzeAusMarkdown(text) {
  // Erst Bloecke (Zeilen, die zusammen gelesen werden), dann Bullet fuer Bullet, dann Satz fuer
  // Satz. Getrennt wird nur vor einem Aufzaeicher mit Fett-Etikett, damit ein nackter
  // Bindestrich mitten im Satz keine Grenze ist — genau P109s Fund.
  const out = [];
  for (const block of bloesche(ohneZaun(text))) for (const e of einheitenAusZeile(block)) out.push(e);
  return out;
}

export { BLOCK as BLOCKMARKER };
