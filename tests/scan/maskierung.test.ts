import { describe, it, expect } from "vitest";
import { maskiereSchluessel, SCHLUESSEL_MUSTER } from "../../src/scan/maskierung";

// #76 — der Rechner-Scan zieht Audit-Papiere ins Gedächtnis, und in denen stehen
// Schluessel. Am echten Bestand gemessen (eigener Lauf 19:0x, lesend über die
// laufende App, 14.702 Notizen): 79 Notizen tragen eines der sechs Muster,
// 143 Stellen einen 64-Zeichen-Hex-Lauf, davon 132 nackt im Fließtext.
//
// Zwei Dinge müssen deshalb gleichzeitig gelten, und der Fall, der nur eines
// davon prüft, ist die halbe Arbeit:
//   * ein schluesselförmiger Wert bleibt nicht im Klartext stehen
//   * ein Text ÜBER Schlüssel, ein Hash in einer Prüfumme, ein Beleg-Commit
//     bleiben Zeichen für Zeichen erhalten
// Sonst ist das Leck geheilt und die Doku zerstört.
//
// Alle Werte hier sind erfunden. Kein einziger ist ein echter Schlüssel.

describe("maskiereSchluessel: was unter die Maske fällt", () => {
  it("maskiert einen Anthropic-förmigen Wert und nennt seine Länge", () => {
    const wert = "sk-ant-" + "A".repeat(36); // 43 Zeichen insgesamt
    const r = maskiereSchluessel(`der Schluessel lautet ${wert} und gilt nur hier`);
    expect(r.text).not.toContain(wert);
    expect(r.text).toContain("sk-ant-…MASKIERT(43)");
    expect(r.maskiert).toBe(1);
  });

  it("maskiert OpenAI-, GitHub-, Slack- und AWS-förmige Werte", () => {
    const faelle = [
      ["sk-" + "b".repeat(48), "sk-…MASKIERT(51)"],
      ["ghp_" + "c".repeat(36), "ghp_…MASKIERT(40)"],
      ["xoxb-" + "d".repeat(51), "xoxb-…MASKIERT(56)"],
      ["AKIA" + "E".repeat(16), "AKIA…MASKIERT(20)"],
    ];
    for (const [wert, erwartet] of faelle) {
      const r = maskiereSchluessel(`zeile mit ${wert} am ende`);
      expect(r.text, `${wert.slice(0, 6)}… blieb unmaskiert`).not.toContain(wert);
      expect(r.text).toContain(erwartet);
    }
  });

  it("zaehlt jede Stelle eines Laufs", () => {
    const a = "sk-" + "a".repeat(20);
    const b = "ghp_" + "b".repeat(20);
    const c = "AKIA" + "C".repeat(16);
    const r = maskiereSchluessel(`${a}\n${b}\nund ${c}`);
    expect(r.maskiert).toBe(3);
    expect(r.text.match(/MASKIERT\(/g)?.length).toBe(3);
  });

  it("ist idempotent — eine Maske ist kein Schlüssel", () => {
    const einmal = maskiereSchluessel("sk-" + "a".repeat(20));
    const zweimal = maskiereSchluessel(einmal.text);
    expect(zweimal.text).toBe(einmal.text);
    expect(zweimal.maskiert).toBe(0);
  });
});

describe("maskiereSchluessel: was bleiben muss", () => {
  it("lässt einen Satz über das Wort Schlüssel unangetastet", () => {
    const text = "Der Schlüssel zu dieser Akte liegt im Tresor. Ein API-Schlüssel wird nie im Klartext gespeichert, und der Schlüsselbund bleibt verschlüsselt.";
    const r = maskiereSchluessel(text);
    expect(r.text).toBe(text);
    expect(r.maskiert).toBe(0);
  });

  it("lässt einen nackten 64-Zeichen-Hash im Fließtext stehen", () => {
    // 132 von 143 Hex-Läufen am echten Bestand sind genau das: Prüfummen,
    // Record-Hashes, Commit-Belege. Sie zu maskieren heilt kein Leck und
    // zerstört die Belegkette.
    const hash = "6".repeat(64);
    const text = `SHA-256 der Karte: ${hash} — damit ist der Stand bewiesen.`;
    const r = maskiereSchluessel(text);
    expect(r.text).toBe(text);
    expect(r.maskiert).toBe(0);
  });

  it("maskiert einen 64-Zeichen-Wert, der einem Schlüssel-Namen zugewiesen ist", () => {
    const hex = "9".repeat(64);
    const r = maskiereSchluessel(`KEPTA_DB_KEY = ${hex}`);
    expect(r.text).not.toContain(hex);
    expect(r.text).toContain("KEPTA_DB_KEY = …MASKIERT(64)");
    expect(r.maskiert).toBe(1);
  });

  it("erkennt die Zuweisung auch in JSON und mit Anführungszeichen", () => {
    const hex = "1".repeat(64);
    const r = maskiereSchluessel(`{"api_key": "${hex}"}`);
    expect(r.text).not.toContain(hex);
    expect(r.maskiert).toBe(1);
  });

  it("lässt ein kurstlange Hex-Wort laufen, weil es kein Schlüssel ist", () => {
    const r = maskiereSchluessel("commit 5f3a1b und die Farbe #a2a2a2 im Protokoll");
    expect(r.maskiert).toBe(0);
  });
});

describe("Die Musterliste sagt, was sie deckt — und was nicht", () => {
  it("liegt vollständig in der Aufgabe der Leitung", () => {
    // Fünf Familien nannte der Brief; wer hier eine sechste erfindet, maskiert
    // eines Tages Text, den niemand als Geheimnis angemeldet hat.
    expect(SCHLUESSEL_MUSTER.map((m) => m.name).sort()).toEqual(["AKIA", "ghp", "sk", "sk-ant", "xox"]);
  });

  it("deckt kurze und lange Werte derselben Familie, aber kein Wort, das nur so anfängt", () => {
    expect(maskiereSchluessel("sk-kurzz").maskiert).toBe(0);        // zu kurz für ein Wert
    expect(maskiereSchluessel("skipping this paragraph").maskiert).toBe(0); // gar kein Wert
  });
});
