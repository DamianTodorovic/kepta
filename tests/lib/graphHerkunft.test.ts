// P-11: die Herkunft als Farbkanal.
//
// Cognee färbt seine Knoten „by Type, Node set, or User". Bei KEPTA trägt die
// Fläche eine einzige Farbe: die Art. Dabei weiss die Wissensbasis sehr wohl,
// woher eine Notiz kommt — der Posteinggang stempelt `auto-import`/`inbox`,
// der Rechner-Scan stempelt `machine-scan`, und was niemand stempelt, wurde in
// KEPTA geschrieben.
//
// Der Vertrag, der diese Datei zähmt: Herkunft ist eine Auskunft, kein
// Lückenbüsser. Wo nichts zu unterscheiden ist, sagt das die Fläche — sie malt
// nicht alles in „Unbekannt".

import { describe, it, expect } from "vitest";
import {
  herkunftsBild,
  HERKUNFT,
  HERKUNFT_LABELS,
  HERKUNFT_FARBEN,
  type HerkunftsNotiz,
} from "../../src/lib/graphHerkunft";

const notiz = (id: string, tags: string[]): HerkunftsNotiz => ({ id, tags });

describe("Die Herkunft wird gelesen, nicht erfunden", () => {
  it("erkennt eine Datei aus dem Posteingang", () => {
    expect(herkunftsBild([notiz("a", ["auto-import", "inbox", "pdf"])]).träger.get("a")).toBe(HERKUNFT.datei);
  });

  it("erkennt den Rechner-Scan", () => {
    expect(herkunftsBild([notiz("b", ["machine-scan", "md"])]).träger.get("b")).toBe(HERKUNFT.rechner);
  });

  it("nennt eine Notiz ohne Stempel beim Namen: in KEPTA geschrieben", () => {
    expect(herkunftsBild([notiz("c", ["steuer"])]).träger.get("c")).toBe(HERKUNFT.geschrieben);
  });

  it("hält einen Stempel für einen Stempel, egal zwischen welchen Tags er steht", () => {
    const bild = herkunftsBild([notiz("d", ["steuer", "inbox", "sonstiges"])]);
    expect(bild.träger.get("d")).toBe(HERKUNFT.datei);
  });

  it("erfindet keine vierte Herkunft für ein Wort, das niemand schreibt", () => {
    const bild = herkunftsBild([notiz("e", ["machine-scan-ish", "inbox-2"])]);
    expect(bild.träger.get("e")).toBe(HERKUNFT.geschrieben);
  });
});

describe("Der Kanal sagt, wann er nichts zu sagen hat", () => {
  it("ist abgeschaltet, wenn alles aus derselben Hand kommt", () => {
    const bild = herkunftsBild([notiz("a", []), notiz("b", ["x"]), notiz("c", ["y"])]);
    expect(bild.verfügbar).toBe(false);
    expect(bild.grund).toMatch(/written in KEPTA/i);
    expect(bild.arten).toEqual([HERKUNFT.geschrieben]);
  });

  it("ist an, sobald zwei Herkünfte im Bestand sind — und nennt beide Zahlen", () => {
    const bild = herkunftsBild([notiz("a", []), notiz("b", ["inbox", "auto-import"]), notiz("c", ["machine-scan"])]);
    expect(bild.verfügbar).toBe(true);
    expect(bild.grund).toBe("");
    expect(bild.zahlen).toEqual({ [HERKUNFT.geschrieben]: 1, [HERKUNFT.datei]: 1, [HERKUNFT.rechner]: 1 });
  });

  it("ordnet die Arten nach der Zahl, nicht nach der Ankunftsreihenfolge", () => {
    const bild = herkunftsBild([
      notiz("a", ["inbox"]),
      notiz("b", ["inbox"]),
      notiz("c", ["inbox"]),
      notiz("d", []),
      notiz("e", ["machine-scan"]),
      notiz("f", ["machine-scan"]),
    ]);
    expect(bild.arten).toEqual([HERKUNFT.datei, HERKUNFT.rechner, HERKUNFT.geschrieben]);
  });

  it("zählt jede Notiz genau einmal", () => {
    const eingabe = [notiz("a", ["inbox"]), notiz("b", []), notiz("c", ["machine-scan", "inbox"])];
    const bild = herkunftsBild(eingabe);
    const summe = bild.arten.reduce((s, x) => s + bild.zahlen[x], 0);
    expect(summe).toBe(eingabe.length);
  });

  it("kommt mit einem leeren Bestand aus, ohne sich abzuschalten wie ein Defekt", () => {
    const bild = herkunftsBild([]);
    expect(bild.verfügbar).toBe(false);
    expect(bild.arten).toEqual([]);
    expect(bild.grund).toMatch(/no notes/i);
  });
});

describe("Die Farben des Kanals", () => {
  it("geben jeder Herkunft eine eigene Farbe", () => {
    const farben = Object.values(HERKUNFT_FARBEN);
    expect(new Set(farben).size).toBe(farben.length);
    for (const f of farben) expect(f).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("benennen jede Herkunft in der Sprache der Fläche", () => {
    expect(HERKUNFT_LABELS[HERKUNFT.geschrieben]).toBe("Written in KEPTA");
    expect(HERKUNFT_LABELS[HERKUNFT.datei]).toBe("From a file");
    expect(HERKUNFT_LABELS[HERKUNFT.rechner]).toBe("From this computer");
  });
});
