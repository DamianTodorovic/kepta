// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "@testing-library/react";
import { render } from "@testing-library/react";
import { KnowledgeGraph, handWortZeile } from "../../src/components/KnowledgeGraph";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger, setzeTheme } from "../helfer/canvas";
import type { Memory } from "../../src/types";
import type { LayoutEdge } from "../../src/lib/graphLayout";

// Punkt 128, Stufe 3: der Graph nennt die Quelle seiner Wortlosigkeit.
//
// Gemessen 29.10. 15:21:53 an Damians laufender Instanz (`/api/graph?limit=500`, HTTP 200 in
// 65 ms): 1 468 Kanten im Leib, 1 468 davon mit einem Wort des Systems (776 co-mentions,
// 692 mentions), 0 mit einem Wort von einer Hand. Die Zahl kommt also aus dem Leib der Tuer,
// nicht aus einer Annahme - das war die Vorgabe des Briefs vor jedem Bau.
//
// Was dem Menschen fehlt, ist der Satz daran. Der Bodensatz von 3.2.88 („stay hidden until
// 90 % zoom") gilt einer andern Ursache: dort malt die Flaeche das Wort, nur weit draussen
// nicht. Hier gibt es kein Wort zu malen. Zwei Ursachen, zwei Saetze - darum steht dieser
// neben dem alten und ersetzt ihn nicht.

beforeEach(() => {
  installiereResizeObserver(1200, 800);
  installiereZeiger();
  setzeTheme("dunkel");
  localStorage.clear();
  installiereLeinwand();
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

function kante(wort: string | null): LayoutEdge {
  return { source: "__ent:nordwind", target: "__ent:elena", strength: 1, real: true, relation: wort };
}

async function bilder(n: number) {
  for (let i = 0; i < n; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 16)); });
  }
}

describe("handWortZeile: keine Linie traegt ein Wort von einer Hand (5)", () => {
  it("schweigt, wenn das Bild leer ist", () => {
    expect(handWortZeile([])).toBe("");
  });

  it("schweigt, wenn nur nicht-echte Linien im Feld stehen", () => {
    const tragend: LayoutEdge = { source: "k1", target: "__ent:nordwind", strength: 1, real: false };
    expect(handWortZeile([tragend])).toBe("");
  });

  it("nennt die Zahl der Linien, wenn alle Mitennungen sind", () => {
    const satz = handWortZeile([kante("mentions"), kante("mentions"), kante("co-mentions")]);
    expect(satz).toContain("none of these 3 lines carries a word you wrote");
  });

  it("zaehlt auch das zweite Systemwort mit, statt es fuer eine Hand zu halten", () => {
    const nurCo = handWortZeile([kante("co-mentions"), kante("co-mentions")]);
    expect(nurCo).toContain("none of these 2 lines");
    const gemischt = handWortZeile([kante("mentions"), kante("co-mentions"), kante("related")]);
    expect(gemischt).toContain("none of these 3 lines");
  });

  it("schweigt, sobald eine Linie ein Wort von einer Hand traegt", () => {
    expect(handWortZeile([kante("mentions"), kante("betreut")])).toBe("");
  });
});

