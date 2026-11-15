// @vitest-environment jsdom
// F8 — die sichtbare Graph-Flaeche, gemessen an dem, was ein Mensch sieht.
//
// Diese Datei haelt die Befunde der Browser-Vermessung A7 (audit-2026-10-09) als
// Tests fest. Der Clou gegenueber den bisherigen Tests: die Leinwand-Attrappe
// spielt die Transformation nach und liefert die Groesse eines Etiketts AUF DEM
// SCHIRM (`schriften()`). Ein Test, der nur `font = 15px` lese, haette A7-02
// gruen gemalt — bei 12 % Zoom sind aus den 15 px 1,4 px geworden.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { KnowledgeGraph, aehnlichkeitsZeile, nachschlagFaellig, refitFaellig } from "../../src/components/KnowledgeGraph";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger, setzeTheme, type Leinwand } from "../helfer/canvas";
import type { Memory } from "../../src/types";

let leinwand: Leinwand;
let setzeGroesse: (b: number, h: number) => void;

beforeEach(() => {
  leinwand = installiereLeinwand();
  setzeGroesse = installiereResizeObserver(1000, 700);
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
function note(over: Partial<Memory> = {}): Memory {
  zaehler++;
  return {
    id: `f8-${zaehler}`, userId: "local", title: `F8 Notiz ${zaehler}`, content: "Inhalt",
    tags: [], type: "semantic", createdAt: Date.parse("2024-01-01"), updatedAt: Date.parse("2024-01-01"),
    ...over,
  };
}

/** Ein Bestand, der in einem zu kleinen Bild steht: viele Knoten, enger Rahmen. */
async function feld(memories: Memory[], masse: [number, number] = [1000, 700], opts: { aehnlichkeit?: boolean } = {}) {
  setzeGroesse(masse[0], masse[1]);
  const view = render(<KnowledgeGraph memories={memories} onSelectMemory={() => {}} />);
  await act(async () => { await new Promise((r) => setTimeout(r, 140)); });
  if (opts.aehnlichkeit) {
    const schalter = [...view.container.querySelectorAll("button[aria-pressed]")].find((b) =>
      (b.getAttribute("title") || "").startsWith("Show similarity links")
    ) as HTMLButtonElement | undefined;
    expect(schalter, "der Aehnlichkeits-Schalter fehlt").toBeTruthy();
    await act(async () => { schalter!.click(); await new Promise((r) => setTimeout(r, 80)); });
  }
  await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
  return view;
}

/** Der Zoom des letzten Bildes, so wie die Flaeche ihn setzt. */
function zoom(): number {
  for (const a of leinwand.letzterRahmen()) if (a.op === "scale") return Number(a.args[0]);
  return 1;
}

/** Nur die Notiztitel — Geruest, Badges und Glyphen haben andere Texte. */
function notizschriften() {
  return leinwand.schriften().filter((s) => /^F8 Notiz \d+/.test(s.text));
}

/**
 * Hereinzoomen, bis die Flaeche ueberhaupt Titel malt, und ihre Zahl zurueckgeben.
 *
 * Seit der Pforte-Urteilsfrage (#30, 0e065b0) gilt: ein Knoten, dessen WAHRES
 * Mass unter 1,5 Bildpunkten liegt, bekommt keinen Namen. In einem eng
 * gesetzten Bild — 60 Notizen in 300×220 — ist das bei eingepasstem Zoom
 * jeder Knoten, und die Flaeche malt null Titel. Das ist Verhalten, kein
 * Defekt, und die Bilanz sagt es mit Zahl („N too small for a name at this
 * zoom"). Ein Fall, der die Groesse von Titeln messen will, braucht gemalte
 * Titel; er darf sich nur nicht auf einen Zoom stellen, der keine hat.
 */
async function bisZumErstenTitel(container: HTMLElement, schritte = 16) {
  for (let i = 0; i < schritte; i++) {
    if (notizschriften().length > 0) return notizschriften().length;
    const kn = [...container.querySelectorAll("button")].find((b) => (b.getAttribute("title") || "") === "Zoom in");
    expect(kn, "der Zoom-in-Knopf fehlt — die Flaeche ist nicht mehr zu bedienen").toBeTruthy();
    await act(async () => { kn!.click(); await new Promise((r) => setTimeout(r, 90)); });
  }
  return notizschriften().length;
}

/**
 * Hinauszoomen über den Boden des Feldes, damit ein Fall in dem Regime misst,
 * das er prüft.
 *
 * Seit #28 startet das Kraftfeld nicht mehr bei 4 %, sondern bei 93 % — der
 * Lesbarkeitsboden hält die Kamera dort, wo eine Titelzeile Platz hat. Was
 * vorher der eingepasste Blick von selbst hergab (ein Feld, dessen Punkte
 * breiter sind als ihre Zelle, eine Bildflächen-Kappe, die greift, der
 * Sammel-Pfad statt der Sprites), ist jetzt eine Stellung, die man anfahren
 * muss — mit demselben Steuer, das ein Mensch benutzt: der Knopf in der Zeile.
 */
async function rausZoomen(container: HTMLElement, schritte: number) {
  const kn = [...container.querySelectorAll("button")].find((b) => (b.getAttribute("title") || "") === "Zoom out");
  expect(kn, "der Zoom-out-Knopf fehlt — die Fläche ist nicht mehr zu bedienen").toBeTruthy();
  for (let i = 0; i < schritte; i++) {
    await act(async () => { kn!.click(); await new Promise((r) => setTimeout(r, 90)); });
  }
  await act(async () => { await new Promise((r) => setTimeout(r, 140)); });
  return zoom();
}

/**
 * Zuege je Deckkraft, so wie der Browser-Rekorder es zaehlt: die moveTo-Anzahl
 * zwischen zwei stroke() ist die Zahl der Linien in diesem Batch.
 */
function zuegeJeDeckkraft() {
  let alpha = 1;
  let teile = 0;
  const out: { alpha: number; teile: number }[] = [];
  for (const a of leinwand.letzterRahmen()) {
    if (a.op === "set:globalAlpha") alpha = Number(a.args[0]);
    else if (a.op === "beginPath") teile = 0;
    else if (a.op === "moveTo") teile++;
    else if (a.op === "stroke") { if (teile > 0) out.push({ alpha, teile }); teile = 0; }
  }
  return out;
}

/** Ein Bestand an drei Begriffen: jede Notiz haelt ihren Begriff. */
function begriffsFeld(notizen: Memory[], gruppen: number) {
  const byEntity: Record<string, string[]> = {};
  const groesse = Math.ceil(notizen.length / gruppen);
  for (let g = 0; g < gruppen; g++) {
    byEntity[`begriff ${g}`] = notizen.slice(g * groesse, g * groesse + groesse).map((m) => m.id);
  }
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ relations: [], memoriesByEntity: byEntity }), { status: 200 })));
}


