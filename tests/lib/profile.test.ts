// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  loadProfile,
  saveProfile,
  createDefaultProfile,
  detectLocalAIs,
  suggestProvider,
  type DetectedAI,
} from "../../src/lib/profile";

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createDefaultProfile", () => {
  it("liefert ein leeres, nicht-onboardetes Profil mit Zeitstempeln", () => {
    const p = createDefaultProfile();
    expect(p.displayName).toBe("");
    // Frueher stand hier useCases mit acht festen Kategorien. Der Nutzer tippt
    // seine Themen jetzt selbst; leer ist der richtige Startzustand.
    expect(p.topics).toEqual([]);
    expect(p.hasCompletedOnboarding).toBe(false);
    expect(p.createdAt).toBeGreaterThan(0);
    expect(p.detectedAIs).toEqual([]);
  });
});

describe("loadProfile / saveProfile", () => {
  it("speichert und lädt ein Profil (roundtrip)", () => {
    // saveProfile spiegelt an /api/profile → fetch stubben, damit kein echter Call passiert
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true }) as Response));
    const p = { ...createDefaultProfile(), displayName: "Alex" };
    saveProfile(p);
    expect(loadProfile()?.displayName).toBe("Alex");
  });

  it("liefert null ohne gespeichertes Profil", () => {
    expect(loadProfile()).toBeNull();
  });

  it("liefert null bei Profil ohne displayName", () => {
    localStorage.setItem("ki_gehirn_adaptive_profile", JSON.stringify({ useCases: [] }));
    expect(loadProfile()).toBeNull();
  });

  it("liefert null bei kaputtem JSON", () => {
    localStorage.setItem("ki_gehirn_adaptive_profile", "{ kaputt ]");
    expect(loadProfile()).toBeNull();
  });
});

describe("detectLocalAIs", () => {
  it("erkennt erreichbare Ollama-Modelle und markiert LM Studio als offline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("11434/api/tags")) {
          return { ok: true, json: async () => ({ models: [{ name: "llama3.2" }, { model: "nomic" }] }) } as unknown as Response;
        }
        if (url.includes("1234")) throw new Error("refused");
        if (url.includes("/api/health")) return { ok: true } as Response;
        throw new Error("unbekannt");
      })
    );
    const res = await detectLocalAIs();
    const ollama = res.find((r) => r.id === "ollama");
    const lm = res.find((r) => r.id === "lmstudio");
    expect(ollama?.available).toBe(true);
    expect(ollama?.models).toContain("llama3.2");
    expect(lm?.available).toBe(false);
  });

  it("findet Ollama auch, wenn der Blick aus dem Fenster durch CORS blockiert ist", async () => {
    // K2 — `profile.ts:136-143` versprach seit 2.13 eine Server-Probe „falls CORS
    // blockt, aber Server kann" und fuehrte im einzigen Zweig einen Kommentar aus.
    // Der Fall stellt genau diesen Zustand her: der direkte Griff aus dem Fenster
    // wirft, der Server erreicht Ollama aber — und die App meldet Ollama trotzdem
    // als „nicht da", waehrend der Nutzer im Assistenten vor einem leeren Feld steht.
    const gesendet: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes("11434/api/tags") || url.includes("1234")) throw new TypeError("Failed to fetch");
        if (url.includes("/api/models")) {
          gesendet.push(String((init?.body as string) ?? "").slice(0, 200));
          const body = JSON.parse(String(init?.body ?? "{}")) as { baseUrl?: string };
          if (String(body.baseUrl).includes("11434")) {
            return { ok: true, json: async () => ({ models: ["llama3.2", "qwen2.5"] }) } as unknown as Response;
          }
          return { ok: false, status: 500, json: async () => ({ error: "upstream refused" }) } as unknown as Response;
        }
        throw new Error("unbekannte Sonde: " + url);
      })
    );
    const res = await detectLocalAIs();
    const ollama = res.find((r) => r.id === "ollama");
    expect(ollama?.available, "der Server sieht Ollama, also darf die Flaeche es nicht als fehlen melden").toBe(true);
    expect(ollama?.models).toEqual(["llama3.2", "qwen2.5"]);
    const lm = res.find((r) => r.id === "lmstudio");
    expect(lm?.available, "ein abgelehnter Nachzug macht nichts verfuegbar").toBe(false);
    expect(gesendet.length, "der Nachzug geht durch die Server-Tuer, nicht ins offene Netz").toBeGreaterThan(0);
    for (const b of gesendet) expect(b).toContain("/v1");
  });
});

describe("suggestProvider", () => {
  const withOllama: DetectedAI[] = [{ id: "ollama", label: "", available: true, models: ["llama3.2"] }];
  const withLm: DetectedAI[] = [
    { id: "ollama", label: "", available: false, models: [] },
    { id: "lmstudio", label: "", available: true, models: [] },
  ];
  it("bevorzugt Ollama wenn Modelle vorhanden", () => {
    expect(suggestProvider(withOllama)).toBe("ollama");
  });
  it("nimmt LM Studio wenn nur das verfügbar ist", () => {
    expect(suggestProvider(withLm)).toBe("lmstudio");
  });
  it("fällt sonst auf den Fallback zurück", () => {
    expect(suggestProvider([], "openrouter")).toBe("openrouter");
  });
});
