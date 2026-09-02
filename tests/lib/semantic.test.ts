// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  tokenize,
  tokenizeMemory,
  hybridSearch,
  scoreTexts,
  fetchEmbeddings,
  hybridSearchWithEmbeddings,
} from "../../src/lib/semantic";
import type { Memory } from "../../src/types";

function mem(id: string, title: string, content: string, tags: string[] = [], updatedAt = 0): Memory {
  return { id, userId: "local", title, content, tags, createdAt: 0, updatedAt };
}

const corpus: Memory[] = [
  mem("1", "Rust Backend", "Speichersicherheit ohne Garbage Collector", ["rust"], 100),
  mem("2", "Kochen", "Spaghetti Carbonara mit Pecorino", ["kochen"], 200),
  mem("3", "Rust oder Go", "Speichersicherheit gegen Einfachheit", ["rust"], 300),
];

afterEach(() => vi.unstubAllGlobals());

describe("tokenize", () => {
  it("entfernt Stopwords und kurze Tokens", () => {
    const toks = tokenize("Der die das Rust Backend");
    expect(toks).toContain("rust");
    expect(toks).toContain("backend");
    expect(toks).not.toContain("der");
  });

  it("behält Stopwords wenn deaktiviert", () => {
    const toks = tokenize("der Rust", { removeStopwords: false });
    expect(toks).toContain("der");
  });

  it("erzeugt Bigramme bei ngram=2", () => {
    const toks = tokenize("Rust Backend Performance", { ngram: 2 });
    expect(toks.some((t) => t.includes("_"))).toBe(true);
  });

  it("leerer Text → leeres Array", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("tokenizeMemory nutzt Titel + Inhalt", () => {
    const toks = tokenizeMemory(corpus[0]);
    expect(toks).toContain("rust");
    expect(toks).toContain("speichersicherheit");
  });
});

describe("hybridSearch", () => {
  it("rankt lexikalisch relevante Treffer nach vorn", () => {
    const res = hybridSearch(corpus, "Speichersicherheit Rust", 5);
    expect(res.length).toBeGreaterThan(0);
    expect(["1", "3"]).toContain(res[0]?.memory.id);
    expect(res[0]?.matchedTerms.length).toBeGreaterThan(0);
  });

  it("leere Query → Recency-Liste", () => {
    const res = hybridSearch(corpus, "", 2);
    expect(res).toHaveLength(2);
    expect(res[0]?.memory.updatedAt).toBeGreaterThanOrEqual(res[1]?.memory.updatedAt ?? 0);
  });

  it("leeres Korpus → leeres Ergebnis", () => {
    expect(hybridSearch([], "irgendwas")).toEqual([]);
  });

  it("Query nur aus Stopwords → Recency-Fallback", () => {
    const res = hybridSearch(corpus, "der die das", 2);
    expect(res).toHaveLength(2);
  });

  it("kein Treffer → leeres Array", () => {
    const res = hybridSearch(corpus, "Quantenphysik Teilchenbeschleuniger", 5);
    expect(res).toEqual([]);
  });
});

describe("scoreTexts", () => {
  it("liefert Index+Score für rohe Texte", () => {
    const res = scoreTexts(["Rust Speicher", "Pasta Sauce", "Rust Sicherheit"], "Rust", 3);
    expect(res.length).toBeGreaterThan(0);
    expect(res[0]).toHaveProperty("index");
    expect(res[0]).toHaveProperty("bm25");
  });
});

describe("fetchEmbeddings", () => {
  it("leere Eingabe → []", async () => {
    expect(await fetchEmbeddings([])).toEqual([]);
  });

  it("liefert embeddings-Array bei Erfolg", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ embeddings: [[1, 2], [3, 4]] }) }) as unknown as Response));
    expect(await fetchEmbeddings(["a", "b"])).toEqual([[1, 2], [3, 4]]);
  });

  it("unterstützt Einzel-embedding-Form", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ embedding: [9, 9] }) }) as unknown as Response));
    expect(await fetchEmbeddings(["a"])).toEqual([[9, 9]]);
  });

  it("null bei !ok oder Netzwerkfehler", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false }) as Response));
    expect(await fetchEmbeddings(["a"])).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("weg");
    }));
    expect(await fetchEmbeddings(["a"])).toBeNull();
  });
});

describe("hybridSearchWithEmbeddings", () => {
  it("fällt ohne Embeddings auf lokale Suche zurück", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false }) as Response));
    const res = await hybridSearchWithEmbeddings(corpus, "Rust", 5);
    expect(res.length).toBeGreaterThan(0);
  });

  it("kombiniert Embedding-Scores wenn verfügbar", async () => {
    // 1 Query + 3 Docs → 4 Vektoren. Query nah an Doc 1/3 (Rust).
    const vecs = [
      [1, 0], // query
      [1, 0], // doc1 rust → identisch
      [0, 1], // doc2 kochen → orthogonal
      [1, 0], // doc3 rust → identisch
    ];
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ embeddings: vecs }) }) as unknown as Response));
    const res = await hybridSearchWithEmbeddings(corpus, "Rust", 3);
    expect(res.length).toBeGreaterThan(0);
    expect(["1", "3"]).toContain(res[0]?.memory.id);
  });

  it("leere Query → lokale Recency-Ergebnisse", async () => {
    const res = await hybridSearchWithEmbeddings(corpus, "", 2);
    expect(res.length).toBeLessThanOrEqual(2);
  });
});
