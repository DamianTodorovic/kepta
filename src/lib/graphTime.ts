// Time-slider logic for the knowledge graph — pure, testable functions.
// "Show my knowledge as of X": a note is visible at `at` when it already
// existed back then and (if set) had not yet expired.
import type { Memory } from "../types";

/** Earliest point the note exists: explicit validFrom, else createdAt, else updatedAt. */
function startOf(m: Memory): number | null {
  if (typeof m.validFrom === "number" && m.validFrom > 0) return m.validFrom;
  if (typeof m.createdAt === "number" && m.createdAt > 0) return m.createdAt;
  if (typeof m.updatedAt === "number" && m.updatedAt > 0) return m.updatedAt;
  return null;
}

/**
 * Does the note exist/hold at time `at`?
 * - before its start (createdAt/validFrom) → false (hide the future)
 * - from validTo on (if set) → false (hide the expired)
 * - without any timestamp → true (nothing to hide)
 */
export function existsAt(m: Memory, at: number): boolean {
  const start = startOf(m);
  if (start !== null && at < start) return false;
  if (typeof m.validTo === "number" && m.validTo > 0 && at >= m.validTo) return false;
  return true;
}

/** Time span of all notes for the slider scale (same basis as existsAt). */
export function graphTimeRange(memories: Memory[]): { min: number; max: number } | null {
  const ts: number[] = [];
  for (const m of memories) {
    const s = startOf(m);
    if (s !== null) ts.push(s);
    if (typeof m.validTo === "number" && m.validTo > 0) ts.push(m.validTo);
    if (typeof m.updatedAt === "number" && m.updatedAt > 0) ts.push(m.updatedAt);
  }
  if (ts.length === 0) return null;
  return { min: Math.min(...ts), max: Math.max(...ts) };
}

/**
 * Welche Notizen gab es zu einem Zeitpunkt? Als Menge, damit der Graph pro Bild
 * nicht fuer jede Kante zweimal existsAt rechnen muss.
 *
 * `at === null` heisst "jetzt" — dann gibt es nichts auszublenden und die
 * Funktion liefert null statt einer Menge aller Ids.
 */
export function activeIdsAt(memories: readonly Memory[], at: number | null): Set<string> | null {
  if (at === null) return null;
  const out = new Set<string>();
  for (const m of memories) if (existsAt(m, at)) out.add(m.id);
  return out;
}

/**
 * Strukturknoten (Wurzel, Typ, Konzept, Tag-Gruppe) tragen das Präfix "__".
 * Sie sind kein Datum-tragendes Wissen, sondern das Gerüst, das aus den
 * Notizen entsteht, die es erwähnen — deshalb behandelt die Zeitregel sie
 * neutral. Würde sie wie Notizen gezählt, fielen beim Regler alle Gerüst-
 * kanten weg: genau das graue Gitter ohne Knoten, das der Regler schon
 * einmal im Bild hinterlassen hat.
 */
export const STRUKTUR_PRAEFIX = "__";
export function istStruktur(id: string): boolean {
  return id.startsWith(STRUKTUR_PRAEFIX);
}

/**
 * Gehoert eine Kante in das Bild eines Zeitpunkts?
 *
 * Nur, wenn BEIDE Enden damals schon da waren. Der Zeitregler blendete zuerst
 * nur die Knoten aus — bei "Februar 2023" stand das vollstaendige Kantennetz
 * ohne Knoten im Bild, also die Struktur von Wissen, das es noch gar nicht gab.
 * Ein Gerüst-Ende ist immer dabei; die Notiz-Seite entscheidet.
 */
export function edgeVisibleAt(aktiv: ReadonlySet<string> | null, source: string, target: string): boolean {
  if (aktiv === null) return true;
  const notA = istStruktur(source) ? null : source;
  const notB = istStruktur(target) ? null : target;
  return (notA === null || aktiv.has(notA)) && (notB === null || aktiv.has(notB));
}
