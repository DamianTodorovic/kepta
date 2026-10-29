// @vitest-environment jsdom
// Punkt 5, erster Schlag: die drei Achsen des Wissens brauchen drei verschiedene Fragen.
//
// Warum diese Datei existiert und kein Fall vorher: die Flaeche zaehlt unter dem Wort
// "where it came from" die TRAEGER (Notes / Files / Code, Dashboard.tsx:1815-1818 und :1829),
// waehrend dasselbe Wort im Graph die HERKUNFT meint ("Colour by where notes came from",
// KnowledgeGraph.tsx:5619; die Achse selbst: graphHerkunft.ts:47-51). Damian hat am
// 29.10. ein Bild genau dieser Zeile geschickt und die Gruppierung seines Wissens
// beanstandet. Ein Wort, das zwei Achsen nennt, ist keine Gruppierung, sondern ein
// Ratespiel - und die Marktzaehlung haelt fest, dass jedes der verglichenen Produkte seine
// erste Achse mit dem Wort benennt, das ihre Zahlen zaehlen
// (feldzug/belege-2910/markt/MARKT-FUNKTIONEN-GRUPPIERUNG-2910.md, Abschnitt E1).
//
// Die Gegenrichtung ist Teil des Auftrags: das Wort der Herkunft bleibt im Besitz der
// Herkunft. Ein Fall, der nur die eine Seite prueft, waere die Haelfte eines Beweises.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { Dashboard } from "../../src/components/Dashboard";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import { ToastProvider } from "../../src/components/ui/Toast";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger } from "../helfer/canvas";
import { TRAEGER_FRAGE, TRAEGER_FRAGE_SATZ, THEMA_FRAGE } from "../../src/lib/graphHierarchy";
import { HERKUNFT_FRAGE } from "../../src/lib/graphHerkunft";
import type { Memory } from "../../src/types";

vi.mock("../../src/lib/pdfText", () => ({
  pdfTextAusBuffer: vi.fn(async () => ""),
}));

let idZaehler = 0;
function note(over: Partial<Memory> = {}): Memory {
  const i = ++idZaehler;
  return {
    id: `m${i}`, userId: "local", title: `Notiz ${i}`, content: `Inhalt ${i}`,
    tags: [], type: "semantic", createdAt: Date.parse("2025-01-01"), updatedAt: Date.parse("2025-01-01"),
    ...over,
  };
}

function stubFetch() {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/api/memories/gruppen")) {
      return new Response(JSON.stringify({
        ok: true, bestand: 150,
        traeger: { notes: 100, files: 30, code: 20 },
        themen: { people: 5, projects: 9, events: 3, tasks: 1, guides: 2, links: 4 },
      }), { status: 200 });
    }
    if (u.includes("/api/health")) {
      return new Response(JSON.stringify({ ok: true, version: "3.2.92", count: 150 }), { status: 200 });
    }
    if (u.includes("/api/license")) {
      return new Response(JSON.stringify({ licensed: false }), { status: 200 });
    }
    if (u.includes("/api/memor")) {
      return new Response(JSON.stringify([
        note({ title: "Gedanke", content: "Frei getippt, keine Datei dahinter" }),
        note({ title: "Papier", content: "— Source: /tmp/b.md", tags: ["machine-scan"] }),
      ]), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }));
}

async function zeige() {
  const view = render(
    <ThemeProvider><AuthProvider><ToastProvider><Dashboard /></ToastProvider></AuthProvider></ThemeProvider>
  );
  await act(async () => { await new Promise((r) => setTimeout(r, 150)); });
  return view;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("ki_gehirn_wizard_dismissed", "1");
  idZaehler = 0;
  stubFetch();
  installiereLeinwand();
  installiereResizeObserver(1000, 700);
  installiereZeiger();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("Punkt 5: drei Achsen, drei Fragen", () => {
  it("kennt fuer jede Achse genau eine Frage in Menschensprache", () => {
    const fragen = [TRAEGER_FRAGE, THEMA_FRAGE, HERKUNFT_FRAGE];
    for (const f of fragen) {
      expect(typeof f, "eine Achse hat kein Wort — eine Zahl ohne Frage ist Schmuck").toBe("string");
      expect((f ?? "").length, "das Wort einer Achse ist leer").toBeGreaterThan(0);
    }
    // Drei verschiedene Worte, nicht drei Varianten eines Wortes.
    const norm = fragen.map((f) => f.toLowerCase().replace(/[^a-z ]/g, "").trim());
    expect(new Set(norm).size, `zwei Achsen nennen sich gleich: ${fragen.join(" | ")}`).toBe(3);
  });

  it("laesst das Wort der Herkunft bei der Herkunft und nimmt es dem Traeger weg", () => {
    expect(HERKUNFT_FRAGE.toLowerCase()).toMatch(/came from|where/);
    expect(TRAEGER_FRAGE.toLowerCase(), "der Traeger leiht sich das Wort der Herkunft").not.toMatch(/came from/);
    expect(TRAEGER_FRAGE_SATZ.toLowerCase(), "der Traeger leiht sich das Wort der Herkunft").not.toMatch(/came from/);
  });

  it("nennt die Traeger-Zahlen im Streifen bei ihrer eignen Frage", async () => {
    const { container } = await zeige();
    await waitFor(() => expect(container.textContent).toMatch(/the whole store/i), { timeout: 6000 });
    expect(container.textContent, `der Streifen steht unter falschem Wort: ${streifenWort(container)}`)
      .toMatch(/in what form · the whole store/);
    expect(container.textContent, "unter den Traeger-Zahlen steht wieder die Herkunfts-Frage")
      .not.toMatch(/where it came from · the whole store/);
  });

  it("fuehrt die Chips-Gruppe mit demselben Wort wie den Streifen", async () => {
    const { container } = await zeige();
    await waitFor(() => expect(container.textContent).toMatch(/the whole store/i), { timeout: 6000 });
    expect(screen.getByRole("group", { name: new RegExp(TRAEGER_FRAGE, "i") }),
      "die Traeger-Chips tragen ein andres Wort als ihre Zahlen oben").toBeTruthy();
    expect(screen.queryByRole("group", { name: /where it came from/i }),
      "eine Gruppe auf der Liste heisst weiter 'where it came from'").toBeNull();
  });
});

/** Der Satz unter den drei Traeger-Zahlen, falls er zu finden ist - fuer die Meldung. */
function streifenWort(container: HTMLElement): string {
  const zelle = [...container.querySelectorAll(".index-cell")].find((c) => /Notes|Files|Code/.test(c.textContent ?? ""));
  return zelle?.querySelector(".k")?.textContent ?? "(keine Zeile gefunden)";
}
