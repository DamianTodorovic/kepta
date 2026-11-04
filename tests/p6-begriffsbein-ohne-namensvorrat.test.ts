import { describe, it, expect, beforeEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";
import { searchMemories } from "../src/core/engine";

// Punkt 6, der zweite Arm des Schreibfalls. An der 40-000-Notizen-Kapsel brauchte die erste
// Anfrage nach einem Speichern 157 ms, davon 134.74 ms in einem Segment, das die Anfrage gar
// nicht betrifft (docs/belege/tag-0411/tuer-48-vor-3-2-139-0123.log.txt). Der Grund war ein
// Gang durch die Begriffs-Rangfolge: die Zusammenrechnung ueber 360 000 Kanten und 40 008
// Begriffe, gemessen 63.90 ms warm und 123.41 ms kalt an demselben Bestand
// (docs/belege/tag-0411/spurbau-grundlagen-40000-0136.log.txt). Sie hing an
// `datenGeneration`, und jeder Notiz-Schreibfall hebt sie (die Ausloeser stehen in store.ts:
// memories, chunks, entities, memory_entities, relations). Jede erste Anfrage nach einem
// Speichern zahlte sie, und die Maschine stand dabei still.
//
// Verlangt ist der umgekehrte Weg: die Stuecke der ANFRAGE gegen den Namensindex
// (`entities.name UNIQUE`) — eine indizierte Lesung, am Objekt gemessen 0.20 ms fuer 400
// Stuecke und 2.22 ms fuer 4000
// (docs/belege/tag-0411/begriffsnamen-form-0159.log.txt), und sie waechst mit der Laenge der
// Anfrage, nicht mit dem Bestand. Nach der Heilung meldet dieselbe Tuer 31 ms und 34 ms
// (docs/belege/tag-0411/tuer-48-nach-der-heilung-am-baum-0150.log.txt).
//
// Der Zeuge sitzt auf der Instanz und meldet jeden Gang durch die Rangfolge: bleibt er bei null,
// hat der Suchpfad die Zusammenrechnung nicht angefasst — egal ob die Antwort sonst stimmt.
vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));

type Rangfolge = (pool: number) => { id: number; name: string }[];
let store: KeptaStore;
let rangLaeufe: number;
beforeEach(() => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-begriffsbein-"));
  store = new KeptaStore(path.join(dir, "test.db"));
  rangLaeufe = 0;
  const uru = (store as unknown as { graphRang: Rangfolge }).graphRang.bind(store);
  (store as unknown as { graphRang: Rangfolge }).graphRang = (pool: number) => {
    rangLaeufe += 1;
    return uru(pool);
  };
});

const beinRang = (id: string, res: Awaited<ReturnType<typeof searchMemories>>) =>
  res.hits.find((h) => h.memory.id === id)?.components.entityRank ?? null;

