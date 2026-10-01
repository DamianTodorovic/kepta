// @vitest-environment node
import { describe, it, expect } from "vitest";
import { existsAt, graphTimeRange, activeIdsAt, edgeVisibleAt } from "../../src/lib/graphTime";
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
});
