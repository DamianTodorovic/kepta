// P51/#21 — die Latte der naechsten Zelle, als Rot abgelegt.
//
// Gemessen an der Tuer (P51, 3.11.2026, 40 000 Notizen, Landungsbund 3.2.131): die Vektor-Zeile
// kostet im ersten Griff 188,00 ms, im zweiten 8,85 ms und bei einem andern Text 9,35 ms. Der
// Vorrat haelt an EINER Zahl — `store.datenGeneration()` (src/core/engine.ts:284-296) — und die
// steigt bei JEDEM Schreibfall, auch bei jedem Einbettungs-Nachschub (src/core/store.ts:1075-1093).
// Das heisst: nach einer einzigen neuen Notiz steht die naechste semantische Suche wieder vor
// einem Volllauf. Genau das misst diese Datei, zaehlend statt in Millisekunden, damit sie auf
// jedem Rechner gleich schlaegt.
//
// WER DIESEN FALL GRUEN MACHT, muss zwei Seiten zeigen: der Bau darf nicht noch einmal zaehlen,
// UND die neue Notiz muss weiterhin gefunden werden. Ein Vorrat, der patcht und etwas
// vergisst, ist schneller und falscher.
//
// WIE ER FAHRT:  npx vitest run tests/p6-vektorspur-delta.test.ts
// Erwartung HEUTE: Fall 1 rot (suchtbauten 2 statt 1), Fall 2 gruen.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { KeptaStore } from "../src/core/store";
import { defaultExtensions } from "../src/core/extensions";
import { schluesselbundKeyProvider } from "../src/core/schluessel";
import { indexMemory, DEFAULT_EMBED_MODEL } from "../src/core/engine";

const NOTIZEN = 120;
const DIM = 64;

// Derselbe Kunstgriff wie in tests/p6-vektorvorwaermung-leerstand.test.ts: ein Query-Vektor aus
// der eignen Welt, sonst griffe `embedQuery` ins Loopback-Ollama und der Fall hinge an einem
// Anbieter statt an seinem Gegenstand.
vi.mock("../src/core/embeddings", async (importOriginal) => {
  const echt = await importOriginal<typeof import("../src/core/embeddings")>();
  return {
    ...echt,
    embedQuery: async () => {
      const v = new Float32Array(DIM);
      for (let i = 0; i < DIM; i++) v[i] = (i % 7) - 3;
      return v;
    },
  };
});

function zeilenVektor(kennung: string): Float32Array {
  const v = new Float32Array(DIM);
  let x = 2166136261;
  for (const ch of kennung) x = ((x ^ ch.charCodeAt(0)) * 16777619) >>> 0;
  let norm = 0;
  for (let i = 0; i < DIM; i++) {
    x = (x * 1664525 + 1013904223) >>> 0;
    const w = (x / 0xffffffff) * 2 - 1;
    v[i] = w;
    norm += w * w;
  }
  const n = Math.sqrt(norm) || 1;
  for (let i = 0; i < DIM; i++) v[i]! /= n;
  return v;
}

let heim: string | null = null;

function kapselMitVektoren(): KeptaStore {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "p6-delta-"));
  const schluessel = Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
  heim = home;
  const vorherHeim = process.env.HOME;
  const vorherKey = process.env.KEPTA_DB_KEY;
  const vorherDaten = process.env.KEPTA_DATA_DIR;
  process.env.HOME = home;
  process.env.KEPTA_DATA_DIR = path.join(home, ".kepta");
  process.env.KEPTA_DB_KEY = schluessel;
  try {
    const store = new KeptaStore(undefined, {
      ...defaultExtensions(),
      keys: schluesselbundKeyProvider(path.join(home, ".kepta")),
    });
    for (let i = 0; i < NOTIZEN; i++) {
      const titel = `Vorrat ${String(i).padStart(4, "0")}`;
      const inhalt = `Haltestelle ${i} nennt die Frist und den Wert ${i * 7}. Der Anbieter haelt die Stufe ${i % 5}.`;
      indexMemory(store, store.createMemory({ title: titel, content: inhalt, tags: [`thema${i % 20}`] }).id);
    }
    for (const c of store.chunksNeedingEmbedding(10_000, DEFAULT_EMBED_MODEL)) {
      store.setEmbedding(c.memoryId, c.seq, zeilenVektor(`${c.memoryId}:${c.seq}`), DEFAULT_EMBED_MODEL);
    }
    return store;
  } finally {
    process.env.HOME = vorherHeim ?? "";
    if (vorherDaten === undefined) delete process.env.KEPTA_DATA_DIR;
    else process.env.KEPTA_DATA_DIR = vorherDaten;
    if (vorherKey === undefined) delete process.env.KEPTA_DB_KEY;
    else process.env.KEPTA_DB_KEY = vorherKey;
  }
}

