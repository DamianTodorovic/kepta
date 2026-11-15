// @vitest-environment jsdom
// Punkt 1 und 6, Befund B vom 4.11. (P53): bei 390 px zeigt der Einpass-Knopf EINE Notiz
// weniger als die Ankunft, und seine Tinte an den Kanten steigt von 18 auf 50 Bildpunkte.
//
//     Kontrolle ohne Griff: 33 -> 33 (Drift 0)
//     Notizen im Bild: vorher 33 — nach der Kontrolle 33 — nach dem Fit 32 von 34
//
// Der Grund sitzt nicht an der Groesse: beide Kameras rechnen denselben Massstab, denn der
// Lesbarkeits-Boden entscheidet ihn. Der Grund sitzt an der MITTE. Jede andre Kamera der
// Flaeche (Anfang, Baum, die zwei Knopfe unten) sucht ihre Mitte in dem, was gemalt wird
// (`titelAnker` -> `dichtesteWeltMitte`); nur der Einpass-Knopf ging auf die Boxmitte der
// Welt. Das ist seine Berechtigung, solange die ganze Welt in den Rahmen passt — passt sie
// nicht, weil der Boden die Groesse haelt, ist die Boxmitte bei schmalem Bild einfach die
// leerere Stelle, und der Knopf nimmt dem Nutzer etwas weg, das er gerade hatte.
//
// Verlangt ist also die Ordnung, nicht die Grosse: **der Knopf darf nie weniger Notizen
// zeigen als die Ansicht vor dem Druck.** Halten, wenn er alles zeigen kann; die dichteste
// Gegend zeigen, wenn er nicht alles zeigen kann.
//
// Die Biss-Kontrolle unten ist der Titel des Knopfs: er nennt den Boden nur, wenn der Boden
// entschieden hat (`fitTitel`). Nennt er ihn nicht, fuehrt dieser Fall die Bedingung des
// Befunds gar nicht aus und ist wertlos — also bricht er ab, statt gruen zu sein.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { KnowledgeGraph } from "../../src/components/KnowledgeGraph";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger, setzeTheme } from "../helfer/canvas";
import type { Memory } from "../../src/types";

const BREITE = 390;
const HOEHE = 628;
const BESTAND = 34;

let zaehler = 0;
function note(): Memory {
  zaehler += 1;
  return {
    id: `f${zaehler}`, userId: "local", title: `Einpassnotiz ${zaehler}`, content: "Inhalt mit Begriff",
    tags: ["einpass"], type: "semantic", scope: "local", confidence: 1,
    validFrom: null, validTo: null, supersededBy: null, deletedAt: null,
    createdAt: Date.parse("2024-01-01"), updatedAt: Date.parse("2024-01-01"),
  } as Memory;
}

beforeEach(() => {
  installiereLeinwand();
  installiereResizeObserver(BREITE, HOEHE);
  installiereZeiger();
  setzeTheme("dunkel");
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 })));
});
afterEach(() => { vi.unstubAllGlobals(); });

/** Die Zahl aus der Bilanz des Rahmens: "32 of 34 unfolded notes are in this picture". */
function imBild(container: HTMLElement): number {
  const el = container.querySelector<HTMLElement>('[data-testid="graph-im-bild"]');
  expect(el, "die Bilanz des Rahmens fehlt — dieser Fall kann nichts zaehlen").toBeTruthy();
  const treffer = String(el!.textContent ?? "").match(/(\d+)\s*of\s*(\d+)/);
  expect(treffer, `die Bilanz sagt "${el!.textContent}" und nennt keine Zahl von einer Zahl`).toBeTruthy();
  return Number(treffer![1]);
}

async function zeichne() {
  const notizen = Array.from({ length: BESTAND }, note);
  const sicht = render(<KnowledgeGraph memories={notizen} onSelectMemory={() => {}} />);
  await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
  const knopf = sicht.container.querySelector<HTMLButtonElement>('[data-testid="graph-fit"]');
  expect(knopf, "der Einpass-Knopf steht nicht — die Flaeche ist nicht aufgebaut").toBeTruthy();
  return { sicht, knopf: knopf as HTMLButtonElement };
}

describe("der Einpass-Knopf darf bei schmalem Bild nichts wegnehmen", () => {
  it("haltet die Zahl der Notizen im Bild, wenn der Lesbarkeits-Boden die Groesse haelt", async () => {
    const { sicht, knopf } = await zeichne();
    const vorher = imBild(sicht.container);
    expect(vorher, "die Ankunft zeigt keine Notiz — der Bestand ist nicht aufgebaut").toBeGreaterThan(0);
    expect(knopf.title,
      `dieser Lauf erwischt die Bedingung des Befunds nicht: der Knopf.title sagt "${knopf.title}", ` +
      "und der Titel nennt den Lesbarkeits-Boden nur, wenn er die Groesse entschieden hat").toContain("readability floor");
    await act(async () => { knopf.click(); await new Promise((r) => setTimeout(r, 250)); });
    const nachher = imBild(sicht.container);
    expect(nachher,
      `der Druck zeigt ${nachher} von ${BESTAND} Notizen, die Ankunft zeigte ${vorher} — ` +
      "ein Knopf, der 'passen' heisst, darf nicht weniger zeigen als die Ansicht vor dem Druck"
    ).toBeGreaterThanOrEqual(vorher);
  });

  it("zaehlt dieselbe Menge wie vor dem Druck, wenn gar nichts zu tun ist (Kontrolle ohne Griff)", async () => {
    const { sicht } = await zeichne();
    const vorher = imBild(sicht.container);
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
    expect(imBild(sicht.container), "das Feld driftet weiter, bevor verglichen wird — Zahl und Bild duerfen nicht an zwei Weltlagen haengen").toBe(vorher);
  });
});
