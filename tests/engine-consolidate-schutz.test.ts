// Schutz in der Engine vor einer Schwellwertangabe, die alles zur Dublette macht
// (Befund A2-02), und vor einer unbegrenzten Kandidatenliste.
// Gemessen am Stand 343cb04: engine.ts:585 `const threshold = opts.threshold ?? 0.92`
// ohne jede Klammer, :617 vergleicht `sim >= threshold` — threshold: 0 macht jedes
// Paar zur Dublette, und mit dryRun:false ersetzt ein einziger Aufruf den halben Bestand.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";
import { consolidateMemories, indexMemory, MAX_CANDIDATES_PRO_AUFRUF } from "../src/core/engine";
import { DEFAULT_EMBED_MODEL } from "../src/core/embeddings";

function freshStore(): KeptaStore {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-consolidate-schutz-"));
  return new KeptaStore(path.join(dir, "test.db"));
}

// Deterministische Chunk-Vektoren ohne Ollama (dieselbe Methode wie in
// tests/engine.test.ts): ohne sie bleibt der Vektor-Zweig der Konsolidierung leer
// und ein threshold: 0 fiele nicht auf — der Schaden liegt genau in diesem Zweig.
function fakeVec(text: string): Float32Array {
  const v = new Float32Array(16);
  for (const w of text.toLowerCase().split(/\W+/)) {
    if (!w) continue;
    v[w.length % 16] += 1;
    v[(w.charCodeAt(0) + w.charCodeAt(w.length - 1)) % 16] += 1;
  }
  return v;
}

function betteAlle(store: KeptaStore): void {
  for (const c of store.chunksNeedingEmbedding(500)) {
    store.setEmbedding(c.memoryId, c.seq, fakeVec(c.text), DEFAULT_EMBED_MODEL);
  }
}

describe("consolidateMemories: Schwellwert", () => {
  let store: KeptaStore;

  beforeEach(() => {
    // Kein Embedding-Dienst: der Vektor-Zweig der Konsolidierung soll hier nicht
    // ins Netz greifen, er rechnet mit den geseedeten Vektoren.
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    store = freshStore();
    for (const [titel, inhalt, tag] of [
      ["Backup laeuft nachts", "Das Backup der Datenbank laeuft um 03:00", "betrieb"],
      ["Steuererklaerung Frist", "Die Umsatzsteuer ist am 10.10. faellig", "steuer"],
      ["Reifenwechsel", "Winterreifen bis Ostern wechseln lassen", "auto"],
    ] as const) {
      const m = store.createMemory({ title: titel, content: inhalt, tags: [tag] });
      indexMemory(store, m.id);
    }
    betteAlle(store);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("lehnt eine Schwelle ausserhalb (0, 1] ab, statt alles zu ersetzen", async () => {
    // threshold: 0 war der gefaehrliche Fall: sim >= 0 gilt fuer jedes Paar — hier
    // drei thematisch fremde Notizen, die alle als Dublettenpaare vorgeschlagen wurden.
    for (const schwelle of [0, -0.5, 1.5, 2, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(
        consolidateMemories(store, { dryRun: true, threshold: schwelle }),
        `Schwelle ${schwelle} haette abgelehnt werden muessen`
      ).rejects.toThrow(/threshold/);
    }
  });

  it("laesst gueltige Schwellen durch, auch die Raender 1 und ein niedriger Wert", async () => {
    // 1 = nur identische Vektoren, 0.1 = sehr grosszugig — beides ist eine
    // Aussage des Aufrufers, keine fehlerhafte Eingabe.
    await expect(consolidateMemories(store, { dryRun: true, threshold: 1 })).resolves.toMatchObject({ candidates: [] });
    await expect(consolidateMemories(store, { dryRun: true, threshold: 0.1 })).resolves.toMatchObject({ dryRun: true });
  });

  it("nimmt ohne Angabe die Kalibrierung von 0,92", async () => {
    const ergebnis = await consolidateMemories(store, { dryRun: true });
    expect(ergebnis.candidates).toEqual([]);
    expect(ergebnis.begrenzt).toBe(false);
  });
});

describe("consolidateMemories: Obergrenze der Kandidaten", () => {
  let store: KeptaStore;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    store = freshStore();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("kappt die Vorschlagsliste und sagt es", async () => {
    // Genug wortgleiche Notizen fuer weit mehr Paare als die Kappe:
    // n Titel-Paare bei n Notizen = n*(n-1)/2.
    const n = 40;
    expect((n * (n - 1)) / 2).toBeGreaterThan(MAX_CANDIDATES_PRO_AUFRUF);
    for (let i = 0; i < n; i++) {
      store.createMemory({ title: "Gleicher Titel", content: `Variante ${i} mit unterscheidendem Schwanz`, tags: ["dup"] });
    }

    const ergebnis = await consolidateMemories(store, { dryRun: true });

    expect(ergebnis.candidates.length).toBeLessThanOrEqual(MAX_CANDIDATES_PRO_AUFRUF);
    expect(ergebnis.begrenzt).toBe(true);
  });

  it("meldet begrenzt:false, wenn die Liste unter der Kappe bleibt", async () => {
    store.createMemory({ title: "Dreifacher Titel", content: "eins" });
    store.createMemory({ title: "Dreifacher Titel", content: "zwei" });
    store.createMemory({ title: "Dreifacher Titel", content: "drei" });

    const ergebnis = await consolidateMemories(store, { dryRun: true });

    expect(ergebnis.candidates.length).toBeGreaterThan(0);
    expect(ergebnis.begrenzt).toBe(false);
  });

  it("wendet nie mehr an als vorgeschlagen — und nie mehr als die Kappe", async () => {
    for (let i = 0; i < 40; i++) {
      store.createMemory({ title: "Nochmal gleicher Titel", content: `Variante ${i} mit unterscheidendem Schwanz`, tags: ["dup"] });
    }

    const ergebnis = await consolidateMemories(store, { dryRun: false });

    expect(ergebnis.candidates.length).toBeLessThanOrEqual(MAX_CANDIDATES_PRO_AUFRUF);
    expect(ergebnis.applied).toBeLessThanOrEqual(ergebnis.candidates.length);
    expect(ergebnis.applied).toBeLessThanOrEqual(MAX_CANDIDATES_PRO_AUFRUF);
  });
});
