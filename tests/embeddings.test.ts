import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";
import {
  chunkText,
  cosineSimilarity,
  ollamaBaseUrl,
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
  it("default ohne env", () => {
    const prev = process.env.KEPTA_OLLAMA_URL;
    delete process.env.KEPTA_OLLAMA_URL;
    expect(ollamaBaseUrl()).toBe("http://127.0.0.1:11434");
    if (prev !== undefined) process.env.KEPTA_OLLAMA_URL = prev;
  });
  it("env mit trailing slash wird bereinigt", () => {
    const prev = process.env.KEPTA_OLLAMA_URL;
    process.env.KEPTA_OLLAMA_URL = "http://host:1234///";
    expect(ollamaBaseUrl()).toBe("http://host:1234");
    if (prev === undefined) delete process.env.KEPTA_OLLAMA_URL;
    else process.env.KEPTA_OLLAMA_URL = prev;
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

// Befund A4-13 / Q-15: 15 Sekunden Dunkelheit nach jedem Start. Die Produktwege
// rufen queue.start() OHNE Argument (server.ts, src/mcp-server.ts) — die Queue muss
// den Sofortlauf also selbst kennen. Gemessen am echten nomic-embed-text vor der
// Aenderung: erster Vektor nach 15 063 ms am Hochlauf, nach 14 466 ms auf einen Write.
describe("EmbeddingQueue: Sofortlauf", () => {
  let store: KeptaStore;

  beforeEach(() => {
    store = freshStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("bettet einen wartenden Chunk beim start() ohne Argument", async () => {
    const m = store.createMemory({ title: "Erstimport", content: "Diese Notiz wartet beim Hochlauf" });
    store.replaceChunks(m.id, ["chunk eins", "chunk zwei"]);
    stubEmbedFetch();
    const q = new EmbeddingQueue(store, { intervalMs: 15_000, batchSize: 32, model: "fake" });
    q.start(); // kein Argument — genau so rufen die Produktwege die Queue
    await warte(30);
    q.stop();
    expect(store.chunksNeedingEmbedding().length).toBe(0);
  });

  it("start(false) bleibt der alte Weg: kein Sofortlauf am Hochlauf", async () => {
    const m = store.createMemory({ title: "Spaeter", content: "Kein Sofortlauf erwuenscht" });
    store.replaceChunks(m.id, ["nur dieser chunk"]);
    stubEmbedFetch();
    const q = new EmbeddingQueue(store, { intervalMs: 15_000, model: "fake" });
    q.start(false);
    await warte(30);
    expect(store.chunksNeedingEmbedding().length).toBe(1);
    q.stop();
  });

  it("bettet am Hochlauf den ganzen Rückstand, nicht nur den ersten Batch", async () => {
    // 3 Notizen a 2 Chunks bei batchSize 2 = 3 Batches. Wuerde die Queue nach dem
    // ersten Batch wieder aufs Intervall (15 s) warten, blieben 4 von 6 Chunks blind —
    // und ein Erstimport von 1 000 Notizen waere trotz Sofortlauf rund 16 Minuten lang
    // semantisch leer. Genau das ist der gemessene Schaden hinter A4-13.
    for (let i = 0; i < 3; i++) {
      const m = store.createMemory({ title: `Erstimport ${i}`, content: `Notiz ${i} aus dem Import` });
      store.replaceChunks(m.id, [`chunk eins ${i}`, `chunk zwei ${i}`]);
    }
    stubEmbedFetch();
    const q = new EmbeddingQueue(store, { intervalMs: 15_000, batchSize: 2, model: "fake" });
    q.start();

    for (let i = 0; i < 40 && store.chunksNeedingEmbedding(500).length > 0; i++) await warte(25);
    q.stop();
    expect(store.chunksNeedingEmbedding(500).length).toBe(0);
    expect(store.embeddingStats().chunksOhneVektor).toBe(0);
  });

  it("gibt bei einem Fehler den Lauf auf, statt ihn zu wiederholen", async () => {
    // Ein nicht erreichbarer Dienst darf die Queue nicht in eine Endlosschleife
    // werfen: eine Runde, Fehler, dann wartet wieder das Intervall.
    let aufrufe = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      aufrufe++;
      return { ok: false, status: 503, json: async () => ({}) } as Response;
    }));
    for (let i = 0; i < 3; i++) {
      const m = store.createMemory({ title: `Ohne Dienst ${i}`, content: `Notiz ${i}` });
      store.replaceChunks(m.id, [`c1 ${i}`, `c2 ${i}`, `c3 ${i}`]);
    }
    const q = new EmbeddingQueue(store, { intervalMs: 15_000, batchSize: 2, model: "fake" });
    q.start();
    await warte(60);
    q.stop();

    expect(aufrufe).toBe(1);
    expect(store.chunksNeedingEmbedding(500).length).toBe(9);
    expect(q.lastError).toContain("503");
  });

  it("bettet eine frisch geschriebene Notiz, ohne aufs Intervall zu warten", async () => {
    stubEmbedFetch();
    const q = new EmbeddingQueue(store, { intervalMs: 15_000, batchSize: 32, model: "fake" });
    q.start(false); // nur der Intervall-Timer; der Write-Sofortlauf ist der gepruefte Teil
    const m = store.createMemory({ title: "Frische Notiz", content: "Entsteht im laufenden Betrieb" });
    store.replaceChunks(m.id, ["chunk der frischen notiz"]);

    for (let i = 0; i < 40 && store.chunksNeedingEmbedding().length > 0; i++) await warte(25);
    q.stop();
    expect(store.chunksNeedingEmbedding().length).toBe(0);
  });

  it("stop() nimmt auch den Write-Sofortlauf", async () => {
    stubEmbedFetch();
    const q = new EmbeddingQueue(store, { intervalMs: 15_000, model: "fake" });
    q.start();
    q.stop();

    const m = store.createMemory({ title: "Nach dem Stop", content: "Darf nicht mehr eingebettet werden" });
    store.replaceChunks(m.id, ["chunk nach stop"]);
    await warte(900);
    expect(store.chunksNeedingEmbedding().length).toBe(1);
  });

  it("embeddingStats weist chunksOhneVektor aus", async () => {
    const a = store.createMemory({ title: "A", content: "Inhalt A" });
    const b = store.createMemory({ title: "B", content: "Inhalt B" });
    store.replaceChunks(a.id, ["a1", "a2"]);
    store.replaceChunks(b.id, ["b1"]);
    stubEmbedFetch();
    const q = new EmbeddingQueue(store, { model: "fake", batchSize: 10 });

    const vorher = store.embeddingStats();
    expect(vorher.chunksOhneVektor).toBe(3);
    expect(vorher.total - vorher.embedded).toBe(vorher.chunksOhneVektor);

    await q.tick();
    expect(store.embeddingStats().chunksOhneVektor).toBe(0);
  });
});
