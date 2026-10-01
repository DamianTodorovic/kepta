import { describe, it, expect, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore, float32ToBlob, blobToFloat32, normalizeTags, defaultDataDir, defaultDbPath, newId } from "../src/core/store";

function freshStore(): KeptaStore {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-test-"));
  return new KeptaStore(path.join(dir, "test.db"));
}

describe("KeptaStore CRUD", () => {
  let store: KeptaStore;
  beforeEach(() => {
    store = freshStore();
  });

  it("legt eine Memory an, liest und updated sie", () => {
    const m = store.createMemory({ title: "Rust Backend", content: "Performance in Rust", tags: ["Rust", "Backend"] });
    expect(m.id).toMatch(/^k-/);
    expect(m.tags).toEqual(["rust", "backend"]);
    expect(m.type).toBe("semantic");

    const updated = store.updateMemory(m.id, { content: "Neuer Inhalt", type: "episodic" });
    expect(updated?.content).toBe("Neuer Inhalt");
    expect(updated?.type).toBe("episodic");
    expect(updated?.updatedAt).toBeGreaterThanOrEqual(m.updatedAt);
  });

  it("Papierkorb: trash, restore, purge", () => {
    const m = store.createMemory({ title: "Alt", content: "x" });
    expect(store.trashMemory(m.id)).toBe(true);
    expect(store.listMemories()).toHaveLength(0);
    expect(store.listMemories({ trash: true })).toHaveLength(1);
    expect(store.restoreMemory(m.id)).toBe(true);
    expect(store.listMemories()).toHaveLength(1);
    expect(store.purgeMemory(m.id)).toBe(true);
    expect(store.getMemory(m.id)).toBeNull();
  });

  it("upsert: ohne id legt an, mit bestehender id updated", () => {
    const a = store.upsertMemory({ title: "T", content: "C" });
    expect(a.created).toBe(true);
    const b = store.upsertMemory({ id: a.record.id, title: "T2", content: "C2" });
    expect(b.created).toBe(false);
    expect(b.record.title).toBe("T2");
    expect(store.countMemories().active).toBe(1);
  });

  it("upsert erhält übergebenes updatedAt (Import darf Zeitstempel mitbringen)", () => {
    const a = store.upsertMemory({ title: "T", content: "C", createdAt: 1000, updatedAt: 2000 });
    expect(a.created).toBe(true);
    expect(a.record.createdAt).toBe(1000);
    expect(a.record.updatedAt).toBe(2000);
    const b = store.upsertMemory({ id: a.record.id, title: "T2", content: "C2", updatedAt: 3000 });
    expect(b.created).toBe(false);
    expect(b.record.updatedAt).toBe(3000);
    // Ohne explizites updatedAt gilt weiterhin "jetzt"
    const c = store.upsertMemory({ id: a.record.id, title: "T3", content: "C3" });
    expect(c.record.updatedAt).toBeGreaterThan(3000);
  });

  it("supersede verlinkt alte auf neue Memory", () => {
    const old = store.createMemory({ title: "Wohnort", content: "Hamburg" });
    const neu = store.createMemory({ title: "Wohnort", content: "Leipzig", validFrom: Date.now() });
    store.supersedeMemory(old.id, neu.id);
    expect(store.getMemory(old.id)?.supersededBy).toBe(neu.id);
  });

  it("validiert Tags normalisiert und dedupliziert", () => {
    expect(normalizeTags(["Rust", "rust!!", "RUST", "a", "ok-tag"])).toEqual(["rust", "ok-tag"]);
  });

  it("Content-Update invalidiert Chunks", () => {
    const m = store.createMemory({ title: "T", content: "alter text" });
    store.replaceChunks(m.id, ["alter text"]);
    store.updateMemory(m.id, { content: "neuer text" });
    expect(store.getChunks(m.id)).toHaveLength(0);
  });
});

