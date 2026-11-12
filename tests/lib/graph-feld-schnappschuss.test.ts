// @vitest-environment jsdom
//
// P197 (Damian, 23:47): „der Graph bugt wenn man mehrere Knoten zieht und die
// kleinen Knoten auch und dann wenn man auf Release pinned drückt wird nicht
// alles wie davor."
//
// Zwei Befunde, zwei Heilungen:
//
//   1. Der Kollisionsschub: ein angehefteter (gezogener) Knoten schob freie
//      Nachbarn um den VOLLEN Überlappung — das Feld zersprang um den Griff.
//      Der Schub ist jetzt gedämpft (0,6 je Durchgang); dieselbe Überlappung
//      löst sich über mehrere Rahmen auf.
//
//   2. „Release pinned" kehrte nur bei den GEZOGENEN Knoten heim — die von der
//      Kollision verdrängten Nachbarn blieben verdrängt. Der Feld-Schnappschuss
//      friert beim ersten Griff das ganze Bild ein; die Lösung stellt ALLES
//      wieder her. Danach ist das Feld buchstäblich „wie davor".

import { describe, it, expect } from "vitest";
import {
  createSimulation,
  feldSchnappschuss,
  feldZurueck,
  type LayoutNode,
} from "../../src/lib/graphLayout";

function feld(anzahl: number, radius = 6) {
  return createSimulation(
    Array.from({ length: anzahl }, (_, i) => `k${i + 1}`),
    [],
    () => radius,
  );
}

function knoten(sim: ReturnType<typeof createSimulation>, id: string): LayoutNode {
  const n = sim.index.get(id)!;
  expect(n, `Knoten ${id} fehlt`).toBeDefined();
  return n;
}

describe("P197: der Feld-Schnappschuss stellt ALLES wieder her", () => {
  it("gibt auch die verdrängten Nachbarn ihren Platz zurück", () => {
    const sim = feld(4);
    const anfang = new Map(sim.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
    // Der erste Griff friert das Feld ein ...
    const stand = feldSchnappschuss(sim);
    // ... dann ziehen zwei Knoten UND ein Unbeteiligter wird von der Kollision
    // verdrängt (sein Platz ändert sich, ohne dass ihn jemand angefasst hat).
    const a = knoten(sim, "k1");
    const b = knoten(sim, "k2");
    const c = knoten(sim, "k3");
    a.x += 500;
    a.pinned = true;
    b.x -= 300;
    b.pinned = true;
    c.y += 120; // die Kollision hat ihn geschoben
    const d = knoten(sim, "k4");
    d.x += 40; // auch er rückte, ohne gegriffen zu werden

    const heim = feldZurueck(sim, stand);
    expect(heim).toBe(4);
    for (const n of sim.nodes) {
      const soll = anfang.get(n.id)!;
      expect(n.x, `${n.id} kehrte nicht in seine Breite zurück`).toBe(soll.x);
      expect(n.y, `${n.id} kehrte nicht in seine Höhe zurück`).toBe(soll.y);
      expect(n.pinned, `${n.id} blieb angeheftet`).toBe(false);
    }
  });

  it("räumt die gemerkten Ursprünge mit auf — keine halbe Erinnerung", () => {
    const sim = feld(3);
    const a = knoten(sim, "k1");
    const stand = feldSchnappschuss(sim);
    a.ursprung = { x: a.x + 10, y: a.y };
    feldZurueck(sim, stand);
    expect(a.ursprung, "ein alter Ursprung überlebte die Wiederherstellung").toBeUndefined();
  });

  it("setzt nur Knoten, die der Schnappschuss kennt", () => {
    const sim = feld(3);
    const stand = feldSchnappschuss(sim);
    // Der Bestand wächst (Filterwechsel, Import): der neue Knoten hat keinen
    // Platz im alten Bild — er bleibt, wo er ist.
    const neu = knoten(feld(1), "k1");
    neu.id = "k9";
    sim.nodes.push(neu);
    sim.index.set("k9", neu);
    neu.x = 777;
    const heim = feldZurueck(sim, stand);
    expect(heim, "die Wiederherstellung zählte Knoten ohne Platz im Bild").toBe(3);
    expect(neu.x).toBe(777);
  });
});
