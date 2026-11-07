// @vitest-environment jsdom
// P144 — die Kantensprache. README.md:17 verspricht: "Every entry is a node, every connection an
// edge — real connections drawn solid, mere similarity dashed."
//
// Die Produktion entscheidet das an zwei Stellen: `src/components/KnowledgeGraph.tsx:3807`
// macht aus `!e.real` die Art "vermutung", und `:3898-3903` setzt danach den Strich — Vermutung
// `[3/k, 5/k]`, Behauptung und Erwaehnung `[]`. Geprueft war das nicht: die einzige Sonde fuer
// `setLineDash` in der Suite liest den abgelaufenen NOTIZ-Ring
// (`tests/components/KnowledgeGraph.render.test.tsx:742`), keine Kante.
//
// Was die Leinwand-Atrappe zeigen kann, ist weniger, als der Satz verspricht, und das ist
// gemessen (je ein Scratch-Patch an `:3898-3903`, danach `cp` aus der eignen Sicherung, `cmp`
// bytegleich):
//   01:17:09  Vermutung ohne Strich gemalt  ->  Fall 2 faellt.
//   01:17:39  auch die echten Kanten mit Strich gemalt  ->  beide Faelle bleiben gruen. Die
//             echten Verbindungen werden in diesem Bild als gefuellte Baender gemalt; ihr
//             Strich-Zustand erreicht keinen `stroke()`-Aufruf, und "solid" ist damit eine
//             Aussage ueber das Bild, die diese Sonde nicht pruefen kann.
//
// Also steht hier die Kehrseite, die die Leinwand wirklich hergibt: solange niemand
// Aehnlichkeiten ruft, traegt das Bild ueberhaupt keinen Strich — und wenn sie gerufen
// werden, traegt jeder Strich dasselbe Muster. Dass der Fall die eine Haelfte nicht prueft,
// sagt er; er tut nicht so, als.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, fireEvent } from "@testing-library/react";
import { KnowledgeGraph } from "../../src/components/KnowledgeGraph";
import {
  installiereLeinwand, installiereResizeObserver, installiereZeiger, setzeTheme, type Leinwand,
} from "../helfer/canvas";
import type { Memory } from "../../src/types";

let leinwand: Leinwand;

beforeEach(() => {
  leinwand = installiereLeinwand();
  installiereResizeObserver(1000, 700);
  installiereZeiger();
  setzeTheme("dunkel");
  localStorage.clear();
  // Echte Verbindungen ueber ein Begriffspaar — dasselbe Korpus wie der einzige Fall der
  // Suite, in dem echte Relationen wirklich gemalt werden
  // (`tests/components/KnowledgeGraph.render.test.tsx:705-718`).
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    relations: [{ source: "e1", target: "e2", relation: "mentions", memoryId: null }],
    memoriesByEntity: { e1: ["a"], e2: ["b"], e3: ["c", "d"] },
  }), { status: 200 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("style");
});

function notiz(ueber: Partial<Memory>): Memory {
  return {
    id: ueber.id ?? "x", userId: "local", title: ueber.title ?? "Notiz", content: ueber.content ?? "Inhalt",
    tags: ueber.tags ?? [], type: "semantic", createdAt: Date.parse("2024-01-01"), updatedAt: Date.parse("2024-01-01"),
    ...ueber,
  };
}

function welt(): Memory[] {
  return [
    notiz({ id: "a", title: "Mandat", content: "Der Rahmen läuft über zwei Jahre", tags: ["t"] }),
    notiz({ id: "b", title: "Frist", content: "Abgabe am Ende des Monats", tags: ["t"] }),
    notiz({ id: "c", title: "Reise", content: "Koffer, Bahn und ein Ticket", tags: ["t"] }),
    notiz({ id: "d", title: "Kuehlschrank", content: "Butter, Milch und ein Ei", tags: ["t"] }),
  ];
}

/**
 * Die Strichmuster, mit der tatsächlich eine Linie gemalt wurde. Ein `setLineDash` ohne
 * folgenden `stroke()` malt nichts, also zaehlt hier der Zug und nicht der Setz-Aufruf —
 * das ist der Unterschied zwischen "die Regel lief durch" und "das Bild traegt Striche".
 */
