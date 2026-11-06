// P142 — was eine Notiz wirklich mit sich trägt. README.md:86 behauptet: "Every memory carries a
// type, a validity window and a confidence score."
//
// Nachgemessen an der Speicher-Ordnung und am Schreiben:
//   src/core/store.ts:280  `type TEXT NOT NULL DEFAULT 'semantic'`
//   src/core/store.ts:284  `confidence REAL NOT NULL DEFAULT 1.0`
//   src/core/store.ts:285  `valid_from INTEGER`    -- nullbar, **kein Default**
//   src/core/store.ts:286  `valid_to INTEGER`      -- nullbar, **kein Default**
//   src/core/store.ts:821  ohne Angabe entscheidet `klassifiziere`, nicht der Spalten-Default
//   src/core/store.ts:827  `clampConfidence` = undefined -> 1, und Klammer 0..1
//   src/core/store.ts:828  ohne Angabe -> null, und null bleibt null (:610-611)
//   src/core/engine.ts:475 in der Zeitreise wird ein fehlender Anfang zum Anlegedatum
//   src/core/engine.ts:477 ein fehlendes Ende verjährt nie
//
// Die Behauptung ist also **zwei Drittel richtig und ein Drittel zu stark**: Typ und Vertrauen
// trägt jede Notiz — der Typ von den Regeln, nie stillschweigend "Fakt", das Vertrauen bei 1, wenn
// niemand es gesetzt hat. Das Fenster trägt eine Notiz nur, wenn jemand es gesetzt hat; fehlt es,
// bleibt in der Zeile null und erst das Lesen entscheidet (Anfang = Anlegedatum, Ende = nie).
//
// Biss gemessen 7.11. 00:45 bis 00:46 gegen je einen Scratch-Patch, jedes Mal `cp` aus der eignen
// Sicherung zurück und `cmp` bytegleich, `git status` dazu leer:
//   `clampConfidence` -> `return 0.5`                 : Fall 2 rot (1 von 6)
//   Regeltyp -> Spalten-Default `"semantic"`          : Fall 1 rot (1 von 6)
//   `validFrom: … ?? null` -> `?? 0` im Schreibweg    : Fall 3 und 4 rot (2 von 6)
//   `expired`-Zeile -> `false`                        : Fall 5 rot (1 von 6)
//   Zeitreise-Ende -> `if (false)`                    : Fall 6 rot (1 von 6)
//   `?? r.createdAt` -> `?? 0`                        : Fall 4 rot (1 von 6)
// Jeder Fall verliert also allein oder mit einem Nachbarn; keiner ist ein Schmuckfall.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../../src/core/store";
import { searchMemories } from "../../src/core/engine";
import { klassifiziere } from "../../src/core/klassifikation";

function freshStore(): KeptaStore {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-drei-felder-"));
  return new KeptaStore(path.join(dir, "test.db"));
}

