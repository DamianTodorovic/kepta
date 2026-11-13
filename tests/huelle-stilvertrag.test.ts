import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Die Hülle der Graph-Fläche besteht aus zwei Hälften, die zusammen gehören: im
// Baum setzt Dashboard die Kleider (`huelle-schmal`, `seiten-leiste`,
// `flaeche-huelle`), in der Stilregel sitzt die Wirkung. Beides lässt sich in
// jsdom nicht an Pixeln messen — dort gibt es keine Layout-Engine. Was sich
// maschinell halten lässt, ist der Vertrag zwischen beiden: ein Kleid ohne
// Regel ist ein Ornament, eine Regel ohne Kleid ist toter Code. Genau so war eine
// Reparatur in einer früheren Welle verloren: die Klasse blieb, die Wirkung zog
// nicht mit.
//
// Die Wirkung selbst ist im echten Browser gemessen (headless Brave + CDP), Vorher/
// Nachher bei 1440/1024/820/390 px — siehe der Messlauf unter
// `audit-2026-10-09/f9-code/` und die Zahlen in `F9-HUELLE-ERSTSTART.md`.

const pfad = path.join(process.cwd(), "src/index.css");
const text = fs.readFileSync(pfad, "utf-8");

/** Alle Regeln des Stylesheets, Kommentare vorher weg. Verschachtelte Blöcke
 *  verlieren dabei ihren @media-Kontext — die Hüllen-Regeln stehen absichtlich
 *  auf oberster Ebene und werden über das Merkmal am Rahmen geschaltet. */
function regeln(): { selektor: string; korper: string }[] {
  const ohne = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: { selektor: string; korper: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ohne)) !== null) {
    out.push({ selektor: m[1].trim().replace(/\s+/g, " "), korper: m[2].trim() });
  }
  return out;
}

/** Erste Regel, deren Selektor alle genannten Teile trägt. */
function regel(...teile: string[]) {
  return regeln().find((r) => teile.every((t) => r.selektor.includes(t)));
}

/** Die Regel, deren Selektor genau die genannten Teile sind (kein Nachfahren-Anhang). */
function regelGenau(...selektoren: string[]) {
  return regeln().find((r) => selektoren.includes(r.selektor));
}

describe("Stilvertrag der Flächen-Hülle", () => {
  it("hält die Leiste der Fläche in einer Zeile (A7-07)", () => {
    const r = regel(".flaeche-huelle", "#graph-search-count");
    expect(r, "die Leiste der Fläche hat keinen Halter").toBeDefined();
    expect(r!.korper, "die Zahlengruppe bricht die Leiste in eine zweite Zeile").toMatch(/flex-wrap:\s*nowrap/);
  });

  it("die Zahlengruppe der Leiste bricht nicht selbst um (A7-07)", () => {
    const r = regeln().find(
      (x) => x.selektor.includes(".flaeche-huelle") && /white-space/.test(x.korper)
    );
    expect(r, "die Zahlengruppe kann brechen, wo der Text zerlegt wird").toBeDefined();
    expect(r!.korper).toMatch(/white-space:\s*nowrap/);
    expect(r!.korper, "ohne Abschneiden fehlt dem Bild die Höhe trotzdem").toMatch(/text-overflow:\s*ellipsis/);
  });

  it("nimmt die Seitenleiste im schmalen Fenster aus der Reihe (A7-06)", () => {
    const r = regel(".huelle-schmal", ".seiten-leiste");
    expect(r, "die Leiste hält 256 px fest, egal wie breit das Fenster ist").toBeDefined();
    expect(r!.korper).toMatch(/position:\s*fixed/);
  });

  it("macht die Leiste der Fläche seitlich erreichbar, statt sie umzubrechen (A7-06)", () => {
    const r = regel(".flaeche-huelle", "#graph-search-count");
    expect(r, "was nicht passt, muss erreichbar bleiben").toBeDefined();
    expect(r!.korper).toMatch(/overflow-x:\s*auto/);
  });

  // Die rote Phase dieser Regel ist keine Testausgabe, sondern eine Messung:
  // nachher-geom am 10.10. um 11:55 — mit der Leiste allein in einer Zeile
  // brachen die Knopfgruppen in drei Reihen und die Leiste wurde 285 px hoch
  // (vorher 104 px). Die Leinwand verlor 181 px und rutschte bei 1 024 px ueber
  // die Falz. Halten in einer Zeile gilt deshalb fuer beide Ebenen.
  it("hält die Knopfgruppen der Leiste in derselben Zeile (A7-06, A7-07)", () => {
    const r = regel(".flaeche-huelle", '[role="group"]');
    expect(r, "die Gruppen brechen als naechstes Ende in Reihen um").toBeDefined();
    expect(r!.korper).toMatch(/flex-wrap:\s*nowrap/);
  });

  // P202, Mockup-Grammatik (.assistent-vorhang): der Assistent steht als Voll-
  // Overlay auf der Grundfläche — Damian's Mockup (k3pta-app-fenster, „Set up
  // K3PTA") trägt ihn so. Die frühere Spalten-Grammatik (A7-10) war die Heilung
  // einer Messung über einer GEFÜLLTEN Fläche; die erste Fläche hinter dem
  // Assistenten ist leer (Nothing selected), es gibt kein Bild, das er deckt.
  it("legt den Assistenten als Voll-Overlay auf die Grundfläche (P202, Mockup .assistent-vorhang)", () => {
    const r = regel(".wizard-taefelchen");
    expect(r, "der Assistent hat keine Schicht auf der Grundfläche").toBeDefined();
    expect(r!.korper).toMatch(/position:\s*fixed/);
    expect(r!.korper, "der Vorhang trägt die Grundfläche des Mockups").toMatch(/var\(--feld\)/);
    expect(r!.korper).toMatch(/place-items:\s*center/);
  });
});
