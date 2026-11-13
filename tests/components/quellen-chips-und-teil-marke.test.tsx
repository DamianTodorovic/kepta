// @vitest-environment jsdom
// P165 — die zwei UI-Zusagen der Aussendung, die bisher keine Maschine hielt:
//
//   README.md:211  "**Source citations**: every answer shows which memories it used"
//   README.md:230  "Every card shows where it came from and which part it is — a label
//                   like `2/5`, where the 5 is the number of parts that one file was
//                   split into, not a share of the store"
//
// Der Chat rendert die Quellen als Chips unter der Antwort (src/components/Chat.tsx:1149,
// Titel aus sourcesForTurn :607); das Dashboard staempelt die Teil-Marke beim Import in
// den Titel (src/components/Dashboard.tsx:1221). Dieser Test haelt beides am gerenderten
// Objekt — nicht am Quelltext.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { Chat } from "../../src/components/Chat";
import { Dashboard } from "../../src/components/Dashboard";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import { ToastProvider } from "../../src/components/ui/Toast";
import { saveAISettings, PROVIDERS } from "../../src/lib/ai";
import { installiereResizeObserver } from "../helfer/canvas";
import type { Memory } from "../../src/types";

// ---------- Chat: die Quellen-Chips ----------

let zaehler = 0;
function notiz(over: Partial<Memory> = {}): Memory {
  zaehler++;
  return {
    id: `m${zaehler}`, userId: "local", title: `Notiz ${zaehler}`, content: `Inhalt ${zaehler}`,
    tags: [], type: "semantic", createdAt: 1, updatedAt: 1, ...over,
  };
}

/** Acht Treffer der Engine — Titel kurz genug, dass kein Chip kuerzt (Kuerzung ab 19 Zeichen). */
function achtTreffer() {
  const namen = ["Quelle Eins", "Quelle Zwei", "Quelle Drei", "Quelle Vier", "Quelle Fuenf", "Quelle Sechs", "Quelle Sieben", "Quelle Acht"];
  return {
    results: namen.map((t, i) => ({
      memory: { id: `q${i + 1}`, userId: "local", title: t, content: `Leib ${i + 1}`, tags: [], createdAt: 1, updatedAt: 1 },
      score: 0.9 - i * 0.01, cosineScore: 0.8, bm25Score: 0.2, rawBm25: 0, matchedTerms: [],
      tracks: { bm25: i, vektor: null, graph: null, similarity: 0.8 },
    })),
    total: 8,
  };
}

function sseAntwort(): Response {
  const koerper = new ReadableStream<Uint8Array>({
    start(c) {
      const enc = new TextEncoder();
      c.enqueue(enc.encode(`data: ${JSON.stringify({ text: "Antwort" })}\n\n`));
      c.enqueue(enc.encode("data: [DONE]\n\n"));
      c.close();
    },
  });
  return new Response(koerper, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function chatFetch(over: { suchAntwort?: unknown } = {}) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    void init;
    if (String(url).includes("/api/chat/stream")) return sseAntwort();
    if (String(url).includes("/api/search")) {
      return new Response(JSON.stringify(over.suchAntwort ?? {}), { status: 200, headers: { "Content-Type": "application/json" } });
    }
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

describe("P165, Quellen-Chips: die Antwort nennt, welche Notizen sie benutzt hat", () => {
  it("zeigt die Chips mit den Titeln der benutzten Notizen — und den Ueberlauf als Zahl", async () => {
    chatFetch({ suchAntwort: achtTreffer() });
    const user = userEvent.setup();
    const { container } = render(<ToastProvider><Chat activeMemories={[notiz(), notiz()]} /></ToastProvider>);
    await user.type(screen.getByRole("textbox"), "Was weisst du?");
    await user.keyboard("{Enter}");
    const text = await waitFor(() => {
      const t = (container.textContent || "").replace(/\s+/g, " ");
      if (!/Antwort/.test(t)) throw new Error(`keine Antwort da — die Wache prueft ins Leere: "${t.slice(0, 200)}"`);
      return t;
    });
    // P202, Mockup-Grammatik: die Pillen tragen die Titel direkt — kein Label-Wort.
    expect(text, "die Antwort traegt die Quellen-Pillen nicht").toMatch(/Quelle Eins/);
    for (const n of ["Quelle Eins", "Quelle Zwei", "Quelle Drei", "Quelle Vier", "Quelle Fuenf", "Quelle Sechs"]) {
      expect(text, `der Chip fuer "${n}" fehlt`).toContain(n);
    }
    expect(text, "acht Quellen, sechs Keile — der Rest muss als Zahl sichtbar bleiben").toMatch(/\+2/);
  });

  it("zeigt keine Keile, wenn die Antwort keine Notiz benutzt hat", async () => {
    chatFetch({ suchAntwort: {} });
    const user = userEvent.setup();
    const { container } = render(<ToastProvider><Chat activeMemories={[]} /></ToastProvider>);
    await user.type(screen.getByRole("textbox"), "Was weisst du?");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(container.textContent).toMatch(/Antwort/));
    expect(container.textContent, "ohne benutzte Notizen gibt es nichts zu nennen — eine leere Pille waere eine Luege")
      .not.toMatch(/Quelle Eins/);
  });
});

// ---------- Dashboard: die Teil-Marke ----------

function stubpe(tuer: (url: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => tuer(String(url), init)));
}

