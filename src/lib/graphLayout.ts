// Kraftbasiertes Layout fuer den Wissensgraphen — ohne Wand, ohne Deckel.
//
// Der alte Lauf steckte direkt in der Komponente und hatte drei harte Grenzen:
//   1. Jeder Knoten wurde am Ende jedes Ticks in das SICHTFENSTER geklemmt
//      (Math.max(r+10, Math.min(breite-r-10, x))). Das war die "virtuelle Wand":
//      ab etwa 150 Knoten passte die noetige Flaeche nicht mehr hinein und die
//      Knoten pressten sich als Gitter an den Rand.
//   2. Die Abstossung lief als Alle-gegen-alle (O(n²)) in jedem Bild.
//   3. Die Kanten entstanden ebenfalls aus allen n²/2 Paaren.
//
// Hier gilt: die Welt ist unbegrenzt, das Fenster ist nur ein Ausschnitt. Die
// Abstossung nutzt einen Barnes-Hut-Quadtree (O(n log n)), die Kanten entstehen
// ueber einen invertierten Index, und die Simulation kuehlt aus und haelt an —
// statt dauerhaft Rechenzeit zu verbrennen.
import type { Memory } from "../types";
import type { Gueltigkeit } from "./graphTime";

/**
 * Was ueber einem Paar steht: wie lange es gilt und WAS behauptet wird. Der Typ
 * ist hier optional, weil nicht jede echte Kante einen nennt — eine Erwaehnung
 * fuehrt die Notiz zum Begriff, ohne etwas ueber zwei Begriffe zu sagen.
 */
export interface PaarInfo extends Gueltigkeit {
  relation?: string | null;
}

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Sichtbarer Radius in Weltkoordinaten — die Kollision braucht ihn. */
  r: number;
  /** Waehrend des Ziehens festgehalten. Nach dem Loslassen wieder frei. */
  pinned: boolean;
}

export interface LayoutEdge {
  source: string;
  target: string;
  strength: number;
  /** Echte Relation aus der Graph-DB (nicht nur Aehnlichkeit). */
  real: boolean;
  /**
   * Wie lange die Aussage gilt, die hinter der Kante steht. Nur echte
   * Behauptungen haben ein Fenster; eine Aehnlichkeitskante hat keins — und
   * `fensterOffen` behandelt fehlend als „gilt immer".
   */
  validFrom?: number | null;
  validTo?: number | null;
  /**
   * Was behauptet wird — „betreut", „meldet an". Das Etikett an der Linie.
   * Fehlend bei Aehnlichkeit und bei Erwähnungen: die nennen keinen Typ, und
   * erfinden darf ihn hier niemand.
   */
  relation?: string | null;
  /** Wie viele VERSCHIEDENE Typen über dem Paar liegen. 1 = eine Behauptung. */
  typen?: number;
  /** Wie viele Aussagen das Paar tragen. Die Evidenz hinter der Dicke. */
  belege?: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Transform {
  x: number;
  y: number;
  k: number;
}

// ---------- Konstanten ----------

/** Barnes-Hut-Oeffnungswinkel: kleiner = genauer, groesser = schneller. */
export const THETA = 0.9;
/**
 * Ruheabstand einer Kante (die Knotenradien kommen hinzu).
 *
 * Vorher 150 — und damit groesser als der Abstand, den Abstossung und Kollision
 * ohnehin herstellen. Die Federn drueckten deshalb AUSEINANDER statt zusammen:
 * gemessen sassen verbundene Paare 164 Einheiten auseinander, beliebige 160.
 * Eine Verbindung machte also keinen Unterschied, und der Graph zeigte keine
 * Struktur — bei einem Wissensgraphen ist das der ganze Zweck.
 *
 * Mit 45 ziehen Kanten wirklich an: verbundene Paare rund 60, beliebige rund 270.
 */
export const IDEAL_LINK = 45;
/**
 * Was ein Knoten pro Bild höchstens wandern darf. Das Federnetz wird mit
 * explizitem Euler integriert; ohne diese Grenze ist es für Begriffe mit vielen
 * Blättern instabil und die Welt wächst pro Bild um den Faktor zwei.
 */
export const MAX_VERZUG = IDEAL_LINK * 3;
/** Staerke der Abstossung pro Knoten. */
export const REPULSION = 3400;
/**
 * Weiche Feder zum Ursprung — verhindert Abdriften, ohne zu stauchen.
 *
 * Der Wert wird durch sqrt(n) geteilt (siehe gravityFor). Mit KONSTANTER
 * Schwerkraft stellt sich der Gleichgewichtsradius auf R ~ N^(1/3) ein, gleiche
 * Dichte braucht aber R ~ N^(1/2): der Graph waere mit wachsendem Wissen immer
 * dichter geworden — dieselbe Beschwerde wie bei der Wand, nur ohne Wand.
 */
export const GRAVITY = 0.00055;
export const DAMPING = 0.82;
/** Schrittweite der Integration. */
export const DT = 0.016;
export const ALPHA_DECAY = 0.0165;
export const ALPHA_MIN = 0.006;
/** Grundstaerke der Federn; die Gewichtung nach Grad kommt aus linkStaerken(). */
export const LINK_STAERKE = 0.55;
/** Typischer Knotenabstand — bestimmt, wie gross die Startspirale ausfaellt. */
export const SPACING = 92;
/**
 * Luft zwischen zwei Knoten. Die Kollision haelt diesen Abstand IMMER ein —
 * unabhaengig von alpha und unabhaengig vom Zoom.
 */
export const COLLIDE_PADDING = 14;
/**
 * Wie oft die Kollision pro Bild nachbessert.
 *
 * Zwei Durchgaenge genuegten, solange die Federn schwach zogen. Seit der
 * Ruheabstand richtig gesetzt ist (Kanten ziehen wirklich an), schafft eine
 * dichte Clique es sonst, den Loeser zu ueberholen — dann ueberlappen wieder
 * einzelne Knoten, und genau das sah man dem Graphen an.
 *
 * Vier, seit der Loeser zellweise statt knotenweise durchlaeuft: er sieht jedes
 * Paar nur noch einmal statt zweimal und braucht dadurch einen Durchgang mehr,
 * bis eine dichte Clique steht. Unterm Strich ist das trotzdem ein Bruchteil
 * der alten Kosten — bei 25 000 Knoten 11,4 ms statt 73,2 ms.
 */
export const COLLIDE_ITERATIONEN = 4;
/** Standardradius, wenn der Aufrufer keinen angibt. */
export const DEFAULT_RADIUS = 10;
const MAX_DEPTH = 26;

/**
 * Schwerkraft fuer n Knoten. Aus dem Gleichgewicht von Abstossung (REPULSION*n/R²)
 * und Feder (g*R) folgt R³ ~ REPULSION*n/g; mit g ~ 1/sqrt(n) wird daraus
 * R ~ sqrt(n) — und damit bleibt die Dichte gleich, egal wie viel Wissen da ist.
 */
export function gravityFor(anzahl: number): number {
  return GRAVITY / Math.sqrt(Math.max(1, anzahl));
}

// ---------- Kanten ----------

/** Anteil gemeinsamer Tags, bezogen auf die kleinere Menge. */
export function tagOverlap(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a.map((t) => t.toLowerCase()));
  let inter = 0;
  for (const t of b) if (sa.has(t.toLowerCase())) inter++;
  return inter / Math.min(a.length, b.length);
}

