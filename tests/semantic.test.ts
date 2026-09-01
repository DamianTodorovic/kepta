import { describe, it, expect } from "vitest";
import { tokenize, hybridSearch, scoreTexts } from "../src/lib/semantic";
import type { Memory } from "../src/types";

function mem(partial: Partial<Memory> & { id: string }): Memory {
  return {
    userId: "local",
    title: "",
    content: "",
    tags: [],
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  } as Memory;
}

describe("tokenize", () => {
  it("zerlegt Text, entfernt Stopwörter und normalisiert", () => {
    const toks = tokenize("Die Architektur eines Gehirns ist the best");
    expect(toks).toContain("architektur");
    expect(toks).toContain("gehirns");
    expect(toks).toContain("best");
    expect(toks).not.toContain("die");
    expect(toks).not.toContain("the");
  });

  it("erzeugt Bigramme bei ngram=2", () => {
    const toks = tokenize("Wissensgraph Retrieval", { ngram: 2 });
    expect(toks).toContain("wissensgraph_retrieval");
  });

  it("läßt Umlaute zu", () => {
    expect(tokenize("Größenveränderung")).toContain("größenveränderung");
  });
});

describe("hybridSearch", () => {
  const memories: Memory[] = [
    mem({ id: "1", title: "Rust Backend", content: "Performance kritische Dienste in Rust", tags: ["rust", "backend"], updatedAt: 100 }),
    mem({ id: "2", title: "Rezepte", content: "Spaghetti Carbonara mit viel Pecorino", tags: ["kochen"], updatedAt: 200 }),
    mem({ id: "3", title: "Rust versus Go", content: "Speichersicherheit in Rust gegen Einfachheit in Go", tags: ["rust"], updatedAt: 300 }),
  ];

  it("findet relevante Treffer und rankt sie", () => {
    const res = hybridSearch(memories, "Rust Speichersicherheit");
    expect(res.length).toBeGreaterThan(0);
    expect(res[0]!.memory.id).toBe("3");
  });

  it("liefert bei leerer Query die neuesten Memories", () => {
    const res = hybridSearch(memories, "");
    expect(res[0]!.memory.id).toBe("3");
  });

  it("gibt bei keinem Treffer eine leere Liste", () => {
    expect(hybridSearch(memories, "Quantenphysik XYZ")).toEqual([]);
  });

  it("liefert Score-Komponenten zurück", () => {
    const res = hybridSearch(memories, "rust");
    expect(res[0]).toHaveProperty("cosineScore");
    expect(res[0]).toHaveProperty("bm25Score");
    expect(res[0]).toHaveProperty("matchedTerms");
    expect(res[0]!.matchedTerms).toContain("rust");
  });
});

describe("scoreTexts", () => {
  it("scored Strings ohne Memory-Objekte", () => {
    const res = scoreTexts(["Apfel Banane", "Auto Straße", "Zug Schiene"], "Auto", 2);
    expect(res.length).toBe(1);
    expect(res[0]!.index).toBe(1);
    expect(res[0]!.score).toBeGreaterThan(0);
  });
});
