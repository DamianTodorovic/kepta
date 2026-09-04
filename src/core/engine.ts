// KEPTA Retrieval-Engine — EIN Suchpfad für UI, HTTP-API und MCP.
// Pipeline: FTS5-BM25 + Vektor-KNN + Entity-Match → RRF-Fusion → Boosts
// (Recency, Konfidenz, Temporal-Abwertung) → Top-k. Ohne Vektoren rein lexikalisch stark.
import type { KeptaStore } from "./store";
import type { MemoryRecord, MemoryType, SearchHit, SearchResult, SearchParams } from "./types";
import { chunkText, embedQuery, cosineSimilarity, DEFAULT_EMBED_MODEL } from "./embeddings";

const RRF_K = 60;
const EXPIRED_FACTOR = 0.5;
const SUPERSEDED_FACTOR = 0.4;
const RECENCY_WINDOW_MS = 365 * 24 * 3600 * 1000;
const RECENCY_MAX_BONUS = 0.15;

// Oblivion (arXiv:2604.00131): Vergessen = Zugänglichkeits-Zerfall, nie Löschung.
// R = 0.2 + 0.8·exp(−Δdays / ((U + F + ε)·T)) mit T = 90 Tage — Floor 0.2, damit
// alte aber relevante Treffer nicht sterben (Relevanz kommt aus BM25/Vektor).
const RETENTION_T_DAYS = 90;
const RETENTION_FLOOR = 0.2;

function retentionFactor(r: { lastAccessAt: number | null; accessCount: number; utility: number }, now: number): number {
  const days = r.lastAccessAt ? (now - r.lastAccessAt) / (24 * 3600 * 1000) : 0;
  const freq = Math.min(r.accessCount, 10);
  const tau = (r.utility + freq + 0.1) * RETENTION_T_DAYS;
  return RETENTION_FLOOR + (1 - RETENTION_FLOOR) * Math.exp(-days / tau);
}

interface ActiveMemory {
  record: MemoryRecord;
  titleLower: string;
  contentLower: string;
}

function loadActive(store: KeptaStore): ActiveMemory[] {
  const out: ActiveMemory[] = [];
  const limit = 500;
  for (let offset = 0; ; offset += limit) {
    const page = store.listMemories({ limit, offset });
    for (const record of page) {
      out.push({
        record,
        titleLower: record.title.toLowerCase(),
        contentLower: record.content.toLowerCase(),
      });
    }
    if (page.length < limit) break;
  }
  return out;
}

function entityMentionsInQuery(store: KeptaStore, queryLower: string): string[] {
  const { entities } = store.getGraph(undefined, 1);
  const mentions: string[] = [];
  for (const e of entities) {
    if (e.name.length >= 3 && queryLower.includes(e.name)) mentions.push(e.name);
  }
  return mentions;
}

