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

// Die Latte an der fairen Konfiguration: 20 Punkte. Grund, gemessen: mem0 fair steht bei
// 51,1 % -- demselben Wert wie unsre eigne v1-Baseline. Bei 20 Punkten faellt die Latte
// genau dann, wenn das ausgelieferte Retrieval auf Baseline-Niveau zurueckfaellt
// (Abstand 0), und sie haelt den tatsaechlichen Abstand von 24,5 Punkten.
const VORSPRUNG_FAIR_PUNKTE = 20;

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

/* P102: der faire mem0-Lauf. Der 2.11-Trace ist eine verschlechterte Konfiguration
   (Fakten-Zerlegung, 3b-Modell). Am 6.11.2026 11:08:34 MEZ wurde mem0 2.2.1 deshalb noch-
   mal gefahren -- ganzes Notiz-Stueck als ein Gedaechtnis, infer=False, Wort-Suche an
   (fastembed 0.9.1; die Warnung "BM25 keyword search disabled" fehlt im Protokoll),
   Einbettung lokal ueber Ollama nomic-embed-text. Zwei frische Speicher, 11:08:34 und
   11:09:37 MEZ: zweimal 23 von 45 Hit@1 = 51,1 %, zweimal 26 von 45 in den fuenf ersten.
   Die Dauer war 2,4 und 2,6 Sekunden, die Spitze 0,15 GiB -- die Leitung hatte am 2.11.
   9,18 GiB fuer den Weg mit Fakt-Zerlegung gemessen.

   Die Zahl ist der Befund, und sie ist unangenehm genug, um sie stehen zu lassen:
   **51,1 % ist genau unsre eigne v1-Baseline** (naive Substring-Suche, 23 von 45). Ein
   kommerzieller Speicher-Dienst kommt auf unsrem Korpus ohne eigne Fakt-Fabrikation auf
   den Wert unsres schlechtesten Beins. Unsre ausgelieferte Rangfolge steht 24,5 Punkte
   darueber. */
describe("Punkt 8, zweites Bein: der faire mem0-Lauf vom 6.11.2026", () => {
  const laden = (name: string) => fs.readFileSync(path.join(WURZEL, "docs/belege/konkurrenz-0611", name), "utf8");
  const fair = (name: string) => {
    const s = laden(name).split("\n").filter(Boolean).map((l) => JSON.parse(l) as Zeile)
      .filter((z): z is Extract<Zeile, { art: "suche" }> => z.art === "suche");
    return { n: s.length, hit1: s.filter((z) => z.treffer).length, in5: s.filter((z) => z.liste.slice(0, 5).some((id) => z.erwartet.includes(id))).length };
  };

  it("zwei frische Speicher, zweimal dieselbe Zahl -- die Konkurrenz-Zahl ist wiederholbar", () => {
    const a = fair("spur-fair-0611.jsonl");
    const b = fair("spur-fair-0611-zwei.jsonl");
    expect(a.n).toBe(QUERIES.length);
    expect(b.n).toBe(QUERIES.length);
    expect([a.hit1, b.hit1], `Lauf eins ${a.hit1}, Lauf zwei ${b.hit1} -- eine Zahl, die nicht wiederkehrt, ist kein Messwert`).toEqual([23, 23]);
    expect([a.in5, b.in5]).toEqual([26, 26]);
    expect(prozent(a.hit1, a.n)).toBe(51.1);
  });

  it("die Latte an der staerkern Konfiguration: 20 Punkte, und unsre Baseline faellt durch", () => {
    const belegt = fs.readFileSync(DREIBEIN, "utf8");
    const mem0 = prozent(fair("spur-fair-0611.jsonl").hit1, QUERIES.length);
    const ausgeliefert = hit1AusBeleg(belegt, "v3-Engine");
    const baseline = hit1AusBeleg(belegt, "v1-Baseline");
    expect(ausgeliefert - mem0, `ausgeliefert ${ausgeliefert} % gegen fairem mem0 ${mem0} %`).toBeGreaterThanOrEqual(VORSPRUNG_FAIR_PUNKTE);
    // Die Gegenprobe, und sie ist scharf: mem0 fair und unsre naive Baseline sind
    // 51,1 gegen 51,1 -- derselbe Abstand 0. Die Latte muss also genau das treffen,
    // was der 2.11-Befund nicht traf: einen Rueckfall auf das schlechteste Bein.
    expect(baseline - mem0, "die Latte laesst unsre naive Baseline gegen mem0 bestehen").toBeLessThan(VORSPRUNG_FAIR_PUNKTE);
  });

  it("das Ergebnis-Protokoll nennt Konfiguration und Korpus, damit die Zahl einen Hersteller hat", () => {
    const e = JSON.parse(laden("ergebnis-fair-0611.json")) as { konfiguration: Record<string, unknown>; korpus: { notizen: number; anfragen: number }; hit1_prozent: number; dauer_sek: number; rss_gib: number };
    expect(e.konfiguration).toEqual({ ganzes_stueck: true, infer: false, einbett: "nomic-embed-text", llm: "llama3.2:3b", top_k: 5 });
    expect(e.korpus).toEqual({ notizen: CORPUS.length, anfragen: QUERIES.length });
    expect(e.hit1_prozent).toBe(51.1);
    expect(e.dauer_sek, "2,4 Sekunden fuer 58 Setz-Vorgaenge und 45 Anfragen -- ohne Fakt-Fabrikation").toBeLessThan(30);
    expect(e.rss_gib, "0,15 GiB Spitze -- die 9,18 GiB vom 2.11. waren der Weg mit Fakt-Zerlegung").toBeLessThan(1);
  });
});

