import { describe, it, expect } from "vitest";
import {
  buildEdges,
  kantenBaue,
  tagOverlap,
  titleSimilarity,
  initialPositions,
  buildQuadtree,
  repulsionOn,
  createSimulation,
  gravityFor,
  reuseSimulation,
  reheat,
  setzeKrafte,
  setzeKnotenGroesse,
  isSettled,
  stepSimulation,
  layoutBounds,
  randFuerAnsicht,
  fitTransform,
  toWorld,
  toScreen,
  zoomAt,
  nodeAt,
  nurEchteKanten,
  kantZaehlung,
  entitaetsNetz,
  notizEtikett,
  verborgeneNotizen,
  selbstSchleife,
  richtungsBand,
  kantenEtikett,
  dickeBand,
  DICKE_BAENDER,
  kanteBei,
  beulenLenke,
  BEULE_MAX,
  kantenMitte,
  EDGE_LOD_THRESHOLD,
  EDGE_LOD_ZOOM,
  resolveCollisions,
  setDragging,
  linkStaerken,
  vorspannen,
  type SimKrafte,
  COLLIDE_PADDING,
  IDEAL_LINK,
  ALPHA_MIN,
  REPULSION,
  type LayoutNode,
  type Simulation,
  type LayoutEdge,
} from "../../src/lib/graphLayout";
import { fensterOffen } from "../../src/lib/graphTime";
import type { Memory } from "../../src/types";

// Der Befund aus der Aufnahme vom 5.9.2026: bei 348 Knoten pressten sich die
// Knoten als regelmaessiges Gitter an den Rand des Sichtfensters. Ursache war
// eine Klemmung am Ende jedes Ticks:
//     n.x = Math.max(r + 10, Math.min(breite - r - 10, n.x));
// Damit war die Welt nie groesser als das Fenster — die "virtuelle Wand".
// Diese Tests halten fest, dass sie weg ist und nicht zurueckkommt.

