// A9 §1: "Der Graph liegt fest, wenn man ihn oeffnet" — heute stimmt das nicht.
// Der Startplatz war der Array-Index ueber einer nach updated_at DESC sortierten
// Liste (src/ui/graph.ts:158-160), gemessen: eine hinzugenommene Notiz verschiebt
// 199 von 200 Plaetzen, einer bleibt exakt (B-6). Der Vertrag verspricht drei
// Dinge, die ein Test pruefen kann: Ordnung unabhaengig, Start aus der Identitaet,
// Anker-Regel.
import { describe, it, expect } from "vitest";
import { keim, berechneWelt, WELT_MITTE, type KraftKante, type KraftEingang, type WeltDiagnose } from "../src/core/graf-kraft";
import { WELT_GROESSE, WELT_RAD, scheibenRadius } from "../src/core/graf-vertrag";

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
    // WARUM ANDERS SEIT STAND 5: die Weltseite ist nicht mehr die Konstante 1000,
    // sondern die Ausdehnung, die die Kraefte dieses Bestands bauen — sie reist als
    // `welt.groesse` im Kuvert mit (`berechneWelt` meldet sie in der Diagnose). Die
    // Behauptung dieses Falls ist unveraendert: kein Platz liegt ausserhalb der
    // Welt, die fuer dieses Bild gilt. Was sich geaendert hat, ist, wo diese Welt
    // endet — 1000 hart einzubauen waere genau der Fehler, den die Neuregelung
    // abschafft (Beleg der Rechnung: audit-2026-10-09/e2-code/nacht-12-10/).
    const diagnose = { ticks: 0, alpha: 0, besuche: 0 } as WeltDiagnose;
    const platze = berechneWelt(netz(150), diagnose);
    const welt = diagnose.welt ?? WELT_GROESSE;
    expect(welt).toBeGreaterThanOrEqual(WELT_GROESSE);
    for (const [id, platz] of platze) {
      expect(Number.isFinite(platz.x)).toBe(true);
      expect(Number.isFinite(platz.y)).toBe(true);
      expect(platz.x).toBeGreaterThanOrEqual(WELT_RAD - 0.05);
      expect(platz.x).toBeLessThanOrEqual(welt - WELT_RAD + 0.05);
      expect(platz.y).toBeGreaterThanOrEqual(WELT_RAD - 0.05);
      expect(platz.y).toBeLessThanOrEqual(welt - WELT_RAD + 0.05);
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

  it("ein Nachtrag, der unter den Untergrund waechst, meldet die Welt, in der er liegt", () => {
    // Der Fall, den die Kosten-Wache 12.10. 13:09 erwischt hat: drei Anker dicht
    // beieinander, einer davon mit unveraenderter Kantenmenge — und ein Neuling,
    // der denselben Platz will. Ein verankertes Ende gibt nie nach (`verankert`
    // ist Vertrag), also nimmt das freie Ende den ganzen Fehlbetrag und liegt
    // unterhalb des alten Untergrunds. Die Zusage, die ein Client braucht, ist
    // nicht "bei 0 beginnt die Welt", sondern "innerhalb der gemeldeten Welt".
    const vorher = new Map([
      ["a", { x: 30, y: 30 }],
      ["b", { x: 34, y: 30 }],
      ["c", { x: 32, y: 34 }],
    ]);
    const scheibe = scheibenRadius(9, 0);
    const diagnose: WeltDiagnose = { ticks: 0, alpha: 0, besuche: 0 };
    const welt = berechneWelt(
      {
        knoten: [{ id: "a", scheibe }, { id: "b", scheibe }, { id: "c", scheibe }, { id: "n", scheibe }],
        kanten: [],
        vorher,
        unveraendert: new Set(["a", "b", "c"]),
        ticksMax: 60,
      },
      diagnose
    );
    const nullpunkt = diagnose.nullpunkt!;
    const groesse = diagnose.welt!;

    // (a) Der Neuling liegt wirklich ausserhalb des alten Rahmens — sonst prueft
    //     dieser Fall nichts, was der naechste nicht schon prueft.
    const neu = welt.get("n")!;
    expect(neu.x, "dieser Aufbau sollte unter den alten Untergrund wachsen").toBeLessThan(WELT_RAD);

    // (b) Und doch in der Welt, die er meldet: Saum auf beiden Achsen, mit dem
    //     halben Rundungsspielraum der Meldung.
    for (const [id, p] of welt) {
      expect(p.x, `${id} x unter dem gemeldeten Saum`).toBeGreaterThanOrEqual(nullpunkt.x + WELT_RAD - 0.05);
      expect(p.x, `${id} x ueber dem gemeldeten Saum`).toBeLessThanOrEqual(nullpunkt.x + groesse - WELT_RAD + 0.05);
      expect(p.y, `${id} y unter dem gemeldeten Saum`).toBeGreaterThanOrEqual(nullpunkt.y + WELT_RAD - 0.05);
      expect(p.y, `${id} y ueber dem gemeldeten Saum`).toBeLessThanOrEqual(nullpunkt.y + groesse - WELT_RAD + 0.05);
    }

    // (c) Die Anker bleiben bitgleich — das ist der Grund, warum hier die Welt
    //     wachst und nicht das Bild verschoben wird.
    for (const [id, platz] of vorher) expect(welt.get(id), `${id} hat seine Kantenmenge nicht`).toEqual({ x: platz.x, y: platz.y, verankert: true });
  });
});