describe("das Entity-Bein darf keinen Begriffs-Vorrat mehr bauen", () => {
  it("ein einzelner Griff holt die Rangfolge aller Begriffe nicht", async () => {
    const m = store.createMemory({ title: "Fristenkontrolle", content: "Die Frist laeuft am Freitag." } as never);
    store.linkEntities(m.id, ["frist"]);
    const res = await searchMemories(store, { query: "Fristenkontrolle" });
    expect(rangLaeufe, `der Griff holte die Begriffs-Rangfolge ${rangLaeufe} mal — an 40 000 Notizen sind das 129 ms Stillstand in der Anfrage`).toBe(0);
    expect(res.hits.length).toBeGreaterThan(0);
    // Der Zeuge muss hoeren: ohne diesen Schlag waere die null oben ein Fall, der nie verlieren kann.
    (store as unknown as { graphRang: Rangfolge }).graphRang(10);
    expect(rangLaeufe, "ein ausdruecklicher Gang durch die Rangfolge muss der Zaehler melden").toBe(1);
  });

  it("nach einem Schreibfall holt der naechste Griff den Vorrat noch immer nicht", async () => {
    const m = store.createMemory({ title: "Alte Notiz", content: "text" } as never);
    store.linkEntities(m.id, ["alte notiz"]);
    await searchMemories(store, { query: "alte notiz" });
    const vorher = rangLaeufe;
    store.createMemory({ title: "Neue Notiz", content: "text" } as never);
    expect(store.datenGeneration(), "der Schreibfall muss den Zaehler heben, sonst beweist dieser Fall nichts").toBeGreaterThan(0);
    await searchMemories(store, { query: "alte notiz" });
    expect(rangLaeufe, `nach dem Schreibfall wurde der Vorrat ${rangLaeufe - vorher} mal neu gebaut`).toBe(vorher);
  });

  it("ein Begriff, der erst im Schreibfall entstanden ist, wirkt in derselben Anfrage", async () => {
    // Das ist die Grenze jeder Cache-Idee: der frische Begriff darf nicht hinter einem
    // vorratigen Namen liegen. Rueber die Anfrage-Stuecke ist er sofort zu finden.
    const m = store.createMemory({ title: "Neubau Nord", content: "Der Neubau steht am Nordring." } as never);
    store.linkEntities(m.id, ["neubau nord"]);
    const res = await searchMemories(store, { query: "Neubau Nord", tracks: { bm25: false, vector: false, entity: true } });
    expect(beinRang(m.id, res), "ein eben erst verknuepfter Begriff muss die Anfrage eroeffnen koennen").not.toBeNull();
    expect(rangLaeufe).toBe(0);
  });

  it("ein Theilstueck innerhalb eines Wortes findet den Begriff weiter (Deutsch: Frist in Fristenkontrolle)", async () => {
    const m = store.createMemory({ title: "Fristenlauf", content: "Die Frist laeuft am Freitag." } as never);
    store.linkEntities(m.id, ["frist"]);
    const res = await searchMemories(store, { query: "Fristenkontrolle", tracks: { bm25: false, vector: false, entity: true } });
    expect(beinRang(m.id, res), `das Bein wurde ueber den Vorrat ${rangLaeufe} mal gesucht`).not.toBeNull();
  });

  it("ein Bindestrich-Begriff findet sich als ganzes Wort", async () => {
    const m = store.createMemory({ title: "Das Projekt", content: "laeuft" } as never);
    store.linkEntities(m.id, ["kepta-projekt"]);
    const res = await searchMemories(store, { query: "kepta-projekt", tracks: { bm25: false, vector: false, entity: true } });
    expect(beinRang(m.id, res)).not.toBeNull();
  });

  it("ein mehrwortiger Begriff findet sich in der Wortfolge", async () => {
    const m = store.createMemory({ title: "Pasta", content: "guanciale und pecorino" } as never);
    store.linkEntities(m.id, ["roemische kueche"]);
    const res = await searchMemories(store, { query: "die roemische kueche", tracks: { bm25: false, vector: false, entity: true } });
    expect(beinRang(m.id, res)).not.toBeNull();
  });

  it("ein fremdes Wort eroeffnet kein Bein", async () => {
    const m = store.createMemory({ title: "Pasta", content: "guanciale" } as never);
    store.linkEntities(m.id, ["roemische kueche"]);
    const res = await searchMemories(store, { query: "zzzzquix" });
    for (const h of res.hits) expect(h.components.entityRank, `die Anfrage nennt keinen Begriff, und ${h.memory.title} traegt Rang ${h.components.entityRank}`).toBeNull();
    expect(m.id).toBeTruthy();
  });

  it("eine sehr lange Anfrage eroeffnet das Bein weiter, ohne ueber die Stueck-Kappe zu stolpern", async () => {
    const m = store.createMemory({ title: "Quartalsbericht", content: "der Quartalsbericht 2026" } as never);
    store.linkEntities(m.id, ["quartalsbericht"]);
    const lange = `ein langer satz mit vielen woertern drumherum und noch mehr woertern und noch mehr woertern und noch mehr woertern und ${"quartalsbericht "}und ein wort mehr`;
    const res = await searchMemories(store, { query: lange, tracks: { bm25: false, vector: false, entity: true } });
    expect(beinRang(m.id, res), "der Begriff steht in einem langen Satz und muss trotzdem gefunden werden").not.toBeNull();
  });
});
