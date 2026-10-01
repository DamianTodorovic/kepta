import { describe, it, expect } from "vitest";
import {
  klassifiziere, istUnbrauchbar, htmlZuText, entferneNaviZeilen,
  nummerierteSchritte, aufzaehlungsZeilen, markupAnteil, istBelegQuelle,
} from "../../src/core/klassifikation";

// Der Anlass: KEPTA ordnete Wissen NIE selbst zu. Der Typ kam allein vom
// Aufrufer, und wo keiner ihn setzte, fiel alles auf "semantic". An einer
// echten Wissensbasis aus einem Rechner-Scan waren 3071 von 3148 Notizen
// "Fakt" — eine Einteilung, die nichts mehr einteilt.

describe("Anleitungen erkennen", () => {
  it("nimmt nummerierte Schritte als staerksten Beleg", () => {
    const z = klassifiziere({ title: "Server aufsetzen", content: "1. Paket laden\n2. Entpacken\n3. Starten\n4. Fertig" });
    expect(z.typ).toBe("procedural");
    expect(z.grund).toMatch(/nummerierte Schritte/);
  });

  it("erkennt eine Anleitung auch am Wort im Titel", () => {
    const z = klassifiziere({ title: "Anleitung: Drucker einrichten", content: "Zuerst das Kabel, dann die Software." });
    expect(z.typ).toBe("procedural");
  });

  it("laesst eine Anleitung eine Anleitung bleiben, auch mit Datum", () => {
    // Die Reihenfolge der Regeln ist Absicht: der staerkste Beleg gewinnt.
    const z = klassifiziere({ title: "Backup 2026-01-15", content: "1. Platte anschliessen\n2. Kopieren\n3. Pruefen" });
    expect(z.typ).toBe("procedural");
  });

  it("zaehlt Schritte und Aufzaehlungen getrennt", () => {
    expect(nummerierteSchritte("1. eins\n2. zwei\nkein Schritt\n3) drei")).toBe(3);
    expect(aufzaehlungsZeilen("- a\n* b\n• c\nnormal")).toBe(3);
  });
});

describe("Ereignisse erkennen", () => {
  it("nimmt ein Datum im Titel", () => {
    expect(klassifiziere({ title: "Notiz 2026-03-04", content: "Wir haben ueber den Umbau gesprochen." }).typ).toBe("episodic");
  });
  it("nimmt eine Wendung, die einen Termin nennt", () => {
    expect(klassifiziere({ title: "Besprechung Kanzlei", content: "Fristen durchgegangen." }).typ).toBe("episodic");
  });
  it("nimmt einen Tag, der ein Ereignis benennt", () => {
    expect(klassifiziere({ title: "Umbau", content: "Ein laengerer Text ueber den Ablauf.", tags: ["protokoll"] }).typ).toBe("episodic");
  });
});

describe("Belege erkennen", () => {
  it("erkennt uebernommene Dokumente an der Endung", () => {
    const z = klassifiziere({ title: "Vertrag", content: "Ein laengerer Vertragstext ohne Ablauf.", quelle: "/home/x/vertrag.pdf" });
    expect(z.typ).toBe("reference");
    expect(z.grund).toMatch(/\.pdf/);
  });
  it("erkennt sie am Tag des Rechner-Scans", () => {
    expect(klassifiziere({ title: "Irgendwas", content: "Beliebiger Text aus einer Datei.", tags: ["machine-scan"] }).typ).toBe("reference");
  });
  it("beurteilt die Endung fuer sich", () => {
    expect(istBelegQuelle("/a/b.pdf")).toBe(true);
    expect(istBelegQuelle("/a/b.md")).toBe(false);
    expect(istBelegQuelle(undefined)).toBe(false);
  });
});

describe("Formuliertes Wissen bleibt ein Fakt", () => {
  it("ordnet einen gewoehnlichen Satz als Fakt zu und sagt warum", () => {
    const z = klassifiziere({ title: "Kleinunternehmer", content: "Nach §19 UStG entfaellt die Umsatzsteuer unter der Grenze." });
    expect(z.typ).toBe("semantic");
    expect(z.grund).toBeTruthy();
  });
});

describe("Was gar kein Wissen ist, kommt nicht herein", () => {
  // Der konkrete Anlass: 448 Notizen einer echten Wissensbasis bestanden
  // ausschliesslich aus der Randspalte einer Quelltextansicht.
  const randspalte = Array.from({ length: 30 }, (_, i) =>
    `<a name='L${400 + i}'></a><a href='#L${400 + i}'>${400 + i}</a>`).join("\n");

  it("weist HTML-Zeilennummern ab", () => {
    const u = istUnbrauchbar(randspalte);
    expect(u.unbrauchbar).toBe(true);
  });

  it("weist eine Tabelle immer gleicher Zeilen ab", () => {
    const tabelle = Array.from({ length: 20 }, (_, i) => `Zeile ${i} | Wert ${i} | Stand ${i}`).join("\n");
    expect(istUnbrauchbar(tabelle).unbrauchbar).toBe(true);
  });

  it("laesst KURZE echte Notizen durch", () => {
    // Diese drei stammen aus einer echten Wissensbasis. Eine erste Fassung mit
    // absoluter Wortuntergrenze hat genau sie verworfen — kurz ist nicht Muell.
    for (const t of [
      "Via HTTP API gespeichert, kein tsx noetig",
      "Das Automobil faehrt mit Verbrennungsmotor und Elektroantrieb. Mobilitaet der Zukunft.",
      "Zutaten: Nudeln, Tomaten, Knoblauch, Olivenoel. 15min kochen, al dente servieren.",
    ]) {
      expect(istUnbrauchbar(t), t).toEqual({ unbrauchbar: false });
    }
  });

  it("weist nur Leeres ab, nicht Kurzes", () => {
    expect(istUnbrauchbar("zu kurz").unbrauchbar).toBe(true);
    expect(istUnbrauchbar("Ein vollstaendiger kurzer Gedanke.").unbrauchbar).toBe(false);
  });

  it("misst den Anteil an Auszeichnung", () => {
    expect(markupAnteil("nur Text ohne alles")).toBe(0);
    expect(markupAnteil("<div><span></span></div>x")).toBeGreaterThan(0.5);
  });
});