let zaehler = 0;
function note(over: Partial<Memory> = {}): Memory {
  zaehler++;
  return {
    id: `m${zaehler}`,
    userId: "local",
    title: `Titel ${zaehler}`,
    content: "x",
    tags: [],
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

function knoten(id: string, x: number, y: number, r = 10): LayoutNode {
  return { id, x, y, vx: 0, vy: 0, r, pinned: false };
}

describe("Aehnlichkeitsmasse", () => {
  it("tagOverlap: voll, teilweise, leer", () => {
    expect(tagOverlap(["a", "b"], ["a", "b"])).toBe(1);
    expect(tagOverlap(["a", "b"], ["A"])).toBe(1);
    expect(tagOverlap(["a", "b"], ["c"])).toBe(0);
    expect(tagOverlap([], ["a"])).toBe(0);
    expect(tagOverlap(["a"], [])).toBe(0);
  });

  it("titleSimilarity ignoriert Woerter bis zwei Zeichen", () => {
    expect(titleSimilarity("Docker Setup", "docker setup")).toBe(1);
    expect(titleSimilarity("ab cd", "ef gh")).toBe(0);
    expect(titleSimilarity("Docker Setup", "Docker Notizen")).toBeCloseTo(0.5, 6);
  });
});

describe("buildEdges: ueber einen Index statt ueber alle Paare", () => {
  it("verbindet Notizen mit gemeinsamen Tags", () => {
    // Titel bewusst ohne gemeinsames Wort — sonst misst der Test die Titelspur.
    const a = note({ title: "Alpha", tags: ["docker", "server"] });
    const b = note({ title: "Beta", tags: ["docker", "server"] });
    const c = note({ title: "Gamma", tags: ["kochen"] });
    const e = buildEdges([a, b, c]);
    expect(e).toHaveLength(1);
    expect([e[0].source, e[0].target].sort()).toEqual([a.id, b.id].sort());
    expect(e[0].real).toBe(false);
  });

  it("verbindet Notizen mit gemeinsamen Titelwoertern", () => {
    const e = buildEdges([note({ title: "Docker Setup" }), note({ title: "Docker Setup" })]);
    expect(e).toHaveLength(1);
  });

  it("uebernimmt echte Relationen und markiert sie", () => {
    const a = note({ title: "Alpha" }); const b = note({ title: "Beta" });
    const e = buildEdges([a, b], { realPairs: [[a.id, b.id]] });
    expect(e).toHaveLength(1);
    expect(e[0].real).toBe(true);
  });

  it("ignoriert echte Relationen auf unbekannte oder gleiche Knoten", () => {
    const a = note({ title: "Alpha" });
    expect(buildEdges([a], { realPairs: [[a.id, "fremd"], [a.id, a.id]] })).toEqual([]);
  });

  it("legt dieselbe echte Relation nicht doppelt an", () => {
    const a = note({ title: "Alpha" }); const b = note({ title: "Beta" });
    expect(buildEdges([a, b], { realPairs: [[a.id, b.id], [b.id, a.id]] })).toHaveLength(1);
  });

  it("eine echte Kante trägt das Gültigkeitsfenster ihrer Aussage", () => {
    const a = note({ title: "Alpha" }); const b = note({ title: "Beta" });
    const e = buildEdges([a, b], { realPairs: [[a.id, b.id, { validFrom: 1_000, validTo: 2_000 }]] });
    expect(e).toHaveLength(1);
    expect(e[0].validFrom).toBe(1_000);
    expect(e[0].validTo).toBe(2_000);
  });

  it("zwei Aussagen über dasselbe Paar teilen sich einen Strich — er gilt, wenn eine von ihnen gilt", () => {
    // buildEdges kennt pro Paar genau eine Kante; die zweite Behauptung ist
    // ein Beleg mehr, nicht ein zweiter Strich (bis P-8 Mehrfachkanten
    // sichtbar macht). Ihr Fenster darf nicht das der ersten überdecken, sonst
    // gestrichelt die Fläche eine Aussage, die es noch gibt.
    const a = note({ title: "Alpha" }); const b = note({ title: "Beta" });
    const e = buildEdges([a, b], {
      realPairs: [
        [a.id, b.id, { validFrom: 1_000, validTo: 2_000 }],
        [b.id, a.id, { validFrom: 5_000, validTo: 9_000 }],
      ],
    });
    expect(e).toHaveLength(1);
    expect(e[0].validFrom).toBe(1_000);
    expect(e[0].validTo).toBe(9_000);
  });

  it("unbefristet neben befristet macht den Strich unbefristet", () => {
    const a = note({ title: "Alpha" }); const b = note({ title: "Beta" });
    const e = buildEdges([a, b], {
      realPairs: [[a.id, b.id], [a.id, b.id, { validFrom: 1, validTo: 2 }]],
    });
    expect(e).toHaveLength(1);
    expect(e[0].validFrom ?? null).toBeNull();
    expect(e[0].validTo ?? null).toBeNull();
  });

  it("eine Aehnlichkeitskante hat kein Fenster und wird nie gefiltert", () => {
    // Nur die Behauptung aus der Graph-DB hat eine Gültigkeit. Die Vermutung
    // aus gemeinsamen Worten darf der Zeitregler nicht an einem Datum messen,
    // das sie nie gehabt hat.
    const a = note({ title: "Docker Setup", tags: ["infra"] });
    const b = note({ title: "Docker Setup", tags: ["infra"] });
    const e = buildEdges([a, b]);
    expect(e).toHaveLength(1);
    expect(e[0].real).toBe(false);
    expect(fensterOffen(e[0], 123_456)).toBe(true);
  });

  it("gibt die Richtung der echten Kante weiter — Quelle bleibt Quelle", () => {
    // buildEdges kanonisiert nur den Dedup-Schlüssel, nie die Kante selbst.
    // Wäre das anders, wüsste die Fläche nie, wer über wen etwas behauptet.
    const a = note({ title: "Alpha" }); const b = note({ title: "Beta" });
    const e = buildEdges([a, b], { realPairs: [[a.id, b.id]] });
    expect(e[0].source).toBe(a.id);
    expect(e[0].target).toBe(b.id);

    // Und beim zweiten Beleg über demselben Paar gewinnt die zuerst gelesene
    // Richtung — nicht die letzte, die sonst bei jedem Laden kippte.
    const zwei = buildEdges([a, b], { realPairs: [[a.id, b.id], [b.id, a.id]] });
    expect(zwei).toHaveLength(1);
    expect(zwei[0].source).toBe(a.id);
    expect(zwei[0].target).toBe(b.id);
  });

  it("haelt sich an die Obergrenze und behaelt die staerksten Kanten", () => {
    const ms = Array.from({ length: 12 }, () => note({ tags: ["gemeinsam"] }));
    const e = buildEdges(ms, { maxEdges: 5 });
    expect(e).toHaveLength(5);
    for (let i = 1; i < e.length; i++) expect(e[i - 1].strength).toBeGreaterThanOrEqual(e[i].strength);
  });

  it("ueberspringt Allerweltsbegriffe statt an ihnen zu ersticken", () => {
    // 400 Notizen mit demselben Tag waeren 79.800 Paare. Der Bucket liegt ueber
    // der Grenze und wird ausgelassen — genau dafuer ist sie da.
    const ms = Array.from({ length: 400 }, () => note({ tags: ["alles"] }));
    const start = Date.now();
    const e = buildEdges(ms, { maxBucket: 140 });
    expect(Date.now() - start).toBeLessThan(1000);
    expect(e).toEqual([]);
  });

  it("bewaeltigt 3000 Notizen in vertretbarer Zeit", () => {
    const ms = Array.from({ length: 3000 }, (_, i) =>
      note({ title: `Thema ${i % 300} Notiz`, tags: [`gruppe${i % 300}`] })
    );
    const start = Date.now();
    const e = buildEdges(ms);
    // Alle Paare waeren 4,5 Millionen Vergleiche gewesen.
    expect(Date.now() - start).toBeLessThan(4000);
    expect(e.length).toBeGreaterThan(0);
  });
});


// P-2: eine Kante ist nicht nur ein Strich. Sie sagt, WAS behauptet wird
// (Etikett), WIE VIEL dahintersteht (Dicke aus Evidenz), und sie ist anfassbar
// (Treffer auf der Linie, nicht nur am Knoten). Alles drei war bisher nicht
// sichtbar: der Relationsname wurde in der Fläche auf [quelle, ziel] reduziert,
// die Dicke war eine Konstante, und kanteBei existierte nicht.
// P-4: Dichte, die sich zu erkennen gibt. Wenn die Kantengrenze Nachbarn
// fallen lässt, muss das Bild das sagen können — sonst steht ein Knoten mit drei
// Strichen im Bild, während die Wissensbasis sieben kennt.
describe("kantenBaue — was der Kantengrenze zum Opfer fällt", () => {
  it("zählt je Knoten die Nachbarn, die es nicht ins Bild geschafft haben", () => {
    // Acht Notizen, alle mit denselben Tags: jedes Paar ist eine Kante, also
    // kennt jeder Knoten sieben Nachbarn. Bei vier erlaubten Kanten (je zwei
    // Endpunkte) müssen Nachbarn übrig bleiben — und zwar exakt so viele.
    const ms = Array.from({ length: 8 }, (_, i) => note({ id: `d${i}`, title: `Notiz ${i}`, tags: ["alles"] }));
    const { edges, versteckteNachbarn } = kantenBaue(ms, { maxEdges: 4 });
    expect(edges).toHaveLength(4);
    const gehalten = new Map<string, number>();
    for (const e of edges) {
      gehalten.set(e.source, (gehalten.get(e.source) ?? 0) + 1);
      gehalten.set(e.target, (gehalten.get(e.target) ?? 0) + 1);
    }
    for (const m of ms) {
      expect(versteckteNachbarn.get(m.id) ?? 0).toBe(7 - (gehalten.get(m.id) ?? 0));
    }
  });

  it("meldet nichts versteckt, wenn nichts gekappt wurde", () => {
    const ms = [note({ title: "Alpha", tags: ["a"] }), note({ title: "Beta", tags: ["a"] })];
    const r = kantenBaue(ms);
    expect(r.edges).toHaveLength(1);
    expect([...r.versteckteNachbarn.values()]).toEqual([]);
    expect(r.verstecktInSumme).toBe(0);
  });

  it("zählt die Nachbarn, nicht die Kanten: ein verstecktes Paar berührt zwei Knoten", () => {
    const ms = Array.from({ length: 8 }, (_, i) => note({ id: `e${i}`, title: `Notiz ${i}`, tags: ["alles"] }));
    const r = kantenBaue(ms, { maxEdges: 4 });
    const summe = [...r.versteckteNachbarn.values()].reduce((a, b) => a + b, 0);
    expect(r.verstecktInSumme).toBe(summe);
    expect(r.verstecktInSumme).toBeGreaterThan(0);
  });

  it("Aehnlichkeit aus lässt keine versteckten Nachbarn zurück", () => {
    // Ohne Suchlauf fällt nichts einer Grenze zum Opfer — die Fläche darf dann
    // auch kein „hidden behind badges" behaupten.
    const ms = Array.from({ length: 8 }, (_, i) => note({ id: `f${i}`, title: `Notiz ${i}`, tags: ["alles"] }));
    const r = kantenBaue(ms, { ahnlichkeit: false });
    expect(r.edges).toHaveLength(0);
    expect(r.verstecktInSumme).toBe(0);
  });

  it("echte Kanten überleben die Grenze und gelten nie als versteckt", () => {
    const a = note({ id: "g1", title: "Alpha", tags: ["x"] });
    const b = note({ id: "g2", title: "Beta", tags: ["x"] });
    const c = note({ id: "g3", title: "Gamma", tags: ["x"] });
    const r = kantenBaue([a, b, c], { realPairs: [[a.id, b.id]], maxEdges: 1 });
    expect(r.edges.some((e) => e.real)).toBe(true);
    expect(r.versteckteNachbarn.get(a.id) ?? 0).toBe(1);
  });

  it("buildEdges bleibt, was es war: die Kantenliste, ohne Rapport", () => {
    // Der Rückfall ist absichtlich dünn — alle bestehenden Rufe sollen weiterhin
    // genau die Liste sehen, die sie immer gesehen haben.
    const ms = [note({ title: "Alpha", tags: ["a"] }), note({ title: "Beta", tags: ["a"] })];
    const e = buildEdges(ms);
    expect(Array.isArray(e)).toBe(true);
    expect(e).toHaveLength(1);
  });
});

// P-5: Was an einem Knoten steht, ist eine Entscheidung — nicht der Titel.
describe("notizEtikett — die Kette vom Titel zum Platzhalter", () => {
  it("nimmt den Titel, wenn einer da ist", () => {
    const e = notizEtikett(note({ title: "Mandatsuebergabe" }));
    expect(e).toEqual({ text: "Mandatsuebergabe", platzhalter: false });
  });

  it("kürzt den Titel auf das Maß plus Auslassung", () => {
    const e = notizEtikett(note({ title: "Ein wirklich sehr langer Titel, der nicht komplett passt" }), 26);
    expect(e.platzhalter).toBe(false);
    expect(e.text.startsWith("Ein wirklich sehr langer")).toBe(true);
    expect(e.text.endsWith("…"), e.text).toBe(true);
    expect(e.text.length, "26 Zeichen plus Auslassungspunkt").toBe(27);
  });

  it("gibt den vollen Titel her, wenn kein Maß gesetzt ist", () => {
    const langer = "Ein wirklich sehr langer Titel, der nicht komplett passt";
    const e = notizEtikett(note({ title: langer }), Infinity);
    expect(e.text).toBe(langer);
  });

  it("fällt auf den Inhalt zurück und nennt sich Platzhalter", () => {
    const e = notizEtikett(note({ title: "   ", content: "Rechnung 2024/07 vom Kanal" }));
    expect(e.text).toBe("Rechnung 2024/07 vom Kanal");
    expect(e.platzhalter).toBe(true);
  });

  it("erfindet nichts, wenn Titel und Inhalt leer sind", () => {
    const e = notizEtikett(note({ title: "", content: "   \n  " }));
    expect(e.text).toBe("Untitled note");
    expect(e.platzhalter).toBe(true);
  });

  it("hält das Wort des Systems für keinen Titel", () => {
    // Der Store füllt eine Notiz ohne Titel selbst mit „Untitled" (src/lib/
    // store.ts:133). Zwei Knoten, die beide dieses eine Wort tragen, sagen
    // nichts; der erste Satz sagt etwas.
    const e = notizEtikett(note({ title: "Untitled", content: "Rechnung 2024/07 vom Kanal" }));
    expect(e.text).toBe("Rechnung 2024/07 vom Kanal");
    expect(e.platzhalter).toBe(true);
  });

  it("schlägt Zeilenumbrüche im Inhalt zu einem Satz zusammen", () => {
    const e = notizEtikett(note({ title: "", content: "Erste Zeile\nZweite Zeile" }));
    expect(e.text).toBe("Erste Zeile Zweite Zeile");
  });
});

describe("Kantengewicht: was hinter einer Kante steht", () => {
  it("trägt eine echte Kante den Typ ihrer Aussage", () => {
    const a = note({ title: "Alpha" }); const b = note({ title: "Beta" });
    const e = buildEdges([a, b], { realPairs: [[a.id, b.id, { relation: "betreut" }]] });
    expect(e).toHaveLength(1);
    expect(e[0].relation).toBe("betreut");
    expect(e[0].belege).toBe(1);
    expect(e[0].typen).toBe(1);
  });

  it("zwei Aussagen über demselben Paar sind zwei Belege", () => {
    const a = note({ title: "Alpha" }); const b = note({ title: "Beta" });
    const e = buildEdges([a, b], {
      realPairs: [
        [a.id, b.id, { relation: "betreut" }],
        [b.id, a.id, { relation: "betreut" }],
      ],
    });
    expect(e).toHaveLength(1);
    expect(e[0].belege).toBe(2);
    // Derselbe Typ zweimal ist kein zweiter Typ.
    expect(e[0].typen).toBe(1);
  });

  it("verschiedene Typen über einem Paar: der erste gibt das Etikett, die Zahl den Rest", () => {
    const a = note({ title: "Alpha" }); const b = note({ title: "Beta" });
    const e = buildEdges([a, b], {
      realPairs: [
        [a.id, b.id, { relation: "betreut" }],
        [a.id, b.id, { relation: "meldet an" }],
        [a.id, b.id, { relation: "betreut" }],
      ],
    });
    expect(e).toHaveLength(1);
    expect(e[0].relation).toBe("betreut");
    expect(e[0].typen).toBe(2);
    expect(e[0].belege).toBe(3);
  });

  it("eine Kante ohne Typ bleibt typlos — erfunden wird hier nichts", () => {
    const a = note({ title: "Alpha" }); const b = note({ title: "Beta" });
    const e = buildEdges([a, b], { realPairs: [[a.id, b.id, { relation: null }]] });
    expect(e[0].relation ?? null).toBeNull();
    expect(e[0].typen ?? 0).toBe(0);
    expect(e[0].belege).toBe(1);
  });

  it("eine Aehnlichkeitskante hat weder Typ noch Beleg", () => {
    const a = note({ title: "Docker Setup", tags: ["infra"] });
    const b = note({ title: "Docker Setup", tags: ["infra"] });
    const e = buildEdges([a, b]);
    expect(e).toHaveLength(1);
    expect(e[0].real).toBe(false);
    expect(e[0].relation ?? null).toBeNull();
    expect(e[0].belege ?? 0).toBe(0);
  });
});

describe("kantenEtikett — der Text an der Linie", () => {
  const behauptung = (over: Partial<LayoutEdge> = {}): LayoutEdge => ({
    source: "a", target: "b", strength: 0.85, real: true, ...over,
  });

  it("nennt den Typ einer Behauptung", () => {
    expect(kantenEtikett(behauptung({ relation: "betreut", typen: 1 }))).toBe("betreut");
  });

  it("zählt weitere Typen dazu, statt sie zu verschweigen", () => {
    expect(kantenEtikett(behauptung({ relation: "betreut", typen: 3 }))).toBe("betreut +2");
  });

  it("gibt nichts her für eine Kante ohne Typ", () => {
    expect(kantenEtikett(behauptung({ relation: null }))).toBeNull();
    expect(kantenEtikett(behauptung({ relation: "   " }))).toBeNull();
    expect(kantenEtikett({ source: "a", target: "b", strength: 0.4, real: false })).toBeNull();
  });

  it("schreibt die Wörter des Systems nicht an die Linie", () => {
    // „mentions" setzt der Store selbst für jeden Wiki-Link (store.ts
    // verknuepfeNotiz), „related" ist sein Füllwort für eine leere Aussage
    // (addRelation). Beides ist keine Behauptung eines Menschen — und jedes
    // davon belegt eine Stelle im Etikett-Budget, die einer echten Aussage
    // fehlt. Die Linie selbst sagt schon, was sie ist.
    expect(kantenEtikett(behauptung({ relation: "mentions" }))).toBeNull();
    expect(kantenEtikett(behauptung({ relation: "RELATED" }))).toBeNull();
    expect(kantenEtikett(behauptung({ relation: "betreut" }))).toBe("betreut");
    // Ein Mensch, der „mentions" als Typ tippt, verliert damit den Zusatz nicht.
    expect(kantenEtikett(behauptung({ relation: "mentions", typen: 2 }))).toBeNull();
  });

  it("kürzt einen langen Typ, statt das Bild zuzuschreiben", () => {
    const etikett = kantenEtikett(behauptung({ relation: "ist verantwortlich fuer die mandatsuebergabe", typen: 1 }));
    expect(etikett).not.toBeNull();
    expect(etikett!.length).toBeLessThanOrEqual(19);
    expect(etikett!.endsWith("…")).toBe(true);
  });
});

describe("dickeBand — die Evidenz wird Breite", () => {
  const echt = (belege?: number): LayoutEdge => ({
    source: "a", target: "b", strength: 0.85, real: true, belege,
  });
  const verme = (staerke: number): LayoutEdge => ({
    source: "a", target: "b", strength: staerke, real: false,
  });

  it("waechst mit den Belegen und bleibt oben gedeckelt", () => {
    expect(dickeBand(echt(1))).toBe(0);
    expect(dickeBand(echt(2))).toBe(1);
    expect(dickeBand(echt(3))).toBe(2);
    expect(dickeBand(echt(40))).toBe(2);
  });

  it("eine Kante ohne Belegzähler ist die duennste", () => {
    expect(dickeBand(echt())).toBe(0);
    expect(dickeBand(echt(0))).toBe(0);
  });

  it("teilt die Aehnlichkeit in drei Stufen nach ihrer Masse", () => {
    expect(dickeBand(verme(0.3))).toBe(0);
    expect(dickeBand(verme(0.6))).toBe(1);
    expect(dickeBand(verme(0.9))).toBe(2);
  });

  it("nie ausserhalb der Bänder, egal was reinkommt", () => {
    for (const e of [echt(1), echt(9), verme(0), verme(1e9)]) {
      expect(dickeBand(e)).toBeGreaterThanOrEqual(0);
      expect(dickeBand(e)).toBeLessThan(DICKE_BAENDER);
    }
  });
});

describe("kanteBei — die Linie ist anfassbar", () => {
  const knoten = (id: string, x: number, y: number): LayoutNode => ({
    id, x, y, vx: 0, vy: 0, r: 10, pinned: false,
  });
  const kante = (source: string, target: string, real = true): LayoutEdge => ({
    source, target, strength: 0.85, real,
  });

  it("trifft eine gerade Linie in ihrer Mitte", () => {
    const index = new Map([["a", knoten("a", 0, 0)], ["b", knoten("b", 100, 0)]]);
    const e = kante("a", "b");
    expect(kanteBei(index, [e], 50, 0, 5, () => "gerade")).toBe(e);
  });

  it("folgt der gekrümmten Behauptung, nicht der Sehne", () => {
    // Die Fläche malt die Behauptung als Bogen. Ein Treffertest auf der Sehne
    // würde ins Leere greifen, genau dort, wo jemand auf die Kante zeigt.
    const index = new Map([["a", knoten("a", 0, 0)], ["b", knoten("b", 100, 0)]]);
    const e = kante("a", "b");
    const beule = beulenLenke(100);
    const hoehe = 0.25 * 2 * beule; // B(0.5) der Senkrechten nach
    expect(kanteBei(index, [e], 50, hoehe, 3)).toBe(e);
    expect(kanteBei(index, [e], 50, 0, 3), "die Sehne ist nicht die Kante").toBeNull();
  });

  it("verfehlt, wenn der Punkt ausserhalb der Trefferweite liegt", () => {
    const index = new Map([["a", knoten("a", 0, 0)], ["b", knoten("b", 100, 0)]]);
    expect(kanteBei(index, [kante("a", "b")], 50, 40, 5, () => "gerade")).toBeNull();
  });

  it("gibt die nähere von zwei Kanten", () => {
    const index = new Map([
      ["a", knoten("a", 0, 0)], ["b", knoten("b", 100, 0)], ["c", knoten("c", 0, 60)],
    ]);
    const waagerecht = kante("a", "b");
    const senkrecht = kante("a", "c");
    // (50|4) ist 4 Einheiten von der waagerechten, 50 von der senkrechten Kante.
    expect(kanteBei(index, [senkrecht, waagerecht], 50, 4, 6, () => "gerade")).toBe(waagerecht);
  });

  it("greift nur, wenn beide Enden im Bild stehen", () => {
    const index = new Map([["a", knoten("a", 0, 0)]]);
    expect(kanteBei(index, [kante("a", "fehlt")], 50, 0, 5, () => "gerade")).toBeNull();
  });

  it("endet an der Knotenscheibe, nicht dahinter", () => {
    // Zwischen zwei Scheiben mit Radius 10 ist die Linie nur noch von 10 bis 90
    // gemalt. Wer in der Scheibe zeigt, trifft den Knoten — die Kante darf dort
    // nicht gewinnen, sonst Tooltip und Knoten streiten um denselben Zeiger.
    const index = new Map([["a", knoten("a", 0, 0)], ["b", knoten("b", 100, 0)]]);
    expect(kanteBei(index, [kante("a", "b")], 2, 0, 5, () => "gerade")).toBeNull();
  });

  it("sucht 12 000 Kanten schneller, als ein Bild dauert", () => {
    const index = new Map<string, LayoutNode>();
    const kanten: LayoutEdge[] = [];
    for (let i = 0; i < 6000; i++) {
      index.set(`x${i}`, knoten(`x${i}`, i * 3, (i % 7) * 11));
      index.set(`y${i}`, knoten(`y${i}`, i * 3 + 40, ((i + 3) % 7) * 11));
      kanten.push(kante(`x${i}`, `y${i}`, false));
    }
    // Eine Sonde weitab vom Gitter: sie kann nur diese eine Kante treffen, und
    // gefunden wird sie erst nach dem vollen Durchlauf — genau wie ein
    // Zeigerstrich über ein Feld, das bis an die Obergrenze gefüllt ist.
    index.set("sonde-a", knoten("sonde-a", 0, 5000));
    index.set("sonde-b", knoten("sonde-b", 20000, 5000));
    const sonde = kante("sonde-a", "sonde-b", false);
    kanten.push(sonde);
    expect(kanteBei(index, kanten, 10000, 5000, 6, () => "gerade")).toBe(sonde);
    const start = Date.now();
    for (let t = 0; t < 20; t++) kanteBei(index, kanten, 10000, 5000, 6, () => "gerade");
    const dauer = (Date.now() - start) / 20;
    expect(dauer, `${dauer.toFixed(2)} ms pro Zeigerbewegung`).toBeLessThan(4);
  });
});

describe("Kantengeometrie: malen und greifen rechnen dieselbe Kurve", () => {
  it("die Beule wächst mit der Länge und ist gedeckelt", () => {
    expect(beulenLenke(50)).toBeCloseTo(6, 5);
    expect(beulenLenke(400)).toBe(BEULE_MAX);
    expect(beulenLenke(0)).toBe(0);
  });

  it("die Mitte liegt auf dem Bogen, den die Fläche malt", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 0 };
    const gerade = kantenMitte(a, b, 0);
    expect(gerade.x).toBeCloseTo(50, 5);
    expect(gerade.y).toBeCloseTo(0, 5);
    const gebogen = kantenMitte(a, b, 10);
    expect(Math.abs(gebogen.y)).toBeCloseTo(5, 5);
    // Der Kontrollpunkt derselben Kurve liegt doppelt so weit draussen.
    expect(Math.abs(gebogen.y) * 2).toBeCloseTo(10, 5);
  });
});

