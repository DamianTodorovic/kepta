// @vitest-environment node
import { describe, it, expect } from "vitest";
import { existsAt, graphTimeRange } from "../../src/lib/graphTime";
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