describe("Aus HTML wird Text, nicht Geruest", () => {
  it("wirft Skript, Stil und Auszeichnung weg", () => {
    const t = htmlZuText(`<html><head><style>a{color:red}</style></head>
      <body><script>alert(1)</script><h1>Titel</h1><p>Erster Absatz.</p><p>Zweiter.</p></body></html>`);
    expect(t).toContain("Titel");
    expect(t).toContain("Erster Absatz.");
    expect(t).not.toContain("alert");
    expect(t).not.toContain("color:red");
    expect(t).not.toContain("<");
  });

  it("macht aus Blockenden Zeilenumbrueche", () => {
    expect(htmlZuText("<p>eins</p><p>zwei</p>")).toBe("eins\nzwei");
  });

  it("loest Entitaeten auf", () => {
    expect(htmlZuText("<p>Fritz &amp; Co. &lt;gut&gt;&nbsp;hier</p>")).toContain("Fritz & Co. <gut> hier");
  });

  it("laesst von einer Randspalte nichts Brauchbares uebrig", () => {
    const t = htmlZuText(randspalteHtml());
    expect(istUnbrauchbar(t).unbrauchbar).toBe(true);
  });

  function randspalteHtml() {
    return Array.from({ length: 30 }, (_, i) =>
      `<a name='L${400 + i}'></a><a href='#L${400 + i}'>${400 + i}</a>`).join("\n");
  }
});

describe("Die restlichen Schranken", () => {
  it("weist lange Inhalte mit kaum Woertern ab", () => {
    // Etwa eine Zahlenkolonne oder ein Auszug voller Satzzeichen.
    const lang = "1234567890 ".repeat(60) + "!!! ??? ... ,,, ;;; ::: ";
    const u = istUnbrauchbar(lang);
    expect(u.unbrauchbar).toBe(true);
    expect(u.grund).toBe("viel Zeichen, kaum Woerter");
  });

  it("weist Inhalte mit kaum VERSCHIEDENEN Woertern ab", () => {
    // Der Fall aus der Wirklichkeit: eine Randspalte, die immer dasselbe Wort
    // neben wechselnden Zahlen wiederholt — aber in einer Zeile, sodass die
    // Zeilenform-Regel nicht greift.
    const eintoenig = Array.from({ length: 60 }, (_, i) => `Zeile ${i}`).join(" ");
    const u = istUnbrauchbar(eintoenig);
    expect(u.unbrauchbar).toBe(true);
    expect(u.grund).toBe("kaum verschiedene Woerter");
  });

  it("loest numerische Entitaeten auf", () => {
    expect(htmlZuText("<p>Caf&#233; &#8211; offen</p>")).toContain("Café");
  });
});

describe("entferneNaviZeilen", () => {
  it("entfernt 'Skip to main content' und Menue-Punkte, behaelt Fliesstext", () => {
    const text = [
      "Skip to main content",
      "Search",
      "arXiv is a free distribution service for scholarly articles.",
      "Log in",
      "Home",
      "Der Text geht hier weiter.",
    ].join("\n");
    const raus = entferneNaviZeilen(text);
    expect(raus).not.toMatch(/skip to main content/i);
    expect(raus).not.toMatch(/^Search$/m);
    expect(raus).not.toMatch(/^Log in$/m);
    expect(raus).not.toMatch(/^Home$/m);
    expect(raus).toContain("arXiv is a free distribution service");
    expect(raus).toContain("Der Text geht hier weiter.");
  });

  it("kennt deutsche Boilerplate und Copyright-Zeilen", () => {
    const text = ["Weiterlesen", "Alle akzeptieren", "© 2026 FangLotse", "Echter Inhalt"].join("\n");
    const raus = entferneNaviZeilen(text);
    expect(raus).not.toMatch(/Weiterlesen/);
    expect(raus).not.toMatch(/Alle akzeptieren/);
    expect(raus).not.toMatch(/© 2026/);
    expect(raus).toContain("Echter Inhalt");
  });

  it("laengere Zeilen, die zufaellig mit einem Schluesselwort beginnen, bleiben stehen", () => {
    const text = "Search strategies for large knowledge bases.\nHome office setups explained.";
    expect(entferneNaviZeilen(text)).toBe(text);
  });

  it("leere Eingabe ergibt Leerstring", () => {
    expect(entferneNaviZeilen("")).toBe("");
  });
});
