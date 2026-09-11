import { describe, it, expect } from "vitest";
import { STOPWORDS, contentTerms } from "../../src/core/stopwords";

describe("contentTerms", () => {
  it("entfernt englische Fuellwoerter aus einer natuerlichen Frage", () => {
    expect(contentTerms("what do I cook with pasta")).toEqual(["cook", "pasta"]);
  });

  it("entfernt deutsche Fuellwoerter", () => {
    expect(contentTerms("Wie ist die hybride Suche implementiert?")).toEqual([
      "hybride", "suche", "implementiert",
    ]);
  });

  it("laesst eine reine Stichwortanfrage unangetastet", () => {
    expect(contentTerms("Carbonara Guanciale Pecorino")).toEqual([
      "carbonara", "guanciale", "pecorino",
    ]);
  });

  it("wirft einzelne Zeichen weg, behaelt aber Zahlen", () => {
    expect(contentTerms("a 64 GB Laptop")).toEqual(["64", "gb", "laptop"]);
  });

  it("behaelt nicht-lateinische Schrift", () => {
    expect(contentTerms("Датабаза настройка")).toEqual(["датабаза", "настройка"]);
  });

  it("gibt bei einer Anfrage aus lauter Fuellwoertern die Originalwoerter zurueck", () => {
    // Sonst faende eine Suche nach "was ist das" gar nichts mehr — lieber
    // schlechte Treffer als eine stumme Suche.
    expect(contentTerms("was ist das")).toEqual(["was", "ist", "das"]);
  });

  it("begrenzt die Anzahl der Begriffe", () => {
    const lang = Array.from({ length: 40 }, (_, i) => `wort${i}`).join(" ");
    expect(contentTerms(lang).length).toBeLessThanOrEqual(12);
  });

  it("liefert bei leerer Eingabe eine leere Liste", () => {
    expect(contentTerms("   ")).toEqual([]);
    expect(contentTerms("")).toEqual([]);
  });

  it("kennt Fuellwoerter beider Sprachen", () => {
    expect(STOPWORDS.has("with")).toBe(true);
    expect(STOPWORDS.has("welche")).toBe(true);
    expect(STOPWORDS.has("carbonara")).toBe(false);
  });
});
