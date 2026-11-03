// @vitest-environment jsdom
/* #31, fuenfter Griff (zweite Stelle) — die Sonde nach der Versiegelung nennt ihren Ausfall.

   `versiegeltVorhanden` (src/lib/ai.ts:517-530) entscheidet beim Start, ob der Klartext
   aus dem Speicher der Flaeche genommen werden darf: nur, wenn die Tuer denselben Schluessel
   schon versiegelt haelt. Antwortet die Tuer nicht, gilt "nicht versiegelt" - das ist die
   sichere Richtung (niemand wird ausgesperrt), aber sie war bis jetzt nicht von "die Tuer
   hat geantwortet und nichts versiegelt gefunden" zu unterscheiden.

   Dieselbe Klasse wie die drei Schnitte davor: 3.2.135 (die Sonde nach dem alten
   Schluessel), 3.2.136 (der Rueckweg der Verbindung) und 3.2.138 (der Umschlag). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hydrateAISettings } from "../../src/lib/ai";

const SITZUNGS_NAME = "aiVerbindung";
const MUSTER = /sealing check did not answer/i;
const grund = () => vi.mocked(console.warn).mock.calls.map((c) => String(c[0]));
const meldet = () => grund().some((z) => MUSTER.test(z));

/** Eine Sitzung, die den Klartext noch selbst traegt - nur dann fragt der Start die Sonde. */
function sitzungMitKlartext() {
  localStorage.setItem(SITZUNGS_NAME, JSON.stringify({ providerId: "openai", model: "gpt-4o-mini", apiKey: "sk-geheim" }));
}

function antwortAufSettings(status: number, leib: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(leib ?? {}), { status })));
}

beforeEach(() => {
  localStorage.clear();
  sitzungMitKlartext();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("#31: die Versiegelungs-Sonde nennt, wenn sie nicht fragen konnte", () => {
  it("meldet die abgewiesene Tuer mit ihrer Zahl", async () => {
    antwortAufSettings(500, { error: "storage unreadable" });
    const s = await hydrateAISettings();
    expect(s.apiKey, "die sichere Richtung bleibt: der Klartext wird nicht fortgenommen").toBe("sk-geheim");
    expect(meldet(), `kein Grund im Protokoll; Protokoll: ${JSON.stringify(grund())}`).toBe(true);
    expect(grund().join(" ").includes("HTTP 500"), `keine Zahl im Grund: ${JSON.stringify(grund())}`).toBe(true);
  });

  it("meldet dieselbe Sonde, wenn die Tuer gar nicht erreichbar ist", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("connection refused"); }));
    const s = await hydrateAISettings();
    expect(s.apiKey).toBe("sk-geheim");
    expect(meldet(), `kein Grund im Protokoll; Protokoll: ${JSON.stringify(grund())}`).toBe(true);
  });

  it("nennt nichts, wenn die Tuer sauber antwortet und nichts versiegelt hat — die Kontrolle", async () => {
    antwortAufSettings(200, {});
    const s = await hydrateAISettings();
    expect(s.apiKey).toBe("sk-geheim");
    expect(grund()).toEqual([]);
  });
});
