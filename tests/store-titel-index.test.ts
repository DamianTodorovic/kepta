// @vitest-environment node
//
// Punkt 6, Schritt 2 aus `feldzug/p6-40000-und-sonde-3110.md` §10: der Titel-Weg des Imports.
//
// Warum diese Datei existiert: der Schreibweg nennt seit 49b9214 seine Teilzeiten, und die
// Messung (23:09 MESZ, 6 000 Notizen in Brocken zu 500, eigne Kapsel, Vektorspur aus) sagt,
// WER langsam wird, wenn der Bestand waechst:
//
//   Bestand 0 -> 5 500:   lesen 40,34 -> 590,94 ms   einsetzen 211,20 -> 217,34 ms
//                         index 380,77 -> 1 473,65 ms   verknuepfen 199,64 -> 226,66 ms
//
// Einsetzen und Verknuepfen bleiben flach. Das, was mit dem Bestand mitwaechst, ist der
// Titel-Weg: `importMarkdownFile` sucht je neuer Notiz `store.findByTitle`, und die Frage
// `WHERE title = ?` hat seit je einen Index auf scope, type, deleted_at, updated_at — nur
// nicht auf `title`. Eine Suche pro Notiz durch die ganze Tabelle ist ein Viertel der
// Importzeit bei 5 500 und der Grund, warum "der ganze Vault" nie schnell wird.
//
// Der Fall prueft nicht die Zahl (die waere maschinenabhaengig), sondern den PLAN: SQLite
// muss den Index benutzen. Ohne Index steht im Plan eine Tabellen-Durchsuchung, und die
// Messung oben ist erklaert.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../src/core/store";
import { defaultExtensions } from "../src/core/extensions";

let wurzel = "";
let store: KeptaStore;
let vorherHeim: string | undefined;
let vorherDaten: string | undefined;

beforeAll(() => {
  wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-titel-index-"));
  vorherHeim = process.env.HOME;
  vorherDaten = process.env.KEPTA_DATA_DIR;
  process.env.HOME = wurzel;
  process.env.KEPTA_DATA_DIR = wurzel;
  const datenSchluessel = new Uint8Array(crypto.randomBytes(32));
  store = new KeptaStore(path.join(wurzel, "kepta.db"), {
    ...defaultExtensions(),
    keys: { ablage: "KEPTA_DB_KEY (Messlauf)", keyFor: () => datenSchluessel },
  });
  for (let i = 0; i < 200; i++) {
    store.createMemory({ title: `Titelprobe ${i}`, content: `Inhalt ${i}`, tags: [] } as never);
  }
});

afterAll(() => {
  store?.close();
  if (vorherHeim === undefined) delete process.env.HOME;
  else process.env.HOME = vorherHeim;
  if (vorherDaten === undefined) delete process.env.KEPTA_DATA_DIR;
  else process.env.KEPTA_DATA_DIR = vorherDaten;
  fs.rmSync(wurzel, { recursive: true, force: true });
});

describe("Punkt 6: der Titel-Weg des Imports laeuft ueber einen Index", () => {
  it("der Index auf dem Titel steht in der Schema-Liste", () => {
    const zeilen = store.db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'memories'`)
      .all() as Array<{ name: string }>;
    const namen = zeilen.map((z) => z.name);
    expect(namen.join(" "), `keine Titel-Spur in: ${namen.join(", ")}`).toMatch(/title/);
  });

  it("der Plan der Titel-Frage benutzt den Index, nicht die Tabelle", () => {
    // Derselbe Ausschnitt, den store.findByTitle stellt — hier erklart, nicht ausgefuehrt.
    const plan = store.db
      .prepare(`EXPLAIN QUERY PLAN SELECT id FROM memories WHERE title = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1`)
      .all("Titelprobe 7") as Array<{ detail?: string; searchable?: string }>;
    const text = plan.map((p) => p.detail || "").join(" | ");
    expect(text, `kein Plan gelesen`).not.toBe("");
    expect(text, `Plan sucht die Tabelle: ${text}`).toMatch(/USING (COVERING )?INDEX.*title/i);
    expect(text, `Plan sucht trotzdem die ganze Tabelle: ${text}`).not.toMatch(/SCAN TABLE/i);
  });

  it("die Suche selbst antwortet richtig — der Index veraendert kein Ergebnis", () => {
    const fund = store.findByTitle("Titelprobe 42");
    expect(fund, "die Titelsuche findet nichts mehr").toBeTruthy();
    expect(fund!.title).toBe("Titelprobe 42");
    expect(store.findByTitle("Titelprobe 42 — gibt es nicht"), "sie findet, was nicht da ist").toBeNull();
  });
});
