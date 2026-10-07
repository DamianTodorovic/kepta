import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import request from "supertest";
import { KeptaStore } from "../src/core/store";

/**
 * Notizen, die in der Oberfläche entstehen, müssen sich ebenso verknüpfen wie
 * Notizen, die ein Agent schreibt.
 *
 * Gemessen 6.10.: Der REST-Schreibweg (`server/router/memories.ts`) rief nur
 * `indexMemory` — `linkEntities` und `addRelation` liefen ausschließlich über
 * MCP und Obsidian. Eine Notiz aus der App war darum im Graphen ein Blatt ohne
 * Kante, und die Flächenzeile „75 nodes · 891 edges" entstand fast ganz aus
 * Ähnlichkeit, nicht aus dem, was jemand tatsächlich verknüpft hat.
 *
 * Zweiter Befund aus demselben Lesen: `addRelation` fügt bedingungslos ein.
 * Wer eine Notiz zweimal speichert, bekam zweimal dieselbe Kante.
 */

process.env.KEPTA_NO_AUTOSTART = "1";
process.env.KEPTA_ENCRYPTION = "off";

let createApp: typeof import("../server").createApp;
let app: import("express").Express;
let store: KeptaStore;
let dir: string;
let prevHome: string | undefined;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-verkn-"));
  prevHome = process.env.HOME;
  process.env.HOME = dir;
  process.env.KEPTA_DATA_DIR = dir;
  const { KeptaStore: Store } = await import("../src/core/store");
  ({ createApp } = await import("../server"));
  store = new Store(path.join(dir, "test.db")) as unknown as KeptaStore;
  app = createApp(store, { lizenziert: () => true });
});

afterEach(() => {
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
});

async function graph() {
  const res = await request(app).get("/api/graph?depth=2");
  expect(res.status).toBe(200);
  return res.body as {
    entities: { id: number; name: string }[];
    relations: {
      source: string;
      target: string;
      relation: string;
      memoryId: string | null;
      validFrom?: number | null;
      validTo?: number | null;
    }[];
  };
}

describe("Die Graph-Antwort nennt ihren eigenen Ausschnitt", () => {
  // getGraph kappt bei 500 Begriffen und 2000 Kanten. Diese Kappen bleiben —
  // sie halten die Fläche schnell. Was gefehlt hat, war die Zahl dahinter: ohne
  // sie konnte eine Fläche „33 links" in den Kopf schreiben, während die
  // Wissensbasis 2 431 Behauptungen trägt.
  it("nennt den Bestand neben dem, was es liefert", async () => {
    const notiz = await request(app).post("/api/memories").send({ title: "A", content: "x" });
    expect(notiz.status).toBe(200);
    store.addRelation("elena weiss", "nordwind logistics", "betreut", String(notiz.body.memory.id));
    store.addRelation("orion portal", "quay street lease", "folgt aus", String(notiz.body.memory.id));

    const res = await request(app).get("/api/graph?depth=2");
    expect(res.status).toBe(200);
    expect(res.body.bestand).toEqual({ knoten: 4, kanten: 2 });
    expect(res.body.relations).toHaveLength(2);
  });

  it("zählt den Bestand, auch wenn nur ein Begriff erfragt wurde", async () => {
    // Der Subgraph um einen Begriff ist per Definition ein Ausschnitt. Gerade
    // dort ist „von wie viel?" die Frage, die die Fläche beantworten muss.
    const notiz = await request(app).post("/api/memories").send({ title: "B", content: "x" });
    store.addRelation("elena weiss", "nordwind logistics", "betreut", String(notiz.body.memory.id));
    store.addRelation("ganz anderes", "wieder was", "betreut", String(notiz.body.memory.id));

    const res = await request(app).get("/api/graph?entity=elena%20weiss&depth=1");
    expect(res.status).toBe(200);
    expect(res.body.relations.length, "der Ausschnitt liefert mehr als einen Begriff").toBeLessThan(2);
    expect(res.body.bestand).toEqual({ knoten: 4, kanten: 2 });
  });
});

