/* Punkt 8, zweite Konkurrenz-Stufe: sqlite-vec als reines Cosinus-KNN.

   P102 hat das Bein selbst benannt (`P102-MEM0-FAIR-0611.md`, Abschnitt "Was offen bleibt"):
   "sqlite-vec als reines Vektor-KNN (misst, was unsre Hybrid-Fusion gegen einfaches
   cosinus-KNN gewinnt)". Gefahren 6.11.2026 16:40:55 und 16:40:58 MEZ in einer eignen Kapsel
   (/tmp/konk-sqlitevec-0611: python 3.14.7, apsw, sqlite-vec 0.1.9; die sqlite-Bibliothek im
   apsw ist 3.54.1, nicht die 3.50.4 des Systems -- die Zahl nennt, was gemessen wurde).

   Was die Kapsel tut und was nicht: dieselben 58 Notiztexte aus `scripts/eval-corpus.ts`
   (gegen die mem0-Kapsel nachgeprueft: identisch), dieselben 45 Anfragen, dasselbe Einbett
   (nomic-embed-text, 768 Dimensionen, Ollama nur auf 127.0.0.1), dann **nur** Cosinus-KNN mit
   k = 5. Keine Wort-Suche, keine RRF-Fusion, kein Zeitstrahl, keine Entitaeten. Das ist die
   Konfiguration, die ein reiner Vektor-Speicher ausliefert -- nicht eine verschlechterte
   eigne, und derselbe Vorwurf, der am 2.11. gegen den Fakten-Lauf erhoben wurde, gilt hier
   nicht.

   Gemessen: **Hit@1 19 von 45 = 42,2 %**, Recall@5 26 von 45 = 57,8 %. Die ausgelieferte
   Rangfolge steht am gleichen Korpus bei 75,6 % (34 von 45, `tag-0311/eval-drei-beine-1352`),
   die naive Substring-Baseline bei 51,1 %. Ein reiner Vektor-Speicher liegt also **unter**
   unsrer eignen Baseline, und die Fusion gewinnt 33,4 Punkte gegen ihn.

   Die scharfe Zahl sitzt in den Kategorien: temporal **0 von 3**, umschreibung **0 von 10**.
   Cosinus allein beantwortet auf diesem Korpus keine einzige Zeitfrage und keine einzige
   Umformulierung. */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CORPUS, QUERIES } from "../scripts/eval-corpus";

const WURZEL = path.resolve(import.meta.dirname, "..");
const BELEG = path.join(WURZEL, "docs/belege/konkurrenz-0611b");
const SPUR_EINS = path.join(BELEG, "spur-sqlitevec-0611.jsonl");
const SPUR_ZWEI = path.join(BELEG, "spur-sqlitevec-0611-zwei.jsonl");
const ERG_EINS = path.join(BELEG, "ergebnis-sqlitevec-0611.json");
const ERG_ZWEI = path.join(BELEG, "ergebnis-sqlitevec-0611-zwei.json");
const DREIBEIN = path.join(WURZEL, "docs/belege/tag-0311/eval-drei-beine-1352.log.txt");

// Die Latte: 30 Punkte Abstand zwischen ausgelieferter Rangfolge und reinem KNN.
// Gewaehlt, weil sie zwei Dinge trennt und einen nicht durchlaesst: faellt unsre
// Auslieferung auf reine Vektor-Suche zurueck (42,2), ist der Abstand 0 -- rot. Faellt sie
// auf die naive Baseline (51,1), ist der Abstand 8,9 -- rot. Der gemessliche Abstand ist 33,4.
const VORSPRUNG_PUNKTE = 30;

type Zeile =
  | { art: "setze"; i: number; note: string; text: string }
  | { art: "suche"; i: number; kategorie: string; frage: string; erwartet: string[]; top: string; treffer: boolean; liste: string[] }
  | { art: string };

const zeilen = (pfad: string): Zeile[] =>
  fs.readFileSync(pfad, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Zeile);
const suchen = (pfad: string) =>
  zeilen(pfad).filter((z): z is Extract<Zeile, { art: "suche" }> => z.art === "suche");
const setzen = (pfad: string) => zeilen(pfad).filter((z) => z.art === "setze").length;
const prozent = (treffer: number, n: number) => Math.round((100 * treffer) / n * 10) / 10;

/** Die ausgelieferte Zahl aus dem eignen Eval-Beleg, am Abschnittsnamen erkannt. */
function hit1AusBeleg(legbe: string) {
  const text = fs.readFileSync(DREIBEIN, "utf8");
  const schnitt = text.split("── ").find((t) => t.startsWith(legbe)) ?? "";
  const m = /Hit@1:\s+(\d+(?:[.,]\d+)?)\s*%/.exec(schnitt);
  return m ? Number(m[1].replace(",", ".")) : NaN;
}

