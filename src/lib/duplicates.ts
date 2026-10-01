// Duplikat-Erkennung fuer die Wissensbasis.
//
// Vorher lief das als O(n²)-Doppelschleife direkt im Dashboard und brach nach
// acht Funden ab: der Nutzer sah "9 duplicates", aber nie WELCHE — und konnte
// nichts damit tun. Hier steht dieselbe Frage als eigene, pruefbare Einheit:
// vollstaendig (kein Abbruch), skalierend (Blocking statt Alle-gegen-alle) und
// mit einem Vorschlag, welcher Eintrag bleiben soll.
//
// Blocking-Idee (Prefix-Filter, Standard fuer Jaccard-Suche): zwei Texte mit
// hoher Wortueberschneidung teilen sich mit hoher Wahrscheinlichkeit eines
// ihrer SELTENSTEN Woerter. Wir vergleichen deshalb nur Paare, die mindestens
// ein seltenes Wort gemeinsam haben — statt aller n²/2 Paare.
import type { Memory } from "../types";

export type DuplicateReason = "identical-title" | "identical-content" | "near-identical";

export interface DuplicateGroup {
  /** Stabile Gruppen-ID: die kleinste Mitglieds-ID. Bleibt ueber Neuberechnungen gleich. */
  key: string;
  reason: DuplicateReason;
  /** 0..1 — 1 bei exakter Gleichheit, sonst die geringste Aehnlichkeit in der Gruppe. */
  similarity: number;
  /** Mindestens zwei Eintraege, der Vorschlag zum Behalten steht vorn. */
  members: Memory[];
  keepId: string;
}

export interface DuplicateOptions {
  /** Jaccard-Schwelle fuer "fast identisch". */
  threshold?: number;
  /** Paare, die der Nutzer als "kein Duplikat" markiert hat (Schluessel aus pairKey). */
  dismissed?: ReadonlySet<string>;
  /** Notbremse gegen Pathologien; danach bricht nur die Nah-Duplikat-Suche ab. */
  maxComparisons?: number;
}

/**
 * Schwelle fuer "fast identisch".
 *
 * 0,82 auf einzelnen Woertern war zu lax: auf schablonenhaften Notizen — Pfade
 * wie agentdojo/runs/..., generierte Protokolle, Eintraege, die sich nur in
 * einer Zahl unterscheiden — meldete die Suche 396 von 411 Notizen als
 * Duplikate. Formal richtig gerechnet und trotzdem unbrauchbar.
 *
 * Der Wert gilt jetzt fuer WORTPAARE (siehe contentShingles), die viel schaerfer
 * trennen: eine echte Kopie mit Zusatz liegt darueber, eine Schablone mit einem
 * ausgetauschten Wort darunter.
 */
const NEAR_THRESHOLD = 0.85;
const MIN_CONTENT_FOR_NEAR = 80;
/**
 * Zwei Texte sehr verschiedener Laenge sind keine Dubletten, auch wenn der
 * kuerzere fast ganz im laengeren steckt.
 */
const MIN_LENGTH_RATIO = 0.5;
/**
 * Groesste Gruppe, die aus reinen Aehnlichkeits-Kanten entstehen darf.
 *
 * Union-Find zieht Ketten zusammen: A~B, B~C, C~D ... — bei Schablonen wird
 * daraus eine einzige Gruppe mit hunderten Mitgliedern, die niemand aufraeumen
 * will. Solche Faelle sind Familien gleichartiger Notizen, keine Dubletten;
 * ihre Aehnlichkeits-Kanten werden verworfen. Exakte Treffer (gleicher Titel,
 * gleicher Inhalt) bleiben davon unberuehrt — dort ist die Gruppe eine echte
 * Aequivalenzklasse und darf beliebig gross sein.
 */
const MAX_NEAR_GROUP = 12;
/** Obergrenze der Signaturlaenge — haelt den Index klein. */
const MAX_SIGNATURE = 32;
/** Buckets ueber dieser Groesse sind Allerweltswoerter — sie tragen nichts bei. */
const MAX_BUCKET = 120;
const MAX_COMPARISONS = 400_000;

