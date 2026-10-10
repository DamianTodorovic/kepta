// A9 §1: "Der Graph liegt fest, wenn man ihn oeffnet" — heute stimmt das nicht.
// Der Startplatz war der Array-Index ueber einer nach updated_at DESC sortierten
// Liste (src/ui/graph.ts:158-160), gemessen: eine hinzugenommene Notiz verschiebt
// 199 von 200 Plaetzen, einer bleibt exakt (B-6). Der Vertrag verspricht drei
// Dinge, die ein Test pruefen kann: Ordnung unabhaengig, Start aus der Identitaet,
// Anker-Regel.
import { describe, it, expect } from "vitest";
import { keim, berechneWelt, WELT_MITTE, type KraftKante, type KraftEingang } from "../src/core/graf-kraft";
import { WELT_GROESSE, WELT_RAD } from "../src/core/graf-vertrag";

/** Ein Netz aus `n` Knoten, jedes vierte Paar verbunden — deterministischer Bau. */
function netz(n: number, zusatz = false): KraftEingang {
  const knoten = Array.from({ length: n }, (_, i) => ({ id: `k-${String(i).padStart(4, "0")}` }));
  if (zusatz) knoten.push({ id: "k-zusatz" });
  const kanten: KraftKante[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if ((i * 7 + j * 3) % 11 === 0) {
        kanten.push({ quelle: `k-${String(i).padStart(4, "0")}`, ziel: `k-${String(j).padStart(4, "0")}`, sorte: "echt", feder: 0.5 });
      }
    }
  }
  if (zusatz) {
    // Die neue Notiz haengt an genau einem bestehenden Knoten — nur dessen
    // Nachbarschaft darf sich bewegen.
    kanten.push({ quelle: "k-0042", ziel: "k-zusatz", sorte: "echt", feder: 0.5 });
  }
  return { knoten, kanten };
}

const diagonal = Math.sqrt(2) * WELT_GROESSE;

describe("graf-kraft: Start aus der Identitaet", () => {
  it("keim(id) ist dieselbe Zahl fuer dieselbe id — und liegt in der Welt", () => {
    const a = keim("k-0001");
    expect(keim("k-0001")).toEqual(a);
    expect(a.x).toBeGreaterThanOrEqual(WELT_RAD);
    expect(a.x).toBeLessThanOrEqual(WELT_GROESSE - WELT_RAD);
    expect(a.y).toBeGreaterThanOrEqual(WELT_RAD);
    expect(a.y).toBeLessThanOrEqual(WELT_GROESSE - WELT_RAD);
    // Zwei Notiz-IDs, die sich nur in den letzten Ziffern unterscheiden, liegen
    // nicht fast aufeinander — sonst waere der Start ein Kreis nach Name.
    const abstand = Math.hypot(keim("k-0001").x - keim("k-0002").x, keim("k-0001").y - keim("k-0002").y);
    expect(abstand).toBeGreaterThan(1);
  });

  it("der Start hangt nicht an der Reihenfolge der Liste", () => {
    const vorwaerts = netz(60);
    const rueckwaerts = { ...vorwaerts, knoten: [...vorwaerts.knoten].reverse(), kanten: [...vorwaerts.kanten].reverse() };
    const a = [...berechneWelt(vorwaerts).entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1));
    const b = [...berechneWelt(rueckwaerts).entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1));
    // Heute: winkel = i / n * 2π — dieselben Knoten in anderer Reihenfolge geben
    // ein anderes Bild.
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it("Weltmitte ist der feste Punkt, auf den die Zentrierung zieht", () => {
    expect(WELT_MITTE).toBe(WELT_GROESSE / 2);
  });
});

