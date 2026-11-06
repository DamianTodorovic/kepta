// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Chat } from "../../src/components/Chat";
import { ToastProvider } from "../../src/components/ui/Toast";
import { saveAISettings, PROVIDERS } from "../../src/lib/ai";
import type { Memory } from "../../src/types";

// Der Chat ist die Stelle, an der K3PTA Geld kostet und Wissen nach draussen
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

function stubFetch(over: { stuecke?: string[]; status?: number; fehlerText?: string; sseFehler?: string; suchAntwort?: unknown; suchStatus?: number } = {}) {
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
      if (over.suchStatus) return new Response(JSON.stringify({ error: "the index is busy" }), { status: over.suchStatus });
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
    // Der Grund traegt, was ein Nutzer nicht lesen soll: einen Pfad auf seinem Rechner.
    const grund = "Netz weg — /Users/a/.kepta/kepta.db";
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error(grund); }));
    const protokolliert = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = zeige();
    await frage(user, "Hallo");
    await waitFor(() => expect(container.textContent).toMatch(/The answer stopped partway/));
    expect(container.textContent).not.toMatch(/Netz weg/);
    expect(container.textContent).not.toContain("/Users/a/.kepta/kepta.db");
    expect(protokolliert).toHaveBeenCalledWith(expect.stringContaining("The answer stopped partway"), expect.any(Error));
    protokolliert.mockRestore();
    expect(screen.getByRole("textbox")).toBeTruthy();
  });
});

