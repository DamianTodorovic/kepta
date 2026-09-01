import { describe, it, expect, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";
import { searchMemories, indexMemory, consolidateMemories } from "../src/core/engine";

function freshStore(): KeptaStore {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-engine-"));
  return new KeptaStore(path.join(dir, "test.db"));
}

// Fake-Embeddings: "thesaurus"-Vektoren aus Worthashes — Wörter mit gemeinsamem
// Stamm landen nah beieinander, sodass die Vektor-Bein ohne Ollama testbar ist.
function fakeVec(text: string): Float32Array {
  const v = new Float32Array(16);
  for (const w of text.toLowerCase().split(/\W+/)) {
    if (!w) continue;
    v[w.length % 16] += 1;
    v[(w.charCodeAt(0) + w.charCodeAt(w.length - 1)) % 16] += 1;
  }
  return v;
}

// engine.embedQuery läuft über Ollama — für Tests injecten wir Vektoren direkt in die Chunks.
function seedEmbeddings(store: KeptaStore, model = "fake-model") {
  const pending = store.chunksNeedingEmbedding(500);
  for (const c of pending) store.setEmbedding(c.memoryId, c.seq, fakeVec(c.text), model);
}

describe("searchMemories (RRF-Fusion)", () => {
  let store: KeptaStore;
  beforeEach(() => {
    store = freshStore();
    const a = store.createMemory({ title: "Rust Backend", content: "Speichersicherheit und Performance ohne Garbage Collector", tags: ["rust"], updatedAt: 1000 });
    const b = store.createMemory({ title: "Kochen", content: "Spaghetti Carbonara mit Pecorino", tags: ["kochen"], updatedAt: 2000 });
    const c = store.createMemory({ title: "Rust oder Go", content: "Speichersicherheit in Rust gegen Einfachheit in Go", tags: ["rust"], updatedAt: 3000 });
    for (const id of [a.id, b.id, c.id]) indexMemory(store, id);
    seedEmbeddings(store);
  });

  it("rankt lexikalisch relevantes vorder", async () => {
    const res = await searchMemories(store, { query: "Speichersicherheit Rust", limit: 5 });
    expect(res.hits.length).toBeGreaterThan(0);
    expect(res.hits[0]?.memory.content).toContain("Speichersicherheit");
    expect(res.hits[0]?.components.bm25Rank).not.toBeNull();
  });

  it("leere Query liefert Recency-Liste", async () => {
    const res = await searchMemories(store, { query: "", limit: 2 });
    expect(res.hits).toHaveLength(2);
    expect(res.hits[0]?.memory.updatedAt).toBeGreaterThanOrEqual(res.hits[1]?.memory.updatedAt ?? 0);
  });

  it("filtert nach Tag (AND) und Typ", async () => {
    const res = await searchMemories(store, { query: "Rust", tags: ["kochen"] });
    expect(res.hits).toHaveLength(0);
    const res2 = await searchMemories(store, { query: "Rust", type: "procedural" });
    expect(res2.hits).toHaveLength(0);
  });

  it("markiert abgelaufene und ersetzte Memories und stuft sie herab", async () => {
    store.createMemory({ title: "Wohnort", content: "Berlin Mitte", validTo: Date.now() - 1000, updatedAt: 9000 });
    store.createMemory({ title: "Wohnort aktuell", content: "München Schwabing", validFrom: Date.now(), updatedAt: 8000 });
    seedEmbeddings(store);

    const res = await searchMemories(store, { query: "Wohnort" });
    const expired = res.hits.find((h) => h.memory.content.includes("Berlin"));
    const fresh = res.hits.find((h) => h.memory.content.includes("München"));
    expect(expired?.expired).toBe(true);
    expect(fresh?.expired).toBe(false);
    // Abgelaufene wird trotz neuerem updatedAt durch Temporal-Faktor herabgestuft
    expect(expired!.score).toBeLessThan(fresh!.score);
  });

  it("Entity-Bein findet Memories über Entitätsnamen", async () => {
    const m = store.createMemory({ title: "Projekt KEPTA", content: "Das Gehirn für Agenten" });
    indexMemory(store, m.id);
    store.linkEntities(m.id, ["kepta-projekt"]);
    seedEmbeddings(store);
    const res = await searchMemories(store, { query: "was ist kepta-projekt" });
    expect(res.hits.some((h) => h.memory.id === m.id)).toBe(true);
    expect(res.hits.find((h) => h.memory.id === m.id)?.components.entityRank).not.toBeNull();
  });
});

describe("indexMemory + Chunks", () => {
  it("erzeugt Chunks inkl. Titel-/Tag-Chunk und zerlegt lange Texte", () => {
    const store = freshStore();
    const long = "Absatz eins. ".repeat(200);
    const m = store.createMemory({ title: "Lang", content: long, tags: ["test"] });
    indexMemory(store, m.id);
    const chunks = store.getChunks(m.id);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0]?.text).toContain("Lang");
  });
});

describe("consolidateMemories", () => {
  it("findet Embedding-Dubletten und supersede ohne Löschen (dryRun=false)", async () => {
    const store = freshStore();
    const a = store.createMemory({ title: "Server Passwort", content: "Das Server-Passwort ist huntert2", createdAt: 1, updatedAt: 1 });
    const b = store.createMemory({ title: "Server Passwort (Kopie)", content: "Das Server-Passwort ist huntert2", createdAt: 2, updatedAt: 2 });
    indexMemory(store, a.id);
    indexMemory(store, b.id);
    seedEmbeddings(store); // identischer Text → identische Vektoren

    const dry = await consolidateMemories(store, { dryRun: true });
    expect(dry.candidates.length).toBeGreaterThan(0);
    expect(dry.applied).toBe(0);

    const applied = await consolidateMemories(store, { dryRun: false });
    expect(applied.applied).toBeGreaterThan(0);
    // Die ältere wird ersetzt markiert, bleibt aber erhalten
    const superseded = [a, b].map((m) => store.getMemory(m.id)).find((r) => r?.supersededBy);
    expect(superseded).toBeDefined();
    expect(store.countMemories().active).toBe(2);
  });
});
