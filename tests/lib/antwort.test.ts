// @vitest-environment node
import { describe, it, expect } from "vitest";
import { inForm } from "../../src/lib/antwort";

// Der Vertrag einer Grenze: fremde Daten dürfen die eigene Form nicht
// verletzen. Was hier fehlt, ist nicht "später abgefangen", sondern gar nicht
// möglich.

interface Karte { wer: string; count: number; notizen: { id: string; title: string }[] }
interface Antwort { seit: number; aktiv: boolean; karten: Karte[]; hinweis: string }

// Die Schablone erklärt die Form — ein Muster-Element ist Form, nicht Inhalt.
const LEER: Antwort & { archiv?: string } = { seit: 0, aktiv: false, karten: [{ wer: "", count: 0, notizen: [] }], hinweis: "" };
// So sieht die geleerte Antwort aus, wenn nichts kommt.
const KEINE: Antwort = { seit: 0, aktiv: false, karten: [], hinweis: "" };

describe("inForm — eine Antwort in der eigenen Form", () => {
  it("setzt fehlende Felder aus der Schablone", () => {
    expect(inForm({ seit: 12 }, LEER)).toEqual({ seit: 12, aktiv: false, karten: [], hinweis: "" });
  });

  it("setzt eine fehlende Liste leer — das Muster-Element ist Form, nicht Inhalt", () => {
    expect(inForm({}, LEER).karten).toEqual([]);
    expect(inForm({ karten: "drei" }, LEER).karten).toEqual([]);
  });

  it("lässt false und 0 stehen — sie sind Werte, keine Lücken", () => {
    const wert = { seit: 0, aktiv: false, hinweis: "" };
    expect(inForm(wert, LEER)).toEqual(KEINE);
    expect(inForm({ ...LEER, seit: 0 }, LEER).seit).toBe(0);
  });

  it("tauscht einen Wert der falschen Art gegen die Schablone", () => {
    expect(inForm({ seit: "zwölf" }, LEER).seit).toBe(0);
    expect(inForm({ hinweis: 7 }, LEER).hinweis).toBe("");
    expect(inForm({ aktiv: "ja" }, LEER).aktiv).toBe(false);
    expect(inForm({ seit: Number.NaN }, LEER).seit).toBe(0);
  });

  it("macht aus einem Nicht-Array eine leere Liste", () => {
    expect(inForm({ karten: "drei" }, LEER).karten).toEqual([]);
    expect(inForm({ karten: { 0: "a" } }, LEER).karten).toEqual([]);
  });

  it("füllt verschachtelte Objekte bis in die Tiefe", () => {
    const eine: Karte = { wer: "claude", count: 2, notizen: [{ id: "n1", title: "T" }] };
    const aus = inForm({ karten: [{ wer: "claude" }] }, LEER);
    expect(aus.karten).toHaveLength(1);
    expect(aus.karten[0]).toEqual({ wer: "claude", count: 0, notizen: [] });
    // Die volle Form bleibt unverändert.
    expect(inForm({ karten: [eine] }, LEER).karten[0]).toEqual(eine);
  });

  it("lässt ein Feld, das die Schablone nicht kennt, in Ruhe", () => {
    // Die Grenze schützt vor fehlenden Feldern. Ein überzähliges Feld liest
    // niemand — es zu löschen wäre ein zweiter, schlimmerer Fehler: eine
    // optionale Angabe, die die Schablone nicht aufzählt, wäre still weg.
    const aus = inForm({ seit: 1, archiv: "versteckt" }, LEER);
    expect(aus.archiv).toBe("versteckt");
    expect(aus.seit).toBe(1);
  });

  it("hält die Schablone für eine leere und für eine nicht existente Antwort", () => {
    expect(inForm(null, LEER)).toEqual(KEINE);
    expect(inForm(undefined, LEER)).toEqual(KEINE);
    expect(inForm("text statt objekt", LEER)).toEqual(KEINE);
    expect(inForm([], LEER)).toEqual(KEINE);
  });

  it("verändert die Schablone nicht — sie wird geteilt", () => {
    inForm({ karten: [] }, LEER);
    const eine = inForm({ karten: [{ wer: "x" }] }, LEER);
    eine.karten[0].count = 9;
    expect(LEER.karten).toHaveLength(1);
    expect(LEER.seit).toBe(0);
  });

  it("lässt eine Liste ohne Muster-Element unverändert", () => {
    const notizen = [{ id: "a" }, { id: "b" }];
    const aus = inForm({ notizen }, { notizen: [] as { id: string; title: string }[] });
    expect(aus.notizen).toBe(notizen);
  });

  it("lässt ein freies Objekt, dessen Schablone nichts erklärt", () => {
    const aus = inForm({ hinweis: "x", karten: [] }, { seit: 0, aktiv: false, karten: [], hinweis: "", ...{} } as Antwort & { frei?: Record<string, number> });
    expect(aus.hinweis).toBe("x");
    // Eine Schablone ohne Feld ist die Anmeldung eines freien Objekts — sie
    // darf den Inhalt nicht still löschen.
    const frei = inForm({ claude: 3, cursor: 1 }, { } as Record<string, number>);
    expect(frei).toEqual({ claude: 3, cursor: 1 });
    expect(inForm("text", {} as Record<string, number>)).toEqual({});
  });

  it("funktioniert mit einer Schablone aus lauter leeren Listen", () => {
    interface Dossier { facts: { id: string }[]; todos: { id: string; title: string; text: string }[] }
    const leer: Dossier = { facts: [], todos: [] };
    expect(inForm({ facts: [{ id: "1" }] }, leer)).toEqual({ facts: [{ id: "1" }], todos: [] });
  });
});
