// @vitest-environment node
//
// Punkt 6, Schritt 3: die Begriffs-Kanten des Imports.
//
// Die Teilzeiten des Schreibwegs (31.10. 23:2x MESZ, 6 000 Notizen in Brocken zu 500, eigne
// Kapsel, Vektorspur aus) trennen die fruehere Sammelphase "index" in ihre zwei Arbeiten:
//
//   Bestand 0 -> 5 500:  chunksetzen 62,75 -> 82,07 ms   begriffekanten 311,95 -> 1 378,13 ms
//
// Brocken setzen bleiben flach. Was mit dem Bestand mitwächst, ist `verknuepfeNotiz`, und in
// ihr steht pro Notiz: SELECT id, source_id, target_id, relation FROM relations WHERE
// memory_id = ?  (src/core/store.ts:1271). Die Tabelle hat seit je eine Spur auf source_id
// und eine auf target_id — keine auf memory_id. Eine Notiz fragt also nach IHREN Kanten, und
// die Antwort kommt aus der ganzen Kantentabelle.
//
// Der Fall prueft den Plan, nicht die Zahl: eine Zahl waere maschinenabhaengig, der Plan ist
// die Aussage. Kontrolle am Ergebnis bleibt trotzdem (ein Index darf keine Kante verlieren).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../src/core/store";
import { defaultExtensions } from "../src/core/extensions";
import { indexMemory } from "../src/core/engine";

let wurzel = "";
let store: KeptaStore;
let vorherHeim: string | undefined;
let vorherDaten: string | undefined;

beforeAll(() => {
  wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-kanten-index-"));
  vorherHeim = process.env.HOME;
  vorherDaten = process.env.KEPTA_DATA_DIR;
  process.env.HOME = wurzel;
  process.env.KEPTA_DATA_DIR = wurzel;
  const datenSchluessel = new Uint8Array(crypto.randomBytes(32));
  store = new KeptaStore(path.join(wurzel, "kepta.db"), {
    ...defaultExtensions(),
    keys: { ablage: "KEPTA_DB_KEY (Messlauf)", keyFor: () => datenSchluessel },
  });
  // Ein Netz, das nachzahlt: 300 Notizen, je drei Begriffe, also Kanten ueber Kanten.
  for (let i = 0; i < 300; i++) {
    const notiz = store.createMemory({
      title: `Kantenprobe ${i}`, content: `Nennt [[Begriff ${(i * 7) % 40}]] und [[Begriff ${(i * 13) % 40}]].`,
      tags: [],
    } as never);
    indexMemory(store, notiz.id);
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

describe("Punkt 6: die Frage nach den Kanten einer Notiz laeuft ueber eine Spur", () => {
  it("die Spur auf memory_id steht in der Schema-Liste der relations", () => {
    const zeilen = store.db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'relations'`)
      .all() as Array<{ name: string }>;
    const namen = zeilen.map((z) => z.name);
    expect(namen.join(" "), `keine memory_id-Spur in: ${namen.join(", ")}`).toMatch(/memory/);
  });

  it("der Plan der Kantensuche benutzt die Spur, nicht die Tabelle", () => {
    const plan = store.db
      .prepare("EXPLAIN QUERY PLAN SELECT id, source_id, target_id, relation FROM relations WHERE memory_id = ?")
      .all("irgendeine-notiz") as Array<{ detail?: string }>;
    const text = plan.map((p) => p.detail || "").join(" | ");
    expect(text, "kein Plan gelesen").not.toBe("");
    expect(text, `Plan: ${text}`).toMatch(/USING (COVERING )?INDEX.*memory/i);
    expect(text, `Plan scannt die Kantentabelle: ${text}`).not.toMatch(/SCAN TABLE/i);
  });

  it("die Kantensetzung behält ihr Ergebnis — die Spur ändert nur den Weg", () => {
    const notiz = store.createMemory({ title: "Kantenkontrolle", content: "Nennt [[Alpha]] und [[Beta]].", tags: [] } as never);
    const gesetzt = store.verknuepfeNotiz(notiz.id, notiz.title, ["alpha", "beta"]);
    expect(gesetzt, "die Notiz bekommt keine Kanten").toBeGreaterThan(0);
    const eigenen = store.db
      .prepare("SELECT source_id, target_id, relation FROM relations WHERE memory_id = ?")
      .all(notiz.id) as Array<{ source_id: number; target_id: number; relation: string }>;
    expect(eigenen.length, "die Frage nach memory_id findet nichts").toBeGreaterThan(0);
    // Idempotenz: dieselbe Notiz nochmal verknuepfen setzt keine Kante ein zweites Mal.
    const nochmal = store.verknuepfeNotiz(notiz.id, notiz.title, ["alpha", "beta"]);
    expect(nochmal, "das zweite Setzen ändert die Zahl der Kanten nicht").toBe(gesetzt);
  });
});
