// @vitest-environment jsdom
// Punkt 1 (Graph), 20.10. 15:3x MESZ — Aufgabe #42, die zweite Haelfte: der
// **sichtbare** Tiefen-Regler. Die Helfer `graphTiefeLesen` / `graphTiefeSchreiben`
// und die Marke `kepta_graph_depth` sind seit 3.2.26 im Baum (gemessen an
// `cde92e7`: Helfer :736/:746, Zustand :1293, `storage`-Hoerer :1295, URL :1306),
// aber die Marke hat **keinen Schreiber**: kein Geraet bedient sie, und ohne
// gesetzte Zahl bleibt die Flaeche auf dem Default 2 stehen. Ein Default, den
// niemand setzen kann, ist eine Ansage, keine Einstellung.
//
// VIER Faelle, in der Reihenfolge ihrer Beweiskraft: erst der Plan (crowdet das
// neue Glied keine bestehende Frage aus der Zeile?), dann das Geraet (ist es im
// Menue und zeigt es die gespeicherte Stufe?), dann der Schalt (schreibt es, und
// ruft die Flaeche danach wirklich tiefer?), dann die Klemme (erfindet sie eine
// funfte Stufe?).
//
// **Vor dem Schreiben nachgemessen, und das hat meinen ersten Entwurf geworfen:**
// bei 1 440 px **bleibt kein neues Glied in der Zeile** — die 14 bestehenden
// brauchen 1 868 px, die 15 brauchen 1 984 px, die Zeile haelt bei 1 440 px aber
// nur 9 (Rechnung der `BREITE_PX_GELIED`-Tabelle, 15:3x). Also steht die Tiefe
// **im „More"-Panel**, und dieser Fall prueft genau das — ein Fall, der
// `zeile).toContain("tiefe")` verlangt, ware fuer immer rot und damit wertlos.
//
// GEFAHREN-HINWEIS an die uebernehmende Hand: dieser Koerper ist **nicht gefahren**.
// Baumgriff war in dieser Runde gesperrt (kein Edit an `src/` und `tests/`), also
// ist das erwartete Rot **nicht gesehen**, sondern aus der Quelle abgeleitet:
// `grep -c "graph-schiene-tiefe" src/components/KnowledgeGraph.tsx` = **0** am
// Stand `cde92e7` (gemessen 15:33:xx). Der erste Lauf nach der Uebernahme ist die
// Messung, der zweite die Pruefung (`tests/doku-zahlen.test.ts`), und weil diese
// Datei **vier** Faelle neu bringt, zieht das Register (`tests` +4) im selben Schlag.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  KnowledgeGraph,
  leistePlan,
  RANG_FOLGE,
  graphTiefeLesen,
  graphTiefeSchreiben,
  GRAPH_TIEFE_DEFAULT,
  GRAPH_TIEFE_MIN,
  GRAPH_TIEFE_MAX,
} from "../../src/components/KnowledgeGraph";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger, setzeTheme } from "../helfer/canvas";
import type { Memory } from "../../src/types";

let setzeGroesse: (b: number, h: number) => void;
const rufe: string[] = [];

const notiz = (i: number): Memory => ({
  id: `n${i}`, userId: "local", title: `Notiz ${i}`, content: `Inhalt ${i} mit [[Begriff]]`,
  tags: ["garten"], type: "semantic",
  createdAt: Date.parse("2025-01-01"), updatedAt: Date.parse("2025-01-01"),
});

beforeEach(() => {
  installiereLeinwand();
  setzeGroesse = installiereResizeObserver(1132, 700);
  installiereZeiger();
  setzeTheme("dunkel");
  localStorage.clear();
  rufe.length = 0;
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
});

afterEach(() => { vi.unstubAllGlobals(); });

/** Die Flaeche, mit der Breite, die die Zeile meldet — Hausform aus `…leiste.test.tsx`. */
async function flaeche(breite: number) {
  const view = render(<KnowledgeGraph memories={[notiz(1), notiz(2), notiz(3)]} onSelectMemory={() => {}} />);
  await act(async () => { await new Promise((r) => setTimeout(r, 140)); });
  const bar = view.container.querySelector('[data-testid="graph-leiste"]') as HTMLElement;
  expect(bar, "die Zeile fehlt").toBeTruthy();
  Object.defineProperty(bar, "clientWidth", { value: breite + 16, configurable: true });
  await act(async () => {
    setzeGroesse(breite + 16, 700);
    await new Promise((r) => setTimeout(r, 80));
  });
  return view;
}

