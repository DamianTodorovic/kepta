// @vitest-environment node
// #83 (1) — ein Begriff ist ein Name, kein Satz und kein Code.
//
// Gemessen an seiner laufenden Tuer (Port 51198, Bestand 21.066 Notizen,
// 1.530 Begriffe / 1.666 Kanten, Fenster 500 / 979, jede Kante `mentions`):
// von den 500 gelieferten Knoten tragen 133 einen Gedankenstrich, 109 einen
// Schraegstrich (das sind die Stueckel-Titel des Scans: „blender_manifest — 1/2"),
// 92 einen Doppelpunkt, 101 sind laenger als 34 Zeichen, 184 haben vier oder mehr
// Woerter. Mittlere Laenge 23,6, laengster Name 48 Zeichen. Das ist kein
// Layout-Problem, das ist der Vorrat: die Flaeche zeigt Protokollzeilen als Begriffe.
//
// Die Beispiele unten sind seine eigenen, wortreich aus /api/graph gelesen
// (audit-2026-10-09/a1x-code/graph-fetzen-sonde.mts, Protokoll
// /tmp/a1x-graph/fetzen-4.txt) — nicht ein Muster, das ich mir ausdachte.
//
// Regel, die ich baue: ein Begriff darf nur Buchstaben, Ziffern, Leer, Punkt,
// Bindestrich, Und und Apostroph tragen, hoechstens 40 Zeichen und vier Woerter,
// und darf kein Label („server:"), kein Pfad („1/2"), keine Zuweisung
// („version = \"5.1.0\""), keine Klammer und kein Satz sein.
import { describe, it, expect } from "vitest";
import { begriffeAusText } from "../../src/core/begiffe";

describe("SATZ_BRUCH — ein Kopfzeilen-Fetzen wird kein Begriff", () => {
  const muell = [
    "je anbieter: alle kanäle, auch die leeren",
    "w1 reichweiten-sonde — abruftag 2026-10-14",
    "server: knoten 14702",
    "gesäet in 7,3 s",
    "serverprotokoll:",
    "blender_manifest — 1/2",
    "# * network (for internet access)",
    "# optional: required by some licenses.",
    "supported types: \"add-on\", \"theme\"",
    "\"2002-2024 developer name\"",
    "blender_version_max = \"5.1.0\"",
    "clipboard = \"copy and paste bone transforms\"",
  ];
  for (const zeile of muell) {
    it(`weist "${zeile}" ab`, () => {
      expect(begriffeAusText(`## ${zeile}`), `${zeile} ist ein Begriff geworden`).toEqual([]);
    });
  }

  it("weist einen Code-Kopf ab, auch ohne Ueberschriftszeile", () => {
    expect(begriffeAusText("[permissions]\n\n{ build = true }")).toEqual([]);
  });
});

describe("Echte Begriffe bleiben — der Filter darf nicht alles fressen", () => {
  const gut = [
    "Client Portal",
    "Mara Lind",
    "Q4 Close",
    "Lumen & Co.",
    "Backup Schedule",
    "Office Move Checklist",
    "Castell Dental",
    "Staging Server",
    "Agent Skills",
    "Docker",
    "Nordwind Logistics",
    "Sicherung",
  ];
  it(`haelt alle ${gut.length} Namen`, () => {
    const text = gut.map((g) => `## ${g}`).join("\n\n");
    const treffer = begriffeAusText(text);
    for (const name of gut) {
      expect(treffer, `"${name}" fiel durch den Filter`).toContain(name.toLowerCase());
    }
  });

  it("ein Wiki-Link mit Anzeigeteil bleibt beim Ziel", () => {
    expect(begriffeAusText("Siehe [[Client Portal | Portal]].")).toEqual(["client portal"]);
  });
});

describe("Begrenzung nach Mass, nicht nach Glueck", () => {
  it("40 Zeichen sind die Laenge, 41 sind ein Satz", () => {
    expect(begriffeAusText(`## ${"a".repeat(20)} ${"b".repeat(19)}`)).toHaveLength(1); // 40
    expect(begriffeAusText(`## ${"a".repeat(20)} ${"b".repeat(20)}`)).toEqual([]); // 41
  });

  it("vier Woerter gehen, fuenf sind ein Satz", () => {
    expect(begriffeAusText("## Fristen der Adler GmbH")).toEqual(["fristen der adler gmbh"]);
    expect(begriffeAusText("## Fristen der Adler GmbH Nord")).toEqual([]);
  });

  it("ein Punkt am Ende macht den Kopf zum Satz", () => {
    expect(begriffeAusText("## Backup laeuft nachts.")).toEqual([]);
    expect(begriffeAusText("## Backup nachts um 3")).toEqual(["backup nachts um 3"]);
  });
});
