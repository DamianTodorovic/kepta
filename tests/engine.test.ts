import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";
import { searchMemories, indexMemory, consolidateMemories, findDuplicateForNew } from "../src/core/engine";
import { DEFAULT_EMBED_MODEL } from "../src/core/embeddings";

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
// Standardmäßig mit dem AKTUELLEN Modell (DEFAULT_EMBED_MODEL) — nur Chunks desselben
// Modells fließen in den Vektorvergleich ein (Modellmix-Schutz).
function seedEmbeddings(store: KeptaStore, model = DEFAULT_EMBED_MODEL) {
  const pending = store.chunksNeedingEmbedding(500);
  for (const c of pending) store.setEmbedding(c.memoryId, c.seq, fakeVec(c.text), model);
}

describe("searchMemories (RRF-Fusion)", () => {
  let store: KeptaStore;
  beforeEach(() => {
    // embedQuery ruft Ollama ueber fetch. Ohne Stub haengt das Ergebnis davon ab,
    // ob auf dem Rechner nomic-embed-text installiert ist: auf CI (kein Ollama)
    // gruen, auf einem Entwicklerrechner, der der README gefolgt ist, rot.
    // Standard ist deshalb "kein Embedding-Dienst"; Tests, die das Vektor-Bein
    // brauchen, stubben fetch selbst.
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    store = freshStore();
    const a = store.createMemory({ title: "Rust Backend", content: "Speichersicherheit und Performance ohne Garbage Collector", tags: ["rust"], updatedAt: 1000 });
    const b = store.createMemory({ title: "Kochen", content: "Spaghetti Carbonara mit Pecorino", tags: ["kochen"], updatedAt: 2000 });
    const c = store.createMemory({ title: "Rust oder Go", content: "Speichersicherheit in Rust gegen Einfachheit in Go", tags: ["rust"], updatedAt: 3000 });
    for (const id of [a.id, b.id, c.id]) indexMemory(store, id);
    seedEmbeddings(store);
  });
  afterEach(() => vi.unstubAllGlobals());

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
    store.createMemory({ title: "Wohnort", content: "Hamburg Altona", validTo: Date.now() - 1000, updatedAt: 9000 });
    store.createMemory({ title: "Wohnort aktuell", content: "Leipzig Suedvorstadt", validFrom: Date.now(), updatedAt: 8000 });
    seedEmbeddings(store);

    const res = await searchMemories(store, { query: "Wohnort" });
    const expired = res.hits.find((h) => h.memory.content.includes("Hamburg"));
    const fresh = res.hits.find((h) => h.memory.content.includes("Leipzig"));
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

  it("Vektor-Bein trägt bei, wenn embedQuery einen Vektor liefert (fetch gemockt)", async () => {
    // embedQuery ruft Ollama; wir liefern fakeVec(query) zurück, sodass die
    // Query zu den mit fakeVec geseedeten Chunks passt und das Vektor-Bein greift.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { body?: string }) => {
        const body = JSON.parse(init?.body ?? "{}") as { input: string[] };
        const embeddings = body.input.map((t) => Array.from(fakeVec(t)));
        return { ok: true, status: 200, json: async () => ({ embeddings }) } as unknown as Response;
      })
    );
    const res = await searchMemories(store, { query: "Speichersicherheit Rust", limit: 5 });
    expect(res.hits.length).toBeGreaterThan(0);
    // mindestens ein Treffer hat einen Vektor-Rang (Vektor-Bein aktiv)
    expect(res.hits.some((h) => h.components.vectorRank !== null && h.components.vectorRank !== undefined)).toBe(true);
    expect(res.usedVectors).toBe(true);
    vi.unstubAllGlobals();
  });

  it("ignoriert Chunks mit fremdem Embedding-Modell statt unsinnige Scores zu bauen", async () => {
    // Simulierter Modellwechsel: Chunks tragen das ALTE Modell — der Query-Vektor
    // entsteht mit DEFAULT_EMBED_MODEL. Vektorvergleich darf dann nicht passieren.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { body?: string }) => {
        const body = JSON.parse(init?.body ?? "{}") as { input: string[] };
        const embeddings = body.input.map((t) => Array.from(fakeVec(t)));
        return { ok: true, status: 200, json: async () => ({ embeddings }) } as unknown as Response;
      })
    );
    const fresh = freshStore();
    const a = fresh.createMemory({ title: "Rust Backend", content: "Speichersicherheit und Performance" });
    indexMemory(fresh, a.id);
    seedEmbeddings(fresh, "altes-modell"); // Modell-Mismatch
    const res = await searchMemories(fresh, { query: "Speichersicherheit", limit: 5 });
    expect(res.usedVectors).toBe(false);
    expect(res.hits.every((h) => h.components.vectorRank === null)).toBe(true);
    // Die Queue wählt den Mismatch — nach dem Re-Embedden mit dem neuen Modell wäre das Bein wieder aktiv
    expect(fresh.chunksNeedingEmbedding(64, DEFAULT_EMBED_MODEL).length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
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

  it("erkennt lexikalische Titel-Dubletten auch ohne Embeddings", async () => {
    const store = freshStore();
    // Fast identische Titel, keine Tags → titleSim ≥ 0.85, tag-Bedingung via leerer Tags erfüllt.
    store.createMemory({ title: "Rechnungen Buchhaltung Tool", content: "Variante eins", createdAt: 1, updatedAt: 1 });
    store.createMemory({ title: "Rechnungen Buchhaltung Tool", content: "Variante zwei viel länger", createdAt: 2, updatedAt: 2 });
    const dry = await consolidateMemories(store, { dryRun: true });
    const lexical = dry.candidates.find((c) => c.reason === "title+tags");
    expect(lexical).toBeDefined();
  });

  it("nutzt Tag-Jaccard bei gleichem Titel mit überlappenden Tags", async () => {
    const store = freshStore();
    // Gleiche Titel UND überlappende Tags → jaccard() wird ausgewertet (tagSim ≥ 0.5).
    store.createMemory({ title: "Deployment Domain Setup", content: "eins", tags: ["devops", "domain"], createdAt: 1, updatedAt: 1 });
    store.createMemory({ title: "Deployment Domain Setup", content: "zwei länger", tags: ["devops", "domain"], createdAt: 2, updatedAt: 2 });
    const dry = await consolidateMemories(store, { dryRun: true });
    expect(dry.candidates.find((c) => c.reason === "title+tags")).toBeDefined();
  });

  it("liefert keine Kandidaten wenn nichts ähnlich ist", async () => {
    const store = freshStore();
    store.createMemory({ title: "Angeln am See", content: "Köder und Ruten" });
    store.createMemory({ title: "Steuererklärung", content: "Umsatzsteuer Frist" });
    const dry = await consolidateMemories(store, { dryRun: true });
    expect(dry.candidates).toHaveLength(0);
    expect(dry.applied).toBe(0);
  });
});

