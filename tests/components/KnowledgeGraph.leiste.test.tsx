// @vitest-environment jsdom
// E2 — die Graph-Leiste: Prioritaet, Zeichen, Dichtestufe, Zeitachse.
//
// Vier Wachen, vier Befunde:
//   D1-01 / Z-03  kein Bedienelement ausserhalb des Fensters
//   A8-08 / Z-07  ein Zeichen pro Bedeutung — Auswahl, Schalter, Klappe
//   Z-12          Dichte ist eine Stufe, die eine Zahl bewegt
//   A8-03         der Zeitregler darf nicht ueber die Gegenwart hinaus luegen
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import {
  KnowledgeGraph,
  leistePlan,
  BREITE_PX_GELIED,
  RANG_FOLGE,
  LUECKE_PX,
  MENUE_PX,
} from "../../src/components/KnowledgeGraph";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger, setzeTheme } from "../helfer/canvas";
import type { Memory } from "../../src/types";

let setzeGroesse: (b: number, h: number) => void;

beforeEach(() => {
  installiereLeinwand();
  setzeGroesse = installiereResizeObserver(1132, 700);
  installiereZeiger();
  setzeTheme("dunkel");
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("style");
});

let zaehler = 0;
const note = (o: Partial<Memory> = {}): Memory => {
  zaehler++;
  return {
    id: `e2${zaehler}`, userId: "local", title: o.title ?? `Notiz ${zaehler}`, content: "Inhalt",
    tags: [], type: "semantic",
    createdAt: o.createdAt ?? Date.parse("2024-01-01"),
    updatedAt: o.updatedAt ?? o.createdAt ?? Date.parse("2024-01-01"),
    ...o,
  } as Memory;
};

/** Die Fenster, in denen D1 und A7 gemessen haben, plus das schmalste. */
const BREITEN = [1132, 716, 512, 362];

/** Was die Zeile braucht: ihre Glieder, der Atemzug dazwischen, das Menue. */
const noetig = (plan: { zeile: (keyof typeof BREITE_PX_GELIED)[]; menue: unknown[] }) =>
  plan.zeile.reduce((s, g) => s + BREITE_PX_GELIED[g], 0) +
  Math.max(0, plan.zeile.length - 1) * LUECKE_PX +
  (plan.menue.length > 0 ? LUECKE_PX + MENUE_PX : 0);

/**
 * Die Flaeche, mit der Breite, die die Zeile meldet.
 *
 * jsdom baut kein Layout: ohne eigenes Mass bleibt die Zeile bei „nicht
 * gemessen" und laesst alles stehen — was den Zeichen-Wachen recht ist. Eine
 * gemessene Breite setzt das Test von aussen an den Knoten und loest den
 * Beobachter aus, genau wie ein echtes Fenster es thut.
 */
async function flaeche(breite?: number, memories: Memory[] = [note(), note()]) {
  const view = render(<KnowledgeGraph memories={memories} onSelectMemory={() => {}} />);
  await act(async () => { await new Promise((r) => setTimeout(r, 140)); });
  if (breite !== undefined) {
    const bar = view.container.querySelector('[data-testid="graph-leiste"]') as HTMLElement;
    expect(bar, "die Zeile fehlt").toBeTruthy();
    Object.defineProperty(bar, "clientWidth", { value: breite + 16, configurable: true });
    await act(async () => {
      setzeGroesse(breite + 16, 700);
      await new Promise((r) => setTimeout(r, 80));
    });
  }
  return view;
}

describe("Z-03: die Zeile traegt, was sie zeigt", () => {
  it("laesst bei jeder Fensterbreite nichts ausserhalb des Fensters stehen", () => {
    for (const breite of BREITEN) {
      const plan = leistePlan(breite);
      expect(noetig(plan), `${breite} px: die Zeile braucht ${noetig(plan)} px`).toBeLessThanOrEqual(breite);
    }
  });

  it("baut von hinten ab, nicht quer durch die Fragen", () => {
    const plan = leistePlan(362);
    // Die zwei Dinge, nach denen D1s Prueffrage sucht: wie weit herausgezoomt,
    // und welche Zeit eingestellt ist.
    expect(plan.zeile).toContain("zoom");
    expect(plan.zeile).toContain("zeitstand");
    // Was zuerst geht, ist die Seltenheit, nicht die Auskunft.
    expect(plan.menue).toContain("farben");
    expect(plan.menue).toContain("kanal");
    expect(plan.menue).toContain("krafte");
  });

  it("ordnet die Rangfolge nach den Fragen, nicht nach der Knopfreihe", () => {
    const r = (g: string) => RANG_FOLGE.indexOf(g as never);
    expect(r("zoom")).toBeLessThan(r("zeitstand"));
    expect(r("zeitstand")).toBeLessThan(r("ansicht"));
    expect(r("ansicht")).toBeLessThan(r("namen"));
    expect(r("namen")).toBeLessThan(r("suche"));
  });

  it("kennt die Zeitgliede nur, wenn die Basis einen Zeitstand hat", () => {
    const ohne = leistePlan(362, RANG_FOLGE.filter((g) => !["zeitstand", "datum", "zeitregler"].includes(g)));
    expect(ohne.zeile).not.toContain("zeitstand");
    expect(ohne.zeile).toContain("zoom");
  });

  it("traegt alle Glieder im Panel — bei schmaler Breite faellt keins aus dem Fenster", async () => {
    // P202, Mockup-Grammatik (k3pta-app-fenster .graph-panel): die Werkzeuge
    // stehen VERTIKAL im Ansicht-Panel — die frühere quer-Zeile war der Grund,
    // warum Glieder aus dem Fenster fielen (D1-01) und die More-Klappe das
    // Bild überschwemmte. Bei 362 px steht das Panel rechts und trägt alles.
    const { container } = await flaeche(362);
    const leiste = container.querySelector('[data-testid="graph-leiste"]')!;
    expect(leiste.textContent).toMatch(/Many/);
    const mehr = [...leiste.querySelectorAll("button")].find((b) => (b.textContent ?? "").startsWith("More"));
    expect(mehr, "die Klappe ist keine mehr — das Panel trägt alles").toBeUndefined();
  });
});

