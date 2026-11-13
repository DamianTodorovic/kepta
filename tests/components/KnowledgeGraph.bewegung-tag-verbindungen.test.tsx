// @vitest-environment jsdom
// G-73, G-74, G-75 — drei Schalter, die die Fläche wirklich bedienen (Punkt 1, 22.10.).
//
// Warum eine Datei für drei Aufträge: sie teilen sich die Beweiskante — ein Knopf, der einen
// Zustand schliesst, muss (a) eine eigne Kennung auf dem Knopf tragen, (b) den Zustand halten, und
// (c) der Fläche sagen, was er tut. Ein Fall pro Knopf, aber dieselbe Montage.
//
// **Vorher rot, und das ist bestellt:** an `9c64db4` (3.2.34) gibt es keine der drei Kennungen —
// `node scripts/pruefe-appknoepf.mjs --dist --vorher --nur G-73,G-74,G-75` meldet 0 / 0 / 0
// (gemessen 06:53:53, Protokoll `belege-2210/appknoepf-vorher-dist.log.txt`). Also fällt jeder
// Erwartungsblock hier, bevor der Körper liegt.
//
// Hausform übernommen aus `…graph-tiefe-steuerung.test.tsx:77-102` (Zeilen-Breite setzen, More-Panel
// als Klickpfad) und `…kamera-kante.test.tsx:119-145` (Rahmen aus dem Aufrufprotokoll nachspielen).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { KnowledgeGraph } from "../../src/components/KnowledgeGraph";
import { alleinKnoten } from "../../src/lib/graphLayout";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger, setzeTheme, type Leinwand } from "../helfer/canvas";
import type { Memory } from "../../src/types";

const BREITE = 1440;
const HOEHE = 700;
const NOTIZEN = 60;

let buch: Leinwand;
let setzeGroesse: (b: number, h: number) => void;

/** Drei Tags, einer davon trifft absichtlich nichts, was im Bestand wohnt. */
const TAGS = ["garten", "werkstatt", "büro"];

const notiz = (i: number): Memory =>
  ({
    id: `g${i}`,
    userId: "local",
    title: `G-73 Notiz ${String(i).padStart(3, "0")}`,
    content: `Inhalt ${i}`,
    // garten und werkstatt hängen an Notizen, die Begriffe tragen; büro nur an
    // Notizen ab 40 — die stehen ohne Verbindung, und zusammen mit G-75 läuft der
    // Filter damit ins Leere. Der leere Stand ist ein Fall, keine Ausrede.
    tags: i >= 40 && i % 3 === 1 ? ["büro"] : i % 3 === 0 ? ["garten"] : i % 3 === 2 ? ["werkstatt"] : [],
    type: "reference",
    createdAt: Date.parse("2024-01-01"),
    updatedAt: Date.parse("2024-01-01"),
  }) as Memory;

/** Nur die ersten 20 Notizen bekommen Begriffe — der Rest steht allein. */
function begriffe() {
  const entities: { id: number; name: string }[] = [];
  const relations: unknown[] = [];
  const traeger: Record<string, string[]> = {};
  for (let b = 0; b < 4; b++) {
    const name = `Begriff ${b}`;
    entities.push({ id: b + 1, name });
    const liste: string[] = [];
    for (let i = 0; i < 20; i++) if ((i + b) % 4 === b % 4) liste.push(`g${i}`);
    for (const id of liste) relations.push({ id: `r-${b}-${id}`, source: name, target: name, relation: "mentions", memoryId: id });
    traeger[name] = liste;
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

async function flaeche(zaehlung?: (n: number) => void, breite = BREITE) {
  const leib = begriffe();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) =>
      new Response(String(url).startsWith("/api/graph?") ? JSON.stringify(leib) : JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 })
    )
  );
  const view = render(<KnowledgeGraph memories={Array.from({ length: NOTIZEN }, (_, i) => notiz(i))} onSelectMemory={vi.fn()} onFeldZaehlung={zaehlung} />);
  await act(async () => {
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 50));
  });
  const bar = view.container.querySelector('[data-testid="graph-leiste"]') as HTMLElement;
  expect(bar, "die Zeile fehlt").toBeTruthy();
  Object.defineProperty(bar, "clientWidth", { value: breite, configurable: true });
  await act(async () => {
    setzeGroesse(breite, HOEHE);
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 50));
  });
  return view;
}

/** Der Rahmenzähler: jeder Rahmen beginnt mit einer clearRect — das ist die Bildzahl, nicht ein Wort. */
const rahmenBis = () => buch.aufrufe.filter((a) => a.op === "clearRect").length;
const warte = async (ms: number) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};

