// Band-Tuning-Hebel (26.9.): KEPTA_VECTOR_BAND / KEPTA_VECTOR_FLOOR dürfen im
// Eval-Runner die Vektor-Grenzen überschreiben — das Produktverhalten ohne env
// muss bitidentisch bleiben, und Müll-Werte dürfen nie durchrutschen.
import { afterEach, describe, expect, it } from "vitest";
import { vektorBandGrenze, vektorFloorGrenze } from "../../src/core/engine";

const altBand = process.env.KEPTA_VECTOR_BAND;
const altFloor = process.env.KEPTA_VECTOR_FLOOR;

afterEach(() => {
  if (altBand === undefined) delete process.env.KEPTA_VECTOR_BAND;
  else process.env.KEPTA_VECTOR_BAND = altBand;
  if (altFloor === undefined) delete process.env.KEPTA_VECTOR_FLOOR;
  else process.env.KEPTA_VECTOR_FLOOR = altFloor;
});

describe("Vektor-Grenzen: env-Override für das Band-Tuning", () => {
  it("ohne env gelten die Produkt-Konstanten (0.86 / 0.58)", () => {
    delete process.env.KEPTA_VECTOR_BAND;
    delete process.env.KEPTA_VECTOR_FLOOR;
    expect(vektorBandGrenze()).toBe(0.86);
    expect(vektorFloorGrenze()).toBe(0.58);
  });

  it("gesetzte env-Werte überschreiben — innerhalb der gültigen Bereiche", () => {
    process.env.KEPTA_VECTOR_BAND = "0.8";
    process.env.KEPTA_VECTOR_FLOOR = "0.52";
    expect(vektorBandGrenze()).toBe(0.8);
    expect(vektorFloorGrenze()).toBe(0.52);
  });

  it("Unsinn und Out-of-Range fallen lautlos auf den Default zurück", () => {
    process.env.KEPTA_VECTOR_BAND = "abc";
    process.env.KEPTA_VECTOR_FLOOR = "0.1";
    expect(vektorBandGrenze()).toBe(0.86);
    expect(vektorFloorGrenze()).toBe(0.58);
  });
});
