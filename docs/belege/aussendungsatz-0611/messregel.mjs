/* P129 — die drei Messregeln des Zensus in einem Blatt, damit die Suite sie fahren kann, ohne
   den Zaehler zu laufen. Das ist dieselbe Lehre wie P128: ein Test, der ein Skript importiert,
   das beim Import Artefakte auf die Platte schreibt und Meldungen ausgibt, ist kein Test.
   Und dieselbe Gefahr wie P124: ein Fall, der die Regel nachbaut statt importiert, wird bei
   jeder Aenderung der Regel still gruen. */

/** Eine Behauptung, die ein Urteil ueber die Welt traegt — auch Produktcopy. */
export const absolut = /\b(no|never|none|all|every|only|always|guarantee|keine[nr]?|nie|immer|alle|jeder|nur)\b|(\d[\d., ]*(%|ms|MiB|GiB|notes|queries|of|von))/i;

/**
 * Das Messzeug im selben Satz. P129 erweitert den Wortschatz um benannte Konfig-Instrumente:
 * gemessen 21:55:40 MEZ nannten 6 absolute Behauptungen ihr Werkzeug wohl (`vitest.config.ts`
 * mit seinen Schwellen, `electron-builder.json` mit seinen Plattform-Zielen), aber das alte
 * Muster sah nur `tests/`, `scripts/`, `docs/belege/`, `.mjs`, `.py`, eine `:Zeile` und
 * Artefakt-Endungen. Eine Zahl, die unter einem zu engen Wortschatz gemessen wird, ist keine
 * Messung, sondern ein Verdacht.
 */
export const zeug =
  /(tests\/|scripts\/|docs\/belege\/|\.test\.tsx?\b|\.mjs\b|\.py\b|:[0-9]{2,4}\b|\.config\.(ts|mts|js|mjs)\b|electron-builder\.json|`[a-z0-9-]+\.(json|txt|log\.txt|jsonl)`)/i;

/** Die schmalere Klasse: ein Werkzeug koennte den Satz widerlegen. */
export const maschine =
  /\b(never|always|cannot|is not (read|touched|sent)|no [\w ]{0,40}(ever|travels|leaves|is read)|0 %|100 %)\b|\b(nie|niemals|immer nur|cannot)\b/i;
