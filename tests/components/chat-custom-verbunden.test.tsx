// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Chat } from "../../src/components/Chat";
import { ToastProvider } from "../../src/components/ui/Toast";
import { saveAISettings } from "../../src/lib/ai";

// Aufgabe #43, am AUSGELIEFERTEN Objekt gemessen (BELEG-3.2.124.md §8): der Anbieter
// "Custom endpoint (OpenAI-compatible)" verspricht vLLM, Jan, GPT4All — aber der Chat-Kopf
// blieb auf "No AI connected" und der Send-Knopf zu, obwohl Adresse und Modell gesetzt
// waren und dieselbe Adresse durch die eigne Tuer antwortete.
//
// Grund, gelesen: Chat.tsx:147-150 fragt detectLocalAIs() und vergleicht dann
// `found.find(d => d.id === cur.id)` — detectLocalAIs kennt genau zwei Haefen
// (profile.ts:127 Ollama, :128 LM Studio). Fuer jeden andern kein-Key-Anbieter ist
// match damit immer undefined, localReachable immer false, und
// resolveAIConnection (ai.ts:650-653) verweigert "connected". Die Tuer entscheidet
// laengst anders (chat.ts:216: ein lokaler Endpunkt braucht keinen Schluessel), und
// Settings.tsx:310 nennt dieselbe Regel schon richtig.
//
// Diese Pruefung haelt BEIDE Seiten: ein erreichbarer Custom-Endpunkt muss verbinden,
// ein unerreichbarer muss es bleiben — sonst ist die Heilung nur ein groezigerer Default.

const ADRESSE = "http://127.0.0.1:4001/v1";

type Antwort = { ok: boolean; koerper?: unknown; status?: number };

function stubFetch({ modelListe, erreichbar }: { modelListe?: string[]; erreichbar: boolean }) {
  const anfragen: { url: string; body?: unknown }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    anfragen.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    // Die beiden festen Haefen antworten NICHT — genau die Lage eines vLLM-Nutzers.
    if (/localhost:11434|localhost:1234/.test(url)) throw new TypeError("fetch failed");
    if (url.includes("/api/models")) {
      if (!erreichbar) {
        // Genau die Form, die die Tuer liefert, wenn der Anbieter nicht antwortet
        // (server/router/chat.ts:233-239): 502, grund "anbieter-nicht-erreichbar".
        return new Response(JSON.stringify({ error: "der Anbieter antwortet nicht auf http://127.0.0.1:4001/models (ECONNREFUSED)", grund: "anbieter-nicht-erreichbar", url: "http://127.0.0.1:4001/models" }), { status: 502 });
      }
      return new Response(JSON.stringify({ models: modelListe ?? ["stub-modell"] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("/api/search")) return new Response(JSON.stringify({}), { status: 200 });
    const antwort: Antwort = { ok: true, koerper: {} };
    return new Response(JSON.stringify(antwort.koerper), { status: 200 });
  }));
  return anfragen;
}

async function zeigeCustomVerbindung(erreichbar: boolean) {
  saveAISettings({ providerId: "custom", apiKey: "", baseUrl: ADRESSE, model: "stub-modell" });
  const anfragen = stubFetch({ erreichbar });
  const view = render(<ToastProvider><Chat activeMemories={[]} /></ToastProvider>);
  return { ...view, anfragen };
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Ein kein-Key-Anbieter, der nicht Ollama oder LM Studio heisst", () => {
  it("verbindet, wenn die gesetzte Adresse durch die eigne Tuer antwortet", async () => {
    const { container, anfragen } = await zeigeCustomVerbindung(true);
    await waitFor(() => {
      const kopf = container.textContent || "";
      expect(kopf).not.toMatch(/No AI connected/);
    }, { timeout: 8000 });
    expect(container.textContent).toMatch(/stub-modell/);
    // Und die Frage ist wirklich an die gesetzte Adresse gegangen, nicht an einen Hafen.
    const modelAnfrage = anfragen.find((a) => a.url.includes("/api/models"));
    expect(modelAnfrage?.body).toMatchObject({ baseUrl: ADRESSE });
  });

  it("verbindet nicht, wenn die gesetzte Adresse nicht antwortet — und sagt warum", async () => {
    const { container } = await zeigeCustomVerbindung(false);
    await waitFor(() => expect(container.textContent).toMatch(/No AI connected/), { timeout: 8000 });
    // Die kurze Absage von vorhin war halb: sie verneinte, ohne Grund und ohne Weg.
    expect(container.textContent).toMatch(/Your endpoint is not answering/);
    expect(container.textContent).toMatch(/Settings/);
  });

  it("nennt den Grund, wenn die Adresse antwortet, aber keine Modelle-liste liefert", async () => {
    saveAISettings({ providerId: "custom", apiKey: "", baseUrl: ADRESSE, model: "stub-modell" });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (/localhost:11434|localhost:1234/.test(url)) throw new TypeError("fetch failed");
      if (url.includes("/api/models")) {
        return new Response(JSON.stringify({ error: "der Anbieter lehnt ab", grund: "antwort-nicht-lesbar" }), { status: 500 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }));
    const { container } = render(<ToastProvider><Chat activeMemories={[]} /></ToastProvider>);
    await waitFor(() => expect(container.textContent).toMatch(/No AI connected/), { timeout: 8000 });
    expect(container.textContent).toMatch(/did not send a model list/);
  });

  it("der Send-Knopf ist offen, wenn die Adresse antwortet", async () => {
    const { container } = await zeigeCustomVerbindung(true);
    await waitFor(() => expect(container.textContent).not.toMatch(/No AI connected/), { timeout: 8000 });
    const user = userEvent.setup();
    const feld = screen.getByPlaceholderText(/write a message/i);
    await user.type(feld, "Zeig mir eine Notiz");
    const send = [...container.querySelectorAll("button")].find((b) => /^(send)$/i.test((b.getAttribute("aria-label") || b.textContent || "").trim()));
    expect(send, "kein Send-Knopf gefunden").toBeTruthy();
    expect((send as HTMLButtonElement).disabled).toBe(false);
  });

  it("laesst Ollama und LM Studio beim alten Weg — die zwei Haefen werden weiter erkannt", async () => {
    saveAISettings({ providerId: "ollama", apiKey: "", baseUrl: "http://localhost:11434/v1", model: "llama3.2:3b" });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/tags")) {
        return new Response(JSON.stringify({ models: [{ name: "llama3.2:3b" }] }), { status: 200 });
      }
      if (url.includes("localhost:1234")) throw new TypeError("fetch failed");
      if (url.includes("/api/models")) return new Response(JSON.stringify({ models: ["llama3.2:3b"] }), { status: 200 });
      return new Response(JSON.stringify({}), { status: 200 });
    }));
    const { container } = render(<ToastProvider><Chat activeMemories={[]} /></ToastProvider>);
    await waitFor(() => expect(container.textContent).toMatch(/llama3\.2:3b/), { timeout: 8000 });
    expect(container.textContent).not.toMatch(/No AI connected/);
  });
});
