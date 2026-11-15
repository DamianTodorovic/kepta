// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryEditor } from "../../src/components/MemoryEditor";
import type { Memory } from "../../src/types";

// Punkt 128, Stufe 1 — das Behauptungsfeld hoeher als Tags und Privat.
//
// Gemessen 29.10. 13:35 MESZ am ausgelieferten Stueck: auf 1440 x 900 liegt das Feld unter der
// Kante, die Zeile kommt erst nach dem Rollen ins Bild. Der Fall unten zaehlt die Reihenfolge der
// Zeilen im Blatt und laesst das Feld erst gelten, wenn es zwischen Inhalt und Tags steht.

function memory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: "m1",
    userId: "local",
    title: "Uebergabe 14.03",
    content: "Nordwind und Elena sind genannt.",
    tags: ["nordwind"],
    type: "semantic",
    confidence: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  } as Memory;
}

/** Die Spalte, die das Feld als Zeile traegt: ihr direktes Kind ist es heute und soll es bleiben. */
function spalte(feld: HTMLElement): HTMLElement {
  const k = feld.parentElement;
  expect(k, "das Behauptungsfeld haengt in keinem Zeilenrumpf — Sonde, nicht Sache").toBeTruthy();
  return k as HTMLElement;
}

/** Der Stand einer Zeile in der Spalte: -1, wenn ihr Element kein direktes Kind ist. */
function stand(spalte: HTMLElement, el: Element | null): number {
  if (!el) return -1;
  let k: Element | null = el;
  while (k && k.parentElement !== spalte) k = k.parentElement;
  return k ? Array.prototype.indexOf.call(spalte.children, k) : -1;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    count: 0,
    behauptungen: [],
    hinweis: "This note claims nothing yet",
  }), { status: 200 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("128 Stufe 1 — Reihenfolge der Zeilen im Blatt", () => {
  it("steht das Behauptungsfeld direkt unter dem Inhalt und UEBER Tags und Privat", async () => {
    const { container } = render(<MemoryEditor memory={memory()} onSave={() => {}} onClose={() => {}} />);
    const feld = await screen.findByTestId("behauptung-feld");
    const sp = spalte(feld);

    const inhalt = stand(sp, container.querySelector("#memory-inhalt"));
    const behauptung = stand(sp, feld);
    const tags = stand(sp, container.querySelector("#memory-schlagwort"));
    const privat = stand(sp, screen.getByRole("switch", { name: "Private" }));

    for (const [name, i] of [["Inhalt", inhalt], ["Behauptung", behauptung], ["Tags", tags], ["Privat", privat]] as const) {
      expect(i, `${name} haengt nicht als direkte Zeile der Blattspalte`).toBeGreaterThan(-1);
    }

    expect(behauptung, "das Behauptungsfeld steht nicht UEBER Tags — auf 1440 x 900 bleibt es unter der Kante")
      .toBeLessThan(tags);
    expect(behauptung, "das Behauptungsfeld steht nicht UEBER Privat").toBeLessThan(privat);
    expect(behauptung, "das Behauptungsfeld steht nicht UNTER dem Inhalt").toBeGreaterThan(inhalt);
    expect(behauptung, "zwischen Inhalt und Behauptung steht eine andre Zeile").toBe(inhalt + 1);
  });

  it("kennt das Blatt genau vier Zeilen in der Folge Inhalt, Behauptung, Tags, Privat", async () => {
    render(<MemoryEditor memory={memory()} onSave={() => {}} onClose={() => {}} />);
    const feld = await screen.findByTestId("behauptung-feld");
    const zeile = (k: Element, sel: string) => k.matches(sel) || !!k.querySelector(sel);
    const folge = Array.from(spalte(feld).children)
      .map((k) => {
        if (zeile(k, "[data-testid='behauptung-feld']")) return "B";
        if (zeile(k, "#memory-inhalt")) return "I";
        if (zeile(k, "#memory-schlagwort")) return "T";
        if (zeile(k, '[aria-label="Private"]')) return "P";
        return "";
      })
      .filter((c) => c !== "")
      .join("");
    expect(folge).toBe("IBTP");
  });
});
