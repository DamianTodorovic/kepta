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
import { systemWort } from "../core/wortschatz";

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
  /**
   * Die Stelle, an der dieser Knoten beim ERSTEN Griff lag. `loeseKnoten` stellt
   * sie wieder her — ohne sie ist „Release pinned" nur ein „wieder der Physik
   * übergeben", und genau das war die Klage vom 13.10.: „passiert garnichts und
   * der knoten geht nicht an seinen ursprünglichen Punkt zurück".
   */
  ursprung?: { x: number; y: number };
  /**
   * Auf dieser Seite des Gangs nicht zu sehen. Versteckt heisst **nicht
   * vergessen**: der Knoten zaehlt weiter in `sim.allein`, und die Flaeche nennt
   * ihn in ihrer Zeile. Gemaelt, eingepasst und zusammengetrieben wird er nicht —
   * 18.500 verborgene Punkte im Einpasskasten waeren ein Bild, das auf Punkte
   * zoomt, die niemand sieht.
   */
  versteckt?: boolean;
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
/**
 * Stärke der Abstossung pro Knoten — im selben Impulsmaß wie die Federn.
 *
 * Vorher stand hier 3400, und nur diese Kraft wurde zusätzlich mit DT (0,016)
 * multipliziert: geliefert hat sie 54. Eine Feder, die zwanzig Einheiten über
 * ihrer Ruhelänge hängt, zieht in demselben Bild mit 11; ein Nachbar stößt im
 * selben Moment mit 0,02 ab. Das Bild war eine Spirale mit Federn, kein
 * Kraftfeld: gemessen am 400-Notizen-Bestand standen die zwanzig Themen als
 * Blumen mit aneinanderliegenden Blütenblättern, und wer die Abstoßung
 * vervierfachte, sah dasselbe Bild (Zoom 67 → 68 %, Tinte 8,77 → 8,79 %).
 * Ein Regler, der nichts bewegt, ist kein Regler.
 *
 * 450 ist das Achtfache des alten Lieferwerts und der Punkt, an dem dieselbe
 * Fläche weißen Raum zwischen den Themen zeigt — Inseln wie Buchhaltung/Elena
 * Weiss, Apotheke/Fahrrad, Nordwind/Drucker stehen auseinander, ohne dass die
 * Knoten unter die Lesbarkeit schrumpfen (Zoom 59 %, Tinte 7,5 %).
 */
export const REPULSION = 450;
/**
 * Weiche Feder zum Ursprung — verhindert Abdriften, ohne zu stauchen.
 *
 * Der Wert wird durch sqrt(n) geteilt (siehe gravityFor). Mit KONSTANTER
 * Schwerkraft stellt sich der Gleichgewichtsradius auf R ~ N^(1/3) ein, gleiche
 * Dichte braucht aber R ~ N^(1/2): der Graph waere mit wachsendem Wissen immer
 * dichter geworden — dieselbe Beschwerde wie bei der Wand, nur ohne Wand.
 *
 * Zieht mit der Abstossung im Gleichschritt hoch: die Weltgröße ist ihr
 * Verhältnis. Nur die Abstossung zu verstärken bläst das Feld auf — gemessen an
 * derselben Sonde (8 Begriffe à 50 Notizen): Welt 1 376 × 1 473 statt
 * 952 × 1 026, Zoom 40 % statt 57 %.
 */
export const GRAVITY = 0.0045;
export const DAMPING = 0.82;
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
 *
 * Acht, gemessen am 11.10. an einem Feld wie dem veraeusserten: 3 000 Notizen an
 * 27 Begriffen (≈ 111 Notizen je Hub) liessen mit vier Durchgaengen 9 Paare von
 * 3 027 Scheiben uebereinander stehen und 390 im Moment des Oeffnens — die
 * README-Zusage „never overlap" galt also weder in der Ruhe noch beim ersten
 * Anblick. Die Scheidung der Kandidaten: ein einziger weiterer Nachlauf macht
 * 7 942 Korrekturen, das Raster sieht die Paare, es fehlen nur die Durchgaenge.
 * Mit acht: 0 Paare in der Ruhe, 15 beim Oeffnen, +2,1 ms pro Bild in der Physik
 * (9,7 → 11,8 ms/Schritt bei 3 000 Knoten, Node ohne Rasterung). Bei 400 Notizen
 * sind die 4,5 ms Basis die Grundlage, dort faellt der Zuwachs nicht ins
 * Gewicht; bei 3 000 liegt er auf einem Wert, der das Bildbudget ohnehin
 * verfehlt. Entscheidung der Leitung, Zahlen im Bericht (`docs/graph-kosten.md`).
 */
export const COLLIDE_ITERATIONEN = 8;
/** Standardradius, wenn der Aufrufer keinen angibt. */
export const DEFAULT_RADIUS = 10;
const MAX_DEPTH = 26;

/**
 * Das Größengesetz: wie gross ein Knoten wird, wenn er n Verbindungen haelt.
 *
 * Die alte Formel (18 als Kappe, 4 + log2(1+grad) · 2,2) war bei einem
 * Dutzend Verbindungen am Anschlag: ein Hub mit 92 und einer mit 163 standen
 * beide bei 18 — dasselbe Bild, keine Rangfolge, und die Spanne der Groesse
 * war nur dem Namen nach vorhanden.
 *
 * Die Wurzel laeuft mit dem Grad mit und bleibt doch bezwingbar:
 * `min(26, 4 + √grad · 1,6)` — 1 Verbindung 5,6, 18 sind 10,8, 92 sind 19,4,
 * 163 sind 24,4 Bildpunkte. Die Spitze trennt sich damit um das 1,26-fache
 * statt 1,10-fache. Latte: Obsidians eigenes Gesetz ist `3·√(gewicht+1)`,
 * geclampt 8…30 (gemessen 15.10., `audit-2026-10-09/GF-OBSIDIAN-LATTE-15-10.md`)
 * — wir liegen in derselben Klasse, nicht eine Stufe darunter.
 *
 * Der Wert ist in WELTEINHEITEN und wird vor dem Mal-Pass mit dem
 * Groesseregler der Flaeche multipliziert. Unsinn unten (negative Zahl, NaN)
 * faellt auf die kleinste Stufe zurueck, nicht in die Kappe.
 */
