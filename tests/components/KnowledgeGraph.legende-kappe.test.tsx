// @vitest-environment jsdom
//
// Punkt 5, Heilung A — die Legende des Gangs darf ueber ihre Flaeche hinauswachsen.
//
// Gemessen am echten Bestand (21 066 Knoten, Tuer lesend, eignes Profil, Fassung 3.2.38):
// in der Tree-Ansicht sitzt das Regal IN der Legende, und mit zwei gesetzten Gruppen wuchs der
// Kasten auf **849 px in eine 608-px-Leinwand** bei 1024 x 768 und **1 053 px in 628 px** bei
// 390 x 844 (22:58 MESZ, `/tmp/p5-breite-p5/kappe-beweis.txt`). Die Spitze lag 252 px ueber der
// Leinwand (1024) und 476 px (390), und die Gruppen-Steuerung `graph-farbgruppe` sass bei 390 px
// bei y -84..-40 — **ausserhalb des Fensters**, also fuer keine Hand zu erreichen.
//
// Die Kappe, die dieser Koerper setzt, ist am selben Fenster gemessen, nicht behauptet
// (23:04 MESZ, `kappe-beweis-4.txt`, und 23:06 MESZ, `rollen-beweis.txt`):
// - Kasten 849 px -> **584 px** (1024) und 1 053 px -> **604 px** (390);
// - die Steuerung liegt danach bei y 353..397 (1024) und y 365..409 (390) — **im Fenster**;
// - der Panel rollt wirklich: Rad in seiner Mitte 0 -> scrollTop **240**, vier echte
//   `ArrowDown` auf dem fokussierten Kasten 240 -> **265**, mechanisch gesetzt 240;
// - die Hand bleibt nicht tot: vor der Kappe nennt `document.elementFromPoint` in dem Kasten
//   `graph-canvas` (sie geht durch), nach der Kappe `graph-kopf` (der Kasten nimmt sie an), und
//   **ausserhalb** des Kastens bewegt das Rad die Zoomzahl weiter (37 % -> 41 %, beide Groessen).
//
// Warum diese Datei die Gegen-Wache aus 3.2.34 aufnimmt: ihr dritter Fall verbot diesem Koerper,
// den ganzen Panel treffbar zu machen, damit Pan und Zoom unter dem Regal nicht sterben. Die
// Leitung hat die Entscheidung uebernommen und die Wache **bewegt**, nicht umgeschrieben
// (Brief 22:45 MESZ): der Panel nimmt die Hand jetzt an, und der Schutz, der ihm Recht gab, sitzt
// an der Stelle, die er wirklich schuetzt — der Leinwand selbst (Fall 3 unten). Die zwei echten
// Eigenschaften aus 3.2.34 (der Korb-Knopf nimmt Zeiger an, seine Liste bleibt im Bild) bleiben
// in `GraphRegal.korb-ist-treffbar.test.tsx` stehen.
//
// **Vorher rot, gemessen:** gegen den committeten Stand `638e95f` (3.2.38) ohne diesen Koerper —
// die Legende hat dort weder Obergrenze noch Rolle noch eigne Zeiger-Eigenschaft, ihr class-Attribut
// traegt `pointer-events-none`. Uhrzeit und Zahl stehen im Feldzug-Block und in
// `audit-2026-10-09/feldzug/p5-kappe-2210.md`.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render } from "@testing-library/react";
import { KnowledgeGraph } from "../../src/components/KnowledgeGraph";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger, setzeTheme } from "../helfer/canvas";
import type { Memory } from "../../src/types";

const BREITE = 1440;
const HOEHE = 700;

const notiz = (id: string, titel: string, tags: string[]): Memory =>
  ({
    id,
    userId: "local",
    title: titel,
    content: `Inhalt von ${titel}`,
    tags,
    type: "reference",
    createdAt: Date.parse("2024-01-01"),
    updatedAt: Date.parse("2024-01-01"),
  }) as Memory;

