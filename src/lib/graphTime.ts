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
