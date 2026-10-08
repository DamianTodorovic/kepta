// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, fireEvent } from "@testing-library/react";
import { KnowledgeGraph, istHell, GLYPH_FUER_ART } from "../../src/components/KnowledgeGraph";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger, setzeTheme, type Leinwand } from "../helfer/canvas";
import type { Memory } from "../../src/types";

// Der Wissensgraph galt als "nicht automatisiert pruefbar", weil jsdom keinen
// 2D-Kontext hat. Genau dort sind dann die Fehler gelandet, die erst beim
// Hinsehen auffielen: der helle Modus war ein beiger Brei, der Zeitregler liess
// das Kantennetz stehen, ein angefasster Knoten war fuer immer erstarrt.
//
// Mit einer Leinwand, die Buch fuehrt, laesst sich pruefen, WAS gezeichnet wird.

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
    id: `m${zaehler}`, userId: "local", title: `Notiz ${zaehler}`, content: "Inhalt",
    tags: [], type: "semantic", createdAt: Date.parse("2024-01-01"), updatedAt: Date.parse("2024-01-01"),
    ...over,
  };
}

/**
 * Rendert und laesst die Bildschleife ein paar Mal laufen.
 *
 * Aehnlichkeitskanten sind seit dem 6.10. ausgeschaltet (die Flaeche zeigt nur,
 * was jemand behauptet). Wer sie fuer einen Test braucht, holt sie mit
 * `aehnlichkeit: true` — derselbe Klick, den ein Mensch tut.
 */
async function zeichne(
  memories: Memory[],
  opts: { onSelect?: (m: Memory) => void; aehnlichkeit?: boolean } | ((m: Memory) => void) = {},
) {
  const optionen = typeof opts === "function" ? { onSelect: opts } : opts;
  // Immer ein Spion: die Fälle unten lesen .mock, und eine mitgegebene
  // Callback-Funktion wird trotzdem weitergereicht.
  const onSelect = vi.fn(optionen.onSelect);
  const view = render(<KnowledgeGraph memories={memories} onSelectMemory={onSelect} />);
  await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
  if (optionen.aehnlichkeit) {
    const knopf = view.container.querySelector('button[aria-pressed]') as HTMLButtonElement;
    expect(knopf, "Der Aehnlichkeits-Schalter fehlt").not.toBeNull();
    await act(async () => { fireEvent.click(knopf); await new Promise((r) => setTimeout(r, 60)); });
  }
  return { ...view, onSelect };
}

/** Weitere Bilder abwarten (die Schleife laeuft ueber requestAnimationFrame). */
async function bilder(n = 8) {
  await act(async () => { await new Promise((r) => setTimeout(r, n * 20)); });
}

/** Richtung an- oder ausknipsen — derselbe Klick, den ein Mensch tut. */
async function richteRichtung(view: { container: HTMLElement }, an: boolean) {
  const knopf = [...view.container.querySelectorAll("button[aria-pressed]")].find((b) =>
    b.textContent?.includes("Direction")
  ) as HTMLButtonElement | undefined;
  expect(knopf, "Der Richtungsschalter fehlt").toBeTruthy();
  if ((knopf!.getAttribute("aria-pressed") === "true") !== an) {
    await act(async () => {
      fireEvent.click(knopf!);
      await new Promise((r) => setTimeout(r, 60));
    });
  }
}

/**
 * Die Keile eines Rahmens: gefüllte Pfade in der Akzentfarbe.
 *
 * Gemessen wird die Querschnittsbreite am Anfang und am Ende — der Ring läuft
 * erst die linke Seite hin, dann die rechte zurück, also sind Punkt 0 und der
 * letzte Punkt ein Paar, und die beiden mittleren ebenso.
 */
function keileImRahmen(ahmen: { op: string; args: unknown[] }[], farbe: string) {
  const out: { anfang: number; ende: number; punkte: number }[] = [];
  let fuellung = "";
  let pfad: { x: number; y: number }[] = [];
  for (const a of ahmen) {
    if (a.op === "set:fillStyle") fuellung = String(a.args[0]);
    else if (a.op === "beginPath") pfad = [];
    else if (a.op === "moveTo" || a.op === "lineTo") pfad.push({ x: Number(a.args[0]), y: Number(a.args[1]) });
    else if (a.op === "fill") {
      if (fuellung === farbe && pfad.length >= 4 && pfad.length % 2 === 0) {
        const n = pfad.length / 2;
        const paare = (i: number, j: number) =>
          Math.hypot(pfad[i].x - pfad[j].x, pfad[i].y - pfad[j].y);
        out.push({ anfang: paare(0, pfad.length - 1), ende: paare(n - 1, n), punkte: pfad.length });
      }
      pfad = [];
    }
  }
  return out;
}

describe("Der Graph malt ueberhaupt", () => {
  it("zeigt ohne Notizen einen Hinweis statt einer Leinwand", async () => {
    const { container } = await zeichne([]);
    expect(container.querySelector('[data-testid="graph-canvas"]')).toBeNull();
    expect(container.textContent).toMatch(/No notes yet/i);
  });

  it("legt eine Leinwand an und zeichnet Knoten", async () => {
    const { container } = await zeichne([note(), note(), note()]);
    expect(container.querySelector('[data-testid="graph-canvas"]')).not.toBeNull();
    expect(leinwand.zahl("clearRect")).toBeGreaterThan(0);
    expect(leinwand.zahl("arc")).toBeGreaterThan(0);
  });

  it("nennt Knoten- und Kantenzahl im Kopf", async () => {
    const ms = [note({ tags: ["a"] }), note({ tags: ["a"] }), note({ tags: ["b"] })];
    const { container } = await zeichne(ms);
    expect(container.textContent).toMatch(/3 notes/);
  });

  it("rechnet die Leinwand auf die Geraetepixel um", async () => {
    const { container } = await zeichne([note()]);
    const c = container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    // 1000 x 700 CSS bei devicePixelRatio 1 in jsdom
    expect(c.width).toBe(1000);
    expect(c.height).toBe(700);
  });
});

describe("Helles Thema: die Kante muss dunkel sein", () => {
  // Der Befund vom 6.9.2026: beim Umstieg von SVG auf Canvas gingen
  // --node-rim/--node-shade/--node-hi verloren und wurden durch feste
  // Weisswerte ersetzt. Im hellen Thema war der Graph danach unbenutzbar:
  // weisse Glanzlichter auf hellen Kugeln vor hellem Grund, ohne Kante.
  async function randfarben(modus: "hell" | "dunkel"): Promise<unknown[]> {
    setzeTheme(modus);
    leinwand.leeren();
    await zeichne([note(), note(), note()]);
    await bilder();
    // Jeder stroke() mit der vorher gesetzten strokeStyle
    return leinwand.aufrufe
      .map((a, i) => (a.op === "stroke" ? leinwand.wertVor(i, "strokeStyle") : null))
      .filter((v): v is string => typeof v === "string");
  }

  it("nimmt im hellen Thema die Randfarbe aus dem Theme", async () => {
    const farben = await randfarben("hell");
    // Gegen den Token pruefen, nicht gegen eine kopierte Zahl: der Test soll
    // sehen, ob die Komponente --node-rim liest — nicht, was das Helferlein
    // gerade als hell notiert.
    const rim = document.documentElement.style.getPropertyValue("--node-rim").trim();
    expect(rim).not.toBe("");
    expect(farben.some((f) => String(f) === rim), `gemalt: ${JSON.stringify(farben)} — Token: ${rim}`).toBe(true);
    expect(istHell(rim), "auf hellem Grund muss die Kante dunkel sein").toBe(false);
  });

  it("nimmt im dunklen Thema die Randfarbe aus dem Theme", async () => {
    const farben = await randfarben("dunkel");
    const rim = document.documentElement.style.getPropertyValue("--node-rim").trim();
    expect(rim).not.toBe("");
    expect(farben.some((f) => String(f) === rim), `gemalt: ${JSON.stringify(farben)} — Token: ${rim}`).toBe(true);
    expect(istHell(rim), "auf dunklem Grund muss die Kante hell sein").toBe(true);
  });

  it("malt im hellen Thema keine harte weisse Kante mehr", async () => {
    const farben = await randfarben("hell");
    expect(farben.some((f) => String(f) === "rgba(255,255,255,0.32)")).toBe(false);
  });
});

describe("Zeitregler: das Kantennetz verschwindet mit den Knoten", () => {
  // Vorher blendete der Regler nur die Knoten aus. Bei "Februar 2023" stand ein
  // graues Gitter ohne Knoten im Bild — die Struktur von Wissen, das es damals
  // noch gar nicht gab.
  const alt = Date.parse("2023-01-01");
  const neu = Date.parse("2026-01-01");

  function korpus(): Memory[] {
    return [
      note({ tags: ["t"], createdAt: alt, updatedAt: alt }),
      note({ tags: ["t"], createdAt: alt, updatedAt: alt }),
      note({ tags: ["t"], createdAt: neu, updatedAt: neu }),
      note({ tags: ["t"], createdAt: neu, updatedAt: neu }),
    ];
  }

  it("zeigt ohne Zeitfilter alle Kanten", async () => {
    const { container } = await zeichne(korpus(), { aehnlichkeit: true });
    expect(container.textContent).toMatch(/6 similar/); // 4 Knoten, alle mit Tag "t"
    leinwand.leeren();
    await bilder();
    expect(leinwand.zahl("lineTo")).toBeGreaterThan(0);
  });

  it("laesst bei einem frueheren Zeitpunkt die Kanten der spaeteren Knoten weg", async () => {
    const { container } = await zeichne(korpus(), { aehnlichkeit: true });
    const regler = container.querySelector('input[aria-label="Time of the knowledge shown"]') as HTMLInputElement;
    expect(regler, "Zeitregler fehlt").not.toBeNull();

    leinwand.leeren();
    await bilder();
    const vorher = leinwand.zahl("lineTo");

    // Auf die Mitte der Spanne stellen: nur die alten Knoten existieren dann.
        // Ziehen (input) und Loslassen (pointerup): der Filter wirkt beim Loslassen.
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    setter.call(regler, "50");
    regler.dispatchEvent(new Event("input", { bubbles: true }));
    await act(async () => {
      regler.dispatchEvent(new window.PointerEvent("pointerup", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 80));
    });
    leinwand.leeren();
    await bilder();
    const nachher = leinwand.zahl("lineTo");

    expect(vorher).toBeGreaterThan(0);
    expect(nachher).toBeLessThan(vorher);
  });
});

describe("Beschriftung: kein Teppich uebereinander", () => {
  it("laesst Etiketten einander ausweichen", async () => {
    // 60 Knoten ohne Verbindungen liegen dicht beieinander; ohne Belegungsraster
    // wuerde jedes Etikett gemalt und alles ueberdeckte sich.
    const ms = Array.from({ length: 60 }, () => note({ title: "Ein ziemlich langer Titel" }));
    await zeichne(ms);
    leinwand.leeren();
    await bilder();
    // Pro BILD zaehlen, nicht ueber mehrere: jedes Bild beginnt mit clearRect.
    const texte = leinwand.texteImRahmen();
    expect(texte.length).toBeGreaterThan(0);
    expect(texte.length).toBeLessThan(ms.length);
  });

  it("kuerzt lange Titel", async () => {
    await zeichne([note({ title: "Ein wirklich sehr langer Titel, der nicht komplett passt" })]);
    leinwand.leeren();
    await bilder();
    const texte = leinwand.texteImRahmen();
    if (texte.length > 0) expect(texte[0].text.length).toBeLessThanOrEqual(27);
  });
});

describe("Filter", () => {
  it("erklaert einen leeren Treffer, statt eine schwarze Flaeche zu zeigen", async () => {
    const { container } = await zeichne([note({ title: "Docker" }), note({ title: "Kochen" })]);
    const feld = container.querySelector('input[placeholder="Filter the graph…"]') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(feld, "gibtesnicht");
      feld.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 80));
    });
    expect(container.textContent).toMatch(/No match/i);
    expect(container.textContent).toMatch(/gibtesnicht/);
  });

  it("engt die Knotenzahl ein und gibt sie wieder frei", async () => {
    const { container } = await zeichne([note({ title: "Docker" }), note({ title: "Kochen" }), note({ title: "Docker Zwei" })]);
    const feld = container.querySelector('input[placeholder="Filter the graph…"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(feld, "docker");
      feld.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 80));
    });
    expect(container.textContent).toMatch(/2 notes/);
    await act(async () => {
      setter.call(feld, "");
      feld.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 80));
    });
    expect(container.textContent).toMatch(/3 notes/);
  });
});

describe("Bedienung", () => {
  const kl = (typ: string, x: number, y: number) =>
    new (globalThis as unknown as { PointerEvent: typeof PointerEvent }).PointerEvent(typ, {
      bubbles: true, cancelable: true, clientX: x, clientY: y,
    });

  it("zoomt hinein und heraus und passt die Ansicht an", async () => {
    const { container } = await zeichne([note(), note(), note()]);
    const anzeige = () => container.querySelector('[title="Current zoom"]')?.textContent ?? "";
    const knopf = (t: string) => container.querySelector(`button[title="${t}"]`) as HTMLButtonElement;

    const start = anzeige();
    await act(async () => { knopf("Zoom in").click(); await new Promise((r) => setTimeout(r, 40)); });
    const rein = anzeige();
    await act(async () => { knopf("Zoom out").click(); knopf("Zoom out").click(); await new Promise((r) => setTimeout(r, 40)); });
    const raus = anzeige();
    expect(rein).not.toBe(start);
    expect(raus).not.toBe(rein);
    await act(async () => { knopf("Fit the whole graph into view").click(); await new Promise((r) => setTimeout(r, 60)); });
    expect(anzeige()).toMatch(/%/);
  });

  it("oeffnet eine Notiz bei Doppelklick auf einen Knoten", async () => {
    const onSelect = vi.fn();
    const { container } = await zeichne([note()], onSelect);
    await bilder();
    const c = container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    // Ein einzelner Knoten liegt nach dem Einpassen in der Mitte der Leinwand.
    await act(async () => {
      c.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 500, clientY: 350 }));
      await new Promise((r) => setTimeout(r, 40));
    });
    expect(onSelect).toHaveBeenCalled();
  });

  it("gibt den Zeiger nach dem Loslassen wieder frei", async () => {
    const { container } = await zeichne([note(), note(), note()]);
    await bilder();
    const c = container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    await act(async () => {
      c.dispatchEvent(kl("pointerdown", 500, 350));
      await new Promise((r) => setTimeout(r, 30));
      c.dispatchEvent(kl("pointermove", 540, 380));
      await new Promise((r) => setTimeout(r, 30));
      c.dispatchEvent(kl("pointerup", 540, 380));
      await new Promise((r) => setTimeout(r, 60));
    });
    // Der Zeiger steht danach wieder auf "greifbar", nicht auf "haelt fest".
    expect((c.style.cursor === "grab" || c.style.cursor === "pointer")).toBe(true);
  });

  it("loest die Hervorhebung, wenn der Zeiger die Flaeche verlaesst", async () => {
    const { container } = await zeichne([note(), note()]);
    await bilder();
    const c = container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    await act(async () => {
      c.dispatchEvent(kl("pointermove", 500, 350));
      await new Promise((r) => setTimeout(r, 50));
    });
    await act(async () => {
      c.dispatchEvent(kl("pointerleave", -50, -50));
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(c.style.cursor).toBe("grab");
  });

  it("verhindert das Mitscrollen der Seite beim Radzoom", async () => {
    const { container } = await zeichne([note()]);
    const c = container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    const evt = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -100 });
    c.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
  });
});

describe("Farben und Groesse", () => {
  it("bietet eine Farbe je Wissensart an und merkt sich eine Aenderung", async () => {
    const { container } = await zeichne([note()]);
    const waehler = container.querySelectorAll('input[type="color"]');
    // Vier Wissensarten: Fakt, Ereignis, Anleitung, Beleg.
    expect(waehler).toHaveLength(4);
    await act(async () => {
      const w = waehler[0] as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(w, "#ff3366");
      w.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 40));
    });
    expect(localStorage.getItem("kepta_type_colors")).toContain("ff3366");
    expect(document.documentElement.style.getPropertyValue("--type-semantic")).toBe("#ff3366");
  });

  it("passt die Ansicht neu ein, wenn sich das Fenster aendert", async () => {
    // Der Graph wird mitgemountet, waehrend eine andere Ansicht sichtbar ist —
    // ohne Neueinpassen stand er danach verschoben da.
    const { container } = await zeichne([note(), note(), note()]);
    const vorher = container.querySelector('[title="Current zoom"]')?.textContent;
    await act(async () => { setzeGroesse(400, 300); await new Promise((r) => setTimeout(r, 80)); });
    const nachher = container.querySelector('[title="Current zoom"]')?.textContent;
    expect(nachher).not.toBe(vorher);
  });
});

describe("Detailstufen: nah scharf, fern sparsam", () => {
  // Drei Stufen, nicht zwei. Die mittlere (Sprite) gab es immer; dazu kamen
  // eine sehr kleine und die Erkenntnis, warum das noetig war: unterhalb eines
  // Bildpunktes hat der Browser die Sprites faktisch weggelassen. Der Graph war
  // schnell, WEIL er unsichtbar war — und in dem Moment, in dem eine
  // Untergrenze ihn sichtbar machte, rasterte er 25 000 gefilterte Bildkopien
  // je Bild und brauchte eine Sekunde dafuer.
  const knopfIn = (c: HTMLElement, t: string) => c.querySelector(`button[title="${t}"]`) as HTMLButtonElement;

  it("buendelt sehr kleine Knoten zu einem Pfad statt sie einzeln zu kopieren", async () => {
    const { container } = await zeichne([note(), note(), note()]);
    await act(async () => { for (let i = 0; i < 20; i++) knopfIn(container, "Zoom out").click(); await new Promise((r) => setTimeout(r, 60)); });
    leinwand.leeren();
    await bilder();
    const fern = leinwand.letzterRahmen();
    // Achsenparallele Rechtecke, keine Bildkopien.
    expect(fern.filter((a) => a.op === "fillRect").length).toBeGreaterThan(0);
    expect(fern.filter((a) => a.op === "drawImage").length).toBe(0);
  });

  it("malt mittelgrosse Knoten als Sprite und grosse als Vektorkugel", async () => {
    // Klein: drawImage aus dem Zwischenspeicher. Gross: echte Kreise mit Verlauf.
    const { container } = await zeichne([note(), note(), note()]);
    const knopf = (t: string) => knopfIn(container, t);

    // Mittlere Entfernung -> Sprites
    await act(async () => { for (let i = 0; i < 6; i++) knopf("Zoom out").click(); await new Promise((r) => setTimeout(r, 60)); });
    leinwand.leeren();
    await bilder();
    const fern = leinwand.letzterRahmen();
    expect(fern.filter((a) => a.op === "drawImage").length).toBeGreaterThan(0);

    // Nah herangezoomt -> Vektorkugeln mit Verlauf
    await act(async () => { for (let i = 0; i < 24; i++) knopf("Zoom in").click(); await new Promise((r) => setTimeout(r, 60)); });
    leinwand.leeren();
    await bilder();
    const nah = leinwand.letzterRahmen();
    expect(nah.filter((a) => a.op === "createRadialGradient").length).toBeGreaterThan(0);
    expect(nah.filter((a) => a.op === "drawImage").length).toBe(0);
  });

  it("laesst auch weit heraussgezoomt etwas Sichtbares stehen", async () => {
    // Die eigentliche Klage: "kein Ueberblick, wenn man zu viel Wissen hat".
    // Ohne Untergrenze wurde jeder Knoten sub-pixelgross und verschwand.
    const { container } = await zeichne(Array.from({ length: 40 }, () => note({ tags: ["t"] })));
    await act(async () => { for (let i = 0; i < 24; i++) knopfIn(container, "Zoom out").click(); await new Promise((r) => setTimeout(r, 60)); });
    leinwand.leeren();
    await bilder();
    const rahmen = leinwand.letzterRahmen();
    const rechtecke = rahmen.filter((a) => a.op === "fillRect");
    expect(rechtecke.length).toBeGreaterThan(0);
    // Kantenlaenge im Weltmass mal Zoom muss mindestens 2 x MIN_KNOTEN_PX sein.
    const zoom = Number((container.querySelector('[title="Current zoom"]')?.textContent ?? "0").replace(/[^\d.]/g, "")) / 100;
    const kante = (rechtecke[0].args?.[2] as number) ?? 0;
    expect(kante * zoom).toBeGreaterThanOrEqual(2.9);
  });

  it("macht Erwähnung und Behauptung verschieden sichtbar", async () => {
    // Die Legende verspricht drei Kantenarten. Vorher deckte „real connection"
    // zwei davon: eine Notiz, die einen Begriff erwähnt, und eine Behauptung
    // zwischen zwei Begriffen sind aber zwei verschiedene Aussagen — und im
    // alten Kreuzprodukt waren sie gar nicht zu unterscheiden.
    //
    // Hier geht es um die LINIEN: Richtung aus, dann wird die Behauptung wieder
    // mit Strich gemalt. Der Keil selbst steht im nächsten Test.
    const a = note({ title: "Mandat" });
    const b = note({ title: "Frist" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: [{ source: "e1", target: "e2", relation: "mentions", memoryId: null }],
      memoriesByEntity: { e1: [a.id], e2: [b.id] },
    }), { status: 200 })));

    const view = await zeichne([a, b]);
    await richteRichtung(view, false);
    await bilder(12);
    const stil = document.documentElement.style;
    const akzent = stil.getPropertyValue("--accent").trim();
    const notiz = stil.getPropertyValue("--text-1").trim();
    let farbe = "";
    let breite = "";
    const striche: { farbe: string; breite: string }[] = [];
    for (const aufruf of leinwand.letzterRahmen()) {
      if (aufruf.op === "set:strokeStyle") farbe = String(aufruf.args[0]);
      if (aufruf.op === "set:lineWidth") breite = String(aufruf.args[0]);
      if (aufruf.op === "stroke") striche.push({ farbe, breite });
    }
    const behauptung = striche.find((s) => s.farbe === akzent);
    const erwaehnung = striche.find((s) => s.farbe === notiz);
    expect(behauptung, "keine Behauptung in der Akzentfarbe").toBeDefined();
    expect(erwaehnung, "keine Erwähnung in der Notizfarbe").toBeDefined();
    expect(Number(erwaehnung!.breite), "Erwähnung ist nicht feiner als die Behauptung")
      .toBeLessThan(Number(behauptung!.breite));
  });

  it("malt die Behauptung als Keil: gefüllt, am Ausgang breiter als am Ziel", async () => {
    // Richtung ist eine Aussage — „e1 behauptet über e2" ist nicht die
    // Umkehrung. Bis zum 7.10. ging sie im Payload mit und verpuffte in einer
    // symmetrischen Linie.
    const a = note({ title: "Mandat" });
    const b = note({ title: "Frist" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: [{ source: "e1", target: "e2", relation: "mentions", memoryId: null }],
      memoriesByEntity: { e1: [a.id], e2: [b.id] },
    }), { status: 200 })));

    await zeichne([a, b]);
    await bilder(12);
    const akzent = document.documentElement.style.getPropertyValue("--accent").trim();
    const keile = keileImRahmen(leinwand.letzterRahmen(), akzent);
    expect(keile.length, "kein einziger Keil in der Akzentfarbe").toBeGreaterThan(0);
    for (const k of keile) {
      expect(k.anfang).toBeGreaterThan(k.ende);
      // Und schmal genug, um eine Linie zu bleiben, nicht eine Fläche.
      expect(k.ende).toBeGreaterThan(0);
    }
    // Die Erwähnungen bleiben Linien: nur die Behauptung trägt eine Richtung.
    expect(leinwand.zahl("stroke")).toBeGreaterThan(0);
  });

  it("nimmt der Schalter den Keil wieder weg — die Linie bleibt", async () => {
    const a = note({ title: "Mandat" });
    const b = note({ title: "Frist" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: [{ source: "e1", target: "e2", relation: "mentions", memoryId: null }],
      memoriesByEntity: { e1: [a.id], e2: [b.id] },
    }), { status: 200 })));

    const view = await zeichne([a, b]);
    await bilder(6);
    const akzent = document.documentElement.style.getPropertyValue("--accent").trim();
    expect(keileImRahmen(leinwand.letzterRahmen(), akzent).length).toBeGreaterThan(0);

    await richteRichtung(view, false);
    await bilder(12);
    expect(keileImRahmen(leinwand.letzterRahmen(), akzent)).toHaveLength(0);
    // Merken, dass der Nutzer die Richtung abgestellt hat — beim nächsten
    // Öffnen der App gilt immer noch sein Bild.
    expect(localStorage.getItem("kepta_graph_richtung")).toBe("0");
  });

  it("zeichnet echte Relationen als gebogene Linie in der Akzentfarbe", async () => {
    // Dieser Zweig war nie gelaufen: alle Testkorpora hatten null Relationen.
    const a = note({ title: "Mandat" });
    const b = note({ title: "Frist" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: [{ source: "e1", target: "e2", relation: "mentions", memoryId: null }],
      memoriesByEntity: { e1: [a.id], e2: [b.id] },
    }), { status: 200 })));

    const { container } = await zeichne([a, b]);
    await bilder(12);
    expect(container.textContent).toMatch(/2 notes · 2 concepts · 3 links(?! ·)/);
    const rahmen = leinwand.letzterRahmen();
    expect(rahmen.filter((x) => x.op === "quadraticCurveTo").length).toBeGreaterThan(0);
    // Vor dem Zeichnen der echten Kanten steht die Akzentfarbe. Der Wert kommt
    // aus dem gesetzten Theme, nicht aus einer kopierten Hexzahl — sonst misst
    // dieser Test die Testdatei statt der App.
    const akzent = document.documentElement.style.getPropertyValue("--accent").trim();
    const akzentGesetzt = leinwand.aufrufe.some((x) => x.op === "set:strokeStyle" && String(x.args[0]) === akzent);
    expect(akzentGesetzt).toBe(true);
  });

  it("malt Aehnlichkeitskanten auch weit herausgezoomt, solange es wenige sind", async () => {
    // Die Schwelle selbst ist in lib/graphLayout geprueft (nurEchteKanten).
    // Hier zaehlt, dass eine normale Wissensbasis beim Herauszoomen nicht
    // ploetzlich ohne Verbindungen dasteht.
    const ms = Array.from({ length: 12 }, () => note({ tags: ["gemeinsam"] }));
    const { container } = await zeichne(ms, { aehnlichkeit: true });
    const knopf = (t: string) => container.querySelector(`button[title="${t}"]`) as HTMLButtonElement;
    await act(async () => { for (let i = 0; i < 20; i++) knopf("Zoom out").click(); await new Promise((r) => setTimeout(r, 60)); });
    leinwand.leeren();
    await bilder();
    expect(leinwand.letzterRahmen().filter((a) => a.op === "lineTo").length).toBeGreaterThan(0);
  });
});

