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
import { KnowledgeGraph, aehnlichkeitsZeile, refitFaellig } from "../../src/components/KnowledgeGraph";
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

describe("A7-01: der Rueckweg aus der Faltung ist mit der Maus zu treffen", () => {
  /**
   * Der Knopf sitzt in einer Legende, die die Maus durchlaesst (`pointer-events:
   * none` in `index.css`, damit die Flaeche darunter bedienbar bleibt). A7 hat
   * im echten Browser gemessen: `elementFromPoint` in der Mitte des Knopfes
   * gibt CANVAS zurueck, ein echter Mausklick aendert keinen Pixel (Tinte
   * 2 821 → 2 821), ein DOM-Klick entfaltet sehr wohl (4 153). Ein Test mit
   * `fireEvent.click` macht genau diesen toten Knopf grün — deshalb wird hier
   * die Klasse am Element geprueft, und der Treffer in der Messstrasse.
   */
  it("hebt die Zeigersperre am Knopf auf, nicht an der Legende", async () => {
    // 40 Notizen an acht Begriffen: der Rahmen haelt ~20 Zeilen, also muss der
    // Baum falten — aber nie leer. Ohne Begriffen stuenden die Notizen einzeln am
    // Typ, und es gaebe nichts zu falten: ein Test, der den Knopf sucht, findet
    // dann keinen, weil die Flaeche gar nicht in der Faltung ist.
    const notizen = Array.from({ length: 40 }, () => note({ tags: ["feld"] }));
    const byEntity: Record<string, string[]> = {};
    for (let g = 0; g < 8; g++) byEntity[`begriff ${g}`] = notizen.slice(g * 5, g * 5 + 5).map((m) => m.id);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ relations: [], memoriesByEntity: byEntity }), { status: 200 })));

    const { container } = await feld(notizen, [900, 420]);
    const baum = [...container.querySelectorAll("button")].find((b) => (b.getAttribute("title") || "").startsWith("Dendrogram"));
    await act(async () => { baum!.click(); await new Promise((r) => setTimeout(r, 400)); });

    // Erste Zusage: der Baum zeigt Notizen, nicht nur Gruppenzahlen.
    const titel = leinwand.schriften().filter((s) => /^F8 Notiz \d+/.test(s.text));
    expect(titel.length, `kein Notiztitel im Baum: ${container.querySelector('[data-testid="graph-legende"]')?.textContent?.slice(0, 200)}`).toBeGreaterThan(0);

    // Dritte Zusage: was die Faltung nimmt, steht als Malzeichen ueber der
    // Gruppe — nach dem Umbau auf Bildpixel (A7-02) der Grund, diesen Test extra
    // zu halten. Ein ×N, das nicht gemalt wird, ist ein Schwinden ohne Zahl.
    const malzeichen = leinwand.schriften().filter((x) => /^×\d+$/.test(x.text));
    expect(malzeichen.length, `kein ×N gemalt: ${JSON.stringify(leinwand.schriften().map((x) => x.text))}`).toBeGreaterThan(0);
    expect(malzeichen[0].px, `das Malzeichen ist ${malzeichen[0].px} px — ein Zustand, den man erst beim Heranzoomen sieht, ist keiner`).toBeGreaterThanOrEqual(11);

    // Zweite Zusage: der Rueckweg ist mit der Maus zu treffen.
    const legende = container.querySelector('[data-testid="graph-legende"]');
    expect(legende, "die Legende fehlt").toBeTruthy();
    const knopf = [...container.querySelectorAll("button")].find((b) => /show everything/i.test(b.textContent ?? "")) as HTMLButtonElement;
    expect(knopf, `kein Rueckweg-Knopf in: ${legende!.textContent?.slice(0, 200)}`).toBeTruthy();
    expect(knopf.className, "der Knopf erbt die Zeigersperre der Legende").toMatch(/pointer-events-auto/);
    expect(legende!.className, "die Legende selbst muss die Maus weiterreichen").toMatch(/pointer-events-none/);
  });
});

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
    const k = zoom();
    const titel = notizschriften();
    expect(titel.length, "Es wird gar kein Notiztitel gemalt — die Flaeche hat nichts zu messen").toBeGreaterThan(0);
    const kleinste = Math.min(...titel.map((t) => t.px));
    // Die Latte der Flaeche: E1s unterste Schriftstufe, 11 px auf dem Schirm,
    // bei JEDEM Zoom. Vorher stand hier 9 px — das Ziel, das A7 gesetzt hatte,
    // bevor die Leiter gezoge war.
    expect(kleinste, `kleinster Titel ${kleinste.toFixed(1)} px bei Zoom ${k.toFixed(3)} (${titel.length} Titel)`).toBeGreaterThanOrEqual(11);
    expect(container).toBeTruthy();
  });

  it("laesst die Titel auch im Baum nicht auf Welt-Pixel schrumpfen", async () => {
    const { container } = await feld(Array.from({ length: 40 }, () => note()), [900, 640]);
    const baum = [...container.querySelectorAll("button")].find((b) => (b.getAttribute("title") || "").startsWith("Dendrogram"));
    expect(baum, "Der Baum-Knopf fehlt").toBeTruthy();
    await act(async () => { baum!.click(); await new Promise((r) => setTimeout(r, 500)); });
    const titel = leinwand.schriften().filter((s) => /^F8 Notiz \d+/.test(s.text));
    expect(titel.length, "Der Baum malt keine Notiztitel").toBeGreaterThan(0);
    const kleinste = Math.min(...titel.map((t) => t.px));
    expect(kleinste, `Baum-Titel nur ${kleinste.toFixed(1)} px`).toBeGreaterThanOrEqual(11);
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
    const m = /^([\d,]+) of ([\d,]+) notes carry a title(?: · ([\d,]+) stayed nameless: (.+))?$/.exec(text);
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

  it("zaehlt die Namenlosen am Baum anders als im Feld, weil dort ein anderes Raster gilt", async () => {
    const notizen = Array.from({ length: 120 }, () => note());
    begriffsFeld(notizen, 4);
    const { container } = await feld(notizen, [900, 640]);
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    const feldEtat = etat(container);
    const baum = [...container.querySelectorAll("button")].find((b) =>
      (b.getAttribute("title") || "").startsWith("Dendrogram")
    );
    expect(baum, "Der Baum-Knopf fehlt").toBeTruthy();
    await act(async () => {
      baum!.click();
      await new Promise((r) => setTimeout(r, 500));
    });
    const e = etat(container);
    const summe = e.gruende.reduce((s, g) => s + g.n, 0);
    expect(summe, `Der Baum-Etat geht nicht auf: "${e.text}"`).toBe(e.ohnee);
    expect(e.benannt + e.ohnee, `auch im Baum nicht: "${e.text}"`).toBe(e.umfang);
    expect(e.gruende.length, `Der Baum nennt keinen Grund: "${e.text}"`).toBeGreaterThan(0);
    expect(feldEtat.umfang, "Der Feld-Etat ist vor dem Umschalten nicht gemessen worden").toBeGreaterThan(0);
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
    await feld(notizen, [180, 140]);
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
    let tx = 0, ty = 0, k = 0;
    for (const a of leinwand.letzterRahmen()) {
      if (a.op === "translate" && ty === 0) { tx = Number(a.args[0]); ty = Number(a.args[1]); }
      if (a.op === "scale" && k === 0) k = Number(a.args[0]);
    }
    expect(k, "der letzte Rahmen setzt keine Transformation").toBeGreaterThan(0);
    // Alle gemalten Winzlinge (fillRect in Weltpunkten) muessen auf dem Schirm
    // liegen: yWelt * k + ty < 140.
    const welten = leinwand.letzterRahmen()
      .filter((a) => a.op === "fillRect")
      .map((a) => Number(a.args[1]) * k + ty);
    expect(welten.length, "es wird nichts gemalt").toBeGreaterThan(0);
    const tiefste = Math.max(...welten);
    expect(tiefste, `unterste gemalte Zeile bei ${tiefste.toFixed(1)} px — der Rahmen war 320, die Leinwand 140`).toBeLessThan(140 + 4);
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

describe("F8-N1 (Sichtpruefung): der Baum steht nicht als Haarlinie, und die Bilanz nennt ihren Umfang", () => {
  /**
   * Der kleinste Abstand zweier auf dem Schirm gemalter Notizscheiben.
   *
   * Im Bild vom 400er-Baum standen zwei Zeilen 3 px auseinander — die Kamera
   * hatte alle Zeilen in den Rahmen gepresst. Geprueft wird der Abstand der
   * gemalten Scheiben, nicht ein Zoom-Wert: was ein Mensch sieht, ist Zeilen-
   * abstand, und der ist beides — Etikettenplatz und Badgeplatz.
   */
  function kleinsterZeilenabstand() {
    let tx = 0, ty = 0, k = 0;
    for (const a of leinwand.letzterRahmen()) {
      if (a.op === "translate" && ty === 0) { tx = Number(a.args[0]); ty = Number(a.args[1]); }
      if (a.op === "scale" && k === 0) k = Number(a.args[0]);
    }
    const ys: number[] = [];
    for (const a of leinwand.letzterRahmen()) {
      if (a.op === "fillRect") ys.push(Number(a.args[1]) * k + ty);
      else if (a.op === "drawImage" && a.args.length >= 5) ys.push(Number(a.args[2]) * k + ty);
    }
    ys.sort((x, y) => x - y);
    let luecke = Infinity;
    for (let i = 1; i < ys.length; i++) luecke = Math.min(luecke, ys[i] - ys[i - 1]);
    return { luecke: Number.isFinite(luecke) ? luecke : null, gescheiben: ys.length, k };
  }

  async function imBaumBei(n: number, masse: [number, number] = [1130, 700]) {
    const notizen = Array.from({ length: n }, (_, i) => note({ tags: [`feld ${i % 4}`] }));
    const byEntity: Record<string, string[]> = {};
    for (let g = 0; g < 20; g++) byEntity[`begriff ${g}`] = notizen.slice(g * Math.ceil(n / 20), (g + 1) * Math.ceil(n / 20)).map((m) => m.id);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ relations: [], memoriesByEntity: byEntity }), { status: 200 })));
    const { container } = await feld(notizen, masse);
    const baum = [...container.querySelectorAll("button")].find((b) => (b.getAttribute("title") || "").startsWith("Dendrogram"));
    await act(async () => { baum!.click(); await new Promise((r) => setTimeout(r, 500)); });
    return container;
  }

  it("haelt bei 400 Notizen zwei Zeilen mindestens 13 Bildpixel auseinander", async () => {
    await imBaumBei(400);
    const { luecke, gescheiben, k } = kleinsterZeilenabstand();
    expect(gescheiben, "es werden keine Notizscheiben gemalt").toBeGreaterThan(0);
    expect(luecke, `kleinster Zeilenabstand ${luecke?.toFixed(1)} px bei Zoom ${(k * 100).toFixed(0)} % — der Baum ist eine Haarlinie`).toBeGreaterThanOrEqual(13);
  });

  it("sagt die Bilanz in Umfangen, die das Auge nachzaehlen kann", async () => {
    // Ein kurzer Rahmen (240 px) faellt unter die Zeilenzahl, die der Baum offen
    // laesst: damit liegt ein Teil der entfalteten Notizen ausserhalb des Bildes
    // — und das muss die Flaeche sagen, statt es still zu halten.
    const container = await imBaumBei(400, [1130, 240]);
    const legende = container.querySelector('[data-testid="graph-legende"]');
    expect(legende!.textContent, "die Legende fehlt").toContain("400 notes");
    expect(legende!.textContent, `Belegtext: ${legende!.textContent?.slice(0, 320)}`)
      .toMatch(/\d+ unfolded, \d+ notes? folded under \d+ groups/);
    const imBild = container.querySelector('[data-testid="graph-im-bild"]');
    expect(imBild, "die Flaeche sagt nicht, was ausserhalb ihres Rahmens liegt").toBeTruthy();
    const text = imBild!.textContent || "";
    const treffer = text.match(/^(\d+) of (\d+) unfolded notes are in this picture$/);
    const leer = /^no unfolded notes are in this picture/.test(text);
    expect(!!(treffer || leer), `Belegtext: ${text}`).toBe(true);
    if (treffer) {
      const imZahl = Number(treffer[1]);
      const vonZahl = Number(treffer[2]);
      expect(imZahl, "die Zeile meldet mehr Notizen, als die Flaeche entfaltet hat").toBeLessThanOrEqual(vonZahl);
      const entfaltet = Number((legende!.textContent || "").match(/(\d+) unfolded/)?.[1] ?? -1);
      expect(vonZahl, `${vonZahl} in der Bildzeile, ${entfaltet} in der Bilanz — zwei Zahlen fuer denselben Umfang`)
        .toBe(entfaltet);
    }
    // Der Stamm bleibt im Bild: die Wurzel ist der erste Satz, den jemand
    // in einem Baum liest.
    expect(leinwand.schriften().some((x) => x.text === "Knowledge"), "die Wurzel steht nicht im Bild").toBe(true);
  });
});

