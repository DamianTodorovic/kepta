import { describe, it, expect } from "vitest";
import {
  semantikKarte,
  layoutSemantik,
  SEMANTIK_KAPPE,
  SEMANTIK_ABSTAND,
  type SemantikRohling,
} from "../../src/lib/graphSemantik";

// P-9: die semantische Ansicht. Zwei Vorbilder am Markt legen ihre Knoten nach
// der Bedeutung des Textes — eine Projektion der Vektoren. Was dort fehlt, ist
// die Auskunft: eine Projektion ist eine VERRINGERUNG, und wer sie zeigt, ohne
// zu sagen, wie viel er weggelassen hat, verkauft ein Bild für die Wahrheit.
//
// Deshalb hier drei Verträge, bevor eine Zeile Projektion existiert:
//   1. dieselbe Wissensbasis ergibt dieselben Koordinaten (kein Ziehen, kein
//      Würfel, keine Reihenfolge der Lieferung),
//   2. die Kappung ist sichtbar, nicht still,
//   3. was keinen Vektor trägt, fällt nicht aus dem Bild.

function v(...zahlen: number[]): Float32Array {
  return Float32Array.from(zahlen);
}

function rohling(id: string, zahlen: number[], modell = "nomic-embed-text"): SemantikRohling {
  return { id, vektor: v(...zahlen), modell };
}

/** Zwei getrennte Haufen in vier Dimensionen. */
function zweiHaufen(): SemantikRohling[] {
  return [
    rohling("a1", [9, 0.5, 0, 0.2]),
    rohling("a2", [10, 0, 0.4, 0]),
    rohling("a3", [9.4, 0.2, 0, 0.1]),
    rohling("b1", [0.3, 9, 0, 0.5]),
    rohling("b2", [0, 10, 0.2, 0]),
    rohling("b3", [0.1, 9.6, 0, 0.3]),
  ];
}

function abstand(karte: { punkte: { id: string; x: number; y: number }[] }, x: string, y: string): number {
  const a = karte.punkte.find((p) => p.id === x)!;
  const b = karte.punkte.find((p) => p.id === y)!;
  expect(a, `kein Punkt für ${x}`).toBeDefined();
  expect(b, `kein Punkt für ${y}`).toBeDefined();
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Die weiteste Scheibe der Karte — in der Norm der Achsen, nicht der Diagonalen. */
function randVon(karte: { punkte: readonly { x: number; y: number }[] }): number {
  return Math.max(...karte.punkte.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))));
}

/** n Punkte gleichmäßig auf einem Kreis, mit zwei weiteren Richtungen. */
function stern(n: number): SemantikRohling[] {
  return Array.from({ length: n }, (_, i) => {
    const winkel = (2 * Math.PI * i) / n;
    return rohling(`s${i}`, [Math.cos(winkel) * 3, Math.sin(winkel) * 3, i / n, 1 - i / n]);
  });
}