/** Titel vergleichbar machen: Kleinschreibung, Leerraum normalisiert. */
export function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Inhalt vergleichbar machen — dieselbe Regel, aber ohne Laengenbegrenzung. */
export function normalizeContent(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Woerter eines Eintrags in ihrer Reihenfolge (Titel zaehlt mit).
 *
 * Einzelne Buchstaben tragen nichts bei und fliegen raus — einzelne ZIFFERN
 * dagegen unterscheiden Notizen oft als Einziges ("Eintrag 0" gegen
 * "Eintrag 1"). Sie mit derselben Laengenregel wegzuwerfen machte solche
 * Notizen wortgleich und damit faelschlich zu Dubletten.
 */
export function contentWords(m: Pick<Memory, "title" | "content">): string[] {
  return `${m.title} ${m.content}`
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1 || /\d/.test(t));
}

/** Woerter eines Eintrags als Menge — ohne Reihenfolge. */
export function contentTokens(m: Pick<Memory, "title" | "content">): Set<string> {
  return new Set(contentWords(m));
}

/**
 * Wortpaare (Shingles) eines Eintrags — DAS Mass fuer den Vergleich.
 *
 * Auf einzelnen Woertern kann man Fast-Dubletten nicht sauber trennen: zwei
 * Notizen, die sich nur in EINEM Wort mitten im Text unterscheiden, teilen sich
 * 22 von 24 Woertern (0,92) — genauso viel wie eine echte Kopie mit einem
 * angehaengten Satz. Genau daran meldete die Suche auf schablonenhaften Notizen
 * zehn Paare, die keine waren. Ein geaendertes Wort zerstoert dagegen ZWEI
 * Wortpaare, ein angehaengter Satz nur die Paare am Ende — damit trennen sich
 * die beiden Faelle. (Shingling nach Broder, der Standard fuer diese Frage.)
 */
export function contentShingles(m: Pick<Memory, "title" | "content">): Set<string> {
  const w = contentWords(m);
  if (w.length < 2) return new Set(w);
  const out = new Set<string>();
  for (let i = 0; i < w.length - 1; i++) out.add(`${w[i]} ${w[i + 1]}`);
  return out;
}

/** Jaccard-Aehnlichkeit zweier Wortmengen: Schnitt / Vereinigung. */
export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [klein, gross] = a.size <= b.size ? [a, b] : [b, a];
  let schnitt = 0;
  klein.forEach((t) => { if (gross.has(t)) schnitt++; });
  const vereinigung = a.size + b.size - schnitt;
  return vereinigung === 0 ? 0 : schnitt / vereinigung;
}

/**
 * Wie viele der (global gleich geordneten) seltensten Woerter muessen als
 * Bucket-Schluessel dienen, damit KEIN Paar oberhalb der Schwelle durchrutscht?
 *
 * Prefix-Filter (PPJoin): wer die ersten |s| - ceil(t*|s|) + 1 Woerter jeder
 * Menge unter EINER globalen Ordnung indexiert, bekommt fuer jedes Paar mit
 * J >= t garantiert einen gemeinsamen Bucket.
 *
 * Zwei Anlaeufe davor waren falsch: eine feste Zahl (6) hat gar keine Garantie,
 * und 2t/(1+t)*|s| gilt nur fuer gleich grosse Mengen — bei ungleichen Groessen
 * faellt der Prefix der laengeren Menge zu kurz aus und das Paar entgeht der
 * Suche. Die Form hier haelt auch dann, weil aus |a| >= t*|b| (Laengenfilter)
 * folgt, dass die noetige Ueberschneidung mindestens ceil(t*|b|) betraegt.
 */
export function signatureLength(groesse: number, schwelle: number): number {
  if (groesse <= 0) return 0;
  return Math.max(1, Math.min(MAX_SIGNATURE, groesse - Math.ceil(schwelle * groesse) + 1));
}

/** Richtungsloser Schluessel eines Paares — a|b und b|a ergeben dasselbe. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Wer soll bleiben? Der inhaltsreichste Eintrag — beim Zusammenlegen geht so am
 * wenigsten verloren. Gleichstand entscheidet der zuletzt bearbeitete, danach
 * die ID (damit der Vorschlag zwischen zwei Aufrufen stabil bleibt).
 */
export function suggestKeeper(members: readonly Memory[]): Memory {
  return [...members].sort((a, b) =>
    b.content.length - a.content.length ||
    b.updatedAt - a.updatedAt ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  )[0];
}