describe("P51/#21: ein Schreibfall darf die Vektor-Spur nicht jedes Mal neu bauen", () => {
  let store: KeptaStore;

  beforeAll(async () => {
    store = kapselMitVektoren();
  });

  afterAll(() => {
    // Die Kapsel haelt bis zum letzten Fall: ein Loeschen nach jedem Fall wuerde dem zweiten
    // den Boden unter der offenen Datenbank wegziehen.
    try { store.close(); } catch { /* schon zu */ }
    if (heim) {
      fs.rmSync(heim, { recursive: true, force: true });
      heim = null;
    }
  });

  it("zaehlt den Bau: erster Griff baut, zweiter nicht, und ein Schreibfall allein auch nicht", async () => {
    const e = (await import("../src/core/engine")) as typeof import("../src/core/engine");
    const { searchMemories } = e;

    const vorher = e.vektorSpurStatistik.suchbauten;
    await searchMemories(store, { query: "Haltestelle", limit: 10, tracks: { vector: true } } as never);
    const nachErstemGriff = e.vektorSpurStatistik.suchbauten;
    expect(nachErstemGriff, "der erste Griff muss den Vorrat bauen").toBeGreaterThan(vorher);

    await searchMemories(store, { query: "Haltestelle", limit: 10, tracks: { vector: true } } as never);
    expect(e.vektorSpurStatistik.suchbauten, "der zweite Griff am stehenden Vorrat darf nicht erneut bauen").toBe(nachErstemGriff);

    // DIE EINE AENDERUNG: eine Notiz, kein Text, keine Suchwort-Arbeit.
    const neu = store.createMemory({ title: "Nachtrag", content: "Haltestelle Nachtrag, der die Generation weiterstellt.", tags: ["nachtrag"] });
    indexMemory(store, neu.id);

    await searchMemories(store, { query: "Haltestelle", limit: 10, tracks: { vector: true } } as never);
    expect(
      e.vektorSpurStatistik.suchbauten,
      `ein einzelner Schreibfall warf den ganzen Vorrat: gebaut wurde ${e.vektorSpurStatistik.suchbauten - nachErstemGriff} mal erneut (${e.vektorSpurStatistik.zeilen} Zeilen gelesen). An der Tuer kostete so ein Volllauf 188,00 ms gegen 8,85 ms am stehenden Vorrat (P51, 40 000 Notizen) — verlangt ist das Nachtragen, nicht der Neubau`,
    ).toBe(nachErstemGriff);
    expect(e.vektorSpurStatistik.deltapatches, "der Schreibfall muss als Nachtrag gezaehlt sein, nicht als spurloser Erfolg").toBeGreaterThan(0);
  });

  it("baut voll, wenn ein Einbettungs-Schreibfall die Vektoren selbst bewegt — das Sicherheitsnetz", async () => {
    const e = (await import("../src/core/engine")) as typeof import("../src/core/engine");
    const { searchMemories } = e;
    await searchMemories(store, { query: "Haltestelle", limit: 10, tracks: { vector: true } } as never);
    const vorher = e.vektorSpurStatistik.suchbauten;

    // Der Nachzug der Hintergrund-Queue schreibt an einem Abschnitt, nicht an einer Notiz:
    // kein gemeldeter Schreibfall, aber ein neuer Vektor. Wer hier nur nachtrage, verleerte
    // den neuen Vektor still — dieser Fall ist der Grund, dass der Zaehler dafuer existiert.
    const c = store.chunksNeedingEmbedding(1, DEFAULT_EMBED_MODEL)[0]!;
    const v = new Float32Array(DIM).fill(1 / Math.sqrt(DIM));
    store.setEmbedding(c.memoryId, c.seq, v, DEFAULT_EMBED_MODEL);

    await searchMemories(store, { query: "Haltestelle", limit: 10, tracks: { vector: true } } as never);
    expect(
      e.vektorSpurStatistik.suchbauten,
      "ein Embedding wurde gesetzt, und die Spur tat so, als waere nichts gewesen — der neue Vektor fehlt der Suche still",
    ).toBeGreaterThan(vorher);
  });

  it("findet die neue Notiz nach dem Schreibfall — Geschwindigkeit um einen vergessenen Fund ist kein Gewinn", async () => {
    const { searchMemories } = await import("../src/core/engine");
    const neu = store.createMemory({ title: "Fundschaft", content: "Die Fundschaft liegt im Buero 3 und wartet.", tags: ["fund"] });
    indexMemory(store, neu.id);
    const treffer = await searchMemories(store, { query: "Fundschaft", limit: 20, tracks: { vector: true } } as never);
    const ids = treffer.hits.map((h) => h.memory.id);
    expect(ids, "eine Suche nach einem Schreibfall muss die neue Notiz fuehren").toContain(neu.id);
  });
});
