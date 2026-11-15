// K3PTA Core — der Wortschatz, mit dem eine Aussage im Netz steht.
//
// Warum diese Datei ein Blatt ist und im Kern liegt: dieselbe Frage — "ist das Wort eines
// Menschen oder eines des Systems?" — wurde bis 29.10. an zwei Stellen beantwortet, vom Kern
// (`store.ts`, setzt die Kanten) und von der Flaeche (`src/lib/graphLayout.ts`, malt sie). Am
// 15.10. 07:54 setzte der Kern „co-mentions", die Menge der Flaeche kannte das Wort nicht, und
// die Linie malte ihr rohes Etikett — drei Zeilen ueber `SYSTEM_WOERTER` in jener Datei
// describe die gegenteilige Absicht. Ein Vergleich der beiden Listen ist eine Wache; **eine
// Liste an einem Ort** ist die Heilung.
//
// Ein Blatt ohne Importe, damit weder SQLite noch ein Serverhaengen an die Bueschel-Flaeche
// kommt, wenn sie dieses Wortverzeichnis liest.

/** Die Woerter, die der Schreibweg selbst vergibt — nicht eine Hand. */
export const SYSTEM_WOERTER = new Set(["mentions", "co-mentions", "related"]);

/** Gilt ein Wort (jede Schreibweise) als eines des Systems? */
export function systemWort(name: unknown): boolean {
  return typeof name === "string" && SYSTEM_WOERTER.has(name.trim().toLowerCase());
}

/**
 * So viele Behauptungen eine Notiz tragen darf. Punkt 126: gemessen am echten Bestand
 * (29.10. 08:19:52, `/api/graph?limit=500`) waren 1 468 von 1 468 Kanten Systemwoerter und
 * keine einzige Aussage hatte ein Wort von einer Hand — es gab keinen Weg, eines zu setzen.
 */
export const BEHAUPTUNGEN_MAX = 20;

/** Eine Aussage, wie eine Hand sie schreibt: wer, was, wen. */
export interface BehauptungEingabe {
  quelle: string;
  ziel: string;
  wort: string;
}
