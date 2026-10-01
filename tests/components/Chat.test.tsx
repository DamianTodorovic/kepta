// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Chat } from "../../src/components/Chat";
import { ToastProvider } from "../../src/components/ui/Toast";
import { saveAISettings, PROVIDERS } from "../../src/lib/ai";
import type { Memory } from "../../src/types";

// Der Chat ist die Stelle, an der KEPTA Geld kostet und Wissen nach draussen
// gibt. Zwei Dinge muessen hier stimmen: was in den Kontext wandert, und dass
// ein Abbruch auch wirklich abbricht.

let zaehler = 0;
function note(over: Partial<Memory> = {}): Memory {
  zaehler++;
  return {
    id: `m${zaehler}`, userId: "local", title: `Notiz ${zaehler}`, content: `Inhalt ${zaehler}`,
    tags: [], type: "semantic", createdAt: 1, updatedAt: 1, ...over,
  };
}

/** Eine SSE-Antwort aus einzelnen Stuecken bauen. */
function sseAntwort(stuecke: string[], opts: { fehler?: string } = {}): Response {
  const koerper = new ReadableStream<Uint8Array>({
    start(c) {
      const enc = new TextEncoder();
      if (opts.fehler) c.enqueue(enc.encode(`data: ${JSON.stringify({ error: opts.fehler })}\n\n`));
      else {
        for (const s of stuecke) c.enqueue(enc.encode(`data: ${JSON.stringify({ text: s })}\n\n`));
        c.enqueue(enc.encode("data: [DONE]\n\n"));
      }
      c.close();
    },
  });
  return new Response(koerper, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

let anfragen: { url: string; body: Record<string, unknown> }[];

function stubFetch(over: { stuecke?: string[]; status?: number; fehlerText?: string; sseFehler?: string; suchAntwort?: unknown } = {}) {
  anfragen = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    anfragen.push({ url, body: init?.body ? JSON.parse(String(init.body)) : {} });
    if (url.includes("/api/chat/stream")) {
      if (over.status && over.status >= 400) {
        return new Response(JSON.stringify({ error: over.fehlerText ?? "kaputt" }), { status: over.status });
      }
      return sseAntwort(over.stuecke ?? ["Hallo", " Welt"], { fehler: over.sseFehler });
    }
    if (url.includes("/api/search")) {
      // Paket 3: die Engine-Antwort mit Spuren-Herkunft — ohne Stub fällt der Chat aufs lokale Ranking zurück.
      return new Response(JSON.stringify(over.suchAntwort ?? {}), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("{}", { status: 200 });
  }));
}

beforeEach(() => {
  localStorage.clear();
  // Ohne eingerichteten Anbieter blockiert der Chat das Senden — zu Recht.
  // Fuer die Pruefung des Ablaufs wird einer hinterlegt.
  const anbieter = PROVIDERS.find((p) => p.needsKey) ?? PROVIDERS[0];
  saveAISettings({ providerId: anbieter.id, apiKey: "sk-test", baseUrl: anbieter.baseUrl, model: anbieter.defaultModel });
  stubFetch();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

type Props = React.ComponentProps<typeof Chat>;
function zeige(over: Partial<Props> = {}) {
  const props: Props = { activeMemories: [note(), note()], ...over };
  const view = render(<ToastProvider><Chat {...props} /></ToastProvider>);
  return { ...view, props };
}

async function frage(user: ReturnType<typeof userEvent.setup>, text: string) {
  const feld = screen.getByRole("textbox");
  await user.type(feld, text);
  await user.keyboard("{Enter}");
}

describe("Chat: eine Frage stellen", () => {
  it("schickt nichts bei leerer Eingabe", async () => {
    const user = userEvent.setup();
    zeige();
    await user.type(screen.getByRole("textbox"), "   ");
    await user.keyboard("{Enter}");
    expect(anfragen.filter((a) => a.url.includes("/stream"))).toHaveLength(0);
  });

  it("stellt die Frage und zeigt die stueckweise eintreffende Antwort", async () => {
    const user = userEvent.setup();
    const { container } = zeige();
    await frage(user, "Was weisst du?");
    await waitFor(() => expect(container.textContent).toMatch(/Hallo Welt/));
    expect(container.textContent).toMatch(/Was weisst du\?/);
  });

  it("gibt die aktiven Notizen als Kontext mit", async () => {
    const user = userEvent.setup();
    zeige({ activeMemories: [note({ title: "Fristenkontrolle", content: "montags und donnerstags" })] });
    await frage(user, "Wann?");
    await waitFor(() => expect(anfragen.some((a) => a.url.includes("/stream"))).toBe(true));
    const anfrage = anfragen.find((a) => a.url.includes("/stream"))!;
    expect(JSON.stringify(anfrage.body)).toMatch(/Fristenkontrolle/);
  });

  it("schickt ohne Notizen trotzdem eine Frage", async () => {
    const user = userEvent.setup();
    zeige({ activeMemories: [] });
    await frage(user, "Hallo");
    await waitFor(() => expect(anfragen.some((a) => a.url.includes("/stream"))).toBe(true));
  });
});

describe("Chat: wenn etwas schiefgeht", () => {
  it("zeigt den Fehlertext des Servers statt einer leeren Blase", async () => {
    const user = userEvent.setup();
    stubFetch({ status: 401, fehlerText: "Invalid API key" });
    const { container } = zeige();
    await frage(user, "Hallo");
    await waitFor(() => expect(container.textContent).toMatch(/Invalid API key/));
  });

  it("zeigt einen Fehler, der mitten im Strom kommt", async () => {
    const user = userEvent.setup();
    stubFetch({ sseFehler: "Rate limit reached" });
    const { container } = zeige();
    await frage(user, "Hallo");
    await waitFor(() => expect(container.textContent).toMatch(/Rate limit reached/));
  });

  it("bleibt bedienbar, wenn die Verbindung ganz wegbricht", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Netz weg"); }));
    const { container } = zeige();
    await frage(user, "Hallo");
    await waitFor(() => expect(container.textContent).toMatch(/Netz weg/));
    expect(screen.getByRole("textbox")).toBeTruthy();
  });
});

describe("Chat: Kontext und Kosten", () => {
  it("nennt, wie viele Knoten im Kontext liegen", () => {
    const { container } = zeige({ activeMemories: [note(), note(), note()] });
    expect(container.textContent).toMatch(/3 nodes/);
  });

  it("laesst das Token-Budget einstellen", async () => {
    const user = userEvent.setup();
    const { container } = zeige();
    const regler = container.querySelector('input[type="range"]') as HTMLInputElement;
    expect(regler).not.toBeNull();
    const vorher = regler.value;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    setter.call(regler, String(Number(regler.max)));
    regler.dispatchEvent(new Event("input", { bubbles: true }));
    await waitFor(() => expect((container.querySelector('input[type="range"]') as HTMLInputElement).value).not.toBe(vorher));
    void user;
  });

  it("schaetzt Kosten, ohne NaN oder Unendlich zu zeigen", async () => {
    const user = userEvent.setup();
    const { container } = zeige();
    await frage(user, "Hallo");
    await waitFor(() => expect(container.textContent).toMatch(/Hallo Welt/));
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
  });
});

describe("Chat: abbrechen und leeren", () => {
  it("bricht einen laufenden Strom ab", async () => {
    const user = userEvent.setup();
    // Ein Strom, der nie endet, bis er abgebrochen wird.
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (!url.includes("/stream")) return new Response("{}", { status: 200 });
      const signal = init?.signal;
      const koerper = new ReadableStream<Uint8Array>({
        start(c) {
          const enc = new TextEncoder();
          c.enqueue(enc.encode(`data: ${JSON.stringify({ text: "Teil" })}\n\n`));
          signal?.addEventListener("abort", () => { try { c.close(); } catch { /* schon zu */ } });
        },
      });
      return new Response(koerper, { status: 200 });
    }));
    const { container } = zeige();
    await frage(user, "Lange Antwort bitte");
    await waitFor(() => expect(container.textContent).toMatch(/Teil/));
    const stopp = [...container.querySelectorAll("button")].find((b) => /stop/i.test(`${b.title} ${b.getAttribute("aria-label")} ${b.textContent}`));
    expect(stopp, "kein Stopp-Knopf gefunden").toBeTruthy();
    await user.click(stopp!);
    await waitFor(() => expect(screen.getByRole("textbox")).toBeTruthy());
  });

  it("leert den Verlauf", async () => {
    const user = userEvent.setup();
    const { container } = zeige();
    await frage(user, "Erste Frage");
    await waitFor(() => expect(container.textContent).toMatch(/Hallo Welt/));
    const leeren = [...container.querySelectorAll("button")].find((b) => /clear|new chat|leeren/i.test(`${b.title} ${b.getAttribute("aria-label")} ${b.textContent}`));
    if (leeren) {
      await user.click(leeren);
      await waitFor(() => expect(container.textContent).not.toMatch(/Erste Frage/));
    }
  });
});

