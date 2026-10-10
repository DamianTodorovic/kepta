// Der Datenvertrag von GET /api/graph/bild (Papiers A9, Abschnitt 1/2/3).
//
// Nur Typen, Konstanten und ein leeres Kuvert — keine Rechnung. Die Rechnung
// sitzt in graf-terms.ts (Begriffe), graf-kraft.ts (Plaelze) und graf-dienst.ts
// (Kuvert fuellen). Der Vertrag ist getrennt, weil ein Kunde im Markt nur so gut
// zeichnen kann, wie diese Felder ihm etwas sagen.
//
// Ein Kuvert, zwei Sichten: knoten[]/kanten[] unterscheiden sich, der Rest ist
// identisch. Ein Client schreibt einen Renderer, keine zwei.

export type GrafSicht = "konzept" | "notiz";

/** Reihenfolge ist die Reihenfolge in der Doku und im Schema. */
export const GRAF_SICHTEN: readonly GrafSicht[] = ["konzept", "notiz"];

export const GRAF_VERTRAG = "graf-2";

/**
 * Welteinheiten, nicht Pixel. Der Client skaliert mit min(breite,hoehe)/1000 —
 * Fenster- und Reglergroesse gehen in keine Rechnung ein (A9 B-1/B-2).
 */
export const WELT_GROESSE = 1000;
/** Randzone, in die kein Knoten gelegt wird. */
export const WELT_RAD = 30;

/**
 * Aendert sich nur, wenn die Kraftgesetze sich aendern. Ein Cache, der unter
 * derselben Generation ein anderes Bild bekommt, ist kein Cache sondern ein
 * Roulette — darum haengt er an dieser Zahl mit.
 *
 * Stand 4: ein neuer Knoten steigt bei seiner platzierten Nachbarschaft ein (nicht im
 * Leeren), seine Reichweite ist der Einstiegshalbmesser, die Abstossung hat eine
 * Reichweite (ABSCHRECKUNG), und Bestehende wandern nur innerhalb WANDER_GRENZE.
 * Stand 3: Ticks-Budget 140, alpha-Verfall 0,963, Ruhe-Schwelle 1,0 — gemessen an
 * Randklemmung und Federdehnung, nicht an Gefuehl. Plaetze aus Version 2 sind
 * damit ungueltig.
 *
 * Stand 2: die Relaxation endet nicht mehr nach dem gedaempften Schritt, sondern
 * nach der rohen Spannung, und alpha dämpft den Weg nicht mehr — dasselbe
 * Kraftgesetz, ein anderes Ergebnis. Plaetze aus Version 1 sind ungueltig.
 */
export const LAYOUT_VERSION = 4;

/**
 * Voreinstellungen. Jede einzelne Kappe reist als Feld im Kuvert mit.
 *
 * Das Paar-Budget war im Vertrag 2 000 000 — gemessen am 10.10.2026 kosten so
 * viele Paarpruefungen bei 2 000 Knoten 4 685 ms fuer den ersten Aufruf. Der
 * Deckel sitzt jetzt bei 150 000, was nach Messung die Bildrechnung auf 42-50 ms
 * halt (Paarlauf plus Kappen) — bei 2 000 Knoten bleibt der erste Aufruf damit
 * nicht unter den aus A9 §6 bestellten 400 ms: gemessen 293-318 ms im
 * Einzelprozess, 563-677 ms im Testlauf auf ruhiger Maschine. Die restliche Zeit
 * sitzt im Weltbild, nicht im Budget (Belege: F10-GRAF-DIENST.md und die
 * Grenzen-Wache in tests/graf-kosten.test.ts). Was das Budget nicht erreiht,
 * meldet `uebrig.begriffe` mit dem Grund `paarBudget`. Ein Client, der mehr
 * Arbeit will, kann sie nicht erzwingen — die Kappe ist eine Zusage, keine
 * Empfehlung.
 */
export const KAPPE = { knoten: 500, kanten: 2000, paarPruefungen: 150_000 };

/**
 * Die Bilanz (A9 §3). Rechenpflicht: bestand.knoten === knoten.length +
 * uebrig.knoten, ebenso fuer Kanten und Paare. Eine Zahl, die diese Identitaet
 * nicht erfuellt, ist kein Ausschnitt, sondern eine Erzaehlung.
 */