describe("Zustaende einzelner Notizen", () => {
  it("umrandet abgelaufene Notizen gestrichelt", async () => {
    const abgelaufen = note({ validTo: Date.parse("2024-06-01") });
    await zeichne([abgelaufen, note()]);
    await bilder();
    const striche = leinwand.von("setLineDash").map((a) => a.args[0] as number[]);
    expect(striche.some((d) => Array.isArray(d) && d.length === 2 && d[0] > 0)).toBe(true);
  });

  it("zeichnet ersetzte Notizen blasser", async () => {
    const ersetzt = note({ supersededBy: "andere" });
    await zeichne([ersetzt, note()]);
    leinwand.leeren();
    await bilder();
    const alphas = leinwand.letzterRahmen()
      .filter((a) => a.op === "set:globalAlpha")
      .map((a) => Number(a.args[0]));
    expect(alphas.some((v) => v > 0.5 && v < 0.7)).toBe(true);
  });
});

describe("Ziehen gegen Schwenken", () => {
  const kl = (typ: string, x: number, y: number) =>
    new (globalThis as unknown as { PointerEvent: typeof PointerEvent }).PointerEvent(typ, {
      bubbles: true, cancelable: true, clientX: x, clientY: y,
    });

  it("schwenkt die Ansicht, wenn man ins Leere greift", async () => {
    const { container } = await zeichne([note()]);
    await bilder();
    const c = container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    leinwand.leeren();
    await bilder(2);
    const vorher = leinwand.von("translate").at(-1)?.args as number[] | undefined;

    await act(async () => {
      // Ecke oben links: dort liegt sicher kein Knoten (der eine sitzt mittig).
      c.dispatchEvent(kl("pointerdown", 20, 20));
      c.dispatchEvent(kl("pointermove", 140, 110));
      c.dispatchEvent(kl("pointerup", 140, 110));
      await new Promise((r) => setTimeout(r, 60));
    });
    leinwand.leeren();
    await bilder(2);
    const nachher = leinwand.von("translate").at(-1)?.args as number[] | undefined;

    expect(vorher).toBeDefined();
    expect(nachher).toBeDefined();
    expect(nachher![0]).not.toBe(vorher![0]);
  });

  it("schwenkt NICHT, wenn man einen Knoten greift", async () => {
    const { container } = await zeichne([note()]);
    await bilder();
    const c = container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    leinwand.leeren();
    await bilder(2);
    const vorher = leinwand.von("translate").at(-1)?.args as number[] | undefined;

    await act(async () => {
      c.dispatchEvent(kl("pointerdown", 500, 350));
      c.dispatchEvent(kl("pointermove", 560, 400));
      c.dispatchEvent(kl("pointerup", 560, 400));
      await new Promise((r) => setTimeout(r, 60));
    });
    leinwand.leeren();
    await bilder(2);
    const nachher = leinwand.von("translate").at(-1)?.args as number[] | undefined;
    expect(nachher![0]).toBe(vorher![0]);
    expect(nachher![1]).toBe(vorher![1]);
  });
});

describe("Finger und Trackpad", () => {
  it("laesst den Browser die Flaeche nicht wegscrollen", async () => {
    // touch-action: none ist die Voraussetzung dafuer, dass Wischen einen Knoten
    // zieht statt die Seite zu scrollen. Echte Beruehrungen kann jsdom nicht
    // erzeugen — die Bedingung dafuer schon.
    const { container } = await zeichne([note()]);
    const c = container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    expect(c.className).toMatch(/touch-none/);
    expect(c.className).toMatch(/select-none/);
  });

  it("bedient sich ueber Zeigerereignisse, also auch mit dem Finger", async () => {
    const { container } = await zeichne([note()]);
    await bilder();
    const c = container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    const PE = (globalThis as unknown as { PointerEvent: typeof PointerEvent }).PointerEvent;
    let gemalt = 0;
    await act(async () => {
      c.dispatchEvent(new PE("pointerdown", { bubbles: true, clientX: 500, clientY: 350, pointerType: "touch" } as PointerEventInit));
      c.dispatchEvent(new PE("pointermove", { bubbles: true, clientX: 560, clientY: 400, pointerType: "touch" } as PointerEventInit));
      c.dispatchEvent(new PE("pointerup", { bubbles: true, clientX: 560, clientY: 400, pointerType: "touch" } as PointerEventInit));
      await new Promise((r) => setTimeout(r, 60));
      gemalt = leinwand.zahl("clearRect");
    });
    // Der Griff hat nichts geworfen und das Bild laeuft weiter.
    expect(gemalt).toBeGreaterThan(0);
  });
});

describe("Die Groesse haengt am Container, nicht am ersten Bild", () => {
  // Der Alltagsfall, der lange durchrutschte: die Ansicht steht schon, die
  // Notizen kommen erst danach vom Server. Beim ersten Rendern zeigt der Graph
  // den Leerhinweis — die Leinwand gibt es da noch gar nicht. Ein useEffect mit
  // leerer Abhaengigkeitsliste richtete den Groessenbeobachter genau in diesem
  // Moment ein, lief ins Leere und wurde nie wiederholt. Die Groesse blieb
  // danach fuer immer bei den Startwerten 800x500: die Leinwand wurde klein
  // gezeichnet und vom Browser hochgezogen (daher der weiche, "aufgeblasene"
  // Eindruck), "Ansicht anpassen" rechnete mit dem falschen Fenster, und alles
  // rechts und unterhalb von 800x500 wurde gar nicht erst gemalt.
  const leinwandVon = (c: HTMLElement) =>
    c.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement | null;

  it("misst auch, wenn der Graph zuerst ohne Notizen erscheint", async () => {
    const view = render(<KnowledgeGraph memories={[]} onSelectMemory={vi.fn()} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(leinwandVon(view.container), "ohne Notizen gibt es keine Leinwand").toBeNull();

    view.rerender(<KnowledgeGraph memories={[note(), note(), note()]} onSelectMemory={vi.fn()} />);
    await bilder(10);

    const c = leinwandVon(view.container);
    expect(c, "nach dem Nachladen muss eine Leinwand da sein").not.toBeNull();
    const dpr = window.devicePixelRatio || 1;
    expect(c!.width).toBe(Math.round(1000 * dpr));
    expect(c!.height).toBe(Math.round(700 * dpr));
  });

  it("folgt einer spaeteren Groessenaenderung", async () => {
    const { container } = await zeichne([note(), note(), note()]);
    await bilder(6);
    const dpr = window.devicePixelRatio || 1;
    expect(leinwandVon(container)!.width).toBe(Math.round(1000 * dpr));

    await act(async () => { setzeGroesse(1280, 900); await new Promise((r) => setTimeout(r, 60)); });
    await bilder(6);

    expect(leinwandVon(container)!.width).toBe(Math.round(1280 * dpr));
    expect(leinwandVon(container)!.height).toBe(Math.round(900 * dpr));
  });

  it("nimmt eine Meldung ueber null Pixel nicht an", async () => {
    // Ein ausgeblendeter Container meldet 0x0. Das ist kein Mass, sondern die
    // Abwesenheit eines Masses — wer es uebernimmt, malt in ein Nichts und
    // kommt beim Wiedereinblenden nicht von selbst zurueck.
    const { container } = await zeichne([note(), note()]);
    await bilder(6);
    const dpr = window.devicePixelRatio || 1;

    await act(async () => { setzeGroesse(0, 0); await new Promise((r) => setTimeout(r, 60)); });
    await bilder(4);

    expect(leinwandVon(container)!.width).toBe(Math.round(1000 * dpr));
  });
});

describe("Die Kopfzeile zaehlt, was wirklich im Bild steht", () => {
  // Wer den Regler auf Januar 2023 zog, sah eine Handvoll Punkte — und daneben
  // unbeirrt die vollen Zahlen. Die Kopfzeile beschrieb die Datenbank, nicht
  // das Bild.
  const alt = Date.parse("2023-01-01");
  const neu = Date.parse("2026-01-01");

  it("nimmt beim Zurueckdrehen Knoten UND Kanten heraus", async () => {
    const { container } = await zeichne([
      note({ tags: ["t"], createdAt: alt, updatedAt: alt }),
      note({ tags: ["t"], createdAt: alt, updatedAt: alt }),
      note({ tags: ["t"], createdAt: neu, updatedAt: neu }),
      note({ tags: ["t"], createdAt: neu, updatedAt: neu }),
    ], { aehnlichkeit: true });
    expect(container.textContent).toMatch(/4 notes · 0 concepts · 0 links · \+6 similar/);

    const regler = container.querySelector('input[aria-label="Time of the knowledge shown"]') as HTMLInputElement;
        // Ziehen (input) und Loslassen (pointerup): der Filter wirkt beim Loslassen.
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    setter.call(regler, "50");
    regler.dispatchEvent(new Event("input", { bubbles: true }));
    await act(async () => {
      regler.dispatchEvent(new window.PointerEvent("pointerup", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 80));
    });

    // Nur die beiden alten Knoten — und damit genau die eine Kante zwischen ihnen.
    expect(container.textContent).toMatch(/2 notes · 0 concepts · 0 links · \+1 similar/);
  });

  it("ohne Schalter zählt nur, was jemand behauptet hat — nicht die Ähnlichkeit", async () => {
    const { container } = await zeichne([
      note({ tags: ["t"], createdAt: alt, updatedAt: alt }),
      note({ tags: ["t"], createdAt: alt, updatedAt: alt }),
      note({ tags: ["t"], createdAt: neu, updatedAt: neu }),
      note({ tags: ["t"], createdAt: neu, updatedAt: neu }),
    ]);
    expect(container.textContent).toMatch(/4 notes · 0 concepts · 0 links/);
    expect(container.textContent).not.toMatch(/similar/);
    const schalter = container.querySelector('button[aria-pressed]') as HTMLButtonElement;
    expect(schalter.getAttribute("aria-pressed")).toBe("false");
  });

  it("schreibt bei genau einem Knoten die Einzahl", async () => {
    const { container } = await zeichne([
      note({ tags: ["t"], createdAt: alt, updatedAt: alt }),
      note({ tags: ["t"], createdAt: neu, updatedAt: neu }),
      note({ tags: ["t"], createdAt: neu, updatedAt: neu }),
    ]);
    const regler = container.querySelector('input[aria-label="Time of the knowledge shown"]') as HTMLInputElement;
    // Ziehen (input) und Loslassen (pointerup): der Filter wirkt beim Loslassen.
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    setter.call(regler, "10");
    regler.dispatchEvent(new Event("input", { bubbles: true }));
    await act(async () => {
      regler.dispatchEvent(new window.PointerEvent("pointerup", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 80));
    });
    expect(container.textContent).toMatch(/1 note · 0 concepts · 0 links/);
  });
});

describe("Ein abgelegter Knoten bleibt liegen", () => {
  // Die Regel, um die es geht: was der Nutzer irgendwohin zieht, gehoert dorthin.
  // Zwischenzeitlich sprang ein losgelassener Knoten in die Physik zurueck. Das
  // war die Antwort auf einen echten Fehler — damals wurde beim ANFASSEN
  // angeheftet und nie geloest, sodass nach ein paar Griffen der halbe Graph
  // erstarrt war. Der Fehler lag aber nicht im Anheften, sondern im fehlenden
  // Weg zurueck. Beides wird hier geprueft.
  const kl = (typ: string, x: number, y: number) =>
    new (globalThis as unknown as { PointerEvent: typeof PointerEvent }).PointerEvent(typ, {
      bubbles: true, cancelable: true, clientX: x, clientY: y,
    });

  /** Mittelpunkt des ersten gezeichneten Kreises — der Knoten selbst. */
  function ersterKreis(rahmen: { op: string; args?: unknown[] }[]): { x: number; y: number } | null {
    const a = rahmen.find((r) => r.op === "arc");
    return a ? { x: Number(a.args?.[0]), y: Number(a.args?.[1]) } : null;
  }

  async function ziehe(c: HTMLCanvasElement, von: [number, number], nach: [number, number]) {
    await act(async () => {
      c.dispatchEvent(kl("pointerdown", von[0], von[1]));
      await new Promise((r) => setTimeout(r, 30));
      for (let i = 1; i <= 6; i++) {
        c.dispatchEvent(kl("pointermove", von[0] + ((nach[0] - von[0]) * i) / 6, von[1] + ((nach[1] - von[1]) * i) / 6));
        await new Promise((r) => setTimeout(r, 16));
      }
      c.dispatchEvent(kl("pointerup", nach[0], nach[1]));
      await new Promise((r) => setTimeout(r, 60));
    });
  }

  it("bleibt an der Stelle, an der er losgelassen wurde", async () => {
    // Ein einzelner Knoten: die Schwerkraft zoege ihn zur Mitte zurueck. Bleibt
    // er, wo er abgelegt wurde, haelt das Anheften.
    const { container } = await zeichne([note()]);
    await bilder();
    const c = container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    await ziehe(c, [500, 350], [640, 260]);

    leinwand.leeren();
    await bilder(4);
    const gleichNach = ersterKreis(leinwand.letzterRahmen());
    expect(gleichNach, "der Knoten muss gezeichnet werden").not.toBeNull();

    await bilder(40);
    leinwand.leeren();
    await bilder(4);
    const spaeter = ersterKreis(leinwand.letzterRahmen());
    expect(spaeter).not.toBeNull();
    expect(Math.hypot(spaeter!.x - gleichNach!.x, spaeter!.y - gleichNach!.y)).toBeLessThan(0.5);
  });

  it("nennt die Zahl der angehefteten Knoten und bietet an, sie zu loesen", async () => {
    // Eine einzelne Notiz liegt nach dem Einpassen sicher in der Mitte — bei
    // dreien traefe die Geste unter Umstaenden gar keinen Knoten, und der Test
    // wuerde nur beweisen, dass Nichts nichts anheftet.
    const { container } = await zeichne([note()]);
    await bilder();
    const c = container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    expect(container.textContent).not.toMatch(/Release \d+ pinned/);

    await ziehe(c, [500, 350], [640, 260]);
    expect(container.textContent).toMatch(/Release 1 pinned/);

    const knopf = [...container.querySelectorAll("button")].find((b) => /Release \d+ pinned/.test(b.textContent ?? ""))!;
    await act(async () => { knopf.click(); await new Promise((r) => setTimeout(r, 60)); });
    expect(container.textContent).not.toMatch(/Release \d+ pinned/);
  });

  it("heftet einen blossen Klick nicht an", async () => {
    // Wer einen Knoten nur antippt — etwa um ihn anzusehen — will ihn nicht
    // festnageln. Ohne diese Unterscheidung waere nach kurzem Stoebern der
    // halbe Graph erstarrt, und genau das war der alte Fehler.
    const { container } = await zeichne([note()]);
    await bilder();
    const c = container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    await act(async () => {
      c.dispatchEvent(kl("pointerdown", 500, 350));
      await new Promise((r) => setTimeout(r, 30));
      c.dispatchEvent(kl("pointerup", 501, 351)); // ein Bildpunkt Wackeln
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(container.textContent).not.toMatch(/Release \d+ pinned/);
  });
});


describe("Ausgegraute Knoten kosten nicht mehr als sichtbare", () => {
  // Die Klage: "Bei der Zeit Suche im Graph … wenn ich das anfasse und mit
  // meiner Maus bewege spinnt es rum … das Bild flackert."
  //
  // Ursache war die Buendelung sehr kleiner Knoten: sie lief nur nach FARBE,
  // und alles Ausgegraute fiel heraus. Genau dort ist aber fast alles
  // ausgegraut — der Zeitregler blendet die Zukunft als Geist aus, und ein
  // ueberfahrener Knoten dimmt den ganzen Rest. Gemessen an 3148 Notizen kippte
  // ein Bild von 6258 gebuendelten Rechtecken auf ueber 6000 einzelne
  // Bildkopien. Jetzt wird nach Farbe UND Deckkraft gebuendelt.
  const alt = Date.parse("2023-01-01");
  const neu = Date.parse("2026-01-01");

  it("malt Geister gebuendelt, nicht einzeln", async () => {
    const ms = [
      ...Array.from({ length: 30 }, () => note({ tags: ["t"], createdAt: neu, updatedAt: neu })),
      ...Array.from({ length: 4 }, () => note({ tags: ["t"], createdAt: alt, updatedAt: alt })),
    ];
    const { container } = await zeichne(ms);
    const knopf = (t: string) => container.querySelector(`button[title="${t}"]`) as HTMLButtonElement;
    // Weit heraus, damit die Knoten in die Sammelzeichnung fallen.
    await act(async () => { for (let i = 0; i < 16; i++) knopf("Zoom out").click(); await new Promise((r) => setTimeout(r, 60)); });

    const regler = container.querySelector('input[aria-label="Time of the knowledge shown"]') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(regler, "20");
      regler.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 80));
    });

    leinwand.leeren();
    await bilder();
    const rahmen = leinwand.letzterRahmen();
    const gebuendelt = rahmen.filter((a) => a.op === "fillRect").length;
    const einzeln = rahmen.filter((a) => a.op === "drawImage").length;
    expect(gebuendelt, "die Geister muessen gebuendelt gemalt werden").toBeGreaterThan(20);
    expect(einzeln, "und nicht als einzelne Bildkopien").toBeLessThan(5);
  });

  it("malt auch beim Ueberfahren gebuendelt weiter", async () => {
    const ms = Array.from({ length: 30 }, () => note({ tags: ["t"] }));
    const { container } = await zeichne(ms);
    const knopf = (t: string) => container.querySelector(`button[title="${t}"]`) as HTMLButtonElement;
    await act(async () => { for (let i = 0; i < 16; i++) knopf("Zoom out").click(); await new Promise((r) => setTimeout(r, 60)); });

    const c = container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    await act(async () => {
      c.dispatchEvent(new (globalThis as unknown as { PointerEvent: typeof PointerEvent }).PointerEvent("pointermove", {
        bubbles: true, clientX: 500, clientY: 350,
      }));
      await new Promise((r) => setTimeout(r, 60));
    });
    leinwand.leeren();
    await bilder();
    const rahmen = leinwand.letzterRahmen();
    expect(rahmen.filter((a) => a.op === "drawImage").length).toBeLessThan(5);
  });
});


