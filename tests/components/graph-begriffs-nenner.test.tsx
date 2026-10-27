// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { Dashboard } from "../../src/components/Dashboard";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import { ToastProvider } from "../../src/components/ui/Toast";
import { installiereResizeObserver } from "../helfer/canvas";
import type { Memory } from "../../src/types";

// Befund #113, gemessen 27.10. 02:48 bis 04:55 am ausgelieferten 3.2.66, geheilt am
// gebauten 3.2.67. Die Zahlenreihe der Legende sagt "0 concepts", die Tuer nennt 120
// und ihr eigner Auszug meldet "nothing dropped". Beide Zahlen sind wahr — sie haben
// nur verschiedene Grundgesamtheiten. Die Notiz-Haelfte derselben Zeile loest das
// seit dem 16.10. mit "of N in the store". Die erste Fassung dieser Heilung stand in
// der Bilanz-Prosa — und war damit bei schmaler Breite hinter der Prosa-Kappe
// unsichtbar (index.css `.legende-prosa`, Punkt 2, 19.10.; am gebauten 3.2.67
// gemessen 13:36 bis 13:38: Prosa 0 x 0 px bei 390). Der Nenner steht jetzt in der
// Kopfzeile selbst, die immer sichtbar ist — und **diese Datei haelt genau drei
// Dinge:** dass er erscheint, wenn die Tuer ihn nennt und etwas fehlt; dass er NICHT
// erscheint, wenn die Tuer schweigt oder nichts fehlt; und dass die Prosa ihn nicht
// ein zweites Mal malt. Keine Zahl fuehrt eine Ursache.

const NOTIZ = (i: number): Memory => ({
  id: `n${i}`, userId: "local", title: `Werkzeug ${i}`, content: `Inhalt ${i}`,
  tags: ["protokoll"], type: "semantic",
  createdAt: Date.parse("2025-01-01"), updatedAt: Date.parse("2025-01-01"),
});
const drei = [NOTIZ(1), NOTIZ(2), NOTIZ(3)];

