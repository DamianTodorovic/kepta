// @vitest-environment jsdom
// Aufgabe #60, Grund — zweiter Wurf des Zeugen: die Antwort ist jetzt eine WAND, keine Haube.
//
// Warum dieser Wurf noetig war (Leitung, 21.10. 08:17, und eigne Messung 08:19:54): die erste
// Fassung beantwortete in Zeile 50-52 JEDE Adresse mit 200 {} — ein Ferngriff waehre also
// gruen durchgegangen. Das ist eine Behuellung, keine Sperre, und der Name meines Koerpers
// verspricht das Gegenteil. Darum:
//   * die Wand notiert jeden Griff und **wirft**, bevor ein Socket geoeffnet wird, wenn der
//     Wirt nicht localhost / 127.0.0.1 ist (relative Wege gelten als die eigne Tuer);
//   * Fall 4 ist die **Selbstkontrolle der Wand**: ein bestellter Ferngriff muss reissen und
//     muss im Protokoll der Wand stehen. Eine Wand, die nichts fasst, ist kein Zeuge;
//   * jede Fall-Linie verlangt zusaetzlich, dass die Wand **nichts** Fernes notiert hat;
//   * in der Grube laeuft zusaetzlich ein zweites Instrument auf Socket-Ebene
//     (wand-socket.setup.mjs, nur in der Grube, nicht im Koerper): es haelt jeden nicht-lokalen
//     connect an und wirft am Laufende — der gruene Lauf ist damit auch ein Netzzeuge.
//
// Befund am committeten Stand (Zeiten und Pfade im Landes-Beleg): die Hafen-Adressen stehen in
// src/lib/profile.ts:127 und :128, die Schleife ist :130, der Nachzug durch die eigne Tuer ist
// :151. In src/components/Chat.tsx steht keine Adresse; die Stelle :112-130 ist der LESER.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Chat } from "../../src/components/Chat";
import { ToastProvider } from "../../src/components/ui/Toast";
import { PROVIDERS, saveAISettings } from "../../src/lib/ai";
import type { Memory } from "../../src/types";

let zaehler = 0;
function note(): Memory {
  zaehler++;
  return {
    id: `m${zaehler}`, userId: "local", title: `Notiz ${zaehler}`, content: `Inhalt ${zaehler}`,
    tags: [], type: "semantic", createdAt: 1, updatedAt: 1,
  };
}

let urls: string[] = [];
let fern: string[] = [];
const HEIMISCH = /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i;
/** Der Weg ist relativ, wenn er mit "/" beginnt: das ist die eigne Tuer, nicht die Ferne. */
function istHeimisch(ziel: string) {
  return ziel.startsWith("/") || HEIMISCH.test(ziel);
}

/** Die WAND: notieren, dann sperren — nie beantworten. */
function wand() {
  urls = [];
  fern = [];
  vi.stubGlobal("fetch", vi.fn(async (ziel: string | URL, init?: RequestInit) => {
    const text = typeof ziel === "string" ? ziel : String((ziel as { href?: string })?.href ?? ziel);
    urls.push(text);
    if (!istHeimisch(text)) {
      fern.push(text);
      throw new Error(`netzoeffnung verboten — die Wand hat ${text} gefangen`);
    }
    // Die Haefen antworten, als waren sie da: geprueft wird die ANFRAGE, nicht die Antwort.
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch);
}
const HAFEN = (liste: string[]) => liste.filter((u) => u.includes("localhost:11434") || u.includes("localhost:1234") || u.includes("127.0.0.1:11434") || u.includes("/api/models"));

function zeige() {
  return render(<ToastProvider><Chat activeMemories={[note(), note()]} /></ToastProvider>);
}
const schluesselAnbieter = () => PROVIDERS.find((p) => p.needsKey)!;
const lokaleAnbieter = () => PROVIDERS.find((p) => p.id === "ollama")!;

beforeEach(() => {
  localStorage.clear();
  wand();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("P4-60 Grund: die Hafen-Frage folgt dem Schalter, und nichts geht ins Netz", () => {
  it("Schluessel-Anbieter ohne Schluessel: beim Aufbau wird kein Hafen angeplopft", async () => {
    const a = schluesselAnbieter();
    saveAISettings({ providerId: a.id, apiKey: "", baseUrl: a.baseUrl, model: a.defaultModel });
    zeige();
    await new Promise((r) => setTimeout(r, 30));
    expect(fern, "die Wand sah nichts Fernes").toEqual([]);
    expect(HAFEN(urls), `kein unbestellter Hafen-Griff, gesehen in: ${JSON.stringify(urls)}`).toEqual([]);
  });

  it("Kein-Schluessel-Anbieter: der Hafen wird sehr wohl befragt", async () => {
    const a = lokaleAnbieter();
    saveAISettings({ providerId: a.id, apiKey: "", baseUrl: a.baseUrl, model: a.defaultModel });
    zeige();
    await waitFor(() => expect(HAFEN(urls).length, "die Reichweite des gewaehlten lokalen Anbieters muss geprueft werden").toBeGreaterThan(0));
    expect(urls.some((u) => u.includes("11434")), "Ollama ist der gewaehlte Anbieter").toBe(true);
    expect(fern, "auch hier: kein Griff ins Netz").toEqual([]);
  });

  it("Schluessel-Anbieter und ein Klick: erst jetzt darf die Liste laufen", async () => {
    const user = userEvent.setup();
    const a = schluesselAnbieter();
    saveAISettings({ providerId: a.id, apiKey: "", baseUrl: a.baseUrl, model: a.defaultModel });
    zeige();
    await new Promise((r) => setTimeout(r, 20));
    expect(HAFEN(urls), "vor dem Klick: keine Frage, kein Griff").toEqual([]);
    await user.click(screen.getByRole("button", { name: /Look for a local model/i }));
    await waitFor(() => expect(HAFEN(urls).length, "nach dem Klick: der Griff ist bestellt").toBeGreaterThan(0));
    expect(fern, "und trotzdem bleibt alles zuhaus").toEqual([]);
  });

  it("die Wand zubeisst: ein bestellter Ferngriff reisst und wird notiert", async () => {
    let warf = "";
    try {
      await fetch("https://api.openai.com/v1/models");
    } catch (fehler: unknown) {
      warf = String(fehler instanceof Error ? fehler.message : fehler);
    }
    expect(warf, "die Wand muss einen Ferngriff abweisen, sonst ist ihr Schweigen wertlos").toContain("netzoeffnung verboten");
    expect(fern, "und sie muss ihn sehen").toEqual(["https://api.openai.com/v1/models"]);
  });
});
