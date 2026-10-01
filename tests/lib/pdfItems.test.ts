// @vitest-environment node
//
// pdf.js-Items zu Fließtext — die reine Zusammensetzung ohne Browser-Worker.
import { describe, it, expect } from "vitest";
import { itemsZuText } from "../../src/lib/pdfItems";

describe("itemsZuText", () => {
  it("zieht Items zu einer Zeile zusammen und setzt Umbrüche bei hasEOL", () => {
    const text = itemsZuText([
      { str: "Im Handels-, " },
      { str: "Genossenschafts-" },
      { str: "register", hasEOL: true },
      { str: "Ort und Nummer" },
    ]);
    expect(text).toBe("Im Handels-, Genossenschafts-register\nOrt und Nummer");
  });

  it("überspringt Einträge ohne str (z. B. Marked-Content-Objekte)", () => {
    const text = itemsZuText([{ str: "A", hasEOL: true }, { hasEOL: true }, { str: "B" }, {}]);
    expect(text).toBe("A\nB");
  });

  it("entschlackt Vielfach-Leerzeilen und Leerzeichen an Umbrüchen", () => {
    const text = itemsZuText([
      { str: "A", hasEOL: true }, { str: "   " , hasEOL: true }, { str: "" , hasEOL: true },
      { str: "  B  C  " },
    ]);
    expect(text).toBe("A\n\nB C");
  });

  it("leere Item-Liste ergibt Leerstring", () => {
    expect(itemsZuText([])).toBe("");
  });
});
