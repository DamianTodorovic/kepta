// A9 §2: "Die Kante sagt, wie fest etwas zusammengehoert" — heute stimmt das nicht.
// src/ui/graph.ts erfindet 0.3 fuer ein Paar, das durch den Schwellwert fiel
// (Zeile 91), setzt 0.85 auf jede [[Link]]-Kante (Zeile 130), teilt die
// Aehnlichkeit durch Math.min (Zeile 45/54, ein Tag gegen acht gewinnt mit 1,0)
// und wirft Beweis und Vermutung in eine Zahl `grad` (Zeile 131-141).
// Dieser Test rechnet jede gemeldete Zahl aus den Ausgangsdaten neu.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { baueNotizBild, type NotizKnoten } from "../src/ui/graph";
import { KAPPE } from "../src/core/graf-vertrag";
import { indexierBegriffe } from "../src/core/graf-terms";

/** Zwei duenne Notizen, die genau EINEN Begriff teilen: die heute staerkste Kante. */
function duenneNotizen(): NotizKnoten[] {
  return [
    { id: "k-1", titel: "Netzteil", inhalt: "", tags: ["server"], art: "semantic" },
    {
      id: "k-2",
      titel: "Rechnung",
      inhalt: "",
      tags: ["server", "mietvertrag", "rz", "gx", "1080", "linux", "brandmuern", "kuehlung"],
      art: "semantic",
    },
    { id: "k-3", titel: "Standort", inhalt: "", tags: ["server", "mietvertrag", "rz"], art: "reference" },
  ];
}

function kante(bild: ReturnType<typeof baueNotizBild>, a: string, b: string) {
  return bild.kanten.find((k) => k.quelle === a && k.ziel === b);
}