describe("A7-03: Hover über einer Notiz muss das Netz ruhiger machen, nicht lauter", () => {
  it("dimmt im Hover alle übrigen Züge unter α 0,08 und hält die Nachbarschaft voll", async () => {
    // Sechs Notizen an drei Begriffen: jede Notiz haelt einen Begriff, also
    // stehen sechs Erwaehnungszuege im Bild. A7 hat gemessen (1 500 Notizen):
    // beim Hover bleiben 1 534 Zuege bei α 0,34 stehen, nur die Behauptungen
    // werden global auf 0,9 gehoben — das Netz wird lauter statt ruhiger.
    const notizen = Array.from({ length: 6 }, (_, i) => note({ tags: [`haltung ${i}`] }));
    const byEntity: Record<string, string[]> = {
      "alpha": [notizen[0].id, notizen[1].id],
      "beta": [notizen[2].id, notizen[3].id],
      "gamma": [notizen[4].id, notizen[5].id],
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ relations: [], memoriesByEntity: byEntity }), { status: 200 })));
    const { container } = await feld(notizen, [1000, 700]);
    const c = container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;

    // Der Zeiger auf die erste Notiz — getroffen wird ueber ihr eigenes Etikett.
    const halten = notizen[0];
    const etikett = leinwand.schriften().find((s) => s.text.startsWith(halten.title!));
    expect(etikett, `Kein Etikett „${halten.title}" gemalt: ${JSON.stringify(leinwand.schriften().map((s) => s.text))}`).toBeDefined();
    await act(async () => {
      c.dispatchEvent(new (globalThis as unknown as { PointerEvent: typeof PointerEvent }).PointerEvent("pointermove", {
        bubbles: true, cancelable: true, clientX: etikett!.x, clientY: etikett!.y - 8,
      }));
      await new Promise((r) => setTimeout(r, 80));
    });
    // Hasse die Beruehrung wirklich statt? Die Tagszeile des gehaltenen Etiketts
    // ist der Beweis — ein Test, der an der Wolke vorbeifaehrt, macht einen
    // toten Kanal grün.
    const nachHalten = leinwand.schriften().map((s) => s.text);
    expect(nachHalten.some((t) => t.includes("haltung 0")), `Hover nicht angekommen: ${JSON.stringify(nachHalten)}`).toBe(true);

    const zuege = zuegeJeDeckkraft();
    expect(zuege.length, "keine Linien gemalt").toBeGreaterThan(0);
    const mittel = zuege.filter((z) => z.alpha > 0.08 && z.alpha < 0.8);
    expect(mittel.length, `Zuege im Niemandsland zwischen α 0,08 und 0,8: ${JSON.stringify(zuege)}`).toBe(0);
    const voll = zuege.filter((z) => z.alpha >= 0.8).reduce((n, z) => n + z.teile, 0);
    expect(voll, `keine vollen Zuege in der Nachbarschaft: ${JSON.stringify(zuege)}`).toBeGreaterThan(0);
    expect(voll, "mehr volle Zuege als die Nachbarschaft hat (sechs Notizen, eine gehalten)").toBeLessThanOrEqual(2);
  });
});

