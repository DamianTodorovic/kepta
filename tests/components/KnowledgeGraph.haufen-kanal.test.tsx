// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { Dashboard } from "../../src/components/Dashboard";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import { ToastProvider } from "../../src/components/ui/Toast";
import { installiereResizeObserver } from "../helfer/canvas";
import type { Memory } from "../../src/types";

// Punkt 117, Schnitt 2 — der Haufen-Kanal. Der Marktbericht (MARKT-GRAPH-2710.md) lies
// nach dem Nachrechnen genau eine Luecke: Haufen, die niemand vordefiniert hat. Die
// Latte dazu, Entscheidung 2: "ein Haufen, der einer Art entspricht, ist keine
// Community". Diese Datei haelt drei Dinge: dass der Schalter nur erscheint, wenn die
// Haufen etwas anderes sagen als die Arten; dass seine Zeile den Nenner nennt, ueber dem
// gerechnet wurde; und dass ein Klick den Kanal setzt und zuruecknimmt.

const NOTIZ = (i: number, art: string): Memory => ({
  id: `n${i}`, userId: "local", title: `Werkzeug ${i}`, content: `Inhalt ${i}`,
  tags: ["protokoll"], type: art as Memory["type"],
  createdAt: Date.parse("2025-01-01"), updatedAt: Date.parse("2025-01-01"),
});

/** Zwei Klubs: 1+2 haengen an Alpha/Beta, 3+4 an Gamma/Delta — ueber beide Arten gemischt. */
const gemischt = [NOTIZ(1, "episodic"), NOTIZ(2, "semantic"), NOTIZ(3, "episodic"), NOTIZ(4, "semantic")];
const KLUB_BEGRIFFE = { Alpha: ["n1", "n2"], Beta: ["n1", "n2"], Gamma: ["n3", "n4"], Delta: ["n3", "n4"] };
const KLUB_RELATIONEN = [
  { source: "Alpha", target: "Beta", relation: "begruendet", memoryId: "n1" },
  { source: "Gamma", target: "Delta", relation: "begruendet", memoryId: "n3" },
];

