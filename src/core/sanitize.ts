// KEPTA Core — Ein Sanitizer für alle Wege.
// Server (HTTP), Store (SQLite) und MCP haben früher je einen kleinen Spiegel
// dieser Regeln gepflegt; zwei davon drifteten auseinander. Seitdem steht hier
// die eine Fassung: was als Notiz in die Wissensbasis geht, kommt durch diese
// Funktionen — egal über welchen Weg.

/** NUL- und Steuerzeichen raus, Länge begrenzen, Ränder säubern. KEIN HTML-Stripping: das Frontend rendert über react-markdown, und heuristisches Strippen zerstört legitime Code-Beispiele. */
export function sanitizeText(input: unknown, maxLen = 50000): string {
  if (typeof input !== "string") return "";
  let s = input.replace(/\0/g, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s.trim();
}

/** Zusätzliche HTML-/Event-Handler-Entschärfung NUR für Roh-HTML-Ingeste (URL-Clipper: fremde HTML-Seiten werden zu Text konvertiert). */
export function sanitizeHtmlText(input: unknown, maxLen = 50000): string {
  let s = sanitizeText(input, maxLen);
  s = s.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  s = s.replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  s = s.replace(/<[^>]*\bon\w+[^>]*>/gi, (m) => m.replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, ""));
  s = s.replace(/javascript:\s*/gi, "");
  return s;
}

/** Titel: wie Text, aber einzeilig und kurz. */
export function sanitizeTitle(input: unknown): string {
  return sanitizeText(input, 200).replace(/[\r\n]+/g, " ").trim();
}

/**
 * Tags: Kleinbuchstaben, begrenzte Zeichenmenge, max. 12 Stück, dedupliziert.
 * (Identisch zur früheren Fassung in store.ts und server.ts — inkl. der
 * Mindestlänge 2 und des Limits 12.)
 */
export function sanitizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const t of input) {
    if (typeof t !== "string") continue;
    const tag = t.toLowerCase().trim().replace(/[^a-z0-9\-_äöüß]/g, "").slice(0, 30);
    if (tag && tag.length >= 2 && out.length < 12) out.push(tag);
  }
  return [...new Set(out)];
}
