// @vitest-environment jsdom
//
// Starter-Notizen: nur noch die selbsterklärenden Basis-Einträge, dedupliziert.
import { describe, it, expect } from "vitest";
import { starterNotes } from "../../src/lib/starter";

describe("starterNotes", () => {
  it("liefert Basis-Notizen mit Titel, Inhalt und Tag-Liste", () => {
    const notizen = starterNotes();
    expect(notizen.length).toBeGreaterThan(0);
    for (const n of notizen) {
      expect(typeof n.title).toBe("string");
      expect(n.title.length).toBeGreaterThan(0);
      expect(typeof n.content).toBe("string");
      expect(Array.isArray(n.tags)).toBe(true);
    }
  });

  it("ist dedupliziert — jeder Titel kommt höchstens einmal vor", () => {
    const titel = starterNotes().map((n) => n.title);
    expect(new Set(titel).size).toBe(titel.length);
  });
});
