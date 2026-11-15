// @vitest-environment jsdom
// G-76 — die Verbindungs-Dicke: ein Regler, den das Bild hoert.
//
// Die Beweiskante ist dieselbe wie bei G-73/74/75: (a) eigne Kennung auf dem Steuer,
// (b) Zustand bleibt ueber die Marke und schaltet in beide Richtungen, (c) die
// Flaeche hoeren — gemessene Linienbreite an den Kantenstrichen, nicht ein Wort,
// (d) die Zeile nennt denselben Wert, den die Flaeche malt.
//
// **Vorher rot, und das ist bestellt:** gegen `4e49c17` (3.2.35) gibt es die Kennung
// nicht — `node scripts/pruefe-appknoepf.mjs --dist .../dist/assets --vorher --nur G-76`
// meldet 0 (gemessen 17:02:13, Protokoll in `belege-2210/`), und das ausgelegte Objekt
// `/Applications/K3PTA.app` nennt dasselbe. Also faellt jeder block, bevor der Koerper liegt.
//
// Hausform uebernommen aus `KnowledgeGraph.bewegung-tag-verbindungen.test.tsx`
// (Leinwand-Buchung, ResizeObserver, Zeiger, More-Panel als Klickpfad).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { KnowledgeGraph } from "../../src/components/KnowledgeGraph";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger, setzeTheme, type Leinwand } from "../helfer/canvas";
import type { Memory } from "../../src/types";

const BREITE = 1440;
const HOEHE = 700;
const NOTIZEN = 40;

let buch: Leinwand;
let setzeGroesse: (b: number, h: number) => void;

const notiz = (i: number): Memory =>
  ({
    id: `d${i}`,
    userId: "local",
    title: `Dicke Notiz ${String(i).padStart(3, "0")}`,
    content: `Inhalt ${i}`,
    tags: i % 2 === 0 ? ["garten"] : ["werkstatt"],
    type: "reference",
    createdAt: Date.parse("2024-01-01"),
    updatedAt: Date.parse("2024-01-01"),
  }) as Memory;

/** Vier Begriffe, je zehn Notizen — damit echte Kantenstriche gemalt werden. */
function begriffe() {
  const entities: { id: number; name: string }[] = [];
  const relations: unknown[] = [];
  const memoriesByEntity: Record<string, string[]> = {};
  for (let b = 0; b < 4; b++) {
    const name = `Begriff ${b}`;
    entities.push({ id: b + 1, name });
    const liste: string[] = [];
    for (let i = 0; i < NOTIZEN; i++) if (i % 4 === b) liste.push(`d${i}`);
    for (const id of liste) relations.push({ id: `r-${b}-${id}`, source: name, target: name, relation: "mentions", memoryId: id });
    memoriesByEntity[name] = liste;
  }
  return { entities, relations, memoriesByEntity, bestand: { knoten: entities.length, kanten: relations.length } };
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

async function flaeche(breite = BREITE) {
  const leib = begriffe();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) =>
      new Response(String(url).startsWith("/api/graph?") ? JSON.stringify(leib) : JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 })
    )
  );
  const view = render(<KnowledgeGraph memories={Array.from({ length: NOTIZEN }, (_, i) => notiz(i))} onSelectMemory={vi.fn()} />);
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

const warte = async (ms: number) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};

/** Den Regler finden — in der Zeile, oder, wenn die Zeile ihn nicht traegt, im More-Panel. */
async function steuerelement(view: Awaited<ReturnType<typeof flaeche>>): Promise<HTMLElement> {
  const direkt = view.container.querySelector('[data-testid="graph-verbindungsdicke"]');
  if (direkt) return direkt as HTMLElement;
  const mehr = view.container.querySelector('[data-testid="graph-mehr"]');
  if (!mehr) throw new Error("weder die Zeile noch das More-Panel traegt den Dicken-Regler — die Flaeche hat kein Steuer");
  await act(async () => {
    fireEvent.click(mehr);
    await new Promise((r) => setTimeout(r, 60));
  });
  const panel = view.container.querySelector('[data-testid="graph-mehr-panel"]');
  if (!panel) throw new Error("das More-Panel oeffnet sich nicht");
  const imPanel = panel.querySelector('[data-testid="graph-verbindungsdicke"]');
  if (!imPanel) throw new Error("graph-verbindungsdicke steht weder in der Zeile noch im Panel — der Klickpfad ist nicht fuhrbar");
  return imPanel as HTMLElement;
}

