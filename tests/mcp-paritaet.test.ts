// F12 — Paritaet der Agenten-Schicht: die App-Kopie von `src/core/mcp.ts` trug
// vier Heilungen nicht, die der Kern in derselben Nacht bekommen hat. Diese Datei
// hebt sie auf denselben Wortlaut — byte-identisch, nicht als vierte Wahrheit.
//
// 1) A2-01 blockierend  — kein structuredContent im Fehlerfall (outputSchema-Paritaet)
// 2) W1-04 hoch         — asOf deklariert und echt gepruft (memory_search)
// 3) A2 / W1-04         — total an memory_list: NICHT gehoben, weil die App-Wache
//                         dieselbe Menge schon abzieht (diese Datei misst die Kopplung)
// 4) A2-02 hoch         — memory_consolidate: dryRun:false verlangt confirm:"supersede"
// 5) A2-03 hoch         — memory_forget(mode:"supersede"): supersedeBy ist Pflicht,
//                         und ein privater Nachfolger existiert fuer Agenten nicht
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";
import { indexMemory } from "../src/core/engine";
import { callTool, TOOLS, handleRpc, type JsonRpcRequest } from "../src/core/mcp";
import { ladeSchutz, nachWerkzeug } from "../src/lib/mcpwache";

let store: KeptaStore;
let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-mcp-paritaet-"));
  store = new KeptaStore(path.join(dir, "test.db"));
});

afterEach(() => store.close());

function lege(titel: string, inhalt: string, extra: Record<string, unknown> = {}) {
  const m = store.createMemory({ title: titel, content: inhalt, ...extra } as never);
  indexMemory(store, m.id);
  return m.id;
}

function text(ergebnis: { content: unknown[] }): string {
  const erster = ergebnis.content[0] as { text?: string };
  return String(erster?.text ?? "");
}

function schemaVon(name: string): Record<string, unknown> {
  const werkzeug = TOOLS.find((t) => t.name === name);
  if (!werkzeug) throw new Error(`${name} ist nicht deklariert`);
  return werkzeug.inputSchema as unknown as Record<string, unknown>;
}

function eigenschaften(name: string): string[] {
  const s = schemaVon(name);
  const props = (s.properties ?? {}) as Record<string, unknown>;
  return Object.keys(props);
}

describe("1) A2-01 — die Fehlerantwort traegt keinen Strukturteil", () => {
  it("memory_search ohne query: isError, Text nennt den Ausweg, KEIN structuredContent", async () => {
    const ergebnis = await callTool(store, "memory_search", {});
    expect(ergebnis.isError).toBe(true);
    expect(text(ergebnis)).toContain("a query is required");
    // Der Kernwortlaut nennt den Ausweg, nicht nur die Absage.
    expect(text(ergebnis)).toMatch(/Error:/);
    expect("structuredContent" in ergebnis).toBe(false);
  });

  it("kein Werkzeug wirft einen Strukturteil im Fehlerfall — auch memory_update und memory_forget nicht", async () => {
    for (const [name, args] of [
      ["memory_update", { id: "gibt-es-nicht", content: "x" }],
      ["memory_forget", { id: "", mode: "expire" }],
      ["memory_consolidate", { dryRun: false }],
      ["memory_delete", { id: "" }],
    ] as [string, Record<string, unknown>][]) {
      const ergebnis = await callTool(store, name, args);
      expect(ergebnis.isError).toBe(true);
      expect("structuredContent" in ergebnis).toBe(false);
      expect(text(ergebnis)).toMatch(/^Error: /);
    }
  });

  it("ueber die JSON-RPC-Tuer: das result enthaelt keinen structuredContent-Schluessel", async () => {
    const anfrage: JsonRpcRequest = {
      jsonrpc: "2.0", id: 7, method: "tools/call",
      params: { name: "memory_search", arguments: {} },
    };
    const antwort = await handleRpc({ store, transport: "stdio" }, anfrage);
    if (!antwort || !("result" in antwort)) throw new Error("Erwartete Ergebnis-Antwort, nicht Fehler-Antwort");
    const result = antwort.result as Record<string, unknown>;
    expect(result.isError).toBe(true);
    expect("structuredContent" in result).toBe(false);
  });

  it("ein konformer Client validiert structuredContent gegen die outputSchema — die Absage darf nicht daran sterben", async () => {
    const ergebnis = await callTool(store, "memory_search", {});
    const outputSchema = (TOOLS.find((t) => t.name === "memory_search")?.outputSchema ?? {}) as { required?: string[] };
    expect(Array.isArray(outputSchema.required)).toBe(true);
    // Genau der Schritt, den ein MCP-Client geht: ist der Strukturteil da, wird er
    // gegen die Pflichtfelder geprueft. Ohne Strukturteil gilt die Regel nicht.
    expect("structuredContent" in ergebnis).toBe(false);
  });
});

