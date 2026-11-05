// Die Kantenregel fuer Titel, an beiden Malstrassen -- und mit dem Unterschied
// zwischen mittig und linksbuendig, gemessen an den zwei Wegen in KnowledgeGraph.tsx.
//
// Anlass, gemessen 5.11. 14:16:51 MEZ am ausgelieferten 3.2.158 bei 390 x 844: die
// aeusserste Pixelreihe des Graph-Bildes traegt Tinte an "rechts", die Flaeche meldete
// als Beschnitt nur "links" (Bild: graph-30-notizen-390px.png, 716 x 1248 Geraete-Pixel).
// Die Tinte war drei Laeufe von 2 bis 3 Pixeln Hoehe um y 255 bis 267, Farben
// 142,141,138 und 164,163,157 -- Textgrau, keine Scheibe. Der Geruest-Weg (Baum-Ebenen)
// rechnete sein `mitteX` ohne die Kantenregel, die der Inhaltsweg direkt unter ihm faehrt.
//
// Die Bisse sind die zwei Richtungen, in denen ein Titel durch die Kante laeuft:
// ein langer Namen, der mittig nicht mehr fasst, und ein linksbuendiger Namen, dessen
// ENDE ueber die Kante laeuft, obwohl sein Anfang dentro ist.
import { describe, it, expect } from "vitest";
import { titelKante, TITEL_KANTEN_PX } from "../src/components/KnowledgeGraph";

describe("Titel an der Kante: die Kante haelt das Wort, nicht der Zufall", () => {
  it("ein freier Titel bleibt, wo er steht", () => {
    expect(titelKante(100, 40, 716, TITEL_KANTEN_PX)).toBe(100);
  });

  it("mittig: ueber die rechte Kante wird das Wort in das Bild zurueckgeklemmt", () => {
    const x = titelKante(700, 120, 716, TITEL_KANTEN_PX)!;
    expect(x + 120 / 2).toBeLessThanOrEqual(716 - TITEL_KANTEN_PX);
  });

  it("Biss linksbuendig: der Anfang passt, das Ende laeuft ueber die Kante", () => {
    // 600 + 100 = 700 <= 716, aber die Kantenluft fehlt: 700 + 100 = 800 ueber dem Rand.
    const x = titelKante(690, 100, 716, TITEL_KANTEN_PX, "links")!;
    expect(x).not.toBeNull();
    expect(x + 100).toBeLessThanOrEqual(716 - TITEL_KANTEN_PX);
    // Dieselbe Zahl nach der MITTELS-Regel (sie haelt die Mitte, nicht das Ende):
    // 655. Als linksbuendiger Anfang gelesen endet das Wort bei 755 -- 50 Pixel
    // durch die Kante. Genau das war der Befund am Geruest-Weg, der linksbuendig
    // malt und bisher gar keine Kantenrechnung hatte.
    const mittig = titelKante(690, 100, 716, TITEL_KANTEN_PX)!;
    expect(mittig).toBe(716 - 100 / 2 - TITEL_KANTEN_PX);
    expect(mittig + 100).toBeGreaterThan(716 - TITEL_KANTEN_PX);
  });

  it("Biss: ein Wort, das selbst mittig nicht in das Bild fasst, faellt (null)", () => {
    expect(titelKante(10, 700, 716, TITEL_KANTEN_PX)).toBeNull();
    expect(titelKante(10, 700, 716, TITEL_KANTEN_PX, "links")).toBeNull();
  });

  it("linksbuendig: die linke Kante haelt ebenso", () => {
    expect(titelKante(-40, 100, 716, TITEL_KANTEN_PX, "links")).toBe(TITEL_KANTEN_PX);
  });
});