describe("Tastatursteuerung: der Graph ist ohne Maus erreichbar", () => {
  it("waehlt mit Pfeiltasten einen Knoten, Enter oeffnet ihn", async () => {
    const notizen = [note(), note(), note(), note(), note(), note()];
    const { container, onSelect } = await zeichne(notizen);
    const c = container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;

    fireEvent.keyDown(c, { key: "ArrowRight" });
    const gewaehlt = c.getAttribute("data-selection");
    expect(gewaehlt).not.toBe("");

    fireEvent.keyDown(c, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].id).toBe(gewaehlt);
  });

  it("bewegt die Auswahl in alle vier Richtungen und haelt sie im Bild", async () => {
    const notizen = [note(), note(), note(), note(), note(), note(), note(), note()];
    const { container } = await zeichne(notizen);
    const c = container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    for (const taste of ["ArrowRight", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"]) {
      fireEvent.keyDown(c, { key: taste });
      expect(c.getAttribute("data-selection")).not.toBe("");
    }
  });

  it("hebt Escape die Auswahl auf", async () => {
    const notizen = [note(), note(), note(), note(), note(), note()];
    const { container } = await zeichne(notizen);
    const c = container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    fireEvent.keyDown(c, { key: "ArrowRight" });
    expect(c.getAttribute("data-selection")).not.toBe("");
    fireEvent.keyDown(c, { key: "Escape" });
    expect(c.getAttribute("data-selection")).toBe("");
  });

  it("Enter ohne Auswahl tut nichts", async () => {
    const notizen = [note(), note(), note(), note(), note(), note()];
    const { container, onSelect } = await zeichne(notizen);
    const c = container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    fireEvent.keyDown(c, { key: "Enter" });
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("Zeitregler: der Daumen kaempft nicht gegen den Wert", () => {
  it("haelt die gezogene Position auf dem Raster und zeigt das Datum", async () => {
    const notizen = [
      note({ updatedAt: Date.parse("2024-02-10"), createdAt: Date.parse("2024-02-10") }),
      note({ updatedAt: Date.parse("2025-06-10"), createdAt: Date.parse("2025-06-10") }),
      note({ updatedAt: Date.parse("2026-08-10"), createdAt: Date.parse("2026-08-10") }),
    ];
    const { container } = await zeichne(notizen);
    const regler = container.querySelector('input[aria-label="Time of the knowledge shown"]') as HTMLInputElement;
    expect(regler).toBeTruthy();
    expect(regler.value).toBe("100");

    fireEvent.change(regler, { target: { value: "99.5" } });
    // GLITCH-Regression: der Wert darf nicht zur "Now"-Position (100) zurueckspringen.
    expect(regler.value).toBe("99.5");
    expect(container.textContent).not.toMatch(/>\s*Now\s*</);
    // Datumsgenau seit der Umstellung: Tag + kurzer Monat + Jahr.
    expect(container.textContent).toMatch(/\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}/);

    fireEvent.change(regler, { target: { value: "50" } });
    expect(regler.value).toBe("50");

    fireEvent.change(regler, { target: { value: "100" } });
    expect(container.textContent).toMatch(/Now/);
  });
});

describe("Im Baum steht die Hierarchie hinter dem Inhalt", () => {
  // Die Aufnahme vom 6.10. (docs/screenshots/04-dendrogram.png) zeigt eine
  // doppelte Spalte: „elena weiss — tax advisor" (Etikett des Entitätsknotens)
  // direkt neben „Elena Weiss — tax advisor" (Titel der Notiz). Zwei Ursachen:
  // 1) ein Entitätsknoten mit genau einer Notiz wiederholt deren Titel,
  // 2) die Struktur-Etiketten liefen mit derselben Schrift und Farbe wie der
  //    Inhalt und waren deshalb nicht als Gerüst zu lesen.

  /** Ein Etikett eines Bildes: Text, Weltkoordinaten, Farbe, Schriftgrad. */
  interface Etikett { text: string; x: number; y: number; farbe: string; groesse: number }

  /** Der Weltbereich, der nach einer Transformation im Bild liegt. */
  interface Ausschnitt { x0: number; y0: number; x1: number; y1: number }

  async function inDenBaum(memories: Memory[]) {
    const { container } = await zeichne(memories);
    const knopf = container.querySelector('button[title^="Dendrogram"]') as HTMLButtonElement;
    expect(knopf, "Der Baumknopf fehlt").not.toBeNull();
    await act(async () => { fireEvent.click(knopf); });
    return container;
  }

  /** Das ERSTE Bild nach dem Wechsel: Knoten, die schon auf ihrer Zielstelle
   *  stehen (die Strukturknoten werden dort erzeugt), und der Welt-Ausschnitt. */
  async function erstesBild(breite = 1000, hoehe = 700) {
    leinwand.leeren();
    await bilder(1);
    const rahmen = leinwand.letzterRahmen();
    let tx = 0, ty = 0, k = 1;
    for (const a of rahmen) {
      if (a.op === "translate") { tx = Number(a.args[0]); ty = Number(a.args[1]); }
      if (a.op === "scale") { k = Number(a.args[0]); break; }
    }
    const knoten = rahmen
      .filter((a) => a.op === "arc")
      .map((a) => ({ x: Number(a.args[0]), y: Number(a.args[1]) }));
    const ausschnitt: Ausschnitt = {
      x0: -tx / k, y0: -ty / k, x1: (breite - tx) / k, y1: (hoehe - ty) / k,
    };
    return { knoten, ausschnitt };
  }

  /** Etiketten des letzten Bildes, nachdem der Gleiter zur Ruhe gekommen ist. */
  async function ruhigeEtiketten(): Promise<Etikett[]> {
    leinwand.leeren();
    await bilder(20);
    let farbe = "";
    let groesse = 0;
    const texte: Etikett[] = [];
    for (const a of leinwand.letzterRahmen()) {
      if (a.op === "set:fillStyle") farbe = String(a.args[0]);
      if (a.op === "set:font") {
        const treffer = /(\d+(?:\.\d+)?)px/.exec(String(a.args[0]));
        if (treffer) groesse = Number(treffer[1]);
      }
      if (a.op === "fillText") {
        const t = String(a.args[0] ?? "");
        if (t.trim()) texte.push({ text: t, x: Number(a.args[1]), y: Number(a.args[2]), farbe, groesse });
      }
    }
    return texte;
  }

  const normal = (t: string) => t.toLowerCase().replace(/[^a-z0-9äöüß&]/g, "");

  it("passt den Ausschnitt sofort, nicht erst nach dem Gleiten", async () => {
    const a = note({ title: "Elena Weiss — tax advisor", tags: ["people"] });
    const b = note({ title: "Falk & Sons — client profile", tags: ["client"] });
    const c = note({ title: "Hourly rate 2025", tags: ["pricing"] });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: [],
      memoriesByEntity: { "elena weiss": [a.id], "falk & sons": [b.id], "hourly rate 2025": [c.id] },
    }), { status: 200 })));
    await inDenBaum([a, b, c]);

    const { knoten, ausschnitt } = await erstesBild();
    // Strukturknoten stehen im Baum von Anfang an auf ihrer Zielstelle — wenn
    // der Baum rechts aus dem Bild läuft, steht dort nur Stamm und ein Typ.
    // Vor dem sofortigen Fit war das Fenster das alte Kraftfeld: x1 = 120.
    expect(knoten.length, "Es wurden keine Knoten gemalt").toBeGreaterThan(0);
    for (const n of knoten) {
      const ausser = n.x < ausschnitt.x0 || n.x > ausschnitt.x1 || n.y < ausschnitt.y0 || n.y > ausschnitt.y1;
      expect(ausser, `Knoten ${n.x},${n.y} liegt ausserhalb ${JSON.stringify(ausschnitt)}`).toBe(false);
    }
  });

  it("steht derselbe Name nicht zweimal", async () => {
    // „hourly rate 2025" ist ein Konzept (zwei Notizen) UND der Titel einer von
    // ihnen — genau der Fall aus der Aufnahme. Die eine Notiz unter
    // „elena weiss — tax advisor" ist dagegen kein Konzept mehr, seit Baum und
    // Feld dieselbe Schwelle kennen.
    const a = note({ title: "Elena Weiss — tax advisor", tags: ["people"] });
    const c = note({ title: "Hourly rate 2025", tags: ["pricing"] });
    const d = note({ title: "Hourly rate 2024", tags: ["pricing"] });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: [],
      memoriesByEntity: {
        "elena weiss — tax advisor": [a.id],
        "hourly rate 2025": [c.id, d.id],
      },
    }), { status: 200 })));
    await inDenBaum([a, c, d]);

    const texte = (await ruhigeEtiketten()).map((e) => normal(e.text));
    expect(texte, "das Konzept fehlt — die Ebene wurde ganz weggeräumt").toContain("hourlyrate2025");
    const dubletten = texte.filter((t, i) => texte.indexOf(t) !== i);
    expect(dubletten, `zweimal gemalt: ${JSON.stringify(texte)}`).toEqual([]);
  });

  it("behält ein Knoten mit mehreren Notizen seinen Namen", async () => {
    // Der Gegenfall: hier trägt der Entitätsknoten Information, die keine
    // einzelne Notiz hat — er darf dem Aufräumen nicht zum Opfer fallen.
    const a = note({ id: "q1", title: "Q1 call with Elena", tags: ["meeting"] });
    const b = note({ id: "q2", title: "Q2 call with Elena", tags: ["meeting"] });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: [{ source: "elena weiss", target: "q1", relation: "mentions", memoryId: a.id }],
      memoriesByEntity: { "elena weiss": ["q1", "q2"] },
    }), { status: 200 })));
    await inDenBaum([a, b]);

    const texte = (await ruhigeEtiketten()).map((e) => e.text);
    expect(texte).toContain("elena weiss");
    expect(texte).toContain("Q1 call with Elena");
    expect(texte).toContain("Q2 call with Elena");
  });

  it("hält einen langen Ebenennamen in seiner Spalte", async () => {
    // Zwischen zwei Ebenen liegen 190 Welteinheiten; ein Zeichen misst rund 6.
    // Ein zentrierter Notiztitel von 26 Zeichen ragt 78 Einheiten nach links in
    // seine Spalte — das Gerüst darf ihm nicht entgegenlaufen, sonst stehen zwei
    // Namen in einer Zeile und niemand weiss, welcher die Ebene meint.
    const a = note({ id: "k1", title: "Kestrel board meeting", tags: ["meeting"] });
    const b = note({ id: "k2", title: "Kestrel quarterly review", tags: ["meeting"] });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: [],
      memoriesByEntity: { "kestrel software — client onboarding checklist": ["k1", "k2"] },
    }), { status: 200 })));
    await inDenBaum([a, b]);

    const texte = await ruhigeEtiketten();
    const geruest = texte.filter((e) => e.text.toLowerCase().startsWith("kestrel software"));
    expect(geruest.length, "Der Ebenenname wurde gar nicht gemalt").toBe(1);
    expect(geruest[0]!.text.length, geruest[0]!.text).toBeLessThanOrEqual(17);
    expect(geruest[0]!.text).toMatch(/…$/);
  });

  it("tritt die Hierarchie hinter die Notiztitel zurück", async () => {
    const a = note({ id: "q1", title: "Q1 call with Elena", tags: ["meeting"] });
    const b = note({ id: "q2", title: "Q2 call with Elena", tags: ["meeting"] });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: [],
      memoriesByEntity: { "elena weiss": ["q1", "q2"] },
    }), { status: 200 })));
    await inDenBaum([a, b]);

    const texte = await ruhigeEtiketten();
    const geruest = texte.find((e) => e.text === "elena weiss");
    const inhalt = texte.find((e) => e.text === "Q1 call with Elena");
    expect(geruest, "Der Entitätsknoten wurde nicht gemalt").toBeDefined();
    expect(inhalt, "Der Notiztitel wurde nicht gemalt").toBeDefined();
    // Gedämpfte Farbe (--text-2) und kleiner als der Inhalt — das Gerüst soll
    // Gerüst bleiben, sonst liest sich der Baum wie eine Liste doppelter Namen.
    const stil = document.documentElement.style;
    expect(geruest!.farbe, "Gerüst steht nicht auf --text-2").toBe(stil.getPropertyValue("--text-2").trim());
    expect(inhalt!.farbe, "Notiz nicht auf --text-1").toBe(stil.getPropertyValue("--text-1").trim());
    expect(geruest!.groesse).toBeLessThan(inhalt!.groesse);
  });
});

describe("Ein Klick auf ein Begriff öffnet sein Dossier", () => {
  // Ein Konzept ist kein Blatt, das man aufblättert — es ist eine Person, eine
  // Firma, ein Thema. Was man darüber weiß, steht im Dossier. Der kürzeste Weg
  // dorthin führt über den Punkt im Bild.

  const kl = (typ: string, x: number, y: number) =>
    new (globalThis as unknown as { PointerEvent: typeof PointerEvent }).PointerEvent(typ, {
      bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1,
    });

  async function klickeKnoten(container: HTMLElement, suche: (t: string) => boolean) {
    const c = container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    const rahmen = leinwand.letzterRahmen();
    let tx = 0, ty = 0, k = 1;
    for (const a of rahmen) {
      if (a.op === "translate") { tx = Number(a.args[0]); ty = Number(a.args[1]); }
      if (a.op === "scale") { k = Number(a.args[0]); break; }
    }
    const texte = rahmen.filter((a) => a.op === "fillText").map((a) => ({ text: String(a.args[0]), x: Number(a.args[1]), y: Number(a.args[2]) }));
    const knoten = rahmen.filter((a) => a.op === "arc").map((a) => ({ x: Number(a.args[0]), y: Number(a.args[1]), r: Number(a.args[2]) }));
    const etikett = texte.find((t) => suche(t.text));
    expect(etikett, `Kein Etikett passt. Gemalt: ${JSON.stringify(texte.map((t) => t.text))}`).toBeDefined();
    const n = knoten.find((x) => Math.abs(x.x + x.r + 3 - etikett!.x) < 0.01 && Math.abs(x.y - etikett!.y) < 0.01);
    expect(n, "Kein Knoten trägt das Etikett").toBeDefined();
    const sx = n!.x * k + tx, sy = n!.y * k + ty;
    await act(async () => {
      c.setPointerCapture?.(1);
      c.dispatchEvent(kl("pointerdown", sx, sy));
      c.dispatchEvent(kl("pointerup", sx, sy));
      await new Promise((r) => setTimeout(r, 60));
    });
  }

  async function zeichneMitBegriff(onSelectConcept?: (name: string) => void) {
    const a = note({ id: "n1", title: "Quarterly filing draft", tags: ["client"] });
    const b = note({ id: "n2", title: "Filing deadline changed", tags: ["client"] });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: [],
      memoriesByEntity: { "nordwind logistics": ["n1", "n2"] },
    }), { status: 200 })));
    const onSelect = vi.fn();
    const view = render(
      <KnowledgeGraph memories={[a, b]} onSelectMemory={onSelect} onSelectConcept={onSelectConcept} />
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
    await bilder(12);
    return { ...view, onSelect };
  }

  it("nennt der Fläche das Begriff beim Klick", async () => {
    const gewaehlt = vi.fn();
    const { container } = await zeichneMitBegriff(gewaehlt);
    await klickeKnoten(container, (t) => t.startsWith("nordwind logisti"));
    expect(gewaehlt, "Der Klick aufs Begriff kam nicht an.").not.toHaveBeenCalledWith(undefined);
    expect(gewaehlt).toHaveBeenCalledWith("nordwind logistics");
  });

  it("öffnet per Tastatur dasselbe Dossier wie per Klick", async () => {
    // Der klick ist eine mausaktion. Wer mit den pfeiltasten reist, muss
    // dieselbe antwort bekommen — sonst ist das konzept für eine handvoll
    // menschen ein toter punkt und für den rest ein knopf.
    const gewaehlt = vi.fn();
    const { container } = await zeichneMitBegriff(gewaehlt);
    const c = container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;

    let auswahl = "";
    for (let i = 0; i < 40 && !auswahl.startsWith("__ent:"); i++) {
      fireEvent.keyDown(c, { key: "ArrowRight" });
      auswahl = c.getAttribute("data-selection") ?? "";
    }
    expect(auswahl, "Die Tastatur erreicht kein Konzept").toMatch(/^__ent:/);
    fireEvent.keyDown(c, { key: "Enter" });
    expect(gewaehlt).toHaveBeenCalledWith("nordwind logistics");
  });

  it("lässt eine Notiz beim Klick in Ruhe — die öffnet erst der Doppelklick", async () => {
    const gewaehlt = vi.fn();
    const { container, onSelect } = await zeichneMitBegriff(gewaehlt);
    // Ein Titel, kein Etikett rechts neben einem Knoten: Notizen sitzen unter
    // ihrem Knoten. Also über die Notizknoten selbst fahren — der mittlere
    // Treffer ist sicher, wenn man die Titelposition spiegelverkehrt nutzt.
    const c = container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    const rahmen = leinwand.letzterRahmen();
    let tx = 0, ty = 0, k = 1;
    for (const a of rahmen) {
      if (a.op === "translate") { tx = Number(a.args[0]); ty = Number(a.args[1]); }
      if (a.op === "scale") { k = Number(a.args[0]); break; }
    }
    const titel = rahmen
      .filter((a) => a.op === "fillText")
      .map((a) => ({ text: String(a.args[0]), x: Number(a.args[1]), y: Number(a.args[2]) }))
      .find((t) => t.text === "Filing deadline changed");
    expect(titel, "Kein Notiztitel wurde gemalt").toBeDefined();
    // Der Titel sitzt mit der Oberkante zwei Einheiten unter dem Knotenrand;
    // die Mitte des Etiketts liegt auf der Knoten-x-Achse.
    const sx = titel!.x * k + tx;
    const sy = (titel!.y - 9) * k + ty;
    await act(async () => {
      c.setPointerCapture?.(1);
      c.dispatchEvent(kl("pointerdown", sx, sy));
      c.dispatchEvent(kl("pointerup", sx, sy));
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(gewaehlt, "Ein Klick auf eine Notiz darf kein Dossier öffnen").not.toHaveBeenCalled();
    expect(onSelect, "Ein blosser Klick heftet nicht an und öffnet nicht").not.toHaveBeenCalled();
  });
});

describe("Ein gehaltener Begriff sagt, was er ist", () => {
  // Das Gerüst ist auf 16 Zeichen gekürzt — sonst läuft ein langer Ebenenname
  // in die Titelspalte hinein. Nur: wer über einem Begriff steht, will genau
  // dann den ganzen Namen sehen, und dazu, wie viele Notizen ihn tragen.

  const kl = (typ: string, x: number, y: number) =>
    new (globalThis as unknown as { PointerEvent: typeof PointerEvent }).PointerEvent(typ, {
      bubbles: true, cancelable: true, clientX: x, clientY: y,
    });

  /** Transformation und alle Etiketten des letzten Bildes. */
  function bildInfo() {
    const rahmen = leinwand.letzterRahmen();
    let tx = 0, ty = 0, k = 1;
    for (const a of rahmen) {
      if (a.op === "translate") { tx = Number(a.args[0]); ty = Number(a.args[1]); }
      if (a.op === "scale") { k = Number(a.args[0]); break; }
    }
    const texte = rahmen
      .filter((a) => a.op === "fillText")
      .map((a) => ({ text: String(a.args[0]), x: Number(a.args[1]), y: Number(a.args[2]) }));
    const knoten = rahmen
      .filter((a) => a.op === "arc")
      .map((a) => ({ x: Number(a.args[0]), y: Number(a.args[1]), r: Number(a.args[2]) }));
    return { tx, ty, k, texte, knoten };
  }

  it("zeigt den vollen Namen und die Zahl der Notizen", async () => {
    const langeEntitaet = "mandatsverwaltung nordwind logistics gmbh";
    const a = note({ id: "n1", title: "Quarterly filing draft", tags: ["client"] });
    const b = note({ id: "n2", title: "Filing deadline changed", tags: ["client"] });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: [],
      memoriesByEntity: { [langeEntitaet]: ["n1", "n2"] },
    }), { status: 200 })));

    const { container } = await zeichne([a, b]);
    await bilder(12);
    const c = container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;

    const vorher = bildInfo();
    const gekuerzt = vorher.texte.find((t) => t.text === `${langeEntitaet.slice(0, 16)}…`);
    expect(gekuerzt, `Das gekürzte Etikett fehlt. Gemalt: ${JSON.stringify(vorher.texte.map((t) => t.text))}`).toBeDefined();
    expect(vorher.texte.some((t) => t.text === langeEntitaet), "Der volle Name steht schon ohne Zeiger im Bild").toBe(false);

    // Der Knoten unter seinem eigenen Etikett — das sitzt rechts neben ihm.
    const knoten = vorher.knoten.find((n) => Math.abs(n.x + n.r + 3 - gekuerzt!.x) < 0.01 && Math.abs(n.y - gekuerzt!.y) < 0.01);
    expect(knoten, "Kein Knoten trägt das gekürzte Etikett").toBeDefined();
    const sx = knoten!.x * vorher.k + vorher.tx;
    const sy = knoten!.y * vorher.k + vorher.ty;

    await act(async () => {
      c.dispatchEvent(kl("pointermove", sx, sy));
      await new Promise((r) => setTimeout(r, 60));
    });

    const nachher = bildInfo();
    const detail = nachher.texte.find((t) => t.text.startsWith(langeEntitaet));
    expect(detail, `Nach dem Halten fehlt der volle Name. Gemalt: ${JSON.stringify(nachher.texte.map((t) => t.text))}`).toBeDefined();
    expect(detail!.text).toMatch(/· 2 notes$/);
  });

  it("zählt eine einzelne Notiz in der Einzahl", async () => {
    // „quay street lease" hat genau eine Notiz — es kommt ins Bild, weil eine
    // sichtbare Behauptung über es spricht. Und genau dort ist die Einzahl die
    // Antwort, die jemand lesen will.
    const a = note({ id: "s1", title: "Kickoff notes", tags: ["meeting"] });
    const b = note({ id: "s2", title: "Kickoff follow-up", tags: ["meeting"] });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: [{ source: "orion portal", target: "quay street lease", memoryId: "s1" }],
      memoriesByEntity: { "orion portal": ["s1", "s2"], "quay street lease": ["s1"] },
    }), { status: 200 })));

    const { container } = await zeichne([a, b]);
    await bilder(12);
    const c = container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;

    const info = bildInfo();
    const etikett = info.texte.find((t) => t.text.startsWith("quay street leas"));
    expect(etikett, `Das Begriffsetikett fehlt. Gemalt: ${JSON.stringify(info.texte.map((t) => t.text))}`).toBeDefined();
    const knoten = info.knoten.find((n) => Math.abs(n.x + n.r + 3 - etikett!.x) < 0.01 && Math.abs(n.y - etikett!.y) < 0.01);
    expect(knoten, "Kein Knoten trägt das Etikett").toBeDefined();

    await act(async () => {
      c.dispatchEvent(kl("pointermove", knoten!.x * info.k + info.tx, knoten!.y * info.k + info.ty));
      await new Promise((r) => setTimeout(r, 60));
    });
    const nachher = bildInfo().texte.find((t) => t.text.startsWith("quay street lease"));
    expect(nachher, `Nach dem Halten fehlt der volle Name. Gemalt: ${JSON.stringify(bildInfo().texte.map((t) => t.text))}`).toBeDefined();
    expect(nachher!.text).toMatch(/· 1 note$/);
  });
});