describe("Die Graph-Antwort trägt die Gültigkeit der Kante", () => {
  // Der Kern liefert validFrom/validTo seit 343cb04 aus. Die App hat einen
  // EIGENEN Graph-Endpunkt (server/router/system.ts), und der bildete die
  // Relation auf Namen ab und ließ das Fenster weg. Der Zeitregler konnte
  // dadurch nie eine Behauptung ausblenden, die längst geplatzt ist — er sah
  // ja nicht, wann sie geendigt hat.
  it("eine befristete Relation nennt ihr Fenster", async () => {
    const notiz = await request(app)
      .post("/api/memories")
      .send({ title: "Kondominium", content: "[[Elena Weiss]] betreut [[Nordwind Logistics]]." });
    expect(notiz.status).toBe(200);
    const von = Date.parse("2024-03-01T00:00:00Z");
    const bis = Date.parse("2025-06-30T00:00:00Z");
    store.addRelation("elena weiss", "nordwind logistics", "betreut", String(notiz.body.memory.id), von, bis);

    const g = await graph();
    const kante = g.relations.find((r) => r.relation === "betreut");
    expect(kante, "die Kante fehlt in der Antwort").toBeDefined();
    expect(kante!.validFrom).toBe(von);
    expect(kante!.validTo).toBe(bis);
  });

  it("eine unbefristete Relation sagt null statt das Feld wegzulassen", async () => {
    store.addRelation("alpha", "beta", "kennt", null);
    const g = await graph();
    const kante = g.relations.find((r) => r.relation === "kennt");
    expect(kante, "die Kante fehlt in der Antwort").toBeDefined();
    // Würde JSON das Feld verschlucken, wäre „unbefristet" nicht mehr von
    // „diese Serverversion kennt das Feld nicht" zu unterscheiden.
    expect(Object.keys(kante!)).toContain("validFrom");
    expect(Object.keys(kante!)).toContain("validTo");
    expect(kante!.validFrom).toBeNull();
    expect(kante!.validTo).toBeNull();
  });
});

describe("Verknüpfung aus dem REST-Schreibweg", () => {
  it("ein Wiki-Link einer neuen Notiz wird Entität und Relation mit Typ und Träger", async () => {
    const res = await request(app)
      .post("/api/memories")
      .send({ title: "Akkreditiv Berlin", content: "Eröffnet zugunsten der [[Nordwind Logistics]] am 12.11.2026." });
    expect(res.status).toBe(200);

    const g = await graph();
    const namen = g.entities.map((e) => e.name.toLowerCase());
    expect(namen).toContain("nordwind logistics");

    const kante = g.relations.find((r) => r.target === "nordwind logistics");
    expect(kante).toBeTruthy();
    expect(kante!.relation).toBe("mentions");
    // Der Träger ist Teil des Beweises: ohne memoryId weiß niemand, welche
    // Notiz die Kante behauptet — und ohne ihn fällt sie nie mit ihrer Notiz.
    expect(kante!.memoryId).toBe(res.body.memory.id);
  });

  it("zweimal Speichern derselben Notiz erzeugt nicht zweimal dieselbe Kante", async () => {
    const text = "Eröffnet zugunsten der [[Nordwind Logistics]] am 12.11.2026.";
    const erste = await request(app).post("/api/memories").send({ title: "Akkreditiv Berlin", content: text });
    await request(app)
      .post("/api/memories")
      .send({ id: erste.body.memory.id, title: "Akkreditiv Berlin", content: text });

    const g = await graph();
    const kanten = g.relations.filter((r) => r.target === "nordwind logistics" && r.memoryId === erste.body.memory.id);
    expect(kanten.length).toBe(1);
  });

  it("ein entfernter Link verschwindet aus dem Graphen", async () => {
    const erste = await request(app)
      .post("/api/memories")
      .send({ title: "Bürgschaft Weber", content: "Für die [[Kestrel Software]]." });
    await request(app)
      .post("/api/memories")
      .send({ id: erste.body.memory.id, content: "Für die [[Nordwind Logistics]]." });

    const g = await graph();
    expect(g.relations.some((r) => r.memoryId === erste.body.memory.id && r.target === "kestrel software")).toBe(false);
    expect(g.relations.some((r) => r.memoryId === erste.body.memory.id && r.target === "nordwind logistics")).toBe(true);
  });

  it("zwei Notizen auf dasselbe Thema teilen eine Entität, nicht zwei", async () => {
    await request(app).post("/api/memories").send({ title: "Anruf Roth", content: "Mit [[Nordwind Logistics]] besprochen." });
    await request(app).post("/api/memories").send({ title: "Termin Roth", content: "Bei [[Nordwind Logistics]] vor Ort." });

    const g = await graph();
    expect(g.entities.filter((e) => e.name === "nordwind logistics").length).toBe(1);
    expect(g.relations.filter((r) => r.target === "nordwind logistics").length).toBe(2);
  });
});
