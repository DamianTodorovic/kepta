// @vitest-environment jsdom
// Punkt 114 — was die ZUGEMACHTE Karte bei schmaler Breite decken darf.
//
// Gemessen 27.10. 14:03:09 bis 14:03:12 MESZ am gebauten 3.2.67 (eigne Kapsel, 600 Notizen,
// 390 x 844): die geschlossene Karte ist **209,5 px hoch bei 628 px Leinwand = 33,4 Prozent**,
// die offene 315 px = 50,2. Am echten Bestand meldet Punkt 2 262 von 628 = 41,7 Prozent.
// Die Leitung setzt die Latte auf **25 Prozent** (Brief `BRIEF-114-KLAPPENLAST-2710.md`) und
// nennt die Ordnung: die drei Erklaerungen des Zeichens (Zahlenreihe, Typ-Farben, Link-Arten)
// bleiben immer stehen, **die Zustandszeilen fallen hinter die Klappe** — sie melden, was
// DIESER Ausschnitt fehlt, und der aendert sich mit jedem Schwenk.
//
// Die Geometrie selbst haelt jsdom nicht (keine Media-Queries, keine Hoehen) — gehalten wird
// hier die HALTER-KETTE: Klasse an den Zeilen, Zustand an der Karte, Regel in der Bedingung.
// Die Zahlen am ausgelieferten Stueck stehen im Brief und in den Belegen.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { KnowledgeGraph } from "../../src/components/KnowledgeGraph";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger, setzeTheme, type Leinwand } from "../helfer/canvas";
import type { Memory } from "../../src/types";

/** Die Klasse, an der die Faltung haengt — nicht an einer Stelle in der Liste. */
const HALTER = "legende-zustand";
/** Dieselben vier Marken, die die Prosa-Kappe nie traf; jetzt tragen sie den Halter. */
const ZUSTANDSMARKEN = ["graph-zustaende", "graph-im-bild", "graph-benannt", "graph-kappen"];
/** Was die Klappe NIEMALS verdecken darf: die Erklaerung des Zeichens selbst. */
const IMMER = ["graph-kopf"];

let leinwand: Leinwand;
let zaehler = 0;
function note(): Memory {
  zaehler += 1;
  return {
    id: `z${zaehler}`, userId: "local", title: `Faltungsnotiz ${zaehler}`, content: "Inhalt",
    tags: ["begriff"], type: "semantic", scope: "local", confidence: 1,
    validFrom: null, validTo: null, supersededBy: null, deletedAt: null,
    createdAt: Date.parse("2024-01-01"), updatedAt: Date.parse("2024-01-01"),
  } as Memory;
}

beforeEach(() => {
  leinwand = installiereLeinwand();
  installiereResizeObserver(390, 628);
  installiereZeiger();
  setzeTheme("dunkel");
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 })));
});
afterEach(() => { vi.unstubAllGlobals(); });

async function zeichne() {
  const notizen = Array.from({ length: 6 }, note);
  const sicht = render(<KnowledgeGraph memories={notizen} onSelectMemory={() => {}} />);
  await act(async () => { await new Promise((r) => setTimeout(r, 150)); });
  const leg = sicht.container.querySelector<HTMLElement>('[data-testid="graph-legende"]');
  expect(leg, "die Legende muss stehen, sonst prueft dieser Fall nichts").toBeTruthy();
  return { sicht, leg: leg as HTMLElement };
}

