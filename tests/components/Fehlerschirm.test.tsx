// @vitest-environment jsdom
//
// Damians Befund vom 15.10. 16:24: „wenn ich das umstellen möchte kommt ein
// grauer Screen." Die App hatte bis hierhin **keinen** Fehlerrand — ein einziger
// Wurf im Render baute bei React das ganze Blatt ab, und was bleibt, ist ein
// graues Fenster ohne Satz, ohne Knopf und ohne Meldung. Genau das ist die
// Klasse, die hier schliesst: nicht der eine Fehler, sondern das Schweifen
// danach.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { Fehlerschirm } from "../../src/components/Fehlerschirm";

let wirft = true;
function Boesch() {
  if (wirft) throw new Error("Zerfalle-Test");
  return <p>das Blatt lebt</p>;
}

afterEach(() => {
  wirft = true;
  vi.restoreAllMocks();
});

describe("Fehlerschirm: ein Wurf im Render darf kein graues Fenster sein", () => {  it("nennt den Fehler und lässt etwas sehen, statt das Blatt abzubauen", () => {
    const schrei = vi.spyOn(console, "error").mockImplementation(() => {});
    const view = render(<Fehlerschirm><Boesch /></Fehlerschirm>);
    const feld = view.container.querySelector('[data-testid="fehlerschirm"]');
    expect(feld, "ein Render-Wurf darf das Fenster leer zurücklassen").not.toBeNull();
    expect(feld!.textContent, "die Meldung muss sagen, was kaputt ist").toContain("Zerfalle-Test");
    expect(schrei.mock.calls.length, "der Fehler muss in die Konsole, nicht nur ins Blatt").toBeGreaterThan(0);
  });

  it("ein Knopf bringt die Fläche zurück, sobald der Grund weg ist", () => {
    const schrei = vi.spyOn(console, "error").mockImplementation(() => {});
    const view = render(<Fehlerschirm><Boesch /></Fehlerschirm>);
    expect(view.container.textContent).toContain("Zerfalle-Test");
    wirft = false;
    const knopf = view.container.querySelector<HTMLButtonElement>('[data-testid="fehlerschirm-weiter"]');
    expect(knopf, "ohne Ausgang ist ein Fehlerbild eine Sackgasse").not.toBeNull();
    fireEvent.click(knopf!);
    expect(view.container.textContent, "nach dem Weiter muss die Fläche wieder da sein").toContain("das Blatt lebt");
    expect(view.container.querySelector('[data-testid="fehlerschirm"]')).toBeNull();
    schrei.mockRestore();
  });
});

// Punkt 7 (Fehler-Feger #31, 4.11. 23:45): dieser Rand ist englisch bis auf ein Wort. Der
// Rand nennt den Wurf mit Absicht (Fall 1) — aber wenn er nichts zu nennen hat, stand bisher
// ein deutsches Wort auf einer englischen Flaeche. Ein Wort, das niemand in dieser App
// bestellte, und ein Mischsatz, den der Nutzer nicht als eigne Sprache wiedererkennt.
describe("Fehlerschirm: die Flaeche bleibt in einer Sprache", () => {
  it("nennt einen Grund ohne Wort nicht auf Deutsch", () => {
    const schrei = vi.spyOn(console, "error").mockImplementation(() => {});
    function Stumm(): never { throw new Error(""); }
    const view = render(<Fehlerschirm><Stumm /></Fehlerschirm>);
    const feld = view.container.querySelector('[data-testid="fehlerschirm"]');
    expect(feld, "auch ohne Wort bleibt ein Fehlerbild ein Fehlerbild").not.toBeNull();
    const text = feld!.textContent ?? "";
    expect(text, "die Flaeche der App ist englisch — ein einzelnes deutsches Wort ist ein Lesefehler").not.toMatch(/Ursache|unbekannt/i);
    expect(text, "ohne Wort nennt der Rand die Stelle, statt leer zu stehen").toMatch(/at /);
    schrei.mockRestore();
  });
});