describe("Kopfzeile des Graphen: der Satz steht am Zeichen und geht mit der ersten Hand", () => {
  function kopfVon(container: HTMLElement) {
    return container.querySelector('[data-testid="graph-kopf"]')?.textContent ?? "";
  }

  function strecke(relationen: Array<{ source: string; target: string; relation: string }>) {
    vi.stubGlobal("fetch", vi.fn(async (eingabe: unknown) => {
      const url = String(eingabe);
      if (url.includes("/api/graph")) {
        return new Response(JSON.stringify({
          relations: relationen.map((r) => ({ ...r, memoryId: null })),
          memoriesByEntity: { nordwind: ["k1", "k2"], elena: ["k3", "k4"] },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ memories: [], total: 0 }), { status: 200 });
    }));
  }

  async function flaeche() {
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
    await bilder(14);
    return view.container;
  }

  it("sagt an den Linien, dass keine ein Wort von einer Hand traegt", async () => {
    strecke([
      { source: "nordwind", target: "elena", relation: "mentions" },
      { source: "nordwind", target: "elena", relation: "co-mentions" },
    ]);
    const container = await flaeche();
    const kopf = kopfVon(container);
    expect(kopf, `der Satz fehlt in der Kopfzeile — Kopf: ${kopf}`).toContain("carries a word you wrote");
  });

  it("nimmt den Satz zurueck, sobald eine Hand ein Wort gesetzt hat", async () => {
    strecke([
      { source: "nordwind", target: "elena", relation: "mentions" },
      { source: "nordwind", target: "elena", relation: "betreut" },
    ]);
    const container = await flaeche();
    const kopf = kopfVon(container);
    // Ein Fall, der nur eine Abwesenheit prueft, kann nie verlieren: erst muss das Bild
    // nachweislich Linien zaehlen, dann darf die Zeile fehlen.
    expect(kopf, `das Bild zaehlt keine Linien, die Abwesenheit waer billig — Kopf: ${kopf}`).toMatch(/\d+ links?/);
    expect(kopf, "die Zeile behauptet eine Luecke, die das Bild nicht hat").not.toContain("carries a word you wrote");
  });

  // P53 Befund C, 4.11.: die zugeklappte Legende deckte bei 390 x 844 28.5 % der Leinwand
  // (Latte 25 %, P114), und die Kopfzeile allein nahm 99 von 191 Bildpunkten davon — weil der
  // RAT hinter der Zahl ("a line without one says only that two things belong together. Name a
  // claim…") in derselben Zeile stand. Geteilt: die Zahl und ihr Befund bleiben in der
  // Kopfzeile (die steht immer, und die zwei Faelle oben halten sie), der Rat zieht als eigne
  // Zeile hinter die Klappe. Geprüft wird die KETTE, nicht nur der Text: haelt der Halter
  // nicht, ist die Latte beim naechsten Wort wieder gerissen.
  it("stellt den Rat in eine eigne Zeile, die hinter die Klappe fallen kann", async () => {
    strecke([
      { source: "nordwind", target: "elena", relation: "mentions" },
      { source: "nordwind", target: "elena", relation: "co-mentions" },
    ]);
    const container = await flaeche();
    const rat = container.querySelector<HTMLElement>('[data-testid="graph-handwort-rat"]');
    expect(rat, "der Rat steht nicht mehr in der Kopfzeile — und ist auch nicht aufgetaucht").toBeTruthy();
    expect(String(rat!.textContent ?? ""), `der Rat sagt nicht, was er schuldet: "${rat!.textContent}"`).toContain("Name a claim in a note");
    expect(rat!.classList.contains("legende-zustand"), "der Rat traegt den Halter der Zustandszeilen nicht — die Klappe koennte ihn nie verdecken").toBe(true);
    expect(kopfVon(container), "die Kopfzeile fuehrt den Rat weiter, dann ist die Teilung nur eine Doppelung").not.toContain("Name a claim in a note");
    // Die Zahl selbst muss bleiben: sie ist die Auskunft, die der Nutzer beim Bild braucht.
    expect(kopfVon(container), "die Zahl fiel mit dem Rat aus der Kopfzeile").toContain("carries a word you wrote");
  });

  it("laesst den Rat weg, wenn eine Hand ein Wort gesetzt hat — beide Zeilen an derselben Bedingung", async () => {
    strecke([
      { source: "nordwind", target: "elena", relation: "mentions" },
      { source: "nordwind", target: "elena", relation: "betreut" },
    ]);
    const container = await flaeche();
    expect(container.querySelector('[data-testid="graph-handwort-rat"]'),
      "der Rat steht da, wo das Bild ein Wort von einer Hand hat").toBeNull();
  });
});
