// @vitest-environment jsdom
// Punkt 4 und 7, 2.11. — die Chat-Flaeche behauptet zwei Zustande zugleich.
//
// Beide Erstleser des gemalten Korpus (P7-LESE-TEST-0211.md) meldeten denselben Satz,
// unabhaengig voneinander: oben steht "No AI connected", darunter "Ready". Leser 1: "Which is
// true?" — Leser 2: "I cannot tell if typing does anything."
//
// Die Wurzel liegt in Chat.tsx:908: "Ready" wird allein davon gemalt, dass die **Nachrichtenliste
// leer** ist. Das Wort meint "noch keine Unterhaltung", der Leser versteht es als "die KI ist
// erreichbar" — weil genau darueber dasselbe Fenster steht, das Gegenteil behauptet. Es ist
// derselbe Defekt wie 3.2.111 (ein Wort, das an keinen Zustand gebunden ist), nur in der andern
// Richtung: hier ist das Wort an einen Zustand gebunden, aber an den falschen.
//
// Diese Datei haelt drei Seiten: das Faehigkeitswort darf nicht mehr gemalt werden, der Zustand
// muss beim Namen genannt sein, und die eigne Verbindung darf nur einmal behauptet werden.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { Chat } from "../../src/components/Chat";
import { ToastProvider } from "../../src/components/ui/Toast";
import { PROVIDERS, saveAISettings } from "../../src/lib/ai";
import type { Memory } from "../../src/types";

const FERN = "https://api.openai.com/v1";
const HEIMISCH = /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i;

function notiz(i: number): Memory {
  return {
    id: `m${i}`, userId: "local", title: `Frist ${i}`, content: `Die Frist ${i} haelt die Kasse.`,
    tags: ["saat"], type: "semantic", createdAt: Date.parse("2025-01-01"), updatedAt: Date.parse("2025-01-01"),
  };
}
const SEITE = Array.from({ length: 5 }, (_, i) => notiz(i + 1));

function wand() {
  vi.stubGlobal("fetch", vi.fn(async (ziel: string | URL) => {
    const text = typeof ziel === "string" ? ziel : String((ziel as { href?: string })?.href ?? ziel);
    if (!(text.startsWith("/") || HEIMISCH.test(text))) throw new Error(`netzoeffnung verboten - die Wand hat ${text} gefangen`);
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch);
}

/**
 * Blatt-Text mit Trennern. `container.textContent` klebt benachbarte Elemente ohne jede
 * Luecke zusammen — "…Out ~—ReadyAsk something…" — und ein Muster mit Wortgrenze
 * (`/\bReady\b/`) findet darin **nie** etwas: eine Pruefung, die per Konstruktion nicht
 * schlagen kann (Hausform vom 19.10.). Also wird pro Blattknoten gelesen und mit Strichen
 * verbunden, damit eine Grenze eine Grenze ist.
 */
function zeilen(container: HTMLElement) {
  return [...container.querySelectorAll("*")]
    .filter((e) => e.children.length === 0 && (e.textContent || "").trim().length > 0)
    .map((e) => (e.textContent || "").replace(/\s+/g, " ").trim())
    .join(" | ");
}

/** Ein leeres Gespraech an einer fernen Adresse ohne Schluessel — der Zustand, den beide Leser sahen. */
async function zeigeOhneVerbindung() {
  const anbieter = PROVIDERS.find((p) => p.needsKey)!;
  saveAISettings({ providerId: anbieter.id, apiKey: "", baseUrl: FERN, model: anbieter.defaultModel });
  const { container } = render(<ToastProvider><Chat activeMemories={SEITE} /></ToastProvider>);
  await waitFor(() => expect(container.textContent).toMatch(/No AI connected/i));
  return zeilen(container);
}

beforeEach(() => {
  localStorage.clear();
  wand();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Punkt 4 und 7: die Chat-Flaeche behauptet einen Zustand, nicht zwei", () => {
  it("malt kein Faehigkeitswort, waehrend die Verbindung abgesagt ist", async () => {
    const text = await zeigeOhneVerbindung();
    expect(text, `"Ready" sagt etwas zu, was derselbe Schirm zwei Zeilen weiter absagt: ${text.slice(0, 300)}`)
      .not.toMatch(/\bReady\b/);
  });

  it("nennt den Zustand des leeren Gespraechs beim Namen", async () => {
    const text = await zeigeOhneVerbindung();
    expect(text, `das leere Gespraech hat keine eigene Zeile: ${text.slice(0, 300)}`)
      .toMatch(/No questions yet/i);
  });

  it("sagt die Verbindung genau einmal", async () => {
    const text = await zeigeOhneVerbindung();
    const n = (text.match(/no AI connected/gi) || []).length;
    expect(n, `derselbe Zustand wird mehrfach behauptet (${n} mal): ${text.slice(0, 300)}`).toBe(1);
  });

  it("liest die erste Blase des leeren Gespraechs (P202, Mockup .nachricht)", async () => {
    const anbieter = PROVIDERS.find((p) => p.needsKey)!;
    saveAISettings({ providerId: anbieter.id, apiKey: "", baseUrl: FERN, model: anbieter.defaultModel });
    const { container } = render(<ToastProvider><Chat activeMemories={SEITE} /></ToastProvider>);
    await waitFor(() => expect(container.textContent).toMatch(/No questions yet/));
    // P202, Mockup-Grammatik: der Leerauftritt ist die erste K3PTA-Blase — die
    // Vorschlags-Pillen flogen, die Blase sagt, was sie liest.
    const blasen = container.querySelector(".nachricht .blasen");
    expect(blasen, "die Blase fehlt im Leerauftritt").toBeTruthy();
    expect(blasen!.textContent || "").toMatch(/I read only the notes you connected/);
  });
});
