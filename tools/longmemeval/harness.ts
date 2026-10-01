// KEPTA × LongMemEval — Runner.
//
// Ziel: ≥ 70 % auf LongMemEval, reproduzierbar, als öffentliches Asset.
// Methodik siehe README.md im selben Ordner. Der Datensatz kommt von der
// offiziellen Quelle (Hugging Face, tools/longmemeval/lade-datensatz.mjs) und
// wird NICHT ins Repo committed — nur sein SHA-256 landet im Ergebnis-JSON.
//
// Aufruf:  npx tsx tools/longmemeval/harness.ts <datensatz> [--analyse]
//          [--limit N] [--topk K] [--modell NAME] [--store PFAD] [--ohne-judge]

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { KeptaStore } from "../../src/core/store";
import { searchMemories } from "../../src/core/engine";
import { saveWithIndex } from "../../src/core/mcp";
import { APP_VERSION } from "../../src/core/version";
import { DEFAULT_EMBED_MODEL, EmbeddingQueue, ollamaAvailable } from "../../src/core/embeddings";

/** Eine LongMemEval-Frage im normalisierten Format (Felder, die der Runner braucht). */
export interface LongMemEvalFrage {
  question_id: string;
  /** Feiner Datensatz-Typ (z. B. single-session-user) — für den Bericht. */
  question_type: string;
  question: string;
  answer: string;
  /** Wann die Frage gestellt wurde (Release-Format „2023/02/01 (Wed) 10:20") — das „heute" der Frage. */
  question_date?: number;
  /** Haystack-Sessions mit Sprecher, Zeit und Inhalt — Grundlage für den Ingest. */
  haystack_sessions?: { session_id: string; session_date?: string; turns?: { role: string; content: string }[] }[];
  /** Nur im -oracle-Split vorhanden; im vollen Test KEINE Benutzung. */
  answer_session_ids?: string[];
}

/**
 * Die fünf Fähigkeiten des Benchmarks (Wu et al., ICLR 2025) und die Zuordnung
 * der feineren Datensatz-Typen (single-session-user, multi-session, …) — das
 * Release nutzt die feineren Werte, das Paper die fünf Gruppen.
 */
const FAEHIGKEITEN = [
  "information_extraction",
  "multi_session_reasoning",
  "temporal_reasoning",
  "knowledge_updates",
  "abstention",
] as const;
type Faehigkeit = (typeof FAEHIGKEITEN)[number];

const FAEHIGKEIT_ZUORDNUNG: Record<string, Faehigkeit> = {
  "single-session-user": "information_extraction",
  "single-session-assistant": "information_extraction",
  "single-session-adversarial": "information_extraction",
  "multi-session": "multi_session_reasoning",
  "temporal-reasoning": "temporal_reasoning",
  "knowledge-update": "knowledge_updates",
  abstention: "abstention",
};

function faehigkeitVon(typ: string): Faehigkeit | null {
  return FAEHIGKEIT_ZUORDNUNG[typ] ?? null;
}

export interface Verteilung {
  fragen: number;
  proFaehigkeit: Record<Faehigkeit, number>;
  sessionsGesamt: number;
  oracleFelderVorhanden: number;
}

/**
 * Datensatz laden, normalisieren und grob validieren — wirft mit einer klaren
 * Meldung bei kaputtem Format. Das Release-Format hält Sessions als Turn-Arrays
 * mit Metadaten in Parallel-Arrays (haystack_session_ids, haystack_dates); das
 * in fragen-format.md dokumentierte Objekt-Format bleibt auch gültig.
 */
export function ladeDatensatz(pfad: string): LongMemEvalFrage[] {
  const roh = JSON.parse(fs.readFileSync(pfad, "utf8")) as unknown;
  if (!Array.isArray(roh)) throw new Error(`Datensatz ist kein Array: ${pfad}`);
  const fragen = (roh as Record<string, unknown>[]).map(normalisiereFrage);
  if (fragen.length === 0) throw new Error("Datensatz ist leer.");
  const kaputt = fragen.filter((f) => !f.question_id || !f.question || !f.answer);
  if (kaputt.length > 0) throw new Error(`${kaputt.length} Fragen ohne question_id/question/answer.`);
  return fragen;
}

