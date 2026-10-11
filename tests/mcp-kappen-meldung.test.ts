// R7 auf der Agentenfläche — „wer kappt, sagt es. Kein slice ohne Begleittext."
// Am committeten Stand (c12b478) meldet nur EINE der vier gekappten Antworten ihre Kappe:
// memory_consolidate (src/core/mcp.ts:706-712). Die anderen drei kappten still:
//   memory_search  limit 1..100            src/core/mcp.ts:498   — 500 gewünscht, 100 geliefert, kein Wort
//   memory_list    limit 1..200            src/core/mcp.ts:616
//                  Lesefenster 5000        src/core/mcp.ts:629   — total sagt 5000, wo der Bestand größer ist
//   memory_graph   depth 1..4              src/core/mcp.ts:640
//                  Ganz-Graph 500/2000     src/core/store.ts getGraph — die Beschreibung sagt "capped", die Antwort nicht
// Ein Agent, der count/total liest, hält die Seite für die Welt. Diese Datei hält die Regel.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import Ajv from "ajv";
import { KeptaStore, LES_FENSTER, GRAPH_ENTITATEN_FENSTER } from "../src/core/store";
import { handleRpc, TOOLS, SUCHE_LIMIT_MAX, LISTE_LIMIT_MAX, TIEFE_MAX, type JsonRpcRequest } from "../src/core/mcp";

// [[D2-TERMINAL-TEXT-DESIGN]] R7; Vorlage: tests/mcp-consolidate-bestaetigung.test.ts:158
interface ToolResult {
  content: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

interface Werkzeug {
  name: string;
  outputSchema: { properties: Record<string, { type?: string }>; required?: string[] };
}

const werkzeuge = TOOLS as unknown as Werkzeug[];

function freshStore(): KeptaStore {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-kappe-"));
  return new KeptaStore(path.join(dir, "test.db"));
}

async function ruf(store: KeptaStore, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const req: JsonRpcRequest = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } };
  const res = await handleRpc({ store, transport: "stdio" }, req);
  if (!res || !("result" in res)) throw new Error("Erwartete JSON-RPC-Ergebnis-Antwort");
  return res.result as unknown as ToolResult;
}

/** Die Agentenantwort, wie der Client sie liest: das Strukturteil. */
function struct(res: ToolResult): Record<string, unknown> {
  expect(res.isError, `Fehler statt Antwort: ${JSON.stringify(res.content)}`).toBeFalsy();
  return res.structuredContent ?? {};
}

function text(res: ToolResult): Record<string, unknown> {
  return JSON.parse(String(res.content[0]?.text ?? "{}"));
}

/** Eine Kappe, die meldet, nennt ihre eigene Zahl — sonst ist der Hinweis ein zweites Rätsel. */
function expectKappe(s: Record<string, unknown>, zahl: string, werkzeug: string) {
  expect(s.begrenzt, `${werkzeug}: meldet die Kappe bei ${zahl} nicht`).toBe(true);
  expect(typeof s.hinweis, `${werkzeug}: begrenzt ohne hinweis — der Agent weiß, dass kappt wurde, nicht was`).toBe("string");
  expect(String(s.hinweis)).toContain(zahl);
}

beforeEach(() => {
  // Kein Embedding-Dienst: die Kappen liegen vor dem Vektorpfad, und ein fetch-Versuch
  // würde die Tests langsam und netzabhängig machen.
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
});

afterEach(() => vi.unstubAllGlobals());

describe("memory_search: die Kappen der Suche", () => {
  let store: KeptaStore;

  beforeEach(async () => {
    store = freshStore();
    for (let i = 0; i < 12; i++) {
      await ruf(store, "memory_save", { title: `Lieferschein ${i}`, content: `Lieferschein Nummer ${i} kommt in die Halle`, type: "semantic" });
    }
  });

  it(`meldet ein limit über der Höchstzahl (${SUCHE_LIMIT_MAX}) statt es zu verschlucken`, async () => {
    const s = struct(await ruf(store, "memory_search", { query: "lieferschein", limit: 500 }));
    expect(s.count).toBe(SUCHE_LIMIT_MAX > 12 ? 12 : SUCHE_LIMIT_MAX);
    expectKappe(s, String(SUCHE_LIMIT_MAX), "memory_search");
  });

  it("sagt, dass eine volle Seite eine Seite ist — count ist nicht die Zahl der Treffer", async () => {
    const s = struct(await ruf(store, "memory_search", { query: "lieferschein", limit: 10 }));
    expect(s.count).toBe(10);
    expectKappe(s, "10", "memory_search");
  });

  it("meldet die Untergrenze, wenn ein limit von unten hochgezählt wurde", async () => {
    const s = struct(await ruf(store, "memory_search", { query: "lieferschein", limit: 0 }));
    expect(s.count).toBe(1);
    expectKappe(s, "1", "memory_search");
  });

  it("meldet ein limit, das keine Zahl ist, statt still den Default zu nehmen", async () => {
    const s = struct(await ruf(store, "memory_search", { query: "lieferschein", limit: "zehn" }));
    expectKappe(s, String(10), "memory_search");
  });

  it("behauptet keine Kappe, wo keine ist — eine Antwort unter dem limit bleibt ruhig", async () => {
    const s = struct(await ruf(store, "memory_search", { query: "lieferschein", limit: 100 }));
    expect(s.count).toBeLessThan(100);
    expect(s.begrenzt).toBe(false);
    expect(s.hinweis).toBeUndefined();
  });

  it("eine leere Suche meldet keine Kappe — der Leerzustand ist keine Seite", async () => {
    const s = struct(await ruf(store, "memory_search", { query: "gibts-nicht", limit: 10 }));
    expect(s.count).toBe(0);
    expect(s.begrenzt).toBe(false);
  });
});