describe("A7-02: die Titel schrumpfen unter die Lesbarkeit", () => {
  it("malte bei niedrigem Zoom 1,4 px hohe Titel — die Gegen-Skalierung ist bei 15 Welt-Pixeln zugedeckelt", async () => {
    const notizen = Array.from({ length: 60 }, () => note());
    const { container } = await feld(notizen, [300, 220]);
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    // Der Lesbarkeitsboden (#28) hält das Feld jetzt bei 93 % — unter der Pforte
    // liegt diese Blende nicht mehr. Sechs Schritte auf demselben Knopf, den ein
    // Mensch nimmt, fahren sie an: 0,93 · 0,8^6 = 0,23, ein Knoten von vier
    // Welteinheiten misst dann 0,93 Bildpixel gegen die Schwelle von 1,5.
    await rausZoomen(container, 6);
    const k = zoom();
    // Was bei diesem Zoom gilt, sagt die Bilanz selbst: jeder Knoten liegt unter
    // der Pforte, also malt die Flaeche keinen Titel — und verschweigt nicht,
    // warum nicht. (Der Fall auf die Titelgroesse braucht gemalte Titel, darum
    // zoomt er danach herein.)
    const bilanz = container.querySelector('[data-testid="graph-benannt"]')?.textContent ?? "";
    expect(bilanz, `Zoom ${k.toFixed(3)}: "${bilanz}"`).toMatch(/60 too small for a name at this zoom/);
    const gemalt = await bisZumErstenTitel(container);
    const titel = notizschriften();
    expect(gemalt, "auch hereinzoomend malt die Flaeche keinen Titel").toBeGreaterThan(0);
    expect(titel.length).toBe(gemalt);
    const kleinste = Math.min(...titel.map((t) => t.px));
    // Die Latte der Flaeche: E1s unterste Schriftstufe, 11 px auf dem Schirm,
    // bei JEDEM Zoom. Vorher stand hier 9 px — das Ziel, das A7 gesetzt hatte,
    // bevor die Leiter gezoge war.
    expect(kleinste, `kleinster Titel ${kleinste.toFixed(1)} px bei Zoom ${zoom().toFixed(3)} (${titel.length} Titel, eingepasst war ${k.toFixed(3)})`).toBeGreaterThanOrEqual(11);
    expect(container).toBeTruthy();
  });


  it("meldet in der Bilanz, wie viele Knoten einen Titel tragen", async () => {
    const { container } = await feld(Array.from({ length: 60 }, () => note()), [300, 220]);
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    const zeile = container.querySelector('[data-testid="graph-benannt"]');
    expect(zeile, "Die Bilanz sagt nicht, wie viele Knoten benannt sind").toBeTruthy();
    const gemalt = notizschriften().length;
    expect(zeile!.textContent, `Gemeldet: ${zeile!.textContent}, gemalt: ${gemalt}`).toMatch(new RegExp(`^${gemalt} of`));
  });

  it("schweigt in der Bilanz, wenn jeder gezeigte Knoten einen Titel traegt", async () => {
    const { container } = await feld([note(), note(), note()], [900, 700]);
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    const zeile = container.querySelector('[data-testid="graph-benannt"]');
    expect(zeile?.textContent ?? "", "Eine Bilanz, die eine Luecke behauptet, wo keine ist").toBe("");
  });
});

