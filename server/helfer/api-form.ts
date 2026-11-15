// API-Form der Memories (kompatibel zum v1-Frontend: userId bleibt gesetzt)
import type { MemoryRecord as CoreMemory } from "../../src/core/types";

export interface MemoryRecord {
  id: string;
  userId: string;
  title: string;
  content: string;
  tags: string[];
  type?: string;
  scope?: string;
  confidence?: number;
  validFrom?: number | null;
  validTo?: number | null;
  supersededBy?: string | null;
  deletedAt?: number | null;
  createdAt: number;
  updatedAt: number;
}

export function toApi(r: CoreMemory): MemoryRecord {
  return {
    id: r.id,
    userId: "local",
    title: r.title,
    content: r.content,
    tags: r.tags,
    type: r.type,
    scope: r.scope,
    confidence: r.confidence,
    validFrom: r.validFrom,
    validTo: r.validTo,
    supersededBy: r.supersededBy,
    deletedAt: r.deletedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/**
 * Obergrenze aktiver Knoten. Schuetzt vor davonlaufenden Agenten-Schreibvorgaengen.
 * Ueber KEPTA_MAX_ACTIVE einstellbar; bei jedem Aufruf gelesen, damit ein Betreiber
 * sie ohne Neustart aendern kann.
 */
export function maxActiveMemories(): number {
  const v = Number(process.env.KEPTA_MAX_ACTIVE);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 5000;
}

/**
 * Ein Backup wird nie abgewiesen — sonst verliert jemand beim Wiederherstellen
 * Daten. Wer aber darueber liegt, soll es hier erfahren und nicht erst, wenn das
 * Anlegen der naechsten einzelnen Notiz mit 429 scheitert.
 */
export function grenzHinweis(aktiveKnoten: number): { warning?: string } {
  const max = maxActiveMemories();
  return aktiveKnoten > max
    ? { warning: `${aktiveKnoten} active notes exceed the limit of ${max}. Existing notes stay searchable, but creating new single notes is refused until you delete some.` }
    : {};
}

/** Wie viele Notizen ein Sammelaufruf hoechstens anfassen darf. */
export const MAX_BULK_IDS = 5_000;

/**
 * Seitenweis lesen — die Maße der Liste-Route (`GET /api/memories`).
 *
 * Noetig, weil die Route keinen seitenweisen Leseweg hatte: sie zog bei jedem
 * Aufruf die ganze Wissensbasis durch die Leitung (an Damians Bestand: 14.702
 * Knoten, 30.981.380 Bytes, 9,99 s — gemessen von der Leitung). Dieselbe Bauart
 * wie SUCHE_LIMIT_MIN/STD/MAX im Kern (kepta-core/src/core/mcp.ts:49-51):
 * Zahl mit Einheit, Kappe, die sich melden muss statt zu schneiden.
 *
 * MAX 200 = bei ~2,1 Kilobyte je Knoten gut 420 Kilobyte pro Abriss — die
 * Abnahme-Grenze der Leitung heisst "unter 1 Megabyte je Abruf".
 */
export const SEITE_MIN = 1;
export const SEITE_STD = 100;
export const SEITE_MAX = 200;

/**
 * Die Default-Seitengroesse, bei jedem Aufruf gelesen (wie maxActiveMemories),
 * damit ein Betreiber sie ohne Neustart aendern kann. KEPTA_LIST_SEITE steuert;
 * was keine ganze Zahl zwischen 1 und 200 ist, faellt hoerbar auf 100 zurueck —
 * die Route nennt den Wert in ihrem Hinweis.
 */
export function seiteUmwelt(env: Record<string, string | undefined> = process.env): { groesse: number; unverstanden?: string } {
  const roh = env.KEPTA_LIST_SEITE;
  if (roh === undefined || roh.trim() === "") return { groesse: SEITE_STD };
  const wert = Number(roh);
  if (Number.isInteger(wert) && wert >= SEITE_MIN && wert <= SEITE_MAX) return { groesse: wert };
  return {
    groesse: SEITE_STD,
    unverstanden: `KEPTA_LIST_SEITE="${roh}" is not a whole number from ${SEITE_MIN} to ${SEITE_MAX} — pages of ${SEITE_STD} notes are used.`,
  };
}
