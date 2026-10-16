// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger, setzeTheme } from "../helfer/canvas";
import type { Memory } from "../../src/types";

// Was die Fläche mit dem Bestand der Tür tut. Der Fall ist ohne echten Server:
// `src/lib/store` wird gekapselt, weil hier nur die Zahl aus dem Kopf interessiert.
//
// Gehalten wird die Sperre der Leitung in beiden Richtungen:
//   - sagt die Tür 14 702, muss die Fläche „100 notes of 14,702 in the store"
//     nennen und ihr Verdikt gegen den Bestand rechnen (nicht gegen die Seite);
//   - schweigt die Tür, darf die Fläche keine Bestandgröße erfinden.

const kapsel = vi.hoisted(() => ({ bestand: null as number | null }));
vi.mock("../../src/lib/store", () => ({
  bestandGroesse: () => kapsel.bestand,
  seiteIstBegrenzt: () => true,
}));

const { KnowledgeGraph } = await import("../../src/components/KnowledgeGraph");

let setzeGroesse: (b: number, h: number) => void;
let zaehler = 0;
function note(): Memory {
  zaehler++;
  return {
    id: `b${zaehler}`, userId: "local", title: `Notiz ${zaehler}`, content: "Inhalt",
    tags: [], type: "semantic", createdAt: Date.parse("2024-01-01"), updatedAt: Date.parse("2024-01-01"),
  };
}

beforeEach(() => {
  installiereLeinwand();
  setzeGroesse = installiereResizeObserver(1000, 700);
  installiereZeiger();
  setzeTheme("dunkel");
  localStorage.clear();
  zaehler = 0;
  kapsel.bestand = null;
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 })
  ));
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("style");
});

async function flaeche(notizen: Memory[]) {
  const view = render(<KnowledgeGraph memories={notizen} onSelectMemory={() => {}} />);
  await act(async () => { await new Promise((r) => setTimeout(r, 160)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 160)); });
  return view;
}

