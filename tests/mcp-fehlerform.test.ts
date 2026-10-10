import { describe, it, expect, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import Ajv, { type ValidateFunction } from "ajv";
import { KeptaStore } from "../src/core/store";
import { handleRpc, TOOLS, type JsonRpcRequest } from "../src/core/mcp";

// A2-01 — die Fehlerform. Jedes Werkzeug deklariert eine outputSchema mit Pflichtfeldern
// (query/count/hits, created/memory, forgotten …). Das offizielle MCP-SDK validiert
// structuredContent gegen genau dieses Schema, sobald das Feld in der Antwort steht —
// ein Fehlerzweig mit { error: … } wirft dann im Client, und die Meldung, die dem
// Agenten helfen würde ("dir fehlt die query"), sieht niemand.
// Der Vertrag lautet deshalb: Fehler kommen als content[0].text + isError:true, ohne
// Strukturteil. Ein Fehler ist keine Antwort im deklarierten Format.

interface ToolResult {
  content: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

interface Werkzeug {
  name: string;
  inputSchema: { properties?: Record<string, unknown>; required?: string[] };
  outputSchema: Record<string, unknown>;
}

const werkzeuge = TOOLS as unknown as Werkzeug[];

function freshStore(): KeptaStore {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-fehlerform-"));
  return new KeptaStore(path.join(dir, "test.db"));
}

async function ruf(store: KeptaStore, name: string, args: Record<string, unknown>, id = 1): Promise<ToolResult> {
  const req: JsonRpcRequest = { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } };
  const res = await handleRpc({ store, transport: "stdio" }, req);
  if (!res || !("result" in res)) throw new Error("Erwartete JSON-RPC-Ergebnis-Antwort");
  return res.result as unknown as ToolResult;
}

function text(res: ToolResult): string {
  return res.content[0]?.text ?? "";
}

/** Jeder Fall, den die acht Werkzeuge heute als Fehler kennen — plus das unbekannte Werkzeug. */
function fehlerFaelle(id: string): [string, Record<string, unknown>, RegExp][] {
  return [
    ["memory_search", {}, /a query is required/],
    ["memory_search", { query: "    " }, /a query is required/],
    ["memory_save", { title: "nur ein Titel" }, /title and content are required/],
    ["memory_save", { title: " ", content: " " }, /title and content are required/],
    ["memory_save", { title: "T", content: "C", tags: [1, null, {}] }, /./],
    ["memory_update", { id: "gibts-fuer-niemals", title: "x" }, /not found/],
    ["memory_delete", { id: "gibts-fuer-niemals" }, /not found/],
    ["memory_forget", { id: "gibts-fuer-niemals" }, /not found/],
    ["memory_forget", { id, mode: "auge" }, /Unknown mode/],
    ["memory_froeffchen", { id }, /Unknown tool/],
  ];
}

describe("Fehlerform: eine Fehlerantwort traegt keine structuredContent", () => {
  let store: KeptaStore;
  let id: string;

  beforeEach(async () => {
    store = freshStore();
    const saved = await ruf(store, "memory_save", { title: "Fehlerform-Notiz", content: "Referenzinhalt" });
    id = (saved.structuredContent as { memory: { id: string } }).memory.id;
  });

  it("jeder Fehlerfall laesst den Strukturteil weg — sonst wirft ein konformer Client", async () => {
    expect(fehlerFaelle(id).length).toBeGreaterThanOrEqual(10);
    for (const [name, args, meldung] of fehlerFaelle(id)) {
      const res = await ruf(store, name, args);
      expect(res.isError, `${name}: meldet keinen Fehler`).toBe(true);
      expect(text(res), `${name}: Meldung fehlt im Text`).toMatch(meldung);
      expect(res.structuredContent, `${name}: Fehler traegt structuredContent — outputSchema-Wurf in jedem SDK-Client`).toBeUndefined();
    }
  });

  it("ein Client, der gegen die deklarierte outputSchema prueft, findet im Fehlerfall nichts, was er verwerfen muesste", async () => {
    const ajv = new Ajv({ strict: false, allErrors: true });
    const pruefer = new Map<string, ValidateFunction>(
      werkzeuge.map((w) => [w.name, ajv.compile(w.outputSchema)])
    );
    for (const [name, args] of fehlerFaelle(id)) {
      const res = await ruf(store, name, args);
      // Genau die Regel des SDKs (client/index.js): validiere nur, wenn Struktur mitschwingt.
      if (res.structuredContent !== undefined) {
        const pruefe = pruefer.get(name)!;
        const fehl = (pruefe.errors ?? []).map((f) => `${f.instancePath || "/"} ${f.message}`);
        expect(pruefe(res.structuredContent), `${name}: ${fehl.join(" | ")}`).toBe(true);
      }
      expect(res.structuredContent, `${name}: Struktur im Fehlerfall`).toBeUndefined();
      expect(Array.isArray(res.content), `${name}: content fehlt`).toBe(true);
      expect(typeof text(res), `${name}: text fehlt`).toBe("string");
    }
  });

  it("Erfolgsantworten bleiben vollstaendig gegen ihre outputSchema", async () => {
    const ajv = new Ajv({ strict: false, allErrors: true });
    const erfolge: [string, Record<string, unknown>][] = [
      ["memory_search", { query: "Referenzinhalt" }],
      ["memory_list", { limit: 5 }],
      ["memory_graph", { depth: 2 }],
      ["memory_consolidate", { dryRun: true }],
      ["memory_save", { title: "Weitere Notiz", content: "Anderer Inhalt" }],
      ["memory_update", { id, title: "Fehlerform-Notiz umbenannt" }],
      ["memory_forget", { id, mode: "expire" }],
      ["memory_delete", { id }],
    ];
    for (const [name, args] of erfolge) {
      const w = werkzeuge.find((x) => x.name === name)!;
      const res = await ruf(store, name, args);
      expect(res.isError, `${name}: ${text(res)}`).toBeUndefined();
      const pruefe = ajv.compile(w.outputSchema);
      const fehl = (pruefe.errors ?? []).map((f) => `${f.instancePath || "/"} ${f.message}`);
      expect(pruefe(res.structuredContent), `${name}: ${fehl.join(" | ")}`).toBe(true);
    }
  });

  it("ein Nicht-String-Tag wird mit Feld und Stelle abgewiesen, nicht als interner Typfehler", async () => {
    const res = await ruf(store, "memory_save", { title: "Tags gemischt", content: "Inhalt", tags: [1, null, {}] });
    expect(res.isError).toBe(true);
    expect(res.structuredContent).toBeUndefined();
    expect(text(res), text(res)).toMatch(/tags\[0\]/);
    expect(text(res), "Leck einer Implementierungsfunktion").not.toMatch(/toLowerCase/);
    // Der saubere Satz bleibt in Ordnung — die Bremse darf nicht alles sperren.
    const gut = await ruf(store, "memory_save", { title: "Tags gut", content: "Inhalt", tags: ["kepta", "audit"] });
    expect(gut.isError, text(gut)).toBeUndefined();
    expect((gut.structuredContent as { memory: { tags: string[] } }).memory.tags).toEqual(["kepta", "audit"]);
    const update = await ruf(store, "memory_update", { id, tags: ["ok", 7] });
    expect(update.isError).toBe(true);
    expect(text(update)).toMatch(/tags\[1\]/);
    expect(store.getMemory(id)?.tags).toEqual([]);
  });
});
