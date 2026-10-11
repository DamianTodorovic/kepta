// @vitest-environment jsdom
// Die Schriftstufen-Wache der Graph-Flaeche.
//
// Gemessen am 10.10. im echten Browser: die tiefste Schrift im Bild war 9 px,
// im DOM 10 px. Beide Werte hat niemand gesetzt — es waren Rechnungen
// (`fs * 0.82`, `fs * 0.78`) an einer Schrift, die selbst schon auf der
// untersten Stufe lag. E1s Leiter (index.css:147) hat acht Stufen, ganzzahlig,
// "keine unter 11 px"; die unterste heisst `--fs-1`. Diese Datei haelt die
// Latte an dem, was ein Mensch sieht: der Groesse AUF DEM SCHIRM.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, act } from "@testing-library/react";
import { KnowledgeGraph } from "../../src/components/KnowledgeGraph";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger, setzeTheme, type Leinwand } from "../helfer/canvas";
import type { Memory } from "../../src/types";

/** E1s unterste Stufe. Kein Wort dieser Flaeche ist kleiner. */
const KLEINSTE_STUFE_PX = 11;

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
    id: `sf-${zaehler}`, userId: "local", title: `Schrift Notiz ${zaehler}`, content: "Inhalt",
    tags: ["haltung"], type: "semantic", createdAt: Date.parse("2024-01-01"), updatedAt: Date.parse("2024-01-01"),
    ...over,
  };
}

/** Begriffe an den Bestand, damit der Baum ein Geruest, Zahlen und Faltungen hat. */
function begriffe(notizen: Memory[], gruppen: number) {
  const byEntity: Record<string, string[]> = {};
  const groesse = Math.ceil(notizen.length / gruppen);
  for (let g = 0; g < gruppen; g++) {
    byEntity[`begriff ${g}`] = notizen.slice(g * groesse, g * groesse + groesse).map((m) => m.id);
  }
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ relations: [], memoriesByEntity: byEntity }), { status: 200 })));
}

async function feld(memories: Memory[], masse: [number, number] = [1000, 700]) {
  setzeGroesse(masse[0], masse[1]);
  const view = render(<KnowledgeGraph memories={memories} onSelectMemory={() => {}} />);
  await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
  return view;
}

async function imBaum(notizen: Memory[], masse: [number, number]) {
  const { container } = await feld(notizen, masse);
  const baum = [...container.querySelectorAll("button")].find((b) => (b.getAttribute("title") || "").startsWith("Dendrogram"));
  expect(baum, "der Baum-Knopf fehlt — ohne Baum gibt es kein Geruest zu messen").toBeTruthy();
  await act(async () => { baum!.click(); await new Promise((r) => setTimeout(r, 500)); });
  return container;
}

/** Alles, was im letzten Bild als Text stand — Titel, Geruest, Badges, Glyphen. */
function alleSchriften() {
  // Geprueft wird die Groesse AUF DEM SCHIRM. Glyphen sitzen in der
  // Welttransformation und werden mit dem Zoom gegessen oder gross; ihre
  // Welteinheit ist keine Aussage ueber Lesbarkeit, die Bildpixel sind es.
  return leinwand.schriften().map((s) => ({
    text: s.text,
    px: Math.round(s.px * 100) / 100,
    schrift: Math.round(s.schrift * 100) / 100,
  }));
}

function ausreisser() {
  // 0,05 px Luft: der Glyph wird gegen den Zoom zurueckgerechnet
  // (11 / k * k), und das ist nicht exakt 11.
  return leinwand.schriften()
    .filter((s) => s.px < KLEINSTE_STUFE_PX - 0.05)
    .map((s) => ({ text: s.text, px: Math.round(s.px * 10) / 10 }));
}

const QUELLE = () => readFileSync(join(process.cwd(), "src", "components", "KnowledgeGraph.tsx"), "utf-8");

