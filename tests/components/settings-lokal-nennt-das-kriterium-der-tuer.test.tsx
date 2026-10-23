// @vitest-environment jsdom
// Aufgabe #8, zweiter Teil (24.10., Kopf f366bc9): die Flaeche fuehrt fuer "diese Adresse ist
// lokal" keine eignen Ausdruecke mehr. Bis heute standen in Settings.tsx DREI Lesungen:
//   :253  adresseLokal = /localhost|127\.0\.0\.1|\[::1\]/i  (Teilstring!)
//   :303  isLocal = !needsKey || baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')
//   :349  derselbe Ausdruck ein zweites Mal
// Die Tuer fragt `istLokaleAdresse` (src/lib/schild.ts:213, server/router/chat.ts:46) - ein
// Teilstring-Test bejaht aber auch "http://localhost.localdomain:11434/v1" und verneint
// "http://0.0.0.0:11434/v1", das die Tuer als lokal nimmt.
//
// Dieser Fall misst die sichtbare Folge: die gruene Zeile "N models connected locally".
// Rot vor dem Flicken: localhost.localdomain traegt das Wort "locally", 0.0.0.0 traegt es nicht.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { Settings } from "../../src/components/Settings";
import { PROVIDERS, saveAISettings } from "../../src/lib/ai";
import { istLokaleAdresse } from "../../src/lib/schild";

const MODELLE = ["llama3.2"];
const ollama = () => PROVIDERS.find((p) => p.id === "ollama")!;

function stub(models: string[]) {
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
    const text = typeof url === "string" ? url : String((url as { href?: string })?.href ?? url);
    if (text.includes("/api/models")) return new Response(JSON.stringify({ models }), { status: 200, headers: { "Content-Type": "application/json" } });
    if (text.includes("/api/recovery-key")) return new Response(JSON.stringify({ key: "a".repeat(64), storedIn: "test" }), { status: 200 });
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch);
}

async function zeige(baseUrl: string): Promise<string> {
  const a = ollama();
  saveAISettings({ providerId: a.id, apiKey: "", baseUrl, model: a.defaultModel });
  stub(MODELLE);
  const { container } = render(<Settings />);
  await new Promise((r) => setTimeout(r, 120));
  return container.textContent || "";
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Aufgabe #8: ein Kriterium fuer 'lokal', und es ist das der Tuer", () => {
  it("ein Name, der nur 'localhost' enthaelt, gilt nicht als lokal (kein 'locally' in der Zeile)", async () => {
    const adresse = "http://localhost.localdomain:11434/v1";
    expect(istLokaleAdresse(adresse), "die Tuer nimmt diesen Namen nicht als lokal").toBe(false);
    const text = await zeige(adresse);
    expect(text).not.toMatch(/connected locally/i);
  });

  it("KONTROLLE: 127.0.0.1 traegt das Wort - die Zeile kann es also zeigen", async () => {
    const text = await zeige("http://127.0.0.1:1234/v1");
    expect(istLokaleAdresse("http://127.0.0.1:1234/v1")).toBe(true);
    expect(text).toMatch(/connected locally/i);
  });

  it("0.0.0.0 ist fuer die Tuer lokal - die Flaeche muss es auch so lesen", async () => {
    const adresse = "http://0.0.0.0:11434/v1";
    expect(istLokaleAdresse(adresse), "die Tuer nimmt 0.0.0.0 als lokal").toBe(true);
    const text = await zeige(adresse);
    expect(text).toMatch(/connected locally/i);
  });
});
