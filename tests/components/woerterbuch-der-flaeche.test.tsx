// @vitest-environment jsdom
// Punkt 7, 2.11. — das Woerterbuch der Flaeche, gehalten am GEMALTEN Wort.
//
// Zwei unabhaengige Erstleser des gemalten Korpus (P7-LESE-TEST-0211.md) haben beide dasselbe
// gefunden: dieselbe Sache hat auf dieser Flaeche sechs Namen — entry, entries, note, node,
// memory node, "the whole store". Ein Nutzer, der nicht weiss, wie sein gespeichertes Ding heisst,
// kann auch nicht das finden, was er eben gespeichert hat. Der Beschluss steht in
// P7-WOERTERBUCH-0211.md: **note** fuer das Einzelstueck, **your notes** fuer alles Gespeicherte,
// **search index** fuer die Struktur dahinter.
//
// Warum diese Datei das gemalte Wort prueft und nicht den Quelltext: ein grep ueber `src/` sieht
// auch die Code-Stellen, die ihr Recht haben (`Object.entries`, ein API-Feld `entries`, der
// lokale Variablennamen), und er sieht keinen Satz, den zwei Bausteine zusammenbauen. Was der
// Nutzer liest, steht in `textContent`.
//
// Zwei Ausnahmen, beide benannt, damit sie nicht als Vergessen gelesen werden:
//   * Die Activity-Flaeche zaehlt **Log**-Eintraege. Ein Protokoll hat entries, und diese Datei
//     rendert die Activity-Flaeche bewusst nicht.
//   * Auf der Graph-Flaeche ist "node" das gemalte Bild, nicht die gespeicherte Sache. Die
//     Graph-Saetze werden hier an ihren Funktionen gehalten, nicht an der Leinwand.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { Dashboard } from "../../src/components/Dashboard";
import { Sidebar } from "../../src/components/Sidebar";
import { Settings } from "../../src/components/Settings";
import { Chat } from "../../src/components/Chat";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import { ToastProvider } from "../../src/components/ui/Toast";
import { kopfLadeSatz, kopfFensterSatz } from "../../src/components/KnowledgeGraph";
import { installiereLeinwand, installiereResizeObserver } from "../helfer/canvas";
import type { Memory } from "../../src/types";

const VERBOTEN: Array<[RegExp, string]> = [
  [/\bentries?\b/, "ein gespeichertes Ding heisst note, nicht entry"],
  [/memory node/i, "ein gespeichertes Ding heisst note, nicht memory node"],
  [/the whole store/i, "alles Gespeicherte heisst your notes, nicht the whole store"],
  [/\bin the index\b/, "die Suchstruktur heisst search index, nicht index allein"],
  [/\bin the store\b/, "alles Gespeicherte heisst your notes, nicht the store — 3.2.115"],
];

function notiz(i: number): Memory {
  return {
    id: `m${i}`, userId: "local", title: `Frist ${i}`, content: `Die Frist ${i} haelt die Kasse.`,
    tags: ["saat"], type: "semantic", createdAt: Date.parse("2025-01-01"), updatedAt: Date.parse("2025-01-01"),
  };
}
const SEITE = Array.from({ length: 4 }, (_, i) => notiz(i + 1));

function stubpeTuer() {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const ziel = String(url);
    if (ziel.includes("/api/memories/gruppen")) {
      return new Response(JSON.stringify({
        bestand: SEITE.length, ohneThema: SEITE.length, ms: 4,
        traeger: { notes: SEITE.length, files: 0, code: 0, daten: 0, anderes: 0 },
        themen: { people: 0, projects: 0, events: 0, tasks: 0, guides: 0, links: 0 },
        themenNachTraeger: {}, ohneThemaNachTraeger: {},
      }), { status: 200 });
    }
    if (ziel.includes("/api/memories")) {
      return new Response(JSON.stringify({ count: SEITE.length, total: SEITE.length, memories: SEITE }), {
        status: 200, headers: { "content-type": "application/json", "x-kepta-total": String(SEITE.length) },
      });
    }
    if (ziel.includes("/api/search")) return new Response(JSON.stringify({ results: [], total: 0 }), { status: 200 });
    if (ziel.includes("/api/graph")) return new Response(JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 });
    if (ziel.includes("/api/graph/nachzug")) return new Response(JSON.stringify({ running: false, concepts: 0, edges: 0 }), { status: 200 });
    if (ziel.includes("/api/inbox/status")) return new Response(JSON.stringify({ inboxDir: "/x", files: [], watching: true }), { status: 200 });
    if (ziel.includes("/api/health")) {
      return new Response(JSON.stringify({
        ok: true, version: "3.2.114", count: SEITE.length, uptime: 12, encryption: { aktiv: true },
        embeddings: { total: 8, embedded: 8, models: { "bge-m3": 8 } }, mcp: { tools: 8, protocol: "2026-07-28" },
      }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true, models: [], tools: [], entries: [], servers: [] }), { status: 200 });
  }));
}