export interface GrafKuerzung {
  /** Was erlaubt war. */
  kappe: { knoten: number; kanten: number; paarPruefungen: number };
  /** Was nicht dabei ist. */
  uebrig: { knoten: number; kanten: number; paare: number; begriffe: number };
  grund: Array<"knoten" | "kanten" | "paarBudget" | "tiefe" | "privat" | "papierkorb">;
  /** Nur Zahlen, nie Namen. */
  gefiltert: { privat: number; papierkorb: number };
  /** Traeger-Notiz geloescht oder nie vorhanden. */
  verwaiste: { knoten: number; kanten: number };
  vollstaendig: boolean;
}

export interface GrafWelt {
  einheit: "welt";
  groesse: number;
  herkunft: "kraft" | "karte" | "rand";
}

export interface GrafStempel {
  generation: number;
  layoutVersion: number;
  parameterHash: string;
  /** Ehrlich: war die Rechnung diesmal Arbeit? */
  berechent: "cache" | "neu";
}

export interface GrafKnoten {
  /** konzept: "e-<rowid>" · notiz: Notiz-ID "k-…" */
  id: string;
  titel: string;
  /** notiz: MemoryType · konzept: "begriff" */
  art: string;
  /** Zahl der Belege, die fuer dieses Ende sprechen (echte Kanten). */
  gradEcht: number;
  /** Zahl der Aehnlichkeitskanten an diesem Ende (Vermutung). */
  gradVermutet: number;
  /** Welteinheiten 0..1000; fehlt, wenn layout=0. */
  x?: number;
  y?: number;
  /** true, wenn der Platz aus dem letzten Bild uebernommen wurde. */
  verankert?: boolean;
  /** Zahl der Nachbarn, die der Kappung zum Opfer fielen — einloesbar (A9 §3.4). */
  versteckteNachbarn: number;
  /** konzept: Traegerzahl und bis zu 20 Traeger-IDs. */
  traeger?: number;
  traegerIds?: string[];
  /** notiz: bis zu 12 Begriffe dieses Knotens. */
  begriffe?: string[];
}

export interface GrafKante {
  id: string;
  quelle: string;
  ziel: string;
  sorte: "echt" | "aehnlich";
  /**
   * Die Messung. `null` und der Grund gehoeren zusammen: wo nichts gemessen ist,
   * steht keine Zahl (A9 §2 — die Erfuellungsgroessen 0.3 und 0.85 sind abgeschafft).
   */
  maess: { wert: number | null; basis: "cosinus" | "jaccard" | "verlinkt"; gemessen: true };
  /** 0..1 — Hinweis ans Zeichnen und an die Feder, ausdruecklich keine Messgroesse. */
  feder: number;
  /** Zahl der Notizen/Links, die diese Kante tragen. */
  belege: number;
  erklaerung: { gemeinsame: string[]; art: "tag" | "titel" | "vektor" };
  validFrom: number | null;
  validTo: number | null;
}

export interface GrafAntwort {
  vertrag: string;
  sicht: GrafSicht;
  /** Die ganze Wahrheit, auch ueber das, was nicht im Bild steht. */
  bestand: { notizen: number; knoten: number; kanten: number };
  kuerzung: GrafKuerzung;
  welt: GrafWelt;
  stempel: GrafStempel;
  knoten: GrafKnoten[];
  kanten: GrafKante[];
}

/** Das Kuvert ohne Inhalt — damit beide Sichten nachweisbar dieselbe Form haben. */
export function leeresKuvert(sicht: GrafSicht): GrafAntwort {
  return {
    vertrag: GRAF_VERTRAG,
    sicht,
    bestand: { notizen: 0, knoten: 0, kanten: 0 },
    kuerzung: {
      kappe: { knoten: KAPPE.knoten, kanten: KAPPE.kanten, paarPruefungen: KAPPE.paarPruefungen },
      uebrig: { knoten: 0, kanten: 0, paare: 0, begriffe: 0 },
      grund: [],
      gefiltert: { privat: 0, papierkorb: 0 },
      verwaiste: { knoten: 0, kanten: 0 },
      vollstaendig: true,
    },
    welt: { einheit: "welt", groesse: WELT_GROESSE, herkunft: "kraft" },
    stempel: { generation: 0, layoutVersion: LAYOUT_VERSION, parameterHash: "", berechent: "neu" },
    knoten: [],
    kanten: [],
  };
}
