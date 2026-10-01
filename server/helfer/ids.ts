// IDs und Scopes — eine Regel für alle Routen (früher sechs kopierte Regexe).
// Fremd-IDs sind Text mit Buchstaben, Ziffern, Strich, Punkt, Unterstrich, Doppelpunkt.

export const ID_MUSTER = /^[\w\-.:]+$/;

/** Fremd-ID pruefen (gleiche Regel wie in den Routen), sonst null. */
export function sanitizeId(v: unknown): string | null {
  if (v === null) return null;
  if (typeof v !== "string") return null;
  return v.length <= 120 && ID_MUSTER.test(v) ? v : null;
}

/** Prüft eine ID aus req.params — inklusive Längen- und Typgrenze. */
export function istGueltigeId(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= 120 && ID_MUSTER.test(v);
}

/** Scope auf eine handhabbare Form bringen: "user", "agent:coder", "session:abc". */
export function sanitizeScope(v: unknown): string | null {
  if (v === null) return null;
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase().replace(/[^\w:.-]/g, "").slice(0, 64);
  return s || null;
}