describe("Z-07: ein Zeichen pro Bedeutung", () => {
  const knoepfe = (c: HTMLElement) => [...c.querySelectorAll("button")];

  it("zeichnet die Auswahl als Blatt in der Schiene, nie in Akzentfarbe", async () => {
    const { container } = await flaeche();
    const kraft = knoepfe(container).find((b) => b.textContent?.trim() === "Claims")!;
    expect(kraft.getAttribute("data-on"), "die gewaehlte Ansicht traegt kein Blatt").toBe("true");
    expect(kraft.getAttribute("style"), "die Auswahl malt in Akzentfarbe — das ist das Zeichen des Schalters").toBeNull();
    expect(kraft.className).toContain("apple-seg-btn");
    // P197: der Baum ist aus dem Produkt geflogen — nur Claims und Meaning bleiben.
    expect(knoepfe(container).find((b) => b.textContent?.trim() === "Tree"), "der Baum-Knopf ist zurück").toBeUndefined();
    expect(knoepfe(container).find((b) => b.textContent?.trim() === "Meaning")!.getAttribute("data-on")).toBe("false");
  });

  it("zeichnet den Schalter mit dem Haus-Schalter, und die Dichtestufe ohne (P197)", async () => {
    const { container } = await flaeche();
    const aehnlich = knoepfe(container).find((b) => (b.textContent ?? "").includes("Similar"))!;
    const schalter = aehnlich.querySelector('[data-testid="graph-schalter-punkt"]') as HTMLElement;
    expect(schalter, "der Knopf hat kein eigenes Zeichen").toBeTruthy();
    expect(schalter.getAttribute("data-on"), "aus zeigt den Haus-Schalter aus").toBe("false");
    await act(async () => {
      fireEvent.click(aehnlich);
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(schalter.getAttribute("data-on"), "an zeigt den Haus-Schalter an").toBe("true");
    expect(aehnlich.getAttribute("aria-pressed"), "Schalter und aria-pressed reden verschieden").toBe("true");
    // Eine Auswahl ist kein Schalter: in der Schiene sitzt nirgends ein Schalter.
    const schiene = container.querySelector('[data-testid="graph-schiene-namen"]')!;
    expect(schiene.querySelector('[data-testid="graph-schalter-punkt"]'), "die Dichtestufe tut so, als waere sie an").toBeNull();
  });

  it("verleiht demselben Wort nicht zwei Bedeutungen", async () => {
    const { container } = await flaeche();
    const worte = knoepfe(container)
      .map((b) => (b.textContent ?? "").replace(/\s+/g, " ").trim())
      .filter((t) => t && !t.startsWith("More ("));
    const doppel = worte.filter((t, i) => worte.indexOf(t) !== i);
    expect(doppel, `zwei Geraete heissen gleich: ${doppel.join(", ")}`).toEqual([]);
  });
});

describe("A8-03: die Skala endet heute", () => {
  const spaeter = Date.now() + 30 * 86_400_000;

  it("zeigt beim ersten Schritt von Now ein Datum in der Vergangenheit", async () => {
    const ms = [
      note({ id: "a", title: "Alt", createdAt: Date.parse("2024-01-01"), updatedAt: Date.parse("2024-01-01") }),
      note({ id: "b", title: "Frist spaeter", createdAt: Date.parse("2026-01-01"), updatedAt: Date.parse("2026-01-01"), validTo: spaeter }),
    ];
    // Bei 1 500 px tragt die Zeile auch das Datumsfeld; die Sonde liest den
    // Stand an ihm, weil die Flaeche Monate aus der Locale setzt.
    const { container } = await flaeche(1500, ms);
    const regler = container.querySelector('input[aria-label="Time of the knowledge shown"]') as HTMLInputElement;
    expect(regler, "Zeitregler fehlt").not.toBeNull();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    const stand = () => container.querySelector('[data-testid="graph-zeitstand"]')!.textContent!.trim();
    expect(stand()).toMatch(/^Now/);

    for (const wert of ["99.5", "99", "50"]) {
      setter.call(regler, wert);
      await act(async () => {
        regler.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 60));
      });
      expect(stand(), `bei ${wert} % steht kein Now mehr da`).not.toMatch(/^Now/);
      // Der Wert wird am Datumsfeld gelesen, nicht am Wort: die Flaeche setzt
      // Monatskuerzel aus der Locale, und eine Sonde ueber Monatsnamen faellt
      // beim naechsten Locale-Wechsel um.
      const feld = container.querySelector('input[type="date"]') as HTMLInputElement;
      expect(feld.value, `bei ${wert} % ist kein Tag gesetzt`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(
        Date.parse(`${feld.value}T23:59:59`),
        `${stand()} bei ${wert} % liegt in der Zukunft — gezogen wird rueckwaerts`
      ).toBeLessThanOrEqual(Date.now());
    }
  });

  it("laesst das Datumsfeld nicht ueber die Gegenwart hinaus fragen", async () => {
    const ms = [note({ validTo: spaeter }), note({ createdAt: Date.parse("2024-01-01") })];
    // Das Datumsfeld ist bei 1 440 px das erste Glied, das aus der Zeile faellt
    // (sein Anteil steht seit A8-03 fest: bis heute). Der Weg dahin ist der
    // Knopf mit der Zahl, nicht ein Rollner.
    const { container } = await flaeche(1500, ms);
    const datum = container.querySelector('input[type="date"]') as HTMLInputElement;
    expect(datum.max.slice(0, 4)).toBe(String(new Date().getFullYear()));
    expect(datum.getAttribute("title")).toMatch(/never runs past today/);
    // Was trotzdem spaeter endet, ist ein Zustand, keine Achse.
    expect(container.querySelector('[data-testid="graph-zeit-spaeter"]')?.textContent).toMatch(/\+1 later/);
  });
});

describe("Z-12: die Dichtestufe", () => {
  it("merkt sich die Stufe unter dem neuen Wort und liest das alte", async () => {
    localStorage.setItem("kepta_graph_labels", "key");
    const { container, unmount } = await flaeche();
    const schiene = container.querySelector('[data-testid="graph-schiene-namen"]')!;
    const gewaehlt = [...schiene.querySelectorAll("button")].find((b) => b.getAttribute("data-on") === "true");
    expect(gewaehlt?.textContent?.trim(), "der alte Merker 'key' zieht nicht die ruhige Stufe").toBe("Few");
    unmount();

    localStorage.setItem("kepta_graph_labels", "alle");
    const wieder = await flaeche();
    const alle = [...wieder.container.querySelectorAll('[data-testid="graph-schiene-namen"] button')]
      .find((b) => b.getAttribute("data-on") === "true");
    expect(alle?.textContent?.trim()).toBe("All");
  });

  it("schaltet durch: eine Stufe steht, und die naechste nimmt ihr das Blatt", async () => {
    const { container } = await flaeche();
    const stufen = [...container.querySelectorAll('[data-testid="graph-schiene-namen"] button')];
    expect(stufen.map((b) => b.textContent?.trim())).toEqual(["None", "Few", "Many", "All"]);
    await act(async () => {
      fireEvent.click(stufen[2]);
      await new Promise((r) => setTimeout(r, 60));
    });
    const an = stufen.filter((b) => b.getAttribute("data-on") === "true");
    expect(an.map((b) => b.textContent?.trim()), "nach dem Klick stehen zwei Stufen").toEqual(["Many"]);
    expect(localStorage.getItem("kepta_graph_labels")).toBe("mehr");
  });
});

describe("A8-05: die Zustandszeichen haben eine Zeile", () => {
  /** Was die Legende ueber die Zeichen sagt, Bild fuer Bild geschrieben. */
  const zustaende = (c: HTMLElement) =>
    c.querySelector('[data-testid="graph-zustaende"]')?.textContent?.trim() ?? "";

  it("erklaert den gestrichelten Ring, wo eine abgelaufene Notiz steht", async () => {
    const ms = [
      note({ title: "Gilt noch", createdAt: Date.parse("2024-01-01") }),
      note({ title: "Ist abgelaufen", createdAt: Date.parse("2024-01-01"), validTo: Date.parse("2025-01-01") }),
    ];
    const { container } = await flaeche(undefined, ms);
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
    expect(zustaende(container)).toMatch(/dashed ring — it no longer holds \(1\)/);
  });

  it("erklaert die leisere Tinte, wo eine ersetzte Notiz steht", async () => {
    const ms = [
      note({ title: "Alt", createdAt: Date.parse("2024-01-01"), supersededBy: "e2-neu" }),
      note({ id: "e2-neu", title: "Neu", createdAt: Date.parse("2024-06-01") }),
    ];
    const { container } = await flaeche(undefined, ms);
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
    expect(zustaende(container)).toMatch(/fainter ink — replaced \(1\)/);
  });

  it("schweigt, wenn nichts von den Zeichen im Bild steht", async () => {
    const { container } = await flaeche();
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
    expect(zustaende(container)).toBe("");
    expect(container.querySelector('[data-testid="graph-zustaende"]')!.getAttribute("style")).toMatch(/none/);
  });
});