// P-4: Dichte, die sich zu erkennt. Ein Knoten mit drei Strichen im Bild,
// während die Wissensbasis sieben Nachbarn kennt, ist eine Luege durch
// Weglassen — also: Badge, wo Nachbarn fehlen, und eine Zeile, die sagt, was
// der Flaeche fehlt.
describe("Sichtbare Dichte: Badge und Kappungszeile", () => {
  /** Ein Badge ist der kleine Zahltext rechts neben einem Knoten: "+7". */
  function badgesImRahmen() {
    return leinwand.texteImRahmen().map((t) => t.text).filter((t) => /^\+\d+$/.test(t));
  }

  it("zählt die Notizen, die im Bild stehen, gegen den ganzen Bestand", async () => {
    const ms = Array.from({ length: 6 }, (_, i) => note({ id: `n${i}`, title: `Notiz ${i}`, tags: [] }));
    const { container } = await zeichne(ms);
    // Ohne Filter steht alles im Bild — dann gibt es nichts zu berichten.
    expect(container.textContent).not.toMatch(/Showing \d+ of \d+ notes/);

    const feld = container.querySelector('input[placeholder="Filter the graph…"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(feld, { target: { value: "Notiz 1" } });
      await new Promise((r) => setTimeout(r, 120));
    });
    expect(container.textContent, container.textContent ?? "").toMatch(/Showing 1 of 6 notes/);
  });

  it("behauptet nie mehr Notizen im Bild, als der Filter durchlässt", async () => {
    const ms = [
      ...Array.from({ length: 6 }, (_, i) => note({ id: `b${i}`, title: `Bericht ${i}`, tags: [] })),
      ...Array.from({ length: 3 }, (_, i) => note({ id: `p${i}`, title: `Protokoll ${i}`, tags: [] })),
    ];
    const { container } = await zeichne(ms);
    const feld = container.querySelector('input[placeholder="Filter the graph…"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(feld, { target: { value: "Bericht" } });
      await new Promise((r) => setTimeout(r, 120));
    });
    const treffer = /Showing (\d+) of (\d+) notes/.exec(container.textContent ?? "");
    expect(treffer, container.textContent ?? "").toBeTruthy();
    expect(Number(treffer![1]), "die Zeile zählt mehr, als der Filter durchlässt").toBe(6);
    expect(Number(treffer![2])).toBe(9);
  });

  it("sagt, dass die Wissensbasis mehr Behauptungen trägt als geliefert wurden", async () => {
    // Der Server kappt den Subgraphen bei 2 000 Kanten. Ohne die Zahl dahinter
    // wäre „3 links" eine Aussage über den Bestand — und falsch.
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: [{ source: "nordwind", target: "elena", relation: "betreut", memoryId: "n1" }],
      memoriesByEntity: { nordwind: ["n1"], elena: ["n2"] },
      bestand: { knoten: 41, kanten: 2431 },
    }), { status: 200 })));
    const a = note({ id: "n1", title: "Mandatsuebergabe", tags: [] });
    const b = note({ id: "n2", title: "Vertreterliste", tags: [] });

    const { container } = await zeichne([a, b]);
    await bilder(8);
    expect(container.textContent, container.textContent ?? "").toMatch(/Showing 1 of 2,431 claims/);
  });

  it("meldet keine Kappung, wenn der Server nichts übergab", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: [{ source: "nordwind", target: "elena", relation: "betreut", memoryId: "n1" }],
      memoriesByEntity: { nordwind: ["n1"], elena: ["n2"] },
      bestand: { knoten: 2, kanten: 1 },
    }), { status: 200 })));
    const a = note({ id: "n1", title: "Mandatsuebergabe", tags: [] });
    const b = note({ id: "n2", title: "Vertreterliste", tags: [] });

    const { container } = await zeichne([a, b]);
    await bilder(8);
    expect(container.textContent, container.textContent ?? "").not.toMatch(/Showing \d+ of [\d,]+ claims/);
  });

  it("setzt ein Badge auf einen Knoten, dem Nachbarn der Kantengrenze zum Opfer fielen", async () => {
    // 50 Notizen mit einem gemeinsamen Tag sind 1 225 Aehnlichkeitspaare — die
    // Grenze liegt bei 1 200. Was fällt, ist ein Nachbar weniger im Bild, und
    // genau das steht jetzt als Zahl am Knoten.
    const ms = Array.from({ length: 50 }, (_, i) => note({ id: `d${i}`, title: `Dichteste Notiz ${i}`, tags: ["alles"] }));
    const view = await zeichne(ms, { aehnlichkeit: true });
    await bilder(10);
    const badges = badgesImRahmen();
    expect(badges.length, "kein einziges Badge trotz Kappung").toBeGreaterThan(0);
    for (const b of badges) expect(Number(b.slice(1))).toBeGreaterThan(0);
    // Und die Zeile darunter sagt dieselbe Zahl — Bild und Text streiten nicht.
    expect(view.container.textContent, view.container.textContent ?? "").toMatch(/neighbours hidden behind badges/);
  });

  it("setzt kein Badge, wenn nichts gekappt wurde", async () => {
    const ms = Array.from({ length: 6 }, (_, i) => note({ id: `e${i}`, title: `Ruhige Notiz ${i}`, tags: [] }));
    const { container } = await zeichne(ms, { aehnlichkeit: true });
    await bilder(10);
    expect(badgesImRahmen()).toEqual([]);
    expect(container.textContent).not.toMatch(/neighbours hidden behind badges/);
  });

  it("rechnet die Badges nicht, während Aehnlichkeit aus ist", async () => {
    // Ohne Aehnlichkeitssuchlauf fällt nichts einer Grenze zum Opfer — ein Badge
    // über nicht existenten Nachbarn wäre eine Erfindung.
    const ms = Array.from({ length: 50 }, (_, i) => note({ id: `f${i}`, title: `Fünzigste Notiz ${i}`, tags: ["alles"] }));
    const { container } = await zeichne(ms);
    await bilder(10);
    expect(badgesImRahmen()).toEqual([]);
    expect(container.textContent).not.toMatch(/neighbours hidden behind badges/);
  });
});
// Relationstyp an die Linie, macht die Dicke aus dem Gewicht und legt einen
// Tooltip auf die Kante. Bei uns war der Typ bis hierhin vorhanden (store →
// /api/graph → Behauptung) und wurde in der Fläche auf [quelle, ziel] reduziert.
describe("Kanten-Etikett: der Typ steht an der Linie", () => {
  /** Transform, Linienzüge und Etiketten des letzten Bildes. */
  function rahmen() {
    const a = leinwand.letzterRahmen();
    let tx = 0, ty = 0, k = 1;
    for (const au of a) {
      if (au.op === "translate") { tx = Number(au.args[0]); ty = Number(au.args[1]); }
      if (au.op === "scale") { k = Number(au.args[0]); break; }
    }
    const texte = a
      .filter((au) => au.op === "fillText")
      .map((au) => String(au.args[0]));
    // Pfade nach Linienfarbe gruppieren: ein stroke() malt, was seit dem
    // letzten beginPath angesammelt wurde.
    const boeger: { farbe: string; breite: number; ax: number; ay: number; cx: number; cy: number; bx: number; by: number }[] = [];
    let farbe = "";
    let breite = 1;
    let pfad: { op: string; args: unknown[] }[] = [];
    for (const au of a) {
      if (au.op === "set:strokeStyle") farbe = String(au.args[0]);
      if (au.op === "set:lineWidth") breite = Number(au.args[0]);
      else if (au.op === "beginPath") pfad = [];
      else if (au.op === "moveTo" || au.op === "quadraticCurveTo") pfad.push(au);
      else if (au.op === "stroke") {
        let mx = 0, my = 0;
        for (const p of pfad) {
          if (p.op === "moveTo") { mx = Number(p.args[0]); my = Number(p.args[1]); }
          else boeger.push({
            farbe, breite, ax: mx, ay: my,
            cx: Number(p.args[0]), cy: Number(p.args[1]),
            bx: Number(p.args[2]), by: Number(p.args[3]),
          });
        }
        pfad = [];
      }
    }
    return { tx, ty, k, texte, boeger };
  }

  function begruendung(relations: unknown[], memoriesByEntity: Record<string, string[]>) {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ relations, memoriesByEntity }), { status: 200 })));
  }

  const paar = (relation: string | null) => ({
    relations: [{ source: "nordwind", target: "elena", relation, memoryId: "n1" }],
    byEntity: { nordwind: ["n1"], elena: ["n2"] },
  });

  it("nennt den Typ der Behauptung an der Linie", async () => {
    const f = paar("betreut");
    begruendung(f.relations, f.byEntity);
    const a = note({ id: "n1", title: "Mandatsuebergabe", tags: [] });
    const b = note({ id: "n2", title: "Vertreterliste", tags: [] });

    const view = await zeichne([a, b]);
    await richteRichtung(view, false);
    await bilder(12);
    const info = rahmen();
    expect(info.texte.filter((t) => t === "betreut").length, `Gemalt: ${JSON.stringify(info.texte)}`)
      .toBeGreaterThan(0);
  });

  it("lässt das Etikett weit draussen weg — und die Knotentitel bleiben", async () => {
    // Kein Nachbau von Etiketten-Teppich: was bei 40 % Zoom unlesbar wäre,
    // bleibt weg. Die Knotentitel dürfen darunter nicht leiden — sie waren
    // vorher da und müssen es bleiben.
    const f = paar("betreut");
    begruendung(f.relations, f.byEntity);
    const a = note({ id: "n1", title: "Mandatsuebergabe", tags: [] });
    const b = note({ id: "n2", title: "Vertreterliste", tags: [] });

    const view = await zeichne([a, b]);
    const { container } = view;
    await richteRichtung(view, false);
    await bilder(8);
    expect(rahmen().texte).toContain("betreut");

    // Erst wenn die Schwelle unterschritten ist, hoert das Etikett auf — nicht
    // vorher, weil die Titel langsamer werden.
    const raus = container.querySelector('button[title="Zoom out"]') as HTMLButtonElement;
    const zoomProzent = () =>
      Number((container.querySelector('[title="Current zoom"]')?.textContent ?? "9999").replace(/[^\d.]/g, ""));
    await act(async () => {
      for (let i = 0; i < 12 && zoomProzent() >= 85; i++) {
        raus.click();
        await new Promise((r) => setTimeout(r, 40));
      }
    });
    expect(zoomProzent(), "der Regler ist nicht unter die Etikettschwelle gekommen").toBeLessThan(90);
    await bilder(6);
    const weit = rahmen();
    expect(weit.texte, "Etikettenteppich beim Herauszoomen").not.toContain("betreut");
    expect(weit.texte).toContain("Mandatsuebergabe");
  });

  it("schreibt nichts an eine Linie, die keinen Typ nennt", async () => {
    // Die Erwaehnung fuehrt die Notiz zum Begriff und die Aehnlichkeit ist ein
    // Reim — beide behaupten nichts. Und „mentions" ist das Wort, das der Store
    // selbst fuer jeden Wiki-Link setzt: ein Etikett davon waere ein Etikett
    // fuer die Installationsleitung im Bild.
    begruendung(
      [
        { source: "nordwind", target: "elena", relation: "mentions", memoryId: "n1" },
        { source: "nordwind", target: "elena", relation: null, memoryId: "n1" },
      ],
      { nordwind: ["n1"], elena: ["n2"] }
    );
    const a = note({ id: "n1", title: "Mandatsuebergabe", tags: [] });
    const b = note({ id: "n2", title: "Vertreterliste", tags: [] });

    const view = await zeichne([a, b], { aehnlichkeit: true });
    await richteRichtung(view, false);
    await bilder(12);
    const erlaubt = [
      "Mandatsuebergabe", "Vertreterliste", "nordwind", "elena",
      // Der Glyph-Kanal malt in die Scheiben: ein Grossbuchstabe fuer die Art,
      // eine kleine Zahl fuer das, was ein Begriff traegt. Diese Frage gilt
      // einer Linie, also sind die Scheibenzeichen herausgerechnet.
      "F", "E", "H", "D",
    ];
    const fremde = rahmen().texte.filter(
      (t) => !erlaubt.includes(t) && !/^\d{1,3}$/.test(t)
    );
    expect(fremde, `Erfundene Etiketten: ${JSON.stringify(fremde)}`).toEqual([]);
  });

  it("deckelt die Kanten-Etiketten, statt zuzuschreiben", async () => {
    // 60 Behauptungen im Bild, aber nicht 60 Texte: was nicht passt, bleibt
    // weg, und das Raster entscheidet, nicht die Hoffnung.
    const n = 60;
    const ms = Array.from({ length: n }, (_, i) => note({ id: `b${i}`, title: `Notiz ${i}`, tags: [] }));
    const relations = Array.from({ length: n }, (_, i) => ({
      source: `alpha${i}`, target: `beta${i}`, relation: `rel${i}`, memoryId: `b${i}`,
    }));
    const byEntity: Record<string, string[]> = {};
    for (let i = 0; i < n; i++) { byEntity[`alpha${i}`] = [`b${i}`]; byEntity[`beta${i}`] = [`b${i}`]; }
    begruendung(relations, byEntity);
    setzeGroesse(2400, 1600);

    const view = await zeichne(ms);
    await richteRichtung(view, false);
    await bilder(10);
    const relTexte = rahmen().texte.filter((t) => /^rel\d+$/.test(t));
    expect(relTexte.length, "kein einziges Kanten-Etikett").toBeGreaterThan(0);
    expect(relTexte.length).toBeLessThanOrEqual(40);
  });

  it("zählt weitere Typen über demselben Paar dazu", async () => {
    const f = paar("betreut");
    begruendung([
      ...f.relations,
      { source: "nordwind", target: "elena", relation: "meldet an", memoryId: "n2" },
    ], f.byEntity);
    const a = note({ id: "n1", title: "Mandatsuebergabe", tags: [] });
    const b = note({ id: "n2", title: "Vertreterliste", tags: [] });

    const view = await zeichne([a, b]);
    await richteRichtung(view, false);
    await bilder(12);
    expect(rahmen().texte).toContain("betreut +1");
  });
});

describe("Kantendicke: was dahintersteht, wird sichtbar", () => {
  /**
   * Die Bildschirmbreite der Behauptungslinie (Richtung aus, dann wird sie
   * gestrichen).
   *
   * Zwei Messungen in einem Test fuehlen zwei Views — die ersten bleiben
   * mounted und malen weiter in dasselbe Zeichenbuch. Also vorher zurueckbauen.
   */
  async function breiteDerBehauptung(belege: number): Promise<number> {
    const relationen = Array.from({ length: belege }, () => ({
      source: "nordwind", target: "elena", relation: "betreut", memoryId: "n1",
    }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: relationen, memoriesByEntity: { nordwind: ["n1"], elena: ["n2"] },
    }), { status: 200 })));
    const a = note({ id: "n1", title: "Mandatsuebergabe", tags: [] });
    const b = note({ id: "n2", title: "Vertreterliste", tags: [] });

    const view = await zeichne([a, b]);
    await richteRichtung(view, false);
    await bilder(12);

    const rah = leinwand.letzterRahmen();
    let k = 1;
    for (const au of rah) { if (au.op === "scale") { k = Number(au.args[0]); break; } }
    const akzent = document.documentElement.style.getPropertyValue("--accent").trim();
    let farbe = "";
    let breite = "";
    let kurven = 0;
    let gefunden: number | null = null;
    for (const au of rah) {
      if (au.op === "set:strokeStyle") farbe = String(au.args[0]);
      else if (au.op === "set:lineWidth") breite = String(au.args[0]);
      else if (au.op === "beginPath") kurven = 0;
      else if (au.op === "quadraticCurveTo") kurven++;
      else if (au.op === "stroke") {
        // Der erste Akzentzug mit Bogen ist die Behauptung — die Erwähnung malt
        // in der Notizfarbe, die Hierarchie gibt es hier nicht.
        if (farbe === akzent && kurven > 0 && gefunden === null) gefunden = Number(breite) * k;
      }
    }
    view.unmount();
    expect(gefunden, "keine Behauptungslinie gefunden").not.toBeNull();
    return gefunden as number;
  }

  it("malt drei Belege dicker als einen", async () => {
    const einer = await breiteDerBehauptung(1);
    const drei = await breiteDerBehauptung(3);
    expect(drei, `${einer} px gegen ${drei} px`).toBeGreaterThan(einer);
  });

  it("hält die Erwähnung feiner als jede Behauptung", async () => {
    // Der Keil darf die Rangfolge nicht kippen: eine Notiz, die einen Begriff
    // erwähnt, bleibt die leiseste echte Kante im Bild.
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: [{ source: "nordwind", target: "elena", relation: "betreut", memoryId: "n1" }],
      memoriesByEntity: { nordwind: ["n1"], elena: ["n2"] },
    }), { status: 200 })));
    const a = note({ id: "n1", title: "Mandatsuebergabe", tags: [] });
    const b = note({ id: "n2", title: "Vertreterliste", tags: [] });
    const view = await zeichne([a, b]);
    await richteRichtung(view, false);
    await bilder(12);

    const akzent = document.documentElement.style.getPropertyValue("--accent").trim();
    const notiz = document.documentElement.style.getPropertyValue("--text-1").trim();
    let farbe = "";
    let breite = "";
    const striche: { farbe: string; breite: number }[] = [];
    for (const au of leinwand.letzterRahmen()) {
      if (au.op === "set:strokeStyle") farbe = String(au.args[0]);
      if (au.op === "set:lineWidth") breite = String(au.args[0]);
      if (au.op === "stroke") striche.push({ farbe, breite: Number(breite) });
    }
    const erwaehnung = striche.find((s) => s.farbe === notiz);
    const behauptung = striche.filter((s) => s.farbe === akzent);
    expect(erwaehnung, "keine Erwähnungslinie").toBeDefined();
    expect(behauptung.length, "keine Behauptungslinie").toBeGreaterThan(0);
    for (const kante of behauptung) {
      expect(erwaehnung!.breite, "Erwähnung ist nicht feiner als die Behauptung").toBeLessThan(kante.breite);
    }
  });

  it("gibt die Evidenz auch dem Keil mit", async () => {
    // Richtung an: die Behauptung wird gefüllt. Auch der Keil muss drei Belege
    // breiter malen als einen — sonst verschwindet das Gewicht mit dem Schalter.
    async function keilBreite(belege: number): Promise<number> {
      const relationen = Array.from({ length: belege }, () => ({
        source: "nordwind", target: "elena", relation: "betreut", memoryId: "n1",
      }));
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
        relations: relationen, memoriesByEntity: { nordwind: ["n1"], elena: ["n2"] },
      }), { status: 200 })));
      const a = note({ id: "n1", title: "Mandatsuebergabe", tags: [] });
      const b = note({ id: "n2", title: "Vertreterliste", tags: [] });
      const view = await zeichne([a, b]);
      await bilder(12);
      let k = 1;
      for (const au of leinwand.letzterRahmen()) { if (au.op === "scale") { k = Number(au.args[0]); break; } }
      const akzent = document.documentElement.style.getPropertyValue("--accent").trim();
      const keile = keileImRahmen(leinwand.letzterRahmen(), akzent);
      view.unmount();
      expect(keile.length, "kein Keil gemalt").toBeGreaterThan(0);
      return Math.max(...keile.map((x) => x.anfang)) * k;
    }
    const einer = await keilBreite(1);
    const drei = await keilBreite(3);
    expect(drei, `${einer} px gegen ${drei} px`).toBeGreaterThan(einer);
  });
});