/** Anteil gemeinsamer Titelwoerter, bezogen auf die kleinere Menge. */
export function titleSimilarity(a: string, b: string): number {
  const wa = new Set(a.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  const wb = new Set(b.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  if (wa.size === 0 || wb.size === 0) return 0;
  let inter = 0;
  wa.forEach((w) => { if (wb.has(w)) inter++; });
  return inter / Math.min(wa.size, wb.size);
}

export interface EdgeOptions {
  /**
   * Echte Paare aus der Graph-DB — sie ueberleben jede Kuerzung. Das dritte
   * Element fuehrt, was ueber dem Paar steht: sein Gueltigkeitsfenster und,
   * wenn die Aussage einen nennt, ihren Typ.
   */
  realPairs?: readonly (readonly [string, string, PaarInfo?])[];
  /**
   * Aehnlichkeitskanten ueberhaupt suchen. Standard: ja. Die Flaeche schaltet
   * sie ab — bei 75 Notizen und 891 Kanten war fast alles Aehnlichkeit, und die
   * Behauptungen, die jemand wirklich verknuepft hat, waren nicht mehr zu sehen.
   */
  ahnlichkeit?: boolean;
  /** Obergrenze; ohne Angabe waechst sie mit der Knotenzahl. */
  maxEdges?: number;
  /** Buckets ueber dieser Groesse sind Allerweltsbegriffe und werden uebersprungen. */
  maxBucket?: number;
  /**
   * Knoten-IDs, die keine Notizen sind — die Konzepte des Kraftfelds. Ohne sie
   * würde jedes Paar weggeworfen, das ans Gerüst führt, und das Gerüst hinge
   * unsichtbar im Bild.
   */
  knotenIds?: Iterable<string>;
  /**
   * Aussagen über denselben Begriff (Quelle = Ziel) als Schleife zeichnen.
   * Standard: aus — wie bei den Vorbildern am Markt. Eine Selbstbehauptung ist
   * die seltenste und am leichtesten missverstandene Kante im Bild; wer sie
   * sieht, hat sie ausdrücklich bestellt.
   */
  selbstkaanten?: boolean;
}

/**
 * Die Woerter, die der Store selbst setzt: „mentions" fuer jeden Wiki-Link
 * (verknuepfeNotiz), „related" als Fuellwort fuer eine Aussage ohne Typ
 * (addRelation). Sie sind keine Behauptung eines Menschen — und die Form der
 * Linie sagt bereits, was sie ist. Ein Etikett davon kostet dieselbe Stelle im
 * Budget wie eine echte Aussage.
 */
const SYSTEM_WOERTER = new Set(["mentions", "related"]);

function systemWort(name: string): boolean {
  return SYSTEM_WOERTER.has(name.toLowerCase());
}

const DEFAULT_MAX_BUCKET = 140;

/**
 * Kanten aus Tag- und Titel-Ueberschneidung — ueber einen invertierten Index,
 * nicht ueber alle Paare. Zwei Notizen ohne ein gemeinsames Tag und ohne ein
 * gemeinsames Titelwort konnten auch vorher nie eine Kante bekommen; der
 * Unterschied ist nur, dass wir sie jetzt gar nicht erst vergleichen.
 */
export function buildEdges(memories: readonly Memory[], opts: EdgeOptions = {}): LayoutEdge[] {
  return kantenBaue(memories, opts).edges;
}

export interface KantenErgebnis {
  edges: LayoutEdge[];
  /**
   * Wie viele Nachbarn je Knoten der Kantengrenze zum Opfer gefallen sind.
   * Nur die Aehnlichkeitskanten fallen — echte Paare ueberleben jede Kuerzung.
   */
  versteckteNachbarn: Map<string, number>;
  /** Dieselben Zahlen aufsummiert — fuer eine Zeile, die nicht verschweigt,
   *  was hinter den Badges steht. */
  verstecktInSumme: number;
  /**
   * Selbstkanten — getrennt von `edges`, weil die Physik und der Grad eines
   * Knotens davon nichts erfahren dürfen: eine Behauptung über sich selbst ist
   * kein Nachbar.
   */
  selbst: LayoutEdge[];
  /** Wie viele Selbstpaare im Bestand standen, auch als der Schalter aus war. */
  selbstInSumme: number;
}

/**
 * Dasselbe wie `buildEdges`, mit Rapport: die Flaeche braucht zu wissen, was
 * der Grenze zum Opfer gefallen ist, um ein Badge und eine ehrliche Zeile
 * daraus zu machen. `buildEdges` bleibt der duenne Rückfall fuer alle, denen
 * die Kantenliste allein reicht.
 */
export function kantenBaue(memories: readonly Memory[], opts: EdgeOptions = {}): KantenErgebnis {
  const ids = new Set(memories.map((m) => m.id));
  for (const id of opts.knotenIds ?? []) ids.add(id);
  const maxBucket = opts.maxBucket ?? DEFAULT_MAX_BUCKET;
  const maxEdges = opts.maxEdges ?? Math.min(12_000, Math.max(1200, memories.length * 6));

  const out: LayoutEdge[] = [];
  const belegt = new Set<string>();
  const echte = new Map<string, LayoutEdge>();
  const fenster = new Map<string, Gueltigkeit>();
  const typen = new Map<string, Set<string>>();
  const schluessel = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  /**
   * Zwei Aussagen über demselben Begriffspaar teilen sich einen Strich, weil
   * buildEdges pro Paar nur eine Kante kennt (P-8 macht daraus erst mehrere).
   * Der Strich gilt, solange eine von ihnen gilt — sonst überdeckte die erste
   * erledigte Behauptung eine, die es noch gibt, und die Fläche strich eine
   * lebende Aussage. Eine fehlende Grenze heißt unbegrenzt und bleibt es.
   */
  const vereine = (bisher: Gueltigkeit | undefined, neu: Gueltigkeit): Gueltigkeit => {
    if (!bisher) return neu;
    const von = [bisher.validFrom, neu.validFrom];
    const bis = [bisher.validTo, neu.validTo];
    return {
      validFrom: von.some((v) => v == null) ? null : Math.min(...(von as number[])),
      validTo: bis.some((v) => v == null) ? null : Math.max(...(bis as number[])),
    };
  };
  const UNBEFRISTET: Gueltigkeit = { validFrom: null, validTo: null };

  // Selbstbehauptungen laufen in einer eigenen Liste: die Physik und der Grad
  // eines Knotens dürfen davon nichts erfahren, sonst wird aus „zweifelt an
  // sich selbst" ein Nachbarschaftsgewicht.
  const selbst = new Map<string, LayoutEdge>();
  let selbstInSumme = 0;
  for (const [a, b, info] of opts.realPairs ?? []) {
    if (!ids.has(a) || !ids.has(b)) continue;
    const istSelbst = a === b;
    if (istSelbst) {
      selbstInSumme += 1;
      // Ausgeschaltet heißt nicht vergessen: die Zahl oben bleibt, die Fläche
      // meldet sie als das, was ihr fehlt.
      if (!opts.selbstkaanten) continue;
    }
    const k = istSelbst ? `selbst|${a}` : schluessel(a, b);
    const wo = istSelbst ? selbst : echte;
    let kant = wo.get(k);
    if (!kant) {
      kant = { source: a, target: b, strength: 0.85, real: true };
      wo.set(k, kant);
      if (!istSelbst) {
        // Die Schleife geht nirgendwo hin: kein Paar, das die
        // Aehnlichkeitssuche für sich beansprucht, und kein Rand in `out`.
        belegt.add(k);
        out.push(kant);
      }
    }
    // Jeder Beleg zaehlt, auch der zweite desselben Typs: drei Notizen, die
    // dieselbe Behauptung tragen, sind drei Belege — und der Strich darf dicker
    // sein als einer, hinter dem nur eine steht.
    kant.belege = (kant.belege ?? 0) + 1;
    const name = typeof info?.relation === "string" ? info.relation.trim() : "";
    if (name) {
      let namen = typen.get(k);
      if (!namen) { namen = new Set(); typen.set(k, namen); }
      // Zaehlen und benennen darf nur, was ein Mensch gesagt hat. „mentions"
      // setzt der Store fuer jeden Wiki-Link selbst — mitzaehlen, aber nicht
      // das Etikett stellen.
      if (!systemWort(name)) {
        namen.add(name);
        if (kant.relation === undefined) kant.relation = name;
      } else if (kant.relation === undefined) {
        // Der Systemtyp bleibt sichtbar, wenn weiter nichts ueber dem Paar
        // steht: die Kantkarte darf nicht so tun, als kenne sie den Typ nicht.
        kant.relation = name;
      }
    }
    fenster.set(k, vereine(fenster.get(k), info ?? UNBEFRISTET));
  }
  // Die Gültigkeit kommt erst zum Schluss auf die Kante, weil sie über alle
  // Aussagen des Pairs hinweg vereint werden muss. Ein unbefristetes Ergebnis
  // lässt die Felder fort — „fehlend" heißt bei fensterOffen „gilt immer", und
  // eine Aehnlichkeitskante hat ohnehin keine Gültigkeit.
  const verguete = (kant: LayoutEdge, k: string) => {
    const f = fenster.get(k);
    if (f && (f.validFrom != null || f.validTo != null)) {
      kant.validFrom = f.validFrom ?? null;
      kant.validTo = f.validTo ?? null;
    }
    const namen = typen.get(k);
    if (namen) kant.typen = namen.size;
  };
  echte.forEach(verguete);
  selbst.forEach(verguete);

  if (opts.ahnlichkeit === false) {
    return { edges: out, versteckteNachbarn: new Map(), verstecktInSumme: 0, selbst: [...selbst.values()], selbstInSumme };
  }

  // Invertierter Index: Begriff -> Notizen. Nur Paare, die sich mindestens
  // einen Begriff teilen, kommen ueberhaupt in die Bewertung.
  const index = new Map<string, string[]>();
  const lege = (begriff: string, id: string) => {
    const bucket = index.get(begriff);
    if (bucket) bucket.push(id); else index.set(begriff, [id]);
  };
  const byId = new Map<string, Memory>();
  for (const m of memories) {
    byId.set(m.id, m);
    for (const t of m.tags) { const s = t.toLowerCase().trim(); if (s) lege(`#${s}`, m.id); }
    for (const w of m.title.toLowerCase().split(/\W+/)) if (w.length > 2) lege(w, m.id);
  }

  const bewertet = new Set<string>(belegt);
  const kandidaten: LayoutEdge[] = [];
  for (const bucket of index.values()) {
    if (bucket.length < 2 || bucket.length > maxBucket) continue;
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const k = schluessel(bucket[i], bucket[j]);
        if (bewertet.has(k)) continue;
        bewertet.add(k);
        const a = byId.get(bucket[i])!;
        const b = byId.get(bucket[j])!;
        const tagScore = tagOverlap(a.tags, b.tags);
        const titleScore = titleSimilarity(a.title, b.title);
        const strength = Math.max(tagScore * 0.9, titleScore * 0.6);
        if (strength > 0.24) kandidaten.push({ source: a.id, target: b.id, strength, real: false });
        else if (tagScore > 0 && titleScore > 0.15) kandidaten.push({ source: a.id, target: b.id, strength: 0.3, real: false });
      }
    }
  }

  // Muss gekuerzt werden, fallen die schwaechsten Aehnlichkeiten zuerst — und
  // was faellt, ist ein Nachbar weniger im Bild. Die Zahl mitzunehmen kostet
  // einen Durchgang ueber den ohnehin schon fertigen Kandidaten und ist der
  // einzige Weg, ein Badge ehrlich zu nennen.
  kandidaten.sort((a, b) => b.strength - a.strength);
  const versteckteNachbarn = new Map<string, number>();
  let verstecktInSumme = 0;
  for (let i = 0; i < kandidaten.length; i++) {
    const e = kandidaten[i];
    if (out.length < maxEdges) {
      out.push(e);
      continue;
    }
    // Ein echtes Paar ist hier nie dabei: echte Kanten stehen vor dem Suchlauf
    // in `out` und jeder Kandidat wurde genau einmal bewertet.
    versteckteNachbarn.set(e.source, (versteckteNachbarn.get(e.source) ?? 0) + 1);
    versteckteNachbarn.set(e.target, (versteckteNachbarn.get(e.target) ?? 0) + 1);
    verstecktInSumme += 2;
  }
  return { edges: out, versteckteNachbarn, verstecktInSumme, selbst: [...selbst.values()], selbstInSumme };
}

