// Der Titel-Etat als Satz (#5, offene Liste 15.10.). Die Zahl der Namenlosen
// malt der Mal-Pass — aber der Satz, der sie erklaert, ist reine Rechnung und
// wird hier ohne Leinwand geprueft: jede Grundklasse, ihre Kleiderordnung, und
// die zwei Faelle, in denen die Flaeache zu Recht schweigt.
import { describe, it, expect } from "vitest";
import { titelEtat } from "../../src/components/KnowledgeGraph";

/** Alle sechs Gruende, wie der Mal-Pass sie setzt — in seiner Reihenfolge. */
const ALLE_GRUENDE: [number, string][] = [
  [30, "faded by the filter or the pointer"],
  [8, "in rows too tight for a title"],
  [40, "too small for a name at this zoom"],
  [260, "over the 140 names this picture allows"],
  [5, "a title wider than its row"],
  [36, "crowded out by a name already there"],
];

describe("titelEtat", () => {
  it("schweigt, wenn jeder Knoten im Bild einen Titel traegt", () => {
    expect(titelEtat(20, 20, [])).toBe("");
    expect(titelEtat(21, 20, ALLE_GRUENDE), "ein Bild kann nicht mehr benennen als es hat").toBe("");
  });

  it("zaehlt benannte, namenlose und gruende in einem Satz", () => {
    const satz = titelEtat(21, 400, ALLE_GRUENDE);
    expect(satz).toBe(
      "21 of 400 notes in this picture carry a title · 379 stayed nameless: " +
        "30 faded by the filter or the pointer, " +
        "8 in rows too tight for a title, 40 too small for a name at this zoom, " +
        "260 over the 140 names this picture allows, 5 a title wider than its row, " +
        "36 crowded out by a name already there"
    );
    const summe = ALLE_GRUENDE.reduce((s, [n]) => s + n, 0);
    expect(summe, "die Rechnung dieses Falls muss zum Umfang passen").toBe(379);
  });

  it("kennt nur Gruende, die etwas mit dem Namen zu tun haben", () => {
    const worte = ALLE_GRUENDE.map(([, w]) => w).join(" | ");
    expect(worte, "ein Knoten, der ausserhalb liegt, ist keine versaeumte Namensfrage").not.toMatch(/screen/);
  });

  it("laesst Grundklassen weg, die an diesem Bild nichts auszusagen haben", () => {
    const satz = titelEtat(21, 400, [
      [0, "faded by the filter or the pointer"],
      [379, "over the 140 names this picture allows"],
      [0, "crowded out by a name already there"],
    ]);
    expect(satz).toBe(
      "21 of 400 notes in this picture carry a title · 379 stayed nameless: 379 over the 140 names this picture allows"
    );
  });

  it("kennt die Zahl der Namenlosen auch ohne jeden Grund — der Modus will so", () => {
    expect(titelEtat(1, 400, [])).toBe("1 of 400 notes in this picture carry a title");
  });

  it("kleidet Mengen in derselben Schreibweise wie die Bilanz", () => {
    const satz = titelEtat(18, 729, [[711, "too small for a name at this zoom"]]);
    expect(satz).toBe(
      "18 of 729 notes in this picture carry a title · 711 stayed nameless: 711 too small for a name at this zoom"
    );
  });

  it("ertraegt einen einzigen Namenlosen, ohne den Satz zu verbiegen", () => {
    expect(titelEtat(2, 3, [[1, "crowded out by a name already there"]])).toBe(
      "2 of 3 notes in this picture carry a title · 1 stayed nameless: 1 crowded out by a name already there"
    );
  });
});