describe("graf-kraft: Determinismus", () => {
  it("derselbe Bestand ergibt bitidentische Plaetze", () => {
    const bild = netz(120);
    expect(JSON.stringify(berechneWelt(bild))).toBe(JSON.stringify(berechneWelt(bild)));
  });

  it("alle Plaetze liegen in der Welt und sind Zahlen ohne NaN", () => {
    for (const [id, platz] of berechneWelt(netz(150))) {
      expect(Number.isFinite(platz.x)).toBe(true);
      expect(Number.isFinite(platz.y)).toBe(true);
      expect(platz.x).toBeGreaterThanOrEqual(WELT_RAD - 0.05);
      expect(platz.x).toBeLessThanOrEqual(WELT_GROESSE - WELT_RAD + 0.05);
      expect(platz.y).toBeGreaterThanOrEqual(WELT_RAD - 0.05);
      expect(platz.y).toBeLessThanOrEqual(WELT_GROESSE - WELT_RAD + 0.05);
      expect(id.startsWith("k-")).toBe(true);
    }
  });

  it("Kantenenden ohne Knoten sind kein Crash", () => {
    const welt = berechneWelt({
      knoten: [{ id: "k-1" }],
      kanten: [{ quelle: "k-1", ziel: "k-fehlt", sorte: "echt", feder: 0.5 }],
    });
    expect(welt.size).toBe(1);
  });
});

describe("graf-kraft: Anker-Regel", () => {
  it("eine zusaetzliche Notiz bewegt nur ihre Nachbarschaft", () => {
    const vorher = berechneWelt(netz(200));
    const nach = netz(200, true);
    const unveraendert = new Set(nach.knoten.map((k) => k.id));
    unveraendert.delete("k-0042"); // dieser Knoten hat eine neue Kante
    unveraendert.delete("k-zusatz");
    const neu = berechneWelt({ ...nach, vorher, unveraendert });

    // Jeder Knoten mit unveraenderter Kantenmenge behaelt seinen Platz exakt.
    let gleich = 0;
    for (const id of unveraendert) {
      const alt = vorher.get(id)!;
      const jetzt = neu.get(id)!;
      if (alt.x === jetzt.x && alt.y === jetzt.y) gleich++;
      expect(jetzt.verankert).toBe(true);
    }
    expect(gleich / unveraendert.size).toBe(1);

    // Der Knoten mit neuer Kante darf nicht als verankert behauptet werden.
    expect(neu.get("k-0042")!.verankert).toBe(false);

    // Die Verschiebung wird ueber ALLE bestehenden Knoten gemessen, so wie der
    // Vertrag sie formuliert ("Median-Verrueckung aller bestehenden Knoten"):
    // verankerte Plaetze zaehlen als 0 mit, sonst messt man eine Groessenordnung,
    // die der Vertrag nie versprochen hat — die meine erste Fassung tat.
    const waende: number[] = [];
    for (const [id, jetzt] of neu) {
      const alt = vorher.get(id);
      if (!alt) continue;
      waende.push(Math.hypot(jetzt.x - alt.x, jetzt.y - alt.y));
    }
    // Der eine Wanderer:bewegung ist die Groessenordnung, die der Vertrag in der
    // Nachbarschaft zulaesst — und sie darf nicht null sein, sonst misst die
    // Behauptung einen Leerlauf.
    const wanderer = waende.filter((d) => d > 0);
    expect(wanderer.length).toBeGreaterThan(0);
    const sortiert = [...waende].sort((a, b) => a - b);
    expect(sortiert[Math.floor(sortiert.length / 2)]).toBeLessThanOrEqual(0.005 * diagonal);
    expect(sortiert[Math.min(sortiert.length - 1, Math.floor(0.95 * sortiert.length))]).toBeLessThanOrEqual(0.02 * diagonal);
    // Groesste Einzelbewegung: unter 2 % der Diagonalen, sonst waere die Zusage
    // "nur die Nachbarschaft relaxt" schon wieder ein Verkaufstext.
    expect(sortiert[sortiert.length - 1]).toBeLessThanOrEqual(0.02 * diagonal);
  });

  it("ohne Anker startet jeder Platz aus der Identitaet, nicht aus dem Nebel", () => {
    const welt = berechneWelt(netz(30));
    for (const [id, platz] of welt) {
      expect(platz.verankert).toBe(false);
      expect(platz.x).not.toBe(NaN);
      expect(id).toBeTruthy();
    }
  });
});