// Die Richtung einer Behauptung ist eine Aussage: „Elena — betreut — Nordwind"
// ist nicht „Nordwind — betreut — Elena". Bis hierhin ging die Richtung im
// Payload mit, gemalt wurde aber eine symmetrische Linie. Gemaelt wird ein
// Keil (breit am Ausgang, schmal am Ziel), keine Pfeilspitze — die versteckt
// sich hinter den Knoten und liest sich bei gedimmten Kanten als Fleck.
describe("richtungsBand — die Richtung als Keil", () => {
  const QUELLE = { x: 0, y: 0 };
  const ZIEL = { x: 100, y: 0 };
  const form = { rQuelle: 6, rZiel: 6, breit: 4, duenn: 1, beule: 0, schritte: 8 };
  const seiten = (band: { x: number; y: number }[]) => band.length / 2;
  // Der Ring läuft: linke Seite von der Quelle zum Ziel, rechte Seite zurück.
  // Der Partner von Punkt i ist also Punkt 2n-1-i.
  const partner = (band: { x: number; y: number }[], i: number) => band[2 * seiten(band) - 1 - i];
  const mittellinie = (band: { x: number; y: number }[], i: number) => {
    const a = band[i], b = partner(band, i);
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const breite = (band: { x: number; y: number }[], i: number) => Math.abs(band[i].y - partner(band, i).y);

  it("beginnt an der Kante der Quell-Scheibe und endet an der der Ziel-Scheibe", () => {
    const band = richtungsBand(QUELLE, ZIEL, form);
    expect(band.length % 2).toBe(0);
    expect(mittellinie(band, 0).x).toBeCloseTo(6, 6);
    expect(mittellinie(band, seiten(band) - 1).x).toBeCloseTo(94, 6);
  });

  it("ist am Ausgang breit und am Ziel schmal — die Richtung liegt in der Form", () => {
    const band = richtungsBand(QUELLE, ZIEL, form);
    expect(breite(band, 0)).toBeCloseTo(4, 6);
    expect(breite(band, seiten(band) - 1)).toBeCloseTo(1, 6);
    // Und zwar gleichmäßig: eine Mitte ist genau halb so breit wie der Anfang.
    expect(breite(band, Math.floor(seiten(band) / 2))).toBeCloseTo(2.5, 1);
  });

  it("liegt symmetrisch um die Sehne", () => {
    const band = richtungsBand(QUELLE, ZIEL, form);
    for (let i = 0; i < seiten(band); i++) {
      expect(mittellinie(band, i).y).toBeCloseTo(0, 6);
    }
  });

  it("folgt derselben Biegung wie die Linie", () => {
    // Die Kanten werden seit je ausgebuchtet gezeichnet. Ein Keil, der der
    // Biegung nicht folgt, läge neben seiner eigenen Kante.
    const gerade = richtungsBand(QUELLE, ZIEL, form);
    const gebogen = richtungsBand(QUELLE, ZIEL, { ...form, beule: 12 });
    const mitte = Math.floor(seiten(gebogen) / 2);
    expect(mittellinie(gerade, mitte).y).toBeCloseTo(0, 6);
    expect(Math.abs(mittellinie(gebogen, mitte).y)).toBeGreaterThan(3);
    // Nach welcher Seite die Beule zeigt, entscheidet dasselbe Vorzeichen wie
    // bei der Linie: senkrecht zur Sehne, mit dx nach rechts oben weg.
    expect(mittellinie(gebogen, mitte).y).toBeGreaterThan(0);
  });

  it("zeichnet nichts, wenn die Scheiben einander berühren oder deckungsgleich sind", () => {
    // Ein Keil ohne Strecke wäre ein Punkt auf der Scheibe — eher ein Fehler
    // als eine Richtung.
    expect(richtungsBand({ x: 0, y: 0 }, { x: 10, y: 0 }, { ...form, rQuelle: 6, rZiel: 6 })).toEqual([]);
    expect(richtungsBand(QUELLE, QUELLE, form)).toEqual([]);
  });
});

describe("initialPositions: Dichte statt Fenstergroesse", () => {
  it("streut die Knoten auf einer Spirale um den Ursprung", () => {
    const p = initialPositions(["a", "b", "c", "d"]);
    expect(p).toHaveLength(4);
    expect(p.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
    expect(p[0].pinned).toBe(false);
  });

  it("waechst mit der Wurzel der Knotenzahl — die Dichte bleibt gleich", () => {
    const klein = layoutBounds(initialPositions(Array.from({ length: 100 }, (_, i) => `k${i}`)));
    const gross = layoutBounds(initialPositions(Array.from({ length: 1600 }, (_, i) => `g${i}`)));
    const bk = klein.maxX - klein.minX;
    const bg = gross.maxX - gross.minX;
    // 16-fache Knotenzahl -> etwa 4-facher Durchmesser.
    expect(bg / bk).toBeGreaterThan(3.2);
    expect(bg / bk).toBeLessThan(4.8);
  });

  it("sprengt bei vielen Knoten jedes Fenster — und darf das auch", () => {
    const p = initialPositions(Array.from({ length: 2000 }, (_, i) => `n${i}`));
    const b = layoutBounds(p);
    expect(b.maxX - b.minX).toBeGreaterThan(1000);
  });
});

describe("Barnes-Hut", () => {
  it("liefert keinen Baum ohne Knoten", () => {
    expect(buildQuadtree([])).toBeNull();
  });

  it("uebt keine Kraft aus, wenn es nichts gibt", () => {
    const out = { fx: 0, fy: 0 };
    repulsionOn(null, knoten("a", 0, 0), REPULSION, 0.9, out);
    expect(out).toEqual({ fx: 0, fy: 0 });
  });

  it("stoesst einen Knoten vom anderen weg", () => {
    const a = knoten("a", 0, 0);
    const b = knoten("b", 50, 0);
    const out = { fx: 0, fy: 0 };
    repulsionOn(buildQuadtree([a, b]), a, REPULSION, 0.9, out);
    expect(out.fx).toBeLessThan(0);
  });

  it("uebt auf sich selbst keine Kraft aus", () => {
    const a = knoten("a", 5, 5);
    const out = { fx: 0, fy: 0 };
    repulsionOn(buildQuadtree([a]), a, REPULSION, 0.9, out);
    expect(out).toEqual({ fx: 0, fy: 0 });
  });

  it("naehert die exakte Summe eng genug an", () => {
    // Gegenprobe gegen die Alle-gegen-alle-Rechnung, die vorher lief.
    const nodes: LayoutNode[] = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = 0; i < 400; i++) nodes.push(knoten(`n${i}`, rnd() * 2000 - 1000, rnd() * 2000 - 1000));

    const ziel = nodes[3];
    let bx = 0, by = 0;
    for (const o of nodes) {
      if (o === ziel) continue;
      const dx = ziel.x - o.x, dy = ziel.y - o.y;
      const d2 = Math.max(1, dx * dx + dy * dy);
      const d = Math.sqrt(d2);
      bx += (dx / d) * (REPULSION / d2);
      by += (dy / d) * (REPULSION / d2);
    }
    const out = { fx: 0, fy: 0 };
    repulsionOn(buildQuadtree(nodes), ziel, REPULSION, 0.5, out);

    const exakt = Math.hypot(bx, by);
    const genaehert = Math.hypot(out.fx, out.fy);
    expect(Math.abs(genaehert - exakt) / Math.max(exakt, 1e-9)).toBeLessThan(0.2);
    // Gleiche Richtung
    expect((out.fx * bx + out.fy * by) / (exakt * genaehert)).toBeGreaterThan(0.9);
  });

  it("haengt sich nicht auf, wenn Knoten exakt aufeinander liegen", () => {
    const nodes = Array.from({ length: 40 }, (_, i) => knoten(`n${i}`, 10, 10));
    const baum = buildQuadtree(nodes);
    const out = { fx: 0, fy: 0 };
    repulsionOn(baum, nodes[0], REPULSION, 0.9, out);
    expect(Number.isFinite(out.fx)).toBe(true);
    expect(Number.isFinite(out.fy)).toBe(true);
  });
});

describe("Simulation", () => {
  it("startet heiss und laesst gerichtete Schleifen nicht zu", () => {
    const sim = createSimulation(["a", "b"], [{ source: "a", target: "a", strength: 1, real: false }]);
    expect(sim.alpha).toBe(1);
    expect(sim.edges).toHaveLength(0);
    expect(isSettled(sim)).toBe(false);
  });

  it("kuehlt aus und bleibt dann stehen", () => {
    const sim = createSimulation(["a", "b", "c"], []);
    for (let i = 0; i < 2000; i++) stepSimulation(sim);
    expect(sim.alpha).toBe(ALPHA_MIN);
    expect(isSettled(sim)).toBe(true);
  });

  it("laesst sich wieder anheizen — etwa beim Ziehen", () => {
    const sim = createSimulation(["a", "b"], []);
    for (let i = 0; i < 2000; i++) stepSimulation(sim);
    reheat(sim);
    expect(isSettled(sim)).toBe(false);
    reheat(sim, 0.01);
    expect(sim.alpha).toBeGreaterThan(0.01);
  });

  it("tut bei null Knoten nichts", () => {
    const sim = createSimulation([], []);
    expect(() => stepSimulation(sim)).not.toThrow();
  });

  it("laesst festgehaltene Knoten exakt liegen", () => {
    const sim = createSimulation(["a", "b"], []);
    const a = sim.index.get("a")!;
    a.pinned = true;
    const x = a.x, y = a.y;
    for (let i = 0; i < 50; i++) stepSimulation(sim);
    expect(a.x).toBe(x);
    expect(a.y).toBe(y);
  });

  it("zieht verbundene Knoten auf den Ruheabstand zusammen", () => {
    const sim = createSimulation(["a", "b"], [{ source: "a", target: "b", strength: 1, real: true }]);
    sim.index.get("a")!.x = -900; sim.index.get("a")!.y = 0;
    sim.index.get("b")!.x = 900; sim.index.get("b")!.y = 0;
    for (let i = 0; i < 600; i++) stepSimulation(sim);
    const d = Math.hypot(sim.index.get("a")!.x - sim.index.get("b")!.x, sim.index.get("a")!.y - sim.index.get("b")!.y);
    expect(d).toBeLessThan(600);
  });

  it("ignoriert Kanten auf unbekannte Knoten", () => {
    const sim = createSimulation(["a"], [{ source: "a", target: "weg", strength: 1, real: false }]);
    expect(() => stepSimulation(sim)).not.toThrow();
    expect(Number.isFinite(sim.index.get("a")!.x)).toBe(true);
  });
});

describe("DIE WAND: das Layout darf groesser sein als das Fenster", () => {
  it("schwaecht die Schwerkraft mit wachsender Knotenzahl ab", () => {
    expect(gravityFor(100)).toBeGreaterThan(gravityFor(10_000));
    expect(gravityFor(0)).toBe(gravityFor(1));
    // 100-fache Knotenzahl -> zehnfach schwaechere Feder -> zehnfacher Radius.
    expect(gravityFor(100) / gravityFor(10_000)).toBeCloseTo(10, 6);
  });

  it("klemmt Knoten nicht in das Sichtfenster", () => {
    // 400 Knoten in einem 800x500-Fenster. Frueher lagen danach ALLE Positionen
    // innerhalb dieses Rechtecks — das war der Fehler in der Aufnahme.
    const ids = Array.from({ length: 400 }, (_, i) => `n${i}`);
    const sim = createSimulation(ids, buildEdges(ids.map((id) => ({ ...note(), id }))));
    for (let i = 0; i < 300; i++) stepSimulation(sim);

    const b = layoutBounds(sim.nodes);
    expect(b.maxX - b.minX).toBeGreaterThan(800);
    expect(b.maxY - b.minY).toBeGreaterThan(500);
    expect(sim.nodes.some((n) => n.x < 0 || n.y < 0)).toBe(true);
  });

  it("haelt die Dichte konstant, statt bei mehr Wissen enger zu packen", () => {
    const dichte = (anzahl: number): number => {
      const ids = Array.from({ length: anzahl }, (_, i) => `d${i}`);
      const sim = createSimulation(ids, []);
      for (let i = 0; i < 250; i++) stepSimulation(sim);
      const b = layoutBounds(sim.nodes);
      return anzahl / Math.max(1, (b.maxX - b.minX) * (b.maxY - b.minY));
    };
    const wenig = dichte(120);
    const viel = dichte(900);
    // Achtfache Wissensmenge, aber kein Zusammenquetschen: die Dichte bleibt in
    // derselben Groessenordnung, weil die Flaeche mitwaechst.
    expect(viel / wenig).toBeLessThan(3);
  });

  it("bleibt bei 3000 Knoten endlich und rechenbar", () => {
    const ids = Array.from({ length: 3000 }, (_, i) => `g${i}`);
    const sim = createSimulation(ids, []);
    const start = Date.now();
    for (let i = 0; i < 20; i++) stepSimulation(sim);
    const dauer = Date.now() - start;
    expect(sim.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
    // 20 Schritte Alle-gegen-alle waeren 90 Millionen Paare gewesen.
    expect(dauer).toBeLessThan(6000);
  });
});

describe("reuseSimulation", () => {
  it("uebernimmt bekannte Positionen, damit der Graph nicht springt", () => {
    const alt = createSimulation(["a", "b"], []);
    for (let i = 0; i < 100; i++) stepSimulation(alt);
    const ax = alt.index.get("a")!.x;
    const neu = reuseSimulation(alt, ["a", "b"], []);
    expect(neu.index.get("a")!.x).toBe(ax);
  });

  it("heizt nach, sobald ein Knoten dazukommt", () => {
    const alt = createSimulation(["a"], []);
    for (let i = 0; i < 2000; i++) stepSimulation(alt);
    expect(isSettled(alt)).toBe(true);
    const neu = reuseSimulation(alt, ["a", "b"], []);
    expect(neu.alpha).toBeGreaterThanOrEqual(0.45);
  });

  it("laesst eine ausgekuehlte, unveraenderte Menge in Ruhe", () => {
    const alt = createSimulation(["a", "b"], []);
    for (let i = 0; i < 2000; i++) stepSimulation(alt);
    expect(isSettled(reuseSimulation(alt, ["a", "b"], []))).toBe(true);
  });

  it("uebernimmt das Festhalten", () => {
    const alt = createSimulation(["a"], []);
    alt.index.get("a")!.pinned = true;
    expect(reuseSimulation(alt, ["a"], []).index.get("a")!.pinned).toBe(true);
  });

  it("faellt ohne Vorlauf auf einen frischen Lauf zurueck", () => {
    expect(reuseSimulation(null, ["a"], []).alpha).toBe(1);
  });
});

describe("Ausschnitt", () => {
  it("layoutBounds liefert ohne Knoten ein brauchbares Rechteck", () => {
    expect(layoutBounds([])).toEqual({ minX: -100, minY: -100, maxX: 100, maxY: 100 });
  });

  it("layoutBounds beruecksichtigt den Rand", () => {
    const b = layoutBounds([knoten("a", 0, 0), knoten("b", 10, 20)], 5);
    expect(b).toEqual({ minX: -5, minY: -5, maxX: 15, maxY: 25 });
  });

  it("fitTransform zeigt eine Welt, die viel groesser ist als das Fenster", () => {
    // Genau die Antwort auf die Wand: nicht die Welt ins Fenster pressen,
    // sondern das Fenster auf die Welt einstellen.
    const b = { minX: -5000, minY: -5000, maxX: 5000, maxY: 5000 };
    const t = fitTransform(b, { w: 800, h: 500 });
    expect(t.k).toBeLessThan(0.1);
    const ecke = toScreen(t, b.minX, b.minY);
    const gegen = toScreen(t, b.maxX, b.maxY);
    expect(ecke.x).toBeGreaterThanOrEqual(0);
    expect(gegen.x).toBeLessThanOrEqual(800);
    expect(ecke.y).toBeGreaterThanOrEqual(0);
    expect(gegen.y).toBeLessThanOrEqual(500);
  });

  it("fitTransform zentriert und vergroessert nicht ins Absurde", () => {
    const t = fitTransform({ minX: -1, minY: -1, maxX: 1, maxY: 1 }, { w: 800, h: 500 });
    expect(t.k).toBeLessThanOrEqual(4);
    const mitte = toScreen(t, 0, 0);
    expect(mitte.x).toBeCloseTo(400, 6);
    expect(mitte.y).toBeCloseTo(250, 6);
  });

  it("fitTransform ueberlebt ein entartetes Fenster", () => {
    const t = fitTransform({ minX: 0, minY: 0, maxX: 0, maxY: 0 }, { w: 0, h: 0 });
    expect(Number.isFinite(t.k)).toBe(true);
    expect(t.k).toBeGreaterThan(0);
  });

  it("toWorld und toScreen sind zueinander invers", () => {
    const t = { x: 120, y: -40, k: 0.37 };
    const w = toWorld(t, 300, 200);
    const s = toScreen(t, w.x, w.y);
    expect(s.x).toBeCloseTo(300, 9);
    expect(s.y).toBeCloseTo(200, 9);
  });

  it("zoomAt haelt den Punkt unter dem Zeiger fest", () => {
    const t = { x: 0, y: 0, k: 1 };
    const vorher = toWorld(t, 250, 150);
    const nachher = toWorld(zoomAt(t, 1.4, 250, 150), 250, 150);
    expect(nachher.x).toBeCloseTo(vorher.x, 9);
    expect(nachher.y).toBeCloseTo(vorher.y, 9);
  });

  it("zoomAt bleibt in den Grenzen — auch weit hinausgezoomt", () => {
    let t = { x: 0, y: 0, k: 1 };
    for (let i = 0; i < 200; i++) t = zoomAt(t, 0.8, 0, 0);
    expect(t.k).toBeGreaterThanOrEqual(0.02);
    for (let i = 0; i < 200; i++) t = zoomAt(t, 1.25, 0, 0);
    expect(t.k).toBeLessThanOrEqual(6);
  });
});

describe("nodeAt", () => {
  const nodes = [knoten("a", 0, 0), knoten("b", 100, 0)];
  const r = () => 10;

  it("trifft den Knoten unter dem Zeiger", () => {
    expect(nodeAt(nodes, r, 3, 3)!.id).toBe("a");
  });

  it("liefert nichts im Leerraum", () => {
    expect(nodeAt(nodes, r, 50, 50)).toBeNull();
  });

  it("nimmt bei Ueberlappung den naeheren", () => {
    const eng = [knoten("a", 0, 0), knoten("b", 8, 0)];
    expect(nodeAt(eng, () => 20, 7, 0)!.id).toBe("b");
  });

  it("beachtet die Trefferweite", () => {
    expect(nodeAt(nodes, r, 13, 0, 0)).toBeNull();
    expect(nodeAt(nodes, r, 13, 0, 6)!.id).toBe("a");
  });
});

// ---------------------------------------------------------------------------
// Befund vom 6.9.2026, aus der Benutzung: "Die ganze Physik ist auch weg. Wenn
// man die zieht kann man die nicht mehr einzeln auseinanderziehen. Die stossen
// sich nicht mehr voneinander ab. Man hat kein Ueberblick mehr, wenn man zu
// viel Wissen hat, alles ist auf einem Haufen."
//
// Drei Ursachen, jede hier festgehalten:
//   1. JEDE Kraft hing an alpha, und alpha faellt auf 0,006 — ein ausgekuehlter
//      Graph hatte keine Abstossung mehr.
//   2. pinned wurde bei jedem Antippen gesetzt und nie geloescht — jeder
//      angefasste Knoten war dauerhaft aus der Physik heraus.
//   3. Es gab keine Kollision, und die Federn waren nicht nach Grad gewichtet —
//      dichte Buendel fielen in sich zusammen.
// ---------------------------------------------------------------------------

describe("Kollision: Knoten ueberlappen nie", () => {
  it("schiebt zwei uebereinanderliegende Knoten auseinander", () => {
    const a = knoten("a", 0, 0, 12);
    const b = knoten("b", 4, 0, 12);
    resolveCollisions([a, b]);
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    expect(d).toBeGreaterThanOrEqual(12 + 12 + COLLIDE_PADDING - 0.001);
  });

  it("laesst Knoten in Ruhe, die schon weit genug auseinanderliegen", () => {
    const a = knoten("a", 0, 0, 10);
    const b = knoten("b", 500, 0, 10);
    resolveCollisions([a, b]);
    expect(a.x).toBe(0);
    expect(b.x).toBe(500);
  });

  it("bewegt einen festgehaltenen Knoten nicht — der andere weicht ganz aus", () => {
    const a = knoten("a", 0, 0, 12);
    a.pinned = true;
    const b = knoten("b", 3, 0, 12);
    resolveCollisions([a, b]);
    expect(a.x).toBe(0);
    expect(a.y).toBe(0);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(12 + 12 + COLLIDE_PADDING - 0.001);
  });

  it("kommt mit exakt uebereinanderliegenden Knoten zurecht", () => {
    const a = knoten("a", 7, 7, 10);
    const b = knoten("b", 7, 7, 10);
    resolveCollisions([a, b]);
    expect(Number.isFinite(a.x)).toBe(true);
    expect(Number.isFinite(b.x)).toBe(true);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0);
  });

  it("tut bei null oder einem Knoten nichts", () => {
    expect(resolveCollisions([])).toBe(0);
    expect(resolveCollisions([knoten("a", 0, 0)])).toBe(0);
  });

  it("loest auch ein dichtes Haeufchen auf", () => {
    const nodes = Array.from({ length: 40 }, (_, i) => knoten(`n${i}`, (i % 7) * 2, Math.floor(i / 7) * 2, 9));
    for (let i = 0; i < 60; i++) resolveCollisions(nodes);
    let ueberlappungen = 0;
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
        if (d < nodes[i].r + nodes[j].r - 0.5) ueberlappungen++;
      }
    expect(ueberlappungen).toBe(0);
  });

  it("bleibt bei 2000 Knoten rechenbar", () => {
    const nodes = Array.from({ length: 2000 }, (_, i) => knoten(`n${i}`, (i % 50) * 25, Math.floor(i / 50) * 25, 10));
    const start = Date.now();
    resolveCollisions(nodes);
    expect(Date.now() - start).toBeLessThan(1500);
  });
});

