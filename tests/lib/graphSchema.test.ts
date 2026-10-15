// P-10: das Schema-Inventar. Cognee zeigt im „Schema"-Tab, was in seiner
// Wissensbasis eigentlich vorkommt — Zählungen je Typ und wie Typen verbunden
// sind. Bei K3PTA standen diese Zahlen verstreut: die Art-Ziffern auf den
// Dashboard-Kacheln, die Kantenarten in der Legende, die Kantentypen an den
// Linien selbst.
//
// Der Vertrag, der hier zählt, ist einer: das Inventar muss dieselbe Wahrheit
// nennen, die die Fläche zeichnet. Eine zweite Zählung neben der ersten ist
// genau die Sorte Zahl, die in einer Welle dreimal falsch war.

import { describe, it, expect } from "vitest";
import { schemaInventar, type SchemaKante, type SchemaNotiz, type SchemaZeile } from "../../src/lib/graphSchema";

const notiz = (typ: string | null | undefined): SchemaNotiz => ({ type: typ });
const notizen = (typen: (string | null | undefined)[]) => typen.map(notiz);
const kante = (
  source: string,
  target: string,
  opts: { real?: boolean; relation?: string | null } = {}
): SchemaKante => ({ source, target, real: opts.real ?? true, relation: opts.relation ?? null });

/** Eine Zeile aus einer der beiden Hälften, oder `undefined`. */
function zeile(inventar: { knoten: SchemaZeile[]; kanten: SchemaZeile[] }, wo: "knoten" | "kanten", schluessel: string) {
  return inventar[wo].find((z) => z.schluessel === schluessel);
}

describe("Das Inventar zählt, was im Bild steht", () => {
  it("nennt jede Art, die vorkommt, mit ihrer Zahl", () => {
    const inventar = schemaInventar({
      notizen: notizen(["semantic", "semantic", "episodic", "procedural", "reference", "reference", "reference"]),
      konzepte: 0,
      kanten: [],
    });
    expect(zeile(inventar, "knoten", "knoten:semantic")?.anzahl).toBe(2);
    expect(zeile(inventar, "knoten", "knoten:episodic")?.anzahl).toBe(1);
    expect(zeile(inventar, "knoten", "knoten:reference")?.anzahl).toBe(3);
    expect(zeile(inventar, "knoten", "knoten:procedural")?.anzahl).toBe(1);
    // Die Zeilen tragen die Namen, die die Legende schon benutzt — ein dritter
    // Name für dieselbe Art wäre eine zweite Wahrheit. Seit #84 sind das die
    // Beschreibungen aus `TYP_BESCHREIBUNG`, nicht die vier Korb-Woerter.
    expect(inventar.knoten.map((z) => z.label)).toEqual(["Papers", "Statements", "How it's done", "What happened"]);
  });

  it("erfindet keine Zeile für eine Art, die nicht im Bild ist", () => {
    const inventar = schemaInventar({ notizen: notizen(["semantic"]), konzepte: 0, kanten: [] });
    expect(inventar.knoten).toHaveLength(1);
    expect(zeile(inventar, "knoten", "knoten:episodic")).toBeUndefined();
  });

  it("nennt einen fremden Typ so, wie er heisst — nicht als eine der vier bekannten", () => {
    const inventar = schemaInventar({ notizen: notizen(["dreamlog", "dreamlog"]), konzepte: 0, kanten: [] });
    expect(zeile(inventar, "knoten", "knoten:dreamlog")).toEqual({
      schluessel: "knoten:dreamlog",
      label: "dreamlog",
      anzahl: 2,
    });
  });

  it("zählt eine Notiz ohne Art in einer eigenen Zeile, nicht irgendwozu", () => {
    const inventar = schemaInventar({ notizen: notizen([null, undefined, "semantic"]), konzepte: 0, kanten: [] });
    expect(zeile(inventar, "knoten", "knoten:—")?.anzahl).toBe(2);
    expect(zeile(inventar, "knoten", "knoten:—")?.label).toBe("No type");
  });

  it("stellt die Begriffe neben die Notizen, nicht unter sie", () => {
    const inventar = schemaInventar({ notizen: notizen(["semantic"]), konzepte: 12, kanten: [] });
    expect(zeile(inventar, "knoten", "knoten:__begriff")).toEqual({
      schluessel: "knoten:__begriff",
      label: "Concepts",
      anzahl: 12,
    });
    expect(inventar.gesamtKnoten).toBe(13);
  });

  it("lässt die Begriffe ganz weg, wenn das Netz keine trägt", () => {
    const inventar = schemaInventar({ notizen: notizen(["semantic"]), konzepte: 0, kanten: [] });
    expect(zeile(inventar, "knoten", "knoten:__begriff")).toBeUndefined();
  });
});