function tuer(begiffe: Record<string, string[]>, bestand: { knoten: number; kanten: number } | null) {
  const relationen = Object.entries(begiffe).flatMap(([name, ids]) =>
    ids.map((id) => ({
      source: name,
      target: `Werkzeug ${id.slice(1)}`,   // dasselbe Bild wie am echten Objekt: die Gegenseite ist der Titel
      relation: "mentions", memoryId: id,
    })));
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const ziel = String(url);
    if (ziel.includes("/api/memories")) {
      return new Response(JSON.stringify({ count: drei.length, total: drei.length, memories: drei }), {
        status: 200, headers: { "content-type": "application/json", "x-kepta-total": String(drei.length) },
      });
    }
    if (ziel.includes("/api/search")) return new Response(JSON.stringify({ results: [], total: 0 }), { status: 200 });
    if (ziel.includes("/api/graph/nachzug")) return new Response(JSON.stringify({ running: false, concepts: 0, edges: 0 }), { status: 200 });
    if (ziel.includes("/api/graph")) {
      return new Response(JSON.stringify({
        entities: Object.keys(begiffe).map((name) => ({ id: `e:${name}`, name })),
        relations: relationen,
        memoriesByEntity: begiffe,
        ...(bestand ? { bestand } : {}),
        deckung: { notizen: drei.length, gedeckt: drei.length, anteilProzent: 100, widerspruch: null },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (ziel.includes("/api/inbox/status")) return new Response(JSON.stringify({ inboxDir: "/x", files: [], watching: true }), { status: 200 });
    if (ziel.includes("/api/health")) {
      return new Response(JSON.stringify({ ok: true, count: drei.length, version: "3.2.67", embeddings: { total: 0, embedded: 0, models: {} }, encryption: { aktiv: true } }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }));
}

async function zeichne() {
  const view = render(
    <AuthProvider><ThemeProvider><ToastProvider><Dashboard /></ToastProvider></ThemeProvider></AuthProvider>
  );
  await act(async () => {
    const knopf = await waitFor(() => {
      const k = [...view.container.querySelectorAll<HTMLElement>("button,a")].find((b) => /^graph$/i.test((b.textContent || "").trim()));
      if (!k) throw new Error("kein Graph-Reiter");
      return k;
    });
    knopf.click();
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
  return view;
}

const kopfText = (container: HTMLElement) =>
  (container.querySelector('[data-testid="graph-kopf"]')?.textContent || "").replace(/\s+/g, " ").trim();
const prosaText = (container: HTMLElement) =>
  [...container.querySelectorAll(".legende-prosa")].map((e) => (e.textContent || "").replace(/\s+/g, " ").trim()).join(" || ");

// Zwei Grundformen, beide aus dem echten Bild von 02:48 gelernt. **Die erste ist die Kapsel
// selbst:** jeder Begriff heisst wie der Titel seiner einen Notiz, also ist jeder ein Echo, also
// zeichnet das Netz null von ihnen. **Die zweite ist der Mischfall, den ich zuerst gebaut und
// falsch erwartet habe:** "Nordwind GmbH" haengt an zwei Notizen und wird darum gezeichnet, und
// die beiden Zielnamen der Behauptungen ("Werkzeug 1", "Werkzeug 2") haben gar keinen Eintrag in
// `memoriesByEntity` — null Traeger sind nicht "ein Traeger", also sind sie keine Echoe und
// werden ueber die Kante aufgenommen. **Drei von 120, nicht null** — gemessen 04:53:20, und die
// Zahl steht jetzt als Erwartung im Fall, damit ein spaeterer Umbau sie nicht still verschiebt.
const alleEchos = { "Werkzeug 1": ["n1"], "Werkzeug 2": ["n2"], "Werkzeug 3": ["n3"] };
const gemischt = { "Nordwind GmbH": ["n1", "n2"], "Werkzeug 3": ["n3"] };

beforeEach(() => installiereResizeObserver());
afterEach(() => { vi.unstubAllGlobals(); });

describe("#113 die Begriffs-Haelfte der Kopfzeile nennt ihren Nenner", () => {
  it("nennt null gemalte von 120 im Bestand, wenn jeder Begriff ein Titel-Echo ist", async () => {
    tuer(alleEchos, { knoten: 120, kanten: 60 });
    const { container } = await zeichne();
    const kopf = kopfText(container);
    expect(kopf, `der Nenner fehlt in der Kopfzeile: "${kopf.slice(0, 300)}"`).toMatch(/0 concepts of 120 in the store/);
  });

  it("nennt die gemalte Zahl, wo sie nicht null ist: drei von 120 im Mischfall", async () => {
    tuer(gemischt, { knoten: 120, kanten: 60 });
    const { container } = await zeichne();
    const kopf = kopfText(container);
    expect(kopf, `die Kopfzeile malt die falsche Grundgesamtheit: "${kopf.slice(0, 300)}"`).toMatch(/3 concepts of 120 in the store/);
  });

  it("schweigt, wenn die Tuer ueber dem Bestand nichts sagt", async () => {
    tuer(alleEchos, null);
    const { container } = await zeichne();
    const kopf = kopfText(container);
    expect(kopf, `eine Zahl ohne Bestand steht da: "${kopf.slice(0, 300)}"`).toMatch(/0 concepts/);
    expect(kopf, `eine Zahl ohne Bestand steht da: "${kopf.slice(0, 300)}"`).not.toMatch(/concepts of \d/);
  });

  it("schweigt, wenn die Flaeche jeden Begriff des Bestands malt", async () => {
    // Zwei Begriffe, je von zwei Notizen getragen: beide werden gezeichnet, die Tuer nennt genau
    // zwei — dann hat die Zeile nichts zu melden, und ein Zusatz, der immer steht, ist Dekoration.
    tuer({ "Nordwind GmbH": ["n1", "n2"], "Frist Q4": ["n2", "n3"] }, { knoten: 2, kanten: 0 });
    const { container } = await zeichne();
    const kopf = kopfText(container);
    expect(kopf, `der Zusatz steht trotz voller Deckung: "${kopf.slice(0, 300)}"`).not.toMatch(/of 2 in the store/);
  });

  it("malt den Nenner nicht ein zweites Mal in die Bilanz-Prosa", async () => {
    // Die erste Fassung stand in der Prosa und war bei 390 unsichtbar; die zweite steht in der
    // Kopfzeile. Stünde sie in beiden, widerspräche die Fläche sich selbst in zwei Tönen — die
    // Prosa-Klausel muss also weg bleiben, nicht nur dekoriert werden.
    tuer(alleEchos, { knoten: 120, kanten: 60 });
    const { container } = await zeichne();
    const prosa = prosaText(container);
    expect(prosa, `die Prosa malt den Nenner doppelt: "${prosa.slice(0, 400)}"`).not.toMatch(/concepts in the store/);
  });
});
