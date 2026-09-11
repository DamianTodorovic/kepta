// @vitest-environment node
//
// Reparatur-Planung: die Zuordnung alter Chunks (Binärmüll aus der
// Rohbyte-Extraktion) zu frisch extrahierten Textteilen.
import { describe, it, expect, vi } from "vitest";
import { planeImportReparatur, basisTitelVon, mitFrist, type ImportBestand } from "../../src/core/reparatur";

// Nachtrag 11.9.2026: an 2.10.2 blieb das Lesen einer Datei haengen und mit ihm
// die ganze App. Seitdem wartet die Reparatur nicht laenger als eine Frist.
describe("mitFrist", () => {
  it("gibt den Wert durch, wenn er rechtzeitig kommt", async () => {
    await expect(mitFrist(Promise.resolve(7), 1000, "zu spaet")).resolves.toBe(7);
  });

  it("scheitert nach der Frist, statt ewig zu warten", async () => {
    vi.useFakeTimers();
    try {
      const ergebnis = mitFrist(new Promise<number>(() => {}), 30_000, "keine Antwort beim Lesen");
      vi.advanceTimersByTime(30_000);
      await expect(ergebnis).rejects.toThrow("keine Antwort beim Lesen");
    } finally {
      vi.useRealTimers();
    }
  });

  it("reicht einen echten Fehler unveraendert weiter", async () => {
    await expect(mitFrist(Promise.reject(new Error("EACCES")), 1000, "x")).rejects.toThrow("EACCES");
  });
});

function bestand(id: string, title: string, content = "◆◆"): ImportBestand {
  return { id, title, content };
}

describe("basisTitelVon", () => {
  it("schneidet '— Teil 2/5' und '— 2/5' ab", () => {
    expect(basisTitelVon("Gewerbe-Ummeldung — Teil 2/5")).toBe("Gewerbe-Ummeldung");
    expect(basisTitelVon("Gewerbe-Ummeldung — 2/5")).toBe("Gewerbe-Ummeldung");
    expect(basisTitelVon("Einfach ein Titel")).toBe("Einfach ein Titel");
  });
});

describe("planeImportReparatur", () => {
  it("aktualisiert jeden bestehenden Teil mit dem neuen Text und behält die IDs", () => {
    const plan = planeImportReparatur(
      [bestand("a", "Dok — Teil 1/3"), bestand("b", "Dok — Teil 2/3"), bestand("c", "Dok — Teil 3/3")],
      ["Text eins", "Text zwei", "Text drei"]
    );
    expect(plan.updates).toHaveLength(3);
    expect(plan.updates[0]).toMatchObject({ id: "a", title: "Dok — Teil 1/3", content: "Text eins" });
    expect(plan.updates[2]).toMatchObject({ id: "c", content: "Text drei" });
    expect(plan.entfaelle).toHaveLength(0);
    expect(plan.neu).toHaveLength(0);
  });

  it("weniger neue Teile als Bestand: überzählige fallen weg", () => {
    const plan = planeImportReparatur(
      [bestand("a", "Dok — Teil 1/2"), bestand("b", "Dok — Teil 2/2")],
      [" Nur noch ein Teil "]
    );
    expect(plan.updates.map((u) => u.id)).toEqual(["a"]);
    expect(plan.updates[0].title).toBe("Dok"); // einteilig -> kein Suffix
    expect(plan.entfaelle).toEqual(["b"]);
    expect(plan.neu).toHaveLength(0);
  });

  it("mehr neue Teile als Bestand: fehlende werden ergänzt (mit Vorlage-Tags beim Aufrufer)", () => {
    const plan = planeImportReparatur(
      [bestand("a", "Dok — Teil 1/2")],
      ["Eins", "Zwei", "Drei"]
    );
    expect(plan.updates.map((u) => u.id)).toEqual(["a"]);
    expect(plan.updates[0].title).toBe("Dok — Teil 1/3");
    expect(plan.neu.map((n) => n.title)).toEqual(["Dok — Teil 2/3", "Dok — Teil 3/3"]);
    expect(plan.entfaelle).toHaveLength(0);
  });

  it("sortiert nach Teil-Nummer im Titel, nicht nach Array-Reihenfolge", () => {
    const plan = planeImportReparatur(
      [bestand("x", "Dok — Teil 3/3"), bestand("y", "Dok — Teil 1/3"), bestand("z", "Dok — Teil 2/3")],
      ["A", "B", "C"]
    );
    expect(plan.updates.map((u) => u.id)).toEqual(["y", "z", "x"]);
    expect(plan.updates.map((u) => u.content)).toEqual(["A", "B", "C"]);
  });

  it("ohne Bestand passiert nichts (neue Importe sind Aufgabe des Imports)", () => {
    const plan = planeImportReparatur([], ["Eins"]);
    expect(plan.updates).toHaveLength(0);
    expect(plan.neu).toHaveLength(0);
    expect(plan.entfaelle).toHaveLength(0);
  });

  it("haengt die Quellzeile an jeden Teil — die erste Fassung schrieb nur den Text zurueck", () => {
    // Folge damals: 36 reparierte Teile einer echten Wissensbasis waren lesbar,
    // aber ohne Herkunft — weder unter ihrer Datei gruppiert noch oeffnbar.
    const anhang = "\n\n— Source: /Users/da/Docs/Dok.pdf";
    const plan = planeImportReparatur([bestand("a", "Dok — 1/2")], ["Eins", "Zwei"], { anhang });
    expect(plan.updates[0].content).toBe("Eins" + anhang);
    expect(plan.neu[0].content).toBe("Zwei" + anhang);
  });

  it("behaelt die Titelform: der Rechner-Scan schreibt ' — 1/2', nicht ' — Teil 1/2'", () => {
    const plan = planeImportReparatur([bestand("a", "Dok — 1/2"), bestand("b", "Dok — 2/2")], ["Eins", "Zwei"]);
    expect(plan.updates.map((u) => u.title)).toEqual(["Dok — 1/2", "Dok — 2/2"]);
  });

  it("eine leere Extraktion loescht nichts", () => {
    const plan = planeImportReparatur([bestand("a", "Dok — 1/2"), bestand("b", "Dok — 2/2")], []);
    expect(plan.entfaelle).toHaveLength(0);
    expect(plan.updates).toHaveLength(0);
  });
});