describe("2) W1-04 — asOf ist deklariert und echt geprueft (memory_search)", () => {
  it("die deklarierte EingabeListe nennt asOf", () => {
    expect(eigenschaften("memory_search")).toContain("asOf");
  });

  it("ein asOf, das keine Ganzzahl ist, wird abgewiesen statt als 'heute' gelesen", async () => {
    lege("Alt", "Inhalt vor der Zeitreise");
    const ergebnis = await callTool(store, "memory_search", { query: "reise", asOf: "2020-01-01" });
    expect(ergebnis.isError).toBe(true);
    expect(text(ergebnis)).toMatch(/asOf must be epoch milliseconds \(an integer\)/);
  });

  it("eine Zahl als Zeichenkette gilt, Nicht-Zahlen werden abgewiesen", async () => {
    lege("Alt", "Inhalt fuer die Zeitreise-Pruefung");
    const alsZeichen = await callTool(store, "memory_search", { query: "reise", asOf: "1700000000000" });
    expect(alsZeichen.isError).toBeFalsy();
    for (const wert of ["abc", {}, [], "1,5"]) {
      const ergebnis = await callTool(store, "memory_search", { query: "reise", asOf: wert });
      expect(ergebnis.isError).toBe(true);
      expect(text(ergebnis)).toMatch(/asOf must be epoch milliseconds/);
    }
  });

  it("asOf wirkt wirklich: heute findet die Notiz, 1970 nicht", async () => {
    lege("Backup laeuft nachts", "Inhalt der Backup-Notiz");
    const heute = await callTool(store, "memory_search", { query: "Backup laeuft nachts", asOf: Date.now() });
    expect(((heute.structuredContent as Record<string, unknown>).count as number)).toBeGreaterThan(0);
    const frueh = await callTool(store, "memory_search", { query: "Backup laeuft nachts", asOf: 1000 });
    expect((frueh.structuredContent as Record<string, unknown>).count).toBe(0);
  });
});

describe("3) memory_list — die Kern-Heilung ist an die App-Wache gekoppelt und bleibt deshalb ungehoben", () => {
  // Der Kern laeuft `total` ueber den gefilterten, privatenfreien Satz. Diese App hat
  // zusaetzlich die Wache (`src/lib/mcpwache.ts:104`), die beim Agentenkanal
  // `schutz.privat.size` von `total` abzieht. Beide Heilungen zusammen kuerzen
  // dieselbe Menge zweimal — die App meldete einem Agenten `total: 0`.
  it("die App nennt total noch als Gesamtbestand, und die Wache zieht die privaten Knoten ab", async () => {
    lege("Sichtbar", "Inhalt eins");
    lege("Versteckt", "Inhalt zwei", { scope: "private" });
    const direkt = await callTool(store, "memory_list", {});
    const s = direkt.structuredContent as Record<string, unknown>;
    expect(s.memories).toHaveLength(1);
    expect(s.total).toBe(2);
    const gewacht = nachWerkzeug("memory_list", {}, direkt, ladeSchutz(store)) as { structuredContent: Record<string, unknown> };
    expect(gewacht.structuredContent.total).toBe(1);
  });

  it("waere total schon privatfrei (Kern-Fassung), zaeble die Wache ein zweites Mal ab", async () => {
    lege("Sichtbar", "Inhalt eins");
    lege("Versteckt", "Inhalt zwei", { scope: "private" });
    const kernFassung = { content: [], structuredContent: { count: 1, total: 1, memories: [] } };
    const gewacht = nachWerkzeug("memory_list", {}, kernFassung, ladeSchutz(store)) as { structuredContent: Record<string, unknown> };
    // 1 (Kern: schon ohne private) - 1 (Wache: private Menge) = 0. Ein Agent laese
    // einen leeren Bestand, wo eine Notiz liegt. Deshalb Einzelschritt, nicht Kopie.
    expect(gewacht.structuredContent.total).toBe(0);
  });

  it("der Rest des Kern-Befunds bleibt in der App offen: total folgt keinem Filter", async () => {
    for (let i = 1; i <= 3; i++) lege(`Gefiltert ${i}`, `Inhalt ${i} mit Substanz`, { tags: ["nur-diese"] });
    lege("Andere", "Inhalt ausserhalb des Filters");
    const ergebnis = await callTool(store, "memory_list", { tag: "nur-diese" });
    const s = ergebnis.structuredContent as Record<string, unknown>;
    expect(s.count).toBe(3);
    // Der Paginierungs-Hinweis des Kerns gilt hier weiter nicht: total ist die
    // Gesamtbestand-Zahl (4), nicht die des gefilterten Satzes (3).
    expect(s.total).toBe(4);
  });
});