/**
 * Der Titel-Etat (Liste 15.10., Punkt 5). Die Flaeche sagte bisher nur, wie viel
 * benannt IST. Ein Mensch, der 400 Knoten sieht und 18 Namen liest, fragt nach
 * den anderen — und die Antwort ist nicht eine Zahl, sondern die Summe der
 * Gründe. Darum muss der Etat restlos aufgehen: benannt + namenlos = Umfang,
 * und jeder Grund traegt eine Zahl.
 */
describe("Titel-Etat: die Bilanz nennt, wie viele ohne Namen blieben — und warum", () => {
  const zahl = (s: string) => Number(s.replace(/,/g, ""));

  /** Was am Rand steht, in vier Groessen zerlegt — wie ein Mensch es nachrechnet. */
  function etat(container: HTMLElement) {
    const zeile = container.querySelector('[data-testid="graph-benannt"]');
    expect(zeile, "Die Bilanz sagt nichts ueber Titel").toBeTruthy();
    const text = zeile!.textContent ?? "";
    const m = /^([\d,]+) of ([\d,]+) notes in this picture carry a title(?: · ([\d,]+) stayed nameless: (.+))?$/.exec(
      text
    );
    expect(m, `Unerwarteter Wortlaut: "${text}"`).toBeTruthy();
    const gruende = (m![4] ?? "").split(", ").filter(Boolean).map((t) => ({
      n: zahl(t.split(" ")[0]),
      wort: t.replace(/^[\d,]+\s*/, ""),
    }));
    return { text, benannt: zahl(m![1]), umfang: zahl(m![2]), ohnee: m![3] ? zahl(m![3]) : 0, gruende };
  }

  async function stufe(container: HTMLElement, wort: string) {
    const schiene = container.querySelector('[data-testid="graph-schiene-namen"]');
    expect(schiene, "Die Dichteschiene fehlt").toBeTruthy();
    const knopf = [...schiene!.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === wort);
    expect(knopf, `Der Stufen-Knopf "${wort}" fehlt`).toBeTruthy();
    await act(async () => {
      knopf!.click();
      await new Promise((r) => setTimeout(r, 300));
    });
  }

  it("rechnet 400 Knoten auf 'Few' restlos auf: benannte, Namenlose, und jeder Grund mit Zahl", async () => {
    const notizen = Array.from({ length: 400 }, () => note());
    const { container } = await feld(notizen, [900, 640]);
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    // Eingepasst fallen bei 400 Knoten nicht mehr alle durch die Pforte: der
    // Lesbarkeitsboden (#28) startet das Feld seit 17.10. bei 93 %, und dort ist
    // ein Knoten von vier Welteinheiten 3,7 Bildpixel gross. Was dieser Fall
    // prüft, ist die Rechnung des Etats — benannt + namenlos = Umfang, und jeder
    // Grund mit Zahl. Die Kante der Pforte hat ihre eigne Wache in
    // `KnowledgeGraph.feldboden.test.tsx`, die Blende darunter ihr eigne in
    // `KnowledgeGraph.titelbreite.test.tsx`.
    await bisZumErstenTitel(container);
    const gemalt = notizschriften().length;
    const e = etat(container);
    expect(e.benannt, `Gemeldet ${e.benannt}, auf der Leinwand ${gemalt} Titel`).toBe(gemalt);
    expect(gemalt, "Es wurde gar kein Titel gemalt — der Fall hat keinen Etat zu pruefen").toBeGreaterThan(0);
    expect(e.ohnee, `Der Etat verschweigt die Namenlosen: "${e.text}"`).toBeGreaterThan(0);
    expect(e.benannt + e.ohnee, `benannt + namenlos != Umfang in "${e.text}"`).toBe(e.umfang);
    const summe = e.gruende.reduce((s, g) => s + g.n, 0);
    expect(e.gruende.length, `Ohne Grund ist die Zahl kein Etat: "${e.text}"`).toBeGreaterThan(0);
    expect(summe, `Die Gründe sumieren auf ${summe}, Namenlose sind ${e.ohnee}: "${e.text}"`).toBe(e.ohnee);
    for (const g of e.gruende) {
      expect(g.n, `Ein Grund ohne Zahl: "${g.wort}"`).toBeGreaterThan(0);
      expect(g.wort, `Ein Grund ohne Wort: "${g.wort}"`).not.toBe("");
    }
  });

  it("erklaert einen selbst gewaehlten Modus nicht als Mangel", async () => {
    const notizen = Array.from({ length: 40 }, () => note());
    const { container } = await feld(notizen, [900, 640]);
    await stufe(container, "None");
    const e = etat(container);
    expect(e.gruende.length, `Wer "None" waehlt, braucht keinen Grund: "${e.text}"`).toBe(0);
    expect(e.ohnee, "Der gewaehlte Modus steht als Zahl der versaeumten Namen da").toBe(0);
  });

});

