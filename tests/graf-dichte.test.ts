// A9 §4: die Dichte-Falle. Heute verwirft `src/ui/graph.ts:79` einen Begriff
// vollstaendig, sobald 61 Notizen ihn tragen (maxBucket = 60) — nachgemessen 3 %
// der Begriffe bei 400 Notizen, 23 % bei 2 000, 100 % bei 10 000 (B-13). Die
// Reparatur ist eine Begriffsrechnung: Zerlegung ohne Anfrage-Kappe, Stoppwoerter
// aus dem Kern, Gedaempft nach g(t) = ln(1 + N/df) statt Verboten.
import { describe, it, expect } from "vitest";
import {
  indexierBegriffe,
  begriffsIndex,
  begriffsGewicht,
  vektor,
  skalarprodukt,
  jaccard,
} from "../src/core/graf-terms";
import { contentTerms, MAX_QUERY_TERMS } from "../src/core/stopwords";
import { baueNotizBild, type NotizKnoten } from "../src/ui/graph";

describe("graf-terms: Zerlegung fuer den Index (A9 §4 Regel 2)", () => {
  it("ein langer Titel verliert keine Begriffe — die Anfrage-Kappe gilt hier nicht", () => {
    // Die 12-Begriffe-Kappe (MAX_QUERY_TERMS) schaetzt eine FTS5-Anfrage. Als
    // Indexier-Regel verschluckt sie still die Haelfte eines langen Titels.
    const titel =
      "Quarterly reconciliation draft for the Weber mandate with appendix notes on bandwidth invoices and cooling loop backup plans";
    // 18 Woerter, 5 davon Fuellwoerter (for, the, with, on, and) -> 13 Begriffe.
    expect(titel.split(/\s+/).length).toBe(18);
    expect(indexierBegriffe(titel).length).toBe(13);
    expect(indexierBegriffe(titel).length).toBeGreaterThan(MAX_QUERY_TERMS);
    // Die Anfrage-Seite kuerzt weiterhin — beide Nutzungen sind getrennt.
    expect(contentTerms(titel).length).toBeLessThanOrEqual(MAX_QUERY_TERMS);
  });

  it("Fuellwoerter und Einzelzeichen fallen, Unicode bleibt", () => {
    expect(indexierBegriffe("Der Vertrag und die Miete")).toEqual(["vertrag", "miete"]);
    expect(indexierBegriffe("a-27 b mit und")).toEqual(["27"]);
    expect(indexierBegriffe("Kühlung Grün→Blau")).toEqual(["kühlung", "grün", "blau"]);
    expect(indexierBegriffe("километр двигателя")).toEqual(["километр", "двигателя"]);
  });

  it("eine Notiz ohne bedeutungstragende Begriffe hat einen leeren Vektor, keinen Fallback", () => {
    // contentTerms() behaelt bei einer reinen Fuellwort-Anfrage die Fuellwoerter —
    // fuer eine Suche ist das besser als Stille. Fuer einen Index waere es Rauschen.
    expect(indexierBegriffe("der und das im")).toEqual([]);
  });
});

describe("graf-terms: g(t) = ln(1 + N/df) (A9 §4 Gewicht)", () => {
  it("der haeufigste Begriff wiegt nahe null, aber nicht null", () => {
    const schwer = begriffsGewicht(10_000, 5_000);
    expect(schwer).toBeCloseTo(Math.log(1 + 2), 10);
    expect(schwer).toBeGreaterThan(0);
  });

  it("ein seltener Begriff wiegt mehr, und die Ordnung ist monoton", () => {
    const leicht = begriffsGewicht(10_000, 2);
    const schwer = begriffsGewicht(10_000, 5_000);
    expect(leicht).toBeGreaterThan(schwer);
    let vorher = Infinity;
    for (const df of [2, 3, 5, 10, 100, 1_000, 5_000]) {
      const g = begriffsGewicht(10_000, df);
      expect(g).toBeLessThan(vorher);
      vorher = g;
    }
  });

  it("df zaehlt Knoten, nicht Nennungen", () => {
    const index = begriffsIndex([
      { id: "k-1", begriffe: ["hetzner", "hetzner", "rz"] },
      { id: "k-2", begriffe: ["hetzner"] },
      { id: "k-3", begriffe: [] },
    ]);
    expect(index.n).toBe(3);
    expect(index.df.get("hetzner")).toBe(2);
    expect(index.df.get("rz")).toBe(1);
    expect(index.df.size).toBe(2);
  });
});

