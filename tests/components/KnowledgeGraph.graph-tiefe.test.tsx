// @vitest-environment jsdom
// Punkt 1 (Graph), 20.10. — Aufgabe #42: die Tür kann eine Tiefe, die Fläche fragte
// hart nach `depth=2` (KnowledgeGraph.tsx:1253 am Stand 69836f2). Die Tür liest
// `?depth=`, klemmt auf 1..4 und defaultet 2 (`server/router/system.ts:62-64`), die
// MCP-Tür wirbt ebenso (`src/core/mcp.ts:206`). Ein Default, zwei Verbraucher, eine
// Klemme — also darf die Fläche nicht tiefer oder flacher gehen als die Tür selbst.
//
// GEFAHREN-HINWEIS an die nächste Hand: dieser Flicken ist **nicht** gefahren (kein
// Gate in der Runde, Baumgriff gesperrt). Der erste Lauf nach der Übernahme ist die
// Messung, der zweite die Prüfung (`tests/doku-zahlen.test.ts`), und weil die Datei
// zwei Fälle neu bringt, zieht das Register (README, drei Träger) im selben Schlag.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import {
  KnowledgeGraph,
  graphTiefeLesen,
  graphTiefeSchreiben,
  GRAPH_TIEFE_DEFAULT,
  GRAPH_TIEFE_MIN,
  GRAPH_TIEFE_MAX,
} from "../../src/components/KnowledgeGraph";
import { installiereResizeObserver, installiereLeinwand, installiereZeiger, setzeTheme } from "../helfer/canvas";
import type { Memory } from "../../src/types";

const notiz = (i: number): Memory => ({
  id: `n${i}`, userId: "local", title: `Notiz ${i}`, content: `Inhalt ${i} mit [[Begriff]]`,
  tags: ["garten"], type: "semantic",
  createdAt: Date.parse("2025-01-01"), updatedAt: Date.parse("2025-01-01"),
});

/** Zählt, mit welcher Tiefe die Fläche die Tür wirklich ruft. */
function türAufzeichnen() {
  const rufe: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const ziel = String(url);
    rufe.push(ziel);
    if (ziel.includes("/api/graph/nachzug")) {
      return new Response(JSON.stringify({ needed: false, running: false, phase: "done", seen: 0, total: 0, concepts: 0, edges: 0, addedConcepts: 0, addedUfers: 0, addedEdges: 0, error: null }), { status: 200 });
    }
    if (ziel.includes("/api/graph")) {
      return new Response(JSON.stringify({ relations: [], memoriesByEntity: {}, bestand: { knoten: 3, notizen: 3, begriffe: 0, kanten: 0 } }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }));
  return rufe;
}

async function zeichne() {
  const view = render(<KnowledgeGraph memories={[notiz(1), notiz(2), notiz(3)]} onSelectMemory={() => {}} />);
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  return view;
}

describe("#42: die Flaeche fragt die Tiefe, die die Tuer kennt", () => {
  beforeEach(() => {
    localStorage.clear();
    setzeTheme("dunkel");
    installiereLeinwand();
    installiereResizeObserver();
    installiereZeiger();
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("liest ohne Marke den Default der Tuer — 2, nicht erfunden", () => {
    expect(graphTiefeLesen()).toBe(GRAPH_TIEFE_DEFAULT);
    expect(GRAPH_TIEFE_DEFAULT).toBe(2);
  });

  it("klemmt wie die Tuer: 9 wird 4, 0 wird 1, Unsinn bleibt der Default", () => {
    expect(graphTiefeSchreiben(9)).toBe(GRAPH_TIEFE_MAX);
    expect(graphTiefeLesen()).toBe(GRAPH_TIEFE_MAX);
    expect(graphTiefeSchreiben(0)).toBe(GRAPH_TIEFE_MIN);
    expect(graphTiefeLesen()).toBe(GRAPH_TIEFE_MIN);
    localStorage.setItem("kepta_graph_depth", "fuenf");
    expect(graphTiefeLesen()).toBe(GRAPH_TIEFE_DEFAULT);
  });

  it("fragt die Tuer mit der gespeicherten Tiefe, nicht mit 2", async () => {
    const rufe = türAufzeichnen();
    graphTiefeSchreiben(3);
    await zeichne();
    const graph = rufe.filter((u) => u.includes("/api/graph?"));
    expect(graph.length, "die Flaeche hat die Tuer nie nach dem Netz gefragt").toBeGreaterThan(0);
    expect(graph[0], `die Flaeche fragt weiter starr: ${graph[0]}`).toContain("depth=3");
    expect(graph[0]).not.toContain("depth=2");
  });

  it("laesst die Klemme nicht die Flaeche erfinden — 7 kommt nie in der URL vor", async () => {
    const rufe = türAufzeichnen();
    localStorage.setItem("kepta_graph_depth", "7");
    await zeichne();
    const graph = rufe.filter((u) => u.includes("/api/graph?"));
    expect(graph.length).toBeGreaterThan(0);
    expect(graph[0]).toContain(`depth=${GRAPH_TIEFE_MAX}`);
  });
});
