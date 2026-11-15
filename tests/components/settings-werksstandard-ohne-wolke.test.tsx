// @vitest-environment jsdom
// Schlag 22.10. nacht, dritter Teil: die Flaeche selbst. Der Text zeigt die Wolke, weil
// `src/lib/ai.ts:345-351` bei leerem Browserspeicher PROVIDERS[0] ausgibt - openai mit
// https://api.openai.com/v1 - und `src/components/Settings.tsx:163` genau das in den Anfangszustand
// legt. Leser des Wertes: Settings.tsx:250 (provider), :252 (adresseLokal), :309, :354, :476 und
// Chat.tsx:126, :491, :537-539. Alle diese Zeilen bekommen eine Adresse, die niemand gewaehlt hat.
//
// Rein ASCII.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Settings } from "../../src/components/Settings";
import { PROVIDERS } from "../../src/lib/ai";
import { TRAEGER_REIHENFOLGE, THEMA_REIHENFOLGE } from "../../src/lib/graphHierarchy";

const PROVIDER_IDS = PROVIDERS.map((p) => p.id);

let modelle: { baseUrl: string; apiKey: string }[] = [];

function antwort(status: number, leib: unknown) {
  return new Response(JSON.stringify(leib), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  localStorage.clear();
  modelle = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: { method?: string; body?: BodyInit | null }) => {
    const weg = typeof url === "string" ? url : String(url);
    if (weg.includes("/api/models")) {
      try {
        const leib = JSON.parse(String(init?.body ?? "{}")) as { baseUrl?: string; apiKey?: string };
        modelle.push({ baseUrl: leib.baseUrl ?? "", apiKey: leib.apiKey ?? "" });
      } catch { /* Leib nicht lesbar - der Fall prueft das selbst */ }
      const basis = String((init?.body ? (JSON.parse(String(init.body)) as { baseUrl?: string }).baseUrl : "") ?? "");
      if (!basis) return antwort(400, { error: "kein Modell-Anbieter gesetzt \u2014 die Route rueft keinen Anbieter", grund: "kein-anbieter" });
      return antwort(200, { models: [] });
    }
    if (weg.includes("/api/health")) return antwort(200, { ok: true, count: 0, uptime: 1 });
    if (weg.includes("/api/policies")) return antwort(200, { managed: false, policies: {} });
    if (weg.includes("/api/mcp/tools")) return antwort(200, { tools: [] });
    return antwort(200, {
      bestand: 0,
      traeger: Object.fromEntries(TRAEGER_REIHENFOLGE.map((t) => [t, 0])),
      themen: Object.fromEntries(THEMA_REIHENFOLGE.map((t) => [t, 0])),
      memories: [],
    });
  }) as unknown as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function zeige() {
  const { container } = render(<Settings />);
  await waitFor(() => expect(container.textContent).toMatch(/Artificial intelligence/));
  return container;
}

describe("P4-Nacht: die Einstellungen zeigen keine Adresse, die niemand gewaehlt hat", () => {
  it("das Endpunkt-Feld ist beim ersten Oeffnen leer", async () => {
    await zeige();
    const feld = screen.getByLabelText(/API endpoint/) as HTMLInputElement;
    expect(feld.value, `Vorbelegt mit: ${JSON.stringify(feld.value)}`).toBe("");
  });

  it("die Katalogzeile steht, aber die Adresse daneben ist leer", async () => {
    await zeige();
    const select = screen.getByLabelText(/^Provider/) as HTMLSelectElement;
    expect(PROVIDER_IDS.includes(select.value), `Vorbelegter Anbieter: ${JSON.stringify(select.value)}`).toBe(true);
    const feld = screen.getByLabelText(/API endpoint/) as HTMLInputElement;
    expect(feld.value, `Adressfeld vorbelegt mit: ${JSON.stringify(feld.value)}`).toBe("");
  });

  it("ein Klick auf Load nennt der Tuer keine Wolke, und die Antwort wird ein Satz", async () => {
    const container = await zeige();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Load" }));
    await waitFor(() => expect(modelle.length).toBeGreaterThan(0));
    for (const gesendet of modelle) {
      expect(gesendet.baseUrl, `Gesendete Basis: ${JSON.stringify(gesendet.baseUrl)}`).toBe("");
      expect(gesendet.baseUrl).not.toContain("api.openai.com");
    }
    await waitFor(() => expect(container.textContent).toMatch(/no model provider is chosen yet/i));
    expect(container.textContent).not.toMatch(/kein Modell-Anbieter gesetzt/);
  });

  it("ein wirklich gewaehlter Anbieter fuellt das Feld wieder", async () => {
    await zeige();
    const select = screen.getByLabelText(/^Provider/) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "openai" } });
    await waitFor(() => expect((screen.getByLabelText(/API endpoint/) as HTMLInputElement).value)
      .toBe("https://api.openai.com/v1"));
  });
});
