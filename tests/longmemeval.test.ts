import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  analysiere,
  frageScheibe,
  ladeDatensatz,
  parseSitzungsDatum,
  parseUrteil,
  punkte,
  zerlegeZeitfrage,
  verbatimTreffer,
  timelineBlock,
  JUDGE_PROMPT,
  JUDGE_PROMPT_VERSION,
  type LongMemEvalFrage,
} from "../tools/longmemeval/harness";

// tools/longmemeval/README.md behauptete monatelang „9 Tests in
// tests/longmemeval.test.ts" — die Datei existierte nie. Sie ist jetzt die
// Rechenschaft für die Zahl, die öffentlich beworben wird: 61,5 % stehen nur
// dann glaubwürdig im README, wenn das Raster, das sie zählt, selbst getestet
// ist. Alles hier läuft ohne Ollama und ohne Datensatz-Download.

const probe = (teiler: Partial<LongMemEvalFrage>): LongMemEvalFrage => ({
  question_id: "q1",
  question_type: "single-session-user",
  question: "Wann?",
  answer: "Am 3.",
  ...teiler,
});

describe("Wertung — das Raster hinter der veröffentlichten Zahl", () => {
  it("teilweise zählt als halber Punkt — die Genauigkeit ist kein Ja/Nein-Anteil", () => {
    expect(punkte("ja")).toBe(1);
    expect(punkte("teilweise")).toBe(0.5);
    expect(punkte("nein")).toBe(0);
    expect(punkte("unlesbar")).toBe(0);
    // 202 ja + 211 teilweise von 500 ergibt genau die 61,5 %, die in den READMEs
    // steht. Ohne die halben Punkte wären es 40,4 % — die Zahl wäre eine andere.
    const urteile = [...Array(202).fill("ja" as const), ...Array(211).fill("teilweise" as const), ...Array(87).fill("nein" as const)];
    const genauigkeit = urteile.reduce((a, u) => a + punkte(u), 0) / urteile.length;
    expect(genauigkeit).toBeCloseTo(0.615, 3);
  });

  it("Abstention wird umgekehrt gewertet: kein Treffer ist der Punkt", () => {
    expect(punkte("nein", "abstention")).toBe(1);
    expect(punkte("ja", "abstention")).toBe(0);
    expect(punkte("teilweise", "abstention")).toBe(0.5);
  });

  it("der Richter-Prompt misst Kontext-Suffizienz, nicht eine generierte Antwort", () => {
    // Der Kern des Judge-Frames: KEPTA meldet 61,5 %, Zep 63,8 % — das ist nur
    // dann ehrlich, wenn beide Zeilen dasselbe messen. Sie messen es nicht, und
    // dieser Test pinnt, WAS dieses Projekt misst: enthält der geretriefte
    // Kontext die Referenzantwort — es antwortet kein Generator-LLM.
    expect(JUDGE_PROMPT).toMatch(/CONTEXT alone contains the information needed/i);
    expect(JUDGE_PROMPT).toMatch(/Reply with exactly one word/i);
    expect(JUDGE_PROMPT).toMatch(/Do not use outside knowledge/i);
    expect(JUDGE_PROMPT_VERSION).toBe(1);
  });
});

describe("Judge-Antworten lesen", () => {
  it("ja, teilweise und nein — in jeder Schreibweise, die Ollama liefert", () => {
    expect(parseUrteil("yes")).toBe("ja");
    expect(parseUrteil(" YES.")).toBe("ja");
    expect(parseUrteil("Partial")).toBe("teilweise");
    expect(parseUrteil("no")).toBe("nein");
    expect(parseUrteil("NO")).toBe("nein");
  });

  it("ein Satz mit beiden Worten ist unlesbar, nicht geraten", () => {
    expect(parseUrteil("YES and NO")).toBe("unlesbar");
    expect(parseUrteil("Ich weiss es nicht")).toBe("unlesbar");
    // „NONE" darf nicht als NO durchgehen — sonst wird ein Absage-Text zum Punkt.
    expect(parseUrteil("NONE of this matches")).toBe("unlesbar");
  });
});

describe("Verbatim-Schnellpfad", () => {
  it("erkennt die Referenz wörtlich, auch mit anderem Weissraum und Gross/Klein", () => {
    expect(verbatimTreffer("Bluey 2020", ["…released  BLUEY   2020 in May"])).toBe(true);
    expect(verbatimTreffer("bluey 2020", ["nichts Verwandtes hier"])).toBe(false);
  });

  it("blockiert die Pfade, die einen Punkt nur vortäuschen", () => {
    // Zu kurze Nadeln findet jeder Text; Abstentions-Antworten stecken überall.
    expect(verbatimTreffer("42", ["die Antwort 42 steht hier"])).toBe(false);
    expect(verbatimTreffer("not mentioned", ["the document is not mentioned anywhere"])).toBe(false);
    expect(verbatimTreffer("   ", ["irgendwas"])).toBe(false);
  });
});

