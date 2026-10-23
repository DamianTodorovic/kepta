// Punkt 6, 24.10.2026 — Aufgabe #10: die Wache, die den linearen Volltext-Lauf je Anfrage zaehlt.
//
// Der Befund, gegen den diese Wache steht: jede Anfrage prueft fuer JEDEN Kandidaten den Volltext
// erneut (`titleLower.includes(t) || contentLower.includes(t)`), obwohl die Matched-Terms nur in den
// AUSGEGEBENEN Treffern gebraucht werden. Bei limit 10 und 300 Kandidaten sind das 300 Volltext-Laeufe
// fuer 10 Antworten. Die Wache zaehlt die Scans und verlangt, dass sie die Zahl der ausgegebenen
// Treffer nicht ueberschreiten.
//
// Rot vor dem Flicken (Zaehler an der alten Stelle): scans = Kandidatenzahl (300) gegen Latte 10.
// Gruen nach dem Flicken (Scans nur fuer die ausgegebenen Treffer): scans = 10.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { KeptaStore } from "../src/core/store";
import { defaultExtensions } from "../src/core/extensions";
import { schluesselbundKeyProvider } from "../src/core/schluessel";
import { searchMemories, suchPfadZaehler } from "../src/core/engine";

function kapsel(): { home: string; schluessel: string; entfernen: () => void } {
  // Heim unter os.tmpdir(), nie im Baum — die Lehre aus tests/testkapsel.test.ts:189.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "p6-suchpfad-"));
  const schluessel = Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
  return { home, schluessel, entfernen: () => fs.rmSync(home, { recursive: true, force: true }) };
}

function fuelle(home: string, schluessel: string, anzahl: number): KeptaStore {
  const vorher = { HOME: process.env.HOME, KEY: process.env.KEPTA_DB_KEY };
  process.env.HOME = home;
  process.env.KEPTA_DB_KEY = schluessel;
  const store = new KeptaStore(undefined, {
    ...defaultExtensions(),
    keys: schluesselbundKeyProvider(path.join(home, ".kepta")),
  });
  for (let i = 0; i < anzahl; i++) {
    store.upsertMemory({
      id: `p6-${String(i).padStart(4, "0")}`,
      title: `Notiz ${i} gemeinsam`,
      content: `Jede Notiz dieser Kapsel traegt das Wort gemeinsam, damit die Kandidatenzahl gross ist.`,
      tags: ["p6"],
    } as never);
  }
  process.env.HOME = vorher.HOME;
  process.env.KEPTA_DB_KEY = vorher.KEY;
  return store;
}

describe("P6 #10 — Volltext-Scans je Anfrage", () => {
  const K = kapsel();
  const store = fuelle(K.home, K.schluessel, 300);

  it("300 Kandidaten, limit 10: hoechstens 10 Volltext-Scans", async () => {
    suchPfadZaehler.volltextScans = 0;
    const r = await searchMemories(store, { query: "gemeinsam", limit: 10, tracks: { vector: false, entity: false } } as never);
    expect(r.hits.length).toBe(10);
    expect(r.total).toBe(300);
    // Die Matched-Terms muessen weiterhin in JEDEM ausgegebenen Treffer stehen.
    for (const h of r.hits) expect(h.matchedTerms).toContain("gemeinsam");
    // Und die Rechnung darf nicht den Volltext aller Kandidaten anfassen.
    expect(suchPfadZaehler.volltextScans).toBeLessThanOrEqual(10);
  });

  it("Gegenprobe: ohne Treffer keine Scans", async () => {
    suchPfadZaehler.volltextScans = 0;
    const r = await searchMemories(store, { query: "zzzznichtvorhanden", limit: 10, tracks: { vector: false, entity: false } } as never);
    expect(r.hits.length).toBe(0);
    expect(suchPfadZaehler.volltextScans).toBe(0);
  });

  it("Gegenprobe: limit 3 gibt 3 Treffer und hoechstens 3 Scans", async () => {
    suchPfadZaehler.volltextScans = 0;
    const r = await searchMemories(store, { query: "gemeinsam", limit: 3, tracks: { vector: false, entity: false } } as never);
    expect(r.hits.length).toBe(3);
    expect(suchPfadZaehler.volltextScans).toBeLessThanOrEqual(3);
  });
});
