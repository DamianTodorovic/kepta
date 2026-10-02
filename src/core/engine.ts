// KEPTA Retrieval-Engine — EIN Suchpfad für UI, HTTP-API und MCP.
// Pipeline: FTS5-BM25 + Vektor-KNN + Entity-Match → RRF-Fusion → Boosts
// (Recency, Konfidenz, Temporal-Abwertung) → Top-k. Ohne Vektoren rein lexikalisch stark.
import type { KeptaStore } from "./store";
import type { MemoryRecord, MemoryType, SearchHit, SearchResult, SearchParams } from "./types";
import { chunkText, embedQuery, cosineSimilarity, ollamaBaseUrl, DEFAULT_EMBED_MODEL } from "./embeddings";
import { erweitereQuery } from "./synonyme";

const RRF_K = 60;
/**
 * Obergrenze fuer die Trefferzahl EINER Suche.
 *
 * Vorher standen hier 100 — und weil die Oberflaeche zusaetzlich bei 20 deckelte,
 * bekam man auf "alles zu diesem Thema" hoechstens zwanzig Karten, ohne Hinweis
 * darauf, dass mehr da waere. Die Grenze existiert weiterhin (eine Antwort muss
 * endlich bleiben), sie liegt nur nicht mehr im Weg. Der MCP-Zugang klemmt sich
 * davon unabhaengig selbst auf 100, damit Agenten-Kontexte nicht volllaufen.
 */
export const MAX_SEARCH_LIMIT = 10_000;
const EXPIRED_FACTOR = 0.5;
const SUPERSEDED_FACTOR = 0.4;
const RECENCY_WINDOW_MS = 365 * 24 * 3600 * 1000;
const RECENCY_MAX_BONUS = 0.15;
/**
 * Das Vektor-Bein ist als KNN gedacht — es lieferte aber ALLE Notizen zurueck,
 * sortiert nach Cosinus. Fuer die Rangfolge fiel das nie auf (der Schwanz landet
 * ohnehin hinten), fuer die Frage "wie viele passen zum Thema?" schon: bei 409
 * Notizen meldete die Suche zu "kanzlei" 409 Treffer, obwohl nur 40 das Wort
 * ueberhaupt enthalten.
 *
 * Gemessen an derselben Datenbank (nomic-embed-text): echte Treffer lagen bei
 * Cosinus 0,75-0,82, alles Uebrige bei 0,48-0,63 — dazwischen eine klare Luecke.
 * Statt einer absoluten Schwelle (die pro Modell anders liegt) gilt ein Band
 * relativ zum besten Treffer: wer nicht annaehernd so aehnlich ist wie der
 * beste, gehoert nicht zum Thema.
 */
const VECTOR_BAND = 0.86;
/**
 * Untergrenze fuer den Fall, dass es zum Thema NICHTS gibt.
 *
 * Das Band allein reicht dort nicht: liegt der beste Treffer selbst schon im
 * Rauschen, haelt ein relatives Band das ganze Rauschen fest — "carbonara"
 * meldete so 267 Treffer in einer Datenbank ohne ein einziges Rezept. Gemessen
 * an derselben Datenbank: ohne echten Bezug lag der BESTE Cosinus bei 0,44-0,48,
 * mit Bezug bei 0,82.
 *
 * Der Wert ist auf den Standard-Embedder kalibriert. Er kann darum hoechstens
 * rein semantische Kandidaten unterdruecken — Wort- und Entity-Treffer laufen
 * ueber eigene Beine und bleiben unberuehrt, die Suche wird also nie blind.
 */
const VECTOR_FLOOR = 0.58;
// F3: Rerank-Boost ist bewusst kleiner als ein Bein-Sprung — die Fusion bleibt Basis
const RERANK_MAX_BOOST = 0.25;

// Oblivion (arXiv:2604.00131): Vergessen = Zugänglichkeits-Zerfall, nie Löschung.
// R = 0.2 + 0.8·exp(−Δdays / ((U + F + ε)·T)) mit T = 90 Tage — Floor 0.2, damit
// alte aber relevante Treffer nicht sterben (Relevanz kommt aus BM25/Vektor).
const RETENTION_T_DAYS = 90;
const RETENTION_FLOOR = 0.2;

