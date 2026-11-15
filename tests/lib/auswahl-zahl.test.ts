// Punkt 5, vierter Schlag: die Zahl zu der Wahl, die er wirklich trifft.
//
// Die Flaeche filtert Thema UND Fach zusammen, und ihr Kommentar sagt das auch
// (`Dashboard.tsx:948-949`: "Thema mit gewaehltem Traeger 'Files' zeigt Files-Stuecke mit
// diesem Thema"). Die Zahl, die ins Leere laeuft, nannte bis hierher nur zwei Faelle: ein
// Fach allein, oder ein Thema allein. Zusammen schwieg sie (`:855-858`, der dritte Zweig
// ist `undefined`) - obwohl die Kreuztabelle seit 3.2.108 genau diese Zelle kennt.
//
// An seinem echten Bestand (gemessen 1.11. 13:34, 21 064 Notizen) ist das die einzige Wahl,
// die bei 92 eignen Notizen ueberhaupt etwas zeigen kann: "Termine in eignen Notizen" = 15,
// "Termine in Dokumenten" = 4 476, "Termine in Daten" = 4 172.
//
// Die Grenze ist Teil des Auftrags: zwei Themen sind eine Vereinigung, und ueber Zeilen
// summiert das doppelt. Also bleibt diese Wahl stumm - benannt, nicht versehentlich.
import { describe, it, expect } from "vitest";
import { zahlDerAuswahl, TRAEGER_REIHENFOLGE, type Thema, type Traeger } from "../../src/lib/graphHierarchy";

const T = (n: number) => ({ people: 0, projects: 0, events: n, tasks: 0, guides: 0, links: 0 });

const tuer = {
  bestand: 21064,
  traeger: { notes: 92, files: 10759, code: 0, daten: 10211, anderes: 2 } as Record<Traeger, number>,
  themen: { people: 340, projects: 3985, events: 8663, tasks: 308, guides: 1415, links: 3197 } as Record<Thema, number>,
  themenNachTraeger: {
    notes: { ...T(15), people: 2, projects: 11, tasks: 4, guides: 9, links: 16 },
    files: { ...T(4476), people: 271, projects: 892, tasks: 204, guides: 1039, links: 1816 },
    code: { ...T(0) },
    daten: { ...T(4172), people: 66, projects: 3082, tasks: 100, guides: 367, links: 1363 },
    anderes: { ...T(0), links: 2 },
  } as Record<Traeger, Record<Thema, number>>,
};

describe("zahlDerAuswahl - die Zelle, nicht der Rand", () => {
  it("ein Thema in einem Fach nennt die Zelle", () => {
    expect(zahlDerAuswahl(tuer, ["notes"], ["events"])).toBe(15);
    expect(zahlDerAuswahl(tuer, ["files"], ["events"])).toBe(4476);
    expect(zahlDerAuswahl(tuer, ["daten"], ["projects"])).toBe(3082);
  });

  it("ein Thema in zwei Faechern ist die Summe der Zeilen - exakt, weil ein Fach sich ausschliesst", () => {
    expect(zahlDerAuswahl(tuer, ["notes", "files"], ["events"])).toBe(15 + 4476);
  });

  it("ein Thema ohne Fachwahl bleibt der Rand (alle Zeilen sind gewaehlt)", () => {
    expect(zahlDerAuswahl(tuer, [], ["events"])).toBe(tuer.themen.events);
    expect(zahlDerAuswahl(tuer, [...TRAEGER_REIHENFOLGE], ["events"]))
      .toBe(tuer.themen.events);
  });

  it("ein Fach ohne Thema bleibt die Fachzahl", () => {
    expect(zahlDerAuswahl(tuer, ["daten"], [])).toBe(10211);
  });

  it("zwei Themen schweigen: die Vereinigung kann die Tabelle nicht summen", () => {
    expect(zahlDerAuswahl(tuer, [], ["events", "links"])).toBeUndefined();
    expect(zahlDerAuswahl(tuer, ["files"], ["events", "links"])).toBeUndefined();
  });

  it("zwei Faecher ohne Thema schweigen, wie die Flaeche heute schweigt", () => {
    expect(zahlDerAuswahl(tuer, ["files", "daten"], [])).toBeUndefined();
  });

  it("eine Tuer ohne Kreuztabelle verhaelt sich genau wie vorher", () => {
    const alt = { bestand: 10, traeger: tuer.traeger, themen: tuer.themen };
    expect(zahlDerAuswahl(alt, [], ["events"])).toBe(tuer.themen.events);
    expect(zahlDerAuswahl(alt, ["files"], ["events"])).toBeUndefined();
    expect(zahlDerAuswahl(alt, ["files"], [])).toBe(tuer.traeger.files);
  });

  it("keine Antwort der Tuer, keine Zahl", () => {
    expect(zahlDerAuswahl(null, ["files"], ["events"])).toBeUndefined();
  });
});