/** Den Knopf finden — in der Zeile, oder, wenn die Zeile ihn nicht trägt, im More-Panel. */
async function knopf(view: Awaited<ReturnType<typeof flaeche>>, kennung: string): Promise<HTMLElement> {
  const direkt = view.container.querySelector(`[data-testid="${kennung}"]`);
  if (direkt) return direkt as HTMLElement;
  const mehr = view.container.querySelector('[data-testid="graph-mehr"]');
  if (!mehr) throw new Error(`weder die Zeile noch das More-Panel trägt ${kennung} — die Fläche hat keinen Knopf`);
  await act(async () => {
    fireEvent.click(mehr);
    await new Promise((r) => setTimeout(r, 60));
  });
  const panel = view.container.querySelector('[data-testid="graph-mehr-panel"]');
  if (!panel) throw new Error("das More-Panel öffnet sich nicht");
  const imPanel = panel.querySelector(`[data-testid="${kennung}"]`);
  if (!imPanel) throw new Error(`${kennung} steht weder in der Zeile noch im Panel — der Klickpfad ist nicht führbar`);
  return imPanel as HTMLElement;
}

describe("G-73 — der Bewegungsschalter stoppt die Bildrechnung", () => {
  it("traegt eine eigne Kennung auf dem Knopf, nicht nur den gemeinsamen Punkt", async () => {
    const view = await flaeche();
    const kn = await knopf(view, "graph-bewegung");
    expect(kn.getAttribute("aria-pressed"), "der Knopf nennt seinen Zustand nicht").toMatch(/^(true|false)$/);
    // Die gemeinsame Punkt-Kennung bleibt, aber sie ist nicht die einzige mehr.
    expect(kn.querySelector('[data-testid="graph-schalter-punkt"]') || kn, "kein Schalterzeichen am Knopf").toBeTruthy();
  });

  it("schaltet die Bildzahlung ab: weniger Rahmen in derselben Zeitspanne", async () => {
    const view = await flaeche();
    await warte(700);
    const vorHer = rahmenBis();
    await warte(900);
    const mitBewegung = rahmenBis() - vorHer;

    const kn = await knopf(view, "graph-bewegung");
    await act(async () => {
      fireEvent.click(kn);
      await new Promise((r) => setTimeout(r, 120));
    });
    const vorAus = rahmenBis();
    await warte(900);
    const ohneBewegung = rahmenBis() - vorAus;

    expect(mitBewegung, "mit Bewegung müssen Rahmen laufen — sonst ist der Vergleich hohl").toBeGreaterThan(0);
    expect(
      ohneBewegung,
      `in derselben Zeitspanne: mit Bewegung ${mitBewegung} Rahmen, ohne Bewegung ${ohneBewegung} — der Schalter hat die Bildrechnung nicht gestoppt`
    ).toBeLessThan(mitBewegung);
  });

  it("haelt seinen Zustand über die Marke, und die Marke schaltet in beide Richtungen", async () => {
    const view = await flaeche();
    const kn = await knopf(view, "graph-bewegung");
    const anfang = kn.getAttribute("aria-pressed");
    await act(async () => {
      fireEvent.click(kn);
    });
    expect(localStorage.getItem("kepta_graph_bewegung"), "die Marke bleibt ungeschrieben").toMatch(/^(0|1)$/);
    expect(kn.getAttribute("aria-pressed"), "der Knopf kippt nicht").not.toBe(anfang);
    await act(async () => {
      fireEvent.click(kn);
    });
    expect(kn.getAttribute("aria-pressed"), "der Rückweg fehlt — ein Schalter, der nur zudreht, ist eine Falle").toBe(anfang);
  });
});

