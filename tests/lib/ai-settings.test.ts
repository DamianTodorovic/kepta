// @vitest-environment jsdom
// 26.9.-Audit-Fund: das localStorage hängt am Random-Port-Origin der App —
// nach jedem Neustart ist es LEER, und die AI-Verbindung (Provider, Modell,
// API-Schlüssel) war weg. Seitdem spiegelt jedes saveAISettings in die
// verschlüsselte DB (/api/settings) und hydrateAISettings übernimmt die
// Spiegelung, wenn localStorage leer ist.
import { afterEach, describe, expect, it, vi } from "vitest";
import { hydrateAISettings, loadAISettings, saveAISettings } from "../../src/lib/ai";

const KEY = "ki_gehirn_ai_settings";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("AI-Settings: DB-Spiegelung überlebt den Portwechsel", () => {
  it("saveAISettings schreibt localStorage UND spiegelt nach /api/settings", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return { ok: true, json: async () => ({}) } as Response;
    });
    saveAISettings({ providerId: "openai", apiKey: "sk-test-123", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" });
    expect(JSON.parse(localStorage.getItem(KEY)!).apiKey).toBe("sk-test-123");
    await vi.waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0].url).toBe("/api/settings");
    const body = JSON.parse(String(calls[0].init!.body));
    expect(JSON.parse(body.ai_settings).apiKey).toBe("sk-test-123");
  });

  it("leeres localStorage + DB-Spiegelung → die Spiegelung übernimmt komplett", async () => {
    const gespiegelt = JSON.stringify({
      providerId: "anthropic",
      apiKey: "sk-ant-alt",
      baseUrl: "https://api.anthropic.com",
      model: "claude-sonnet-4-20250514",
    });
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({ ai_settings: gespiegelt }) }) as Response);
    const s = await hydrateAISettings();
    expect(s.model).toBe("claude-sonnet-4-20250514");
    expect(s.apiKey).toBe("sk-ant-alt");
    expect(JSON.parse(localStorage.getItem(KEY)!).apiKey).toBe("sk-ant-alt");
  });

  it("vorhandene lokale Settings bleiben unangetastet — der Spiegel fügt nichts ein", async () => {
    saveAISettings({ providerId: "ollama", apiKey: "local", baseUrl: "http://localhost:11434/v1", model: "llama3.2" });
    const gespiegelt = JSON.stringify({ providerId: "openai", apiKey: "sk-alt", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" });
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({ ai_settings: gespiegelt }) }) as Response);
    const s = await hydrateAISettings();
    expect(s.model).toBe("llama3.2");
    expect(s.apiKey).toBe("local");
  });

  it("offline (fetch wirft): localStorage bleibt die Wahrheit, kein Absturz", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    const s = await hydrateAISettings();
    expect(s.providerId).toBe("openai"); // der Default
  });
});
