// @vitest-environment jsdom
// 26.9.-Audit-Fund: das localStorage hängt am Random-Port-Origin der App —
// nach jedem Neustart ist es LEER, und die AI-Verbindung (Provider, Modell,
// API-Schlüssel) war weg. Seitdem spiegelt jedes saveAISettings in die
// verschlüsselte DB (/api/settings) und hydrateAISettings übernimmt die
// Spiegelung, wenn localStorage leer ist.
//
// F13 hat den Inhalt des Spiegels geändert, nicht seinen Zweck: seit der Kern
// die Route maskiert (A3-09) liegt die Verbindung unter `ai_connection`, und
// der Schlüssel geht als Umschlag hinein, nie im Klartext. Die Einzelheiten des
// Verschlusses prüft tests/lib/ki-schluessel.test.ts.
import { afterEach, describe, expect, it, vi } from "vitest";
import { hydrateAISettings, loadAISettings, saveAISettings } from "../../src/lib/ai";

// Der Sitzungsname liegt absichtlich ausserhalb der Praefixe, die
// src/lib/settings.ts in /api/settings zurueckspiegelt — sonst steht der
// Klartext des Schluessels wieder in der Antwort (F13, Schritt 2).
const KEY = "aiVerbindung";
const DB_SCHLUESSEL = "0f2a4c6e8a0fb1d3".repeat(4); // 64 Hex

/** Die Route dieser Installation: Spiegelbestand und der Verschluss aus dem Schlüsselbund. */
function routen() {
  const bestand: Record<string, string> = {};
  const anfrage = async (url: string, init?: RequestInit): Promise<Response> => {
    if (url === "/api/settings" && init?.method === "PUT") {
      const leib = JSON.parse(String(init.body)) as Record<string, string | null>;
      for (const [k, v] of Object.entries(leib)) {
        if (v === null) delete bestand[k];
        else bestand[k] = v;
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (url === "/api/settings") return new Response(JSON.stringify(bestand), { status: 200 });
    if (url === "/api/recovery-key") {
      return new Response(JSON.stringify({ key: DB_SCHLUESSEL, storedIn: "macOS Keychain" }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  };
  return { bestand, anfrage };
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("AI-Settings: DB-Spiegelung überlebt den Portwechsel", () => {
  it("saveAISettings schreibt localStorage UND spiegelt nach /api/settings", async () => {
    const kern = routen();
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return kern.anfrage(url, init);
    });
    await saveAISettings({ providerId: "openai", apiKey: "sk-test-123", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" });
    expect(JSON.parse(localStorage.getItem(KEY)!).apiKey).toBe("sk-test-123");
    expect(calls.some((c) => c.url === "/api/settings" && c.init?.method === "PUT")).toBe(true);

    // der Spiegel trägt die Verbindung; der Schlüssel liegt darin nur als Umschlag
    const gespiegelt = JSON.parse(kern.bestand.ai_connection) as { providerId: string; model: string; schluessel?: string };
    expect(gespiegelt.providerId).toBe("openai");
    expect(gespiegelt.model).toBe("gpt-4o-mini");
    expect(gespiegelt.schluessel).toMatch(/^v1\./);
    expect(kern.bestand.ai_connection).not.toContain("sk-test-123");
  });

  it("leeres localStorage + DB-Spiegelung → die Spiegelung übernimmt komplett", async () => {
    const kern = routen();
    vi.stubGlobal("fetch", kern.anfrage);
    await saveAISettings({
      providerId: "anthropic",
      apiKey: "sk-ant-alt",
      baseUrl: "https://api.anthropic.com",
      model: "claude-sonnet-4-20250514",
    });

    localStorage.clear();
    const s = await hydrateAISettings();
    expect(s.model).toBe("claude-sonnet-4-20250514");
    expect(s.providerId).toBe("anthropic");
    expect(s.apiKey).toBe("sk-ant-alt");
    expect(JSON.parse(localStorage.getItem(KEY)!).apiKey).toBe("sk-ant-alt");
  });

  it("vorhandene lokale Settings bleiben unangetastet — der Spiegel fügt nichts ein", async () => {
    const kern = routen();
    vi.stubGlobal("fetch", kern.anfrage);
    saveAISettings({ providerId: "ollama", apiKey: "local", baseUrl: "http://localhost:11434/v1", model: "llama3.2" });
    // ein Spiegel, der eine andere Verbindung trägt — die lokale Sitzung gewinnt
    kern.bestand.ai_connection = JSON.stringify({
      v: 1,
      providerId: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      schluessel: "v1.wasAuchImmer",
    });
    const s = await hydrateAISettings();
    expect(s.model).toBe("llama3.2");
    expect(s.apiKey).toBe("local");
    expect(loadAISettings().providerId).toBe("ollama");
  });

  it("offline (fetch wirft): localStorage bleibt die Wahrheit, kein Absturz", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    const s = await hydrateAISettings();
    expect(s.providerId).toBe("openai"); // der Default
  });
});
