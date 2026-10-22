// @vitest-environment jsdom
//
// Punkt 5, Schlag 22.10. abends — das Regal nennt die Mensch-Frage ueber ihrem Band.
//
// Geprueft wird der Text AN DER FLAECHTE: `textContent` des Bandes, nicht ein Wort im Quelltext.
// Zwei Dinge muessen stehen, damit ein Band eine Auskunft ist und nicht ein Schmuck: die Frage in
// Menschensprache ("what you work on") und ein Wort dafuer, was ein Klick oeffnet. Eine Gruppe,
// die nichts trifft, bleibt stehen und sagt in einem Wort, warum sie null ist.
//
// Vorher rot, gefahren gegen `813db8e` (3.2.36): das Band heisst dort "grouped by your tags" und
// sagt "carry a group you made" — keine Frage, kein Oeffnen, und die Null bleibt ohne Grund.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { GraphRegal } from "../../src/components/GraphRegal";
import { baueRegal } from "../../src/lib/graphHierarchy";
import { achseFuerMenschen, zaehleGruppen, ACHSEN } from "../../src/lib/gruppen";
import type { Memory } from "../../src/types";

function notiz(id: string, tags: string[], text: string): Memory {
  return { id, userId: "local", title: id, content: text, tags, createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000 } as Memory;
}

function bestand(): Memory[] {
  return [
    notiz("a", ["werkstatt"], "Plan fuer die Werkstatt — Projekt und Frist"),
    notiz("b", ["werkstatt"], "Werkstatt: was fehlt — Projekt"),
    notiz("c", ["anna", "werkstatt"], "Gespraech mit Anna ueber die Werkstatt"),
    notiz("d", ["bert"], "Bert hat angerufen"),
    notiz("e", [], "Ein Gedanke ohne Marke"),
  ];
}

function regalMit(marken: string[]) {
  const gruppen = zaehleGruppen(bestand(), { marken, farben: {} });
  const regal = baueRegal(bestand());
  const achsen = achseFuerMenschen(bestand(), gruppen, regal.wann);
  render(<GraphRegal regal={regal} ansichtsName="the tree" gruppen={gruppen} achsen={achsen} />);
  return { gruppen, achsen };
}

afterEach(cleanup);

describe("regal: ein Band ist eine Frage, kein Fachwort", () => {
  it("ueber dem Arbeits-Band steht die Mensch-Frage", () => {
    regalMit(["werkstatt"]);
    const band = screen.getByTestId("regal-farbgruppe");
    const frage = ACHSEN.find((a) => a.id === "arbeit")?.frage ?? "";
    expect(frage.length).toBeGreaterThan(0);
    expect(band.textContent, "das Band nennt keine Frage").toContain(frage);
  });

  it("das Band sagt, was ein Klick oeffnet", () => {
    regalMit(["werkstatt"]);
    const band = screen.getByTestId("regal-farbgruppe");
    expect(band.textContent?.toLowerCase(), "kein Oeffnen-Wort am Band").toMatch(/open/);
  });

  it("die Zahl des Bandes ist die Zahl des Modells, im selben Lauf", () => {
    const { gruppen } = regalMit(["werkstatt"]);
    const band = screen.getByTestId("regal-farbgruppe");
    const gedeckt = gruppen.bestand - gruppen.ohneGruppe;
    expect(band.textContent).toContain(`${gedeckt} of ${gruppen.bestand}`);
    // Und die Bestandsgroesse steht in diesem Band nur einmal — zwei Zahlen derselben Menge
    // an einem Ort sind der Fehler, den Damians Bild von 19:02 zeigt.
    const nenne = (band.textContent ?? "").match(new RegExp(String(gruppen.bestand), "gu")) ?? [];
    expect(nenne.length, "dieselbe Menge zweimal im selben Band").toBeLessThanOrEqual(1);
  });

  it("eine Gruppe, die nichts trifft, sagt in einem Wort warum", () => {
    regalMit(["nichts-von-allem"]);
    const band = screen.getByTestId("regal-farbgruppe");
    expect(band.textContent).toMatch(/no note carries it/i);
    expect(screen.getAllByTestId("regal-farbgruppe-zeile")).toHaveLength(1);
  });

  it("die Zeit-Achse spricht dasselbe Wort wie das Modell", () => {
    regalMit(["werkstatt"]);
    const band = screen.getByTestId("regal-wann");
    const frage = ACHSEN.find((a) => a.id === "zeit")?.frage ?? "";
    expect(band.textContent?.toLowerCase(), "kein Achsenwort ueber der Zeit").toContain(frage.toLowerCase());
  });
});