/**
 * Die an Kantenstrichen gemessene Linienbreite.
 *
 * Ein Kantenstrich ist ein `stroke`, dem ein `moveTo` voranging und KEIN `arc` —
 * Knotenscheiben, Ringe und Etiketten sind damit ausgeschlossen. Ohne diese
 * Trennung waere die Vergleichsmenge alles, was das Bild je an Breite setzt,
 * und ein Multiplikator, der nur die Kanten trifft, kaeme als Fehler daher.
 */
function kantenBreiten(): number[] {
  const ops = buch.letzterRahmen();
  const out: number[] = [];
  for (let i = 0; i < ops.length; i++) {
    if (ops[i].op !== "stroke") continue;
    let breite: number | undefined;
    let hatMove = false;
    let hatArc = false;
    for (let j = i - 1; j >= 0; j--) {
      const op = ops[j].op;
      if (op === "stroke" || op === "clearRect") break;
      if (op === "arc") hatArc = true;
      if (op === "moveTo") hatMove = true;
      if (op === "set:lineWidth" && breite === undefined) breite = ops[j].args[0] as number;
    }
    if (hatMove && !hatArc && typeof breite === "number") out.push(breite);
  }
  return out;
}

/**
 * Die an Kantenstrichen gemessenen Breiten eines Rahmens, der Groesse nach.
 *
 * Rohe Zahlen, keine gerundeten Schluessel: ein Zwischenschritt durch eine
 * Rundungsmenge verliert selbst die Stelle, die er halten will. Verglichen wird
 * darum Wert fuer Wert, mit einer Toleranz von Millionstel Bildpixel — ein
 * falscher Faktor liegt um eine ganze Breite daneben.
 */
async function rahmenVermessen(view: Awaited<ReturnType<typeof flaeche>>): Promise<number[]> {
  const leinwand = view.container.querySelector("canvas");
  expect(leinwand, "die Flaeche malt auf keiner Leinwand — es gibt nichts zu messen").toBeTruthy();
  await warte(260);
  const werte = kantenBreiten().slice().sort((a, b) => a - b);
  expect(werte.length, "kein einziger Kantenstrich im letzten Rahmen — der Nachweis ware hohl").toBeGreaterThan(0);
  return werte;
}

/** Dieselben Striche, jede Breite um den Faktor geskaelt. */
function skaere(vorher: number[], faktor: number): number[] {
  return vorher.map((w) => w * faktor);
}

const setzeDicke = async (element: HTMLElement, wert: string) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(element, wert);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 220));
  });
};