function gemalteStriche(): string[] {
  let strich: unknown = null;
  const out: string[] = [];
  for (const a of leinwand.letzterRahmen()) {
    if (a.op === "setLineDash") { strich = a.args[0]; continue; }
    if (a.op !== "stroke") continue;
    if (!Array.isArray(strich) || (strich as number[]).length === 0) continue;
    const laenge = (strich as number[]).length;
    out.push(laenge === 2 ? "zwei" : `muster${laenge}`);
  }
  return out;
}

/**
 * Ein frisches, gefuelltes Bild erzwingen. Die Schleife malt nur, solange sich etwas bewegt
 * (`src/components/KnowledgeGraph.tsx:5058`), und das ruhende letzte Bild kann ein reines
 * clearRect-Bild sein — gemessen 01:18:35 und 01:18:56: weder `stroke` noch `fill` im letzten
 * Rahmen. Ohne diesen Nachschuss liest eine Sonde ein leeres Bild und hält es für eine Aussage.
 */
async function frameNachNudge(view: { container: HTMLElement }) {
  const knopf = view.container.querySelector('button[title="Zoom in"]') as HTMLButtonElement;
  expect(knopf, "kein Zoom-Knopf — die Flaeche kann kein neues Bild erzwingen").not.toBeNull();
  await act(async () => { fireEvent.click(knopf); });
  await act(async () => { await new Promise((r) => setTimeout(r, 240)); });
  return leinwand.letzterRahmen();
}

async function zeige(mitAehnlichkeit: boolean) {
  const view = render(<KnowledgeGraph memories={welt()} onSelectMemory={() => {}} />);
  await act(async () => { await new Promise((r) => setTimeout(r, 260)); });
  if (mitAehnlichkeit) {
    const knopf = view.container.querySelector(
      'button[aria-pressed][title^="Show similarity links"]'
    ) as HTMLButtonElement;
    expect(knopf, "Der Aehnlichkeits-Schalter fehlt — die Flaeche kann nicht mehr umgeschaltet werden").not.toBeNull();
    await act(async () => { fireEvent.click(knopf); await new Promise((r) => setTimeout(r, 160)); });
  }
  // Nicht geleert: die Bildschleife rechnet nur, solange sich etwas bewegt
  // (`src/components/KnowledgeGraph.tsx:5058`). Das letzte Bild ist das ruhende Bild, das ein
  // Nutzer sieht — wer hier leert und wartet, misst eine Schleife, die nichts mehr malt
  // (gemessen 01:12:57: `stroke` = 0).
  return view;
}

describe("Kantensprache: der Strich gehoert den Aehnlichkeiten", () => {
  it("ohne Aehnlichkeits-Ruf traegt das Bild keinen einzigen Strich", async () => {
    const viewEcht = await zeige(false);
    const rahmen = await frameNachNudge(viewEcht);
    // Die echten Verbindungen liegen als gefuellte Baender im Bild (`:3955` schliesst den
    // Pfad, gemalt wird fuellend, nicht strichelnd) — deshalb ist "solid" hier keine
    // Strich-Einstellung, die jemand verlieren koennte, sondern die Bauart des Zugs.
    // Gezaehlt 01:18:35: in diesem Bild gibt es ueberhaupt keinen `stroke()`-Aufruf.
    expect(rahmen.filter((a) => a.op === "fill" || a.op === "stroke").length, "dieses Bild malt nichts — die Sonde läse eine leere Leinwand").toBeGreaterThan(0);
    expect(gemalteStriche(), "Striche in einer Welt ohne gerufene Aehnlichkeiten").toEqual([]);
  });

  it("mit dem Schalter traegt jede Aehnlichkeit denselben Strich", async () => {
    const view = await zeige(true);
    await frameNachNudge(view);
    const text = view.container.textContent ?? "";
    expect(text, `die Flaeche meldet keine Aehnlichkeit: ${text.slice(0, 180)}`).toMatch(/\d+ similar/);
    const striche = gemalteStriche();
    expect(striche.length, "keinerlei gestrichelter Zug, obwohl Aehnlichkeiten angezeigt werden").toBeGreaterThan(0);
    expect([...new Set(striche)], `mehr als ein Strichmuster im Bild: ${striche.join(",")}`).toEqual(["zwei"]);
  });
});
