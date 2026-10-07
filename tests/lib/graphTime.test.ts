// @vitest-environment node
import { describe, it, expect } from "vitest";
import { existsAt, graphTimeRange, activeIdsAt, edgeVisibleAt, fensterOffen } from "../../src/lib/graphTime";
import type { Memory } from "../../src/types";

function mem(over: Partial<Memory> = {}): Memory {
  return {
    id: "m1",
    userId: "local",
    title: "T",
    content: "C",
    tags: [],
    createdAt: 1_000,
    updatedAt: 2_000,
    ...over,
  };
}

describe("existsAt (Zeitregler-Gültigkeit)", () => {
  it("Notiz OHNE valid-Felder: existiert ab createdAt (Zukunft-Ausblenden)", () => {
    const m = mem({ createdAt: 1_000, validFrom: null, validTo: null });
    expect(existsAt(m, 500)).toBe(false);   // vor Anlage → aus
    expect(existsAt(m, 1_000)).toBe(true);  // exakt bei Anlage → an
    expect(existsAt(m, 5_000)).toBe(true);  // danach → an
  });

  it("fällt auf updatedAt zurück, wenn createdAt fehlt", () => {
    const m = mem({ createdAt: undefined as unknown as number, updatedAt: 3_000, validFrom: null, validTo: null });
    expect(existsAt(m, 2_000)).toBe(false);
    expect(existsAt(m, 3_000)).toBe(true);
  });

  it("respektiert explizites validFrom (statt createdAt)", () => {
    const m = mem({ createdAt: 1_000, validFrom: 4_000, validTo: null });
    expect(existsAt(m, 2_000)).toBe(false); // createdAt schon, aber validFrom noch nicht
    expect(existsAt(m, 4_000)).toBe(true);
  });

  it("respektiert validTo (Ablauf blendet aus)", () => {
    const m = mem({ createdAt: 1_000, validFrom: null, validTo: 5_000 });
    expect(existsAt(m, 3_000)).toBe(true);
    expect(existsAt(m, 5_000)).toBe(false); // ab validTo nicht mehr gültig
    expect(existsAt(m, 6_000)).toBe(false);
  });

  it("kombiniert validFrom und validTo (Zeitfenster)", () => {
    const m = mem({ createdAt: 0, validFrom: 2_000, validTo: 8_000 });
    expect(existsAt(m, 1_000)).toBe(false);
    expect(existsAt(m, 2_000)).toBe(true);
    expect(existsAt(m, 7_999)).toBe(true);
    expect(existsAt(m, 8_000)).toBe(false);
  });

  it("ohne jegliche Zeitangabe: immer sichtbar (kein Ausblenden)", () => {
    const m = mem({ createdAt: undefined as unknown as number, updatedAt: undefined as unknown as number, validFrom: null, validTo: null });
    expect(existsAt(m, 0)).toBe(true);
    expect(existsAt(m, 9_999)).toBe(true);
  });
});

describe("graphTimeRange (Regler-Skala)", () => {
  it("leere Liste → null (kein Regler)", () => {
    expect(graphTimeRange([])).toBe(null);
  });

  it("nur Notizen ohne Zeitangaben → null", () => {
    const m = mem({ createdAt: undefined as unknown as number, updatedAt: undefined as unknown as number });
    expect(graphTimeRange([m])).toBe(null);
  });

  it("spannt min/max über createdAt/updatedAt", () => {
    const r = graphTimeRange([
      mem({ createdAt: 1_000, updatedAt: 2_000 }),
      mem({ createdAt: 5_000, updatedAt: 9_000 }),
    ]);
    expect(r).toEqual({ min: 1_000, max: 9_000 });
  });

  it("berücksichtigt validFrom und validTo in der Spanne", () => {
    const r = graphTimeRange([mem({ createdAt: 3_000, updatedAt: 3_000, validFrom: 500, validTo: 12_000 })]);
    expect(r).toEqual({ min: 500, max: 12_000 });
  });
});