describe("Die Kantenseite nennt, was behauptet wird", () => {
  it("gruppiert nach dem Typ der Behauptung", () => {
    const inventar = schemaInventar({
      notizen: [],
      konzepte: 0,
      kanten: [
        kante("__ent:nordwind", "__ent:quay", { relation: "betreut" }),
        kante("__ent:nordwind", "__ent:kestrel", { relation: "betreut" }),
        kante("__ent:nordwind", "__ent:quay", { relation: "meldet an" }),
      ],
    });
    expect(zeile(inventar, "kanten", "kante:betreut")?.anzahl).toBe(2);
    expect(zeile(inventar, "kanten", "kante:meldet an")?.anzahl).toBe(1);
  });

  it("nennt eine Erwähnung beim Namen und lässt sie eine Erwähnung sein", () => {
    // Eine echte Kante zwischen Notiz und Begriff trägt keinen Behauptungstyp —
    // sie sagt nur, dass die Notiz den Begriff erwähnt.
    const inventar = schemaInventar({
      notizen: [],
      konzepte: 0,
      kanten: [kante("m1", "__ent:nordwind"), kante("m2", "__ent:nordwind")],
    });
    expect(zeile(inventar, "kanten", "kante:erwaehnung")).toEqual({
      schluessel: "kante:erwaehnung",
      label: "Mention",
      anzahl: 2,
    });
  });

  it("hält eine Aehnlichkeit aus einer Behauptung heraus", () => {
    const inventar = schemaInventar({
      notizen: [],
      konzepte: 0,
      kanten: [kante("m1", "m2", { real: false, relation: "betreut" })],
    });
    expect(zeile(inventar, "kanten", "kante:ahnlichkeit")).toEqual({
      schluessel: "kante:ahnlichkeit",
      label: "Similarity",
      anzahl: 1,
    });
    // Auch nicht durch den Typ, den die Zeile zufällig mitschleppt.
    expect(zeile(inventar, "kanten", "kante:betreut")).toBeUndefined();
  });

  it("schneidet den Systemworten nicht die Zeile ab — sie gehören zu den Behauptungen", () => {
    // `kantenEtikett` hält Systemworte aus dem Etikett an der Linie heraus. Im
    // Inventar sind sie trotzdem ein Typ, der vorkommt, und eine Zahl, die stimmt.
    const inventar = schemaInventar({
      notizen: [],
      konzepte: 0,
      kanten: [kante("__ent:a", "__ent:b", { relation: " related " })],
    });
    expect(zeile(inventar, "kanten", "kante:related")?.anzahl).toBe(1);
  });

  it("zählt jede Kante genau einmal, und die Summe ist die Zahl der Fläche", () => {
    const kanten = [
      kante("__ent:a", "__ent:b", { relation: "betreut" }),
      kante("m1", "__ent:a"),
      kante("m1", "m2", { real: false }),
      kante("__ent:a", "__ent:b", { relation: "meldet an" }),
    ];
    const inventar = schemaInventar({ notizen: [], konzepte: 0, kanten });
    expect(inventar.gesamtKanten).toBe(kanten.length);
    expect(inventar.kanten.reduce((s, z) => s + z.anzahl, 0)).toBe(kanten.length);
  });
});

describe("Das Inventar ist eine Rechnung, kein Zufall", () => {
  const basis = () => ({
    notizen: notizen(["semantic", "semantic", "episodic"]),
    konzepte: 4,
    kanten: [
      kante("__ent:a", "__ent:b", { relation: "betreut" }),
      kante("__ent:a", "__ent:b", { relation: "meldet an" }),
      kante("m1", "__ent:a"),
    ],
  });

  it("stellt gleich große Zeilen nach dem Namen, nicht nach der Ankunftsreihenfolge", () => {
    const eins = schemaInventar(basis());
    const eingabe = basis();
    eingabe.kanten = [...eingabe.kanten].reverse();
    eingabe.notizen = [...eingabe.notizen].reverse();
    const zwei = schemaInventar(eingabe);
    expect(zwei).toEqual(eins);
  });

  it("ordnet absteigend nach der Zahl — das Große zuerst, weil das die Frage ist", () => {
    const inventar = schemaInventar(basis());
    const zahlen = inventar.knoten.map((z) => z.anzahl);
    expect(zahlen).toEqual([...zahlen].sort((a, b) => b - a));
  });

  it("kommt mit einem leeren Bild aus", () => {
    expect(schemaInventar({ notizen: [], konzepte: 0, kanten: [] })).toEqual({
      knoten: [],
      kanten: [],
      gesamtKnoten: 0,
      gesamtKanten: 0,
    });
  });
});
