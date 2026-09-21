// Das Erlebnis-CLI: remember setzt Typ/Tags automatisch (die Store-Regeln —
// nicht „alles Fakt"), recall liefert sortierte Treffer mit eigenen Snippets,
// timeline sortiert alt→neu, contradict bleibt dry-run, stats zählt echt.
import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../src/core/store";
import { remember, recall, timeline, contradict, stats } from "../src/cli-erlebnis";

let store: KeptaStore;

beforeEach(() => {
  store = new KeptaStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cli-")), "t.db"));
});

describe("remember", () => {
  it("nummerierte Schritte → How-to (nicht Fakt); Tag #echo wird mitgenommen", () => {
    const r = remember(store, "1. Kabel anschließen\n2. Treiber laden\n3. Testseite drucken", ["echo"]);
    expect(r.typ).toBe("procedural");
    const m = store.getMemory(r.id)!;
    expect(m.tags).toContain("remember");
    expect(m.tags).toContain("echo");
  });

  it("leerer Text wirft eine klare Fehlermeldung", () => {
    expect(() => remember(store, "   ", [])).toThrow(/Nothing to remember/);
  });
});

describe("recall", () => {
  it("findet die Notiz, mit eigenem Snippet und Altern-Text", async () => {
    remember(store, "Production runs on the Hetzner CX42 in Nuremberg.", ["infra"]);
    const { treffer, total } = await recall(store, "Where does production run?");
    expect(total).toBeGreaterThanOrEqual(1);
    expect(treffer[0]!.titel).toContain("Hetzner");
    expect(treffer[0]!.snippet.length).toBeGreaterThan(5);
    expect(["today", /\dd ago/.source].some((x) => treffer[0]!.alter === x || new RegExp(x).test(treffer[0]!.alter))).toBe(true);
  });
});

describe("timeline", () => {
  it("sortiert alt → neu und filtert nach Thema", () => {
    const jetzt = Date.now();
    const alt = store.createMemory({ title: "Old decision", content: "We chose [[Postgres]].", validFrom: jetzt - 90 * 86_400_000, createdAt: jetzt - 90 * 86_400_000 });
    const neu = store.createMemory({ title: "New decision", content: "Postgres 16 upgrade planned, still [[Postgres]].", validFrom: jetzt - 5 * 86_400_000, createdAt: jetzt - 5 * 86_400_000 });
    store.createMemory({ title: "Unrelated", content: "Kaffee ist alle.", tags: ["kueche"] });
    const eintraege = timeline(store, "postgres");
    expect(eintraege.length).toBe(2);
    expect(eintraege[0]!.titel).toBe(alt.title);
    expect(eintraege[1]!.titel).toBe(neu.title);
    expect(eintraege[0]!.datum.length).toBe(10);
  });
});

describe("contradict", () => {
  it("dry-run: meldet Duplikate, ändert nichts", async () => {
    remember(store, "The production server is Hetzner CX42.", ["infra"]);
    remember(store, "The production server is Hetzner CX42.", ["infra"]);
    const vor = store.countMemories();
    const { anzahl, widersprueche } = await contradict(store);
    expect(anzahl).toBeGreaterThanOrEqual(1);
    expect(["embedding", "title+tags"]).toContain(widersprueche[0]!.grund);
    expect(store.countMemories()).toStrictEqual(vor);
  });
});

describe("stats", () => {
  it("zählt aktiv/trashed, Typen und echte Graph-Kanten", () => {
    remember(store, "1. Step one\n2. Step two", []);
    remember(store, "Fact about [[Alpha]].", []);
    remember(store, "Fact about [[Beta]] and [[Alpha]].", []);
    store.createMemory({ title: "Alpha", content: "The note the links point at." });
    // Den How-to-Notiz in den Papierkorb (NICHT Alpha — der trägt die Kanten):
    const howto = store.listMemories({}).find((m) => m.title.startsWith("1. Step"))!;
    store.trashMemory(howto.id);
    const s = stats(store);
    expect(s.notizen.active).toBe(3);
    expect(s.notizen.trashed).toBe(1);
    expect(Object.values(s.typen).reduce((a, b) => a + b, 0)).toBe(3);
    expect(s.graphKnoten).toBe(3);
    expect(s.graphKanten).toBeGreaterThanOrEqual(1);
    expect(s.verschluesselt).toBe(false);
  });
});
