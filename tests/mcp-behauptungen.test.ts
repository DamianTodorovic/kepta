// @vitest-environment node
//
// Punkt 127, die Agenten-Pforte — eine Aussage darf nicht nur einer Hand gehoeren.
//
// 126 hat den Weg fuer die Oberflaeche gebaut (`server/router/memories.ts`, Field
// `beziehungen`). Dem Agentenkanal fehlt das Feld bis heute, gemessen am Stand vor diesem
// Schnitt:
//   · `src/core/mcp.ts:361` ruft `verknuepfeNotiz(record.id, record.title, links)` — drei
//     Argumente, kein viertes. Die Kappe der Aussage existiert also an der Pforte nicht.
//   · `memory_save` in der Werkzeug-Tafel (`src/core/mcp.ts:105-125`) wirbt elf Felder, und
//     keins davon heisst `beziehungen`. Ein Agent, der das Feld trotzdem schickt, bekommt
//     eine Notiz **ohne** Kante und eine Antwort **ohne** Widerspruch: stoisch verworfen.
//
// Produktfolge: das verkaufte Gedaechtnis ist ein Gedaelchtnis fuer Claude und Cursor. Kann
// nur die Hand Woerter setzen, bleibt der Graph in jeder Agenten-Konfiguration stumm, und die
// Kopfzeile, die seit 3.2.92 die Deckung nennt, sagt Agenten-Bestaenden dann zu Recht
// Wortlosigkeit zu.
//
// Der gefaehrlichste Fall ist der dritte von oben: eine Absage, die **doch** eine halbe Notiz
// hinterlaesst. Er wird hier zuerst gegen die Tafel geprueft und dann gegen den Bestand.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import request from "supertest";
import { KeptaStore } from "../src/core/store";
import { TOOLS, callTool } from "../src/core/mcp";

process.env.KEPTA_NO_AUTOSTART = "1";
process.env.KEPTA_ENCRYPTION = "off";

let dir = "";
let prevHome: string | undefined;
let store: KeptaStore;
let createApp: typeof import("../server").createApp;
let app: import("express").Express;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-127-"));
  prevHome = process.env.HOME;
  process.env.HOME = dir;
  process.env.KEPTA_DATA_DIR = dir;
  const { KeptaStore: Store } = await import("../src/core/store");
  store = new Store(path.join(dir, "test.db")) as unknown as KeptaStore;
  ({ createApp } = await import("../server"));
  app = createApp(store);
});

afterEach(() => {
  try { store.close(); } catch { /* schon zu */ }
  process.env.HOME = prevHome;
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* weg */ }
});

type Struct = { created?: boolean; memory?: { id?: string } | null; behauptungen?: number };

function strukt(res: Awaited<ReturnType<typeof callTool>>): Struct {
  return (res.structuredContent ?? {}) as Struct;
}

/** Wie viele Begriffe an dieser Notiz haengen — die Deckung, in einer Zeile gemessen. */
function begriffeDran(id: string): number {
  const row = store.db.prepare("SELECT COUNT(*) AS n FROM memory_entities WHERE memory_id = ?").get(id) as { n: number };
  return row.n;
}