/** Zwei Dateien in EINEM Wurf — derselbe Weg wie quittung-ohne-beweis.test.tsx:29. */
async function dateienAblegen(container: HTMLElement, paare: Array<{ text: string; name: string }>) {
  const eingabe = container.querySelector('input[type="file"]') as HTMLInputElement;
  if (!eingabe) throw new Error("kein Dateifeld");
  const dateien = paare.map((p) => new File([p.text], p.name, { type: "text/markdown" }));
  Object.defineProperty(eingabe, "files", { value: dateien, configurable: true });
  await act(async () => {
    eingabe.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
  });
}

describe("P165, Teil-Marke: die Zahl im Titel ist die Stueckzahl DIESER Datei, nicht die des Ladens", () => {
  it("staempelt Teil i/N mit N = Chunk-Zahl derselben Datei, und eine Ein-Stueck-Datei traegt kein Teil", async () => {
    installiereResizeObserver(1200, 800);
    const schreibungen: string[] = [];
    stubpe(async (url, init) => {
      if (url.includes("/api/memories") && String(init?.method || "GET") === "POST") {
        const koerper = JSON.parse(String(init?.body)) as { title?: string };
        schreibungen.push(koerper.title ?? "");
        return new Response(JSON.stringify({ memory: { id: `neu-${schreibungen.length}`, userId: "local", title: koerper.title, content: "", tags: [], createdAt: 1, updatedAt: 1 } }), { status: 201, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/api/health")) return new Response(JSON.stringify({ ok: true, count: 0, version: "3.2.190", encryption: { aktiv: true }, embeddings: { total: 0, embedded: 0 }, mcp: { tools: 8, protocol: "2026-07-28" } }), { status: 200 });
      return new Response(JSON.stringify({ memories: [], count: 0, total: 0 }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const view = render(
      <ThemeProvider><AuthProvider><ToastProvider><Dashboard /></ToastProvider></AuthProvider></ThemeProvider>
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
    // Kurz.md passt in einen Chunk (chunkText: <= 2000 Zeichen -> ein Stueck, kein Teil);
    // Lang.md ist ueber zwei Fenster gross -> mehrere Stuecke.
    await dateienAblegen(view.container, [
      { text: "Kurznotiz.", name: "Kurz.md" },
      { text: "Wort ".repeat(1100), name: "Lang.md" },
    ]);
    const quittung = await waitFor(() => {
      const t = (view.container.textContent || "").replace(/\s+/g, " ");
      if (!/Saved \d+ notes from 2 files/.test(t)) throw new Error(`keine Quittung: "${t.slice(0, 200)}"`);
      return t;
    });
    expect(quittung, "der Import muss alles melden, was er schrieb — sonst ist die Marke unbezeugt").toMatch(/Saved \d+ notes from 2 files/);
    expect(schreibungen.length, "jede Schreibung muss bei der Wache ankommen").toBeGreaterThan(1);

    // Kurz.md: ein Stueck -> Titel OHNE Teil-Markierung.
    expect(schreibungen, "die Kurz-Datei darf kein Teil tragen").toContain("Kurz");

    // Lang.md: ihre Stueckzahl N misst der Test an den eignen Schreibungen, nicht an der Annahme.
    const lang = schreibungen.filter((t) => t.startsWith("Lang"));
    expect(lang.length, "die Lang-Datei muss in mehrere Stuecke fallen").toBeGreaterThan(1);
    expect(lang, `alle Lang-Titel: ${lang.join(" | ")}`).toEqual(
      lang.map((_, i) => `Lang — Teil ${i + 1}/${lang.length}`),
    );
    // Der Kern der Zusage: N ist die Stueckzahl DIESER Datei (hier lang.length),
    // nicht die Schreibzahl des ganzen Ladens (Kurz + Lang zusammen).
    expect(lang[0], `die Marke nennt die Stueckzahl der einen Datei, nicht die des Ladens (${schreibungen.length})`)
      .toBe(`Lang — Teil 1/${lang.length}`);
  });
});