describe("Die Projektion ist eine Funktion der Wissensbasis, nicht des Augenblicks", () => {
  it("legt dieselben Koordinaten fest, egal in welcher Reihenfolge die Vektoren kommen", () => {
    const eingabe = zweiHaufen();
    const eins = semantikKarte(eingabe);
    const gemischt = [eingabe[3]!, eingabe[0]!, eingabe[5]!, eingabe[2]!, eingabe[4]!, eingabe[1]!];
    const zwei = semantikKarte(gemischt);

    expect(zwei.punkte).toEqual(eins.punkte);
  });

  it("rechnet zweimal dasselbe, ohne Zustand dazwischen", () => {
    const eins = semantikKarte(zweiHaufen());
    const zwei = semantikKarte(zweiHaufen());
    expect(zwei).toEqual(eins);
  });

  it("zieht einen gemeinsamen Versatz ab — die Karte misst Unterschiede, nicht die Lage", () => {
    const basis = zweiHaufen();
    const verschoben = basis.map((r) => ({
      ...r,
      vektor: v(...[...r.vektor].map((z) => z + 5)),
    }));
    const eins = semantikKarte(basis);
    const zwei = semantikKarte(verschoben);

    // Gerechnet wird in Gleitkommazahlen, und (x + c) − (mittel + c) ist nicht
    // bitgleich x − mittel. Gemessen wird deshalb gegen die Karte selbst: ein
    // Millionstel ihrer Ausdehnung ist weit unter einem Bildpunkt.
    const eben = randVon(eins) * 1e-6;
    for (const p of eins.punkte) {
      const q = zwei.punkte.find((x) => x.id === p.id)!;
      expect(Math.abs(q.x - p.x), `x von ${p.id}`).toBeLessThan(eben);
      expect(Math.abs(q.y - p.y), `y von ${p.id}`).toBeLessThan(eben);
    }
  });

  it("fasst die Abschnitte einer Notiz zu einem Punkt zusammen", () => {
    // Eine Notiz liegt in Abschnitten vor. Der Punkt der Notiz ist der
    // Schwerpunkt ihrer Abschnitte — nicht zwei Punkte, und nicht der erste.
    const geteilt = semantikKarte([
      rohling("n1", [10, 0, 0, 0]),
      rohling("n1", [0, 10, 0, 0]),
      rohling("n2", [0, 0, 4, 0]),
    ]);
    const mittel = semantikKarte([rohling("n1", [5, 5, 0, 0]), rohling("n2", [0, 0, 4, 0])]);

    expect(geteilt.punkte).toHaveLength(2);
    expect(geteilt.punkte.find((p) => p.id === "n1")).toEqual(mittel.punkte.find((p) => p.id === "n1"));
  });
});

describe("Die Projektion zeigt, was die Vektoren trennt", () => {
  it("hält zwei Haufen auseinander, die nichts miteinander zu tun haben", () => {
    const karte = semantikKarte(zweiHaufen());
    const innen = Math.max(abstand(karte, "a1", "a2"), abstand(karte, "b1", "b2"), abstand(karte, "a2", "a3"));
    const zwischen = Math.min(abstand(karte, "a1", "b1"), abstand(karte, "a3", "b2"));
    expect(zwischen, `innen ${innen}, zwischen ${zwischen}`).toBeGreaterThan(innen * 3);
  });

  it("legt zwei fast gleiche Notizen nahe beieinander", () => {
    const karte = semantikKarte([
      rohling("gleich", [1, 2, 3, 4]),
      rohling("fastgleich", [1.01, 2, 3, 4.02]),
      rohling("anders", [-4, 3, -2, 0.5]),
    ]);
    expect(abstand(karte, "gleich", "fastgleich")).toBeLessThan(abstand(karte, "gleich", "anders") / 5);
  });

  it("hält die Dichte: die Ausdehnung wächst mit der Wurzel der Zahl", () => {
    // Gemessen im echten Browser, 12 Notizen: die Karte füllte ihre Fläche, aber
    // die Knoten waren Punktemale bei 38 % Zoom und keine Etikette mehr lesbar.
    // Der Grund ist die Ausdehnung, nicht die Leinwand — eine feste Weltgröße
    // macht jede Karte kleiner, je mehr Notizen in sie hinein. Also wächst die
    // Welt mit √n: die Dichte bleibt, wo sie lesbar ist.
    const klein = semantikKarte(stern(6));
    const gross = semantikKarte(stern(24));
    expect(randVon(klein)).toBeCloseTo(SEMANTIK_ABSTAND * Math.sqrt(6), 6);
    expect(randVon(gross)).toBeCloseTo(SEMANTIK_ABSTAND * Math.sqrt(24), 6);
    // Punkte je Fläche — dieselbe Zahl bei sechs wie bei vierundzwanzig.
    expect(6 / randVon(klein) ** 2).toBeCloseTo(24 / randVon(gross) ** 2, 12);
  });

  it("sagt, wie viel die zwei Achsen von den Unterschieden tragen", () => {
    // Daten, die wirklich nur zwei Richtungen haben: die Achsen müssen alles
    // tragen, was es zu tragen gibt.
    const flach = semantikKarte([
      rohling("p1", [4, 1, 0, 0]),
      rohling("p2", [-3, 2, 0, 0]),
      rohling("p3", [1, -5, 0, 0]),
      rohling("p4", [2, 3, 0, 0]),
    ]);
    expect(flach.anteil[0]).toBeGreaterThanOrEqual(flach.anteil[1]);
    expect(flach.anteil[0] + flach.anteil[1]).toBeCloseTo(1, 6);

    const voll = semantikKarte([
      rohling("q1", [4, 1, 3, -2]),
      rohling("q2", [-3, 2, -1, 4]),
      rohling("q3", [1, -5, 2, 1]),
      rohling("q4", [2, 3, -4, -3]),
    ]);
    const summe = voll.anteil[0] + voll.anteil[1];
    expect(summe, "vier Richtungen passen nicht ganz in zwei Achsen").toBeLessThan(1);
    expect(summe).toBeGreaterThan(0.4);
  });
});

