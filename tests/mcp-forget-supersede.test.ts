import { describe, it, expect, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";
import { handleRpc, TOOLS, type JsonRpcRequest } from "../src/core/mcp";

// A2-03 — memory_forget mit mode:"supersede" ohne supersedeBy.
// Bis zur Reparatur setzte das Werkzeug den Zeiger auf null, meldete
// "Superseded marked: <id>" mit forgotten:true — und die Notiz blieb gueltig, weil die
// Such-Fahne an einem nicht-null-Zeiger haengt. Der Agent glaubte das Gegenteil von dem,
// was in der Wissensbasis steht. Erfolg ohne Wirkung ist die schlimmere Form eines Fehlers.

interface ToolResult {
  content: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

function freshStore(): KeptaStore {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-supersede-"));
  return new KeptaStore(path.join(dir, "test.db"));
}

async function ruf(store: KeptaStore, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const req: JsonRpcRequest = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } };
  const res = await handleRpc({ store, transport: "stdio" }, req);
  if (!res || !("result" in res)) throw new Error("Erwartete JSON-RPC-Ergebnis-Antwort");
  return res.result as unknown as ToolResult;
}

function text(res: ToolResult): string {
  return res.content[0]?.text ?? "";
}

async function notiz(store: KeptaStore, title: string, content: string, scope?: string): Promise<string> {
  const res = await ruf(store, "memory_save", { title, content, ...(scope ? { scope } : {}) });
  return (res.structuredContent as { memory: { id: string } }).memory.id;
}

async function supersededFlag(store: KeptaStore, query: string, id: string): Promise<boolean | undefined> {
  const res = await ruf(store, "memory_search", { query });
  const hits = (res.structuredContent as { hits: { id: string; superseded: boolean }[] }).hits;
  return hits.find((h) => h.id === id)?.superseded;
}

describe("memory_forget mode=supersede braucht einen Nachfolger", () => {
  let store: KeptaStore;
  let alt: string;

  beforeEach(async () => {
    store = freshStore();
    alt = await notiz(store, "Alte Rechnung", "Betrag 1150 netto");
  });

  it("ohne supersedeBy wird abgewiesen — und die Notiz bleibt gueltig", async () => {
    const res = await ruf(store, "memory_forget", { id: alt, mode: "supersede" });
    expect(res.isError).toBe(true);
    expect(res.structuredContent).toBeUndefined();
    expect(text(res)).toMatch(/supersedeBy/);
    // Die Meldung nennt den Ausweg, statt nur zu verbieten.
    expect(text(res)).toMatch(/expire/);
    expect(store.getMemory(alt)?.supersededBy).toBeNull();
    expect(await supersededFlag(store, "Alte Rechnung", alt)).toBe(false);
  });

  it("supersedeBy als leerer String zaehlt nicht als Nachfolger", async () => {
    for (const by of ["", "   ", 0, false, {}, []]) {
      const res = await ruf(store, "memory_forget", { id: alt, mode: "supersede", supersedeBy: by });
      expect(res.isError, `Nachfolger ${JSON.stringify(by)} wurde durchgelassen`).toBe(true);
      expect(store.getMemory(alt)?.supersededBy).toBeNull();
    }
  });

  it("unbekannte id wird zuerst abgewiesen — die Meldung bleibt die einer unbekannten id", async () => {
    const res = await ruf(store, "memory_forget", { id: "gibts-fuer-niemals", mode: "supersede" });
    expect(res.isError).toBe(true);
    expect(text(res)).toMatch(/not found/i);
    // Kein Hinweis auf ein fehlendes Feld: das waere ein Existenznachweis.
    expect(text(res)).not.toMatch(/supersedeBy/);
  });

  it("mit echtem Nachfolger wirkt der Modus weiter — Zeiger und Fahne", async () => {
    const neu = await notiz(store, "Neue Rechnung", "Betrag 1290 netto");
    const res = await ruf(store, "memory_forget", { id: alt, mode: "supersede", supersedeBy: neu });
    expect(res.isError).toBeUndefined();
    expect((res.structuredContent as { forgotten: boolean; mode: string }).forgotten).toBe(true);
    expect(store.getMemory(alt)?.supersededBy).toBe(neu);
    expect(await supersededFlag(store, "Alte Rechnung", alt)).toBe(true);
  });

  it("die anderen Modi bleiben von der Pflicht verschont", async () => {
    const geloescht = await notiz(store, "Wegwerfnotiz", "Verschwindet in den Papierkorb");
    for (const [id, mode] of [[alt, "expire"], [geloescht, "delete"]] as [string, string][]) {
      const res = await ruf(store, "memory_forget", { id, mode });
      expect(res.isError, `${mode}: ${text(res)}`).toBeUndefined();
      expect((res.structuredContent as { forgotten: boolean }).forgotten).toBe(true);
    }
  });

  it("eine private Nachfolgerin bleibt abgewiesen — die Pflichtfelder-Regel aendert daran nichts", async () => {
    const nachfolger = await notiz(store, "Private Nachfolgerin", "4711", "private");
    const res = await ruf(store, "memory_forget", { id: alt, mode: "supersede", supersedeBy: nachfolger });
    expect(res.isError).toBe(true);
    expect(text(res)).not.toMatch(/priv/i);
    expect(store.getMemory(alt)?.supersededBy).toBeNull();
  });

  it("supersedeBy ist im Vertrag als Modus-Pflicht beschrieben", () => {
    const forget = (TOOLS as unknown as { name: string; inputSchema: { properties: Record<string, { description?: string }> } }[]).find(
      (t) => t.name === "memory_forget"
    )!;
    const feld = forget.inputSchema.properties.supersedeBy;
    expect(feld, "Feld fehlt im inputSchema").toBeDefined();
    expect(`${feld.description ?? ""}`, "Die Pflicht steht nur im Code, nicht im Vertrag").toMatch(/required/i);
  });
});