function bestand(): Memory[] {
  return [
    notiz("g1", "Beet eins", ["garten"]),
    notiz("g2", "Beet zwei", ["garten", "werkstatt"]),
    notiz("g3", "Beet drei", ["garten"]),
    notiz("w1", "Werkstatttag", ["werkstatt"]),
    notiz("o1", "Ohne Marke", []),
  ];
}

function begriffe() {
  const entities = [{ id: 1, name: "Beet" }, { id: 2, name: "Werkstatt" }];
  const relations: unknown[] = [];
  const traeger: Record<string, string[]> = { Beet: ["g1", "g2", "g3"], Werkstatt: ["g2", "w1"] };
  for (const [name, ids] of Object.entries(traeger)) {
    for (const id of ids) relations.push({ id: `r-${name}-${id}`, source: name, target: name, relation: "mentions", memoryId: id });
  }
  return { entities, relations, memoriesByEntity: traeger, bestand: { knoten: entities.length, kanten: relations.length } };
}

beforeEach(() => {
  installiereLeinwand();
  installiereZeiger();
  setzeTheme("dunkel");
  localStorage.clear();
  localStorage.setItem("kepta_tag_gruppen", JSON.stringify({ marken: ["garten", "werkstatt"], farben: {} }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("style");
});

/** Die Flaeche im Baum-Modus: nur dort sitzt das Regal in der Legende, und nur dort wuchs sie. */
async function flaeche() {
  const setzeGroesse = installiereResizeObserver(BREITE, HOEHE);
  localStorage.setItem("kepta_graph_view", "dendrogram");
  const leib = begriffe();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) =>
      new Response(String(url).startsWith("/api/graph?") ? JSON.stringify(leib) : JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 })
    )
  );
  const view = render(<KnowledgeGraph memories={bestand()} onSelectMemory={vi.fn()} />);
  await act(async () => {
    for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 50));
  });
  await act(async () => {
    setzeGroesse(BREITE, HOEHE);
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 50));
  });
  return view;
}

const knoten = (view: Awaited<ReturnType<typeof flaeche>>, kennung: string) =>
  view.container.querySelector(`[data-testid="${kennung}"]`) as HTMLElement | null;

describe("Heilung A — die Legende des Gangs ist begrenzt, rollt und nimmt die Hand an", () => {
  it("traegt eine Hoehe-Kappe und eigne Rolle, damit die Spitze nicht ueber der Leinwand liegt", async () => {
    const view = await flaeche();
    const le = knoten(view, "graph-legende");
    expect(le, "die Legende fehlt an der Flaeche").toBeTruthy();
    const kappe = (le as HTMLElement).style.maxHeight;
    expect(kappe, "die Legende hat keine Obergrenze — sie waechst ueber ihre Flaeche hinaus").not.toBe("");
    expect(["auto", "scroll"]).toContain((le as HTMLElement).style.overflowY);
  });

  it("nimmt die Hand an, und `pointer-events-none` steht nicht mehr an ihr", async () => {
    const view = await flaeche();
    const le = knoten(view, "graph-legende") as HTMLElement;
    expect(le.style.pointerEvents, "ohne eigne Zeiger-Eigenschaft rollt niemand den Kasten").toBe("auto");
    expect(le.className.includes("pointer-events-none"), "die Klasse waere ein Rueckweg fuer die alte Sperre").toBe(false);
  });

  /**
   * Der Schutz, den die Wache aus 3.2.34 meinte, an dem Ort, der ihn wirklich braucht: die
   * Leinwand muss die Hand behalten, sonst ist mit dem Panel auch Pan und Zoom fort.
   */
  it("laesst der Leinwand ihre Hand — Pan und Zoom wohnen nicht im Panel", async () => {
    const view = await flaeche();
    const cv = knoten(view, "graph-canvas") as HTMLElement;
    expect(cv, "die Leinwand fehlt").toBeTruthy();
    expect(cv.style.pointerEvents || "keine eigne").not.toBe("none");
    expect(cv.className.includes("pointer-events-none")).toBe(false);
  });
});
