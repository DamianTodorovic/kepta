// Semantische Hybrid-Suche: TF-IDF + Cosine + BM25 (ohne Netz lauffähig)
// Optional: Ollama /api/embed via Server-Proxy /api/embed
// OPTIMIERT: Index-Cache + Token-Cache + Result-Cache (max Performance)
import type { Memory } from "../types";

// ---------- Stopwords DE + EN (kompakt, häufige Füllwörter) ----------
const STOPWORDS_DE = new Set([
  "der","die","das","den","dem","des","ein","eine","einen","einem","einer","eines",
  "und","oder","aber","wenn","dann","also","auch","noch","schon","nur","sehr","wie",
  "was","wer","wo","wann","warum","wieso","weshalb","welche","welcher","welches",
  "dass","das","ist","sind","war","waren","sein","hat","haben","hatte","hatten",
  "wird","werden","wurde","wurden","kann","könnte","soll","sollen","muss","müssen",
  "will","wollen","möchte","möchten","bei","mit","von","zu","zum","zur","im","am",
  "an","auf","für","über","unter","vor","nach","zwischen","durch","gegen","ohne",
  "um","aus","ein","aus","im","in","als","so","diese","dieser","dieses","diesen",
  "diesem","jeder","jede","jedes","viele","vielen","mehr","weniger","hier","dort",
  "da","dabei","damit","dazu","darauf","darüber","darunter","nicht","kein","keine",
  "keinen","keinem","keiner","nichts","alles","etwas","man","es","er","sie","wir",
  "ihr","mein","dein","sein","ihr","unser","euer",
]);

const STOPWORDS_EN = new Set([
  "the","a","an","and","or","but","if","then","else","so","as","at","by","for","with",
  "about","against","between","into","through","during","before","after","above","below",
  "to","from","up","down","in","out","on","off","over","under","again","further","once",
  "here","there","when","where","why","how","all","any","both","each","few","more","most",
  "other","some","such","no","nor","not","only","own","same","than","too","very","can",
  "will","just","don","should","now","is","are","was","were","be","been","being","has",
  "have","had","do","does","did","being","having","doing","am","isnt","arent","wasnt",
  "hasnt","havent","hadnt","dont","doesnt","didnt","wont","wouldnt","shouldnt","cant",
  "cannot","could","would","should","may","might","must","shall","this","that","these",
  "those","i","me","my","myself","we","our","ours","you","your","yours","he","him","his",
  "she","her","hers","it","its","they","them","their","what","which","who","whom",
]);

const STOPWORDS = new Set<string>([...STOPWORDS_DE, ...STOPWORDS_EN]);

// ---------- Performance Caches ----------
const _tokenCache = new Map<string, string[]>();
const MAX_TOKEN_CACHE = 2048;
const _indexCache = new Map<string, { avgDL:number; N:number; df:Map<string,number>; idfTfidf:Map<string,number>; idfBm25:Map<string,number>; docTokensList:string[][] }>();
const MAX_INDEX_CACHE = 8;
const _resultCache = new Map<string, { ts:number; results: ScoredMemory[] }>();
const RESULT_TTL_MS = 60_000;
const MAX_RESULT_CACHE = 64;

