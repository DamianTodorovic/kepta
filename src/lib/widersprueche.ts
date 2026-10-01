// Contradictions: two notes that say different things about the same thing.
//
// KEPTA looks for sentences in different notes that talk about the same thing
// — the same meaningful words around a value — but give a different time,
// date, amount, percentage or quantity: „Backups run nightly at 02:00“ against
// „Backups now run nightly at 03:00“. Careful on purpose, because a false
// alarm costs trust:
// - only facts and how-tos are compared — two events may well happen at
//   different times;
// - both sentences must share at least two meaningful words, and at least half
//   of the shorter sentence's words;
// - the values must be of the same kind, and neither sentence may already
//   mention the other value („from 02:00 to 03:00“); a value that ends a range
//   („2–4 days“) is not compared at all;
// - notes from the same source file, parts of a file KEPTA split up
//   („README — 5/17“) and notes already replaced by a newer one stay out, and
//   the source line of a note („— Source: …“) is not read for values;
// - a pair marked „both are right“ never comes back.
import { STOPWORDS } from "../core/stopwords";

export type WertArt = "time" | "date" | "money" | "percent" | "amount";

export interface Pruefnotiz {
  id: string;
  title: string;
  content: string;
  type: string;
  updatedAt: number;
  supersededBy?: string | null;
  deletedAt?: number | null;
}

export interface Seite {
  id: string;
  title: string;
  sentence: string;
  value: string;
  updatedAt: number;
}

export interface Widerspruch {
  /** Both ids, sorted — the same for either order. */
  key: string;
  newer: Seite;
  older: Seite;
  /** The words both sentences share, e.g. „backups run nightly“. */
  about: string;
}

interface Fakt {
  notiz: Pruefnotiz;
  satz: string;
  wert: string;
  norm: string;
  art: WertArt;
  /** All values of the same kind in the sentence. */
  werteImSatz: Set<string>;
  stamm: Map<string, string>;
  quelle: string | null;
}