/** Berechnet alle Beinheiten und fusioniert via Reciprocal Rank Fusion. */
export async function searchMemories(store: KeptaStore, params: SearchParams): Promise<SearchResult> {
  const query = (params.query || "").trim();
  const limit = Math.min(Math.max(params.limit ?? 10, 1), 100);
  const queryLower = query.toLowerCase();
  const now = Date.now();
  const active = loadActive(store);
  const byId = new Map(active.map((m) => [m.record.id, m]));

  const filters = (m: ActiveMemory): boolean => {
    const r = m.record;
    if (params.type && r.type !== params.type) return false;
    if (params.scope && r.scope !== params.scope) return false;
    if (params.tags && params.tags.length > 0) {
      const tags = params.tags.map((t) => t.toLowerCase());
      if (!tags.every((t) => r.tags.includes(t))) return false;
    }
    if (params.validSince && r.validFrom !== null && r.validFrom < params.validSince) return false;
    return true;
  };

  // --- Bein 1: FTS5-BM25 ---
  const bm25Ranked: string[] = query
    ? store
        .ftsSearch(query, 100)
        .map((h) => h.id)
        .filter((id) => byId.has(id))
    : [];

  // --- Bein 2: Vektor-KNN (nur wenn Embeddings des aktuellen Modells existieren) ---
  let vectorRanked: string[] = [];
  let queryVector: Float32Array | null = null;
  let usedVectors = false;
  const vectorSim = new Map<string, number>();
  if (query) {
    queryVector = await embedQuery(query);
    if (queryVector) {
      // Nur Chunks desselben Embedding-Modells sind vergleichbar — der Query-Vektor
      // entsteht mit DEFAULT_EMBED_MODEL; fremde Modelle würden unsinnige Cosine-Werte
      // liefern. Nach Modellwechsel füllt die Queue (chunksNeedingEmbedding mit
      // Modell-Mismatch) die Lücke, bis dahin läuft die Suche rein lexikalisch.
      const chunks = store.allEmbeddableChunks().filter((c) => c.model === DEFAULT_EMBED_MODEL);
      const bestPerMemory = new Map<string, number>();
      for (const c of chunks) {
        if (!byId.has(c.memoryId)) continue;
        const sim = cosineSimilarity(queryVector, c.embedding);
        const prev = bestPerMemory.get(c.memoryId);
        if (prev === undefined || sim > prev) bestPerMemory.set(c.memoryId, sim);
      }
      if (bestPerMemory.size > 0) {
        usedVectors = true;
        vectorRanked = [...bestPerMemory.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([id]) => id);
        for (const [id, sim] of bestPerMemory) vectorSim.set(id, sim);
      }
    }
  }

  // --- Bein 3: Entity-Match ---
  let entityRanked: string[] = [];
  if (query) {
    const mentions = entityMentionsInQuery(store, queryLower);
    if (mentions.length > 0) {
      const entityIds = mentions
        .map((name) => store.getEntityByName(name)?.id)
        .filter((id): id is number => id !== undefined);
      const memIds = store.memoryIdsForEntities(entityIds);
      entityRanked = [...memIds].filter((id) => byId.has(id));
    }
  }

  // --- RRF-Fusion ---
  const scores = new Map<string, { rrf: number; bm25Rank: number | null; vectorRank: number | null; entityRank: number | null }>();
  const bump = (rankedList: string[], leg: "bm25Rank" | "vectorRank" | "entityRank") => {
    rankedList.forEach((id, idx) => {
      const entry = scores.get(id) ?? { rrf: 0, bm25Rank: null, vectorRank: null, entityRank: null };
      entry.rrf += 1 / (RRF_K + idx + 1);
      if (entry[leg] === null) entry[leg] = idx + 1;
      scores.set(id, entry);
    });
  };
  bump(bm25Ranked, "bm25Rank");
  bump(vectorRanked, "vectorRank");
  bump(entityRanked, "entityRank");

  // Nur Treffer, die mindestens eine Bein getroffen haben; bei leerer Query Recency-Liste
  let candidateIds = [...scores.keys()];
  if (!query) {
    candidateIds = active
      .slice()
      .sort((a, b) => b.record.updatedAt - a.record.updatedAt)
      .map((m) => m.record.id);
  }

  // --- Boosts + Filter + Hits ---
  // Unicode-Klassen: Matched-Terms dürfen auch kyrillisch/CJK sein
  const queryTerms = queryLower
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1);

  const hits: SearchHit[] = [];
  for (const id of candidateIds) {
    const m = byId.get(id);
    if (!m) continue;
    if (query && !filters(m)) continue;
    if (!query && !filters(m)) continue;
    const r = m.record;
    const entry = scores.get(id);

    let score = entry?.rrf ?? 0;
    // Recency-Boost
    const age = Math.max(0, now - r.updatedAt);
    const recencyBonus = Math.max(0, 1 - age / RECENCY_WINDOW_MS) * RECENCY_MAX_BONUS;
    score *= 1 + recencyBonus;
    // Konfidenz-Gewichtung (0.5..1)
    score *= 0.5 + 0.5 * r.confidence;
    // Retention (Oblivion): oft/aktuell Genutztes steigt, Vergessenes sinkt
    score *= retentionFactor(r, now);
    // Temporal
    const expired = r.validTo !== null && r.validTo < now;
    const superseded = r.supersededBy !== null;
    if (expired) score *= EXPIRED_FACTOR;
    if (superseded) score *= SUPERSEDED_FACTOR;

    const matchedTerms = queryTerms.filter((t) => m.titleLower.includes(t) || m.contentLower.includes(t));
    hits.push({
      memory: r,
      score,
      components: {
        bm25Rank: entry?.bm25Rank ?? null,
        vectorRank: entry?.vectorRank ?? null,
        entityRank: entry?.entityRank ?? null,
        vectorSimilarity: vectorSim.get(id) ?? null,
      },
      matchedTerms,
      expired,
      superseded,
    });
  }

  hits.sort((a, b) => b.score - a.score || b.memory.updatedAt - a.memory.updatedAt);
  const top = hits.slice(0, limit);
  // Zugriffs-Statistik für die Retention aktualisieren (fire-and-forget-semantisch, aber sync)
  if (query && top.length > 0) store.recordAccess(top.map((h) => h.memory.id));
  return { hits: top, total: hits.length, query, usedVectors };
}