// ---------- F3: lokales Reranking (deterministisch, ohne Netz) ----------

/** Leichtes Stemming für de/en: Strippt einmal die häufigste Endung. */
function stemme(w: string): string {
  return w.replace(/(ung|en|er|es|em|e|s|n)$/, "");
}

/**
 * Bewertet (Query, Knoten) direkt: Term-Coverage im Content (Stem-/Präfix-Match),
 * Title-Coverage, exakter Phrase-Treffer und Tag-Treffer — zu einem 0..1-Score.
 * Die RRF-Fusion bleibt die Rang-Basis; dieser Score verschiebt als moderater
 * Boost spürbar relevante Treffer und wird als components.rerankScore offengelegt.
 * null = keine Query (Recency-Liste) — kein Reranking.
 */
export function localRerankScore(
  query: string,
  r: { title: string; content: string; tags: string[] }
): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const terms = q.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1);
  if (terms.length === 0) return null;

  const titleSet = new Set(
    r.title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(stemme)
  );
  const contentSet = new Set(
    r.content.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(stemme)
  );
  const tagSet = new Set(r.tags.map((t) => stemme(t.toLowerCase())));

  let cov = 0;
  for (const t of terms) {
    const st = stemme(t);
    if (contentSet.has(st) || titleSet.has(st)) {
      cov += 1;
    } else if (st.length >= 4 && [...contentSet, ...titleSet].some((d) => d.startsWith(st) || st.startsWith(d))) {
      cov += 0.6;
    }
  }
  const coverage = cov / terms.length;

  let titleCov = 0;
  for (const t of terms) if (titleSet.has(stemme(t))) titleCov += 1;
  titleCov = Math.min(titleCov / terms.length, 1);

  const phraseInContent = r.content.toLowerCase().includes(q);
  const phraseInTitle = r.title.toLowerCase().includes(q);
  const tagHit = terms.some((t) => tagSet.has(stemme(t)));

  const score = coverage * 0.6 + titleCov * 0.2 + (phraseInContent ? 0.15 : 0) + (phraseInTitle ? 0.25 : 0) + (tagHit ? 0.1 : 0);
  return Math.max(0, Math.min(1, score));
}

