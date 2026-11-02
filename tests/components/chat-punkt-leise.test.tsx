// @vitest-environment jsdom
// Punkt 2, 2.11. — derselbe Zustand, derselbe Sitz.
//
// Der Chat-Kopf malt seinen Verbindungsunkt aus einer Klasse, seit 3.2.111: die Ruhe heisst
// `status-dot-leise` (in `src/index.css`), weil die Index-Zeile dieselbe Ruhe braucht, wenn die
// eigne Tuer nicht antwortet. Vorher stand derselbe Satz zweimal im Baum — hier als Handarbeit
// (`style={{ background: "var(--text-3)", boxShadow: "none" }}`), dort als Klasse. Zwei
// Ausfuehrungen eines Zustands sind die Hausform von #8 und #94, nur fuer die Farbe.
//
// Diese Datei haelt beide Seiten und die Kopie:
//   1. verbunden -> der gruene Sitz, ohne die Ruhe-Klasse;
//   2. getrennt  -> derselbe Sitz ruft die Ruhe-Klasse;
//   3. Gegenprobe -> und nirgends wird die Ruhe von Hand als Inline-Stil gemalt. Ein Handwerker,
//      der den Stil zurueckschreibt, faellt hier durch.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { Chat } from "../../src/components/Chat";
import { ToastProvider } from "../../src/components/ui/Toast";
import { PROVIDERS, saveAISettings } from "../../src/lib/ai";
import type { Memory } from "../../src/types";

const LOKAL = "http://127.0.0.1:1234/v1";
const FERN = "https://api.openai.com/v1";
const HEIMISCH = /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i;

function note(): Memory {
  return { id: "m1", userId: "local", title: "Notiz", content: "Inhalt", tags: [], type: "semantic", createdAt: 1, updatedAt: 1 };
}

/** Die Wand: relativ oder heimisch darf raus, alles andre reisst. Antworten sind Attrappen. */
function wand() {
  vi.stubGlobal("fetch", vi.fn(async (ziel: string | URL) => {
    const text = typeof ziel === "string" ? ziel : String((ziel as { href?: string })?.href ?? ziel);
    if (!(text.startsWith("/") || HEIMISCH.test(text))) throw new Error(`netzoeffnung verboten - die Wand hat ${text} gefangen`);
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch);
}

function zeigeMit(baseUrl: string, schluessel: string) {
  const a = PROVIDERS.find((p) => p.needsKey)!;
  saveAISettings({ providerId: a.id, apiKey: schluessel, baseUrl, model: a.defaultModel });
  return render(<ToastProvider><Chat activeMemories={[note()]} /></ToastProvider>).container;
}

/** Der Punkt am Marken-Kaefen: das Kind, das die Zustandsklasse traegt. */
function punkt(container: HTMLElement) {
  return container.querySelector(".status-dot") as HTMLElement | null;
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

describe("Punkt 2: der Verbindungsunkt malt seinen Zustand aus einer Klasse", () => {
  it("Connected: der gruene Sitz steht, die Ruhe ist nicht gerufen", () => {
    const p = punkt(zeigeMit(LOKAL, ""));
    expect(p, "der Punkt fehlt im verbundenen Zustand").toBeTruthy();
    expect(p!.classList.contains("status-dot"), "die Grundklasse fehlt").toBe(true);
    expect(p!.classList.contains("status-dot-leise"), `verbunden darf nicht leise sein: ${p!.className}`).toBe(false);
  });

  it("getrennt: derselbe Sitz ruft die Ruhe-Klasse", () => {
    const p = punkt(zeigeMit(FERN, ""));
    expect(p, "der Punkt fehlt im getrennten Zustand").toBeTruthy();
    expect(p!.classList.contains("status-dot-leise"), `getrennt malt nicht leise: ${p!.className}`).toBe(true);
  });

  it("Gegenprobe: die Ruhe wird nirgends von Hand als Inline-Stil gemalt", () => {
    for (const [base, schluessel] of [[LOKAL, ""], [FERN, ""]] as const) {
      const p = punkt(zeigeMit(base, schluessel));
      expect(p, `kein Punkt bei ${base}`).toBeTruthy();
      expect(p!.style.background, `Handarbeit statt Klasse bei ${base}: ${p!.getAttribute("style")}`).toBe("");
      expect(p!.style.boxShadow, `Handarbeit statt Klasse bei ${base}: ${p!.getAttribute("style")}`).toBe("");
    }
  });
});
