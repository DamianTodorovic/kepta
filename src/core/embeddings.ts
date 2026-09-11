// Embeddings via Ollama (/api/embed) — persistente Chunk-Vektoren + Hintergrund-Queue.
// Ohne Ollama läuft KEPTA weiterhin rein lexikalisch (FTS5-BM25), alles optional.
import type { KeptaStore } from "./store";
import type { AuditSink } from "./extensions";

export const DEFAULT_EMBED_MODEL = process.env.KEPTA_EMBED_MODEL || "nomic-embed-text";

export function ollamaBaseUrl(): string {
  return (process.env.KEPTA_OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
}

// ---------- Chunking ----------

export interface ChunkOptions {
  /** Zielgröße pro Chunk in Zeichen */
  size?: number;
  /** Überlappung in Zeichen */
  overlap?: number;
}

const PARAGRAPH_SPLIT = /\n\s*\n/;

/** Zerlegt Text in überlappende Chunks an Absatz-/Satzgrenzen (gröblich, aber robust). */
export function chunkText(text: string, opts: ChunkOptions = {}): string[] {
  const size = Math.max(200, opts.size ?? 1200);
  const overlap = Math.min(Math.max(0, opts.overlap ?? 150), size - 100);
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];

  const paragraphs = clean.split(PARAGRAPH_SPLIT);
  const chunks: string[] = [];
  let current = "";
  for (const para of paragraphs) {
    if ((current + "\n\n" + para).length <= size) {
      current = current ? current + "\n\n" + para : para;
      continue;
    }
    if (current) chunks.push(current.trim());
    if (para.length <= size) {
      current = para;
      continue;
    }
    // Absatz selbst zu groß: an Sätzenbrechen, notfalls hart
    const sentences = para.split(/(?<=[.!?])\s+/);
    let piece = "";
    for (const s of sentences) {
      if ((piece + " " + s).length > size && piece) {
        chunks.push(piece.trim());
        piece = overlap > 0 ? piece.slice(-overlap) + " " + s : s;
      } else {
        piece = piece ? piece + " " + s : s;
      }
    }
    current = piece;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter((c) => c.length > 0);
}

// ---------- Ollama-Client ----------

export interface EmbedResult {
  ok: boolean;
  embeddings: Float32Array[];
  model: string;
  error?: string;
}

export async function embedTexts(
  inputs: string[],
  model: string = DEFAULT_EMBED_MODEL,
  audit?: AuditSink,
  baseUrlOverride?: string
): Promise<EmbedResult> {
  const base = (baseUrlOverride ?? ollamaBaseUrl()).replace(/\/+$/, "");
  let host = "";
  try {
    host = new URL(base).hostname;
  } catch {
    host = base;
  }
  if (audit && !["127.0.0.1", "localhost", "::1"].includes(host)) {
    try {
      audit.emit({ at: new Date().toISOString(), actorId: "kepta-core", action: "egress", detail: { host, model, count: inputs.length } });
    } catch {
      // egress journal must never break embeddings
    }
  }
  if (inputs.length === 0) return { ok: true, embeddings: [], model };
  try {
    const res = await fetch(`${base}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: inputs }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      return { ok: false, embeddings: [], model, error: `Ollama ${res.status}` };
    }
    const data = (await res.json()) as { embeddings?: number[][] };
    const vecs = (data.embeddings ?? []).map((e) => Float32Array.from(e));
    if (vecs.length !== inputs.length) {
      return { ok: false, embeddings: [], model, error: "Embedding count does not match" };
    }
    return { ok: true, embeddings: vecs, model };
  } catch (e) {
    return { ok: false, embeddings: [], model, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function embedQuery(text: string, model: string = DEFAULT_EMBED_MODEL): Promise<Float32Array | null> {
  const res = await embedTexts([text], model);
  return res.ok ? (res.embeddings[0] ?? null) : null;
}

export async function ollamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${ollamaBaseUrl()}/api/version`, { signal: AbortSignal.timeout(2_000) });
    return res.ok;
  } catch {
    return false;
  }
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ---------- Hintergrund-Queue ----------

export interface EmbeddingQueueOptions {
  intervalMs?: number;
  batchSize?: number;
  model?: string;
  /** Für Tests: sofortige Ausführung ohne Timer */
  immediate?: boolean;
}

export class EmbeddingQueue {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private opts: Required<Omit<EmbeddingQueueOptions, "immediate">>;
  lastError: string | null = null;
  processed = 0;

  constructor(
    private store: KeptaStore,
    opts: EmbeddingQueueOptions = {}
  ) {
    this.opts = {
      intervalMs: opts.intervalMs ?? 15_000,
      batchSize: opts.batchSize ?? 32,
      model: opts.model ?? DEFAULT_EMBED_MODEL,
    };
  }

  start(immediate = false): void {
    if (this.timer) return;
    if (immediate) void this.tick();
    this.timer = setInterval(() => void this.tick(), this.opts.intervalMs);
    if (typeof this.timer.unref === "function") this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Verarbeitet eine Runde nicht eingebettete Chunks. Liefert Anzahl. */
  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      // Modell-Argument mitgeben: nach einem Modellwechsel werden Chunks mit
      // altem Modell-Mismatch ebenfalls neu eingebettet (nicht blockierend, Queue im Hintergrund)
      const pending = this.store.chunksNeedingEmbedding(this.opts.batchSize, this.opts.model);
      if (pending.length === 0) return 0;
      const res = await embedTexts(
        pending.map((c) => c.text),
        this.opts.model
      );
      if (!res.ok) {
        this.lastError = res.error ?? "unknown error";
        return 0;
      }
      this.lastError = null;
      pending.forEach((c, i) => {
        const vec = res.embeddings[i];
        if (vec) this.store.setEmbedding(c.memoryId, c.seq, vec, res.model);
      });
      this.processed += pending.length;
      return pending.length;
    } finally {
      this.running = false;
    }
  }

  /** Bettet alle Chunks einer Memory frisch ein (nach create/update). */
  async embedMemory(memoryId: string, texts: string[]): Promise<boolean> {
    this.store.replaceChunks(memoryId, texts);
    const res = await embedTexts(texts, this.opts.model);
    if (!res.ok) {
      this.lastError = res.error ?? "unknown error";
      return false;
    }
    texts.forEach((_, seq) => {
      const vec = res.embeddings[seq];
      if (vec) this.store.setEmbedding(memoryId, seq, vec, res.model);
    });
    return true;
  }
}