describe("memory_list: die Kappen der Liste", () => {
  it(`meldet ein limit über ${LISTE_LIMIT_MAX}`, async () => {
    const store = freshStore();
    await ruf(store, "memory_save", { title: "Eine Notiz", content: "kurz" });
    const s = struct(await ruf(store, "memory_list", { limit: 900 }));
    expectKappe(s, String(LISTE_LIMIT_MAX), "memory_list");
  });

  it("sagt bei vollem Lesefenster, dass total ein Fenster ist und nicht die Welt", async () => {
    const store = freshStore();
    // Echte Fahrt gegen die Kante: ein Notiz mehr, als eine Liste lesen kann.
    for (let i = 0; i < LES_FENSTER + 1; i++) store.createMemory({ title: `Fenster ${i}`, content: `Notiz Nummer ${i}` });
    expect(store.countMemories().active).toBeGreaterThan(LES_FENSTER);
    const s = struct(await ruf(store, "memory_list", { limit: 20 }));
    expect(s.total).toBe(LES_FENSTER);
    expectKappe(s, String(LES_FENSTER), "memory_list");
  }, 60_000);

  it("meldet kein Fenster, solange das Fenster nicht voll ist", async () => {
    const store = freshStore();
    for (let i = 0; i < 3; i++) await ruf(store, "memory_save", { title: `Ruhe ${i}`, content: "kurz" });
    const s = struct(await ruf(store, "memory_list", { limit: 3 }));
    expect(s.begrenzt).toBe(false);
    expect(s.hinweis).toBeUndefined();
  });
});

describe("memory_graph: die Kappen des Graphen", () => {
  /** n Begriffe an je eine Notiz — ohne Embedding-Dienst, nur die Begriffstabelle zählt. */
  function begriffe(store: KeptaStore, n: number) {
    for (let i = 0; i < n; i++) {
      const m = store.createMemory({ title: `Begriffstext ${i}`, content: `Inhalt ${i}` });
      store.linkEntities(m.id, [`begiff-${String(i).padStart(4, "0")}`]);
    }
  }

  it(`meldet eine depth über ${TIEFE_MAX}`, async () => {
    const store = freshStore();
    const m = store.createMemory({ title: "Start", content: "hängt an [[Ziel]]" });
    store.linkEntities(m.id, ["Start", "Ziel"]);
    const s = struct(await ruf(store, "memory_graph", { entity: "Start", depth: 9 }));
    expectKappe(s, String(TIEFE_MAX), "memory_graph");
  });

  it("meldet das Fenster des ganzen Graphen, wenn es voll ist", async () => {
    const store = freshStore();
    begriffe(store, GRAPH_ENTITATEN_FENSTER + 1);
    const s = struct(await ruf(store, "memory_graph", {}));
    expect(s.begrenzt, "der Ganz-Graph-Lesepass ist an seinem Fenster — sagt die Antwort nichts?").toBe(true);
    expect(String(s.hinweis)).toContain(String(GRAPH_ENTITATEN_FENSTER));
  });

  it("meldet kein Fenster bei einem kleinen Graphen", async () => {
    const store = freshStore();
    begriffe(store, 3);
    const s = struct(await ruf(store, "memory_graph", {}));
    expect(s.begrenzt).toBe(false);
    expect(s.hinweis).toBeUndefined();
  });
});

describe("die Kappennachricht erreicht auch den Client ohne structuredContent", () => {
  it("steht im content-Text, den jeder MCP-Client zuerst liest", async () => {
    const store = freshStore();
    await ruf(store, "memory_save", { title: "Textpfad", content: "kurz" });
    const res = await ruf(store, "memory_list", { limit: 900 });
    expect(text(res).begrenzt).toBe(true);
    expect(String(text(res).hinweis)).toContain(String(LISTE_LIMIT_MAX));
  });
});

describe("outputSchema: die Felder sind deklariert, bevor ein Client sie prüft", () => {
  it.each(["memory_search", "memory_list", "memory_graph", "memory_consolidate"])(
    "%s deklariert begrenzt (boolean) und hinweis (string) — und verlangt sie nicht",
    (name) => {
      const w = werkzeuge.find((x) => x.name === name)!;
      expect(String(w.outputSchema.properties.begrenzt?.type), `${name}: begrenzt fehlt in der outputSchema`).toBe("boolean");
      expect(String(w.outputSchema.properties.hinweis?.type), `${name}: hinweis fehlt in der outputSchema`).toBe("string");
      expect(w.outputSchema.required ?? [], `${name}: eine Kappe ist kein Pflichtfeld`).not.toContain("begrenzt");
    }
  );

  it("eine echte Kappenantwort besteht gegen die deklarierte outputSchema", async () => {
    const store = freshStore();
    await ruf(store, "memory_save", { title: "Schema", content: "kurz" });
    const ajv = new Ajv({ strict: false, allErrors: true });
    const anfragen: [string, Record<string, unknown>][] = [
      ["memory_search", { query: "schema", limit: 400 }],
      ["memory_list", { limit: 900 }],
      ["memory_graph", { depth: 7 }],
    ];
    for (const [name, args] of anfragen) {
      const w = werkzeuge.find((x) => x.name === name)!;
      const pruefe = ajv.compile(w.outputSchema);
      const s = struct(await ruf(store, name, args));
      expect(pruefe(s), `${name}: ${JSON.stringify(pruefe.errors)}`).toBe(true);
      expect(s.begrenzt, `${name}: die Anfrage hätte eine Kappe melden müssen`).toBe(true);
    }
  });
});
