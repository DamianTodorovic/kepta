import { THEMA_LABELS, TRAEGER_LABELS } from "./graphHierarchy";

/**
 * Die vier Ueberschriften des Dossiers — einmal gesetzt, damit Bild und Markdown
 * nie auseinanderlaufen. Sie wohnen in ihrer eigenen Datei, weil
 * `lib/dossier` den Kern und damit Server-Code haelt: ein Import davon in der
 * Flaeche zieht `process` in den Browser und die App bleibt schwarz.
 *
 * „Key points" und „Timeline" sind Alltagssprache, die beiden anderen sind die
 * Woerter der zwei Zeilen aus derselben Quelle wie die Liste.
 */
export const DOSSIER_TITEL = {
  punkte: "Key points",
  zeit: "Timeline",
  anleitungen: THEMA_LABELS.guides,
  papiere: TRAEGER_LABELS.files,
} as const;
