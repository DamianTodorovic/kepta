// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { PROVIDERS, providerById, loadAISettings, saveAISettings, type AISettings } from "../../src/lib/ai";

const SETTINGS_KEY = "ki_gehirn_ai_settings";

beforeEach(() => {
  localStorage.clear();
});

describe("PROVIDERS-Presets", () => {
  it("enthält die wichtigsten Anbieter mit sinnvollen Feldern", () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(ids).toContain("openai");
    expect(ids).toContain("anthropic");
    expect(ids).toContain("ollama");
    // Ollama ist lokal und braucht keinen Key
    expect(PROVIDERS.find((p) => p.id === "ollama")?.needsKey).toBe(false);
    // Cloud-Anbieter brauchen einen Key
    expect(PROVIDERS.find((p) => p.id === "openai")?.needsKey).toBe(true);
  });

  it("jeder Preset hat baseUrl-Feld und defaultModel", () => {
    for (const p of PROVIDERS) {
      expect(typeof p.baseUrl).toBe("string");
      expect(typeof p.defaultModel).toBe("string");
      expect(["openai", "anthropic"]).toContain(p.protocol);
    }
  });
});

describe("providerById", () => {
  it("liefert den passenden Preset", () => {
    expect(providerById("anthropic").label).toContain("Claude");
  });
  it("fällt bei unbekannter id auf den ersten Preset zurück", () => {
    expect(providerById("gibts-nicht")).toBe(PROVIDERS[0]);
  });
});

describe("loadAISettings / saveAISettings", () => {
  it("liefert Default (erster Preset) bei leerem Storage", () => {
    const s = loadAISettings();
    expect(s.providerId).toBe(PROVIDERS[0].id);
    expect(s.baseUrl).toBe(PROVIDERS[0].baseUrl);
    expect(s.model).toBe(PROVIDERS[0].defaultModel);
  });

  it("liest gespeicherte Settings (roundtrip)", () => {
    const custom: AISettings = { providerId: "ollama", apiKey: "", baseUrl: "http://x", model: "llama3.2" };
    saveAISettings(custom);
    expect(loadAISettings()).toEqual(custom);
  });

  it("fällt bei kaputtem JSON auf Default zurück", () => {
    localStorage.setItem(SETTINGS_KEY, "{ kaputt ]");
    expect(loadAISettings().providerId).toBe(PROVIDERS[0].id);
  });
});