describe("Kanten-Tooltip: der Zeiger fragt, die Kante antwortet", () => {
  const kl = (typ: string, x: number, y: number) =>
    new (globalThis as unknown as { PointerEvent: typeof PointerEvent }).PointerEvent(typ, {
      bubbles: true, cancelable: true, clientX: x, clientY: y,
    });

  function rahmenInfo() {
    const a = leinwand.letzterRahmen();
    let tx = 0, ty = 0, k = 1;
    for (const au of a) {
      if (au.op === "translate") { tx = Number(au.args[0]); ty = Number(au.args[1]); }
      if (au.op === "scale") { k = Number(au.args[0]); break; }
    }
    const akzent = document.documentElement.style.getPropertyValue("--accent").trim();
    const boeger: { farbe: string; ax: number; ay: number; cx: number; cy: number; bx: number; by: number }[] = [];
    let farbe = "";
    let pfad: { op: string; args: unknown[] }[] = [];
    for (const au of a) {
      if (au.op === "set:strokeStyle") farbe = String(au.args[0]);
      else if (au.op === "beginPath") pfad = [];
      else if (au.op === "moveTo" || au.op === "lineTo" || au.op === "quadraticCurveTo") pfad.push(au);
      else if (au.op === "stroke") {
        let mx = 0, my = 0;
        for (const p of pfad) {
          if (p.op === "moveTo") { mx = Number(p.args[0]); my = Number(p.args[1]); continue; }
          if (p.op === "lineTo") {
            // Eine gerade Kante: Die Mitte der Sehne ist ihre Mitte.
            const bx = Number(p.args[0]), by = Number(p.args[1]);
            boeger.push({ farbe, ax: mx, ay: my, cx: (mx + bx) / 2, cy: (my + by) / 2, bx, by });
            mx = bx; my = by;
          } else {
            boeger.push({
              farbe, ax: mx, ay: my,
              cx: Number(p.args[0]), cy: Number(p.args[1]),
              bx: Number(p.args[2]), by: Number(p.args[3]),
            });
            mx = Number(p.args[2]); my = Number(p.args[3]);
          }
        }
        pfad = [];
      }
    }
    return { tx, ty, k, boeger, akzent };
  }

  /** Der Zeiger steht auf der Mitte der Behauptungslinie. */
  async function aufBehauptung(c: HTMLCanvasElement) {
    const info = rahmenInfo();
    const b = info.boeger.find((x) => x.farbe === info.akzent);
    expect(b, "keine Behauptungslinie im Bild").toBeDefined();
    const x = (0.25 * b!.ax + 0.5 * b!.cx + 0.25 * b!.bx) * info.k + info.tx;
    const y = (0.25 * b!.ay + 0.5 * b!.cy + 0.25 * b!.by) * info.k + info.ty;
    await act(async () => {
      c.dispatchEvent(kl("pointermove", x, y));
      await new Promise((r) => setTimeout(r, 60));
    });
    return { x, y };
  }

  const tooltip = (container: HTMLElement) =>
    container.querySelector('[data-testid="graph-kante-tooltip"]');

  it("sagt, wer über wen was behauptet — und wie viel dahintersteht", async () => {
    const relationen = Array.from({ length: 3 }, () => ({
      source: "nordwind", target: "elena", relation: "betreut", memoryId: "n1",
    }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: relationen, memoriesByEntity: { nordwind: ["n1"], elena: ["n2"] },
    }), { status: 200 })));
    const a = note({ id: "n1", title: "Mandatsuebergabe", tags: [] });
    const b = note({ id: "n2", title: "Vertreterliste", tags: [] });

    const view = await zeichne([a, b]);
    await richteRichtung(view, false);
    await bilder(12);
    const c = view.container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    expect(tooltip(view.container), "steht der Tooltip schon ohne Zeiger?").toBeNull();

    await aufBehauptung(c);
    const kart = tooltip(view.container);
    expect(kart, "kein Tooltip auf der Kante").not.toBeNull();
    const text = kart!.textContent ?? "";
    expect(text).toMatch(/nordwind/);
    expect(text).toMatch(/elena/);
    expect(text).toMatch(/betreut/);
    expect(text).toMatch(/3 claims/);
  });

  it("nennt das Ende einer geplatzten Behauptung", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: [{
        source: "nordwind", target: "elena", relation: "betreut", memoryId: "n1",
        validFrom: Date.parse("2023-03-05"), validTo: Date.parse("2024-02-09"),
      }],
      memoriesByEntity: { nordwind: ["n1"], elena: ["n2"] },
    }), { status: 200 })));
    const a = note({ id: "n1", title: "Mandatsuebergabe", tags: [] });
    const b = note({ id: "n2", title: "Vertreterliste", tags: [] });

    const view = await zeichne([a, b]);
    await richteRichtung(view, false);
    await bilder(12);
    const c = view.container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    await aufBehauptung(c);
    const text = tooltip(view.container)?.textContent ?? "";
    expect(text, text).toMatch(/ended 9 Feb 2024/);
  });

  it("weist eine Aehnlichkeit als das aus, was sie ist", async () => {
    // Zwei Notizen, ein gemeinsames Wort: die Kante ist ein Reim, keine
    // Aussage. Ihr Tooltip darf keinen Typ erfinden, aber ihre Masse nennen.
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: [], memoriesByEntity: {},
    }), { status: 200 })));
    const a = note({ id: "n1", title: "Docker Swarm Upgrade", tags: ["infra"] });
    const b = note({ id: "n2", title: "Docker Swarm Kosten", tags: ["infra"] });

    const view = await zeichne([a, b], { aehnlichkeit: true });
    await bilder(12);
    const c = view.container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    const info = rahmenInfo();
    // Die Aehnlichkeit ist die einzige Kante hier, und sie ist nicht die
    // Akzentfarbe der Behauptung.
    const linie = info.boeger.find((x) => x.farbe !== info.akzent);
    expect(linie, `keine Aehnlichkeitskante gemalt: ${JSON.stringify(info.boeger)}`).toBeDefined();
    const x = (0.25 * linie!.ax + 0.5 * linie!.cx + 0.25 * linie!.bx) * info.k + info.tx;
    const y = (0.25 * linie!.ay + 0.5 * linie!.cy + 0.25 * linie!.by) * info.k + info.ty;
    await act(async () => {
      c.dispatchEvent(kl("pointermove", x, y));
      await new Promise((r) => setTimeout(r, 60));
    });
    const text = tooltip(view.container)?.textContent ?? "";
    expect(text.toLowerCase(), text).toContain("similar");
    expect(text).not.toMatch(/betreut|claims/);
  });

  it("steht die Karte innerhalb der Leinwand — nicht einen Bildrahmen lang daneben", async () => {
    // Gemessen 7.10. im echten Browser: der Inhalt war da, die Lage nicht. Der
    // erste Rahmen nach dem Hover laeuft, BEVOR React die Karte ins DOM baut —
    // eine Lage, die nur dort gesetzt wird, bleibt fuer immer auf ihrem
    // Wegwerfwert. Also: Lage mit dem Inhalt setzen, nachziehen im Bild.
    const relationen = [{ source: "nordwind", target: "elena", relation: "betreut", memoryId: "n1" }];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: relationen, memoriesByEntity: { nordwind: ["n1"], elena: ["n2"] },
    }), { status: 200 })));
    const a = note({ id: "n1", title: "Mandatsuebergabe", tags: [] });
    const b = note({ id: "n2", title: "Vertreterliste", tags: [] });

    const view = await zeichne([a, b]);
    await richteRichtung(view, false);
    await bilder(12);
    const c = view.container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    await aufBehauptung(c);
    const kart = view.container.querySelector('[data-testid="graph-kante-tooltip"]') as HTMLElement;
    expect(kart, "keine Karte").not.toBeNull();
    const treffer = /translate\((-?\d+(?:\.\d+)?)px, (-?\d+(?:\.\d+)?)px\)/.exec(kart.style.transform);
    expect(treffer, `ungesetzte Lage: ${kart.style.transform}`).toBeTruthy();
    const x = Number(treffer![1]);
    const y = Number(treffer![2]);
    // Die Leinwand ist 1000 x 700; die Karte ist 200 breit und rund 70 hoch.
    expect(x).toBeGreaterThanOrEqual(108);
    expect(x).toBeLessThanOrEqual(892);
    expect(y).toBeGreaterThanOrEqual(20);
    expect(y).toBeLessThanOrEqual(700 - 78);
  });

  it("zeigt im Baum, was eine Linie verbindet — ohne ihr einen Typ zu erfinden", async () => {
    // Der Baum malt die Hierarchie selbst: Wurzel → Typ → Notiz. Diese Linien
    // sagen nichts über zwei Begriffe aus, also steht an ihnen kein Etikett.
    // Die Karte darf aber zeigen, was die Linie ist.
    const a = note({ id: "t1", title: "Tagungspapier", tags: ["recht"] });
    const b = note({ id: "t2", title: "Nachtrag", tags: ["recht"] });
    const view = await zeichne([a, b]);
    // Richtung aus: im Baum malt die Hierarchie ihre Kanten sonst als Keile,
    // und diese Messung braucht Linien. Die Karte hängt nicht an der Richtung.
    await richteRichtung(view, false);
    const baum = view.container.querySelector('button[title^="Dendrogram"]') as HTMLButtonElement;
    expect(baum, "der Baum-Knopf fehlt").toBeTruthy();
    await act(async () => { baum.click(); await new Promise((r) => setTimeout(r, 300)); });
    await bilder(12);

    const c = view.container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    const info = rahmenInfo();
    // Eine Baumkante, deren Mitte fern von jedem Knoten liegt: im Baum stehen
    // die Ebenen dicht, und der Knoten gewinnt den Zeiger immer gegen die Kante.
    const kreise = leinwand.letzterRahmen().filter((au) => au.op === "arc").map((au) => ({ x: Number(au.args[0]), y: Number(au.args[1]) }));
    const segment = info.boeger
      .map((x) => ({ x: (x.ax + x.bx) / 2, y: (x.ay + x.by) / 2, farbe: x.farbe }))
      .find((m) => kreise.every((k) => Math.hypot(k.x - m.x, k.y - m.y) > 26));
    expect(segment, `keine freie Baumkante gefunden — Linien: ${info.boeger.length}, Kreise: ${kreise.length}, k: ${info.k}`).toBeDefined();

    await act(async () => {
      c.dispatchEvent(kl("pointermove", segment!.x * info.k + info.tx, segment!.y * info.k + info.ty));
      await new Promise((r) => setTimeout(r, 60));
    });
    const kart = tooltip(view.container);
    expect(kart, "keine Karte auf einer Baumkante").not.toBeNull();
    const text = kart!.textContent ?? "";
    expect(text.toLowerCase()).toContain("hierarchy");
    expect(text).not.toMatch(/betreut|claims/);
    // Und: an der Hierarchie steht kein Kanten-Etikett.
    expect(rahmenInfo().boeger.length).toBeGreaterThan(0);
    expect(leinwand.texteImRahmen().map((t) => t.text).filter((t) => /^(mentions|betreut|related)$/i.test(t))).toEqual([]);
  });

  it("bleibt still auf einem Knoten und verstummt, wenn der Zeiger geht", async () => {
    const relationen = [{ source: "nordwind", target: "elena", relation: "betreut", memoryId: "n1" }];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: relationen, memoriesByEntity: { nordwind: ["n1"], elena: ["n2"] },
    }), { status: 200 })));
    const a = note({ id: "n1", title: "Mandatsuebergabe", tags: [] });
    const b = note({ id: "n2", title: "Vertreterliste", tags: [] });

    const view = await zeichne([a, b]);
    await richteRichtung(view, false);
    await bilder(12);
    const c = view.container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;

    await aufBehauptung(c);
    expect(tooltip(view.container)).not.toBeNull();

    // Auf dem Begriff selbst gehört der Zeiger dem Knoten, nicht der Kante.
    const info = rahmenInfo();
    const knoten = leinwand.letzterRahmen().filter((au) => au.op === "arc");
    expect(knoten.length).toBeGreaterThan(0);
    const kreis = knoten[0];
    await act(async () => {
      c.dispatchEvent(kl("pointermove", Number(kreis.args[0]) * info.k + info.tx, Number(kreis.args[1]) * info.k + info.ty));
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(tooltip(view.container), "Knoten und Kante streiten um denselben Zeiger").toBeNull();

    await act(async () => {
      c.dispatchEvent(kl("pointerleave", 5, 5));
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(tooltip(view.container)).toBeNull();
  });
});


// P-5: Die Etiketten sind eine Wahl, nicht ein Schicksal. Cognee bietet ein
// Budget (Key / All / Off) mit Peek unter dem Zeiger; wer alles auf einmal
// malt, bekommt den Neo4j-Rückbau — also ist Key die Engine und All die
// ausdrückliche Entscheidung eines Menschen.
describe("Etikett-Budget: Key, All, Off und der Peek darunter", () => {
  const kl = (typ: string, x: number, y: number) =>
    new (globalThis as unknown as { PointerEvent: typeof PointerEvent }).PointerEvent(typ, {
      bubbles: true, cancelable: true, clientX: x, clientY: y,
    });

  /** Rahmen: Transformation, gemalte Texte mit ihrer Farbe, Knotenmittelpunkte. */
  function aufnahme() {
    const rahmen = leinwand.letzterRahmen();
    let tx = 0, ty = 0, k = 1, farbe = "";
    const texte: { text: string; farbe: string }[] = [];
    const knoten: { x: number; y: number }[] = [];
    for (const au of rahmen) {
      if (au.op === "translate" && tx === 0 && ty === 0) { tx = Number(au.args[0]); ty = Number(au.args[1]); }
      if (au.op === "scale" && k === 1) k = Number(au.args[0]);
      if (au.op === "set:fillStyle") farbe = String(au.args[0]);
      if (au.op === "fillText") texte.push({ text: String(au.args[0]), farbe });
      if (au.op === "arc") knoten.push({ x: Number(au.args[0]) * k + tx, y: Number(au.args[1]) * k + ty });
    }
    return { texte: texte.map((t) => t.text), texteMitFarbe: texte, knoten, tx, ty, k };
  }

  async function stelle(view: { container: HTMLElement }, name: "Key" | "All" | "Off") {
    const knopf = [...view.container.querySelectorAll("button[aria-pressed]")].find(
      (b) => b.textContent?.trim() === name
    ) as HTMLButtonElement | undefined;
    expect(knopf, `Der Etikett-Knopf „${name}" fehlt`).toBeTruthy();
    if (knopf!.getAttribute("aria-pressed") !== "true") {
      await act(async () => {
        fireEvent.click(knopf!);
        await new Promise((r) => setTimeout(r, 80));
      });
    }
  }

  it("bietet drei Stellungen und fängt mit Key an", async () => {
    const { container } = await zeichne([note(), note()]);
    const pressed = [...container.querySelectorAll("button[aria-pressed]")].filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent?.trim());
    for (const name of ["Key", "All", "Off"]) {
      expect([...container.querySelectorAll("button[aria-pressed]")].map((b) => b.textContent?.trim()), `Knopf „${name}" fehlt`).toContain(name);
    }
    expect(pressed, `gedrückt sind: ${pressed.join(", ")}`).toContain("Key");
  });

  it("lässt unter Key Etiketten im Gedränge weg", async () => {
    const ms = Array.from({ length: 60 }, (_, i) => note({ id: `k${i}`, title: `Ein ziemlich langer Titel ${i}` }));
    const view = await zeichne(ms);
    await stelle(view, "Key");
    leinwand.leeren();
    await bilder();
    const gemalt = aufnahme().texte.filter((t) => t.startsWith("Ein ziemlich")).length;
    expect(gemalt).toBeGreaterThan(0);
    expect(gemalt, "Key malt so viel wie möglich — das ist der Rückbau").toBeLessThan(ms.length);
  });

  it("gibt unter All jedes Etikett frei, das Key zurückhielt", async () => {
    const ms = Array.from({ length: 60 }, (_, i) => note({ id: `a${i}`, title: `Noch ein langer Titel ${i}` }));
    const view = await zeichne(ms);
    await stelle(view, "Key");
    leinwand.leeren();
    await bilder();
    const key = aufnahme().texte.filter((t) => t.startsWith("Noch ein")).length;

    await stelle(view, "All");
    leinwand.leeren();
    await bilder();
    const alles = aufnahme().texte.filter((t) => t.startsWith("Noch ein")).length;
    expect(alles, `Key ${key}, All ${alles}`).toBeGreaterThan(key);
    expect(alles).toBe(ms.length);
    expect(localStorage.getItem("kepta_graph_labels")).toBe("all");
  });

  it("lässt unter Off nichts stehen und holt den Titel unter dem Zeiger zurück", async () => {
    const ms = [note({ id: "o1", title: "Ortung im Hafen" }), note({ id: "o2", title: "Ortung an der Pier" })];
    const view = await zeichne(ms);
    await stelle(view, "Off");
    leinwand.leeren();
    await bilder();
    expect(aufnahme().texte.filter((t) => t.startsWith("Ortung"))).toEqual([]);

    const c = view.container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    const rahmen = aufnahme();
    const ziel = rahmen.knoten[0];
    await act(async () => {
      c.dispatchEvent(kl("pointermove", ziel.x, ziel.y));
      await new Promise((r) => setTimeout(r, 80));
    });
    leinwand.leeren();
    await bilder();
    expect(aufnahme().texte.filter((t) => t.startsWith("Ortung")).length, "der Peek fehlt").toBeGreaterThan(0);
  });

  it("stellt unter Off auch die Begriffsnamen ab und gibt sie im Peek zurück", async () => {
    // Ein Begriff ist ein Knoten wie jeder andere: wer die Beschriftung aus
    // stellt, meint alle — und wer über ihm steht, will gerade dann seinen Namen.
    const a = note({ id: "c1", title: "Kanalnotiz", tags: [] });
    const b = note({ id: "c2", title: "Werftnotiz", tags: [] });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: [],
      memoriesByEntity: { "nordwind kai": ["c1", "c2"] },
    }), { status: 200 })));
    const view = await zeichne([a, b]);
    await stelle(view, "Off");
    leinwand.leeren();
    await bilder();
    const rahmen = aufnahme();
    expect(rahmen.texte.filter((t) => t.startsWith("nordwind kai")), `gemalt: ${JSON.stringify(rahmen.texte)}`).toEqual([]);

    const c = view.container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    // Der Begriff ist der kleinste der drei Kreise — er trägt radius 8 aus dem
    // Gerüst, die Notizen hängen an ihrem Verbindungsgrad.
    const ziel = rahmen.knoten[rahmen.knoten.length - 1];
    await act(async () => {
      c.dispatchEvent(kl("pointermove", ziel.x, ziel.y));
      await new Promise((r) => setTimeout(r, 80));
    });
    leinwand.leeren();
    await bilder();
    expect(
      aufnahme().texte.some((t) => t.startsWith("nordwind kai")),
      "der Peek für den Begriff fehlt"
    ).toBe(true);
  });

  it("zeigt im Peek den ganzen Titel, nicht die Kürzung", async () => {
    const langer = "Ein wirklich sehr langer Titel, der nicht komplett in das Bild passt";
    const { container } = await zeichne([note({ id: "p1", title: langer })]);
    const c = container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    await bilder();
    const stehend = aufnahme();
    const gekuerzt = stehend.texte.find((t) => t.startsWith("Ein wirklich sehr langer"));
    expect(gekuerzt, `gemalt: ${JSON.stringify(stehend.texte)}`).toBeDefined();
    expect(gekuerzt!.endsWith("…")).toBe(true);

    const ziel = stehend.knoten[0];
    await act(async () => {
      c.dispatchEvent(kl("pointermove", ziel.x, ziel.y));
      await new Promise((r) => setTimeout(r, 80));
    });
    leinwand.leeren();
    await bilder();
    expect(aufnahme().texte).toContain(langer);
  });

  it("malt einen Platzhalter so, dass er einer aussieht", async () => {
    const mitTitel = note({ id: "t1", title: "Bericht aus der Kanzlei" });
    const ohneTitel = note({ id: "t2", title: "", content: "Rechnung 2024/07 liegt im Ordner" });
    const { container } = await zeichne([mitTitel, ohneTitel]);
    await bilder();
    const texte = aufnahme().texteMitFarbe;
    const echt = texte.find((t) => t.text.startsWith("Bericht aus"));
    const platz = texte.find((t) => t.text.startsWith("Rechnung 2024"));
    expect(echt, `gemalt: ${JSON.stringify(texte.map((t) => t.text))}`).toBeDefined();
    expect(platz, "der erste Satz fehlt als Platzhalter").toBeDefined();
    const stil = document.documentElement.style;
    expect(platz!.farbe, "ein Platzhalter darf nicht wie ein Titel aussehen").not.toBe(echt!.farbe);
    expect([stil.getPropertyValue("--text-3").trim(), stil.getPropertyValue("--text-2").trim()]).toContain(platz!.farbe);
    void container;
  });

  it("malt das Etikett neu, sobald die Notizliste einen anderen Inhalt trägt", async () => {
    // Ein Etikett wird nicht jeden Frame aus dem Inhalt gelesen, sondern einmal
    // pro Notiz gemerkt. Der Preis dafür wäre ein zu altes Etikett — und das
    // hier ist die Grenze, über die der Cache nicht gehen darf: neue Liste,
    // neuer Text.
    const alt = note({ id: "cf1", title: "", content: "Rechnung 2024/07 liegt im Ordner" });
    const view = await zeichne([alt]);
    await bilder();
    expect(aufnahme().texte.some((t) => t.startsWith("Rechnung")), `gemalt: ${aufnahme().texte.join(" | ")}`).toBe(true);

    const neu = note({ id: "cf1", title: "", content: "Dossiernummer 9182 ist eröffnet" });
    await act(async () => {
      view.rerender(<KnowledgeGraph memories={[neu]} onSelectMemory={view.onSelect} />);
    });
    leinwand.leeren();
    await bilder();
    const texte = aufnahme().texte;
    expect(texte.some((t) => t.startsWith("Dossiernummer")), `gemalt: ${texte.join(" | ")}`).toBe(true);
    expect(texte.some((t) => t.startsWith("Rechnung")), "ein altes Etikett steht noch").toBe(false);
  });
});

// P-6: ein Kanal, den das Auge auch ohne Farbe liest. Die vier Typfarben
// (blaugrau, mauve, gruen, braun) sind fuer fast jeden Farbsehenden schwer
// zu unterscheiden — ein Buchstabe in der Scheibe traegt dieselbe Auskunft
// auf einem anderen Kanal. Der Begriff traegt seine Zahl.
describe("Glyph im Knoten: Buchstabe fuer die Art, Zahl fuer den Begriff", () => {
  const zoomeHinein = async (container: HTMLElement, n = 24) => {
    await act(async () => {
      for (let i = 0; i < n; i++) (container.querySelector('button[title="Zoom in"]') as HTMLButtonElement).click();
      await new Promise((r) => setTimeout(r, 60));
    });
  };

  /** Alle Textzuege des letzten Bildes mit ihrer Fuellung. */
  function texteImBild() {
    let farbe = "";
    const out: { text: string; farbe: string }[] = [];
    for (const a of leinwand.letzterRahmen()) {
      if (a.op === "set:fillStyle") farbe = String(a.args[0]);
      if (a.op === "fillText") out.push({ text: String(a.args[0]), farbe });
    }
    return out;
  }

  /** Die Fuellungen, mit denen im letzten Bild eine Scheibe gefuellt wurde. */
  function scheibenFarben() {
    const rahmen = leinwand.letzterRahmen();
    const out: string[] = [];
    let farbe = "";
    for (let i = 0; i < rahmen.length; i++) {
      const a = rahmen[i]!;
      if (a.op === "set:fillStyle") farbe = String(a.args[0]);
      else if (a.op === "arc" && rahmen[i + 1]?.op === "fill") out.push(farbe);
    }
    return out;
  }

  it("setzt einer grossen Scheibe den Buchstaben ihrer Art in die Mitte", async () => {
    const { container } = await zeichne([note({ id: "g1", title: "Halbjahresbilanz", type: "semantic" })]);
    await zoomeHinein(container);
    leinwand.leeren();
    await bilder();
    const texte = texteImBild();
    expect(texte.some((t) => t.text === "F"), `gemalt: ${texte.map((t) => t.text).join(" | ")}`).toBe(true);
  });

  it("dreht die Helligkeit um, damit der Buchstabe auf der Fuellung steht", async () => {
    const { container } = await zeichne([note({ id: "g2", title: "Halbjahresbilanz", type: "semantic" })]);
    await zoomeHinein(container);
    leinwand.leeren();
    await bilder();
    const glyph = texteImBild().find((t) => t.text === "F");
    expect(glyph, "Der Buchstabe fehlt").toBeDefined();
    const farbe = scheibenFarben().find((f) => f !== glyph!.farbe);
    expect(farbe, "Keine Scheibenfuellung im Bild").toBeDefined();
    expect(istHell(glyph!.farbe), `Buchstabe ${glyph!.farbe} auf Scheibe ${farbe}`).not.toBe(istHell(farbe!));
  });

  it("malt den Buchstaben nicht, solange die Scheibe ein Sprite ist", async () => {
    const { container } = await zeichne([note({ id: "g3", title: "Halbjahresbilanz", type: "semantic" })]);
    await act(async () => {
      for (let i = 0; i < 6; i++) (container.querySelector('button[title="Zoom out"]') as HTMLButtonElement).click();
      await new Promise((r) => setTimeout(r, 60));
    });
    leinwand.leeren();
    await bilder();
    const rahmen = leinwand.letzterRahmen();
    expect(rahmen.filter((a) => a.op === "drawImage").length, "Kein Sprite-Bild gemalt").toBeGreaterThan(0);
    expect(texteImBild().some((t) => /^[FEHD]$/.test(t.text)), "Auf dem Sprite steht ein Buchstabe").toBe(false);
  });

  it("erfindet keinen Buchstaben fuer eine Art, die er nicht kennt", async () => {
    const { container } = await zeichne([note({ id: "g4", title: "Halbjahresbilanz", type: "andres" as Memory["type"] })]);
    await zoomeHinein(container);
    leinwand.leeren();
    await bilder();
    expect(texteImBild().some((t) => /^[FEHD]$/.test(t.text)), `gemalt: ${texteImBild().map((t) => t.text).join(" | ")}`).toBe(false);
  });

  it("gibt vier Arten vier verschiedene Buchstaben", () => {
    // Ein Kanal, der zwei Arten dasselbe Zeichen gibt, ist keine Auskunft. Die
    // Buchstaben werden aus den Woertern der Legende abgeleitet, also muss
    // diese Wache lesen, wer das Vokabular aendert.
    const typen = ["semantic", "episodic", "procedural", "reference"];
    const buchstaben = typen.map((t) => GLYPH_FUER_ART[t]);
    expect(new Set(buchstaben).size, buchstaben.join(", ")).toBe(4);
    for (const b of buchstaben) expect(/^[A-Z]$/.test(String(b)), `Buchstabe „${b}" ist keiner`).toBe(true);
  });

  it("hält die Eins aus dem Gesicht eines Begriffs heraus", async () => {
    // Ein Begriff mit genau einer Notiz sagt das mit der Zahl nicht — die Eins
    // füllt nur die Scheibe. Ab zwei Notizen trägt die Zahl eine Auskunft.
    const a = note({ id: "h1", title: "Bürgschaft Weber", content: "Für die [[Kestrel Software]]." });
    const b = note({ id: "h2", title: "Kestrel Follow-up", content: "Mit [[Kestrel Software]]." });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: [{ source: "kestrel software", target: "quay street lease", memoryId: "h1" }],
      memoriesByEntity: { "kestrel software": ["h1", "h2"], "quay street lease": ["h1"] },
    }), { status: 200 })));
    const { container } = await zeichne([a, b]);
    await zoomeHinein(container);
    leinwand.leeren();
    await bilder();
    const texte = texteImBild().map((t) => t.text);
    expect(texte.includes("2"), `gemalt: ${texte.join(" | ")}`).toBe(true);
    expect(texte.includes("1"), `gemalt: ${texte.join(" | ")}`).toBe(false);
  });

  it("setzt einem Begriff, der Notizen traegt, ihre Zahl in die Scheibe", async () => {
    const a = note({ id: "g5", title: "Quarterly filing draft", tags: ["client"] });
    const b = note({ id: "g6", title: "Filing deadline changed", tags: ["client"] });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: [],
      memoriesByEntity: { "nordwind logistics": ["g5", "g6"] },
    }), { status: 200 })));
    const { container } = await zeichne([a, b]);
    await zoomeHinein(container);
    leinwand.leeren();
    await bilder();
    const texte = texteImBild();
    expect(texte.some((t) => t.text === "2"), `gemalt: ${texte.map((t) => t.text).join(" | ")}`).toBe(true);
  });
});

