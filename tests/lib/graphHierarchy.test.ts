// @vitest-environment node
//
// Dendrogramm-Layout: Baum-Aufbau (Wurzel -> Typ -> Entitaet -> Notiz) und
// Tidy-Tree-Positionierung. Reine Funktionen, kein DOM — die Kompontente
// zeichnet dieselben LayoutNode/LayoutEdge-Objekte wie das Kraftfeld.
import { describe, it, expect } from "vitest";
import {
  buildHierarchy,
  entitiesByMemory,
  layoutDendrogram,
  stepDendrogram,
  GLIDE_EPSILON,
  TYP_LABELS,
  type HierarchieKnoten,
} from "../../src/lib/graphHierarchy";
import type { Memory } from "../../src/types";

function mem(over: Partial<Memory> = {}): Memory {
  return {
    id: over.id ?? `m${Math.random().toString(36).slice(2, 8)}`,
    userId: "u",
    title: over.title ?? "Eine Notiz",
    content: "Inhalt",
    tags: [],
    createdAt: 1_000,
    updatedAt: 1_000,
    ...over,
  };
}

function finde(k: HierarchieKnoten, id: string): HierarchieKnoten | null {
  if (k.id === id) return k;
  for (const c of k.children) {
    const t = finde(c, id);
    if (t) return t;
  }
  return null;
}

describe("entitiesByMemory", () => {
  it("invertiert memoriesByEntity und entscheidet Mehrfach-Zugehoerigkeit alphabetisch", () => {
    const map = entitiesByMemory({ Zebra: ["a"], Ananas: ["a", "b"] });
    expect(map.get("a")).toBe("Ananas");
    expect(map.get("b")).toBe("Ananas");
  });

  it("leert/undefiniert ergibt eine leere Map", () => {
    expect(entitiesByMemory(undefined).size).toBe(0);
    expect(entitiesByMemory({}).size).toBe(0);
  });
});