export function knotenRadius(grad: number): number {
  const g = Number.isFinite(grad) && grad > 0 ? grad : 0;
  return Math.min(26, 4 + Math.sqrt(g) * 1.6);
}

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
 * (verknuepfeNotiz), „co-mentions" fuer zwei Begriffe in derselben Aussage
 * (dieselbe Funktion, seit #83 (4)) und „related" als Fuellwort fuer eine Aussage
 * ohne Typ (addRelation). Sie sind keine Behauptung eines Menschen — und die Form
 * der Linie sagt bereits, was sie ist. Ein Etikett davon kostet dieselbe Stelle im
 * Budget wie eine echte Aussage.
 *
 * Die dritte Natur war vergessen: gemessen 15.10. 07:54 setzte store.ts „co-mentions",
 * diese Menge kannte es nicht, und die Linie malte ihr rohes Wort. Seither liegt die
 * Liste an **einem** Ort (`src/core/wortschatz.ts`) und beide Seiten importieren sie —
 * ein Vergleich zweier Listen ist eine Wache, eine Liste ist die Heilung. Haelt ausserdem
 * tests/lib/graphLayout.test.ts („schreibt die Wörter des Systems nicht an die Linie").
 */

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
      // Zaehlen und benennen darf nur, was ein Mensch gesagt hat. Die drei Woerter
      // des Systems (siehe SYSTEM_WOERTER) setzt der Speicher selbst — mitzaehlen,
      // aber nicht das Etikett stellen.
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
  /**
   * Die Regler (P-13): Mehrwerte auf die gestimmten Konstanten. Leer heißt 1 —
   * die Physik von vorher ist dann bitgleich die Physik von jetzt.
   */
  krafte: SimKrafte;
  /** Wie viele Knoten im Gang liegen; der Mal-Pass liest die Zahl fuer seine Zeile. */
  allein?: number;
  /**
   * Wer im Gang liegt — dieselbe Menge, die `allein` zaehlt. Der Mal-Pass braucht
   * die Knoten selbst, nicht nur ihre Zahl: bei kleinem Zoom ruecken die
   * Gang-Reihen dichter zusammen, als eine Titelzeile hoch ist, und dann legt die
   * Flaeche ihre Titel in die Punkte der naechsten Reihe (gemessen 15.10. im
   * 820-er Fenster bei 46 % Zoom: „install-guide.sh (Scan)" lag quer ueber
   * „32 notes connect to nothing in this picture").
   */
  gangIds?: Set<string>;
  /** Der Anker des Gangs in Weltkoordinaten: oberste Reihe, mittlere Spalte. */
  alleinAnker?: { x: number; y: number } | null;
  /**
   * Die aktuelle Seite des Gangs (0 beginnt) und ihre Groesse. `gangSeite` setzt
   * die Flaeche — ein Blatt, das 145 Seiten hat, braucht einen Blaetterer, den
   * jemand bedienen kann, und keine 3.712 Einheiten hohe Vorstadt.
   */
  gangSeite?: number;
  gangSeiten?: number;
  /** Wie viele der Zaehlenden auf keiner Seite stehen — nie eine verlorene Zahl. */
  gangVersteckt?: number;
  alpha: number;
  alphaTarget: number;
}

/** Was jemand am Regler verstellt, als Vielfaches der gestimmten Werte. */
export interface SimKrafte {
  abstossung?: number;
  gravitaet?: number;
  link?: number;
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

/**
 * Der Gang.
 *
 * Eine Notiz ohne jeden Nachbarn ist im Kraftfeld kein Punkt, sondern Rauschen:
 * die Abstossung wirft sie nach aussen, und was bleibt, ist ein Ring aus
 * hundertfünfundsechzig einsamen Punkten um einen Klumpen — im Bild die Aussage
 * „dein Gedaechtnis ist ein Haufen". Also: was in *diesem* Bild nichts
 * verbindet, tanzt nicht um den Kern, sondern liegt unter ihm in Reihen —
 * zahlbar, betitelt, und mit demselben Doppelklick zu oeffnen wie jeder andere
 * Knoten. „Dieses Bild" ist massgeblich: wer die Aehnlichkeitslinien anmacht,
 * hoelt Punkte zurueck in den Kern, weil sie dann eben doch Nachbarn haben.
 */
export const GANG_SPALTEN = 32;
export const GANG_ABSTAND = 26;
/**
 * Luft zwischen dem untersten Kernknoten und der ersten Gangreihe.
 *
 * 90 war zu knapp: der unterste Kernknoten traegt eine Titelzeile von rund
 * 14 Bildpunkten, und ueber der ersten Gangreihe steht die Zeile des Gangs
 * selbst. Bei 44 % Zoom stossen beide in dieselbe Zeile — im Bild 10.10.
 * („176 notes connect to nothing…" lag ueber „Werkzeug 0231"). 140 Einheiten
 * sind der Platz fuer beide Zeilen plus ihren Atemzug.
 */
export const GANG_RAND = 140;

/**
 * Der freie Rand, den ein gemalter Satz an einer Kante laesst — vier Bildpunkte.
 *
 * #106, gemessen am ausgelieferten Stueck (Punkt 2, 390 px): die letzte helle Spalte
 * des Gang-Satzes lag bei x 364, die rechte Kante des Legendenkastens bei 358, und
 * der Satz endete **mitten im Wort** — der Malweg kurzte nie. Ein Satz, der an einer
 * Kante ohne Rand endet, ist nicht abgeschnitten, sondern nur nicht mehr lesbar;
 * vier Bildpunkte sind der kleinste Abstand, der ein Zeichen atmen laesst.
 */
export const KANTEN_RAND_PX = 4;

/**
 * Ein Satz, der nicht passt, endet mit einem Auslassungszeichen — nie mit einer
 * halben Silbe.
 *
 * Die Metrik kommt von aussen (`masse`), damit die Rechnung dieselbe ist wie die des
 * Geraets, das gerade malt: dasselbe Wort ist in 11 px ein andrer Strich als in 15 px.
 * Reicht der Platz fuer kein einziges Zeichen plus Punkt, ist die Antwort der leere
 * Satz — eine halbe Silbe ist keine Auskunft, und "nichts malen" sagt die Flaeche
 * ueber ihr Blatt (`gang-info`) weiterhin.
 */
export function satzKuerzen(text: string, masse: (t: string) => number, freiBreitePx: number): string {
  const auslassung = "…";
  if (freiBreitePx <= 0) return "";
  if (masse(text) <= freiBreitePx) return text;
  for (let n = text.length - 1; n >= 1; n--) {
    if (masse(text.slice(0, n) + auslassung) <= freiBreitePx) return text.slice(0, n) + auslassung;
  }
  return masse(auslassung) <= freiBreitePx ? auslassung : "";
}

/**
 * Ein Satz, der nicht passt, wird an Woertern gebrochen — kein Wortteil faellt weg.
 *
 * Der Gang-Satz traegt Zahlen (Seite, gemalt, nicht gemalt). Ihn an der Kante
 * abzuschneiden waere keine Heilung, sondern ein verlustfreier Anschein: die Zahl
 * waere fort, und der Mensch wuesste es nicht. Also: Zeilen fuer Zeilen so viel, wie
 * in die freie Breite faellt; ein einzelnes Wort, das breiter ist als das Bild,
 * endet mit dem Auslassungszeichen — das ist die eine Stelle, wo Tinte fehlen darf,
 * weil sie kein andres Wort ueberdeckt.
 */
export function zeilenUmbruch(text: string, masse: (t: string) => number, freiBreitePx: number): string[] {
  if (freiBreitePx <= 0) return [];
  const woerter = text.split(" ").filter((w) => w.length > 0);
  const zeilen: string[] = [];
  let laufend = "";
  for (const wort of woerter) {
    const kandidat = laufend ? `${laufend} ${wort}` : wort;
    if (masse(kandidat) <= freiBreitePx) {
      laufend = kandidat;
      continue;
    }
    if (laufend) {
      zeilen.push(laufend);
      laufend = "";
      // Dasselbe Wort noch einmal, jetzt am Zeilenanfang.
      if (masse(wort) <= freiBreitePx) { laufend = wort; continue; }
      zeilen.push(satzKuerzen(wort, masse, freiBreitePx));
      continue;
    }
    const gekuerzt = satzKuerzen(wort, masse, freiBreitePx);
    if (gekuerzt) zeilen.push(gekuerzt);
  }
  if (laufend) zeilen.push(laufend);
  return zeilen.filter((z) => z.length > 0);
}

/**
 * #109 — ob ein Rechteck gegen alle Hindernisse den freien Rand haelt, auf **beiden**
 * Achsen. Vier Bildpunkte sind kein Luxus: bei 11 px Schrift ist ein Zeichenbreitenab-
 * stand, und was 1 px entfernt steht, liest sich als Teil des Nachbarn.
 */
export type Rechteck = { x: number; y: number; w: number; h: number };

export function randGehalten(marke: Rechteck, hinder: readonly Rechteck[], randPx: number): boolean {
  return hinder.every((h) =>
    marke.x + marke.w + randPx <= h.x ||
    h.x + h.w + randPx <= marke.x ||
    marke.y + marke.h + randPx <= h.y ||
    h.y + h.h + randPx <= marke.y
  );
}

/**
 * Die erste freie Lage der geretteten Zahl: neun Versuche um ihre eigne Breite und
 * Hoehe (erst hoeher, dann tiefer, dann seitlich), in demselben Mass wie das
 * Rechteck selbst, und danach zwei Spruenge an den Rand eines Hindernisses vorbei.
 *
 * `kanten` sagt, an wessen Rand sie springen darf — per Default an jeden. Die
 * Flaeche gibt dort nur die Karten ein, denn die Bildkante ist kein Gegenstand:
 * wer an ihren Rand springt, steht ausserhalb des Bildes und haelt doch jede
 * Pruefung, weil eine Wand enddicke Buchstaben hat.
 *
 * `null` heisst: keine dieser Lagen haelt den Rand. Es heisst **nicht**, dass die
 * Zahl weg darf — sie ist die einzige Auskunft ueber einen Kern, den das Bild
 * nicht mehr als Einzelne zeigt (#105). Der Aufrufer malt sie an die beste Stelle
 * und nennt den Zustand; ein Verschwinden ohne Wort ist der alte Fehler.
 */
export function zahlOrt(
  zahl: Rechteck,
  hinder: readonly Rechteck[],
  randPx: number,
  kanten: readonly Rechteck[] = hinder
): Rechteck | null {
  const vs = [
    [0, 0], [0, -1], [0, 1], [-1, 0], [1, 0], [0, -2], [0, 2], [-1, -1], [1, -1],
  ];
  for (const [dx, dy] of vs) {
    const kandidat = { x: zahl.x + dx * (zahl.w / 2), y: zahl.y + dy * (zahl.h + randPx), w: zahl.w, h: zahl.h };
    if (randGehalten(kandidat, hinder, randPx)) return kandidat;
  }
  // Die Schritte reichen um ihre eigne Groesse — gegen eine Karte, die bei
  // Telefonbreite 275 Bildpunkte hoch ist (gemessen 26.10. 23:51:48 am Objekt),
  // kommen sie nicht an. Also an ihrem Rand vorbei: erst ueber ihr, dann unter ihr.
  // Ein Hindernis, das die Zahl nicht ueberschreiten kann, darf sie nicht
  // verschlucken; die Flaeche malt und sagt `eng`, wenn auch hier nichts frei ist.
  for (const h of kanten) {
    for (const kandidat of [
      { x: zahl.x, y: h.y - randPx - zahl.h, w: zahl.w, h: zahl.h },
      { x: zahl.x, y: h.y + h.h + randPx, w: zahl.w, h: zahl.h },
    ]) {
      if (randGehalten(kandidat, hinder, randPx)) return kandidat;
    }
  }
  return null;
}

/**
 * Die erste Zeile, die im Bild liegt und vor dem Kasten Halt macht.
 *
 * Die Flucht ging bisher nur **abwaerts** (`KnowledgeGraph.tsx:4080`) und brach an
 * der unteren Bildkante ab — aber der Legendenkasten sitzt am unteren Rand. Eine
 * Zeilengruppe, die dort nicht paesst, muss deshalb nach **oben** ausweichen
 * koennen. Probierfolge: erst die gedachte Stelle, dann ein Schritt hoch, dann
 * runter, bis vier Schritte ausgewaehlt sind. `zusatz` ist die letzte Schwelle: das
 * Belegungsraster der Etiketten, das ein reiner Ort nicht kennt.
 */
export function zeilenFlucht(
  capY0: number,
  schritt: number,
  blokHoehe: number,
  kastenOben: number,
  bildHoehe: number,
  maxSchritte = 4,
  zusatz: (y: number) => boolean = () => true
): number | null {
  const boden = Math.min(kastenOben, bildHoehe) - KANTEN_RAND_PX;
  for (let s = 0; s <= maxSchritte; s++) {
    for (const richtung of s === 0 ? [0] : [-1, 1]) {
      const y = capY0 + richtung * s * schritt;
      if (y >= 0 && y + blokHoehe <= boden && zusatz(y)) return y;
    }
  }
  return null;
}


/**
 * #17 — wie viele Zeichen ein Gang-Titel bei diesem Zoom tragen darf.
 *
 * Die Reihe steht in WELTeinheiten (`GANG_ABSTAND`) und schrumpft mit dem Zoom,
 * der Titel aber wird in BILDPIXELn gemalt. Eine Kuerzung, die nur die Stufe
 * kennt und den Zoom nicht, baut einen Titel von 26 Zeichen in eine Reihe von
 * 26 Bildpunkten — gemessen an seinem Bestand: Median 145,27 Bildpixel, und die
 * Breiten-Schalte wirft ihn. Genau das war das zweite Tor, das das erste
 * schloss: unter 93,08 % warf die Höhen-Schalte alle 384 Reihen-Punkte, und ab
 * 93,08 % verlangte die Breite einen Zoom, den der Einpass-Deckel bei 400 %
 * nie hergibt.
 *
 * Die Grenze kommt aus zwei Breiten, die die Flaeche selbst misst: einem
 * Zeichenpaar (geteilt durch zwei — ein Einzelzeichen wäre gerundeter) und der
 * Auslassung, die `kuerze()` HINTER die Zeichen setzt. Beides in Bildpixeln,
 * derselbe Schriftschnitt, dasselbe Raster.
 */
export function gangKuerzungZeichen(
  zoom: number,
  paarBreite: number,
  auslassungBreite: number,
  abstand = GANG_ABSTAND,
): number {
  const reihe = abstand * zoom;
  const zeichen = paarBreite / 2;
  if (!(reihe > 0) || !(zeichen > 0)) return 0;
  const platz = reihe - auslassungBreite;
  return platz > 0 ? Math.floor(platz / zeichen) : 0;
}

/** Der Schriftrest, aus dem `gangKuerzungZeichen` seine Zeichenbreite nimmt. */
export const GANG_PROBE_PAAR = "nn";
/** Das Zeichen, das `kuerze()` anhängt — es braucht Platz in derselben Reihe. */
export const GANG_PROBE_AUSLASSUNG = "…";

/**
 * #29 — wie viele Namen in ein Bild passen, gerechnet aus seiner Leinwand.
 *
 * Bis hierhin stand eine gesetzte Zahl im Quelltext (`MAX_LABELS = 140`). Die
 * Flaeche entscheidet aber ueber ein Belegungsraster in BILDSCHIRMkoordinaten:
 * eine Zelle ist `fs + 3` hoch, und ein Titel belegt zwei Rasterzeilen und so
 * viele Spalten, wie seine Breite braucht. Genau diese Rechnung — pro Achse
 * gefloorft, weil `freiUndBelegen` das auch tut — ist der Etat.
 *
 * Der Markt rechnet so: SiYuan nimmt `max(32, floor(w·h/2400))` aus der
 * Fensterflaeche (`labelRenderer.ts:53`, GQ3), nicht aus dem Bestand. Der
 * Unterschied ist keine Geschmacksfrage: eine Zahl aus dem Bestand kappt Namen,
 * die das Fenster laengst hergeben, und laesst Namen zu, die kein Raster frei
 * hat. Weil die Titelbreite selbst aus der Stufe und dem Zoom kommt (#17),
 * waechst der Etat mit jedem kuerzeren Titel von allein.
 */
export function titelEtatAusLeinwand(
  breite: number,
  hoehe: number,
  titelBreite: number,
  zellHoehe: number,
): number {
  if (!(breite > 0) || !(hoehe > 0) || !(titelBreite > 0) || !(zellHoehe > 0)) return 0;
  const zellen = Math.floor(breite / zellHoehe) * Math.floor(hoehe / zellHoehe);
  // Zwei Rasterzeilen, weil der Text mit der Oberkante auf seiner Achse sitzt;
  // so viele Spalten, wie seine Breite braucht, aufgerundet.
  const proTitel = 2 * Math.ceil(titelBreite / zellHoehe);
  return proTitel > 0 ? Math.floor(zellen / proTitel) : 0;
}

/** Der i-te Platz im Gang, relativ zum Anker: Spalten zuerst, dann Zeilen. */
export function gangPlatz(
  i: number,
  spalten = GANG_SPALTEN,
  abstand = GANG_ABSTAND
): { x: number; y: number } {
  const spalte = i % spalten;
  const zeile = Math.floor(i / spalten);
  return { x: (spalte - (spalten - 1) / 2) * abstand, y: zeile * abstand };
}

/**
 * Wie viele Reihen der Gang bei n Notizen braucht — dieselbe Rechnung, die der Mal-Pass
 * ziehen muss, wenn er seine Zeile malt.
 *
 * eigene Funktion, weil die Zahl bis hierhin nur ein Zwischenwert im Zeichnen war: was nur auf
 * dem canvas steht, liest niemand — weder ein Pruefstand noch ein Mensch mit einer
 * Vorlesesoftware, und schon gar keine Rechnung ueber die eigene Datei.
 */
export function gangZeilen(alleinZahl: number, spalten = GANG_SPALTEN): number {
  if (!(alleinZahl > 0)) return 0;
  return Math.ceil(alleinZahl / Math.max(1, spalten));
}

/**
 * Reihen je Seite des Gangs.
 *
 * 12 Reihen a 32 Spalten = 384 Punkte: so hoch, wie ein Bild bei 26 px Schritt
 * unter den Kern legen kann, ohne dass der Kern zum Staubkorn wird — 12 Reihen
 * sind 286 Einheiten, und mit dem Atemzug darueber (GANG_RAND 140) passt die
 * Seite unter einen Schirm. Mit 4 Reihen wurden aus 2.400 allein stehenden
 * Notizen 19 Seiten statt einer. Die Masse selbst bleibt ungeaendert zaehlen —
 * was nicht auf der Seite liegt, ist versteckt, nicht verbunden.
 */
export const GANG_REIHEN_PRO_SEITE = 12;

/** Plaetze auf einer Seite — Spalten mal Reihen, nie null. */
export function gangPlaetzeProSeite(
  spalten = GANG_SPALTEN,
  reihen = GANG_REIHEN_PRO_SEITE
): number {
  return Math.max(1, spalten) * Math.max(1, reihen);
}

/**
 * Wie viele Seiten der Gang hat. Null Notizen ohne Nachbarn sind null Seiten —
 * eine Seite, die ins Leere blaettert, ist kein Zugang, sondern ein Defekt.
 */
export function gangSeiten(alleinZahl: number, plaetze = gangPlaetzeProSeite()): number {
  if (!(alleinZahl > 0)) return 0;
  return Math.ceil(alleinZahl / Math.max(1, plaetze));
}

/**
 * Welche Knoten in diesem Bild keinen einzigen Nachbarn haben.
 *
 * Begriffe (`__ent:`) sind nie allein — sie *sind* die Nachbarschaft. Gezogene
 * Knoten bleiben, wo der Nutzer sie hingelegt hat: die Hand gewinnt gegen jede
 * Ordnung der Flaeche.
 */
/** Wer ohne jeden Nachbarn dasteht — der Gang entscheidet selbst, ob er greift. */
/**
 * Greift der Gang, oder bleibt die Basis ein Feld?
 *
 * Dieselbe Regel, die der Schritt anwendet, muss die Flaeche lesen koennen, bevor
 * der erste Schritt gelaufen ist — sonst sagt ihr Blatt etwas zu einer Seite, die
 * das Bild nie malen wird. Darum steht die Entscheidung hier und nicht zweimal.
 */
export function gangGreift(
  alleinZahl: number,
  knotenZahl: number,
  kernDa: boolean,
  plaetze = gangPlaetzeProSeite()
): boolean {
  if (alleinZahl < 8) return false;
  if (alleinZahl * 2 <= knotenZahl) return true;
  return alleinZahl >= plaetze && kernDa;
}

export function alleinKnoten(
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[]
): LayoutNode[] {
  const nachbarn = new Set<string>();
  for (const e of edges) {
    if (e.source === e.target) continue;
    nachbarn.add(e.source);
    nachbarn.add(e.target);
  }
  return nodes.filter(
    (n) => !n.pinned && !n.id.startsWith(ENTITAETS_PRAEFIX) && !nachbarn.has(n.id)
  );
}

export function createSimulation(
  ids: readonly string[],
  edges: readonly LayoutEdge[],
  radiusOf: (id: string) => number = () => DEFAULT_RADIUS,
  krafte: SimKrafte = {}
): Simulation {
  const nodes = initialPositions(ids, SPACING, radiusOf);
  const kanten = edges.filter((e) => e.source !== e.target);
  return {
    nodes,
    index: new Map(nodes.map((n) => [n.id, n])),
    edges: kanten,
    linkStaerke: linkStaerken(nodes, kanten),
    ruheLaenge: IDEAL_LINK * (krafte.link ?? 1),
    krafte,
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
  radiusOf: (id: string) => number = () => DEFAULT_RADIUS,
  krafte: SimKrafte = vorher?.krafte ?? {}
): Simulation {
  const frisch = createSimulation(ids, edges, radiusOf, krafte);
  if (!vorher) return frisch;
  frisch.ruheLaenge = vorher.ruheLaenge;
  let uebernommen = 0;
  for (const n of frisch.nodes) {
    const alt = vorher.index.get(n.id);
    if (!alt) continue;
    n.x = alt.x; n.y = alt.y; n.vx = alt.vx; n.vy = alt.vy; n.pinned = alt.pinned;
    // Der gemerkte Ursprung wandert mit: `idsSchluessel` der Flaeche aendert sich
    // bei jedem Tipp im Suchfeld, und ein Ursprung, der hier fiele, waere beim
    // naechsten Filter weg — der Loesungsknopf waere auch wieder wirkungslos.
    if (alt.ursprung) n.ursprung = { x: alt.ursprung.x, y: alt.ursprung.y };
    uebernommen++;
  }
  // Nur nachwaermen, wenn sich wirklich etwas geaendert hat.
  frisch.alpha = uebernommen === ids.length && ids.length === vorher.nodes.length ? vorher.alpha : Math.max(vorher.alpha, 0.45);
  return frisch;
}

/**
 * Das Feld vorspannen: eine Zahl Bilder auf einmal, bevor gezeichnet wird.
 *
 * Ohne das sieht der Nutzer die ersten Sekunden eine Spirale, die sich
 * zusammenzieht, und das Bild hält an, wo alpha ausging — nicht wo die Kräfte
 * zur Ruhe kamen. Vorspannen kostet pro Knoten Bruchteile eines Millisekündchens
 * (gemessen: 900 Bilder an 3 025 Knoten in 1,6 s) und gibt dem ersten Bild eine
 * Anordnung statt eines Flugs.
 */
export function vorspannen(sim: Simulation, runden: number): void {
  for (let i = 0; i < runden; i++) stepSimulation(sim);
}

/** Simulation wieder anheizen — etwa, wenn der Nutzer einen Knoten zieht. */
export function reheat(sim: Simulation, alpha = 0.35): void {
  sim.alpha = Math.max(sim.alpha, alpha);
}

/**
 * Merkt die Stelle des ERSTEN Griffs. Ein zweiter Griff ueberschreibt sie nicht:
 * „zurueck" heißt zurueck an den Anfang, nicht an die letzte Ablagestelle.
 */
export function merkUrsprung(sim: Simulation, id: string): boolean {
  const n = sim.index.get(id);
  if (!n || n.ursprung) return false;
  n.ursprung = { x: n.x, y: n.y };
  return true;
}

/**
 * Gibt einen Knoten an seine gemerkte Stelle zurueck und laesst ihn frei.
 *
 * Ohne `reheat`: der Knopf verspricht einen Weg zurueck, kein Neubepleben des
 * ganzen Feldes. Ein kaltes Feld bleibt darum kalt, und was zurueckgeht, ist
 * genau der Knoten, den die Hand wegggenommen hat.
 *
 * Rueckgabewert ist der zurueckgelegte Weg in Welteinheiten — 0, wenn es nichts
 * zurueckzugeben gab. Das ist die Zahl hinter „Release N pinned": gezaehlt wird
 * nur, was auch eine zurueckgehbare Stelle hat.
 */
export function loeseKnoten(sim: Simulation, id: string): number {
  const n = sim.index.get(id);
  if (!n?.ursprung) return 0;
  const { x, y } = n.ursprung;
  const weg = Math.hypot(n.x - x, n.y - y);
  n.x = x;
  n.y = y;
  n.vx = 0;
  n.vy = 0;
  n.pinned = false;
  return weg;
}

/**
 * Die Regler: Kräfte an einer laufenden Simulation verstellen.
 *
 * Dieselben Knoten, dieselben Positionen, nur eine andere Physik darunter. Ein
 * Neubau (reuseSimulation mit neuen Kräften) würde die Welt bei jedem Bild des
 * Reglers neu einsetzen und die Kamera mitnehmen — wer an der Abstoßung dreht,
 * will zusehen, wie das bestehende Bild sich setzt. Das Anheizen gehört dazu:
 * ein ausgekühltes Feld rührte sich sonst nicht, und der Regler wäre tot.
 */
export function setzeKrafte(sim: Simulation, krafte: SimKrafte): void {
  sim.krafte = { ...krafte };
  sim.ruheLaenge = IDEAL_LINK * (krafte.link ?? 1);
  reheat(sim);
}

/**
 * Dasselbe für die Knotengröße: die Radien setzen und das Feld weiterarbeiten
 * lassen. Die Kollision löst die neuen Überlappungen im nächsten Bild — sie ist
 * Teil jedes Schritts, und der Regler darf der Welt nicht vorgreifen.
 */
export function setzeKnotenGroesse(sim: Simulation, radiusOf: (id: string) => number): void {
  for (const n of sim.nodes) n.r = radiusOf(n.id);
  reheat(sim);
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

  // Der Gang zuerst: seine Punkte bekommen ihren Platz gerechnet, nicht
  // erstritten. Ohne diese Reihenfolge stoesst die Abstossung sie in den
  // Ring zurueck, den dieser Block abschafft.
  const alleinMoeglich = alleinKnoten(nodes, edges);
  // Der Gang greift, wo auch nur eine Vorstadt da ist — und er blaettert, wenn
  // die Vorstadt groesser ist als ein Bildschirm.
  //
  // Eine Basis, in der noch nichts zusammenhaengt, hat keinen Kern, unter den
  // man umziehen koennte — dort ist die runde Anordnung des Feldes die bessere
  // Antwort, und das zwolf-Notizen-Bild bleibt, was es ist. Untergrenze acht:
  // drei Punkte in einer Reihe mit einem Satz darueber sind mehr Rauschen als
  // Ordnung.
  //
  // Die alte Obergrenze („allein * 2 ≤ Knoten") galt ohne Ausnahme und hat damit
  // den Gang genau dort abgeschaltet, wo er am meisten zu sagen hat: an Damians
  // Bestand stehen nach dem Nachzug ~18.500 von 21.066 Notizen ohne Nachbarn
  // (Tuer 15:00 MESZ: 2.756 Begriffe, 2.726 Kanten; verknuepfbar sind 1.018
  // Notizen = 4,83 %, die Regel findet in seinem Text keinen zweiten Begriff).
  // Also die Ausnahme statt der Abschaffung: **ein Kern muss da sein** (wenigstens
  // etwas, das der Gang unter sich legen koennte) und die Masse muss groesser sein
  // als eine Seite. Beides nicht erfuellt laesst das Feld, was ein Feld ist —
  // die zwei Wachen „bleibt ein Feld" und „das Layout darf groesser sein als das
  // Fenster" halten das, weil sie genau die all-einsame Basis messen.
  const allein = gangGreift(alleinMoeglich.length, nodes.length, nodes.length - alleinMoeglich.length > 0)
    ? alleinMoeglich
    : [];
  sim.allein = allein.length;
  const plaetze = gangPlaetzeProSeite();
  const seiten = gangSeiten(allein.length, plaetze);
  sim.gangSeiten = seiten;
  const seite = Math.min(Math.max(0, Math.floor(sim.gangSeite ?? 0)), Math.max(0, seiten - 1));
  sim.gangSeite = seite;
  const alleinAlle = new Set(allein.map((n) => n.id));
  const von = seite * plaetze;
  const dieSeite = allein.slice(von, von + plaetze);
  const imGang = new Set(dieSeite.map((n) => n.id));
  sim.gangIds = imGang;
  sim.gangVersteckt = allein.length - imGang.size;
  for (const n of nodes) n.versteckt = alleinAlle.has(n.id) && !imGang.has(n.id);

  // Die Quadtree kennt den Gang nicht: er soll den Kern weder stossen noch
  // ihn beim Einpassen verzerren.
  const baum = buildQuadtree(alleinAlle.size === 0 ? nodes : nodes.filter((n) => !alleinAlle.has(n.id)));
  const kraft = { fx: 0, fy: 0 };

  for (const n of nodes) {
    if (alleinAlle.has(n.id)) continue;
    if (n.pinned) { n.vx = 0; n.vy = 0; continue; }
    kraft.fx = 0;
    kraft.fy = 0;
    repulsionOn(baum, n, REPULSION * (sim.krafte.abstossung ?? 1), THETA, kraft);
    n.vx += kraft.fx * alpha;
    n.vy += kraft.fy * alpha;
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

  const g = gravityFor(nodes.length) * (sim.krafte.gravitaet ?? 1);
  for (const n of nodes) {
    if (alleinAlle.has(n.id)) continue;
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

  // Harte Randbedingung zum Schluss, ohne alpha: Knoten ueberlappen nie. Was auf
  // keiner Seite liegt, ist nicht im Bild und braucht keine Scheidung — bei
  // 18.500 versteckten Punkten waere das ein Nachlauf ueber Punkte, die niemand
  // sieht, jedes Bild aufs Neue.
  resolveCollisions(sim.gangVersteckt ? nodes.filter((n) => !n.versteckt) : nodes);

  // Der Gang bekommt seinen Platz ZULETZT, nach dem Bild, das die Kraefte
  // gerade gewirkt haben. Vorher gesetzt, haengte sein Rand an der Kernlage des
  // vorigen Bildes — der Kern sinkt aber noch, und der Abstand war um Bruchteile
  // eines Bildpunktes gebrochen, kaum dass jemand nachmisst.
  if (allein.length > 0) {
    let randY = 0;
    for (const n of nodes) if (!alleinAlle.has(n.id) && n.y > randY) randY = n.y;
    dieSeite.forEach((n, i) => {
      const platz = gangPlatz(i);
      n.x = platz.x;
      n.y = randY + GANG_RAND + platz.y;
      n.vx = 0;
      n.vy = 0;
    });
    sim.alleinAnker = { x: 0, y: randY + GANG_RAND };
  } else {
    sim.alleinAnker = null;
  }

  sim.alpha += (sim.alphaTarget - sim.alpha) * ALPHA_DECAY;
  if (sim.alphaTarget === 0 && sim.alpha < ALPHA_MIN) sim.alpha = ALPHA_MIN;
}

// ---------- Ausschnitt ----------

/** Umschliessendes Rechteck aller Knoten — die tatsaechliche Ausdehnung der Welt. */
export function layoutBounds(nodes: readonly LayoutNode[], padding = 0): Bounds {
  if (nodes.length === 0) return { minX: -100, minY: -100, maxX: 100, maxY: 100 };
  // Was auf keiner Seite des Gangs liegt, wird nicht gemalt und darf darum auch
  // nicht einpassen: ein Bild, das auf verborgene Punkte zoomt, zeigt seinen Kern
  // klein und leer.
  const sichtbare = nodes.filter((n) => !n.versteckt);
  const menge = sichtbare.length > 0 ? sichtbare : nodes;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of menge) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }
  return { minX: minX - padding, minY: minY - padding, maxX: maxX + padding, maxY: maxY + padding };
}

/**
 * Die Mitte des Bildes, in dem wirklich etwas steht.
 *
 * `layoutBounds` kennt nur die aeussersten Punkte der Welt. Bei einem Bestand mit
 * einem Haufen verbundener Notizen und einem weiten Feld Vereinzelte liegt die
 * Mitte dieser Box dort, wo nichts ist: die Flaeche zentriert ins Leere, der
 * Inhalt klebt an eine Kante, und die Titelkoepfe laufen ueber die Leinwand hinaus
 * (gemessen 18.10. an 1 500 Notizen: 35 Namen, alle rechts oben, der Rand
 * durchschneidet „Forschung Datensatz…").
 *
 * Gesucht ist deshalb nicht die Boxmitte, sondern die Mitte des **dichtesten
 * Ausschnitts**: das Fenster, das in dieser Blende die meisten Punkte fasst. Zwei
 * Paeße (erst x, dann y, dann die Punkte in beiden) trennen Weltmitte von
 * Bildmitte und kosten O(n log n) — die Kamera rechnet einmal pro Einpassen,
 * nicht pro Bild.
 *
 * `randPx` ist der Atemzug an jeder Leinwandkante in Bildpixeln: der Ausschnitt
 * wird um den Rand verkleinert, damit ein Punkt, der zaehlt, auch seinen Titel
 * ganz im Bild hat. Passt die ganze Welt in das Fenster, gibt es nichts zu
 * waehlen — dann ist die Boxmitte die richtige Antwort.
 */
export function dichtesteWeltMitte(
  knoten: readonly { x: number; y: number; versteckt?: boolean }[],
  k: number,
  viewport: { w: number; h: number },
  randPx = 0,
): { x: number; y: number } | null {
  const sichtbare = knoten.filter((n) => !n.versteckt);
  const menge = sichtbare.length > 0 ? sichtbare : knoten;
  if (menge.length === 0 || !(k > 0) || viewport.w <= 0 || viewport.h <= 0) return null;
  const fensterB = (viewport.w - 2 * randPx) / k;
  const fensterH = (viewport.h - 2 * randPx) / k;
  if (fensterB <= 0 || fensterH <= 0) return null;

  // Der dichteste Streifen entlang einer Achse: maximales Haeufigkeit, bei Gleichstand
  // der engste Inhalt — ein enger Inhalt laesst mehr Luft an den Kanten.
  const streifen = (werte: number[], fenster: number): { lo: number; hi: number } | null => {
    if (werte.length === 0) return null;
    const xs = [...werte].sort((a, b) => a - b);
    let bestAnzahl = -1;
    let bestLo = xs[0]!;
    let bestHi = xs[0]!;
    let i = 0;
    for (let j = 0; j < xs.length; j++) {
      while (xs[j]! - xs[i]! > fenster) i++;
      const anzahl = j - i + 1;
      const span = xs[j]! - xs[i]!;
      const besser = anzahl > bestAnzahl || (anzahl === bestAnzahl && span < bestHi - bestLo);
      if (besser) {
        bestAnzahl = anzahl;
        bestLo = xs[i]!;
        bestHi = xs[j]!;
      }
    }
    return { lo: bestLo, hi: bestHi };
  };

  const bx = streifen(menge.map((n) => n.x), fensterB);
  if (!bx) return null;
  const inX = menge.filter((n) => n.x >= bx.lo && n.x <= bx.hi);
  const by = streifen(inX.map((n) => n.y), fensterH);
  if (!by) return null;
  const im = inX.filter((n) => n.y >= by.lo && n.y <= by.hi);
  if (im.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of im) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/**
 * Ab wann ist das Kraftfeld kein Netz, sondern eine Punktwolke, die sich für
 * eines ausgibt?
 *
 * Die Fläche malt jede Notiz als Knoten. Hängt die Mehrzahl der Notizen an
 * keinem Begriff, steht ein rundes Feld voller Punkte im Bild — bei 14 702
 * Notizen und 37 gedeckten (Damian, 13.10.) sind das 4-Bildpunkte Abstand pro
 * Punkt und null Etiketten. Die Marke ist die Hälfte des Bestands, die der Gang
 * schon für sich beansprucht (`graphLayout.ts` Gangregel: `allein · 2 ≤ Knoten`),
 * nach unten verschärft auf zwanzigstel: unter fünf Prozent gedeckter Notizen
 * verbindet das Bild nichts, was es zeigt. Unter 200 Notizen greift die Marke
 * nicht — eine kleine Basis darf sich als Feld zeigen, auch wenn sie noch
 * verstreut ist.
 */
export function punktwolke(notizen: number, gedeckt: number): boolean {
  return notizen >= 200 && gedeckt * 20 < notizen;
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

/**
 * Wie viel Bildflaeche ein Linienzug fuer sich braucht, bevor das Feld zum
 * Schleier wird.
 *
 * A7 hat bei 1 500 Notizen 1 543 Linien-Stuecke in 1 130 × 668 px gemessen —
 * ungekuerzt, weil die einzige Kappe des Feldes (`nurEchteKanten`) nur fuer
 * Aehnlichkeitslinien gilt und erst ab 2 500 Kanten greift. Erwaehnungen stehen
 * damit gleich stark im Bild wie die neun Behauptungen, die jemand gefuehrt hat.
 *
 * Gekappt wird nach BILDFLAECHE: pro Zug 900 Quadratzpixel Leinwand. Das ist
 * dieselbe Groessenordnung, die ein Etikett braucht (11 pxschrift, 14 px Zeile),
 * und sie skaliert mit dem Fenster — ein grosses Bild darf mehr Linien haben als
 * ein kleines, weil es mehr Platz hat, nicht weil mehr Notizen da sind.
 */
export const LINIEN_FLAECHE_PRO_ZUG = 900;
/** Mindestbudget, damit ein kleines Feld nicht auf null Linien faellt. */
export const LINIEN_MINDESTBUDGET = 40;

export function linienBudget(breite: number, hoehe: number): number {
  return Math.max(LINIEN_MINDESTBUDGET, Math.floor((breite * hoehe) / LINIEN_FLAECHE_PRO_ZUG));
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
    // Was auf keiner Seite des Gangs liegt, wird nicht gemalt und darf auch
    // nicht angefasst werden: sonst greift die Hand nach einem Punkt, den das
    // Bild verschweigt, meldet „greift" statt „schieben", und der Graph laesst
    // sich nicht mehr bewegen (gemessen 15.10. 18:0x an seinem Bestand).
    if (n.versteckt) continue;
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
  /**
   * Behauptungen, die im Bestand stehen, deren beurkundende Notiz im Bild steht
   * und die die Titel-Echo-Regel (G-1) nicht durchlässt. Die Zahl gehört an die
   * Fläche: verborgen ist hier richtig, verschwiegen wäre falsch.
   */
  vomEchoVerschluckt: number;
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

  /**
   * Die Trägerzahl je Begriff **im ganzen Bestand** — nicht im Ausschnitt. Ob
   * ein Begriff nur seine eigene Notiz hat, ist eine Tatsache der
   * Wissensbasis; Filter und Zeitregler entscheiden, was gezeichnet wird, aber
   * nicht, was ein Titel-Echo ist. Ohne diese Zeile machte ein Tipp im Suchfeld
   * eine lebende Behauptung zu einer Überschrift.
   */
  const traegerImBestand = new Map<string, number>();
  for (const [name, ids] of Object.entries(memoriesByEntity ?? {})) {
    traegerImBestand.set(name, new Set(ids).size);
  }

  const echo = (name: string): boolean => {
    if (!titelVon) return false;
    if ((traegerImBestand.get(name) ?? 0) !== 1) return false;
    const einzig = (memoriesByEntity ?? {})[name]?.[0];
    if (!einzig) return false;
    const titel = (titelVon(einzig) ?? "").trim().toLowerCase();
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
  /**
   * Wie viele Behauptungen das Titel-Echo nicht durchlässt, obwohl ihre
   * beurkundende Notiz im Bild steht. G-1 entscheidet bewusst, diese Kanten zu
   * verbergen — aber ein Bild, das etwas verbirgt, muss die Zahl dazusagen,
   * sonst hält der Nutzer seine eigenen Wiki-Links für fehlgeschlagen.
   */
  let vomEchoVerschluckt = 0;
  for (const r of relationen ?? []) {
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
    // Eine Aussage, die an einem Titel-Echo hängt, ist keine Aussage: Der
    // Schreibweg hat sie erzeugt, nicht ein Mensch. Der Verlust ist gezählt.
    if (echo(r.source) || echo(r.target)) {
      vomEchoVerschluckt++;
      continue;
    }
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
  return { knoten, erwahnungen, behauptungen, vomEchoVerschluckt };
}