describe("#114 die Zustandszeilen fallen hinter die Klappe", () => {
  it("haengt die Faltung an eine Klasse, nicht an eine Stelle", async () => {
    const { leg } = await zeichne();
    const gera = leg.querySelectorAll<HTMLElement>(`.${HALTER}`);
    expect(gera.length, "kein Zeilentraeger traegt den Halter").toBeGreaterThanOrEqual(1);
    for (const marke of ZUSTANDSMARKEN) {
      const el = leg.querySelector<HTMLElement>(`[data-testid="${marke}"]`);
      if (!el) continue;
      expect(el.classList.contains(HALTER), `${marke} muss hinter der Klappe fallen koennen`).toBe(true);
    }
  });

  it("nennt den Zustand der Klappe an einem Attribut der Karte", async () => {
    const { sicht, leg } = await zeichne();
    const kl = leg.querySelector<HTMLElement>('[data-testid="graph-legende-klappe"]');
    expect(kl, "kein Griff — die Klappe ist weg").toBeTruthy();
    // jsdom kennt keine Media-Queries: die Breite kommt ihr nicht her, ob die Karte
    // zu oder auf startet. Geprueft wird die KETTE — Attribut und Griff sagen dasselbe.
    const sagtDerGriff = () => (sicht.container.querySelector<HTMLElement>('[data-testid="graph-legende-klappe"]')!.getAttribute("aria-expanded"));
    const sagtDieKarte = () => sicht.container.querySelector<HTMLElement>('[data-testid="graph-legende"]')!.getAttribute("data-legende");
    expect(sagtDieKarte(), `die Karte nennt "${sagtDieKarte()}", der Griff "${sagtDerGriff()}"`).toBe(sagtDerGriff() === "true" ? "auf" : "zu");
    const vorher = sagtDieKarte();
    await act(async () => { kl!.click(); await new Promise((r) => setTimeout(r, 120)); });
    expect(sagtDieKarte(), "ein Klick, und die Karte nennt weiter denselben Zustand").not.toBe(vorher);
    expect(sagtDieKarte()).toBe(sagtDerGriff() === "true" ? "auf" : "zu");
  });

  it("laesst die Erklaerung des Zeichens ausserhalb der Faltung", async () => {
    const { leg } = await zeichne();
    for (const marke of IMMER) {
      const el = leg.querySelector<HTMLElement>(`[data-testid="${marke}"]`);
      expect(el, `${marke} fehlt`).toBeTruthy();
      expect(el!.classList.contains(HALTER), `${marke} darf nicht hinter der Klappe liegen`).toBe(false);
    }
    const punkte = leg.querySelectorAll("span.w-2");
    expect(punkte.length, "die Typ-Punkte sind weg — die Farbe erklaert dann nichts mehr").toBeGreaterThanOrEqual(4);
    for (const p of Array.from(punkte)) {
      expect(p.closest(`.${HALTER}`), "ein Typ-Punkt haengt in einer gefalteten Zeile").toBeNull();
    }
  });
});

describe("#114 die Falt-Regel in src/index.css", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src/index.css"), "utf8");

  it("verbirgt den Halter nur innerhalb der Breiten-Bedingung der Klappe", () => {
    const m = new RegExp(`\\.${HALTER}\\s*\\{`).exec(css);
    expect(m, "die Falt-Regel fehlt in index.css").not.toBeNull();
    const anfang = css.lastIndexOf("@media", m!.index);
    expect(anfang, "die Regel liegt ausserhalb jeder Bedingung").toBeGreaterThanOrEqual(0);
    const zwischen = css.slice(anfang, m!.index);
    expect(zwischen, "die Bedingung ist nicht die der Klappe").toMatch(/max-width:\s*820px/);
    // Zwischen Blockoeffnung und Halter darf nichts geschlossen haben.
    expect((zwischen.match(/\{/g) || []).length, "die Regel steht ausserhalb des Blocks").toBeGreaterThan((zwischen.match(/\}/g) || []).length);
    const block = css.slice(m!.index, m!.index + 120);
    expect(block, "die Regel versteckt nicht").toMatch(/display:\s*none/);
  });

  it("koppelt die Regel an den zugemachten Zustand der Karte", () => {
    const m = new RegExp(`\\.${HALTER}\\s*\\{`).exec(css)!;
    const zeilenAnfang = css.lastIndexOf("\n", m.index) + 1;
    const selektor = css.slice(zeilenAnfang, m.index).trim();
    expect(selektor, "der Selektor nennt nicht den zugemachten Zustand").toMatch(/\[data-legende="zu"\]/);
    expect(selektor).toMatch(/\.graph-legende/);
  });
});
