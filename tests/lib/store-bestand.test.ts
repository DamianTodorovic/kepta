// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { bestandGroesse, seiteIstBegrenzt, refreshMemories } from "../../src/lib/store";

// Die Sperre, die die Leitung gesetzt hat: keine Fläche darf ihre Seitenlänge
// als Größe des Bestands ausgeben. `src/lib/store.ts` ist die einzige Stelle,
// die die Antwort der Tür liest — darum wird sie hier gehalten, und zwar mit
// einem Fall, der **rot wird, wenn `x-kepta-total` fehlt**: nicht mit einem
// Kommentar, der das Verhalten nur beschreibt.

function antwort(koepfe: Record<string, string>, status = 200) {
  return new Response(JSON.stringify([]), { status, headers: koepfe });
}

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Der Bestand kommt von der Tür, nicht von der Seite", () => {
  it("liest x-kepta-total und die Kappung aus den Köpfen", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      antwort({ "x-kepta-total": "14702", "x-kepta-begrenzt": "1", "x-kepta-limit": "100" })
    ));
    await refreshMemories();
    expect(bestandGroesse()).toBe(14702);
    expect(seiteIstBegrenzt()).toBe(true);
  });

  it("liest den Bestand aus dem Leib, auch ohne jeden Kopf", async () => {
    // F12 führt den Vertrag im Leib (`{count,total,limit,offset,begrenzt,
    // memories}`). Die Zahl aus dem Leib gewinnt — ein Vermittler, der Köpfe
    // abtrennt (Proxy, Test-Harness, älterer Client), darf die Fläche nicht
    // blind machen.
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      count: 2, total: 14702, limit: 100, offset: 0, begrenzt: true,
      memories: [],
    }), { status: 200 })));
    await refreshMemories();
    expect(bestandGroesse()).toBe(14702);
    expect(seiteIstBegrenzt()).toBe(true);
  });

  it("weiß nichts, wenn die Tür nichts sagt — und erfindet die Seitenlänge nicht", async () => {
    // ROT, sobald `x-kepta-total` aus der Antwort verschwindet: die Fläche muss
    // dann null sehen, denn null heißt „nichts behaupten". Ein Rückfall auf die
    // Länge der Liste wäre genau die stille Kappe, die dieser Schnitt abschafft.
    vi.stubGlobal("fetch", vi.fn(async () => antwort({ "x-kepta-count": "100" })));
    await refreshMemories();
    expect(bestandGroesse()).toBeNull();
    expect(seiteIstBegrenzt()).toBe(false);
  });

  it("vergisst den Bestand nicht an einer 304-Antwort", async () => {
    // Ein leerer Leib ist kein leerer Bestand: die Tür setzt die Köpfe vor der
    // 304, und der Refresh darf die Zahl nicht auf null fallen lassen, nur weil
    // nichts geladen wurde.
    vi.stubGlobal("fetch", vi.fn(async () =>
      antwort({ "x-kepta-total": "14702", "x-kepta-begrenzt": "1" })
    ));
    await refreshMemories();
    expect(bestandGroesse()).toBe(14702);

    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(null, { status: 304, headers: { "x-kepta-total": "14702", "x-kepta-begrenzt": "1" } })
    ));
    await refreshMemories();
    expect(bestandGroesse()).toBe(14702);
  });

  it("legt einen alten Bestand ab, wenn eine neuere Antwort schweigt", async () => {
    // Die Richtung gegen den Fall oben: nach Löschen wäre die alte Zahl eine
    // Lüge, also gilt, was die letzte Antwort sagt — und nichts anderes.
    vi.stubGlobal("fetch", vi.fn(async () => antwort({ "x-kepta-total": "14702" })));
    await refreshMemories();
    expect(bestandGroesse()).toBe(14702);
    vi.stubGlobal("fetch", vi.fn(async () => antwort({})));
    await refreshMemories();
    expect(bestandGroesse()).toBeNull();
  });
});
