// @vitest-environment node
//
// Zelle #95 (Leitung 24.10. 13:22 MESZ): die Such-Tuer hat kein `offset`. Am Kopf cb7c53e
// (13:41 MESZ gemessen) steht in `server/router/search.ts` kein `offset`, und die Engine
// (`src/core/engine.ts:497`) schneidet `hits.slice(0, limit)`  -  jede zweite Anfrage bringt
// dieselbe erste Seite.
//
// Dieser Fall prueft die Engine-Seite: offset schneidet, total bleibt der ganze Bestand, und
// ein Knoten jenseits der ersten 500 ist adressierbar (Latte der Leitung).
import { describe, it, expect, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../../src/core/store";
import { searchMemories } from "../../src/core/engine";

let store: KeptaStore | null = null;
let dir = "";

// Ohne Ollama: der Vektor-Zweig darf nicht ins Netz greifen (Muster aus suchbreite.test.ts).
vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));

function bestand(n: number): KeptaStore {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-suchseite-"));
  store = new KeptaStore(path.join(dir, "t.db"));
  for (let i = 0; i < n; i++) {
    store.createMemory({ title: `Notiz ${i}`, content: `seitenprobe Nummer ${i}`, tags: [] } as never);
  }
  return store;
}

afterEach(() => {
  store?.close();
  store = null;
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = "";
});

describe("Suche seitet: offset in der Engine (#95)", () => {
  it("offset 0 und offset 5 liefern disjunkte Treffer, total bleibt 30", async () => {
    const s = bestand(30);
    const a = await searchMemories(s, { query: "seitenprobe", limit: 5, offset: 0 });
    const b = await searchMemories(s, { query: "seitenprobe", limit: 5, offset: 5 });
    expect(a.hits).toHaveLength(5);
    expect(b.hits).toHaveLength(5);
    const idsA = new Set(a.hits.map((h) => h.memory.id));
    expect(b.hits.some((h) => idsA.has(h.memory.id))).toBe(false);
    expect(a.total).toBe(30);
    expect(b.total).toBe(30);
  });

  it("hinter dem Ende: null Treffer, total bleibt zehn", async () => {
    const s = bestand(10);
    const c = await searchMemories(s, { query: "seitenprobe", limit: 5, offset: 40 });
    expect(c.hits).toHaveLength(0);
    expect(c.total).toBe(10);
  });

  it("ein Knoten jenseits der ersten 500 ist adressierbar", async () => {
    const s = bestand(510);
    const erste = await searchMemories(s, { query: "seitenprobe", limit: 500, offset: 0 });
    const tief = await searchMemories(s, { query: "seitenprobe", limit: 1, offset: 505 });
    expect(erste.hits).toHaveLength(500);
    expect(tief.hits).toHaveLength(1);
    const idsErste = new Set(erste.hits.map((h) => h.memory.id));
    expect(idsErste.has(tief.hits[0]!.memory.id)).toBe(false);
  });
});
