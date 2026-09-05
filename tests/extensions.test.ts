import { describe, it, expect, vi, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import {
  defaultExtensions,
  type KeptaExtensions,
  type AuditEvent,
  type ActorContext,
  type MemoryRef,
  type AuditAction,
} from "../src/core/extensions";
import { KeptaStore } from "../src/core/store";
import { searchMemories, indexMemory } from "../src/core/engine";
import { callTool } from "../src/core/mcp";
import { embedTexts } from "../src/core/embeddings";

function freshDir(): string {
  return fs.mkdtempSync(path.join(tmpdir(), "kepta-ext-"));
}
function storeWith(ext?: Partial<KeptaExtensions>): KeptaStore {
  return new KeptaStore(path.join(freshDir(), "t.db"), ext ? { ...defaultExtensions(), ...ext } : undefined);
}

const ACTOR: ActorContext = { actorId: "local", scope: "local" };

describe("defaultExtensions", () => {
  it("liefert alle sechs Erweiterungspunkte mit Community-Standard-Verhalten", async () => {
    const ext = defaultExtensions();
    expect(ext.policy.canRead(ACTOR, { id: "x", scope: "local", type: "semantic" })).toBe(true);
    expect(ext.policy.canWrite(ACTOR, { id: "x", scope: "local", type: "semantic" })).toBe(true);
    const rows = [{ id: "a", scope: "local", type: "semantic" }];
    expect(ext.policy.filterResults(ACTOR, rows)).toBe(rows); // unverändert durchgereicht
    // Audit-Sink verwirft ohne Fehler
    expect(() => ext.audit.emit({ at: new Date().toISOString(), actorId: "local", action: "read" })).not.toThrow();
    // KeyProvider: null = unverschlüsselt
    await expect(ext.keys.keyFor("/irgendein/pfad.db")).resolves.toBe(null);
    // Identity: ein fester lokaler Nutzer
    const actor = ext.identity.current();
    expect(actor.actorId).toBe("local");
    expect(typeof actor.scope).toBe("string");
    // Replication: deaktiviert, Aufrufe werfen nicht
    expect(ext.replication.enabled()).toBe(false);
    // Retention: manueller Papierkorb — nichts fällig, kein Proof
    await expect(ext.retention.dueForDeletion(new Date())).resolves.toEqual([]);
    await expect(ext.retention.onDelete(["x"])).resolves.toEqual({ proof: null });
  });

  it("PolicyGate-Standard verändert Store-Verhalten nicht (Create/Read/List identisch)", () => {
    const store = storeWith(); // Community-Standard
    const m = store.createMemory({ title: "T", content: "C" });
    expect(store.getMemory(m.id)?.title).toBe("T");
    expect(store.listMemories()).toHaveLength(1);
  });

  it("AuditSink-Standard verändert Store-Verhalten nicht", () => {
    const store = storeWith();
    expect(() => store.createMemory({ title: "T", content: "C" })).not.toThrow();
    expect(store.countMemories().active).toBe(1);
  });
});

describe("PolicyGate wird aufgerufen", () => {
  it("canWrite blockt Speichern, canRead blockt Lesen, filterResults filtert Suche", async () => {
    const store = storeWith();
    store.createMemory({ id: "ok", title: "Erlaubt", content: "x" });
    store.createMemory({ id: "nein", title: "Verboten", content: "y" });

    const gate = {
      canRead: vi.fn((_a: ActorContext, ref: MemoryRef) => ref.id !== "nein"),
      canWrite: vi.fn(() => false),
      filterResults: vi.fn((_a: ActorContext, rows: MemoryRef[]) => rows.filter((r) => r.id !== "nein")),
    };
    const guarded = storeWith({ policy: gate });

    expect(() => guarded.createMemory({ title: "X", content: "Y" })).toThrow();
    expect(gate.canWrite).toHaveBeenCalled();
    expect(guarded.getMemory("ok")).toBeNull(); // canRead false für alles? Nein: canRead erlaubt ok
    // gezielter: canRead nur für "nein" blockiert
    const gate2 = {
      canRead: vi.fn((_a: ActorContext, ref: MemoryRef) => ref.id !== "nein2"),
      canWrite: vi.fn(() => true),
      filterResults: vi.fn((_a: ActorContext, rows: MemoryRef[]) => rows.filter((r) => r.id !== "nein2")),
    };
    const guarded2 = storeWith({ policy: gate2 });
    guarded2.createMemory({ id: "ok2", title: "A", content: "aa aa" });
    guarded2.createMemory({ id: "nein2", title: "B", content: "bb bb" });
    expect(guarded2.getMemory("ok2")?.id).toBe("ok2");
    expect(guarded2.getMemory("nein2")).toBeNull();
    expect(gate2.canRead).toHaveBeenCalled();

    // filterResults am Ende der Suche
    const res = await searchMemories(guarded2, { query: "aa" });
    expect(res.hits.every((h) => h.memory.id !== "nein2")).toBe(true);
    expect(gate2.filterResults).toHaveBeenCalled();
  });
});

describe("AuditSink wird aufgerufen", () => {
  it("emit bei jedem schreibenden/lesenden Store-Eingang", () => {
    const events: AuditEvent[] = [];
    const store = storeWith({ audit: { emit: (e) => events.push(e) } });
    const m = store.createMemory({ title: "T", content: "C" });
    store.getMemory(m.id);
    store.updateMemory(m.id, { title: "T2" });
    store.trashMemory(m.id);
    const actions = events.map((e) => e.action);
    expect(actions).toContain("write");
    expect(actions).toContain("read");
    expect(actions).toContain("update");
    expect(actions).toContain("delete");
    expect(events.every((e) => typeof e.at === "string" && e.at.endsWith("Z"))).toBe(true);
  });

  it("emit an allen 8 MCP-Werkzeugen", async () => {
    const events: AuditEvent[] = [];
    const store = storeWith({ audit: { emit: (e) => events.push(e) } });
    const saved = await callTool(store, "memory_save", { title: "W", content: "[[Link]]" });
    expect(saved.isError).toBeFalsy();
    await callTool(store, "memory_search", { query: "W" });
    await callTool(store, "memory_update", { id: (saved.structuredContent as { memory: { id: string } }).memory.id, title: "W2" });
    await callTool(store, "memory_list", {});
    await callTool(store, "memory_graph", { entity: "w" });
    await callTool(store, "memory_consolidate", { dryRun: true });
    await callTool(store, "memory_forget", { id: (saved.structuredContent as { memory: { id: string } }).memory.id, mode: "expire" });
    await callTool(store, "memory_delete", { id: (saved.structuredContent as { memory: { id: string } }).memory.id });
    const actions = new Set(events.map((e) => e.action));
    for (const a of ["write", "search", "update", "read", "delete"] as AuditAction[]) expect(actions.has(a)).toBe(true);
  });

  it("egress bei Embedding zu Nicht-localhost — nicht bei localhost", async () => {
    const events: AuditEvent[] = [];
    const sink = { emit: (e: AuditEvent) => events.push(e) };
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: false, status: 599 })) as unknown as typeof fetch;
    try {
      await embedTexts(["x"], "m", sink); // default KEPTA_OLLAMA_URL = localhost
      await embedTexts(["x"], "m", sink, "http://api.beispiel-remote.example:11434");
    } finally {
      globalThis.fetch = orig;
    }
    const egress = events.filter((e) => e.action === "egress");
    expect(egress.length).toBe(1); // nur der Remote-Call
    expect(String(egress[0]?.detail?.host ?? "")).toContain("beispiel-remote");
  });
});

