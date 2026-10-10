import { describe, it, expect, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";
import { handleRpc, type JsonRpcRequest } from "../src/core/mcp";

// Q-17 — der Papierkorb-Geist. SECURITY.md verspricht, eine private Notiz sei für Agenten
// "indistinguishable from one that does not exist". Die Graph-Regel in src/core/mcp.ts hielt
// Knoten ohne Träger-Notiz für offen: ids.length === 0 → behalten. Löscht die Besitzerin eine
// private Notiz endgültig, fallen ihre Träger-Zeilen (ON DELETE CASCADE) — übrig bleibt der
// Knoten mit ihrem Titel, und genau der geht von dann an Agenten hinaus.

interface ToolResult {
  content: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

function freshStore(): KeptaStore {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-graph-geist-"));
  return new KeptaStore(path.join(dir, "test.db"));
}

async function ruf(store: KeptaStore, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const req: JsonRpcRequest = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } };
  const res = await handleRpc({ store, transport: "stdio" }, req);
  if (!res || !("result" in res)) throw new Error("Erwartete JSON-RPC-Ergebnis-Antwort");
  return res.result as unknown as ToolResult;
}

async function notiz(store: KeptaStore, title: string, content: string, scope?: string): Promise<string> {
  const res = await ruf(store, "memory_save", { title, content, ...(scope ? { scope } : {}) });
  return (res.structuredContent as { memory: { id: string } }).memory.id;
}

async function knoten(store: KeptaStore): Promise<string[]> {
  const g = await ruf(store, "memory_graph", { depth: 4 });
  return ((g.structuredContent as { entities: { name: string }[] }).entities ?? []).map((e) => e.name);
}

describe("Q-17: was die Besitzerin endgültig löscht, bleibt auch danach privat", () => {
  let store: KeptaStore;

  beforeEach(() => {
    store = freshStore();
  });

  it("der Titel einer dauerhaft gelöschten privaten Notiz geht nicht an Agenten", async () => {
    const geheim = await notiz(store, "Geheimes Mandat 4711", "Aktenzeichen 55", "private");
    await notiz(store, "Offene Aktenliste", "Nummern");
    store.purgeMemory(geheim);

    const namen = await knoten(store);
    expect(namen).toContain("offene aktenliste");
    expect(namen, "Geistertitel eines gelöschten privaten Satzes").not.toContain("geheimes mandat 4711");
  });

  it("auch ein Knoten, den nur die private Notiz nannte, verschwindet mit ihr", async () => {
    const geheim = await notiz(store, "Geheime Praxis", "Siehe [[Geheime Konten 88]]", "private");
    await notiz(store, "Offene Liste", "Nummern");
    store.purgeMemory(geheim);

    const namen = await knoten(store);
    expect(namen).not.toContain("geheime praxis");
    expect(namen).not.toContain("geheime konten 88");
  });

  it("die Kanten einer dauerhaft gelöschten privaten Notiz gehen ebenfalls nicht hinaus", async () => {
    const geheim = await notiz(store, "Geheime Praxis", "Siehe [[Geheime Konten 88]]", "private");
    await notiz(store, "Offene Liste", "Nummern");
    store.purgeMemory(geheim);

    const g = await ruf(store, "memory_graph", { depth: 4 });
    const relationen = (g.structuredContent as { relations: { source: string; target: string }[] }).relations;
    expect(relationen.some((r) => r.source === "geheime praxis" || r.target === "geheime konten 88")).toBe(false);
  });

  it("eine offene Notiz, die denselben Namen trägt, bleibt sichtbar", async () => {
    const geheim = await notiz(store, "Aktenzeichen 44", "Nur die private Trägerin", "private");
    await notiz(store, "Sitzung Notar", "Wir folgen [[Aktenzeichen 44]]");
    store.purgeMemory(geheim);

    const namen = await knoten(store);
    expect(namen).toContain("aktenzeichen 44");
  });

  it("ein Knoten ohne Notiz und ohne Relation ist für Agenten nicht da", async () => {
    await notiz(store, "Offene Basis", "Nummern");
    // Ein Knoten ohne Träger und ohne Kante ist ein reiner Tabellenzustand (ensureEntity
    // ist intern) — als Saat nötig, weil die Purge-Pfade ihn stets mit Kante hinterlassen.
    (store as unknown as { ensureEntity(name: string): number }).ensureEntity("waise ohne Träger");
    expect(await knoten(store)).not.toContain("waise ohne träger");
  });

  it("eine Relation ohne Träger-Notiz hält ihre Knoten offen — die Besitzerin hat sie gesetzt", async () => {
    await notiz(store, "Offene Basis", "Nummern");
    store.addRelation("Verweis von Hand", "Ziel von Hand", "mentions", null);
    const namen = await knoten(store);
    expect(namen).toContain("verweis von hand");
    expect(namen).toContain("ziel von hand");
  });

  it("die Relation einer privaten Notiz fällt weiter, auch wenn ihr Knoten bleibt", async () => {
    const geheim = await notiz(store, "Aktenzeichen 44", "Siehe [[Geheime Konten 88]]", "private");
    await notiz(store, "Sitzung Notar", "Wir folgen [[Aktenzeichen 44]]");
    const g = await ruf(store, "memory_graph", { depth: 4 });
    const relationen = (g.structuredContent as { relations: { source: string; target: string }[] }).relations;
    expect(relationen.some((r) => r.target === "geheime konten 88")).toBe(false);
    expect(relationen.some((r) => r.source === "sitzung notar" && r.target === "aktenzeichen 44")).toBe(true);
    expect(geheim).toBeTruthy();
  });
});