describe("A7-04: dem Kraftfeld fehlte jede Dichte-Kappe", () => {
  it("kappt die Erwaehnungen nach Bildflaeche und sagt, wie viele fielen", async () => {
    // 60 Notizen an drei Begriffen in einem 180 × 140 px Bild: das Budget sind
    // 40 Zuege (180*140/900 = 28, unter der Untergrenze von 40). A7 gemessen am
    // grossen Feld: 1 543 Zuege ungekuerzt — der Baum hatte seine Faltung, das
    // Feld hatte nichts.
    const notizen = Array.from({ length: 60 }, () => note());
    begriffsFeld(notizen, 3);
    const { container } = await feld(notizen, [180, 140]);
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
    // Zwölf Schritte hinaus: 0,93 · 0,8^12 = 0,055 — das ganze Begriffsnetz liegt
    // wieder im Bild, und die Kappe kann greifen, wie sie es in dem 180×140-Fenster
    // immer gemessen hat. Der Boden (#28) nimmt dem Feld die Blende nicht weg, er
    // stellt sie nur nicht mehr von selbst ein.
    await rausZoomen(container, 12);

    const zuege = zuegeJeDeckkraft();
    const erwaehnungen = zuege.filter((z) => Math.abs(z.alpha - 0.34) < 0.001).reduce((n, z) => n + z.teile, 0);
    expect(erwaehnungen, `keine Erwaehnungen gemalt: ${JSON.stringify(zuege)}`).toBeGreaterThan(0);
    expect(erwaehnungen, `Erwaehnungen ueber dem Bildbudget: ${JSON.stringify(zuege)}`).toBeLessThanOrEqual(40);

    const zeile = container.querySelector('[data-testid="graph-kappen"]');
    expect(zeile, "die Kappe des Feldes sagt nicht, wie viele Zuege fielen").toBeTruthy();
    const gemeldet = Number((zeile!.textContent || "").match(/^(\d+) of (\d+) mention links/)?.[1] ?? -1);
    expect(gemeldet, `Gemeldet: ${zeile!.textContent}`).toBeGreaterThan(0);
    expect(gemeldet + erwaehnungen, `${zeile!.textContent} — gemeldete plus gemalte Zuege zaehlen nicht zum Bestand (60)`)
      .toBe(60);
  });

  it("loescht durch Aehnlichkeiten nicht das Begriffsnetz", async () => {
    // Nachgemessen in der Browser-Messstrasse: als der Similar-Schalter an war,
    // meldete die Flaeche bei 400 Notizen „390 of 390 mention links left out" —
    // 2 003 vermutete Kanten hatten das Bildbudget vor den Erwaehnungen
    // aufgefressen. Vermutungen haben ihre eigene Kappe; sie darf kein
    // Ontologieloescher sein.
    const notizen = Array.from({ length: 40 }, (_, i) => note({ tags: [`thema ${i % 2}`] }));
    begriffsFeld(notizen, 2);
    const { container } = await feld(notizen, [180, 140], { aehnlichkeit: true });
    const zuege = zuegeJeDeckkraft();
    const erwaehnungen = zuege.filter((z) => Math.abs(z.alpha - 0.34) < 0.001).reduce((n, z) => n + z.teile, 0);
    expect(erwaehnungen, `kein Begriffnetz mehr, obwohl nur die Aehnlichkeiten an sind: ${JSON.stringify(zuege)}`).toBeGreaterThan(0);
    expect(erwaehnungen, `Erwaehnungen ueber dem Bildbudget: ${JSON.stringify(zuege)}`).toBeLessThanOrEqual(40);
  });

  it("laesst die Kappe in Ruhe, solange ein Zeiger haelt", async () => {
    // Beim Halten sind die Erwaehnungen schon auf α 0,08 gestellt. Ein Netz, das
    // obendrein die Haelfte verliert, flackert unter der Hand.
    const notizen = Array.from({ length: 60 }, () => note());
    begriffsFeld(notizen, 3);
    const { container } = await feld(notizen, [180, 140]);
    await rausZoomen(container, 12);
    const c = container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    // In einem 180 × 140 px Bild ist kein Notiztitel mehr unterzubringen — aber
    // das Geruest steht zuerst im Raster: der Begriff ist der Haltbare Punkt.
    const geruest = leinwand.schriften().find((s) => /^begriff \d/.test(s.text));
    expect(geruest, `kein Begriffsetikett: ${JSON.stringify(leinwand.schriften().map((s) => s.text))}`).toBeDefined();
    await act(async () => {
      c.dispatchEvent(new (globalThis as unknown as { PointerEvent: typeof PointerEvent }).PointerEvent("pointermove", {
        bubbles: true, cancelable: true, clientX: geruest!.x - 4, clientY: geruest!.y,
      }));
      await new Promise((r) => setTimeout(r, 80));
    });
    const zeile = container.querySelector('[data-testid="graph-kappen"]');
    expect(zeile!.textContent, "waehrend des Haltens meldet die Kappe Zuege, die das Bild zeigt").toBe("");
  });
});

