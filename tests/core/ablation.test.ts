import { describe, it, expect, beforeEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../../src/core/store";
import { searchMemories } from "../../src/core/engine";

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
});
