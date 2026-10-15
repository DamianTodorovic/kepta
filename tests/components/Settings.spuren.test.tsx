// @vitest-environment jsdom
//
// Damians Befund vom 15.10. 16:24, mit Bild: „in den Einstellungen kann ich das
// auch nicht umstellen, denn wenn ich das umstellen möchte kommt ein grauer
// Screen." Gemeint sind die drei Retrieval-Beine (BM25 / Vektoren / Graph) —
// gebaut in Paket 2, gemessen in #85. Ein Schirm, der beim ersten Klick ins
// Graue fällt, ist kein Stilfehler, sondern ein Wurf im Render: React baut dann
// das ganze Blatt ab, und der Nutzer steht vor einer leeren Anwendung.
//
// Die Fälle unten klicken genau die eine Steuerung, die er zeigt, und verlangen
// zwei Dinge: dass der Wert sich dreht, und dass danach **etwas zu sehen ist**.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { Settings } from "../../src/components/Settings";
import { leseSuchPrefs } from "../../src/lib/searchPrefs";

type Spur = "spurBm25" | "spurVektor" | "spurGraph";
const SPUREN: Array<[string, Spur]> = [
  ["Track BM25", "spurBm25"],
  ["Track Vectors", "spurVektor"],
  ["Track Graph", "spurGraph"],
];

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Einstellungen: die drei Beine lassen sich umstellen, ohne dass der Schirm fällt", () => {
  it.each(SPUREN)("%s geht aus und wieder an, und das Blatt bleibt gefüllt", (marke, schluessel) => {
    const view = render(<Settings />);
    const feld = () => view.container.querySelector<HTMLInputElement>(`input[aria-label="${marke}"]`);
    expect(feld(), `die Steuerung "${marke}" fehlt auf der Seite`).not.toBeNull();
    expect(leseSuchPrefs()[schluessel], "ein Bein steht beim ersten Oeffnen an").toBe(true);

    fireEvent.click(feld()!);
    expect(leseSuchPrefs()[schluessel], "der Klick hat den Wert nicht geschrieben").toBe(false);
    expect(view.container.textContent, "nach dem Klick ist nichts mehr zu sehen — das ist der graue Schirm").not.toBe("");
    expect(feld(), "die Steuerung ist nach dem Klick aus dem Blatt verschwunden").not.toBeNull();

    fireEvent.click(feld()!);
    expect(leseSuchPrefs()[schluessel], "zweiter Klick stellt wieder an").toBe(true);
    expect(view.container.textContent).not.toBe("");
  });
});
