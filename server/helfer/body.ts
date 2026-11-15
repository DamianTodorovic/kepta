// Request-Body mit Fallback: Express 5 liefert req.body als undefined, wenn kein
// Body-Parser gegriffen hat (falscher Content-Type) — vorher war es {}. Der
// Fallback hält die Handler bei 400 statt bei einem TypeError als 500.
import type express from "express";

export function bodyOf<T>(req: express.Request): T {
  return (req.body ?? {}) as T;
}