describe("Die Abstossung stirbt nicht mit alpha", () => {
  it("drueckt zwei Knoten auch im ausgekuehlten Layout auseinander", () => {
    const sim = createSimulation(["a", "b"], []);
    for (let i = 0; i < 2000; i++) stepSimulation(sim);
    expect(isSettled(sim)).toBe(true);

    // Zwei Knoten von Hand aufeinanderschieben — wie beim Ziehen.
    const a = sim.index.get("a")!;
    const b = sim.index.get("b")!;
    a.x = 0; a.y = 0; a.vx = 0; a.vy = 0;
    b.x = 6; b.y = 0; b.vx = 0; b.vy = 0;
    for (let i = 0; i < 40; i++) stepSimulation(sim);
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    // Frueher blieben sie liegen, wo man sie hingeschoben hat.
    expect(d).toBeGreaterThan(a.r + b.r);
  });

  it("laesst die Bewegung nach einer Geste wirklich abklingen", () => {
    // Der Fehler, den diese Pruefung festhaelt, war von aussen als "alle bunten
    // Knoten in der Mitte fangen an rumzutanzen" zu sehen.
    //
    // Ursache war eine Untergrenze fuer die Kraefte: unterhalb von 0,22 wurde
    // nicht weiter gedaempft. Damit war es ein System KONSTANTER ENERGIE — die
    // Reibung nimmt Energie heraus, die Kraefte pumpen ebenso viel wieder
    // hinein. Die Bewegungsenergie pendelte sich ein und blieb ueber
    // vierhundert Bilder unveraendert; der Graph kam nie zur Ruhe.
    const ids = Array.from({ length: 60 }, (_, i) => `n${i}`);
    const kanten: LayoutEdge[] = [];
    for (let i = 0; i < 30; i++)
      for (let j = i + 1; j < 30; j++) kanten.push({ source: ids[i], target: ids[j], strength: 0.8, real: false });
    const sim = createSimulation(ids, kanten, () => 9);
    for (let i = 0; i < 900; i++) stepSimulation(sim);

    const energie = () => sim.nodes.reduce((s, n) => s + n.vx * n.vx + n.vy * n.vy, 0);
    const inRuhe = energie();

    // Eine Geste: anfassen, wegziehen, loslassen.
    setDragging(sim, true);
    const ziel = sim.nodes[0];
    ziel.pinned = true;
    for (let k = 0; k < 30; k++) { ziel.x += 30; ziel.y -= 20; ziel.vx = 0; ziel.vy = 0; stepSimulation(sim); }
    ziel.pinned = false;
    setDragging(sim, false);

    const gleichDanach = energie();
    for (let i = 0; i < 400; i++) stepSimulation(sim);
    const spaeter = energie();

    expect(gleichDanach, "die Geste muss den Graphen ueberhaupt anregen").toBeGreaterThan(inRuhe * 5);
    // Und danach zurueck zur Ruhe — nicht auf ein Plateau.
    expect(spaeter).toBeLessThan(gleichDanach / 100);
    expect(isSettled(sim)).toBe(true);
  });

  it("steht im Ruhezustand wirklich still", () => {
    const sim = createSimulation(Array.from({ length: 40 }, (_, i) => `r${i}`), []);
    for (let i = 0; i < 1200; i++) stepSimulation(sim);
    const vorher = sim.nodes.map((n) => ({ x: n.x, y: n.y }));
    for (let i = 0; i < 60; i++) stepSimulation(sim);
    let groesste = 0;
    for (let i = 0; i < sim.nodes.length; i++) {
      groesste = Math.max(groesste, Math.hypot(sim.nodes[i].x - vorher[i].x, sim.nodes[i].y - vorher[i].y));
    }
    // Mit der alten Kraftuntergrenze zitterte hier jeder Knoten dauerhaft weiter.
    expect(groesste).toBeLessThan(1);
  });
});

describe("setDragging: die Simulation bleibt warm, solange gezogen wird", () => {
  it("laesst die Simulation nicht einschlafen", () => {
    const sim = createSimulation(["a", "b", "c"], []);
    for (let i = 0; i < 2000; i++) stepSimulation(sim);
    expect(isSettled(sim)).toBe(true);

    setDragging(sim, true);
    // Auch nach langem Ziehen laeuft die Physik noch.
    for (let i = 0; i < 2000; i++) stepSimulation(sim);
    expect(isSettled(sim)).toBe(false);
    expect(sim.alpha).toBeGreaterThan(0.2);
  });

  it("kuehlt nach dem Loslassen wieder aus", () => {
    const sim = createSimulation(["a", "b"], []);
    setDragging(sim, true);
    for (let i = 0; i < 50; i++) stepSimulation(sim);
    setDragging(sim, false);
    for (let i = 0; i < 3000; i++) stepSimulation(sim);
    expect(isSettled(sim)).toBe(true);
  });
});

describe("linkStaerken: dichte Buendel fallen nicht in sich zusammen", () => {
  it("teilt die Federkraft durch den kleineren Verbindungsgrad", () => {
    const kanten = [
      { source: "a", target: "b", strength: 1, real: false },
      { source: "a", target: "c", strength: 1, real: false },
      { source: "a", target: "d", strength: 1, real: false },
    ];
    const s = linkStaerken([], kanten);
    // b, c und d haben Grad 1 -> volle Staerke; a haette Grad 3.
    expect(s.every((x) => x === 1)).toBe(true);
  });

  it("schwaecht die Federn in einer Clique deutlich ab", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `n${i}`);
    const kanten: LayoutEdge[] = [];
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) kanten.push({ source: ids[i], target: ids[j], strength: 1, real: false });
    const s = linkStaerken([], kanten);
    expect(Math.max(...s)).toBeLessThan(0.1);
  });

  it("haelt eine Clique auseinander, statt sie zu einem Punkt zu ziehen", () => {
    // 30 Notizen mit demselben Tag: 435 Federn. Frueher fielen sie zusammen.
    const ids = Array.from({ length: 30 }, (_, i) => `c${i}`);
    const kanten: LayoutEdge[] = [];
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) kanten.push({ source: ids[i], target: ids[j], strength: 0.9, real: false });
    const sim = createSimulation(ids, kanten, () => 12);
    for (let i = 0; i < 600; i++) stepSimulation(sim);

    let ueberlappungen = 0;
    for (let i = 0; i < sim.nodes.length; i++)
      for (let j = i + 1; j < sim.nodes.length; j++) {
        const d = Math.hypot(sim.nodes[i].x - sim.nodes[j].x, sim.nodes[i].y - sim.nodes[j].y);
        if (d < 24) ueberlappungen++;
      }
    expect(ueberlappungen).toBe(0);
    const b = layoutBounds(sim.nodes);
    expect(b.maxX - b.minX).toBeGreaterThan(150);
  });
});

