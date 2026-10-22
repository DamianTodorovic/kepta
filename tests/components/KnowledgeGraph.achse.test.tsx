// @vitest-environment jsdom
//
// Punkt 5, Schlag 22.10. abends, zweite Haelfte — der Gang spricht die Sprache des Regals.
//
// Der Auftrag in einem Satz: die drei Baender des Regals und die Achsen des Gangs muessen
// dieselbe Sprache sprechen, und die Zahl, die das Regal nennt, muss die Zahl des Gangs sein.
// Bewiesen wird das hier an EINEM Lauf mit BEIDEN Flaechen: dasselbe Rendering, das Regal im
// Baum-Modus gemountet, der Gang darunter — und die zwei Texte werden gegeneinander gerechnet,
// nicht gegen meine Erwartung.
//
// Vorher rot, gefahren gegen `813db8e` (3.2.36): der Gang nennt seinen Knopf "Groups" und einen
// Stand mit "carry a group you made"; das Regal nennt "grouped by your tags". Zwei Wörter für
// eine Sache, und keine der beiden Flaechen nennt die Mensch-Frage.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { KnowledgeGraph } from "../../src/components/KnowledgeGraph";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger, setzeTheme } from "../helfer/canvas";
import { ACHSEN } from "../../src/lib/gruppen";
import type { Memory } from "../../src/types";

let setzeGroesse: (b: number, h: number) => void;

const notiz = (id: string, tags: string[], text: string): Memory =>
  ({ id, userId: "local", title: id, content: text, tags, createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000 } as Memory);

function bestand(): Memory[] {
  return [
    notiz("a", ["werkstatt"], "Plan fuer die Werkstatt — Projekt und Frist"),
    notiz("b", ["werkstatt"], "Werkstatt: was fehlt — Projekt"),
    notiz("c", ["anna", "werkstatt"], "Gespraech mit Anna ueber die Werkstatt"),
    notiz("d", ["bert"], "Bert hat angerufen"),
    notiz("e", [], "Ein Gedanke ohne Marke"),
  ];
}

function begriffe() {
  const traeger: Record<string, string[]> = { Werkstatt: ["a", "b", "c"], Anna: ["c"], Bert: ["d"] };
  const relations: unknown[] = [];
  for (const [name, ids] of Object.entries(traeger)) {
    for (const id of ids) relations.push({ id: `r-${name}-${id}`, source: name, target: name, relation: "mentions", memoryId: id });
  }
  return {
    entities: Object.keys(traeger).map((name, i) => ({ id: i + 1, name })),
    relations,
    memoriesByEntity: traeger,
    bestand: { knoten: Object.keys(traeger).length, kanten: relations.length },
  };
}

beforeEach(() => {
  installiereLeinwand();
  setzeGroesse = installiereResizeObserver(1440, 700);
  installiereZeiger();
  setzeTheme("dunkel");
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("style");
});

/** Baum-Ansicht, damit das Regal im selben Lauf gemountet ist wie der Gang. */
async function flaeche(marken: string[]) {
  localStorage.setItem("kepta_graph_view", "dendrogram");
  localStorage.setItem("kepta_tag_gruppen", JSON.stringify({ marken, farben: {} }));
  const leib = begriffe();
  vi.stubGlobal("fetch", vi.fn(async (url: unknown) =>
    new Response(String(url).startsWith("/api/graph?") ? JSON.stringify(leib) : JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 })));
  const view = render(<KnowledgeGraph memories={bestand()} onSelectMemory={vi.fn()} />);
  await act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 60)); });
  const bar = view.container.querySelector('[data-testid="graph-leiste"]') as HTMLElement;
  expect(bar, "die Zeile fehlt").toBeTruthy();
  Object.defineProperty(bar, "clientWidth", { value: 1440, configurable: true });
  await act(async () => { setzeGroesse(1440, 700); for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 60)); });
  return view;
}

const text = (view: Awaited<ReturnType<typeof flaeche>>, kennung: string) =>
  (view.container.querySelector(`[data-testid="${kennung}"]`) as HTMLElement | null)?.textContent ?? "";

/** Die erste Zahl einer "N of M"-Stelle — 0, wenn der Text sie nicht nennt. */
function ersteZahl(t: string): number {
  const m = t.replace(/\s/g, "").match(/(\d+)of(\d+)/u);
  return m ? Number(m[1]) : 0;
}

describe("achse: der Gang spricht die Sprache des Regals", () => {
  it("beide Flaechen nennen dieselbe Achsen-Frage", async () => {
    const view = await flaeche(["werkstatt"]);
    const regal = text(view, "regal-farbgruppe");
    const gang = text(view, "graph-farbgruppe-stand");
    expect(regal, "das Regal mountet nicht").not.toBe("");
    expect(gang, "der Gang nennt keinen Stand").not.toBe("");
    const frage = ACHSEN.find((a) => a.id === "arbeit")?.frage ?? "";
    expect(frage.length, "die Achsen-Objekte fehlen").toBeGreaterThan(0);
    expect(regal, "das Regal nennt die Mensch-Frage nicht").toContain(frage);
    expect(gang, "der Gang nennt dieselbe Frage nicht").toContain(frage);
  });

  it("dieselbe Zahl in beiden Flaechen, im selben Lauf", async () => {
    const view = await flaeche(["werkstatt"]);
    const regal = text(view, "regal-farbgruppe");
    const gang = text(view, "graph-farbgruppe-stand");
    const a = ersteZahl(regal);
    const g = ersteZahl(gang);
    expect(a, "das Regal nennt keine Zahl dieser Form").toBeGreaterThan(0);
    expect(g, "der Gang nennt keine Zahl dieser Form").toBeGreaterThan(0);
    expect(g, "Regal und Gang zaehlen verschieden").toBe(a);
    // Und es ist die gedeckte Zahl des Modells: drei von fuenf Notizen tragen `werkstatt`.
    expect(a).toBe(3);
  });

  it("sagt in einem Wort, warum ein Band null ist, statt eine kleine Welt zu zeigen", async () => {
    const view = await flaeche(["nichts-von-allem"]);
    const gang = text(view, "graph-farbgruppe-stand");
    expect(gang).toMatch(/0 of 5/u);
    expect(gang.toLowerCase(), "eine Null ohne Grund ist Schmuck").toContain("no note carries it");
  });

  it("laesst den Schalter in beide Richtungen sprechen", async () => {
    const view = await flaeche(["werkstatt"]);
    const kn = view.container.querySelector('[data-testid="graph-farbgruppe"]') as HTMLElement;
    expect(kn, "kein Gruppen-Knopf").toBeTruthy();
    const titel = kn.getAttribute("title") ?? "";
    expect(titel.length).toBeGreaterThan(0);
    await act(async () => { fireEvent.click(kn); for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 50)); });
    const nach = (view.container.querySelector('[data-testid="graph-farbgruppe"]') as HTMLElement).getAttribute("title") ?? "";
    expect(nach, "der Knopf erklaert im zweiten Zustand dasselbe wie im ersten").not.toBe(titel);
    expect(nach.toLowerCase()).toMatch(/back|type|normal|art/u);
  });
});
