// @vitest-environment jsdom
// Punkt 7, 2.11. — dieselbe Zahl, zwei Worte, in einem Anblick.
//
// Am ausgelieferten 3.2.115 (Bild `belege-0211/landung-115/saetze/saetze-korpus.png`, selbst
// gesehen 09:06) sagt die Seitenleiste "30 notes", dieselbe Wissens-Flaeche zwei Zellen weiter
// "30 nodes in the brain", und die Zustands-Tafel der Einstellungen heisst
// "Brain (SQLite + engine) — 30 nodes · /tmp/… · MCP 2026-07-28 (8 tools, /mcp)". Drei Redewisen
// fuer eine Zahl. Leser 1 hatte das ohne Projektkenntnis so notiert: "'30 nodes in the brain' —
// the notes? 'nodes' is graph language."
//
// Die Woerterbuch-Wache (3.2.114) verbot bereits entry/memory node/the whole store/in the store/
// in the index — "node" als Name fuer die gespeicherte Sache fehlte, weil der Graph das Wort zu
// Recht fuer sein **gemaltes Bild** benutzt. Diese Datei zieht die Grenze: ein Knoten im Bild
// bleibt ein node, eine gespeicherte Notiz ist keine.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { SystemStatus } from "../../src/components/SystemStatus";
import { Dashboard } from "../../src/components/Dashboard";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import { ToastProvider } from "../../src/components/ui/Toast";
import { installiereLeinwand, installiereResizeObserver } from "../helfer/canvas";
import type { Memory } from "../../src/types";

const GESUND = {
  ok: true, version: "3.2.117", count: 412, dbPath: "/Users/a/.kepta/kepta.db",
  encryption: { aktiv: true, ablage: "macOS Keychain" },
  embeddings: { total: 800, embedded: 600, models: {} },
  mcp: { protocol: "2026-07-28", tools: 8, http: "/mcp" },
};

function stubFetch() {
  const notizen: Memory[] = Array.from({ length: 3 }, (_, i) => ({
    id: `m${i}`, userId: "local", title: `Frist ${i}`, content: `Die Frist ${i} haelt die Kasse.`,
    tags: [], type: "semantic" as const, createdAt: Date.parse("2025-01-01"), updatedAt: Date.parse("2025-01-01"),
  }));
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const ziel = String(url);
    if (ziel.includes("/api/health")) return new Response(JSON.stringify(GESUND), { status: 200 });
    if (ziel.includes("/api/memories/gruppen")) {
      return new Response(JSON.stringify({
        ok: true, bestand: notizen.length, ohneThema: notizen.length, ms: 2,
        traeger: { notes: notizen.length, files: 0, code: 0, daten: 0, anderes: 0 },
        themen: { people: 0, projects: 0, events: 0, tasks: 0, guides: 0, links: 0 },
      }), { status: 200 });
    }
    if (ziel.includes("/api/memories")) {
      return new Response(JSON.stringify({ count: notizen.length, total: notizen.length, memories: notizen }), {
        status: 200, headers: { "content-type": "application/json", "x-kepta-total": String(notizen.length) },
      });
    }
    return new Response(JSON.stringify({ ok: true, results: [], total: 0, relations: [], memoriesByEntity: {}, files: [] }), { status: 200 });
  }));
}

