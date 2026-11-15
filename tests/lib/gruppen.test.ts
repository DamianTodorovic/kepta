import { describe, it, expect } from "vitest";
import { traeger, themen, gruppen, type Traeger, type Thema } from "../../src/core/klassifikation";
import {
  gruppenVonNotiz, gruppenEtikett,
  TRAEGER_LABELS, TRAEGER_REIHENFOLGE, TRAEGER_HINWEISE,
  THEMA_LABELS, THEMA_REIHENFOLGE, THEMA_HINWEISE,
} from "../../src/lib/graphHierarchy";

// NEUN WÖRTER IN ZWEI ZEILEN — Regelwerk, 14.10.2026 (Scheibe WA).
// Vorgabe: audit-2026-10-09/WA-GRUPPEN-VORSCHLAG-2026-10-14.md Abschnitt 5.
//
// Zeile 1 (woher) ist erschoepfend und ueberschneidungsfrei: notes | files | code.
// Zeile 2 (worum) sind kombinierbare Filter: people, projects, events, tasks,
// guides, links — und sie greifen NUR in notes und files, NIE in code.
//
// Die Code-Sperre ist Teil der Abnahme, kein Detail: wuerden die Themen-Woerter
// ueber Code laufen, blaht sich Files auf 52,7 % und Events auf 25,8 % — die
// Faelschung, an der der Money-Korb gestorben ist (2.970 Treffer, 13 eigene).

const gescannt = (pfad: string, endung: string, inhalt: string, titel = "stick") => ({
  title: titel,
  content: `${inhalt}\n\n— Source: ${pfad}`,
  tags: ["machine-scan", endung],
  quelle: pfad,
});

describe("Zeile 1 — der Traeger entscheidet zuerst", () => {
  it("gescanntes JSON ist Daten, nicht Code — 9 860 von 9 978 am echten Bestand", () => {
    const m = gescannt("/Users/beispiel/theme/locales/zh-TW.schema.json", "json", '{ "price": "Preis" }');
    expect(traeger(m).traeger).toBe("daten");
  });

  it("ein echtes Programm bleibt Code", () => {
    const m = gescannt("/Users/beispiel/src/server.ts", "ts", "export const a = 1;");
    expect(traeger(m).traeger).toBe("code");
  });

  it("eine Endung, die niemand kennt, ist kein Dokument — sie heisst anderes", () => {
    // Bis 3.2.96 fiel jede unbekannte Endung in `files` (`klassifikation.ts:224`). Ein Korb, der
    // aufnimmt, was sonst nirgends hing, teilt nichts ein: er versteckt die eigne Luecke.
    const m = gescannt("/Users/beispiel/Sonstiges/altedaten.xyz", "xyz", "was auch immer");
    expect(traeger(m).traeger).toBe("anderes");
  });

  it("gescanntes Markdown ist Files", () => {
    const m = gescannt("/Users/beispiel/Notes/Meeting.md", "md", "Wir haben die Fristen durchgegangen.");
    expect(traeger(m).traeger).toBe("files");
  });

  it("eigene, selbst getippte Notiz ist Notes", () => {
    const m = { title: "Zutaten besorgen", content: "Milch, Mehl, Olivenoel.", tags: [] as string[] };
    expect(traeger(m).traeger).toBe("notes");
  });

  it("ohne Scan-Marke und ohne Quelle bleibt Notes — die Zeile ist erschoepfend", () => {
    const m = { title: "Merken", content: "Der Tresor liegt im Schluesselbund." };
    expect(traeger(m).traeger).toBe("notes");
  });

  it("liefert immer genau einen der fuenf Werte, nie einen sechsten", () => {
    const faelle = [
      { title: "a", content: "b" },
      gescannt("/x/y.ts", "ts", "export const a = 1;"),
      gescannt("/x/y.pdf", "pdf", "Vertrag"),
      gescannt("/x/y.json", "json", '{ "a": 1 }'),
      gescannt("/x/y.xyz", "xyz", "fremd"),
      { title: "c", content: "d", tags: ["machine-scan"] },
    ];
    const erlaubt = ["notes", "files", "code", "daten", "anderes"];
    for (const m of faelle) expect(erlaubt).toContain(traeger(m).traeger);
  });

  it("der echte Quellpfad entscheidet, nicht das Tag — 1.420 Faelle im Bestand", () => {
    // Als .md exportierter Code: Quelldatei .json, Endungs-Marke im Tag .md.
    const m = {
      title: "zh-TW.schema — 918 — 2/2",
      content: '{ "cancellation": "取消" }\n\n— Source: /Users/beispiel/theme/locales/zh-TW.schema.json',
      tags: ["machine-scan", "md"],
    };
    expect(traeger(m).traeger).toBe("daten");
  });

  it("fehlt der Pfad, zaehlt die Endungs-Marke im Tag", () => {
    const m = { title: "walker", content: "for (const x of ys) {}", tags: ["machine-scan", "ts"] };
    expect(traeger(m).traeger).toBe("code");
    expect(traeger(m).grund).toContain("Tag");
  });

  it("fehlt beides, zaehlt das Aussehen", () => {
    const m = { title: "config", content: "export interface Opts {\n  a: string;\n}", tags: ["machine-scan"] };
    expect(traeger(m).traeger).toBe("code");
    expect(traeger(m).grund).toContain("Aussehen");
  });
});

