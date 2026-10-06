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
let dir: string;
let prevHome: string | undefined;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-verkn-"));
  prevHome = process.env.HOME;
  process.env.HOME = dir;
  process.env.KEPTA_DATA_DIR = dir;
  const { KeptaStore: Store } = await import("../src/core/store");
  ({ createApp } = await import("../server"));
  app = createApp(new Store(path.join(dir, "test.db")) as unknown as KeptaStore, { lizenziert: () => true });
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
    relations: { source: string; target: string; relation: string; memoryId: string | null }[];
  };
}

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
