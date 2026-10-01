// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, fireEvent } from "@testing-library/react";
import { KnowledgeGraph } from "../../src/components/KnowledgeGraph";
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

/** Rendert und laesst die Bildschleife ein paar Mal laufen. */
async function zeichne(memories: Memory[], onSelect = vi.fn()) {
  const view = render(<KnowledgeGraph memories={memories} onSelectMemory={onSelect} />);
  await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
  return { ...view, onSelect };
}

/** Weitere Bilder abwarten (die Schleife laeuft ueber requestAnimationFrame). */
async function bilder(n = 8) {
  await act(async () => { await new Promise((r) => setTimeout(r, n * 20)); });
}

describe("Der Graph malt ueberhaupt", () => {
  it("zeigt ohne Notizen einen Hinweis statt einer Leinwand", async () => {
    const { container } = await zeichne([]);
    expect(container.querySelector('[data-testid="graph-canvas"]')).toBeNull();
    expect(container.textContent).toMatch(/No nodes yet/i);
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
    expect(container.textContent).toMatch(/3 nodes/);
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

  it("nimmt im hellen Thema die dunkle Randfarbe aus dem Theme", async () => {
    const farben = await randfarben("hell");
    expect(farben.some((f) => String(f).includes("64, 56, 38"))).toBe(true);
  });

  it("nimmt im dunklen Thema die helle Randfarbe", async () => {
    const farben = await randfarben("dunkel");
    expect(farben.some((f) => String(f).includes("255, 255, 255"))).toBe(true);
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
    const { container } = await zeichne(korpus());
    expect(container.textContent).toMatch(/6 edges/); // 4 Knoten, alle mit Tag "t"
    leinwand.leeren();
    await bilder();
    expect(leinwand.zahl("lineTo")).toBeGreaterThan(0);
  });

  it("laesst bei einem frueheren Zeitpunkt die Kanten der spaeteren Knoten weg", async () => {
    const { container } = await zeichne(korpus());
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
    expect(container.textContent).toMatch(/2 nodes/);
    await act(async () => {
      setter.call(feld, "");
      feld.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 80));
    });
    expect(container.textContent).toMatch(/3 nodes/);
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
    expect(container.textContent).toMatch(/1 edges|1 edge/);
    const rahmen = leinwand.letzterRahmen();
    expect(rahmen.filter((x) => x.op === "quadraticCurveTo").length).toBeGreaterThan(0);
    // Vor dem Zeichnen der echten Kanten steht die Akzentfarbe.
    const akzentGesetzt = leinwand.aufrufe.some((x) => x.op === "set:strokeStyle" && String(x.args[0]) === "#c9b785");
    expect(akzentGesetzt).toBe(true);
  });

  it("malt Aehnlichkeitskanten auch weit herausgezoomt, solange es wenige sind", async () => {
    // Die Schwelle selbst ist in lib/graphLayout geprueft (nurEchteKanten).
    // Hier zaehlt, dass eine normale Wissensbasis beim Herauszoomen nicht
    // ploetzlich ohne Verbindungen dasteht.
    const ms = Array.from({ length: 12 }, () => note({ tags: ["gemeinsam"] }));
    const { container } = await zeichne(ms);
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
    ]);
    expect(container.textContent).toMatch(/4 nodes · 6 edges/);

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
    expect(container.textContent).toMatch(/2 nodes · 1 edge(?!s)/);
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
    expect(container.textContent).toMatch(/1 node · 0 edges/);
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