// ---------- Startaufstellung ----------

/**
 * Sonnenblumen-Spirale: gleichmaessige Dichte fuer jede Knotenzahl. Der Radius
 * waechst mit sqrt(n) — bei 20 Knoten ein kleiner Kreis, bei 5000 eine grosse
 * Scheibe. Genau das konnte die alte Version nicht, weil sie in das Fenster
 * hineingerechnet hat statt in die Welt.
 */
export function initialPositions(
  ids: readonly string[],
  spacing = SPACING,
  radiusOf: (id: string) => number = () => DEFAULT_RADIUS
): LayoutNode[] {
  const goldener = Math.PI * (3 - Math.sqrt(5));
  return ids.map((id, i) => {
    const r = spacing * 0.5 * Math.sqrt(i + 0.5);
    const winkel = i * goldener;
    return { id, x: Math.cos(winkel) * r, y: Math.sin(winkel) * r, vx: 0, vy: 0, r: radiusOf(id), pinned: false };
  });
}

// ---------- Barnes-Hut-Quadtree ----------

interface Quad {
  x0: number;
  y0: number;
  size: number;
  cx: number;
  cy: number;
  masse: number;
  kinder: (Quad | null)[] | null;
  blatt: LayoutNode | null;
}

function neuerQuad(x0: number, y0: number, size: number): Quad {
  return { x0, y0, size, cx: 0, cy: 0, masse: 0, kinder: null, blatt: null };
}

function einfuegen(q: Quad, n: LayoutNode, tiefe: number): void {
  // Schwerpunkt fortschreiben
  q.cx = (q.cx * q.masse + n.x) / (q.masse + 1);
  q.cy = (q.cy * q.masse + n.y) / (q.masse + 1);
  q.masse += 1;

  if (q.kinder === null) {
    if (q.blatt === null) { q.blatt = n; return; }
    // Deckelt die Rekursion, wenn zwei Knoten exakt aufeinander liegen.
    if (tiefe >= MAX_DEPTH) return;
    const alt = q.blatt;
    q.blatt = null;
    q.kinder = [null, null, null, null];
    platziere(q, alt, tiefe);
  }
  platziere(q, n, tiefe);
}

function platziere(q: Quad, n: LayoutNode, tiefe: number): void {
  const halb = q.size / 2;
  const rechts = n.x >= q.x0 + halb ? 1 : 0;
  const unten = n.y >= q.y0 + halb ? 1 : 0;
  const idx = unten * 2 + rechts;
  let kind = q.kinder![idx];
  if (!kind) {
    kind = neuerQuad(q.x0 + rechts * halb, q.y0 + unten * halb, halb);
    q.kinder![idx] = kind;
  }
  einfuegen(kind, n, tiefe + 1);
}

/** Baut den Baum ueber alle Knoten. null, wenn nichts einzufuegen ist. */
export function buildQuadtree(nodes: readonly LayoutNode[]): Quad | null {
  if (nodes.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }
  const size = Math.max(maxX - minX, maxY - minY, 1) * 1.05 + 1;
  const wurzel = neuerQuad(minX - 0.5, minY - 0.5, size);
  for (const n of nodes) einfuegen(wurzel, n, 0);
  return wurzel;
}

/**
 * Abstossungskraft auf einen Knoten. Ferne Ballungen werden als EIN Koerper
 * genaehert (Barnes-Hut) — daher O(log n) statt O(n) pro Knoten.
 */
export function repulsionOn(
  q: Quad | null,
  n: LayoutNode,
  staerke: number,
  theta: number,
  out: { fx: number; fy: number }
): void {
  if (!q || q.masse === 0) return;
  const dx = n.x - q.cx;
  const dy = n.y - q.cy;
  let distSq = dx * dx + dy * dy;

  if (q.blatt !== null) {
    if (q.blatt === n) return;
    if (distSq < 1) distSq = 1;
    const dist = Math.sqrt(distSq);
    const f = (staerke * q.masse) / distSq;
    out.fx += (dx / dist) * f;
    out.fy += (dy / dist) * f;
    return;
  }

  if (distSq < 1) distSq = 1;
  const dist = Math.sqrt(distSq);
  if (q.size / dist < theta) {
    const f = (staerke * q.masse) / distSq;
    out.fx += (dx / dist) * f;
    out.fy += (dy / dist) * f;
    return;
  }
  if (q.kinder) for (const k of q.kinder) repulsionOn(k, n, staerke, theta, out);
}

// ---------- Kollision ----------

/**
 * Loest Ueberlappungen auf: zwei Knoten muessen mindestens r_a + r_b + Luft
 * auseinanderliegen.
 *
 * Das ist die Kraft, die vorher gefehlt hat. Abstossung, Federn und Schwerkraft
 * werden mit alpha gedaempft und sind in einem ausgekuehlten Graphen praktisch
 * aus — ein Knoten, den man in ein dichtes Buendel zieht, blieb dort einfach
 * liegen und ueberdeckte die anderen. Beim Heranzoomen sah man einen Haufen
 * ineinandergeschobener Kugeln statt eines Graphen.
 *
 * Die Kollision laeuft deshalb OHNE alpha, in jedem Bild, in voller Staerke:
 * sie verschiebt Positionen direkt, statt Kraefte aufzuaddieren. Damit stossen
 * sich Knoten immer ab — auch nach Stunden ohne Bewegung.
 */