describe("Die Legende erklärt den neuen Kanal", () => {
  it("sagt, was ein Buchstabe in der Scheibe und eine Zahl im Begriff bedeutet", async () => {
    const { container } = await zeichne([note()]);
    const text = container.textContent ?? "";
    expect(text, `Legende: ${text.slice(0, 400)}`).toContain("A letter in a node is its type");
    expect(text).toContain("A number in a concept is the notes");
    // Das Malzeichen ist im Kraftfeld ohne den Baum nicht zu erklären.
    expect(text).toContain("×");
  });
});

// P-7: Gruppen, die man zufaltet, und eine Zahl, die bleibt. Der Baum startet
// entfaltet — die Faltung ist eine Handlung, und sie muss im Bild stehen, auch
// wenn die Scheibe klein ist: sonst ist das Verschwinden der Kinder keine
// Auskunft, sondern ein Verlust.
describe("Faltung: ein Doppelklick faltet eine Gruppe und sagt es", () => {
  async function inDenBaum(ms: Memory[]) {
    const { container } = await zeichne(ms);
    const knopf = container.querySelector('button[title^="Dendrogram"]') as HTMLButtonElement;
    expect(knopf, "Der Baumknopf fehlt").not.toBeNull();
    await act(async () => { fireEvent.click(knopf); });
    await bilder(20);
    return container;
  }

  /** Texte des letzten Bildes und die Scheiben, die sie tragen. */
  function rahmen() {
    let tx = 0, ty = 0, k = 1, farbe = "";
    const texte: { text: string; x: number; y: number }[] = [];
    const scheiben: { x: number; y: number; r: number }[] = [];
    for (const a of leinwand.letzterRahmen()) {
      if (a.op === "translate" && tx === 0 && ty === 0) { tx = Number(a.args[0]); ty = Number(a.args[1]); }
      if (a.op === "scale" && k === 1) k = Number(a.args[0]);
      if (a.op === "set:fillStyle") farbe = String(a.args[0]);
      if (a.op === "fillText") texte.push({ text: String(a.args[0]), x: Number(a.args[1]), y: Number(a.args[2]) });
      if (a.op === "arc") scheiben.push({ x: Number(a.args[0]), y: Number(a.args[1]), r: Number(a.args[2]) });
    }
    void farbe;
    return { texte: texte.map((t) => t.text), texteOhne: texte, scheiben, tx, ty, k };
  }

  /** Der Mittelpunkt der Scheibe, deren Geruest-Etikett so liegt wie ueblich. */
  function scheibeVon(name: string) {
    const r = rahmen();
    const etikett = r.texteOhne.find((t) => t.text === name || t.text === `${name.slice(0, 16)}…`);
    expect(etikett, `Kein Etikett „${name}". Gemalt: ${r.texte.join(" | ")}`).toBeDefined();
    const treffer = r.scheiben.find((s) => Math.abs(s.x + s.r + 3 - etikett!.x) < 0.01 && Math.abs(s.y - etikett!.y) < 0.01);
    expect(treffer, `Keine Scheibe traegt „${name}"`).toBeDefined();
    return { x: treffer!.x * r.k + r.tx, y: treffer!.y * r.k + r.ty };
  }

  /**
   * Nur das dblclick-Ereignis selbst — ein fireEvent.doubleClick schickt
   * zusaendlich mousedown/mouseup und die malen eine Pfads-Bewegung, die im
   * Bild landet und die Etiketten aus dem Ausschnitt schiebt.
   */
  async function doppelklick(container: HTMLElement, bei: { x: number; y: number }) {
    const c = container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    await act(async () => {
      c.dispatchEvent(new MouseEvent("dblclick", {
        bubbles: true, cancelable: true, clientX: Math.round(bei.x), clientY: Math.round(bei.y),
      }));
      await new Promise((r) => setTimeout(r, 120));
    });
  }

  /**
   * Die Scheibe einer Notiz. Im Baum sind die Notizen oft zu klein für einen
   * gemalten Kreis — ihr Etikett sitzt aber bekanntermaessen direkt unter der
   * Mitte (radius 7 + 2), und die Greifweite von 12 Bildpunkten trifft sie auch
   * so. Ueber den Kreis zu gehen, haette den Test an die Detailstufe gekettet.
   */
  function scheibeVonNotiz(titel: string) {
    const r = rahmen();
    const etikett = r.texteOhne.find((t) => t.text === titel);
    expect(etikett, `Kein Etikett „${titel}". Gemalt: ${r.texte.join(" | ")}`).toBeDefined();
    return { x: etikett!.x * r.k + r.tx, y: (etikett!.y - 9) * r.k + r.ty };
  }

  /**
   * Das Bild nach einer Handlung. Der Baum ruht — nach einer Faltung fliegen
   * zwar Rahmen, aber einen leeren Rahmen zu lesen und „nichts gemalt" zu
   * melden, waere eine Messung der Geduld und nicht der Flaeche.
   */
  async function bildNach(soll: (texte: string[]) => boolean) {
    let letztes = rahmen();
    for (let i = 0; i < 25 && !soll(letztes.texte); i++) {
      await bilder(2);
      letztes = rahmen();
    }
    return letztes;
  }

  const notizen = () => [
    note({ id: "f1", title: "Uebergabe Nordwind", type: "semantic" }),
    note({ id: "f2", title: "Nachfass Nordwind", type: "semantic" }),
    note({ id: "f3", title: "Termin Kestrel", type: "episodic" }),
  ];
  const sichtbar = () => {
    const texte = rahmen().texte;
    return ["Uebergabe Nordwind", "Nachfass Nordwind", "Termin Kestrel"].filter((t) => texte.includes(t)).length;
  };

  it("startet entfaltet: jedes Kind steht, keine Malzahl im Bild", async () => {
    await inDenBaum(notizen());
    expect(sichtbar()).toBe(3);
    expect(rahmen().texte.some((t) => t.startsWith("×"))).toBe(false);
  });

  it("laesst die Kinder einer doppelt genommenen Gruppe weg und zaehlt sie weiter", async () => {
    const container = await inDenBaum(notizen());
    await doppelklick(container, scheibeVon("Facts"));
    const texte = (await bildNach((t) => t.includes("×2"))).texte;
    expect(texte).not.toContain("Uebergabe Nordwind");
    expect(texte).not.toContain("Nachfass Nordwind");
    expect(texte, `Termin fiel mit weg: ${texte.join(" | ")}`).toContain("Termin Kestrel");
    expect(texte, `keine Malzahl: ${texte.join(" | ")}`).toContain("×2");
    void container;
  });

  it("oeffnet die Gruppe beim zweiten Doppelklick wieder", async () => {
    const container = await inDenBaum(notizen());
    const bei = scheibeVon("Facts");
    await doppelklick(container, bei);
    await bildNach((t) => t.includes("×2"));
    await doppelklick(container, bei);
    const texte = (await bildNach((t) => t.includes("Uebergabe Nordwind"))).texte;
    expect(texte.filter((t) => ["Uebergabe Nordwind", "Nachfass Nordwind", "Termin Kestrel"].includes(t))).toHaveLength(3);
    expect(texte.some((t) => t.startsWith("×"))).toBe(false);
  });

  /** Die Kopfzeile der Flaeche: „N notes · M concepts · …". */
  function kopfZeile(container: HTMLElement) {
    const zeile = [...container.querySelectorAll("div.hud-label")].find((d) => /^\d+ notes?( ·|$)/.test((d.textContent ?? "").trim()));
    expect(zeile, "Die Kopfzeile fehlt").toBeDefined();
    return Number((zeile!.textContent ?? "").trim().match(/^(\d+)/)![1]!);
  }

  it("zaehlt in der Kopfzeile, was nach der Faltung im Bild steht", async () => {
    const container = await inDenBaum(notizen());
    expect(kopfZeile(container), "Kopfzeile vor der Faltung").toBe(3);
    await doppelklick(container, scheibeVon("Facts"));
    await bildNach((t) => t.includes("×2"));
    expect(kopfZeile(container), "Kopfzeile nach der Faltung").toBe(1);
    // Und die Bilanz des Ausschnitts sagt, warum eine fehlt.
    expect(container.textContent).toContain("Showing 1 of 3 notes");
  });

  it("faltet auch die tastatur: pfeil links auf die ebene, enter zu", async () => {
    const container = await inDenBaum(notizen());
    const c = container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    fireEvent.keyDown(c, { key: "ArrowDown" });
    for (let i = 0; i < 6 && !(c.getAttribute("data-selection") ?? "").startsWith("__typ:"); i++) {
      fireEvent.keyDown(c, { key: "ArrowLeft" });
    }
    expect((c.getAttribute("data-selection") ?? "").startsWith("__typ:"), `Auswahl: ${c.getAttribute("data-selection")}`).toBe(true);
    fireEvent.keyDown(c, { key: "Enter" });
    const texte = (await bildNach((t) => t.includes("×2"))).texte;
    expect(texte).not.toContain("Uebergabe Nordwind");
    expect(texte).toContain("Termin Kestrel");
  });

  it("faltet nicht, wer eine Notiz doppelt nimmt — die oeffnet sie", async () => {
    const container = await inDenBaum(notizen());
    const bei = scheibeVonNotiz("Uebergabe Nordwind");
    await doppelklick(container, bei);
    await bilder(6);
    const texte = rahmen().texte;
    expect(texte.filter((t) => ["Uebergabe Nordwind", "Nachfass Nordwind", "Termin Kestrel"].includes(t)), `gemalt: ${texte.join(" | ")}`).toHaveLength(3);
    expect(texte.some((t) => t.startsWith("×"))).toBe(false);
  });
});

// P-7, zweite Hälfte: die Faltung gilt über beide Ansichten. Der Griff sitzt im
// Baum (dort ist eine Gruppe exklusiv), das Kraftfeld hält sich daran — und zwar
// nur an den Notizen, die sonst niemand trägt. Ein Doppelklick auf ein Konzept
// wäre hier der falsche Griff: der erste Klick öffnet schon sein Dossier.
describe("Faltung im Kraftfeld: was der Baum gefaltet hat, fehlt auch hier", () => {
  function netz() {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: [],
      memoriesByEntity: {
        "nordwind logistics": ["e1", "e2", "e3", "e4"],
        "kestrel software": ["e4", "e5"],
      },
    }), { status: 200 })));
  }
  const notizen = () => [
    note({ id: "e1", title: "Rahmen Nordwind" }),
    note({ id: "e2", title: "Tranche Nordwind" }),
    note({ id: "e3", title: "Termin Nordwind" }),
    note({ id: "e4", title: "Bruecke Beide" }),
    note({ id: "e5", title: "Protokoll Kestrel" }),
  ];
  const EIGENE = ["Rahmen Nordwind", "Tranche Nordwind", "Termin Nordwind"];

  function rahmen() {
    let tx = 0, ty = 0, k = 1;
    const texte: { text: string; x: number; y: number }[] = [];
    const scheiben: { x: number; y: number; r: number }[] = [];
    for (const a of leinwand.letzterRahmen()) {
      if (a.op === "translate" && tx === 0 && ty === 0) { tx = Number(a.args[0]); ty = Number(a.args[1]); }
      if (a.op === "scale" && k === 1) k = Number(a.args[0]);
      if (a.op === "fillText") texte.push({ text: String(a.args[0]), x: Number(a.args[1]), y: Number(a.args[2]) });
      if (a.op === "arc") scheiben.push({ x: Number(a.args[0]), y: Number(a.args[1]), r: Number(a.args[2]) });
    }
    return { texte: texte.map((t) => t.text), texteOhne: texte, scheiben, tx, ty, k };
  }

  /** Der Schirmmittelpunkt der Scheibe, deren Gerüst-Etikett rechts neben ihr steht. */
  function scheibeVon(name: string) {
    const r = rahmen();
    const etikett = r.texteOhne.find((t) => t.text === name || t.text === `${name.slice(0, 16)}…`);
    expect(etikett, `Kein Etikett „${name}". Gemalt: ${r.texte.join(" | ")}`).toBeDefined();
    const treffer = r.scheiben.find((s) => Math.abs(s.y - etikett!.y) < 0.01 && Math.abs(s.x + s.r + 3 - etikett!.x) < 0.01);
    expect(treffer, `Keine Scheibe traegt „${name}"`).toBeDefined();
    return { x: treffer!.x * r.k + r.tx, y: treffer!.y * r.k + r.ty };
  }

  async function doppelklick(container: HTMLElement, bei: { x: number; y: number }) {
    const c = container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    await act(async () => {
      c.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, clientX: Math.round(bei.x), clientY: Math.round(bei.y) }));
      await new Promise((r) => setTimeout(r, 120));
    });
  }

  async function knopfKlick(container: HTMLElement, name: string) {
    const knopf = [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === name) as HTMLButtonElement;
    expect(knopf, `Der Knopf „${name}" fehlt`).toBeTruthy();
    await act(async () => { fireEvent.click(knopf!); await new Promise((r) => setTimeout(r, 200)); });
  }

  function kopf(container: HTMLElement) {
    const zeile = [...container.querySelectorAll("div.hud-label")].find((d) => /^\d+ notes?\b/.test((d.textContent ?? "").trim()));
    return (zeile?.textContent ?? "").trim();
  }

  async function imBaumFalten() {
    netz();
    const { container } = await zeichne(notizen());
    await bilder(12);
    await knopfKlick(container, "Tree");
    await bilder(20);
    await doppelklick(container, scheibeVon("nordwind logisti…"));
    for (let i = 0; i < 25; i++) {
      await bilder(2);
      if (rahmen().texte.some((t) => t.charCodeAt(0) === 215)) break;
    }
    return container;
  }

  it("verbirgt im kraftfeld nur, was der gefaltete begriff allein trägt", async () => {
    const container = await imBaumFalten();
    await knopfKlick(container, "Force");
    for (let i = 0; i < 25; i++) {
      await bilder(2);
      if (rahmen().texte.some((t) => t.charCodeAt(0) === 215)) break;
    }
    const texte = rahmen().texte;
    for (const eigene of EIGENE) expect(texte, `„${eigene}" steht noch im Bild: ${texte.join(" | ")}`).not.toContain(eigene);
    expect(texte, `die geteilte Notiz fiel mit weg: ${texte.join(" | ")}`).toContain("Bruecke Beide");
    // Die zweite überlebende Notiz wird an ihrem Titelbild gemessen, nicht am
    // Titel: das Belegungsraster entscheidet über Etiketten, und der Helfer hier
    // misst Etikettbreite in Weltmaß ohne die Schrumpfung der Schrift mit dem
    // Zoom — bei 4-fachem Zoom sind ihre Titel im Test rund viermal zu breit und
    // verdrängen einander, im Browser nicht. Was die Faltung zusagt, ist die
    // Zahl der Knoten im Bild: zwei Notizen und zwei Begriffe.
    expect(rahmen().scheiben, `Scheiben: ${JSON.stringify(rahmen().scheiben)}`).toHaveLength(4);
    expect(texte.some((t) => t.charCodeAt(0) === 215), `kein Malzeichen: ${texte.join(" | ")}`).toBe(true);
    expect(texte).toContain("×3");
  });

  it("zaehlt die verdeckten notizen aus Kopfzeile und Bilanzzeile", async () => {
    const container = await imBaumFalten();
    await knopfKlick(container, "Force");
    await bilder(8);
    expect(kopf(container), "Kopfzeile im Kraftfeld").toMatch(/^2 notes/);
    expect(container.textContent).toContain("Showing 2 of 5 notes");
  });

  it("gibt die notizen zurück, wenn die gruppe im baum wieder öffnet", async () => {
    const container = await imBaumFalten();
    await knopfKlick(container, "Force");
    await bilder(8);
    await knopfKlick(container, "Tree");
    await bilder(20);
    await doppelklick(container, scheibeVon("nordwind logisti…"));
    await knopfKlick(container, "Force");
    for (let i = 0; i < 25; i++) {
      await bilder(2);
      if (!rahmen().texte.some((t) => t.charCodeAt(0) === 215)) break;
    }
    // Nicht die Etiketten werden gezählt — das Raster lässt bei fünf Knoten
    // nicht jedes durch, und das wäre eine Messung des Gedränges, nicht der
    // Faltung. Gezählt wird, was die Fläche über sich selbst sagt.
    expect(rahmen().texte.some((t) => t.charCodeAt(0) === 215), "ein Malzeichen steht noch im Bild").toBe(false);
    expect(kopf(container), "Kopfzeile nach dem Aufklappen").toMatch(/^5 notes/);
    expect(container.textContent ?? "", "eine Bilanzzeile behauptet noch fehlende Notizen").not.toContain("Showing");
  });
});

// P-8: die Selbstbehauptung. „Nordwind Logistics zweifelt an Nordwind Logistics"
// stand bis hierhin im Bestand und verschwand lautlos. Sie ist die seltenste und
// die am leichtesten missverstandene Kante im Bild — also kommt sie hinter einen
// Schalter, und der Schalter steht aus.
describe("Selbstkanten: ein Schalter, eine Schlinge, kein Nachbarschaftsgewinn", () => {
  function selbstFix(rel = "zweifelt") {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: [{ source: "nordwind logistics", target: "nordwind logistics", relation: rel, memoryId: "s1" }],
      memoriesByEntity: { "nordwind logistics": ["s1", "s2"] },
    }), { status: 200 })));
  }
  const notizen = () => [
    note({ id: "s1", title: "Pruefung Nordwind" }),
    note({ id: "s2", title: "Nachtrag Nordwind" }),
  ];

  function bild() {
    let tx = 0, ty = 0, k = 1;
    const scheiben: { x: number; y: number; r: number }[] = [];
    for (const a of leinwand.letzterRahmen()) {
      if (a.op === "translate" && tx === 0 && ty === 0) { tx = Number(a.args[0]); ty = Number(a.args[1]); }
      if (a.op === "scale" && k === 1) k = Number(a.args[0]);
      if (a.op === "arc") scheiben.push({ x: Number(a.args[0]), y: Number(a.args[1]), r: Number(a.args[2]) });
    }
    return { scheiben, tx, ty, k };
  }

  async function schalter(container: HTMLElement, an: boolean) {
    const knopf = [...container.querySelectorAll("button[aria-pressed]")].find((b) => (b.textContent ?? "").trim() === "Self") as HTMLButtonElement | undefined;
    expect(knopf, "Der Selbstkanten-Schalter fehlt").toBeTruthy();
    if ((knopf!.getAttribute("aria-pressed") === "true") !== an) {
      await act(async () => { fireEvent.click(knopf!); await new Promise((r) => setTimeout(r, 200)); });
    }
    return knopf!.getAttribute("aria-pressed");
  }

  it("steht von Haus aus aus", async () => {
    selbstFix();
    const { container } = await zeichne(notizen());
    expect(await schalter(container, false)).toBe("false");
    expect(localStorage.getItem("kepta_graph_selbstkaanten")).toBeNull();
  });

  it("verschweigt die Selbstbehauptung nicht, sondern meldet sie", async () => {
    selbstFix();
    const { container } = await zeichne(notizen());
    await bilder(12);
    expect(container.textContent, container.textContent ?? "").toContain("1 self-claim hidden");
  });

  it("malt eine Schlinge mehr, wenn der schalter an geht — und keine zweite Kante", async () => {
    selbstFix();
    const { container } = await zeichne(notizen());
    await bilder(12);
    const aus = bild().scheiben.length;
    await schalter(container, true);
    await bilder(12);
    const an = bild().scheiben.length;
    expect(an, `Schlingen: aus ${aus}, an ${an}`).toBe(aus + 1);
    // Die Schlinge sitzt oben rechts über dem Begriff, nicht irgendwo im Feld.
    const begriff = bild().scheiben.find((s) => s.r > 0 && Math.abs(s.x - s.y) >= 0);
    expect(begriff).toBeDefined();
    // Und die Bilanz verstummt, weil nichts mehr fehlt.
    expect(container.textContent ?? "").not.toContain("self-claim hidden");
  });

  it("lässt die Knotengröße unangetastet — selbst behaupten ist kein Nachbar", async () => {
    selbstFix();
    const { container } = await zeichne(notizen());
    await bilder(14);
    const radienAus = bild().scheiben.map((s) => Math.round(s.r * 100)).sort();
    await schalter(container, true);
    await bilder(14);
    const mit = bild().scheiben.map((s) => Math.round(s.r * 100)).sort();
    // Die Schleife kommt als neuer Kreis dazu, keiner der bestehenden darf
    // wachsen: der Grad kennt sie nicht.
    expect(mit.length).toBe(radienAus.length + 1);
    for (const r of radienAus) expect(mit.filter((x) => x === r).length, `Radius ${r}`).toBeGreaterThan(0);
  });

  it("greift: auf der Schlinge öffnet sich die Kantkarte der Behauptung", async () => {
    selbstFix("zweifelt an sich");
    const { container } = await zeichne(notizen());
    await bilder(12);
    await schalter(container, true);
    // Die Physik muss zur Ruhe kommen: die Greifweite einer Schlinge ist in
    // Welteinheiten gerechnet, und ein Knoten, der noch wandert, zieht die
    // Schlinge unter dem Zeiger weg.
    await bilder(70);
    const b = bild();
    // Die Schlinge ist der Kreis, der nicht zu einer Scheibe gehört: ihr
    // Mittelpunkt liegt außerhalb aller Knotenscheiben.
    const schlinge = b.scheiben.find((s) => !b.scheiben.some((o) => o !== s && Math.hypot(s.x - o.x, s.y - o.y) < o.r));
    expect(schlinge, "keine Schlinge gefunden").toBeDefined();
    const c = container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    const k = b.k;
    // Die Fläche ruht selten völlig — also vier Punkte auf dem Ring, der erste
    // Treffer zählt. Welcher Punkt trifft, ist Sache der Geometrie, nicht des
    // Beweises: die Schlinge muss greifbar sein.
    const punkte: [number, number][] = [
      [schlinge!.x + schlinge!.r, schlinge!.y],
      [schlinge!.x - schlinge!.r, schlinge!.y],
      [schlinge!.x, schlinge!.y - schlinge!.r],
      [schlinge!.x, schlinge!.y + schlinge!.r],
    ];
    let karte: Element | null = null;
    for (const [wxp, wyp] of punkte) {
      const px = Math.round(wxp * k + b.tx), py = Math.round(wyp * k + b.ty);
      await act(async () => {
        c.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, cancelable: true, clientX: px, clientY: py, pointerId: 1 }));
        await new Promise((r) => setTimeout(r, 160));
      });
      karte = container.querySelector('[data-testid="graph-kante-tooltip"]');
      if (karte) break;
    }
    expect(karte, `die Kantkarte öffnet nicht auf der Schlinge — ${JSON.stringify(b.scheiben.map((x) => [Math.round(x.x), Math.round(x.y), Math.round(x.r)]))} bei k=${b.k}`).not.toBeNull();
    expect(karte!.textContent).toContain("zweifelt an sich");
    expect(karte!.textContent).toMatch(/1 claim/);
  });
});