describe("Zeile 2 — Themen, aber nie in Code", () => {
  it("ein echtes Programm bekommt KEIN Themenwort, auch wenn alle sechs drinstehen", () => {
    const alles = [
      "Kontakt: Weber, Telefon 0153 160413, e-mail: w@example.org",
      "Projekt angelshop Sprint release",
      "2026-10-12 meeting termin gestern",
      "TODO to-do frist deadline next steps zu tun",
      "anleitung how-to setup schritt 1 so geht",
      "https://example.org www.example.org github",
    ].join("\n");
    const m = gescannt("/src/theme/locales.ts", "ts", alles);
    expect(traeger(m).traeger).toBe("code");
    expect(themen(m)).toEqual([]);
    const g = gruppen(m);
    expect(g.traeger).toBe("code");
    expect(g.themen).toEqual([]);
  });

  /**
   * Die Nebenwirkung von Fix 2, ausdrucklich festgehalten: die Sperre "Code bekommt nie ein
   * Themenwort" galt an seinem Bestand gegen 9 978 Stuecke, von denen 9 860 JSON waren
   * (gemessen 16.10.). Seit JSON `daten` heisst, hoelt die Sperre diese fast zehntausend
   * Notizen nicht mehr ein - sie trifft nur noch die echten Programme. Das ist kein Nebeneffekt,
   * den man uebersieht, sondern der Grund, warum die Zeile 2 ueberhaupt etwas erzaehlt.
   */
  it("Daten bekommen ein Themenwort — die Sperre traf bisher JSON, nicht Programme", () => {
    const m = gescannt("/x/y.json", "json", "Kontakt: Weber, Telefon 0153 160413, e-mail: w@example.org");
    expect(traeger(m).traeger).toBe("daten");
    expect(themen(m)).toContain("people");
  });

  it("gescanntes Markdown mit Rechnungswort ist Files mit Task- und People-Signal", () => {
    const m = gescannt(
      "/Users/beispiel/Buchhaltung/rechnung-sanwa.md", "md",
      "Rechnung über 480 Euro. Zahlbar bis 20.11., fällig. Kontakt: Weber, Telefon 0153 160413.",
      "Rechnung Sanwa",
    );
    expect(traeger(m).traeger).toBe("files");
    const t = themen(m);
    expect(t).toContain("tasks");
    expect(t).toContain("people");
  });

  it("eigene Notiz ohne Signal bleibt ohne Themenwort — und damit sichtbar in Notes", () => {
    const m = { title: "Kurzer Gedanke", content: "Vielleicht später einmal anders ansehen.", tags: [] as string[] };
    expect(traeger(m).traeger).toBe("notes");
    expect(themen(m)).toEqual([]);
  });

  it("mehrere Themen zugleich sind erlaubt — die Zeile 2 ist ein Filter, keine Zuordnung", () => {
    const m = { title: "Kanzlei Amberg", content: "Meeting 2026-10-12 mit Frau Peck, nächste Schritte: Angebot schreiben.", tags: [] as string[] };
    const t = themen(m);
    expect(t).toContain("events");
    expect(t).toContain("people");
    expect(t).toContain("projects");
  });

  it("liefert keine Doppelungen und hält die Reihenfolge der Vorgabe", () => {
    const m = { title: "Repo", content: "TODO 2026-10-12 https://example.org anleitung", tags: [] as string[] };
    const t = themen(m);
    expect(new Set(t).size).toBe(t.length);
    const Ordnung: Thema[] = ["people", "projects", "events", "tasks", "guides", "links"];
    expect(t).toEqual([...t].sort((a, b) => Ordnung.indexOf(a) - Ordnung.indexOf(b)));
  });
});