export function resolveCollisions(
  nodes: readonly LayoutNode[],
  padding = COLLIDE_PADDING,
  iterationen = COLLIDE_ITERATIONEN
): number {
  if (nodes.length < 2) return 0;
  const anzahl = nodes.length;
  let maxR = 0;
  for (const n of nodes) if (n.r > maxR) maxR = n.r;
  let zelle = Math.max(1, (maxR + padding) * 2);
  let korrekturen = 0;

  // Zellnummern je Knoten, einmal angelegt und ueber alle Durchgaenge benutzt.
  const cxs = new Int32Array(anzahl);
  const cys = new Int32Array(anzahl);

  /** Ein Paar auseinanderschieben, wenn es sich ueberlappt. */
  const pruefe = (n: LayoutNode, m: LayoutNode): void => {
    const ax = m.x - n.x;
    const ay = m.y - n.y;
    const mindest = n.r + m.r + padding;
    const d2 = ax * ax + ay * ay;
    if (d2 >= mindest * mindest) return;
    // Exakt uebereinander: auseinanderstossen, sonst teilt man durch null.
    let ux: number, uy: number, d: number;
    if (d2 < 1e-6) {
      const w = (n.x + n.y + m.x) * 7.13;
      ux = Math.cos(w); uy = Math.sin(w); d = 0.001;
    } else {
      d = Math.sqrt(d2);
      ux = ax / d; uy = ay / d;
    }
    // Die Ueberlappung wird auf beide verteilt; haelt einer still
    // (weil er gerade gezogen wird), weicht der andere ganz aus.
    const ueberlappung = mindest - d;
    const anteilN = n.pinned ? 0 : m.pinned ? 1 : 0.5;
    const anteilM = m.pinned ? 0 : n.pinned ? 1 : 0.5;
    n.x -= ux * ueberlappung * anteilN;
    n.y -= uy * ueberlappung * anteilN;
    m.x += ux * ueberlappung * anteilM;
    m.y += uy * ueberlappung * anteilM;
    korrekturen++;
  };

  // Nachbarschaft nur nach VORNE. Zusammen mit den Paaren innerhalb der eigenen
  // Zelle (j > i) trifft das jedes ungeordnete Paar genau einmal — vorher lief
  // jeder Knoten alle neun Zellen ab und verwarf die Haelfte hinterher ueber
  // einen Vergleich der Textkennungen. Das war die doppelte Zahl an Besuchen
  // plus ein Zeichenkettenvergleich im innersten Ring.
  const NX = [1, -1, 0, 1];
  const NY = [0, 1, 1, 1];

  for (let durchgang = 0; durchgang < iterationen; durchgang++) {
    // Raster neu aufbauen: die Knoten haben sich im letzten Durchgang bewegt.
    //
    // Der Schluessel ist eine ZAHL, kein `${cx},${cy}`. Bei 25 000 Knoten und
    // drei Durchgaengen waren das sonst 75 000 Zeichenketten fuer den Aufbau
    // und 675 000 fuer das Nachschlagen — pro Bild. Mit Abstand der teuerste
    // Posten der ganzen Simulation.
    let minCx = 0x7fffffff, minCy = 0x7fffffff, maxCx = -0x7fffffff, maxCy = -0x7fffffff;
    for (let i = 0; i < anzahl; i++) {
      const n = nodes[i];
      const cx = Math.floor(n.x / zelle) | 0;
      const cy = Math.floor(n.y / zelle) | 0;
      cxs[i] = cx; cys[i] = cy;
      if (cx < minCx) minCx = cx;
      if (cx > maxCx) maxCx = cx;
      if (cy < minCy) minCy = cy;
      if (cy > maxCy) maxCy = cy;
    }
    const breite = maxCx - minCx + 1;
    const hoehe = maxCy - minCy + 1;
    // Notbremse gegen einen entarteten Ausreisser: waere das Raster absurd
    // gross, werden die Zellen groeber. Das kostet ein paar Vergleiche mehr,
    // bleibt aber richtig — die Entfernung wird ohnehin einzeln geprueft.
    if (breite * hoehe > 4_000_000) {
      zelle *= Math.max(2, Math.sqrt((breite * hoehe) / 4_000_000));
      durchgang--;
      continue;
    }

    const raster = new Map<number, LayoutNode[]>();
    for (let i = 0; i < anzahl; i++) {
      const k = (cys[i] - minCy) * breite + (cxs[i] - minCx);
      const eimer = raster.get(k);
      if (eimer) eimer.push(nodes[i]); else raster.set(k, [nodes[i]]);
    }

    for (const [k, eimer] of raster) {
      // Paare innerhalb der eigenen Zelle
      for (let i = 0; i < eimer.length; i++) {
        for (let j = i + 1; j < eimer.length; j++) pruefe(eimer[i], eimer[j]);
      }
      // Und gegen die vier Zellen "davor"
      const zx = k % breite;
      const zy = (k - zx) / breite;
      for (let t = 0; t < 4; t++) {
        const nx = zx + NX[t];
        const ny = zy + NY[t];
        if (nx < 0 || nx >= breite || ny < 0 || ny >= hoehe) continue;
        const nachbar = raster.get(ny * breite + nx);
        if (!nachbar) continue;
        for (let i = 0; i < eimer.length; i++) {
          for (let j = 0; j < nachbar.length; j++) pruefe(eimer[i], nachbar[j]);
        }
      }
    }
  }
  return korrekturen;
}

// ---------- Simulation ----------

export interface Simulation {
  nodes: LayoutNode[];
  index: Map<string, LayoutNode>;
  edges: LayoutEdge[];
  /** Federstaerke je Kante, vorberechnet aus dem Verbindungsgrad. */
  linkStaerke: number[];
  /**
   * Ruheabstand einer Kante (ohne die Knotenradien).
   *
   * Als Feld statt als Modulkonstante, damit sich der Wert messen und pruefen
   * laesst — genau daran haengt, ob verbundene Notizen ueberhaupt zusammenruecken.
   */
  ruheLaenge: number;
  alpha: number;
  alphaTarget: number;
}

/**
 * Federstaerke nach Verbindungsgrad (wie d3-force).
 *
 * Ohne diese Gewichtung zieht ein Buendel aus 40 gleich getaggten Notizen mit
 * 780 Federn gleichzeitig auf 150 px Ruheabstand — das Buendel faellt in sich
 * zusammen, egal wie stark die Abstossung ist. Geteilt durch den kleineren
 * Grad zieht jede einzelne Feder entsprechend sanfter.
 */
export function linkStaerken(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[]): number[] {
  const grad = new Map<string, number>();
  for (const e of edges) {
    grad.set(e.source, (grad.get(e.source) ?? 0) + 1);
    grad.set(e.target, (grad.get(e.target) ?? 0) + 1);
  }
  void nodes;
  return edges.map((e) => e.strength / Math.max(1, Math.min(grad.get(e.source) ?? 1, grad.get(e.target) ?? 1)));
}

export function createSimulation(
  ids: readonly string[],
  edges: readonly LayoutEdge[],
  radiusOf: (id: string) => number = () => DEFAULT_RADIUS
): Simulation {
  const nodes = initialPositions(ids, SPACING, radiusOf);
  const kanten = edges.filter((e) => e.source !== e.target);
  return {
    nodes,
    index: new Map(nodes.map((n) => [n.id, n])),
    edges: kanten,
    linkStaerke: linkStaerken(nodes, kanten),
    ruheLaenge: IDEAL_LINK,
    alpha: 1,
    alphaTarget: 0,
  };
}

/**
 * Uebernimmt bekannte Positionen aus einem frueheren Lauf; neue Knoten kommen
 * an den Rand der Spirale. Ohne das springt der ganze Graph, sobald eine
 * einzige Notiz dazukommt.
 */
export function reuseSimulation(
  vorher: Simulation | null,
  ids: readonly string[],
  edges: readonly LayoutEdge[],
  radiusOf: (id: string) => number = () => DEFAULT_RADIUS
): Simulation {
  const frisch = createSimulation(ids, edges, radiusOf);
  if (!vorher) return frisch;
  frisch.ruheLaenge = vorher.ruheLaenge;
  let uebernommen = 0;
  for (const n of frisch.nodes) {
    const alt = vorher.index.get(n.id);
    if (!alt) continue;
    n.x = alt.x; n.y = alt.y; n.vx = alt.vx; n.vy = alt.vy; n.pinned = alt.pinned;
    uebernommen++;
  }
  // Nur nachwaermen, wenn sich wirklich etwas geaendert hat.
  frisch.alpha = uebernommen === ids.length && ids.length === vorher.nodes.length ? vorher.alpha : Math.max(vorher.alpha, 0.45);
  return frisch;
}

/** Simulation wieder anheizen — etwa, wenn der Nutzer einen Knoten zieht. */
export function reheat(sim: Simulation, alpha = 0.35): void {
  sim.alpha = Math.max(sim.alpha, alpha);
}

/**
 * Solange gezogen wird, bleibt die Simulation warm.
 *
 * Ein einmaliges Anheizen genuegt nicht: alpha faellt danach sofort wieder, und
 * nach ein paar Sekunden Ziehen reagieren die Nachbarn nicht mehr. Mit einem
 * Ziel > 0 laeuft die Physik, solange der Finger unten ist — genau so fuehlt es
 * sich lebendig an.
 */
export function setDragging(sim: Simulation, zieht: boolean, ziel = 0.3): void {
  sim.alphaTarget = zieht ? ziel : 0;
  if (zieht) sim.alpha = Math.max(sim.alpha, ziel);
}

