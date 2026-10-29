// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "@testing-library/react";
import { render } from "@testing-library/react";
import { KnowledgeGraph, kantenWortZeile, KANTEN_ETIKETT_AB_ZOOM } from "../../src/components/KnowledgeGraph";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger, setzeTheme, type Leinwand } from "../helfer/canvas";
import type { Memory } from "../../src/types";
import type { LayoutEdge } from "../../src/lib/graphLayout";

// Punkt 118, die zweite Haelfte: der Boden des Beziehungs-Wortes.
//
// Das Wort selbst malt die Flaeche langst, und die Kopfzeile nennt ihren Bestand an Linien.
// Was fehlte, ist der Satz, der sagt, warum an einer Linie trotzdem nichts steht: die
// Etikett-Schwelle (src/components/KnowledgeGraph.tsx:244 — ab 0,9 Bildmass). Das Haus hat
// dieselbe Ehrlichkeit fuer Aehnlichkeits-Linien langst gebaut (`aehnlichkeitsZeile`, :1016,
// „hidden until 55 % zoom"), nur fuer das Wort an der Behauptung fehlt sie. Ein Mensch sieht
// also ein Feld mit Linien und keine einzige Auskunft darueber, was die Linien bedeuten — und
// hat keinen Hinweis, dass Naeherkommen die Antwort bringt.
//
// Der Fall haelt an zwei Orten: an der reinen Funktion (vier Zustands-Kombinationen, ohne
// die zwei, die nichts behaupten, waere das Gruen billig) und an der Kopfzeile im echten
// Aufbau — darunter die Entlassung: derselbe Regler, der die Worte freigibt, muss den Satz
// zuruecknehmen. Steht der Satz, obwohl die Worte malen, erzaehlt die Flaeche eine Luecke,
// die nicht da ist.

let leinwand: Leinwand;

beforeEach(() => {
  installiereResizeObserver(1200, 800);
  installiereZeiger();
  setzeTheme("dunkel");
  localStorage.clear();
  leinwand = installiereLeinwand();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 }))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("style");
});

let zaehler = 0;
function note(over: Partial<Memory> = {}): Memory {
  zaehler++;
  return {
    id: `k${zaehler}`, userId: "local", title: `Notiz ${zaehler}`, content: "Inhalt",
    tags: [], type: "semantic",
    createdAt: Date.parse("2025-01-01"), updatedAt: Date.parse("2025-01-01"),
    ...over,
  };
}

/** Eine Kante, wie der Mal-Pass sie sieht: echt, mit Typwort. */
function behauptungsKante(wort: string | null): LayoutEdge {
  return { source: "__ent:nordwind", target: "__ent:elena", strength: 1, real: true, relation: wort };
}
/** Eine Kante ohne Typwort: Erwaehnung und Aehnlichkeit fuehren nichts zu behaupten. */
function tragendeKante(): LayoutEdge {
  return { source: "k1", target: "__ent:nordwind", strength: 1, real: true };
}

async function bilder(n: number) {
  for (let i = 0; i < n; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 16)); });
  }
}

const zoomProzent = (container: HTMLElement) =>
  Number((container.querySelector('[title="Current zoom"]')?.textContent ?? "9999").replace(/[^\d.]/g, ""));

