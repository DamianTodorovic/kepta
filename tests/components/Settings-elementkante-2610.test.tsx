// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Settings } from "../../src/components/Settings";
import { SystemStatus } from "../../src/components/SystemStatus";

// Punkt 107, zweite Haelfte, 26.10.2026. Die Gegenbreite von 3.2.60 hat das BLATT gebaendigt
// (gemessen an 3.2.61 um 16:27:34-16:27:42 MEZ: sechs mal 0 px), aber vier ELEMENTE ragen weiter
// ueber die Fensterkante: bei 390 px und 130 Prozent die MCP-Zeile mit +56,2 px (SPAN und CODE),
// der Auto-learn-Schalter mit +49,2 px und sein Knopf mit +9,9 px - und die Huelle ist bei 130 %
// 1014 px hoch in einem 780-px-Fenster (scrollHeight, dasselbe Protokoll).
// DIESES Blatt prueft nur die REGEL. jsdom kennt kein Layout, also behauptet hier keine Zahl ein
// Pixel: was der Fall nicht beweist, beweist das Bild am Objekt (Sonde
// belege-2610/p4-107-elementkante/). Die Regel ist: eine Achse, die mit zoom skaliert, bekommt die
// Gegenrechnung; ein Kind, das in einer Zeile sitzt, darf durch seinen Laengstwert die Zeile nicht
// aufblasen; und geheilt wird NICHT mit overflow-hidden, weil das ein scrollWidth-Urteil nie aufhebt.

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
  document.body.style.height = "";
  stubFetch();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.style.zoom = "";
  document.body.style.width = "";
  document.body.style.height = "";
});

const feld = () => screen.getByLabelText(/Text size/i) as HTMLSelectElement;

/** Die Engine rechnet `calc(100% / 1,15)` zu `calc(86.9565%)` um - verglichen wird die Zahl hinter
 *  dem Prozent, nicht die Schreibweise. Ist die Achse gar nicht gesetzt, ist die Zahl keine Zahl
 *  und der Fall verliert (NaN ist von nichts klein). */
function prozentVon(achse: "width" | "height"): number {
  const roh = /([\d.]+)\s*%/.exec(document.body.style[achse] || "");
  return roh ? Number(roh[1]) : Number.NaN;
}

function quelltext(relativPfad: string): string {
  return readFileSync(path.resolve(process.cwd(), relativPfad), "utf8");
}

