// @vitest-environment jsdom
// Schlag 22.10. nacht (NACHTBRIEF-3238-2210.md, Punkt 4): die Flaeche prefillt eine Wolkenadresse,
// obwohl die Tuer ablehnt (#67). Gemessen am Kopf 638e95f, 22:33:19 MESZ: das Endpunkt-Feld stand
// auf https://api.openai.com/v1, und der Klick auf "Load" schickte genau diese Basis an die Tuer,
// ohne dass jemand einen Anbieter gewaehlt haette. Der Grund sitzt an vier Stellen, die sich die
// Katalogadresse leihen: src/lib/ai.ts:345-351 (Werksstandard) und
// `settings.baseUrl || provider.baseUrl` in src/components/Settings.tsx:252, :309, :354, :476
// sowie src/components/Chat.tsx:491 und :537.
//
// Latte des Briefs - jeder Schalter hat seinen Leser, und der Leser ist eine Zeile:
//   Anbieter-Select   schreibt Settings.tsx:424 selectProvider - lesen Settings.tsx:250 (provider),
//                     :252 (adresseLokal), Chat.tsx:126 (Hafen-Tor), :444 (Vorpruefung),
//                     ai.ts:539 resolveAIConnection
//   API-Key-Feld      schreibt Settings.tsx:755 update({apiKey})  - lesen Settings.tsx:309, :354,
//                     :476 (Body), Chat.tsx:445 (Vorpruefung), :538 (Body), ai.ts:509
//   Endpunkt-Feld     schreibt Settings.tsx:778 update({baseUrl}) - lesen Settings.tsx:252, :309,
//                     :354, :476, Chat.tsx:491, :537
//   Modell-Feld       schreibt Settings.tsx:792 und :815          - lesen Chat.tsx:449, :539,
//                     ai.ts:540 (resolveAIConnection verlangt ein Modell)
//   "Load"-Knopf      schreibt Settings.tsx:467 loadModels         - lesen Settings.tsx:815 (Liste)
//                     und die Sonde bei :309/:354/:476
// Der Werksstandard war ein Schalter, den niemand legte, den aber alles las.
//
// Rein ASCII.
import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROVIDERS, loadAISettings, providerById, saveAISettings } from "../../src/lib/ai";

const HIER = path.dirname(fileURLToPath(import.meta.url));

const ALTE_TASTE = "ki_gehirn_ai_settings";

beforeEach(() => {
  localStorage.clear();
});

describe("P4-Nacht: der Werksstandard nennt keine Adresse, die niemand gewaehlt hat", () => {
  it("leerer Browserspeicher: keine Basis und kein Modell, Katalogzeile bleibt sichtbar", () => {
    const s = loadAISettings();
    expect(s.baseUrl, `Vorbelegung nennt eine Basis: ${JSON.stringify(s.baseUrl)}`).toBe("");
    expect(s.model, `Vorbelegung nennt ein Modell: ${JSON.stringify(s.model)}`).toBe("");
    expect(s.apiKey).toBe("");
    expect(PROVIDERS.some((p) => p.id === s.providerId), "die Zeile muss weiter ein Katalogeintrag sein").toBe(true);
  });

  it("kaputter Eintrag im Browserspeicher: immer noch keine Basis", () => {
    localStorage.setItem(ALTE_TASTE, "{ kaputt ]");
    expect(loadAISettings().baseUrl).toBe("");
  });

  it("ein gewaehlter Anbieter behaelt seine Adresse", () => {
    saveAISettings({ providerId: "openai", apiKey: "sk-test", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" });
    const s = loadAISettings();
    expect(s.baseUrl).toBe("https://api.openai.com/v1");
    expect(providerById(s.providerId).baseUrl).toBe("https://api.openai.com/v1");
  });

  it("keine Sendestelle leiht sich die Katalogadresse - Wache am Quelltext", () => {
    // Die expression `settings.baseUrl || provider.baseUrl` (Settings.tsx) und
    // `settingsLive.baseUrl || provLive.baseUrl` (Chat.tsx) war der Weg, auf dem die Katalogadresse
    // zurueckkam. Diese Wache ist ein Textbefund, kein Verhaltensbeweis - der Verhaltensbeweis
    // steht in tests/components/settings-werksstandard-ohne-wolke.test.tsx (Load sendet "").
    const quelle = (rel: string) => fs.readFileSync(path.resolve(HIER, "../..", rel), "utf8");
    const text = [quelle("src/components/Settings.tsx"), quelle("src/components/Chat.tsx")].join("\n");
    const leihen = (text.match(/settings(?:Live)?\.baseUrl \|\| prov(?:ider|Live)\.baseUrl/g) || []).length;
    expect(leihen, `${leihen} Stellen leihen sich weiter die Katalogadresse`).toBe(0);
  });

  it("die Tafel selbst bleibt unangetastet", () => {
    expect(PROVIDERS.find((p) => p.id === "openai")?.baseUrl).toBe("https://api.openai.com/v1");
    expect(PROVIDERS.find((p) => p.id === "ollama")?.needsKey).toBe(false);
  });
});
