// @vitest-environment jsdom
// #17 — die Titelbreite fragt den Zoom.
//
// Der Befund an Damians echtem Bild (Vorlaeufer-Lauf 17.10. 19:2x, 1 440×900,
// 21 066 Notizen, sein Bestand durch die Tuer): die Flaeche steht bei 4 % und
// malt **null** von 729 Notiznamen. Zwei Tore schliessen sich gegenseitig:
// die Höhen-Schalte (`KnowledgeGraph.tsx:2943`) wirft unter 93,08 % jeden
// Gang-Punkt, und die Breiten-Schalte (`:3079`) verlangt fuer einen Titel von
// 26 Zeichen so viel Spaltenteil, wie der Einpass-Deckel nie hergibt.
//
// Gemessen, nicht geraten (eigener Chromium-Lauf ueber 1 000 echte Titel,
// `600 11px ui-sans-serif, system-ui, -apple-system, sans-serif`):
//   Median 145,27 Bildpixel je 26-Zeichen-Titel (p95 168,25 · groesster 175,94)
//   ein Zeichen der Flaeche: "nn" = 13,61 px, also 6,805 px je Zeichen
//   die Auslassung "…" allein: 10,01 px
//   Spaltenteil bei 100 % Zoom: GANG_ABSTAND · 1 = 26 px
// Ein Titel, der seine Reihe nicht fragen darf, passt in 26 px nie. Also folgt
// die Kuerzungsgrenze dem Reihenabstand auf dem Schirm — abgeleitet, und der
// Fall leitet aus derselben Quelle ab, statt eine Zahl abzuschreiben.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, fireEvent } from "@testing-library/react";
import { KnowledgeGraph } from "../../src/components/KnowledgeGraph";
import { GANG_ABSTAND, gangKuerzungZeichen } from "../../src/lib/graphLayout";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger, setzeTheme } from "../helfer/canvas";
import type { Memory } from "../../src/types";

let zaehler = 0;
let leinwand: ReturnType<typeof installiereLeinwand>;
function note(over: Partial<Memory> = {}): Memory {
  zaehler++;
  return {
    id: `m${zaehler}`, userId: "local", title: `Notiz ${zaehler}`, content: "Inhalt",
    tags: [], type: "semantic", createdAt: Date.parse("2024-01-01"), updatedAt: Date.parse("2024-01-01"),
    ...over,
  } as Memory;
}

beforeEach(() => {
  leinwand = installiereLeinwand();
  installiereResizeObserver(1000, 700);
  installiereZeiger();
  setzeTheme("dunkel");
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); document.documentElement.removeAttribute("style"); });

describe("gangKuerzungZeichen — die Reihe sagt, wie viel Titel sie traegt", () => {
  // Erfundene Masse, damit keine Erwartung aus dem Quelltext abgeschrieben ist:
  // ein Paar von 8 px (4 px je Zeichen) und eine Auslassung von 4 px.
  it("gibt der Reihe so viele Zeichen, wie neben ihrer Auslassung stehen", () => {
    // 52 px Reihe − 4 px Auslassung = 48 px, geteilt durch 4 px je Zeichen.
    expect(gangKuerzungZeichen(2, 8, 4, 26)).toBe(12);
  });

  it("kennt bei 50 % eine streng kleinere Grenze als bei 200 %", () => {
    const eng = gangKuerzungZeichen(0.5, 8, 4);
    const weit = gangKuerzungZeichen(2, 8, 4);
    expect(eng, "die Grenze fragt den Zoom nicht").toBeLessThan(weit);
  });

  it("holt ihre Reihe aus GANG_ABSTAND, nicht aus einer Zahl im Fall", () => {
    const paar = 8;
    const auslassung = 4;
    // Dieselbe Rechnung, einmal mit der Quellen-Konstanten, einmal ausgeschrieben:
    // wird GANG_ABSTAND im Quelltext geaendert, aendert sich BEIDES — ein
    // abgeschriebener Wert kann das nicht mitmachen.
    expect(gangKuerzungZeichen(1, paar, auslassung)).toBe(
      Math.floor((GANG_ABSTAND * 1 - auslassung) / (paar / 2)),
    );
    expect(gangKuerzungZeichen(1, paar, auslassung, GANG_ABSTAND * 2)).toBeGreaterThan(
      gangKuerzungZeichen(1, paar, auslassung),
    );
  });

  it("traut einer Reihe, die schmaler ist als ihre Auslassung, keinen Namen zu", () => {
    expect(gangKuerzungZeichen(0.01, 8, 4)).toBe(0);
    expect(gangKuerzungZeichen(0, 8, 4)).toBe(0);
    expect(gangKuerzungZeichen(1, 0, 4)).toBe(0);
  });
});