describe("4) A2-02 — memory_consolidate: anwenden kostet confirm:\"supersede\"", () => {
  it("die deklarierte EingabeListe nennt confirm", () => {
    expect(eigenschaften("memory_consolidate")).toContain("confirm");
  });

  it("dryRun:false ohne Bestaetigung wird abgewiesen und nennt den Weg", async () => {
    const ergebnis = await callTool(store, "memory_consolidate", { dryRun: false });
    expect(ergebnis.isError).toBe(true);
    expect(text(ergebnis)).toMatch(/dryRun:false requires confirm:"supersede"/);
    expect(text(ergebnis)).toMatch(/dryRun:true/);
  });

  it("falsche Bestaetigungsform gilt nicht, dryRun:true bleibt frei", async () => {
    expect((await callTool(store, "memory_consolidate", { dryRun: false, confirm: "yes" })).isError).toBe(true);
    expect((await callTool(store, "memory_consolidate", { dryRun: false, confirm: true as unknown as string })).isError).toBe(true);
    const trocken = await callTool(store, "memory_consolidate", { dryRun: true });
    expect(trocken.isError).toBeFalsy();
    expect((trocken.structuredContent as Record<string, unknown>).dryRun).toBe(true);
  });
});

describe("5) A2-03 — memory_forget(mode:\"supersede\") braucht den Nachfolger", () => {
  it("ohne supersedeBy wird abgewiesen, expire bleibt der Weg ohne Nachfolger", async () => {
    const id = lege("Ersetzen", "Inhalt, der ersetzt werden soll");
    const ergebnis = await callTool(store, "memory_forget", { id, mode: "supersede" });
    expect(ergebnis.isError).toBe(true);
    expect(text(ergebnis)).toMatch(/mode "supersede" requires supersedeBy/);
    expect(text(ergebnis)).toMatch(/use mode "expire"/);
    // Erfolg ohne Wirkung war der Defekt: die Fahne haengt an einem nicht-null-Zeiger.
    expect(store.getMemory(id)?.supersededBy).toBeFalsy();
  });

  it("leere und nur-Leerzeichen-Nachfolger gelten nicht", async () => {
    const id = lege("Ersetzen zwei", "Inhalt, der ersetzt werden soll");
    for (const by of ["", "   "]) {
      const ergebnis = await callTool(store, "memory_forget", { id, mode: "supersede", supersedeBy: by });
      expect(ergebnis.isError).toBe(true);
      expect(text(ergebnis)).toMatch(/requires supersedeBy/);
    }
  });

  it("ein privater Nachfolger existiert fuer Agenten nicht — und wird nicht gesetzt", async () => {
    const id = lege("Sichtbar ersetzt", "Inhalt");
    const privat = lege("Privater Nachfolger", "Inhalt", { scope: "private" });
    const ergebnis = await callTool(store, "memory_forget", { id, mode: "supersede", supersedeBy: privat });
    expect(ergebnis.isError).toBe(true);
    expect(text(ergebnis)).toMatch(/Memory not found/);
    expect(store.getMemory(id)?.supersededBy).toBeFalsy();
  });

  it("mit echtem Nachfolger wird ersetzt — und die Quittung traegt den Strukturteil", async () => {
    const id = lege("Alt", "Inhalt der aelteren Notiz");
    const nachfolger = lege("Neu", "Inhalt der neueren Notiz");
    const ergebnis = await callTool(store, "memory_forget", { id, mode: "supersede", supersedeBy: nachfolger });
    expect(ergebnis.isError).toBeFalsy();
    expect((ergebnis.structuredContent as Record<string, unknown>).forgotten).toBe(true);
    expect(store.getMemory(id)?.supersededBy).toBe(nachfolger);
  });
});
