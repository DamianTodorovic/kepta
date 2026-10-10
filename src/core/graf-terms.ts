// Die Begriffsrechnung des Graph-Dienstes (A9 §4) — fuer den INDEX, nicht fuer
// die Anfrage.
//
// Der Suchpfad schaetzt Anfragen mit contentTerms() und kappt sie bei
// MAX_QUERY_TERMS. Dieselbe Funktion als Indexier-Regel zu benutzen war einer der
// Befunde dieses Audits: ein langer Titel verschluckt dann still seine Haelfte.
// Deshalb steht hier eine eigene Zerlegung — Stoppwoerter ja, Anfrage-Kappe nein,
// Fuellwort-Fallback nein (ein Index aus Fuellwoertern ist Rauschen, eine Suche
// ohne Begriffe ist Stille).

import { STOPWORDS } from "./stopwords";

/** Ein Knoten mit seinen Begriffen — die Form, die der Graphindex kennt. */
export interface KnotenBegriffe {
  id: string;
  begriffe: readonly string[];
}

/** Begriffsstatistik ueber dem mitgenommenen Bestand. */
export interface BegriffsIndex {
  /** Zahl der Knoten im Bestand (N). */
  n: number;
  /** df(t) — Zahl der Knoten, die den Begriff tragen, nicht Zahl der Nennungen. */
  df: Map<string, number>;
  /** g(t) = ln(1 + N/df) — Vorrang und Feder in einer Groesse. */
  gewicht: Map<string, number>;
}

/**
 * Zerlegt einen Text in begriffstraechtige Wortformen: klein, ohne Satzzeichen,
 * ohne Einzelzeichen, ohne Fuellwoerter, ohne Kappe. Unicode-Klassen wie im
 * Suchpfad, damit kyrillische und CJK-Texte nicht verschwinden.
 */
export function indexierBegriffe(text: string): string[] {
  const seen = new Set<string>();
  const begriffe: string[] = [];
  for (const roh of text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/)) {
    if (roh.length < 2) continue;
    if (STOPWORDS.has(roh)) continue;
    if (seen.has(roh)) continue;
    seen.add(roh);
    begriffe.push(roh);
  }
  return begriffe;
}

/** g(t): der haeufigste Begriff in 10 000 Notizen wiegt nahe null, aber nicht null. */
export function begriffsGewicht(n: number, df: number): number {
  if (n <= 0 || df <= 0) return 0;
  return Math.log(1 + n / df);
}

/** Zaehlt df(t) ueber dem Bestand und leitet g(t) daraus ab. */
export function begriffsIndex(knoten: readonly KnotenBegriffe[]): BegriffsIndex {
  const df = new Map<string, number>();
  for (const k of knoten) {
    for (const t of new Set(k.begriffe)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const gewicht = new Map<string, number>();
  for (const [t, anzahl] of df) gewicht.set(t, begriffsGewicht(knoten.length, anzahl));
  return { n: knoten.length, df, gewicht };
}

/** Duenner, normierter Begriffsvektor (Laenge 1). Begriffe ohne Gewicht fallen raus. */
export function vektor(begriffe: Iterable<string>, index: BegriffsIndex): Map<string, number> {
  const roh = new Map<string, number>();
  let quadrate = 0;
  const mengen = begriffe instanceof Set ? begriffe : new Set(begriffe);
  for (const t of mengen) {
    const g = index.gewicht.get(t);
    if (g === undefined || g <= 0) continue;
    roh.set(t, g);
    quadrate += g * g;
  }
  if (quadrate === 0) return new Map();
  const laenge = Math.sqrt(quadrate);
  const normiert = new Map<string, number>();
  for (const [t, g] of roh) normiert.set(t, g / laenge);
  return normiert;
}

/** Gewichteter Cosinus: das Skalarprodukt zweier normierter Vektoren, 0..1. */
export function skalarprodukt(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): number {
  const [kleiner, groesser] = a.size <= b.size ? [a, b] : [b, a];
  let summe = 0;
  for (const [t, w] of kleiner) {
    const other = groesser.get(t);
    if (other !== undefined) summe += w * other;
  }
  return summe < 0 ? 0 : summe > 1 ? 1 : summe;
}

/**
 * |A ∩ B| / |A ∪ B| — die Ersetzung fuer die min-Division in `src/ui/graph.ts`
 * (B-11): ein Begriff gegen acht ergibt 0,125 und nicht die staerkste Kante des
 * Systems.
 */
export function jaccard(a: Iterable<string>, b: Iterable<string>): number {
  const setA = a instanceof Set ? a : new Set(a);
  const setB = b instanceof Set ? b : new Set(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let gemeinsam = 0;
  for (const t of setA) if (setB.has(t)) gemeinsam++;
  return gemeinsam / (setA.size + setB.size - gemeinsam);
}