describe("graf-kante-ehrlich: gemessen statt erfunden", () => {
  it("ein Tag gegen acht ergibt 0,125 — und ist nicht die staerkste Kante im Bild", () => {
    const bild = baueNotizBild(duenneNotizen());
    const duenn = kante(bild, "k-1", "k-2");
    expect(duenn).toBeDefined();
    // Heute: 1,0 (min-Division) * 0,9 = 0,9 — die staerkste Kante des Systems.
    expect(duenn!.maess.wert).toBeCloseTo(1 / 8, 10);
    expect(duenn!.maess.wert!).toBeLessThanOrEqual(0.15);
    const starkste = Math.max(...bild.kanten.filter((k) => k.sorte === "aehnlich").map((k) => k.maess.wert ?? 0));
    expect(starkste).toBeGreaterThan(duenn!.maess.wert!);
    expect(duenn!.maess.basis).toBe("jaccard");
  });

  it("jede Aehnlichkeitskante traegt die Zahl, die die Rechnung ergibt", () => {
    const notizen = duenneNotizen();
    const bild = baueNotizBild(notizen);
    const titel = new Map(notizen.map((n) => [n.id, new Set(indexierBegriffe(n.titel ?? ""))]));
    const tags = new Map(notizen.map((n) => [n.id, new Set((n.tags ?? []).map((t) => t.toLowerCase()))]));
    for (const k of bild.kanten.filter((e) => e.sorte === "aehnlich")) {
      const a = tags.get(k.quelle)!;
      const b = tags.get(k.ziel)!;
      const ta = titel.get(k.quelle)!;
      const tb = titel.get(k.ziel)!;
      const sn = (x: Set<string>, y: Set<string>) => [...x].filter((t) => y.has(t)).length;
      const jacc = (x: Set<string>, y: Set<string>) => (x.size && y.size ? sn(x, y) / (x.size + y.size - sn(x, y)) : 0);
      const erwartet = Math.max(jacc(a, b), jacc(ta, tb));
      expect(k.maess.wert).toBeCloseTo(erwartet, 6);
      expect(k.maess.gemessen).toBe(true);
    }
  });

  it("ein Paar unter dem Schwellwert bekommt keine erfuellte Staerke mehr", () => {
    // A5-06: frueher wurde dieses Paar mit hartcodiert 0.3 aufgenommen, obwohl die
    // Rechnung 0,18 sagte. Jetzt steht die gemessene Zahl — oder keine Kante.
    const notizen: NotizKnoten[] = [
      { id: "k-1", titel: "Engpass", inhalt: "", tags: ["alpha"], art: "semantic" },
      {
        id: "k-2",
        titel: "Fahrplan",
        inhalt: "",
        tags: ["alpha", "b2", "b3", "b4", "b5", "b6", "b7", "b8", "b9", "b10", "b11", "b12"],
        art: "semantic",
      },
    ];
    const bild = baueNotizBild(notizen);
    const k = kante(bild, "k-1", "k-2");
    if (k) {
      expect(k.maess.wert).not.toBe(0.3);
      expect(k.maess.wert).toBeCloseTo(1 / 12, 10);
    } else {
      // Fallengelassen ist ehrlich, muss aber in der Bilanz stehen.
      expect(bild.kuerzung.uebrig.paare).toBeGreaterThanOrEqual(1);
      expect(bild.kuerzung.vollstaendig).toBe(false);
    }
  });

  it("zwei Notizen, deren Vektoren 0,18 apart stehen, liefern 0,18 und nicht 0,3", () => {
    const wurzel = Math.sqrt(1 - 0.18 * 0.18);
    const notizen: NotizKnoten[] = [
      {
        id: "k-1",
        titel: "Alpha",
        tags: ["duemm"],
        vektoren: [{ vektor: new Float32Array([1, 0]), modell: "nomic-embed" }],
      },
      {
        id: "k-2",
        titel: "Beta",
        // 1 / 13 = 0,0769 — unter dem Schwellwert, damit der Vektor gewinnt.
        tags: ["duemm", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11", "s12", "s13"],
        vektoren: [{ vektor: new Float32Array([0.18, wurzel]), modell: "nomic-embed" }],
      },
    ];
    const bild = baueNotizBild(notizen);
    const k = kante(bild, "k-1", "k-2");
    expect(k).toBeDefined();
    expect(k!.maess.basis).toBe("cosinus");
    expect(k!.maess.wert).toBeCloseTo(0.18, 6);
    expect(k!.erklaerung.art).toBe("vektor");
  });

  it("zwei Embedding-Modelle sind zwei Massstab: kein Cosinus uber sie hinweg", () => {
    const notizen: NotizKnoten[] = [
      { id: "k-1", titel: "Alpha", tags: ["duemm"], vektoren: [{ vektor: new Float32Array([1, 0]), modell: "nomic-embed" }] },
      {
        id: "k-2",
        titel: "Beta",
        tags: ["duemm"],
        vektoren: [{ vektor: new Float32Array([1, 0]), modell: "anderes-modell" }],
      },
    ];
    const bild = baueNotizBild(notizen);
    const k = kante(bild, "k-1", "k-2");
    expect(k!.maess.basis).toBe("jaccard");
    expect(k!.maess.wert).toBe(1);
  });

  it("eine [[Link]]-Kante nennt Belege, keine Messgroesse", () => {
    const notizen: NotizKnoten[] = [
      { id: "k-1", titel: "Start", inhalt: "Siehe [[Ziel]] und erneut [[Ziel]].", tags: [] },
      { id: "k-2", titel: "Ziel", inhalt: "Ein Satz.", tags: [] },
    ];
    const bild = baueNotizBild(notizen);
    const k = bild.kanten.find((e) => e.sorte === "echt");
    expect(k).toBeDefined();
    expect(k!.maess.wert).toBeNull();
    expect(k!.maess.basis).toBe("verlinkt");
    // Heute: 0.85 auf JEDEM [[Link]], unabhaengig davon, wie oft verlinkt wird.
    expect(k!.belege).toBe(2);
    expect(k!.erklaerung.art).toBe("titel");
    expect(k!.feder).toBeGreaterThan(0);
    expect(k!.feder).toBeLessThanOrEqual(1);
  });

  it("Beweis und Vermutung bleiben zwei Kanale", () => {
    const notizen: NotizKnoten[] = [
      { id: "k-1", titel: "Start", inhalt: "Siehe [[Ziel]].", tags: ["gemeinsam"] },
      { id: "k-2", titel: "Ziel", inhalt: "Ein Satz.", tags: ["gemeinsam"] },
      { id: "k-3", titel: "Nur geraten", inhalt: "", tags: ["gemeinsam"] },
    ];
    const bild = baueNotizBild(notizen);
    const start = bild.knoten.find((n) => n.id === "k-1")!;
    const geraten = bild.knoten.find((n) => n.id === "k-3")!;
    expect(start.gradEcht).toBe(1);
    expect(geraten.gradEcht).toBe(0);
    expect(geraten.gradVermutet).toBeGreaterThan(0);
    // Kein Feld mehr, das beide in eine Zahl wirft.
    expect(bild.knoten[0]).not.toHaveProperty("grad");
  });

  it("keine Zahl an einer Kante steht hartcodiert im Quelltext", () => {
    // A9 §2.4: das ist eine Wache, kein Wunsch.
    const quelltext = fs.readFileSync(
      path.join(process.cwd(), "src/ui/graph.ts"),
      "utf-8"
    );
    expect(quelltext).not.toMatch(/staerke:\s*0\.3\b/);
    expect(quelltext).not.toMatch(/staerke:\s*0\.85\b/);
    expect(quelltext).not.toMatch(/Math\.min\(\s*a\.length\s*,\s*b\.length\s*\)/);
    expect(quelltext).not.toContain("maxBucket");
    expect(quelltext).not.toMatch(/tagScore\s*\*\s*0\.9/);
  });

  it("die Kappen reisen als Feld mit und sind die Voreinstellung", () => {
    const bild = baueNotizBild(duenneNotizen());
    expect(bild.kuerzung.kappe).toEqual({
      knoten: KAPPE.knoten,
      kanten: KAPPE.kanten,
      paarPruefungen: KAPPE.paarPruefungen,
    });
  });
});