describe("Flächenschicht — die neun Wörter kommen aus einer Quelle", () => {
  it("beide Zeilen haben je ein Etikett und einen Hinweis, in Alltagssprache", () => {
    expect(TRAEGER_REIHENFOLGE).toEqual(["notes", "files", "code", "daten", "anderes"]);
    expect(THEMA_REIHENFOLGE).toEqual(["people", "projects", "events", "tasks", "guides", "links"]);
    expect(TRAEGER_LABELS.code).toBe("Code");
    for (const [key, hinweis] of Object.entries(TRAEGER_HINWEISE)) {
      expect(hinweis.length, key).toBeGreaterThan(10);
      // Kein Hinweis darf sein eigenes Wort wiederholen — das war der Echo-Fehler
      // der alten Tipps („Fact — Facts & connections").
      expect(hinweis.toLowerCase()).not.toContain(TRAEGER_LABELS[key as Traeger].toLowerCase());
    }
    for (const [key, hinweis] of Object.entries(THEMA_HINWEISE)) {
      expect(hinweis.length, key).toBeGreaterThan(10);
      expect(hinweis.toLowerCase()).not.toContain(THEMA_LABELS[key as Thema].toLowerCase());
    }
  });

  it("gruppenVonNotiz und gruppenEtikett rechnen wie der Kern", () => {
    const notiz = { id: "a1", updatedAt: 1, title: "Kanzlei Amberg", content: "Meeting 2026-10-12 mit Frau Peck.\n\n— Source: /x/y.md", tags: ["machine-scan", "md"] };
    expect(gruppenVonNotiz(notiz).traeger).toBe("files");
    expect(gruppenVonNotiz(notiz).themen).toEqual(["people", "projects", "events"]);
    expect(gruppenEtikett(notiz)).toBe("Files · People, Projects, Events");
  });

  it("der Puffer vertauscht nichts: gleiche id + updatedAt liefert dieselbe Antwort, eine neue Rechnung rechnet neu", () => {
    const basis = { id: "p1", updatedAt: 5, title: "walker", content: "export const a = 1;\n\n— Source: /r/walker.ts", tags: ["machine-scan", "ts"] };
    const erste = gruppenVonNotiz(basis);
    expect(gruppenVonNotiz(basis)).toBe(erste);
    // Gleich id, aber neu gespeichert und ohne Quellpfad: es wird neu gerechnet,
    // der Puffer darf nicht die alte Antwort zurueckgeben.
    const spaeter = { ...basis, updatedAt: 9, content: "Notiz über den Walker, ohne Datei dahinter.", tags: [] as string[] };
    expect(gruppenVonNotiz(spaeter).traeger).toBe("notes");
  });

  it("ein Programm traegt im Etikett 'Code' — die Sperre ist auch in der Flaeche sichtbar", () => {
    expect(gruppenEtikett({ title: "walker", content: "export const walk = 1;\n\n— Source: /src/walker.ts", tags: ["machine-scan", "ts"] }))
      .toBe("Code");
  });

  it("und dasselbe Etikett nennt JSON 'Data', weil JSON kein Programm ist", () => {
    expect(gruppenEtikett({ title: "schema", content: '{ "price": "Preis" }\n\n— Source: /t/zh-TW.schema.json', tags: ["machine-scan", "json"] }))
      .toBe("Data");
  });
});

describe("Zusammen — neun Wörter, zwei Achsen", () => {

  it("gruppen() trägt Traeger, Grund und Themen zusammen", () => {
    const g = gruppen(gescannt("/x/y.md", "md", "Besprechung 2026-10-12 mit Kunde Weber."));
    expect(g.traeger).toBeTypeOf("string");
    expect(g.grund).toContain("md");
    expect(Array.isArray(g.themen)).toBe(true);
    expect(g.themen).toContain("events");
  });

  it("die vier inneren Arten bleiben unangetastet (kein Schema-Umbau, kein MCP-Enum)", async () => {
    const fs = await import("fs");
    const quelle = fs.readFileSync(new URL("../../src/core/klassifikation.ts", import.meta.url), "utf8");
    expect(quelle).toContain('export type WissensTyp = "semantic" | "episodic" | "procedural" | "reference"');
  });
});
