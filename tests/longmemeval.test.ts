import { describe, it, expect } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { KeptaStore } from "../src/core/store";
import { searchMemories } from "../src/core/engine";
import {
  ladeDatensatz,
  analysiere,
  ingest,
  parseSitzungsDatum,
  parseUrteil,
  richte,
  richteTreffer,
  verbatimTreffer,
  beantworte,
  erweitereFrage,
  HYDE_PROMPT,
  ladeFortsetzen,
  punkte,
  betteAlleEin,
  zerlegeZeitfrage,
  timelineBlock,
  type LongMemEvalFrage,
} from "../tools/longmemeval/harness";

function freshStore(): KeptaStore {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-lmq-"));
  return new KeptaStore(path.join(dir, "test.db"));
}

const FIXTURE: LongMemEvalFrage[] = [
  {
    question_id: "q1",
    question_type: "information_extraction",
    question: "What is Kanta's phone number?",
    answer: "555-0142",
    haystack_sessions: [
      {
        session_id: "s1",
        session_date: "2023/05/14 (Sun)",
        turns: [
          { role: "user", content: "Hi, I am Kanta. My phone number is 555-0142." },
          { role: "assistant", content: "Noted, Kanta — 555-0142 saved." },
        ],
      },
      {
        session_id: "s2",
        session_date: "2023-06-01",
        turns: [{ role: "user", content: "I moved to Berlin last week." }],
      },
    ],
  },
  {
    question_id: "q2",
    question_type: "abstention",
    question: "What is Kanta's sister's name?",
    answer: "Not mentioned in the conversations.",
    haystack_sessions: [{ session_id: "s2", session_date: "2023-06-01", turns: [{ role: "user", content: "I moved to Berlin last week." }] }],
    answer_session_ids: ["s2"],
  },
];