describe("Punkt 8: sqlite-vec als reines Cosinus-KNN, am selben Korpus gemessen", () => {
  it("der Trace traegt seinen eignen Korpus -- derselbe, den die App auswertet", () => {
    expect(setzen(SPUR_EINS), "der Trace setzt nicht unsre Notizen").toBe(CORPUS.length);
    expect(suchen(SPUR_EINS).length, "der Trace fragt nicht unsre Anfragen").toBe(QUERIES.length);
  });

  it("die Notiztexte sind dieselben wie im Korpus der App", () => {
    const imTrace = zeilen(SPUR_EINS)
      .filter((z): z is Extract<Zeile, { art: "setze" }> => z.art === "setze")
      .map((z) => [z.note, z.text] as const);
    const imQuelltext = CORPUS.map((n) => [n.id, n.content] as const);
    expect(imTrace, "der Trace hat andere Texte als scripts/eval-corpus.ts").toEqual(imQuelltext);
  });

  it("Hit@1 wird aus dem Trace gerechnet, nicht aus dem Papier", () => {
    const s = suchen(SPUR_EINS);
    const hit1 = s.filter((z) => z.treffer).length;
    expect(hit1, "die erste Antwort nennt nicht 19 von 45 Zielen").toBe(19);
    expect(prozent(hit1, s.length)).toBe(42.2);
    expect(s.every((z) => z.treffer === z.erwartet.includes(z.top)), "treffer und top sind nicht dasselbe Urteil").toBe(true);
  });

  it("Recall@5 aus dem Trace, und er stimmt mit dem Ergebnis-Artefakt", () => {
    const s = suchen(SPUR_EINS);
    const in5 = s.filter((z) => z.liste.slice(0, 5).some((id) => z.erwartet.includes(id))).length;
    const erg = JSON.parse(fs.readFileSync(ERG_EINS, "utf8")) as { hit1: number; recall5_in_den_5: number; hit1_prozent: number };
    expect([in5, erg.recall5_in_den_5], "Trace und Artefakt zaehlen verschiedene Recall@5").toEqual([26, 26]);
    expect([erg.hit1, erg.hit1_prozent], "das Artefakt nennt eine andre Zahl als der Trace").toEqual([19, 42.2]);
  });

  it("zwei Laeufe, dieselbe Rangfolge -- eine Zahl, die nicht wiederkehrt, ist kein Messwert", () => {
    const a = suchen(SPUR_EINS);
    const b = suchen(SPUR_ZWEI);
    expect(a.length).toBe(b.length);
    expect(a.map((z) => z.liste), "die Rangfolge ist nicht wiederholbar").toEqual(b.map((z) => z.liste));
    expect([a.filter((z) => z.treffer).length, b.filter((z) => z.treffer).length]).toEqual([19, 19]);
  });

  it("die ausgelieferte Rangfolge haelt den Abstand gegen reines KNN", () => {
    const ausgeliefert = hit1AusBeleg("v3-Engine");
    const baseline = hit1AusBeleg("v1-Baseline");
    expect(Number.isNaN(ausgeliefert), "die v3-Zahl ist im Eval-Beleg nicht zu finden").toBe(false);
    expect(ausgeliefert - 42.2, `Abstand nur ${ausgeliefert - 42.2} Punkte`).toBeGreaterThanOrEqual(VORSPRUNG_PUNKTE);
    // Dieselbe Latte an der Baseline: 51,1 - 42,2 = 8,9, also faellt sie, wenn das
    // ausgelieferte Retrieval auf Baseline zurueckfaellt. Das ist der Grund, warum sie
    // ueber der Baseline sitzt und nicht unter ihr.
    expect(baseline - 42.2, "die v1-Baseline laege schon ueber der Latte").toBeLessThan(VORSPRUNG_PUNKTE);
  });

  it("die scharfen Kategorien: reines KNN kennt weder Zeit noch Umformulierung", () => {
    const nach = JSON.parse(fs.readFileSync(ERG_EINS, "utf8")) as { nach_kategorie: Record<string, { anfragen: number; hit1: number; hit1_prozent: number }> };
    expect([nach.nach_kategorie.temporal.anfragen, nach.nach_kategorie.temporal.hit1], "Zeitfragen waren doch nicht 0 von 3").toEqual([3, 0]);
    expect([nach.nach_kategorie.umschreibung.anfragen, nach.nach_kategorie.umschreibung.hit1], "Umformulierungen waren doch nicht 0 von 10").toEqual([10, 0]);
    expect([nach.nach_kategorie.lexikalisch.anfragen, nach.nach_kategorie.lexikalisch.hit1], "lexikalisch traf anders als 15 von 25").toEqual([25, 15]);
  });

  it("die Konfiguration im Artefakt sagt, was abgestellt war", () => {
    const e = JSON.parse(fs.readFileSync(ERG_EINS, "utf8")) as { konfiguration: Record<string, unknown>; korpus: { notizen: number; anfragen: number }; dauer_sek: number; rss_gib: number };
    expect(e.konfiguration.nur_vektoren).toBe(true);
    expect([e.konfiguration.wort_suche, e.konfiguration.fusion, e.konfiguration.zeitstrahl, e.konfiguration.entitaeten]).toEqual([false, false, false, false]);
    expect([e.konfiguration.einbett, e.konfiguration.dim, e.konfiguration.k]).toEqual(["nomic-embed-text", 768, 5]);
    expect([e.korpus.notizen, e.korpus.anfragen], "das Artefakt nennt einen andern Umfang").toEqual([58, 45]);
    expect(e.dauer_sek, "ein Lauf ueber 30 s ist nicht derselbe Griff").toBeLessThan(30);
    expect(e.rss_gib, "ein Lauf ueber 1 GiB ist nicht derselbe Griff").toBeLessThan(1);
  });
});

