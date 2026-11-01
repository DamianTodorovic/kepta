// @vitest-environment jsdom
// Punkt 5, vierter Schlag an der Flaeche: die Zahl zu der Wahl, die er wirklich trifft.
//
// Die Flaeche filtert Thema und Fach zusammen, und der Hinweistext im Leerlauf nannte bis
// hierher nur ein Fach allein oder ein Thema allein (`Dashboard.tsx:855-858` vorher).
// Zusammen — "Termine in Dokumenten" — schwieg sie, obwohl die Kreuztabelle der Tuer seit
// 3.2.108 genau diese Zelle kennt. An seinem echten Bestand ist das die einzige Wahl, die bei
// 92 eignen Notizen neben 20 972 gescannten Dateien ueberhaupt etwas zeigen kann.
//
// Dieser Fall haelt die Kette zusammen: Tuer -> Zustand -> die eine Zeile im Leerlauf. Die
// Rechenregel selbst liegt in tests/lib/auswahl-zahl.test.ts (acht Faelle, zuerst rot).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { Dashboard } from "../../src/components/Dashboard";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import { ToastProvider } from "../../src/components/ui/Toast";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger } from "../helfer/canvas";
import { TRAEGER_FRAGE, THEMA_FRAGE } from "../../src/lib/graphHierarchy";
import type { Memory } from "../../src/types";

let idZaehler = 0;
function note(over: Partial<Memory> = {}): Memory {
  const i = ++idZaehler;
  return {
    id: `m${i}`, userId: "local", title: `Notiz ${i}`, content: `Inhalt ${i}`,
    tags: [], type: "semantic", createdAt: Date.parse("2025-01-01"), updatedAt: Date.parse("2025-01-01"),
    ...over,
  };
}

// Die Tuer antwortet wie 3.2.108: Raender UND die Kreuztabelle. documents x events = 21 ist
// die Zelle, die der Leerlauf nennen muss, wenn "Files" und "Events" zusammen gewaehlt sind.
const TABELLE = {
  notes: { people: 0, projects: 0, events: 4, tasks: 0, guides: 0, links: 0 },
  files: { people: 0, projects: 0, events: 21, tasks: 0, guides: 0, links: 0 },
  code: { people: 0, projects: 0, events: 0, tasks: 0, guides: 0, links: 0 },
  daten: { people: 0, projects: 0, events: 0, tasks: 0, guides: 0, links: 0 },
  anderes: { people: 0, projects: 0, events: 0, tasks: 0, guides: 0, links: 0 },
};

function stubFetch() {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/api/memories/gruppen")) {
      return new Response(JSON.stringify({
        ok: true, bestand: 150, ohneThema: 120, ms: 12,
        traeger: { notes: 100, files: 30, code: 20, daten: 0, anderes: 0 },
        themen: { people: 5, projects: 9, events: 25, tasks: 1, guides: 2, links: 4 },
        themenNachTraeger: TABELLE,
        ohneThemaNachTraeger: { notes: 96, files: 9, code: 15, daten: 0, anderes: 0 },
      }), { status: 200 });
    }
    if (u.includes("/api/health")) return new Response(JSON.stringify({ ok: true, version: "3.2.108", count: 150 }), { status: 200 });
    if (u.includes("/api/license")) return new Response(JSON.stringify({ licensed: false }), { status: 200 });
    if (u.includes("/api/memor")) {
      // Eine einzige geladene Prosanotiz ohne Thema: "Files + Events" laeuft ins Leere.
      return new Response(JSON.stringify([note({ title: "Gedanke", content: "Frei getippt, keine Datei dahinter" })]), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }));
}

async function warteKnopf(container: HTMLElement, frage: string, text: string): Promise<HTMLButtonElement | undefined> {
  // Die Steuerungen sitzen hinter der ersten Antwort der Tuer, und der erste Fall zahlt den
  // kalten Start (gemessen 13:58: Fall 1 fand den Chip in 7,2 s nicht, Fall 2 denselben Chip
  // in 0,7 s; dieselbe Sonde ausserhalb von act() findet ihn nach 400 ms). Der Grund ist der
  // Griff, nicht die Zeit: ein Polling INNERHALB eines act()-Ruicks commitet erst am Ende,
  // also sieht es die eigene Antwort nie. waitFor ist genau dafuer da.
  let fund: HTMLButtonElement | undefined;
  await waitFor(() => {
    const gruppe = container.querySelector(`[aria-label="${frage}"]`);
    fund = gruppe
      ? ([...gruppe.querySelectorAll("button")] as HTMLButtonElement[])
          .find((b) => (b.textContent || "").trim() === text)
      : undefined;
    expect(fund, `der Chip "${text}" steht nicht in der Gruppe "${frage}"`).toBeTruthy();
  }, { timeout: 6000, interval: 50 });
  return fund;
}

async function klicke(container: HTMLElement, frage: string, text: string) {
  const knopf = await warteKnopf(container, frage, text);
  await act(async () => { knopf!.click(); await new Promise((r) => setTimeout(r, 160)); });
}

async function zeige() {
  const view = render(<ThemeProvider><AuthProvider><ToastProvider><Dashboard /></ToastProvider></AuthProvider></ThemeProvider>);
  await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
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

describe("Punkt 5: der Leerlauf nennt die Zelle der Wahl", () => {
  it("ein Fach allein nennt seine Randzahl (das konnte die Flaeche schon)", async () => {
    const { container } = await zeige();
    await klicke(container, TRAEGER_FRAGE, "Files");
    expect(container.textContent || "", "ein Fach allein nennt keine Zahl")
      .toContain("the store holds 30 of them");
  });

  it("ein Thema IN einem Fach nennt die Zelle der Kreuztabelle — nicht den Rand", async () => {
    const { container } = await zeige();
    await klicke(container, TRAEGER_FRAGE, "Files");
    await klicke(container, THEMA_FRAGE, "Events");
    const text = container.textContent || "";
    // 21 ist die Zelle files x events. 25 waere der Rand aller Termine - die alte, falsche Zahl.
    expect(text, `der Leerlauf nennt nicht die Zelle: ${text.slice(-260)}`).toContain("the store holds 21 of them");
    expect(text).not.toContain("the store holds 25 of them");
  });

  it("zwei Themen schweigen ueber der Zelle - die Vereinigung kann die Tabelle nicht summen", async () => {
    const { container } = await zeige();
    await klicke(container, THEMA_FRAGE, "Events");
    await klicke(container, THEMA_FRAGE, "Links");
    const text = container.textContent || "";
    // Weder 25 (Rand von events) noch 4 (Zelle notes x events) noch 21 (files x events) —
    // die Tabelle kennt die Vereinigung nicht, und eine Summe ueber Zeilen waehlt doppelt.
    for (const falsch of ["holds 25 of them", "holds 21 of them", "holds 4 of them"]) {
      expect(text, `zwei Themen nennen eine Zahl, die doppelt zaehlen muesste: ${falsch}`).not.toContain(falsch);
    }
  });
});