function _hashMemories(memories: Memory[]): number {
  let h = 5381;
  for (const m of memories) {
    const s = m.id + "|" + m.updatedAt;
    for (let i=0;i<s.length;i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return h | 0;
}
function _indexKey(memories: Memory[], opts:{ngram:number; removeStopwords:boolean}): string {
  return `${memories.length}:${_hashMemories(memories)}:${opts.ngram}:${opts.removeStopwords}`;
}
function _resultKey(indexKey:string, query:string, topK:number, cosineWeight:number, k1:number, b:number): string {
  return `${indexKey}|q:${query}|k:${topK}|cw:${cosineWeight}|k1:${k1}|b:${b}`;
}
function _getCachedTokens(m: Memory, opts:{ngram:number; removeStopwords:boolean}): string[] {
  const key = `${m.id}:${m.updatedAt}:${opts.ngram}:${opts.removeStopwords}`;
  const hit = _tokenCache.get(key);
  if (hit) return hit;
  // compute
  const titleTokens = tokenize(m.title || "", opts);
  const contentTokens = tokenize(m.content || "", opts);
  const tagTokens = (m.tags || []).flatMap(t => tokenize(t, opts));
  const all = [...titleTokens, ...titleTokens, ...contentTokens, ...tagTokens];
  // LRU eviction
  if (_tokenCache.size >= MAX_TOKEN_CACHE) {
    const first = _tokenCache.keys().next().value;
    if (first) _tokenCache.delete(first);
  }
  _tokenCache.set(key, all);
  return all;
}

// ---------- Tokenisierung ----------
export interface TokenizeOptions {
  /** N-Gram Größe: 1 = Unigramme, 2 = zusätzlich Bigramme, etc. */
  ngram?: number;
  /** Stopwords entfernen (default true) */
  removeStopwords?: boolean;
}

export function tokenize(text: string, opts: TokenizeOptions = {}): string[] {
  const { ngram = 1, removeStopwords = true } = opts;
  if (!text) return [];
  let t = text.toLowerCase();
  t = t.replace(/[^a-z0-9äöüß]+/g, " ");
  const rawTokens = t.split(/\s+/).filter(Boolean);
  const filtered = removeStopwords ? rawTokens.filter(tok => !STOPWORDS.has(tok) && tok.length > 1) : rawTokens;
  if (ngram <= 1) return filtered;
  const result = [...filtered];
  for (let n = 2; n <= ngram; n++) {
    for (let i = 0; i <= filtered.length - n; i++) {
      result.push(filtered.slice(i, i + n).join("_"));
    }
  }
  return result;
}

export function tokenizeMemory(m: Memory, opts: TokenizeOptions = {}): string[] {
  return _getCachedTokens(m, { ngram: opts.ngram ?? 1, removeStopwords: opts.removeStopwords ?? true });
}

// ---------- Hilfsfunktionen ----------
function termFrequencies(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const tok of tokens) tf.set(tok, (tf.get(tok) || 0) + 1);
  const len = tokens.length || 1;
  for (const [k, v] of tf) tf.set(k, v / len);
  return tf;
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const allKeys = new Set<string>([...a.keys(), ...b.keys()]);
  for (const k of allKeys) {
    const av = a.get(k) || 0;
    const bv = b.get(k) || 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function cosineVec(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ---------- Scoring Typen ----------
export interface ScoredMemory {
  memory: Memory;
  /** Hybrid-Score 0..1 (normalisiert) */
  score: number;
  /** Einzelkomponenten für Anzeige/Debug */
  cosineScore: number;
  bm25Score: number;
  rawBm25: number;
  matchedTerms: string[];
}

export interface HybridSearchOptions extends TokenizeOptions {
  /** Gewichtung Cosine vs BM25 (0..1) -> cosineWeight. Default 0.5 */
  cosineWeight?: number;
  /** Felder gewichten (Titel schon via Duplizierung) */
  k1?: number;
  b?: number;
}

// ---------- Kern: Hybrid-Suche (TF-IDF Cosine + BM25) ----------
export function hybridSearch(
  memories: Memory[],
  query: string,
  topK = 5,
  opts: HybridSearchOptions = {}
): ScoredMemory[] {
  const { cosineWeight = 0.5, ngram = 1, removeStopwords = true, k1 = 1.2, b = 0.75 } = opts;

  const q = (query || "").trim();
  if (memories.length === 0) return [];
  if (!q) {
    return memories
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, topK)
      .map(m => ({ memory: m, score: 1, cosineScore: 1, bm25Score: 1, rawBm25: 0, matchedTerms: [] }));
  }

  const queryTokens = tokenize(q, { ngram, removeStopwords });
  if (queryTokens.length === 0) {
    return memories
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, topK)
      .map(m => ({ memory: m, score: 1, cosineScore: 1, bm25Score: 1, rawBm25: 0, matchedTerms: [] }));
  }

  // --- Result-Cache Check ---
  const ikey = _indexKey(memories, { ngram, removeStopwords });
  const rkey = _resultKey(ikey, q, topK, cosineWeight, k1, b);
  const cachedRes = _resultCache.get(rkey);
  if (cachedRes && (Date.now() - cachedRes.ts) < RESULT_TTL_MS) {
    return cachedRes.results;
  }
  // Purge expired on every 20th call (amortized)
  if (_resultCache.size > MAX_RESULT_CACHE) {
    const oldest = _resultCache.keys().next().value;
    if (oldest) _resultCache.delete(oldest);
  }

  // --- Index-Cache: docTokens + df/idf/avgDL ---
  let idx = _indexCache.get(ikey);
  if (!idx) {
    const docTokensList = memories.map(m => _getCachedTokens(m, { ngram, removeStopwords }));
    const N = memories.length;
    const avgDL = docTokensList.reduce((s, d) => s + d.length, 0) / Math.max(1, N);
    const df = new Map<string, number>();
    for (const toks of docTokensList) {
      const uniq = new Set(toks);
      for (const term of uniq) df.set(term, (df.get(term) || 0) + 1);
    }
    const idfTfidf = new Map<string, number>();
    const idfBm25 = new Map<string, number>();
    for (const term of df.keys()) {
      const freq = df.get(term) || 0;
      idfTfidf.set(term, Math.log((N + 1) / (freq + 1)) + 1);
      idfBm25.set(term, Math.log((N - freq + 0.5) / (freq + 0.5) + 1));
    }
    // also need idf for query-only terms not in df
    for (const term of queryTokens) {
      if (!idfTfidf.has(term)) {
        idfTfidf.set(term, Math.log((N + 1) / 1) + 1);
        idfBm25.set(term, Math.log((N - 0 + 0.5) / 0.5 + 1));
      }
    }
    idx = { avgDL, N, df, idfTfidf, idfBm25, docTokensList };
    if (_indexCache.size >= MAX_INDEX_CACHE) {
      const first = _indexCache.keys().next().value;
      if (first) _indexCache.delete(first);
    }
    _indexCache.set(ikey, idx);
  } else {
    // Index hit: aber Query-only Terms könnten fehlen -> ergänze on demand (billig)
    for (const term of queryTokens) {
      if (!idx.idfTfidf.has(term)) {
        idx.idfTfidf.set(term, Math.log((idx.N + 1) / 1) + 1);
        idx.idfBm25.set(term, Math.log((idx.N - 0 + 0.5) / 0.5 + 1));
      }
    }
  }

  const { avgDL, docTokensList } = idx;
  const idfTfidf = idx.idfTfidf;
  const idfBm25 = idx.idfBm25;

  // Query TF-IDF Vektor
  const qTf = termFrequencies(queryTokens);
  const qVec = new Map<string, number>();
  for (const [term, tf] of qTf) qVec.set(term, tf * (idfTfidf.get(term) || 1));

  // Pro Dokument: TF-IDF Vektor + BM25 Score
  const cosines: number[] = [];
  const rawBm25s: number[] = [];
  const matchedList: string[][] = [];

  docTokensList.forEach((toks, docIdx) => {
    // TF-IDF vec for doc (use termFrequencies + idf)
    const tf = termFrequencies(toks);
    const vec = new Map<string, number>();
    for (const [term, v] of tf) vec.set(term, v * (idfTfidf.get(term) || 1));
    const cos = cosineSimilarity(vec, qVec);
    cosines[docIdx] = cos;

    // BM25
    const docLen = toks.length || 1;
    const termCounts = new Map<string, number>();
    for (const tok of toks) termCounts.set(tok, (termCounts.get(tok) || 0) + 1);
    let bm25 = 0;
    const matched: string[] = [];
    for (const qTerm of queryTokens) {
      const tfRaw = termCounts.get(qTerm) || 0;
      if (tfRaw > 0) matched.push(qTerm);
      if (tfRaw === 0) continue;
      const idf = idfBm25.get(qTerm) || 0;
      const denom = tfRaw + k1 * (1 - b + b * (docLen / avgDL));
      bm25 += idf * ((tfRaw * (k1 + 1)) / denom);
    }
    rawBm25s[docIdx] = bm25;
    matchedList[docIdx] = [...new Set(matched)];
  });

  // Normalisierung BM25 -> 0..1 via Min-Max
  const minBm = Math.min(...rawBm25s);
  const maxBm = Math.max(...rawBm25s);
  const range = maxBm - minBm;
  const normBm25 = rawBm25s.map(v => (range > 1e-9 ? (v - minBm) / range : v > 0 ? 1 : 0));

  // Hybrid-Score: gewichtete Summe
  const results: ScoredMemory[] = memories.map((m, i) => {
    const cos = cosines[i] || 0;
    const nb = normBm25[i] || 0;
    const hybrid = cosineWeight * cos + (1 - cosineWeight) * nb;
    return {
      memory: m,
      score: hybrid,
      cosineScore: cos,
      bm25Score: nb,
      rawBm25: rawBm25s[i] || 0,
      matchedTerms: matchedList[i] || [],
    };
  });

  // Sortierung: Score absteigend, dann Aktualität als Tiebreaker
  results.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 1e-9) return b.score - a.score;
    return b.memory.updatedAt - a.memory.updatedAt;
  });

  const hasMatch = results.some(r => r.score > 1e-9);
  if (!hasMatch) {
    return [];
  }

  const final = results.filter(r => r.score > 1e-9).slice(0, Math.max(0, topK));
  // Cache result
  if (_resultCache.size >= MAX_RESULT_CACHE) {
    const first = _resultCache.keys().next().value;
    if (first) _resultCache.delete(first);
  }
  _resultCache.set(rkey, { ts: Date.now(), results: final });
  return final;
}

