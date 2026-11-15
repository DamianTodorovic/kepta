/**
 * Punkt 117 — die Community-Ebene, die der Marktbericht als einzige echte Luecke
 * am Graphen lies (MARKT-GRAPH-2710.md). Massstab ist Microsoft GraphRAG:
 * Leiden-Communitys plus eine Summary je Haufen. Gebaut wird zuerst der
 * Rechenkern, deterministic und ohne Fremdpaket.
 *
 * Die zwei Richungen sind der Sinn dieser Datei, nicht die Menge der Faelle:
 * ein Verfahren, das zwei klare Clans nicht trennt, ist kein Clusterer;
 * ein Verfahren, das eine Vollgruppe zerlegt, erfindet Haufen.
 */
import { describe, expect, it } from "vitest";

import {
  gemeinschaftenBaue,
  haufenKantenAus,
  type Gemeinschaftskante,
} from "../../src/lib/gemeinschaften";

/** Volle Clique u ber n Knoten, jede Kante genau einmal, Gewicht 1. */
function clique(buchstabe: string, n: number): Gemeinschaftskante[] {
  const kanten: Gemeinschaftskante[] = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      kanten.push({ a: `${buchstabe}${i}`, b: `${buchstabe}${j}` });
    }
  }
  return kanten;
}

function knotenMenge(prefixe: [string, number][]): string[] {
  const out: string[] = [];
  for (const [p, n] of prefixe) for (let i = 0; i < n; i += 1) out.push(`${p}${i}`);
  return out;
}

const bruecke = (a: string, b: string): Gemeinschaftskante => ({ a, b });

