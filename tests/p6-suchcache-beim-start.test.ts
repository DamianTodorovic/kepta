// Punkt 6, 22.10.2026 — der erste Suchlauf darf keinen Volllauf zahlen (Nachtbrief Punkt 6).
//
// Gemessen, bevor diese Datei existierte: an einer eignen Kapsel-Tuer mit 20 000 Notizen
// (Fassung 3.2.38, Port 61905, 22:39:01 MESZ) kostete die ERSTE Anfrage 801,60 ms, die zweite
// 382,61 ms und die dritte 389,26 ms — derselbe Lauf an 120 000 Notizen (3.2.35, 17:46:41 MESZ)
// 12 778,12 ms gegen 3 368,24 / 2 844,09 ms. Der Grund steht im Kode selbst:
// `registriereDelta` baet eine vorgefuellte Datenbank ausdruecklich nicht auf
// („Bei vorgefüllter DB: ignorieren, der Volllauf beim ersten Suchlauf ist korrekt",
// src/core/engine.ts:163-176), und `aktiviereSuchCacheDelta` setzt nur den Haken (engine.ts:206-208).
//
// Fall 1 haelt die Koste (gruen heute, damit niemand sie spaeter „vergaessen" kann).
// Fall 2 verlangt die Waermung und ist heute ROT: `waermeSuchCache` existiert nicht.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { KeptaStore } from "../src/core/store";
import { defaultExtensions } from "../src/core/extensions";
import { schluesselbundKeyProvider } from "../src/core/schluessel";
import { indexMemory } from "../src/core/engine";
import { MAX_SEARCH_LIMIT } from "../src/core/engine";

function kapsel(): { home: string; schluessel: string; entfernen: () => void } {
  // Heim unter os.tmpdir(), nie im Baum — tests/testkapsel.test.ts:189 hinterlaesst sonst
  // ein echtes Datenblatt neben dem Quelltext (gemerkt 16.10., Set1 meldete denselben Fund).
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "p6-suchcache-"));
  const schluessel = Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
  return { home, schluessel, entfernen: () => fs.rmSync(home, { recursive: true, force: true }) };
}

function fuelle(home: string, schluessel: string, anzahl: number): KeptaStore {
  const vorher = process.env.HOME;
  const vorherKey = process.env.KEPTA_DB_KEY;
  process.env.HOME = home;
  process.env.KEPTA_DB_KEY = schluessel;
  const store = new KeptaStore(undefined, {
    ...defaultExtensions(),
    keys: schluesselbundKeyProvider(path.join(home, ".kepta")),
  });
  for (let i = 0; i < anzahl; i++) {
    const titel = `Notiz ${String(i).padStart(5, "0")}`;
    const inhalt = `## Rechnung ${i % 40}\n\nDer Anbieter nennt Zins und Frist in Rechnung ${i}, ` +
      `gemessen am Tag ${i % 97}. Der Wert ${i * 7} haelt die Stufe ${i % 3}.`;
    const record = store.createMemory({ title: titel, content: inhalt, tags: [`thema${i % 40}`] });
    indexMemory(store, record.id);
  }
  process.env.HOME = vorher ?? "";
  if (vorherKey === undefined) delete process.env.KEPTA_DB_KEY;
  else process.env.KEPTA_DB_KEY = vorherKey;
  return store;
}

const suche = async (store: KeptaStore) => {
  const { searchMemories } = await import("../src/core/engine");
  return searchMemories(store, { query: "Rechnung", limit: 10, tracks: { vector: false } } as never);
};

describe("P6-79 — der Such-Index beim Start", () => {
  it("haelt fest: ohne Waermung zahlt die erste Anfrage den Volllauf", async () => {
    const k = kapsel();
    try {
      const store = fuelle(k.home, k.schluessel, 400);
      const { suchCacheStatistik } = await import("../src/core/engine");
      const vorher = suchCacheStatistik.vollaufbauten;
      const ergebnis = await suche(store);
      expect(ergebnis.hits.length).toBeGreaterThan(0);
      expect(suchCacheStatistik.vollaufbauten).toBeGreaterThan(vorher);
      store.close();
    } finally {
      k.entfernen();
    }
  });

  it("waermt den Index nach dem Lauschen, damit die erste Anfrage keinen Volllauf zahlt", async () => {
    const engine = await import("../src/core/engine");
    expect(typeof (engine as unknown as { waermeSuchCache?: unknown }).waermeSuchCache).toBe("function");
    const k = kapsel();
    try {
      const store = fuelle(k.home, k.schluessel, 400);
      const { suchCacheStatistik, waermeSuchCache } = engine as unknown as {
        suchCacheStatistik: { vollaufbauten: number; deltapatches: number };
        waermeSuchCache: (s: KeptaStore) => number;
      };
      const gebaut = waermeSuchCache(store);
      expect(gebaut).toBe(400);
      const nachWaermung = suchCacheStatistik.vollaufbauten;
      const ergebnis = await suche(store);
      expect(ergebnis.hits.length).toBeGreaterThan(0);
      expect(suchCacheStatistik.vollaufbauten).toBe(nachWaermung); // keine zweite Volllauf-Baustelle
      store.close();
    } finally {
      k.entfernen();
    }
  });

  it("schliesst die Luecke zwischen Kappe und Bestand nicht aus, sondern nennt sie", async () => {
    // Die Kappe ist eine Absage an die Eine-Anfrage-sieht-alles-Illusion, kein Verstecken:
    // 10 000 gegen einen Bestand von 21 066 (gemessen 22:36:04 MESZ an der gelieferten Tuer).
    expect(MAX_SEARCH_LIMIT).toBe(10_000);
    expect(MAX_SEARCH_LIMIT).toBeLessThan(21_066);
  });
});
