// Reine Zusammensetzung der pdf.js-Textitems zu lesbarern Absätzen —
// getrennt vom Browser-Glue, damit sie ohne DOM testbar ist.

export interface PdfTextItemLike {
  str?: string;
  hasEOL?: boolean;
}

/**
 * Items eines pdf.js-Seiteninhalts zu Fließtext zusammenziehen: harte
 * Umbrüche der Seite werden übernommen, Vielfache Leerzeilen entschlackt.
 */
export function itemsZuText(items: readonly PdfTextItemLike[]): string {
  let text = "";
  for (const item of items) {
    if (!item || typeof item.str !== "string") continue;
    text += item.str;
    if (item.hasEOL) text += "\n";
  }
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