describe("die unterste Stufe gilt im ganzen Gemaelde", () => {
  it("laesst im Kraftfeld kein Wort unter 11 px", async () => {
    const notizen = Array.from({ length: 60 }, () => note());
    begriffe(notizen, 3);
    await feld(notizen, [1000, 700]);
    const gemalt = alleSchriften();
    expect(gemalt.length, "es wird kein Text gemalt — die Wache sieht ins Leere").toBeGreaterThan(0);
    expect(ausreisser(), `unter der Stufe gemalt: ${JSON.stringify(ausreisser())}`).toEqual([]);
  });

  it("laesst im Baum Geruest, Glyphen und Malzeichen auf der Stufe", async () => {
    const notizen = Array.from({ length: 40 }, (_, i) => note({ tags: [`feld ${i % 4}`] }));
    begriffe(notizen, 8);
    await imBaum(notizen, [900, 640]);
    const gemalt = alleSchriften();
    expect(gemalt.length, "der Baum malt keinen Text — die Wache sieht ins Leere").toBeGreaterThan(0);
    // Die Gegenfrage gegen Blindheit: das Geruest war eine der vier Stellen
    // unter der Stufe (9,0 px). Steht sein Name nicht in der Liste, hat diese
    // Zeile ein leeres Bild gemessen und ist grün, obwohl nichts gepriift ist.
    const texte = gemalt.map((s) => s.text);
    expect(texte.some((t) => /^begriff \d/.test(t)), `kein Geruest im Bild: ${JSON.stringify(texte.slice(0, 8))}`).toBe(true);
    expect(ausreisser(), `unter der Stufe gemalt: ${JSON.stringify(ausreisser())}`).toEqual([]);
  });

  it("gibt die Tagszeile eines gehaltenen Etiketts nicht kleiner als die Stufe", async () => {
    const notizen = Array.from({ length: 8 }, () => note());
    begriffe(notizen, 2);
    const { container } = await feld(notizen, [1000, 700]);
    const c = container.querySelector('[data-testid="graph-canvas"]') as HTMLCanvasElement;
    const etikett = leinwand.schriften().find((s) => /^Schrift Notiz \d+/.test(s.text));
    expect(etikett, `kein Titel gemalt: ${JSON.stringify(alleSchriften().slice(0, 6))}`).toBeDefined();
    await act(async () => {
      c.dispatchEvent(new (globalThis as unknown as { PointerEvent: typeof PointerEvent }).PointerEvent("pointermove", {
        bubbles: true, cancelable: true, clientX: etikett!.x, clientY: etikett!.y - 8,
      }));
      await new Promise((r) => setTimeout(r, 120));
    });
    const tags = alleSchriften().filter((s) => /haltung/.test(s.text));
    expect(tags.length, `die Tagszeile fehlt — Halten nicht angekommen: ${JSON.stringify(alleSchriften())}`).toBeGreaterThan(0);
    expect(ausreisser(), `unter der Stufe gemalt: ${JSON.stringify(ausreisser())}`).toEqual([]);
  });
});

describe("die Stufe wird nicht wieder weggerechnet", () => {
  it("kennt in der Quelle keine Schriftrechnung unter eins", () => {
    const faktoren = [...QUELLE().matchAll(/font = `[^`]*? \* (0\.\d+)/g)].map((m) => Number(m[1]));
    expect(faktoren, `Schrift mit Faktor unter eins — damit waeche sie wieder unter die Stufe: ${faktoren.join(", ")}`).toEqual([]);
  });

  it("kennt in der Quelle keine DOM-Klasse unter 11 px", () => {
    const stellen = [...QUELLE().matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)]
      .map((m) => Number(m[1]))
      .filter((px) => px < KLEINSTE_STUFE_PX);
    expect(stellen, `text-[Npx] unter der Stufe: ${stellen.join(", ")} px`).toEqual([]);
  });

  it("malt nur in den drei Gewichten der Leiter", async () => {
    // Weil die Groesse nicht mehr unterscheidet, unterscheidet das Gewicht.
    // E1s Leiter (index.css:182-184) kennt 400 ruhig, 600 halbfest, 700 fest —
    // dazwischen kollabiert auf Windows alles auf zwei Stufen, und die halbe
    // Hierarchie waeg sich wieder in eine erfundene Zahl zurueck.
    const notizen = Array.from({ length: 40 }, (_, i) => note({ tags: [`feld ${i % 4}`] }));
    begriffe(notizen, 8);
    await imBaum(notizen, [900, 640]);
    const erlaubt = [400, 600, 700];
    const gewichte = new Set<number>();
    let gewicht = 0;
    for (const a of leinwand.letzterRahmen()) {
      if (a.op === "set:font") {
        const treffer = /^(\d{3})\s/.exec(String(a.args[0]));
        if (treffer) gewicht = Number(treffer[1]);
      } else if (a.op === "fillText") gewichte.add(gewicht);
    }
    expect(gewichte.size, "es wurde kein Gewicht gesetzt — die Wache sieht ins Leere").toBeGreaterThan(0);
    const ausserhalb = [...gewichte].filter((g) => !erlaubt.includes(g));
    expect(ausserhalb, `Gewichte ausserhalb der Leiter: ${ausserhalb.join(", ")}`).toEqual([]);
  });
});

