// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { Dashboard } from "../../src/components/Dashboard";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import { ToastProvider } from "../../src/components/ui/Toast";
import { installiereResizeObserver } from "../helfer/canvas";
import type { Memory } from "../../src/types";

// Warum diese Datei existiert (Auftrag der Leitung 14.10., Fund aus GFs Bild):
// Der Graph-Kopf sagte „100 entries · connected through tags…" — das war die
// SEITENLÄNGE — während im selben Rahmen unten „32 notes of 14,702 in the
// store" stand. Zwei Zahlen, ein Bildschirm, keine Erklärung. Die Tür nennt
// ihren Bestand seit F12 im Leib (`total`) und im Kopf (`x-kepta-total`);
// src/lib/store.ts:40-47 liest ihn, und die Fläche war die Letzte, die ihn
// nicht fragte.
//
// Der Fall ist gleichzeitig sein eigener Fänger: die Seite bringt 100, die Tür
// sagt 14.702. Wer `memories.length` vorliest, kann hier nicht grün werden.

const SEITE = 100;
const BESTAND = 14702;

function notiz(i: number): Memory {
  return {
    id: `m${i}`, userId: "local", title: `Notiz ${i}`, content: `Inhalt ${i}`,
    // Tags sind kein Schmuck: die Tag-Leiste der Seitenleiste malt nur, was
    // getaggt ist. Ohne diese zwei Felder wäre der Fall unten ein grüner
    // Blindlauf — die Zeile, die er prüft, erschiene nie.
    tags: ["protokoll", `fach-${i % 6}`], type: "semantic", createdAt: Date.parse("2025-01-01"), updatedAt: Date.parse("2025-01-01"),
  };
}

const seitenseite = Array.from({ length: SEITE }, (_, i) => notiz(i + 1));

function stubpeTuer() {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const ziel = String(url);
    if (ziel.includes("/api/memories")) {
      return new Response(
        JSON.stringify({ count: seitenseite.length, total: BESTAND, limit: SEITE, offset: 0, begrenzt: true, memories: seitenseite }),
        { status: 200, headers: { "content-type": "application/json", "x-kepta-total": String(BESTAND), "x-kepta-begrenzt": "1" } }
      );
    }
    if (ziel.includes("/api/search")) return new Response(JSON.stringify({ results: [], total: 0 }), { status: 200 });
    if (ziel.includes("/api/graph")) return new Response(JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 });
    if (ziel.includes("/api/inbox/status")) return new Response(JSON.stringify({ inboxDir: "/x", files: [], watching: true }), { status: 200 });
    if (ziel.includes("/api/health")) return new Response(JSON.stringify({ ok: true, count: BESTAND, version: "3.2.1", embeddings: { total: 0, embedded: 0, models: {} }, encryption: { aktiv: true } }), { status: 200 });
    return new Response("{}", { status: 200 });
  }));
}

