import { describe, it, expect, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";
import { handleRpc, type JsonRpcRequest } from "../src/core/mcp";

// A2-07 — memory_list.total. Das Feld kam aus store.countMemories(): die Zahl ALLER aktiven
// Notizen, filterblind und inklusive der privaten. Ein Agent, der danach paginiert ("14 gesamt,
// 2 geliefert"), bricht nach Seite 1 ab — und nebenbei leakt die Zahl die Menge privater Notizen.

interface ToolResult {
  content: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

function freshStore(): KeptaStore {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-total-"));
  return new KeptaStore(path.join(dir, "test.db"));
}

async function ruf(store: KeptaStore, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const req: JsonRpcRequest = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } };
  const res = await handleRpc({ store, transport: "stdio" }, req);
  if (!res || !("result" in res)) throw new Error("Erwartete JSON-RPC-Ergebnis-Antwort");
  return res.result as unknown as ToolResult;
}

function str(res: ToolResult): { count: number; total: number; memories: { id: string }[] } {
  return res.structuredContent as never;
}

describe("memory_list.total zaehlt denselben Satz, den die Liste zeigt", () => {
  let store: KeptaStore;

  beforeEach(async () => {
    store = freshStore();
    await ruf(store, "memory_save", { title: "Ablage Regel eins", content: "So wird abgelegt", type: "procedural" });
    await ruf(store, "memory_save", { title: "Ablage Regel zwei", content: "So wird abgelegt", type: "procedural" });
    await ruf(store, "memory_save", { title: "Sitzung mit Notar", content: "Termin", type: "episodic" });
    await ruf(store, "memory_save", { title: "Geheime Steuerliste", content: "4715", scope: "private" });
  });

  it("total folgt dem Typfilter — Zahl der Seite, nicht des ganzen Bestands", async () => {
    const eine = str(await ruf(store, "memory_list", { type: "procedural" }));
    expect(eine.count).toBe(2);
    expect(eine.total, `total=${eine.total} — filterblind`).toBe(2);
  });

  it("total folgt dem Tag-Filter", async () => {
    await ruf(store, "memory_save", { title: "Mit Tag", content: "Nummern", tags: ["nurhier"] });
    const gefiltert = str(await ruf(store, "memory_list", { tag: "nurhier" }));
    expect(gefiltert.count).toBe(1);
    expect(gefiltert.total).toBe(1);
  });

  it("private Notizen stecken nicht in der Zahl — kein Aggregat-Leck", async () => {
    const alle = str(await ruf(store, "memory_list", { limit: 200 }));
    expect(alle.count).toBe(3);
    expect(alle.total, `total=${alle.total} zaehlt die private Notiz mit`).toBe(3);
    expect(alle.total).toBeGreaterThanOrEqual(alle.count);
  });

  it("total bleibt unabhaengig von limit und offset (Pagination ist machbar)", async () => {
    const erste = str(await ruf(store, "memory_list", { limit: 1, type: "procedural" }));
    expect(erste.count).toBe(1);
    expect(erste.total).toBe(2);
    const zweite = str(await ruf(store, "memory_list", { limit: 1, offset: 1, type: "procedural" }));
    expect(zweite.count).toBe(1);
    expect(zweite.total).toBe(2);
  });

  it("total im Papierkorb zaehlt nur die geloeschten, die Agenten sehen duerfen", async () => {
    const notiz = await ruf(store, "memory_save", { title: "Wegwerf", content: "xyz" });
    const privat = await ruf(store, "memory_save", { title: "Geheime Wegwerf", content: "abc", scope: "private" });
    const id = (notiz.structuredContent as { memory: { id: string } }).memory.id;
    const idPrivat = (privat.structuredContent as { memory: { id: string } }).memory.id;
    await ruf(store, "memory_delete", { id });
    await ruf(store, "memory_delete", { id: idPrivat });
    const muell = str(await ruf(store, "memory_list", { trash: true }));
    expect(muell.count).toBe(1);
    expect(muell.total, `total=${muell.total}`).toBe(1);
  });

  it("der Papierkorb-Filter bleibt bei aktiver Anfrage blind — total waehlt mit", async () => {
    const aktiv = str(await ruf(store, "memory_list", { limit: 200 }));
    expect(aktiv.total).toBe(3);
  });
});
