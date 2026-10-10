import { describe, it, expect, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import Ajv from "ajv";
import { KeptaStore } from "../src/core/store";
import { handleRpc, TOOLS, type JsonRpcRequest } from "../src/core/mcp";

// A2-02 — die Bestaetigungsseite der Konsolidierung und ihr Rueckweg.
// memory_consolidate nahm jeden Zahlenwert: threshold 0 mit dryRun:false erklaerte in der
// Messung 12 von 14 Notizen fuer ersetzt — ohne Rueckweg, denn memory_update deklarierte
// supersededBy nicht und verschluckte das Feld still. Die Schwellwert-Klammer baut der
// Engine-Ingenieur; hier sitzt die Bremse vor der Anwendung und der Weg zurueck.

interface ToolResult {
  content: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

interface Werkzeug {
  name: string;
  inputSchema: { properties: Record<string, { type?: unknown; description?: string }> };
  outputSchema: Record<string, unknown>;
}

const werkzeuge = TOOLS as unknown as Werkzeug[];

function freshStore(): KeptaStore {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-consolidate-"));
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

/** Zwei Notizen mit gleichem Titel — der lexikale Duplettenweg, ohne Embeddings. */
async function duplettePaar(store: KeptaStore): Promise<string[]> {
  return [
    await notiz(store, "Backup-Fenster Winter", "Das Backup laeuft nachts um drei Uhr."),
    await notiz(store, "Backup-Fenster Winter", "Das Backup laeuft nachts um drei Uhr, Wintersemester."),
  ];
}

function kandidaten(res: ToolResult): { keepId: string; duplicateId: string }[] {
  return ((res.structuredContent as { candidates?: { keepId: string; duplicateId: string }[] })?.candidates ?? []);
}

describe("memory_consolidate: anwenden ist eine ausdrueckliche Entscheidung", () => {
  let store: KeptaStore;
  let paar: string[];

  beforeEach(async () => {
    store = freshStore();
    paar = await duplettePaar(store);
  });

  it("dryRun:false ohne Bestaetigung wird abgewiesen und ersetzt nichts", async () => {
    const res = await ruf(store, "memory_consolidate", { dryRun: false });
    expect(res.isError).toBe(true);
    expect(res.structuredContent).toBeUndefined();
    expect(text(res)).toMatch(/confirm/);
    for (const id of paar) expect(store.getMemory(id)?.supersededBy, id).toBeNull();
  });

  it("ein Bestaetigungswert, der nicht passt, gilt nicht als Bestaetigung", async () => {
    for (const confirm of ["ja", "true", "SUPERSEDE", "", 1, true, null]) {
      const res = await ruf(store, "memory_consolidate", { dryRun: false, confirm });
      expect(res.isError, `confirm=${JSON.stringify(confirm)} wurde durchgelassen`).toBe(true);
      expect(text(res)).toMatch(/supersede/);
    }
    for (const id of paar) expect(store.getMemory(id)?.supersededBy).toBeNull();
  });

  it("die Meldung nennt beide Auswege: trocken laufen oder ausdruecklich bestaetigen", async () => {
    const res = await ruf(store, "memory_consolidate", { dryRun: false });
    expect(text(res)).toMatch(/dryRun/);
    expect(text(res)).toMatch(/confirm/);
    expect(text(res)).toMatch(/supersede/);
  });

  it("dryRun braucht keine Bestaetigung — Vorschlaege bleiben gefahrlos", async () => {
    for (const args of [{}, { dryRun: true }]) {
      const res = await ruf(store, "memory_consolidate", args);
      expect(res.isError, text(res)).toBeUndefined();
      expect((res.structuredContent as { dryRun: boolean }).dryRun).toBe(true);
      expect((res.structuredContent as { applied: number }).applied).toBe(0);
      expect(kandidaten(res).length).toBeGreaterThan(0);
    }
    for (const id of paar) expect(store.getMemory(id)?.supersededBy).toBeNull();
  });

  it("mit confirm=supersede wendet er an", async () => {
    const res = await ruf(store, "memory_consolidate", { dryRun: false, confirm: "supersede" });
    expect(res.isError, text(res)).toBeUndefined();
    const sc = res.structuredContent as { dryRun: boolean; applied: number };
    expect(sc.dryRun).toBe(false);
    expect(sc.applied).toBeGreaterThan(0);
    expect(paar.filter((id) => store.getMemory(id)?.supersededBy).length).toBe(1);
  });

  it("confirm ist im inputSchema deklariert", () => {
    const feld = werkzeuge.find((t) => t.name === "memory_consolidate")!.inputSchema.properties.confirm;
    expect(feld, "confirm fehlt im inputSchema — ein Agent kann es nicht erraten").toBeDefined();
    expect(String(feld.type)).toBe("string");
    expect(`${feld.description ?? ""}`).toMatch(/supersede/);
  });
});

describe("memory_consolidate: die Kandidaten-Kappe ist fuer den Agenten sichtbar", () => {
  // F2s Kappe in der Engine (MAX_CANDIDATES_PRO_AUFRUF = 500) setzte ein Feld in die
  // Engine-Antwort, das hier ankam und verlor sich — der Agent sah 500 Vorschlaege und
  // hielt sie fuer alle. Ein Test, der die Kappe nicht ausloest, waere Dekoration.

  async function vieleDupletten(store: KeptaStore, anzahl: number): Promise<void> {
    for (let i = 0; i < anzahl; i++) {
      await notiz(store, "Immer gleiche Ueberschrift", "Der Backuplauf nachts um drei, Variante " + i);
    }
  }

  it("ueber 500 Paare: begrenzt steht in der Antwort, die Liste ist gekappt, der Text sagt es", async () => {
    const store = freshStore();
    // 34 gleiche Titel = 561 Paare — deutlich ueber der Kappe von 500.
    await vieleDupletten(store, 34);
    const res = await ruf(store, "memory_consolidate", { dryRun: true });
    const sc = res.structuredContent as { dryRun: boolean; candidates: unknown[]; begrenzt: boolean; hinweis?: string };
    expect(res.isError, text(res)).toBeUndefined();
    expect(sc.candidates.length, `${sc.candidates.length} Kandidaten geliefert — Kappe nicht erreicht`).toBe(500);
    expect(sc.begrenzt).toBe(true);
    expect(text(res), "Der menschenlesbare Text schweigt die Kuerzung").toMatch(/capped/i);
    expect(text(res)).toMatch(/500/);
    expect(text(res)).toMatch(/dryRun|threshold/);
    expect(sc.hinweis).toBeTruthy();
  });

  it("unter der Kappe: begrenzt:false und kein Hinweis", async () => {
    const store = freshStore();
    await duplettePaar(store);
    const res = await ruf(store, "memory_consolidate", { dryRun: true });
    const sc = res.structuredContent as { begrenzt: boolean; hinweis?: string };
    expect(sc.begrenzt).toBe(false);
    expect(sc.hinweis).toBeUndefined();
  });

  it("begrenzt und hinweis sind in der outputSchema deklariert — sonst gilt A2-01 sogleich wieder", async () => {
    const store = freshStore();
    await vieleDupletten(store, 34);
    const res = await ruf(store, "memory_consolidate", { dryRun: true });
    const w = werkzeuge.find((t) => t.name === "memory_consolidate")!;
    const eigenschaften = (w.outputSchema as { properties: Record<string, { type?: unknown }> }).properties;
    expect(String(eigenschaften.begrenzt?.type), "begrenzt fehlt in der outputSchema").toBe("boolean");
    expect(String(eigenschaften.hinweis?.type), "hinweis fehlt in der outputSchema").toBe("string");
    const ajv = new Ajv({ strict: false, allErrors: true });
    const pruefe = ajv.compile(w.outputSchema as unknown as object);
    const fehl = (pruefe.errors ?? []).map((f) => `${f.instancePath || "/"} ${f.message}`);
    expect(pruefe(res.structuredContent), fehl.join(" | ")).toBe(true);
  });
});

describe("memory_update: supersededBy ist ein deklariertes Feld — die Konsolidierung lasst sich zuruecknehmen", () => {
  let store: KeptaStore;
  let dup: string;
  let keep: string;

  beforeEach(async () => {
    store = freshStore();
    await duplettePaar(store);
    // Der Trockenlauf zeigt das Paar; das Setzen des Zeigers ist genau das, was
    // "anwenden" in der Engine tut — hier von Hand, damit der Rueckweg unabhaengig
    // von der Bestaetigungsseite der Konsolidierung bewiesen werden kann.
    const vor = await ruf(store, "memory_consolidate", { dryRun: true });
    expect(kandidaten(vor).length, "Trockenlauf findet kein Dupletten-Paar").toBeGreaterThan(0);
    dup = kandidaten(vor)[0]!.duplicateId;
    keep = kandidaten(vor)[0]!.keepId;
    store.supersedeMemory(dup, keep);
  });

  it("supersededBy:null hebt eine falsch angewandte Ersetzung auf", async () => {
    expect(store.getMemory(dup)?.supersededBy).not.toBeNull();
    const res = await ruf(store, "memory_update", { id: dup, supersededBy: null });
    expect(res.isError, text(res)).toBeUndefined();
    expect((res.structuredContent as { updated: boolean }).updated).toBe(true);
    expect((res.structuredContent as { memory: { supersededBy: string | null } }).memory.supersededBy).toBeNull();
    expect(store.getMemory(dup)?.supersededBy).toBeNull();
    const found = await ruf(store, "memory_search", { query: "Backup laeuft nachts" });
    const treffer = (found.structuredContent as { hits: { id: string; superseded: boolean }[] }).hits.find((h) => h.id === dup)!;
    expect(treffer.superseded).toBe(false);
  });

  it("supersededBy auf eine offene Notiz setzt den Zeiger", async () => {
    const nachfolger = await notiz(store, "Backup-Fenster Sommer", "Ab April laeuft das Backup um zwei Uhr.");
    const res = await ruf(store, "memory_update", { id: dup, supersededBy: nachfolger });
    expect(res.isError, text(res)).toBeUndefined();
    expect(store.getMemory(dup)?.supersededBy).toBe(nachfolger);
  });

  it("ein Zeiger auf eine private Notiz wird abgewiesen — Antwort wie bei einer unbekannten id", async () => {
    const geheim = await notiz(store, "Geheime Nachfolgerin", "4714", "private");
    const res = await ruf(store, "memory_update", { id: dup, supersededBy: geheim });
    expect(res.isError).toBe(true);
    expect(text(res)).not.toMatch(/priv/i);
    expect(store.getMemory(dup)?.supersededBy).toBe(keep);
    // Wortgleich auf die id heruntergebrochen: eine private Nachfolgerin darf nicht
    // als private erkennbar sein — die Antwort muss die einer unbekannten id sein.
    const unbekannt = await ruf(store, "memory_update", { id: dup, supersededBy: "gibts-fuer-niemals" });
    const norm = (s: string, id: string) => s.split(id).join("<id>");
    expect(norm(text(unbekannt), "gibts-fuer-niemals")).toBe(norm(text(res), geheim));
  });

  it("ein Nicht-String-Wert als Nachfolger wird abgewiesen, nicht gespeichert", async () => {
    for (const by of [42, {}, [], true]) {
      const res = await ruf(store, "memory_update", { id: dup, supersededBy: by });
      expect(res.isError, `supersededBy=${JSON.stringify(by)} wurde durchgelassen`).toBe(true);
      expect(text(res)).toMatch(/supersededBy/);
    }
  });

  it("supersededBy steht im inputSchema von memory_update als string oder null", () => {
    const feld = werkzeuge.find((t) => t.name === "memory_update")!.inputSchema.properties.supersededBy;
    expect(feld, "supersededBy fehlt im inputSchema — der Rueckweg ist unsichtbar").toBeDefined();
    expect(JSON.stringify(feld.type)).toBe('["string","null"]');
  });

  it("die uebrigen update-Felder bleiben unberuehrt", async () => {
    const offen = await notiz(store, "Ganz andere Notiz", "Inhalt bleibt");
    const res = await ruf(store, "memory_update", { id: offen, title: "Neuer Titel" });
    expect((res.structuredContent as { memory: { content: string } }).memory.content).toBe("Inhalt bleibt");
    expect((res.structuredContent as { memory: { supersededBy: string | null } }).memory.supersededBy).toBeNull();
  });
});
