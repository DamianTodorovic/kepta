// @vitest-environment node
//
// Query-Erweiterung (src/core/synonyme.ts): deutsche Fragen finden englische
// Notizen und umgekehrt. Die Erweiterung HÄNGT Synonyme an — sie ersetzt und
// verdoppelt nichts, ketnet nicht weiter, und tut bei unbekannten Worten nichts.
import { describe, it, expect } from "vitest";
import { erweitereQuery } from "../src/core/synonyme";

describe("erweitereQuery", () => {
  it("hängt die Synonyme eines bekannten Terms an", () => {
    expect(erweitereQuery("Wie oft wird gesichert?")).toContain(" backup");
    expect(erweitereQuery("Wie oft wird gesichert?")).toContain(" snapshot");
  });

  it("arbeitet in beide Richtungen — englisch fragen, deutsche Notiz treffen", () => {
    expect(erweitereQuery("backup schedule")).toContain("gesichert");
    expect(erweitereQuery("VAT return")).toContain("umsatzsteuer");
  });

  erkenntPlural();
  function erkenntPlural() {
    // „Passwörter" (Plural) findet denselben Eintrag wie „Passwort".
    expect(erweitereQuery("Passwörter sicher verwalten").toLowerCase()).toContain("manager");
  }

  it("vergleicht als Ganzwörter — kein Treffer mitten im Wort", () => {
    // „private" enthält „vat", aber nicht als Ganzwort — keine Erweiterung.
    const r = erweitereQuery("private photos");
    expect(r).not.toContain("umsatzsteuer");
  });

  it("vermeidet Doppel, wenn der Nutzer das Synonym schon schrieb", () => {
    const r = erweitereQuery("backup gesichert");
    const backupZahl = r.toLowerCase().match(/backup/g)?.length ?? 0;
    expect(backupZahl).toBe(1);
  });

  it(" Expansion bleibt eine Ebene tief — Synonyme werden nicht weiter expandiert", () => {
    const r = erweitereQuery("gesichert");
    expect(r).toContain("backup");
    // „backup" hätte als zweites Lexikon-Blatt „gesichert" — das steht schon drin
    // und „snapshot" wird trotzdem nur einmal geliefert.
    expect(r.match(/snapshot/g)?.length).toBe(1);
  });

  it("unbekannte oder leere Queries bleiben unverändert", () => {
    expect(erweitereQuery("")).toBe("");
    expect(erweitereQuery("Laufschuhe")).toBe("Laufschuhe");
    expect(erweitereQuery("Was koche ich mit Nudeln?")).toContain("pasta");
  });
});
