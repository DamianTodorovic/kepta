// P-11: die Herkunft als Farbkanal.
//
// Cognee färbt seine Knoten „by Type, Node set, or User". Bei K3PTA trägt die
// Fläche eine einzige Farbe: die Art. Dabei weiss die Wissensbasis sehr wohl,
// woher eine Notiz kommt — der Posteinggang stempelt `auto-import`/`inbox`,
// der Rechner-Scan stempelt `machine-scan`, und was niemand stempelt, wurde in
// K3PTA geschrieben.
//
// Der Vertrag, der diese Datei zähmt: Herkunft ist eine Auskunft, kein
// Lückenbüsser. Wo nichts zu unterscheiden ist, sagt das die Fläche — sie malt
// nicht alles in „Unbekannt".

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  herkunftsBild,
  HERKUNFT,
  HERKUNFT_LABELS,
  HERKUNFT_SATZ,
  HERKUNFT_TOKEN,
  type HerkunftsArt,
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

  it("nennt eine Notiz ohne Stempel beim Namen: in K3PTA geschrieben", () => {
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
    expect(bild.grund).toMatch(/written in K3PTA/i);
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
  // Der Kanal nennt nur noch Token-Namen. Ein Hex-Literal hier war der Befund
  // aus B1s Bildarbeit: vier Werte in der Komponente, ein Kommentar, der
  // „alle ≥ 4,65" sagte, und ein Bild, das 3,91 maß. Seitdem rechnet die
  // design-wache die Palette in src/index.css — dieser Test hält die Brücke
  // zwischen beiden Seiten: jeder Name, den die Fläche malt, muss dort stehen.
  const css = fs.readFileSync(path.join(process.cwd(), "src/index.css"), "utf-8");

  it("gibt jeder Herkunft einen eigenen Token", () => {
    const namen = Object.values(HERKUNFT) as HerkunftsArt[];
    const tokens = namen.map((a) => HERKUNFT_TOKEN[a]);
    expect(new Set(tokens).size).toBe(tokens.length);
    for (const t of tokens) expect(t).toMatch(/^--type-herkunft-[a-z]+$/);
  });

  it("malt beide Kanäle aus dem Register, nicht aus der Quelle", () => {
    for (const t of Object.values(HERKUNFT_TOKEN)) {
      // oklch-Stufe für jeden CSS-Verbraucher …
      expect(css, `${t} fehlt im Register`).toContain(`${t}:`);
      // … und der sRGB-Kanal für Leinwand und Farbregler
      expect(css, `${t}-hex fehlt im Register`).toContain(`${t}-hex:`);
    }
  });

  it("benennen jede Herkunft in der Sprache der Fläche", () => {
    expect(HERKUNFT_LABELS[HERKUNFT.geschrieben]).toBe("Written in K3PTA");
    expect(HERKUNFT_LABELS[HERKUNFT.datei]).toBe("From a file");
    expect(HERKUNFT_LABELS[HERKUNFT.rechner]).toBe("From this computer");
  });

  // Hausregel 14.10., von der Leitung gesetzt: kein Eigenname darf durch eine
  // Kasus-Biegung laufen. Der Satz wurde mit ${LABEL.toLowerCase()} gebaut und ergibt
  // „written in k3pta". Der alte Fall ließ das durch, weil er /…/i schrieb — ein
  // Prüfer ohne Kasus sieht keinen Kasusfehler.
  it("biegt die Marke nicht klein, wenn der Satz sie einbettet", () => {
    const bild = herkunftsBild([{ id: "a", tags: [] }, { id: "b", tags: [] }] as never[]);
    expect(bild.grund, `Satz lautet: ${bild.grund}`).toContain("written in K3PTA");
  });

  it("rechnet keine Herkunftsform — die Satzeinbettung steht geschrieben", () => {
    const quelltext = fs.readFileSync(path.join(process.cwd(), "src/lib/graphHerkunft.ts"), "utf8");
    expect(quelltext, "ein .toLowerCase() an einer Herkunft biegt die Marke klein")
      .not.toMatch(/HERKUNFT_LABELS\[[^\]]*\]\.toLowerCase\(\)/);
    for (const [, satz] of Object.entries(HERKUNFT_SATZ)) {
      expect(satz, `Satzform beginnt groß: ${satz}`).not.toMatch(/^[A-Z]/);
      if (/k3pta/i.test(satz)) expect(satz, `Marke klein gebogen: ${satz}`).toContain("K3PTA");
    }
    expect(HERKUNFT_SATZ[HERKUNFT.geschrieben]).toBe("written in K3PTA");
  });
});
