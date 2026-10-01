import { describe, it, expect, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../../src/core/store";
import { searchMemories, indexMemory, MAX_SEARCH_LIMIT } from "../../src/core/engine";
import { DEFAULT_EMBED_MODEL } from "../../src/core/embeddings";

// Befund vom 6.9.2026 (411 Notizen, echte Datenbank):
//
//  1. "Alles zum Thema" gab es nicht. Der Regler endete bei 20, die Oberflaeche
//     schickte hoechstens 20, die Engine deckelte bei 100 und das BM25-Bein zog
//     ohnehin nur 100 Kandidaten. Vier Deckel hintereinander, keiner sichtbar.
//  2. Die Gesamtzahl log. Das Vektor-Bein war als KNN beschrieben, lieferte aber
//     ALLE Notizen zurueck — zu "kanzlei" meldete die Suche 409 Treffer, obwohl
//     nur 40 das Wort enthielten; zu "carbonara" 267, obwohl es in der Datenbank
//     kein einziges Rezept gab.
//
// Beides ist hier festgehalten.

function freshStore(): KeptaStore {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-breite-"));
  return new KeptaStore(path.join(dir, "test.db"));
}

/** Ein Vektor, der auf einen gewuenschten Cosinus zum Query-Vektor [1,0] zielt. */
function vecMitCosinus(c: number): Float32Array {
  const winkel = Math.acos(Math.max(-1, Math.min(1, c)));
  return new Float32Array([Math.cos(winkel), Math.sin(winkel)]);
}

/** embedQuery holt seinen Vektor ueber Ollama — hier fest auf [1,0]. */
function stubEmbedder(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ embeddings: [[1, 0]] }) }))
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("Suchbreite: alles zum Thema, nicht die ersten zwanzig", () => {
  it("gibt mehr als hundert Treffer zurueck, wenn so viele passen", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    const store = freshStore();
    for (let i = 0; i < 260; i++) {
      const m = store.createMemory({ title: `Fristenkontrolle ${i}`, content: `Die Fristenkontrolle laeuft im Fall ${i}.` });
      indexMemory(store, m.id);
    }
    const res = await searchMemories(store, { query: "Fristenkontrolle", limit: 1000 });
    // Frueher: hoechstens 100 — die Engine deckelte, und das BM25-Bein lieferte
    // gar nicht mehr Kandidaten.
    expect(res.hits.length).toBe(260);
    expect(res.total).toBe(260);
  });

  it("haelt sich weiterhin an eine Obergrenze — eine Antwort bleibt endlich", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    const store = freshStore();
    const m = store.createMemory({ title: "Eins", content: "Ein einziger Eintrag." });
    indexMemory(store, m.id);
    const res = await searchMemories(store, { query: "Eintrag", limit: MAX_SEARCH_LIMIT * 10 });
    expect(res.hits.length).toBe(1);
    expect(MAX_SEARCH_LIMIT).toBeGreaterThan(100);
  });

  it("meldet dieselbe Gesamtzahl, egal wie viel gerade angezeigt wird", async () => {
    // Vorher haing die Tiefe des Wort-Beins am Limit: bei topK=5 meldete die
    // Suche "5 von 117", nach dem Umlegen des Reglers "150 von 150". Die Zahl
    // neben dem Ergebnis muss stehen, sonst ist sie wertlos.
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    const store = freshStore();
    for (let i = 0; i < 300; i++) {
      const m = store.createMemory({ title: `Forschung ${i}`, content: `Notiz zur Forschung ${i}.` });
      indexMemory(store, m.id);
    }
    const totals: number[] = [];
    for (const limit of [1, 5, 20, 250, 5000]) {
      totals.push((await searchMemories(store, { query: "Forschung", limit })).total);
    }
    expect(new Set(totals).size).toBe(1);
    expect(totals[0]).toBe(300);
  });

  it("meldet die Gesamtzahl auch dann, wenn nur ein Ausschnitt zurueckkommt", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    const store = freshStore();
    for (let i = 0; i < 40; i++) {
      const m = store.createMemory({ title: `Mandat ${i}`, content: `Akte zum Mandat ${i}.` });
      indexMemory(store, m.id);
    }
    const res = await searchMemories(store, { query: "Mandat", limit: 5 });
    expect(res.hits).toHaveLength(5);
    expect(res.total).toBe(40);
  });
});

