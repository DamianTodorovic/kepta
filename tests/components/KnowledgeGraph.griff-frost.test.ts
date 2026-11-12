import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// P200 (Damian, 12.11.2026): „er geht zurück, aber wenn ich einen Knoten, den
// ich weggezogen habe, gedrückt halte, bewegen sich die anderen auch."
//
// Der Griff hält den Knoten über draggingRef — und genau solange taktete die
// Bildschleife den SIM zwangsläufig weiter (`bewegt = … || draggingRef !==
// null`): die Kollision schob jeden Bild die Nachbarn vom gehaltenen Knoten
// weg, die Feder zog verkettete Nachbarn hin und her. Der Vertrag jetzt:
// WÄHREND des Griffs steht das Kraftfeld — nur der gezogene Knoten folgt der
// Hand (onPointerMove setzt seine Stelle direkt). Erst das Loslassen gibt das
// Feld wieder frei. „Release pinned" stellt danach alles wie eingefroren
// wieder (P197-Schnappschuss).

const quelltext = fs.readFileSync(path.join(process.cwd(), "src/components/KnowledgeGraph.tsx"), "utf8");

describe("P200: der Griff friert das Feld (Griff-Frost)", () => {
  it("taktet die Bildschleife nicht mehr, solange ein Knoten gehalten wird", () => {
    // Die alte Zeile holte den Physik-Takt in den Griff hinein:
    expect(quelltext, "die Bildschleife taktet noch in den Griff hinein").not.toMatch(
      /\|\| draggingRef\.current !== null/,
    );
    // Der Frost-Zweig steht VOR dem Physik-Takt und trägt den Vertrag:
    expect(quelltext).toMatch(/} else if \(draggingRef\.current !== null\) \{[\s\S]{0,700}P200/);
  });

  it("malt das Bild bei Griff und Zug von Hand, nicht aus dem Takt", () => {
    // Der Griff meldet den neuen Zustand (Anheft-Ring) einmalig der Leinwand —
    // vorher lief die Nachmalerei über den Zwangstakt des Griffs:
    expect(quelltext).toMatch(
      /draggingRef\.current = treffer;[\s\S]{0,1600}zeichneNoetig\.current = true;/,
    );
  });
});