describe("Knotenradien", () => {
  it("uebernimmt den Radius aus der Angabe des Aufrufers", () => {
    const sim = createSimulation(["a", "b"], [], (id) => (id === "a" ? 20 : 5));
    expect(sim.index.get("a")!.r).toBe(20);
    expect(sim.index.get("b")!.r).toBe(5);
  });

  it("haelt den Ruheabstand einer Feder von der Knotengroesse abhaengig", () => {
    const dick = createSimulation(["a", "b"], [{ source: "a", target: "b", strength: 1, real: true }], () => 24);
    const duenn = createSimulation(["a", "b"], [{ source: "a", target: "b", strength: 1, real: true }], () => 4);
    for (const sim of [dick, duenn]) {
      sim.index.get("a")!.x = -400; sim.index.get("b")!.x = 400;
      sim.index.get("a")!.y = 0; sim.index.get("b")!.y = 0;
      for (let i = 0; i < 900; i++) stepSimulation(sim);
    }
    const abstand = (s: typeof dick) => Math.hypot(s.index.get("a")!.x - s.index.get("b")!.x, s.index.get("a")!.y - s.index.get("b")!.y);
    expect(abstand(dick)).toBeGreaterThan(abstand(duenn));
  });

  it("uebernimmt Radien auch beim Weiterfuehren einer Simulation", () => {
    const alt = createSimulation(["a"], [], () => 9);
    const neu = reuseSimulation(alt, ["a", "b"], [], () => 17);
    expect(neu.index.get("a")!.r).toBe(17);
  });
});

describe("nurEchteKanten: der Schleier beim Herauszoomen", () => {
  it("malt bei wenigen Kanten immer alles", () => {
    expect(nurEchteKanten(100, 0.1)).toBe(false);
    expect(nurEchteKanten(EDGE_LOD_THRESHOLD, 0.05)).toBe(false);
  });

  it("laesst Aehnlichkeiten erst weg, wenn es viele Kanten sind UND man weit weg ist", () => {
    expect(nurEchteKanten(EDGE_LOD_THRESHOLD + 1, EDGE_LOD_ZOOM - 0.01)).toBe(true);
    expect(nurEchteKanten(EDGE_LOD_THRESHOLD + 1, EDGE_LOD_ZOOM)).toBe(false);
    expect(nurEchteKanten(EDGE_LOD_THRESHOLD + 1, 3)).toBe(false);
  });

  it("greift bei einem leeren Graphen nie", () => {
    expect(nurEchteKanten(0, 0.01)).toBe(false);
  });
});

describe("Kraeftegleichgewicht: der Graph blaeht sich nicht auf", () => {
  // Befund vom 6.9.2026 aus dem Zieh-Test mit drei Nutzerprofilen: fuenf
  // gewoehnliche Zieh-Gesten vergroesserten das Layout um 52 % — dauerhaft, ohne
  // Rueckkehr. Wer eine Weile mit dem Graphen spielt, sieht ihn auseinander-
  // driften und die Knoten immer kleiner werden.
  //
  // Ursache: die Abstossung hatte eine Untergrenze (damit ein ausgekuehlter
  // Graph noch drueckt), Federn und Schwerkraft aber nicht. Nach dem Auskuehlen
  // lief die Abstossung mit dem Siebenunddreissigfachen der Gegenkraefte.
  function nachGesten(anzahl: number, gesten: number): { vorher: number; nachher: number } {
    const ids = Array.from({ length: anzahl }, (_, i) => `g${i}`);
    const sim = createSimulation(ids, [], () => 4);
    for (let i = 0; i < 900; i++) stepSimulation(sim);
    const b1 = layoutBounds(sim.nodes);
    for (let g = 0; g < gesten; g++) {
      setDragging(sim, true);
      for (let i = 0; i < 40; i++) stepSimulation(sim);
      setDragging(sim, false);
      for (let i = 0; i < 300; i++) stepSimulation(sim);
    }
    const b2 = layoutBounds(sim.nodes);
    return { vorher: b1.maxX - b1.minX, nachher: b2.maxX - b2.minX };
  }

  it.each([12, 60, 400])("bleibt bei %i Knoten nach fuenf Gesten stabil", (n) => {
    const { vorher, nachher } = nachGesten(n, 5);
    expect(nachher / vorher, `Layout waechst um ${Math.round((nachher / vorher - 1) * 100)} %`).toBeLessThan(1.15);
  });

  it("driftet auch nach zwanzig Gesten nicht davon", () => {
    const { vorher, nachher } = nachGesten(40, 20);
    expect(nachher / vorher).toBeLessThan(1.3);
  });

  it("haelt bei wenigen Knoten eine handhabbare Ausdehnung", () => {
    // Zwoelf unverbundene Notizen spannten 2345 Einheiten auf; beim Einpassen
    // wurden daraus Knoten von 1,6 px Durchmesser — nicht mehr zu treffen.
    const ids = Array.from({ length: 12 }, (_, i) => `k${i}`);
    const sim = createSimulation(ids, [], () => 4);
    for (let i = 0; i < 1200; i++) stepSimulation(sim);
    const b = layoutBounds(sim.nodes);
    expect(b.maxX - b.minX).toBeLessThan(700);
  });

  it("daempft alle Kraefte gleich — sonst kippt das Gleichgewicht", () => {
    // Ein Lauf mit kaltem und einer mit warmem alpha muessen auf dieselbe
    // Ausdehnung zulaufen; nur die Geschwindigkeit darf sich unterscheiden.
    const bau = () => createSimulation(Array.from({ length: 40 }, (_, i) => `x${i}`), [], () => 5);
    const kalt = bau();
    for (let i = 0; i < 3000; i++) stepSimulation(kalt);
    const warm = bau();
    setDragging(warm, true);
    for (let i = 0; i < 3000; i++) stepSimulation(warm);
    const bk = layoutBounds(kalt.nodes), bw = layoutBounds(warm.nodes);
    const vk = bk.maxX - bk.minX, vw = bw.maxX - bw.minX;
    expect(Math.abs(vw - vk) / vk, `kalt ${Math.round(vk)} vs warm ${Math.round(vw)}`).toBeLessThan(0.25);
  });
});

describe("Struktur: verbundene Notizen ruecken zusammen", () => {
  // Der schwerste Befund aus dem Zieh-Test vom 6.9.2026. Gemessen an einem
  // Layout mit drei klar getrennten Gruppen sassen VERBUNDENE Paare 164
  // Einheiten auseinander und beliebige 160 — eine Verbindung machte also
  // keinen Unterschied. Ursache: der Ruheabstand der Federn (150 plus Radien)
  // lag ueber dem Abstand, den Abstossung und Kollision ohnehin herstellen. Die
  // Federn drueckten damit auseinander statt zusammen.
  //
  // Ein Wissensgraph, der Verbundenes nicht naeher zeigt als Unverbundenes,
  // erfuellt seinen Zweck nicht.
  function dreiGruppen() {
    const ids: string[] = [];
    const kanten: LayoutEdge[] = [];
    for (let g = 0; g < 3; g++) {
      const gids = Array.from({ length: 25 }, (_, i) => `g${g}_${i}`);
      ids.push(...gids);
      for (let i = 0; i < gids.length; i++)
        for (let j = i + 1; j < gids.length; j++)
          if ((i + j) % 3 === 0) kanten.push({ source: gids[i], target: gids[j], strength: 0.9, real: false });
    }
    const sim = createSimulation(ids, kanten, () => 8);
    for (let i = 0; i < 1800; i++) stepSimulation(sim);
    return sim;
  }
  const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

  it("zeigt verbundene Paare deutlich naeher als beliebige", () => {
    const sim = dreiGruppen();
    const verbunden = sim.edges.map((e) => {
      const a = sim.index.get(e.source)!, b = sim.index.get(e.target)!;
      return Math.hypot(a.x - b.x, a.y - b.y);
    });
    const beliebig: number[] = [];
    for (let i = 0; i < 400; i++) {
      const a = sim.nodes[(i * 7) % sim.nodes.length];
      const b = sim.nodes[(i * 13 + 5) % sim.nodes.length];
      if (a !== b) beliebig.push(Math.hypot(a.x - b.x, a.y - b.y));
    }
    const mv = median(verbunden), mb = median(beliebig);
    expect(mb / mv, `verbunden ${mv.toFixed(0)}, beliebig ${mb.toFixed(0)} — kaum Unterschied`).toBeGreaterThan(2.5);
  });

  it("laesst dabei keine Knoten ueberlappen", () => {
    const sim = dreiGruppen();
    let ueberlappungen = 0;
    for (let i = 0; i < sim.nodes.length; i++)
      for (let j = i + 1; j < sim.nodes.length; j++) {
        const d = Math.hypot(sim.nodes[i].x - sim.nodes[j].x, sim.nodes[i].y - sim.nodes[j].y);
        if (d < sim.nodes[i].r + sim.nodes[j].r - 0.5) ueberlappungen++;
      }
    expect(ueberlappungen).toBe(0);
  });

  it("haelt den Ruheabstand unter dem Abstand, den Abstossung ohnehin herstellt", () => {
    // Die Bedingung dafuer, dass eine Feder ueberhaupt anzieht.
    const sim = dreiGruppen();
    const beliebig: number[] = [];
    for (let i = 0; i < 300; i++) {
      const a = sim.nodes[(i * 7) % sim.nodes.length];
      const b = sim.nodes[(i * 11 + 3) % sim.nodes.length];
      if (a !== b) beliebig.push(Math.hypot(a.x - b.x, a.y - b.y));
    }
    expect(sim.ruheLaenge + 16).toBeLessThan(median(beliebig));
  });

  it("traegt den Ruheabstand beim Weiterfuehren mit", () => {
    const alt = createSimulation(["a", "b"], []);
    alt.ruheLaenge = 33;
    expect(reuseSimulation(alt, ["a", "b", "c"], []).ruheLaenge).toBe(33);
  });
});

describe("Der Rand um die Ansicht ist ein Mass, keine Konstante", () => {
  // layoutBounds kennt nur Mittelpunkte. Der Rand muss den Teil abdecken, der
  // ueber den Mittelpunkt hinausragt — und das ist der Radius des groessten
  // Knotens. Frueher stand dort die feste Zahl 70. Die ist in WELTeinheiten
  // gemessen, waehrend der Rand auf dem SCHIRM erscheint: bei einer kleinen
  // Wissensbasis wird stark hineingezoomt, aus 70 Einheiten werden ueber
  // hundert Pixel je Seite, und zwoelf Notizen sassen als Briefmarke in der
  // Mitte eines leeren Fensters.
  const knoten = (x: number, y: number, r: number): LayoutNode =>
    ({ id: `${x}:${y}`, x, y, vx: 0, vy: 0, r, pinned: false }) as LayoutNode;

  it("nimmt den groessten Radius, nicht den ersten und nicht den Durchschnitt", () => {
    expect(randFuerAnsicht([knoten(0, 0, 4), knoten(50, 0, 18), knoten(0, 50, 6)])).toBe(18);
  });

  it("ist ohne Knoten null und nicht NaN", () => {
    expect(randFuerAnsicht([])).toBe(0);
  });

  it("laesst den groessten Knoten vollstaendig im Bild", () => {
    const ns = [knoten(-200, -120, 18), knoten(200, 120, 18)];
    const t = fitTransform(layoutBounds(ns, randFuerAnsicht(ns)), { w: 1000, h: 700 });
    for (const n of ns) {
      const p = toScreen(t, n.x, n.y);
      expect(p.x - n.r * t.k).toBeGreaterThanOrEqual(0);
      expect(p.x + n.r * t.k).toBeLessThanOrEqual(1000);
      expect(p.y - n.r * t.k).toBeGreaterThanOrEqual(0);
      expect(p.y + n.r * t.k).toBeLessThanOrEqual(700);
    }
  });

  it("fuellt eine kleine Wissensbasis wirklich aus, statt sie zu briefmarken", () => {
    // Genau der Fall des Erstnutzers: wenige Notizen, viel leeres Fenster.
    const ns = [knoten(-60, -40, 4), knoten(60, -40, 4), knoten(0, 40, 4)];
    const t = fitTransform(layoutBounds(ns, randFuerAnsicht(ns)), { w: 1000, h: 700 });
    const xs = ns.map((n) => toScreen(t, n.x, n.y).x);
    const ys = ns.map((n) => toScreen(t, n.x, n.y).y);
    const breite = Math.max(...xs) - Math.min(...xs);
    const hoehe = Math.max(...ys) - Math.min(...ys);
    // Mit dem alten Rand von 70 Einheiten blieben hier unter 40 % uebrig.
    expect(Math.max(breite / 1000, hoehe / 700)).toBeGreaterThan(0.45);
  });
});

