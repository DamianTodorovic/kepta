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
    ? { warning: `${aktiveKnoten} active nodes exceed the limit of ${max}. Existing notes stay searchable, but creating new single notes is refused until you delete some.` }
    : {};
}

/** Wie viele Notizen ein Sammelaufruf hoechstens anfassen darf. */
export const MAX_BULK_IDS = 5_000;