describe("A7-08 (App-Haelfte): die Projektion wurde seitlich 8:1 gestaucht", () => {
  it("zeichnet in das echte Mass, nicht in die 320-px-Untergrenze", async () => {
    // Bei 390 px Fensterbread blieb der Flaeche ein Streifen von 80 × 418 px —
    // gemalt wurde aber in einen Puffer von 640 × 836 (Math.max(320, ...)).
    // Der Browser zieht diesen Puffer auf 80 px zusammen: die Welt war seitlich
    // 8:1 gestaucht, und der Fit rechnete mit einem Bild, das niemand sah.
    // Die Untergrenze darf die Flaeche vor einem 0-px-Bild schuetzen, nicht die
    // Projektion fuer eine 80-px-Welt-blind machen.
    const { container } = await feld([note(), note(), note()], [180, 140]);
    const c = container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    expect(c.width, `Pufferbreite ${c.width} statt ${180 * dpr}`).toBe(Math.round(180 * dpr));
    expect(c.height, `Pufferhoehe ${c.height} statt ${140 * dpr}`).toBe(Math.round(140 * dpr));
  });

  it("passt das Bild in den echten Rahmen", async () => {
    // Der Fit rechnet in der Leinwandflaeche. Steht die Untergrenze auf 320 px,
    // wird fuer einen 320-px-Rahmen zentriert, was in 140 px Hoehe liegen soll —
    // die untere Haelfte des Bildes faellt aus dem Kasten, ohne dass jemand
    // scrollen koennte.
    const notizen = Array.from({ length: 12 }, () => note());
    const { container } = await feld(notizen, [180, 140]);
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
    let tx = 0, ty = 0, k = 0;
    for (const a of leinwand.letzterRahmen()) {
      if (a.op === "translate" && ty === 0) { tx = Number(a.args[0]); ty = Number(a.args[1]); }
      if (a.op === "scale" && k === 0) k = Number(a.args[0]);
    }
    expect(k, "der letzte Rahmen setzt keine Transformation").toBeGreaterThan(0);
    // Alle gemalten Winzlinge (in Weltpunkten) muessen mit ihrer Mitte auf dem
    // Schirm liegen: (y + hoehe/2) * k + ty < 140. Gemalt wird in zwei Kleidern —
    // der Sammel-Pfad setzt Rechtecke, ab 0,6251 Zoom die Sprites — und die
    // Rahmenrechnung gilt beiden. Gelesen wird die Mitte, nicht die Oberkante:
    // die Flaeche zaehlt eine Note als „im Bild" nach ihrer Lage, und ein Sprite
    // ragt mit seiner Haelfte ueber diese Lage hinaus.
    const welten = leinwand.letzterRahmen()
      .filter((a) => a.op === "fillRect" || a.op === "drawImage")
      .map((a) => (Number(a.args[1]) + Number(a.args[3]) / 2) * k + ty);
    expect(welten.length, "es wird nichts gemalt").toBeGreaterThan(0);
    const tiefste = Math.max(...welten);
    // A7-08 gilt unveraendert: der Fit rechnet in der Leinwand, nicht in einem
    // 320-px-Puffer. Was sich geaendert hat, ist die letzte Instanz — seit #28
    // darf das Feld ueber den Rahmen hinausgehen, weil es sich sonst unter die
    // Lesbarkeit hinauszoomt. Dann, aber auch nur dann, muss die Flaeche sagen,
    // wie viele Noten draussen stehen. Beides zusammen ist die Latte.
    const draussen = [...container.querySelectorAll("div,span,p")]
      .map((e) => (e.textContent ?? "").trim())
      .find((t) => /unfolded notes are in this picture/.test(t));
    if (tiefste < 140 + 4) {
      expect(draussen, `alles liegt im Rahmen, und die Flaeche meldet doch Noten draussen: "${draussen}"`).toBeUndefined();
    } else {
      expect(
        draussen,
        `unterste gemalte Zeile bei ${tiefste.toFixed(1)} px in einem 140-px-Rahmen, und keine Zeile sagt, was draussen liegt`,
      ).toMatch(/of [\d,]+ unfolded notes are in this picture/);
    }
    void tx;
  });
});

