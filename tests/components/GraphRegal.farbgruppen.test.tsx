// @vitest-environment jsdom
//
// Punkt 5, Auftrag G-72, zweite Haelfte — das Regal nennt die Zahl des Modells, keine eigne.
//
// Die Latte des Briefs ist ein Bild, das faellt: **eine Gruppe, die nur im Regal erscheint,
// wirft diesen Fall.** Darum prueft der erste Fall nicht das Aussehen, sondern die Gleichheit:
// Zeile fuer Zeile dieselbe Marke, dieselbe Zahl, und die Zahl der Zeilen gleich der Zahl der
// Gruppen im Modell. Ein Regal, das eigenzaehlt oder eigen erfindet, faellt hier — nicht im
// Nachher, sondern an der Zahl.
//
// Der dritte Fall haelt die andre Richtung: ohne Modell sagt das Regal nichts. Kein Band, keine
// halbe Zahl, kein Wort, das eine Messung vortauscht, die niemand gefaehrt hat.
//
// Gegen den Stand `9c64db4` (3.2.34) gefahren: **rot** — das Band existiert nicht, also findet
// die Sonde keine Zeile. Der Grund steht im Protokoll dieser Hand.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { GraphRegal } from "../../src/components/GraphRegal";
import { baueRegal } from "../../src/lib/graphHierarchy";
import { zaehleGruppen } from "../../src/lib/gruppen";
import type { FarbGruppen, GruppenSteuerung } from "../../src/lib/gruppen";
import type { Memory } from "../../src/types";

function notiz(id: string, tags: string[]): Memory {
  return { id, userId: "local", title: id, content: "leib", tags, createdAt: 1, updatedAt: 1 } as Memory;
}

const bestand: Memory[] = [
  notiz("a", ["client-x", "md"]),
  notiz("b", ["client-x"]),
  notiz("c", ["shop"]),
  notiz("d", ["shop", "client-x"]),
  notiz("e", ["ohne-gruppe"]),
];

function modell(marken: string[]): FarbGruppen {
  return zaehleGruppen(bestand, { marken, farben: {} });
}

afterEach(cleanup);

describe("regal: die vierte Zeile nennt die Zahl des Modells", () => {
  it("eine Zeile je Gruppe, mit derselben Marke und derselben Zahl", () => {
    const m = modell(["client-x", "shop", "vergessen"]);
    render(<GraphRegal regal={baueRegal(bestand)} ansichtsName="the tree" gruppen={m} />);
    const zeilen = screen.getAllByTestId("regal-farbgruppe-zeile");
    // Zeilenanzahl gleich Gruppenzahl: eine Gruppe, die nur im Regal steht, faellt hier.
    expect(zeilen).toHaveLength(m.gruppen.length);
    m.gruppen.forEach((g, i) => {
      const text = zeilen[i].textContent ?? "";
      expect(text).toContain(g.marke);
      expect(text).toContain(String(g.notizen));
    });
    // Und die Kopfzeile nennt dieselbe gedeckte Zahl wie das Modell.
    const band = screen.getByTestId("regal-farbgruppe");
    expect(band.textContent).toContain(String(m.bestand - m.ohneGruppe));
  });

  it("eine geleerte Gruppe bleibt stehen und sagt ihre Null", () => {
    const m = modell(["client-x", "vergessen"]);
    render(<GraphRegal regal={baueRegal(bestand)} ansichtsName="the tree" gruppen={m} />);
    const zeilen = screen.getAllByTestId("regal-farbgruppe-zeile");
    expect(zeilen).toHaveLength(2);
    const leer = zeilen.find((z) => (z.textContent ?? "").includes("vergessen"));
    expect(leer?.textContent).toContain("vergessen");
    expect(leer?.textContent).toMatch(/0/);
  });

  it("ohne Modell gibt es kein Band und keine erfundene Zahl", () => {
    render(<GraphRegal regal={baueRegal(bestand)} ansichtsName="the tree" />);
    expect(screen.queryByTestId("regal-farbgruppe")).toBeNull();
    expect(screen.queryAllByTestId("regal-farbgruppe-zeile")).toHaveLength(0);
    // Die drei vorhandenen Baender bleiben, wo sie sind.
    expect(screen.getByTestId("regal-wann")).toBeTruthy();
    expect(screen.getByTestId("graph-regal")).toBeTruthy();
  });

  it("ein Bau-Knopf ruft die Steuerung, und kein Ziel in diesem Band ist taub", () => {
    const baue = vi.fn();
    const entferne = vi.fn();
    const farbe = vi.fn();
    const steuerung: GruppenSteuerung = { baue, entferne, farbe };
    const m = modell(["shop"]);
    render(
      <GraphRegal regal={baueRegal(bestand)} ansichtsName="the tree" gruppen={m} steuerung={steuerung} />,
    );
    const bauen = screen.getAllByTestId("regal-farbgruppe-bauen");
    expect(bauen.length).toBeGreaterThan(0);
    fireEvent.click(bauen[0]);
    expect(baue).toHaveBeenCalledTimes(1);
    expect(baue).toHaveBeenCalledWith(m.baubar[0].marke);

    const entfernen = screen.getAllByTestId("regal-farbgruppe-loeschen");
    fireEvent.click(entfernen[0]);
    expect(entferne).toHaveBeenCalledWith("shop");

    const farbfeld = screen.getAllByTestId("regal-farbgruppe-farbe");
    fireEvent.change(farbfeld[0], { target: { value: "#40ff90" } });
    expect(farbe).toHaveBeenCalledWith("shop", "#40ff90");

    // Die Lektion von 3.2.34: ein Ziel in einer Zeiger-losen Flaeche ist kein Ziel, und ein
    // Ziel unter der Steuerungs-Latte des Hauses ist keine Hand.
    const zeiger = [
      ...screen.getAllByTestId("regal-farbgruppe-bauen"),
      ...screen.getAllByTestId("regal-farbgruppe-loeschen"),
    ];
    for (const z of zeiger) {
      const k = z as HTMLElement;
      expect(k.style.pointerEvents).toBe("auto");
      expect(Number.parseInt(k.style.minHeight || "0", 10)).toBeGreaterThanOrEqual(44);
    }
    for (const f of screen.getAllByTestId("regal-farbgruppe-farbe")) {
      expect((f as HTMLElement).style.pointerEvents).toBe("auto");
    }
  });

  it("wo keine Gruppe gesetzt ist, nennt das Band die Wahl statt zu schweigen", () => {
    const m = modell([]);
    const steuerung: GruppenSteuerung = { baue: vi.fn(), entferne: vi.fn(), farbe: vi.fn() };
    render(
      <GraphRegal regal={baueRegal(bestand)} ansichtsName="the tree" gruppen={m} steuerung={steuerung} />,
    );
    const band = screen.getByTestId("regal-farbgruppe");
    expect(band.textContent).toContain("no groups yet");
    expect(screen.getAllByTestId("regal-farbgruppe-bauen").length).toBe(m.baubar.length);
    expect(screen.getAllByTestId("regal-farbgruppe-bauen").length).toBeGreaterThan(0);
  });
});