/** Das „More"-Panel aufmachen — dort steht bei diesen Breiten, was nicht hineinpasst. */
async function panelOeffnen(view: Awaited<ReturnType<typeof flaeche>>) {
  const mehr = view.container.querySelector('[data-testid="graph-mehr"]') as HTMLButtonElement;
  expect(mehr, "der More-Knopf fehlt").toBeTruthy();
  await act(async () => { fireEvent.click(mehr); });
  const panel = view.container.querySelector('[data-testid="graph-mehr-panel"]');
  expect(panel, "das More-Panel oeffnet sich nicht").toBeTruthy();
  return panel as HTMLElement;
}

const stufe = (panel: HTMLElement, n: number) =>
  Array.from(panel.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent?.trim() === String(n));
const aktiv = (panel: HTMLElement, n: number) => stufe(panel, n)?.getAttribute("aria-pressed") === "true";

describe("#42, sichtbar: die Flaeche hat einen Tiefen-Regler", () => {
  it("crowdet nicht: das neue Glied verdraengt keine bestehende Frage aus der Zeile", () => {
    expect(RANG_FOLGE).toContain("tiefe");
    for (const breite of [1440, 1132, 716, 512, 362]) {
      const mit = leistePlan(breite);
      const ohne = leistePlan(breite, RANG_FOLGE.filter((g) => g !== "tiefe"));
      expect(mit.zeile, `${breite} px: die Zeile hat sich veraendert`).toEqual(ohne.zeile);
      expect(mit.menue.length, `${breite} px: das Menue wuchs nicht um genau eins`).toBe(ohne.menue.length + 1);
      expect(mit.menue).toContain("tiefe");
    }
  });

  it("zeigt im Panel vier Stufen, und die gespeicherte ist die aktive", async () => {
    const view = await flaeche(1132);
    const panel = await panelOeffnen(view);
    const glied = panel.querySelector('[data-testid="graph-mehr-tiefe"]');
    expect(glied, "das Tiefen-Glied steht nicht im Panel").toBeTruthy();
    const gruppe = glied!.querySelector('[data-testid="graph-schiene-tiefe"]') as HTMLElement;
    expect(gruppe, "die Schiene fehlt").toBeTruthy();
    expect(gruppe.getAttribute("role")).toBe("group");
    expect(gruppe.getAttribute("aria-label")).toBe("Network depth");
    for (const n of [GRAPH_TIEFE_MIN, 2, 3, GRAPH_TIEFE_MAX]) {
      expect(stufe(panel, n), `Stufe ${n} fehlt`).toBeTruthy();
      expect(aktiv(panel, n), `Stufe ${n} ist nicht korrekt gestellt`).toBe(n === GRAPH_TIEFE_DEFAULT);
    }
  });

  it("schreibt die Marke, und die naechste Frage an die Tuer traegt genau diese Tiefe", async () => {
    const view = await flaeche(1132);
    expect(rufe.some((u) => /\/api\/graph\?depth=/.test(u)), "die Flaeche hat die Tuer nie gefragt").toBe(true);
    const panel = await panelOeffnen(view);
    await act(async () => { fireEvent.click(stufe(panel, 3)!); });
    expect(localStorage.getItem("kepta_graph_depth"), "der Knopf hat die Marke nicht geschrieben").toBe("3");
    expect(graphTiefeLesen()).toBe(3);
    expect(rufe.some((u) => u.includes("/api/graph?depth=3")), `kein Ruf mit depth=3, zuletzt ${rufe.slice(-3).join(" | ")}`).toBe(true);
  });

  it("erfindet keine funfte Stufe: Unsinn defaultet, und die URL bleibt in 1..4", async () => {
    localStorage.setItem("kepta_graph_depth", "fuenf");
    const view = await flaeche(1132);
    const panel = await panelOeffnen(view);
    expect(aktiv(panel, GRAPH_TIEFE_DEFAULT), "Unsinn in der Marke malt eine andre Stufe als den Default").toBe(true);
    expect(graphTiefeSchreiben(9)).toBe(GRAPH_TIEFE_MAX);
    await act(async () => { fireEvent.click(stufe(panel, GRAPH_TIEFE_MAX)!); });
    expect(aktiv(panel, GRAPH_TIEFE_MAX)).toBe(true);
    expect(rufe.some((u) => /\/api\/graph\?depth=[5-9]/.test(u)), "die URL fragt tiefer, als die Tuer kennt").toBe(false);
  });
});
