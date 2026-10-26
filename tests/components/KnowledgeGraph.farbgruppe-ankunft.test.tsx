// @vitest-environment jsdom
//
// Punkt 5, #96 zweiter Schlag - das Steuer nennt, was in diesem Bild ankommt.
//
// Die Anklage an dieser Flaeche ist nicht "der Knopf geht nicht", sondern: der Knopf meldet
// `aria-pressed=true` und sein Titel verspricht, dass Gruppen die Knoten faerben - und im Bild
// kann trotzdem nur eine Gruppe stehen, waehrend die andre ihre Mitglieder nur im Modell hat.
// Ein gedruckter Zustand behauptet eine Regel, kein Ergebnis. Diese Datei misst deshalb
// **beides gemeinsam**: den Zustand des Steuerers und die Zahl der Gruppen, die in diesem
// Bild wirklich ankommen.
//
// Die Latte des Auftrags: ein Fall, der auch ohne die Regel gewinnt, ist kein Fall. Darum
// zaehlt die Ankunft nur, was der Malweg im strengen Rahmen malt - eine Gruppe ohne Treffer
// kommt nicht an, und ein Feld, das ueber den Rahmen hinausgeht, meldet ihre Null. Der
// Mutationslauf (Ankunft aus dem Modell statt aus dem Bild) ist im Blatt gemeldet: er macht
// Fall 3 und Fall 4 rot.
//
// **Vorher rot, gemessen:** an `99c15b8` (3.2.59) nennt das Steuer keinen Griffsname in der
// Oberflaeche (sein sichtbarer Text war die Achsenfrage), und `graph-farbgruppe-bild` gibt es
// nicht - die Ankunft war an keiner Stelle zu lesen.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { KnowledgeGraph } from "../../src/components/KnowledgeGraph";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger, setzeTheme } from "../helfer/canvas";
import type { Memory } from "../../src/types";

const BREITE = 1440;
const HOEHE = 700;

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

/** Vier Notizen mit `garten`, eine davon zusaetzlich mit `werkstatt`, eine nur mit
 *  `werkstatt`, zwei ohne Marke. Eine gesetzte Gruppe (`vergessen`) trifft absichtlich
 *  nichts - sie darf in der Ankunft nicht zaehlen. */
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

/** Ein Feld, das den Rahmen nicht mehr faellt: zwanzig Notizen, jede dritte zusaetzlich in
 *  der zweiten Gruppe. Fuer die Rahmen-Stellung in Fall 4. */
function weitesFeld(): Memory[] {
  const out: Memory[] = [];
  for (let i = 0; i < 20; i++) {
    out.push(notiz(`n${i}`, `Notiz ${i}`, i % 3 === 0 ? ["garten", "werkstatt"] : ["garten"]));
  }
  out.push(notiz("x1", "Nur Werkstatt", ["werkstatt"]));
  out.push(notiz("x2", "Ohne Marke", []));
  return out;
}

function begriffe(feld: Memory[]) {
  const entities = [
    { id: 1, name: "Beet" },
    { id: 2, name: "Werkstatt" },
  ];
  const relations: unknown[] = [];
  const traeger: Record<string, string[]> = {
    Beet: feld.filter((m) => (m.tags ?? []).includes("garten")).map((m) => m.id),
    Werkstatt: feld.filter((m) => (m.tags ?? []).includes("werkstatt")).map((m) => m.id),
  };
  for (const [name, ids] of Object.entries(traeger)) {
    for (const id of ids) relations.push({ id: `r-${name}-${id}`, source: name, target: name, relation: "mentions", memoryId: id });
  }
  return { entities, relations, memoriesByEntity: traeger, bestand: { knoten: entities.length, kanten: relations.length } };
}

function gruppenSetzen(marken: string[]) {
  localStorage.setItem(
    "kepta_tag_gruppen",
    JSON.stringify({ marken, farben: { garten: "#e2703a", werkstatt: "#3fbfa8", vergessen: "#c65b8c" } }),
  );
}

beforeEach(() => {
  installiereLeinwand();
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

async function flaeche(marken: string[], feld: Memory[] = bestand()) {
  localStorage.setItem("kepta_graph_view", "force");
  gruppenSetzen(marken);
  const leib = begriffe(feld);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) =>
      new Response(String(url).startsWith("/api/graph?") ? JSON.stringify(leib) : JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 })
    )
  );
  const view = render(<KnowledgeGraph memories={feld} onSelectMemory={vi.fn()} />);
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

const text = (view: Awaited<ReturnType<typeof flaeche>>, kennung: string) =>
  (view.container.querySelector(`[data-testid="${kennung}"]`) as HTMLElement | null)?.textContent ?? null;

/** Das Steuer selbst anfassen - Fall 1 prueft den Namen, die andern Faelle sollen an ihrer
 *  eignen Zahl sterben, nicht am Namen. */
async function steuerAnklicken(view: Awaited<ReturnType<typeof flaeche>>) {
  const kn = view.container.querySelector('[data-testid="graph-farbgruppe"]') as HTMLElement | null;
  expect(kn, "das Farb-Steuer fehlt an der Flaeche").toBeTruthy();
  await act(async () => {
    fireEvent.click(kn as HTMLElement);
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 50));
  });
  return kn as HTMLElement;
}