describe("Ein Zug bewegt einen Knoten, nicht den ganzen Graphen", () => {
  // Die Klage: "Wenn ich einen Knoten weg ziehe, fangen alle anderen Knoten an
  // zu tanzen." Ursache war das globale Anheizen beim Griff — setDragging hob
  // die Kraftstaerke des GANZEN Layouts auf 0,3, also ordnete sich die
  // komplette Wissensbasis neu und brauchte hunderte Bilder bis zur Ruhe.
  //
  // Was ein Zug bewegen DARF, ist das, was der gezogene Knoten unterwegs
  // beruehrt: die Kollision laeuft in jedem Bild und ohne alpha. Was er nicht
  // darf, ist alles Uebrige aufzuwirbeln.
  function ruhendesLayout() {
    const themen = ["kochen", "reise", "react", "typescript"];
    const mem: Memory[] = [];
    let i = 0;
    for (const t of themen) for (let k = 0; k < 30; k++, i++) {
      mem.push({ id: `m${i}`, userId: "local", title: `${t} Notiz ${k}`, content: "x",
        tags: [t], type: "semantic", createdAt: 1, updatedAt: 1 } as Memory);
    }
    const kanten = buildEdges(mem);
    const sim = createSimulation(mem.map((m) => m.id), kanten, () => 9);
    let n = 0;
    while (!isSettled(sim) && n < 4000) { stepSimulation(sim); n++; }
    return sim;
  }

  /** Zieht einen Knoten quer durchs Bild und meldet, was mit den anderen geschah. */
  function ziehe(sim: ReturnType<typeof ruhendesLayout>, mitAnheizen: boolean) {
    const vor = sim.nodes.map((k) => ({ x: k.x, y: k.y }));
    const ziel = sim.nodes[Math.floor(sim.nodes.length / 2)];
    if (mitAnheizen) setDragging(sim, true);
    ziel.pinned = true;
    for (let f = 0; f < 30; f++) { ziel.x += 20; ziel.y -= 12; ziel.vx = 0; ziel.vy = 0; stepSimulation(sim); }
    if (mitAnheizen) setDragging(sim, false);
    let nachbilder = 0;
    while (!isSettled(sim) && nachbilder < 800) { stepSimulation(sim); nachbilder++; }
    let summe = 0;
    for (let k = 0; k < sim.nodes.length; k++) {
      if (sim.nodes[k] === ziel) continue;
      summe += Math.hypot(sim.nodes[k].x - vor[k].x, sim.nodes[k].y - vor[k].y);
    }
    return { mittel: summe / (sim.nodes.length - 1), nachbilder };
  }

  it("wirbelt ohne globales Anheizen nur die Nachbarschaft auf", () => {
    const { mittel, nachbilder } = ziehe(ruhendesLayout(), false);
    expect(mittel, "die uebrigen Knoten duerfen kaum wandern").toBeLessThan(20);
    expect(nachbilder, "und der Graph muss sofort wieder stehen").toBeLessThan(20);
  });

  it("zeigt, warum das Anheizen weg musste: es ordnet alles neu", () => {
    // Dieser Test haelt den ALTEN Zustand fest, damit die Begruendung messbar
    // bleibt und niemand das Anheizen versehentlich wieder einbaut.
    const ohne = ziehe(ruhendesLayout(), false);
    const mit = ziehe(ruhendesLayout(), true);
    expect(mit.mittel).toBeGreaterThan(ohne.mittel * 3);
    expect(mit.nachbilder).toBeGreaterThan(100);
  });
});

describe("Ähnlichkeit ist eine Wahl, nicht der Grundzustand", () => {
  // Die Aufnahme vom 6.10.: „75 nodes · 891 edges" — fast alles davon waren
  // Ähnlichkeitskanten aus gemeinsamen Tags und Titelwörtern. Sie machen die
  // Fläche zu einem Knäuel, in dem die Behauptungen, die jemand tatsächlich
  // verknüpft hat, nicht mehr zu sehen sind. Darum ist Ähnlichkeit jetzt
  // ausgeschaltet, bis man sie ruft.
  const paar = () => {
    const a = note({ title: "Akkreditiv Berlin", tags: ["client"] });
    const b = note({ title: "Akkreditiv Bern", tags: ["client"] });
    const c = note({ title: "Gänzlich anderes Thema" });
    return { a, b, c };
  };

  it("mit ahnlichkeit:false bleibt nur die echte Relation stehen", () => {
    const { a, b, c } = paar();
    const ohne = buildEdges([a, b, c], { realPairs: [[a.id, c.id]], ahnlichkeit: false });
    expect(ohne).toHaveLength(1);
    expect(ohne[0]!.real).toBe(true);
    expect([ohne[0]!.source, ohne[0]!.target].sort()).toEqual([a.id, c.id].sort());
  });

  it("ohne Schalter bleibt das alte Verhalten — kein Aufrufer wird versehentlich blind", () => {
    const { a, b, c } = paar();
    const mit = buildEdges([a, b, c], { realPairs: [[a.id, c.id]] });
    expect(mit.some((e) => !e.real)).toBe(true);
    expect(mit.filter((e) => e.real)).toHaveLength(1);
  });

  it("kantZaehlung trennt echt und ähnlich", () => {
    const { a, b, c } = paar();
    const kanten = buildEdges([a, b, c], { realPairs: [[a.id, c.id]] });
    const z = kantZaehlung(kanten);
    expect(z.echt).toBe(1);
    expect(z.aehnlichkeit).toBeGreaterThan(0);
    expect(z.gesamt).toBe(kanten.length);
  });

  it("kantZaehlung auf leer liefert null und wirft nicht", () => {
    expect(kantZaehlung([])).toEqual({ echt: 0, aehnlichkeit: 0, gesamt: 0 });
  });

  it("hält Paare auf Konzept-IDs, obwohl sie keine Notizen sind", () => {
    // Das Kraftfeld zeichnet ab jetzt Konzepte als eigene Knoten. Ohne die
    // Mithilfe hier würden alle Kanten ans Gerüst weggeworfen, weil ihr Ende
    // nicht in der Notizliste steht — und das Gerüst hinge unsichtbar im Bild.
    const { a, c } = paar();
    const kanten = buildEdges([a, c], {
      ahnlichkeit: false,
      knotenIds: ["__ent:elena"],
      realPairs: [[a.id, "__ent:elena"], ["__ent:elena", "__ent:falk"]],
    });
    expect(kanten.map((e) => `${e.source}->${e.target}`)).toEqual([`${a.id}->__ent:elena`]);
  });
});

describe("entitaetsNetz — eine Ontologie für Kraftfeld und Baum", () => {
  // Das Kraftfeld faltet bisher jede Behauptung zwischen zwei Entitäten in das
  // Kreuzprodukt ihrer Notizen und kappt nach 24 Paaren. Zwei Notizen, die
  // beide „Elena" erwähnen, stehen darin unverbunden — zwei Notizen, die je
  // eine verbundene Entität erwähnen, stehen verbunden, obwohl sie nichts
  // teilen. Dieses Netz baut die Wahrheit um: Notizen hängen an Konzepten,
  // Konzepte untereinander sind die Aussage.

  const netz = (
    byEntity: Record<string, string[]>,
    relationen: {
      source: string;
      target: string;
      relation?: string;
      memoryId?: string | null;
      validFrom?: number | null;
      validTo?: number | null;
    }[],
    sichtbar: string[],
    titelVon?: (id: string) => string | undefined
  ) => entitaetsNetz(byEntity, relationen, new Set(sichtbar), 2, titelVon);

  // G-1 (lesenseitig): der Schreibweg legt von jeder Notiz auch ihren Titel als
  // Begriff an und hängt die Behauptung daran. In einer echten Basis von 400
  // Notizen sind das 400 von 420 Begriffen und alle 1 400 Linien — ein Echo der
  // Titelliste, kein Wissen. Solange der Schreibweg nicht umgestellt ist, darf
  // die Fläche das Echo nicht als Ontologie ausgeben.
  it("ein Begriff, der nur den Titel seiner einen Notiz wiederholt, ist keiner", () => {
    const n = netz(
      { "rahmen nordwind": ["m1"], nordwind: ["m1", "m2"] },
      [{ source: "rahmen nordwind", target: "nordwind", relation: "mentions", memoryId: "m1" }],
      ["m1", "m2"],
      (id) => ({ m1: "Rahmen Nordwind", m2: "Tranche Nordwind" })[id]
    );
    expect(n.knoten.map((k) => k.label)).toEqual(["nordwind"]);
    expect(n.behauptungen).toEqual([]);
    expect(n.erwahnungen).toEqual([["m1", "__ent:nordwind"], ["m2", "__ent:nordwind"]]);
  });

  it("zwei Notizen mit demselben Titel sind eine Gruppe, kein Echo", () => {
    const n = netz(
      { nordwind: ["m1", "m2"] },
      [{ source: "nordwind", target: "quay", relation: "betreut", memoryId: "m1" }],
      ["m1", "m2"],
      (id) => ({ m1: "Nordwind", m2: "Nordwind" })[id]
    );
    expect(n.knoten.map((k) => k.label)).toContain("nordwind");
    expect(n.behauptungen).toHaveLength(1);
  });

  it("eine Behauptung zwischen zwei echten Begriffen bleibt, auch wenn Echos im Bestand sind", () => {
    const n = netz(
      {
        "titel einer notiz": ["m1"],
        nordwind: ["m1", "m2"],
        quay: ["m2", "m3"],
      },
      [
        { source: "titel einer notiz", target: "nordwind", relation: "mentions", memoryId: "m1" },
        { source: "nordwind", target: "quay", relation: "betreut", memoryId: "m2" },
      ],
      ["m1", "m2", "m3"],
      (id) => ({ m1: "Titel einer notiz", m2: "Tranche", m3: "Termin" })[id]
    );
    expect(n.knoten.map((k) => k.label)).toEqual(["nordwind", "quay"]);
    expect(n.behauptungen).toHaveLength(1);
    expect(n.behauptungen[0]!.relation).toBe("betreut");
  });

  it("ohne Titelkenntnis bleibt das Netz, was es war", () => {
    const n = netz(
      { "rahmen nordwind": ["m1"], nordwind: ["m1", "m2"] },
      [{ source: "rahmen nordwind", target: "nordwind", relation: "mentions", memoryId: "m1" }],
      ["m1", "m2"]
    );
    expect(n.knoten.map((k) => k.label)).toEqual(["nordwind", "rahmen nordwind"]);
    expect(n.behauptungen).toHaveLength(1);
  });

  it("eine Entität mit zwei sichtbaren Notizen wird ein Knoten", () => {
    const n = netz({ elena: ["a", "b", "versteckt"] }, [], ["a", "b"]);
    expect(n.knoten).toEqual([{ id: "__ent:elena", label: "elena", notizen: ["a", "b"] }]);
    expect(n.erwahnungen).toEqual([["a", "__ent:elena"], ["b", "__ent:elena"]]);
    expect(n.behauptungen).toEqual([]);
  });

  it("eine Entität mit genau einer Notiz und ohne Behauptung bleibt weg", () => {
    // Ein Konzept, von dem nichts ausgesagt wird und das zwei Notizen teilen,
    // ist Rauschen — es füllt das Bild, ohne etwas zu verbinden.
    const n = netz({ elena: ["a"] }, [], ["a"]);
    expect(n.knoten).toEqual([]);
    expect(n.erwahnungen).toEqual([]);
  });

  it("Endpunkte einer sichtbaren Behauptung werden Knoten, auch mit einer Notiz", () => {
    // X behauptet „Elena — Mandant Falk". Beide sind nur je einmal erwähnt,
    // und genau die Aussage zieht sie ins Bild.
    const n = netz(
      { elena: ["x"], falk: ["x"] },
      [{ source: "elena", target: "falk", relation: "mandant", memoryId: "x" }],
      ["x"]
    );
    expect(n.knoten.map((k) => k.id)).toEqual(["__ent:elena", "__ent:falk"]);
    expect(n.erwahnungen).toEqual([["x", "__ent:elena"], ["x", "__ent:falk"]]);
    expect(n.behauptungen).toEqual([
      { source: "__ent:elena", target: "__ent:falk", relation: "mandant", memoryId: "x", validFrom: null, validTo: null },
    ]);
  });

  it("eine befristete Behauptung trägt ihr Fenster mit", () => {
    // „Elena war bei Nordwind — bis Juni 2025." Der Kern speichert das seit
    // je (relations.valid_from/valid_to) und liefert es seit 343cb04 auch aus.
    // Fiel es hier raus, könnte der Regler die Aussage nicht mehr von der
    // Notiz trennen, die sie erzählt.
    const n = netz(
      { elena: ["x"], nordwind: ["x"] },
      [{ source: "elena", target: "nordwind", relation: "arbeitet bei", memoryId: "x", validFrom: 1_700_000_000_000, validTo: 1_750_000_000_000 }],
      ["x"]
    );
    expect(n.behauptungen[0].validFrom).toBe(1_700_000_000_000);
    expect(n.behauptungen[0].validTo).toBe(1_750_000_000_000);
  });

  it("ohne Fenster steht null da, nicht das Feld fehlt", () => {
    // Die App muss „unbefristet" von „diese Serverversion sagt nichts dazu"
    // unterscheiden können — derselbe Grund, warum der Kern die Felder
    // ausdrücklich null nennt.
    const n = netz({ elena: ["x"], falk: ["x"] }, [{ source: "elena", target: "falk", memoryId: "x" }], ["x"]);
    expect(Object.keys(n.behauptungen[0])).toContain("validFrom");
    expect(n.behauptungen[0].validFrom).toBeNull();
    expect(n.behauptungen[0].validTo).toBeNull();
  });

  it("eine Behauptung aus einer ausgeblendeten Notiz gilt nicht", () => {
    // Der Zeitregler und jeder Filter müssen das Netz mitnehmen: wer die
    // Notiz nicht sieht, darf ihre Aussage nicht als Kante sehen.
    const n = netz(
      { elena: ["x"], falk: ["y"] },
      [{ source: "elena", target: "falk", memoryId: "versteckt" }],
      ["x", "y"]
    );
    expect(n.behauptungen).toEqual([]);
    expect(n.knoten).toEqual([]);
  });

  it("eine Behauptung ohne beurkundende Notiz braucht beide Enden im Bild", () => {
    // memoryId null: die Relation kommt aus dem Kern, ohne dass eine Notiz sie
    // trägt. Weil keine Notiz sie trägt, kann sie auch kein Filter und kein
    // Zeitregler wieder wegnehmen — gezeichnet wird sie deshalb nur, wenn beide
    // Enden von einer sichtbaren Notiz getragen werden.
    const beide = netz({ elena: ["a", "b"], falk: ["x", "y"] }, [{ source: "elena", target: "falk", memoryId: null }], ["a", "b", "x", "y"]);
    expect(beide.behauptungen).toHaveLength(1);
    expect(beide.knoten.map((k) => k.id)).toEqual(["__ent:elena", "__ent:falk"]);

    // Je eine Notiz pro Ende: genau der Fall, den das alte Kreuzprodukt als
    // unsichtbares Notizpaar versteckte. Die Aussage ist da — sie zeichnet.
    const jeEine = netz({ elena: ["a"], falk: ["x"] }, [{ source: "elena", target: "falk", memoryId: null }], ["a", "x"]);
    expect(jeEine.behauptungen).toHaveLength(1);
    expect(jeEine.erwahnungen).toEqual([["a", "__ent:elena"], ["x", "__ent:falk"]]);

    // Ein Ende ohne sichtbare Notiz: die Kante hinge an einem Konzept, das im
    // Bild nicht vorkommt.
    const fehlt = netz({ elena: ["a"] }, [{ source: "elena", target: "falk", memoryId: null }], ["a"]);
    expect(fehlt.behauptungen).toEqual([]);
    expect(fehlt.knoten).toEqual([]);
  });

  it("dasselbe Konzept in zwei Behauptungen ist ein Knoten", () => {
    const n = netz(
      { elena: ["x"], falk: ["x"], lumen: ["x"] },
      [
        { source: "elena", target: "falk", memoryId: "x" },
        { source: "elena", target: "lumen", memoryId: "x" },
      ],
      ["x"]
    );
    expect(n.knoten).toHaveLength(3);
    expect(new Set(n.knoten.map((k) => k.id)).size).toBe(3);
    expect(n.erwahnungen.filter((e) => e[1] === "__ent:elena")).toHaveLength(1);
    expect(n.behauptungen).toHaveLength(2);
  });

  it("ein Knoten, dessen Schlüssel mit einer Notiz-ID zusammenstösst, bleibt weg", () => {
    // Der Schlüssel eines Konzepten-Knotens ist "__ent:" + Name. Eine Notiz
    // kann denselben Text als ID tragen (theoretisch, aber der Index im
    // Layout-Schritt darf nicht zwei Dinge unter einem Schlüssel kennen).
    // Ein fehlender Nabel ist besser als ein mehrdeutiger.
    const n = netz({ elena: ["__ent:elena", "b"] }, [], ["__ent:elena", "b"]);
    expect(n.knoten).toEqual([]);
    expect(n.erwahnungen).toEqual([]);
  });

  it("Reihenfolge ist deterministisch, auch bei gleicher Schreibweise", () => {
    const n = netz({ zeta: ["a", "b"], alpha: ["a", "b"] }, [], ["a", "b"]);
    expect(n.knoten.map((k) => k.label)).toEqual(["alpha", "zeta"]);
    const notizen = netz({ alpha: ["b", "a"] }, [], ["b", "a"]);
    expect(notizen.knoten[0]!.notizen).toEqual(["a", "b"]);
  });
});