describe("A7-05: der Similar-Schalter nannte Zahlen, die das Bild nicht zeigt", () => {
  it("nennt die Kappe, wenn die Linien nicht gemalt werden", () => {
    // Gemessen bei 1 500 Notizen: Kopf „+7 457 similar", Tinte 4 377 → 5 057 px
    // (+15 %). Die Kappe `nurEchteKanten` unterdrueckt genau diese Linien bei
    // weit herausgezoomtem Bild — die Zeile muss das sagen.
    expect(aehnlichkeitsZeile(7457, 9000, 0.12)).toContain("hidden until 55 % zoom");
    expect(aehnlichkeitsZeile(7457, 9000, 0.12)).toContain("+7457 similar");
  });

  it("bleibt bei dem Wort, das die Flaeche schon hatte, wenn gemalt wird", () => {
    // 60 Notizen bei 75 % Zoom: derselbe Schalter antwortete sichtbar
    // (8 403 → 15 027 px) — dort ist nichts zu erwaehnen.
    expect(aehnlichkeitsZeile(385, 200, 0.75)).toBe(" · +385 similar");
  });

  it("sagt gar nichts, wenn es keine Aehnlichkeiten gibt", () => {
    expect(aehnlichkeitsZeile(0, 9000, 0.12)).toBe("");
  });
});