describe("#118 der Boden des Beziehungs-Wortes", () => {
  it("ist der Boden zu, nennt die Zeile ihn — mit der Zahl, die der Mal-Pass fragt", () => {
    const s = kantenWortZeile(true, 0.5, [behauptungsKante("betreut"), tragendeKante()]);
    expect(s, "unter der Schwelle mit einer behauptenden Linie steht kein Satz").toContain("stay hidden until");
    expect(s, "der Satz nennt ein andres Bildmass als die Schwelle")
      .toContain(`${Math.round(KANTEN_ETIKETT_AB_ZOOM * 100)} % zoom`);
    expect(KANTEN_ETIKETT_AB_ZOOM, "die Schwelle ist nicht 0,9 — der Satz waere eine erfundene Zahl").toBe(0.9);
  });

  it("ist der Boden offen, schweigt die Zeile", () => {
    expect(kantenWortZeile(true, 1.2, [behauptungsKante("betreut")]),
      "die Worte malen, und die Zeile behauptet trotzdem eine Luecke").toBe("");
  });

  it("traegt das Feld keine behauptende Linie, schweigt die Zeile — die Kontrolle", () => {
    // Ohne diese Zeile waere der erste Fall ein Sieg ohne Gegenprobe: ein Satz, der
    // immer steht, erzaehlt von einem Loch, das niemand hat.
    expect(kantenWortZeile(true, 0.4, [tragendeKante(), behauptungsKante(null), behauptungsKante("mentions")]),
      "ein Feld ohne Typwort meldet ein Wort, das es nicht hat").toBe("");
    expect(kantenWortZeile(true, 0.4, []), "ein leeres Feld meldet einen Boden").toBe("");
  });

  it("ist es die Dichtestufe, nennt nicht der Zoom den Grund", () => {
    // Die Stufen „keine" und „mehr" nehmen die Typen an der Linie zurueck — dafuer steht
    // ihre eigne Erklaerung am Dichteknopf. Zwei Ursachen, zwei Saetze, nie einer fuer
    // beide: sonst schickt die Flaeche jemanden zum Zoomregler, der die Dichte verstellen muss.
    expect(kantenWortZeile(false, 0.3, [behauptungsKante("betreut")])).toBe("");
  });

  it("steht der Satz in der Kopfzeile und verschwindet mit dem Naeherkommen", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: [{ source: "nordwind", target: "elena", relation: "betreut", memoryId: null }],
      memoriesByEntity: { nordwind: ["k1", "k2"], elena: ["k3", "k4"] },
    }), { status: 200 })));
    const view = render(
      <KnowledgeGraph
        memories={[
          note({ id: "k1", title: "Besprechung mit dem Wetterdienst" }),
          note({ id: "k2", title: "Notiz vom 3. Quartal" }),
          note({ id: "k3", title: "Uebergabe in der Geschaeftsstelle" }),
          note({ id: "k4", title: "Protokoll der Sitzung" }),
        ]}
        onSelectMemory={() => {}}
      />
    );
    await bilder(12);
    const { container } = view;
    const raus = container.querySelector('button[title="Zoom out"]') as HTMLButtonElement;
    const rein = container.querySelector('button[title="Zoom in"]') as HTMLButtonElement;
    expect(raus, "kein Zoom-out-Knopf").toBeTruthy();
    expect(rein, "kein Zoom-in-Knopf").toBeTruthy();

    await act(async () => {
      for (let i = 0; i < 20 && zoomProzent(container) >= KANTEN_ETIKETT_AB_ZOOM * 100; i++) {
        raus.click();
        await new Promise((r) => setTimeout(r, 40));
      }
    });
    expect(zoomProzent(container), "der Regler kam nicht unter die Schwelle").toBeLessThan(KANTEN_ETIKETT_AB_ZOOM * 100);
    await bilder(4);
    const kopf = () => (container.querySelector('[data-testid="graph-kopf"]')?.textContent ?? "");
    expect(kopf(), `unter dem Boden steht kein Bodensatz — Kopfzeile: ${kopf()}`)
      .toContain("stay hidden until 90 % zoom");

    await act(async () => {
      for (let i = 0; i < 24 && zoomProzent(container) < KANTEN_ETIKETT_AB_ZOOM * 100; i++) {
        rein.click();
        await new Promise((r) => setTimeout(r, 40));
      }
    });
    expect(zoomProzent(container), "der Regler kam nicht ueber die Schwelle").toBeGreaterThanOrEqual(KANTEN_ETIKETT_AB_ZOOM * 100);
    await bilder(4);
    expect(kopf(), "ueber dem Boden behauptet die Zeile noch eine Luecke").not.toContain("stay hidden until");
  });

  it("malt ueber dem Boden das Wort — damit der Satz nicht vor einer leeren Linie steht", async () => {
    // Der andre Verbraucher desselben Grundes: die Sonde auf der Leinwand. Fuehlt sich
    // dieser Fall wie eine Wiederholung an, ist er das nicht — er ist die einzige Stelle,
    // die zeigt, dass ueber dem genannten Boden wirklich ein Wort kommt.
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: [{ source: "nordwind", target: "elena", relation: "betreut", memoryId: null }],
      memoriesByEntity: { nordwind: ["k1", "k2"], elena: ["k3", "k4"] },
    }), { status: 200 })));
    render(
      <KnowledgeGraph
        memories={[
          note({ id: "k1", title: "Besprechung mit dem Wetterdienst" }),
          note({ id: "k2", title: "Notiz vom 3. Quartal" }),
          note({ id: "k3", title: "Uebergabe in der Geschaeftsstelle" }),
          note({ id: "k4", title: "Protokoll der Sitzung" }),
        ]}
        onSelectMemory={() => {}}
      />
    );
    await bilder(14);
    const worte = new Set<string>();
    for (const a of leinwand.letzterRahmen()) {
      if (a.op === "fillText" || a.op === "strokeText") worte.add(String(a.args[0]));
    }
    expect([...worte], `kein Beziehungs-Wort im letzten Bild; gemalt wurden: ${[...worte].join(", ")}`)
      .toContain("betreut");
  });
});