/** „1.200“ and „1,200“ and „1200“ are the same amount; „12,50“ is twelve fifty. */
export function zahl(roh: string): string {
  let s = roh.replace(/['\s]/g, "");
  const punkt = s.lastIndexOf(".");
  const komma = s.lastIndexOf(",");
  if (punkt >= 0 && komma >= 0) {
    const dezimal = punkt > komma ? "." : ",";
    s = s.replace(dezimal === "." ? /,/g : /\./g, "").replace(dezimal, ".");
  } else if (punkt >= 0 || komma >= 0) {
    const i = Math.max(punkt, komma);
    const nachher = s.length - i - 1;
    s = nachher === 3 && s.split(/[.,]/).length === 2 ? s.replace(/[.,]/g, "") : s.replace(",", ".");
    if (s.split(".").length > 2) s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? String(n) : roh;
}

const EINHEIT: [RegExp, string][] = [
  [/^(days?|tage?n?)$/, "days"],
  [/^(hours?|stunden?)$/, "hours"],
  [/^(minutes?|minuten?)$/, "minutes"],
  [/^(weeks?|wochen?)$/, "weeks"],
  [/^(months?|monate?n?)$/, "months"],
  [/^(years?|jahre?n?)$/, "years"],
  [/^(users?|nutzer|seats?)$/, "seats"],
];

function einheit(roh: string): string {
  const e = roh.toLowerCase();
  for (const [re, name] of EINHEIT) if (re.test(e)) return name;
  return e;
}

const WERTE: { art: WertArt; re: RegExp; norm: (m: RegExpExecArray) => string }[] = [
  { art: "time", re: /\b([01]?\d|2[0-3]):([0-5]\d)\b/g, norm: (m) => `${Number(m[1])}:${m[2]}` },
  { art: "time", re: /\b([01]?\d|2[0-3]) ?(?:uhr|o'clock)\b/gi, norm: (m) => `${Number(m[1])}:00` },
  { art: "date", re: /\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g, norm: (m) => `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}` },
  { art: "date", re: /\b(\d{4})-(\d{2})-(\d{2})\b/g, norm: (m) => `${m[1]}-${m[2]}-${m[3]}` },
  {
    art: "money",
    re: /(?:€|\$|£|\b(?:EUR|USD|CHF|GBP)\b) ?(\d[\d.,']{0,15}\d|\d)|(\d[\d.,']{0,15}\d|\d) ?(?:€|\$|£|\b(?:EUR|USD|CHF|GBP|euros?|dollars?)\b)/gi,
    norm: (m) => zahl(m[1] ?? m[2] ?? ""),
  },
  { art: "percent", re: /\b(\d{1,4}(?:[.,]\d{1,3})?) ?(?:%|percent\b|prozent\b)/gi, norm: (m) => `${zahl(m[1]!)}%` },
  {
    art: "amount",
    re: /\b(\d{1,6}(?:[.,]\d{1,3})?) ?(days?|tagen?|tage|hours?|stunden?|minutes?|minuten?|weeks?|wochen?|months?|monaten?|monate|years?|jahren?|jahre|users?|nutzer|seats?)\b/gi,
    norm: (m) => `${zahl(m[1]!)} ${einheit(m[2]!)}`,
  },
];

const EINHEITSWOERTER = /^(days?|tag|tage|tagen|hours?|stunde|stunden|minutes?|minute|minuten|weeks?|woche|wochen|months?|monat|monate|monaten|years?|jahr|jahre|jahren|users?|nutzer|seats?|uhr|clock|eur|usd|chf|gbp|euro|euros|dollar|dollars|percent|prozent)$/;
const FUELLWOERTER = new Set(["now", "jetzt", "nun", "new", "neu", "neue", "neuen", "ab", "since", "seit", "every", "jeden", "jede", "jeder", "also", "auch", "only", "nur", "still", "noch"]);

function saetze(text: string): string[] {
  return text
    .slice(0, 8000)
    .replace(/[*_`#>|]+/g, " ")
    .replace(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, "$1")
    .split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ0-9])|\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 12 && s.length <= 400);
}

/** Meaningful words of a sentence, by a short stem — „backup“ and „backups“ meet. */
function stamm(satz: string): Map<string, string> {
  const aus = new Map<string, string>();
  for (const w of satz.toLowerCase().match(/[a-zäöüß]{3,}/g) ?? []) {
    if (STOPWORDS.has(w) || FUELLWOERTER.has(w) || EINHEITSWOERTER.test(w)) continue;
    const s = w.slice(0, 5);
    if (!aus.has(s)) aus.set(s, w);
  }
  return aus;
}

function quelleVon(content: string): string | null {
  return /—\s*(?:Source|Quelle):\s*(\S[^\n]*)$/m.exec(content)?.[1]?.trim() ?? null;
}

/** The source line says where a note came from — its times and dates are not facts. */
const QUELLZEILE = /^\s*—\s*(?:Source|Quelle):.*$/gm;
/** „2–4 days“, „from 2 to 4 days“: the value ends a range — not one value to compare. */
const BEREICH = /(?:\d\s*[-–—]\s*|\d\s+(?:to|bis|and|und)\s+)$/i;

function fakten(n: Pruefnotiz): Fakt[] {
  const aus: Fakt[] = [];
  const quelle = quelleVon(n.content);
  for (const satz of saetze(n.content.replace(QUELLZEILE, ""))) {
    const gefunden: { art: WertArt; wert: string; norm: string; bereich: boolean }[] = [];
    for (const { art, re, norm } of WERTE) {
      const r = new RegExp(re.source, re.flags);
      for (let m = r.exec(satz); m; m = r.exec(satz)) gefunden.push({ art, wert: m[0].trim(), norm: norm(m), bereich: BEREICH.test(satz.slice(0, m.index)) });
    }
    if (!gefunden.length) continue;
    const s = stamm(satz);
    if (s.size < 2) continue;
    for (const g of gefunden) {
      // A range is compared by nobody — but its values still count as mentioned.
      if (g.bereich) continue;
      const werteImSatz = new Set(gefunden.filter((x) => x.art === g.art).map((x) => x.norm));
      aus.push({ notiz: n, satz, wert: g.wert, norm: g.norm, art: g.art, werteImSatz, stamm: s, quelle });
    }
  }
  return aus;
}

export function paarSchluessel(a: string, b: string): string {
  return [a, b].sort().join("|");
}

const VERGLEICHBAR = new Set(["semantic", "procedural"]);
/** „README — 5/17“: one part of a file KEPTA split up — a passage, not one fact. */
const DATEITEIL = /\s[—–-]\s\d+\/([2-9]|\d{2,})$/;

/** All contradictions among the notes — newest first. */
export function findeWidersprueche(notizen: Pruefnotiz[], opts: { ok?: ReadonlySet<string>; limit?: number } = {}): Widerspruch[] {
  const ok = opts.ok ?? new Set<string>();
  const alle: Fakt[] = [];
  for (const n of notizen) {
    if (n.deletedAt || n.supersededBy || !VERGLEICHBAR.has(n.type) || DATEITEIL.test(n.title)) continue;
    alle.push(...fakten(n));
  }
  const postings = new Map<string, number[]>();
  alle.forEach((f, i) => {
    for (const s of f.stamm.keys()) {
      const l = postings.get(s) ?? [];
      l.push(i);
      postings.set(s, l);
    }
  });
  const gesehen = new Set<string>();
  const aus: Widerspruch[] = [];
  alle.forEach((f, i) => {
    const zaehler = new Map<number, number>();
    for (const s of f.stamm.keys()) {
      const l = postings.get(s)!;
      if (l.length > 400) continue; // too common to say anything
      for (const j of l) if (j > i) zaehler.set(j, (zaehler.get(j) ?? 0) + 1);
    }
    for (const [j, gemeinsam] of zaehler) {
      const g = alle[j]!;
      if (gemeinsam < 2 || g.notiz.id === f.notiz.id || g.art !== f.art || g.norm === f.norm) continue;
      if (gemeinsam < 0.5 * Math.min(f.stamm.size, g.stamm.size)) continue;
      if (f.werteImSatz.has(g.norm) || g.werteImSatz.has(f.norm)) continue;
      if (f.quelle && f.quelle === g.quelle) continue;
      const key = paarSchluessel(f.notiz.id, g.notiz.id);
      if (ok.has(key) || gesehen.has(key)) continue;
      gesehen.add(key);
      const [neu, alt] = f.notiz.updatedAt >= g.notiz.updatedAt ? [f, g] : [g, f];
      const worte = [...neu.stamm].filter(([s]) => alt.stamm.has(s)).map(([, w]) => w).slice(0, 4);
      const seite = (x: Fakt): Seite => ({ id: x.notiz.id, title: x.notiz.title, sentence: x.satz, value: x.wert, updatedAt: x.notiz.updatedAt });
      aus.push({ key, newer: seite(neu), older: seite(alt), about: worte.join(" ") });
    }
  });
  return aus.sort((a, b) => b.newer.updatedAt - a.newer.updatedAt).slice(0, opts.limit ?? 20);
}