describe("buildHierarchy", () => {
  it("leere Basis: nur die Wurzel, ohne Kinder", () => {
    const baum = buildHierarchy([]);
    expect(baum.kind).toBe("root");
    expect(baum.children).toHaveLength(0);
  });

  it("gruppiert nach Typ in fester Reihenfolge; Typen ohne Notizen entfallen", () => {
    const baum = buildHierarchy([
      mem({ id: "1", type: "procedural" }),
      mem({ id: "2", type: "semantic" }),
    ]);
    expect(baum.children.map((c) => c.id)).toEqual(["__typ:semantic", "__typ:procedural"]);
  });

  it("Notizen ohne Entitaet haengen direkt unter dem Typ", () => {
    const baum = buildHierarchy([mem({ id: "1", type: "semantic", title: "Solo" })]);
    const typ = finde(baum, "__typ:semantic")!;
    expect(typ.children).toHaveLength(1);
    expect(typ.children[0]).toMatchObject({ id: "1", kind: "memory", label: "Solo" });
  });

  it("nennt eine Notiz ohne Titel nach ihrem ersten Satz — wie das Kraftfeld", () => {
    // Zwei Ansichten, derselbe Knoten, zwei Namen: der Baum sagte „Untitled",
    // das Feld den ersten Satz. Eine Wissensbasis, die sich je nach Ansicht
    // anders vorstellt, ist nicht übersichtlich, sondern widersprüchlich.
    const baum = buildHierarchy([mem({ id: "9", type: "semantic", title: "", content: "Rechnung 2024/07 vom Kanal" })]);
    expect(finde(baum, "9")?.label).toBe("Rechnung 2024/07 vom Kanal");
  });

  it("Notizen ohne Entitaet, aber mit Tag, werden nach erstem Tag gruppiert", () => {
    const baum = buildHierarchy([
      mem({ id: "1", type: "semantic", tags: ["maschine-scan", "json"] }),
      mem({ id: "2", type: "semantic", tags: ["MASCHINE-SCAN"] }),
      mem({ id: "3", type: "semantic", tags: [] }),
    ]);
    const typ = finde(baum, "__typ:semantic")!;
    // Tag-Gruppe (alphabetisch vor direkten Blaettern) + untagged Blatt
    expect(typ.children.map((c) => c.id)).toEqual(["__tag:maschine-scan", "3"]);
    const gruppe = finde(baum, "__tag:maschine-scan")!;
    expect(gruppe.kind).toBe("group");
    expect(gruppe.label).toBe("#maschine-scan");
    expect(gruppe.children.map((c) => c.id)).toEqual(["1", "2"]);
  });

  it("Notizen mit Entitaet haengen unter einem Entitaetsknoten; Entitaeten alphabetisch", () => {
    const ent = new Map([
      ["1", "Zebra GmbH"],
      ["2", "Anstatt AG"],
      ["3", "Anstatt AG"],
    ]);
    const baum = buildHierarchy(
      [mem({ id: "1", type: "semantic" }), mem({ id: "2", type: "semantic" }), mem({ id: "3", type: "semantic" })],
      ent
    );
    const typ = finde(baum, "__typ:semantic")!;
    expect(typ.children.map((c) => c.id)).toEqual(["__ent:Anstatt AG", "__ent:Zebra GmbH"]);
    const entKnoten = finde(baum, "__ent:Anstatt AG")!;
    expect(entKnoten.children.map((c) => c.id)).toEqual(["2", "3"]);
  });

  it("nur was das Netz ein Konzept nennt, wird ein Entitätsknoten", () => {
    // Das Feld zeigt eine Entität erst ab zwei Notizen oder als Endpunkt einer
    // Behauptung. Der Baum zeigte sie bisher immer — für dieselbe Wissensbasis
    // standen dann zwei Zahlen da, und die Idee war eine Ontologie.
    const ent = new Map([["1", "Zebra GmbH"], ["2", "Anstatt AG"], ["3", "Anstatt AG"]]);
    const baum = buildHierarchy(
      [mem({ id: "1", type: "semantic" }), mem({ id: "2", type: "semantic" }), mem({ id: "3", type: "semantic" })],
      ent,
      new Set(["Anstatt AG"])
    );
    const typ = finde(baum, "__typ:semantic")!;
    // Die eine Notiz über „Zebra GmbH" hängt direkt unter dem Typ — die Ebene
    // wäre ein Durchreicher, den kein Bild der Welt braucht.
    expect(typ.children.map((c) => c.id)).toEqual(["__ent:Anstatt AG", "1"]);
    expect(finde(baum, "__ent:Zebra GmbH")).toBeNull();
  });

  it("Blaetter innerhalb einer Entitaet sind nach Titel sortiert", () => {
    const ent = new Map([["1", "Kunde"], ["2", "Kunde"], ["3", "Kunde"]]);
    const baum = buildHierarchy(
      [mem({ id: "3", title: "c" }), mem({ id: "1", title: "a" }), mem({ id: "2", title: "b" })],
      ent
    );
    expect(finde(baum, "__ent:Kunde")!.children.map((c) => c.label)).toEqual(["a", "b", "c"]);
  });

  it("Fehlender Typ defaultet auf semantic", () => {
    const baum = buildHierarchy([mem({ id: "1" })]);
    expect(finde(baum, "__typ:semantic")).not.toBeNull();
    expect(finde(baum, "__typ:episodic")).toBeNull();
  });

  it("reference ist ein bekannter Typ mit eigenem Label (Documents — wie im Editor)", () => {
    const baum = buildHierarchy([
      mem({ id: "1", type: "reference", title: "pdf-ls" }),
      mem({ id: "2", type: "semantic", title: "a" }),
    ]);
    const refTyp = finde(baum, "__typ:reference");
    expect(refTyp).not.toBeNull();
    expect(refTyp!.label).toBe("Documents");
    expect(refTyp!.typ).toBe("reference"); // bekannte Farbe — blau wie im Kraftfeld
    expect(finde(baum, "1")).not.toBeNull();
  });

  it("Wirklich unbekannter Typ bekommt eine eigene Gruppe statt verworfen zu werden", () => {
    const baum = buildHierarchy([
      mem({ id: "1", type: "sonderbar" as Memory["type"], title: "x" }),
      mem({ id: "2", type: "semantic", title: "a" }),
    ]);
    const sonderbar = finde(baum, "__typ:sonderbar");
    expect(sonderbar).not.toBeNull();
    expect(sonderbar!.typ).toBeUndefined(); // keine bekannte Farbe — neutral
    expect(finde(baum, "1")).not.toBeNull();
  });

  it("deutsche Typ-Labels sind gesetzt", () => {
    expect(TYP_LABELS.semantic).toBe("Facts");
    expect(TYP_LABELS.episodic).toBe("Events");
    expect(TYP_LABELS.procedural).toBe("How-tos");
  });
});

