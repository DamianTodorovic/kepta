import { describe, it, expect, beforeEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../../src/core/store";
import { indexMemory, searchMemories } from "../../src/core/engine";
import { DEFAULT_EMBED_MODEL } from "../../src/core/embeddings";

// Ohne den Schalter laesst sich nicht messen, was die Fusion beitraegt — und ohne
// diese Messung ist "Reciprocal Rank Fusion at k=60" nur Vokabular. Der Schalter
// darf das Normalverhalten nicht veraendern: fehlt er, laufen alle drei Beine.
vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));

let store: KeptaStore;
beforeEach(() => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-ablation-"));
  store = new KeptaStore(path.join(dir, "test.db"));
  store.createMemory({ title: "Carbonara", content: "Guanciale, Pecorino, Eigelb. Keine Sahne. [[Roemische Kueche]]" } as never);
  store.createMemory({ title: "Cacio e pepe", content: "Pecorino und Pfeffer. [[Roemische Kueche]]" } as never);
});

describe("Ablation: einzelne Beine abschaltbar", () => {
  it("ohne Angabe laufen alle Beine — das Normalverhalten aendert sich nicht", async () => {
    const res = await searchMemories(store, { query: "guanciale" });
    expect(res.hits.length).toBeGreaterThan(0);
  });

  it("nur BM25 liefert weiterhin Treffer", async () => {
    const res = await searchMemories(store, { query: "guanciale", tracks: { bm25: true, vector: false, entity: false } });
    expect(res.hits.length).toBeGreaterThan(0);
    expect(res.hits[0]!.memory.title).toBe("Carbonara");
  });

  it("alle Beine aus: keine Treffer, aber kein Absturz", async () => {
    const res = await searchMemories(store, { query: "guanciale", tracks: { bm25: false, vector: false, entity: false } });
    expect(res.hits).toEqual([]);
  });

  it("das Entity-Bein allein findet ueber den Graphen, nicht ueber Woerter", async () => {
    // Wichtig: [[Wiki-Links]] werden in der MCP-Schicht ausgewertet, nicht in
    // createMemory. Wer direkt ueber den Store anlegt, muss die Verknuepfung
    // selbst setzen — genau das tut auch der Eval-Korpus nicht, weshalb das
    // Entity-Bein dort nichts beitraegt.
    const alle = store.listMemories({ limit: 10 });
    for (const m of alle) store.linkEntities(m.id, ["Roemische Kueche"]);

    const res = await searchMemories(store, { query: "Roemische Kueche", tracks: { bm25: false, vector: false, entity: true } });
    expect(res.hits.length).toBeGreaterThan(0);
  });

  it("P176 (P120): das Vektor-Bein schweigt nicht, wenn die beste positive Aehnlichkeit unter VECTOR_FLOOR (0,58) liegt", async () => {
    const alle = store.listMemories({ limit: 10 });
    const carbonara = alle.find((m) => m.title === "Carbonara")!;
    const cacio = alle.find((m) => m.title === "Cacio e pepe")!;
    indexMemory(store, carbonara.id);
    indexMemory(store, cacio.id);
    // Anfrage-Vektor [1, 0]: Cosinus zu Carbonara = 0,50 (< VECTOR_FLOOR 0,58), zu Cacio = 0,20 (< 0,50).
    store.setEmbedding(carbonara.id, 0, new Float32Array([0.5, Math.sqrt(1 - 0.5 * 0.5)]), DEFAULT_EMBED_MODEL);
    store.setEmbedding(cacio.id, 0, new Float32Array([0.2, Math.sqrt(1 - 0.2 * 0.2)]), DEFAULT_EMBED_MODEL);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ embeddings: [[1, 0]] }) })),
    );

    const res = await searchMemories(store, {
      query: "What can I cook with pasta?",
      tracks: { bm25: false, vector: true, entity: false },
    });
    expect(res.hits.map((h) => h.memory.title)).toEqual(["Carbonara"]);
  });

  it("P176 (P120): bei fehlender positiver Aehnlichkeit (bestSim <= 0, auch orthogonal 0) bleibt das Vektor-Bein leer", async () => {
    const alle = store.listMemories({ limit: 10 });
    const carbonara = alle.find((m) => m.title === "Carbonara")!;
    const cacio = alle.find((m) => m.title === "Cacio e pepe")!;
    indexMemory(store, carbonara.id);
    indexMemory(store, cacio.id);
    // Anfrage-Vektor [1, 0]: Cosinus zu Carbonara = 0,00 (orthogonal), zu Cacio = -0,50 (gegenlaeufig).
    store.setEmbedding(carbonara.id, 0, new Float32Array([0, 1]), DEFAULT_EMBED_MODEL);
    store.setEmbedding(cacio.id, 0, new Float32Array([-0.5, Math.sqrt(1 - 0.5 * 0.5)]), DEFAULT_EMBED_MODEL);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ embeddings: [[1, 0]] }) })),
    );

    const res = await searchMemories(store, {
      query: "orthogonal oder gegenlaeufig",
      tracks: { bm25: false, vector: true, entity: false },
    });
    expect(res.hits).toEqual([]);
  });
});

// P182: die Regel unter den Stimmen. Der P176-Boden-Flicken hat das Vektor-Bein
// geweckt, und die Nachmessung (konkurrenz-0911d) zeigte den Preis: unter dem
// Boden bekam seine Stimme volles RRF-Gewicht und verdraengte die Wort-Stimme
// („Was koche ich mit Nudeln?", „React Build Setup"). Zwei Faelle halten die
// Regel: unter dem Boden gilt die Vektor-Stimme nur, wenn keine andere spricht;
// bei RRF-Gleichstand gewinnt die bessere Vektor-Position.
describe("P182: die Regel unter den Stimmen", () => {
  it("unter dem Boden verdraengt die schwache Vektor-Stimme die Wort-Stimme nicht mehr (Nudeln-Regel)", async () => {
    const ziel = store.createMemory({ title: "Schutzwort-Ziel", content: "Ein Text, der das Schutzwort traegt. Schutzwort." });
    const schwach = store.createMemory({ title: "Schwacher Vektor", content: "Ein Text, der nur das Ersatzwort traegt." });
    indexMemory(store, ziel.id);
    indexMemory(store, schwach.id);
    // Anfrage [1,0]: Vektor zum schwachen Kandidaten = 0,50 (unter dem Boden 0,58), zum Ziel = 0.
    store.setEmbedding(schwach.id, 0, new Float32Array([0.5, Math.sqrt(1 - 0.5 * 0.5)]), DEFAULT_EMBED_MODEL);
    store.setEmbedding(ziel.id, 0, new Float32Array([0, 1]), DEFAULT_EMBED_MODEL);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ embeddings: [[1, 0]] }) })));
    const res = await searchMemories(store, { query: "Schutzwort Ersatzwort", tracks: { bm25: true, vector: true, entity: false } });
    // Das Ziel (Wort r1, tf 2) muss gewinnen; der schwache Kandidat (Vektor r1,
    // Wort r2) darf nicht mit zwei Halb-Stimmen an ihm vorbeiziehen.
    expect(res.hits[0]!.memory.id).toBe(ziel.id);
    // Das Vektor-Bein schweigt trotzdem nicht: der Kandidat bleibt in der Liste.
    expect(res.usedVectors).toBe(true);
    expect(res.hits.map((h) => h.memory.id)).toContain(schwach.id);
  });

});