// P-9: die dritte Ansicht. Cognee hat einen „Semantic"-Tab — Knoten stehen auf
// einer deterministischen Projektion ihrer Embeddings, mit einer sichtbaren
// Warnung, wenn die Kappung greift. Unsere Fläche hatte Feld und Baum.
//
// Was hier gemessen wird, ist nicht das Bild hübscher, sondern drei Verträge:
// dieselbe Wissensbasis muss dasselbe Bild ergeben, die Kappung muss laut sein,
// und keine Notiz darf schweigend fallen.
//
// KEIN DOWNGRADE: Das Kraftfeld bleibt die Ansicht, die startet, und es steht
// nach dem Abstecher exakt wieder dort, wo es war.
describe("Die semantische Ansicht steht auf den Vektoren", () => {
  /** Die Karte, wie der Server sie liefert: Plätze und eine ehrliche Bilanz. */
  function karteVon(
    punkte: { id: string; x: number; y: number }[],
    extra: Record<string, unknown> = {}
  ) {
    return {
      punkte,
      modell: "nomic-embed-text",
      getragen: punkte.length,
      gesamt: punkte.length,
      gekappt: 0,
      anteil: [0.71, 0.18],
      ...extra,
    };
  }

  /**
   * Ein Fetch, das nach URL unterscheidet, und die Liste der URLs, die wirklich
   * gefragt wurden — damit „nur beim Öffnen der Ansicht" eine Messung ist.
   */
  function semantikStub(karte: unknown, opts: { fehler?: boolean } = {}) {
    const aufrufe: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url);
      aufrufe.push(u);
      if (u.includes("/api/graph/semantik")) {
        if (opts.fehler) throw new TypeError("network down");
        return new Response(JSON.stringify(karte), { status: 200 });
      }
      return new Response(JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 });
    }));
    return aufrufe;
  }

  const drei = () => [
    note({ id: "s1", title: "Rahmen Nordwind" }),
    note({ id: "s2", title: "Tranche Kestrel" }),
    note({ id: "s3", title: "Protokoll Quay" }),
  ];
  const PUNKTE = [
    { id: "s1", x: -450, y: -300 },
    { id: "s2", x: 450, y: -300 },
    { id: "s3", x: 0, y: 450 },
  ];

  function knopf(container: HTMLElement, name: string) {
    const k = [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === name);
    expect(k, `Der Knopf „${name}" fehlt`).toBeTruthy();
    return k as HTMLButtonElement;
  }

  async function ansichtWechseln(container: HTMLElement, name: string) {
    await act(async () => {
      fireEvent.click(knopf(container, name));
      await new Promise((r) => setTimeout(r, 200));
    });
  }

  /**
   * Die Mittelpunkte aller gemalten Scheiben eines Rahmens, in Weltkoordinaten.
   *
   * Die Fläche malt einen Knoten auf einer von drei Stufen: ab Rechenstärke als
   * arc(), kleiner als Sprite per drawImage(), und ganz kleine gesammelt als
   * fillRect(). Alle drei tragen die Weltkoordinate — gesammelt wird die Menge,
   * nicht der Kanal, sonst hängt das Messen von der Zoomstufe ab.
   */
  function scheiben(): { x: number; y: number; r: number }[] {
    const out: { x: number; y: number; r: number }[] = [];
    for (const a of leinwand.letzterRahmen()) {
      if (a.op === "arc") {
        // arc(x, y, radius, …) — der Mittelpunkt steht direkt in der Liste.
        out.push({ x: Number(a.args[0]), y: Number(a.args[1]), r: Number(a.args[2]) });
      } else if (a.op === "drawImage") {
        // drawImage(bild, x, y, weite, hoehe) — eine Stelle weiter, weil das
        // Bild der erste Parameter ist.
        out.push({
          x: Number(a.args[1]) + Number(a.args[3]) / 2,
          y: Number(a.args[2]) + Number(a.args[4]) / 2,
          r: Number(a.args[3]) / 2,
        });
      } else if (a.op === "fillRect") {
        // fillRect(x, y, weite, hoehe) — die Sammelstufe für die kleinsten Knoten.
        out.push({
          x: Number(a.args[0]) + Number(a.args[2]) / 2,
          y: Number(a.args[1]) + Number(a.args[3]) / 2,
          r: Number(a.args[2]) / 2,
        });
      }
    }
    return out.sort((p, q) => p.x - q.x || p.y - q.y || p.r - q.r);
  }

  /** Größter Abstand, den zwei Aufnahmen derselben Menge trennt. */
  function abtrieb(a: { x: number; y: number }[], b: { x: number; y: number }[]): number {
    let groesster = 0;
    for (let i = 0; i < a.length; i++) {
      groesster = Math.max(groesster, Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y));
    }
    return groesster;
  }

  /**
   * Bis zwei aufeinanderfolgende Rahmen exakt dieselben Scheiben setzen.
   *
   * Das Kraftfeld kühlt über rund dreihundert Rahmen aus (ALPHA_DECAY 1,65 %
   * pro Rahmen bis ALPHA_MIN); so lange das läuft, wandert jede Aufnahme. Die
   * Projektion steht nach dem Gleiten exakt auf ihren Zielkoordinaten.
   */
  async function ruhig(max = 120): Promise<{ x: number; y: number; r: number }[]> {
    let letzte: { x: number; y: number; r: number }[] = [];
    for (let i = 0; i < max; i++) {
      await bilder(4);
      const jetzt = scheiben();
      if (jetzt.length > 0 && jetzt.length === letzte.length && abtrieb(letzte, jetzt) === 0) return jetzt;
      letzte = jetzt;
    }
    return letzte;
  }

  it("startet im Kraftfeld und fragt die semantische Karte erst beim Öffnen", async () => {
    const aufrufe = semantikStub(karteVon(PUNKTE));
    const { container } = await zeichne(drei());
    await bilder(8);
    expect(aufrufe.filter((u) => u.includes("/api/graph/semantik")), "die Karte wurde ungefragt geholt").toHaveLength(0);
    expect(container.textContent).toMatch(/stays where you drop it/);

    await ansichtWechseln(container, "Semantic");
    expect(aufrufe.filter((u) => u.includes("/api/graph/semantik"))).toHaveLength(1);
    expect(container.textContent).toMatch(/projection/i);
  });

  it("lässt das Kraftfeld unangetastet, wenn die Ansicht wieder schließt", async () => {
    semantikStub(karteVon(PUNKTE));
    const { container } = await zeichne(drei());
    const vorher = await ruhig();
    expect(vorher.length).toBeGreaterThan(0);

    await ansichtWechseln(container, "Semantic");
    await ruhig();
    await ansichtWechseln(container, "Force");
    const nachher = await ruhig();
    // Die zwanzigstel Weltinheit sind die Restenergie des Feldes, die zwischen
    // zwei Aufnahmen weiterläuft. Was der Test ausschliesst, ist das, was ein
    // Mensch sähe: dass die Feldanordnung nach dem Abstecher eine andere ist.
    expect(nachher).toHaveLength(vorher.length);
    expect(abtrieb(vorher, nachher), "kein Knoten ist nach dem Zurückwechseln spürbar gewandert").toBeLessThan(0.05);
  });

  it("zeichnet dieselbe Projektion, wenn dieselbe Wissensbasis zweimal geöffnet wird", async () => {
    semantikStub(karteVon(PUNKTE));
    const { container } = await zeichne(drei());
    await ruhig();

    await ansichtWechseln(container, "Semantic");
    const ersterBesuch = await ruhig();
    await ansichtWechseln(container, "Force");
    await ruhig();
    await ansichtWechseln(container, "Semantic");
    const zweiterBesuch = await ruhig();

    expect(ersterBesuch.length).toBeGreaterThan(0);
    expect(zweiterBesuch).toHaveLength(ersterBesuch.length);
    expect(abtrieb(ersterBesuch, zweiterBesuch), "zwei Besuche, zwei Bilder").toBe(0);
    // Und es ist die Projektion, nicht das Feld: die drei Notizen sitzen auf
    // ihren Kartenkoordinaten ±450/±300, nicht beieinander im Knäuel.
    expect(Math.max(...zweiterBesuch.map((s) => Math.abs(s.x)))).toBeCloseTo(450, 6);
  });

  it("merkt sich die Ansicht und kommt darin wieder", async () => {
    semantikStub(karteVon(PUNKTE));
    const { container, unmount } = await zeichne(drei());
    await ansichtWechseln(container, "Semantic");
    expect(localStorage.getItem("kepta_graph_view")).toBe("semantic");
    expect(knopf(container, "Semantic").getAttribute("style")).toMatch(/accent/);
    unmount();

    const wieder = await zeichne(drei());
    expect(knopf(wieder.container, "Semantic").getAttribute("style"), "Wieder offen im Kraftfeld").toMatch(/accent/);
  });

  it("meldet laut, wie viele Notizen die Kappung aus dem Bild nimmt", async () => {
    semantikStub(karteVon(PUNKTE, { gekappt: 3 }));
    const { container } = await zeichne(drei());
    await ansichtWechseln(container, "Semantic");
    await bilder(8);
    expect(container.textContent).toMatch(/3 notes left out/);
    expect(container.textContent).toMatch(/the map holds 2,000 vectors/);
  });

  it("stellt die Notizen ohne Vektor an den Rand und sagt es", async () => {
    // Vier Notizen, zwei mit Vektor: die zwei ohne fallen nicht weg.
    const ms = [...drei(), note({ id: "s4", title: "Ohne Einbettung" })];
    semantikStub(karteVon(PUNKTE.slice(0, 2), { getragen: 2, gesamt: 4 }));
    const { container } = await zeichne(ms);
    await ansichtWechseln(container, "Semantic");
    const plaetze = await ruhig();
    expect(container.textContent).toMatch(/2 notes without a vector, parked at the rim/);
    // Gefordert: alle vier Notizen stehen im Bild. Gezählt werden die Plätze
    // des Rahmens — Begriffe kommen nicht vor, das Stub liefert keine
    // memoriesByEntity.
    expect(plaetze.length).toBeGreaterThanOrEqual(4);
    // Und die zwei ohne Vektor sind wirklich draussen: ihr Abstand vom
    // Mittelpunkt ist größer als der weiteste projizierte Punkt.
    const weite = plaetze.map((p) => Math.hypot(p.x, p.y)).sort((a, b) => a - b);
    expect(weite[weite.length - 1]).toBeGreaterThan(600);
    expect(weite[weite.length - 2]).toBeGreaterThan(600);
  });

  it("nennt, was die beiden Achsen tragen, und welchen Modellen sie vertrauen", async () => {
    semantikStub(karteVon(PUNKTE));
    const { container } = await zeichne(drei());
    await ansichtWechseln(container, "Semantic");
    await bilder(8);
    expect(container.textContent).toMatch(/two axes carry 89 % of the differences/i);
    expect(container.textContent).toMatch(/nomic-embed-text/);
  });

  it("erklärt zu wenig Vektoren, statt ein schwarzes Feld zu zeigen", async () => {
    semantikStub(karteVon(PUNKTE.slice(0, 1), { getragen: 1, gesamt: 3 }));
    const { container } = await zeichne(drei());
    await ansichtWechseln(container, "Semantic");
    await bilder(8);
    expect(container.textContent).toMatch(/at least two notes with a vector/);
    expect(container.textContent).toMatch(/1 here/);
  });

  it("versagt laut, wenn die Karte nicht kommt", async () => {
    semantikStub(null, { fehler: true });
    const { container } = await zeichne(drei());
    await ansichtWechseln(container, "Semantic");
    await bilder(8);
    expect(container.textContent).toMatch(/could not be read/i);
  });

  it("lässt Feld und Baum in Ruhe: beide Knöpfe tun weiter, was sie taten", async () => {
    semantikStub(karteVon(PUNKTE));
    const { container } = await zeichne(drei());
    await ansichtWechseln(container, "Semantic");
    await ansichtWechseln(container, "Tree");
    await bilder(12);
    expect(container.textContent).toMatch(/Root → type → entity → note/);
    await ansichtWechseln(container, "Force");
    await bilder(12);
    expect(container.textContent).toMatch(/stays where you drop it/);
  });
});

// P-10: das Schema-Inventar. Cognee zeigt im „Schema"-Tab, was seine
// Wissensbasis trägt — Zählungen je Typ und wie Typen verbunden sind. Bei
// KEPTA standen diese Zahlen verstreut: die Art-Ziffern auf den
// Dashboard-Kacheln, die Kantenarten in der Legende, die Behauptungswörter an
// den Linien.
//
// Der Vertrag, der hier zählt: das Inventar kommt aus demselben Payload, den
// die Fläche zeichnet. Eine zweite Zählung neben der ersten ist genau die
// Sorte Zahl, die in einer Welle dreimal falsch war.
//
// KEIN DOWNGRADE: Der Blick ist zusätzlich. Die Fläche startet ohne ihn, und
// nichts an ihr wird schlechter, solange er zu ist.
describe("Das Schema-Inventar nennt, was der Bestand trägt", () => {
  function bestand() {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: [
        { source: "nordwind logistics", target: "quay street lease", relation: "betreut", memoryId: "n1" },
        { source: "nordwind logistics", target: "kestrel software", relation: "betreut", memoryId: "n2" },
        { source: "elena weiss", target: "nordwind logistics", relation: "meldet an", memoryId: "n3" },
      ],
      memoriesByEntity: {
        "nordwind logistics": ["n1", "n2", "n3"],
        "quay street lease": ["n1"],
        "kestrel software": ["n2"],
        "elena weiss": ["n3"],
      },
      bestand: { knoten: 4, kanten: 3 },
    }), { status: 200 })));
  }
  const notizen = () => [
    note({ id: "n1", title: "Rahmen Nordwind", type: "semantic" }),
    note({ id: "n2", title: "Tranche Kestrel", type: "episodic" }),
    note({ id: "n3", title: "Protokoll Weiss", type: "semantic" }),
  ];

  async function öffne(container: HTMLElement) {
    const k = [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Schema") as HTMLButtonElement;
    expect(k, "Der Schema-Knopf fehlt").toBeTruthy();
    await act(async () => { fireEvent.click(k!); await new Promise((r) => setTimeout(r, 120)); });
    return container.querySelector('[data-testid="graph-schema"]') as HTMLElement;
  }

  function zeilen(panel: HTMLElement) {
    return [...panel.querySelectorAll('[data-testid="graph-schema-row"]')].map((z) => (z.textContent ?? "").trim());
  }

  function gedimmt(container: HTMLElement): { hell: number; dunkel: number } {
    let hell = 0;
    let dunkel = 0;
    const ahmen = leinwand.letzterRahmen();
    for (let i = 0; i < ahmen.length; i++) {
      if (ahmen[i].op !== "arc") continue;
      let alpha: unknown = 1;
      for (let j = i - 1; j >= 0; j--) {
        if (ahmen[j].op === "set:globalAlpha") { alpha = ahmen[j].args[0]; break; }
      }
      if (Number(alpha) >= 0.99) hell++;
      else if (Number(alpha) <= 0.2) dunkel++;
    }
    return { hell, dunkel };
  }

  it("startet zu und lässt die Fläche unangetastet", async () => {
    bestand();
    const { container } = await zeichne(notizen());
    await bilder(8);
    expect(container.querySelector('[data-testid="graph-schema"]')).toBeNull();
    const vorher = gedimmt(container);
    expect(vorher.dunkel, "vor dem Öffnen steht schon etwas gedimmt").toBe(0);

    const panel = await öffne(container);
    expect(panel).not.toBeNull();
    await bilder(8);
    expect(gedimmt(container)).toEqual(vorher);
  });

  it("zählt die Arten, die Begriffe und die Behauptungen aus demselben Stand", async () => {
    bestand();
    const { container } = await zeichne(notizen());
    await bilder(8);
    const panel = await öffne(container);
    const zeilenText = zeilen(panel).join(" | ");
    expect(zeilenText).toMatch(/Facts\s+2/);
    expect(zeilenText).toMatch(/Events\s+1/);
    expect(zeilenText).toMatch(/Concepts\s+4/);
    expect(zeilenText).toMatch(/betreut\s+2/);
    expect(zeilenText).toMatch(/meldet an\s+1/);
    // Eine Art, die nicht vorkommt, bekommt keine Zeile.
    expect(zeilenText).not.toMatch(/How-tos/);
  });

  it("nennt die Zahl der Behauptungen, die der Bestand trägt, nicht die des Ausschnitts", async () => {
    bestand();
    const { container } = await zeichne(notizen());
    await bilder(8);
    const panel = await öffne(container);
    // 3 Notizen und 4 Begriffe sind 7 Knoten; die 9 gemalten Linien des Kopfes
    // sind 6 Erwähnungen und 3 Behauptungen — das Inventar nennt beides getrennt.
    expect(panel.textContent).toMatch(/3 notes · 7 nodes · 3 claims in the store/);
  });

  it("spotlightet eine Behauptung: was sie nicht trägt, tritt zurück", async () => {
    bestand();
    const { container } = await zeichne(notizen());
    await bilder(8);
    const panel = await öffne(container);
    const vorher = gedimmt(container);
    expect(vorher.dunkel).toBe(0);

    const reihe = [...panel.querySelectorAll('[data-testid="graph-schema-row"]')]
      .find((z) => (z.textContent ?? "").includes("betreut")) as HTMLButtonElement;
    expect(reihe, `keine Zeile „betreut"`).toBeTruthy();
    await act(async () => { fireEvent.click(reihe!); await new Promise((r) => setTimeout(r, 160)); });
    await bilder(8);

    const nachher = gedimmt(container);
    expect(nachher.dunkel, "das Spotlight dimmt nichts zurück").toBeGreaterThan(0);
    expect(nachher.hell, "das Spotlight lässt nichts stehen").toBeGreaterThan(0);
    expect(nachher.hell).toBeLessThan(vorher.hell);
  });

  it("gibt das Spotlight her, wer dieselbe Zeile noch einmal nimmt", async () => {
    bestand();
    const { container } = await zeichne(notizen());
    await bilder(8);
    const panel = await öffne(container);
    const reihe = [...panel.querySelectorAll('[data-testid="graph-schema-row"]')]
      .find((z) => (z.textContent ?? "").includes("betreut")) as HTMLButtonElement;
    await act(async () => { fireEvent.click(reihe!); await new Promise((r) => setTimeout(r, 160)); });
    await bilder(6);
    expect(gedimmt(container).dunkel).toBeGreaterThan(0);
    await act(async () => { fireEvent.click(reihe!); await new Promise((r) => setTimeout(r, 160)); });
    await bilder(8);
    expect(gedimmt(container).dunkel, "die Zeile hält das Bild noch immer dunkel").toBe(0);
  });

  it("lässt die Kopfzeile unangetastet — das Inventar ist ein zweiter Blick, keine zweite Zahl der Fläche", async () => {
    bestand();
    const { container } = await zeichne(notizen());
    await bilder(8);
    const kopfVorher = [...container.querySelectorAll("div.hud-label")].find((d) => /^\d+ notes?\b/.test((d.textContent ?? "").trim()))?.textContent?.trim();
    // 3 Notizen, 4 Begriffe, 9 gemalte Linien — davon 3 Behauptungen und 6
    // Erwähnungen. Was der Kopf zählt, ist das Bild; was das Inventar zählt, ist
    // der Bestand. Beide Zahlen bleiben, wie sie sind.
    expect(kopfVorher).toBe("3 notes · 4 concepts · 9 links");
    await öffne(container);
    await bilder(8);
    const kopfNachher = [...container.querySelectorAll("div.hud-label")].find((d) => /^\d+ notes?\b/.test((d.textContent ?? "").trim()))?.textContent?.trim();
    expect(kopfNachher, "der Kopf hat sich durch das Panel verbogen").toBe(kopfVorher);
  });
});

// P-11: der zweite Farbkanal. Cognee färbt „by Type, Node set, or User"; bei
// KEPTA trug die Fläche nur die Artfarbe, und die Herkunft (Posteingang,
// Rechner-Scan, hier geschrieben) war nirgends zu sehen.
//
// Der Vertrag, der hier gemessen wird: ein Kanal, der nichts zu unterscheiden
// hat, schaltet sich ab und sagt warum — er taucht die Wissensbasis nicht in
// ein graues „Unbekannt".
describe("Die Herkunft färbt, wenn sie etwas zu sagen hat", () => {
  const HERKUNFT_GESCHRIEBEN = "#8b9096";
  const HERKUNFT_DATEI = "#b5813a";

  function knopf(container: HTMLElement, name: string) {
    const k = [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === name);
    expect(k, `Der Knopf „${name}" fehlt`).toBeTruthy();
    return k as HTMLButtonElement;
  }

  async function umschalten(container: HTMLElement, name: string) {
    await act(async () => {
      fireEvent.click(knopf(container, name));
      await new Promise((r) => setTimeout(r, 220));
    });
  }

  /** Welche Farben in diesem Lauf als Füllung gesetzt wurden — auch die der Sprite-Herstellung. */
  function gemaltenFarben(): Set<string> {
    return new Set(
      leinwand.aufrufe
        .filter((a) => a.op === "set:fillStyle" && typeof a.args[0] === "string" && String(a.args[0]).startsWith("#"))
        .map((a) => String(a.args[0]))
    );
  }

  it("startet im Typ-Kanal", async () => {
    const { container } = await zeichne([note({ tags: ["x"] }), note({ tags: [] })]);
    await bilder(8);
    expect(knopf(container, "Type").getAttribute("aria-pressed")).toBe("true");
    expect(gemaltenFarben()).not.toContain(HERKUNFT_DATEI);
  });

  it("schaltet den Herkunfts-Kanal ab, wenn alles aus derselben Hand kommt", async () => {
    const { container } = await zeichne([note({ tags: ["a"] }), note({ tags: ["b"] }), note({ tags: [] })]);
    await bilder(8);
    const herkunft = knopf(container, "Provenance");
    expect(herkunft.disabled, "der Kanal ist an, obwohl nichts zu unterscheiden ist").toBe(true);
    expect(herkunft.getAttribute("title")).toMatch(/written in KEPTA/i);
    expect(herkunft.getAttribute("title")).toMatch(/nothing to tell apart/i);
  });

  it("gibt den Kanal her, sobald zwei Herkünfte im Bestand stehen", async () => {
    const ms = [
      note({ id: "h1", title: "Rechnung Mai", tags: ["auto-import", "inbox", "pdf"] }),
      note({ id: "h2", title: "Idee Notar", tags: [] }),
      note({ id: "h3", title: "Schlüsselübergabe", tags: [] }),
    ];
    const { container } = await zeichne(ms);
    await bilder(8);
    const herkunft = knopf(container, "Provenance");
    expect(herkunft.disabled).toBe(false);
    expect(herkunft.getAttribute("title")).toMatch(/2 kinds/i);

    leinwand.leeren();
    await umschalten(container, "Provenance");
    await bilder(8);
    const farben = gemaltenFarben();
    expect(farben, "die Herkunftsfarbe wird nicht gemalt").toContain(HERKUNFT_DATEI);
    expect(farben).toContain(HERKUNFT_GESCHRIEBEN);
    expect(container.textContent).toMatch(/From a file/);
    expect(container.textContent).toMatch(/Written in KEPTA/);
  });

  it("lässt die Typfarben in Ruhe, wenn der Kanal zurückgeht", async () => {
    const ms = [
      note({ id: "h1", title: "Rechnung Mai", tags: ["auto-import", "inbox", "pdf"] }),
      note({ id: "h2", title: "Idee Notar", tags: [] }),
    ];
    const { container } = await zeichne(ms);
    await bilder(8);
    await umschalten(container, "Provenance");
    await bilder(6);
    leinwand.leeren();
    await umschalten(container, "Type");
    await bilder(8);
    const farben = gemaltenFarben();
    expect(farben, "nach dem Zurückwechseln fehlt die Typfarbe").toContain("#56749a");
    expect(farben, "die Herkunftsfarbe malt noch ins Bild").not.toContain(HERKUNFT_DATEI);
  });

  it("merkt sich den Kanal", async () => {
    const ms = [
      note({ id: "h1", title: "Rechnung Mai", tags: ["inbox", "auto-import"] }),
      note({ id: "h2", title: "Idee Notar", tags: [] }),
    ];
    const { container } = await zeichne(ms);
    await bilder(8);
    await umschalten(container, "Provenance");
    expect(localStorage.getItem("kepta_graph_farbkanal")).toBe("herkunft");
    await umschalten(container, "Type");
    expect(localStorage.getItem("kepta_graph_farbkanal")).toBe("typ");
  });
});