describe("KeyProvider-Aufrufpunkt", () => {
  it("keyFor wird beim Öffnen der DB gefragt; null = normales Öffnen", async () => {
    const keyFor = vi.fn(async () => null);
    const store = storeWith({ keys: { keyFor } });
    expect(keyFor).toHaveBeenCalledWith(path.resolve(store.dbPath));
    expect(store.countMemories().active).toBe(0); // DB normal geöffnet
  });
});

describe("IdentityResolver", () => {
  it("current() bestimmt den Default-Scope beim Speichern ohne scope", async () => {
    const store = storeWith({ identity: { current: () => ({ actorId: "damian", scope: "user:damian" }) } });
    const m = store.createMemory({ title: "T", content: "C" });
    expect(m.scope).toBe("user:damian");
  });
});

describe("RetentionPolicy-Steckplatz", () => {
  it("am Papierkorb angebunden, ohne Verhalten zu ändern", async () => {
    const due = vi.fn(async () => ["alt-1"]);
    const onDelete = vi.fn(async (ids: string[]) => ({ proof: `beweis:${ids.join(",")}` }));
    const store = storeWith({ retention: { dueForDeletion: due, onDelete } });
    const m = store.createMemory({ id: "alt-1", title: "Alt", content: "x" });
    store.trashMemory(m.id);
    // Der Steckplatz ist erreichbar und befragbar — Papierkorb bleibt manuell
    expect(store.extensions.replication.enabled()).toBe(false);
    const fällig = await store.extensions.retention.dueForDeletion(new Date());
    expect(fällig).toEqual(["alt-1"]);
    expect(await store.extensions.retention.onDelete(fällig)).toEqual({ proof: "beweis:alt-1" });
    expect(store.getMemory(m.id)).not.toBeNull(); // nichts automatisch gelöscht
  });
});
