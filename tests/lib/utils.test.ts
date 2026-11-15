// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { cn } from "../../src/lib/utils";

describe("cn (className-Merge)", () => {
  it("fügt mehrere Klassen zusammen", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("ignoriert falsy Werte", () => {
    expect(cn("a", false, null, undefined, "", "b")).toBe("a b");
  });

  it("löst Tailwind-Konflikte zugunsten der letzten Klasse auf", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("verarbeitet bedingte Objekte und Arrays", () => {
    expect(cn(["a", { b: true, c: false }])).toBe("a b");
  });
});
