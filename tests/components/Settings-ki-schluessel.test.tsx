// @vitest-environment jsdom
// Was ein Mensch sieht, wenn er die App schliesst und wieder oeffnet: das
// KI-Feld ist gefuellt, und der Hinweis sagt ehrlich, wo der Schluessel liegt.
// (Der Fall ohne Verschluss steht in Settings-ki-schluessel-offen.test.tsx —
// der Verschluss wird pro Sitzung geholt, die beiden Faelle brauchen je eine
// eigene Installation.)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { Settings } from "../../src/components/Settings";
import { hydrateAISettings, saveAISettings } from "../../src/lib/ai";
import { kiRouten } from "../helfer/ki-routen";

const schluessel = "sk-ant-F13-SICHTBAR-4f2a";
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
  kern = kiRouten();
  vi.stubGlobal("fetch", kern.anfrage);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("Settings nach dem Neustart", () => {
  it("zeigt das KI-Feld gefuellt, ohne dass jemand etwas eingetippt hat", async () => {
    await saveAISettings(verbindung);

    localStorage.clear(); // der Neustart: neue Port, neuer Origin, leerer Speicher
    await hydrateAISettings(); // so faehrt die App die Verbindung beim Start

    const { container } = render(<Settings />);
    expect(feld(container).value).toBe(schluessel);
    const modell = container.querySelector('input[list="model-list"]') as HTMLInputElement;
    expect(modell.value).toBe("claude-sonnet-4-20250514");
  });

  it("zieht nach, wenn jemand die Einstellungen vor der Rehydrierung aufmacht", async () => {
    await saveAISettings(verbindung);
    localStorage.clear(); // der Neustart
    const { container } = render(<Settings />); // jemand klickt sofort in die Einstellungen

    await vi.waitFor(() => expect(feld(container).value).toBe(schluessel), { timeout: 5000 });
  });

  it("sagt, wo der Schluessel liegt — und dass die Einstellungs-Route ihn nicht hergibt", async () => {
    await saveAISettings(verbindung);
    localStorage.clear();
    await hydrateAISettings();

    const { container } = render(<Settings />);
    await vi.waitFor(() => expect(container.textContent).toMatch(/macOS Keychain/));
    expect(container.textContent).toMatch(/never returned/i);
  });
});