// P-7, zweite Hälfte: eine Faltung im Kraftfeld darf nur nehmen, was ihr
// allein gehört. Eine Notiz, die auch einen anderen Begriff trägt, bleibt —
// sonst löscht das Zufalten einer Gruppe Belege, die woanders gelesen werden.
describe("verborgeneNotizen", () => {
  const faltung = (konzepte: Iterable<string>) => new Set(konzepte);
  const PR = "__ent:";

  it("verbirgt nur die Notizen, die genau einen gefalteten Begriff tragen", () => {
    const verborgen = verborgeneNotizen(
      { nordwind: ["a", "b", "c"], kestrel: ["c", "d"] },
      faltung([`${PR}nordwind`])
    );
    expect([...verborgen].sort()).toEqual(["a", "b"]);
  });

  it("lässt eine Notiz, die zwei Begriffe teilen, stehen, wenn beide gefaltet sind", () => {
    // „c" gehört beiden. Zwei gefaltete Gruppen dürfen sie nicht zweimal
    // verbergen — und einmal verbergen wäre auch falsch: sie wäre ja noch
    // Beleg des anderen Begriffs, der nur eben auch zu ist.
    const verborgen = verborgeneNotizen(
      { nordwind: ["a", "c"], kestrel: ["c", "d"] },
      faltung([`${PR}nordwind`, `${PR}kestrel`])
    );
    expect([...verborgen].sort()).toEqual(["a", "d"]);
  });

  it("verbirgt nichts ohne Faltung und nichts für einen Begriff, den es nicht gibt", () => {
    const belege = { nordwind: ["a", "b"] };
    expect(verborgeneNotizen(belege, faltung([])).size).toBe(0);
    expect(verborgeneNotizen(belege, faltung([`${PR}unbekannt`])).size).toBe(0);
    expect(verborgeneNotizen(undefined, faltung([`${PR}nordwind`])).size).toBe(0);
  });

  it("zählt eine Notiz mit zwei Einträgen desselben Begriffs als eine Trägerin", () => {
    const verborgen = verborgeneNotizen({ nordwind: ["a", "a"], kestrel: [] }, faltung([`${PR}nordwind`]));
    expect([...verborgen]).toEqual(["a"]);
  });
});

// P-8: eine Aussage über denselben Begriff — „Nordwind Logistics betreut Nordwind
// Logistics". Bis hierhin hart verworfen. Sie darf nur auf ausdrücklichen Wunsch
// erscheinen, und sie darf die Physik und den Grad eines Knotens nicht anfassen.
describe("Selbstkanten", () => {
  const a = note({ title: "Alpha" });
  const paare = (n: number, relation = "betreut"): [string, string, { relation: string }][] =>
    Array.from({ length: n }, () => [a.id, a.id, { relation }]);

  it("bleibt eine Selbstaussage weg, solange niemand sie verlangt", () => {
    const r = kantenBaue([a], { realPairs: paare(1) });
    expect(r.edges).toHaveLength(0);
    expect(r.selbst).toHaveLength(0);
    // Verworfen, aber nicht vergessen: die Fläche darf sagen, was ihr fehlt.
    expect(r.selbstInSumme).toBe(1);
  });

  it("mit Schalter ist sie eine eigene Kante — die Physik sieht sie nie", () => {
    const r = kantenBaue([a], { realPairs: paare(1), selbstkaanten: true });
    expect(r.edges).toHaveLength(0);
    expect(r.selbst).toHaveLength(1);
    expect(r.selbst[0].source).toBe(r.selbst[0].target);
    expect(r.selbst[0].belege).toBe(1);
    expect(r.selbst[0].relation).toBe("betreut");
    expect(r.selbstInSumme).toBe(1);
  });

  it("zwei Selbstaussagen desselben Knotens sind eine Schleife mit zwei Belegen", () => {
    const r = kantenBaue([a], {
      realPairs: [
        [a.id, a.id, { relation: "betreut" }],
        [a.id, a.id, { relation: "meldet an" }],
      ],
      selbstkaanten: true,
    });
    expect(r.selbst).toHaveLength(1);
    expect(r.selbst[0].belege).toBe(2);
    expect(r.selbst[0].typen).toBe(2);
    expect(r.selbstInSumme).toBe(2);
  });

  it("ein Selbstpaar ohne Knoten im Bild ist keine Selbstkante und keine Bilanz", () => {
    const r = kantenBaue([], { realPairs: [["__ent:geister", "__ent:geister", { relation: "betreut" }]], selbstkaanten: true });
    expect(r.selbst).toHaveLength(0);
    expect(r.selbstInSumme).toBe(0);
  });

  it("gemischte Paare: echte Kanten bleiben echt, die Schleife kommt separat", () => {
    const b = note({ title: "Beta" });
    const r = kantenBaue([a, b], {
      realPairs: [[a.id, b.id, { relation: "betreut" }], [a.id, a.id, { relation: "zweifelt" }]],
      selbstkaanten: true,
    });
    expect(r.edges).toHaveLength(1);
    expect(r.edges[0].source).not.toBe(r.edges[0].target);
    expect(r.selbst).toHaveLength(1);
  });
});

describe("selbstSchleife — wo die Schlinge sitzt", () => {
  it("sitzt oben rechts am Knoten und berührt seine Scheibe", () => {
    const s = selbstSchleife(100, 100, 20);
    expect(s.cx).toBeGreaterThan(100);
    expect(s.cy).toBeLessThan(100);
    expect(s.rad).toBeGreaterThan(0);
    const entfernung = Math.hypot(s.cx - 100, s.cy - 100);
    // Der nächste Punkt der Schlinge liegt an der Scheibe, nicht frei im Feld.
    expect(entfernung - s.rad).toBeLessThanOrEqual(20);
    expect(entfernung).toBeGreaterThan(20);
  });

  it("wächst mit dem Knoten", () => {
    const klein = selbstSchleife(0, 0, 8);
    const gross = selbstSchleife(0, 0, 24);
    expect(gross.rad).toBeGreaterThan(klein.rad);
    expect(Math.hypot(gross.cx, gross.cy)).toBeGreaterThan(Math.hypot(klein.cx, klein.cy));
  });

  it("greifen: auf dem Ring ja, in der Knotenmitte nein", () => {
    const knoten: LayoutNode = { id: "a", x: 100, y: 100, vx: 0, vy: 0, r: 20, pinned: false };
    const index = new Map([["a", knoten]]);
    const schleife: LayoutEdge = { source: "a", target: "a", strength: 0.85, real: true, belege: 1 };
    const s = selbstSchleife(knoten.x, knoten.y, knoten.r);
    expect(kanteBei(index, [schleife], s.cx + s.rad, s.cy)).toBe(schleife);
    expect(kanteBei(index, [schleife], knoten.x, knoten.y)).toBeNull();
  });
});

// #94: eine gefüllte Wissensbasis öffnete im echten Browser bei 2 % Zoom, und
// die Leinwand war leer. Nachgebaut: 400 Notizen, 420 Begriffe, jeder Titel ein
// eigener Begriff — genau das, was die App heute schreibt.
describe("Die Welt bleibt lesbar, wenn der Bestand wächst", () => {
  function sternwelt(notizen = 400, themen = 20) {
    const ids: string[] = [];
    const kanten: LayoutEdge[] = [];
    const themenNamen = Array.from({ length: themen }, (_, i) => `__ent:thema-${i}`);
    for (let i = 0; i < notizen; i++) {
      const notiz = `n${i}`;
      const titel = `__ent:titel-${i}`;
      ids.push(notiz, titel);
      kanten.push({ source: notiz, target: titel, strength: 1, real: true });
      const thema = themenNamen[i % themen];
      ids.push(thema);
      kanten.push({ source: titel, target: thema, strength: 1, real: true });
      if (i % 4 === 0) {
        kanten.push({ source: titel, target: themenNamen[(i + 1) % themen]!, strength: 1, real: true });
      }
    }
    return { ids: [...new Set(ids)], kanten };
  }

  function einfahr(sim: Simulation, runden = 900) {
    for (let i = 0; i < runden && !isSettled(sim); i++) stepSimulation(sim);
    return sim;
  }

  it("hält die Knoten in einer Welt, die der Bildschirm fassen kann", () => {
    const { ids, kanten } = sternwelt();
    const sim = einfahr(createSimulation(ids, kanten, () => 6));
    const grenzen = layoutBounds(sim.nodes, 6);
    const breite = grenzen.maxX - grenzen.minX;
    const k = fitTransform(layoutBounds(sim.nodes, randFuerAnsicht(sim.nodes)), { w: 1130, h: 710 }).k;
    // 400 Notizen sind kein Ausnahmefall. Wenn die Fläche sie bei 2 % einpasst,
    // ist nichts zu sehen — also muss die Welt in einen lesbaren Maßstab passen.
    expect(k, `Welt ist ${Math.round(breite)} Einheiten breit, Zoom ${Math.round(k * 100)} %`).toBeGreaterThan(0.2);
  });

  it("hält die Dichte über die Größenordnung hinweg gleich", () => {
    const dichte = (n: number, themen: number) => {
      const welt = sternwelt(n, themen);
      const sim = einfahr(createSimulation(welt.ids, welt.kanten, () => 6));
      const g = layoutBounds(sim.nodes);
      return sim.nodes.length / ((g.maxX - g.minX) * (g.maxY - g.minY));
    };
    expect(dichte(800, 20) / dichte(100, 10), "die Dichte fällt mit der Größe ins Bodenlose").toBeGreaterThan(0.2);
  });

  it("explodiert nicht, wenn ein Begriff viele Notizen trägt", () => {
    // Der Befund von 400 Notizen: der Begriff mit zwanzig Blättern wurde in
    // jedem Bild schneller — 1,7e3, 4,7e3, 1,1e4 — und die Welt endete bei
    // 4,5e13 Einheiten. Zwanzig Federn an einem Knoten dürfen kein System sein,
    // das pro Bild um den Faktor zwei wächst.
    const welt = sternwelt(400, 20);
    const sim = createSimulation(welt.ids, welt.kanten, () => 6);
    const anfang = layoutBounds(sim.nodes);
    const weltBreite = anfang.maxX - anfang.minX;
    let vorher = sim.nodes.map((k) => [k.x, k.y] as const);
    const sprünge: number[] = [];
    for (let schritt = 0; schritt < 300; schritt++) {
      stepSimulation(sim);
      let sprung = 0;
      for (let i = 0; i < sim.nodes.length; i++) {
        sprung = Math.max(sprung, Math.hypot(sim.nodes[i]!.x - vorher[i]![0], sim.nodes[i]!.y - vorher[i]![1]));
      }
      vorher = sim.nodes.map((k) => [k.x, k.y] as const);
      sprünge.push(sprung);
      // Kein Bild wirft einen Knoten um mehr als ein Fünftel der Welt.
      expect(sprung, `Bild ${schritt}: ${sprung.toExponential(2)} auf einmal`).toBeLessThan(weltBreite * 0.2);
      // Und die Welt darf atmen, aber nicht wachsen.
      const g = layoutBounds(sim.nodes);
      expect(g.maxX - g.minX, `Bild ${schritt}: die Welt ist auf ${(g.maxX - g.minX).toExponential(2)} angewachsen`).toBeLessThan(weltBreite * 2);
    }
    const mittel = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
    // Sie kommt zur Ruhe: die letzten zwanzig Bilder bewegen weniger als die
    // ersten zwanzig. Wer wächst statt zu stehen, hat keine Anordnung.
    expect(mittel(sprünge.slice(-20)), `die letzten Bilder bewegen mehr (${mittel(sprünge.slice(-20)).toFixed(1)} gegen ${mittel(sprünge.slice(0, 20)).toFixed(1)})`).toBeLessThan(mittel(sprünge.slice(0, 20)));
  });

  it("bleibt bei dreitausend Knoten in einer Welt, die der Bildschirm fassen kann", () => {
    const welt = sternwelt(1500, 30);
    const sim = einfahr(createSimulation(welt.ids, welt.kanten, () => 6));
    const k = fitTransform(layoutBounds(sim.nodes, randFuerAnsicht(sim.nodes)), { w: 1130, h: 710 }).k;
    expect(k, `Zoom ${Math.round(k * 100)} % bei ${sim.nodes.length} Knoten`).toBeGreaterThan(0.2);
  });
});

