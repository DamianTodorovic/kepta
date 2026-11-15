import { describe, it, expect } from "vitest";
import { bildeinordnung, gegenstelle } from "../../src/lib/bild-politik";

// Die Politik selbst, ohne Fenster: was ein Bild darf, ist eine Entscheidung,
// die der Chat nur anwendet. Gemessen am ausgelieferten Buendel ist die Zahl der
// netz-adressierten Bildziele heute null — diese Faelle halten sie dort.

describe("bildeinordnung", () => {
  it("malt ein eingebettetes Bild", () => {
    const src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    expect(bildeinordnung(src)).toEqual({ art: "malen", src });
  });

  it("malt ein Bild von diesem Rechner — auch mit Hafen", () => {
    expect(bildeinordnung("http://127.0.0.1:3478/bild.png").art).toBe("malen");
    expect(bildeinordnung("http://localhost:5173/x.gif").art).toBe("malen");
  });

  it("weist ein fernes Bild ab und nennt die Gegenstelle", () => {
    const b = bildeinordnung("https://spur.example/p.gif?i=GEHEIM");
    expect(b.art).toBe("abgewiesen");
    if (b.art === "abgewiesen") {
      expect(b.gegenstelle).toBe("spur.example");
      expect(b.weg).toBe("https://spur.example/p.gif?i=GEHEIM");
    }
  });

  it("laesst sich die Gegenstelle nicht durch ein www-antreten verkleiden", () => {
    expect(gegenstelle("https://www.spur.example/p.gif")).toBe("spur.example");
    expect(bildeinordnung("https://www.spur.example/p.gif")).toMatchObject({ gegenstelle: "spur.example" });
  });

  it("weist eine Adresse ab, die nur wie dieser Rechner aussieht", () => {
    const b = bildeinordnung("http://localhost.spur.example/bild.png");
    expect(b.art).toBe("abgewiesen");
    if (b.art === "abgewiesen") expect(b.gegenstelle).toBe("localhost.spur.example");
  });

  it("ein leerer Rest bekommt eine Zeile, kein Bild und keinen Ausweg", () => {
    const b = bildeinordnung("");
    expect(b).toEqual({ art: "abgewiesen", gegenstelle: "", weg: null });
  });

  it("ein Blob ist kein Bild und keine Adresse, die man oeffnet", () => {
    const b = bildeinordnung("blob:http://localhost/1234");
    expect(b.art).toBe("abgewiesen");
    if (b.art === "abgewiesen") expect(b.weg).toBeNull();
  });

  it("ein eingebettetes Bild ist nicht jedes data:", () => {
    expect(bildeinordnung("data:text/html;base64,PHA+").art).toBe("abgewiesen");
    expect(bildeinordnung("data:image/png;base64;notimage").art).toBe("abgewiesen");
  });
});