describe("G-74 — der Tag-Filter zieht aus derselben Quelle und sagt den leeren Stand", () => {
  it("traegt eine eigne Kennung und bietet genau die Tags des Bestands", async () => {
    const view = await flaeche();
    const steuerelement = await knopf(view, "graph-tag-filter");
    const angebot = [...steuerelement.querySelectorAll("option")].map((o) => o.getAttribute("value")).filter((v) => v);
    // Dieselbe Quelle wie die Seitenleiste: `markenHaeufigkeit` über denselben memories.
    expect(angebot.sort(), `der Filter bietet ${JSON.stringify(angebot)} statt der Tags des Bestands`).toEqual([...TAGS].sort());
  });

  it("senkt die Knotenzahl, und der Kopf nennt denselben Wert", async () => {
    let kopfZahl: number | undefined;
    const view = await flaeche((n) => {
      kopfZahl = n;
    });
    const vorher = kopfZahl;
    expect(vorher, "die Fläche meldet dem Kopf keine Zahl — ohne sie ist der Vergleich nicht führbar").toBeTruthy();

    const steuerelement = await knopf(view, "graph-tag-filter");
    await act(async () => {
      fireEvent.change(steuerelement, { target: { value: "garten" } });
      await new Promise((r) => setTimeout(r, 150));
    });
    const nachher = kopfZahl;
    const kopfText = (view.container.querySelector('[data-testid="graph-kopf"]')?.textContent || "").replace(/\s+/g, " ");
    expect(nachher, `mit Filter „garten" sinkt die Zahl nicht (${vorher} → ${nachher})`).toBeLessThan(vorher as number);
    expect(kopfText, `der Kopf nennt nicht die gefilterte Zahl ${nachher}: ${kopfText}`).toContain(String(nachher));
  });

  it("sagt, wenn ein Tag nichts trifft, statt einen kleinen Bestand vorzutäuschen", async () => {
    const view = await flaeche();
    const steuerelement = await knopf(view, "graph-tag-filter");
    await act(async () => {
      fireEvent.change(steuerelement, { target: { value: "garten" } });
      await new Promise((r) => setTimeout(r, 120));
    });
    await act(async () => {
      fireEvent.change(steuerelement, { target: { value: "büro" } });
      await new Promise((r) => setTimeout(r, 120));
    });
    const kn = await knopf(view, "graph-nur-mit-verbindungen");
    await act(async () => {
      fireEvent.click(kn);
      await new Promise((r) => setTimeout(r, 120));
    });
    const leer = view.container.querySelector('[data-testid="graph-tag-leer"]');
    expect(leer, "kein Hinweis, dass der Filter ins Leere läuft — die Fläche tut, als sei der Bestand klein").toBeTruthy();
    expect((leer as HTMLElement).textContent, "der Hinweis nennt den Tag nicht, der nichts trifft").toContain("büro");
  });

  it("lässt ohne Filter den alten Stand stehen", async () => {
    let kopfZahl: number | undefined;
    const view = await flaeche((n) => {
      kopfZahl = n;
    });
    const vorher = kopfZahl;
    const steuerelement = await knopf(view, "graph-tag-filter");
    await act(async () => {
      fireEvent.change(steuerelement, { target: { value: "garten" } });
      await new Promise((r) => setTimeout(r, 120));
    });
    await act(async () => {
      // Der leere Wert ist die Option „All tags" — nicht ein Wort „all". Ein
      // Wechsel auf einen Wert, den es nicht gibt, fiele in jsdom trotzdem auf
      // "" zurueck und der Fall gruen ohne dass jemand die Flaeche bedient haette.
      fireEvent.change(steuerelement, { target: { value: "" } });
      await new Promise((r) => setTimeout(r, 120));
    });
    expect((steuerelement as HTMLSelectElement).value, "der Filter steht nicht wieder auf der leeren Option").toBe("");
    expect(
      (steuerelement as HTMLSelectElement).selectedOptions[0]?.textContent,
      "die leere Option heisst nicht nach dem, was sie tut"
    ).toMatch(/All tags/);
    expect(kopfZahl, `zurück auf „alle" ist der Stand nicht der alte (${vorher} → ${kopfZahl})`).toBe(vorher);
  });
});

describe("G-75 — nur mit Verbindungen: das Alleinstehende bleibt weg, und die Zahl steht da", () => {
  it("traegt eine eigne Kennung und nennt, wie viele ausgeblendet sind", async () => {
    const view = await flaeche();
    const kn = await knopf(view, "graph-nur-mit-verbindungen");
    await act(async () => {
      fireEvent.click(kn);
      await new Promise((r) => setTimeout(r, 160));
    });
    const zeile = view.container.querySelector('[data-testid="graph-versteckt-allein"]');
    expect(zeile, "keine Zeile nennt, wie viele Alleinstehende ausgeblendet sind").toBeTruthy();
    const zahl = Number((zeile as HTMLElement).getAttribute("data-anzahl"));
    // Scharf statt „grosser als null": die Szene hat so viele Alleinstehende, wie
    // Notizen keiner Begriffs-Nennung tragen, und die Zeile muss genau diese Zahl
    // nennen. Damit ist auch die Latte des Briefs gehalten — kein allein stehender
    // Knoten bleibt im Bild, weil keiner uebrig ist, den die Rechnung nicht nennt.
    const verbundene = new Set(Object.values(begriffe().memoriesByEntity).flat()).size;
    expect(zahl, `die Zeile meldet ${zahl} ausgeblendete Alleinstehende, die Szene hat ${NOTIZEN - verbundene}`).toBe(NOTIZEN - verbundene);
  });

  it("stellt mit dem Schalter kein allein stehender Knoten mehr ins Bild", async () => {
    const view = await flaeche();
    const kn = await knopf(view, "graph-nur-mit-verbindungen");
    await act(async () => {
      fireEvent.click(kn);
      await new Promise((r) => setTimeout(r, 200));
    });
    // Die Fläche malt nur noch, was Nachbarn hat: gemalt wird ueber die
    // Aufrufbuchung der Scheiben geprueft, nicht ueber ein Wort.
    const scheiben = buch.aufrufe.filter((a) => a.op === "arc").length;
    expect(scheiben, "die Fläche malt gar keine Scheiben — der Nachweis wäre hohl").toBeGreaterThan(0);
    const kopfText = (view.container.querySelector('[data-testid="graph-kopf"]')?.textContent || "").replace(/\s+/g, " ");
    expect(kopfText, `der Kopf zählt weiter Alleinstehende mit: ${kopfText}`).not.toContain(String(NOTIZEN));
  });
});