describe("layoutDendrogram", () => {
  it("positioniert jeden Baumknoten; Kanten verbinden Eltern mit Kindern", () => {
    const baum = buildHierarchy([
      mem({ id: "1", type: "semantic", title: "a" }),
      mem({ id: "2", type: "semantic", title: "b" }),
      mem({ id: "3", type: "episodic", title: "c" }),
    ]);
    const { nodes, edges, struktur } = layoutDendrogram(baum);
    const ids = new Set(nodes.map((n) => n.id));
    // 4 Knoten: Wurzel, 2 Typen, 3 Notizen = 6
    expect(nodes).toHaveLength(6);
    for (const e of edges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
      expect(e.real).toBe(true);
    }
    expect(edges).toHaveLength(5);
    expect(struktur.get("__wurzel")).toMatchObject({ label: "Knowledge" });
    expect(struktur.get("__typ:semantic")).toMatchObject({ farbe: "semantic" });
    expect(struktur.has("1")).toBe(false); // Notizen sind keine Strukturknoten
  });

  it("Tiefe von links nach rechts; Eltern sind zentriert ueber ihren Kindern", () => {
    const baum = buildHierarchy([
      mem({ id: "1", type: "semantic", title: "a" }),
      mem({ id: "2", type: "semantic", title: "b" }),
      mem({ id: "3", type: "episodic", title: "c" }),
    ]);
    const { nodes } = layoutDendrogram(baum);
    const bei = new Map(nodes.map((n) => [n.id, n]));
    expect(bei.get("__wurzel")!.x).toBe(0);
    expect(bei.get("__typ:semantic")!.x).toBeGreaterThan(bei.get("__wurzel")!.x);
    expect(bei.get("1")!.x).toBeGreaterThan(bei.get("__typ:semantic")!.x);
    const kindY = [bei.get("1")!.y, bei.get("2")!.y];
    const elternY = bei.get("__typ:semantic")!.y;
    expect(elternY).toBeCloseTo((kindY[0] + kindY[1]) / 2, 10);
  });

  it("Blaetter ueberlappen nicht: vertikaler Abstand >= Knotengroesse", () => {
    const notizen = Array.from({ length: 40 }, (_, i) =>
      mem({ id: `x${i}`, type: "semantic", title: `n${i}` })
    );
    const { nodes } = layoutDendrogram(buildHierarchy(notizen));
    // Nur Blaetter stapeln sich streng; Eltern-Knoten liegen zentriert DAZWISCHEN.
    const ys = nodes.filter((n) => !n.id.startsWith("__")).map((n) => n.y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(36); // blattAbstand minus Toleranz
    }
  });

  it("faltet eine Gruppe zu einem Blatt: ihre Kinder verschwinden samt Kanten", () => {
    const baum = buildHierarchy([
      mem({ id: "1", type: "semantic", title: "a", tags: ["k"] }),
      mem({ id: "2", type: "semantic", title: "b", tags: ["k"] }),
      mem({ id: "3", type: "episodic", title: "c" }),
    ]);
    const { nodes, edges, struktur } = layoutDendrogram(baum, { eingeklappt: new Set(["__typ:semantic"]) });
    const ids = new Set(nodes.map((n) => n.id));
    expect(ids.has("__typ:semantic"), "die gefaltete Gruppe muss stehen").toBe(true);
    expect(ids.has("__tag:k"), "die Kindgruppe steht noch").toBe(false);
    expect(ids.has("1"), "ein gefaltetes Notizkind steht noch").toBe(false);
    expect(ids.has("3"), "eine andere Gruppe fiel mit weg").toBe(true);
    expect(edges.some((e) => e.target === "1"), "eine Kante in die Faltung steht noch").toBe(false);
    expect(struktur.get("__typ:semantic")).toMatchObject({ eingeklappt: true, blaetter: 2 });
    expect(struktur.has("__tag:k"), "ein weggefallenes Kind wird noch benannt").toBe(false);
  });

  it("faltet tiefer liegende Gruppen, ohne die darüber zu berühren", () => {
    const baum = buildHierarchy([
      mem({ id: "1", type: "semantic", title: "a", tags: ["k"] }),
      mem({ id: "2", type: "semantic", title: "b", tags: ["k"] }),
      mem({ id: "3", type: "semantic", title: "c", tags: ["andere"] }),
    ]);
    const { nodes, struktur } = layoutDendrogram(baum, { eingeklappt: new Set(["__tag:k"]) });
    const ids = new Set(nodes.map((n) => n.id));
    expect(ids.has("__typ:semantic"), "die Ebene darüber fiel weg").toBe(true);
    expect(ids.has("__tag:andere"), "eine andere Gruppe fiel mit weg").toBe(true);
    expect(ids.has("1"), "ein gefaltetes Kind steht noch").toBe(false);
    expect(struktur.get("__tag:k")).toMatchObject({ eingeklappt: true, blaetter: 2 });
  });

  it("lässt den Baum unverändert, wenn niemand faltet", () => {
    // Der Baum startet voll entfaltet; die Faltung ist Benutzerhandlung. Ein
    // leeres Set darf deshalb nicht wie ein Eingriff aussehen.
    const baum = buildHierarchy([
      mem({ id: "1", type: "semantic", title: "a" }),
      mem({ id: "2", type: "episodic", title: "b" }),
    ]);
    const ohne = layoutDendrogram(baum);
    const leer = layoutDendrogram(baum, { eingeklappt: new Set() });
    expect(leer.nodes.map((n) => [n.id, n.x, n.y])).toEqual(ohne.nodes.map((n) => [n.id, n.x, n.y]));
    expect(leer.edges).toHaveLength(ohne.edges.length);
    for (const [id, s] of leer.struktur) expect(s.eingeklappt, `${id} gefaltet ohne Hand`).toBeUndefined();
  });

  it("ist deterministisch: gleiche Eingabe, gleiche Positionen", () => {
    const notizen = [
      mem({ id: "1", type: "semantic", title: "a" }),
      mem({ id: "2", type: "episodic", title: "b" }),
    ];
    const a = layoutDendrogram(buildHierarchy(notizen));
    const b = layoutDendrogram(buildHierarchy(notizen));
    expect(a.nodes.map((n) => [n.id, n.x, n.y])).toEqual(b.nodes.map((n) => [n.id, n.x, n.y]));
  });

  it("Bounds umschliessen alle Knoten", () => {
    const notizen = Array.from({ length: 10 }, (_, i) => mem({ id: `x${i}` }));
    const { nodes, bounds } = layoutDendrogram(buildHierarchy(notizen));
    for (const n of nodes) {
      expect(n.x).toBeGreaterThanOrEqual(bounds.minX);
      expect(n.x).toBeLessThanOrEqual(bounds.maxX);
      expect(n.y).toBeGreaterThanOrEqual(bounds.minY);
      expect(n.y).toBeLessThanOrEqual(bounds.maxY);
    }
  });

  it("ein Knoten, der nur seine eine Notiz wiederholt, trägt kein eigenes Etikett", () => {
    // Die Aufnahme des Baums vom 6.10. zeigte eine doppelte Spalte: der
    // Entitätsknoten heisst „elena weiss — tax advisor" und sein einziges Kind
    // ist die Notiz mit demselben Titel. Das Gerüst sagt dort nichts, was der
    // Inhalt nicht schon sagt.
    const a = mem({ id: "e1", type: "semantic", title: "Elena Weiss — tax advisor" });
    const baum = buildHierarchy([a], new Map([["e1", "elena weiss — tax advisor"]]));
    const { struktur } = layoutDendrogram(baum);
    expect(struktur.get("__ent:elena weiss — tax advisor")!.keinEtikett).toBe(true);
  });

  it("bei zwei Notizen behält der Entitätsknoten sein Etikett", () => {
    // Hier trägt der Knoten Information, die keine einzelne Notiz hat: er fasst
    // zwei Behauptungen über dieselbe Person zusammen.
    const a = mem({ id: "q1", type: "semantic", title: "Q1 call with Elena" });
    const b = mem({ id: "q2", type: "semantic", title: "Q2 call with Elena" });
    const baum = buildHierarchy([a, b], new Map([["q1", "elena weiss"], ["q2", "elena weiss"]]));
    const { struktur } = layoutDendrogram(baum);
    expect(struktur.get("__ent:elena weiss")!.keinEtikett).toBeFalsy();
  });

  it("ein Etikett, das der Titel eines seiner Kinder ist, bleibt weg", () => {
    // Die Aufnahme vom 6.10. zeigt es auch mit mehreren Kindern: die Entität
    // „hourly rate 2025" hat zwei Notizen, eine davon heisst genauso. Auf der
    // Zeile des Knotenmittelpunkts steht dann zweimal derselbe Name — ein
    // Leser weiss nicht, ob der linke die Ebene oder das eine Blatt meint.
    const a = mem({ id: "h1", type: "semantic", title: "Hourly rate 2025" });
    const b = mem({ id: "h2", type: "semantic", title: "Hourly rate 2024" });
    const baum = buildHierarchy([a, b], new Map([["h1", "hourly rate 2025"], ["h2", "hourly rate 2025"]]));
    const { struktur } = layoutDendrogram(baum);
    expect(struktur.get("__ent:hourly rate 2025")!.keinEtikett).toBe(true);
  });
});