/** Release- und Doku-Format auf die eine interne Form bringen. */
function normalisiereFrage(roh: Record<string, unknown>): LongMemEvalFrage {
  const frageId = String(roh.question_id ?? "");
  const rohSessions = roh.haystack_sessions;
  const idFeld = roh.haystack_session_ids as string[] | undefined;
  const datumsFeld = roh.haystack_dates as string[] | undefined;
  const sessions = Array.isArray(rohSessions)
    ? (rohSessions as unknown[]).map((s, i) => {
        if (Array.isArray(s)) {
          return {
            session_id: String(idFeld?.[i] ?? `${frageId}#s${i}`),
            session_date: typeof datumsFeld?.[i] === "string" ? datumsFeld[i] : undefined,
            turns: s as { role: string; content: string }[],
          };
        }
        const obj = s as { session_id?: string; session_date?: string; turns?: { role: string; content: string }[] };
        return {
          session_id: String(obj.session_id ?? idFeld?.[i] ?? `${frageId}#s${i}`),
          session_date: obj.session_date ?? (typeof datumsFeld?.[i] === "string" ? datumsFeld[i] : undefined),
          turns: obj.turns ?? [],
        };
      })
    : [];
  return {
    question_id: frageId,
    question_type: String(roh.question_type ?? "unbekannt"),
    question: String(roh.question ?? ""),
    answer: String(roh.answer ?? ""),
    question_date: parseSitzungsDatum(typeof roh.question_date === "string" ? roh.question_date : undefined) ?? undefined,
    haystack_sessions: sessions,
    answer_session_ids: Array.isArray(roh.answer_session_ids) ? (roh.answer_session_ids as string[]) : undefined,
  };
}

/** Frageverteilung pro Fähigkeit — Sichtprüfung des Datensatzes. */
export function analysiere(fragen: LongMemEvalFrage[]): Verteilung {
  const proFaehigkeit = Object.fromEntries(FAEHIGKEITEN.map((f) => [f, 0])) as Record<Faehigkeit, number>;
  let sessionsGesamt = 0;
  let oracleFelderVorhanden = 0;
  for (const f of fragen) {
    const faehigkeit = faehigkeitVon(f.question_type);
    if (faehigkeit) proFaehigkeit[faehigkeit] += 1;
    sessionsGesamt += f.haystack_sessions?.length ?? 0;
    if (f.answer_session_ids?.length) oracleFelderVorhanden += 1;
  }
  return { fragen: fragen.length, proFaehigkeit, sessionsGesamt, oracleFelderVorhanden };
}

// ── Phase 1: Ingest ──
//
// Jede Haystack-Session wird über DIESELBE Store-API geschrieben wie im
// Produktbetrieb (createMemory mit Typ-Klassifikation) — kein Sonderweg, kein
// Sonderindex. Determinismus: die Memory-ID ist ein Hash aus session_id und
// Turn-Index, der Zeitstempel kommt aus dem Session-Datum; ein zweiter Lauf
// über denselben Store ändert nichts (Dedup über session_id).

export interface IngestErgebnis {
  /** Eindeutige Sessions, die im Store landeten. */
  sessions: number;
  /** Erzeugte Memories (= Turns). */
  notizen: number;
  /** Sessions, die wegen bereits vorhandener Memories übersprungen wurden. */
  uebersprungen: number;
  /** Sessions ohne auswertbares Datum (Zeitstempel fällt auf 1970). */
  ohneDatum: number;
}

