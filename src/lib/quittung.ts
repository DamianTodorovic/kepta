// Quittung — eine Bestaetigung, eine Lebensdauer.
//
// Der Wert liegt in einer eigenen Datei, weil zwei Flaechen dieselbe Geste
// melden: die Einstellungen und der System-Status. Ein Import aus einer
// Komponente in die andere waere ein Ring (Settings baut den System-Status).

/** #26 Regel 1 — EINE Lebensdauer fuer alle persistierenden Quittungen.
 *  Vorher: 2 000 ms Verbindung, 6 000 ms Sicherung, 1 800 ms Auto-learn und
 *  1 800 ms Extraktionsmodell — vier Stellen, drei Zahlen. Eine Bestaetigung, die
 *  verschwindet, bevor der Mensch den Kopf hebt, ist keine.
 *
 *  G-9 (18.10.) zaehlt den Rest derselben Klasse zusammen: 2 000 ms Kopieren in
 *  den Einstellungen, 1 600 ms "Copied" und 2 400 ms "Copying failed" im
 *  System-Status. Vier Zahlen fuer eine Geste — jetzt eine. */
export const QUITTUNG_MS = 6_000;