describe("Chunks & Embeddings", () => {
  it("speichert und liest Float32-Embeddings roundtrip-sicher", () => {
    const vec = new Float32Array([0.1, -0.5, 1.25, 0]);
    const blob = float32ToBlob(vec);
    const back = blobToFloat32(blob);
    expect(Array.from(back)).toEqual(Array.from(vec));
  });

  it("chunksNeedingEmbedding liefert nur unversorgte", () => {
    const store = freshStore();
    const m = store.createMemory({ title: "T", content: "C" });
    store.replaceChunks(m.id, ["chunk a", "chunk b"]);
    let pending = store.chunksNeedingEmbedding();
    expect(pending).toHaveLength(2);

    store.setEmbedding(m.id, 0, new Float32Array([1, 2, 3]), "test-model");
    pending = store.chunksNeedingEmbedding();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.seq).toBe(1);

    const all = store.allEmbeddableChunks();
    expect(all).toHaveLength(1);
    expect(all[0]?.model).toBe("test-model");
    const stats = store.embeddingStats();
    expect(stats).toEqual({ total: 2, embedded: 1, models: { "test-model": 1 } });
  });

  it("chunksNeedingEmbedding wählt Modell-Mismatch (Re-Embed nach Modellwechsel)", () => {
    const store = freshStore();
    const m = store.createMemory({ title: "T", content: "C" });
    store.replaceChunks(m.id, ["chunk a"]);
    store.setEmbedding(m.id, 0, new Float32Array([1, 2, 3]), "altes-modell");
    // Ohne Modell-Argument: nur fehlende Embeddings
    expect(store.chunksNeedingEmbedding(64)).toHaveLength(0);
    // Mit dem aktuellen Modell: der fremde Chunk muss neu eingebettet werden
    const mismatch = store.chunksNeedingEmbedding(64, "neues-modell");
    expect(mismatch).toHaveLength(1);
    expect(mismatch[0]?.seq).toBe(0);
    // Mit dem passenden Modell: nichts zu tun
    expect(store.chunksNeedingEmbedding(64, "altes-modell")).toHaveLength(0);
  });
});

describe("Entities & Relations", () => {
  it("linkt Entitäten idempotent und baut den Subgraph", () => {
    const store = freshStore();
    const a = store.createMemory({ title: "Projekt X", content: "..." });
    store.linkEntities(a.id, ["Rust", "KEPTA"]);
    store.linkEntities(a.id, ["Rust"]); // zweimal → keine Duplikate
    const b = store.createMemory({ title: "Sprachen", content: "..." });
    store.linkEntities(b.id, ["Rust", "Go"]);
    store.addRelation("KEPTA", "Rust", "written_in", a.id);

    const g = store.getGraph("kepta", 2);
    expect(g.entities.map((e) => e.name).sort()).toEqual(["kepta", "rust"]);
    expect(g.relations).toHaveLength(1);
    expect(g.relations[0]?.relation).toBe("written_in");

    const ids = store.memoryIdsForEntities([store.getEntityByName("rust")!.id]);
    expect(ids).toEqual(new Set([a.id, b.id]));
    expect(store.entityNamesForMemory(a.id).sort()).toEqual(["kepta", "rust"]);
  });
});

describe("FTS", () => {
  it("findet Treffer über FTS5, ignoriert Papierkorb, toleriert Syntax", () => {
    const store = freshStore();
    const a = store.createMemory({ title: "Rust Backend", content: "Speichersicherheit ohne Garbage Collector", tags: ["rust"] });
    store.createMemory({ title: "Kochen", content: "Pasta mit Sauce", tags: [] });
    const hits = store.ftsSearch("Speichersicherheit");
    expect(hits.map((h) => h.id)).toContain(a.id);

    store.trashMemory(a.id);
    expect(store.ftsSearch("Speichersicherheit")).toHaveLength(0);

    // FTS-Sonderzeichen dürfen nicht crashen
    expect(() => store.ftsSearch('"NEAR(a b)')).not.toThrow();
  });

  it("laesst Fuellwoerter nicht zu Treffern werden", () => {
    // Regression: Die Anfrage wurde ungefiltert zerlegt, also matchte eine Notiz
    // allein deshalb, weil sie "with" enthielt. Ueber die RRF-Fusion verdraengte
    // sie damit den eigentlichen Treffer.
    const store = freshStore();
    const laptop = store.createMemory({ title: "New laptop", content: "The M4 with 64 GB of memory", tags: [] });
    const rezept = store.createMemory({ title: "Carbonara", content: "Guanciale, pecorino, egg yolk", tags: [] });

    const ids = store.ftsSearch("what do I cook with carbonara").map((h) => h.id);
    expect(ids).toContain(rezept.id);
    expect(ids).not.toContain(laptop.id);

    // Das Inhaltswort allein findet die Notiz weiterhin
    expect(store.ftsSearch("laptop").map((h) => h.id)).toContain(laptop.id);
  });

  it("sucht weiter, wenn die Anfrage nur aus Fuellwoertern besteht", () => {
    // Lieber ungenaue Treffer als eine stumme Suche.
    const store = freshStore();
    const m = store.createMemory({ title: "Was ist das", content: "Eine Notiz ueber das Was", tags: [] });
    expect(store.ftsSearch("was ist das").map((h) => h.id)).toContain(m.id);
  });

  it("findet kyrillische und CJK Queries (Unicode-Tokenizer)", () => {
    const store = freshStore();
    const ru = store.createMemory({ title: "Контейнер", content: "привет мир docker" });
    const zh = store.createMemory({ title: "Tests", content: "测试 容器化 dokumentiert" });
    expect(store.ftsSearch("привет").map((h) => h.id)).toContain(ru.id);
    // CJK-Term muss die Tokenizer-Regex überleben (vorher: Regex löschte ihn komplett)
    expect(store.ftsSearch("测试").map((h) => h.id)).toContain(zh.id);
  });
});