/** Laeuft die Simulation noch, oder ist sie ausgekuehlt? */
export function isSettled(sim: Simulation): boolean {
  return sim.alpha <= ALPHA_MIN && sim.alphaTarget === 0;
}

/**
 * Ein Zeitschritt. Bewusst OHNE jede Begrenzung auf ein Rechteck: die einzige
 * ruecktreibende Kraft ist eine weiche Feder zum Ursprung, deren Gleichgewicht
 * mit der Knotenzahl waechst.
 */
export function stepSimulation(sim: Simulation): void {
  const { nodes, index, edges } = sim;
  if (nodes.length === 0) return;

  // Alle Kraefte skalieren mit alpha — ohne Untergrenze.
  //
  // Der Weg hierher ging ueber zwei Irrtuemer, und beide sind lehrreich.
  //
  // Zuerst bekam nur die Abstossung eine Untergrenze, damit ein ausgekuehlter
  // Graph seine Knoten noch auseinanderdrueckt. Damit lief die Abstossung mit
  // 0,22, Federn und Schwerkraft aber weiter mit dem rohen alpha (0,006) — dem
  // Siebenunddreissigfachen. Das Gleichgewicht war zerstoert, und jede Geste
  // blies den Graphen weiter auf: gemessen 52 % Zuwachs nach fuenf Gesten.
  //
  // Also bekamen ALLE Kraefte die Untergrenze. Das behob die Aufblaehung und
  // schuf einen schlimmeren Fehler: ein System KONSTANTER ENERGIE. Die
  // Daempfung nimmt Energie heraus, die Kraefte bei 0,22 pumpen ebenso viel
  // wieder hinein — die Bewegung klingt nie ab. Gemessen an 320 Notizen in
  // Themengruppen: nach dem Loslassen pendelte die Bewegungsenergie sich bei
  // rund 28 000 ein und blieb dort ueber vierhundert Bilder unveraendert.
  // Sichtbar wurde das erst beim Ziehen ("alle bunten Knoten in der Mitte haben
  // angefangen rumzutanzen"), weil die Bildschleife im Ruhezustand gar nicht
  // erst rechnet — das Zittern war die ganze Zeit da, nur eingefroren.
  //
  // Richtig ist der Weg von d3-force: alpha daempft alles gemeinsam gegen null,
  // und der Graph kommt wirklich zur Ruhe. Was die Untergrenze schuetzen
  // sollte — dass ein ausgekuehltes Layout aufeinandergeschobene Knoten noch
  // trennt — leistet die Kollision, und die laeuft ohnehin in jedem Bild in
  // voller Staerke und ohne alpha.
  const alpha = sim.alpha;
  const baum = buildQuadtree(nodes);
  const kraft = { fx: 0, fy: 0 };

  for (const n of nodes) {
    if (n.pinned) { n.vx = 0; n.vy = 0; continue; }
    kraft.fx = 0;
    kraft.fy = 0;
    repulsionOn(baum, n, REPULSION, THETA, kraft);
    n.vx += kraft.fx * DT * alpha;
    n.vy += kraft.fy * DT * alpha;
  }

  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    const a = index.get(e.source);
    const b = index.get(e.target);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    // Ruheabstand beruecksichtigt die Knotengroesse: dicke Knoten sollen nicht
    // ineinandergezogen werden, nur weil die Feder 150 sagt.
    const ruhe = sim.ruheLaenge + a.r + b.r;
    const f = LINK_STAERKE * (sim.linkStaerke[i] ?? e.strength) * (dist - ruhe) * alpha;
    const fx = (dx / dist) * f;
    const fy = (dy / dist) * f;
    if (!a.pinned) { a.vx += fx; a.vy += fy; }
    if (!b.pinned) { b.vx -= fx; b.vy -= fy; }
  }

  const g = gravityFor(nodes.length);
  for (const n of nodes) {
    if (n.pinned) { n.vx = 0; n.vy = 0; continue; }
    n.vx -= n.x * g * alpha;
    n.vy -= n.y * g * alpha;
    n.vx *= DAMPING;
    n.vy *= DAMPING;
    // Die Schallmauer. Explizites Euler ist für ein Federnetz nur bis zu einer
    // endlichen Steifheit stabil: zwanzig Federn an einem Begriff, jeder Knoten
    // mehrere hundert Einheiten vom Nachbarn, und das System wächst pro Bild um
    // den Faktor zwei statt zur Ruhe zu laufen. Gemessen bei 400 Notizen — die
    // Welt endete bei 4,5e13 Einheiten, die Fläche öffnete bei 2 % und war leer.
    // Ein Bild darf höchstens drei Ruhelängen weit werfen; alles darüber ist
    // keine Anordnung, sondern ein Absturz, und wird hier abgefangen.
    const betrag = Math.hypot(n.vx, n.vy);
    if (betrag > MAX_VERZUG) {
      const drossel = MAX_VERZUG / betrag;
      n.vx *= drossel;
      n.vy *= drossel;
    }
    n.x += n.vx;
    n.y += n.vy;
  }

  // Harte Randbedingung zum Schluss, ohne alpha: Knoten ueberlappen nie.
  resolveCollisions(nodes);

  sim.alpha += (sim.alphaTarget - sim.alpha) * ALPHA_DECAY;
  if (sim.alphaTarget === 0 && sim.alpha < ALPHA_MIN) sim.alpha = ALPHA_MIN;
}

// ---------- Ausschnitt ----------

/** Umschliessendes Rechteck aller Knoten — die tatsaechliche Ausdehnung der Welt. */
export function layoutBounds(nodes: readonly LayoutNode[], padding = 0): Bounds {
  if (nodes.length === 0) return { minX: -100, minY: -100, maxX: 100, maxY: 100 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }
  return { minX: minX - padding, minY: minY - padding, maxX: maxX + padding, maxY: maxY + padding };
}

/**
 * Der Rand, den "Ansicht anpassen" um die Knotenmittelpunkte legen muss.
 *
 * layoutBounds kennt nur Mittelpunkte. Frueher stand hier die feste Zahl 70 —
 * und die ist in WELTeinheiten gemessen, waehrend der Rand auf dem SCHIRM
 * erscheint. Bei einer kleinen Wissensbasis wird stark hineingezoomt, aus 70
 * Einheiten werden ueber 100 Pixel pro Seite, und zwoelf Notizen sassen als
 * Briefmarke in der Mitte. Der Radius des groessten Knotens ist das richtige
 * Mass: er ist genau das, was ueber den Mittelpunkt hinausragt. Der Luft fuer
 * die Beschriftung darunter kuemmert sich fitTransform in Bildschirmpixeln.
 */
export function randFuerAnsicht(nodes: readonly LayoutNode[]): number {
  let max = 0;
  for (const n of nodes) if (n.r > max) max = n.r;
  return max;
}

/**
 * Der Ausschnitt, der ALLES zeigt. Das ist die eigentliche Antwort auf die
 * Wand: statt die Welt in das Fenster zu pressen, wird das Fenster so gesetzt,
 * dass die Welt hineinpasst — egal wie gross sie ist.
 *
 * `padding` ist Luft in Bildschirmpixeln — sie bleibt gleich gross, egal wie
 * weit hinein- oder herausgezoomt wird, und traegt die Beschriftung unter dem
 * untersten Knoten.
 */
export function fitTransform(
  bounds: Bounds,
  viewport: { w: number; h: number },
  padding = 64,
  // Der Deckel ist nur ein Notnagel gegen den Grenzfall "zwei Notizen", nicht
  // die eigentliche Grenze. Bei 2,5 band er zu frueh: eine kleine Wissensbasis
  // brauchte rund 3,0, um den Rahmen auszufuellen, und sass deshalb als
  // Briefmarke in der Mitte, obwohl ringsum Platz war. Das Mausrad darf ohnehin
  // bis 6 — "alles zeigen" muss nicht strenger sein als das Rad.
  limits: { min: number; max: number } = { min: 0.02, max: 4 }
): Transform {
  const bw = Math.max(1, bounds.maxX - bounds.minX);
  const bh = Math.max(1, bounds.maxY - bounds.minY);
  const vw = Math.max(1, viewport.w - padding * 2);
  const vh = Math.max(1, viewport.h - padding * 2);
  const k = Math.max(limits.min, Math.min(limits.max, Math.min(vw / bw, vh / bh)));
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return { x: viewport.w / 2 - cx * k, y: viewport.h / 2 - cy * k, k };
}

/** Bildschirmpunkt in Weltkoordinaten. */
export function toWorld(t: Transform, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - t.x) / t.k, y: (sy - t.y) / t.k };
}

