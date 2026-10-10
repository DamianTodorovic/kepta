// @vitest-environment jsdom
// Die Ausnahme, die niemand stillschweigend erleben darf: eine Installation
// ohne Verschluesselung hat keinen Verschluss, also kann die App den
// Schluessel nicht halten. Dann sagt die Maske das, statt den Nutzer nach dem
// Neustart ratlos vor einem leeren Feld stehen zu lassen.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { Settings } from "../../src/components/Settings";
import { hydrateAISettings, saveAISettings } from "../../src/lib/ai";
import { kiRouten } from "../helfer/ki-routen";

const schluessel = "sk-ant-F13-OFFEN-4f2a";
const verbindung = {
  providerId: "anthropic",
  apiKey: schluessel,
  baseUrl: "https://api.anthropic.com",
  model: "claude-sonnet-4-20250514",
};

function feld(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input[type="password"]') as HTMLInputElement;
}

let kern: ReturnType<typeof kiRouten>;

beforeEach(() => {
  localStorage.clear();
  kern = kiRouten(true, null); // keine Verschluesselung, also kein Verschluss
  vi.stubGlobal("fetch", kern.anfrage);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("Settings ohne Verschluss", () => {
  it("warnt, statt den Schluessel still in dieser Sitzung zu behalten", async () => {
    await saveAISettings(verbindung);
    const { container } = render(<Settings />);
    await vi.waitFor(() => expect(container.textContent).toMatch(/cannot be sealed/i));
    expect(container.textContent).toMatch(/entered again after a restart/i);
  });

  it("schreibt den Schluessel nirgends hin, wo die Route ihn hergeben wuerde", async () => {
    await saveAISettings(verbindung);
    expect(JSON.stringify(kern.bestand)).not.toContain(schluessel);

    localStorage.clear();
    const s = await hydrateAISettings();
    expect(s.apiKey).toBe("");
    expect(s.model).toBe("claude-sonnet-4-20250514"); // die Verbindung bleibt, der Schluessel nicht
    const { container } = render(<Settings />);
    expect(feld(container).value).toBe("");
  });
});
