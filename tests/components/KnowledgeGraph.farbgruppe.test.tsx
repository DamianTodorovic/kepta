// @vitest-environment jsdom
//
// Punkt 5, G-72 zweiter Schlag — die Gruppe hoert nicht im Regal auf.
//
// Die Beweiskante ist dieselbe, die G-73/74/75 halten: eine eigne Kennung auf dem eignen Knopf,
// ein Zustand, der ueber die Marke geht, und die Flaeche, die hoert — die Farbe am Knoten wird aus
// der LEINWAND-BUCHUNG gelesen, nicht aus einem Wort. Dazu die Latte, die dieser Auftrag selbst
// stellt: **dieselbe Zahl in beiden Flaechen**, gemessen in EINEM Lauf gegen die andre Flaeche,
// und ein Stand, der seine Null sagt, statt eine kleine Welt vorzutaeuschen.
//
// Die Falle, die dieser Schlag nicht bauen darf: den Bestand ein zweites Mal zaehlen. Der Gang
// ruft dasselbe Modell, das auch das Regal fuellt (`src/lib/gruppen.ts` ueber
// `markenHaeufigkeit`), und der letzte Fall liest den Quelltext darauf nach.
//
// **Vorher rot, gemessen:** an `4e49c17` (3.2.35) mit dem Regal-Koerper darauf gibt es
// `graph-farbgruppe` an der Flaeche nicht — grep ueber `src/` meldet 0 Treffer (17:00:59 MESZ,
// `/tmp/p5-4e49c17`), und `src/lib/gruppen.ts` fehlt dort ganz.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { KnowledgeGraph } from "../../src/components/KnowledgeGraph";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger, setzeTheme, type Leinwand } from "../helfer/canvas";
import type { Memory } from "../../src/types";

const BREITE = 1440;
const HOEHE = 700;

let buch: Leinwand;
let setzeGroesse: (b: number, h: number) => void;

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

/** Vier Notizen mit `garten`, eine mit `werkstatt`, zwei ohne jede Marke. Eine gesetzte
 *  Gruppe (`vergessen`) trifft absichtlich nichts — sie muss als Null sichtbar bleiben. */
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

/** Das Feld malt Knoten, die aus dem Graph-Aufruf kommen — ohne Begriffe stünde ein leeres
 *  Bild und die Buchung haette keine Bogen. Zwei Begriffe ueber meinen sieben Notizen. */
function begriffe() {
  const entities = [
    { id: 1, name: "Beet" },
    { id: 2, name: "Werkstatt" },
  ];
  const relations: unknown[] = [];
  const traeger: Record<string, string[]> = { Beet: ["g1", "g2", "g3", "g4"], Werkstatt: ["g2", "w1"] };
  for (const [name, ids] of Object.entries(traeger)) {
    for (const id of ids) relations.push({ id: `r-${name}-${id}`, source: name, target: name, relation: "mentions", memoryId: id });
  }
  return { entities, relations, memoriesByEntity: traeger, bestand: { knoten: entities.length, kanten: relations.length } };
}

/** Die Einstellung, die ein Mensch im Regal baut, vor dem ersten Rendern gesetzt. */
function gruppenSetzen(marken: string[]) {
  localStorage.setItem(
    "kepta_tag_gruppen",
    JSON.stringify({ marken, farben: { garten: "#e2703a", werkstatt: "#3fbfa8", vergessen: "#c65b8c" } }),
  );
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

async function flaeche(marken: string[], ansicht: "force" | "dendrogram" = "force") {
  localStorage.setItem("kepta_graph_view", ansicht);
  gruppenSetzen(marken);
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
  const bar = view.container.querySelector('[data-testid="graph-leiste"]') as HTMLElement;
  expect(bar, "die Zeile fehlt").toBeTruthy();
  Object.defineProperty(bar, "clientWidth", { value: BREITE, configurable: true });
  await act(async () => {
    setzeGroesse(BREITE, HOEHE);
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 50));
  });
  return view;
}

const wert = (view: Awaited<ReturnType<typeof flaeche>>, kennung: string) =>
  (view.container.querySelector(`[data-testid="${kennung}"]`) as HTMLElement | null)?.textContent ?? null;

/** Die Farben, mit denen die Leinwand Knoten malt.
 *
 *  Der Malpfad rastert jeden Knoten EINMAL als Sprite (ein 128er Bild) und zieht es danach
 *  mit `drawImage` ein — die Farbe steht also im Buchungslauf an dem `set:fillStyle`, der das
 *  Sprite gerastert hat, und im letzten Bild steht `drawImage`. Beides wird hier gelesen:
 *  kein Wort der Flaeche, sondern was der Leinwand befohlen wurde. */
function alleFuellungen(): string[] {
  return buch.aufrufe.filter((a) => a.op === "set:fillStyle").map((a) => String(a.args[0]));
}
const bildErkenntnisse = () => buch.letzterRahmen().filter((a) => a.op === "drawImage").length;