describe("Chat: Antwort ins Gehirn uebernehmen", () => {
  it("reicht eine Antwort an den Aufrufer weiter", async () => {
    const user = userEvent.setup();
    const onSaveToBrainWithMeta = vi.fn();
    const onSaveToBrain = vi.fn();
    const { container } = zeige({ onSaveToBrain, onSaveToBrainWithMeta });
    await frage(user, "Hallo");
    await waitFor(() => expect(container.textContent).toMatch(/Hallo Welt/));
    const speichern = [...container.querySelectorAll("button")].find((b) => /Save as a node/i.test(b.textContent ?? ""));
    if (speichern) {
      await user.click(speichern);
      await waitFor(() => expect(onSaveToBrainWithMeta.mock.calls.length + onSaveToBrain.mock.calls.length).toBeGreaterThan(0));
    }
  });
});

describe("Chat: Kopieren", () => {
  it("meldet einen Fehlschlag, statt stumm zu bleiben", async () => {
    // Vorher verschwand ein Fehler im leeren catch — es passierte scheinbar nichts.
    const user = userEvent.setup();
    const { container } = zeige();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn(async () => { throw new Error("verweigert"); }) },
      configurable: true,
    });
    await frage(user, "Hallo");
    await waitFor(() => expect(container.textContent).toMatch(/Hallo Welt/));
    const kopieren = [...document.querySelectorAll("button")].find((b) => /^Copy$/.test((b.textContent ?? "").trim()));
    if (kopieren) {
      await user.click(kopieren);
      await waitFor(() => expect(document.body.textContent).toMatch(/Copying failed/i));
    }
  });
});

