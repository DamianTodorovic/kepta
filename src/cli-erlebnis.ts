// Das CLI-Erlebnis: die fünf Befehle, die KEPTA im Terminal lebendig machen.
//
//   kepta remember "…"        — merken (Typ + Tags werden automatisch gesetzt)
//   kepta recall "frage"      — suchen und lesbar antworten, mit Quellen
//   kepta timeline "thema"    — was weiß KEPTA wann über dieses Thema
//   kepta contradict          — Widersprüche und Duplikate melden (dry-run)
//   kepta stats               — die Gedächtnis-Statistik
//
// Bewusst rein lokal und ohne Farbcodes-Tricks beyond ANSI basics: die
// Ausgabe ist Terminal-Text, markdown() ist hier die falsche Ebene —
// stattdessen klare Blöcke mit Quellenangaben (Titel + Alter + Tags).
import type { KeptaStore } from "./core/store";
import { saveWithIndex } from "./core/mcp";
import { searchMemories } from "./core/engine";
import { consolidateMemories } from "./core/engine";
import { klassifiziere } from "./core/klassifikation";
import { APP_VERSION } from "./core/version";
import { baueGraph } from "./ui/graph";

const GEWICHT = "\x1b[1m";
const GRAU = "\x1b[2m";
const ROT = "\x1b[31m";
const GRUEN = "\x1b[32m";
const GELB = "\x1b[33m";
const BLAU = "\x1b[36m";
const ENDE = "\x1b[0m";

/** Alles, was mit `-` beginnt, ist ein Schalter, nie Text (D2-03). `--` endet die Schalter. */
export interface Schalter {
  json: boolean;
  hilfe: boolean;
  version: boolean;
  limit: number | null;
  farbe: "auto" | "an" | "aus";
  text: string[];
  unbekannte: string[];
  fehler: string[];
}

export function schalterLesen(argumente: string[]): Schalter {
  const s: Schalter = { json: false, hilfe: false, version: false, limit: null, farbe: "auto", text: [], unbekannte: [], fehler: [] };
  for (let i = 0; i < argumente.length; i++) {
    const a = argumente[i]!;
    if (a === "--") {
      s.text.push(...argumente.slice(i + 1));
      break;
    }
    const gleich = a.startsWith("--") ? a.indexOf("=") : -1;
    const name = gleich > 0 ? a.slice(0, gleich) : a;
    const wert = gleich > 0 ? a.slice(gleich + 1) : undefined;
    if (name === "--json") s.json = true;
    else if (name === "-h" || name === "--help") s.hilfe = true;
    else if (name === "-V" || name === "--version") s.version = true;
    // Rangfolge, nicht Reihenfolge: --color=always steht über jedem Abschalte-
    // Wunsch, egal in welcher Ordnung die Schalter tippt (D2-07).
    else if (name === "--no-color") { if (s.farbe !== "an") s.farbe = "aus"; }
    else if (name === "--color") {
      const w = wert ?? argumente[++i];
      if (w === "always") s.farbe = "an";
      else if (w === "never") { if (s.farbe !== "an") s.farbe = "aus"; }
      // "auto" ist keine Entscheidung, sondern der Verweis auf Umwelt und Schirm.
      else if (w !== "auto") s.fehler.push(`--color wants always, never or auto — got ${w ?? "nothing"}`);
    } else if (name === "--limit") {
      const w = wert ?? argumente[++i];
      const n = Number(w);
      if (w === undefined || !Number.isInteger(n) || n < 1) s.fehler.push(`--limit wants a whole number of items — got ${w ?? "nothing"}`);
      else s.limit = n;
    } else if (a.startsWith("-") && a.length > 1) s.unbekannte.push(name);
    else s.text.push(a);
  }
  return s;
}

/**
 * Farbe ist verhandelbar, nicht selbstverständlich (D2-07, clig.dev *Color*).
 * Die Rangfolge steht in der Satzung: --color=always vor --no-color vor
 * NO_COLOR vor TERM=dumb vor der Frage, ob überhaupt ein Schirm dran ist.
 * Ein leerer NO_COLOR-Wert ist ein Unfall in einer Umgebung, kein Beschluss.
 */
export function farbeAn(o: { tty: boolean; umgebung: Record<string, string | undefined>; argumente: string[] }): boolean {
  const s = schalterLesen(o.argumente);
  if (s.farbe === "an") return true;
  if (s.farbe === "aus") return false;
  if ((o.umgebung.NO_COLOR ?? "") !== "") return false;
  if (o.umgebung.TERM === "dumb") return false;
  return o.tty;
}

function farbe(code: string, text: string, kanal: "aus" | "fehler" = "aus"): string {
  const tty = (kanal === "aus" ? process.stdout.isTTY : process.stderr.isTTY) ?? false;
  return farbeAn({ tty, umgebung: process.env, argumente: process.argv.slice(2) }) ? code + text + ENDE : text;
}


/** Zahl und Wort in einem Mund: „1 candidate", nicht „1 candidates" (A6-28, R5). */
function zaehlung(n: number, singular: string, plural = `${singular}s`): string {
  return `${zahl(n)} ${n === 1 ? singular : plural}`;
}

