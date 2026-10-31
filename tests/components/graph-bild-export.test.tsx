// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, fireEvent, cleanup } from "@testing-library/react";
import { installiereLeinwand, installiereResizeObserver, installiereZeiger, lassLeinwandWerfen, setzeTheme } from "../helfer/canvas";
import type { Memory } from "../../src/types";

// Punkt 9, dritter Vorschlag der Matrize (`P3-P9-PARITAETSMATRIZE-3110.md`), und Punkt 1: wer sein
// Wissen zeigt, braucht ein Bild davon. Der Graph malt auf einer Leinwand — das Bild ist also schon
// da, es liegt nur nirgends ab. Capacities hat einen Bild-Export, wir hatten nur das Fenster.
//
// Geprüft wird an dem, was der Nutzer sieht und bekommt:
//  - der Knopf trägt sein Wort sichtbar (ein Titel allein ist ein Hover, keine Aufschrift),
//  - der Download trägt einen Dateinamen und eine Datenkette,
//  - in der Datenkette steckt die Größe DER Leinwand, die gerade gemalt wird — nicht irgendeine,
//  - und wenn die Leinwand wirft (befleckt, gesperrt), sagt die Fläche es, statt still zu bleiben.

let zaehler = 0;
function note(i: number): Memory {
  return {
    id: `x${zaehler}_${i}`, userId: "local", title: `Notiz ${i}`, content: "Inhalt",
    tags: ["feld"], type: "semantic",
    createdAt: Date.parse("2024-01-01"), updatedAt: Date.parse("2024-01-01"),
  };
}

const { KnowledgeGraph } = await import("../../src/components/KnowledgeGraph");

async function atmen(ms = 220) {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
}

async function flaeche(breite = 1000, hoehe = 700) {
  zaehler++;
  installiereResizeObserver(breite, hoehe);
  const view = render(<KnowledgeGraph memories={[note(zaehler), note(zaehler + 100)]} onSelectMemory={() => {}} />);
  await atmen();
  return view;
}

function knopf(container: HTMLElement) {
  return container.querySelector('button[data-testid="graph-export"]') as HTMLButtonElement | null;
}

/** Fängt den Anker ab, den der Export zum Download macht, ohne etwas herunterzuladen. */
async function herunterladen(view: { container: HTMLElement }) {
  let gerahmt: HTMLAnchorElement | null = null;
  const echt = HTMLAnchorElement.prototype.click;
  // Die Flaeche haengt den Anker ins Dokument, bevor sie ihn ausloest — hier wird er an genau
  // diesem Moment gelesen. Ein `gerahmt = this` waere dieselbe Auskunft, aber die Hausregel
  // verbietet das Weiterreichen von `this`.
  HTMLAnchorElement.prototype.click = () => {
    const alle = document.body.querySelectorAll("a");
    gerahmt = (alle.length ? alle[alle.length - 1] : null) as HTMLAnchorElement | null;
  };
  try {
    await act(async () => { fireEvent.click(knopf(view.container)!); });
    await atmen(80);
  } finally {
    HTMLAnchorElement.prototype.click = echt;
  }
  return gerahmt as HTMLAnchorElement | null;
}

beforeEach(() => {
  lassLeinwandWerfen(null);
  installiereLeinwand();
  installiereZeiger();
  setzeTheme("dunkel");
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ relations: [], memoriesByEntity: {} }), { status: 200 })
  ));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("style");
});

describe("Punkt 9: der Graph gibt sein Bild als PNG heraus", () => {
  it("der Knopf steht an der Leiste und trägt sein Wort sichtbar", async () => {
    const view = await flaeche();
    const b = knopf(view.container);
    expect(b, "kein Knopf mit der Prüfkennung graph-export").toBeTruthy();
    expect((b!.textContent || "").trim(), "das Wort fehlt auf dem Knopf (Titel ist nur ein Hover)").toMatch(/export/i);
  });

  it("ein Klick legt ein PNG mit Dateinamen ab", async () => {
    const view = await flaeche();
    const gerahmt = await herunterladen(view);
    expect(gerahmt, "es wurde kein Download angestossen").toBeTruthy();
    expect(gerahmt!.getAttribute("download") || "", "der Dateiname trägt keine Endung").toMatch(/\.png$/i);
    expect(gerahmt!.href.startsWith("data:image/png"), `keine PNG-Datenkette: ${gerahmt!.href.slice(0, 40)}`).toBe(true);
  });

  it("das Bild kommt von DER Leinwand, die gerade gemalt wird", async () => {
    const view = await flaeche(1200, 800);
    const leinwand = view.container.querySelector("canvas") as HTMLCanvasElement | null;
    expect(leinwand, "die Fläche malt auf keiner Leinwand").toBeTruthy();
    const gerahmt = await herunterladen(view);
    // Die Attrappe in tests/helfer/canvas.ts legt die Größe der Leinwand in die Datenkette — hier
    // wird gelesen, welches Bild tatsächlich herausgekommen ist.
    const base64 = (gerahmt?.href || "").split("base64,")[1] || "";
    const groesse = base64 ? Buffer.from(base64, "base64").toString("utf8") : "";
    expect(groesse, `Bild von ${groesse}, Leinwand ${leinwand!.width}x${leinwand!.height}`)
      .toBe(`${leinwand!.width}x${leinwand!.height}`);
  });

  it("wirft die Leinwand, sagt die Fläche es — und lädt nichts herunter", async () => {
    const view = await flaeche();
    lassLeinwandWerfen("SecurityError: tainted canvas");
    let angestossen = false;
    const echt = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = () => { angestossen = true; };
    let meldung = "";
    try {
      await act(async () => { fireEvent.click(knopf(view.container)!); });
      await atmen(120);
      meldung = view.container.querySelector('[role="alert"]')?.textContent?.trim() || "";
    } finally {
      HTMLAnchorElement.prototype.click = echt;
      lassLeinwandWerfen(null);
    }
    expect(angestossen, "es wurde ein Bild angeboten, das die Leinwand nicht hergab").toBe(false);
    expect(meldung.toLowerCase(), "keine Meldung über den fehlgeschlagenen Export").toContain("image");
  });
});