// Ohne Stub hinge jedes Ergebnis davon ab, ob gerade ein Ollama läuft: das Einbett-Bein würde
// hinausfragen, und die Zeitreise-Fälle wären ein Wetterbericht. 503 = "kein Modell da", die
// lexikalische Spur bleibt — dieselbe Konvention, die `tests/engine.test.ts:42` setzt.
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("die drei Felder einer Notiz: was gesetzt ist, und was beim Lesen ersetzt wird", () => {
  it("ein Typ ohne Angabe kommt von den Regeln, nicht vom Spalten-Default", () => {
    const store = freshStore();
    const schritte = { title: "Server aufsetzen", content: "1. Paket laden\n2. Entpacken\n3. Starten\n4. Fertig" };
    const notiz = store.createMemory(schritte);
    // Der Grund, warum diese Zeile existiert: vor der Entscheidung fiel alles auf "Fakt" zurück,
    // und eine Wissensbasis aus dem Rechner-Scan hatte 3071 von 3148 Notizen als Fakt — eine
    // Einteilung, die nichts mehr einteilt.
    expect(notiz.type).toBe("procedural");
    expect(notiz.type).toBe(klassifiziere({ ...schritte, tags: [] }).typ);

    const satz = store.createMemory({ title: "Mandat Hoffmann", content: "Die Frist läuft bis Ende Mai." });
    expect(satz.type).toBe(klassifiziere({ title: "Mandat Hoffmann", content: "Die Frist läuft bis Ende Mai.", tags: [] }).typ);
  });

  it("Vertrauen ohne Angabe ist 1, und alles ausserhalb von 0 bis 1 wird zurückgeholt", () => {
    const store = freshStore();
    expect(store.createMemory({ title: "Ohne Angabe", content: "Text" }).confidence).toBe(1);
    expect(store.createMemory({ title: "Ueberhoht", content: "Text", confidence: 5 }).confidence).toBe(1);
    expect(store.createMemory({ title: "Unter null", content: "Text", confidence: -2 }).confidence).toBe(0);
    expect(store.createMemory({ title: "Kein Zahl", content: "Text", confidence: Number.NaN }).confidence).toBe(1);
  });

  it("die zwei anderen Felder sind in jeder Zeile, das Fenster ist es nicht", () => {
    const store = freshStore();
    const m = store.createMemory({ title: "Kaffeebestellung", content: "Bohnen aus Aethiopien" });
    const notiz = store.getMemory(m.id);
    expect(typeof notiz?.type).toBe("string");
    expect(typeof notiz?.confidence).toBe("number");
    // Der ueber-starke Teil der Doku-Zeile, hier festgehalten: kein Fenster ist **kein** Fenster,
    // nicht "ein Fenster ohne Rand".
    expect(notiz?.validFrom).toBeNull();
    expect(notiz?.validTo).toBeNull();
  });

  it("ein fehlender Anfang wird beim Lesen zum Anlegedatum — in der Zeitreise, nicht im Speicher", async () => {
    const store = freshStore();
    const vor = Date.parse("2025-01-01");
    const m = store.createMemory({
      title: "Behälterordnung Kwark", content: "Behälterordnung Kwark im Lager", createdAt: vor, updatedAt: vor,
    });
    expect(m.validFrom).toBeNull();

    const vorher = await searchMemories(store, { query: "Behälterordnung Kwark", asOf: Date.parse("2024-06-01") });
    expect(vorher.hits.map((h) => h.memory.id), "vor dem Anlegedatum dürfte die Notiz nicht existieren").not.toContain(m.id);

    const nachher = await searchMemories(store, { query: "Behälterordnung Kwark", asOf: Date.parse("2025-06-01") });
    expect(nachher.hits.map((h) => h.memory.id), "nach dem Anlegedatum trägt die Welt die Notiz").toContain(m.id);
  });

  it("ein fehlendes Ende verjährt nie, ein gesetztes wird als abgelaufen gemeldet", async () => {
    const store = freshStore();
    const offen = store.createMemory({
      title: "Standort Drucker Erdgeschoss", content: "Standort Drucker Erdgeschoss steht so fest",
      createdAt: Date.parse("2020-01-01"), updatedAt: Date.parse("2020-01-01"),
    });
    const abgelaufen = store.createMemory({
      title: "Standort Drucker Erdgeschoss alt", content: "Standort Drucker Erdgeschoss alt, war einmal",
      createdAt: Date.parse("2019-01-01"), updatedAt: Date.parse("2019-01-01"),
      validFrom: Date.parse("2019-01-01"), validTo: Date.parse("2020-01-01"),
    });

    const jetzt = await searchMemories(store, { query: "Standort Drucker Erdgeschoss" });
    const ids = jetzt.hits.map((h) => h.memory.id);
    expect(ids).toContain(offen.id);
    expect(jetzt.hits.find((h) => h.memory.id === offen.id)?.expired).toBe(false);
    expect(jetzt.hits.find((h) => h.memory.id === abgelaufen.id)?.expired).toBe(true);
  });

  it("die Zeitreise blendet eine Notiz mit gesetztem Ende aus, sobald es vorbei ist", async () => {
    const store = freshStore();
    const m = store.createMemory({
      title: "Zwischenlager Westkai", content: "Zwischenlager Westkai war nur gemietet",
      createdAt: Date.parse("2021-01-01"), updatedAt: Date.parse("2021-01-01"),
      validFrom: Date.parse("2021-01-01"), validTo: Date.parse("2022-06-01"),
    });
    const inside = await searchMemories(store, { query: "Zwischenlager Westkai", asOf: Date.parse("2022-01-01") });
    expect(inside.hits.map((h) => h.memory.id)).toContain(m.id);
    const danach = await searchMemories(store, { query: "Zwischenlager Westkai", asOf: Date.parse("2023-01-01") });
    expect(danach.hits.map((h) => h.memory.id), "nach dem Ende darf die Zeitreise das Ende nicht tilgen").not.toContain(m.id);
  });
});
