// @vitest-environment node
// Aufgabe #94 (24.10.): die vierte Stelle mit dem alten lokal-Kriterium - der Chat-Kopf sagte
// "No AI connected", waehrend dieselbe Anfrage hinausging. `resolveAIConnection` liest jetzt
// dieselbe Bedingung wie die Tuer (istLokaleAdresse, server/router/chat.ts:46).
import { describe, expect, it } from "vitest";
import { providerById, resolveAIConnection } from "../../src/lib/ai";

const openai = providerById("openai");
const basis = { providerId: "openai", model: "gpt-4o-mini" };

describe("P4-94: ein Kriterium fuer die Verbindung", () => {
  it("lokaler Endpunkt ohne Schluessel gilt als verbunden, und er ist lokal", () => {
    const s = resolveAIConnection({ ...basis, apiKey: "", baseUrl: "http://127.0.0.1:1234/v1" }, openai, null);
    expect(s).toEqual({ state: "connected", label: openai.label, model: "gpt-4o-mini", local: true });
  });

  it("KONTROLLE: ferner Endpunkt ohne Schluessel bleibt getrennt", () => {
    const s = resolveAIConnection({ ...basis, apiKey: "", baseUrl: "https://api.openai.com/v1" }, openai, null);
    expect(s).toEqual({ state: "disconnected" });
  });
});