/** Weltpunkt in Bildschirmkoordinaten. */
export function toScreen(t: Transform, wx: number, wy: number): { x: number; y: number } {
  return { x: wx * t.k + t.x, y: wy * t.k + t.y };
}

/** Zoomen um einen festen Bildschirmpunkt — der Punkt bleibt unter dem Zeiger. */
export function zoomAt(t: Transform, faktor: number, sx: number, sy: number, limits = { min: 0.02, max: 6 }): Transform {
  const k = Math.max(limits.min, Math.min(limits.max, t.k * faktor));
  const skala = k / t.k;
  return { x: sx - (sx - t.x) * skala, y: sy - (sy - t.y) * skala, k };
}

/**
 * Ab wann lohnt es nicht mehr, Aehnlichkeitskanten zu malen?
 *
 * Weit herausgezoomt wird aus zehntausend feinen Linien ein grauer Schleier, der
 * nichts zeigt und Rechenzeit kostet. Dann bleiben nur die echten Relationen —
 * die tragen Bedeutung. Als eigene Regel, damit sie pruefbar ist statt in der
 * Zeichenschleife zu verschwinden.
 */
export const EDGE_LOD_THRESHOLD = 2500;
export const EDGE_LOD_ZOOM = 0.55;

export function nurEchteKanten(kantenzahl: number, zoom: number): boolean {
  return kantenzahl > EDGE_LOD_THRESHOLD && zoom < EDGE_LOD_ZOOM;
}

/** Naechster Knoten zu einem Weltpunkt innerhalb der Trefferweite, sonst null. */
export function nodeAt(
  nodes: readonly LayoutNode[],
  radiusOf: (n: LayoutNode) => number,
  wx: number,
  wy: number,
  toleranz = 4
): LayoutNode | null {
  let treffer: LayoutNode | null = null;
  let beste = Infinity;
  for (const n of nodes) {
    const dx = n.x - wx;
    const dy = n.y - wy;
    const d2 = dx * dx + dy * dy;
    const r = radiusOf(n) + toleranz;
    if (d2 <= r * r && d2 < beste) { beste = d2; treffer = n; }
  }
  return treffer;
}

/**
 * Zaehlt die Kanten nach Art — fuer einen Kopf, der nur zahlt, was im Bild
 * steht. Ein Kopf, der 891 Kanten behauptet, waehrend 884 davon Aehnlichkeit
 * sind, verkauft die Flaeche schlechter, als sie ist.
 */
export function kantZaehlung(edges: readonly LayoutEdge[]): { echt: number; aehnlichkeit: number; gesamt: number } {
  let echt = 0;
  for (const e of edges) if (e.real) echt++;
  return { echt, aehnlichkeit: edges.length - echt, gesamt: edges.length };
}

export interface BandForm {
  /** Radien der beiden Scheiben: der Keil startet bzw. endet an ihrer Kante. */
  rQuelle: number;
  rZiel: number;
  /** Breite am Ausgang und am Ziel, in Welteinheiten. */
  breit: number;
  duenn: number;
  /** Ausbuchtung — derselbe Wert, mit dem die Linie gezeichnet wird. */
  beule: number;
  /** Querschnitte entlang des Bogens. */
  schritte?: number;
}

/**
 * Der Keil, mit dem eine Behauptung ihre Richtung sagt: breit am Ausgang,
 * schmal am Ziel.
 *
 * Die Richtung ist eine Aussage — „Elena — betreut — Nordwind" ist etwas
 * anderes als die Umkehrung. Eine Pfeilspitze wäre die naheliegende Antwort,
 * aber sie sitzt hinter der Scheibe, die sie erreichen will, und ertrinkt in
 * der Dämpfung der Nachbarschaft; ein Keil trägt die Richtung durch die ganze
 * Linie und bleibt bei jedem Zoom lesbar.
 *
 * Er folgt demselben Bogen wie die Linie (Kontrollpunkt senkrecht zur Sehne,
 * gleiches Vorzeichen) und kappt an beiden Enden um den Knotenradius — gemessen
 * entlang des Bogens, nicht der Sehne, sonst beginnt er bei starker Beule zu
 * früh und liegt halb unter der Scheibe.
 *
 * Der Ring läuft: erst die linke Seite vom Ausgang zum Ziel, dann die rechte
 * zurück. Punkt i und Punkt 2n-1-i sind deshalb Querschnittspartner.
 */
export function richtungsBand(
  quelle: { x: number; y: number },
  ziel: { x: number; y: number },
  form: BandForm
): { x: number; y: number }[] {
  const dx = ziel.x - quelle.x;
  const dy = ziel.y - quelle.y;
  const sehne = Math.hypot(dx, dy);
  if (sehne === 0) return [];
  const beulenX = -dy / sehne;
  const beulenY = dx / sehne;
  const schx = (quelle.x + ziel.x) / 2 + beulenX * form.beule;
  const schy = (quelle.y + ziel.y) / 2 + beulenY * form.beule;
  const punkt = (t: number) => {
    const u = 1 - t;
    return {
      x: u * u * quelle.x + 2 * u * t * schx + t * t * ziel.x,
      y: u * u * quelle.y + 2 * u * t * schy + t * t * ziel.y,
    };
  };

  const stuetz = 48;
  const bogen: number[] = [0];
  let letzter = punkt(0);
  for (let i = 1; i <= stuetz; i++) {
    const p = punkt(i / stuetz);
    bogen.push(bogen[i - 1] + Math.hypot(p.x - letzter.x, p.y - letzter.y));
    letzter = p;
  }
  const anfang = form.rQuelle;
  const ende = bogen[stuetz] - form.rZiel;
  if (!(ende > anfang)) return [];

  const n = (form.schritte ?? 12) + 1;
  const links: { x: number; y: number }[] = [];
  const rechts: { x: number; y: number }[] = [];
  // Die Bogenlänge wächst mit i, also wandert der Stützstellenzeiger mit —
  // ein Keil kostet damit seine Stützstellen und nicht n·48 Suchschritte.
  let k = 1;
  for (let i = 0; i < n; i++) {
    const s = anfang + ((ende - anfang) * i) / (n - 1);
    while (k < stuetz && bogen[k] < s) k++;
    const span = bogen[k] - bogen[k - 1] || 1;
    const t = (k - 1 + (s - bogen[k - 1]) / span) / stuetz;
    const p = punkt(t);
    const q = punkt(Math.min(1, t + 1e-4));
    const tl = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const normX = -(q.y - p.y) / tl;
    const normY = (q.x - p.x) / tl;
    const halbe = (form.breit + (form.duenn - form.breit) * (i / (n - 1))) / 2;
    links.push({ x: p.x + normX * halbe, y: p.y + normY * halbe });
    rechts.push({ x: p.x - normX * halbe, y: p.y - normY * halbe });
  }
  return [...links, ...rechts.reverse()];
}

// ---------- Etikett, Dicke und Griff einer Kante ----------

/**
 * Wie viele Dickenstufen die Flaeche malt. Mehr als drei sind auf dem Schirm
 * nicht zu unterscheiden, und jede Stufe ist ein eigener gebuendelter Pfad.
 */
export const DICKE_BAENDER = 3;

/**
 * In welches Dickenband eine Kante gehoert.
 *
 * Bei einer Behauptung ist das die Evidenz: drei Aussagen ueber demselben Paar
 * sind ein dickerer Strich als eine. Bei einer Aehnlichkeit ist die Masse selbst
 * das Gewicht — 0,9 Uebereinstimmung ist etwas anderes als 0,3, und das Bild
 * sollte es zeigen. Erfindet wird hier nichts: ohne Belegzaehler bleibt die
 * Kante in der duennsten Stufe.
 */
export function dickeBand(e: LayoutEdge): number {
  if (e.real) return Math.min(DICKE_BAENDER - 1, Math.max(0, (e.belege ?? 1) - 1));
  if (e.strength >= 0.7) return DICKE_BAENDER - 1;
  if (e.strength >= 0.5) return 1;
  return 0;
}

/** Laengstes Kanten-Etikett in Zeichen — laenger passt nicht zwischen zwei Knoten. */
export const ETIKETT_MAX_ZEICHEN = 18;

/**
 * Was an der Linie steht: der Typ der Aussage, mit den uebrigen Typen als Zahl
 * dahinter. Kein Typ, kein Text — eine Erwaehnung oder ein Reim behauptet
 * nichts, und das Etikett einer erdachten Beziehung waere eine Luege im Bild.
 */
