import { describe, it, expect } from "vitest";
import {
  createSimulation,
  reuseSimulation,
  merkUrsprung,
  loeseKnoten,
  type LayoutNode,
} from "../../src/lib/graphLayout";

// Die Klage vom 13.10. abends, wörtlich: „wenn ich ein Knoten wegziehe und dann
// oben rechts Release one pinned drücke passiert garnichts und der knoten geht
// nicht an seinen ursprünglichen Punkt zurück."
//
// Beides ist am Quelltext nachsehbar, bevor irgendetwas läuft:
// - `KnowledgeGraph.tsx:3129-3136` (`loeseAlle`) setzt nur `pinned = false` und
//   heizt die Physik an. Es gibt nirgends eine gemerkte Ausgangslage:
//   `LayoutNode` (`graphLayout.ts:27-37`) kennt x, y, vx, vy, r, pinned — kein
//   Ursprung. „Zurück" heißt also „wieder der Physik gehören", nicht „wieder da
//   sein, wo ich ihn weggenommen habe".
// - Dass dabei nichts Sichtbares passiert, ist dieselbe Rechnung wie die
//   Lesbarkeit: bei 14 702 Knoten steht die Kamera auf etwa 5 % (Spirale
//   `SPACING = 92`, `initialPositions` Radius = 46·√n, `fitTransform`), ein
//   Knotenradius ist 4·0,05 ≈ 0,2 px. Bewegungen von einigen Welteinheiten sind
//   auf dem Schirm unter einem Bildpunkt.
//
// entschieden, weil: der Knopf verspricht einen Weg zurück, also muss es einen
// geben. Der Default ist „beim ERSTEN Griff pro Knoten merken, beim Lösen
// dorthin zurück" — nicht „die Physik entscheidet neu", denn genau das ist der
// jetzige Zustand, über den geklagt wird.

function zweiKnoten() {
  return createSimulation(["a", "b"], [], () => 6);
}

function knoten(sim: ReturnType<typeof createSimulation>, id: string): LayoutNode {
  const n = sim.index.get(id)!;
  expect(n, `Knoten ${id} fehlt im Index`).toBeDefined();
  return n;
}

describe("Ursprung: der Weg zurück ist eine gemerkte Stelle, kein Neuanfang", () => {
  it("stellt beim Lösen die Stelle des ersten Griffs wieder her", () => {
    const sim = zweiKnoten();
    const a = knoten(sim, "a");
    const anfang = { x: a.x, y: a.y };

    a.pinned = true;
    merkUrsprung(sim, "a");
    a.x += 400;
    a.y -= 250;

    const rueckweg = loeseKnoten(sim, "a");
    expect(rueckweg).toBeCloseTo(Math.hypot(400, 250), 6);
    expect(a.x).toBe(anfang.x);
    expect(a.y).toBe(anfang.y);
    expect(a.pinned).toBe(false);
    expect([a.vx, a.vy]).toEqual([0, 0]);
  });

  it("überschreibt der zweite Griff den gemerkten Ursprung nicht", () => {
    // Zwei Griffe an demselben Knoten: zurück heißt zurück an den Anfang, nicht
    // an die Stelle, an der ich ihn zuletzt abgelegt habe.
    const sim = zweiKnoten();
    const a = knoten(sim, "a");
    const anfang = { x: a.x, y: a.y };

    merkUrsprung(sim, "a");
    a.x = anfang.x + 120;
    loeseKnoten(sim, "a");

    merkUrsprung(sim, "a");
    a.x = anfang.x + 900;
    loeseKnoten(sim, "a");

    expect(a.x).toBe(anfang.x);
    expect(a.y).toBe(anfang.y);
  });

  it("meldet 0 für einen Knoten, der nie gegriffen wurde", () => {
    // Die Knopfwahrheit: „Release N pinned" darf nur so viele zählen, wie auch
    // eine zurückgehbare Stelle haben. Ein Knoten, den niemand angefasst hat,
    // hat nichts zu versprechen.
    const sim = zweiKnoten();
    const b = knoten(sim, "b");
    const anfang = { x: b.x, y: b.y };
    expect(loeseKnoten(sim, "b")).toBe(0);
    expect(b.x).toBe(anfang.x);
    expect(b.y).toBe(anfang.y);
  });

  it("nimmt der Ursprung einen Simulations-Neubau mit", () => {
    // Der Filterwechsel baut die Simulation neu (`KnowledgeGraph.tsx:1672` hängt
    // an der Knotenmenge, `:1698` ruft `reuseSimulation`). `reuseSimulation`
    // übernimmt bisher genau x, y, vx, vy, pinned (`graphLayout.ts:842`) — alles,
    // was nicht in dieser Liste steht, ist beim nächsten Tippen im Suchfeld weg,
    // und der Knopf wäre wieder wirkungslos.
    const sim = zweiKnoten();
    const a = knoten(sim, "a");
    const anfang = { x: a.x, y: a.y };
    merkUrsprung(sim, "a");
    a.x = anfang.x + 300;

    const neu = reuseSimulation(sim, ["a", "b", "c"], [], () => 6);
    const uebernommen = neu.index.get("a")!;
    expect(uebernommen.x).toBe(anfang.x + 300);
    expect(loeseKnoten(neu, "a")).toBeCloseTo(300, 6);
    expect(uebernommen.x).toBe(anfang.x);
  });
});