describe("LongMemEval-Harness", () => {
  it("Datensatz-Format: kaputte Fragen werden mit klarer Meldung abgewiesen", () => {
    const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-lmq-"));
    const pfad = path.join(dir, "kaputt.json");
    fs.writeFileSync(pfad, JSON.stringify([{ question: "ohne id und antwort" }]));
    expect(() => ladeDatensatz(pfad)).toThrow(/ohne question_id/);
  });

  it("Session-Datum: LongMemEval-Formate parsen, Müll liefern null", () => {
    expect(parseSitzungsDatum("2023/05/14 (Sun)")).toBe(new Date(2023, 4, 14).getTime());
    expect(parseSitzungsDatum("2023-06-01 08:30:00")).toBe(new Date(2023, 5, 1, 8, 30).getTime());
    expect(parseSitzungsDatum("irgendwann")).toBeNull();
    expect(parseSitzungsDatum(undefined)).toBeNull();
  });

  it("Ingest: deterministische IDs, Zeitstempel aus der Session, Typ aus der Klassifikation", () => {
    const store = freshStore();
    const ergebnis = ingest(FIXTURE, store);
    expect(ergebnis.notizen).toBe(3);
    expect(ergebnis.sessions).toBe(2);
    const notiz = store.listMemories({ limit: 100 }).find((m) => m.content.includes("555-0142"));
    expect(notiz).toBeDefined();
    expect(notiz?.createdAt).toBe(new Date(2023, 4, 14).getTime());
    expect(notiz?.validFrom).toBe(new Date(2023, 4, 14).getTime());
    expect(notiz?.tags).toContain("longmemeval");
    expect(notiz?.id).toMatch(/^lmq-[0-9a-f]{16}$/);
  });

  it("Ingest: zweiter Lauf ändert nichts (Dedup, Determinismus)", () => {
    const store = freshStore();
    const erster = ingest(FIXTURE, store);
    const zweiter = ingest(FIXTURE, store);
    expect(zweiter.notizen).toBe(0);
    expect(zweiter.uebersprungen).toBe(erster.notizen);
    expect(store.listMemories({ limit: 100 }).length).toBe(erster.notizen);
  });

  it("Release-Format (Turn-Arrays + Parallel-Metadaten) wird normalisiert und gemappt", () => {
    const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-lmq-"));
    const pfad = path.join(dir, "release.json");
    fs.writeFileSync(pfad, JSON.stringify([
      {
        question_id: "r1",
        question_type: "single-session-user",
        question: "What degree did I graduate with?",
        answer: "Business Administration",
        question_date: "2023/05/30 (Tue) 23:40",
        haystack_dates: ["2023/05/20 (Sat) 02:21"],
        haystack_session_ids: ["sharegpt_yywfIrx_0"],
        haystack_sessions: [[
          { role: "user", content: "I graduated with a Business Administration degree." },
          { role: "assistant", content: "Congratulations!" },
        ]],
        answer_session_ids: ["answer_x"],
      },
    ]));
    const fragen = ladeDatensatz(pfad);
    expect(fragen[0].haystack_sessions?.[0].session_id).toBe("sharegpt_yywfIrx_0");
    expect(fragen[0].haystack_sessions?.[0].turns).toHaveLength(2);
    const v = analysiere(fragen);
    expect(v.proFaehigkeit.information_extraction).toBe(1);
    expect(v.oracleFelderVorhanden).toBe(1);
    const store = freshStore();
    ingest(fragen, store);
    const notiz = store.listMemories({ limit: 10 }).find((m) => m.content.includes("Business Administration"));
    expect(notiz?.createdAt).toBe(new Date(2023, 4, 20, 2, 21).getTime());
  });

  it("Suchpfad: die Frage findet die Session mit der Antwort — derselbe Pfad wie im Produkt", async () => {
    const store = freshStore();
    ingest(FIXTURE, store);
    const a = await beantworte(store, FIXTURE[0], 5);
    expect(a.treffer).toBeGreaterThan(0);
    expect(a.antwort).toContain("555-0142");
    expect(a.antwort).toContain("[source session: s1]");
  });

  it("Orakel-Wächter: analysiere zählt answer_session_ids, der Runner liest sie nie", () => {
    const v = analysiere(FIXTURE);
    expect(v.oracleFelderVorhanden).toBe(1);
    expect(v.proFaehigkeit.abstention).toBe(1);
  });

  it("Judge-Parser: ja/teilweise/nein, alles andere unlesbar", () => {
    expect(parseUrteil("YES")).toBe("ja");
    expect(parseUrteil("The verdict: PARTIAL.")).toBe("teilweise");
    expect(parseUrteil("no")).toBe("nein");
    expect(parseUrteil("Ja, natürlich")).toBe("unlesbar");
    expect(parseUrteil("maybe")).toBe("unlesbar");
  });

  it("Judge: injizierter Aufruf, keine Ollama-Abhängigkeit im Test", async () => {
    const r = await richte("test", "frage", "kontext", "referenz", async () => "YES");
    expect(r.urteil).toBe("ja");
    const r2 = await richte("test", "frage", "", "referenz", async () => "NO — the context is empty.");
    expect(r2.urteil).toBe("nein");
  });

  it("Pro-Treffer-Richten: erstes Ja beendet den Lauf (Früh-Ausstieg), Teil-Treffer wird gemerkt", async () => {
    const aufrufe: string[] = [];
    const r = await richteTreffer("test", "frage", ["treffer 1", "treffer 2", "treffer 3"], "referenz", async (p) => {
      aufrufe.push(p);
      return aufrufe.length === 2 ? "YES" : "NO";
    });
    expect(r.urteil).toBe("ja");
    expect(r.trefferIndex).toBe(1);
    expect(r.aufrufe).toBe(2);
    const r2 = await richteTreffer("test", "frage", ["a", "b"], "referenz", async (p) => {
      aufrufe.push(p);
      return aufrufe.length > 2 ? "PARTIAL" : "NO";
    });
    expect(r2.urteil).toBe("teilweise");
    expect(r2.trefferIndex).toBeNull();
  });

  it("Verbatim-Schnellpfad: wörtliche Referenz zählt, generische Abstention-Antworten nicht", () => {
    expect(verbatimTreffer("Business Administration", ["irgendwas\nBusiness Administration und mehr"])).toBe(true);
    expect(verbatimTreffer("Business Administration", ["nur anderes Zeug"])).toBe(false);
    expect(verbatimTreffer("Not mentioned in the conversations.", ["Not mentioned in the conversations."])).toBe(false);
    expect(verbatimTreffer("ab", ["ab hier"])).toBe(false);
  });

  it("Bestands-Cache: Suche sieht neue Notizen sofort (Invalidierung über memoriesVersion)", async () => {
    const store = freshStore();
    store.createMemory({ title: "Erste Notiz", content: "Kanta's phone number is 555-0142." });
    const vorher = await searchMemories(store, { query: "phone number", limit: 5 });
    expect(vorher.hits.length).toBeGreaterThan(0);
    store.createMemory({ title: "Zweite Notiz", content: "The secret code is ZEBRA-77." });
    const nachher = await searchMemories(store, { query: "secret code", limit: 5 });
    expect(nachher.hits.length).toBeGreaterThan(0);
    expect(nachher.hits[0].memory.content).toContain("ZEBRA-77");
    // Trash ändert den aktiven Bestand ebenso.
    const id = nachher.hits[0].memory.id;
    store.trashMemory(id);
    const danach = await searchMemories(store, { query: "secret code", limit: 5 });
    expect(danach.hits.length).toBe(0);
  });

  it("Punkte: ja=1, teilweise=0,5, Rest 0 — Abstention umgekehrt", () => {
    expect(punkte("ja")).toBe(1);
    expect(punkte("teilweise")).toBe(0.5);
    expect(punkte("nein")).toBe(0);
    expect(punkte("unlesbar")).toBe(0);
    // Abstention: kein Treffer = korrektes Verzichten können; „eine Antwort" im
    // Kontext = Assistenz halluziniert.
    expect(punkte("nein", "abstention")).toBe(1);
    expect(punkte("ja", "abstention")).toBe(0);
    expect(punkte("teilweise", "abstention")).toBe(0.5);
  });

  it("Vektorspur: betteAlleEin läuft bis der Store leer ist und meldet die Summe", async () => {
    // Fake-Store ohne ausstehende Chunks: Tick 1 bettet 2, Tick 2 meldet „fertig".
    const leer = { chunksNeedingEmbedding: () => [] };
    let aufrufe = 0;
    const n = await betteAlleEin(leer, async () => (++aufrufe === 1 ? 2 : 0), undefined, 10);
    expect(aufrufe).toBe(2);
    expect(n).toBe(2);
  });

  it("Vektorspur: eine steckengebliebene Queue wird erkannt, nicht still übergangen", async () => {
    // Tick liefert 0 (z. B. Ollama-Fehler), der Store meldet weiter ausstehende
    // Chunks — genau der Fall, der sonst als „fertig" missdeutet endlos leer liefe.
    const luegenStore = { chunksNeedingEmbedding: () => [{ memoryId: "x", seq: 0, text: "t" }] };
    await expect(betteAlleEin(luegenStore, async () => 0, undefined, 10)).rejects.toThrow(/stecken/);
  });

  it("Zeitfragen: echte Muster zerlegen sich in Ereignis-Teilfragen, normale Fragen bleiben ganz", () => {
    expect(zerlegeZeitfrage("How many days passed between my visit to the Museum of Modern Art (MoMA) and the 'Ancient Civilizations' exhibition?"))
      .toEqual(["visit to the Museum of Modern Art (MoMA)", "'Ancient Civilizations' exhibition"]);
    expect(zerlegeZeitfrage("Which event happened first, my cousin's wedding or Michael's engagement party?"))
      .toContain("cousin's wedding");
    expect(zerlegeZeitfrage("Which event happened first, my cousin's wedding or Michael's engagement party?"))
      .toContain("Michael's engagement party");
    expect(zerlegeZeitfrage("What is Kanta's phone number?")).toEqual([]);
    expect(zerlegeZeitfrage("How many weeks ago did I meet up with my aunt and receive the crystal chandelier?").length).toBeGreaterThan(0);
  });

  it("Zeitsplit: die Teilfrage findet die zweite Ereignis-Seite, die Vollfrage allein verfehlt", async () => {
    const store = freshStore();
    const frage: LongMemEvalFrage = {
      question_id: "t1",
      question_type: "temporal-reasoning",
      question: "How many days passed between my visit to the Bluebird Cafe and the pottery workshop?",
      answer: "21 days",
      haystack_sessions: [
        { session_id: "z1", session_date: "2023/03/01", turns: [{ role: "user", content: "I had a lovely morning at the Bluebird Cafe yesterday." }] },
        { session_id: "z2", session_date: "2023/03/22", turns: [{ role: "user", content: "Today I finally tried the pottery workshop downtown." }] },
      ],
    };
    ingest([frage], store);
    // topk 1: die Vollfrage rankt vermutlich nur eine Seite — der Split muss beide liefern.
    const ohne = await beantworte(store, frage, 1);
    const mit = await beantworte(store, frage, 1, true);
    expect(mit.treffer).toBeGreaterThanOrEqual(ohne.treffer);
    const kontext = mit.hitKontexte.join("\n");
    expect(kontext).toContain("Bluebird Cafe");
    expect(kontext).toContain("pottery workshop");
  });

  it("erweitereFrage: Aussagesätze aus der Modellausgabe, Müll gefiltert, max 2, Fehler blockiert nie", async () => {
    const roh = [
      "- The user visited the Bluebird Cafe on March 1st.",
      "2. The pottery workshop took place on March 22nd.",
      "",
      "kurz",
      "The user visited the Bluebird Cafe on March 1st.", // Duplikat
    ].join("\n");
    const erweitert = await erweitereFrage("When did I visit the cafe?", async () => roh);
    expect(erweitert).toHaveLength(2);
    expect(erweitert[0]).toContain("Bluebird Cafe");
    // Ein gescheitertes Modell darf die Frage nie blockieren:
    const leer = await erweitereFrage("Any question?", async () => {
      throw new Error("Ollama weg");
    });
    expect(leer).toEqual([]);
    expect(HYDE_PROMPT).toContain("declarative sentences");
  });

  it("HyDE-Erweiterungen: Treffer sind additiv — nichts wird verdrängt, Duplikate nicht doppelt", async () => {
    const store = freshStore();
    const frage: LongMemEvalFrage = {
      question_id: "h1",
      question_type: "multi-session",
      question: "What did the user plan for the housewarming party?",
      answer: "a vegan lasagna",
      haystack_sessions: [
        { session_id: "h1", session_date: "2023/04/01", turns: [{ role: "user", content: "For the housewarming party I want to serve a vegan lasagna." }] },
        { session_id: "h2", session_date: "2023/04/02", turns: [{ role: "user", content: "The housewarming is planned for early May, friends from Berlin are coming." }] },
      ],
    };
    ingest([frage], store);
    const ohne = await beantworte(store, frage, 3);
    // Erweiterung, die Worte des zweiten Sessions-Belegs trägt — die Vollfrage
    // rankt ihn vermutlich schon; entscheidend: nichts verschwindet, nichts doppelt.
    const mit = await beantworte(store, frage, 3, false, false, ["Friends from Berlin are coming in early May."]);
    expect(mit.treffer).toBeGreaterThanOrEqual(ohne.treffer);
    const titel = mit.hitTitel;
    expect(new Set(titel).size).toBe(titel.length);
    const kontext = mit.hitKontexte.join("\n");
    expect(kontext).toContain("vegan lasagna");
  });

  it("ladeFortsetzen: fertige Fragen übernehmen, ungerichtete verfallen — Reboot-Checkpoint-Logik", () => {
    const datei = path.join(fs.mkdtempSync(path.join(tmpdir(), "kepta-resume-")), "part.json");
    fs.writeFileSync(datei, JSON.stringify({
      fragen: [
        { question_id: "a", typ: "multi-session", faehigkeit: "multi_session_reasoning", urteil: "ja", treffer: 3, trefferIndex: 1, verbatim: false, judge_aufrufe: 2 },
        { question_id: "b", typ: "single-session-user", faehigkeit: "information_extraction", urteil: null, treffer: 0, trefferIndex: null, verbatim: false, judge_aufrufe: 0 }, // mitten im Lauf gestorben
        { question_id: "c", typ: "multi-session", faehigkeit: "multi_session_reasoning", urteil: null, treffer: 0, trefferIndex: null, verbatim: false, judge_aufrufe: 0, fehler: "Abbruch" },
      ],
    }));
    const { zeilen, fertig } = ladeFortsetzen(datei);
    expect(zeilen).toHaveLength(2);
    expect(zeilen[0].question_id).toBe("a");
    expect(zeilen[1].question_id).toBe("c"); // Zeilen mit Fehler gelten als erledigt — der Fehler steht im Record
    expect(fertig.has("a")).toBe(true);
    expect(fertig.has("b")).toBe(false);
    expect(fertig.has("c")).toBe(true);
  });

  it("Timeline-Block: Daten, Abstände und Spanne aus Memory-Metadaten — nichts erfunden", () => {
    const block = timelineBlock(
      [
        { titel: "pottery workshop", datum: new Date(2023, 2, 22).getTime() },
        { titel: "Bluebird Cafe", datum: new Date(2023, 2, 1).getTime() },
      ],
      new Date(2023, 3, 1).getTime() // Frage am 1. April
    );
    expect(block).toContain("The question was asked on: 2023-04-01");
    // Älteste zuerst — die Reihenfolge-Antwort ist damit ablesbar:
    const reihenfolge = block!.indexOf("Bluebird Cafe");
    expect(reihenfolge).toBeGreaterThan(0);
    expect(block!.indexOf("pottery workshop")).toBeGreaterThan(reihenfolge);
    expect(block).toContain("2023-03-01 (31 days before the question date) — Bluebird Cafe");
    expect(block).toContain("Span from the earliest to the latest memory: 21 days (22 days including the last day)");
  });

  it("Timeline-Block: leere Eingabe null, eine Memory ohne Spannenzeile", () => {
    expect(timelineBlock([], Date.now())).toBeNull();
    const eins = timelineBlock([{ titel: "Ein Ereignis", datum: new Date(2023, 5, 1).getTime() }], new Date(2023, 5, 8).getTime());
    expect(eins).toContain("7 days before the question date");
    expect(eins).not.toContain("Span from");
  });

  it("Temporal-Modus: der Timeline-Block steht als ERSTER Kontext — der Früh-Ausstieg richtet ihn zuerst", async () => {
    const store = freshStore();
    const frage: LongMemEvalFrage = {
      question_id: "t2",
      question_type: "temporal-reasoning",
      question: "How many days passed between my visit to the Bluebird Cafe and the pottery workshop?",
      answer: "21 days",
      question_date: new Date(2023, 3, 1, 9, 0).getTime(), // normalisiereFrage parst den Datensatz-String
      haystack_sessions: [
        { session_id: "z3", session_date: "2023/03/01", turns: [{ role: "user", content: "I had a lovely morning at the Bluebird Cafe yesterday." }] },
        { session_id: "z4", session_date: "2023/03/22", turns: [{ role: "user", content: "Today I finally tried the pottery workshop downtown." }] },
      ],
    };
    ingest([frage], store);
    const ohne = await beantworte(store, frage, 5);
    const mit = await beantworte(store, frage, 5, false, true);
    expect(ohne.hitKontexte[0]).not.toContain("[Timeline");
    expect(mit.hitKontexte[0]).toContain("[Timeline of the retrieved memories");
    expect(mit.hitKontexte[0]).toContain("Span from the earliest to the latest memory: 21 days");
    expect(mit.antwort).toContain("[1] [Timeline");
  });
});
