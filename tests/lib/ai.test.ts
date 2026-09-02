// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { PROVIDERS, providerById, loadAISettings, saveAISettings, resolveAIConnection, type AISettings } from "../../src/lib/ai";

const SETTINGS_KEY = "ki_gehirn_ai_settings";

function settings(over: Partial<AISettings> = {}): AISettings {
  return { providerId: "openai", apiKey: "", baseUrl: "", model: "gpt-4o-mini", ...over };
}

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

describe("resolveAIConnection", () => {
  const openai = providerById("openai"); // needsKey = true
  const ollama = providerById("ollama"); // needsKey = false

  it("Cloud-Provider MIT Key → connected (nicht lokal)", () => {
    const c = resolveAIConnection(settings({ providerId: "openai", apiKey: "sk-test", model: "gpt-4o-mini" }), openai, null);
    expect(c.state).toBe("connected");
    if (c.state === "connected") {
      expect(c.label).toBe(openai.label);
      expect(c.model).toBe("gpt-4o-mini");
      expect(c.local).toBe(false);
    }
  });

  it("Cloud-Provider OHNE Key → disconnected (der Screenshot-Fall)", () => {
    const c = resolveAIConnection(settings({ providerId: "openai", apiKey: "", model: "gpt-4o-mini" }), openai, null);
    expect(c.state).toBe("disconnected");
  });

  it("lokaler Provider + Server erreichbar → connected & local", () => {
    const c = resolveAIConnection(settings({ providerId: "ollama", apiKey: "", model: "llama3.2" }), ollama, true);
    expect(c.state).toBe("connected");
    if (c.state === "connected") {
      expect(c.label).toBe(ollama.label);
      expect(c.local).toBe(true);
    }
  });

  it("lokaler Provider + Server NICHT erreichbar → disconnected", () => {
    expect(resolveAIConnection(settings({ providerId: "ollama", model: "llama3.2" }), ollama, false).state).toBe("disconnected");
    expect(resolveAIConnection(settings({ providerId: "ollama", model: "llama3.2" }), ollama, null).state).toBe("disconnected");
  });

  it("kein Modell → disconnected, egal welcher Provider", () => {
    expect(resolveAIConnection(settings({ providerId: "openai", apiKey: "sk-x", model: "" }), openai, null).state).toBe("disconnected");
    expect(resolveAIConnection(settings({ providerId: "ollama", model: "  " }), ollama, true).state).toBe("disconnected");
  });
});