export function kantenEtikett(e: LayoutEdge, maxZeichen = ETIKETT_MAX_ZEICHEN): string | null {
  const name = typeof e.relation === "string" ? e.relation.trim() : "";
  if (!name || systemWort(name)) return null;
  const mehr = (e.typen ?? 1) - 1;
  const anhang = mehr > 0 ? ` +${mehr}` : "";
  const raum = Math.max(1, maxZeichen - anhang.length);
  const kern = name.length > raum ? `${name.slice(0, raum - 1)}…` : name;
  return `${kern}${anhang}`;
}

/** Staerkste Ausbuchtung einer Kante — dieselbe Zahl, die gemalt und gegriffen wird. */
export const BEULE_MAX = 16;

/** Wie weit eine Kante der Senkrechten ausweicht: ein Viertel ihrer Laenge, gedeckelt. */
export function beulenLenke(laenge: number, max = BEULE_MAX): number {
  return Math.min(max, laenge * 0.12);
}

/** Der Kontrollpunkt, den die Flaeche fuer eine Kante nutzt. */
function bogenschalt(a: { x: number; y: number }, b: { x: number; y: number }, beule: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const sehne = Math.hypot(dx, dy) || 1;
  return {
    x: (a.x + b.x) / 2 - (dy / sehne) * beule,
    y: (a.y + b.y) / 2 + (dx / sehne) * beule,
  };
}

/**
 * Der Punkt einer Kante, an dem ihr Etikett steht: die Mitte des Bogens, nicht
 * der Sehne. Etikett und Griff muessen DEMSELBEN Zug folgen, den die Flaeche
 * malt — sonst zeigt jemand auf eine Linie und faellt ins Leere.
 */
export function kantenMitte(
  a: { x: number; y: number },
  b: { x: number; y: number },
  beule: number
): { x: number; y: number } {
  const s = bogenschalt(a, b, beule);
  return {
    x: 0.25 * a.x + 0.5 * s.x + 0.25 * b.x,
    y: 0.25 * a.y + 0.5 * s.y + 0.25 * b.y,
  };
}

/** Wie nah ein Zeiger an einer Kante sein muss, damit sie gegriffen gilt (Bildpunkte). */
export const KANTEN_GREIF_PX = 6;

const STUTZEN_BEI_GREIF = 14;

/**
 * Wo die Schleife einer Selbstbehauptung sitzt: ein Ring oben rechts am
 * Knoten, der seine Scheibe berührt. Dieselbe Rechnung einmal für den
 * Zeichenstrich und einmal für die Greifweite — sonst trifft der Zeiger eine
 * Schlinge, die das Bild nicht malt.
 */
export function selbstSchleife(x: number, y: number, radius: number): { cx: number; cy: number; rad: number } {
  const rad = Math.max(2, radius * 0.62);
  const abstand = radius + rad * 0.72;
  return { cx: x + abstand * 0.7071, cy: y - abstand * 0.7071, rad };
}

/**
 * Naechste Kante zu einem Weltpunkt, innerhalb der Trefferweite — sonst null.
 *
 * Drei Dinge machen das mehr als eine Sehnenlaenge:
 *  1. Die gemalte Kante ist ein Bogen. Der Abstand wird entlang des Bogens
 *     gemessen, mit demselben Kontrollpunkt, mit dem auch gezeichnet wird.
 *  2. Die Kante hoert an den Knotenscheiben auf. Wer in einer Scheibe zeigt,
 *     will den Knoten, nicht die Kante dahinter.
 *  3. `malweise` ist dieselbe Antwort, die der Zeichencode gibt: „gerade" oder
 *     „bogen" — oder null, wenn die Kante gar nicht im Bild steht. Eine Kante,
 *     die man nicht sieht, darf keinen Tooltip gewinnen.
 *
 * Vor der Rechnung liegt ein Rechtecktest: ein Zeigerstrich ueber einem vollen
 * Feld trifft nur Kanten in seiner Nachbarschaft, und die anderen werden mit
 * vier Vergleichen abgewiesen.
 */
export function kanteBei(
  index: Map<string, LayoutNode>,
  edges: readonly LayoutEdge[],
  wx: number,
  wy: number,
  toleranz = KANTEN_GREIF_PX,
  malweise: (e: LayoutEdge) => "gerade" | "bogen" | null = () => "bogen"
): LayoutEdge | null {
  let treffer: LayoutEdge | null = null;
  let beste = Infinity;
  for (const e of edges) {
    const wie = malweise(e);
    if (wie === null) continue;
    const a = index.get(e.source);
    const b = index.get(e.target);
    if (!a || !b) continue;
    if (a === b) {
      // Kein Rand, sondern ein Ring: getroffen ist, wer auf dem Ring liegt.
      // Die Knotenmitte bleibt der Knoten — wer in einer Scheibe zeigt, will
      // nie die Kante dahinter.
      const s = selbstSchleife(a.x, a.y, a.r);
      const ring = Math.abs(Math.hypot(wx - s.cx, wy - s.cy) - s.rad);
      if (ring <= toleranz + 1 && ring < beste) {
        beste = ring;
        treffer = e;
      }
      continue;
    }
    const minX = Math.min(a.x, b.x) - toleranz - BEULE_MAX;
    const maxX = Math.max(a.x, b.x) + toleranz + BEULE_MAX;
    if (wx < minX || wx > maxX) continue;
    const minY = Math.min(a.y, b.y) - toleranz - BEULE_MAX;
    const maxY = Math.max(a.y, b.y) + toleranz + BEULE_MAX;
    if (wy < minY || wy > maxY) continue;

    const beule = wie === "gerade" ? 0 : beulenLenke(Math.hypot(b.x - a.x, b.y - a.y));
    const s = bogenschalt(a, b, beule);
    const punkt = (t: number) => {
      const u = 1 - t;
      return {
        x: u * u * a.x + 2 * u * t * s.x + t * t * b.x,
        y: u * u * a.y + 2 * u * t * s.y + t * t * b.y,
      };
    };

    // Bogenlaengen entlang der Stuetzstellen, damit das Ende an der SCHEIBE
    // abgeschnitten wird und nicht an der Sehne.
    const stuetzen = STUTZEN_BEI_GREIF + 1;
    const bogen: number[] = [0];
    let letzter = punkt(0);
    let laenge = 0;
    for (let i = 1; i < stuetzen; i++) {
      const p = punkt(i / (stuetzen - 1));
      laenge += Math.hypot(p.x - letzter.x, p.y - letzter.y);
      bogen.push(laenge);
      letzter = p;
    }
    const anfang = a.r;
    const ende = laenge - b.r;
    if (!(ende > anfang)) continue;

    for (let i = 0; i + 1 < stuetzen; i++) {
      if (bogen[i + 1] < anfang || bogen[i] > ende) continue;
      const span = bogen[i + 1] - bogen[i] || 1;
      const von = i + Math.max(0, (anfang - bogen[i]) / span);
      const bis = i + Math.min(1, (ende - bogen[i]) / span);
      const q0 = punkt(von / (stuetzen - 1));
      const q1 = punkt(bis / (stuetzen - 1));
      const d = distanzPunktStrecke(q0, q1, wx, wy);
      if (d < beste) { beste = d; treffer = e; }
    }
  }
  return beste <= toleranz ? treffer : null;
}

function distanzPunktStrecke(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  wx: number,
  wy: number
): number {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(wx - p0.x, wy - p0.y);
  const t = Math.max(0, Math.min(1, ((wx - p0.x) * dx + (wy - p0.y) * dy) / l2));
  return Math.hypot(wx - (p0.x + t * dx), wy - (p0.y + t * dy));
}

/**
 * Was unter einem Knoten steht. Die Kette hat drei Stufen, und die letzte gibt
 * sich zu erkennen: eine Notiz ohne Titel und ohne Zeilen darf nicht wie eine
 * mit beidem aussehen.
 */
export interface NotizEtikett { text: string; platzhalter: boolean }

/** Auf `maxZeichen` kuerzen; die Auslassung kommt zusätzlich dahinter. */
function kuerze(text: string, maxZeichen: number): string {
  if (!(maxZeichen > 0) || text.length <= maxZeichen) return text;
  return `${text.slice(0, maxZeichen)}…`;
}

/**
 * Das Wort, das die Speberschicht selbst einsetzt, wenn eine Notiz ohne Titel
 * gespeichert wird (in `src/core/store.ts` und `src/lib/store.ts`, je beim
 * Anlegen und beim Bearbeiten). Es trägt keine Information — zwei Knoten, die
 * beide „Untitled" heißen, sind zwei Knoten ohne Namen. Der erste Satz sagt
 * mehr, und wo der fehlt, sagt der Platzhalter sich selbst.
 */
const TITEL_WORT_DES_SYSTEMS = "untitled";

