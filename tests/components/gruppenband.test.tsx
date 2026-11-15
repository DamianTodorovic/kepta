// @vitest-environment jsdom
//
// #96 — das Leistenband: der Ueberblick zeigt den Anteil der GEMALTEN Knoten je Gruppe.
//
// WAS DIESER FALL PRUEFT (Lesart, ausgeschrieben): **das Verhalten der Flaeche**, nicht einen
// Uebersetzer. `KnowledgeGraph` mit dem Gruppen-Kanal muss das Band rendern; je **malender**
// Gruppe genau ein Abschnitt; `data-anteil` ist der Anteil an den GEMALTEN Knoten (nicht an
// der Mitgliedschaft — Punkt 5s Lehre aus #90); die Flaechenfarbe ist der Gruppenton; eine
// Gruppe mit 0 gemalten Knoten hat **keinen** Abschnitt; ein Rest unter der Sichtbarkeitskante
// bleibt **benannt** (#29/#59: ein Abschnitt unter 1 px ist kein Kanal) und das Band isst
// keinen Klick (`pointer-events: none`).
//
// Rot am Kopf `68d24c5` (3.2.52): die Flaeche rendert kein Band — das Element fehlt im Baum,
// nicht der Import. Gruen mit dem Koerper. Die Minuten stehen im Blatt.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { KnowledgeGraph } from "../../src/components/KnowledgeGraph";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger, setzeTheme, type Leinwand } from "../helfer/canvas";
import type { Memory } from "../../src/types";

const BREITE = 1440;
const HOEHE = 700;
let buch: Leinwand;
let setzeGroesse: (b: number, h: number) => void;

const LATTE = "#96: der Ueberblick zeigt den Anteil der gemalten Knoten je Gruppe, der Buchstabe bleibt fuer den Blick";

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

/** Vier Notizen mit `garten`, eine mit `werkstatt`, eine mit BEIDEN (die erste Marke malt),
 *  zwei ohne Marke. `vergessen` trifft absichtlich nichts — sie darf keinen Abschnitt haben. */
function bestand(): Memory[] {
  return [
    notiz("g1", "Beet eins", ["garten"]),
    notiz("g2", "Beet zwei", ["garten", "werkstatt"]),
    notiz("g3", "Beet drei", ["garten"]),
    notiz("g4", "Beet vier", ["garten"]),
    notiz("w1", "Werkstatttag", ["werkstatt"]),
    notiz("o1", "Ohne Marke", []),
    notiz("o2", "Wieder ohne", []),
  ];
}

function begriffe() {
  const entities = [{ id: 1, name: "Beet" }, { id: 2, name: "Werkstatt" }];
  const relations: unknown[] = [];
  const traeger: Record<string, string[]> = { Beet: ["g1", "g2", "g3", "g4"], Werkstatt: ["g2", "w1"] };
  for (const [name, ids] of Object.entries(traeger)) {
    for (const id of ids) relations.push({ id: `r-${name}-${id}`, source: name, target: name, relation: "mentions", memoryId: id });
  }
  return { entities, relations, memoriesByEntity: traeger, bestand: { knoten: entities.length, kanten: relations.length } };
}

beforeEach(() => {
  buch = installiereLeinwand();
  setzeGroesse = installiereResizeObserver(BREITE, HOEHE);
  installiereZeiger();
  setzeTheme("dunkel");
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("style");
});

async function flaeche() {
  localStorage.setItem("kepta_graph_view", "force");
  localStorage.setItem("kepta_graph_farbkanal", "gruppe");
  localStorage.setItem(
    "kepta_tag_gruppen",
    JSON.stringify({ marken: ["garten", "werkstatt", "vergessen"], farben: { garten: "#e2703a", werkstatt: "#3fbfa8", vergessen: "#c65b8c" } }),
  );
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
  void buch;
  return view;
}

describe("Leistenband: der Ueberblick ueber die gemalten Knoten", () => {
  it(`rendert ein Band mit einem Abschnitt je MALENDER Gruppe — ${LATTE}`, async () => {
    const view = await flaeche();
    const band = view.container.querySelector('[data-testid="graph-gruppenband"]');
    expect(band, "das Band fehlt an der Flaeche").not.toBeNull();
    const segmente = [...view.container.querySelectorAll('[data-testid="graph-gruppenband-segment"]')];
    // garten malt 4 (g2 traegt beide, die erste Marke gewinnt), werkstatt 1, vergessen 0.
    expect(segmente.map((s) => s.getAttribute("data-marke")).sort(), "je malender Gruppe ein Abschnitt").toEqual(["garten", "werkstatt"]);
    const anteile = Object.fromEntries(segmente.map((s) => [s.getAttribute("data-marke"), Number(s.getAttribute("data-anteil"))]));
    expect(anteile.garten, "garten: 4 von 5 gemalten").toBeCloseTo(0.8, 5);
    expect(anteile.werkstatt, "werkstatt: 1 von 5 gemalten").toBeCloseTo(0.2, 5);
    expect(anteile.garten + anteile.werkstatt, "die Anteile summieren auf 1").toBeCloseTo(1, 5);
    const farben = Object.fromEntries(segmente.map((s) => [s.getAttribute("data-marke"), (s as HTMLElement).style.background]));
    expect(farben.garten, "garten traegt seinen Ton").toBe("rgb(226, 112, 58)");
    expect(farben.werkstatt, "werkstatt traegt seinen Ton").toBe("rgb(63, 191, 168)");
  });

  it(`gibt einer Gruppe mit 0 gemalten Knoten KEINEN Abschnitt — ${LATTE}`, async () => {
    const view = await flaeche();
    const segmente = [...view.container.querySelectorAll('[data-testid="graph-gruppenband-segment"]')];
    const marken = segmente.map((s) => s.getAttribute("data-marke"));
    // Erst die Anwesenheit: ohne Abschnitte waere "kein Abschnitt fuer vergessen" tautologisch.
    expect(segmente.length, "zwei malende Gruppen stehen im Band").toBe(2);
    expect(marken, "vergessen malt 0 Knoten").not.toContain("vergessen");
  });

  it(`benennt jeden Abschnitt und isst keinen Klick — ${LATTE}`, async () => {
    const view = await flaeche();
    const segmente = [...view.container.querySelectorAll('[data-testid="graph-gruppenband-segment"]')];
    for (const s of segmente) {
      const marke = s.getAttribute("data-marke") ?? "";
      expect(s.getAttribute("title"), `title fuer ${marke}`).toContain(marke);
      expect(s.getAttribute("aria-label"), `aria-label fuer ${marke}`).toContain(marke);
    }
    // Die zwei Regeln, die das Band traegt: Mindestbreite (unter 1 px ist kein Kanal, #29/#59)
    // und pointer-events none (das Band darf keinen Klick fressen). Im Quelltext, weil jsdom
    // kein Layout hat; das Treffertest-Bild steht im Blatt.
    const css = readFileSync("src/index.css", "utf8");
    expect(css, "die Mindestbreite je Abschnitt").toMatch(/\.graph-gruppenband-segment\s*\{[^}]*min-width:\s*[2-9]px/);
    expect(css, "das Band isst keinen Klick").toMatch(/\.graph-gruppenband\s*\{[^}]*pointer-events:\s*none/);
  });
});
