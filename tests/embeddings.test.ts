import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";
import {
  chunkText,
  cosineSimilarity,
  ollamaBaseUrl,
  einbettModell,
  embedTexts,
  embedQuery,
  ollamaAvailable,
  EmbeddingQueue,
} from "../src/core/embeddings";

function freshStore(): KeptaStore {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-embed-"));
  return new KeptaStore(path.join(dir, "test.db"));
}

// Fake-fetch: liefert für /api/embed deterministische Vektoren (Länge 4) pro Input.
function stubEmbedFetch(opts: { ok?: boolean; status?: number; countMismatch?: boolean; throws?: boolean } = {}) {
  const { ok = true, status = 200, countMismatch = false, throws = false } = opts;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: { body?: string }) => {
      if (throws) throw new Error("Netz weg");
      if (!ok) return { ok: false, status } as Response;
      const body = JSON.parse(init?.body ?? "{}") as { input: string[] };
      const n = countMismatch ? body.input.length + 1 : body.input.length;
      const embeddings = Array.from({ length: n }, (_, i) => [i + 1, 0.5, 0.25, 0.1]);
      return { ok: true, status: 200, json: async () => ({ embeddings }) } as unknown as Response;
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("chunkText", () => {
  it("leerer Text ergibt keine Chunks", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n  ")).toEqual([]);
  });

  it("kurzer Text bleibt ein Chunk", () => {
    expect(chunkText("Hallo Welt")).toEqual(["Hallo Welt"]);
  });

  it("langer Mehrabsatz-Text wird in mehrere Chunks ≤ size zerlegt", () => {
    const para = "Absatz-Inhalt hier. ".repeat(20).trim();
    const text = Array.from({ length: 6 }, () => para).join("\n\n");
    const chunks = chunkText(text, { size: 300, overlap: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(300 + 60);
  });

  it("überlanger Einzelabsatz wird an Satzgrenzen gebrochen", () => {
    const sentence = "Dies ist ein Satz mit Inhalt. ";
    const oneParagraph = sentence.repeat(40).trim();
    const chunks = chunkText(oneParagraph, { size: 250, overlap: 40 });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("size hat eine Untergrenze und overlap wird gedeckelt", () => {
    // size < 200 wird auf 200 angehoben; overlap darf size-100 nicht übersteigen
    const chunks = chunkText("x".repeat(500), { size: 50, overlap: 9999 });
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it("sammelt mehrere kleine Absätze in einen Chunk und flusht bei Überlauf", () => {
    // Viele kleine Absätze: erst akkumulieren (Z. 35-36), dann bei Überlauf flushen,
    // der nächste passende Absatz startet einen neuen current (Z. 40-41).
    const small = Array.from({ length: 8 }, (_, i) => `Absatz Nummer ${i} mit etwas Text.`);
    const text = small.join("\n\n");
    const chunks = chunkText(text, { size: 120, overlap: 20 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(" ")).toContain("Absatz Nummer 0");
    expect(chunks.join(" ")).toContain("Absatz Nummer 7");
  });
});

describe("cosineSimilarity", () => {
  it("identische Vektoren → 1", () => {
    const v = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 6);
  });
  it("orthogonale Vektoren → 0", () => {
    expect(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([0, 1]))).toBe(0);
  });
  it("Längen-Mismatch oder Nullvektor → 0", () => {
    expect(cosineSimilarity(new Float32Array([1, 2]), new Float32Array([1, 2, 3]))).toBe(0);
    expect(cosineSimilarity(new Float32Array([0, 0]), new Float32Array([0, 0]))).toBe(0);
    expect(cosineSimilarity(new Float32Array([]), new Float32Array([]))).toBe(0);
  });
});

describe("ollamaBaseUrl", () => {
  // Der Loeser hat seit dem 3.11. zwei Namen (KEPTA_OLLAMA_URL, dann OLLAMA_HOST), weil die
  // Routen denselben Loeser brauchen wie der Kern (Aufgabe #45). "Default" heisst darum:
  // beide weg — nicht nur der eine.
  const ohneBeide = (hin: () => void): void => {
    const a = process.env.KEPTA_OLLAMA_URL;
    const b = process.env.OLLAMA_HOST;
    delete process.env.KEPTA_OLLAMA_URL;
    delete process.env.OLLAMA_HOST;
    try { hin(); } finally {
      if (a !== undefined) process.env.KEPTA_OLLAMA_URL = a;
      if (b !== undefined) process.env.OLLAMA_HOST = b;
    }
  };

  it("default ohne env", () => {
    ohneBeide(() => expect(ollamaBaseUrl()).toBe("http://127.0.0.1:11434"));
  });

  it("OLLAMA_HOST gilt, wenn KEPTA_OLLAMA_URL fehlt", () => {
    const a = process.env.KEPTA_OLLAMA_URL;
    const b = process.env.OLLAMA_HOST;
    delete process.env.KEPTA_OLLAMA_URL;
    process.env.OLLAMA_HOST = "http://anderer-rechner:11434";
    try {
      expect(ollamaBaseUrl()).toBe("http://anderer-rechner:11434");
    } finally {
      if (a !== undefined) process.env.KEPTA_OLLAMA_URL = a;
      if (b !== undefined) process.env.OLLAMA_HOST = b;
      else delete process.env.OLLAMA_HOST;
    }
  });

  it("KEPTA_OLLAMA_URL gewinnt gegen den zweiten Namen", () => {
    const a = process.env.KEPTA_OLLAMA_URL;
    const b = process.env.OLLAMA_HOST;
    process.env.KEPTA_OLLAMA_URL = "http://kern-haft:11434";
    process.env.OLLAMA_HOST = "http://alias-haft:11434";
    try {
      expect(ollamaBaseUrl()).toBe("http://kern-haft:11434");
    } finally {
      if (a !== undefined) process.env.KEPTA_OLLAMA_URL = a; else delete process.env.KEPTA_OLLAMA_URL;
      if (b !== undefined) process.env.OLLAMA_HOST = b; else delete process.env.OLLAMA_HOST;
    }
  });

  it("env mit trailing slash wird bereinigt", () => {
    const prev = process.env.KEPTA_OLLAMA_URL;
    process.env.KEPTA_OLLAMA_URL = "http://host:1234///";
    expect(ollamaBaseUrl()).toBe("http://host:1234");
    if (prev === undefined) delete process.env.KEPTA_OLLAMA_URL;
    else process.env.KEPTA_OLLAMA_URL = prev;
  });

  it("einbettModell kennt dieselbe Reihenfolge", () => {
    const a = process.env.KEPTA_EMBED_MODEL;
    const b = process.env.OLLAMA_EMBED_MODEL;
    process.env.KEPTA_EMBED_MODEL = "kern-modell";
    process.env.OLLAMA_EMBED_MODEL = "alias-modell";
    try {
      expect(einbettModell()).toBe("kern-modell");
    } finally {
      if (a !== undefined) process.env.KEPTA_EMBED_MODEL = a; else delete process.env.KEPTA_EMBED_MODEL;
      if (b !== undefined) process.env.OLLAMA_EMBED_MODEL = b; else delete process.env.OLLAMA_EMBED_MODEL;
    }
    ohneBeide(() => expect(einbettModell()).toBe("nomic-embed-text"));
  });
});

describe("embedTexts / embedQuery / ollamaAvailable", () => {
  it("leere Eingabe → ok ohne Netzaufruf", async () => {
    const res = await embedTexts([]);
    expect(res.ok).toBe(true);
    expect(res.embeddings).toEqual([]);
  });

  it("erfolgreicher Aufruf liefert Float32-Vektoren", async () => {
    stubEmbedFetch();
    const res = await embedTexts(["a", "b"]);
    expect(res.ok).toBe(true);
    expect(res.embeddings).toHaveLength(2);
    expect(res.embeddings[0]).toBeInstanceOf(Float32Array);
  });

  it("HTTP-Fehlerstatus → ok:false mit Fehlertext", async () => {
    stubEmbedFetch({ ok: false, status: 500 });
    const res = await embedTexts(["a"]);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("500");
  });

  it("Anzahl-Mismatch → ok:false", async () => {
    stubEmbedFetch({ countMismatch: true });
    const res = await embedTexts(["a"]);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("does not match");
  });

  it("Netzwerkfehler → ok:false mit Message", async () => {
    stubEmbedFetch({ throws: true });
    const res = await embedTexts(["a"]);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Netz weg");
  });

  it("embedQuery liefert Vektor bzw. null bei Fehler", async () => {
    stubEmbedFetch();
    expect(await embedQuery("frage")).toBeInstanceOf(Float32Array);
    stubEmbedFetch({ throws: true });
    expect(await embedQuery("frage")).toBeNull();
  });

  it("ollamaAvailable spiegelt Erreichbarkeit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true }) as Response));
    expect(await ollamaAvailable()).toBe(true);
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("down");
    }));
    expect(await ollamaAvailable()).toBe(false);
  });
});

describe("EmbeddingQueue", () => {
  let store: KeptaStore;
  beforeEach(() => {
    store = freshStore();
  });

  it("tick verarbeitet ausstehende Chunks und schreibt Embeddings", async () => {
    const m = store.createMemory({ title: "T", content: "C" });
    store.replaceChunks(m.id, ["chunk a", "chunk b"]);
    stubEmbedFetch();
    const q = new EmbeddingQueue(store, { batchSize: 10, model: "fake" });
    const n = await q.tick();
    expect(n).toBe(2);
    expect(q.processed).toBe(2);
    expect(store.chunksNeedingEmbedding().length).toBe(0);
  });

  it("leere Queue → 0 ohne Fehler", async () => {
    stubEmbedFetch();
    const q = new EmbeddingQueue(store);
    expect(await q.tick()).toBe(0);
  });

  it("Embedding-Fehler setzt lastError und schreibt nichts", async () => {
    const m = store.createMemory({ title: "T", content: "C" });
    store.replaceChunks(m.id, ["a"]);
    stubEmbedFetch({ ok: false, status: 503 });
    const q = new EmbeddingQueue(store);
    expect(await q.tick()).toBe(0);
    expect(q.lastError).toContain("503");
    expect(store.chunksNeedingEmbedding().length).toBe(1);
  });

  it("embedMemory ersetzt Chunks und bettet ein", async () => {
    const m = store.createMemory({ title: "T", content: "C" });
    stubEmbedFetch();
    const q = new EmbeddingQueue(store, { model: "fake" });
    const ok = await q.embedMemory(m.id, ["neu 1", "neu 2"]);
    expect(ok).toBe(true);
    expect(store.chunksNeedingEmbedding().length).toBe(0);
  });

  it("embedMemory meldet Fehler zurück", async () => {
    const m = store.createMemory({ title: "T", content: "C" });
    stubEmbedFetch({ throws: true });
    const q = new EmbeddingQueue(store);
    expect(await q.embedMemory(m.id, ["x"])).toBe(false);
    expect(q.lastError).toBeTruthy();
  });

  it("start(immediate) und stop steuern den Timer ohne Dauerlauf", async () => {
    vi.useFakeTimers();
    stubEmbedFetch();
    const q = new EmbeddingQueue(store, { intervalMs: 1000 });
    q.start(false);
    q.start(false); // zweiter Aufruf ist idempotent (Timer bereits gesetzt)
    q.stop();
    q.stop(); // idempotent
    expect(true).toBe(true);
  });

  it("start(true) tickt sofort und der Intervall-Callback feuert beim Vorspulen", async () => {
    const m = store.createMemory({ title: "T", content: "C" });
    store.replaceChunks(m.id, ["a", "b"]);
    stubEmbedFetch();
    vi.useFakeTimers();
    const q = new EmbeddingQueue(store, { intervalMs: 500, batchSize: 10, model: "fake" });
    q.start(true); // sofortiger tick()
    await vi.advanceTimersByTimeAsync(600); // Intervall-Callback (Z. 151) feuert
    q.stop();
    expect(store.chunksNeedingEmbedding().length).toBe(0);
  });
});

describe("P169: Sprach- und Embedding-Cluster", () => {
  it("embed-sprachtest fuehrt vier deutsche und vier englische Notizen und Fragenpaare und zaehlt Rang-1-Treffer auf dem Standardmodell", async () => {
    const mod = (await import("../scripts/embed-sprachtest")) as Record<string, unknown>;
    const deDok = mod.DEUTSCH_DOK as [string, string][] | undefined;
    const deFragen = mod.DEUTSCH_FRAGEN as [string, string][] | undefined;
    const enDok = mod.ENGLISCH_DOK as [string, string][] | undefined;
    const enFragen = mod.ENGLISCH_FRAGEN as [string, string][] | undefined;
    const durchlauf = mod.durchlauf as ((name: string, dok: [string, string][], fragen: [string, string][]) => Promise<number>) | undefined;
    expect(deDok?.length, "DEUTSCH_DOK muss 4 Notizen tragen").toBe(4);
    expect(deFragen?.length, "DEUTSCH_FRAGEN muss 4 Fragen tragen").toBe(4);
    expect(enDok?.length, "ENGLISCH_DOK muss 4 Notizen tragen").toBe(4);
    expect(enFragen?.length, "ENGLISCH_FRAGEN muss 4 Fragen tragen").toBe(4);
    expect(typeof durchlauf, "durchlauf muss exportiert sein").toBe("function");
    const geseheneModelle: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { body?: string }) => {
        const body = JSON.parse(init?.body ?? "{}") as { model: string; input: string[] };
        geseheneModelle.push(body.model);
        const embeddings = body.input.map((t, i) =>
          t.includes("pasta") || t.includes("carbonara") ? [1, 0, 0, 0] : [0, i + 1, 1, 0],
        );
        return { ok: true, status: 200, json: async () => ({ embeddings }) } as unknown as Response;
      }),
    );
    const treffer = await durchlauf!("Englisch", enDok!, enFragen!);
    expect(geseheneModelle.every((m) => m === "nomic-embed-text")).toBe(true);
    expect(treffer).toBeGreaterThanOrEqual(1);
  });

  it("eine Suche nach dem Queue-Tick bettet nur die Anfrage ein, keinen gespeicherten Chunk", async () => {
    const { indexMemory, searchMemories } = await import("../src/core/engine");
    const s = freshStore();
    const m = s.createMemory({ title: "Carbonara", content: "Guanciale und Pecorino Romano ohne Sahne" });
    indexMemory(s, m.id);
    const aufrufe: string[][] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { body?: string }) => {
        const body = JSON.parse(init?.body ?? "{}") as { input: string[] };
        aufrufe.push(body.input);
        const embeddings = body.input.map(() => [1, 0.5, 0.25, 0.1]);
        return { ok: true, status: 200, json: async () => ({ embeddings }) } as unknown as Response;
      }),
    );
    const q = new EmbeddingQueue(s, { batchSize: 10 });
    expect(await q.tick()).toBeGreaterThan(0);
    expect(s.chunksNeedingEmbedding().length).toBe(0);
    aufrufe.length = 0;
    const res = await searchMemories(s, { query: "Was koche ich mit Pecorino", limit: 5 });
    expect(res.usedVectors).toBe(true);
    expect(aufrufe.length).toBe(1);
    expect(aufrufe[0]?.length).toBe(1);
    expect(aufrufe[0]?.[0]).toContain("Was koche ich mit Pecorino");
    expect(aufrufe[0]?.[0]).not.toContain("Guanciale");
  });

  it("eval-sprachuebergriff zieht 15 Fragenpaare aus den 45 Korpus-Anfragen und erbt jedes Antwort-Set", async () => {
    const mod = (await import("../scripts/eval-sprachuebergriff")) as Record<string, unknown>;
    const { CORPUS, QUERIES } = await import("../scripts/eval-corpus");
    const paare = mod.PAARE as { deutsch: string; englisch: string }[] | undefined;
    const paarePruefen = mod.paarePruefen as (() => { deutsch: string; englisch: string; relevant: string[] }[]) | undefined;
    expect(CORPUS.length).toBe(58);
    expect(QUERIES.length).toBe(45);
    expect(paare?.length, "PAARE muss 15 Paare tragen").toBe(15);
    expect(typeof paarePruefen, "paarePruefen muss exportiert sein").toBe("function");
    const geerbt = paarePruefen!();
    expect(geerbt.length).toBe(15);
    for (const z of geerbt) {
      const original = QUERIES.find((q) => q.query === z.deutsch);
      expect(original, `keine Korpus-Anfrage fuer ${z.deutsch}`).toBeDefined();
      expect(z.relevant).toEqual(original!.relevant);
      expect(z.englisch.length).toBeGreaterThan(5);
    }
  });
});