describe("Chat: was man mit einer Antwort machen kann", () => {
  async function bisAntwort(user: ReturnType<typeof userEvent.setup>) {
    const view = zeige();
    await frage(user, "Hallo");
    await waitFor(() => expect(document.body.textContent).toMatch(/Hallo Welt/));
    return view;
  }

  it("kopiert eine Antwort in die Zwischenablage", async () => {
    const user = userEvent.setup();
    const { container } = await bisAntwort(user);
    const schreibe = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText: schreibe }, configurable: true });
    // Die Knoepfe an der Antwort tragen ihre Beschriftung als Text, nicht als title.
    const kopieren = [...container.querySelectorAll("button")].find((b) => /^Copy$/.test((b.textContent ?? "").trim()));
    expect(kopieren, "kein Kopier-Knopf an der Antwort").toBeTruthy();
    await user.click(kopieren!);
    await waitFor(() => expect(schreibe).toHaveBeenCalledWith(expect.stringContaining("Hallo Welt")));
  });

  it("uebernimmt eine Antwort ins Gehirn", async () => {
    const user = userEvent.setup();
    const onSaveToBrainWithMeta = vi.fn();
    const onSaveToBrain = vi.fn();
    const view = render(<ToastProvider><Chat activeMemories={[note()]} onSaveToBrain={onSaveToBrain} onSaveToBrainWithMeta={onSaveToBrainWithMeta} /></ToastProvider>);
    await frage(user, "Hallo");
    await waitFor(() => expect(view.container.textContent).toMatch(/Hallo Welt/));
    const speichern = [...view.container.querySelectorAll("button")].find((b) => /Save as a node/i.test(b.textContent ?? ""));
    expect(speichern, "kein Speichern-Knopf an der Antwort").toBeTruthy();
    await user.click(speichern!);
    await waitFor(() => expect(onSaveToBrainWithMeta.mock.calls.length + onSaveToBrain.mock.calls.length).toBeGreaterThan(0));
  });

  it("zeigt die verbrauchten Token an der Antwort", async () => {
    const user = userEvent.setup();
    const { container } = await bisAntwort(user);
    expect(container.textContent).toMatch(/tok|token/i);
  });
});

