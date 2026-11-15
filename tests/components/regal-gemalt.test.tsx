// @vitest-environment jsdom
//
// Punkt 5, Zelle 24.10. (#90) — die Zeile nennt die Zahl, die WIRKLICH gemalt wird.
//
// Der Defekt: `json` traegt am Bestand 8 485 Mitglieder und **0 Knoten in Beere** (gemessen
// 24.10., 00:39, 1440/390). Die Zeile versprach die Farbe ohne die Zahl. Dieser Fall haelt
// beide Richtungen: eine Gruppe mit 0 gemalten Knoten sagt "0 painted", eine mit allen
// Mitgliedern sagt ihre volle Zahl — und ohne gemalte Zahlen steht gar keine Zelle.
//
// Gegen den Stand f366bc9 (3.2.49) gefahren: **rot** — `gemalteZahlen` gibt es dort nicht,
// und die Zeile traegt kein "painted". Der rote Lauf steht im Protokoll der Hand.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { GraphRegal } from "../../src/components/GraphRegal";
import { baueRegal } from "../../src/lib/graphHierarchy";
import { zaehleGruppen, gruppenBild, gemalteZahlen } from "../../src/lib/gruppen";
import type { Memory } from "../../src/types";

function notiz(id: string, tags: string[]): Memory {
  return { id, userId: "local", title: id, content: "leib", tags, createdAt: 1, updatedAt: 1 } as Memory;
}

/** Drei Notizen tragen `machine-scan` UND `json`; gemalt wird nur die erste Marke. */
const bestand: Memory[] = [
  notiz("a", ["machine-scan", "json"]),
  notiz("b", ["machine-scan", "json"]),
  notiz("c", ["machine-scan"]),
  notiz("d", ["kepta"]),
];
const EINSTELLUNG = { marken: ["machine-scan", "json", "kepta"], farben: {} };

afterEach(cleanup);

describe("Regal: die gemalte Zahl (#90)", () => {
  it("zaehlt aus der Zuordnung, nicht aus der Mitgliedschaft", () => {
    const m = zaehleGruppen(bestand, EINSTELLUNG);
    const gemalt = gemalteZahlen(m.gruppen, gruppenBild(bestand, m));
    expect(m.gruppen.find((g) => g.marke === "json")?.notizen, "json-Mitglieder").toBe(2);
    expect(gemalt.json, "json gemalt").toBe(0);
    expect(gemalt["machine-scan"]).toBe(3);
    expect(gemalt.kepta).toBe(1);
    // Jede Notiz, die eine Gruppe traegt, wird genau einmal gezaehlt.
    expect(Object.values(gemalt).reduce((s, n) => s + n, 0)).toBe(4);
  });

  it("die Zeile nennt die gemalte Zahl neben der Mitgliederzahl", () => {
    const m = zaehleGruppen(bestand, EINSTELLUNG);
    const gemalt = gemalteZahlen(m.gruppen, gruppenBild(bestand, m));
    render(<GraphRegal regal={baueRegal(bestand)} ansichtsName="the tree" gruppen={m} gemalt={gemalt} />);
    const zeilen = screen.getAllByTestId("regal-farbgruppe-zeile");
    const json = zeilen.find((z) => (z.textContent ?? "").includes("#json"));
    expect(json?.textContent, "json-Zeile").toContain("0 painted");
    const ms = zeilen.find((z) => (z.textContent ?? "").includes("#machine-scan"));
    expect(ms?.textContent, "machine-scan-Zeile").toContain("3 painted");
    expect(screen.getAllByTestId("regal-farbgruppe-gemalt")).toHaveLength(3);
  });

  it("ohne gemalte Zahlen steht keine halbe Wahrheit — gar keine Zelle", () => {
    const m = zaehleGruppen(bestand, EINSTELLUNG);
    render(<GraphRegal regal={baueRegal(bestand)} ansichtsName="the tree" gruppen={m} />);
    expect(screen.queryAllByTestId("regal-farbgruppe-gemalt")).toHaveLength(0);
  });
});