describe("127 die Agenten-Pforte der Behauptung", () => {
  it("die Werkzeug-Tafel wirbt das Feld, sonst schickt niemand es", () => {
    const save = TOOLS.find((t) => t.name === "memory_save");
    expect(save, "memory_save fehlt auf der Tafel").toBeDefined();
    const props = (save!.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
    expect(Object.keys(props), "die Tafel nennt kein Feld fuer Aussagen").toContain("beziehungen");
    const feld = props.beziehungen as {
      type?: string;
      items?: { properties?: Record<string, unknown>; required?: string[] };
    };
    expect(feld.type).toBe("array");
    expect(Object.keys(feld.items?.properties ?? {})).toEqual(["quelle", "ziel", "wort"]);
    expect(feld.items?.required).toEqual(["quelle", "ziel", "wort"]);
  });

  it("ein Agent setzt eine Aussage, und die Antwort nennt, was ankam", async () => {
    const res = await callTool(store, "memory_save", {
      title: "Uebergabe 14.03",
      content: "Nordwind traegt die Frist, Elena die Rechnung.",
      beziehungen: [{ quelle: "Nordwind", ziel: "Elena", wort: "betreut" }],
    });
    expect(res.isError, `die Pforte wieserte an: ${JSON.stringify(res.content)}`).toBeFalsy();
    const s = strukt(res);
    expect(s.created).toBe(true);
    expect(s.behauptungen, "die Antwort nennt nicht, wie viel ankam").toBe(1);
    const id = String(s.memory?.id);
    expect(store.behauptungenVonNotiz(id)).toEqual([{ quelle: "nordwind", ziel: "elena", wort: "betreut" }]);
  });

  it("eine Absage wegen des Wortes legt keine halbe Notiz an", async () => {
    const vorher = store.countMemories().active;
    const res = await callTool(store, "memory_save", {
      title: "Protokoll",
      content: "Nordwind und Elena.",
      beziehungen: [{ quelle: "Nordwind", ziel: "Elena", wort: "mentions" }],
    });
    expect(res.isError, "ein Systemwort wurde hingenommen statt abgesagt").toBe(true);
    const text = JSON.stringify(res.content).toLowerCase();
    expect(text, "die Absage nennt nicht, welches Wort zu tun ist").toContain("word");
    expect(store.countMemories().active, "die abgewiesene Notiz steht im Bestand").toBe(vorher);
  });

  it("wer das Feld nicht schickt, loescht dem Agenten nichts weg", async () => {
    const erste = strukt(await callTool(store, "memory_save", {
      title: "Protokoll", content: "Nordwind und Elena.",
      beziehungen: [{ quelle: "Nordwind", ziel: "Elena", wort: "betreut" }],
    }));
    const id = String(erste.memory?.id);
    expect(store.behauptungenVonNotiz(id), "die Aussage stand nie — der Fall waer leer").toHaveLength(1);
    // Zweiter Speichern ohne das Feld — so speichert ein Agent, der nur den Text nachzieht.
    // Titel mit, wie die Tafel es verlangt: sie schreibt title und content als Pflicht vor.
    const zweite = await callTool(store, "memory_save", { id, title: "Protokoll", content: "Nordwind und Elena, spaeter ergaenzt." });
    expect(zweite.isError, `der Update-Lauf warf: ${JSON.stringify(zweite.content)}`).toBeFalsy();
    expect(store.behauptungenVonNotiz(id), "ein Speichern ohne Feld hat die Aussage geloescht").toHaveLength(1);
  });

  it("ein leeres Feld heisst: alle Aussagen weg", async () => {
    const erste = strukt(await callTool(store, "memory_save", {
      title: "Protokoll", content: "Nordwind und Elena.",
      beziehungen: [{ quelle: "Nordwind", ziel: "Elena", wort: "betreut" }],
    }));
    const id = String(erste.memory?.id);
    expect(store.behauptungenVonNotiz(id), "die Aussage stand nie — der Fall waer leer").toHaveLength(1);
    const loesch = await callTool(store, "memory_save", { id, title: "Protokoll", content: "Nordwind und Elena.", beziehungen: [] });
    expect(loesch.isError, `das leere Feld warf: ${JSON.stringify(loesch.content)}`).toBeFalsy();
    expect(strukt(loesch).behauptungen, "die Antwort nennt nicht den leeren Stand").toBe(0);
    expect(store.behauptungenVonNotiz(id), "das leere Feld wurde als 'nicht angefasst' gelesen").toHaveLength(0);
  });

  it("ueber der Kappe nennt die Antwort, was steht — nicht, was geschickt wurde", async () => {
    const viele = Array.from({ length: 25 }, (_, i) => ({ quelle: "nordwind", ziel: `partner ${i}`, wort: `belegt ${i}` }));
    const s = strukt(await callTool(store, "memory_save", { title: "Protokoll", content: "Nordwind.", beziehungen: viele }));
    expect(s.behauptungen, "die Antwort verschweigt, dass die Kappe griff").toBe(20);
  });

  it("Muell im Feld wirft die Pforte nicht um und legt nichts an", async () => {
    for (const muell of [null, "betreut", 42, [{ quelle: 1 }], {}]) {
      const vorher = store.countMemories().active;
      const res = await callTool(store, "memory_save", { title: "Protokoll", content: "x", beziehungen: muell });
      expect(res.isError, `die Form ${JSON.stringify(muell)} wurde hingenommen`).toBe(true);
      const text = JSON.stringify(res.content);
      expect(text.toLowerCase(), `die Absage zu ${JSON.stringify(muell)} nennt keinen Grund`).toContain("claim");
      expect(store.countMemories().active, `die Form ${JSON.stringify(muell)} legte eine Notiz an`).toBe(vorher);
    }
    const graph = strukt(await callTool(store, "memory_graph", {}));
    expect(JSON.stringify(graph).toLowerCase(), "Muell setzte eine Kante").not.toContain("betreut");
  });

  it("die Aussage des Agenten steht am Begriff und macht die Notiz lesbar", async () => {
    // Prosa ohne Wiki-Link traegt kein Wort — genau die 95,17 % des Bestands. Der Agent, der
    // eine Aussage setzt, haengt damit zwei Begriffe an dieselbe Notiz; das ist der Produkt-
    // unterschied, um willen dieser Schnitt gebaut wird.
    const leer = strukt(await callTool(store, "memory_save", {
      title: "Uebergabe Nord", content: "Nordwind traegt die Frist, Elena die Rechnung.",
    }));
    const id = String(leer.memory?.id);
    expect(begriffeDran(id), "Prosa-Notiz sollte ohne Begriff dastehen").toBe(0);
    const nach = await callTool(store, "memory_save", {
      id, title: "Uebergabe Nord", content: "Nordwind traegt die Frist, Elena die Rechnung.",
      beziehungen: [{ quelle: "Nordwind", ziel: "Elena", wort: "betreut" }],
    });
    expect(nach.isError, `die zweite Pforte warf: ${JSON.stringify(nach.content)}`).toBeFalsy();
    expect(begriffeDran(id), "die Aussage des Agenten hinterlaesst keine Begriffe").toBeGreaterThan(0);
    const graph = await callTool(store, "memory_graph", { entity: "nordwind" });
    expect(JSON.stringify(graph.structuredContent)).toContain("betreut");
  });

  it("die HTTP-Agenten-Tuer antwortet wie die Tafel: 200 mit Zahl, 400 mit Grund", async () => {
    const ok = await request(app)
      .post("/api/mcp/save")
      .send({ title: "Uebergabe 14.03", content: "Nordwind und Elena.",
              beziehungen: [{ quelle: "Nordwind", ziel: "Elena", wort: "betreut" }] })
      .expect(200);
    expect(ok.body.memory).toBeTruthy();
    const absage = await request(app)
      .post("/api/mcp/save")
      .send({ title: "Protokoll", content: "Nordwind und Elena.",
              beziehungen: [{ quelle: "Nordwind", ziel: "Elena", wort: "related" }] })
      .expect(400);
    expect(String(absage.body.error).toLowerCase()).toContain("word");
    const liste = await request(app).get("/api/memories?limit=20").expect(200);
    const titel = JSON.stringify(liste.body);
    expect(titel, "die abgewiesene Notiz steht im Bestand").not.toContain("Protokoll");
  });

  it("REST und Agent sprechen dieselbe Absage — ein Vertrag, nicht zwei", async () => {
    const muell = { quelle: "Nordwind", ziel: "nordwind", wort: "betreut" };
    const rest = await request(app).post("/api/memories")
      .send({ title: "A", content: "x", beziehungen: [muell] }).expect(400);
    const agent = await callTool(store, "memory_save", { title: "B", content: "x", beziehungen: [muell] });
    expect(agent.isError).toBe(true);
    const text = String((agent.content as { text?: string }[])[0]?.text ?? "");
    expect(text.replace(/^Error:\s*/, ""), "zwei Tueren, zwei Vertraege").toBe(String(rest.body.error));
  });
});