// Befund vom 6.9.2026 aus der Benutzung des Zeitreglers: die KNOTEN wurden
// korrekt ausgeblendet, das Kantennetz blieb aber vollstaendig stehen. Bei
// "Februar 2023" sah man ein graues Gitter ohne Knoten — die Struktur von
// Wissen, das damals noch gar nicht existierte.
describe("activeIdsAt", () => {
  const T = (s: string) => Date.parse(s + "T12:00:00Z");
  const note = (id: string, over: Partial<Memory> = {}): Memory => ({
    id, userId: "local", title: id, content: "x", tags: [],
    createdAt: T("2024-01-01"), updatedAt: T("2024-01-01"), ...over,
  });

  it("liefert null fuer 'jetzt' — da gibt es nichts auszublenden", () => {
    expect(activeIdsAt([note("a")], null)).toBeNull();
  });

  it("nimmt nur auf, was zum Zeitpunkt schon da war", () => {
    const ms = [note("alt", { createdAt: T("2023-01-01") }), note("neu", { createdAt: T("2025-01-01") })];
    expect([...activeIdsAt(ms, T("2024-06-01"))!]).toEqual(["alt"]);
  });

  it("laesst Abgelaufenes draussen", () => {
    const ms = [note("befristet", { createdAt: T("2023-01-01"), validTo: T("2024-01-01") })];
    expect(activeIdsAt(ms, T("2023-06-01"))!.has("befristet")).toBe(true);
    expect(activeIdsAt(ms, T("2025-06-01"))!.has("befristet")).toBe(false);
  });

  it("kommt mit einer leeren Wissensbasis zurecht", () => {
    expect(activeIdsAt([], T("2024-01-01"))!.size).toBe(0);
  });
});

describe("edgeVisibleAt", () => {
  it("zeigt ohne Zeitfilter jede Kante", () => {
    expect(edgeVisibleAt(null, "a", "b")).toBe(true);
  });

  it("zeigt eine Kante nur, wenn BEIDE Enden damals existierten", () => {
    const aktiv = new Set(["a", "b"]);
    expect(edgeVisibleAt(aktiv, "a", "b")).toBe(true);
    expect(edgeVisibleAt(aktiv, "a", "c")).toBe(false);
    expect(edgeVisibleAt(aktiv, "c", "a")).toBe(false);
    expect(edgeVisibleAt(aktiv, "c", "d")).toBe(false);
  });

  it("laesst bei leerer Menge nichts uebrig — kein Gitter ohne Knoten", () => {
    expect(edgeVisibleAt(new Set(), "a", "b")).toBe(false);
  });

  it("lässt Kanten ans Gerüst stehen — ein Konzept hat kein Datum", () => {
    // Seit dem 6.10. zeichnet das Kraftfeld Konzepte als eigene Knoten. Sie
    // entstehen aus den Notizen, die sie tragen, und haben selbst kein
    // Entstehungsdatum. Würde die Zeitregel sie wie Notizen behandeln, fielen
    // beim Regler alle Gerüstkanten weg: das graue Gitter ohne Knoten.
    const aktiv = new Set(["a"]);
    expect(edgeVisibleAt(aktiv, "a", "__ent:elena")).toBe(true);
    expect(edgeVisibleAt(aktiv, "__ent:elena", "a")).toBe(true);
    expect(edgeVisibleAt(aktiv, "__ent:elena", "__ent:falk")).toBe(true);
  });

  it("nimmt einer ausgeblendeten Notiz auch die Kante zum Konzept", () => {
    // Das Gerüst ist neutral, die Notiz nicht: wer im Februar steht, darf nicht
    // die Spinne einer Mai-Notiz am Konzept sehen.
    const aktiv = new Set(["a"]);
    expect(edgeVisibleAt(aktiv, "b", "__ent:elena")).toBe(false);
    expect(edgeVisibleAt(aktiv, "__ent:elena", "b")).toBe(false);
  });
});

