/* Punkt 8, die Konkurrenz-Latte: eine Zahl, die am Mitbewerber gemessen ist, nicht an unsrer
   eignen Ablation.

   Der Lauf stammt vom 2.11.2026 (Leitung, `P8-MEM0-LAUF-0211.md`): mem0 2.2.1 in einer eignen
   Kapsel, derselbe Korpus aus `scripts/eval-corpus.ts` -- 58 Notizen, 45 Anfragen -- dasselbe
   Mass (Hit@1 = die erste Antwort nennt eine der Ziel-IDs).

   Warum diese Datei den Trace nachrechnet und nicht die Zahl vergleicht: das Papier der
   Leitung haelt als Haltezahl **62,2 % (28/45)** fest, und sein Artefakt (`ergebnis-fair.json`)
   lag in `/tmp` und existiert nicht mehr. Der dauerhafte Trace, der in der Mappe liegt, ist der
   Fakten-Zerlegungs-Lauf mit `llama3.2:3b`, und der sagt **11 von 45 = 24,4 %**. Ein Waechter,
   der eine Zahl vergleicht, die niemand mehr oeffnen kann, ist eine Inschrift, keine Messung.
   Also: hier steht, was das Artefakt traegt. Die 62,2 % sind damit nicht widerlegt -- sie sind
   nicht nachrechenbar, und der faire Lauf muss gefahren werden, bevor aussen jemand
   "gegen mem0" schreibt (P101, Abschnitt "Was offen bleibt").

   Die Latte sitzt absichtlich **ueber** unsrer eignen v1-Baseline: 51,1 % - 24,4 % = 26,7
   Punkte, also faellt sie, wenn das ausgelieferte Retrieval auf naive Substring-Suche
   zurueckfaellt. Ein Band, das auch die Baseline durchlaesst, heisst nicht Latte. */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CORPUS, QUERIES } from "../scripts/eval-corpus";

const WURZEL = path.resolve(import.meta.dirname, "..");
const SPUR = path.join(WURZEL, "docs/belege/konkurrenz-0211/spur-fakten-3b-vollstaendig.jsonl");
const DREIBEIN = path.join(WURZEL, "docs/belege/tag-0311/eval-drei-beine-1352.log.txt");

const VORSPRUNG_PUNKTE = 30;

type Zeile =
  | { art: "setze"; i: number; note: string }
  | { art: "suche"; kategorie: string; erwartet: string[]; top: string; treffer: boolean; liste: string[] }
  | { art: string };

const zeilen = (): Zeile[] => fs.readFileSync(SPUR, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Zeile);
const suchen = () => zeilen().filter((z): z is Extract<Zeile, { art: "suche" }> => z.art === "suche");
const prozent = (treffer: number, n: number) => Math.round((100 * treffer) / n * 10) / 10;

/** Eine Legbe-Zahl aus dem Eval-Beleg, am Abschnittsnamen erkannt. */
function hit1AusBeleg(text: string, legbe: string) {
  const schnitt = text.split("── ").find((t) => t.startsWith(legbe)) ?? "";
  const m = /Hit@1:\s+(\d+(?:[.,]\d+)?)\s*%/.exec(schnitt);
  return m ? Number(m[1].replace(",", ".")) : NaN;
}

describe("Punkt 8: die ausgelieferte Rangfolge traegt den Abstand gegen mem0", () => {
  it("der Trace traegt seinen eignen Korpus -- derselbe, den die App auswertet", () => {
    // Ein Vergleich zweier Korpuse ist kein Vergleich. Die Zahlen muessen aus dem
    // Quelltext des Korpus kommen, nicht aus dem Papier.
    expect(zeilen().filter((z) => z.art === "setze").length, "der Trace setzt nicht unsre Notizen").toBe(CORPUS.length);
    expect(suchen().length, "der Trace fragt nicht unsre Anfragen").toBe(QUERIES.length);
  });

  it("die Treffer-Marke im Trace ist nachrechenbar, nicht nur behauptet", () => {
    const s = suchen();
    // Ein Artefakt, das sein eignes Mass nicht selbst pruefen laesst, ist ein Protokoll
    // ueber eine Behauptung.
    expect(s.every((z) => z.treffer === z.erwartet.includes(z.top)), "treffer und top sind nicht dasselbe Urteil").toBe(true);
    expect(s.filter((z) => z.treffer).length, "der dauerhafte Trace sagt 11 von 45").toBe(11);
    expect(prozent(11, s.length)).toBe(24.4);
  });

  it("der Abstand gegen mem0 haelt -- und faellt bei eigner Regression", () => {
    const belegt = fs.readFileSync(DREIBEIN, "utf8");
    const mem0 = prozent(suchen().filter((z) => z.treffer).length, suchen().length);
    const ausgeliefert = hit1AusBeleg(belegt, "v3-Engine");
    const baseline = hit1AusBeleg(belegt, "v1-Baseline");
    expect(ausgeliefert, "der Drei-Beine-Beleg nennt keine v3-Legbe").not.toBeNaN();
    expect(ausgeliefert - mem0, `ausgeliefert ${ausgeliefert} % gegen mem0 ${mem0} %`).toBeGreaterThanOrEqual(VORSPRUNG_PUNKTE);
    // Die Gegenprobe an unsrer eignen Baseline: 51,1 - 24,4 = 26,7 Punkte, also muss die
    // Latte dort fallen. Faellt sie nicht, ist sie eine Erlaubnis, kein Mass.
    expect(baseline - mem0, "die Latte laesst unsre eigene naive Baseline durch").toBeLessThan(VORSPRUNG_PUNKTE);
  });

  it("die Kategorie-Spalte des Traces ist vollstaendig, damit niemand einen Schnitt erfindet", () => {
    const s = suchen();
    expect([...new Set(s.map((z) => z.kategorie))].sort()).toEqual(["ablenkung", "graph", "lexikalisch", "temporal", "umschreibung"]);
    // Die zwei Achsen, die den Ausschlag geben: wo ein Vektor-Dienst daheim sein sollte
    // (umschreibung) und wo die Ablenkungen liegen. Aus dem Trace gezaehlt, nicht abgeschrieben.
    expect(s.filter((z) => z.kategorie === "umschreibung" && z.treffer).length).toBe(1);
    expect(s.filter((z) => z.kategorie === "umschreibung").length).toBe(10);
    expect(s.filter((z) => z.kategorie === "ablenkung" && z.treffer).length).toBe(0);
  });
});