describe("Vektor-Bein: ein KNN mit k, kein Rundumschlag", () => {
  /** Eine Datenbank, in der genau `nah` Notizen wirklich zum Thema gehoeren. */
  function bandStore(nah: number, fern: number, cosNah: number, cosFern: number): KeptaStore {
    const store = freshStore();
    const setze = (praefix: string, anzahl: number, cos: number) => {
      for (let i = 0; i < anzahl; i++) {
        const m = store.createMemory({ title: `${praefix} ${i}`, content: `Inhalt ${praefix} ${i}` });
        indexMemory(store, m.id);
        for (const c of store.chunksNeedingEmbedding(500)) {
          store.setEmbedding(c.memoryId, c.seq, vecMitCosinus(cos), DEFAULT_EMBED_MODEL);
        }
      }
    };
    setze("Nah", nah, cosNah);
    setze("Fern", fern, cosFern);
    return store;
  }

  it("zaehlt nur, was wirklich nah am besten Treffer liegt", async () => {
    stubEmbedder();
    // 8 Notizen bei Cosinus 0,82 — wie die echten Treffer in der Messung.
    // 120 bei 0,55 — wie das Rauschen. Frueher zaehlten alle 128 als Treffer.
    const store = bandStore(8, 120, 0.82, 0.55);
    const res = await searchMemories(store, { query: "voellig fremdes wort", limit: 1000 });
    expect(res.usedVectors).toBe(true);
    expect(res.total).toBe(8);
  });

  it("liefert nichts, wenn es zum Thema nichts gibt", async () => {
    stubEmbedder();
    // Der BESTE Cosinus liegt bei 0,45 — so sah "carbonara" in einer Datenbank
    // ohne ein einziges Rezept aus. Ein rein relatives Band haette hier das
    // gesamte Rauschen als Treffer gemeldet.
    const store = bandStore(0, 200, 0, 0.45);
    const res = await searchMemories(store, { query: "voellig fremdes wort", limit: 1000 });
    expect(res.total).toBe(0);
    expect(res.hits).toEqual([]);
  });

  it("laesst Wort-Treffer unberuehrt, auch wenn ihr Vektor schwach ist", async () => {
    stubEmbedder();
    const store = bandStore(0, 30, 0, 0.4);
    const m = store.createMemory({ title: "Zauberwort Quux", content: "Ein Wort, das sonst nirgends steht." });
    indexMemory(store, m.id);
    for (const c of store.chunksNeedingEmbedding(500)) {
      store.setEmbedding(c.memoryId, c.seq, vecMitCosinus(0.4), DEFAULT_EMBED_MODEL);
    }
    // Die Untergrenze darf die Suche nie blind machen: das Wort-Bein zaehlt weiter.
    const res = await searchMemories(store, { query: "Quux", limit: 50 });
    expect(res.hits.map((h) => h.memory.id)).toContain(m.id);
  });

  it("zeigt den Cosinus auch fuer Treffer, die ueber das Wort-Bein kamen", async () => {
    stubEmbedder();
    const store = freshStore();
    const m = store.createMemory({ title: "Zauberwort Quux", content: "x" });
    indexMemory(store, m.id);
    for (const c of store.chunksNeedingEmbedding(500)) {
      store.setEmbedding(c.memoryId, c.seq, vecMitCosinus(0.3), DEFAULT_EMBED_MODEL);
    }
    const res = await searchMemories(store, { query: "Quux", limit: 5 });
    const treffer = res.hits.find((h) => h.memory.id === m.id)!;
    expect(treffer.components.vectorSimilarity).toBeGreaterThan(0);
  });
});
