// @vitest-environment jsdom
// Aufgabe #93 (24.10.): die Sperre lag unter dem Rand (top 721 / unten 859 bei 840 px,
// Scroll-Kasten endet 721) - der Klick auf Senden tat sichtbar nichts. Der Alarm haengt jetzt
// sticky am Fuss der Nachrichtenflaeche und ist damit in jeder Fensterbreite im Bild.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Chat } from "../../src/components/Chat";
import { ToastProvider } from "../../src/components/ui/Toast";
import { PROVIDERS, saveAISettings } from "../../src/lib/ai";

const FERN = "https://api.openai.com/v1";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch);
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("P4-93: die Sperre ist sichtbar", () => {
  it("der Alarm steht sticky am Fuss der Nachrichtenflaeche", async () => {
    const a = PROVIDERS.find((p) => p.needsKey)!;
    saveAISettings({ providerId: a.id, apiKey: "", baseUrl: FERN, model: a.defaultModel });
    render(<ToastProvider><Chat activeMemories={[]} /></ToastProvider>);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/Write a message/i), "hallo");
    await user.click(screen.getByLabelText("Send"));
    const alarm = await screen.findByRole("alert");
    expect(alarm.getAttribute("data-fix")).toBe("sperre-sichtbar");
    // jsdom hat keinen Tailwind-Build - geprueft wird die Klasse, die die Lage traegt;
    // die gemessene Lage (1440/1024/820/390) steht im Beleg am ausgelieferten Objekt.
    const klassen = alarm.className;
    expect(klassen, "ohne sticky liegt der Alarm wieder unter dem Rand").toContain("sticky");
    expect(klassen).toContain("bottom-0");
    await waitFor(() => expect(alarm.textContent).toMatch(/Quick setup/i));
  });
});