describe("Der Kopf nennt die gemalte Zahl und den Bestand der Tür", () => {
  it("sagt ‚of 14,702 in the store', wenn die Seite 100 bringt", async () => {
    kapsel.bestand = 14_702;
    const { container } = await flaeche(Array.from({ length: 100 }, note));
    const kopf = container.querySelector('[data-testid="graph-kopf"]')?.textContent ?? "";
    expect(kopf, kopf).toMatch(/100 notes of 14,702 in the store/);
    // Und das Verdikt. Seit #16 gilt: eine Bestandsdeckung darf die Fläche nur
    // nennen, wenn die Tür sie mitliefert — hier schweigt sie (`deckung` fehlt),
    // also zählt die Klaue das Fenster und heißt „in this picture". Unter der
    // Marke von 200 Knoten gibt es in diesem Fenster kein Verdikt, und das ist
    // die ehrliche Antwort auf eine halbe Auskunft. Die Bestandstellung steht in
    // ihrem eignen Fall weiter unten.
    expect(container.textContent).toMatch(
      /0 of 100 notes in this picture carry a concept/
    );
    expect(container.textContent).not.toMatch(/not a network yet/);
    expect(setzeGroesse).toBeTypeOf("function");
  });

  it("erfindet keinen Bestand, wenn die Tür schweigt", async () => {
    kapsel.bestand = null;
    const { container } = await flaeche(Array.from({ length: 100 }, note));
    const kopf = container.querySelector('[data-testid="graph-kopf"]')?.textContent ?? "";
    expect(kopf, kopf).toMatch(/^100 notes/);
    expect(kopf).not.toMatch(/in the store/);
    expect(container.textContent).not.toMatch(/of 14,702/);
  });

  it("lässt den Zusatz weg, wenn die Seite den ganzen Bestand bringt", async () => {
    kapsel.bestand = 100;
    const { container } = await flaeche(Array.from({ length: 100 }, note));
    const kopf = container.querySelector('[data-testid="graph-kopf"]')?.textContent ?? "";
    expect(kopf, kopf).not.toMatch(/in the store/);
  });

  it("dünnt im GEKLEMMTEN Fenster: zwei gedeckte Notizen von 14 702", async () => {
    // Der Punkt, an dem sich Detailstufe und Nenner berühren. Vorher rechnete
    // `punktwolke` gegen die Seitenlänge (100 < Floor 200 → nie), jetzt gegen
    // den Bestand der Tür. Die Seite bringt 100 Notizen, zwei hängen an einem
    // Begriff — gemalt werden zwei Notizen und ein Begriff, und die 98 anderen
    // werden gesagt, statt verschluckt.
    kapsel.bestand = 14_702;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: [],
      memoriesByEntity: { docker: ["b1", "b2"] },
    }), { status: 200 })));
    const { container } = await flaeche(Array.from({ length: 100 }, note));
    const kopf = container.querySelector('[data-testid="graph-kopf"]')?.textContent ?? "";
    expect(kopf, kopf).toMatch(/^2 notes of 14,702 in the store · 1 concept/);
    expect(container.textContent).toMatch(
      /98 notes hang under no concept and are not painted — search still finds them/
    );
    // Die Deckung steht nicht zweimal da: solange die Detailstufe ausdünnt,
    // trägt die Masse-Klaue dieselben zwei Größen („gemalt" und „nicht gemalt")
    // — die zweite Klaue mit derselben Zahl wäre der Widerspruch, den F8-N1 an
    // dieser Zeile rügt.
    expect(container.textContent).not.toMatch(/of 14,702 notes carry a concept/);
  });

  it("schreibt seine Mengen im selben Kleid wie die Bilanz", async () => {
    // Damians Bild 18:34 MESZ, zwei Zeilen untereinander:
    //   „21066 notes · 159 concepts · 1061 links"
    //   „345 of 21,066 notes carry a concept"
    // Dieselbe Größe, ein Zeilenabstand, zwei Schreibweisen — genau die Klasse,
    // die dashboard-bestand.test.tsx für den Gehirn-Chip schon sperrt.
    kapsel.bestand = 14_702;
    const { container } = await flaeche(Array.from({ length: 1050 }, note));
    const kopf = container.querySelector('[data-testid="graph-kopf"]')?.textContent ?? "";
    expect(kopf, kopf).toMatch(/^1,050 notes of 14,702 in the store/);
    expect(kopf, "rohe Menge neben formatierter im selben Kopf").not.toMatch(/^1050 notes/);
  });

  it("dünnt nicht, wenn die Seite gar nichts Gedecktes bringt", async () => {
    // Mein eigener Befund vom Kunstbestand: die neuesten 100 Notizen hängen an
    // keinem Begriff, `netz.knoten` ist leer. Dann greift der Schutz vor dem
    // leeren Bild — die Fläche malt weiter, was sie hat, statt eine Zahl auf
    // weißen Grund zu setzen.
    kapsel.bestand = 14_702;
    const { container } = await flaeche(Array.from({ length: 100 }, note));
    expect(container.textContent).not.toMatch(/are not painted/);
    expect(container.textContent).toMatch(
      /0 of 100 notes in this picture carry a concept/
    );
  });

  it("nimmt die Deckung von der Tür, nicht den Auszug des Fensters", async () => {
    // #16 — die einzige Zahl im Fenster, die direkt über seinem Wissen steht.
    // Die Tür sagt 1 018 von 21 066 gedeckt (4,83 %); durch die Kappen von
    // `getGraph` lassen in diesem Auszug 345. Rechnet die Fläche den Auszug
    // gegen den Bestand, liest Damian 1,65 % vernetztes Wissen, wo sein Bestand
    // zu 4,83 % gedeckt ist — und die Zeile unterschätzt ihn um den Faktor drei.
    kapsel.bestand = 21_066;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: [],
      memoriesByEntity: { docker: Array.from({ length: 345 }, (_, i) => `b${i + 1}`) },
      bestand: { notizen: 21_066, begriffe: 2_756, kanten: 2_726 },
      deckung: {
        notizen: 21_066, gedeckt: 1_018, anteilProzent: 4.83,
        hinweis: "notes covered = active notes that mention at least one concept",
      },
    }), { status: 200 })));
    const { container } = await flaeche(Array.from({ length: 1_050 }, note));
    const text = container.textContent ?? "";
    expect(text, text).toMatch(/1,018 of 21,066 notes carry a concept/);
    expect(text, "die Fläche rechnet weiter den Auszug gegen den Bestand").not.toMatch(/345 of 21,066/);
  });

  it("erfindet keinen Bestand, wenn die Tür schweigt — auch nicht halben", async () => {
    // Die zweite Stellung derselben Regel: ohne `deckung` darf die Zeile keinen
    // Bestand behaupten, weil ihr Zähler dann nur das Fenster kennt. 14 702 als
    // Nenner neben 345 aus dem Auszug ist genau die Zahl, die Damian falsch herumsagt.
    kapsel.bestand = 14_702;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: [],
      memoriesByEntity: { docker: Array.from({ length: 345 }, (_, i) => `b${i + 1}`) },
    }), { status: 200 })));
    const { container } = await flaeche(Array.from({ length: 1_050 }, note));
    const text = container.textContent ?? "";
    expect(text, text).toMatch(/345 of 1,050 notes in this picture carry a concept/);
    expect(text, "ein Fenster-Zähler vor einem Bestands-Nenner").not.toMatch(/of 14,702 notes carry a concept/);
  });
});