describe("Punkt 107, zweite Haelfte: Kante und Hoehe der Einstell-Flaeche", () => {
  it("115 % rechnet BEIDE Achsen gegen, nicht nur die Breite", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.selectOptions(feld(), "115");
    await waitFor(() => expect(document.body.style.zoom).toBe("1.15"));
    expect(Math.abs(prozentVon("width") - 100 / 1.15)).toBeLessThan(0.01);
    expect(Math.abs(prozentVon("height") - 100 / 1.15)).toBeLessThan(0.01);
  });

  it("130 % rechnet BEIDE Achsen gegen", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.selectOptions(feld(), "130");
    await waitFor(() => expect(document.body.style.zoom).toBe("1.3"));
    expect(Math.abs(prozentVon("width") - 100 / 1.3)).toBeLessThan(0.01);
    expect(Math.abs(prozentVon("height") - 100 / 1.3)).toBeLessThan(0.01);
  });

  it("Gegenprobe 100 %: zoom, Gegenbreite und Gegenhoehe sind weg", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.selectOptions(feld(), "130");
    await waitFor(() => expect(document.body.style.zoom).toBe("1.3"));
    await user.selectOptions(feld(), "100");
    await waitFor(() => expect(document.body.style.zoom).toBe(""));
    expect(document.body.style.width).toBe("");
    expect(document.body.style.height).toBe("");
  });

  it("keine Huelle misst sich in Viewport-Hoehe, solange zoom am Leib sitzt", () => {
    const app = quelltext("src/App.tsx");
    expect(app.includes("h-screen"), "src/App.tsx: h-screen ist 100vh - bei 130 % 1014 px in einem 780-px-Fenster").toBe(false);
    expect(app.includes("h-full"), "src/App.tsx: die Wurzel soll h-full tragen und damit der Gegenhoehe folgen").toBe(true);
    const fehler = quelltext("src/components/Fehlerschirm.tsx");
    expect(fehler.includes("min-h-screen"), "Fehlerschirm: dieselbe Art Stelle - min-h-screen skaliert mit zoom").toBe(false);
    const css = quelltext("src/index.css");
    expect(css.includes("min-height: 100vh"), "index.css: #root darf kein 100vh mehr als Untergrenze nennen").toBe(false);
    expect(css.includes("height: 100%"), "index.css: html und body muessen die Hoehe durchreichen, damit 100 % eine Groesse hat").toBe(true);
  });

  it("die MCP-Zeile laesst der URL nicht ihre Laenge als Untergrenze", () => {
    const { container } = render(<SystemStatus />);
    const span = Array.from(container.querySelectorAll("span")).find(
      (e) => (e.textContent || "").trim().startsWith("Or HTTP:"),
    );
    expect(span, "die MCP-Zeile (Or HTTP:) ist nicht gerendert").toBeTruthy();
    expect(span!.classList.contains("min-w-0"), "der Span der MCP-Zeile braucht min-w-0, sonst ist sein Laengstwert seine Breite").toBe(true);
    const code = span!.querySelector("code");
    expect(code, "in der MCP-Zeile fehlt das code-Feld mit der URL").toBeTruthy();
    expect(code!.classList.contains("break-all"), "die URL muss brechen koennen - sonst steht sie ueber der Fensterkante").toBe(true);
  });

  it("die Auto-learn-Zeile rueckt: Schalter und Text teilten sich nicht dieselbe Zeile", () => {
    render(<Settings />);
    const schalter = screen.getByLabelText("Auto-learn");
    const label = schalter.closest("label");
    expect(label, "der Auto-learn-Schalter hat kein label als Hueller").toBeTruthy();
    const zeile = label!.parentElement;
    expect(zeile, "die Auto-learn-Zeile hat keinen Elternblock").toBeTruthy();
    expect(zeile!.classList.contains("flex-wrap"), "die Zeile braucht flex-wrap, damit der Schalter auf eine eigne Zeile rueckt").toBe(true);
    // Der Textblock wird am Wort gesucht, nicht an der Klasse: die Sonde darf
    // nicht nach dem fragen, was sie gleich behauptet. Zwischen der Zeile und dem
    // Textblock liegt noch ein Block fuer Icon und Text zusammen. Uehnliches
    // Finden nach Kindern der Zeile erwischte ihn und meldete einen fehlenden
    // `break-words`, den die Flaeche langst trug.
    const titel = Array.from(zeile!.querySelectorAll("div")).find(
      (d) => d.childElementCount === 0 && (d.textContent || "").trim() === "Learn automatically"
    );
    expect(titel, "kein Titel-Wort in der Zeile, an dem der Textblock zu finden waere").toBeTruthy();
    const textblock = titel!.parentElement;
    expect(textblock, "der Titel hat keinen Textblock als Hueller").toBeTruthy();
    expect(textblock!.classList.contains("min-w-0"), "der Textblock braucht min-w-0, sonst blaest er die Zeile auf").toBe(true);
    expect(textblock!.classList.contains("break-words"), "min-w-0 kappt die Box, nicht die Tinte - ohne break-words malt das laengste Wort in die Polsterung").toBe(true);
  });

  it("kein overflow-hidden als Heilung an den zwei angeklagten Stellen", () => {
    const { container } = render(<SystemStatus />);
    render(<Settings />);
    const span = Array.from(container.querySelectorAll("span")).find(
      (e) => (e.textContent || "").trim().startsWith("Or HTTP:"),
    )!;
    let knoten: HTMLElement | null = span;
    const kette: string[] = [];
    while (knoten && knoten !== container) {
      kette.push(String(knoten.className || ""));
      knoten = knoten.parentElement;
    }
    const kappt = kette.find((k) => /(^|\s)(overflow-hidden|overflow-x-hidden)(\s|$)/.test(k));
    expect(kappt, "ein Vorfahr der MCP-Zeile kaappt mit overflow - das hebt ein scrollWidth-Urteil nie auf").toBeUndefined();
    const zeile = screen.getByLabelText("Auto-learn").closest("label")!.parentElement!;
    expect(/(^|\s)overflow(-x)?-hidden(\s|$)/.test(String(zeile.className)), "die Auto-learn-Zeile kaappt statt zu ruecken").toBe(false);
  });
});