describe("Punkt 111: dasselbe Bein mit einem zweiten Einbett -- die Modell-Aussage zurueckgenommen", () => {
  /* Die erste Fassung dieses Belegs schrieb: "reines KNN trifft 0 von 3 Zeitfragen und 0 von
     10 Umformulierungen", und nannte das die Begruendung fuer BM25, RRF, Zeitstrahl und
     Entitaeten. Nachgeprueft 16:52:30 und 16:52:51 MEZ mit bge-m3 (1024 D), sonst
     unveraendert: **6 von 10 Umformulierungen, 1 von 3 Zeitfragen, Hit@1 30 von 45 = 66,7 %.**
     Der Satz war eine Modell-Aussage, keine Verfahrensaussage. Diese Faelle halten die
     berichtigte Lesung -- auch gegen mich selbst, wenn ich sie das naechste Mal wieder
     vergesse. */

  const SPUR_BGE = path.join(BELEG, "spur-sqlitevec-bge-m3.jsonl");
  const SPUR_BGE_ZWEI = path.join(BELEG, "spur-sqlitevec-bge-m3-zwei.jsonl");
  const ERG_BGE = path.join(BELEG, "ergebnis-sqlitevec-bge-m3.json");

  it("das zweite Einbett ist eine andre Zahl, nicht derselbe Lauf", () => {
    const e = JSON.parse(fs.readFileSync(ERG_BGE, "utf8")) as { konfiguration: Record<string, unknown>; hit1: number; hit1_prozent: number };
    expect([e.konfiguration.einbett, e.konfiguration.dim], "das Artefakt nennt nicht bge-m3 mit 1024 Dimensionen").toEqual(["bge-m3", 1024]);
    const s = suchen(SPUR_BGE);
    expect(s.length).toBe(QUERIES.length);
    expect(s.filter((z) => z.treffer).length, "das zweite Einbett trifft nicht 30 von 45").toBe(30);
    expect(e.hit1_prozent).toBe(66.7);
  });

  it("auch der zweite Einbett-Lauf ist wiederholbar", () => {
    const a = suchen(SPUR_BGE);
    const b = suchen(SPUR_BGE_ZWEI);
    expect(a.map((z) => z.liste), "die Rangfolge des zweiten Einbetts ist nicht wiederholbar").toEqual(b.map((z) => z.liste));
  });

  it("die berichtigte Kategorie-Zahl: Umformulierungen treffen sehr wohl", () => {
    const nach = JSON.parse(fs.readFileSync(ERG_BGE, "utf8")) as { nach_kategorie: Record<string, { anfragen: number; hit1: number }> };
    expect([nach.nach_kategorie.umschreibung.anfragen, nach.nach_kategorie.umschreibung.hit1], "die Berichtigung gilt nicht: Umformulierungen").toEqual([10, 6]);
    expect([nach.nach_kategorie.temporal.anfragen, nach.nach_kategorie.temporal.hit1], "die Berichtigung gilt nicht: Zeitfragen").toEqual([3, 1]);
    expect(nach.nach_kategorie.lexikalisch.hit1, "lexikalisch traf anders als 20 von 25").toBe(20);
  });

  it("der Abstand zur Auslieferung schrumpft auf derselben Einbettstufe -- die Latte haelt nur im Gleich-Stufen-Vergleich", () => {
    const ausgeliefert = hit1AusBeleg("v3-Engine");
    const gleichStufen = ausgeliefert - 42.2;
    const andreStufe = ausgeliefert - 66.7;
    expect(gleichStufen, "der Gleich-Stufen-Abstand ist nicht mehr der gemessene").toBeGreaterThanOrEqual(VORSPRUNG_PUNKTE);
    // Und die ehrliche Grenze: mit einem andren Einbett gilt die Latte NICHT. Der Fall
    // sichert die Berichtigung, nicht eine Bequemlichkeit.
    expect(andreStufe, "die Latte haelt angeblich auch gegen ein zweites Einbett").toBeLessThan(VORSPRUNG_PUNKTE);
    expect(Math.round((gleichStufen - andreStufe) * 10) / 10, "der Abstand zwischen den beiden Stufen ist nicht 24,5 Punkte").toBe(24.5);
  });
});