const TAG = 86_400_000;
/** Relativ ist zum Fühlen da, absolut zum Zitieren — deshalb gibt es beides (R6, D2-23). */
function alter(ms: number): string {
  const tage = (Date.now() - ms) / TAG;
  if (tage < 1) return "today";
  if (tage < 30) return `${Math.round(tage)}d ago`;
  if (tage < 365) return `${Math.round(tage / 30)}mo ago`;
  return `${(tage / 365).toFixed(1)}y ago`;
}
/** Der absolute Tag, YYYY-MM-DD, wie die Zeitreise ihn versteht. */
function tag(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** remember: Text rein, KEPTA entscheidet Typ (die Store-Regeln, nicht „alles Fakt") und Tags. */
export function remember(store: KeptaStore, text: string, tags: string[]): { titel: string; typ: string; id: string } {
  const sauber = text.trim();
  if (!sauber) throw new Error("Nothing to remember — give me a sentence.");
  const erste = sauber.split("\n").map((z) => z.trim()).find((z) => z.length > 0) ?? sauber;
  const titel = erste.replace(/^#+\s*/, "").replace(/[*_`>#]/g, "").slice(0, 120).trim() || sauber.slice(0, 120);
  const typ = klassifiziere({ title: titel, content: sauber, tags }).typ;
  const { record } = saveWithIndex(store, { title: titel, content: sauber, tags: ["remember", ...tags], type: typ });
  return { titel: record.title, typ: record.type, id: record.id };
}

export interface RecallTreffer {
  titel: string;
  snippet: string;
  typ: string;
  alter: string;
  /** Wie viele Zeichen hinter demSnippet liegen — 0, wenn die Karte ganz zeigt (R6, D2-18). */
  fehlzeichen: number;
  /** Absolut (YYYY-MM-DD) — R6 verlangt die Datumsangabe vor dem Gefühl. */
  datum: string;
  /** Derselbe Moment in Millisekunden — für `--json`, nicht für den Schirm. */
  ms: number;
  tags: string[];
}

/**
 * recall: die Top-Treffer als lesbare Karten; antwortet NICHT mit erfundenem
 * Text — nur KEPTA-Suche. Eine Karte bleibt bei 180 Zeichen stehen, aber sie
 * sagt, wie viel dahinter liegt: ein `…` ohne Zahl ist eine Behauptung (D2-18).
 */
export async function recall(store: KeptaStore, frage: string, limit = 5): Promise<{ treffer: RecallTreffer[]; total: number; vektoren: boolean }> {
  const e = await searchMemories(store, { query: frage.trim(), limit });
  return {
    total: e.total,
    // Ob die Suche wirklich beide Beine benutzt hat, ist eine Messung dieses
    // Laufs — der Leerzustand darf sie brauchen (D2-10).
    vektoren: e.usedVectors,
    treffer: e.hits.map((h) => {
      const voll = h.memory.content.replace(/\s+/g, " ").trim();
      return {
        titel: h.memory.title,
        snippet: voll.slice(0, 180),
        fehlzeichen: Math.max(0, voll.length - 180),
        typ: h.memory.type,
        ms: h.memory.updatedAt,
        datum: tag(h.memory.updatedAt),
        alter: alter(h.memory.updatedAt),
        tags: h.memory.tags.slice(0, 3),
      };
    }),
  };
}

/**
 * Die Nadeln eines Themas: Wörter ab drei Buchstaben. Unterhalb davon kann die
 * Suche nicht treffen — und der Leerzustand muss das sagen dürfen, statt ein
 * leeres Gedächtnis zu behaupten (D2-11).
 */
function timelineNadeln(thema: string): string[] {
  return thema.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
}

/**
 * timeline: alle Notizen, die zum Thema passen, zeitlich sortiert — das
 * Gedächtnis als Ablauf. Die Nadeln bis zum Rand, damit die Ausgabe sagen kann,
 * wie viel sie abschneidet (D2-11, D2-12).
 */
export function timelineTreffer(store: KeptaStore, thema: string): { datum: string; titel: string; typ: string }[] {
  const nadeln = timelineNadeln(thema);
  const alle = store.listMemories({ limit: 5000 });
  return alle
    .filter((n) => {
      const heuboden = (n.title + " " + n.content + " " + n.tags.join(" ")).toLowerCase();
      return nadeln.some((nadel) => heuboden.includes(nadel));
    })
    .sort((a, b) => (a.validFrom ?? a.createdAt) - (b.validFrom ?? b.createdAt))
    .map((n) => ({
      datum: tag(n.validFrom ?? n.createdAt),
      titel: n.title,
      typ: n.type,
    }));
}

/** Die Kante, bis der Schirm listet — der Rest steht in der Zahl darüber. */
export const TIMELINE_GRENZE = 30;

export function timeline(store: KeptaStore, thema: string): { datum: string; titel: string; typ: string }[] {
  return timelineTreffer(store, thema).slice(0, TIMELINE_GRENZE);
}


/** contradict: Widersprüche und Duplikate als dry-run melden — nichts wird geändert. */
export interface WiderspruchsPaar {
  a: string;
  b: string;
  /** Die Titel, nicht nur die Kennungen — ein Mensch liest „Weber billing rhythm", kein „k-mv0x31". */
  aTitel: string;
  bTitel: string;
  grund: string;
}

export async function contradict(store: KeptaStore): Promise<{ widersprueche: WiderspruchsPaar[]; anzahl: number }> {
  const res = await consolidateMemories(store, { dryRun: true });
  return {
    widersprueche: res.candidates.map((c) => ({
      a: c.keepId,
      b: c.duplicateId,
      aTitel: store.getMemory(c.keepId)?.title ?? "(no title)",
      bTitel: store.getMemory(c.duplicateId)?.title ?? "(no title)",
      grund: c.reason,
    })),
    anzahl: res.candidates.length,
  };
}

/** stats: die Gedächtnis-Statistik in einem Block. */
export interface Statistik {
  notizen: { active: number; trashed: number };
  typen: Record<string, number>;
  topTags: { tag: string; count: number }[];
  /** Wie viele Tags es überhaupt gibt — die Ausgabe zeigt sechs und muss den Rest nennen (R7). */
  tagsGesamt: number;
  graphKnoten: number;
  graphKanten: number;
  verschluesselt: boolean;
  /** Warum die Datei (noch) nicht verschluesselt ist — aus dem Kern, nie erfunden. */
  hinweis?: string;
  /** Wo der Schluessel liegt ("KEPTA_DB_KEY", "macOS Keychain", …) — auch wenn die Öffnung scheiterte. */
  schluesselQuelle?: string;
  /** Welche Datei dieser Lauf gelesen hat (D2-15: ohne Ort weiß niemand, was er repariert). */
  pfad: string;
  /** Der jüngste Schreibzeitpunkt in dieser Datei, in Millisekunden — null, wenn nie eine Notiz geschrieben wurde. */
  zuletzt: number | null;
}

export function stats(store: KeptaStore): Statistik {
  // Die Statistik zählt nur aktive (nicht gelöschte) Notizen — dieselbe Regel
  // wie store.countMemories, hier über die Liste, weil Typen und Tags je Notiz
  // gebraucht werden.
  const alle = store.listMemories({ limit: 10_000 });
  const typen: Record<string, number> = {};
  const tags = new Map<string, number>();
  let zuletzt: number | null = null;
  for (const m of alle) {
    typen[m.type] = (typen[m.type] ?? 0) + 1;
    for (const t of m.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
    if (zuletzt === null || m.updatedAt > zuletzt) zuletzt = m.updatedAt;
  }
  const g = baueGraph(store);
  return {
    notizen: store.countMemories(),
    typen,
    tagsGesamt: tags.size,
    topTags: [...tags.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 30)
      .map(([tag, count]) => ({ tag, count })),
    graphKnoten: g.nodes.length,
    graphKanten: g.edges.filter((e) => e.real).length,
    verschluesselt: store.verschluesselung.aktiv,
    hinweis: store.verschluesselung.hinweis,
    schluesselQuelle: store.extensions.keys.ablage,
    pfad: store.dbPath,
    zuletzt,
  };
}

/** Die Typen nach Menge, bei Gleichstand alphabetisch — dieselbe Logik wie topTags (D2-16). */
export function typenSortiert(typen: Record<string, number>): [string, number][] {
  return Object.entries(typen).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}


/**
 * Warum die Datei nicht verschluesselt ist und wie der Nutzer es aendert.
 * Der Grund kommt aus dem Kern (store.verschluesselung.hinweis); die Zahl der
 * Hex-Zeichen liegt in der Umgebung, nicht im Store — der Kopier-Unfall aus der
 * README ist genau der Fall, in dem der Nutzer eine Zahl sehen muss.
 */
function verschluesselungsGrund(s: Statistik): { grund: string; ausweg: string } {
  if (process.env.KEPTA_ENCRYPTION === "off") {
    return { grund: "switched off by KEPTA_ENCRYPTION=off", ausweg: "unset KEPTA_ENCRYPTION and run the command again" };
  }
  const umgebung = (process.env.KEPTA_DB_KEY ?? "").trim();
  const hinweis = s.hinweis?.replace(/[.\s]+$/, "");
  const grund = hinweis
    ? hinweis + (umgebung ? ` ${STRICH}you gave ${zahl(umgebung.length)} characters` : "")
    : "no database key was available";
  return {
    grund,
    ausweg:
      `run 'openssl rand -hex 32' and set KEPTA_DB_KEY to the result ${STRICH}or unset KEPTA_DB_KEY and let your OS keychain hold the key. ` +
      "What your key protects and how to recover it: SECURITY.md.",
  };
}

/** CLI-Dispatcher für die fünf Erlebnis-Befehle — liefert den Exit-Code. */
export const BEFEHLE: [string, string][] = [
  ['remember "<text>" [#tag]', "store one sentence — KEPTA picks the type and the tags"],
  ['recall "<frage>"', "what the memory says about it, best matches first"],
  ['timeline "<thema>"', "the same topic in order of time, oldest first"],
  ["contradict", "look for duplicates and contradictions — changes nothing"],
  ["stats", "the file: notes, types, graph — and what state it is in"],
  ["demo", "a six-act story on a throwaway database — nothing mocked"],
  ["import chatgpt <ordner>", "your ChatGPT export, turned into notes"],
  ["setup", "connect KEPTA to the AI apps already on this computer"],
  ["ui", "where to look at your notes — the core itself has no window"],
];

// ────────────────── das Ausgabemuster (D2 (b), R1…R12) ──────────────────
//
// Ein Raster, eine Breite, ein Weg am Ende. Die Funktionen hier sind der Grund,
// warum die fünf Befehle gleich aussehen: Der Kopf nennt beide Zahlen, der Rumpf
// steht auf 2 (Karte) respektive 4 (Feld), die Fortsetzung rückt um 4, und die
// letzte Zeile ist immer ein `next:`, das wirklich trifft.

/** Die Bühne: was länger ist, bricht selbst, bevor der Schirm bricht (R2). */
export const BREITE = 80;

/** Tausenderpunkt — kein Mensch liest 1200 in einem Zug (R5). */
export function zahl(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * Eine logische Zeile inphysische Zeilen von höchstens 80 Zeichen, an
 * Wortgrenzen, mit der Fortsetzung um `rueck` eingerückt (R1, R2). Ein einziges
 * Wort, das länger ist als die Bühne (ein Pfad), bleibt unangetastet —
 * zerhackte Pfade sind schlimmer als umbrochene.
 */
export function bricht(text: string, { einzug = 0, rueck = 4, breite = BREITE }: { einzug?: number; rueck?: number; breite?: number } = {}): string[] {
  const woerter = text.split(/\s+/).filter(Boolean);
  if (!woerter.length) return [" ".repeat(einzug)];
  const fortsetzung = einzug + rueck;
  const satze: string[][] = [];
  let satz: string[] = [];
  let laufe = 0;
  const einzugGerade = () => (satze.length === 0 ? einzug : fortsetzung);
  for (const wort of woerter) {
    const laenge = [...wort].length;
    const naechster = laufe + (satz.length ? 1 : 0) + laenge;
    if (satz.length && einzugGerade() + naechster > breite) {
      satze.push(satz);
      satz = [wort];
      laufe = laenge;
      continue;
    }
    satz.push(wort);
    laufe = naechster;
  }
  if (satz.length) satze.push(satz);
  return satze.map((w, i) => " ".repeat(i === 0 ? einzug : fortsetzung) + w.join(" "));
}

/** Ein Abschnitt: Text plus der Farbe, die ihn bedeutet (R3). */
export type Abschnitt = [text: string, code: string];

/**
 * Die Palette, die im ganzen Produkt dieselbe Bedeutung hat (R3): GRUEN ein
 * gemessener, gewollter Zustand · ROT ein Zustand, der kostet · GELB
 * Aufmerksamkeit ohne Tat · BLAU ein Wiederfindungsanker · GRAU Spur und Weg ·
 * GEWICHT der Kopf. Demo und Befehle teilen sich diese eine Tafel.
 */
export const FARBEN = { gewicht: GEWICHT, grau: GRAU, rot: ROT, gruen: GRUEN, gelb: GELB, blau: BLAU };

/**
 * Zwischenraum, der nicht trennen darf (U+00A0): eine Datumsklammer, ein
 * Kürzungsvermerk, ein Trennzeichen mit seinem Wort. Der Füller teilt nur an
 * ASCII-Leerraum, was so gesetzt ist bleibt daher zusammen (R4, R6).
 */
const KLEB = " ";
function zusammen(text: string): string {
  return text.replace(/ /g, KLEB);
}

/** Ein Trennzeichen, das sein Wort mitnimmt: ein nacktes `·` steht nie am
 *  Zeilenanfang und endet nie eine Zeile (R4). */
const PUNKT = `·${KLEB}`;

/** Dasselbe für den Gedankenstrich, der einen Ausweg anhängt (R4). */
const STRICH = `—${KLEB}`;

/**
 * Die Schalter, die es gibt — dieselbe Liste, die ein unbekannter Schalter
 * vorliest, damit die Antwort auf einen Irrtum nicht selbst eine Tür nennt, die
 * es nicht gibt (D2-03, D2-09). `--help` und `--version` stehen darin, weil sie
 * existieren: die Liste war zweimal unvollständig, gemessen an `schalterLesen`.
 */
export const FLAG_LISTE = `--json ${PUNKT}--limit N ${PUNKT}--no-color ${PUNKT}--color=always|never|auto ${PUNKT}-h ${PUNKT}--help ${PUNKT}-V ${PUNKT}--version`;

/**
 * Die logische Zeile: ein Vorgabe-Kopf steht auf seiner Spalte, der Rest wird bis 80
 * gefüllt und die Fortsetzung hängt unter den Wert (R1, R2). Der Kopf wird
 * wortwörtlich gesetzt — eine Feldspalte (`file    `, `2026-10-10  `) darf nicht
 * zu einem einfachen Leerzeichen zusammenfallen. Jeder Abschnitt behält seine
 * Farbe über den Umbruch, und nebeneinanderliegende Wörter derselben Farbe
 * werden zu einem Ausbruch (R3).
 */
function zeile(abschnitte: Abschnitt[], { einzug = 0, kopf }: { einzug?: number; kopf?: Abschnitt } = {}): void {
  const kopfText = kopf?.[0] ?? "";
  const spalte = einzug + [...kopfText].length;
  const rueck = Math.max(spalte, 4);
  const saetze: Abschnitt[][] = [];
  let satz: Abschnitt[] = [];
  let breite = rueck;
  const woerter: Abschnitt[] = [];
  // Geteilt wird nur an ASCII-Leerraum — was mit KLEB gesetzt ist, bleibt ein Wort.
  for (const [text, code] of abschnitte) for (const wort of text.split(/[ \t\n]+/).filter(Boolean)) woerter.push([wort, code]);
  // Ein einzelnes Wort, das neben dem Kopf keinen Platz hat (ein langer Pfad),
  // bekommt die nächste Zeile — nie wird es zerschnitten, denn ein zerhackter
  // Pfad ist nicht mehr kopierbar.
  if (kopf !== undefined && woerter.length && rueck + [...woerter[0]![0]].length > BREITE) {
    saetze.push([]);
    breite = rueck;
  }
  for (const [wort, code] of woerter) {
    const laenge = [...wort].length;
    if (satz.length > 0 && breite + 1 + laenge > BREITE) {
      saetze.push(satz);
      satz = [];
      breite = rueck;
    }
    if (satz.length > 0) breite += 1;
    satz.push([wort, code]);
    breite += laenge;
  }
  if (satz.length) saetze.push(satz);
  if (!saetze.length) saetze.push([]);
  saetze.forEach((s, i) => {
    const runs: Abschnitt[] = [];
    for (const [wort, code] of s) {
      const letzte = runs[runs.length - 1];
      if (letzte && letzte[1] === code) letzte[0] += " " + wort;
      else runs.push([wort, code]);
    }
    const text = runs.map(([t, c]) => (c ? farbe(c, t) : t)).join(" ");
    if (i === 0) {
      const kopfTextGefaerbt = kopf && kopf[1] ? farbe(kopf[1], kopf[0]) : kopf?.[0] ?? "";
      console.log(" ".repeat(einzug) + kopfTextGefaerbt + text);
      return;
    }
    console.log(" ".repeat(rueck) + text);
  });
}

/** Ein Leerzustand ist kein Endpunkt: auch er weist einen Weg (R9). */
function weg(text: string, einzug = 0): void {
  zeile([[text, GRAU]], { einzug });
}

/** Ein Titel braucht keine Zahl, aber immer Gewicht (R3). */
function titel(text: string, einzug = 0): void {
  zeile([[text, GEWICHT]], { einzug });
}

/**
 * D2-14: ein Vorschlag, der scheitert, ist schlimmer als kein Vorschlag. Der
 * echte, ungekürzte Titel wird zitiert — und wer ein Anführungszeichen im Titel
 * hat, bekommt einfache, damit der kopierte Befehl trifft.
 */
function zitier(text: string): string {
  return text.includes('"') ? `'${text}'` : `"${text}"`;
}

/**
 * D2-18: ein `…` ohne die Länge dahinter ist eine Behauptung. Der Vermerk wird
 * geklebt, damit die Klammer nicht über zwei Zeilen zerfällt.
 */
function kuerzungsvermerk(fehlzeichen: number): string {
  return zusammen(`… (+${zahl(fehlzeichen)} more ${fehlzeichen === 1 ? "character" : "characters"})`);
}

/**
 * D2-22: die Engine nennt interne Token, der Mensch liest eine Begründung. Die
 * Worttafel sitzt im Ausgabe-Layer, die Engine bleibt unberührt.
 */
const GRUND_TAFEL: Record<string, string> = {
  "title+tags": "same title and tags",
  embedding: "says almost the same thing",
  "[[link]]": "shared entity",
};
function grundText(grund: string): string {
  return GRUND_TAFEL[grund] ?? grund;
}

/** R6: erst absolut, dann relativ in Klammern — die Klammer gehört aneinandergedacht. */
function zeit(ms: number): string {
  return `${tag(ms)} ${zusammen(`(${alter(ms)})`)}`;
}

/**
 * Die Uhr einer Schreibzeit ist eine Wanduhr: neben „just now" darf keine
 * UTC-Stunde stehen, die zwei Stunden hinter dem Schirm des Lesers her ist.
 */
function uhr(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Für `stats`: eine Datei, die eben geschrieben wurde, ist nicht „today". */
function frische(ms: number): string {
  const minuten = Math.floor((Date.now() - ms) / 60_000);
  if (minuten < 1) return "just now";
  if (minuten < 60) return `${minuten} min ago`;
  if (minuten < 1_440) return `${Math.round(minuten / 60)} h ago`;
  return alter(ms);
}

/** Der Pfad so, wie ein Mensch ihn tippt: die Heimat als Tilde (D2-15). */
function heimat(pfad: string): string {
  const home = process.env.HOME ?? "";
  return home && pfad.startsWith(home) ? "~" + pfad.slice(home.length) : pfad;
}

/**
 * Die Tafel, die `--help` zeigt: Gruppen nach Aufgabe, ein Kopf, die Schalter,
 * die Exit-Codes und die Umweltvariablen, die das Verhalten wirklich ändern
 * (D2-24, clig.dev *Help*). Keine Zeile über 80 Zeichen — die Tafel ist die
 * Fläche, die am häufigsten kopiert und gelesen wird.
 */
function hilfeText(): string[] {
  const zeilen: string[] = [];
  const spalte = Math.min(34, 10 + Math.max(...BEFEHLE.map(([b]) => [...b].length)));
  /**
   * Ein Befehl und sein Satz, beide unter 80: der Befehl steht in einer
   * festen Spalte, der Satz bricht ihm nach — nie beginnt eine umbrochene
   * Zeile auf Spalte 0, während ihre Nachbarn auf 2 stehen.
   */
  const eintrag = (befehl: string, satz: string) => {
    const kopf = `  kepta ${befehl}`.padEnd(spalte);
    bricht(satz, { einzug: spalte, rueck: 0 }).forEach((z, i) => zeilen.push(i === 0 ? kopf + z.slice(spalte) : z));
  };
  const gruppe = (name: string, unter: [string, string][]) => {
    zeilen.push("", farbe(GEWICHT, name));
    for (const [befehl, satz] of unter) eintrag(befehl, satz);
  };
  zeilen.push(farbe(GEWICHT, "KEPTA from the terminal — one local file, no account"));
  gruppe("write", BEFEHLE.filter(([b]) => b.startsWith("remember") || b.startsWith("import")));
  gruppe("read", BEFEHLE.filter(([b]) => /^(recall|timeline|contradict|stats|demo)/.test(b)));
  gruppe("set up", BEFEHLE.filter(([b]) => /^(setup|ui)/.test(b)));
  zeilen.push("", farbe(GEWICHT, "switches"));
  for (const z of bricht(FLAG_LISTE, { einzug: 2 })) zeilen.push(z);
  zeilen.push("  --limit N            how many to list (recall 5, timeline 30, contradict 20)");
  zeilen.push("", farbe(GEWICHT, "exit codes"));
  zeilen.push("  0  the command worked        1  it failed, the reason is on stderr");
  zeilen.push("  2  bad command or switch      130 interrupted (Ctrl+C)");
  zeilen.push("", farbe(GEWICHT, "environment"));
  zeilen.push("  KEPTA_DATA_DIR   where the file lives (~/.kepta)");
  zeilen.push("  KEPTA_DB_KEY     a 64-character key; without it the OS keychain holds one");
  zeilen.push("  KEPTA_ENCRYPTION=off  say it on purpose and the file stays plaintext");
  zeilen.push("  NO_COLOR · TERM=dumb  no escape sequences, the words still carry the state");
  zeilen.push("", farbe(GEWICHT, `version · kepta ${APP_VERSION} · node ${process.versions.node}`));
  zeilen.push('Next step: kepta remember "…" — then ask it: kepta recall "…"');
  return zeilen;
}

/** Ohne Versionszahl kann niemand einen Fehlerbericht schreiben (D2-02). */
function versionText(): string {
  return `kepta ${APP_VERSION} · node ${process.versions.node}`;
}

export { hilfeText, versionText, zeile as ausgabe, zusammen, kuerzungsvermerk, zaehlung, heimat, PUNKT as TRENNER };

/** R10: ein Fehler ist dreizeilig — was scheitert, warum, was jetzt. Nie ein Stack. */
function fehlerBlock(was: string, warum: string, wegText: string): void {
  console.error(farbe(ROT, `[kepta] ✗ ${was}`, "fehler"));
  // R2 gilt auch für die Absage: die Liste der Schalter ist länger als die Bühne.
  for (const z of bricht(warum, { einzug: 2 })) console.error(farbe(GRAU, z, "fehler"));
  for (const z of bricht(`next: ${wegText}`, { einzug: 2 })) console.error(farbe(GRAU, z, "fehler"));
}

export async function erlebnisKommando(store: KeptaStore, befehl: string, rest: string[]): Promise<number> {
  const sch = schalterLesen(rest);
  // Die Hilfetüren gelten hinter jedem Befehl: `kepta recall --help` erklärt
  // recall, es sucht nicht nach „--help" (D2-02, clig.dev *Help*).
  if (sch.hilfe) {
    for (const z of hilfeText()) console.log(z);
    return 0;
  }
  if (sch.version) {
    console.log(versionText());
    return 0;
  }
  const Irrtümer = [...sch.unbekannte.map((f) => `unknown flag: ${f}`), ...sch.fehler];
  if (Irrtümer.length) {
    fehlerBlock(Irrtümer[0]!, `KEPTA knows: ${FLAG_LISTE}`, "run kepta --help, or drop the switch");
    return 2;
  }
  const maschine = sch.json;
  try {
    switch (befehl) {
      case "remember": {
        const tags = sch.text.filter((a) => a.startsWith("#")).map((a) => a.slice(1));
        const text = sch.text.filter((a) => !a.startsWith("#")).join(" ");
        const r = remember(store, text, tags);
        if (maschine) {
          console.log(JSON.stringify({ saved: true, title: r.titel, type: r.typ, id: r.id }));
          return 0;
        }
        zeile([["✓ remembered", GRUEN], [`— ${r.titel}`, GEWICHT]]);
        zeile([[`type ${r.typ} ${PUNKT}id ${r.id}`, GRAU]], { einzug: 4 });
        // D2-14: der volle Titel, nie ein abgeschnittener — ein Vorschlag, der
        // nicht trifft, ist schlimmer als gar keiner.
        weg(`next: kepta recall ${zitier(r.titel)}`, 4);
        return 0;
      }
      case "recall": {
        const frage = sch.text.join(" ").trim();
        if (!frage) throw new Error("Ask something: kepta recall <question>");
        const { treffer, total, vektoren } = await recall(store, frage, sch.limit ?? 5);
        if (maschine) {
          console.log(
            JSON.stringify({
              query: frage,
              showing: treffer.length,
              total,
              usedVectors: vektoren,
              hits: treffer.map((t) => ({ title: t.titel, snippet: t.snippet, missingCharacters: t.fehlzeichen, type: t.typ, date: t.datum, updatedAt: t.ms, tags: t.tags })),
            })
          );
          return 0;
        }
        if (treffer.length === 0) {
          // D2-10: der alte Satz erzählte eine Bedingung, die schon erfüllt war
          // ("With Ollama running…", während Ollama lief). Was hier steht, ist
          // die Zählung und die Messung dieses Laufs.
          const bestand = store.countMemories().active;
          zeile([["Nothing found.", GELB]]);
          zeile([[`your memory holds ${zaehlung(bestand, "note")}`, GRAU]]);
          zeile([[vektoren ? "the search read words and vectors" : "the search read words only — no vectors came back for this query", GRAU]], { einzug: 0 });
          weg(`next: kepta stats — what the file holds${bestand ? `, or kepta timeline ${zitier(frage)}` : ", or kepta remember \"…\""}`, 0);
          return 0;
        }
        titel(
          treffer.length < total
            ? `showing ${zahl(treffer.length)} of ${zaehlung(total, "match", "matches")} — ranked by relevance`
            : `${zaehlung(total, "match", "matches")} — ranked by relevance`
        );
        treffer.forEach((t, i) => {
          console.log("");
          zeile([[`${i + 1}.`, GRAU], [t.titel, GEWICHT]], { einzug: 2 });
          zeile([[t.snippet + (t.fehlzeichen > 0 ? kuerzungsvermerk(t.fehlzeichen) : ""), ""]], { einzug: 6 });
          const spur: Abschnitt[] = [[`${t.typ} ${PUNKT}${zeit(t.ms)}`, GRAU]];
          if (t.tags.length) spur.push([`${PUNKT}${t.tags.map((x) => "#" + x).join(" ")}`, BLAU]);
          zeile(spur, { einzug: 6 });
        });
        console.log("");
        weg(`next: kepta timeline ${zitier(frage)} — the same topic in order of time`, 2);
        return 0;
      }
      case "timeline": {
        const thema = sch.text.join(" ").trim();
        if (!thema) throw new Error("Give me a topic: kepta timeline <topic>");
        const alle = timelineTreffer(store, thema);
        const grenze = sch.limit ?? TIMELINE_GRENZE;
        const eintraege = alle.slice(0, grenze);
        if (maschine) {
          console.log(JSON.stringify({ topic: thema, showing: eintraege.length, total: alle.length, entries: eintraege }));
          return 0;
        }
        if (eintraege.length === 0) {
          // D2-11: „Nothing about AI yet" während die Notiz da ist — jedes Wort
          // unter drei Buchstaben flog still raus, und eine leere Nadelmenge
          // kann nie treffen. Ein Leerzustand darf nur behaupten, was geprüft ist.
          if (timelineNadeln(thema).length === 0) {
            zeile([[`Too short to match — give me a word of at least 3 letters, not ${zitier(thema)}.`, GELB]]);
            weg(`next: kepta recall ${zitier(thema)} — the search reads whole words too`, 0);
            return 0;
          }
          zeile([[`Nothing about ${zitier(thema)} in this file yet.`, GELB]]);
          weg(`next: kepta remember ${zitier(thema)} — then this list has something to show`, 0);
          return 0;
        }
        const spanne = `${eintraege[0]!.datum} to ${eintraege[eintraege.length - 1]!.datum}`;
        titel(
          alle.length > eintraege.length
            ? `showing ${zahl(eintraege.length)} of ${zaehlung(alle.length, "entry", "entries")} about ${zitier(thema)}, oldest first`
            : `${zaehlung(alle.length, "entry", "entries")} about ${zitier(thema)}, oldest first`
        );
        // Der Zeitraum ist Kontext, nicht Teil des Titels: auf der Titellinie
        // brach er um, und die graue Fortsetzung sah aus wie ein Eintrag.
        zeile([[spanne, GRAU]], { einzug: 2 });
        // Das Datum steht in einer festen Spalte, der Typ dahinter. Eine
        // rechtsbündige Typspalte über umbrochene Zeilen hinweg wäre dieselbe
        // Falle wie die Kommentare auf vier verschiedenen Spalten in D2-38.
        for (const e of eintraege) {
          console.log("");
          zeile([[e.titel, ""], [`${PUNKT}${e.typ}`, GRAU]], { einzug: 4, kopf: [`${e.datum}  `, BLAU] });
        }
        console.log("");
        weg(`next: kepta recall ${zitier(thema)} — search, not a list`, 4);
        return 0;
      }
      case "contradict": {
        const { widersprueche, anzahl } = await contradict(store);
        const grenze = sch.limit ?? 20;
        const gezeichnet = widersprueche.slice(0, grenze);
        if (maschine) {
          console.log(
            JSON.stringify({
              dryRun: true,
              changed: false,
              showing: gezeichnet.length,
              total: anzahl,
              candidates: gezeichnet.map((w) => ({ keepId: w.a, duplicateId: w.b, keepTitle: w.aTitel, duplicateTitle: w.bTitel, reason: w.grund })),
            })
          );
          return 0;
        }
        if (anzahl === 0) {
          console.log(farbe(GRUEN, "✓ No contradictions or duplicates found."));
          weg("next: kepta stats — what the file holds", 0);
          return 0;
        }
        const mehr = anzahl - gezeichnet.length;
        titel(
          mehr > 0
            ? `showing ${zahl(gezeichnet.length)} of ${zaehlung(anzahl, "candidate")} — dry-run, nothing changed`
            : `${zaehlung(anzahl, "candidate")} — dry-run, nothing changed`
        );
        gezeichnet.forEach((w, i) => {
          console.log("");
          zeile([[`${i + 1}.`, GRAU], [`"${w.aTitel}"`, GEWICHT]], { einzug: 2 });
          zeile([[`↔ "${w.bTitel}"`, GEWICHT], [`${w.a} ${PUNKT}${w.b}`, GRAU]], { einzug: 6 });
          zeile([[grundText(w.grund), GRAU]], { einzug: 6 });
        });
        console.log("");
        if (mehr > 0) zeile([[`… ${zahl(mehr)} more not listed — raise the cap with --limit ${zahl(anzahl)}`, GRAU]], { einzug: 2 });
        weg("next: ask your AI client: memory_consolidate with dryRun=false", 2);
        return 0;
      }
      case "stats": {
        const s = stats(store);
        if (maschine) {
          console.log(
            JSON.stringify({
              notes: s.notizen.active,
              trashed: s.notizen.trashed,
              types: Object.fromEntries(typenSortiert(s.typen)),
              graph: { nodes: s.graphKnoten, links: s.graphKanten },
              tags: s.topTags.map((t) => ({ tag: t.tag, count: t.count })),
              tagsTotal: s.tagsGesamt,
              encrypted: s.verschluesselt,
              keySource: s.schluesselQuelle ?? null,
              file: s.pfad,
              lastWrite: s.zuletzt,
            })
          );
          return 0;
        }
        const feld = (name: string, ...abschnitte: Abschnitt[]) => zeile(abschnitte, { einzug: 4, kopf: [name.padEnd(8), GRAU] });
        titel("KEPTA memory");
        feld("file", [heimat(s.pfad), ""]);
        feld("notes", [`${zahl(s.notizen.active)} active ${PUNKT}${zahl(s.notizen.trashed)} in trash`, ""]);
        feld("types", [typenSortiert(s.typen).map(([k, v]) => `${k}: ${zahl(v)}`).join(` ${PUNKT}`) || "—", ""]);
        feld("graph", [`${zaehlung(s.graphKnoten, "node")} ${PUNKT}${zaehlung(s.graphKanten, "link")}`, ""]);
        const sechs = s.topTags.slice(0, 6);
        const fehlt = s.tagsGesamt - sechs.length;
        const tagsZeile: Abschnitt[] = [[sechs.map((t) => `#${t.tag} (${zahl(t.count)})`).join(` ${PUNKT}`) || "—", BLAU]];
        if (fehlt > 0) tagsZeile.push([`${PUNKT}${zahl(fehlt)} more tags`, GRAU]);
        feld("tags", ...tagsZeile);
        // Zielbild: ein Zustand, eine Zeile. Zwei Zeilen, die denselben Zustand
        // zweimal behaupten, waren der alte Fehler (D2-04, R8).
        const grundtext = s.verschluesselt ? null : verschluesselungsGrund(s);
        if (s.verschluesselt) {
          feld("state", ["encrypted", GRUEN], [`${PUNKT}key: ${s.schluesselQuelle ?? "the OS keychain"}`, GRAU]);
        } else {
          feld("state", [`NOT encrypted ${STRICH}${grundtext!.grund}`, ROT]);
          feld("risk", ["this file is readable by anyone who can read the disk", GELB]);
        }
        // D2-15: Ort und letzte Schreibzeit gehören zu beiden Zweigen — ohne sie
        // weiß ein Mensch nicht, welche Datei er gerade ansieht.
        const schrift = s.zuletzt === null ? "no note written yet" : `${uhr(s.zuletzt)} ${zusammen(`(${frische(s.zuletzt)})`)}`;
        feld("wrote", [schrift, BLAU]);
        if (s.verschluesselt) weg("next: kepta contradict — does your memory hold anything twice?", 4);
        else weg(`next: ${grundtext!.ausweg}`, 12);
        return 0;
      }
      case "help":
      case "--help":
      case "-h":
      case "-V":
      case "--version":
        for (const z of hilfeText()) console.log(z);
        return 0;
      default:
        // D2-21: ein Irrtum bekommt einen Block, nicht die ganze Tafel — die
        // Tafel ist die Antwort auf --help.
        fehlerBlock(`unknown command: ${befehl}`, `KEPTA knows: ${BEFEHLE.map(([b]) => b.split(" ")[0]).join(", ")}`, "run kepta --help for the whole board");
        return 2;
    }
  } catch (e) {
    const grund = e instanceof Error ? e.message : String(e);
    // Der dreizeilige Block auch für alles, was der Kern meldet: was, warum, Weg.
    const [erste, ...restliche] = grund.split(/(?<=\.)\s+/);
    fehlerBlock(erste ?? grund, restliche.join(" ") || "the command could not finish", "run kepta --help, or try the command again");
    return 1;
  }
}