// Der Klickpfad bei Telefonbreite (P202, Mockup-Panel): die Glieder stehen
// vertikal im Ansicht-Panel — der Klickpfad ist ohne Klappe da.
describe("Klickpfad bei 362 px — das Panel traegt die drei Glieder, ohne Klappe", () => {
  // 362 px sind die im echten Fenster bei 390 px gemessene Zeilenbreite
  // (belege-2210/g73-end-2/g73-end.json, Schlag 12:57:26 MESZ).
  const TELEFON = 362;
  const KENNNUNGEN = ["graph-bewegung", "graph-tag-filter", "graph-nur-mit-verbindungen"];

  it("versteckt, fuehrt aber: jede der drei Steuerungen wirkt vom Menue aus", async () => {
    let kopfZahl: number | undefined;
    const view = await flaeche((n) => {
      kopfZahl = n;
    }, TELEFON);
    const panel = view.container.querySelector('[data-testid="graph-leiste"]') as HTMLElement;
    expect(panel, "das Ansicht-Panel fehlt").toBeTruthy();
    for (const k of KENNNUNGEN) {
      expect(
        panel.querySelector(`[data-testid="${k}"]`),
        `${k} fehlt im Ansicht-Panel — der Klickpfad waere eine Frage`
      ).toBeTruthy();
    }
    for (const k of KENNNUNGEN) {
      expect(panel.querySelector(`[data-testid="${k}"]`), `${k} steht nicht im Menue`).toBeTruthy();
    }

    // Gefahren, nicht nur gefunden: jede Steuerung wechselt von hier ihren Zustand.
    const bewegung = panel.querySelector('[data-testid="graph-bewegung"]') as HTMLElement;
    const standVorher = bewegung.getAttribute("aria-pressed");
    await act(async () => {
      fireEvent.click(bewegung);
      await new Promise((r) => setTimeout(r, 80));
    });
    expect(bewegung.getAttribute("aria-pressed"), "der Klick durchs Menue schaltet die Bewegung nicht").not.toBe(standVorher);

    const vorher = kopfZahl;
    expect(vorher, "die Fläche meldet dem Kopf keine Zahl — der Filtervergleich ware nicht fuhrbar").toBeTruthy();
    const filter = panel.querySelector('[data-testid="graph-tag-filter"]') as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(filter, { target: { value: "garten" } });
      await new Promise((r) => setTimeout(r, 160));
    });
    expect(kopfZahl, `der Filter aus dem Menue senkt die Zahl nicht (${vorher} → ${kopfZahl})`).toBeLessThan(vorher as number);

    const nurMit = panel.querySelector('[data-testid="graph-nur-mit-verbindungen"]') as HTMLElement;
    await act(async () => {
      fireEvent.click(nurMit);
      await new Promise((r) => setTimeout(r, 160));
    });
    expect(nurMit.getAttribute("aria-pressed"), "der Klick durchs Menue schaltet G-75 nicht an").toBe("true");
  });
});

// Die Rechenhilfe, an der der Körper sich messen muss: alleinKnoten kennt die Bedingung schon.
describe("Haftung: alleinKnoten bleibt die einzige Rechnung für Alleinstehende", () => {
  it("findet in der eignen Szene mehr Alleinstehende als null", () => {
    const knoten = Array.from({ length: NOTIZEN }, (_, i) => ({ id: `g${i}`, x: 0, y: 0, label: `t${i}`, typ: "note", grad: 0, tags: [], versteckt: false, angeheftet: false, abgelaufen: false, ersetzt: false }));
    const kanten = begriffe().relations.map((r) => r as { source: string; target: string; memoryId: string });
    const allein = alleinKnoten(knoten as never, kanten as never);
    expect(allein.length, "die Szene hat keine Alleinstehenden — G-75 wäre nicht prüfbar").toBeGreaterThan(0);
  });
});