/** Session-Datum → ms. Release: „2023/05/20 (Sat) 02:21“ — Datum + Uhrzeit, deterministisch ohne Zeitzone. */
export function parseSitzungsDatum(roh: string | undefined): number | null {
  if (!roh) return null;
  const m = roh.match(/(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})(?:\D+?(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const jahr = Number(m[1]);
  const monat = Number(m[2]);
  const tag = Number(m[3]);
  if (monat < 1 || monat > 12 || tag < 1 || tag > 31) return null;
  return new Date(jahr, monat - 1, tag, Number(m[4] ?? 0), Number(m[5] ?? 0)).getTime();
}

export function ingest(fragen: LongMemEvalFrage[], store: KeptaStore): IngestErgebnis {
  const ergebnis: IngestErgebnis = { sessions: 0, notizen: 0, uebersprungen: 0, ohneDatum: 0 };
  const gesehen = new Set<string>();
  for (const frage of fragen) {
    for (const session of frage.haystack_sessions ?? []) {
      if (!session.session_id || gesehen.has(session.session_id)) continue;
      gesehen.add(session.session_id);
      const zeit = parseSitzungsDatum(session.session_date);
      if (zeit === null) ergebnis.ohneDatum += 1;
      const zeitstempel = zeit ?? 0;
      let neu = 0;
      (session.turns ?? []).forEach((turn, i) => {
        const inhalt = `${turn.role}: ${turn.content ?? ""}`.trim();
        if (!inhalt || inhalt === `${turn.role}:`) return;
        const id = memoryId(session.session_id, i);
        // Per-Turn-Dedup: auch ein Teil-Neulauf einer Session ändert nichts.
        if (store.getMemory(id)) {
          ergebnis.uebersprungen += 1;
          return;
        }
        const titel = (turn.content ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || `Turn ${i + 1}`;
        saveWithIndex(store, {
          id,
          title: titel,
          content: `${inhalt}\n\n[source session: ${session.session_id}]`,
          tags: ["longmemeval"],
          createdAt: zeitstempel,
          updatedAt: zeitstempel,
          validFrom: zeit ?? undefined,
        });
        neu += 1;
        ergebnis.notizen += 1;
      });
      if (neu > 0) ergebnis.sessions += 1;
    }
  }
  return ergebnis;
}

/** Deterministische Memory-ID: Hash aus session_id + Turn-Index (kein Zufall, kein Clock-Bezug). */
function memoryId(sessionId: string, turn: number): string {
  return `lmq-${crypto.createHash("sha1").update(`${sessionId}#${turn}`).digest("hex").slice(0, 16)}`;
}

// ── Phase 1b: Vektorspur ──
//
// Die Engine aktiviert das Vektor-Bein automatisch, sobald Chunks mit dem
// Embedding-Modell-Label existieren — der Eval-Store hatte sie nur nie. Diese
// Phase bettet alle ausstehenden Chunks über DIESELBE Queue wie im Produkt
// ein. Ohne Ollama bleibt der Lauf rein lexikalisch (Baseline reproduzierbar).

/**
 * Läuft die Embedding-Queue bis keine ausstehenden Chunks mehr bleiben.
 * `tick: () => Promise<number>` liefert je Runde die verarbeitete Menge —
 * 0 heißt entweder „fertig" oder „Fehler"; der Blick in den Store
 * (chunksNeedingEmbedding) unterscheidet beides, sonst würde ein Fehler
 * endlos stillschweigend übergangen.
 */
export async function betteAlleEin(
  store: Pick<KeptaStore, "chunksNeedingEmbedding">,
  tick: () => Promise<number>,
  fortschritt?: (eingebettet: number) => void,
  maxRunden = 200_000
): Promise<number> {
  let gesamt = 0;
  for (let runde = 0; runde < maxRunden; runde++) {
    const n = await tick();
    gesamt += n;
    if (n === 0) {
      const rest = store.chunksNeedingEmbedding(1).length;
      if (rest === 0) return gesamt;
      throw new Error(`Embedding-Queue bleibt stecken: ${rest} Chunks ohne Vektor.`);
    }
    fortschritt?.(gesamt);
  }
  throw new Error(`Embedding-Lauf über ${maxRunden} Runden — Abbruch.`);
}

// ── Phase 2: Antworten ──
//
// DER EINE Suchpfad des Produkts (engine.searchMemories: FTS5-BM25 + Vektoren +
// Graph → RRF → Boosts). KEINE answer_session_ids, kein Orakel. Was KEPTA
// zurückgibt, ist der Antwortkontext — der Judge bewertet, ob er die
// Referenzantwort trägt (Retrieval-Fairness: das Produkt ist die Gedächtnis-
// Schicht, der Assistenz-Text entstünde beim Kunden auf ihrer Basis).

export interface AntwortErgebnis {
  antwort: string;
  treffer: number;
  usedVectors: boolean;
  /** Ein Kontext-Text je Treffer — Grundlage für das pro-Treffer-Richten. */
  hitKontexte: string[];
  /** Titel der Treffer in Reihenfolge — die Diagnose-Basis im Bericht. */
  hitTitel: string[];
}

// Zeitfragen („How many days passed between X and Y?") brauchen BEIDE Ereignis-
// notizen im Kontext — eine einzige Suchanfrage findet oft nur die eine Seite.
// Der Split ist frage-getrieben (Datumswörter im Fragetext), nicht typ-getrieben,
// und ruft nur den EINEN Produktsuchpfad mehrfach auf — kein Orakel, kein
// Sonderweg.

export const ZEITFRAGE_MUSTER =
  /\bhow many (days|weeks|months|years)\b|\bhow (long|long ago|much time)\b|\bpassed between\b|\bhappened first\b|\bin the order\b/i;

const FRAGEWORT_PRÄFIX = /^(?:how|which|what|when|where|who|did|do|does|was|were|is|are|the|my|i)\b\s*/i;

/** Zerlegt eine Zeitfrage in Ereignis-Teilfragen (max. 3, je ≥ 3 Wörter); [] für keine Zeitfrage. */
export function zerlegeZeitfrage(frage: string): string[] {
  if (!ZEITFRAGE_MUSTER.test(frage)) return [];
  const teile = frage
    .split(/,|\b(?:between|and|or)\b/i)
    .map((s) => s.trim().replace(FRAGEWORT_PRÄFIX, "").replace(/\?+$/, "").trim())
    // Frag-Rahmen-Fetzen („many days passed“, „weeks ago did“) sind keine
    // Ereignisse — sie enthalten die Zeitrechnungs-Wörter selbst. Nach dem
    // Artikel-Strip sind echte Ereignisse manchmal nur 2 Wörter („cousin's
    // wedding“) — deshalb ≥ 2, der Rahmen-Filter trägt die Qualität.
    .filter((s) => s.split(/\s+/).length >= 2 && !/\b(many|much|passed|ago|happened|order)\b/i.test(s))
    .filter((s) => /[a-z]{5,}/i.test(s));
  return [...new Set(teile)].slice(0, 3);
}

/**
 * Timeline-Block für Zeitfragen — reine Memory-Metadaten, kein Orakel.
 *
 * Der Judge bewertet Treffer EINZELN (Früh-Ausstieg, Pilotbefund 21.9.), eine
 * „Tage zwischen X und Y“-Antwort liegt aber nie in EINEM Treffer — sie liegt
 * in den DATUMEN zweier Notizen. Der Block trägt deshalb die Zeitstempel der
 * geretrieveden Memories selbst zusammen: Datum je Notiz, Abstand zum
 * Fragendatum, Spanne von ältester zu jüngster Memory. Dieselbe Info, die das
 * Produkt über „date-aware prompting“ in Kontexte schreibt — hier konzentriert.
 */
export function timelineBlock(
  memorien: { titel: string; datum: number }[],
  heute: number
): string | null {
  if (memorien.length === 0) return null;
  const tag = 86_400_000;
  const iso = (t: number) => {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const sortiert = [...memorien].sort((a, b) => a.datum - b.datum);
  const zeilen = sortiert.map((m) => {
    const abstand = Math.round((heute - m.datum) / tag);
    const relativ = abstand >= 0 ? `${abstand} days before the question date` : `${-abstand} days after the question date`;
    return `- ${iso(m.datum)} (${relativ}) — ${m.titel}`;
  });
  const spanne = Math.round((sortiert[sortiert.length - 1].datum - sortiert[0].datum) / tag);
  const spannenZeile = sortiert.length >= 2 && spanne > 0
    ? `Span from the earliest to the latest memory: ${spanne} days (${spanne + 1} days including the last day).`
    : "";
  return [
    "[Timeline of the retrieved memories — every date below comes from the memory records]",
    `The question was asked on: ${iso(heute)}`,
    ...zeilen,
    spannenZeile,
  ].filter(Boolean).join("\n");
}

/**
 * HyDE-lite: die Frage wird vom lokalen Modell in 1–2 kurze AUSSAGESÄTZE
 * umgeschrieben — so würde ein Dokument formulieren, das die Antwort enthält.
 * Multi-Session-Fragen scheitern oft am Wortlaut-Abstand zwischen Frage und
 * Beleg; die Aussagesätze schließen genau diese Lücke. Die zusätzlichen
 * Treffer sind ADDITIV (wie beim Zeitsplit) — die Vollfrage-Rankings bleiben
 * vorne, nichts wird verdrängt.
 */
export const HYDE_PROMPT = `Rewrite the question as 1-2 short declarative sentences that a document containing the answer would state. Reply only with the sentences, nothing else.

QUESTION: {frage}`;

export async function erweitereFrage(frage: string, rufen: (prompt: string) => Promise<string>): Promise<string[]> {
  let roh: string;
  try {
    roh = await rufen(HYDE_PROMPT.replace("{frage}", frage));
  } catch {
    return []; // Eine gescheiterte Erweiterung darf die Frage nie blockieren.
  }
  return [...new Set(
    roh
      .split(/\n+/)
      .map((z) => z.replace(/^[-*\d.)\s]+/, "").trim())
      .filter((z) => z.split(/\s+/).length >= 4 && /[a-z]{5,}/i.test(z))
  )].slice(0, 2);
}

export async function beantworte(
  store: KeptaStore,
  frage: LongMemEvalFrage,
  topk = 8,
  zeitsplit = false,
  temporal = false,
  erweiterungen: string[] = []
): Promise<AntwortErgebnis> {
  const such = await searchMemories(store, { query: frage.question, limit: topk });
  if (such.hits.length === 0) return { antwort: "", treffer: 0, usedVectors: such.usedVectors, hitKontexte: [], hitTitel: [] };
  const hits = [...such.hits];
  if (zeitsplit) {
    // Teilfragen liefern NUR zusätzliche Kandidaten — die Vollfrage-Rankings
    // bleiben vorne, nichts wird verdrängt, nur der Kontext wird vollständiger.
    const gesehen = new Set(hits.map((h) => h.memory.id));
    for (const teil of zerlegeZeitfrage(frage.question)) {
      const s = await searchMemories(store, { query: teil, limit: 5 });
      for (const h of s.hits) {
        if (gesehen.has(h.memory.id)) continue;
        gesehen.add(h.memory.id);
        hits.push(h);
      }
    }
  }
  // HyDE-Erweiterungen: derselbe additive Weg wie der Zeitsplit — Aussagesätze
  // schließen den Wortlaut-Abstand zwischen Frage und Beleg, verdrängen nichts.
  if (erweiterungen.length > 0) {
    const gesehen = new Set(hits.map((h) => h.memory.id));
    for (const satz of erweiterungen) {
      const s = await searchMemories(store, { query: satz, limit: 5 });
      for (const h of s.hits) {
        if (gesehen.has(h.memory.id)) continue;
        gesehen.add(h.memory.id);
        hits.push(h);
      }
    }
  }
  const kontextTreffer = hits.slice(0, topk + 6);
  const hitKontexte = kontextTreffer.map((h) => {
    const datum = new Date(h.memory.createdAt).toISOString().slice(0, 10);
    return `(${datum}, score ${h.score.toFixed(3)}) ${h.memory.title}\n${h.memory.content}`;
  });
  if (temporal && ZEITFRAGE_MUSTER.test(frage.question)) {
    // Die Timeline steht VORN — der pro-Treffer-Judge mit Früh-Ausstieg sieht
    // sie zuerst, und genau sie trägt bei Dauer-Fragen die Antwort (die liegt
    // in den DATEN zweier Notizen, nie in einem einzelnen Treffertext).
    const heute = frage.question_date ?? Date.now();
    const block = timelineBlock(
      kontextTreffer.map((h) => ({ titel: h.memory.title, datum: h.memory.createdAt })),
      heute
    );
    if (block) hitKontexte.unshift(block);
  }
  const antwort = hitKontexte.map((k, i) => `[${i + 1}] ${k}`).join("\n\n");
  return { antwort, treffer: hits.length, usedVectors: such.usedVectors, hitKontexte, hitTitel: hits.slice(0, topk + 6).map((h) => h.memory.title) };
}

// ── Phase 3: Richten ──
//
// Lokales LLM über Ollama (gleiche Maschine, kein Cloud-Abruf). Der Prompt
// unten ist EINMAL committed (JUDGE_PROMPT_VERSION) und ändert sich nur mit
// Versionsbump — Fairness-Regel aus fragen-format.md.

export const JUDGE_PROMPT_VERSION = 1;
export const JUDGE_MODELL_STANDARD = "llama3.2:3b";

export const JUDGE_PROMPT = `You are a strict grader for a memory-retrieval benchmark.
CONTEXT is what a memory system retrieved for a question. REFERENCE is the ground-truth answer.
Decide whether the CONTEXT alone contains the information needed to give the REFERENCE answer.
Reply with exactly one word: YES if fully contained, PARTIAL if partly contained, NO if missing or contradictory.
Do not use outside knowledge. Ignore formatting and numbering.

QUESTION: {frage}
REFERENCE: {referenz}
CONTEXT: {kontext}

One-word verdict:`;

export type Urteil = "ja" | "teilweise" | "nein" | "unlesbar";

/** Strenger Parser: genau ein Wort erwartet; alles andere ist „unlesbar“ und wird gezählt. */
export function parseUrteil(roh: string): Urteil {
  const text = roh.toUpperCase();
  if (/\bPARTIAL\b/.test(text)) return "teilweise";
  const ja = /\bYES\b/.test(text);
  const nein = /\bNO\b/.test(text);
  if (ja && !nein) return "ja";
  if (nein && !ja) return "nein";
  return "unlesbar";
}

/** Judge über Ollama-Chat-API. `rufen` ist injizierbar (Tests ohne laufendes Ollama). */
export async function richte(
  modell: string,
  frage: string,
  antwort: string,
  referenz: string,
  rufen: (prompt: string) => Promise<string> = standardOllama(modell)
): Promise<{ urteil: Urteil; roh: string }> {
  const prompt = JUDGE_PROMPT.replace("{frage}", frage).replace("{referenz}", referenz).replace("{kontext}", antwort.slice(0, 12_000));
  const roh = await rufen(prompt);
  return { urteil: parseUrteil(roh), roh: roh.trim() };
}

function standardOllama(modell: string): (prompt: string) => Promise<string> {
  const basis = process.env.OLLAMA_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:11434";
  return async (prompt) => {
    const rufen = async (): Promise<Response> =>
      fetch(`${basis}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: modell, stream: false, keep_alive: "15m", options: { temperature: 0 }, messages: [{ role: "user", content: prompt }] }),
        // Ein hängender Judge darf den ganzen Lauf nicht blockieren (Pilot 21.9.).
        signal: AbortSignal.timeout(180_000),
      });
    let antwort: Response;
    try {
      antwort = await rufen();
    } catch {
      // Einmal wiederholen (z. B. Modell-Nachladung, Verbindungsriss).
      antwort = await rufen();
    }
    if (!antwort.ok) throw new Error(`Ollama ${antwort.status}: ${await antwort.text()}`);
    const json = (await antwort.json()) as { message?: { content?: string } };
    return json.message?.content ?? "";
  };
}

/**
 * Pro-Treffer-Richten mit Früh-Ausstieg: ein kleines Modell verliert sich im
 * langen Sammelkontext (Pilotbefund 21.9. — die Antwort war im Kontext, der
 * Judge las nur den ersten, falschen Treffer). Also: jeder Treffer einzeln,
 * kurz gefasst; der erste Ja-Urteil beendet den Lauf, ein Teil-Treffer wird
 * gemerkt. Rückgabe nennt den Treffer-Index für den Bericht.
 */
export async function richteTreffer(
  modell: string,
  frage: string,
  hitKontexte: string[],
  referenz: string,
  rufen: (prompt: string) => Promise<string> = standardOllama(modell)
): Promise<{ urteil: Urteil; trefferIndex: number | null; aufrufe: number }> {
  let teilweise = false;
  for (const [i, kontext] of hitKontexte.entries()) {
    const r = await richte(modell, frage, kontext, referenz, rufen);
    if (r.urteil === "ja") return { urteil: "ja", trefferIndex: i, aufrufe: i + 1 };
    if (r.urteil === "teilweise") teilweise = true;
  }
  return { urteil: teilweise ? "teilweise" : "nein", trefferIndex: null, aufrufe: hitKontexte.length };
}

/** Deterministischer Schnellpfad: steht die Referenz wörtlich in einem Treffer, ist das Ja sicher — ohne Judge-Aufruf. */
export function verbatimTreffer(referenz: string, hitKontexte: string[]): boolean {
  const nadel = referenz.trim().toLowerCase().replace(/\s+/g, " ");
  if (nadel.length < 3 || /not mentioned|not specified|unknown|n\/a/.test(nadel)) return false;
  return hitKontexte.some((k) => k.toLowerCase().replace(/\s+/g, " ").includes(nadel));
}

// ── Report ──

export interface FrageErgebnis {
  question_id: string;
  /** Feiner Datensatz-Typ, wie im Release (single-session-user, …). */
  typ: string;
  /** Zugeordnete Benchmark-Fähigkeit (Wu et al.). */
  faehigkeit: Faehigkeit | null;
  urteil: Urteil | null;
  treffer: number;
  /** Treffer-Index, der das Ja geliefert hat (null bei nein/leer). */
  trefferIndex?: number | null;
  /** Titel der geretrieviewen Treffer — die Diagnose-Basis für Fehlanalysen. */
  trefferTitel?: string[];
  /** Ja per Verbatim-Schnellpfad (ohne Judge-Aufruf). */
  verbatim?: boolean;
  judge_aufrufe?: number;
  judge_roh?: string;
  fehler?: string;
}

export interface Bericht {
  datum: string;
  kepta_version: string;
  commit: string | null;
  modell: string;
  ollama_version: string | null;
  datensatz: string;
  datensatz_sha256: string;
  fragen: number;
  topk: number;
  ingest: IngestErgebnis;
  genauigkeit_gesamt: number;
  pro_faehigkeit: { faehigkeit: string; n: number; genauigkeit: number }[];
  abstention_quote_leer: number;
  judge_parse_fehler: number;
  judge_aufrufe: number;
  verbatim_quote: number;
  judge_prompt_version: number;
  used_vectors: boolean;
  /** Chunks, die dieser Lauf über die Vektorspur eingebettet hat (null = Spur nicht angefordert). */
  vektoren_eingebettet: number | null;
  /** Zeitfragen wurden in Teilfragen zerlegt und je Seite gesucht. */
  zeitsplit: boolean;
  /** Zeitfragen bekamen den Timeline-Block (Memory-Daten + Spannen) vorne. */
  temporal: boolean;
  hyde: boolean;
  hyde_erweiterungen: number;
  laufzeit_ms: number;
}

/**
 * Punkte je Urteil. Abstention-Fragen werden UMGEKEHRT gewertet: die
 * Referenzantwort ist „nicht erwähnt" — liefert der Suchpfad nichts, kann die
 * Assistenz korrekt verzichten (yes der offiziellen Abstention-Logik), enthält
 * der Kontext stattdessen „eine Antwort", wird sie halluzinieren (no).
 */
export function punkte(urteil: Urteil, faehigkeit?: string): number {
  if (faehigkeit === "abstention") {
    return urteil === "nein" ? 1 : urteil === "teilweise" ? 0.5 : 0;
  }
  return urteil === "ja" ? 1 : urteil === "teilweise" ? 0.5 : 0;
}

function datensatzHash(pfad: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(pfad)).digest("hex");
}

function gitCommit(): string | null {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

// ── CLI ──

async function hauptprogramm(): Promise<void> {
  const args = process.argv.slice(2);
  const pfad = args.find((a) => !a.startsWith("--"));
  if (!pfad) {
    console.error("Aufruf: npx tsx tools/longmemeval/harness.ts <datensatz> [--analyse] [--limit N] [--topk K] [--modell NAME] [--store PFAD] [--ohne-judge] [--vektoren] [--zeitsplit] [--temporal] [--hyde]");
    process.exit(2);
  }
  const zahl = (name: string, standard: number): number => {
    const i = args.indexOf(name);
    const v = i >= 0 ? Number(args[i + 1]) : NaN;
    return Number.isFinite(v) && v > 0 ? v : standard;
  };
  const limit = zahl("--limit", Infinity);
  const topk = zahl("--topk", 8);
  const modell = args.includes("--modell") ? args[args.indexOf("--modell") + 1] : JUDGE_MODELL_STANDARD;
  const ohneJudge = args.includes("--ohne-judge");
  const nurAnalyse = args.includes("--analyse");
  const mitVektoren = args.includes("--vektoren");
  const mitZeitsplit = args.includes("--zeitsplit");
  const mitTemporal = args.includes("--temporal");
  const mitHyde = args.includes("--hyde");

  const start = Date.now();
  const fragen = ladeDatensatz(pfad).slice(0, limit);
  const verteilung = analysiere(fragen);
  console.log(`Datensatz: ${pfad}`);
  console.log(`Fragen: ${verteilung.fragen} · Sessions: ${verteilung.sessionsGesamt} · mit Orakel-Feldern: ${verteilung.oracleFelderVorhanden}`);
  for (const f of FAEHIGKEITEN) console.log(`  ${f}: ${verteilung.proFaehigkeit[f]}`);
  if (nurAnalyse) return;

  // Orakel-Wächter: im vollen Test darf answer_session_ids nie gelesen werden.
  if (verteilung.oracleFelderVorhanden > 0) {
    console.log(`\n⚠️  ${verteilung.oracleFelderVorhanden} Fragen tragen Orakel-Felder (answer_session_ids) — der Runner liest sie NIE. Nur für den Kontrolldurchlauf geeignet.`);
  }

  const storePfad = args.includes("--store") ? args[args.indexOf("--store") + 1] : fs.mkdtempSync(path.join(os.tmpdir(), "kepta-longmemeval-"));
  const store = new KeptaStore(path.join(storePfad, "longmemeval.db"));
  console.log(`\nIngest → ${path.join(storePfad, "longmemeval.db")}`);
  const ingestErgebnis = ingest(fragen, store);
  console.log(`  Sessions: ${ingestErgebnis.sessions} · Notizen: ${ingestErgebnis.notizen} · übersprungen (Dedup): ${ingestErgebnis.uebersprungen} · ohne Datum: ${ingestErgebnis.ohneDatum}`);

  // Vektorspur: alle Chunks über die Produkt-Queue einbetten, bevor gefragt wird.
  let vektorenEingebettet: number | null = null;
  if (mitVektoren) {
    if (!(await ollamaAvailable())) {
      console.log("⚠️  --vektoren gesetzt, aber Ollama nicht erreichbar — der Lauf bleibt rein lexikalisch.");
    } else {
      const queue = new EmbeddingQueue(store, { batchSize: 64 });
      console.log(`\nEmbeddings (${DEFAULT_EMBED_MODEL}) …`);
      let geloggt = 0;
      vektorenEingebettet = await betteAlleEin(store, () => queue.tick(), (n) => {
        if (n - geloggt >= 5000) {
          geloggt = n;
          console.log(`  ${n} Chunks eingebettet`);
        }
      });
      console.log(`  fertig: ${vektorenEingebettet} Chunks eingebettet`);
    }
  }

  const ergebnisse: FrageErgebnis[] = [];
  let leer = 0;
  let parseFehler = 0;
  let verbatim = 0;
  let judgeAufrufe = 0;
  let hydeErweiterungen = 0;
  let usedVectorsIrgendwann = false;
  for (const [i, frage] of fragen.entries()) {
    const zeile: FrageErgebnis = { question_id: frage.question_id, typ: frage.question_type, faehigkeit: faehigkeitVon(frage.question_type), urteil: null, treffer: 0, trefferIndex: null, verbatim: false, judge_aufrufe: 0 };
    try {
      const erweiterungen = mitHyde ? await erweitereFrage(frage.question, standardOllama(modell)) : [];
      hydeErweiterungen += erweiterungen.length;
      const a = await beantworte(store, frage, topk, mitZeitsplit, mitTemporal, erweiterungen);
      zeile.treffer = a.treffer;
      usedVectorsIrgendwann ||= a.usedVectors;
      if (!a.antwort) {
        // Kein Treffer: die Assistenz müsste verzichten — bei Abstention-Fragen
        // der korrekte Fall (zählt über die umgekehrte Wertung als Punkt).
        leer += 1;
        zeile.urteil = "nein";
      } else if (verbatimTreffer(frage.answer, a.hitKontexte)) {
        verbatim += 1;
        zeile.verbatim = true;
        zeile.urteil = "ja";
      } else if (!ohneJudge) {
        const r = await richteTreffer(modell, frage.question, a.hitKontexte, frage.answer);
        zeile.urteil = r.urteil;
        zeile.trefferIndex = r.trefferIndex;
        zeile.judge_aufrufe = r.aufrufe;
        judgeAufrufe += r.aufrufe;
        if (r.urteil === "unlesbar") parseFehler += 1;
      }
    } catch (e) {
      zeile.fehler = e instanceof Error ? e.message : String(e);
    }
    if ((i + 1) % 10 === 0 || i + 1 === fragen.length) {
      console.log(`  ${i + 1}/${fragen.length} Fragen bearbeitet`);
    }
    ergebnisse.push(zeile);
  }
  store.close();

  const gerichtet = ergebnisse.filter((e) => e.urteil !== null);
  const summe = gerichtet.reduce((s, e) => s + punkte(e.urteil as Urteil, e.faehigkeit ?? undefined), 0);
  const genauigkeit = gerichtet.length > 0 ? summe / fragen.length : 0;

  if (ohneJudge) {
    const ziel = path.join("tools", "longmemeval", "ergebnisse", `nur-retrieval-${new Date().toISOString().slice(0, 10)}.json`);
    fs.mkdirSync(path.dirname(ziel), { recursive: true });
    fs.writeFileSync(ziel, JSON.stringify({ fragen: ergebnisse, leer, topk, datensatz: path.basename(pfad), datensatz_sha256: datensatzHash(pfad) }, null, 2));
    console.log(`\nNur-Retrieval-Ergebnis → ${ziel} (leer: ${leer}). Ohne Judge keine Genauigkeit.`);
    return;
  }

  const proFaehigkeit = FAEHIGKEITEN.map((f) => {
    const menge = gerichtet.filter((e) => e.faehigkeit === f);
    const n = fragen.filter((q) => faehigkeitVon(q.question_type) === f).length;
    return { faehigkeit: f, n, genauigkeit: menge.reduce((s, e) => s + punkte(e.urteil as Urteil, e.faehigkeit ?? undefined), 0) / Math.max(1, n) };
  });

  let ollamaVersion: string | null = null;
  try {
    const v = await fetch(`${process.env.OLLAMA_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:11434"}/api/version`);
    ollamaVersion = ((await v.json()) as { version?: string }).version ?? null;
  } catch {
    /* Version ist Zusatzinfo, kein Fehlerfall. */
  }

  const bericht: Bericht = {
    datum: new Date().toISOString(),
    kepta_version: APP_VERSION,
    commit: gitCommit(),
    modell,
    ollama_version: ollamaVersion,
    datensatz: path.basename(pfad),
    datensatz_sha256: datensatzHash(pfad),
    fragen: fragen.length,
    topk,
    ingest: ingestErgebnis,
    genauigkeit_gesamt: genauigkeit,
    pro_faehigkeit: proFaehigkeit,
    abstention_quote_leer: fragen.length > 0 ? leer / fragen.length : 0,
    judge_parse_fehler: parseFehler,
    judge_aufrufe: judgeAufrufe,
    verbatim_quote: fragen.length > 0 ? verbatim / fragen.length : 0,
    judge_prompt_version: JUDGE_PROMPT_VERSION,
    used_vectors: usedVectorsIrgendwann,
    vektoren_eingebettet: vektorenEingebettet,
    zeitsplit: mitZeitsplit,
    temporal: mitTemporal,
    hyde: mitHyde,
    hyde_erweiterungen: mitHyde ? hydeErweiterungen : 0,
    laufzeit_ms: Date.now() - start,
  };
  const ziel = path.join("tools", "longmemeval", "ergebnisse", `longmemeval-${new Date().toISOString().slice(0, 10)}-${bericht.datensatz_sha256.slice(0, 8)}.json`);
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, JSON.stringify({ bericht, fragen: ergebnisse }, null, 2));
  console.log(`\nGenauigkeit: ${(genauigkeit * 100).toFixed(1)} % (${gerichtet.length}/${fragen.length} gerichtet) · Leer: ${leer} · Verbatim-Ja: ${verbatim} · Judge-Aufrufe: ${judgeAufrufe} · Parse-Fehler: ${parseFehler}`);
  console.log(`Bericht → ${ziel}`);
}

// Nur als CLI ausführen, nicht beim Import durch Tests.
const alsEinstiegspunkt = process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (alsEinstiegspunkt) {
  hauptprogramm().then(
    () => process.exit(0),
    (e: unknown) => {
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  );
}