describe("graf-terms: Aehnlichkeit ohne min-Division (A9 B-11)", () => {
  it("ein Tag gegen acht ergibt 0,125 — nicht 1,0", () => {
    // Heute: tagOverlap teilt durch Math.min ⇒ duenne Notiz gewinnt immer.
    expect(jaccard(["server"], ["server", "mietvertrag", "rz", "gx", "1080", "linux", "brandmuern", "kuehlung"])).toBeCloseTo(0.125, 10);
    expect(jaccard([], ["a"])).toBe(0);
    expect(jaccard(["a", "b"], ["a", "b"])).toBe(1);
  });

  it("duenne Vektoren sind normiert, ihr Skalarprodukt liegt in 0..1", () => {
    const index = begriffsIndex([
      { id: "k-1", begriffe: ["server"] },
      { id: "k-2", begriffe: ["server", "mietvertrag", "rz"] },
      { id: "k-3", begriffe: ["mietvertrag", "rz"] },
    ]);
    const a = vektor(["server"], index);
    expect(skalarprodukt(a, a)).toBeCloseTo(1, 9);
    const wert = skalarprodukt(a, vektor(["server", "mietvertrag", "rz"], index));
    expect(wert).toBeGreaterThan(0);
    expect(wert).toBeLessThanOrEqual(1);
    // Ohne gemeinsamen Begriff gibt es keine Aehnlichkeit.
    expect(skalarprodukt(a, vektor(["kuendigung"], index))).toBe(0);
  });

  it("zwei Notizen ueber einen seltenen Begriff stehen dichter als zwei ueber den Hub", () => {
    // Der seltene Begriff traegt die Bedeutung, der Hub haengt an allem. Ohne
    // Gedaempft waeren beide Paare gleich wertlos — mit g(t) entscheidet die Seltenheit.
    const index = begriffsIndex([
      { id: "k-1", begriffe: ["meeting", "quartalsabrechnung"] },
      { id: "k-2", begriffe: ["meeting", "anderes"] },
      { id: "k-3", begriffe: ["meeting"] },
      { id: "k-4", begriffe: ["quartalsabrechnung", "anderes"] },
    ]);
    expect(index.df.get("meeting")).toBe(3);
    expect(index.df.get("quartalsabrechnung")).toBe(2);
    const ueberHub = skalarprodukt(vektor(["meeting"], index), vektor(["meeting", "anderes"], index));
    const ueberSelten = skalarprodukt(
      vektor(["quartalsabrechnung"], index),
      vektor(["quartalsabrechnung", "anderes"], index)
    );
    expect(ueberSelten).toBeGreaterThan(ueberHub);
  });
});

/** Zipf-Korpus mit festem Seed — dieselbe Verteilung, in der die 60er-Kappe misst. */
function zipfKorpus(n: number): NotizKnoten[] {
  let seed = 20261010;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const aus: NotizKnoten[] = [];
  for (let i = 0; i < n; i++) {
    const tags = new Set<string>();
    for (let r = 0; r < 12; r++) {
      const rang = Math.max(1, Math.min(12, Math.floor(Math.pow(rnd(), 2.2) * 12) + 1));
      tags.add(`wort${rang}`);
    }
    aus.push({ id: `k-${String(i).padStart(5, "0")}`, titel: `Notiz ${i}`, inhalt: "", tags: [...tags] });
  }
  return aus;
}