// P-13: die Regler. Obsidian lässt Abstoßung, Link-Distanz und Knotengröße am
// Zug einstellen; bei KEPTA standen die drei Werte als Konstanten im Code. Ein
// Regler, der die gestimmten Werte nicht unverändert lässt, wenn er in der
// Mitte steht, ist keine Einstellung, sondern eine zweite Physik.
describe("Die Krafteinstellung stimmt, was sie verspricht", () => {
  function welt(notizen = 60, themen = 6) {
    const ids: string[] = [];
    const kanten: LayoutEdge[] = [];
    const T = Array.from({ length: themen }, (_, i) => `__ent:thema-${i}`);
    for (let i = 0; i < notizen; i++) {
      const n = `n${i}`;
      ids.push(n);
      ids.push(T[i % themen]!);
      kanten.push({ source: n, target: T[i % themen]!, strength: 1, real: true });
    }
    return { ids: [...new Set(ids)], kanten };
  }
  function breite(sim: Simulation, runden = 900) {
    for (let i = 0; i < runden; i++) stepSimulation(sim);
    const g = layoutBounds(sim.nodes);
    return g.maxX - g.minX;
  }

  it("lässt bei unverstellten Reglern die gestimmten Konstanten stehen", () => {
    const w = welt();
    const a = createSimulation(w.ids, w.kanten, () => 6);
    const b = createSimulation(w.ids, w.kanten, () => 6, { abstossung: 1, gravitaet: 1, link: 1 });
    for (let i = 0; i < 200; i++) { stepSimulation(a); stepSimulation(b); }
    expect(b.nodes.map((n) => [n.x, n.y])).toEqual(a.nodes.map((n) => [n.x, n.y]));
    expect(b.ruheLaenge).toBe(a.ruheLaenge);
  });

  it("rückt die Welt zusammen, wer die Link-Distanz verkürzt", () => {
    const w = welt();
    const kurz = breite(createSimulation(w.ids, w.kanten, () => 6, { link: 0.4 }));
    const lang = breite(createSimulation(w.ids, w.kanten, () => 6, { link: 2 }));
    expect(kurz).toBeLessThan(lang * 0.9);
  });

  it("stellt die Welt nicht härter zusammen, als die Knoten sich berühren dürfen", () => {
    // Die Kollision ist eine harte Randbedingung ohne Regler: sie darf durch
    // einen Link-Regler nicht unter die Knotengröße gequetscht werden.
    const w = welt();
    const sim = createSimulation(w.ids, w.kanten, () => 12, { link: 0.05 });
    for (let i = 0; i < 260; i++) stepSimulation(sim);
    let naeste = Infinity;
    for (let i = 0; i < sim.nodes.length; i++) {
      for (let j = i + 1; j < sim.nodes.length; j++) {
        naeste = Math.min(naeste, Math.hypot(sim.nodes[i]!.x - sim.nodes[j]!.x, sim.nodes[i]!.y - sim.nodes[j]!.y));
      }
    }
    expect(naeste).toBeGreaterThanOrEqual(24 - 1e-6);
  });

  it("lässt die Startlage von den Reglern unberührt", () => {
    // Sunflower: deterministisch, und zwar unabhängig davon, wie jemand später
    // an den Reglern dreht — sonst wäre dieselbe Wissensbasis zwei Bilder.
    const w = welt();
    const a = createSimulation(w.ids, w.kanten, () => 6, { abstossung: 3, link: 0.2, gravitaet: 0.3 });
    const b = createSimulation(w.ids, w.kanten, () => 6);
    expect(a.nodes.map((n) => [n.x, n.y])).toEqual(b.nodes.map((n) => [n.x, n.y]));
  });
});

// Das Feld hielt bisher an, wenn alpha auswar, nicht wenn es zur Ruhe kam:
// ALPHA_MIN=0,006 und ALPHA_DECAY=1,65 % pro Bild geben ~300 Bilder — bei einer
// Anfangsspirale von 750 Einheiten reicht das nicht, um das Gleichgewicht zu
// erreichen. Sichtbar war das als Knäuel, und ein Regler, der die Abstossung
// verdoppelt, änderte die Welt um 4 %. Also: vorspannen, dann zeigen.
describe("Das Feld wird vorgespannt, bevor es zeigt", () => {
  function welt(notizen: number, themen: number) {
    const ids: string[] = [];
    const kanten: LayoutEdge[] = [];
    const T = Array.from({ length: themen }, (_, i) => `__ent:thema-${i}`);
    for (let i = 0; i < notizen; i++) {
      ids.push(`n${i}`, T[i % themen]!);
      kanten.push({ source: `n${i}`, target: T[i % themen]!, strength: 1, real: true });
    }
    return { ids: [...new Set(ids)], kanten };
  }

  it("kennt eine Vorspannung, die das Bild nicht mehr fliegen lässt", () => {
    const w = welt(60, 6);
    const sim = createSimulation(w.ids, w.kanten, () => 6);
    const vorher = layoutBounds(sim.nodes);
    vorspannen(sim, 120);
    const nachher = layoutBounds(sim.nodes);
    // Vorspannung bewegt: die Welt ordnet sich, bevor das erste Bild zeichnet.
    expect(nachher.maxX - nachher.minX).not.toBe(vorher.maxX - vorher.minX);
    // Und sie ist deterministisch: dieselbe Rechnung, dasselbe Ergebnis.
    const zweite = createSimulation(w.ids, w.kanten, () => 6);
    vorspannen(zweite, 120);
    expect(zweite.nodes.map((n) => [n.x, n.y])).toEqual(sim.nodes.map((n) => [n.x, n.y]));
  });

});

// #95: Was ein gutes Bild ist, wird gemessen, bevor an Zahlen gedreht wird.
//
// Zwei Haufen, die nichts teilen, müssen im Bild *auseinander* stehen — sonst
// liest die Fläche als ein Knäuel, egal wie viele Notizen sie trägt. Der Maßstab
// ist die eigene Ausdehnung der Haufen, nicht eine absolute Zahl: was zählt, ist
// der Abstand der Schwerpunkte gegen die Breite eines Haufens.
describe("Zwei Haufen, die nichts teilen, stehen auseinander", () => {
  function zweiHaufen(groesse = 12) {
    const ids: string[] = ["__ent:a", "__ent:b"];
    const kanten: LayoutEdge[] = [];
    for (let i = 0; i < groesse; i++) {
      ids.push(`a${i}`, `b${i}`);
      kanten.push({ source: `a${i}`, target: "__ent:a", strength: 1, real: true });
      kanten.push({ source: `b${i}`, target: "__ent:b", strength: 1, real: true });
    }
    return { ids, kanten };
  }
  function maß(sim: Simulation) {
    const schwerp = (prae: string) => {
      const knoten = sim.nodes.filter((n) => n.id.startsWith(prae));
      return {
        x: knoten.reduce((s, n) => s + n.x, 0) / knoten.length,
        y: knoten.reduce((s, n) => s + n.y, 0) / knoten.length,
      };
    };
    const a = schwerp("a");
    const b = schwerp("b");
    const streuung = (prae: string, mittig: { x: number; y: number }) =>
      sim.nodes.filter((n) => n.id.startsWith(prae)).reduce((s, n) => s + Math.hypot(n.x - mittig.x, n.y - mittig.y), 0) /
      sim.nodes.filter((n) => n.id.startsWith(prae)).length;
    const weit = Math.hypot(b.x - a.x, b.y - a.y);
    const eng = Math.max(streuung("a", a), streuung("b", b));
    const g = layoutBounds(sim.nodes);
    return {
      trennung: weit / eng,
      abstand: weit,
      weite: eng,
      zoom: fitTransform({ minX: g.minX, minY: g.minY, maxX: g.maxX, maxY: g.maxY }, { w: 1130, h: 710 }).k,
    };
  }
  function feld(krafte?: SimKrafte) {
    const w = zweiHaufen();
    const sim = createSimulation(w.ids, w.kanten, () => 6, krafte);
    vorspannen(sim, 900);
    return maß(sim);
  }

  it("stellt die Schwerpunkte mindestens eine Haufenbreite auseinander", () => {
    const m = feld();
    expect(m.trennung, `Trennung ${m.trennung.toFixed(2)} — die Haufen liegen ineinander`).toBeGreaterThanOrEqual(1);
  });

  it("hält die Welt in einem Maßstab, der die Knoten zeigt", () => {
    const m = feld();
    expect(m.zoom, `Zoom ${Math.round(m.zoom * 100)} % — zu weit weg, um etwas zu lesen`).toBeGreaterThan(0.25);
  });

  it("rückt die Haufen mit jedem Schritt der Abstoßung weiter auseinander", () => {
    // Der Regler, der auf diese Kurve gesetzt wird, darf keine Stelle haben, an
    // der er nichts bewegt — und keine, an der er rückwärts bewegt. Gemessen
    // wird der absolute Abstand der Schwerpunkte, nicht das Verhältnis: bei
    // schwacher Abstoßung ziehen die Federn die Haufen enger zusammen, und das
    // Verhältnis wächst, obwohl nichts weiter weg gerückt ist.
    const stufen = [0.5, 1, 2, 4, 8];
    const kurve = stufen.map((stufe) => feld({ abstossung: stufe }).abstand);
    for (let i = 1; i < kurve.length; i++) {
      expect(kurve[i], `Abstoßung ${stufen[i]}×: ${kurve.map((k) => k.toFixed(0)).join(" → ")}`).toBeGreaterThan(kurve[i - 1]! * 1.05);
    }
  });
});

// P-13: Die Regler dürfen die Welt nicht neu bauen. Wer an der Abstoßung dreht,
// will sehen, wie das bestehende Bild sich setzt — nicht, dass die Knoten an
// ihren Start zurückfallen und die Kamera springt.
describe("Die Regler verstellen ein laufendes Feld, ohne die Welt neu zu bauen", () => {
  function welt() {
    const ids: string[] = ["__ent:a", "__ent:b", "__ent:c"];
    const kanten: LayoutEdge[] = [];
    for (let i = 0; i < 30; i++) {
      const n = `n${i}`;
      ids.push(n);
      kanten.push({ source: n, target: ids[i % 3]!, strength: 1, real: true });
    }
    return { ids, kanten };
  }
  function stehend(krafte?: SimKrafte) {
    const w = welt();
    const sim = createSimulation(w.ids, w.kanten, () => 7, krafte);
    vorspannen(sim, 900);
    return sim;
  }

  it("setzt Kraft und Ruhelänge auf dieselbe Simulation", () => {
    const sim = stehend();
    const vorher = sim.nodes.map((n) => [n.x, n.y]);
    setzeKrafte(sim, { abstossung: 2, link: 0.5 });
    expect(sim.krafte).toEqual({ abstossung: 2, link: 0.5 });
    expect(sim.ruheLaenge).toBeCloseTo(IDEAL_LINK * 0.5, 6);
    expect(sim.nodes.map((n) => [n.x, n.y])).toEqual(vorher);
  });

  it("heizt das Feld an, sonst rührt der Regler nichts", () => {
    const sim = stehend();
    expect(isSettled(sim), "ohne Regler darf das Feld stehen").toBe(true);
    setzeKrafte(sim, { abstossung: 4 });
    expect(isSettled(sim), "der Regler hat nichts angestoßen").toBe(false);
    expect(sim.alpha).toBeGreaterThanOrEqual(0.3);
  });

  it("gibt die Knotengröße der Welt, nicht der Welt die Knotengröße", () => {
    // Größere Knoten dürfen nicht ineinander stehen: die Kollision ist die
    // harte Grenze, und sie gilt auch dem Regler. Gelöst wird sie aber vom
    // Feld, nicht vom Setzen — die Welt bleibt erst stehen, wo sie war.
    const sim = stehend();
    const vorher = sim.nodes.map((n) => [n.x, n.y]);
    setzeKnotenGroesse(sim, () => 16);
    expect(sim.nodes.every((n) => n.r === 16)).toBe(true);
    expect(sim.nodes.map((n) => [n.x, n.y]), "der Regler hat die Welt verrückt").toEqual(vorher);
    expect(isSettled(sim), "das Feld muss mit den neuen Radien weiterarbeiten").toBe(false);
    vorspannen(sim, 400);
    let naeste = Infinity;
    for (let i = 0; i < sim.nodes.length; i++) {
      for (let j = i + 1; j < sim.nodes.length; j++) {
        naeste = Math.min(naeste, Math.hypot(sim.nodes[i]!.x - sim.nodes[j]!.x, sim.nodes[i]!.y - sim.nodes[j]!.y));
      }
    }
    expect(naeste, `Knoten stehen sich auf ${naeste.toFixed(1)} gegenüber`).toBeGreaterThanOrEqual(32 + COLLIDE_PADDING - 0.001);
  });

  it("unverstellt lässt das Feld stehen, wie es war", () => {
    const a = stehend();
    const b = stehend();
    setzeKrafte(b, {});
    setzeKnotenGroesse(b, (id) => {
      const knoten = a.index.get(id)!;
      return knoten.r;
    });
    expect(b.ruheLaenge).toBe(a.ruheLaenge);
    expect(b.nodes.map((n) => [n.x, n.y, n.r])).toEqual(a.nodes.map((n) => [n.x, n.y, n.r]));
  });
});
