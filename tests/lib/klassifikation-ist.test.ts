import { describe, it, expect } from "vitest";
import { klassifiziere, istBelegQuelle, markupAnteil, nummerierteSchritte } from "../../src/core/klassifikation";

// IST-PINS — gemessener Stand der Wissensarten, 13.10.2026 (Scheibe WA).
//
// Diese Datei beweist NICHT, dass die Regeln gut sind. Sie nagelt den
// gemessenen Zustand fest, damit eine Umtaufe nicht im Stillen passiert:
// Jede Zeile sagt, was ein Mensch beim Lesen derselben Notiz gewaehlt haette.
// Wenn Richtung A oder B gebaut wird, fallen diese Pins UM — einzeln, mit
// Begruendung, nicht als Nebenwirkung. Das ist der Zweck.
//
// Grundlage: Kunstbestand von 14.697 Notizen (23 Formen x 639, SEED 20261013)
// und der echte Bestand ueber den Trockenlauf POST /api/memories/reclassify
// (14.702 Notizen, 0 Aenderungen). Bericht: ki gehirn/audit-2026-10-09/WA-WISSENSARTEN.md.

describe("IST-PIN: Herkunft entscheidet die Art, nicht der Inhalt", () => {
  it("macht eine begriffserklaerende Markdown-Notiz zum Beleg — allein wegen des Scan-Tags", () => {
    // Mensch: formuliertes Wissen (semantic). Der Text traegt eine Definition.
    // .md steht nicht in BELEG_ENDUNGEN; es greift ausschliesslich Tag-Regel 3c.
    const z = klassifiziere({
      title: "gedaechtnis-schichten",
      content: "Das System kennt drei Schichten: kurz, lang und abgeleitet. Kurz bleibt in der Sitzung, lang auf der Platte, abgeleitet entsteht beim Suchen.",
      tags: ["machine-scan", "md"],
      quelle: "/Users/beispiel/Documents/kanzlei-amberg/gedaechtnis-schichten.md",
    });
    expect(z.typ).toBe("reference");
    expect(z.grund).toBe("aus dem Rechner-Scan uebernommen");
  });

  it("teilt denselben Text anders ein, je nachdem ob eine Datei dahinterstand", () => {
    const inhalt = "Miete 834 Euro je Monat, Kaution drei Monatsmieten, Kuendigung drei Monate zum Quartalsschluss.";
    const alsDatei = klassifiziere({ title: "Mietvertrag", content: inhalt, quelle: "/a/mietvertrag.pdf" });
    const abgetippt = klassifiziere({ title: "Mietvertrag Auszug", content: inhalt });
    expect(alsDatei.typ).toBe("reference");
    expect(abgetippt.typ).toBe("semantic");
    // Zwei Koerbe fuer ein und denselben Inhalt — die Achse ist die Herkunft.
    expect(alsDatei.typ).not.toBe(abgetippt.typ);
  });

  it("kennt .md, .txt und .docx nicht als Beleg-Endung", () => {
    expect(istBelegQuelle("/a/notiz.md")).toBe(false);
    expect(istBelegQuelle("/a/mitteilung.txt")).toBe(false);
    expect(istBelegQuelle("/a/vertrag.docx")).toBe(false);
    expect(istBelegQuelle("/a/vertrag.pdf")).toBe(true);
  });
});

describe("IST-PIN: die Schwellenwerte schneiden echte Anleitungen ab", () => {
  it("lässt eine Anleitung mit zwei Schritten als Fact enden", () => {
    // Mensch: procedural. Zwei Schritte sind eine Anleitung; die Schwelle liegt bei drei.
    const inhalt = "1. Treiber laden\n2. Drucker hinzufügen\nDanach testen.";
    expect(nummerierteSchritte(inhalt)).toBe(2);
    expect(klassifiziere({ title: "Drucker anbinden", content: inhalt }).typ).toBe("semantic");
  });

  it("sieht das Wort 'setup' nicht, wenn es nach 400 Zeichen steht", () => {
    // Mensch: procedural. Die Wortsuche läuft nur über den ersten Absatz.
    const vorlauf = "Der Wagen steht seit 20 Jahren im Hof. ".repeat(14);
    const z = klassifiziere({ title: "Werkstatt-Wagen", content: vorlauf + "Für das setup zuerst die Bremse lösen, dann die Platte ausrichten." });
    expect(z.typ).toBe("semantic");
  });
});