function tuer(begiffe: Record<string, string[]>, relationen: { source: string; target: string; relation: string; memoryId: string }[], notizen: Memory[]) {
  const erwahnungen = Object.entries(begiffe).flatMap(([name, ids]) =>
    ids.map((id) => ({ source: name, target: `Werkzeug ${id.slice(1)}`, relation: "mentions", memoryId: id }))
  );
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const ziel = String(url);
    if (ziel.includes("/api/memories")) {
      return new Response(JSON.stringify({ count: notizen.length, total: notizen.length, memories: notizen }), {
        status: 200, headers: { "content-type": "application/json", "x-kepta-total": String(notizen.length) },
      });
    }
    if (ziel.includes("/api/search")) return new Response(JSON.stringify({ results: [], total: 0 }), { status: 200 });
    if (ziel.includes("/api/graph/nachzug")) return new Response(JSON.stringify({ running: false, concepts: 0, edges: 0 }), { status: 200 });
    if (ziel.includes("/api/graph")) {
      return new Response(JSON.stringify({
        entities: Object.keys(begiffe).map((name) => ({ id: `e:${name}`, name })),
        relations: [...relationen, ...erwahnungen],
        memoriesByEntity: begiffe,
        bestand: { knoten: Object.keys(begiffe).length, kanten: relationen.length + erwahnungen.length },
        deckung: { notizen: notizen.length, gedeckt: notizen.length, anteilProzent: 100, widerspruch: null },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (ziel.includes("/api/inbox/status")) return new Response(JSON.stringify({ inboxDir: "/x", files: [], watching: true }), { status: 200 });
    if (ziel.includes("/api/health")) {
      return new Response(JSON.stringify({ ok: true, count: notizen.length, version: "3.2.71", embeddings: { total: 0, embedded: 0, models: {} }, encryption: { aktiv: true } }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }));
}

async function zeigeGraph() {
  const view = render(
    <AuthProvider><ThemeProvider><ToastProvider><Dashboard /></ToastProvider></ThemeProvider></AuthProvider>
  );
  await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
  const nav = [...view.container.querySelectorAll<HTMLElement>("button,a")].find((b) => (b.textContent || "").trim() === "Graph") ?? null;
  await act(async () => {
    nav?.click();
    await new Promise((r) => setTimeout(r, 2600));
  });
  return view;
}

const schalter = (container: HTMLElement) =>
  container.querySelector('[data-testid="graph-farbhaufen"]') as HTMLButtonElement | null;
const stand = (container: HTMLElement) =>
  (container.querySelector('[data-testid="graph-farbhaufen-stand"]')?.textContent || "").replace(/\s+/g, " ").trim();

beforeEach(() => {
  installiereResizeObserver();
  localStorage.clear();
  // jsdom gibt keine Breite her, also ware die Legende zu und der Schalter unsichtbar.
  localStorage.setItem("kepta_graph_legende", "offen");
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("#117 der Haufen-Kanal", () => {
  it("zeigt den Schalter, wenn die Haufen die Arten durchmischen", async () => {
    tuer(KLUB_BEGRIFFE, KLUB_RELATIONEN, gemischt);
    const { container } = await zeigeGraph();

    await waitFor(() => expect(schalter(container), "der Schalter fehlt, obwohl zwei Klubs rechnen").not.toBeNull());
    expect(schalter(container)!.getAttribute("aria-pressed")).toBe("false");
    expect(schalter(container)!.title).toMatch(/clusters over \d+ drawn dots/);
  });

  it("nennt im Stand Zahl und Grundgesamtheit, und der Klick setzt den Kanal", async () => {
    tuer(KLUB_BEGRIFFE, KLUB_RELATIONEN, gemischt);
    const { container } = await zeigeGraph();
    await waitFor(() => expect(schalter(container)).not.toBeNull());

    await act(async () => { schalter(container)!.click(); await new Promise((r) => setTimeout(r, 400)); });
    expect(schalter(container)!.getAttribute("aria-pressed"), "gedrueckt, aber nicht gesetzt").toBe("true");
    const text = stand(container);
    expect(text, "die Zeile nennt keine Grundgesamtheit").toMatch(/communities over \d+ drawn dots/);
    // #119: der Nenner ist das gezeichnete Feld, nicht die Begriffsliste. Dieser
    // Schirm traegt vier Notizen und acht Begriffe (vier genannte, vier Titel-Echos
    // des Schreibwegs) = zwölf gezeichnete Knoten. Vor dem Flicken stand dort 4 —
    // die Notizen waren aus der Grundgesamtheit still herausgefallen, und genau
    // darum malte der Kanal keinen einzigen Ton (BEFUND-119-HAUFEN-TON-2810.md).
    const nenner = Number((text.match(/over (\d+) drawn dots/) ?? [])[1]);
    expect(nenner, `die Zeile rechnet über ${nenner} statt über zwölf gezeichneten Knoten`).toBe(12);
    expect(text).toMatch(/largest \d+%/);
    // Ein Wort je Haufen, ohne Modell: der Haufen heisst nach seinem am besten
    // verbundenen Mitglied, und das sagt die Zeile auch so.
    expect(text, "die Zeile nennt keinen Haufen-Namen").toMatch(/named after its best-connected member: \S/);

    await act(async () => { schalter(container)!.click(); await new Promise((r) => setTimeout(r, 400)); });
    expect(schalter(container)!.getAttribute("aria-pressed"), "der Rueckweg fehlt").toBe("false");
    expect(stand(container), "die Zeile steht nach dem Rueckweg noch").toBe("");
  });

  it("weist den Schalter ab, wo die Haufen nur die Arten nachmalen", async () => {
    // Derselbe Rumpf wie oben, nur die Arten gleichfoermig: Klub eins lauter
    // Episoden, Klub zwei lauter Begriffe. Die Haufen sind dann richtig gerechnet
    // und sagen doch nichts Neues — das ist die Latte aus dem Marktbericht
    // ("ein Haufen, der einer Art entspricht, ist keine Community"), und sie muss
    // den Schalter verweigern, statt ein zweites Wort fuer dasselbe zu malen.
    const gleichfoermig = [NOTIZ(1, "episodic"), NOTIZ(2, "episodic"), NOTIZ(3, "semantic"), NOTIZ(4, "semantic")];
    tuer(KLUB_BEGRIFFE, KLUB_RELATIONEN, gleichfoermig);
    const { container } = await zeigeGraph();

    await waitFor(() => expect(container.querySelector('[data-testid="graph-kopf"]')).not.toBeNull());
    // Ohne offenen Schirm ware die Null unter der Legenden-Klappe entstanden, nicht
    // durch die Latte — der Gruppen-Schalter steht daneben und beweist den Schirm.
    expect(container.querySelector('[data-testid="graph-farbgruppe"]'), "die Legende ist zu, das Urteil waere blind").not.toBeNull();
    expect(schalter(container), "umlackierte Art ist keine Community, der Schalter durfte nicht stehen").toBeNull();
  });
});