// Die Aussage zwischen zwei Begriffen hat seit jeher ein eigenes Zeitfenster:
// addRelation nimmt validFrom/validTo, und der Kern liefert sie seit 343cb04
// auch in /api/graph aus. Ignorierte sie der Regler, zeigte „2024" eine
// Behauptung, die 2023 geplatzt war — die Notiz wäre richtig ausgeblendet,
// ihre Aussage aber stehen geblieben.
describe("fensterOffen (Gültigkeit einer Aussage)", () => {
  it("ohne Fenster gilt die Kante immer", () => {
    expect(fensterOffen(null, 5_000)).toBe(true);
    expect(fensterOffen(undefined, 5_000)).toBe(true);
    expect(fensterOffen({}, 5_000)).toBe(true);
    expect(fensterOffen({ validFrom: null, validTo: null }, 5_000)).toBe(true);
  });

  it("vor validFrom gilt sie noch nicht — ab validFrom gilt sie", () => {
    const f = { validFrom: 4_000, validTo: null };
    expect(fensterOffen(f, 3_999)).toBe(false);
    expect(fensterOffen(f, 4_000)).toBe(true);
    expect(fensterOffen(f, 9_000)).toBe(true);
  });

  it("ab validTo gilt sie nicht mehr — dieselbe Halboffenheit wie bei der Notiz", () => {
    const f = { validFrom: null, validTo: 5_000 };
    expect(fensterOffen(f, 4_999)).toBe(true);
    expect(fensterOffen(f, 5_000)).toBe(false);
    expect(fensterOffen(f, 6_000)).toBe(false);
  });

  it("kennt beide Enden, gilt sie nur dazwischen", () => {
    const f = { validFrom: 2_000, validTo: 8_000 };
    expect(fensterOffen(f, 1_000)).toBe(false);
    expect(fensterOffen(f, 2_000)).toBe(true);
    expect(fensterOffen(f, 7_999)).toBe(true);
    expect(fensterOffen(f, 8_000)).toBe(false);
  });

  it("eine Null ist kein Datum, sondern „nicht gesetzt“", () => {
    // existsAt behandelt 0 ebenso wie fehlend — beide Funktionen müssen
    // dieselbe Regel haben, sonst zieht der Regler am Knoten anders als an der
    // Kante.
    expect(fensterOffen({ validFrom: 0, validTo: 0 }, 1)).toBe(true);
  });
});

describe("edgeVisibleAt mit dem Zeitfenster der Kante", () => {
  const aktiv = new Set(["a", "b"]);

  it("ein geschlossenes Fenster nimmt die Kante, obwohl beide Enden da waren", () => {
    expect(edgeVisibleAt(aktiv, "a", "b", { validFrom: null, validTo: 3_000 }, 5_000)).toBe(false);
    expect(edgeVisibleAt(aktiv, "a", "b", { validFrom: 6_000, validTo: null }, 5_000)).toBe(false);
    expect(edgeVisibleAt(aktiv, "a", "b", { validFrom: 1_000, validTo: 9_000 }, 5_000)).toBe(true);
  });

  it("bei „jetzt“ bleibt die abgelaufene Kante im Bild — gestrichelt, nicht versteckt", () => {
    // Parität zum Knoten: eine abgelaufene Notiz verschwindet nicht, sie trägt
    // einen gestrichelten Ring. Wer die Behauptung bei „jetzt" ganz ausblendete,
    // löschte die Geschichte statt sie als erledigt zu zeigen.
    expect(edgeVisibleAt(null, "a", "b", { validFrom: null, validTo: 3_000 }, null)).toBe(true);
  });

  it("die Endpunkt-Regel gilt weiter — ein offenes Fenster heilt keine Geisterkante", () => {
    expect(edgeVisibleAt(aktiv, "a", "c", { validFrom: null, validTo: null }, 5_000)).toBe(false);
    expect(edgeVisibleAt(aktiv, "a", "c", { validFrom: 1, validTo: 9_000 }, 5_000)).toBe(false);
  });

  it("ohne Zeitangabe filtert kein Fenster — die alte Dreisignatur bleibt gültig", () => {
    expect(edgeVisibleAt(aktiv, "a", "b", { validFrom: null, validTo: 3_000 })).toBe(true);
    expect(edgeVisibleAt(aktiv, "a", "b")).toBe(true);
  });

  it("das Gerüst bleibt neutral: nur das Fenster entscheidet, nicht das Datum des Begriffs", () => {
    expect(edgeVisibleAt(aktiv, "__ent:elena", "__ent:falk", { validFrom: 1_000, validTo: 9_000 }, 5_000)).toBe(true);
    expect(edgeVisibleAt(aktiv, "__ent:elena", "__ent:falk", { validFrom: null, validTo: 3_000 }, 5_000)).toBe(false);
  });
});