function retentionFactor(r: { lastAccessAt: number | null; accessCount: number; utility: number }, now: number): number {  const days = r.lastAccessAt ? (now - r.lastAccessAt) / (24 * 3600 * 1000) : 0;
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
  const limit = 5000;
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

// ---------- Such-Cache ----------
// loadActive/allEmbeddableChunks/getGraph sind die teuren Voll-Läufe je Abfrage —
// bei 100k Erinnerungen dominierten sie die Latenz (p95 7,2 s, Record in
// tools/latenz/). Sie cachen jetzt pro Store an der datenGeneration, die per
// Trigger bei JEDER Mutation an memories/chunks/entities/relations steigt —
// jede Schreiboperation (auch direkte DB-Zugriffe wie Importe) invalidiert
// selbst. Verbraucher dürfen die gelieferten Objekte nur lesen, nicht ändern.
export const suchCacheStatistik = { vollaufbauten: 0, deltapatches: 0 };

const aktiverCache = new WeakMap<KeptaStore, { generation: number; aktiv: ActiveMemory[]; byId: Map<string, ActiveMemory> }>();
const deltaRegistriert = new WeakSet<KeptaStore>();

/**
 * Meldet den Such-Cache am Store an: Jede Memory-Mutation wird als Delta
 * in den bestehenden Cache gepatcht (anstatt den Volllauf zu erzwingen).
 * Der Generation-Trigger bleibt das Sicherheitsnetz für Wege ohne Meldung
 * (Roh-SQL, Importe) — dann erkennt der Generation-Vergleich den Verfall
 * und baut voll neu.
 */
function registriereDelta(store: KeptaStore): void {
  if (deltaRegistriert.has(store)) return;
  deltaRegistriert.add(store);
  store.onMemorieAenderung((id) => {
    let eintrag = aktiverCache.get(store);
    if (!eintrag) {
      // Warmer Start: nur wenn DIESE Zeile die einzige aktive ist (Datenbank war
      // leer), beginnt der Cache hier und wächst mit jedem Write — der erste
      // Suchlauf zahlt dann keinen Volllauf. Bei vorgefüllter DB: ignorieren,
      // der Volllauf beim ersten Suchlauf ist korrekt.
      if (store.countMemories().active !== 1) return;
      eintrag = { generation: 0, aktiv: [], byId: new Map() };
      aktiverCache.set(store, eintrag);
    }
    const frisch = store.getMemory(id);
    if (!frisch || frisch.deletedAt !== null) {
      eintrag.aktiv = eintrag.aktiv.filter((m) => m.record.id !== id);
      eintrag.byId.delete(id);
    } else {
      const neu: ActiveMemory = {
        record: frisch,
        titleLower: frisch.title.toLowerCase(),
        contentLower: frisch.content.toLowerCase(),
      };
      const alt = eintrag.byId.get(id);
      if (alt) Object.assign(alt, neu); // In-place: Referenzen laufender Antworten bleiben gültig
      else {
        eintrag.aktiv.push(neu);
        eintrag.byId.set(id, neu);
      }
    }
    suchCacheStatistik.deltapatches += 1;
    eintrag.generation = store.memGeneration(); // Write → Trigger hat schon gezählt
  });
}

/**
 * Meldet den Such-Cache VOR dem ersten Write am Store an — damit der Cache
 * beim Ingest mitwächst und der erste Suchlauf keinen Volllauf zahlt.
 * Aufrufpunkte: direkt nach `new KeptaStore(...)` (server.ts, Bench). Wer es
 * nicht aufruft, zahlt den Volllauf beim ersten Suchlauf — Korrektheit bleibt
 * durch das Trigger-Sicherheitsnetz in jedem Fall gewährleistet.
 */
export function aktiviereSuchCacheDelta(store: KeptaStore): void {
  registriereDelta(store);
}

function aktiveErinnerungen(store: KeptaStore): { aktiv: ActiveMemory[]; byId: Map<string, ActiveMemory> } {
  registriereDelta(store);
  const generation = store.memGeneration();
  const eintrag = aktiverCache.get(store);
  if (eintrag && eintrag.generation === generation) return eintrag;
  const aktiv = loadActive(store);
  const byId = new Map(aktiv.map((m) => [m.record.id, m]));
  const frisch = { generation, aktiv, byId };
  aktiverCache.set(store, frisch);
  suchCacheStatistik.vollaufbauten += 1;
  return frisch;
}

const chunkCache = new WeakMap<KeptaStore, { generation: number; chunks: ReturnType<KeptaStore["allEmbeddableChunks"]> }>();
function embeddbareChunks(store: KeptaStore): ReturnType<KeptaStore["allEmbeddableChunks"]> {
  const generation = store.datenGeneration();
  const eintrag = chunkCache.get(store);
  if (eintrag && eintrag.generation === generation) return eintrag.chunks;
  const chunks = store.allEmbeddableChunks();
  chunkCache.set(store, { generation, chunks });
  return chunks;
}

const graphCache = new WeakMap<KeptaStore, { generation: number; namen: string[] }>();
function graphNamen(store: KeptaStore): string[] {
  const generation = store.datenGeneration();
  const eintrag = graphCache.get(store);
  if (eintrag && eintrag.generation === generation) return eintrag.namen;
  const { entities } = store.getGraph(undefined, 1);
  const namen = entities.map((e) => e.name);
  graphCache.set(store, { generation, namen });
  return namen;
}

// Vektor-Spur vorgerechnet: Chunk-Normen werden pro Generation EINMAL gebildet,
// die Suche rechnet dann nur noch dot(a, b) / (normA · normB) — das spart die
// doppelte Norm-Arbeit pro Chunk bei jeder Abfrage (bei 20k×768-dim-Chunks der
// größte einzelne Kostenblock der warmen Suche).
interface SuchVektoren {
  liste: ReturnType<KeptaStore["allEmbeddableChunks"]>;
  normen: Float32Array;
}
const vektorCache = new WeakMap<KeptaStore, { generation: number; spur: SuchVektoren }>();
function suchVektoren(store: KeptaStore): SuchVektoren {
  const generation = store.datenGeneration();
  const eintrag = vektorCache.get(store);
  if (eintrag && eintrag.generation === generation) return eintrag.spur;
  const liste = store.allEmbeddableChunks().filter((c) => c.model === DEFAULT_EMBED_MODEL);
  const normen = new Float32Array(liste.length);
  for (let j = 0; j < liste.length; j++) {
    const b = liste[j]!.embedding;
    let nb = 0;
    for (let i = 0; i < b.length; i++) nb += b[i]! * b[i]!;
    normen[j] = Math.sqrt(nb);
  }
  const spur = { liste, normen };
  vektorCache.set(store, { generation, spur });
  return spur;
}

function entityMentionsInQuery(store: KeptaStore, queryLower: string): string[] {
  const mentions: string[] = [];
  for (const name of graphNamen(store)) {
    if (name.length >= 3 && queryLower.includes(name)) mentions.push(name);
  }
  return mentions;
}

/** Berechnet alle Beinheiten und fusioniert via Reciprocal Rank Fusion. */
export async function searchMemories(store: KeptaStore, params: SearchParams): Promise<SearchResult> {
  // Query-Erweiterung (deutsch <-> englisch): „Wie oft wird gesichert?" muss
  // auch die Notiz „Backup schedule" finden. Die Erweiterung haengt Synonyme
  // AN die Query — alle Beine (BM25, Vektor, Reranking) profitieren; das
  // Original bleibt vorne, damit Snippets und Anzeige dem Nutzer folgen.
  const query = erweitereQuery((params.query || "").trim());
  const limit = Math.min(Math.max(params.limit ?? 10, 1), MAX_SEARCH_LIMIT);
  const queryLower = query.toLowerCase();
  // Zeitreise (asOf): „now“ ist dann der gefragte Zeitpunkt — Zeitregler für ALLE Zugänge
  const now = params.asOf ?? Date.now();
  const timeTravel = params.asOf !== undefined;
  const { aktiv: active, byId } = aktiveErinnerungen(store);

  const filters = (m: ActiveMemory): boolean => {
    const r = m.record;
    if (params.type && r.type !== params.type) return false;
    if (params.scope && r.scope !== params.scope) return false;
    if (params.tags && params.tags.length > 0) {
      const tags = params.tags.map((t) => t.toLowerCase());
      if (!tags.every((t) => r.tags.includes(t))) return false;
    }
    if (params.validSince && r.validFrom !== null && r.validFrom < params.validSince) return false;
    // Zeitreise: Notizen, die zum Zeitpunkt noch nicht existierten oder schon abgelaufen waren, ausblenden
    if (timeTravel) {
      const start = r.validFrom ?? r.createdAt;
      if (start !== null && start > now) return false;
      if (r.validTo !== null && r.validTo <= now) return false;
    }
    return true;
  };

  // Fehlende Angabe = alles an. Ablation schaltet gezielt ab, ohne das
  // Normalverhalten zu beruehren.
  const beine = {
    bm25: params.tracks?.bm25 ?? true,
    vector: params.tracks?.vector ?? true,
    entity: params.tracks?.entity ?? true,
  };

  // --- Bein 1: FTS5-BM25 ---
  // Die lexikalische Spur muss so viele Kandidaten liefern, wie verlangt sind —
  // sonst begrenzt sie die Antwort still, egal wie gross das Limit ist.
  //
  // Die Grundtiefe ist bewusst weit ueber jedem ueblichen Limit: sonst haengt
  // total davon ab, wie viele Treffer gerade ANGEZEIGT werden. Genau das fiel im
  // Test auf — "5 von 117" bei einem Limit von 5, "5 von 150" nach dem Umlegen
  // des Reglers. Die Zahl neben dem Ergebnis muss stehen, egal was man einstellt.
  const ftsTiefe = Math.min(MAX_SEARCH_LIMIT, Math.max(500, limit * 2));
  const bm25Ranked: string[] = query && beine.bm25
    ? store
        .ftsSearch(query, ftsTiefe)
        .map((h) => h.id)
        .filter((id) => byId.has(id))
    : [];

  // --- Bein 2: Vektor-KNN (nur wenn Embeddings des aktuellen Modells existieren) ---
  let vectorRanked: string[] = [];
  let queryVector: Float32Array | null = null;
  let usedVectors = false;
  const vectorSim = new Map<string, number>();
  if (query && beine.vector) {
    queryVector = await embedQuery(query);
    if (queryVector) {
      // Vorgerechnete Spur (Chunk-Liste gefiltert auf das Abfragemodell + Normen
      // je Chunk, einmal pro Generation). Nur Chunks desselben Embedding-Modells
      // sind vergleichbar — der Query-Vektor entsteht mit DEFAULT_EMBED_MODEL;
      // fremde Modelle würden unsinnige Cosine-Werte liefern.
      const spur = suchVektoren(store);
      const liste = spur.liste;
      const normen = spur.normen;
      // Query-Norm einmal je Abfrage
      let na = 0;
      for (let i = 0; i < queryVector.length; i++) na += queryVector[i]! * queryVector[i]!;
      const normA = Math.sqrt(na);
      const bestPerMemory = new Map<string, number>();
      for (let j = 0; j < liste.length; j++) {
        const c = liste[j]!;
        if (!byId.has(c.memoryId)) continue;
        const b = c.embedding;
        let dot = 0;
        for (let i = 0; i < b.length; i++) dot += queryVector[i]! * b[i]!;
        const sim = normA > 0 && normen[j]! > 0 ? dot / (normA * normen[j]!) : 0;
        const prev = bestPerMemory.get(c.memoryId);
        if (prev === undefined || sim > prev) bestPerMemory.set(c.memoryId, sim);
      }
      if (bestPerMemory.size > 0) {
        usedVectors = true;
        // Cosinus bleibt fuer die Anzeige vollstaendig erhalten; als KANDIDAT
        // zaehlt nur, wer im Band um den besten Treffer liegt.
        for (const [id, sim] of bestPerMemory) vectorSim.set(id, sim);
        let bestSim = 0;
        for (const sim of bestPerMemory.values()) if (sim > bestSim) bestSim = sim;
        const untergrenze = Math.max(VECTOR_FLOOR, bestSim * VECTOR_BAND);
        vectorRanked = [...bestPerMemory.entries()]
          .filter(([, sim]) => sim >= untergrenze)
          .sort((a, b) => b[1] - a[1])
          .map(([id]) => id);
      }
    }
  }

  // --- Bein 3: Entity-Match ---
  let entityRanked: string[] = [];
  if (query && beine.entity) {
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
    const expired = !timeTravel && r.validTo !== null && r.validTo < now;
    const superseded = r.supersededBy !== null;
    if (expired) score *= EXPIRED_FACTOR;
    if (superseded) score *= SUPERSEDED_FACTOR;
    // F3: lokales Reranking — bewertet (Query, Knoten) direkt statt über Bein-Ränge
    const rerank = localRerankScore(query, r);
    if (rerank !== null) score *= 1 + rerank * RERANK_MAX_BOOST;

    const matchedTerms = queryTerms.filter((t) => m.titleLower.includes(t) || m.contentLower.includes(t));
    hits.push({
      memory: r,
      score,
      components: {
        bm25Rank: entry?.bm25Rank ?? null,
        vectorRank: entry?.vectorRank ?? null,
        entityRank: entry?.entityRank ?? null,
        vectorSimilarity: vectorSim.get(id) ?? null,
        rerankScore: rerank,
      },
      matchedTerms,
      expired,
      superseded,
    });
  }

  // PolicyGate: letzte Instanz vor der Rueckgabe (nach RRF + Boosts)
  const actor = store.extensions.identity.current();
  const kept = store.extensions.policy.filterResults(actor, hits.map((h) => h.memory));
  if (kept.length !== hits.length) {
    const keep = new Set(kept.map((r) => r.id));
    for (let i = hits.length - 1; i >= 0; i--) if (!keep.has(hits[i]!.memory.id)) hits.splice(i, 1);
  }

  hits.sort((a, b) => b.score - a.score || b.memory.updatedAt - a.memory.updatedAt);
  const top = hits.slice(0, limit);
  // Zugriffs-Statistik für die Retention aktualisieren (fire-and-forget-semantisch, aber sync)
  // Retention nur für Gegenwarts-Suchen zählen — Zeitreise verfälscht die Statistik nicht
  if (query && !timeTravel && top.length > 0) {
    store.recordAccess(top.map((h) => h.memory.id));
    // recordAccess hebt die Generation bewusst NICHT (Trigger-WHEN: nur inhaltliche
    // Updates zählen) — sonst invalidiert die Suche sich selbst und der Cache ist
    // tot. Damit der Cache trotzdem exakt frisch bleibt, patchen wir die neuen
    // Zugriffsstände direkt in die gecachten Records (wirkt ab der nächsten Suche —
    // identisch zum Verhalten ohne Cache).
    const eintrag = aktiverCache.get(store);
    if (eintrag && eintrag.generation === store.memGeneration()) {
      const jetzt = Date.now();
      const imCache = new Map(eintrag.aktiv.map((a) => [a.record.id, a]));
      for (const h of top) {
        const m = imCache.get(h.memory.id);
        if (m) {
          m.record.lastAccessAt = jetzt;
          m.record.accessCount += 1;
        }
      }
    }
  }
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
 * `ausnehmen` blendet IDs vollständig aus — sie erscheinen weder als Kandidat, noch
 * werden sie ersetzt. Der Agenten-Floor nutzt das für private Notizen: melden und
 * anwenden sind derselbe Pool, sonst wäre ein dryRun sicher und der Klick danach nicht.
 */
export async function consolidateMemories(
  store: KeptaStore,
  opts: { dryRun?: boolean; threshold?: number; ausnehmen?: Set<string> } = {}
): Promise<ConsolidationResult> {
  const threshold = opts.threshold ?? 0.92;
  const dryRun = opts.dryRun ?? true;
  // Nur lebende Memories aufraeumen. Bereits ersetzte liegen als Verlauf da; sie
  // erneut zu vergleichen ist nicht nur ueberfluessig, sondern gefaehrlich:
  // pickKeep bewertet nach updatedAt, und das Ersetzen selbst setzt updatedAt frisch.
  // Eine tote Memory gewann dadurch als "behalten" — und eine lebende Dublette zeigte
  // anschliessend auf sie. Ergebnis: die lebende Notiz auf 40 % heruntergewichtet,
  // mit einem Nachfolger, der selbst ausgemustert ist.
  const active = aktiveErinnerungen(store).aktiv.filter((m) => !m.record.supersededBy && !opts.ausnehmen?.has(m.record.id));
  const candidates: ConsolidationCandidate[] = [];

  // Embedding-Dubletten: Centroid pro Memory+Modell vergleichen — Cosine nur zwischen
  // identischen Modellen (Cross-Modell-Vektoren erzeugen Schein-Dubletten).
  const chunks = embeddbareChunks(store);
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

/**
 * Schnelle Prüfung beim Speichern: ähnelt der neue Inhalt einer bestehenden Memory?
 * Agentenweg — die beiden Aufrufer (Dupletten-Warnung und Write-Gate) antworten
 * direkt an den Agenten, deshalb sind private Notizen hier herausgerechnet.
 */
export async function findDuplicateForNew(
  store: KeptaStore,
  title: string,
  content: string
): Promise<DuplicateWarning | null> {
  const vec = await embedQuery(`${title}\n${content}`);
  if (!vec) return null;
  // Nur Chunks des aktuellen Modells — Query-Vektor und Chunk-Vektor müssen gleiche Räume teilen
  const chunks = embeddbareChunks(store).filter((c) => c.model === DEFAULT_EMBED_MODEL);
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
  if (!bestId || bestSim < 0.92) return null;
  // Privatheits-Floor, und zwar hier statt bei den Aufrufern: beide Wege, die auf
  // diese Prüfung folgen, enden bei einem Agenten — die Dupletten-Warnung nennt die
  // id, und das Write-Gate schreibt sie in seinen Prompt-Grundtext. Beides würde
  // privaten Inhalt (oder zumindest seine Existenz) in den Agentenkanal tragen, und
  // ein UPDATE des Gates überschriebe obendrein die private Notiz des Besitzers.
  if (store.istPrivat(bestId)) return null;
  return { existingId: bestId, similarity: bestSim };
}

export type { MemoryType, SearchHit, SearchResult, SearchParams };
export { DEFAULT_EMBED_MODEL };

// ---------- Write-Gate (F2): lokales LLM entscheidet ADD/UPDATE/DELETE/NOOP ----------

export type WriteDecision = "ADD" | "UPDATE" | "DELETE" | "NOOP";

export interface WriteGateResult {
  decision: WriteDecision;
  /** Bei UPDATE/DELETE: ID des betroffenen bestehenden Knotens */
  targetId?: string;
  reason?: string;
}

/**
 * Klassifiziert einen neuen Knoten gegen die ähnlichsten bestehenden:
 * ADD (neu), UPDATE (ersetzt bestehenden), DELETE (Müll), NOOP (schon vorhanden).
 * Ohne erreichbares lokales LLM → ADD (Verhalten wie bisher, nie blockierend).
 */
export async function writeGate(
  store: KeptaStore,
  title: string,
  content: string,
  ask: (prompt: string) => Promise<string>
): Promise<WriteGateResult> {
  const dup = await findDuplicateForNew(store, title, content);
  if (!dup) return { decision: "ADD", reason: "keine ähnliche Erinnerung" };
  const existing = store.getMemory(dup.existingId);
  if (!existing) return { decision: "ADD" };
  const prompt = [
    "Entscheide, wie eine neue Erinnerung behandelt wird. Antworte NUR mit einem JSON-Objekt:",
    '{"decision":"ADD|UPDATE|DELETE|NOOP","reason":"<kurz>"}',
    "ADD = neues Wissen. UPDATE = ersetzt die bestehende (aktueller/genauer). DELETE = die neue ist Müll. NOOP = bereits identisch vorhanden.",
    "",
    `Bestehende Erinnerung (${dup.existingId}, Ähnlichkeit ${dup.similarity.toFixed(2)}):`,
    `Titel: ${existing.title}`,
    `Inhalt: ${existing.content.slice(0, 500)}`,
    "",
    `Neue Erinnerung:`,
    `Titel: ${title}`,
    `Inhalt: ${content.slice(0, 500)}`,
  ].join("\n");
  let raw = "";
  try {
    raw = await ask(prompt);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("kein JSON in Antwort");
    const parsed = JSON.parse(match[0]!) as { decision?: string; reason?: string };
    const decision = parsed.decision?.toUpperCase();
    if (decision === "UPDATE") return { decision: "UPDATE", targetId: dup.existingId, reason: parsed.reason };
    if (decision === "DELETE") return { decision: "DELETE", reason: parsed.reason };
    if (decision === "NOOP") return { decision: "NOOP", reason: parsed.reason };
    return { decision: "ADD", reason: parsed.reason };
  } catch (e) {
    return { decision: "ADD", reason: `gate nicht auswertbar: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ---------- F2-Verdrahtung: Write-Gate als Opt-in ----------

/** Das Gate ist ein Opt-in: ausschließlich KEPTA_WRITE_GATE=on schaltet es frei. */
export function writeGateEnabled(): boolean {
  return process.env.KEPTA_WRITE_GATE === "on";
}

/**
 * Das Frage-Backend des Gates: das lokale LLM via Ollama /api/chat (loopback-only).
 * Fehler fliegen als Exception — writeGate fängt sie und degradiert zu ADD.
 */
export async function localGateAsk(prompt: string): Promise<string> {
  const res = await fetch(`${ollamaBaseUrl()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.KEPTA_WRITE_GATE_MODEL || "llama3.2",
      messages: [{ role: "user", content: prompt }],
      stream: false,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content ?? "";
}

/**
 * Einheitliche Gate-Entscheidung für alle Save-Pfade (MCP memory_save, HTTP POST
 * /api/memories): null = Gate aus (Speichern wie bisher), sonst ADD/UPDATE/DELETE/
 * NOOP des lokalen LLM — die Pfade wenden die Entscheidung einheitlich an.
 */
export async function gateDecision(
  store: KeptaStore,
  title: string,
  content: string,
  ask: (prompt: string) => Promise<string> = localGateAsk
): Promise<WriteGateResult | null> {
  if (!writeGateEnabled()) return null;
  return writeGate(store, title, content, ask);
}