describe("stepDendrogram", () => {
  it("gleitet zu den Zielen und kommt zur Ruhe", () => {
    const nodes = [
      { id: "a", x: 0, y: 0, vx: 0, vy: 0, r: 5, pinned: false },
      { id: "b", x: 100, y: 100, vx: 0, vy: 0, r: 5, pinned: false },
    ];
    const ziel = new Map([
      ["a", { x: 50, y: 50 }],
      ["b", { x: 100, y: 100 }], // schon am Ziel
    ]);
    let bewegt = true;
    let schritte = 0;
    while (bewegt && schritte < 1000) {
      bewegt = stepDendrogram(nodes, ziel);
      schritte++;
    }
    expect(bewegt).toBe(false);
    expect(nodes[0].x).toBeCloseTo(50, 6);
    expect(nodes[0].y).toBeCloseTo(50, 6);
    expect(schritte).toBeLessThan(200);
  });

  it("Knoten ohne Ziel bleiben, wo sie sind", () => {
    const nodes = [{ id: "x", x: 7, y: 9, vx: 0, vy: 0, r: 5, pinned: false }];
    stepDendrogram(nodes, new Map());
    expect(nodes[0].x).toBe(7);
    expect(nodes[0].y).toBe(9);
  });

  it("kleine Restabweichungen unter dem Epsilon werden exakt auf das Ziel gesetzt", () => {
    const nodes = [{ id: "a", x: 10, y: 10, vx: 0, vy: 0, r: 5, pinned: false }];
    stepDendrogram(nodes, new Map([["a", { x: 10 + GLIDE_EPSILON / 2, y: 10 }]]));
    expect(nodes[0].x).toBe(10 + GLIDE_EPSILON / 2);
  });

  // Gefunden in P-9: zwei Besuche derselben Projektion zeigten zwei verschiedene
  // Bilder. Der letzte Sprung auf das Ziel geschah in einem Schritt, der keine
  // Bewegung meldete — die Bildschleife zeichnete also nicht mehr, und das
  // stehende Bild blieb bis zu GLIDE_EPSILON hinter der Rechnung zurück.
  it("meldet den letzten Sprung als Bewegung, damit das Bild ihn zeigt", () => {
    const nodes = [{ id: "a", x: 10, y: 10, vx: 0, vy: 0, r: 5, pinned: false }];
    const ruch = stepDendrogram(nodes, new Map([["a", { x: 10 + GLIDE_EPSILON / 2, y: 10 }]]));
    expect(ruch, "der Snap veränderte die Position, meldet aber Ruhe").toBe(true);
  });

  it("meldet Ruhe, wenn nichts mehr zu setzen ist", () => {
    const nodes = [{ id: "a", x: 12, y: 12, vx: 0, vy: 0, r: 5, pinned: false }];
    expect(stepDendrogram(nodes, new Map([["a", { x: 12, y: 12 }]]))).toBe(false);
  });
});