/** Ein Text, der dem Nutzer gezeigt wurde. Leere Flaeche laesst die Wache nicht durch. */
async function gemalterText(baustein: React.ReactElement, merken: RegExp) {
  const { container } = render(baustein);
  await waitFor(() => expect(container.textContent).toMatch(merken), { timeout: 8000 });
  return (container.textContent || "").replace(/\s+/g, " ");
}

const inOrdnung = (text: string, wo: string) => {
  for (const [muster, grund] of VERBOTEN) {
    const treffer = text.match(muster);
    expect(treffer, `${wo}: "${treffer?.[0]}" — ${grund}\n  ${text.slice(0, 300)}`).toBeNull();
  }
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("ki_gehirn_wizard_dismissed", "1");
  installiereLeinwand();
  installiereResizeObserver(1200, 800);
  stubpeTuer();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("Punkt 7: die Flaeche spricht in einem Woerterbuch", () => {
  it("Knowledge nennt das gespeicherte Ding note", async () => {
    const text = await gemalterText(
      <ThemeProvider><AuthProvider><ToastProvider><Dashboard /></ToastProvider></AuthProvider></ThemeProvider>,
      /notes?/,
    );
    inOrdnung(text, "Knowledge");
    expect(text, `die Knowledge-Zeile zaehlt nichts: ${text.slice(0, 200)}`).toMatch(/4 notes/);
  });

  it("die Seitenleiste nennt das gespeicherte Ding note", async () => {
    const text = await gemalterText(
      <ThemeProvider><AuthProvider><Sidebar
        tags={[{ tag: "saat", count: SEITE.length }]}
        selectedTags={[]}
        onSelectTag={() => {}}
        onClearTags={() => {}}
        currentView="memories"
        onNavigate={() => {}}
        totalMemories={SEITE.length}
        isFocusMode={false}
        toggleFocusMode={() => {}}
      /></AuthProvider></ThemeProvider>,
      /4 notes/,
    );
    inOrdnung(text, "Sidebar");
  });

  it("die Einstellungen nennen das gespeicherte Ding note", async () => {
    const text = await gemalterText(<ToastProvider><Settings /></ToastProvider>, /Auto-learn/i);
    inOrdnung(text, "Settings");
  });

  it("der Chat nennt das gespeicherte Ding note", async () => {
    const text = await gemalterText(<ToastProvider><Chat activeMemories={SEITE} /></ToastProvider>, /Chat/);
    inOrdnung(text, "Chat");
  });

  it("die zwei Graph-Saetze an ihren Funktionen: kein entry, kein whole store", () => {
    for (const satz of [kopfLadeSatz("kommt"), kopfLadeSatz("fort"), kopfFensterSatz(true)]) {
      expect(satz, "eine Funktion liefert keinen Satz — die Wache prueft ins Leere").not.toBe("");
      inOrdnung(satz, `Graph-Kopf "${satz}"`);
    }
  });

  it("KONTROLLE: die Wache schlaegt wirklich, wenn ein verbotenes Wort gemalt wird", () => {
    // Ohne diesen Fall kann die Wache graen bleiben, weil keine der Flaechen ueberhaupt Text
    // liefert (dasselbe Muster wie #106: ein Marker, den kein Verbraucher trifft, ist kahl).
    expect(() => inOrdnung("100 entries in the index", "Faelschung")).toThrow();
    expect(() => inOrdnung("100 notes of 14,702 in the store", "Faelschung II")).toThrow();
    expect(() => inOrdnung("4 notes in the search index", "Falsch-Positiv-Kontrolle")).not.toThrow();
  });
});
