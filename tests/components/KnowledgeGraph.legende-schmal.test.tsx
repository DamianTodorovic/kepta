// @vitest-environment jsdom
// Punkt 2 (Design), Legenden-Auftrag — die schmale Breite traegt das Bild.
//
// Gemessen 19.10. am ausgelieferten 3.2.22 (eigne lesende Wand vor Port 60487,
// chrome-headless-shell, echter Bestand 21 066 Knoten): bei 390 px frisst die
// Legende 289,5 bis 331 px von 628 px Leinwand — 46,1 % bis 52,7 % des Rahmens.
// Fuenf Zeilen davon sind Prosa ueber den Bestand, nur vier erklaeren das Bild.
//
// Der erste Entwurf dieser Kappe hing an `:nth-child(3,6,8,9,10)`. 3.2.23 hat der
// Legende stabile Marken gegeben (`graph-im-bild`, `graph-benannt`, `graph-kappen`),
// und damit traife genau die alte Zahl die Zustandszeile, die den Nutzer anruft,
// wenn nichts im Bild steht. **Eine Stellenangabe ist kein Halter.** Dieser Fall
// bindet die Kappe deshalb an eine Klasse und haelt zugleich fest, dass die
// Zustandszeilen nie unter ihr verschwinden.
//
// Die Geometrie selbst ist in jsdom nicht zu halten (keine Media-Queries, keine
// Hoehen) — sie ist im ausgelieferten Objekt gemessen und steht in
// `audit-2026-10-09/feldzug/P2-LEGENDE-19-10.md`.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { KnowledgeGraph } from "../../src/components/KnowledgeGraph";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger, setzeTheme, type Leinwand } from "../helfer/canvas";
import type { Memory } from "../../src/types";

/** Die Marke, an der die Kappe haengt — nicht an einer Stelle in der Liste. */
const MARKE = "legende-prosa";
/** Die Zeilen, die der Kappe NIEMALS fallen duerfen: sie melden, was im Bild fehlt. */
const ZUSTANDSMARKEN = ["graph-zustaende", "graph-im-bild", "graph-benannt", "graph-kappen"];

let leinwand: Leinwand;

beforeEach(() => {
  leinwand = installiereLeinwand();
  installiereResizeObserver(390, 628);
  installiereZeiger();
  setzeTheme("dunkel");
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("style");
});

let zaehler = 0;
function note(): Memory {
  zaehler += 1;
  return {
    id: `l${zaehler}`, userId: "local", title: `Legendennotiz ${zaehler}`, content: "Inhalt",
    tags: ["begriff"], type: "semantic", scope: "local", confidence: 1,
    validFrom: null, validTo: null, supersededBy: null, deletedAt: null,
    createdAt: Date.parse("2024-01-01"), updatedAt: Date.parse("2024-01-01"),
  } as Memory;
}

async function zeichneLegende() {
  const notizen = Array.from({ length: 6 }, note);
  const sicht = render(<KnowledgeGraph memories={notizen} onSelectMemory={() => {}} />);
  await act(async () => { await new Promise((r) => setTimeout(r, 150)); });
  const leg = sicht.container.querySelector('[data-testid="graph-legende"]');
  expect(leg, "die Legende muss stehen, sonst prueft dieser Fall nichts").toBeTruthy();
  return { leg: leg as HTMLElement, leinwand };
}

describe("Legende bei schmaler Breite — Marke statt Stelle", () => {
  it("kennt ihre Prosa-Zeilen an einer eignen Klasse", async () => {
    const { leg } = await zeichneLegende();
    const prose = Array.from(leg.querySelectorAll<HTMLElement>(`.${MARKE}`));
    // Wenigstens die Glyphen-Erklaerung und der Griff-Hinweis sind Prosa.
    expect(prose.length).toBeGreaterThanOrEqual(2);
    const worte = prose.map((el) => (el.textContent || "").replace(/\s+/g, " ").trim());
    expect(worte.join(" ")).toMatch(/letter in a dot/i);
    expect(worte.join(" ")).toMatch(/Drag|Zoom|pan/i);
  });

  it("laesst die Zustandszeilen von der Kappe unangetastet", async () => {
    const { leg } = await zeichneLegende();
    for (const marke of ZUSTANDSMARKEN) {
      const el = leg.querySelector<HTMLElement>(`[data-testid="${marke}"]`);
      if (!el) continue; // Zeilen, die schweigen, sind nicht gerendert — das ist ihr Recht
      expect(el.classList.contains(MARKE), `${marke} darf nicht unter der Kappe liegen`).toBe(false);
    }
  });

  it("haelt die Zahl und die Typ-Punkte immer sichtbar", async () => {
    const { leg } = await zeichneLegende();
    const kopf = leg.querySelector('[data-testid="graph-kopf"]');
    expect(kopf).toBeTruthy();
    expect((kopf as HTMLElement).classList.contains(MARKE)).toBe(false);
    const punkte = leg.querySelectorAll("span.w-2");
    expect(punkte.length).toBeGreaterThanOrEqual(4);
    for (const p of Array.from(punkte)) {
      const zeile = p.closest(`.${MARKE}`);
      expect(zeile, "ein Typ-Punkt haengt in einer Prosa-Zeile").toBeNull();
    }
  });
});

describe("Legenden-Kappe in src/index.css", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src/index.css"), "utf8");

  /** Die STELLE DER REGEL, nicht der erste Fund des Wortes: die Marke steht auch
   *  im erklaerenden Kommentar, und ein `indexOf` auf das Wort fand dort statt in
   *  der Bedingung — derselbe Fehler, den das Haus „null aus der Sonde" nennt. */
  const regelStelle = (css: string) => {
    const m = /\.legende-prosa\s*\{/.exec(css);
    return m ? m.index : -1;
  };

  it("verbirgt die Marke, und zwar nur bis 440 px", () => {
    const stelle = regelStelle(css);
    expect(stelle, "die Kappe fehlt in index.css").toBeGreaterThanOrEqual(0);
    const anfang = css.lastIndexOf("@media", stelle);
    expect(anfang).toBeGreaterThanOrEqual(0);
    expect(css.slice(anfang, stelle)).toMatch(/max-width:\s*440px/);
    // Zwischen dem Oeffnen des Blocks und der Marke darf nichts geschlossen haben —
    // sonst liegt die Regel ausserhalb der Bedingung und gilt ueberall.
    const offnung = css.slice(anfang, stelle).indexOf("{");
    expect(offnung).toBeGreaterThanOrEqual(0);
    expect(css.slice(anfang + offnung, stelle).includes("}")).toBe(false);
    expect(css.slice(stelle, stelle + 240)).toMatch(/display:\s*none/);
  });

  it("nennt einen Grund im Kommentar, damit niemand die Kappe als Fehler loest", () => {
    const stelle = regelStelle(css);
    const vorher = css.slice(Math.max(0, stelle - 1800), stelle);
    const kommentar = vorher.slice(vorher.lastIndexOf("/*"));
    expect(kommentar).toMatch(/440|Telefon|schmal/i);
    expect(kommentar).toMatch(/Legende|Prosa/);
  });
});