// ---------- Union-Find, damit aus Paaren Gruppen werden ----------

function finde(eltern: Map<string, string>, id: string): string {
  let wurzel = id;
  while (eltern.get(wurzel) !== wurzel) wurzel = eltern.get(wurzel)!;
  // Pfadverkuerzung
  let lauf = id;
  while (eltern.get(lauf) !== wurzel) {
    const naechst = eltern.get(lauf)!;
    eltern.set(lauf, wurzel);
    lauf = naechst;
  }
  return wurzel;
}

function vereinige(eltern: Map<string, string>, a: string, b: string): void {
  const wa = finde(eltern, a);
  const wb = finde(eltern, b);
  if (wa !== wb) eltern.set(wa, wb);
}

/**
 * Alle Duplikat-Gruppen der Wissensbasis — vollstaendig, ohne Deckel.
 *
 * Drei Stufen, jede strenger als die naechste ist schwach:
 *  1. identischer Titel
 *  2. identischer Inhalt
 *  3. Wortueberschneidung ueber der Schwelle (nur innerhalb der Blocking-Buckets)
 */
export function findDuplicateGroups(
  memories: readonly Memory[],
  opts: DuplicateOptions = {}
): DuplicateGroup[] {
  const schwelle = opts.threshold ?? NEAR_THRESHOLD;
  const verworfen = opts.dismissed ?? new Set<string>();
  const maxVergleiche = opts.maxComparisons ?? MAX_COMPARISONS;
  if (memories.length < 2) return [];

  const eltern = new Map<string, string>();
  for (const m of memories) eltern.set(m.id, m.id);
  const grund = new Map<string, DuplicateReason>();
  const aehnlichkeit = new Map<string, number>();

  /** Ein Paar verbinden — es sei denn, der Nutzer hat es als "kein Duplikat" abgelehnt. */
  const verbinde = (a: string, b: string, r: DuplicateReason, sim: number): void => {
    if (verworfen.has(pairKey(a, b))) return;
    vereinige(eltern, a, b);
    const wurzel = finde(eltern, a);
    // Der ueberzeugendste Beleg beschreibt die Gruppe; die Aehnlichkeit meldet
    // dazu den schwaechsten Link — so steht neben dem Grund immer die Untergrenze.
    const bisher = grund.get(wurzel);
    if (bisher === undefined || rang(r) < rang(bisher)) grund.set(wurzel, r);
    const simBisher = aehnlichkeit.get(wurzel);
    if (simBisher === undefined || sim < simBisher) aehnlichkeit.set(wurzel, sim);
  };

  // --- Stufe 1+2: exakte Bloecke, O(n) ueber eine Hashtabelle ---
  const nachTitel = new Map<string, string[]>();
  const nachInhalt = new Map<string, string[]>();
  for (const m of memories) {
    const t = normalizeTitle(m.title);
    if (t) {
      const bucket = nachTitel.get(t);
      if (bucket) bucket.push(m.id); else nachTitel.set(t, [m.id]);
    }
    const c = normalizeContent(m.content);
    if (c.length > 30) {
      const bucket = nachInhalt.get(c);
      if (bucket) bucket.push(m.id); else nachInhalt.set(c, [m.id]);
    }
  }
  for (const ids of nachTitel.values()) {
    for (let i = 1; i < ids.length; i++) verbinde(ids[0], ids[i], "identical-title", 1);
  }
  for (const ids of nachInhalt.values()) {
    for (let i = 1; i < ids.length; i++) verbinde(ids[0], ids[i], "identical-content", 1);
  }

  // --- Stufe 3: Nah-Duplikate ueber Blocking ---
  const kandidaten = memories.filter((m) => m.content.length >= MIN_CONTENT_FOR_NEAR);
  if (kandidaten.length >= 2) {
    const tokens = new Map<string, Set<string>>();
    const laenge = new Map<string, number>();
    const haeufigkeit = new Map<string, number>();
    for (const m of kandidaten) {
      const ts = contentShingles(m);
      tokens.set(m.id, ts);
      laenge.set(m.id, m.content.length);
      ts.forEach((t) => haeufigkeit.set(t, (haeufigkeit.get(t) ?? 0) + 1));
    }

    // Jeder Eintrag landet in den Buckets seiner seltensten Woerter.
    const buckets = new Map<string, string[]>();
    for (const m of kandidaten) {
      const geordnet = [...tokens.get(m.id)!]
        .sort((a, b) => (haeufigkeit.get(a)! - haeufigkeit.get(b)!) || (a < b ? -1 : 1));
      const selten = geordnet.slice(0, signatureLength(geordnet.length, schwelle));
      for (const t of selten) {
        const bucket = buckets.get(t);
        if (bucket) bucket.push(m.id); else buckets.set(t, [m.id]);
      }
    }

    const gesehen = new Set<string>();
    const nahPaare: { a: string; b: string; sim: number }[] = [];
    let vergleiche = 0;
    for (const ids of buckets.values()) {
      if (ids.length < 2 || ids.length > MAX_BUCKET) continue;
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          if (vergleiche >= maxVergleiche) break;
          const schluessel = pairKey(ids[i], ids[j]);
          if (gesehen.has(schluessel)) continue;
          gesehen.add(schluessel);
          vergleiche++;
          const la = laenge.get(ids[i])!;
          const lb = laenge.get(ids[j])!;
          if (Math.min(la, lb) / Math.max(la, lb) < MIN_LENGTH_RATIO) continue;
          const sim = jaccard(tokens.get(ids[i])!, tokens.get(ids[j])!);
          if (sim > schwelle) nahPaare.push({ a: ids[i], b: ids[j], sim });
        }
      }
    }

    // Probelauf: welche Ketten wuerden entstehen? Zu grosse verwerfen.
    const probe = new Map<string, string>();
    for (const { a, b } of nahPaare) { if (!probe.has(a)) probe.set(a, a); if (!probe.has(b)) probe.set(b, b); }
    for (const { a, b } of nahPaare) vereinige(probe, a, b);
    const groesse = new Map<string, number>();
    for (const id of probe.keys()) {
      const w = finde(probe, id);
      groesse.set(w, (groesse.get(w) ?? 0) + 1);
    }
    for (const { a, b, sim } of nahPaare) {
      if ((groesse.get(finde(probe, a)) ?? 0) > MAX_NEAR_GROUP) continue;
      verbinde(a, b, "near-identical", sim);
    }
  }

  // --- Wurzeln einsammeln ---
  const gruppen = new Map<string, Memory[]>();
  for (const m of memories) {
    const wurzel = finde(eltern, m.id);
    const liste = gruppen.get(wurzel);
    if (liste) liste.push(m); else gruppen.set(wurzel, [m]);
  }

  const out: DuplicateGroup[] = [];
  for (const [wurzel, mitglieder] of gruppen) {
    if (mitglieder.length < 2) continue;
    const keeper = suggestKeeper(mitglieder);
    const rest = mitglieder
      .filter((m) => m.id !== keeper.id)
      .sort((a, b) => b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : 1));
    const key = [...mitglieder].map((m) => m.id).sort()[0];
    out.push({
      key,
      reason: grund.get(wurzel) ?? "near-identical",
      similarity: aehnlichkeit.get(wurzel) ?? 1,
      members: [keeper, ...rest],
      keepId: keeper.id,
    });
  }

  // Strengste (und groesste) Gruppen zuerst — der Nutzer raeumt oben auf.
  return out.sort(
    (a, b) =>
      b.members.length - a.members.length ||
      b.similarity - a.similarity ||
      (a.key < b.key ? -1 : 1)
  );
}

/** Wie stark ist ein Beleg? Kleiner = ueberzeugender. */
function rang(r: DuplicateReason): number {
  return r === "identical-title" ? 0 : r === "identical-content" ? 1 : 2;
}

/** Klartext fuer die Oberflaeche. */
export function reasonLabel(r: DuplicateReason, similarity: number): string {
  if (r === "identical-title") return "Same title";
  if (r === "identical-content") return "Same content";
  return `${Math.round(similarity * 100)} % word overlap`;
}

/** Wie viele Eintraege verschwinden, wenn der Nutzer alle Vorschlaege annimmt. */
export function redundantCount(groups: readonly DuplicateGroup[]): number {
  return groups.reduce((n, g) => n + g.members.length - 1, 0);
}