describe("G-76 — der Dicken-Regler", () => {
  it("traegt eine eigne Kennung auf dem Steuer und die Werksmasse ist 1x", async () => {
    const view = await flaeche();
    const regler = await steuerelement(view);
    expect(regler.tagName, "das Steuer ist kein Regler").toBe("INPUT");
    expect(regler.getAttribute("type"), "der Regler ist kein range-Feld").toBe("range");
    expect(regler.getAttribute("min"), "die untere Masste ist nicht 1x").toBe("1");
    expect(regler.getAttribute("max"), "die obere Masste ist nicht 3x").toBe("3");
    expect(regler.getAttribute("step"), "der Schritt ist nicht eine halbe Masste").toBe("0.5");
    expect((regler as HTMLInputElement).value, "ohne Marke steht nicht die Werksmasse da").toBe("1");
    const wort = view.container.querySelector('[data-testid="graph-verbindungsdicke-wert"]');
    expect(wort, "nirgends steht, welche Masste die Flaeche malt").toBeTruthy();
    expect((wort as HTMLElement).textContent!.trim(), "das Wertwort nennt nicht 1x").toBe("1x");
  });

  it("das Bild hoert: jede gemessene Kantenbreite wird das Doppelte", async () => {
    // Bewegung aus: nur ein stehendes Feld malt zwei Rahmen, die man vergleichen darf.
    localStorage.setItem("kepta_graph_bewegung", "0");
    const view = await flaeche();
    const vorher = await rahmenVermessen(view);
    const regler = await steuerelement(view);
    await setzeDicke(regler, "2");
    const nachher = await rahmenVermessen(view);
    expect(nachher.length, `2x malt eine andere Zahl von Kantenstrichen (${vorher.length} -> ${nachher.length}) — die Menge ist nicht dieselbe, der Vergleich gilt nicht`).toBe(vorher.length);
    nachher.forEach((wert, i) => expect(wert, `Strich ${i} bei 2x: gemessen ${wert}, erwartet ${skaere(vorher, 2)[i]}`).toBeCloseTo(skaere(vorher, 2)[i], 6));
    // Und die Zeile nennt denselben Wert, den die Flaeche malt.
    const wort = (view.container.querySelector('[data-testid="graph-verbindungsdicke-wert"]') as HTMLElement).textContent!.trim();
    expect(wort, "die Zeile nennt nicht die Masste, die die Flaeche malt").toBe("2x");
    const gemessen = nachher[0] / vorher[0];
    expect(gemessen, `die Flaeche malt ${gemessen}x, die Zeile sagt ${wort}`).toBeCloseTo(2, 6);
  });

  it("halb Schritte zaehlen mit, und zurueck auf 1x malt wieder die Werksmasse", async () => {
    localStorage.setItem("kepta_graph_bewegung", "0");
    const view = await flaeche();
    const werks = await rahmenVermessen(view);
    const regler = await steuerelement(view);
    await setzeDicke(regler, "1.5");
    const halbe = await rahmenVermessen(view);
    expect(halbe.length, `bei 1,5x eine andere Zahl von Strichen (${werks.length} -> ${halbe.length})`).toBe(werks.length);
    halbe.forEach((wert, i) => expect(wert, `Strich ${i} bei 1,5x: gemessen ${wert}, erwartet ${skaere(werks, 1.5)[i]}`).toBeCloseTo(skaere(werks, 1.5)[i], 6));
    await setzeDicke(regler, "1");
    expect(await rahmenVermessen(view), "zurueck auf 1x ist nicht die Werksmasse").toEqual(werks);
  });

  it("bleibt ueber die Marke und liest sie in beide Richtungen", async () => {
    localStorage.setItem("kepta_graph_verbindungsdicke", "2.5");
    const view = await flaeche();
    const regler = await steuerelement(view);
    expect((regler as HTMLInputElement).value, "die Marke 2.5 wird nicht gelesen").toBe("2.5");
    expect((view.container.querySelector('[data-testid="graph-verbindungsdicke-wert"]') as HTMLElement).textContent!.trim(), "die Zeile nennt die Marke nicht").toBe("2.5x");
    await setzeDicke(regler, "1");
    expect(localStorage.getItem("kepta_graph_verbindungsdicke"), "die neue Masste steht nicht unter der Marke").toBe("1");
    view.unmount();
    const zweite = await flaeche();
    expect((await steuerelement(zweite) as HTMLInputElement).value, "nach dem Neuaufbau gilt die Marke nicht mehr").toBe("1");
  });

  it("eine Zahl ausserhalb der Masste wird nicht geglaubt", async () => {
    localStorage.setItem("kepta_graph_verbindungsdicke", "9");
    const view = await flaeche();
    const regler = await steuerelement(view);
    expect((regler as HTMLInputElement).value, "9x durch die Marke wird gemalt — die Masste haelt nicht").toBe("1");
  });
});

describe("G-76 bei Telefonbreite (P202, Mockup-Panel) — das Glied steht im Panel, das Bild hoert trotzdem", () => {
  it("traegt den Regler im Panel und das Bild hoert trotzdem", async () => {
    localStorage.setItem("kepta_graph_bewegung", "0");
    // 362 px sind die im echten Fenster bei 390 px gemessene Zeilenbreite.
    const view = await flaeche(362);
    expect(
      view.container.querySelector('[data-testid="graph-verbindungsdicke"]'),
      "der Dicken-Regler fehlt im Ansicht-Panel"
    ).toBeTruthy();
    const vorher = await rahmenVermessen(view);
    const regler = await steuerelement(view);
    const panel = regler.closest('[data-testid="graph-leiste"]');
    expect(panel, "das Steuer steht nicht im Ansicht-Panel").toBeTruthy();
    await setzeDicke(regler, "3");
    const nachher = await rahmenVermessen(view);
    expect(nachher.length, `aus dem Panel gesetzt, 3x: andere Zahl von Strichen (${vorher.length} -> ${nachher.length})`).toBe(vorher.length);
    nachher.forEach((wert, i) => expect(wert, `Strich ${i} bei 3x aus dem Panel: gemessen ${wert}, erwartet ${skaere(vorher, 3)[i]}`).toBeCloseTo(skaere(vorher, 3)[i], 6));
    expect((view.container.querySelector('[data-testid="graph-verbindungsdicke-wert"]') as HTMLElement).textContent!.trim(), "die Zeile im Panel nennt 3x nicht").toBe("3x");
  });
});