describe("Gang-Titel in der Startstufe „Few“ (#17)", () => {
  function hub(k: number) {
    const traeger = Array.from({ length: k }, (_, i) => `b${i}`);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).startsWith("/api/graph?")) {
        return new Response(JSON.stringify({
          entities: [{ id: 1, name: "Sammelbecken" }],
          relations: [{ id: "r1", source: "Sammelbecken", target: "Blatt 0", relation: "mentions", memoryId: "b0" }],
          memoriesByEntity: { Sammelbecken: traeger },
          bestand: { knoten: 1, kanten: Math.max(1, traeger.length) },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 });
    }));
  }

  /** Zwei Klassen: `G*` passt auch ungefragt in eine Reihe, `T*` nicht. Die
   *  ersten drei Zeichen eines langen Titels sind seine Kennung — bei 100 %
   *  bleibt von „T11einTitel…" genau das übrig, und nur so ist derselbe Knoten
   *  in zwei Blenden wiederzufinden. */
  const masse = (n: number) =>
    Array.from({ length: n }, (_, i) => note({
      id: `b${i}`,
      title: i < 10 ? `KERN${i}` : i % 2 === 0 ? `G${i}` : `T${String(i).padStart(3, "0")}einTitelueberseineZelleZelle`,
      content: `einzigartiger Inhalt ${i}`, tags: [],
    }));

  async function zeichne(memories: Memory[]) {
    const view = render(<KnowledgeGraph memories={memories} onSelectMemory={vi.fn()} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
    return view;
  }
  const bilder = async (n = 8) => { await act(async () => { await new Promise((r) => setTimeout(r, n * 20)); }); };
  const zoomAnzeige = (c: HTMLElement) =>
    Number(((c.querySelector('[title="Current zoom"]')?.textContent ?? "").match(/([\d.,]+)\s*%/) ?? ["0", "0"])[1].replace(",", "."));
  const etat = (c: HTMLElement) => (c.querySelector('[data-testid="graph-benannt"]')?.textContent ?? "").trim();
  /** Die gemalten Titel mit ihrer Breite, so wie der Zeichenbuch sie selbst misst. */
  const gemalt = (_c: HTMLElement, marke: RegExp) =>
    leinwand
      .schriften()
      .filter((s) => marke.test(s.text))
      .map((s) => ({ text: s.text, px: s.text.length * s.schrift * 0.5 }));

  /** Hereinzoomen bis die Anzeige sagt, was der Fall braucht. */
  async function zoomeNach(prozent: number, c: HTMLElement) {
    const rein = [...c.querySelectorAll("button")].find((b) => b.title === "Zoom in");
    expect(rein, "der Zoom-in-Knopf fehlt — der Fall greift nicht").toBeTruthy();
    for (let i = 0; i < 60 && zoomAnzeige(c) < prozent; i++) {
      await act(async () => { rein!.click(); await new Promise((r) => setTimeout(r, 30)); });
    }
    await bilder(6);
    return zoomAnzeige(c);
  }

  /**
   * Zurueck ins Ganze fahren, bevor der Fall hineinzoomt. Seit 3.2.23 steht die
   * Anfangskamera auf der Gegend, die Namen traegt, und der namenlose Gang liegt
   * nicht mehr im Bild. Dieser Fall will den Gang sehen und nimmt dafuer den
   * Knopf, den ein Mensch nimmt: „Fit the whole graph into view".
   */
  async function fahreInsGanze(c: HTMLElement) {
    const kn = [...c.querySelectorAll("button")].find((b) => b.title === "Fit the whole graph into view");
    expect(kn, "der Einpass-Knopf fehlt — der Fall greift nicht").toBeTruthy();
    await act(async () => { kn!.click(); await new Promise((r) => setTimeout(r, 80)); });
    await bilder(6);
  }

  /** Die Dichtestufe, die das Raster abstellt — nur dort malt der Gang alles,
   *  was er bauen kann, und die Breite zeigt sich ohne jeden zweiten Grund. */
  async function stufe(c: HTMLElement, wort: string) {
    const kn = [...c.querySelectorAll("button[aria-pressed]")].find((b) => b.textContent?.trim() === wort);
    expect(kn, `die Dichtestufe „${wort}" fehlt — der Fall greift nicht`).toBeTruthy();
    await act(async () => { fireEvent.click(kn!); await new Promise((r) => setTimeout(r, 80)); });
    await bilder(4);
  }

  it("wirft im Startzustand keinen Titel mehr wegen seiner Breite", async () => {
    hub(10);
    const view = await zeichne(masse(1000));
    await bilder(10);
    await fahreInsGanze(view.container);
    const prozent = await zoomeNach(100, view.container);
    expect(prozent, "der Zoom erreicht 100 % nicht — der Fall prüft nichts").toBeGreaterThanOrEqual(100);
    const teil = GANG_ABSTAND * (prozent / 100);
    // Kontrolle, dass der Gang wirklich im Bild steht: ohne Punkte wäre „kein
    // Grund" eine Heilung, die nichts heilt.
    expect(view.container.querySelector('[data-testid="gang-info"]')?.textContent).toMatch(/showing 384/);
    expect(etat(view.container), `bei ${prozent} % meldet die Flaeche weiter Titel über ihre Reihe`).not.toMatch(/title wider than its row/);
    for (const t of gemalt(view.container, /^(G|T)\d/)) {
      expect(t.px, `ein ${Math.round(t.px)} px Titel über einer ${Math.round(teil)} px Reihe`).toBeLessThanOrEqual(teil);
    }
    expect(gemalt(view.container, /^(G|T)\d/).length, "der Gang malt keinen einzigen Titel").toBeGreaterThan(0);
  });

  it("baut denselben Gang-Titel länger, sobald seine Reihe breiter wird", async () => {
    hub(10);
    const view = await zeichne(masse(1000));
    await bilder(10);
    await stufe(view.container, "All");

    await fahreInsGanze(view.container);
    await zoomeNach(100, view.container);
    const eng = gemalt(view.container, /^T\d/);
    expect(eng.length, "bei 100 % malt der Gang keinen einzigen langen Titel").toBeGreaterThan(0);
    const reiheEng = GANG_ABSTAND * (zoomAnzeige(view.container) / 100);
    for (const t of eng) {
      expect(t.px, `ein ${Math.round(t.px)} px Titel über einer ${Math.round(reiheEng)} px Reihe`).toBeLessThanOrEqual(reiheEng);
    }

    await zoomeNach(300, view.container);
    const weit = gemalt(view.container, /^T\d/);
    expect(weit.length, "bei 300 % malt der Gang keinen einzigen langen Titel").toBeGreaterThan(0);
    const reiheWeit = GANG_ABSTAND * (zoomAnzeige(view.container) / 100);
    for (const t of weit) {
      expect(t.px, `ein ${Math.round(t.px)} px Titel über einer ${Math.round(reiheWeit)} px Reihe`).toBeLessThanOrEqual(reiheWeit);
    }

    // Der Beweis sitzt in der Breite, nicht in einer Zahl im Fall: fragt die
    // Kuerzung den Zoom, wächst der gemalte Titel mit der Reihe. Fragt er ihn
    // nicht, bleibt der breiteste Titel auf dem Wert der engen Blende stehen —
    // die Reihe wäre dann bloss ein Grund mehr, ihn wegzuwerfen.
    const breitEng = Math.max(...eng.map((t) => t.px));
    const breitWeit = Math.max(...weit.map((t) => t.px));
    expect(
      breitWeit,
      `der breiteste Gang-Titel misst bei ${Math.round(reiheWeit)} px Reihe ${Math.round(breitWeit)} px — ` +
        `bei ${Math.round(reiheEng)} px waren es ${Math.round(breitEng)} px. Die Kuerzung fragt den Zoom nicht.`,
    ).toBeGreaterThan(breitEng);
  });
});
