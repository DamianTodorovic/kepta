// @vitest-environment jsdom
// Aufgabe #60 und #67, zweiter Teil (Leitung, 22.10.): die Einstellungen muessen den Grund
// nennen, den die Tuer bei /api/models liefert - und nicht raten.
//
// Was am Kopf 4e49c17 gemessen ist (Punkt-4-Hand, 17:05 Uhr):
//   - src/components/Settings.tsx:303-328: die stille Sonde fragt alle 12 s /api/models.
//     Antwortet die Tuer mit 400 oder 502, passiert nur `setSondeWeg(true)`. Der Grund aus dem
//     Feld `grund` wird nicht gelesen; `modelError` bleibt null.
//   - Die gemalte Zeile in :832 ist darum ein Rat: "No local models found. Start Ollama ...".
//     Fuer jemanden, der eine fremde Adresse eingetragen hat, ist das die falsche Auskunft.
//   - /api/models antwortet heute NICHT mehr mit 500, wenn die Adresse fehlt: seit p4-t
//     (gelandet in 02bec77) heisst das 400 mit grund=kein-anbieter (chat.ts:203-211). Die
//     Flaeche faehrt diesen Pfad nicht, weil sie immer `settings.baseUrl || provider.baseUrl`
//     nennt (:308, :349) - gemessen, nicht angenommen. Der Fall unten haelt die 502- und die
//     400-Quittung, die die Flaeche wirklich erreichen kann.
//
// Die Datei ist rein ASCII.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { Settings } from "../../src/components/Settings";
import { saveAISettings } from "../../src/lib/ai";
import { TRAEGER_REIHENFOLGE, THEMA_REIHENFOLGE } from "../../src/lib/graphHierarchy";

const RATER_ZEILE = "No local models found. Start Ollama";

function antwort(status: number, leib: unknown) {
  return new Response(JSON.stringify(leib), { status, headers: { "Content-Type": "application/json" } });
}

let modelWege: string[] = [];

/** Alles ruhig, nur die Modelle-Route antwortet wie die Tuer in ihrem Grund-Zweig. */
function sonde(grund: string, satz: string, status: number) {
  modelWege = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { method?: string }) => {
    if (url.includes("/api/models")) {
      modelWege.push(`${init?.method || "GET"} ${url}`);
      return antwort(status, { error: satz, grund });
    }
    if (url.includes("/api/health")) return antwort(200, { ok: true, count: 0, uptime: 1 });
    if (url.includes("/api/policies")) return antwort(200, { managed: false, policies: {} });
    if (url.includes("/api/mcp/tools")) return antwort(200, { tools: [] });
    if (url.includes("/api/memory-groups") || url.includes("/api/memories")) {
      return antwort(200, {
        bestand: 0,
        traeger: Object.fromEntries(TRAEGER_REIHENFOLGE.map((t) => [t, 0])),
        themen: Object.fromEntries(THEMA_REIHENFOLGE.map((t) => [t, 0])),
        memories: [],
      });
    }
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch);
}

async function zeige() {
  const { container } = render(<Settings />);
  await waitFor(() => expect(container.textContent).toMatch(/Artificial intelligence/));
  // Die Sonde lauft beim Aufbau; ein Durchlauf reicht fuer die Quittung.
  await waitFor(() => expect(modelWege.length).toBeGreaterThan(0));
  await waitFor(() => expect(container.textContent).toMatch(/models|Models|model/i));
  return container;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("P4-60 und P4-67: die Einstellungen nennen den Grund der Tuer", () => {
  it("502 anbieter-nicht-erreichbar: die Zeile sagt, dass der Dienst nicht antwortet", async () => {
    saveAISettings({ providerId: "ollama", apiKey: "", baseUrl: "http://localhost:11434/v1", model: "llama3.2" });
    sonde("anbieter-nicht-erreichbar", "der Anbieter http://localhost:11434/v1 ist nicht erreichbar - fetch failed", 502);
    const container = await zeige();
    const text = container.textContent || "";
    expect(text, `Wortlaut: ${JSON.stringify(text.slice(0, 400))}`).toMatch(/did not answer|not reachable/i);
    expect(text).not.toContain(RATER_ZEILE);
  });

  it("400 kein-schluessel: die Zeile nennt den Schluessel, nicht Ollama", async () => {
    saveAISettings({ providerId: "custom", apiKey: "", baseUrl: "https://model.example.com/v1", model: "test-model" });
    sonde("kein-schluessel", `der Anbieter https://model.example.com/v1 braucht einen Schluessel \u2014 ohne ihn geht kein Paket aus dem Rechner`, 400);
    const container = await zeige();
    const text = container.textContent || "";
    expect(text, `Wortlaut: ${JSON.stringify(text.slice(0, 400))}`).toMatch(/api key/i);
    expect(text).not.toContain(RATER_ZEILE);
    // Der innere Satz der Tuer darf nicht unveraendert dastehen.
    expect(text).not.toMatch(/ohne ihn geht kein Paket/);
  });

  it("die Grund-Zeile wird angesagt: role=alert an der Modelle-Auskunft", async () => {
    saveAISettings({ providerId: "ollama", apiKey: "", baseUrl: "http://localhost:11434/v1", model: "llama3.2" });
    sonde("anbieter-nicht-erreichbar", "der Anbieter http://localhost:11434/v1 ist nicht erreichbar - fetch failed", 502);
    const container = await zeige();
    const angesagt = container.querySelector("[role=alert]");
    expect(angesagt, "keine angesagte Grund-Zeile in den Einstellungen").not.toBeNull();
    expect((angesagt?.textContent || "") + (container.textContent || "")).toMatch(/did not answer|not reachable/i);
  });
});