// P-12: die Suche als Griff, nicht nur als Filter. Cognee zählt Treffer und
//blättert mit Enter durch sie hindurch. Bei KEPTA tippte man ein Wort, die
// Fläche wurde dünner — und welche Notiz gemeint war, musste selbst gesucht
// werden.
//
// Der Vertrag, der hier gemessen wird: der Zähler steht, Enter springt,
// Shift+Enter geht zurück, Escape räumt ZUERST die Suche. Und der alte
// Tastaturfluss bleibt heil: ohne Treffer öffnet Enter weiter die Auswahl.
describe("Die Suche zählt Treffer und führt von einem zum nächsten", () => {
  const notizen = () => [
    note({ id: "t1", title: "Rahmen Nordwind", content: "Tranche 1 ist unterschrieben." }),
    note({ id: "t2", title: "Tranche Nordwind", content: "Die zweite Tranche verschiebt sich." }),
    note({ id: "t3", title: "Protokoll Kestrel", content: "Zwei Sitze, keine Anpassung." }),
  ];

  function feld(container: HTMLElement) {
    const f = container.querySelector('input[placeholder^="Filter"]') as HTMLInputElement | null;
    expect(f, "das Suchfeld fehlt").not.toBeNull();
    return f!;
  }
  function zaehler(container: HTMLElement) {
    const z = container.querySelector('[data-testid="graph-search-count"]');
    return (z?.textContent ?? "").trim();
  }
  function Auswahl(container: HTMLElement) {
    const v = (container.querySelector('[data-testid="graph-canvas"]') as HTMLElement).getAttribute("data-selection");
    return v && v.length ? v : null;
  }
  async function tippe(container: HTMLElement, text: string) {
    await act(async () => {
      fireEvent.change(feld(container), { target: { value: text } });
      await new Promise((r) => setTimeout(r, 80));
    });
  }
  async function druecke(container: HTMLElement, schlussel: string, opts: { shift?: boolean } = {}) {
    await act(async () => {
      fireEvent.keyDown(feld(container), { key: schlussel, shiftKey: opts.shift === true });
      await new Promise((r) => setTimeout(r, 80));
    });
  }

  it("zählt die Treffer, ohne das Tippen zu blockieren", async () => {
    const { container } = await zeichne(notizen());
    await bilder(8);
    expect(zaehler(container)).toBe("");
    await tippe(container, "Nordwind");
    expect(feld(container).value).toBe("Nordwind");
    expect(zaehler(container)).toMatch(/2 matches/);
    await tippe(container, "Kestrel");
    expect(zaehler(container)).toMatch(/1 match$/);
  });

  it("sagt, wenn nichts passt — und erfindet keinen Treffer", async () => {
    const { container } = await zeichne(notizen());
    await bilder(8);
    await tippe(container, "Zahnarzt");
    expect(zaehler(container)).toMatch(/no match/i);
  });

  it("springt mit Enter zum Treffer und zählt die Stelle mit", async () => {
    const { container } = await zeichne(notizen());
    await bilder(8);
    await tippe(container, "Nordwind");
    expect(Auswahl(container)).toBeNull();
    await druecke(container, "Enter");
    expect(Auswahl(container)).toBe("t1");
    expect(zaehler(container)).toMatch(/1 of 2/);
    await druecke(container, "Enter");
    expect(Auswahl(container)).toBe("t2");
    expect(zaehler(container)).toMatch(/2 of 2/);
    // Und wieder von vorn — uralte Erwartung an ein Blättern.
    await druecke(container, "Enter");
    expect(Auswahl(container)).toBe("t1");
    expect(zaehler(container)).toMatch(/1 of 2/);
  });

  it("geht mit Shift+Enter zurück", async () => {
    const { container } = await zeichne(notizen());
    await bilder(8);
    await tippe(container, "Nordwind");
    await druecke(container, "Enter");
    await druecke(container, "Enter");
    expect(zaehler(container)).toMatch(/2 of 2/);
    await druecke(container, "Enter", { shift: true });
    expect(Auswahl(container)).toBe("t1");
    expect(zaehler(container)).toMatch(/1 of 2/);
  });

  it("räumt mit Escape zuerst die Suche, dann die Auswahl", async () => {
    const { container } = await zeichne(notizen());
    await bilder(8);
    await tippe(container, "Nordwind");
    await druecke(container, "Enter");
    expect(Auswahl(container)).toBe("t1");

    await druecke(container, "Escape");
    expect(feld(container).value).toBe("");
    expect(zaehler(container)).toBe("");
    expect(Auswahl(container), "Escape hat auch die Auswahl genommen").toBe("t1");

    await druecke(container, "Escape");
    expect(Auswahl(container), "die zweite Escape hebt nichts mehr auf").toBeNull();
  });

  it("öffnet mit Enter die Auswahl, wenn die Suche nichts zu blättern hat", async () => {
    const { container, onSelect } = await zeichne(notizen());
    await bilder(8);
    // Suchen, springen, Feld leeren: der Knoten bleibt gehalten, es gibt nur
    // nichts mehr durchzublättern. Dann gilt der alte Fluss — Enter öffnet.
    await tippe(container, "Nordwind");
    await druecke(container, "Enter");
    expect(Auswahl(container)).toBe("t1");
    await tippe(container, "");
    expect(zaehler(container)).toBe("");
    await druecke(container, "Enter");
    expect(onSelect, "Enter öffnet nicht mehr die gehaltene Auswahl").toHaveBeenCalledTimes(1);
    expect((onSelect.mock.calls[0] as unknown[])[0]).toMatchObject({ id: "t1" });
    // Und mit einem Wort, das nichts trifft, tut Enter weiterhin nichts — es
    // öffnet höchstens, was wirklich noch im Bild steht.
    await tippe(container, "Zahnarzt");
    expect(zaehler(container)).toMatch(/no match/i);
    await druecke(container, "Enter");
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

// #94: der Filter lässt die Kamera stehen. Die Kopfzeile sagt „8 notes", das
// Bild ist schwarz — die Fläche hat recht und sieht aus, als hätte sie unrecht.
//
// Der Fall ist hier nicht behauptet, sondern nachgestellt: zwölf Notizen stehen
// settled im Feld, dann bleibt ein Wort übrig, das drei trifft. Was der Nutzer
// danach sieht, müssen diese drei sein — nicht der leere Rahmen um eine Welt,
// die geradeauseinandergeflogen ist.
describe("Ein Filter lässt das Bild bei dem stehen, was übrig ist", () => {
  const masse = { w: 1000, h: 700 };

  function notizen() {
    const aus = [
      note({ id: "f1", title: "Rahmen Nordwind" }),
      note({ id: "f2", title: "Tranche Nordwind" }),
      note({ id: "f3", title: "Termin Nordwind" }),
    ];
    for (let i = 0; i < 9; i++) aus.push(note({ title: `Bemerkung ${i + 1}` }));
    return aus;
  }

  /** Die Scheiben des letzten Rahmens, auf den Bildschirm gerechnet. */
  function aufSchirm() {
    let tx = 0, ty = 0, k = 1;
    const punkte: { x: number; y: number }[] = [];
    for (const a of leinwand.letzterRahmen()) {
      if (a.op === "translate" && tx === 0 && ty === 0) { tx = Number(a.args[0]); ty = Number(a.args[1]); }
      else if (a.op === "scale" && k === 1) k = Number(a.args[0]);
      else if (a.op === "arc") punkte.push({ x: Number(a.args[0]), y: Number(a.args[1]) });
      else if (a.op === "drawImage") {
        punkte.push({ x: Number(a.args[1]) + Number(a.args[3]) / 2, y: Number(a.args[2]) + Number(a.args[4]) / 2 });
      } else if (a.op === "fillRect") {
        punkte.push({ x: Number(a.args[0]) + Number(a.args[2]) / 2, y: Number(a.args[1]) + Number(a.args[3]) / 2 });
      }
    }
    return punkte.map((p) => ({ x: p.x * k + tx, y: p.y * k + ty }));
  }

  /** Bis zwei Rahmen dieselben Scheiben setzen — das Feld steht wirklich. */
  async function ruhigDerWeile() {
    let letzte: { x: number; y: number }[] = [];
    for (let i = 0; i < 100; i++) {
      await bilder(4);
      const s = aufSchirm();
      const gleich = s.length > 0 && s.length === letzte.length && s.every((p, j) => p.x === letzte[j]!.x && p.y === letzte[j]!.y);
      if (gleich) {
        return {
          s,
          ausser: s.filter((p) => p.x < 0 || p.y < 0 || p.x > masse.w || p.y > masse.h).length,
        };
      }
      letzte = s;
    }
    const s = aufSchirm();
    return { s, ausser: s.filter((p) => p.x < 0 || p.y < 0 || p.x > masse.w || p.y > masse.h).length };
  }

  it("holt nach dem Filtern alles zurück in den Rahmen", async () => {
    const { container } = await zeichne(notizen());
    await ruhigDerWeile();

    const feld = container.querySelector('input[placeholder^="Filter"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(feld, { target: { value: "Nordwind" } });
      await new Promise((r) => setTimeout(r, 120));
    });
    const { s, ausser } = await ruhigDerWeile();
    // Das Feld steht, wenn zwei Rahmen dieselben Scheiben setzen. Was hier zählt,
    // ist die Weltkoordinate: ein Rahmen, der noch wandert, wäre keine Messung.
    expect(s.length, "es wird nichts mehr gemalt").toBeGreaterThanOrEqual(3);
    expect(ausser, `${ausser} von ${s.length} Knoten stehen außerhalb des Rahmens`).toBe(0);
  });

  it("stellt das Bild in die Mitte seiner Leinwand, nicht an den Rand", async () => {
    const { container } = await zeichne(notizen());
    await ruhigDerWeile();
    const feld = container.querySelector('input[placeholder^="Filter"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(feld, { target: { value: "Bemerkung 1" } });
      await new Promise((r) => setTimeout(r, 120));
    });
    const { s } = await ruhigDerWeile();
    expect(s.length).toBeGreaterThan(0);
    const mittig = s.reduce((a, p) => ({ x: a.x + p.x / s.length, y: a.y + p.y / s.length }), { x: 0, y: 0 });
    // Wer alles einpasst, zeigt es auch in der Mitte: ein Bild, das rechts am
    // Rand klebt, ist halb so breit, wie die Leinwand hergibt.
    expect(Math.abs(mittig.x - masse.w / 2), `Schwerpunkt x ${Math.round(mittig.x)} von ${masse.w}`).toBeLessThan(masse.w * 0.12);
    expect(Math.abs(mittig.y - masse.h / 2), `Schwerpunkt y ${Math.round(mittig.y)} von ${masse.h}`).toBeLessThan(masse.h * 0.12);
  });
});

// G-1, lesenseitig: der Schreibweg legt von jeder Notiz auch ihren Titel als
// Begriff an. In einer echten Basis von 400 Notizen waren das 400 von 420
// Begriffen — die Fläche malte eine Titelliste und nannte sie Ontologie. Der
// Begriff, der nur den Titel seiner einen Notiz wiederholt, ist kein Begriff.
describe("Ein Titel-Echo wird kein Begriff im Bild", () => {
  async function welt() {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      relations: [
        { source: "Rahmen Nordwind", target: "nordwind", relation: "mentions", memoryId: "e1" },
        { source: "nordwind", target: "quay street", relation: "betreut", memoryId: "e2" },
      ],
      memoriesByEntity: {
        "Rahmen Nordwind": ["e1"],
        nordwind: ["e1", "e2"],
        "quay street": ["e2"],
      },
    }), { status: 200 })));
    const v = await zeichne([
      note({ id: "e1", title: "Rahmen Nordwind" }),
      note({ id: "e2", title: "Mietvertrag Quay Street" }),
    ]);
    await bilder(10);
    return v.container;
  }

  it("zählt nur die Begriffe, die etwas verbinden", async () => {
    const container = await welt();
    const kopf = [...container.querySelectorAll("div.hud-label")]
      .find((d) => /^\d+ notes?\b/.test((d.textContent ?? "").trim()))?.textContent?.trim();
    expect(kopf, "das Titel-Echo steht noch als Begriff im Kopf").toMatch(/^2 notes · 2 concepts/);
  });

  it("hängt an das Echo auch keine Behauptung", async () => {
    // Vorher: 6 Linien — zwei davon führen über den Titel der einen Notiz. Nachher
    // vier: drei Erwähnungen und die eine Behauptung, die jemand geschrieben hat.
    const container = await welt();
    const kopf = [...container.querySelectorAll("div.hud-label")]
      .find((d) => /^\d+ notes?\b/.test((d.textContent ?? "").trim()))?.textContent?.trim();
    expect(kopf).toMatch(/· 4 links$/);
  });
});

// P-13: Kraft- und Knotengrößen-Regler. Der Maßstab ist Obsidian: wer an der
// Abstoßung, der Anziehung, dem Link-Abstand oder der Knotengröße dreht, sieht
// dasselbe Feld sich neu setzen — die Welt wird nicht neu gebaut, die Kamera
// springt nicht, und ohne Hand an den Reglern steht exakt das Bild von vorher.
describe("Die Regler unter dem Knopf Forces", () => {
  function bestand() {
    const notizen: Memory[] = [];
    for (let i = 0; i < 18; i++) {
      notizen.push(note({
        id: `k${i}`,
        title: `Notiz ${i}`,
        content: `Hält [[${i < 9 ? "Nordwind" : "Kestrel"}]] fest.`,
        tags: [i < 9 ? "nordwind" : "kestrel"],
      }));
    }
    return notizen;
  }
  async function kreftePanel(container: HTMLElement) {
    const knopf = [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Forces") as HTMLButtonElement;
    expect(knopf, "Der Knopf Forces fehlt").toBeTruthy();
    await act(async () => { fireEvent.click(knopf!); await new Promise((r) => setTimeout(r, 60)); });
    const panel = container.querySelector('[data-testid="graph-krafte"]') as HTMLElement;
    expect(panel, "Das Panel der Kräfte fehlt").toBeTruthy();
    return panel;
  }
  async function drehe(panel: HTMLElement, name: string, wert: string) {
    const regler = panel.querySelector(`input[aria-label="${name}"]`) as HTMLInputElement;
    expect(regler, `Der Regler „${name}" fehlt`).toBeTruthy();
    await act(async () => {
      fireEvent.input(regler!, { target: { value: wert } });
      await new Promise((r) => setTimeout(r, 60));
    });
    await bilder(10);
  }
  /**
   * Die gemalten Scheiben des letzten Rahmens, in Weltkoordinaten — über alle
   * drei LOD-Stufen, sonst hängt das Messen davon ab, wie groß die Fläche gerade
   * rechnet (arc / Sprite / Sammel-Rechteck).
   */
  function scheiben() {
    const out: { x: number; y: number; r: number }[] = [];
    for (const a of leinwand.letzterRahmen()) {
      if (a.op === "arc") out.push({ x: Number(a.args[0]), y: Number(a.args[1]), r: Number(a.args[2]) });
      else if (a.op === "drawImage") {
        out.push({
          x: Number(a.args[1]) + Number(a.args[3]) / 2,
          y: Number(a.args[2]) + Number(a.args[4]) / 2,
          r: Number(a.args[3]) / 2,
        });
      } else if (a.op === "fillRect") {
        out.push({
          x: Number(a.args[0]) + Number(a.args[2]) / 2,
          y: Number(a.args[1]) + Number(a.args[3]) / 2,
          r: Number(a.args[2]) / 2,
        });
      }
    }
    return out;
  }
  /** Die Kamera des letzten Rahmens: Maßstab und Sprung, wie die Fläche sie setzt. */
  function kamera() {
    let tx = 0, ty = 0, k = 1;
    for (const a of leinwand.letzterRahmen()) {
      if (a.op === "translate" && tx === 0 && ty === 0) { tx = Number(a.args[0]); ty = Number(a.args[1]); }
      if (a.op === "scale" && k === 1) k = Number(a.args[0]);
    }
    return { tx, ty, k };
  }
  const abstand = (a: { x: number; y: number }[], b: { x: number; y: number }[]) =>
    a.reduce((s, n, i) => Math.max(s, b[i] ? Math.hypot(n.x - b[i].x, n.y - b[i].y) : Infinity), 0);

  it("zeigt vier Regler und ihre Stellung", async () => {
    const { container } = await zeichne(bestand());
    const panel = await kreftePanel(container);
    const namen = [...panel.querySelectorAll("input[type=range]")].map((i) => i.getAttribute("aria-label"));
    expect(namen).toEqual(["Center force", "Repel strength", "Link distance", "Node size"]);
    expect(panel.textContent).toContain("1.0×");
  });

  /**
   * Wartet, bis das Feld steht: zwei Bilder hintereinander ohne Bewegung.
   *
   * Das ist kein langsamer Test, das ist die Physik: alpha fällt über
   * ALPHA_DECAY 0,0165 von 1 auf die Untergrenze in rund 300 Bildern — bei
   * 60 Hz fünf Sekunden, egal ob 20 oder 2 000 Knoten. Wer das abkürzt, misst
   * eine Welt, die noch läuft.
   */
  async function ruhe() {
    for (let i = 0; i < 70; i++) {
      const a = scheiben();
      await bilder(6);
      if (abstand(scheiben(), a) < 0.01) return;
    }
    throw new Error("Das Feld kommt nicht zur Ruhe");
  }

  /** Bewegung über ein Messfenster — das Feld steht nie exakt still. */
  async function druck(): Promise<number> {
    const a = scheiben();
    await bilder(6);
    return abstand(scheiben(), a);
  }

  it("räumt nichts um, wer das Panel nur öffnet und schließt", async () => {
    // Der Maßstab ist die Eigenbewegung des Feldes im selben Fenster: die läuft
    // in den letzten hundert Bildern aus, und niemandem ist mit einem Bild
    // gedient, das auf den Tausendstel-Stillstand wartet.
    const { container } = await zeichne(bestand());
    await ruhe();
    const grund = await druck();
    const panel = await kreftePanel(container);
    expect(await druck(), "das Panel hat die Welt angestoßen").toBeLessThanOrEqual(grund + 0.01);
    await act(async () => {
      fireEvent.click(panel.querySelector("[data-testid='graph-krafte-reset']")!);
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(await druck(), "Zurück ohne Verstellung hat die Welt angestoßen").toBeLessThanOrEqual(grund + 0.01);
  });

  it("bewegt der Abstoßungsregler das Feld, nicht die Kamera", async () => {
    const { container } = await zeichne(bestand());
    await bilder(10);
    const vorher = scheiben();
    const kameras = kamera();
    const panel = await kreftePanel(container);
    await drehe(panel, "Repel strength", "4");
    const nachher = scheiben();
    expect(nachher.length, "das Bild hat Knoten verloren").toBe(vorher.length);
    expect(abstand(nachher, vorher), "der Regler hat nichts bewegt").toBeGreaterThan(1);
    const jetzt = kamera();
    expect(jetzt.k, "der Regler hat die Kamera verstellt").toBeCloseTo(kameras.k, 6);
    expect(jetzt.tx, "der Regler hat die Kamera geschoben").toBeCloseTo(kameras.tx, 6);
    expect(jetzt.ty, "der Regler hat die Kamera geschoben").toBeCloseTo(kameras.ty, 6);
  });

  it("macht der Größenregler die Knoten größer, nicht die Welt weiter", async () => {
    const { container } = await zeichne(bestand());
    await bilder(10);
    const vorher = scheiben();
    const panel = await kreftePanel(container);
    await drehe(panel, "Node size", "2");
    const nachher = scheiben();
    expect(nachher.length).toBeGreaterThan(0);
    expect(Math.max(...nachher.map((s) => s.r))).toBeGreaterThan(Math.max(...vorher.map((s) => s.r)) * 1.5);
  });

  it("merkt sich die Stellung über ein neues Bild", async () => {
    const { container } = await zeichne(bestand());
    const panel = await kreftePanel(container);
    await drehe(panel, "Link distance", "2");
    expect(localStorage.getItem("kepta_graph_krafte")).toContain("\"link\":2");
    const zweiter = await zeichne(bestand());
    const zweitesPanel = await kreftePanel(zweiter.container);
    expect((zweitesPanel.querySelector('input[aria-label="Link distance"]') as HTMLInputElement).value).toBe("2");
  });

  it("setzt Zurück auf die gestimmten Konstanten", async () => {
    const { container } = await zeichne(bestand());
    const panel = await kreftePanel(container);
    await drehe(panel, "Center force", "2.5");
    await drehe(panel, "Node size", "1.6");
    await act(async () => {
      fireEvent.click(panel.querySelector("[data-testid='graph-krafte-reset']")!);
      await new Promise((r) => setTimeout(r, 60));
    });
    for (const name of ["Center force", "Repel strength", "Link distance", "Node size"]) {
      expect((panel.querySelector(`input[aria-label="${name}"]`) as HTMLInputElement).value, name).toBe("1");
    }
    expect(localStorage.getItem("kepta_graph_krafte")).toBe(null);
  });
});