describe("gemeinschaftenBaue — Rechenkern der Community-Ebene", () => {
  it("trennt zwei Vierer-Clans, die nur durch eine Linie haengen", () => {
    const kanten = [...clique("a", 4), ...clique("b", 4), bruecke("a0", "b0")];
    const ergebnis = gemeinschaftenBaue(knotenMenge([["a", 4], ["b", 4]]), kanten);

    expect(ergebnis.gemeinschaften).toHaveLength(2);
    expect(ergebnis.gemeinschaften.map((g) => g.groesse).sort()).toEqual([4, 4]);
    // dieselbe Community, nicht dieselbe Zahl: die Clan-Mitglieder gehoeren zusammen
    expect(ergebnis.zuordnung.get("a1")).toBe(ergebnis.zuordnung.get("a3"));
    expect(ergebnis.zuordnung.get("b2")).toBe(ergebnis.zuordnung.get("b3"));
    expect(ergebnis.zuordnung.get("a1")).not.toBe(ergebnis.zuordnung.get("b2"));
    expect(ergebnis.modulvar).toBeGreaterThan(0.4);
  });

  it("laesst eine Vollgruppe von sechs Knoten ungeteilt", () => {
    const ergebnis = gemeinschaftenBaue(knotenMenge([["k", 6]]), clique("k", 6));

    expect(ergebnis.gemeinschaften).toHaveLength(1);
    expect(ergebnis.gemeinschaften[0].mitglieder).toHaveLength(6);
    expect(ergebnis.modulvar).toBeLessThan(0.05);
  });

  it("erfindet keine Haufen, wo gar keine Kante ist", () => {
    const leere = gemeinschaftenBaue(["x", "y", "z"], []);

    expect(leere.modulvar).toBe(0);
    expect(leere.gemeinschaften).toHaveLength(3);
    expect(leere.gemeinschaften.map((g) => g.groesse)).toEqual([1, 1, 1]);
    // Ordnung ist angesagt, nicht der Reihe nach: Kleinste zuerst waere eine Luege
    expect(leere.gemeinschaften.every((g) => g.mitglieder.length === 1)).toBe(true);
  });

  it("zaehlt Knoten ohne Kante als eignen Haufen, nicht als Anhaengsel", () => {
    const knoten = [...knotenMenge([["a", 4], ["b", 4]]), "allein1", "allein2"];
    const kanten = [...clique("a", 4), ...clique("b", 4), bruecke("a0", "b0")];
    const ergebnis = gemeinschaftenBaue(knoten, kanten);

    expect(ergebnis.gemeinschaften).toHaveLength(4);
    expect(ergebnis.zuordnung.get("allein1")).not.toBe(ergebnis.zuordnung.get("allein2"));
    expect(ergebnis.zuordnung.get("allein1")).not.toBe(ergebnis.zuordnung.get("a0"));
  });

  it("ist wiederholbar: zweimal derselbe Input, zweimal dieselbe Zuordnung", () => {
    const knoten = [...knotenMenge([["a", 5], ["b", 5], ["c", 5]])];
    const kanten = [
      ...clique("a", 5),
      ...clique("b", 5),
      ...clique("c", 5),
      bruecke("a0", "b0"),
      bruecke("b1", "c1"),
    ];
    const erstes = gemeinschaftenBaue(knoten, kanten);
    const zweites = gemeinschaftenBaue(knoten, kanten);

    expect([...erstes.zuordnung.entries()].sort()).toEqual([...zweites.zuordnung.entries()].sort());
    expect(erstes.gemeinschaften).toEqual(zweites.gemeinschaften);
    expect(erstes.modulvar).toBe(zweites.modulvar);
    // drei Clans, zwei Bruecken: die Zahl ist der Kern der Wiederholbarkeit
    expect(erstes.gemeinschaften).toHaveLength(3);
  });

  it("das Gewicht entscheidet, wer mit wem: derselbe Rumpf, vertauschte Zahlen", () => {
    // Vier Knoten, vier Linien, dieselbe Topologie. Schwere Linien *innen* lassen
    // zwei Reine Haelften; schwere Linien *quer* lassen zwei Misch-Paare. Eine
    // Rechnung, die Gewichte nicht laese, muesste in beiden Faellen gleich stehen.
    // Handwert fuer beide: Q = 20/44 - (22/44)^2 je Haelft = 0,2045, zwei Haufen = 0,4091.
    const vier = ["a0", "a1", "b0", "b1"];
    const netz = (innen: number, quer: number): Gemeinschaftskante[] => [
      { a: "a0", b: "a1", gewicht: innen },
      { a: "b0", b: "b1", gewicht: innen },
      { a: "a0", b: "b0", gewicht: quer },
      { a: "a1", b: "b1", gewicht: quer },
    ];
    const reine = gemeinschaftenBaue(vier, netz(10, 1));
    const gemischt = gemeinschaftenBaue(vier, netz(1, 10));

    expect(reine.gemeinschaften).toHaveLength(2);
    expect(gemischt.gemeinschaften).toHaveLength(2);
    // die Reinen: kein Haufen ueberschreitet den Buchstaben
    expect(reine.gemeinschaften.every((g) => new Set(g.mitglieder.map((m) => m[0])).size === 1)).toBe(true);
    // die Gemischten: jeder Haufen hat ein a und ein b
    expect(gemischt.gemeinschaften.every((g) => new Set(g.mitglieder.map((m) => m[0])).size === 2)).toBe(true);
    expect(reine.modulvar).toBeCloseTo(0.4091, 3);
    expect(gemischt.modulvar).toBeCloseTo(0.4091, 3);
  });

  it("verwirft Selbstbehaupten, weil sie keinen Nachbarn ergeben", () => {
    const kanten = [...clique("a", 4), ...clique("b", 4), bruecke("a0", "b0"), bruecke("a1", "a1")];
    const mitSelbst = gemeinschaftenBaue(knotenMenge([["a", 4], ["b", 4]]), kanten);
    const ohneSelbst = gemeinschaftenBaue(knotenMenge([["a", 4], ["b", 4]]), [
      ...clique("a", 4),
      ...clique("b", 4),
      bruecke("a0", "b0"),
    ]);

    expect(mitSelbst.gemeinschaften).toEqual(ohneSelbst.gemeinschaften);
    expect(mitSelbst.modulvar).toBeCloseTo(ohneSelbst.modulvar, 12);
  });

  it("haelt an 3 000 Knoten: keine Haelfte reicht in die andre, unter zwei Sekunden", () => {
    // Die Zahl der Haufen ist hier kein Ziel: Modularitaet zerlegt dichte Bloecke
    // feiner, als der Mensch zwei Haelften sieht (Aufloesungsgrenze), und bei
    // 9 000 Linien ist das der Stand der Sache, nicht ein Fehler. Gemessen 20:59:
    // vier Haufen zu je 750 mit Q 0,7459 gegen Q 0,4988 fuer die zwei Haelften —
    // das feinere Schnittbild ist das bessere. Was halten muss, ist die Grenze:
    // kein Haufen darf Haelften mischen, und die Zeit darf nicht mitwachsen.
    const knoten = knotenMenge([["a", 1500], ["b", 1500]]);
    const kanten: Gemeinschaftskante[] = [
      ...knotenRing("a", 1500, [1, 2, 5]),
      ...knotenRing("b", 1500, [1, 2, 5]),
      ...[0, 1, 2, 3, 4].map((i) => bruecke(`a${i}`, `b${i}`)),
    ];
    const start = performance.now();
    const ergebnis = gemeinschaftenBaue(knoten, kanten);
    const dauer = performance.now() - start;

    const mischt = ergebnis.gemeinschaften.filter(
      (g) => g.mitglieder.some((m) => m.startsWith("a")) && g.mitglieder.some((m) => m.startsWith("b")),
    );
    expect(mischt).toHaveLength(0);
    expect(ergebnis.modulvar).toBeGreaterThan(0.6);
    expect(ergebnis.gemeinschaften.reduce((s, g) => s + g.groesse, 0)).toBe(3000);
    expect(dauer).toBeLessThan(2000);
    expect(dauer).toBeGreaterThan(0);
  });
});

