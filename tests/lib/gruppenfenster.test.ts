import { describe, expect, it } from "vitest";
import { sichtbareGruppen } from "../../src/lib/gruppenfenster";

/* Punkt 7, die Gruppen-Liste: "The list groups by file, by kind or by period, and *Load more*
   never cuts a group in half" steht in README.md. bis zu diesem Schnitt war die Regel nur im
   Baum lesbar (src/components/Dashboard.tsx:1405-1419) — kein Fall fuhr sie. Ein Fenster, das
   eine 5-teilige Akte auf 3 Kuerzt, sieht fuer einen Nutzer wie ein Bug aus, und die Liste
   verspricht das Gegenteil. */
const g = (n: string, groesse: number) => ({ name: n, memories: Array.from({ length: groesse }, (_, i) => ({ id: `${n}-${i}` })) });

describe("das Gruppenfenster schliesst Gruppen, es schneidet sie nicht", () => {
  it("ein Fenster, das in eine Gruppe faellt, nimmt die ganze Gruppe", () => {
    const gruppen = [g("a", 3), g("b", 5), g("c", 2)];
    const sichtbare = sichtbareGruppen(gruppen, 4);
    expect(sichtbare.map((x) => x.name)).toEqual(["a", "b"]);
    expect(sichtbare.flatMap((x) => x.memories).length, "eine Gruppe wurde halbiert").toBe(8);
  });

  it("die erste Gruppe erscheint immer, auch wenn sie ueber das Fenster hinauslaeuft", () => {
    const sichtbare = sichtbareGruppen([g("riesig", 500), g("klein", 1)], 20);
    expect(sichtbare.map((x) => x.name)).toEqual(["riesig"]);
  });

  it("ein exaktes Fenster zeigt keine zusatzliche Gruppe", () => {
    const sichtbare = sichtbareGruppen([g("a", 6), g("b", 6)], 6);
    expect(sichtbare.map((x) => x.name)).toEqual(["a"]);
  });

  it("ein Fenster groesser als der Bestand zeigt alles, ohne zu erfinden", () => {
    const gruppen = [g("a", 1), g("b", 2)];
    expect(sichtbareGruppen(gruppen, 999).map((x) => x.name)).toEqual(["a", "b"]);
  });

  it("ohne Gruppen gibt es nichts zu zeigen — und kein Absturz", () => {
    expect(sichtbareGruppen([], 20)).toEqual([]);
  });

  it("die Reihenfolge bleibt die des Bestands", () => {
    const gruppen = [g("z", 1), g("m", 1), g("a", 1)];
    expect(sichtbareGruppen(gruppen, 2).map((x) => x.name)).toEqual(["z", "m"]);
  });
});
