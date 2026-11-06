/* Die drei Spuren der Suche, mit einem Namen pro Sache.

   Vorher standen dieselben drei Woerter an vier Stellen im Quelltext: die Karte schrieb
   "bm25 #1", der Chat schrieb "bm25 #1", die Einstellungen nannten die Spur "BM25", und der
   Fenster-Pruefer suchte das Eingabefeld ueber "Track BM25". Ein Etikett ist die einzige
   Sprachstelle, die keinen Grund tragen kann -- es hat keinen Raum dafuer. Also ein Klartext-
   name pro Spur, hier definiert, und ueberall gelesen.

   Die Schluessel bleiben die der Engine (`bm25`, `vektor`, `graph`): sie sind Code, kein
   Mensch liest sie auf der Flaeche. */

export const SPUR_LABELS = {
  bm25: "Words",
  vektor: "Meaning",
  graph: "Graph",
} as const;

export type SpurSchluessel = keyof typeof SPUR_LABELS;

/** So, wie die Flaeche die Spur nennt -- in einem Satz oder einer Kopfzeile. */
export const spurLabel = (schluessel: SpurSchluessel): string => SPUR_LABELS[schluessel];

/** So, wie ein Chip die Spur nennt: klein geschrieben, weil drei Chips eine Reihe bilden. */
export const spurChip = (schluessel: SpurSchluessel): string => SPUR_LABELS[schluessel].toLowerCase();

/** So, wie der Vorleser die Spur nennt: ein Name, den man hoerend versteht. */
export const spurAria = (schluessel: SpurSchluessel): string => `Search track: ${spurChip(schluessel)}`;