beforeEach(() => {
  localStorage.clear();
  stubpeTuer();
  installiereResizeObserver();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function rahmen() {
  return render(
    <ThemeProvider><AuthProvider><ToastProvider><Dashboard /></ToastProvider></AuthProvider></ThemeProvider>
  );
}

/** Der Graph-Kopf ist die Zeile mit dem langen Satz — sie ist gemeint, wenn
 *  von „der Kopfzeile" die Rede ist, und nur sie wird hier geprüft. Eine
 *  Verhältniszeile wie „100 of 100 entries" (gezeigt von gefiltert) ist eine
 *  andere Aussage und darf nicht verboten werden.
 *
 *  Gezielt innerste Treffer: `querySelectorAll` liefert Vorfahren zuerst, und
 *  deren `textContent` schluckt GFs ehrliche Zeile im Graph darunter
 *  („Showing 100 of 14,702 notes in all"). Ein Test, der gegen einen
 *  Vorfahren prüft, wäre grün, obwohl der Kopf die Seitenlänge zeigt — genau
 *  der false green, den ich hier zuerst hatte. */
function graphKopf(container: HTMLElement) {
  const treffer = [...container.querySelectorAll("div")].filter((d) => /connected through tags/.test(d.textContent ?? ""));
  return treffer[treffer.length - 1] ?? null;
}

/** Die Schwelle, nicht die Zahl: `waitFor(textContent).toContain("14,702")` war
 *  meine eigene zu weiche Bedingung. Nachdem der Gehirn-Chip dieselbe Größe im
 *  selben Kleid schreibt, steht „14,702" im health-Täfelchen — und die Fläche
 *  hätte prüfen können, bevor die Tür geantwortet hat. Also wartet jeder Fall
 *  auf SEINE Zeile. */
async function warteAuf(container: HTMLElement, muster: RegExp, was: string) {
  await waitFor(() => expect(container.textContent, was).toMatch(muster), { timeout: 6000 });
}

/** Der Bestand ist da, wenn der Kopf ihn nennt — das ist die ehrliche Schwelle
 *  für alle Fälle, die unterhalb des Kopfes zählen. */
function bestandGeda(container: HTMLElement) {
  return warteAuf(container, /100 of 14,702 notes/, "die Tür hat ihren Bestand noch nicht genannt");
}

describe("Bestand statt Seitenlänge: die Fläche nennt, was die Tür sagt", () => {
  it("der Graph-Kopf nennt den Bestand der Tür, nicht die Länge der Seite", async () => {
    const { container } = rahmen();
    await bestandGeda(container);

    const kopf = graphKopf(container);
    expect(kopf, "der Graph-Kopf ist nicht zu finden").toBeTruthy();
    expect(kopf!.textContent).toMatch(/100 of 14,702/);
    expect(kopf!.textContent, "eine Seitenlänge, als Bestand ausgegeben").not.toMatch(/^100 notes/);
  });

  it("die Seitenleiste zählt denselben Bestand wie der Kopf", async () => {
    const { container } = rahmen();
    await warteAuf(container, /14,702 notes/, "die Leiste nennt noch keinen Bestand");
    const zeile = [...container.querySelectorAll("*")].filter((e) => !e.children.length && /^100 notes$/.test((e.textContent ?? "").trim()));
    expect(zeile.length, "die Fläche behauptet nirgends ‚100 notes' — Pruefung greift nicht").toBe(0);
    const marke = [...container.querySelectorAll("*")].find((e) => !e.children.length && /^14,702$/.test((e.textContent ?? "").trim()));
    expect(marke, "die Seitenleiste nennt nicht den Bestand").toBeTruthy();
  });

  it("der Index-Held zählt den Bestand, nicht die geladene Seite", async () => {
    const { container } = rahmen();
    // Der Held ist ein eigenes Element: gegen `container.textContent` wäre die
    // Schwelle vom Gesundheits-Chip schon vor der Ladung erfüllt.
    await waitFor(() => expect(container.querySelector(".num-hero")?.textContent).toBe("14,702"), { timeout: 6000 });
    const held = container.querySelector(".num-hero");
    expect(held, "kein Index-Held im Baum").toBeTruthy();
    expect(held!.textContent).toBe("14,702");
  });

  it("schweigt die Tür, erfindet die Fläche keine Menge", async () => {
    // Ohne `total` und ohne Kopf weiß die Fläche nur, was sie trägt. Dann darf
    // sie weder „of 14.702" noch „of 100" behaupten — nur zählen, was liegt.
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const ziel = String(url);
      if (ziel.includes("/api/memories")) {
        return new Response(JSON.stringify(seitenseite), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (ziel.includes("/api/search")) return new Response(JSON.stringify({ results: [], total: 0 }), { status: 200 });
      if (ziel.includes("/api/graph")) return new Response(JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 });
      if (ziel.includes("/api/inbox/status")) return new Response(JSON.stringify({ inboxDir: "/x", files: [], watching: true }), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    const { container } = rahmen();
    // Der Store hält Bestand und ETag im Modul — nach dem ersten Fall stünde
    // noch 14.702 drin. Also die Tür neu befragen, statt alten Modulzustand für
    // eine neue Aussage auszugeben.
    const { refreshMemories } = await import("../../src/lib/store");
    const { act } = await import("@testing-library/react");
    await act(async () => { await refreshMemories(); });
    await waitFor(() => {
      const kopf = graphKopf(container);
      expect(kopf, "der Graph-Kopf ist nicht zu finden").toBeTruthy();
      expect(kopf!.textContent).toMatch(/^100 notes/);
    }, { timeout: 6000 });
    const kopf = graphKopf(container);
    expect(kopf!.textContent, "erfundene Menge aus eigener Seitenlänge").not.toMatch(/\bof\b/);
  });

  it("das Ende der Liste sagt, wie viel geladen ist und wie viel die Tür hält", async () => {
    const { container } = rahmen();
    await bestandGeda(container);
    // Die Zeile erscheint erst, wenn alles Geladene sichtbar ist — also erst
    // „Mehr laden" drücken, sonst prüft der Fall eine Zeile, die nie malt.
    const user = (await import("@testing-library/user-event")).default;
    const akt = user.setup();
    for (let i = 0; i < 6; i++) {
      const knopf = [...container.querySelectorAll("button")].find((b) => /Load more/i.test(b.textContent ?? ""));
      if (!knopf) break;
      await akt.click(knopf);
    }
    // P202: die Grenz-Zeile trägt ihre Marke — der Text-Heuristik-Pop über die
    // ganze Fläche traf andere „All"-Zeilen (Graph-Blende, Leiste).
    const zeile = container.querySelector('[data-testid="blatt-grenze"]')?.textContent?.trim();
    expect(zeile, "die Zeilengrenze erscheint nicht — Fall greift nicht").toBeTruthy();
    expect(zeile, "die Grenz-Zeile steht").not.toBe("");
    expect(zeile).toMatch(/14,702 notes saved/);
    expect(zeile, 'ein „All 100 notes shown" über einer Tür mit 14.702').not.toMatch(/All 100 notes shown/);
  });

  it("kein Zahlentext auf der Fläche steht deutsch zwischen englischen Sätzen", async () => {
    const { container } = rahmen();
    await bestandGeda(container);
    expect(container.textContent, 'deutsches „von" zwischen englischen Zeilen').not.toMatch(/\d+ von \d+/);
  });

  it("der Typ-Streifen und das Verhältnis nennen ihre Ladung, nicht den Bestand", async () => {
    const { container } = rahmen();
    await warteAuf(container, /in the 100 loaded/, "der Typ-Streifen nennt seine Ladung noch nicht");
    const text = container.textContent ?? "";
    // Die vier Typzahlen und das verhältnis unten können nur zählen, was liegt —
    // also müssen sie ihre eigene Ladung nennen, sonst liest der Mensch 100 als
    // Zusammensetzung von 14.702.
    expect(text).toMatch(/in the 100 loaded/);
    expect(text, "die Kategorien-Zelle zählt über die Ladung und nennt nur „tags'").toMatch(/tags in the 100 loaded/);
    expect(text).toMatch(/of \d+/);
    expect(text, "das Verhältnis klingt nach Bestand, meint die Seite").not.toMatch(/100 of 100 notes/);
  });

  it("die Tag-Zahlen in der Leiste sagen, über wie viele sie zählen", async () => {
    const { container } = rahmen();
    await warteAuf(container, /counts cover the 100 loaded notes/, "die Leiste erklärt ihre Zählbasis noch nicht");
    const text = container.textContent ?? "";
    expect(text, "die Leiste zählt Tags über die Ladung, sagt aber nicht, über wie viele").toMatch(/counts cover the 100 loaded notes/);
  });

  it("der Gehirn-Chip schreibt dieselbe Zahl im selben Kleid wie der Held", async () => {
    // Im eigenen Bildbefund (14.10.) stand über dem Rand „14,702 entries in the
    // index" und direkt darunter „14702 nodes in the brain". Eine Zahl, zwei
    // Kleider, ein Bildschirm — der Mensch hält sie für zwei Bestände.
    // P202, Mockup-Wortlaut: die Zeile sagt „14,702 notes, 7 tags" — dieselbe
    // Zahl, dasselbe Kleid (Tausenderpunkt), derselbe Bestand wie der Held.
    const { container } = rahmen();
    const chip = () => container.querySelector('[data-testid="gehirn-status"]');
    await waitFor(() => expect(chip()?.textContent).toMatch(/notes, /), { timeout: 6000 });
    expect(chip()!.textContent).toMatch(/14,702 notes, /);
    expect(chip()!.textContent, "dieselbe Größe ohne Tausenderpunkt").not.toMatch(/\b14702\b/);
  });

  it("schweigt die Tür, nennen Streifen, Verhältnis und Leiste wieder ihre eigene Zahl", async () => {
    const { refreshMemories } = await import("../../src/lib/store");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const ziel = String(url);
      if (ziel.includes("/api/memories")) return new Response(JSON.stringify(seitenseite), { status: 200, headers: { "content-type": "application/json" } });
      if (ziel.includes("/api/search")) return new Response(JSON.stringify({ results: [], total: 0 }), { status: 200 });
      if (ziel.includes("/api/graph")) return new Response(JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 });
      if (ziel.includes("/api/inbox/status")) return new Response(JSON.stringify({ inboxDir: "/x", files: [], watching: true }), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    const { container } = rahmen();
    const { act } = await import("@testing-library/react");
    await act(async () => { await refreshMemories(); });
    await waitFor(() => expect(container.textContent).toMatch(/100 of 100/), { timeout: 6000 });
    expect(container.textContent).not.toMatch(/in the [\d,]+ loaded/);
    expect(container.textContent).toMatch(/tags/);
    expect(container.textContent, "die Leiste erklärt eine Ladung, die sie nicht als solche nennt").not.toMatch(/counts cover the/);
  });
});