// ---------- Lifecycle: Chunking + optional Embedding on write ----------

/** Nach create/update aufrufen: zerlegt Content in Chunks; Embedding lauft asynchron via Queue. */
export function indexMemory(store: KeptaStore, memoryId: string): void {
  const record = store.getMemory(memoryId);
  if (!record) return;
  const texts = [`${record.title}\n${record.tags.join(", ")}`, ...chunkText(record.content)];
  store.replaceChunks(memoryId, texts);
}

// ---------- Konsolidierung ----------

export interface ConsolidationCandidate {
  keepId: string;
  duplicateId: string;
  similarity: number;
  reason: "embedding" | "title+tags";
}

export interface ConsolidationResult {
  candidates: ConsolidationCandidate[];
  applied: number;
  dryRun: boolean;
}

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}

/**
 * Findet Dubletten: (a) Embedding-Similarity > threshold, (b) Fallback Titel+Tags-Überlappung.
 * Ohne dryRun werden ältere Memories als ersetzt markiert (supersede), nicht gelöscht.
 */
export async function consolidateMemories(
  store: KeptaStore,
  opts: { dryRun?: boolean; threshold?: number } = {}
): Promise<ConsolidationResult> {
  const threshold = opts.threshold ?? 0.92;
  const dryRun = opts.dryRun ?? true;
  // Nur lebende Memories aufraeumen. Bereits ersetzte liegen als Verlauf da; sie
  // erneut zu vergleichen ist nicht nur ueberfluessig, sondern gefaehrlich:
  // pickKeep bewertet nach updatedAt, und das Ersetzen selbst setzt updatedAt frisch.
  // Eine tote Memory gewann dadurch als "behalten" — und eine lebende Dublette zeigte
  // anschliessend auf sie. Ergebnis: die lebende Notiz auf 40 % heruntergewichtet,
  // mit einem Nachfolger, der selbst ausgemustert ist.
  const active = loadActive(store).filter((m) => !m.record.supersededBy);
  const candidates: ConsolidationCandidate[] = [];

  // Embedding-Dubletten: Centroid pro Memory+Modell vergleichen — Cosine nur zwischen
  // identischen Modellen (Cross-Modell-Vektoren erzeugen Schein-Dubletten).
  const chunks = store.allEmbeddableChunks();
  const centroids = new Map<string, { model: string; vec: Float32Array; count: number }>();
  for (const c of chunks) {
    if (!active.some((m) => m.record.id === c.memoryId)) continue;
    const prev = centroids.get(c.memoryId);
    if (!prev) {
      centroids.set(c.memoryId, { model: c.model, vec: Float32Array.from(c.embedding), count: 1 });
    } else if (prev.model === c.model) {
      const n = prev.count + 1;
      for (let i = 0; i < prev.vec.length; i++) prev.vec[i] = (prev.vec[i]! * prev.count + c.embedding[i]!) / n;
      prev.count = n;
    }
    // Chunk mit anderem Modell als der bisherige Centroid: ignorieren (Queue re-embeddet)
  }
  const centroidList = [...centroids.entries()];
  for (let i = 0; i < centroidList.length; i++) {
    for (let j = i + 1; j < centroidList.length; j++) {
      if (centroidList[i]![1].model !== centroidList[j]![1].model) continue;
      const sim = cosineSimilarity(centroidList[i]![1].vec, centroidList[j]![1].vec);
      if (sim >= threshold) {
        const a = centroidList[i]![0];
        const b = centroidList[j]![0];
        const [keep, dup] = pickKeep(store, a, b);
        candidates.push({ keepId: keep, duplicateId: dup, similarity: sim, reason: "embedding" });
      }
    }
  }

  // Lexikalischer Fallback: Titel-Jaccard + Tag-Überlappung
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i]!.record;
      const b = active[j]!.record;
      const ta = new Set(a.title.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
      const tb = new Set(b.title.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
      if (ta.size === 0 || tb.size === 0) continue;
      let inter = 0;
      for (const w of ta) if (tb.has(w)) inter++;
      const titleSim = inter / Math.min(ta.size, tb.size);
      const tagSim = jaccard(a.tags, b.tags);
      if (titleSim >= 0.85 && (tagSim >= 0.5 || a.tags.length === 0 || b.tags.length === 0)) {
        const pairExists = candidates.some(
          (c) => (c.keepId === a.id && c.duplicateId === b.id) || (c.keepId === b.id && c.duplicateId === a.id)
        );
        if (!pairExists) {
          const [keep, dup] = pickKeep(store, a.id, b.id);
          candidates.push({ keepId: keep, duplicateId: dup, similarity: titleSim, reason: "title+tags" });
        }
      }
    }
  }

  let applied = 0;
  if (!dryRun) {
    for (const c of candidates) {
      // Beide Seiten pruefen: der Nachfolger darf nicht selbst ausgemustert sein,
      // sonst entsteht eine Kette ins Leere.
      const dublette = store.getMemory(c.duplicateId);
      const nachfolger = store.getMemory(c.keepId);
      if (dublette && !dublette.supersededBy && nachfolger && !nachfolger.supersededBy) {
        store.supersedeMemory(c.duplicateId, c.keepId);
        applied++;
      }
    }
  }
  return { candidates, applied, dryRun };
}

