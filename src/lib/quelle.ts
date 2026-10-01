// Woher stammt eine Notiz? — Quellen und Chunks aus den bestehenden
// Konventionen gelesen, ohne Schema-Aenderung.
//
// Die Import-Wege vermerken die Quelle im Content (Rechner-Scan haengt
// "\n\n— Source: <pfad>" an, der URL-Clipper stellt "Source: <url>" voran,
// die Inbox schreibt "— Source: inbox <datei> <zeit>"), und mehrteilige
// Imports tragen " — 2/5" im Titel. Diese lib liest genau das aus, damit
// Karten und Vorschau Quellen anzeigen und oeffnen koennen.
import type { Memory } from "../types";

export interface Quelle {
  /** datei = lokale Datei (oeffnbar), url = Weblink, inbox = Inbox-Auto-Import. */
  art: "datei" | "url" | "inbox";
  /** Absoluter Pfad (nur datei). */
  pfad?: string;
  /** URL (nur url). */
  url?: string;
  /** Anzeigename: Dateiname bzw. Hostname. */
  name: string;
  /** Extension ohne Punkt, klein (nur datei): "pdf", "html", … */
  dateiTyp?: string;
}

const SOURCE_ZEILE = /—\s*Source:\s*(\S.*)$/; // erste Zeile mit "— Source: …"
const URL_PRÄFIX = /^Source:\s*(https?:\/\/\S+)/i;

/** Dateiname aus einem Pfad (trennt an / und \). */
export function dateiName(pfad: string): string {
  const teile = pfad.split(/[\\/]/);
  return teile[teile.length - 1] || pfad;
}

function hostVon(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Die Quelle einer Notiz — null, wenn keiner der Import-Wege eine vermerkt
 * hat (z. B. handgetippte Notizen).
 */
export function parseQuelle(m: Pick<Memory, "content" | "tags">): Quelle | null {
  // 1) URL-Clipper: "Source: <url>" am Content-Anfang.
  const urlTreffer = URL_PRÄFIX.exec(m.content);
  if (urlTreffer) {
    const url = urlTreffer[1];
    return { art: "url", url, name: hostVon(url) };
  }

  // 2) Rechner-Scan / Datei-Drop: "— Source: <pfad>" irgendwo im Content.
  const zeile = SOURCE_ZEILE.exec(m.content);
  if (zeile) {
    const wert = zeile[1].trim();
    if (/^inbox\s/.test(wert)) {
      const name = wert.slice("inbox ".length).trim() || "Inbox";
      return { art: "inbox", name };
    }
    const pfad = wert;
    return {
      art: "datei",
      pfad,
      name: dateiName(pfad),
      dateiTyp: (pfad.split(".").pop() || "").toLowerCase(),
    };
  }

  return null;
}

export interface Chunk {
  nr: number;
  von: number;
}

// Der Rechner-Scan schreibt " — 2/5", Datei-Drop und Inbox " — Teil 2/5".
// Ohne das optionale "Teil" fehlte dort das Teil-Abzeichen, und basisTitel
// liess den Suffix stehen.
const CHUNK_SUFFIX = /\s+—\s*(?:Teil\s+)?(\d+)\/(\d+)$/

/** "Gewerbe-Ummeldung — 2/5" -> { nr: 2, von: 5 }; null ohne solche Signatur. */
export function parseChunkTitel(titel: string): Chunk | null {
  const m = CHUNK_SUFFIX.exec(titel);
  if (!m) return null;
  const nr = Number(m[1]);
  const von = Number(m[2]);
  if (!Number.isFinite(nr) || !Number.isFinite(von) || von < 1 || nr < 1 || nr > von) return null;
  return { nr, von };
}

/** Titel ohne Chunk-Suffix — der gemeinsame Name aller Teile einer Datei. */
export function basisTitel(titel: string): string {
  return titel.replace(CHUNK_SUFFIX, "").trim();
}

/**
 * Content fuer die Vorschau: die Quell-Zeile fliegt raus (sie steht als Chip
 * darunter), doppelte Leerzeilen werden entschlackt.
 */
export function inhaltOhneQuelle(content: string): string {
  return content
    .replace(/^\s*Source:\s*\S+.*\n?/i, "")
    .replace(/\n—\s*Source:\s*.*$/, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Eine Quelle dem Nutzer zufuehren: URLs im Browser, Dateien ueber den
 * lokalen Server (OS-Standardprogramm). Inbox-Vermerke sind reine Info.
 */
export async function oeffneQuelle(q: Quelle): Promise<boolean> {
  if (q.art === "url" && q.url) {
    try {
      window.open(q.url, "_blank", "noopener,noreferrer");
      return true;
    } catch {
      return false;
    }
  }
  if (q.art === "datei" && q.pfad) {
    try {
      const res = await fetch("/api/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pfad: q.pfad }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
  return false;
}
