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
  vorschlagFaltung,
  zeilenKMin,
  FALTUNG_HALTE_NOTIZEN,
  FALTUNG_MIN_NOTIZEN,
  GLIDE_EPSILON,
  TYP_LABELS,
  type HierarchieKnoten,
} from "../../src/lib/graphHierarchy";
import type { Memory } from "../../src/types";

/**
 * Notizen, die nach einer Faltung noch als Zeile im Bild stehen.
 *
 * Am BAUM abgelaufen, nicht an den Layout-Knoten abgelesen: `istStruktur` erkennt
 * nur diepraefixierten Knoten der echten Flaeche („__ent:..."), die Test-Fixturen
 * heissen aber „g0-1" — und zaehlten ihre Gruppen als Notizen.
 */
function offeneNotizen(baum: HierarchieKnoten, ids: readonly string[]): number {
  const gefaltet = new Set(ids);
  const zahl = (k: HierarchieKnoten): number => {
    if (k.children.length === 0) return 1;
    if (gefaltet.has(k.id)) return 0;
    return k.children.reduce((n, c) => n + zahl(c), 0);
  };
  return zahl(baum);
}

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

  it("Notizen ohne Entitaet, aber mit Tag, werden nach der trennendsten Marke gruppiert", () => {
    // Die erste Marke war der Fehler: der Scan haengt `machine-scan` vorn an, und
    // am echten Bestand (21 066) landeten 18 993 Notizen — 90,16 % — in EINEM Fach
    // dieses Namens. Was eine Notiz unterscheidet, ist ihre seltenste Marke.
    const baum = buildHierarchy([
      mem({ id: "1", type: "semantic", tags: ["maschine-scan", "json"] }),
      mem({ id: "2", type: "semantic", tags: ["MASCHINE-SCAN"] }),
      mem({ id: "3", type: "semantic", tags: [] }),
    ]);
    const typ = finde(baum, "__typ:semantic")!;
    // Zwei Tag-Gruppen (alphabetisch) + das untagte Blatt
    expect(typ.children.map((c) => c.id)).toEqual(["__tag:json", "__tag:maschine-scan", "3"]);
    const gruppe = finde(baum, "__tag:json")!;
    expect(gruppe.kind).toBe("group");
    expect(gruppe.label).toBe("#json");
    expect(gruppe.children.map((c) => c.id)).toEqual(["1"]);
    expect(finde(baum, "__tag:maschine-scan")!.children.map((c) => c.id)).toEqual(["2"]);
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

  it("reference ist ein bekannter Typ mit eigener Beschreibung (#84: kein Korb-Wort, auch nicht im Baum)", () => {
    const baum = buildHierarchy([
      mem({ id: "1", type: "reference", title: "pdf-ls" }),
      mem({ id: "2", type: "semantic", title: "a" }),
    ]);
    const refTyp = finde(baum, "__typ:reference");
    expect(refTyp).not.toBeNull();
    expect(refTyp!.label).toBe("Documents & files");   // seit #84 die Beschreibung; die Art bleibt `reference`
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

// #72: Der Baum passte nicht in seine Leinwand. Die Kamera wurde bei 0,35
// angebunden (ab ~63 Blättern immer), was den Baum oben und unten abschnitt —
// gemessen am 400-Notizen-Bestand: Tinte über die volle Leinwandhöhe, 116
// Bildpunkte an der Unterkante. Der Knopf „alles zeigen" ließ dagegen eine 42 px
// breite Haarlinie übrig. Beides ist kein Ausschnitt, sondern ein Verlust.
// Der Baum muss sich selbst falten, wenn er nicht passt.
describe("vorschlagFaltung: der Baum faltet sich, was er nicht zeigen kann", () => {
  const zweig = (id: string, blaetter: number): HierarchieKnoten => ({
    id, kind: "entity", label: id,
    children: Array.from({ length: blaetter }, (_, i) => ({
      id: `${id}-n${i}`, kind: "memory" as const, label: `${id} Notiz ${i}`, children: [],
    })),
  });
  const baum = (gruppen: number[], typen = 1): HierarchieKnoten => ({
    id: "__wurzel", kind: "root", label: "Wurzel",
    children: Array.from({ length: typen }, (_, t) => ({
      id: `__typ:${t}`, kind: "type" as const, label: `Typ ${t}`,
      children: gruppen.map((g, i) => zweig(`g${t}-${i}`, g)),
    })),
  });
  /** Zeilen, die der Vorschlag im Layout sichtbar lässt. */
  function zeilen(baum: HierarchieKnoten, ids: string[]) {
    return layoutDendrogram(baum, { eingeklappt: new Set(ids) }).nodes.length;
  }

  it("lässt einen Baum, der passt, unangetastet", () => {
    const b = baum([3, 4, 2]);
    // 9 Blätter + 3 Gruppen + 1 Typ + Wurzel = 14 Zeilen.
    expect(zeilen(b, [])).toBe(14);
    expect(vorschlagFaltung(b, 14)).toEqual([]);
    expect(vorschlagFaltung(b, 400)).toEqual([]);
  });

  it("faltet zuerst die tiefste Ebene, nicht den größten Brocken", () => {
    // Ein Typ zu falten spart mehr Zeilen als eine Gruppe — und wäre doch der
    // falsche Griff: der Baum hört dann oberhalb seiner Begriffe auf, und was
    // übrig bleibt, ist eine Zahl von ganz oben, keine Struktur.
    const b = baum(Array.from({ length: 3 }, () => 20), 2);
    const ids = vorschlagFaltung(b, 10);
    expect(ids.some((id) => id.startsWith("__typ:")), `oben gefaltet: ${ids.join(", ")}`).toBe(false);
    expect(ids.every((id) => id.startsWith("g")), `nicht die Gruppen: ${ids.join(", ")}`).toBe(true);
  });

  it("faltet die größte Gruppe zuerst", () => {
    // Zwei Gruppen auf derselben Ebene: der Vater einer Gruppe spart immer mehr
    // als ihr Kind, also ist die Reihenfolge nur auf einer Ebene prüfbar.
    const b: HierarchieKnoten = {
      id: "__wurzel", kind: "root", label: "Wurzel",
      children: [zweig("gross", 40), zweig("klein", 2)],
    };
    const ids = vorschlagFaltung(b, 20);
    expect(ids[0], `zuerst: ${ids.join(", ")}`).toBe("gross");
  });

  it("hält die sichtbaren Zeilen im Rahmen — oder nennt die Gruppe, die er nicht zumuten darf", () => {
    // Zwei Zusagen, die sich nicht immer halten lassen: Zeilen im Rahmen UND
    // Notizen im Bild. Eine Gruppe ist atomar — bei 20 Gruppen zu 20 Notizen und
    // einem Rahmen von 20 Zeilen steht die Struktur allein schon bei 22, und
    // die letzte offene Gruppe kostet 20 Zeilen mehr.
    //
    // Die Flaeche faellt dann nicht zurueck ins Leere (A7-01, gemessen
    // „Showing 0 of 60 notes"), sondern ueberschreitet den Rahmen — und genau
    // das ist die Prufung: der Rahmen gilt, SOLANGE eine Faltung die letzte
    // Notiz nicht frisst. Die Kamera nimmt den Rest mit.
    const b = baum(Array.from({ length: 20 }, () => 20));
    for (const rahmen of [60, 34, 20, 12]) {
      const ids = vorschlagFaltung(b, rahmen);
      const zeilen = layoutDendrogram(b, { eingeklappt: new Set(ids) }).nodes.length;
      const imBild = offeneNotizen(b, ids);
      expect(imBild, `Rahmen ${rahmen}: keine Notiz mehr im Bild`).toBeGreaterThanOrEqual(FALTUNG_HALTE_NOTIZEN);
      // Haette die Faltung noch eine Gruppe nehmen duerfen, ohne die Zusage zu
      // brechen? Nein => der Überhang ist erzwungen, nicht Nachlaessigkeit.
      const nochEine = b.children[0].children
        .filter((k) => !ids.includes(k.id))
        .some((k) => offeneNotizen(b, [...ids, k.id]) >= FALTUNG_HALTE_NOTIZEN);
      expect(zeilen <= rahmen || !nochEine, `Rahmen ${rahmen}: ${ids.length} Faltungen, ${zeilen} Zeilen, ${imBild} Notizen, nochEine=${nochEine}`).toBe(true);
    }
  });

  it("faltet die Wurzel nie", () => {
    const b = baum(Array.from({ length: 30 }, () => 30));
    expect(vorschlagFaltung(b, 2)).not.toContain("__wurzel");
  });

  it("gibt die größtmögliche Faltung, ohne die letzte Notiz zu nehmen", () => {
    const b = baum(Array.from({ length: 6 }, () => 10), 4);
    const ids = vorschlagFaltung(b, 1);
    // Vorher blieb die Wurzel mit ihren vier Typen — 5 Zeilen, null Notizen.
    // Was der Baum einem leeren Bild vorzieht: eine Gruppe steht offen, und die
    // Bilanz sagt, was hinter den 23 Malzeichen liegt.
    expect(ids.some((id) => id.startsWith("__typ:")), `Typ gefaltet: ${ids.join(", ")}`).toBe(false);
    const offen = b.children.flatMap((t) => t.children).filter((g) => !ids.includes(g.id));
    expect(offen.length, "wie viele Gruppen offen stehen").toBe(1);
    const imBild = offeneNotizen(b, ids);
    expect(imBild, "Notizen im Bild").toBe(10);
  });

  it("faltet nichts, was schon gefaltet ist", () => {
    const b = baum([8, 8, 8]);
    const ids = vorschlagFaltung(b, 6);
    for (const id of ids) {
      expect(ids.filter((anderer) => anderer.startsWith(`${id}-`)), `${id} liegt unter einer eigenen Faltung`).toHaveLength(0);
    }
  });

  it("nennt denselben Vorschlag, wenn der Bestand derselbe ist", () => {
    const b = baum([12, 7, 30, 4], 2);
    expect(vorschlagFaltung(b, 15)).toEqual(vorschlagFaltung(b, 15));
  });
});

// A7-01: der Baum zeigt ab 60 Notizen keine einzige Notiz. Gemessen im echten// Browser (audit-2026-10-09, A7 Tabelle D und `knopf-*.json`): die Bilanzzeile
// sagt selbst „Showing 0 of 60 notes · Gathered to fit: 60 notes under 15
// groups", und der einzige Rueckweg sitzt unter `pointer-events: none`.
// Die Ursache ist die Gier der Faltung: reicht die tiefste Ebene nicht, nimmt
// sie die Typ-Ebene — und fuehrt damit den ganzen Baum in eine Klammer.
describe("vorschlagFaltung: die Faltung laesst den Baum nicht leer zurück", () => {
  const zweig = (id: string, blaetter: number): HierarchieKnoten => ({
    id, kind: "entity", label: id,
    children: Array.from({ length: blaetter }, (_, i) => ({
      id: `${id}-n${i}`, kind: "memory" as const, label: `${id} Notiz ${i}`, children: [],
    })),
  });
  const baum = (gruppen: number[], typen = 1): HierarchieKnoten => ({
    id: "__wurzel", kind: "root", label: "Wurzel",
    children: Array.from({ length: typen }, (_, t) => ({
      id: `__typ:${t}`, kind: "type" as const, label: `Typ ${t}`,
      children: gruppen.map((g, i) => zweig(`g${t}-${i}`, g)),
    })),
  });
  /** Notizen, die nach der Faltung noch als Zeile im Bild stehen. */
  const notizenImBild = (b: HierarchieKnoten, ids: string[]) => offeneNotizen(b, ids);
  const notizenOhneFaltung = (b: HierarchieKnoten) => offeneNotizen(b, []);

  it("faltet die Typ-Ebene nie zu — sie ist die Landkarte, nicht die Masse", () => {
    // Ein Rahmen, den keine Gruppenfaltung erreichen kann: 40 Notizen an einem
    // Typ, 40 Zeilen Platz. Die Gier nimmt den Typ — der Baum steht als eine
    // einzige Klammer da, mit null Notizen.
    const loser = { id: "__wurzel", kind: "root" as const, label: "Wurzel", children: [
      { id: "__typ:semantic", kind: "type" as const, label: "Facts", children:
        Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, kind: "memory" as const, label: `Notiz ${i}`, children: [] })) },
    ] };
    const ids = vorschlagFaltung(loser, 40);
    expect(ids, `Typ gefaltet: ${ids.join(", ")}`).not.toContain("__typ:semantic");
    expect(notizenImBild(loser, ids), "der Baum steht ohne einzige Notiz da").toBeGreaterThan(0);
  });

  it("lässt immer mindestens eine Notiz im Bild, egal wie knapp der Rahmen ist", () => {
    for (const [typen, gruppen] of [[4, [4, 4, 4, 4, 4, 4, 4, 4, 4, 4]], [4, [20, 20, 20, 20, 20, 20, 20, 20, 20, 20]]] as const) {
      const b = baum([...gruppen], typen);
      const gesamt = notizenOhneFaltung(b);
      for (const rahmen of [12, 8, 4, 2, 1]) {
        const ids = vorschlagFaltung(b, rahmen);
        const imBild = notizenImBild(b, ids);
        expect(imBild, `${gesamt} Notizen, Rahmen ${rahmen}: ${ids.length} Faltungen, ${imBild} Notizen im Bild`)
          .toBeGreaterThanOrEqual(FALTUNG_HALTE_NOTIZEN);
      }
    }
  });

  it("faltet keine Gruppe, die nur eine oder zwei Notizen verbirgt", () => {
    // Ein ×N-Badge ueber einer Gruppe, die eine Notiz enthaelt, ist ein
    // Rueckweg, der zu einem Drittel costs: die Zeile spaeter, der Inhalt
    // derselbe. Faltung lohnt erst ab drei Notizen.
    const b = baum([1, 1, 1, 1, 1, 1, 1, 2, 2, 30], 1);
    const ids = vorschlagFaltung(b, 20);
    for (const id of ids) {
      const gruppe = b.children[0].children.find((k) => k.id === id)!;
      expect(gruppe.children.length, `${id} verbirgt nur ${gruppe.children.length} Notiz(en)`).toBeGreaterThanOrEqual(FALTUNG_MIN_NOTIZEN);
    }
  });

  it("sagt die Wahrheit ueber die Bilanz: gefaltete Notizen zaehlen", () => {
    // Die Zeile „Gathered to fit: N notes under M groups" traegt die Zahl der
    // versteckten Notizen. Was sie verspricht, muss der Vorschlag halten: nie
    // mehr verstecken, als ihm von der Flaeche abverlangt wird.
    const b = baum([10, 10, 10, 10], 1);
    const ids = vorschlagFaltung(b, 25);
    const versteckt = b.children[0].children
      .filter((k) => ids.includes(k.id))
      .reduce((n, k) => n + k.children.length, 0);
    expect(notizenImBild(b, ids) + versteckt).toBe(notizenOhneFaltung(b));
    expect(notizenImBild(b, ids)).toBeGreaterThanOrEqual(1);
  });
});

// F8-N1 (Sichtpruefung der QA-Leitung am Bild `400-baum-nach-1440.png`):
// der Baum nach der Faltungsreparatur ist eine HAARLINIE. Die Kamera nimmt
// heute alle Zeilen hinein, also steht bei 400 Notizen eine Zeile 3 px ueber
// der naechsten — Etiketten und ×N-Badges liegen unlesbar uebereinander.
// Der Boden ist eine Rechnung, keine Geschmacksfrage: zwei Zeilen des Baums
// duerfen auf dem Schirm nicht enger als ZEILEN_LESEBAR px stehen.
describe("zeilenKMin: der Lesbarkeitsboden des Baums", () => {
  it("ist der Zoom, bei dem der Blattabstand lesbar wird", () => {
    expect(zeilenKMin(14, 38)).toBeCloseTo(14 / 38, 6);
  });

  it("waechst, wenn der Abstand enger wird, und nie ueber 1 hinaus ohne Grund", () => {
    expect(zeilenKMin(14, 19)).toBeGreaterThan(zeilenKMin(14, 38));
    expect(zeilenKMin(0, 38)).toBe(0);
  });

  it("schuetzt vor einem 0er-Abstand statt zu explodieren", () => {
    expect(zeilenKMin(14, 0)).toBeGreaterThan(1);
    expect(Number.isFinite(zeilenKMin(14, -5))).toBe(true);
  });
});