describe("Tag-Filter (LIKE-Escape)", () => {
  it("matcht Underscore im Tag als Literal, nicht als Wildcard", () => {
    const store = freshStore();
    const a = store.createMemory({ title: "A", content: "x", tags: ["a_b"] });
    store.createMemory({ title: "B", content: "y", tags: ["axb"] });
    const hits = store.listMemories({ tag: "a_b" });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.id).toBe(a.id);
    // Prozent im Suchbegriff matcht ebenso nicht als Wildcard
    expect(store.listMemories({ tag: "a%" })).toHaveLength(0);
  });

  it("Paginierung via offset liefert alle Seiten (Kappe pro Seite, nicht gesamt)", () => {
    const store = freshStore();
    for (let i = 0; i < 25; i++) store.createMemory({ title: `M${i}`, content: "x" });
    const page1 = store.listMemories({ limit: 10, offset: 0 });
    const page2 = store.listMemories({ limit: 10, offset: 10 });
    const page3 = store.listMemories({ limit: 10, offset: 20 });
    expect(new Set([...page1, ...page2, ...page3].map((m) => m.id)).size).toBe(25);
  });
});

describe("Store Utilities & Lebenszyklus", () => {
  it("findByTitle findet aktive Memory, ignoriert Papierkorb", () => {
    const store = freshStore();
    const m = store.createMemory({ title: "Einzigartig", content: "x" });
    expect(store.findByTitle("Einzigartig")?.id).toBe(m.id);
    store.trashMemory(m.id);
    expect(store.findByTitle("Einzigartig")).toBeNull();
  });

  it("recordAccess erhöht access_count und setzt last_access", () => {
    const store = freshStore();
    const m = store.createMemory({ title: "T", content: "C" });
    store.recordAccess([m.id, m.id]); // Set dedupliziert
    const row = store.db.prepare("SELECT access_count, last_access_at FROM memories WHERE id = ?").get(m.id) as {
      access_count: number;
      last_access_at: number | null;
    };
    expect(row.access_count).toBe(1);
    expect(row.last_access_at).not.toBeNull();
  });

  it("reinforceMemory erhöht utility, gedeckelt auf [0,1]", () => {
    const store = freshStore();
    const m = store.createMemory({ title: "T", content: "C" });
    store.reinforceMemory(m.id, 0.3);
    let u = (store.db.prepare("SELECT utility FROM memories WHERE id = ?").get(m.id) as { utility: number }).utility;
    expect(u).toBeCloseTo(0.8, 6); // 0.5 + 0.3
    store.reinforceMemory(m.id, 5); // Überlauf wird gedeckelt
    u = (store.db.prepare("SELECT utility FROM memories WHERE id = ?").get(m.id) as { utility: number }).utility;
    expect(u).toBe(1);
  });

  it("getGraph ohne Entität liefert den globalen Graph", () => {
    const store = freshStore();
    const a = store.createMemory({ title: "A", content: "..." });
    store.linkEntities(a.id, ["rust", "kepta"]);
    store.addRelation("kepta", "rust", "written_in", a.id);
    const g = store.getGraph(); // kein Argument → globaler Zweig (Z. 587-602)
    expect(g.entities.length).toBeGreaterThanOrEqual(2);
    expect(g.relations.length).toBeGreaterThanOrEqual(1);
  });

  it("close schließt die Datenbank ohne Fehler", () => {
    const store = freshStore();
    expect(() => store.close()).not.toThrow();
  });
});

describe("Pfad- und ID-Helfer", () => {
  it("defaultDataDir respektiert KEPTA_DATA_DIR", () => {
    const prev = process.env.KEPTA_DATA_DIR;
    process.env.KEPTA_DATA_DIR = "/tmp/kepta-custom";
    expect(defaultDataDir()).toBe("/tmp/kepta-custom");
    if (prev === undefined) delete process.env.KEPTA_DATA_DIR;
    else process.env.KEPTA_DATA_DIR = prev;
  });

  it("defaultDbPath endet auf kepta.db", () => {
    expect(defaultDbPath().endsWith("kepta.db")).toBe(true);
  });

  it("newId erzeugt eindeutige k-präfixierte IDs", () => {
    const a = newId();
    const b = newId();
    expect(a).toMatch(/^k-/);
    expect(a).not.toBe(b);
  });
});
