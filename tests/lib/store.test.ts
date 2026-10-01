// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// lib/store.ts hält modulweiten Cache + 300ms-Debounce. Deshalb laden wir das
// Modul in jedem Test frisch (resetModules + dynamic import) und nutzen Fake-Timer,
// um den Debounce deterministisch durchzuschieben.

type StoreModule = typeof import("../../src/lib/store");

async function freshModule(): Promise<StoreModule> {
  vi.resetModules();
  return import("../../src/lib/store");
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("ki_gehirn_memories_migrated_v2", "1"); // Legacy-Migration überspringen
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("refreshMemories + Cache", () => {
  it("lädt vom Server und füllt den Cache (Debounce 300ms)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([{ id: "a", title: "A" }])));
    const mod = await freshModule();
    const p = mod.refreshMemories();
    await vi.advanceTimersByTimeAsync(300);
    const result = await p;
    expect(result).toHaveLength(1);
    expect(mod.getMemoriesSync()[0]?.id).toBe("a");
  });

  it("akzeptiert auch {memories:[]}-Form", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ memories: [{ id: "b" }] })));
    const mod = await freshModule();
    const p = mod.refreshMemories();
    await vi.advanceTimersByTimeAsync(300);
    await p;
    expect(mod.getMemoriesSync()[0]?.id).toBe("b");
  });

  it("behält den Cache bei Server-Fehler", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("offline");
    }));
    const mod = await freshModule();
    const p = mod.refreshMemories();
    await vi.advanceTimersByTimeAsync(300);
    await p;
    expect(mod.getMemoriesSync()).toEqual([]);
  });
});

describe("subscribeMemories", () => {
  it("ruft Callback sofort mit dem Cache und meldet ab", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([])));
    const mod = await freshModule();
    const seen: unknown[] = [];
    const unsub = mod.subscribeMemories((mems) => seen.push(mems));
    expect(seen.length).toBeGreaterThanOrEqual(1); // sofortiger Call
    unsub();
    await vi.advanceTimersByTimeAsync(300);
  });
});

describe("Legacy-Migration", () => {
  it("migriert alten localStorage-Bestand einmalig per Import-POST", async () => {
    localStorage.clear(); // MIGRATED_KEY NICHT setzen → Migration läuft
    localStorage.setItem("ki_gehirn_memories", JSON.stringify([{ id: "old-1", title: "Alt" }]));
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      return jsonResponse([]);
    }));
    const mod = await freshModule();
    const p = mod.refreshMemories();
    await vi.advanceTimersByTimeAsync(300);
    await p;
    expect(calls.some((u) => u.includes("/api/memories/import"))).toBe(true);
    // Migrations-Flag ist jetzt gesetzt
    expect(localStorage.getItem("ki_gehirn_memories_migrated_v2")).toBe("1");
  });

  it("überspringt Migration ohne Legacy-Bestand", async () => {
    localStorage.clear();
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      return jsonResponse([]);
    }));
    const mod = await freshModule();
    const p = mod.refreshMemories();
    await vi.advanceTimersByTimeAsync(300);
    await p;
    expect(calls.some((u) => u.includes("import"))).toBe(false);
  });
});