export function notizEtikett(m: Memory, maxZeichen = 26): NotizEtikett {
  const titel = (m.title ?? "").trim();
  if (titel && titel.toLowerCase() !== TITEL_WORT_DES_SYSTEMS) {
    return { text: kuerze(titel, maxZeichen), platzhalter: false };
  }
  const zeilen = (m.content ?? "").split(/\r?\n/).map((z) => z.trim()).filter((z) => z.length > 0);
  if (zeilen.length > 0) return { text: kuerze(zeilen.join(" "), maxZeichen), platzhalter: true };
  return { text: "Untitled note", platzhalter: true };
}

// ---------- Eine Ontologie für beide Ansichten ----------
//
// Das Kraftfeld zeichnete bis hierhin Notizen und ließ zwei davon verbunden
// sein, wenn JEDE eine Entität erwähnte, die durch eine Behauptung verbunden
// sind. Das ist ein Kreuzprodukt: quadratisch im Preis, und ab der 25. Paarung
// kappt der Code still — Belege fallen weg, ohne dass das Bild es sagt. Zwei
// Notizen, die beide „Elena" erwähnen, standen darin gar nicht verbunden, obwohl
// sie genau dasselbe teilen.
//
// Dieses Netz dreht die Blickrichtung um, und zwar für Baum UND Kraftfeld:
//   Notiz → Konzept  („erwähnt")      — linear, dünn
//   Konzept ↔ Konzept („behauptet")   — die Aussage selbst, mit Typ und Ursprung
// Ein Konzept mit genau einer Notiz und ohne Aussage erscheint nicht: es füllt
// das Bild, ohne etwas zu verbinden.

export const ENTITAETS_PRAEFIX = "__ent:";

export interface EntitaetsKnoten {
  /** Derselbe Schlüssel, den der Baum für denselben Knoten nutzt. */
  id: string;
  label: string;
  /** Die sichtbaren Notizen, die dieses Konzept erwähnen. */
  notizen: string[];
}

export interface Behauptung {
  source: string;
  target: string;
  relation: string | null;
  /** Die beurkundende Notiz — ohne sie hängt die Kante ins Leere. */
  memoryId: string | null;
  /**
   * Wie lange die Aussage gilt. Der Kern speichert das an der Relation, nicht
   * an der Notiz: „Elena war bei Nordwind" kann 2023 geplatzt sein, während
   * die Notiz, die sie erzählt, von 2026 ist. Ohne diese zwei Felder zeigte
   * der Regler 2024 eine Behauptung, die zwei Jahre zuvor geendet hatte.
   */
  validFrom: number | null;
  validTo: number | null;
}

export interface EntitaetsNetz {
  knoten: EntitaetsKnoten[];
  /** [notizId, knotenId] */
  erwahnungen: [string, string][];
  behauptungen: Behauptung[];
}

export interface RoheRelation {
  source: string;
  target: string;
  relation?: string | null;
  memoryId?: string | null;
  validFrom?: number | null;
  validTo?: number | null;
}

/**
 * Welche Notizen eine Faltung im Kraftfeld verbergen darf: nur die, die
 * ausschließlich an einem der gefalteten Begriffe hängen. Eine Notiz, die zwei
 * Begriffe belegt, würde beim Zufalten des einen ihre Spur im anderen
 * verlieren — das wäre ein Belegdiebstahl, keine Übersicht.
 *
 * `gefalteteKonzepte` trägt die Knoten-IDs („__ent:<name>"), weil die Fläche
 * genau damit arbeitet.
 */
export function verborgeneNotizen(
  memoriesByEntity: Readonly<Record<string, readonly string[]>> | undefined,
  gefalteteKonzepte: ReadonlySet<string>
): Set<string> {
  const out = new Set<string>();
  if (!memoriesByEntity || gefalteteKonzepte.size === 0) return out;
  const traeger = new Map<string, Set<string>>();
  for (const [name, ids] of Object.entries(memoriesByEntity)) {
    // Dieselbe Notiz zweimal in derselben Liste macht keinen zweiten Träger.
    for (const id of new Set(ids)) {
      let menge = traeger.get(id);
      if (!menge) { menge = new Set(); traeger.set(id, menge); }
      menge.add(name);
    }
  }
  for (const [id, mengen] of traeger) {
    if (mengen.size !== 1) continue;
    const [name] = [...mengen];
    if (gefalteteKonzepte.has(`${ENTITAETS_PRAEFIX}${name}`)) out.add(id);
  }
  return out;
}

/**
 * `sichtbar` ist die Menge der Notizen, die gerade im Bild stehen — nach
 * Filter, Suche und Zeitregler. Alles andere an einer Kante darf auch nicht
 * gezeichnet werden: der Regler auf „Februar 2023" hat sonst ein Netz aus
 * Behauptungen stehen lassen, die es damals noch nicht gab.
 */
export function entitaetsNetz(
  memoriesByEntity: Readonly<Record<string, readonly string[]>> | undefined,
  relationen: readonly RoheRelation[] | undefined,
  sichtbar: ReadonlySet<string>,
  mindesten = 2,
  /**
   * Der Titel einer Notiz, wenn ihn der Aufrufer kennt. Mit ihm ist das Echo zu
   * fassen, das der Schreibweg hinterlässt: von jeder Notiz wird auch ihr Titel
   * als Begriff angelegt und die Behauptung daran gehängt. Ein Begriff, den nur
   * eine Notiz trägt und der genau deren Titel ist, sagt darum nichts über die
   * Wissensbasis aus — er sagt, wie eine Überschrift lautet.
   */
  titelVon?: (id: string) => string | undefined
): EntitaetsNetz {
  const notizenVon = new Map<string, string[]>();
  for (const [name, ids] of Object.entries(memoriesByEntity ?? {})) {
    const sichtbare = [...new Set(ids)].filter((id) => sichtbar.has(id)).sort((a, b) => a.localeCompare(b));
    if (sichtbare.length > 0) notizenVon.set(name, sichtbare);
  }

  const echo = (name: string): boolean => {
    if (!titelVon) return false;
    const ids = notizenVon.get(name);
    if (!ids || ids.length !== 1) return false;
    const titel = (titelVon(ids[0]!) ?? "").trim().toLowerCase();
    return titel !== "" && titel === name.trim().toLowerCase();
  };

  const aufgenommene = new Set<string>();
  const netze = new Map<string, EntitaetsKnoten>();
  const nimm = (name: string): void => {
    if (aufgenommene.has(name)) return;
    const id = `${ENTITAETS_PRAEFIX}${name}`;
    // Ein Index darf nicht zwei Dinge unter einem Schlüssel kennen. Trägt eine
    // Notiz zufällig denselben Text, bleibt das Konzept weg — ein fehlender
    // Nabel ist besser als ein mehrdeutiger.
    if (sichtbar.has(id)) return;
    aufgenommene.add(name);
    netze.set(id, { id, label: name, notizen: notizenVon.get(name) ?? [] });
  };

  for (const [name, notizen] of notizenVon) if (notizen.length >= mindesten && !echo(name)) nimm(name);

  const behauptungen: Behauptung[] = [];
  for (const r of relationen ?? []) {
    // Eine Aussage, die an einem Titel-Echo hängt, ist keine Aussage: Der
    // Schreibweg hat sie erzeugt, nicht ein Mensch.
    if (echo(r.source) || echo(r.target)) continue;
    const traeger = r.memoryId ?? null;
    const sichtbarFuerBehauptung = traeger !== null ? sichtbar.has(traeger) : (() => {
      // Ohne beurkundende Notiz kann kein Filter und kein Zeitregler die Kante
      // wieder wegnehmen. Sie darf deshalb nur zeichnen, was im Bild steht:
      // beide Enden müssen von mindestens einer sichtbaren Notiz getragen
      // werden — sonst hinge ein Konzept mit einer Kante im Leeren, genau das
      // graue Gitter ohne Knoten, das der Regler schon einmal hinterlassen hat.
      const a = notizenVon.get(r.source)?.length ?? 0;
      const b = notizenVon.get(r.target)?.length ?? 0;
      return a >= 1 && b >= 1;
    })();
    if (!sichtbarFuerBehauptung) continue;
    nimm(r.source);
    nimm(r.target);
    behauptungen.push({
      source: `${ENTITAETS_PRAEFIX}${r.source}`,
      target: `${ENTITAETS_PRAEFIX}${r.target}`,
      relation: r.relation ?? null,
      memoryId: traeger,
      validFrom: r.validFrom ?? null,
      validTo: r.validTo ?? null,
    });
  }

  const knoten = [...netze.values()].sort((a, b) => a.label.localeCompare(b.label));
  const erwahnungen: [string, string][] = [];
  for (const k of knoten) for (const notizId of k.notizen) erwahnungen.push([notizId, k.id]);
  return { knoten, erwahnungen, behauptungen };
}