describe("G-72 zweiter Schlag — die Gruppe faerbt den Gang", () => {
  it("traegt eine eigne Kennung, und das Ziel nimmt die Maus an", async () => {
    const view = await flaeche(["garten", "werkstatt"]);
    const kn = view.container.querySelector('[data-testid="graph-farbgruppe"]') as HTMLElement | null;
    expect(kn, "die Flaeche hat keinen Gruppen-Knopf").toBeTruthy();
    const ziel = kn as HTMLElement;
    expect(ziel.tagName).toBe("BUTTON");
    expect(ziel.getAttribute("aria-pressed"), "der Knopf nennt seinen Zustand nicht").toMatch(/^(true|false)$/);
    // Der Stand sitzt in der Legende, und die weist Zeiger ab: ohne eigne Eigenschaft ist der
    // Knopf unsichtbar fuer jede Hand — die Lektion, die 3.2.34 bezahlt hat.
    expect(ziel.style.pointerEvents, "das Ziel nimmt keine Zeiger an").toBe("auto");
    expect(Number.parseInt(ziel.style.minHeight || "0", 10)).toBeGreaterThanOrEqual(44);
  });

  it("haelt seinen Zustand ueber die Marke und laesst sich zuruecknehmen", async () => {
    const view = await flaeche(["garten"]);
    const kn = view.container.querySelector('[data-testid="graph-farbgruppe"]') as HTMLElement;
    expect(kn.getAttribute("aria-pressed")).toBe("false");
    await act(async () => {
      fireEvent.click(kn);
      await new Promise((r) => setTimeout(r, 80));
    });
    expect(localStorage.getItem("kepta_graph_farbkanal"), "der Kanal bleibt ungemerkt").toBe("gruppe");
    expect(view.container.querySelector('[data-testid="graph-farbgruppe"]')?.getAttribute("aria-pressed")).toBe("true");
    await act(async () => {
      fireEvent.click(view.container.querySelector('[data-testid="graph-farbgruppe"]') as HTMLElement);
      await new Promise((r) => setTimeout(r, 80));
    });
    expect(view.container.querySelector('[data-testid="graph-farbgruppe"]')?.getAttribute("aria-pressed")).toBe("false");
    expect(localStorage.getItem("kepta_graph_farbkanal")).toBe("typ");
  });

  it("malt die Gruppenfarbe an den Knoten — gelesen aus der Buchung, nicht aus einem Wort", async () => {
    const view = await flaeche(["garten", "werkstatt"]);
    const vorher = alleFuellungen();
    expect(vorher, "die Leinwand malt im Stand nichts — die Buchung ist leer").not.toHaveLength(0);
    expect(vorher).not.toContain("#e2703a");
    expect(vorher).not.toContain("#3fbfa8");
    const kn = view.container.querySelector('[data-testid="graph-farbgruppe"]') as HTMLElement;
    await act(async () => {
      fireEvent.click(kn);
      for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 50));
    });
    const nachher = alleFuellungen();
    expect(nachher.filter((f) => f === "#e2703a").length, "die Garten-Gruppe ist nie gerastert worden").toBeGreaterThan(0);
    expect(nachher.filter((f) => f === "#3fbfa8").length, "die Werkstatt-Gruppe ist nie gerastert worden").toBeGreaterThan(0);
    // Und die Bilder ziehen die Raster: ohne einen einzigen Bildzug wäre die Farbe nur berechnet.
    expect(bildErkenntnisse(), "kein Knoten wird als Bild auf die Leinwand gezogen").toBeGreaterThan(0);
  });

  it("nennt in beiden Flaechen dieselbe Zahl, im selben Lauf", async () => {
    const view = await flaeche(["garten", "werkstatt", "vergessen"], "dendrogram");
    const regal = wert(view, "regal-farbgruppe");
    const gang = wert(view, "graph-farbgruppe-stand");
    expect(regal, "das Regal nennt seinen Stand nicht").toBeTruthy();
    expect(gang, "der Gang nennt seinen Stand nicht").toBeTruthy();
    // Beide Flaechen nennen "5 of 7" — dieselbe gedeckte Zahl aus demselben Modellaufruf.
    const zahl = (t: string) => (t.match(/(\d+) of (\d+)/u) ?? []).slice(1).map(Number);
    expect(zahl(regal as string), "Regal und Gang zaehlen verschieden").toEqual(zahl(gang as string));
    expect(zahl(gang as string)).toEqual([5, 7]);
  });

  it("sagt seine Null, wenn eine gesetzte Gruppe nichts trifft", async () => {
    const view = await flaeche(["vergessen"], "dendrogram");
    const gang = wert(view, "graph-farbgruppe-stand") ?? "";
    expect(gang).toContain("0 of 7");
    expect(gang.toLowerCase(), "die Flaeche tut klein, statt ihre Null zu nennen").toContain("none");
    const regal = wert(view, "regal-farbgruppe") ?? "";
    expect(regal).toContain("0 of 7");
  });

  it("rechnet die Gruppe kein zweites Mal — der Gang ruft nur das Modell auf", () => {
    const quelltext = readFileSync("src/components/KnowledgeGraph.tsx", "utf8");
    // Gerufe zaehlen, nicht Woerter: die Importzeile traegt denselben Namen ohne Klammer.
    expect(quelltext.match(/\bbaueFarbGruppen\s*\(/gu) ?? [], "der Gang ruft das Modell mehr als einmal").toHaveLength(1);
    expect(quelltext.match(/\bzaehleGruppen\s*\(/gu) ?? [], "der Gang rechnet eine zweite Zaehlung").toHaveLength(0);
    // Der Zensus wird genau einmal gerufen (G-74, Zeile 1617 am Kopf). Die Gruppe holt ihre
    // Zahlen nicht daraus, sondern aus dem einen Modellaufruf oben.
    expect(quelltext.match(/\bmarkenHaeufigkeit\s*\(/gu) ?? [], "der Gang ruft den Zensus ein zweites Mal").toHaveLength(1);
  });
});