describe("F8-N1 (zweiter Blick ins eigene Bild): ein Baum ueber dem Rahmen beginnt bei seiner Wurzel", () => {
  it("schneidet bei einem Baum ueber dem Rahmen weder Stamm noch Bilanz ab", async () => {
    // Der Lesbarkeitsboden laesst den Baum ueber den Rahmen wachsen. Zentriert
    // sitzt die Wurzel eines horizontalen Dendrogramms in der Mitte der
    // Blatthoehe — sie muss im Bild bleiben, und was fehlt, muss die Zeile
    // sagen, damit die Zahl mit dem Bild zusammenstimmt.
    const notizen = Array.from({ length: 180 }, (_, i) => note({ tags: [`feld ${i % 4}`] }));
    const byEntity: Record<string, string[]> = {};
    for (let g = 0; g < 60; g++) byEntity[`begriff ${g}`] = notizen.slice(g * 3, g * 3 + 3).map((m) => m.id);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ relations: [], memoriesByEntity: byEntity }), { status: 200 })));
    const { container } = await feld(notizen, [1130, 260]);
    const baum = [...container.querySelectorAll("button")].find((b) => (b.getAttribute("title") || "").startsWith("Dendrogram"));
    await act(async () => { baum!.click(); await new Promise((r) => setTimeout(r, 500)); });

    expect(leinwand.schriften().some((t) => t.text === "Knowledge"),
      `die Wurzel steht nicht im Bild: ${JSON.stringify(leinwand.schriften().map((t) => t.text).slice(0, 12))}`).toBe(true);
    const imBild = container.querySelector('[data-testid="graph-im-bild"]');
    expect((imBild!.textContent || "").length, "bei einem Baum ueber dem Rahmen sagt die Flaeche nichts ueber den Rest").toBeGreaterThan(0);
  });
});