describe("Chat: mehrere Runden", () => {
  it("behaelt den Verlauf und schickt ihn mit", async () => {
    const user = userEvent.setup();
    const { container } = zeige();
    await frage(user, "Erste Frage");
    await waitFor(() => expect(container.textContent).toMatch(/Hallo Welt/));
    await frage(user, "Zweite Frage");
    await waitFor(() => expect(anfragen.filter((a) => a.url.includes("/stream"))).toHaveLength(2));
    const zweite = anfragen.filter((a) => a.url.includes("/stream"))[1];
    const nachrichten = JSON.stringify((zweite.body as { messages?: unknown }).messages);
    expect(nachrichten).toMatch(/Erste Frage/);
    expect(nachrichten).toMatch(/Zweite Frage/);
  });

  it("laesst waehrend des Streams keine zweite Frage zu", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (!url.includes("/stream")) return new Response("{}", { status: 200 });
      anfragen.push({ url, body: init?.body ? JSON.parse(String(init.body)) : {} });
      const koerper = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ text: "laeuft" })}\n\n`));
          init?.signal?.addEventListener("abort", () => { try { c.close(); } catch { /* zu */ } });
        },
      });
      return new Response(koerper, { status: 200 });
    }));
    anfragen = [];
    const { container } = zeige();
    await frage(user, "Erste");
    await waitFor(() => expect(container.textContent).toMatch(/laeuft/));
    const vorher = anfragen.length;
    await frage(user, "Zweite");
    expect(anfragen.length).toBe(vorher);
  });
});

describe("Chat: Code in Antworten", () => {
  it("zeigt einen Codeblock mit eigenem Kopier-Knopf", async () => {
    const user = userEvent.setup();
    stubFetch({ stuecke: ["Hier:\n\n```bash\nnpm run dev\n```\n"] });
    const { container } = zeige();
    await frage(user, "Wie starte ich?");
    await waitFor(() => expect(container.textContent).toMatch(/npm run dev/));
    const codeKopieren = [...container.querySelectorAll("button")].find((b) => /copy code/i.test(b.title ?? ""));
    expect(codeKopieren, "kein Kopier-Knopf am Codeblock").toBeTruthy();
    const schreibe = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText: schreibe }, configurable: true });
    await user.click(codeKopieren!);
    await waitFor(() => expect(schreibe).toHaveBeenCalledWith(expect.stringContaining("npm run dev")));
  });

  it("stellt Markdown-Ueberschriften und Listen dar", async () => {
    const user = userEvent.setup();
    stubFetch({ stuecke: ["## Schritte\n\n- Erstens\n- Zweitens\n"] });
    const { container } = zeige();
    await frage(user, "Und dann?");
    await waitFor(() => expect(container.textContent).toMatch(/Schritte/));
    expect(container.querySelector("ul, ol"), "keine Liste gerendert").not.toBeNull();
  });
});

describe("Chat: der leere Zustand", () => {
  it("erklaert, was der Chat kann, statt leer dazustehen", () => {
    const { container } = zeige([] as never);
    expect(container.textContent?.length ?? 0).toBeGreaterThan(50);
  });

  it("nennt den eingerichteten Anbieter und das Modell", () => {
    const { container } = zeige();
    // Mit hinterlegtem Anbieter steht dort dessen Name samt Modell.
    expect(container.textContent).toMatch(/gpt-4o-mini|OpenAI/i);
  });
});

describe("Chat: das ganze Gehirn (Paket 3)", () => {
  const suchTreffer = {
    results: [
      { memory: { id: "engine-1", userId: "local", title: "EngineTreffer", content: "Der Atlas startet im Oktober.", tags: [], createdAt: 1, updatedAt: 1 }, score: 0.4, cosineScore: 0.8, bm25Score: 0.2, rawBm25: 0, matchedTerms: [], tracks: { bm25: 0, vektor: 1, graph: null, similarity: 0.8 } },
    ],
    total: 1,
  };

  async function stelleFrageUndWarte(user: ReturnType<typeof userEvent.setup>, container: HTMLElement) {
    await frage(user, "Wann startet Atlas?");
    // Der Debounce (300 ms) schickt die Eingabe an die Engine — der Test wartet auf ihn.
    await waitFor(() => expect(anfragen.some((a) => a.url.includes("/api/search"))).toBe(true));
    await waitFor(() => expect(container.textContent).toMatch(/Hallo Welt/));
  }

  it("fragt die Server-Engine mit Suchtiefe und Spuren-Schaltern aus den Einstellungen", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ki_gehirn_such_tiefe", "12");
    localStorage.setItem("ki_gehirn_spur_bm25", "0"); // BM25 abgestellt — der Request muss das sagen
    stubFetch({ suchAntwort: suchTreffer });
    const { container } = zeige();
    await stelleFrageUndWarte(user, container);
    const such = anfragen.find((a) => a.url.includes("/api/search"));
    expect(such, "kein Engine-Call").toBeTruthy();
    expect(such!.body).toMatchObject({ query: "Wann startet Atlas?", topK: 12, tracks: { bm25: false, vector: true, entity: true } });
    // Das ganze Gehirn: der Engine-Treffer ist im Prompt, obwohl er NICHT unter den aktiven Notizen liegt.
    const stream = anfragen.find((a) => a.url.includes("/stream"))!;
    expect(JSON.stringify(stream.body)).toMatch(/EngineTreffer/);
  });

  it("zeigt die Spuren-Herkunft an den Quellen und den Warm-Zustand nach der Engine-Antwort", async () => {
    const user = userEvent.setup();
    stubFetch({ suchAntwort: suchTreffer });
    const { container } = zeige();
    await stelleFrageUndWarte(user, container);
    expect(container.textContent).toMatch(/bm25 #1/);
    expect(container.textContent).toMatch(/vector #2/);
    expect(container.textContent).not.toMatch(/graph #/);
    expect(container.textContent).toMatch(/Brain warm — answer in \d+ ms/);
  });

  it("wenn die Engine nichts liefert, ordnet das lokale Ranking weiter — nichts bricht", async () => {
    const user = userEvent.setup();
    stubFetch({ suchAntwort: {} }); // kein results-Feld
    const { container } = zeige({ activeMemories: [note({ title: "LokaleNotiz" })] });
    await stelleFrageUndWarte(user, container);
    expect(container.textContent).toMatch(/LokaleNotiz/); // Kontext bleibt gefüllt
    expect(container.textContent).not.toMatch(/Brain warming up/); // nach leerer Antwort kein Warten mehr
  });
});