// ---------- Optionale Ollama-Embeddings (Frontend) ----------
export interface EmbedResponse {
  embeddings?: number[][];
  embedding?: number[];
  model?: string;
}

/** Holt Embeddings via Server-Proxy /api/embed. Liefert null bei Nichtverfügbarkeit. */
export async function fetchEmbeddings(
  inputs: string[],
  model?: string
): Promise<number[][] | null> {
  if (!inputs.length) return [];
  try {
    const res = await fetch("/api/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: inputs, model }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as EmbedResponse & { error?: string };
    if (data.embeddings && Array.isArray(data.embeddings)) return data.embeddings;
    if (data.embedding && Array.isArray(data.embedding)) return [data.embedding as number[]];
    return null;
  } catch {
    return null;
  }
}

/** Hybrid mit Embeddings: kombiniert Embedding-Cosine (0.5) + TF-IDF Cosine (0.25) + BM25 (0.25). Fallback rein lokal. */
export async function hybridSearchWithEmbeddings(
  memories: Memory[],
  query: string,
  topK = 5,
  opts: HybridSearchOptions & { embeddingModel?: string; embeddingWeight?: number } = {}
): Promise<ScoredMemory[]> {
  const { embeddingWeight = 0.5, embeddingModel, ...rest } = opts;
  const localResults = hybridSearch(memories, query, memories.length, rest);
  if (!query.trim() || memories.length === 0) return localResults.slice(0, topK);

  const allInputs = [query, ...memories.map(m => `${m.title}\n${m.content}\n${m.tags.join(" ")}`)];
  const embs = await fetchEmbeddings(allInputs, embeddingModel);
  if (!embs || embs.length !== allInputs.length) {
    return localResults.slice(0, topK);
  }
  const qEmb = embs[0];
  const docEmbs = embs.slice(1);

  const embedScores = docEmbs.map(de => cosineVec(qEmb, de));
  const normEmbed = embedScores.map(s => (s + 1) / 2);

  const byId = new Map(localResults.map(r => [r.memory.id, r]));
  const merged: ScoredMemory[] = memories.map((m, i) => {
    const local = byId.get(m.id);
    const eScore = normEmbed[i] ?? 0;
    const cos = local?.cosineScore ?? 0;
    const bm = local?.bm25Score ?? 0;
    const remaining = 1 - embeddingWeight;
    const tfidfW = remaining * 0.5;
    const bm25W = remaining * 0.5;
    const hybrid = embeddingWeight * eScore + tfidfW * cos + bm25W * bm;
    return {
      memory: m,
      score: hybrid,
      cosineScore: eScore,
      bm25Score: bm,
      rawBm25: local?.rawBm25 ?? 0,
      matchedTerms: local?.matchedTerms ?? [],
    };
  });

  merged.sort((a, b) => b.score - a.score || b.memory.updatedAt - a.memory.updatedAt);
  const hasMatch = merged.some(r => r.score > 1e-9);
  if (!hasMatch) return [];
  return merged.slice(0, topK);
}

// ---------- Server-seitiger Helfer (Wiederverwendung ohne Import-Zyklus) ----------
/** Reine Score-Berechnung ohne Memory-Objekte (für Server-Route) */
export function scoreTexts(
  docs: string[],
  query: string,
  topK = 5,
  opts: HybridSearchOptions = {}
): { index: number; score: number; cosine: number; bm25: number }[] {
  const fakeMemories: Memory[] = docs.map((d, i) => ({
    id: String(i),
    userId: "local",
    title: "",
    content: d,
    tags: [],
    createdAt: 0,
    updatedAt: 0,
  }));
  const res = hybridSearch(fakeMemories, query, topK, opts);
  return res.map(r => ({
    index: parseInt(r.memory.id, 10),
    score: r.score,
    cosine: r.cosineScore,
    bm25: r.bm25Score,
  }));
}