describe("findDuplicateForNew", () => {
  // findDuplicateForNew ruft embedQuery (→ Ollama /api/embed). fetch wird gemockt,
  // damit der neue Text denselben Vektor wie ein bestehender Chunk bekommt.
  const FIXED = [1, 0, 0, 0];

  afterEach(() => vi.unstubAllGlobals());

  function stubQueryVec(vec: number[]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ embeddings: [vec] }) }) as unknown as Response)
    );
  }

  it("findet eine bestehende Memory mit hoher Ähnlichkeit", async () => {
    const store = freshStore();
    const m = store.createMemory({ title: "Docker Setup", content: "Läuft über Docker" });
    store.replaceChunks(m.id, ["Docker Setup"]);
    store.setEmbedding(m.id, 0, Float32Array.from(FIXED), DEFAULT_EMBED_MODEL); // identischer Vektor → sim 1
    stubQueryVec(FIXED);
    const warn = await findDuplicateForNew(store, "Docker", "Setup");
    expect(warn?.existingId).toBe(m.id);
    expect(warn!.similarity).toBeGreaterThanOrEqual(0.92);
  });

  it("meldet null wenn nichts über der Schwelle liegt", async () => {
    const store = freshStore();
    const m = store.createMemory({ title: "Kochen", content: "Pasta" });
    store.replaceChunks(m.id, ["Kochen"]);
    store.setEmbedding(m.id, 0, Float32Array.from([0, 1, 0, 0]), DEFAULT_EMBED_MODEL); // orthogonal → sim 0
    stubQueryVec(FIXED);
    expect(await findDuplicateForNew(store, "Docker", "Setup")).toBeNull();
  });

  it("ignoriert Chunks mit fremdem Modell (kein Cross-Modell-Duplikat)", async () => {
    const store = freshStore();
    const m = store.createMemory({ title: "Docker Setup", content: "Läuft über Docker" });
    store.replaceChunks(m.id, ["Docker Setup"]);
    store.setEmbedding(m.id, 0, Float32Array.from(FIXED), "altes-modell"); // Modell-Mismatch
    stubQueryVec(FIXED);
    expect(await findDuplicateForNew(store, "Docker", "Setup")).toBeNull();
  });

  it("meldet null wenn kein Query-Vektor erzeugt werden kann", async () => {
    const store = freshStore();
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("Ollama down");
    }));
    expect(await findDuplicateForNew(store, "x", "y")).toBeNull();
  });
});
