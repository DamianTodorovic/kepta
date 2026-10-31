// @vitest-environment jsdom
// Punkt 114 — was die ZUGEMACHTE Karte bei schmaler Breite decken darf.
//
// Gemessen 27.10. 14:03:09 bis 14:03:12 MESZ am gebauten 3.2.67 (eigne Kapsel, 600 Notizen,
// 390 x 844): die geschlossene Karte ist **209,5 px hoch bei 628 px Leinwand = 33,4 Prozent**,
// die offene 315 px = 50,2. Am echten Bestand meldet Punkt 2 262 von 628 = 41,7 Prozent.
// Die Leitung setzt die Latte auf **25 Prozent** (Brief `BRIEF-114-KLAPPENLAST-2710.md`) und
// nannte die Ordnung: die drei Erklaerungen des Zeichens (Zahlenreihe, Typ-Farben, Link-Arten)
// bleiben immer stehen, die Zustandszeilen fallen hinter die Klappe.
//
// Nachgemessen 31.10. am gebauten Stand (1 440 x 900, 1 500 Notizen, eigne Kapsel): die Regel
// galt nur bis 820 px, also gab der Griff bei breitem Fenster 6,5 Punkte zurueck — offen 38,6,
// zugemacht 32,1 Prozent. Zwei Aenderungen, beide gemessen begruendet:
// 1. Die Faltung gilt auf der aeussersten Ebene, ohne Breite.
// 2. Die Bilanz des Ausschnitts (`graph-im-bild`) traegt einen eignen Halter und bleibt stehen;
//    sie ist der einzige sichtbare Satz, dass die Ansicht ein Ausschnitt ist. Neu mitgefaltet
//    wird die Griffe-Zeile (`legende-griffe`) — Hilfe, keine Auskunft.
//
// Die Geometrie selbst haelt jsdom nicht (keine Media-Queries, keine Hoehen) — gehalten wird
// hier die HALTER-KETTE: Klasse an den Zeilen, Zustand an der Karte, Regel ohne Bedingung.
// Die Zahlen am ausgelieferten Stueck stehen in `feldzug/P1-BILDBEWEIS-GRAPH-3110.md` und in
// `feldzug/belege-3110/bild-vor-landung-3110/`.
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
/** Die Griffe-Zeile: Hilfe, kein Zustand — sie faellt mit, seit die Klappe oben gilt. */
const GRIFF_HALTER = "legende-griffe";
/** Die Ausnahme-Marke der Bilanz: sie traegt den Halter, faellt aber nicht hinter die Klappe. */
const BILANZ = "legende-bilanz";
const BILANZMARKE = "graph-im-bild";
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
    // Die Bilanzzeile traegt den Halter der Familie UND die Ausnahme-Marke: gemessen
    // 31.10. 19:39 am gebauten Stand bei 1 440 px und 1 500 Notizen ist sie der einzige
    // sichtbare Satz dafuer, dass die Ansicht ein Ausschnitt ist ("1 250 of 1 500
    // unfolded notes are in this picture"). Faellt sie mit, schliesst die Klappe die
    // Ehrlichkeit ein, nicht nur die Hilfe.
    const bilanz = leg.querySelector<HTMLElement>(`[data-testid="${BILANZMARKE}"]`);
    expect(bilanz, "die Bilanzzeile fehlt — die Flaeche sagt nichts mehr ueber ihren Ausschnitt").toBeTruthy();
    expect(bilanz!.classList.contains(BILANZ), "die Bilanzzeile traegt ihre Ausnahme-Marke nicht").toBe(true);
    // Die Griffe-Zeile ist Hilfe, keine Auskunft: sie traegt den zweiten Falt-Halter.
    const griffe = leg.querySelectorAll<HTMLElement>(`.${GRIFF_HALTER}`);
    expect(griffe.length, "keine Zeile traegt den Halter der Griffe").toBeGreaterThanOrEqual(1);
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

  /** Die Regel muss auf der aeussersten Ebene stehen: keine Breite darf sie auschalten. */
  const obersteEbene = (regel: RegExp) => {
    const m = regel.exec(css);
    expect(m, `die Regel fehlt in index.css: ${regel}`).not.toBeNull();
    const vorher = css.slice(0, m!.index);
    const offen = (vorher.match(/\{/g) || []).length - (vorher.match(/\}/g) || []).length;
    expect(offen, "die Regel liegt in einem Block — eine Bedingung schaltet sie aus").toBe(0);
    const block = css.slice(m!.index, m!.index + 120);
    expect(block, "die Regel versteckt nicht").toMatch(/display:\s*none/);
    return m![0].replace(/\{\s*$/, "").trim();
  };

  it("verbirgt die Zustandszeilen ohne Breiten-Bedingung", () => {
    // Bis 31.10. galt die Regel nur bis 820 px. Gemessen am gebauten Stand bei
    // 1 440 px und 1 500 Notizen: offen 38,6 %, ZUGEMACHT 32,1 % — die Klappe gab
    // 6,5 Punkte zurueck und blieb 7 Punkte ueber der Latte von 25 %. Der Knopf
    // heisst "Hide legend"; er muss oben ebenso falten wie unten.
    const selektor = obersteEbene(new RegExp(`\\.graph-legende\\[data-legende="zu"\\][^{]*\\.${HALTER}[^{]*\\{`));
    expect(selektor, "der Selektor nennt nicht den zugemachten Zustand").toMatch(/\[data-legende="zu"\]/);
    expect(selektor).toMatch(/\.graph-legende/);
    expect(selektor, "die Regel haengt an einer Breite").not.toMatch(/min-width|max-width:\s*\d/);
    // Die Ausnahme ist Teil der Regel, nicht ein zweiter Halter am Baustein: ohne
    // `:not(.legende-bilanz)` faelle auch die Bilanz des Ausschnitts hinter die Klappe.
    expect(selektor, "die Bilanzzeile ist nicht ausgenommen").toMatch(/:not\(\.legende-bilanz\)/);
  });

  it("verbirgt die Griffe-Zeile in derselben Regel", () => {
    obersteEbene(new RegExp(`\\.graph-legende\\[data-legende="zu"\\][^{]*\\.${GRIFF_HALTER}\\s*\\{`));
  });

  it("haelt die Prosa-Kappe bei 440 px unberuehrt", () => {
    // Die schmale Kappe ist eine eigne Entscheidung (Punkt 2, 19.10.) und darf von
    // der neuen Regel nicht mitgezogen werden: sie gilt nur unter 440 px.
    const m = /\.legende-prosa\s*\{/.exec(css);
    expect(m, "die Prosa-Kappe fehlt").not.toBeNull();
    const vorher = css.slice(0, m!.index);
    const offen = (vorher.match(/\{/g) || []).length - (vorher.match(/\}/g) || []).length;
    expect(offen, "die Prosa-Kappe steht nicht mehr in ihrer Breite").toBe(1);
    const anfang = vorher.lastIndexOf("@media");
    expect(css.slice(anfang, m!.index), "die Kappe gilt nicht mehr bei 440 px").toMatch(/max-width:\s*440px/);
  });
});