describe("saveMemory (optimistic + Rollback)", () => {
  it("fügt optimistisch ein und bestätigt mit Serverantwort", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/memories" && !url.includes("import")) {
        return jsonResponse({ memory: { id: "srv-1", title: "Neu" } });
      }
      return jsonResponse([{ id: "srv-1", title: "Neu" }]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const mod = await freshModule();
    const p = mod.saveMemory({ title: "Neu", content: "x" });
    await vi.advanceTimersByTimeAsync(300);
    const saved = await p;
    expect(saved?.id).toBe("srv-1");
  });

  it("rollt bei Server-Fehler zurück und liefert null", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "kaputt" }, false)));
    const mod = await freshModule();
    const saved = await mod.saveMemory({ title: "Fehlerfall", content: "y" });
    expect(saved).toBeNull();
    expect(mod.getMemoriesSync()).toEqual([]); // Rollback
  });

  it("rollt zurück und konvergiert danach auf den Server-Stand", async () => {
    // POST schlägt fehl, der Konvergenz-GET liefert die serverseitige Wahrheit
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") return jsonResponse({ error: "kaputt" }, false);
      return jsonResponse([{ id: "srv-9", title: "Vom Server" }]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const mod = await freshModule();
    const saved = await mod.saveMemory({ title: "Fehlerfall", content: "y" });
    expect(saved).toBeNull();
    await vi.advanceTimersByTimeAsync(50); // Follow-up-GET (Konvergenz) abwarten
    expect(mod.getMemoriesSync()[0]?.id).toBe("srv-9");
    expect(fetchMock).toHaveBeenCalledTimes(2); // 1× POST + 1× Konvergenz-GET
  });

  it("schluckt einen fehlschlagenden Konvergenz-Resync still", async () => {
    // Alles offline UND localStorage gesteckt → doRefresh selbst rejected;
    // das .catch in der Konvergenz darf keine Unhandled-Rejection werfen.
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("offline");
    }));
    const spy = vi.spyOn(localStorage, "getItem").mockImplementationOnce(() => {
      throw new Error("storage weg");
    });
    const mod = await freshModule();
    const saved = await mod.saveMemory({ title: "x", content: "y" });
    expect(saved).toBeNull();
    await vi.advanceTimersByTimeAsync(50);
    spy.mockRestore();
    expect(mod.getMemoriesSync()).toEqual([]); // Rollback blieb erhalten
  });

  it("aktualisiert einen bestehenden Eintrag optimistisch (isUpdate-Pfad)", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/memories") return jsonResponse([{ id: "vorhanden", title: "Erst" }]);
      return jsonResponse([{ id: "vorhanden", title: "Geändert" }]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const mod = await freshModule();
    // Cache mit einem Eintrag füllen
    const r = mod.refreshMemories();
    await vi.advanceTimersByTimeAsync(300);
    await r;
    // Jetzt Update desselben id → isUpdate=true, cache.map-Zweig (Z. 121)
    const fetchUpd = vi.fn(async (url: string) => {
      if (url === "/api/memories") return jsonResponse({ memory: { id: "vorhanden", title: "Geändert" } });
      return jsonResponse([{ id: "vorhanden", title: "Geändert" }]);
    });
    vi.stubGlobal("fetch", fetchUpd);
    const p = mod.saveMemory({ id: "vorhanden", title: "Geändert" });
    await vi.advanceTimersByTimeAsync(300);
    const saved = await p;
    expect(saved?.title).toBe("Geändert");
  });
});

describe("deleteMemory", () => {
  it("entfernt optimistisch und refetcht", async () => {
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      call++;
      return jsonResponse([]);
    }));
    const mod = await freshModule();
    const p = mod.deleteMemory("weg-1");
    await vi.advanceTimersByTimeAsync(300);
    await p;
    expect(call).toBeGreaterThanOrEqual(1);
  });

  it("rollt bei Fehler zurück", async () => {
    // Erst Cache füllen, dann DELETE fehlschlagen lassen → Rollback (Z. 156-157)
    const fetchList = vi.fn(async () => jsonResponse([{ id: "bleibt", title: "Da" }]));
    vi.stubGlobal("fetch", fetchList);
    const mod = await freshModule();
    const r = mod.refreshMemories();
    await vi.advanceTimersByTimeAsync(300);
    await r;
    expect(mod.getMemoriesSync()).toHaveLength(1);

    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("DELETE weg");
    }));
    const p = mod.deleteMemory("bleibt");
    await vi.advanceTimersByTimeAsync(300);
    await p;
    // Rollback: Eintrag ist wieder da
    expect(mod.getMemoriesSync()).toHaveLength(1);
  });

  it("rollt bei Fehler zurück und konvergiert auf den Server-Stand", async () => {
    // DELETE wirft (Fehlerpfad), der Konvergenz-GET liefert die Serverliste
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") throw new Error("DELETE weg");
      return jsonResponse([
        { id: "bleibt", title: "Da" },
        { id: "zweit", title: "Auch da" },
      ]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const mod = await freshModule();
    const p = mod.deleteMemory("bleibt");
    await vi.advanceTimersByTimeAsync(50);
    await p;
    await vi.advanceTimersByTimeAsync(50); // Konvergenz-GET abwarten
    const ids = mod.getMemoriesSync().map((m: { id: string }) => m.id);
    expect(ids).toContain("bleibt");
    expect(ids).toHaveLength(2);
  });

  it("schluckt einen fehlschlagenden Konvergenz-Resync nach Delete still", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("offline");
    }));
    const spy = vi.spyOn(localStorage, "getItem").mockImplementationOnce(() => {
      throw new Error("storage weg");
    });
    const mod = await freshModule();
    await mod.deleteMemory("x");
    await vi.advanceTimersByTimeAsync(50);
    spy.mockRestore();
    expect(mod.getMemoriesSync()).toEqual([]);
  });
});

describe("importMemories", () => {
  it("POSTet und liefert die Server-Zusammenfassung", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("import")) return jsonResponse({ imported: 3, total: 5 });
      return jsonResponse([]);
    }));
    const mod = await freshModule();
    const p = mod.importMemories([{ title: "A" }], "merge");
    await vi.advanceTimersByTimeAsync(300);
    const res = await p;
    expect(res.imported).toBe(3);
    expect(res.total).toBe(5);
  });

  it("wirft bei Fehler-Response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "nein" }, false)));
    const mod = await freshModule();
    await expect(mod.importMemories([], "replace")).rejects.toThrow();
  });
});
