// @vitest-environment node
//
// BAU-P3-11, zweiter Schritt (24.10. 00:1x MESZ): die Engine haelt den Text VOR einer Aenderung.
//
// Gemessen am Kopf 53e2520, bevor dieser Fall geschrieben wurde: die Engine haelt **keinen** Stand.
// `updateMemory` (src/core/store.ts:727) schreibt `UPDATE memories SET ... WHERE id = ?` - der alte
// Text ist danach weg; `superseded_by` gibt es, es zeigt aber auf eine NEUE Zeile, die der Aufrufer
// erst anlegen muss (store.ts:810), und der Trigger (store.ts:889) zaehlt nur eine Generation.
// Deshalb faellt dieser Fall heute rot, und zwar am Verhalten, nicht an einer Kennung.
//
// Was er verlangt, in Zahlen: nach einer Aenderung fuehrt `listStande(id)` genau einen Stand mit dem
// **wortgleichen** alten Text; nach zwei Aenderungen zwei Staende, neueste zuerst; ein Schreibvorgang
// ohne Textaenderung (nur Tags) und ein Schreibvorgang mit identischem Text legen **keinen** Stand an;
// eine Notiz ohne Aenderung hat **null** Staende.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../../src/core/store";

let store: KeptaStore;
let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-stand-"));
  store = new KeptaStore(path.join(dir, "t.db"));
});

afterEach(() => {
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const anlegen = (titel: string, inhalt: string) =>
  store.createMemory({ title: titel, content: inhalt, tags: [] } as never);

describe("Standfolge einer Notiz: eine Aenderung haelt den Text davor", () => {
  it("eine Notiz ohne Aenderung hat null Staende (benannter leerer Zustand)", () => {
    const m = anlegen("Notiz", "Der erste Text");
    const s = store.listStande(m.id);
    expect(s.total).toBe(0);
    expect(s.staende).toHaveLength(0);
  });

  it("eine Inhaltsaenderung legt genau einen Stand an - mit dem wortgleichen alten Text", () => {
    const m = anlegen("Titel", "Fassung eins");
    store.updateMemory(m.id, { content: "Fassung zwei" });
    const s = store.listStande(m.id);
    expect(s.total).toBe(1);
    expect(s.staende[0].content).toBe("Fassung eins");
    expect(s.staende[0].title).toBe("Titel");
    expect(store.getMemory(m.id)?.content).toBe("Fassung zwei");
  });

  it("zwei Aenderungen ergeben zwei Staende, neueste zuerst", () => {
    const m = anlegen("Titel", "eins");
    store.updateMemory(m.id, { content: "zwei" });
    store.updateMemory(m.id, { content: "drei" });
    const s = store.listStande(m.id);
    expect(s.total).toBe(2);
    expect(s.staende.map((x) => x.content)).toEqual(["zwei", "eins"]);
    expect(store.getMemory(m.id)?.content).toBe("drei");
  });

  it("ein Schreibvorgang nur an den Tags legt keinen Stand an", () => {
    const m = anlegen("Titel", "Text bleibt");
    store.updateMemory(m.id, { tags: ["neu"] });
    expect(store.listStande(m.id).total).toBe(0);
  });

  it("ein Schreibvorgang mit identischem Text legt keinen zweiten Stand an", () => {
    const m = anlegen("Titel", "gleich");
    store.updateMemory(m.id, { content: "gleich" });
    expect(store.listStande(m.id).total).toBe(0);
  });

  it("ein langer Text kommt vollstaendig zurueck, nicht als Vorschau", () => {
    const lang = "Zeile mit Inhalt. ".repeat(280).trim(); // rund 5 000 Zeichen
    const m = anlegen("Lang", lang);
    store.updateMemory(m.id, { content: "kurz" });
    const s = store.listStande(m.id);
    expect(s.total).toBe(1);
    expect(s.staende[0].content.length).toBe(lang.length);
    expect(s.staende[0].content).toBe(lang);
  });

  it("Lesen schreibt nicht: zweimal lesen aendert weder Zahl noch Text", () => {
    const m = anlegen("Ruhig", "unveraendert");
    store.updateMemory(m.id, { content: "neu" });
    const vorher = store.getMemory(m.id)?.content;
    const a = store.listStande(m.id);
    const b = store.listStande(m.id);
    expect(a.total).toBe(1);
    expect(b.total).toBe(1);
    expect(store.getMemory(m.id)?.content).toBe(vorher);
  });

  it("die Staende einer Notiz bleiben bei ihr: eine zweite Notiz hat ihre eignen", () => {
    const a = anlegen("A", "A eins");
    const b = anlegen("B", "B eins");
    store.updateMemory(a.id, { content: "A zwei" });
    store.updateMemory(b.id, { content: "B zwei" });
    expect(store.listStande(a.id).staende.map((x) => x.content)).toEqual(["A eins"]);
    expect(store.listStande(b.id).staende.map((x) => x.content)).toEqual(["B eins"]);
  });
});