describe("#96 zweiter Schlag - pressed und Ankunft gemeinsam gemessen", () => {
  it("nennt seinen Griffsname in der Oberflaeche, und der Klick trifft ihn", async () => {
    const view = await flaeche(["garten", "werkstatt"]);
    const kn = [...view.container.querySelectorAll("button")].find((b) => /colour by group/iu.test(b.textContent ?? ""));
    expect(kn, "der Name des Griffs steht nicht in der Oberflaeche - ein Titel ist ein Schwebetext").toBeTruthy();
    expect((kn as HTMLElement).tagName).toBe("BUTTON");
    // Derselbe Knoten traegt Name, Kennung und Zustand: ein Klick auf den Namen ist der Griff.
    expect((kn as HTMLElement).getAttribute("data-testid")).toBe("graph-farbgruppe");
    expect((kn as HTMLElement).getAttribute("aria-pressed")).toBe("false");
    await act(async () => {
      fireEvent.click(kn as HTMLElement);
      await new Promise((r) => setTimeout(r, 120));
    });
    expect((kn as HTMLElement).getAttribute("aria-pressed"), "der Klick auf den Namen hat den Zustand nicht bewegt").toBe("true");
  });

  it("meldet pressed und die Zahl der ankommenden Gruppen im selben Atemzug", async () => {
    const view = await flaeche(["garten", "werkstatt"]);
    expect(text(view, "graph-farbgruppe-bild"), "die Ankunft-Zeile spricht, bevor das Steuer gedrueckt ist").toBe("");
    const kn = await steuerAnklicken(view);
    expect(kn.getAttribute("aria-pressed")).toBe("true");
    expect(text(view, "graph-farbgruppe-bild"), "das Steuer meldet zwei Gruppen, das Bild nennt keine Ankunft").toBe(
      "2 of 2 groups arrive in this picture"
    );
  });

  it("zaehlt eine Gruppe nicht in die Ankunft, die nichts malt", async () => {
    const view = await flaeche(["garten", "werkstatt", "vergessen"]);
    await steuerAnklicken(view);
    const stand = text(view, "graph-farbgruppe-stand") ?? "";
    expect(stand, "das Modell nennt seine Mitgliedschaft nicht mehr").toContain("5 of 7");
    // Drei Gruppen gesetzt, zwei davon malen: die Ankunft ist die kleinere Zahl, nicht die Liste.
    expect(text(view, "graph-farbgruppe-bild")).toBe("2 of 3 groups arrive in this picture");
  });

  it("senkt die Ankunft mit dem Rahmen, nicht mit der Zahl der Knoten", async () => {
    const view = await flaeche(["garten", "werkstatt"], weitesFeld());
    const kn = await steuerAnklicken(view);
    expect(kn.getAttribute("aria-pressed")).toBe("true");
    expect(text(view, "graph-farbgruppe-bild")).toBe("2 of 2 groups arrive in this picture");
    // Erste Stellung: mit dem eignen Knopf heranziehen. Weniger Knoten im Rahmen, aber beide
    // Gruppen haben noch einen Knoten darin - die Ankunft darf nicht die Knotenzahl nachsagen.
    const rein = [...view.container.querySelectorAll("button")].find((b) => (b.getAttribute("title") || "") === "Zoom in") as HTMLElement;
    expect(rein, "der Zoom-in-Knopf fehlt - die Flaeche ist nicht mehr zu bedienen").toBeTruthy();
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        fireEvent.click(rein);
        for (let j = 0; j < 3; j++) await new Promise((r) => setTimeout(r, 50));
      });
    }
    const enger = text(view, "graph-im-bild") ?? "";
    expect(enger, "nach vier Schritten Hereinzoomen meldet die Flaeche keinen engeren Rahmen").toMatch(/^\d+ of 22 unfolded notes are in this picture$/u);
    expect(Number(enger.split(" ")[0]), `nur ${enger}, und die Ankunft nennt keine Gruppen`).toBeLessThan(22);
    expect(text(view, "graph-farbgruppe-bild"), `Rahmen: "${enger}" - beide Gruppen sind noch im Bild`).toBe("2 of 2 groups arrive in this picture");
    // Zweite Stellung: den Rahmen stufenweise einziehen, bis er keinen Knoten mehr faesst. Die
    // Flaeche sagt das selbst, und die Ankunft muss auf null fallen, obwohl der Knopf weiter
    // auf "gedrueckt" steht.
    let rahmen = enger;
    for (const [b, h] of [[300, 200], [60, 40], [20, 16]] as const) {
      if (/no unfolded notes/.test(rahmen)) break;
      await act(async () => {
        setzeGroesse(b, h);
        for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 50));
      });
      rahmen = text(view, "graph-im-bild") ?? "";
    }
    expect(rahmen, "auch im engsten Rahmen sagt die Flaeche nichts ueber Knoten ausserhalb").toContain("no unfolded notes are in this picture");
    expect(
      text(view, "graph-farbgruppe-bild"),
      `Rahmen: "${rahmen}" - die Ankunft bleibt bei der Modellzahl, obwohl der Knopf gedrueckt bleibt`
    ).toBe("0 of 2 groups arrive in this picture");
    expect(kn.getAttribute("aria-pressed"), "die Ankunft sinkt, aber der Knopf nimmt seine Regel zurueck").toBe("true");
  });
});
