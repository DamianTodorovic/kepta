/* v8 ignore file */
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { itemsZuText, type PdfTextItemLike } from "./pdfItems";

// Worker über Vite-Asset-URL — offline, kein CDN.
GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * PDF-Bytes zu Text extrahieren. Die CMaps kommen offline vom lokalen
 * Server (/cmaps/) — eingebettete Schriften (CID-Fonts) dekodieren sonst
 * zu Glyph-Namen statt Buchstaben.
 */
export async function pdfTextAusBuffer(buffer: ArrayBuffer): Promise<string> {
  const ladeAuftrag = getDocument({
    data: new Uint8Array(buffer),
    cMapUrl: "/cmaps/",
    cMapPacked: true,
  });
  const doc = await ladeAuftrag.promise;
  try {
    const seiten: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const seite = await doc.getPage(i);
      const inhalt = await seite.getTextContent();
      seiten.push(itemsZuText(inhalt.items as PdfTextItemLike[]));
    }
    return seiten.join("\n\n");
  } finally {
    await ladeAuftrag.destroy();
  }
}
