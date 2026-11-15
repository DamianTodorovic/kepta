// @vitest-environment jsdom
// Aufgabe #67 und #60, zweiter Teil (Leitung, 22.10.): die Flaeche muss hoeren und zeigen,
// was die Tuer antwortet. Seit 4e49c17 antworten /api/chat und /api/chat/stream mit 400 und
// einem Grund-Feld (kein-anbieter, kein-schluessel), statt einen Socket zu oeffnen.
//
// Was am Kopf 4e49c17 gemessen ist (Punkt-4-Hand, 17:05:00):
//   - server/router/chat.ts:37-54 liefert { status: 400, error: <Satz>, grund: <Kennung> }.
//   - src/components/Chat.tsx:547-551 liest nur `j.error` und wirft `j.grund` weg; :1082-1088
//     malt den rohen Tuer-Satz in ein Banner ohne Rolle, also hoert ihn niemand.
//   - Ein Leser des Feldes `grund` an einer Tuer-Antwort existiert in src/ nirgends
//     (gemessen: grep "\.grund" src/ = 8 Treffer, alle fuer andere Grundlagen: Klassifikation,
//     Scan, Graph-Blende, Beispiel-Chips in Settings; keiner an einer chat- oder models-Antwort).
//
// Welche Grund die Flaeche ueberhaupt erreichen kann, ist ausgerechnet, nicht geraten:
//   - kein-anbieter: Provider "custom" (src/lib/ai.ts:188-193) mit leerer baseUrl - die Flaeche
//     schickt `settings.baseUrl || provider.baseUrl`, und beide sind dann leer. Erreichbar.
//   - kein-schluessel: Provider "custom" mit fremder baseUrl und leerem Schluessel (needsKey
//     false, also greift die eigne Vorpruefung in Chat.tsx:445 nicht). Erreichbar.
//   - Die Cloud-Provider mit Schluessel-Pflicht faengt Chat.tsx:445 vorher mit eigenem Text ab.
//
// Diese Datei ist rein ASCII; der Gedankenstrich des Tuer-Satzes steht als Flucht.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Chat } from "../../src/components/Chat";
import { ToastProvider } from "../../src/components/ui/Toast";
import { saveAISettings } from "../../src/lib/ai";
import type { Memory } from "../../src/types";

// Wortlich server/router/chat.ts:42 am Kopf 4e49c17.
const TUER_SATZ_KEIN_ANBIETER =
  "kein Anbieter gewaehlt \u2014 die Route rueft keine Adresse, die niemand genannt hat";

let zaehler = 0;
function note(): Memory {
  zaehler++;
  return {
    id: `m${zaehler}`, userId: "local", title: `Notiz ${zaehler}`, content: `Inhalt ${zaehler}`,
    tags: [], type: "semantic", createdAt: 1, updatedAt: 1,
  };
}

let wege: string[] = [];
function antwort(status: number, leib: unknown) {
  return new Response(JSON.stringify(leib), { status, headers: { "Content-Type": "application/json" } });
}

/** Die Tuer, die diese Flaeche hoert: 400 mit Kennung, kein Socket, kein Modell. */
function tuerMitSperre(grund: string, satz: string) {
  wege = [];
  vi.stubGlobal("fetch", vi.fn(async (ziel: string | URL, init?: RequestInit) => {
    const weg = typeof ziel === "string" ? ziel : String((ziel as { href?: string })?.href ?? ziel);
    wege.push(`${init?.method || "GET"} ${weg}`);
    if (weg.includes("/api/chat/stream")) return antwort(400, { error: satz, grund });
    if (weg.includes("/api/search")) return antwort(200, { results: [] });
    return antwort(200, {});
  }) as unknown as typeof fetch);
}

function zeige() {
  return render(<ToastProvider><Chat activeMemories={[note(), note()]} /></ToastProvider>);
}

async function frageStellen(frageText: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Chat input"), frageText);
  await user.click(screen.getByRole("button", { name: "Send" }));
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("P4-67: die Flaeche zeigt den Grund, den die Tuer nennt", () => {
  it("kein-anbieter: ein Satz in Menschensprache mit Weg, nicht der innere Text der Tuer", async () => {
    saveAISettings({ providerId: "custom", apiKey: "", baseUrl: "", model: "test-model" });
    tuerMitSperre("kein-anbieter", TUER_SATZ_KEIN_ANBIETER);
    zeige();
    await frageStellen("Was weiss die Flaeche");

    await waitFor(() => expect(screen.getByText("Error", { exact: false })).toBeTruthy());
    // Geprueft wird der Leib, den ein Mensch sieht: am Kopf steht die Ueberschrift "Error" in
    // einem div und der Satz der Tuer daneben - ein ausgesuchter Knoten waere kein Zeugnis.
    const text = document.body.textContent || "";

    // Die Tuer wurde gefragt - sonst ist das hier kein Quittungs-Lauf.
    expect(wege.some((w) => w.includes("/api/chat/stream")), `Tuerpfade: ${JSON.stringify(wege)}`).toBe(true);

    // 1) Der Grund muss in Menschenworten da stehen: was fehlt und wo es zu setzen ist.
    expect(text, `Bannerwortlaut: ${JSON.stringify(text)}`).toMatch(/no model provider|choose a provider|endpoint/i);
    expect(text, `Bannerwortlaut: ${JSON.stringify(text)}`).toContain("Settings");

    // 2) Der innere Satz der Tuer darf nicht unveraendert durchgereicht werden - er redet ueber
    //    Routen und Adressen, nicht ueber das, was ein Mensch als naechstes tun soll.
    expect(text).not.toContain("die Route rueft keine Adresse");
  });

  it("kein-schluessel: derselbe Anspruch an einer zweiten Kennung", async () => {
    saveAISettings({ providerId: "custom", apiKey: "", baseUrl: "https://model.example.com/v1", model: "test-model" });
    tuerMitSperre("kein-schluessel", `der Anbieter https://model.example.com/v1 braucht einen Schluessel \u2014 ohne ihn geht kein Paket aus dem Rechner`);
    zeige();
    await frageStellen("Und ohne Schluessel");

    await waitFor(() => expect(screen.getByText("Error", { exact: false })).toBeTruthy());
    // Geprueft wird der Leib, den ein Mensch sieht: am Kopf steht die Ueberschrift "Error" in
    // einem div und der Satz der Tuer daneben - ein ausgesuchter Knoten waere kein Zeugnis.
    const text = document.body.textContent || "";
    expect(text, `Bannerwortlaut: ${JSON.stringify(text)}`).toMatch(/api key|key/i);
    expect(text, `Bannerwortlaut: ${JSON.stringify(text)}`).toContain("Settings");
    expect(text).not.toContain("ohne ihn geht kein Paket");
  });

  it("die Quittung wird angesagt: Rolle alert, damit eine Bildschirmhilfe sie hoeren kann", async () => {
    saveAISettings({ providerId: "custom", apiKey: "", baseUrl: "", model: "test-model" });
    tuerMitSperre("kein-anbieter", TUER_SATZ_KEIN_ANBIETER);
    zeige();
    await frageStellen("Ist die Meldung hoerbar");
    await waitFor(() => expect(screen.getByText("Error", { exact: false })).toBeTruthy());
    const angesagt = document.querySelector("[role=alert]");
    expect(angesagt, "kein Knoten mit role=alert im Fehlerfall").not.toBeNull();
    expect(angesagt?.getAttribute("aria-live"), "role=alert ohne aria-live wird nicht angesagt").toBe("polite");
  });
});