describe("Die Kappung ist laut", () => {
  it(`kappt bei ${SEMANTIK_KAPPE} Vektoren und zählt, was draußen bleibt`, () => {
    const viele: SemantikRohling[] = [];
    for (let i = 0; i < SEMANTIK_KAPPE + 1; i++) {
      viele.push(rohling(`n${String(i).padStart(5, "0")}`, [i % 7, (i * 3) % 11, i % 5, (i * 7) % 13]));
    }
    const karte = semantikKarte(viele);
    expect(karte.punkte).toHaveLength(SEMANTIK_KAPPE);
    expect(karte.gekappt).toBe(1);
    expect(karte.getragen).toBe(SEMANTIK_KAPPE);
    expect(karte.gesamt).toBe(SEMANTIK_KAPPE + 1);
  });

  it("kappt nach einer festen Regel, nicht nach Lieferung", () => {
    const eingabe: SemantikRohling[] = [];
    for (let i = 0; i < 6; i++) eingabe.push(rohling(`z${i}`, [i, 6 - i, i % 3, 1]));
    const eng = semantikKarte(eingabe, 4);
    expect(eng.punkte.map((p) => p.id)).toEqual(["z0", "z1", "z2", "z3"]);
    expect(eng.gekappt).toBe(2);
  });

  it("mischt keine Modelle — zwei Einbettungen sind zwei Maßstäbe", () => {
    const karte = semantikKarte([
      rohling("a1", [1, 0, 0], "nomic-embed-text"),
      rohling("a2", [0, 1, 0], "nomic-embed-text"),
      rohling("a3", [1, 1, 0], "nomic-embed-text"),
      rohling("b1", [9, 9, 9], "all-minilm"),
      rohling("b2", [8, 8, 8], "all-minilm"),
    ]);
    expect(karte.modell).toBe("nomic-embed-text");
    expect(karte.getragen).toBe(3);
    expect(karte.gesamt, "was die Wissensbasis insgesamt trägt").toBe(5);
    expect(karte.punkte.map((p) => p.id)).toEqual(["a1", "a2", "a3"]);
  });
});

describe("Grenzfälle fallen nicht um", () => {
  it("ohne Vektoren gibt es keine Karte und keinen Fehler", () => {
    const karte = semantikKarte([]);
    expect(karte.punkte).toEqual([]);
    expect(karte.modell).toBeNull();
    expect(karte.getragen).toBe(0);
    expect(karte.gesamt).toBe(0);
    expect(karte.gekappt).toBe(0);
    expect(karte.anteil).toEqual([0, 0]);
  });

  it("eine einzige Notiz hat keine Richtung — sie steht im Ursprung", () => {
    const karte = semantikKarte([rohling("solo", [3, 7, 1, 2])]);
    expect(karte.punkte).toEqual([{ id: "solo", x: 0, y: 0 }]);
    expect(karte.getragen).toBe(1);
  });

  it("zwei gleiche Notizen ergeben keinen Maßstabsprung", () => {
    const karte = semantikKarte([rohling("x", [1, 2, 3]), rohling("y", [1, 2, 3])]);
    expect(karte.punkte).toEqual([
      { id: "x", x: 0, y: 0 },
      { id: "y", x: 0, y: 0 },
    ]);
  });

  it("ein Nullvektor trägt nichts und wirft nichts um", () => {
    const karte = semantikKarte([rohling("leer", [0, 0, 0]), rohling("voll", [1, 0, 0]), rohling("halb", [0, 1, 0])]);
    expect(karte.punkte).toHaveLength(3);
    for (const p of karte.punkte) {
      expect(Number.isFinite(p.x), `x von ${p.id}`).toBe(true);
      expect(Number.isFinite(p.y), `y von ${p.id}`).toBe(true);
    }
  });
});