describe("Chat: Kontext und Kosten", () => {
  it("nennt, wie viele Notizen im Kontext liegen", () => {
    const { container } = zeige({ activeMemories: [note(), note(), note()] });
    expect(container.textContent).toMatch(/3 notes/);
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
    // Kein `if` mehr um den Klick herum: ein Kopier-Knopf, der verschwunden ist, war bis
    // hier ein still gruener Fall — die Meldung wurde nie gesehen, weil nie geklickt wurde.
    expect(kopieren, "kein Kopier-Knopf an der Antwort — der Fall prueft sonst nichts").toBeTruthy();
    await user.click(kopieren!);
    await waitFor(() => expect(document.body.textContent).toMatch(/Copying failed/i));
    // Punkt 1 aus P4-UEBRIGE-VIER (gebaut 3.11.): die Absage beschuldigte "your browser",
    // in einer App ohne Browser, deren eigne Policy das Schreiben ausdruecklich erlaubt
    // (tests/electron-haertung.test.ts: "erlaubt ist nur, in die Zwischenablage zu SCHREIBEN").
    expect(document.body.textContent, "die Absage erfindet eine Gegenstelle, die es nicht gibt")
      .not.toMatch(/browser/i);
    expect(document.body.textContent).toMatch(/the window did not get the clipboard/i);
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

  // Der Fall dahinter, gemeldet von A1x und von E1 geheilt (13.10. 23:5x):
  // der Knopf war `opacity-0` und erschien nur per Hover — auf Touch und per
  // Tastatur nicht auffindbar — und hieß für einen Lesegerät-Nutzer nichts, weil
  // das Icon aria-hidden ist und nur ein title dastand.
  it("ist am Codeblock auch ohne Maus zu finden und hat einen Zugangs-Namen", async () => {
    const user = userEvent.setup();
    stubFetch({ stuecke: ["Hier:\n\n```bash\nnpm run dev\n```\n"] });
    const { container } = zeige();
    await frage(user, "Wie starte ich?");
    await waitFor(() => expect(container.textContent).toMatch(/npm run dev/));
    const knopfe = [...container.querySelectorAll("button")];
    const code = knopfe.find((b) => /copy code/i.test(b.getAttribute("aria-label") ?? ""));
    expect(code, "der Codeblock-Knopf trägt keinen aria-label").toBeTruthy();
    expect(code!.className, `Knopf ist wieder unsichtbar geschaltet: ${code!.className}`).not.toMatch(/(^|\s)opacity-0(\s|$)/);
    // zwei Deutungen von „kopieren" brauchen zwei Namen
    const antwort = knopfe.find((b) => /copy answer/i.test(b.getAttribute("aria-label") ?? ""));
    expect(antwort, "die Antwort hat keinen eigenen Zugangs-Namen zum Kopieren").toBeTruthy();
    expect(antwort).not.toBe(code);
    expect(antwort!.textContent).toMatch(/^Copy$/);   // das sichtbare Wort bleibt kurz
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
    expect(container.textContent).toMatch(/words #1/);
    expect(container.textContent).toMatch(/meaning #2/);
    expect(container.textContent).not.toMatch(/graph #/);
    expect(container.textContent).toMatch(/Search index warm — answer in \d+ ms/);
  });

  it("wenn die Engine nichts liefert, ordnet das lokale Ranking weiter — nichts bricht", async () => {
    const user = userEvent.setup();
    stubFetch({ suchAntwort: {} }); // kein results-Feld
    const { container } = zeige({ activeMemories: [note({ title: "LokaleNotiz" })] });
    await stelleFrageUndWarte(user, container);
    expect(container.textContent).toMatch(/LokaleNotiz/); // Kontext bleibt gefüllt
    expect(container.textContent).not.toMatch(/Warming the search index/); // nach leerer Antwort kein Warten mehr
  });
});

// Punkt 4 und 7, 2.11. — der Chat wechselt seine Quelle, ohne es zu sagen, und sein Prompt
// nennt die gespeicherten Sachen "nodes", waehrend jede Flaeche um ihn herum "notes" sagt.
// Beides ist von mir selbst gelesen: Chat.tsx:477 (catch ohne jede Meldung, Kommentar:
// "Server unerreichbar — die Antwort fällt auf das lokale Ranking zurück") und Chat.tsx:424/427/429
// ("Cite the id of every node you use", "(No nodes are loaded right now…)", "Context — N nodes").
describe("Chat: eine Quelle, die wechselt, muss es sagen", () => {
  it("meldet das lokale Ranking, wenn die Such-Tuer nicht antwortet", async () => {
    stubFetch({ suchStatus: 503, stuecke: ["Antwort", " ohne Engine"] });
    const user = userEvent.setup();
    const { container } = zeige();
    await frage(user, "Was weisst du?");
    const text = await waitFor(() => {
      const t = (container.textContent || "").replace(/\s+/g, " ");
      if (!/local ranking|search index did not answer/i.test(t)) throw new Error(`die Flaeche schweigt ueber ihre Quelle: "${t.slice(0, 240)}"`);
      return t;
    });
    expect(text).toMatch(/local ranking/i);
  });

  it("behält den ruhigen Satz, wenn die Engine geantwortet hat", async () => {
    stubFetch({ stuecke: ["Antwort", " ohne Engine"], suchAntwort: { results: [{ memory: { id: "m1", userId: "local", title: "Notiz 1", content: "Inhalt 1", tags: [], createdAt: 1, updatedAt: 1 }, score: 0.9, cosineScore: 0.8, bm25Score: 0.2, rawBm25: 0, matchedTerms: [], tracks: { bm25: 0, vektor: 1, graph: null, similarity: 0.8 } }], total: 1 } });
    const user = userEvent.setup();
    const { container } = zeige();
    await frage(user, "Was weisst du?");
    await waitFor(() => expect(container.textContent).toMatch(/Antwort ohne Engine/));
    expect(container.textContent, "die Flaeche behauptet einen Fallback, wo die Engine antwortete")
      .not.toMatch(/local ranking/i);
  });

  it("nennt die gespeicherten Sachen im Prompt notes, nicht nodes", async () => {
    stubFetch({ stuecke: ["Hallo"] });
    const user = userEvent.setup();
    zeige();
    await frage(user, "Was weisst du?");
    const strom = await waitFor(() => {
      const a = anfragen.find((x) => x.url.includes("/api/chat/stream"));
      if (!a) throw new Error("kein Strom geschickt — die Wache prueft ins Leere");
      return a;
    });
    const prompt = String(strom.body.system ?? "");
    expect(prompt, `der Prompt bringt dem Modell das Wort der Flaeche nicht bei: ${prompt.slice(0, 260)}`)
      .toMatch(/every note you use/i);
    expect(prompt, `der Prompt zahlt nodes, wo die Flaeche notes zaehlt: ${prompt.slice(0, 260)}`)
      .not.toMatch(/\bnodes\b/);
  });
});

// P66 (Leitung 5.11. 13:00 MEZ, Punkt 4 / #31 und Punkt 7): der Chip ueber den Treffern nannte
// einen einzigen Grund fuer drei verschiedene. Die Engine konnte schweigen (Transport um), konnte
// antworten und ablehnen (500), konnte antworten und keine Liste bringen ({} oder ein
// unlesbarer Koerper) -- in allen drei Faellen sagte dieselbe Zeile "the search index did not
// answer". Das ist eine Behauptung ueber die eigne Tuer, die in zwei der drei Faelle falsch ist.
// Erwartung VOR dem Flicken: die drei Grund-Faelle rot, die Kontrolle gruen.
describe("P66: der lokale Grund nennt seinen eigentlichen Grund", () => {
  async function frageUndText(user: ReturnType<typeof userEvent.setup>, container: HTMLElement) {
    await frage(user, "Was weisst du?");
    return waitFor(() => {
      const t = (container.textContent || "").replace(/\s+/g, " ");
      if (!/local ranking/i.test(t)) throw new Error(`kein lokaler Grund auf dem Schirm: "${t.slice(0, 240)}"`);
      return t;
    });
  }

  it("unterscheidet eine Abweisung von einer Stille", async () => {
    stubFetch({ suchStatus: 500 });
    const user = userEvent.setup();
    const { container } = zeige();
    const text = await frageUndText(user, container);
    expect(text, "500 ist eine Antwort — die Zeile darf keine Stille behaupten").not.toMatch(/did not answer/i);
    expect(text, "und die Zahl steht dabei").toMatch(/HTTP 500/);
  });

  it("unterscheidet eine leere Liste von einer Stille", async () => {
    stubFetch({ suchAntwort: {} });
    const user = userEvent.setup();
    const { container } = zeige();
    const text = await frageUndText(user, container);
    expect(text, "eine Antwort ohne Trefferliste ist keine ausgebliebene Antwort").not.toMatch(/did not answer/i);
    expect(text, "sie sagt, dass die Liste fehlt").toMatch(/answered without a list/i);
  });

  it("nennt einen unlesbaren Koerper als fehlende Liste, nicht als Stille und nicht als V8-Text", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/api/search")) return new Response("<html><body>200 OK</body></html>", { status: 200 });
      if (String(url).includes("/api/chat/stream")) return sseAntwort(["Antwort", " ohne Engine"]);
      return new Response("{}", { status: 200 });
    }));
    const user = userEvent.setup();
    const { container } = zeige();
    const text = await frageUndText(user, container);
    expect(text).not.toMatch(/did not answer/i);
    expect(text, "der Wortlaut der Laufzeit bleibt im Protokoll").not.toMatch(/Unexpected token|not valid JSON/i);
    expect(text, "ein unlesbarer Koerper ist eine Antwort ohne Liste").toMatch(/answered without a list/i);
  });

  // KONTROLLE, in beiden Staenden gruen: die echte Stille behaelt ihr Wort.
  it("KONTROLLE: ein Abbruch ohne jede Antwort heisst weiterhin Stille", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/api/search")) throw new TypeError("Failed to fetch");
      if (String(url).includes("/api/chat/stream")) return sseAntwort(["Antwort", " ohne Engine"]);
      return new Response("{}", { status: 200 });
    }));
    const user = userEvent.setup();
    const { container } = zeige();
    const text = await frageUndText(user, container);
    expect(text, "Stille heisst Stille").toMatch(/did not answer/i);
    expect(text, "und keine erfundne Zahl").not.toMatch(/HTTP \d/);
  });
});