/* P178: die fehlende bge-m3-Stufe der Produkt-Zeile (9.11.2026, 20:06 und 20:06:29 MEZ).
   Das Ledger hatte die zweite Einbett-Stufe fuer sqlite-vec (66,7), chroma (68,9) und
   unsre Spur (77,8) -- nur mem0 stand nur bei nomic (51,1). Dieselbe faire Konfiguration
   (ganzes Stueck, infer=False, mem0s eigne Rangfolge), jetzt bge-m3 (1024 D) ueber Ollama:
   zweimal 31 von 45 Hit@1 = 68,9 %, zweimal 40 von 45 in den fuenf ersten. Dauer 4,7/3,4 s,
   Spitze 0,11 GiB. Der ehrliche Befund steht im Ledger: der Einbett-Hebel hebt mem0 um
   17,8 Punkte (weniger als die +24,5/+26,7 der Verfahrens-Zeilen -- mem0s Rangfolge
   daempft), und der Abstand unsrer Fusion schrumpft auf der zweiten Stufe auf 8,9 Punkte
   (77,8 gegen 68,9). K3PTA fuehrt jede Zeile, aber die Stufe, nicht die Fusion, macht
   den Unterschied -- genau das, was die P118-Berichtigung vermutete. */
describe("Punkt 8, drittes Bein: mem0 fair mit dem zweiten Einbett (bge-m3), 9.11.2026", () => {
  const ladenBg = (name: string) => fs.readFileSync(path.join(WURZEL, "docs/belege/konkurrenz-0911b", name), "utf8");
  const bgem3 = (name: string) => {
    const s = ladenBg(name).split("\n").filter(Boolean).map((l) => JSON.parse(l) as Zeile)
      .filter((z): z is Extract<Zeile, { art: "suche" }> => z.art === "suche");
    return { n: s.length, hit1: s.filter((z) => z.treffer).length, in5: s.filter((z) => z.liste.slice(0, 5).some((id) => z.erwartet.includes(id))).length };
  };

  it("zwei frische Speicher, zweimal dieselbe Zahl -- die Stufe ist wiederholbar", () => {
    const a = bgem3("spur-mem0-bgem3-0911-eins.jsonl");
    const b = bgem3("spur-mem0-bgem3-0911-zwei.jsonl");
    expect(a.n).toBe(QUERIES.length);
    expect(b.n).toBe(QUERIES.length);
    expect([a.hit1, b.hit1], `Lauf eins ${a.hit1}, Lauf zwei ${b.hit1} -- eine Zahl, die nicht wiederkehrt, ist kein Messwert`).toEqual([31, 31]);
    expect([a.in5, b.in5]).toEqual([40, 40]);
    expect(prozent(a.hit1, a.n)).toBe(68.9);
  });

  it("das Ergebnis-Protokoll nennt Konfiguration und Korpus", () => {
    const e = JSON.parse(ladenBg("ergebnis-mem0-bgem3-0911-eins.json")) as { konfiguration: Record<string, unknown>; korpus: { notizen: number; anfragen: number }; hit1_prozent: number; dauer_sek: number; rss_gib: number };
    expect(e.konfiguration.einbett).toBe("bge-m3 (1024 D)");
    expect(e.konfiguration.infer).toBe(false);
    expect(e.korpus).toEqual({ notizen: CORPUS.length, anfragen: QUERIES.length });
    expect(e.hit1_prozent).toBe(68.9);
    expect(e.rss_gib).toBeLessThan(1);
  });

  it("auf der zweiten Einbett-Stufe bleibt unsre Fusion ueber dem Produkt -- die Latte faellt bei Gleichstand", () => {
    // Unsre eigene bge-m3-Spur (P113-Stand, konkurrenz-0611c), hier nachgerechnet.
    const uns = fs.readFileSync(path.join(WURZEL, "docs/belege/konkurrenz-0611c", "spur-uns-bge-m3-0611.jsonl"), "utf8")
      .split("\n").filter(Boolean).map((l) => JSON.parse(l) as { art: string; treffer: boolean })
      .filter((z) => z.art === "suche");
    const unsHit1 = uns.filter((z) => z.treffer).length;
    expect([uns.length, unsHit1, prozent(unsHit1, uns.length)]).toEqual([45, 35, 77.8]);
    const mem0Bg = prozent(bgem3("spur-mem0-bgem3-0911-eins.jsonl").hit1, QUERIES.length);
    // Die Latte sitzt bei 5 Punkten: genau dann faellt sie, wenn unsre Fusion auf
    // mem0s Niveau absinkt. Sie haelt den gemessenen Abstand von 8,9 Punkten.
    expect(prozent(unsHit1, uns.length) - mem0Bg, `unsre bge-Stufe gegen mem0 bge ${mem0Bg}`).toBeGreaterThanOrEqual(5);
  });
});