describe("Das Feld stellt jeden Knoten, auch den ohne Vektor", () => {
  const karte = () => semantikKarte([rohling("n1", [10, 0]), rohling("n2", [0, 10]), rohling("n3", [-8, 3])]);
  const notizen = ["n1", "n2", "n3", "n4", "n5"];
  const konzepte = [{ id: "__ent:nordwind", notizen: ["n1", "n2"] }];

  it("gibt jedem Knoten einen Platz", () => {
    const feld = layoutSemantik(karte(), notizen, konzepte);
    for (const id of [...notizen, "__ent:nordwind"]) {
      expect(feld.ziele.has(id), `${id} hat keinen Platz`).toBe(true);
      const z = feld.ziele.get(id)!;
      expect(Number.isFinite(z.x) && Number.isFinite(z.y), `${id} steht im Nichts`).toBe(true);
    }
  });

  it("parkt Notizen ohne Vektor auf einem Rand außerhalb der Karte", () => {
    const feld = layoutSemantik(karte(), notizen, konzepte);
    expect(feld.ohneVektor).toBe(2);
    const weitesterPunkt = Math.max(...karte().punkte.map((p) => Math.hypot(p.x, p.y)));
    for (const id of ["n4", "n5"]) {
      const z = feld.ziele.get(id)!;
      expect(Math.hypot(z.x, z.y), `${id} sitzt nicht am Rand`).toBeGreaterThan(weitesterPunkt);
    }
    expect(feld.rand).toBeGreaterThan(weitesterPunkt);
  });

  it("verteilt die Geparkten gleichmäßig, statt sie zu stapeln", () => {
    const feld = layoutSemantik(karte(), notizen, konzepte);
    const a = feld.ziele.get("n4")!;
    const b = feld.ziele.get("n5")!;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(feld.rand);
  });

  it("stellt einen Begriff in die Mitte dessen, was er trägt", () => {
    const feld = layoutSemantik(karte(), notizen, konzepte);
    const n1 = feld.ziele.get("n1")!;
    const n2 = feld.ziele.get("n2")!;
    const begriff = feld.ziele.get("__ent:nordwind")!;
    expect(begriff.x).toBeCloseTo((n1.x + n2.x) / 2, 9);
    expect(begriff.y).toBeCloseTo((n1.y + n2.y) / 2, 9);
  });

  it("nimmt für einen Begriff die Notizen mit Vektor, nicht den Rand", () => {
    // n4 und n5 parken am Rand. Ein Begriff, der eine geparkte und eine
    // gemessene Notiz trägt, gehört an die gemessene — sonst zieht der Rand
    // jeden Begriff nach außen, der zufällig eine junge Notiz hat.
    const feld = layoutSemantik(karte(), notizen, [{ id: "__ent:gemischt", notizen: ["n1", "n4"] }]);
    const n1 = feld.ziele.get("n1")!;
    const begriff = feld.ziele.get("__ent:gemischt")!;
    expect(Math.hypot(begriff.x, begriff.y)).toBeLessThanOrEqual(Math.hypot(n1.x, n1.y) + 1e-9);
  });

  it("legt dieselben Plätze fest, egal in welcher Reihenfolge die Notizen kommen", () => {
    const eins = layoutSemantik(karte(), notizen, konzepte);
    const zwei = layoutSemantik(karte(), [...notizen].reverse(), konzepte);
    expect([...zwei.ziele.entries()].sort()).toEqual([...eins.ziele.entries()].sort());
    expect(zwei.ohneVektor).toBe(eins.ohneVektor);
  });

  it("zeichnet nichts, wenn keine Karte da ist — und verliert keine Notiz", () => {
    const feld = layoutSemantik({ punkte: [] }, notizen, konzepte);
    expect(feld.ohneVektor).toBe(5);
    expect(feld.ziele.size).toBe(6);
  });
});