/** Die Zeile einer Beschriftung: Blatt mit dem Label plus das Detail darunter. */
function zeile(anfang: RegExp, wurzel: ParentNode): string {
  const blatt = [...wurzel.querySelectorAll("div")].find((d) => d.children.length === 0 && anfang.test((d.textContent || "").trim()));
  return blatt?.parentElement?.textContent ?? "";
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("ki_gehirn_wizard_dismissed", "1");
  installiereLeinwand();
  installiereResizeObserver(1200, 800);
  stubFetch();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Punkt 7: eine Zahl, ein Wort — auch in der Zustands-Tafel", () => {
  it("nennt die Kern-Zeile nicht mehr das Gehirn und nicht mehr nodes", async () => {
    const { container } = render(<SystemStatus />);
    await waitFor(() => expect(container.textContent).toMatch(/412/), { timeout: 8000 });
    const text = (container.textContent || "").replace(/\s+/g, " ");
    expect(text, `die Tafel heisst weiter Brain: ${text.slice(0, 400)}`).not.toMatch(/Brain \(SQLite/i);
    expect(text, `die Tafel zaehlt nodes, wo die Seitenleiste notes zaehlt: ${text.slice(0, 400)}`)
      .not.toMatch(/\b412 nodes\b/);
    expect(text, `die Notizen fehlen als Wort: ${text.slice(0, 400)}`).toMatch(/412 notes/i);
  });

  it("erklaert die Deckung ohne das Wort embedding", async () => {
    const { container } = render(<SystemStatus />);
    await waitFor(() => expect(container.textContent).toMatch(/75|coverage|meaning/), { timeout: 8000 });
    const basis = zeile(/^Knowledge base/i, container);
    expect(basis, `die Wissensbasis-Zeile fehlt: "${basis}"`).not.toBe("");
    expect(basis, `Fachwort ohne Nutzerwort: ${basis}`).not.toMatch(/embedding coverage/i);
    expect(basis, `die Zahl nennt nicht, was sie zulaesst: ${basis}`).toMatch(/searchable by meaning/i);
  });

  // 3.2.118, die zwei Funde, die der gemalte Korpus des ausgelieferten 3.2.117 noch zeigt
  // (belege-0211/zustands-tafel/nach-landung/saetze-korpus-1440px.json, Stand 12:28:56Z):
  // eine Zeile, die aus Erreichbarkeit einen Einsatz behauptet, und eine Ueberschrift, die
  // "brain" sagt, wo die Seitenleiste "notes" sagt.
  it("behauptet keinen Vektor-Einsatz aus der Erreichbarkeit von Ollama", async () => {
    const { container } = render(<SystemStatus />);
    await waitFor(() => expect(container.textContent).toMatch(/Ollama/), { timeout: 8000 });
    const ollama = zeile(/^Ollama \/ Embeddings/i, container);
    expect(ollama, `die Ollama-Zeile fehlt: "${ollama}"`).not.toBe("");
    expect(ollama, `erreichbar wird als Einsatz gemalt: ${ollama}`).not.toMatch(/vector search active/i);
    expect(ollama, `die Zeile nennt nicht, wo die Zahl steht: ${ollama}`).toMatch(/how many of your notes have a vector/i);
  });

  it("ueberschreibt den MCP-Kasten ohne das Wort brain", async () => {
    const { container } = render(<SystemStatus />);
    await waitFor(() => expect(container.textContent).toMatch(/Copy config|Copied/i), { timeout: 8000 });
    const text = (container.textContent || "").replace(/\s+/g, " ");
    expect(text, `der Kasten heisst weiter brain: ${text.slice(0, 400)}`).not.toMatch(/your brain for/i);
    expect(text, `der Kasten sagt nicht, wofuer er da ist: ${text.slice(0, 400)}`).toMatch(/Connect Claude Desktop and Cursor/i);
  });

  it("malt auf der Wissens-Flaeche notes statt nodes in the brain", async () => {
    const { container } = render(
      <ThemeProvider><AuthProvider><ToastProvider><Dashboard /></ToastProvider></AuthProvider></ThemeProvider>
    );
    const streifen = await waitFor(() => {
      const e = container.querySelector('[data-testid="gehirn-status"]');
      if (!e) throw new Error("kein Status-Streifen");
      if (!/412/.test(e.textContent || "")) throw new Error("die Zahl ist noch nicht da");
      return e;
    });
    const text = (streifen.textContent || "").replace(/\s+/g, " ");
    expect(text, `der Streifen sagt weiter nodes in the brain: ${text}`).not.toMatch(/nodes in the brain/i);
    expect(text, `der Streifen nennt die Notizen nicht: ${text}`).toMatch(/412 notes/i);
  });
});