function pickKeep(store: KeptaStore, a: string, b: string): [string, string] {
  const ra = store.getMemory(a);
  const rb = store.getMemory(b);
  // Behalte die neuere, längere Memory
  const scoreOf = (r: MemoryRecord | null): number => (r ? r.updatedAt + r.content.length * 1000 : 0);
  return scoreOf(ra) >= scoreOf(rb) ? [a, b] : [b, a];
}

// ---------- Duplikatwarnung beim Speichern ----------

export interface DuplicateWarning {
  existingId: string;
  similarity: number;
}

/** Schnelle Prüfung beim Speichern: ähnelt der neue Inhalt einer bestehenden Memory? */
export async function findDuplicateForNew(
  store: KeptaStore,
  title: string,
  content: string
): Promise<DuplicateWarning | null> {
  const vec = await embedQuery(`${title}\n${content}`);
  if (!vec) return null;
  // Nur Chunks des aktuellen Modells — Query-Vektor und Chunk-Vektor müssen gleiche Räume teilen
  const chunks = store.allEmbeddableChunks().filter((c) => c.model === DEFAULT_EMBED_MODEL);
  const best = new Map<string, number>();
  for (const c of chunks) {
    const sim = cosineSimilarity(vec, c.embedding);
    const prev = best.get(c.memoryId);
    if (prev === undefined || sim > prev) best.set(c.memoryId, sim);
  }
  let bestId: string | null = null;
  let bestSim = 0;
  for (const [id, sim] of best) {
    if (sim > bestSim) {
      bestSim = sim;
      bestId = id;
    }
  }
  return bestId && bestSim >= 0.92 ? { existingId: bestId, similarity: bestSim } : null;
}

export type { MemoryType, SearchHit, SearchResult, SearchParams };
export { DEFAULT_EMBED_MODEL };
