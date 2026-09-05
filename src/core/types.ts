// KEPTA Core — Typen für Storage & Retrieval (React-frei, Node-only)

export type MemoryType = "semantic" | "episodic" | "procedural";
export type MemoryScope = string; // "local" | "user:<id>" | "agent:<id>" | "session:<id>"

export interface MemoryRecord {
  id: string;
  scope: MemoryScope;
  type: MemoryType;
  title: string;
  content: string;
  tags: string[];
  /** 0..1 — wie verlässlich ist diese Erinnerung */
  confidence: number;
  /** Epochen-ms; null = unbegrenzt */
  validFrom: number | null;
  validTo: number | null;
  /** ID der Memory, die diese ersetzt hat (temporale Invalidierung) */
  supersededBy: string | null;
  createdAt: number;
  updatedAt: number;
  /** Papierkorb: Zeitpunkt des Löschens, null = aktiv */
  deletedAt: number | null;
  // --- Retention (Oblivion, arXiv:2604.00131): Vergessen durch Zugänglichkeits-Zerfall ---
  lastAccessAt: number | null;
  accessCount: number;
  /** 0..1 — wird verstärkt, wenn die Memory in Antworten genutzt wird */
  utility: number;
}

export interface MemoryInput {
  id?: string;
  scope?: MemoryScope;
  type?: MemoryType;
  title: string;
  content: string;
  tags?: string[];
  confidence?: number;
  validFrom?: number | null;
  validTo?: number | null;
  createdAt?: number;
  updatedAt?: number;
}

export interface MemoryPatch {
  title?: string;
  content?: string;
  tags?: string[];
  type?: MemoryType;
  scope?: MemoryScope;
  confidence?: number;
  validFrom?: number | null;
  validTo?: number | null;
  supersededBy?: string | null;
  /** Explizit gesetzter Zeitstempel (Import/Resync) statt "jetzt" — nur für interne Pfade */
  updatedAt?: number;
}

export interface ListOptions {
  limit?: number;
  offset?: number;
  type?: MemoryType;
  tag?: string;
  scope?: MemoryScope;
  /** Papierkorb statt aktiver Bestand */
  trash?: boolean;
}

export interface ChunkRecord {
  memoryId: string;
  seq: number;
  text: string;
  embedding: Float32Array | null;
  embeddingModel: string | null;
}

export interface EntityRecord {
  id: number;
  name: string;
}

export interface RelationRecord {
  id: number;
  sourceId: number;
  targetId: number;
  relation: string;
  validFrom: number | null;
  validTo: number | null;
  memoryId: string | null;
}

// ---------- Suche ----------

export interface SearchParams {
  query: string;
  limit?: number;
  tags?: string[];
  type?: MemoryType;
  scope?: MemoryScope;
  /** Nur Memories, die nach diesem Zeitpunkt gültig wurden */
  validSince?: number;
  /** Zeitreise: Suchstand zu diesem Zeitpunkt (Epoch-ms). Ohne Angabe = jetzt. */
  asOf?: number;
  /**
   * Einzelne Retrieval-Beine abschalten — für Ablationsmessungen.
   * Fehlt die Angabe, laufen alle drei. Produktiv wird das nicht gesetzt;
   * es existiert, damit sich belegen lässt, was die Fusion tatsächlich beiträgt.
   */
  tracks?: { bm25?: boolean; vector?: boolean; entity?: boolean };
}

export interface SearchHit {
  memory: MemoryRecord;
  /** Finale Rang-Score nach RRF + Boosts (nicht normalisiert) */
  score: number;
  components: {
    bm25Rank: number | null;
    vectorRank: number | null;
    entityRank: number | null;
    vectorSimilarity: number | null;
  };
  matchedTerms: string[];
  /** Zeitlich abgelaufen (valid_to in der Vergangenheit) — herabgestuft, nicht versteckt */
  expired: boolean;
  /** Wurde durch eine neuere Memory ersetzt */
  superseded: boolean;
}

export interface SearchResult {
  hits: SearchHit[];
  total: number;
  query: string;
  usedVectors: boolean;
}
