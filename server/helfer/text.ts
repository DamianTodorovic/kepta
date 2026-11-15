// Text aus Dateien — geteilt vom Rechner-Scan und der Inbox (früher hatte die
// Inbox noch ihre eigene Rohbyte-Schabrasche und produzierte Glyph-Müll).
import path from "path";
import fs from "fs";
import { htmlZuText } from "../../src/core/klassifikation";
import { serverVerzeichnis } from "./pfad";

/**
 * pdf.js wird erst beim ersten PDF geladen — ESM-only-Paket, daher dynamischer Import.
 * PDFs laufen durch pdf.js (mit CMap-Verzeichnis) — die frühere Rohbyte-Schabrasche
 * (Regex auf den Dateiinhalt) lieferte bei PDFs mit eingebetteten Schriften Glyph-
 * Namen ("/uni2219/space/…") und Binärblöcke statt Text. Die CMaps liegen in
 * dist/cmaps (Kopie im Build) bzw. in node_modules (Dev).
 */
type PdfjsMod = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjsCache: PdfjsMod | null = null;
async function ladePdfjs(): Promise<PdfjsMod> {
  if (!pdfjsCache) pdfjsCache = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsCache;
}

export function cMapVerzeichnis(): string {
  const neben = path.join(serverVerzeichnis(), "cmaps");
  if (fs.existsSync(neben)) return neben;
  return path.join(process.cwd(), "node_modules", "pdfjs-dist", "cmaps");
}

async function textAusPdf(datei: string): Promise<string> {
  const { getDocument } = await ladePdfjs();
  // Asynchron gelesen, nie synchron — warum, steht bei textAus.
  const daten = new Uint8Array(await fs.promises.readFile(datei));
  const ladeAuftrag = getDocument({
    data: daten,
    cMapUrl: cMapVerzeichnis() + path.sep,
    cMapPacked: true,
  });
  const doc = await ladeAuftrag.promise;
  try {
    const seiten: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const seite = await doc.getPage(i);
      const inhalt = await seite.getTextContent();
      let text = "";
      for (const item of inhalt.items) {
        if (!("str" in item)) continue;
        text += item.str;
        if ((item as { hasEOL?: boolean }).hasEOL) text += "\n";
      }
      seiten.push(text.trim());
    }
    return seiten.join("\n\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 200000);
  } finally {
    await ladeAuftrag.destroy();
  }
}

export async function textAus(datei: string): Promise<string> {
  const ext = path.extname(datei).toLowerCase();
  if (ext === ".pdf") {
    const text = await textAusPdf(datei);
    if (text) return text;
    // Extraktion leer -> besser ein ehrlicher Hinweis als Binärmüll.
    return "[Text could not be extracted from this PDF — open the original via the source chip]";
  }
  // Nutzerdateien werden nie synchron gelesen. Der Server laeuft im
  // Hauptprozess der App; an 2.10.2 blieb ein synchrones open() auf einer
  // Datei im Schreibtisch- oder Downloads-Ordner haengen und mit ihm der ganze
  // Server — Hauptthread in open(), 0 % CPU, kein Dialog sichtbar.
  // Mutmasslich die macOS-Nachfrage nach dem Ordnerzugriff, die jedes neue,
  // ad hoc signierte Build erneut ausloest.
  const roh = await fs.promises.readFile(datei, "utf-8");
  if (ext === ".html" || ext === ".htm" || ext === ".xml") {
    return htmlZuText(roh).slice(0, 50000);
  }
  return roh.slice(0, 50000);
}

/** Text an Satz-/Absatzgrenzen in Notiz-große Stücke teilen. */
export function inChunks(text: string, groesse = 2000): string[] {
  const out: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + groesse, text.length);
    if (end < text.length) {
      const stueck = text.slice(start, end);
      const bruch = Math.max(stueck.lastIndexOf("\n\n"), stueck.lastIndexOf(". "));
      if (bruch > groesse * 0.55) end = start + bruch + 1;
    }
    const s = text.slice(start, end).trim();
    if (s) out.push(s);
    start = end;
  }
  return out;
}
