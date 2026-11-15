// Der eine Sanitizer für alle Wege — hier werden die Regeln selbst geprüft,
// nicht nur über die Wrapper in Store und Server.
import { describe, it, expect } from "vitest";
import { sanitizeText, sanitizeHtmlText, sanitizeTitle, sanitizeTags } from "../../src/core/sanitize";

describe("sanitizeText", () => {
  it("entfernt NUL- und Steuerzeichen, bewahrt Zeilenumbrüche", () => {
    expect(sanitizeText("a\u0000b\u0008c\nd\te")).toBe("abc\nd\te");
  });

  it("kürzt auf die Grenze und säubert die Ränder", () => {
    expect(sanitizeText(" abcdefghijklm ", 10)).toBe("abcdefghi");
    expect(sanitizeText(42)).toBe("");
    expect(sanitizeText(undefined)).toBe("");
  });
});

describe("sanitizeHtmlText (nur Roh-HTML-Ingeste)", () => {
  it("wirft script-Blöcke, Event-Handler und javascript:-Ziele raus", () => {
    const sauber = sanitizeHtmlText("<p>Hallo</p><script>alert(1)</script><img onerror='x()'>");
    expect(sauber).toContain("Hallo");
    expect(sauber).not.toContain("script");
    expect(sauber).not.toContain("onerror");
    expect(sanitizeHtmlText("javascript:alert(1)")).not.toContain("javascript:");
    // Wertlose On-Attribute (ohne "=") laufen als JS nirgends — die Tag-Ebene
    // sieht sie zwar, entfernt sie aber nicht; der Vertrag ist: on*-Attribute
    // MIT Wert fliegen raus, wertlose bleiben (inert).
    expect(sanitizeHtmlText("<img onerror>Text")).toContain("onerror");
    expect(sanitizeHtmlText('<img onerror="x()">Text')).not.toContain("onerror");
  });
});

describe("sanitizeTitle", () => {
  it("macht Titel einzeilig und kurz", () => {
    expect(sanitizeTitle("Zeile1\r\nZeile2\nZeile3")).toBe("Zeile1 Zeile2 Zeile3");
    expect(sanitizeTitle("x".repeat(500))).toHaveLength(200);
  });
});

describe("sanitizeTags", () => {
  it("normalisiert, dedupliziert und begrenzt — wie der Store es seit je sagt", () => {
    expect(sanitizeTags(["Rust", "rust!!", "RUST", "a", "ok-tag"])).toEqual(["rust", "ok-tag"]);
    expect(sanitizeTags(["Ärmel", "öl"])).toEqual(["ärmel", "öl"]);
  });

  it("nimmt höchstens 12 Tags und kein Rauschen", () => {
    expect(sanitizeTags(Array.from({ length: 20 }, (_, i) => `tag-${i}`))).toHaveLength(12);
    expect(sanitizeTags("keine Liste")).toEqual([]);
    expect(sanitizeTags([1, null, {}])).toEqual([]);
  });
});