/** Anteil der Begriffe mit df>=2, den die alte Regel (df > 60) verworfen haette. */
function verwurfAnteilHeute(korpus: NotizKnoten[]): number {
  const df = new Map<string, number>();
  for (const k of korpus) {
    for (const t of new Set(indexierBegriffe((k.tags ?? []).join(" ")))) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const unterwegs = [...df.values()].filter((d) => d >= 2);
  const verworfen = unterwegs.filter((d) => d > 60).length;
  return unterwegs.length === 0 ? 0 : verworfen / unterwegs.length;
}

describe("graf-dichte: der Korpus (A9 §4 Messgroesse)", () => {
  it("bei 400 Notizen geht kein Begriff verloren — die alte Kappe haette 100 % verworfen", () => {
    const korpus = zipfKorpus(400);
    expect(verwurfAnteilHeute(korpus)).toBe(1);
    const bild = baueNotizBild(korpus, { knoten: 400, kanten: 8000 });
    // Kein Begriff faellt mehr wegen seiner Hauefigkeit: das Budget erreiht hier alles.
    expect(bild.kuerzung.uebrig.begriffe).toBe(0);
    expect(bild.kuerzung.grund).not.toContain("paarBudget");
  });

  it("der 61-Fall der QA-Leitung: ein Tag auf 61 von 400 Notizen liefert Kanten", () => {
    // Genau der Befund 2 aus 03-QA-GRAF-EIGENPRUEFUNG.md: frueher loeste sich die
    // Themen-Insel ab der 61. Notiz in nichts auf, ohne ein Wort darueber.
    const korpus: NotizKnoten[] = [];
    for (let i = 0; i < 61; i++) {
      korpus.push({ id: `k-${String(i).padStart(3, "0")}`, titel: `Sitz ${i}`, inhalt: "", tags: ["meeting"] });
    }
    for (let i = 0; i < 339; i++) {
      korpus.push({ id: `x-${String(i).padStart(3, "0")}`, titel: `Ablage ${i}`, inhalt: "", tags: [`einmal-${i}`] });
    }
    const bild = baueNotizBild(korpus, { knoten: 400, kanten: 8000 });
    const mitMeeting = new Set(korpus.slice(0, 61).map((k) => k.id));
    const kantenMitMeeting = bild.kanten.filter((k) => mitMeeting.has(k.quelle) && mitMeeting.has(k.ziel));
    expect(kantenMitMeeting.length).toBeGreaterThan(0);
    expect(bild.kuerzung.uebrig.begriffe).toBe(0);
  });

  it("bei 2 000 Notizen gilt dasselbe, und was das Budget nicht erreiht, steht im Feld", () => {
    const korpus = zipfKorpus(2000);
    expect(verwurfAnteilHeute(korpus)).toBe(1);
    const bild = baueNotizBild(korpus, { knoten: 2000, kanten: 8000 });
    // Die alte Regel haette wieder 100 % der df>=2-Begriffe verworfen; jetzt endet
    // die Arbeit am Budget — und der Nutzer sieht eine Zahl mit Grund.
    expect(bild.kuerzung.uebrig.begriffe).toBeGreaterThan(0);
    expect(bild.kuerzung.grund).toContain("paarBudget");
    expect(bild.kuerzung.vollstaendig).toBe(false);
    expect(bild.kuerzung.kappe.paarPruefungen).toBeGreaterThan(0);
  });

  it("seltene Begriffe zuerst: ein Mini-Budget prueft den seltensten Kuebel, nicht den Hub", () => {
    // Der Mechanismus hinter der Dichte-Zusage: Kuebel werden in absteigendem
    // g(t) abgearbeitet, und was das Budget nicht erreiht, wird gemeldet statt
    // weggelassen. Ein Budget von einer einzigen Paarpruefung muss also den
    // seltensten Begriff erwischen — und alle anderen als uebrig melden.
    const korpus: NotizKnoten[] = [
      { id: "k-1", titel: "Erste", inhalt: "", tags: ["hub", "selten"] },
      { id: "k-2", titel: "Zweite", inhalt: "", tags: ["hub"] },
      { id: "k-3", titel: "Dritte", inhalt: "", tags: ["hub"] },
      { id: "k-4", titel: "Vierte", inhalt: "", tags: ["hub"] },
    ];
    // df: hub = 4, selten = 1. Der einzige Kuebel mit df>=2 ist "hub" — mit
    // Budget 1 wird er geprueft, und kein Begriff bleibt uebrig.
    const mitBudget = baueNotizBild(korpus, { knoten: 10, kanten: 10, paarPruefungen: 1 });
    expect(mitBudget.kuerzung.kappe.paarPruefungen).toBe(1);
    // Der eine Kuebel wurde angerissen, aber nicht zu Ende gefuehrt — das meldet
    // das Feld, sonst stünde im Bild eine Arbeit, die nicht getan wurde.
    expect(mitBudget.kuerzung.uebrig.begriffe).toBe(1);
    expect(mitBudget.kuerzung.grund).toContain("paarBudget");
    expect(mitBudget.kuerzung.uebrig.paare + mitBudget.kanten.length).toBeLessThanOrEqual(1);
    // Zwei Kuebel, einer selten: der seltene kommt zuerst, der haeufige bleibt
    // uebrig, wenn das Budget nur eine Pruefung zulaesst.
    const zweiKuebel: NotizKnoten[] = [
      { id: "k-1", titel: "Erste", inhalt: "", tags: ["hub", "selten"] },
      { id: "k-2", titel: "Zweite", inhalt: "", tags: ["hub", "selten"] },
      { id: "k-3", titel: "Dritte", inhalt: "", tags: ["hub"] },
      { id: "k-4", titel: "Vierte", inhalt: "", tags: ["hub"] },
      { id: "k-5", titel: "Fuenfte", inhalt: "", tags: ["hub"] },
    ];
    const geordnet = baueNotizBild(zweiKuebel, { knoten: 10, kanten: 10, paarPruefungen: 1 });
    // "selten" (df 2) wird zuerst geprueft, "hub" (df 5) bleibt uebrig — gemeldet.
    expect(geordnet.kuerzung.uebrig.begriffe).toBe(1);
    expect(geordnet.kuerzung.grund).toContain("paarBudget");
    expect(geordnet.kanten.some((k) => k.erklaerung.gemeinsame.includes("selten"))).toBe(true);
  });
});