describe("die Trefferflaeche am Zeitregler", () => {
  it("traegt den 14-px-Polster, der die Linie auf 44 px hebt", async () => {
    await feld([note(), note(), note()], [1000, 700]);
    const regler = document.querySelector('input[type="range"][aria-label="Time of the knowledge shown"]') as HTMLInputElement | null;
    expect(regler, "der Zeitregler fehlt — in diesem Bestand ist keine Zeitspanne").toBeTruthy();
    // VIER Zeilen: 44 px Box, 16 px Zeichnung. Die Zahl lebt in der Zeile, damit
    // ein Wegfallen des Polsters rot wird — nicht erst im Browserbild.
    expect(regler!.style.boxSizing, "ohne content-box frisst der Polster die Zeichnung").toBe("content-box");
    expect(regler!.style.paddingBlock, `Polster ${regler!.style.paddingBlock} — die Box bleibt unter 44 px`).toBe("14px");
    expect(regler!.style.marginBlock, "ohne gegenlaeufigen Rand blaeht die Leiste die Zeichnung").toBe("-14px");
  });

  it("laesst im Menue dem Nachbarn die Flaeche, die sie in der Zeile nicht braucht", async () => {
    // In der Zeile traegt der gegenlaeufige Rand die 44 px in die 12-px-Polster
    // der Leiste — gemessen am 11.10. im Browser: alle vier Saume treffen den
    // Regler selbst. Im Menue stehen die Reihen 12 px auseinander; derselbe
    // Gegenrand stahlte dem Nachbarn die Trefferflaeche (gemessen: `unten` traf
    // den Direction-Knopf, `oben` das Suchfeld). Also wachst dort die Reihe.
    const { container } = await feld([note(), note(), note()], [420, 700]);
    const bar = container.querySelector('[data-testid="graph-leiste"]') as HTMLElement;
    expect(bar, "die Zeile fehlt").toBeTruthy();
    Object.defineProperty(bar, "clientWidth", { value: 300, configurable: true });
    await act(async () => {
      setzeGroesse(300, 700);
      await new Promise((r) => setTimeout(r, 140));
    });
    const mehr = container.querySelector('[data-testid="graph-mehr"]') as HTMLButtonElement;
    expect(mehr, "bei 284 px innerer Breite fehlt die Klappe").toBeTruthy();
    await act(async () => {
      mehr.click();
      await new Promise((r) => setTimeout(r, 140));
    });
    const panel = container.querySelector('[data-testid="graph-mehr-panel"]');
    const regler = panel?.querySelector('input[type="range"][aria-label="Time of the knowledge shown"]') as HTMLInputElement | null;
    expect(regler, "der Regler ist nicht ins Menue umgezogen — die Klappe zeigt ihn nicht").toBeTruthy();
    expect(regler!.style.paddingBlock, "ohne Polster bleibt die Box im Menue 16 px").toBe("14px");
    expect(regler!.style.marginBlock, "ein Gegenrand im Menue ueberlappt die Nachbarreihe").toBe("");
  });

  it("meldet sich, sobald index.css die Zeichnung selbst groesser macht", () => {
    // Die 14 px Polster sind auf E1s 16-px-Linie gerechnet. Aendert E1 die
    // Zeichnung, ist der Polster doppelt — also muss die Wache an der Zeichnung
    // haengen und nicht nur an meinem Stil.
    const css = readFileSync(join(process.cwd(), "src", "index.css"), "utf-8");
    const zeit = css.match(/\.graph-time,[\s\S]*?\{[^}]*height:\s*(\d+)px/);
    expect(zeit, "die Regel fuer .graph-time ist nicht mehr zu finden").toBeTruthy();
    expect(zeit![1], `die Zeichnung ist ${zeit![1]} px hoch — der Polster muss nachgerechnet werden`).toBe("16");
  });
});