describe("Fragen-Scheiben (Tuning und Holdout)", () => {
  const zehn = Array.from({ length: 10 }, (_, i) => i);

  it("limit nimmt den Anfang, offset den Rest — zwei Slices ohne Überlapp", () => {
    const tuning = frageScheibe(zehn, 0, 6);
    const holdout = frageScheibe(zehn, 6, Infinity);
    expect(tuning).toEqual([0, 1, 2, 3, 4, 5]);
    expect(holdout).toEqual([6, 7, 8, 9]);
    expect(tuning.filter((f) => holdout.includes(f))).toEqual([]);
  });

  it("offset ohne limit ist der volle Rest, ein Lauf über alles bleibt unverändert", () => {
    expect(frageScheibe(zehn, 3, Infinity)).toEqual([3, 4, 5, 6, 7, 8, 9]);
    expect(frageScheibe(zehn, 0, Infinity)).toEqual(zehn);
    expect(frageScheibe(zehn, 20, 5)).toEqual([]);
  });
});

describe("Zeit-Hebel der Harness", () => {
  it("Session-Daten werden zu Zeitstempeln — das Format des Datensatzes", () => {
    expect(parseSitzungsDatum("2023/02/01 (Wed) 10:20")).toBe(new Date(2023, 1, 1, 10, 20).getTime());
    expect(parseSitzungsDatum("2023-02-01")).toBe(new Date(2023, 1, 1, 0, 0).getTime());
    expect(parseSitzungsDatum("irgendwann im Februar")).toBeNull();
    expect(parseSitzungsDatum(undefined)).toBeNull();
    // Ein unmöglicher Monat darf nicht still auf Januar fallen.
    expect(parseSitzungsDatum("2023-13-01")).toBeNull();
  });

  it("Zeitfragen zerlegen in Ereignis-Teilfragen, Nicht-Zeitfragen bleiben unberührt", () => {
    const teile = zerlegeZeitfrage("How many days passed between my cousin's wedding and the job interview?");
    expect(teile).toEqual(["cousin's wedding", "job interview"]);
    expect(zerlegeZeitfrage("What is my cat's name?")).toEqual([]);
  });

  it("der Timeline-Block trägt Datum, Abstand und Spanne aus den Memory-Daten", () => {
    expect(timelineBlock([], 0)).toBeNull();
    const aelter = new Date(2023, 0, 10).getTime();
    const juenger = new Date(2023, 0, 20).getTime();
    const block = timelineBlock(
      [{ titel: "Job interview", datum: juenger }, { titel: "Cousin wedding", datum: aelter }],
      new Date(2023, 0, 25).getTime()
    );
    expect(block).not.toBeNull();
    // Ältester Treffer zuerst — die Timeline ist eine Reihenfolge, keine Liste.
    expect(block!.indexOf("Cousin wedding")).toBeLessThan(block!.indexOf("Job interview"));
    expect(block).toContain("2023-01-10");
    expect(block).toContain("15 days before the question date");
    expect(block).toContain("Span from the earliest to the latest memory: 10 days");
  });
});

describe("Datensatz laden", () => {
  const schreibe = (objekt: unknown): string => {
    const pfad = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kepta-lme-")), "datensatz.json");
    fs.writeFileSync(pfad, JSON.stringify(objekt));
    return pfad;
  };

  it("normalisiert Freitext-Daten und zählt Fähigkeiten wie Orakel-Felder", () => {
    const pfad = schreibe([
      {
        question_id: "a", question_type: "temporal-reasoning", question: "Wie lang?", answer: "3 Tage",
        question_date: "2023-02-01 (Wed) 10:20",
        haystack_sessions: [[{ role: "user", content: "erster Tag" }]],
        haystack_session_ids: ["s1"],
      },
      { question_id: "b", question_type: "single-session-user", question: "Wer?", answer: "Anna", answer_session_ids: ["s1"] },
    ]);
    const fragen = ladeDatensatz(pfad);
    expect(fragen).toHaveLength(2);
    expect(fragen[0].haystack_sessions?.[0].session_id).toBe("s1");
    expect(fragen[0].question_date).toBe(new Date(2023, 1, 1, 10, 20).getTime());
    const verteilung = analysiere(fragen);
    expect(verteilung.fragen).toBe(2);
    expect(verteilung.proFaehigkeit.temporal_reasoning).toBe(1);
    expect(verteilung.sessionsGesamt).toBe(1);
    expect(verteilung.oracleFelderVorhanden).toBe(1);
  });

  it("weist kaputte Datensätze ab, statt mit leeren Fragen zu laufen", () => {
    expect(() => ladeDatensatz(schreibe({ not: "ein array" }))).toThrow(/kein Array/);
    expect(() => ladeDatensatz(schreibe([]))).toThrow(/leer/);
    expect(() => ladeDatensatz(schreibe([{ question: "ohne id und antwort" }]))).toThrow(/ohne question_id/);
  });
});
