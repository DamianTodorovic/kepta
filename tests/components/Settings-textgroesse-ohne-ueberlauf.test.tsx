// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Settings } from "../../src/components/Settings";

// Punkt 107, 26.10.2026: der Textgroessen-Regler blaest das Blatt ueber den Viewport.
// Gemessen im echten Fenster (Blatt p4-107-ueberlauf-2610.md, 26.10. 11:27:56 MEZ):
// scrollWidth 1656 bei 115 % und 1872 bei 130 % auf 1440 px Fenster - also +216 px und
// +432 px seitlicher Ueberlauf. Die Ursache ist der Kanal selbst: `zoom` am Leib skaliert
// auch die 100vw der Wurzel, und die berechnete Schriftgroesse ruehrt sich nicht.
// Dieser Fall bedient das benannte Steuer und misst die zwei Dinge, die der Korper andert:
// der Leib bekommt eine Gegenbreite, und die Wurzel traegt kein Viewport-Mass mehr.
// Die Breite in Pixeln ist damit NICHT bewiesen - jsdom kennt kein Layout; sie gehoert ins
// echte Fenster (Sonde belege-2610/p4-107-koerper/).

function stubFetch() {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).includes("/api/health")) {
      return new Response(JSON.stringify({ ok: true, count: 7, uptime: 12 }), { status: 200 });
    }
    if (String(url).includes("/api/models")) {
      return new Response(JSON.stringify({ models: [] }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }));
}

beforeEach(() => {
  localStorage.clear();
  document.body.style.zoom = "";
  document.body.style.width = "";
  stubFetch();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.style.zoom = "";
  document.body.style.width = "";
});

const feld = () => screen.getByLabelText(/Text size/i) as HTMLSelectElement;

/** Die Engine rechnet ein `calc(100% / 1,15)` zu `calc(86.9565%)` um - verglichen wird
 *  darum die Zahl hinter dem Prozent, nicht die Schreibweise. Ohne gesetzte Breite ist
 *  die Zahl keine Zahl, und der Fall verliert. */
function gegenBreiteProzent(): number {
  const roh = /([\d.]+)\s*%/.exec(document.body.style.width || "");
  return roh ? Number(roh[1]) : Number.NaN;
}

describe("Settings: Textgroesse ohne seitlichen Ueberlauf (Punkt 107)", () => {
  it("115 % gibt dem Leib die Gegenbreite 100% / 1,15", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.selectOptions(feld(), "115");
    await waitFor(() => expect(document.body.style.zoom).toBe("1.15"));
    expect(Math.abs(gegenBreiteProzent() - 100 / 1.15)).toBeLessThan(0.01);
  });

  it("130 % gibt dem Leib die Gegenbreite 100% / 1,3", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.selectOptions(feld(), "130");
    await waitFor(() => expect(document.body.style.zoom).toBe("1.3"));
    expect(Math.abs(gegenBreiteProzent() - 100 / 1.3)).toBeLessThan(0.01);
  });

  it("Gegenprobe 100 %: zoom und Gegenbreite sind weg", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.selectOptions(feld(), "115");
    await waitFor(() => expect(document.body.style.zoom).toBe("1.15"));
    await user.selectOptions(feld(), "100");
    await waitFor(() => expect(document.body.style.zoom).toBe(""));
    expect(document.body.style.width).toBe("");
  });

  it("die Wurzel traegt keine Viewport-Breite mehr", () => {
    const quelltext = readFileSync(path.resolve(process.cwd(), "src/App.tsx"), "utf8");
    expect(quelltext.includes("w-screen"), "src/App.tsx nutzt w-screen - 100vw skaliert mit zoom und laeuft seitlich ueber").toBe(false);
    expect(quelltext.includes("w-full"), "src/App.tsx: der Wurzeltraeger soll w-full tragen (folgt dem Leib)").toBe(true);
  });
});
