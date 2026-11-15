// @vitest-environment jsdom
// Aufgabe #92 (24.10.), Client-Seite: die Stream-Route schickt jetzt Satz und Kennung; die
// Flaeche uebersetzt die Kennung (tuergrund) und zeigt nie den Ausnahmenamen.
// Rot vor dem Flicken: der Alarm trug woertlich "fetch failed".
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Chat } from "../../src/components/Chat";
import { ToastProvider } from "../../src/components/ui/Toast";
import { PROVIDERS, saveAISettings } from "../../src/lib/ai";

const LOKAL = "http://127.0.0.1:1234/v1";
const SSE = 'data: {"error":"fetch failed","grund":"anbieter-nicht-erreichbar"}\n\ndata: [DONE]\n\n';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async (ziel: string | URL) => {
    const text = typeof ziel === "string" ? ziel : String((ziel as { href?: string })?.href ?? ziel);
    if (text.includes("/api/chat/stream")) return new Response(SSE, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch);
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("P4-92: der Grund der Tuer im Stream, nie der Ausnahmename", () => {
  it("zeigt den Satz der Kennung statt 'fetch failed'", async () => {
    const a = PROVIDERS.find((p) => p.needsKey)!;
    saveAISettings({ providerId: a.id, apiKey: "", baseUrl: LOKAL, model: a.defaultModel });
    render(<ToastProvider><Chat activeMemories={[]} /></ToastProvider>);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/Write a message/i), "hallo");
    await user.click(screen.getByLabelText("Send"));
    const alarm = await screen.findByRole("alert");
    expect(alarm.textContent).not.toContain("fetch failed");
    expect(alarm.textContent).toMatch(/model service did not answer/i);
  });
});