/** Ring mit Spruengen: 1 500 Knoten je Haelfte, drei Linien je Knoten, echt dicht. */
function knotenRing(buchstabe: string, n: number, spruenge: number[]): Gemeinschaftskante[] {
  const kanten: Gemeinschaftskante[] = [];
  for (const s of spruenge) {
    for (let i = 0; i < n; i += 1) kanten.push(bruecke(`${buchstabe}${i}`, `${buchstabe}${(i + s) % n}`));
  }
  return kanten;
}

describe("#119 die Kantenmenge des gezeichneten Feldes", () => {
  const ALPHA_BETA = [
    { source: "Alpha", target: "Beta", relation: "begruendet" },
  ];
  const ERWAHNUNGEN: [string, string][] = [
    ["n1", "Alpha"], ["n2", "Alpha"], ["n1", "Beta"], ["n2", "Beta"],
  ];

  it("haelt die Erwahnung nur, wenn die Maske auch die Notiz kennt", () => {
    // Die Form ist die Falle: eine Erwahnung ist ein Paar (notizId, begriffsId).
    // Eine Maske aus den Begriffen allein traegt keine der beiden Kennungen
    // zugleich — und die Notiz faellt still aus der Grundgesamtheit.
    const nurBegriffe = new Set(["Alpha", "Beta"]);
    expect(haufenKantenAus(nurBegriffe, ERWAHNUNGEN, ALPHA_BETA).length,
      "die Begriffs-Maske lies vier Erwahnungen durch").toBe(1);
    const ganzesFeld = new Set(["n1", "n2", "Alpha", "Beta"]);
    expect(haufenKantenAus(ganzesFeld, ERWAHNUNGEN, ALPHA_BETA).length).toBe(5);
  });

  it("gewichtet die Behauptung doppelt wie die Erwahnung", () => {
    const kanten = haufenKantenAus(
      new Set(["n1", "n2", "Alpha", "Beta"]), ERWAHNUNGEN, ALPHA_BETA
    );
    expect(kanten.filter((k) => k.gewicht === 1).length).toBe(4);
    expect(kanten.filter((k) => k.gewicht === 2).length).toBe(1);
  });

  it("nimmt die Notiz in den eignen Haufen, wenn das Feld ganz gerechnet wird", () => {
    // Zwei Klubs, keine Kante zwischen ihnen. Wird nur ueber die Begriffe gerechnet,
    // sind die Notizen in keiner Grundgesamtheit — ihr Ton fehlt dann im Bild, obwohl
    // die Zeile eine Zahl nennt.
    const erw = [...ERWAHNUNGEN, ["n3", "Gamma"] as [string, string], ["n3", "Delta"] as [string, string]];
    const beh = [...ALPHA_BETA, { source: "Gamma", target: "Delta", relation: "begruendet" }];
    const feld = ["n1", "n2", "n3", "Alpha", "Beta", "Gamma", "Delta"];
    const ergebnis = gemeinschaftenBaue(feld, haufenKantenAus(new Set(feld), erw, beh));
    expect(ergebnis.gemeinschaften.length, "zwei Klubs wurden zu einem zerflossen").toBe(2);
    const klub = (k: string) => ergebnis.zuordnung.get(k);
    expect(klub("n1"), "die Notiz steht in keiner Zuordnung").toBeDefined();
    expect(klub("n1")).toBe(klub("Alpha"));
    expect(klub("n3")).toBe(klub("Gamma"));
    expect(klub("n1"), "die Notiz wurde in den fremden Klub gezogen").not.toBe(klub("Gamma"));
  });
});
