// @vitest-environment jsdom
// Aufgabe #8 (24.10., Kopf 53e2520): ein Wert, den zwei Stellen verschiedentlich lesen.
//
// Die Tuer braucht fuer eine FERNE Adresse einen Schluessel, fuer eine lokale nicht
// (server/router/chat.ts:46, istLokaleAdresse). Die Flaeche las bis heute nur
// "needsKey && !apiKey" (Chat.tsx:446) und verweigerte damit den lokalen Endpunkt, den die
// Tuer annimmt; die Zustands-Tafel behauptete dazu "No key yet" (SystemStatus.tsx:131/227).
// Dieser Fall haelt beide Seiten: derselbe Wert (lokale Adresse, leerer Schluessel) muss
// gleich gelesen werden, und die Ferne muss weiter sperren.
//
// Rot vor dem Flicken: die lokale Anfrage geht nicht raus, die Quick-Setup-Meldung steht da.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Chat } from "../../src/components/Chat";
import { ToastProvider } from "../../src/components/ui/Toast";
import { PROVIDERS, saveAISettings } from "../../src/lib/ai";
import type { Memory } from "../../src/types";

const LOKAL = "http://127.0.0.1:1234/v1"; // LM Studio / ein lokaler OpenAI-kompatibler Hafen
const FERN = "https://api.openai.com/v1";
const HEIMISCH = /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i;

let urls: string[] = [];
let fern: string[] = [];

function note(): Memory {
  return { id: "m1", userId: "local", title: "Notiz", content: "Inhalt", tags: [], type: "semantic", createdAt: 1, updatedAt: 1 };
}

/** Die Wand: relativ = eigne Tuer, heimisch = erlaubt, alles andre reisst. Antworten sind Attrappen. */
function wand() {
  urls = [];
  fern = [];
  vi.stubGlobal("fetch", vi.fn(async (ziel: string | URL) => {
    const text = typeof ziel === "string" ? ziel : String((ziel as { href?: string })?.href ?? ziel);
    urls.push(text);
    const heimisch = text.startsWith("/") || HEIMISCH.test(text);
    if (!heimisch) { fern.push(text); throw new Error(`netzoeffnung verboten - die Wand hat ${text} gefangen`); }
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch);
}

function zeige() {
  return render(<ToastProvider><Chat activeMemories={[note()]} /></ToastProvider>);
}
const schluesselAnbieter = () => PROVIDERS.find((p) => p.needsKey)!;

async function sende(text: string) {
  const user = userEvent.setup();
  const feld = screen.getByPlaceholderText(/Write a message/i) as HTMLTextAreaElement;
  await user.type(feld, text);
  await user.click(screen.getByLabelText("Send"));
  await new Promise((r) => setTimeout(r, 120));
}

beforeEach(() => {
  localStorage.clear();
  wand();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Aufgabe #8: lokale Adresse und leerer Schluessel werden gleich gelesen", () => {
  it("lokaler Endpunkt ohne Schluessel: die Anfrage geht raus, kein Quick-Setup-Satz", async () => {
    const a = schluesselAnbieter();
    saveAISettings({ providerId: a.id, apiKey: "", baseUrl: LOKAL, model: a.defaultModel });
    zeige();
    await sende("hallo");
    expect(urls.some((u) => u.includes("/api/chat/stream")), "die Tuer nimmt diesen Endpunkt an - die Flaeche muss fragen, nicht verweigern; gesehen: " + JSON.stringify(urls)).toBe(true);
    expect(screen.queryByText(/Quick setup/i), "der Quick-Setup-Satz steht noch auf dem Schirm").toBeNull();
    expect(fern, "und nichts geht ins Netz").toEqual([]);
  });

  it("KONTROLLE: ferner Endpunkt ohne Schluessel sperrt weiter, bevor etwas rausgeht", async () => {
    const a = schluesselAnbieter();
    saveAISettings({ providerId: a.id, apiKey: "", baseUrl: FERN, model: a.defaultModel });
    zeige();
    await sende("hallo");
    expect(urls.some((u) => u.includes("/api/chat/stream")), "ohne Schluessel darf die ferne Anfrage nicht raus").toBe(false);
    await waitFor(() => expect(screen.getByText(/Quick setup/i)).toBeTruthy());
    expect(fern, "die Sperre greift vor jedem Socket").toEqual([]);
  });
});