describe("A7-09: der Landemaßstab hing davon ab, wann die Messung zusah", () => {
  it("passt den Ausschnitt auch, als das Feld schon stand", () => {
    // Vorher sass der Refit inside `if (bewegt)`: ein Feld, das beim ersten Bild
    // des Render-Loops bereits ruhte (wiedergenommene Anordnung nach einem
    // Filterwechsel), blieb auf dem Ausschnitt stehen, der fuer die
    // Ausgangspositionen gerechnet war. Die Zusage ist das RUHE-Ereignis.
    expect(refitFaellig(true, false, 40)).toBe(true);
    expect(refitFaellig(true, true, 40)).toBe(false);
    expect(refitFaellig(false, false, 40)).toBe(false);
    expect(refitFaellig(true, false, 0)).toBe(false);
  });
});

describe("#124 der Nachschlag hat dieselbe Falle, eine Ebene tiefer", () => {
  it("schuldet die Kollision auch einem Feld, das beim Ankommen schon steht", () => {
    // 3.2.146 ruestet den Nachschlag in `if (bewegt)` — genau die Stelle, vor der
    // A7-09 schon einmal gewarnt hat. Gemessen 4.11. 20:16 MEZ am ausgelieferten
    // 3.2.146 bei 3 000 Notizen: zwei Begiffscheiben mit Radius 26 schnitten 11
    // Einheiten, und die Ruhe-Phase rechnete in 18 von 70 Rahmen ueberhaupt etwas
    // (Median 0,1 ms) — der Nachschlag hat in diesem Lauf nie gebrannt. Der Grund:
    // die Stellen kommen fertige aus dem Bau (ein Netznachzug baut das Feld neu),
    // darum ist `bewegt` vom ersten Bild an false und der Uebergangs-Zweig nie
    // betreten worden. Angekommene Ruhe ist dieselbe Schuld wie eintretende.
    expect(nachschlagFaellig(0, true, false, false)).toBe(true);
    // Dieselbe Antwort beim echten Uebergang: das Feld stand eben noch in Bewegung.
    expect(nachschlagFaellig(0, true, true, false)).toBe(true);
    // Und dreimal nein: waehrend es noch gleitet, waehrend ein Nachschlag laeuft,
    // und wenn genau dieser stehende Stand schon zu Ende gefeiert ist — sonst
    // bewaffnet sich der Nachschlag pro Rahmen neu und das Feld hoert nie auf.
    expect(nachschlagFaellig(0, false, true, false)).toBe(false);
    expect(nachschlagFaellig(60, true, true, false)).toBe(false);
    expect(nachschlagFaellig(0, true, false, true)).toBe(false);
  });
});