describe("IST-PIN: die Wortsuche kennt keine Wortgrenzen", () => {
  it("macht 'Terminal-Abkuerzungen' zu einem Ereignis, weil 'termin' im Wort steckt", () => {
    // Mensch: formuliertes Wissen. Kein Termin, kein Ereignis.
    const z = klassifiziere({ title: "Terminal-Abkürzungen", content: "cmd+k öffnet, cmd+w schliesst. Strg+c bricht ab." });
    expect(z.typ).toBe("episodic");
    expect(z.grund).toContain("termin");
  });

  it("macht 'Callback-Nummer' zu einem Ereignis, weil 'call' im Wort steckt", () => {
    const z = klassifiziere({ title: "Callback-Nummer Zentrale", content: "Für Rückfragen telefonisch unter 0732 55 41 20 melden." });
    expect(z.typ).toBe("episodic");
    expect(z.grund).toContain("call");
  });
});

describe("IST-PIN: fuer fuenf menschliche Arten gibt es keinen Korb", () => {
  const faelle: [string, { title: string; content: string }][] = [
    ["Entscheidung", { title: "Entscheidung: zweiter Hoerer statt Fremddienst", content: "Wir nehmen den eigenen Hörer, weil der Fremddienst die Anfrage verlaengert." }],
    ["Vorliebe", { title: "Arbeitsweise", content: "Kurze Antworten, keine Tabellen im Chat, Zahlen nur mit Beleg." }],
    ["Kontakt", { title: "Elena Weiss — Steuerberatung", content: "Erreichbar über Linz, Telefon 0153 160413, prefers E-Mail." }],
    ["Messung", { title: "Trefferquote Abruf 67,3 %", content: "Gemessen am 12.10.2026 gegen 479 Anfragen. Gerät: eigener Rechner." }],
    ["Begriff", { title: "Was heisst: Einlass", content: "Der Begriff bezeichnet den Teil des Systems, der Fehler abweist." }],
  ];
  for (const [mensch, notiz] of faelle) {
    it(`${mensch} landet im Restkorb 'semantic'`, () => {
      const z = klassifiziere({ ...notiz, tags: [] });
      expect(z.typ).toBe("semantic");
      // Der Grund ist eine Verneinung: Er sagt, was der Suchlauf NICHT fand.
      expect(z.grund).toBe("formulierter Text ohne Ablauf oder Datum");
    });
  }

  it("verwechselt eine kuenftige Frist mit einem vergangenen Ereignis", () => {
    // Mensch: eine offene Aufgabe. 'episodic' behauptet, etwas sei geschehen.
    const z = klassifiziere({ title: "2026-11-21 Angebot nachfassen", content: "Bei Praxis Lindenau das Angebot über 3 945 Euro nachfassen." });
    expect(z.typ).toBe("episodic");
    expect(z.grund).toBe("Datum im Titel");
  });
});

describe("IST-PIN: der Grund wird gerechnet und nirgends hingelegt", () => {
  it("liefert zu jeder Zuordnung einen Grund — der Speicher behaelt nur die Art", async () => {
    const z = klassifiziere({ title: "runbook-platten-wache", content: "1. Dienst anhalten\n2. Stand kopieren\n3. Paket tauschen\n4. Prüfen\n5. Starten" });
    expect(z.grund).toBe("5 nummerierte Schritte erkannt");
    // store.ts:545 nimmt `.typ` und verwirft `.grund`. Kein Pfad speichert ihn,
    // keine Flaeche zeigt ihn — die Oberflaeche kann also nie sagen, warum.
    const quelle = await import("fs").then((fs) => fs.readFileSync(new URL("../../src/core/store.ts", import.meta.url), "utf8"));
    expect(quelle).toContain("klassifiziere({ title: input.title ?? \"\", content: input.content ?? \"\", tags: input.tags }).typ");
  });
});

describe("IST-PIN: der Auszeichnungs-Schwellenwert", () => {
  it("laesst 24 % Auszeichnung durch und 26 % nicht", () => {
    const unter = "<p>text</p>".repeat(1) + "x".repeat(31);
    const ueber = "<p>text</p>".repeat(2) + "x".repeat(10);
    expect(markupAnteil(unter)).toBeLessThanOrEqual(0.25);
    expect(markupAnteil(ueber)).toBeGreaterThan(0.25);
    expect(klassifiziere({ title: "a", content: unter }).typ).toBe("semantic");
    expect(klassifiziere({ title: "a", content: ueber }).typ).toBe("reference");
  });
});
