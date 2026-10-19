import { useEffect, useRef, useState, useMemo, useCallback, type ReactNode } from "react";
import { Memory } from "../types";
import { existsAt, graphTimeRange, activeIdsAt, edgeVisibleAt, istStruktur, fensterOffen, type Gueltigkeit } from "../lib/graphTime";
// Atom2 / Sitemap / Scatter / Network sind hier weg: die Ansichts-Schiene trägt
// jetzt Worte statt Bilder, und der Aehnlichkeits-Schalter seinen Punkt (Z-07).
import { Search, Maximize2, ZoomIn, ZoomOut, Clock, ChevronRight, SlidersHorizontal } from "../lib/icons";
import {
  kantenBaue,
  createSimulation,
  entitaetsNetz,
  reuseSimulation,
  isSettled,
  stepSimulation,
  layoutBounds,
  randFuerAnsicht,
  fitTransform,
  toWorld,
  zoomAt,
  nodeAt,
  kanteBei,
  merkUrsprung,
  loeseKnoten,
  setzeKrafte,
  setzeKnotenGroesse,
  nurEchteKanten,
  punktwolke,
  EDGE_LOD_ZOOM,
  linienBudget,
  kantZaehlung,
  richtungsBand,
  kantenEtikett,
  selbstSchleife,
  notizEtikett,
  GANG_SPALTEN,
  GANG_ABSTAND,
  gangKuerzungZeichen,
  titelEtatAusLeinwand,
  GANG_PROBE_PAAR,
  GANG_PROBE_AUSLASSUNG,
  gangZeilen,
  gangSeiten,
  gangPlaetzeProSeite,
  gangGreift,
  GANG_REIHEN_PRO_SEITE,
  alleinKnoten,
  verborgeneNotizen,
  type NotizEtikett,
  kantenMitte,
  beulenLenke,
  dickeBand,
  ENTITAETS_PRAEFIX,
  KANTEN_GREIF_PX,
  knotenRadius,
  dichtesteWeltMitte,
  type LayoutEdge,
  type LayoutNode,
  type Simulation,
  type Transform,
} from "../lib/graphLayout";
import { t as uiT } from "../lib/uiText";
import { bestandGroesse } from "../lib/store";
import {
  buildHierarchy,
  entitiesByMemory,
  layoutDendrogram,
  vorschlagFaltung,
  zeilenKMin,
  BLATT_ABSTAND,
  stepDendrogram,
  TYP_BESCHREIBUNG,
  baueRegal,
  type HierarchieKnoten,
  type StrukturKnoten,
} from "../lib/graphHierarchy";
import { GraphRegal } from "./GraphRegal";
import { layoutSemantik, SEMANTIK_KAPPE, type SemantikKarte } from "../lib/graphSemantik";
import { schemaInventar, SCHEMA_SCHLUESSEL, type SchemaKante } from "../lib/graphSchema";
import { HERKUNFT, herkunftsBild, HERKUNFT_TOKEN, HERKUNFT_LABELS } from "../lib/graphHerkunft";

export type GraphAnsicht = "force" | "dendrogram" | "semantic";
const ANSICHT_KEY = "kepta_graph_view";
/** Richtung ist von Haus aus an — sie ist die Aussage, nicht ein Schmuck. */
const RICHTUNG_KEY = "kepta_graph_richtung";
/**
 * Welcher Kanal die Knoten färbt. Art ist der Standard — sie ist die Frage,
 * die die Fläche zuerst beantwortet. Die Herkunft kommt dazu, wenn sie etwas zu
 * unterscheiden hat.
 */
type FarbKanal = "typ" | "herkunft";
const FARB_KANAL_KEY = "kepta_graph_farbkanal";
/**
 * Die Stellung der vier Regler unter „Forces" (P-13). 1 ist der Stand der
 * gestimmten Konstanten: wer nichts verstellt, bekommt exakt das Bild von vor
 * dem Regler — und es wird nichts in den Speicher geschrieben.
 *
 * Die Felder heißen wie in SimKrafte, damit das, was sich die Fläche merkt,
 * genau das enthält, was das Feld liest.
 */
type KrafteStellung = { gravitaet: number; abstossung: number; link: number; groesse: number };
const KRAFTE_KEY = "kepta_graph_krafte";
const KRAFTE_STAND: KrafteStellung = { gravitaet: 1, abstossung: 1, link: 1, groesse: 1 };
/** Was ein Regler darf: eine Zahl über null, sonst fällt er auf den Stand zurück. */
function kraftWert(roh: unknown, sonst: number): number {
  const wert = Number(roh);
  return Number.isFinite(wert) && wert > 0 ? wert : sonst;
}
function liesKrafte(): KrafteStellung {
  try {
    const roh = JSON.parse(localStorage.getItem(KRAFTE_KEY) ?? "null");
    if (!roh || typeof roh !== "object") return { ...KRAFTE_STAND };
    return {
      gravitaet: kraftWert(roh.gravitaet, 1),
      abstossung: kraftWert(roh.abstossung, 1),
      link: kraftWert(roh.link, 1),
      groesse: kraftWert(roh.groesse, 1),
    };
  } catch {
    return { ...KRAFTE_STAND };
  }
}
/**
 * Die vier Regler und ihre Bereiche. 1 ist bei allen der gestimmte Stand; die
 * Bereiche enden dort, wo das Bild kippt — weiter zu fahren zeigt eine Welt,
 * die niemand lesen kann, und ein Regler bis dorthin wäre eine Falle.
 */
const REGLER: readonly { feld: keyof KrafteStellung; name: string; min: number; max: number; hinweis: string }[] = [
  { feld: "gravitaet", name: "Center force", min: 0.2, max: 3, hinweis: "How hard the middle gathers the picture." },
  { feld: "abstossung", name: "Repel strength", min: 0.3, max: 4, hinweis: "How hard unrelated notes push apart — the space between topics." },
  { feld: "link", name: "Link distance", min: 0.5, max: 2.5, hinweis: "How long a link rests — the gap inside a topic." },
  { feld: "groesse", name: "Node size", min: 0.6, max: 2, hinweis: "How big every node is drawn. The field spaces them by this size." },
];
function merkeKrafte(k: KrafteStellung): void {
  try {
    const unverstellt = (["gravitaet", "abstossung", "link", "groesse"] as const).every((f) => k[f] === 1);
    if (unverstellt) localStorage.removeItem(KRAFTE_KEY);
    else localStorage.setItem(KRAFTE_KEY, JSON.stringify(k));
  } catch { /* Speicher ist eine Erinnerung, keine Bedingung */ }
}
/**
 * Was die Legende unten über das Bild legt. Gemessen wird sie am echten Kasten
 * (`graph-legende`); dieser Wert rechnet, bevor das erste Maß da ist — jsdom und
 * der allererste Rahmen kennen keine Höhe. 96 sind die Höhe des Kastens bei
 * 1440 px Breite, gemessen am 400-Notizen-Bestand (8.10.).
 */
export const LEGENDE_HOEHE = 96;
/**
 * Was ein Zeile im Baum auf dem Schirm mindestens braucht, damit ihr Titel zu
 * lesen ist. 14 px sind der Etikettschrift (11 px) plus ihr Atemzug.
 */
const ZEILEN_LESEBAR = 14;
/**
 * Ab diesem Zoom wird aus der Behauptung ein Keil. Darunter wäre die schmale
 * Spitze weniger als ein Pixel — dann bleibt die Linie, was sie ist.
 */
const KEIL_AB_ZOOM = 0.5;
/**
 * Wie viel Beschriftung die Flaeche zeigt — eine **Dichtestufe**, nicht drei
 * Knöpfe für Textmenge. Z-12 verlangt eine Entscheidung, die man treffen kann;
 * die Stufen stehen bei `NAMEN_STUFE`, und ihr Etat kommt aus der Leinwand
 * (`titelEtatAusLeinwand`), nicht aus einer Zahl im Quelltext.
 */
const ETIKETT_KEY = "kepta_graph_labels";
type EtikettModus = "keine" | "wenig" | "mehr" | "alle";
/**
 * Selbstbehauptungen als Schlinge. Standard: aus — bei den Vorbildern am Markt
 * ebenso, und mit gutem Grund: ein Ring um einen einzigen Knoten ist das
 * leichteste Missverständnis im Bild. Aus heißt hier nicht wegwerfen — die
 * Bilanzzeile nennt, was dem Bild fehlt.
 */
const SELBST_KEY = "kepta_graph_selbstkaanten";
/**
 * Ab diesem Zoom steht der Typ der Aussage an der Linie. Darunter wäre das
 * Etikett kleiner als ein Leser — weit herausgezoomt will man die Form des
 * Netzes sehen, nicht tausend Worte darüber.
 */
const KANTEN_ETIKETT_AB_ZOOM = 0.9;
/** So viele Kanten-Etiketten gleichzeitig. Die Knotentitel haben Vorrang. */
const MAX_KANTEN_ETIKETTEN = 40;
/**
 * Linienbreite je Kantenart in Bildpunkten, indexiert nach dem Evidenzband.
 *
 * Eine Erwaehnung hat immer genau einen Beleg (die Notiz, die den Begriff
 * nennt) und bleibt deshalb in einer Stufe — die Rangfolge Erwähnung feiner als
 * Behauptung ist keine Geschmacksfrage, sondern die Aussage selbst.
 */
const BREITE_PX: Record<string, readonly number[]> = {
  vermutung: [0.8, 1.05, 1.35],
  erwaehnung: [1],
  abgelaufen: [1.7, 2.4, 3.2],
  behauptung: [1.7, 2.4, 3.2],
};
/** Ab dieser Knotengroesse auf dem Schirm traegt ein Badge eine Zahl. */
const BADGE_AB_PX = 9;
/** Keilbreite je Band: [am Ausgang, am Ziel], in Bildpunkten. */
const KEIL_PX: readonly (readonly [number, number])[] = [[2.4, 0.8], [3.3, 1.05], [4.2, 1.3]];

/**
 * Die Glieder der Leiste, in der Rangfolge, die sie beim Abbauen verlaesst.
 *
 * D1-01 hat gemessen, was diese Flaeche im Standardfenster verliert: die Zeile
 * ist 1 132 px breit und traegt 1 680 px Inhalt — der Zeitregler (+333 px), das
 * Datumsfeld (+191 px) und die drei Zoom-Knoepfe (+433 bis +509 px) lagen bei
 * 1 440 px **ausserhalb des Fensters**, seitlich erreichbar, aber ohne jede
 * Spur davon. Die Flaeche zeigt ein Gedaechtnis, das man durch die Zeit
 * blaettern kann, und das Blatt, das sagt, wo man steht, war weg.
 *
 * Die A7-07-Reparatur hielt die Zeile in einer Reihe und schob den Rest
 * seitlich — richtig gegen das Umbruchen, ohne die Prioritaetsregel. Die steht
 * hier jetzt, und ihre Ordnung ist nicht die Reihenfolge der Knöpfe, sondern
 * die Reihenfolge der Fragen, die die Flaeche beantwortet:
 *
 *   1 wo stehe ich (Zoom) · 2 wann (Zeitstand) · 3 welches Bild (Ansicht)
 *   4 wie viel ist benannt (Namen) · 5 finden · 6 den Zeitraum fassen
 *
 * Was unter die Zeile faellt, ist kein Rollner mehr, sondern ein Knopf mit
 * einer Zahl: „More (8)" sagt, wie viele Geraete nicht in der Zeile stehen,
 * und oeffnet sie vollstaendig — samt der Erklaerung, die vorher nur im
 * Schwebetext stand (A8-08).
 */
export type Leistenglied =
  | "zoom"
  | "zeitstand"
  | "ansicht"
  | "namen"
  | "suche"
  | "zeitregler"
  | "richtung"
  | "datum"
  | "aehnlichkeit"
  | "schema"
  | "krafte"
  | "selbst"
  | "kanal"
  | "farben";

/**
 * Was ein Glied braucht, in Bildpunkten. Gemessen am vorher-Stand (400 Notizen,
 * 1 440 px, `e2-rohdaten/e2-400-leiste.json`): Zoom-Knoepfe 3×34 + Readout,
 * Ansicht 74+67+94, Namen drei Worte, Regler 132, Datum 128. Die Zahlen sind
 * Ansetze, kein Massband — nachgemessen wird im echten Browser, und weicht das
 * Bild ab, wird dieser Ansetz berichtigt, nicht die Regel.
 */
export const BREITE_PX_GELIED: Record<Leistenglied, number> = {
  // Nachgemessen am nachher-Stand (10.10., 60 Notizen, 1 440 px, alle Glieder
  // in der Zeile — `e2-rohdaten/e2-60-leiste.json`): Ansichtsschiene 186,
  // Dichteschiene 201, Richtung 99, Aehnlichkeit 67, Selbst 51, Schema 73,
  // Kraefte 86, Kanalschiene 145, Farbwaehler 94, Zoom 3×34 mit der Zahl.
  // Dazu je acht Bildpixel Atemzug.
  // Die Zoomzahl ist `hidden md:inline-block` — unter der md-Grenze ist das
  // Glied drei Knoepfe, nicht vier. 138 traegt beide Faelle.
  zoom: 138,
  // Die Zeitangabe fuer sich: „Now" oder „14 Oct 2026". Der Today-Knopf hangt
  // an demselben Glied und kostet nur, wenn er da ist.
  zeitstand: 92,
  ansicht: 194,
  namen: 209,
  suche: 158,
  zeitregler: 150,
  richtung: 107,
  datum: 140,
  aehnlichkeit: 75,
  schema: 82,
  krafte: 95,
  selbst: 60,
  kanal: 154,
  farben: 102,
};
/** Der „More"-Knopf mit seiner Zahl („More (10)" sind 94 px), dazu die Luecke. */
export const MENUE_PX = 98;
/** Der Atemzug zwischen den Gliedern (`gap-2`). */
export const LUECKE_PX = 8;
/** Der Rand der Zeile selbst (`px-2`): daran ist kein Geraet. */
export const LEISTE_POLSTER = 16;

/**
 * Der Plan fuer die Zeile: welche Glieder stehen drin, welche hinter dem Menue.
 *
 * Regel: alles in der Zeile, wenn die Zeile alles tragt. Sonst wird von hinten
 * (ranghoher = bleibt laenger) abgebaut, bis der Menue-Knopf mit Platz in die
 * verbleibende Breite passt. Die Funktion ist absichtlich rein — sie haelt die
 * Rangfolge als Pruefstand, ohne dass dafuer ein Browser noetig waere.
 */
export function leistePlan(
  breite: number,
  glieder: readonly Leistenglied[] = RANG_FOLGE
): { zeile: Leistenglied[]; menue: Leistenglied[] } {
  const summe = (g: readonly Leistenglied[]) =>
    g.reduce((s, k) => s + BREITE_PX_GELIED[k], 0) + Math.max(0, g.length - 1) * LUECKE_PX;
  if (breite <= 0 || summe(glieder) <= breite) return { zeile: [...glieder], menue: [] };
  const zeile: Leistenglied[] = [...glieder];
  while (zeile.length > 0 && summe(zeile) + LUECKE_PX + MENUE_PX > breite) zeile.pop();
  const menue = glieder.filter((g) => !zeile.includes(g));
  return { zeile, menue };
}
/** Die Zeitgliede gibt es nur, wenn die Basis ueberhaupt einen Zeitstand hat. */
const ZEIT_GLIED: readonly Leistenglied[] = ["zeitstand", "datum", "zeitregler"];
/** Rangfolge von „bleibt am laengsten" (Zoom) bis „geht zuerst" (Farbwaehler). */
export const RANG_FOLGE: readonly Leistenglied[] = [
  "zoom",
  "zeitstand",
  "ansicht",
  "namen",
  "suche",
  "zeitregler",
  "richtung",
  "datum",
  "aehnlichkeit",
  "schema",
  "krafte",
  "selbst",
  "kanal",
  "farben",
];

/**
 * Das Kleid der Mengen auf dieser Fläche (#101). Die Bilanz schrieb „345 of
 * 21,066 notes carry a concept", ihr eigener Kopf direkt darüber „21066 notes" —
 * dieselbe Größe, ein Zeilenabstand, zwei Schreibweisen. Eine Zahl pro Fläche.
 * Das Beispiel ist der Stand vor #16: die Klaue nennt jetzt ein Paar aus
 * derselben Menge, aber das Kleid gilt für beide Zahlen weiter.
 */
function mengenzahl(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * Der Titel-Etat als ein Satz (#5, offene Liste 15.10.).
 *
 * Auf „21 of 400 notes in this picture carry a title" folgt die Frage, die jeder
 * Mensch direkt danach stellt: wie viele haben KEINEN Namen, und warum. Die
 * Antwort ist eine Rechnung, die restlos aufgeht — jeder Knoten, den das Bild
 * traegt, faellt in genau einen Grund. Darum wird hier nichts geschaetzt: die
 * Zahlen bringt der Mal-Pass mit, und wer eine Grundklasse anlegt, muss sie in
 * dieselbe Kette haengen, sonst weist der Satz einen Rest aus, den niemand
 * gesetzt hat.
 *
 * Der Umfang ist das Bild, nicht der Bestand dahinter. Gemessen an seinem echten
 * Fenster (15.10., 21 066 Notizen): mit dem Bestand als Nenner war der erste
 * Grund „20 337 not on this screen" — zu 96 % eine Fensteraussage, und die
 * trifft die Zeile ueber dem Rahmen schon. Was einen Namen im Bild nicht
 * bekommt, soll keinen Grund ausserhalb des Bildes haben.
 *
 * Schwaigt der Grundsteil, ist das keine Luecke: ein Modus, der keine Namen
 * will, versaeumt nichts, und ein Bild, das alle benennt, hat nichts zu erklaeren.
 */
export function titelEtat(
  benannt: number,
  umfang: number,
  gruende: readonly (readonly [number, string])[]
): string {
  if (benannt >= umfang) return "";
  const grundZeilen = gruende.filter(([n]) => n > 0).map(([n, w]) => `${mengenzahl(n)} ${w}`);
  const ohneeNamen = umfang - benannt;
  const grund = grundZeilen.length
    ? ` · ${mengenzahl(ohneeNamen)} stayed nameless: ${grundZeilen.join(", ")}`
    : "";
  return `${mengenzahl(benannt)} of ${mengenzahl(umfang)} notes in this picture carry a title${grund}`;
}

interface KnowledgeGraphProps {
  memories: Memory[];
  onSelectMemory: (m: Memory) => void;
  /**
   * Ein Klick auf ein Konzept. Ein begriff ist kein blatt, das man
   * aufblättert — er ist eine person, eine firma, ein thema, und was man
   * darüber weiß, steht im dossier. deshalb hier, und nicht ein weiterer
   * knopf in einer leiste.
   */
  onSelectConcept?: (name: string) => void;
  /**
   * Wie viele Notizen das FELD trägt — dieselbe Zahl, die die Bilanz über der
   * Legende nennt (#101). Der Kopf der Graph-Zeile sitzt im Dashboard und las
   * bisher die Länge der Liste, die das Fenster zufällig trägt: „100 of 21,066
   * in the store", während unten „21066 notes" stand. Die Fläche ist die einzige,
   * die den Ganzbestand holt — also meldet sie ihn nach oben, statt dass der
   * Kopf rät.
   */
  onFeldZaehlung?: (knoten: number) => void;
}

interface GraphApi {
  relations: {
    source: string;
    target: string;
    relation: string;
    memoryId: string | null;
    /**
     * Wie lange die Aussage gilt. Der Kern liefert die Felder seit 343cb04
     * ausdrücklich auch dann, wenn sie null sind — „unbefristet" und „diese
     * Serverversion kennt das Feld nicht" dürfen nicht dasselbe sein.
     */
    validFrom?: number | null;
    validTo?: number | null;
  }[];
  memoriesByEntity: Record<string, string[]>;
  /**
   * Was die Wissensbasis traegt, nicht nur was durch die Kappen des Subgraphen
   * durchgekommen ist. Fehlend bei einer Serverversion, die das nicht kennt —
   * dann sagt die Flaeche nichts ueber den Rest, statt zu raten.
   */
  bestand?: { knoten: number; kanten: number };
  /**
   * Wie viele der aktiven Notizen an wenigstens einem Begriff haengen — am
   * ganzen Bestand gemessen, nicht im Auszug. Seit 3.2.13 von der Tuer gerechnet
   * (`server/router/system.ts`, im selben Handler wie `/api/graph`). Fehlend bei
   * einer aelteren Tuer; dann darf die Flaeche keinen Bestand behaupten, weil ihr
   * eigener Zaehler nur das Fenster kennt.
   */
  deckung?: { notizen: number; gedeckt: number; anteilProzent: number } | null;
}

/**
 * Was der Zeiger auf einer Kante erfahrt. Die Felder sind bereits gelesen und
 * benannt — die Karte zeigt keine Interna, sondern wer ueber wen was sagt, wie
 * oft, und wie lange.
 */
interface KantenInfo {
  quelle: string;
  ziel: string;
  /** "claim" | "mention" | "similar" | "hierarchy" — dieselbe Vierheit wie das Bild. */
  art: "claim" | "mention" | "similar" | "hierarchy";
  relation: string | null;
  typen: number;
  belege: number;
  staerke: number;
  validFrom: number | null;
  validTo: number | null;
  /**
   * Lage der Karte auf der Leinwand, im Moment des Greifens.
   *
   * Der erste Rahmen nach dem Hover laeuft, bevor React die Karte ins DOM
   * gebaut hat — eine Lage, die nur dort gesetzt wird, bleibt fuer immer
   * außerhalb. Der Zeichencode schiebt sie danach weiter, weil die Linie sich
   * mitbewegt.
   */
  x: number;
  y: number;
}

/**
 * Wo die Kantkarte sitzt: unter der Mitte der Linie, innerhalb der Leinwand.
 *
 * Eine Karte, die halb aus dem Bild laeuft, ist halb lesbar — also wird an den
 * Rand gequetscht, statt zu zeigen, was nicht passt.
 */
/**
 * Der Punkt, an dem die Karte einer Kante sitzt. Eine Selbstbehauptung hat
 * keine Mitte — ihr Anker liegt außen an der Schlinge, damit die Karte nicht
 * auf dem Knoten steht und wie eine Knotenkarte aussieht.
 */
function kartenAnker(a: LayoutNode, b: LayoutNode, gerade: boolean): { x: number; y: number } {
  if (a === b) {
    const s = selbstSchleife(a.x, a.y, a.r);
    return { x: s.cx + s.rad * 0.72, y: s.cy - s.rad * 0.72 };
  }
  return kantenMitte(a, b, gerade ? 0 : beulenLenke(Math.hypot(b.x - a.x, b.y - a.y) || 1));
}

function kartenLage(
  x: number,
  y: number,
  masse: { w: number; h: number },
  el?: { offsetWidth: number; offsetHeight: number } | null
): { x: number; y: number } {
  const halbe = (el?.offsetWidth || 200) / 2;
  const hoch = el?.offsetHeight || 70;
  return {
    x: Math.min(Math.max(x, halbe + 8), Math.max(halbe + 8, masse.w - halbe - 8)),
    y: Math.min(y + 10, Math.max(20, masse.h - hoch - 8)),
  };
}

/**
 * Ob eine Kante gerade gemalt wird. Der Baum kennt nur Geraden — ausser die
 * Richtung ist an, dann wird auch die Hierarchie zum Keil auf einem Bogen.
 * Griff und Strich muessen derselben Kurve folgen.
 */
function kanteIstGerade(e: LayoutEdge, baum: boolean, keilAn: boolean): boolean {
  return baum ? !keilAn : !e.real;
}

/**
 * Die beiden Zeilen der Kantkarte — rein, damit sie pruefbar ist.
 *
 * "3 claims" ist die Evidenz, nicht die Linie: hinter einem Strich koennen drei
 * Notizen stehen, die dasselbe behaupten. "ended" statt "until", sobald die
 * Frist gelaufen ist — eine Karte, die "bis Februar 2024" verspricht, waehrend
 * laengst Juni 2026 ist, sagt etwas Falsches.
 */
export function kantenZeilen(i: KantenInfo): { grund: string; frist: string | null } {
  const grund =
    i.art === "claim"
      ? `${i.relation ?? uiT("legend.claim")}${i.typen > 1 ? ` +${i.typen - 1}` : ""} · ${i.belege} ${
          i.belege === 1 ? "claim" : "claims"
        }`
      : i.art === "mention"
        ? uiT("legend.mention")
        : i.art === "similar"
          ? `${uiT("edge.similar")} ${Math.round(Math.max(0, Math.min(1, i.staerke)) * 100)} %`
          : uiT("legend.hierarchy");

  const tag = (ms: number) =>
    new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  let frist: string | null = null;
  if (i.validTo != null && i.validTo > 0) {
    frist = `${i.validTo < Date.now() ? "ended" : "until"} ${tag(i.validTo)}`;
  } else if (i.validFrom != null && i.validFrom > 0) {
    frist = `since ${tag(i.validFrom)}`;
  }
  return { grund, frist };
}

/**
 * Die Palette der Fläche steht in `src/index.css`, hier nur ihr Name. Zwei
 * Kanäle, eine Farbe: `--type-*` (oklch) für jeden CSS-Verbraucher — Karten-
 * Grat, Index-Zahlen, Legendenpunkt — und `--type-*-hex` (derselbe Wert in
 * sRGB) für die zwei Stellen, die kein oklch sprechen: die Leinwand
 * (`canvas.fillStyle`) und der Farbregler (`<input type="color">` verlangt
 * zwingend `#rrggbb`). Beide schreibt `scripts/design-wache.mjs --setzen`;
 * die Wache misst die Kanäle gegeneinander, damit keiner abdriftet.
 *
 * Vorher standen die Werte als Hex-Literal in dieser Datei und ein Kommentar
 * behauptete „alle ≥ 4,65", während das Bild 3,91 zeigte (B1, 10.10.).
 */
const TYP_FOLGE = ["semantic", "episodic", "procedural", "reference"] as const;
const TYP_TOKEN: Record<string, string> = {
  semantic: "--type-semantic",
  episodic: "--type-episodic",
  procedural: "--type-procedural",
  reference: "--type-reference",
  neutral: "--type-neutral",
};
const ROLLEN_TOKEN: Record<string, string> = { ...TYP_TOKEN, ...HERKUNFT_TOKEN };

/** Eine eigene Farbwahl überschreibt beide Kanäle desselben Tokens — sonst
 *  malt die Leinwand die Wahl und das Blatt den Registerton. */
function setTypVar(rolle: string, wert: string) {
  document.documentElement.style.setProperty(`--type-${rolle}`, wert);
  document.documentElement.style.setProperty(`--type-${rolle}-hex`, wert);
}

/**
 * Eine eigene Farbwahl schreibt in ein Token, das im selben Moment als SCHRIFT
 * gelesen wird: Index-Zahlen, Karten-Grat, Legenden-Wort (der Kommentar oben,
 * Zeile 1183, nennt das „app-weit"). Ein `#rrggbb` aus dem Regler kann deshalb
 * die Leiter ausstechen, und ein Wert, den eine alte Fassung gespeichert hat,
 * tut es ohne dass jemand wählt. Gemessen 18.10. am echten Bestand (21 066):
 * die gespeicherten Töne #cc00bb, #00ff55, #007bff, #ffffff malten die
 * Index-Zahlen mit 3,12:1 (Pixel, auf dem Panel #252526) und die Legende als
 * reines Weiß — die Leiter verlangt 4,65 gegen das härteste Papier.
 *
 * `tintetauglich` lässt eine Wahl nur gelten, wenn sie als Schrift auf beiden
 * Papieren des dunklen Themas 4,5:1 hält; sonst bleibt der Registerton stehen.
 */
function tintetauglich(wert: string): boolean {
  const m = /^#?([0-9a-fA-F]{6})$/.exec((wert || "").trim());
  if (!m) return false;
  const zahl = parseInt(m[1], 16);
  const k = (n: number) => { const s = n / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const tinte = 0.2126 * k((zahl >> 16) & 255) + 0.7152 * k((zahl >> 8) & 255) + 0.0722 * k(zahl & 255);
  const papiere = [0.00213, 0.0396]; /* #070708 Tisch, #38383a Blatt */
  return papiere.every((grund) => (Math.max(tinte, grund) + 0.05) / (Math.min(tinte, grund) + 0.05) >= 4.5);
}

function leseRollenHexe(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const stil = getComputedStyle(document.documentElement);
  const out: Record<string, string> = {};
  for (const [rolle, token] of Object.entries(ROLLEN_TOKEN)) {
    const wert = stil.getPropertyValue(`${token}-hex`).trim();
    if (/^#[0-9a-f]{6}$/i.test(wert)) out[rolle] = wert;
  }
  return out;
}

/**
 * Die Farben wechseln mit dem Theme, und der Theme-Effekt eines Vorfahren läuft
 * NACH dem der Kinder: ein Render allein sähe beim Umschalten noch die alte
 * Klasse. Beobachtet wird deshalb die Wurzel selbst.
 */
function useRollenHexe(): Record<string, string> {
  const [hexe, setHexe] = useState<Record<string, string>>(leseRollenHexe);
  useEffect(() => {
    const beob = new MutationObserver(() => setHexe(leseRollenHexe()));
    beob.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    setHexe(leseRollenHexe());
    return () => beob.disconnect();
  }, []);
  return hexe;
}

/**
 * Die drei Dichtestufen und ihre Flucht: `kuerzung` in Zeichen, `raster` = weicht
 * ein Titel dem bereits gemalten aus, `kantentext` = der Typ steht an der Linie.
 *
 * Was eine Stufe verspricht, ist eine Zahl im Bild, kein Gefühl: der Anteil
 * benannter Notizen. Der Hebel ist die Kuerzungslaenge — F8 hat ihn benannt und
 * nicht gezogen, „weil ueber die Kuerzungslaenge der Flaeche jemand entscheiden
 * muss, der die Persona im Kopf hat". Entscheidung GF, 10.10.: 14 Zeichen, weil
 * ein Titel von 26 Zeichen 143 Bildpixel belegt und einer von 14 die Haelfte —
 * dieselbe Schrift, derselbe Grund, doppelt so viele Namen. Der volle Name
 * bleibt, wo die Flaeche ihn schon jetzt zeigt: unter Zeiger und Tastatur.
 * Und weil „mehr Namen" den Platz fuer die Meta braucht, tritt in dieser Stufe
 * der Typ an der Linie zurueck — Meta faellt weg, Inhalt bleibt (Z-12).
 *
 * Wie viele Namen eine Stufe *zeigen darf*, steht hier nicht mehr: das rechnet
 * `titelEtatAusLeinwand` aus dem Fenster und der Breite, die die Stufe selbst
 * baut (#29). Ein Etat aus dem Bestand war eine Zahl, die niemand gemessen hat.
 */
const NAMEN_STUFE: Record<
  EtikettModus,
  {
    wort: string;
    kuerzung: number;
    /** Ob die Stufe „ueberhaupt alles" meint — nur dann gilt kein Etat. */
    grenzenlos: boolean;
    raster: boolean;
    kantentext: boolean;
    /** Wieweit die Pforte der Kandidaten offen steht, in Einheiten von `mindestRadius`. */
    pforte: number;
    erklaerung: string;
  }
> = {
  keine: {
    // Die enge Pforte: nur Knoten ab 1,5 Bildpunkten kommen als Name in Frage.
    pforte: 1,
    wort: "None",
    kuerzung: 0,
    grenzenlos: false,
    raster: true,
    kantentext: false,
    erklaerung: "No labels — hover or arrow-key to a node and its full title comes back",
  },
  wenig: {
    // Die enge Pforte: nur Knoten ab 1,5 Bildpunkten kommen als Name in Frage.
    pforte: 1,
    wort: "Few",
    kuerzung: 26,
    grenzenlos: false,
    raster: true,
    kantentext: true,
    erklaerung: "Few names, whole ones — the busiest nodes first, as many as fit without overlap",
  },
  mehr: {
    // „More" ist hier nicht moeglich: der Ueberlauf-Knopf der Zeile heisst
    // schon More (N) und sagt etwas anderes — ein Wort, eine Bedeutung (Z-07).
    wort: "Many",
    // Die halbierte Pforte: was im Feld unter 1,5 Bildpunkten fällt, ist als
    // Name trotzdem lesbar, weil der Titel selbst in festen Bildpixeln steht.
    pforte: 0.5,
    kuerzung: 14,
    grenzenlos: false,
    raster: true,
    kantentext: false,
    erklaerung: "More names, shorter ones — titles are cut so more fit, and the kind steps back from the links",
  },
  alle: {
    // Die enge Pforte: nur Knoten ab 1,5 Bildpunkten kommen als Name in Frage.
    pforte: 1,
    wort: "All",
    kuerzung: 26,
    grenzenlos: true,
    raster: false,
    kantentext: true,
    erklaerung: "Every node named, however crowded. A choice, not a starting point.",
  },
};
/** Die Stufen, in der Reihenfolge der Dichte — nicht nach Alphabet. */
const STUFEN_FOLGE: readonly EtikettModus[] = ["keine", "wenig", "mehr", "alle"];
/** Was der Merker von vor der Dichtestufe heisst. */
const NAMEN_ALT: Record<string, EtikettModus> = { key: "wenig", all: "alle", off: "keine" };
function leseNamenStufe(roh: string | null): EtikettModus {
  if (!roh) return "wenig";
  if (roh in NAMEN_ALT) return NAMEN_ALT[roh];
  return roh === "keine" || roh === "wenig" || roh === "mehr" || roh === "alle" ? roh : "wenig";
}
/**
 * Die Groesse eines Titels AUF DEM SCHIRM, in Bildpixeln — nicht in
 * Welteinheiten.
 *
 * Vorher wurde die Schrift mit `11 / k` gegen den Zoom skaliert und bei 15
 * Welt-Pixeln zugedeckelt: ab 73 % Zoom waren es 11 px, darunter fiel sie mit
 * dem Fit. Gemessen bei 1 500 Notizen (12 % Zoom): 1,4 px. Eine Flaeche, deren
 * Titel man erst beim Heranzoomen lesen kann, benennt nichts.
 *
 * Die Leiter der Flaeche hat eine unterste Stufe: E1s `--fs-1` = 11 px
 * (index.css:147, "acht Stufen, ganzzahlig, keine unter 11 px"). Was kleiner
 * gemalt wurde — 9,4 / 9,0 / 8,6 px — war eine Zwischenstufe, die niemand
 * gesetzt hat. E1s Satz gilt deshalb auch im Gemaelde: wer kleiner will,
 * waehlt die Stufe, und die Stufe heisst 11.
 *
 * Zuruecktreten leisten Gewicht und Farbe (--text-2, --text-3), nicht die
 * Groesse. Die Gewichte sind E1s Leiter (index.css:182-184: 400 ruhig,
 * 600 halbfest, 700 fest); das 500 vorher war ein erfundener Wert, und E1s
 * eigene Notiz sagt, warum das zaehlt: zwischen 400 und 600 kollabiert auf
 * Windows alles auf zwei Stufen, und die halbe Hierarchie verschwindet.
 *
 * Messgrundlage: vorher der ganze Text des Bildes, tiefste Stufe 9 px.
 */
const ETIKETT_PX = 11;
/**
 * Wie hoch eine Gang-Reihe auf dem SCHIRM sein muss, damit ein Titel in ihr
 * wohnen kann: zwei Titelzeilen und ihr Atemzug. Die Zahl stand als Faktor im
 * Mal-Pass (`ETIKETT_PX * 2,2`) und ist die Schwelle, an der die Fläche ihre
 * Reihen-Punkte abweist — und genau dieselbe Schwelle sagt der Kamera, wie weit
 * sie herauszoomen darf. Einmal gesetzt, damit die zwei Stellen nicht
 * auseinanderlaufen können.
 */
export const TITEL_REIHE_PX = ETIKETT_PX * 2.2;
/**
 * Der Atemzug, den ein Titel an einer Leinwandkante braucht, in Bildpixeln.
 * Dieselbe Zahl, die die Titelhoehe traegt (`ETIKETT_PX`): ein Wort, das die
 * Kante beruehrt, ist keine Auskunft, sondern eine Haelfte — und die Flaeche
 * weiss selbst nicht, welche Haelfte sie abschneidet.
 */
export const TITEL_KANTEN_PX = ETIKETT_PX;

/**
 * Wie oft die Flaeche den Nachzug fragt, waehrend er laeuft. 600 ms sind bei
 * 500-Notizen-Stapeln (~100 ms je Stapel) acht Fragen je Sekunde — genug fuer
 * eine Zahl, die sich visibly bewegt, und ein Zehntel der Last, die das Bild
 * selbst traegt.
 */
const NACHZUG_FRAGE_MS = 600;
/**
 * Ein Ebenenname im Baum wird nie länger gemalt. Zwischen zwei Ebenen liegen
 * 190 Welteinheiten, ein Zeichen der kleinen Gerüstschrift rund 5 — und ein
 * zentrierter Notiztitel (26 Zeichen) ragt 78 Einheiten in seine Spalte hinein.
 * Länger als 16 Zeichen darf das Gerüst deshalb nicht werden, sonst stehen
 * zwei Namen in einer Zeile.
 */
const GERUEST_ZEICHEN = 16;
const SPRITE_PX = 128;

/**
 * Ist diese Farbe hell? Entscheidet ueber Kantenstaerken auf dem Grund und
 * ueber die Tinte eines Glyphs, der in einer Scheibe steht.
 * Versteht #rgb, #rrggbb und rgb(...) — mehr kommt aus den Theme-Variablen nicht.
 */
/**
 * Die Zeile des Aehnlichkeits-Schalters — mit der Grenze, die das Bild setzt.
 *
 * A7-05, gemessen bei 1 500 Notizen: der Kopf sagte „+7 457 similar", die
 * gemalten Pixel stiegen von 4 377 auf 5 057 (+15 %), weil genau diese Linien
 * von der Bildkappe unterdrueckt werden. Derselbe Schalter antwortete bei 60
 * Notizen sichtbar (8 403 → 15 027 px). Ein Knopf, dessen Zahl sich bewegt und
 * dessen Bild stillsteht, bringt der Flaeche Misstrauen ein — also nennt die
 * Zeile die Kappe, wenn sie greift. Dieselbe Funktion, die der Mal-Pass fuer die
 * Kappe benutzt, schreibt den Text: Zahl und Bild koennen nicht mehr
 * auseinanderlaufen.
 */
export function aehnlichkeitsZeile(aehnlichkeit: number, kantenzahl: number, zoom: number): string {
  if (aehnlichkeit <= 0) return "";
  return nurEchteKanten(kantenzahl, zoom)
    ? ` · +${aehnlichkeit} similar — hidden until ${Math.round(EDGE_LOD_ZOOM * 100)} % zoom`
    : ` · +${aehnlichkeit} similar`;
}

/**
 * Passt die Flaeche ihren Ausschnitt, wenn das Feld zur Ruhe kommt?
 *
 * A7-09, gemessen: 60 Notizen im 1440-px-Fenster — im Rasterlauf 75 % Zoom, im
 * Dichtelauf und in drei frischen Sitzungen 62 %. Derselbe Bestand, zwei
 * Landemaessstaebe, weil der Refit an `if (bewegt)` hing: ein Feld, das beim
 * ersten Bild des Loops schon stand, durchlief den Zweig nie und behielt den
 * Ausschnitt, der fuer seine Ausgangspositionen gerechnet war. Die Zusage haengt
 * am Ruhe-Ereignis, nicht an der Bewegung.
 */
export function refitFaellig(autoFitOffen: boolean, bewegt: boolean, knoten: number): boolean {
  return autoFitOffen && !bewegt && knoten > 0;
}

export function istHell(farbe: string): boolean {
  const s = farbe.trim();
  let r = 0, g = 0, b = 0;
  if (s.startsWith("#")) {
    const h = s.slice(1);
    const voll = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    if (voll.length < 6) return false;
    r = parseInt(voll.slice(0, 2), 16);
    g = parseInt(voll.slice(2, 4), 16);
    b = parseInt(voll.slice(4, 6), 16);
  } else {
    const m = s.match(/(\d+)\D+(\d+)\D+(\d+)/);
    if (!m) return false;
    r = Number(m[1]); g = Number(m[2]); b = Number(m[3]);
  }
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5;
}

/**
 * Der Buchstabe, der in einer grossen Scheibe steht: der Anfang des Wortes,
 * das jemand unter der Flaeche liest (Facts, Events, How-tos, Documents).
 * Abgeleitet statt erfunden — ein Buchstabe, der gegen die Legende laeuft,
 * ist schlimmer als keiner. Eine Art ohne Label bekommt keinen.
 */
export const GLYPH_FUER_ART: Record<string, string> = Object.fromEntries(
  Object.entries(TYP_BESCHREIBUNG).map(([t, label]) => [t, label.replace(/[^A-Za-z]/g, "").slice(0, 1).toUpperCase()])
);
/** Tinte nach der Helligkeit der Fuelle, nie nach dem Theme: der Glyph sitzt IN der Scheibe. */
const GLYPH_TINTE_HELL = "#f2f2ef";
const GLYPH_TINTE_DUNKEL = "#141412";

/**
 * Ein Zeichen mittig in der Scheibe: der Buchstabe einer Art, die Zahl dessen,
 * was ein Begriff traegt.
 *
 * Die Groesse sitzt im Verhaeltnis zum Radius, damit der Glyph beim Zoomen nicht
 * umfaerbt — aber die unterste Schriftstufe gilt AUF DEM SCHIRM, nicht in
 * Welteinheiten. Der Radius kommt in Welteinheiten an, also wird die Stufe hier
 * gegen den Zoom zurueckgerechnet. Das begrenzt die Scheibe von selbst: beide
 * Aufrufer malen erst ab 15 Bildpunkten Radius, und drei Ziffern auf 11 px
 * brauchen 19 Bildpunkte in eine 30er Scheibe.
 */
function zeichneGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  text: string,
  fuellung: string,
  zoom: number
) {
  const hoehe = text.length > 2 ? 0.44 : text.length > 1 ? 0.56 : 0.78;
  const stufe = ETIKETT_PX / Math.max(0.05, zoom);
  ctx.font = `700 ${Math.max(radius * hoehe, stufe)}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = istHell(fuellung) ? GLYPH_TINTE_DUNKEL : GLYPH_TINTE_HELL;
  ctx.fillText(text, x, y);
}

/**
 * Greifweite eines Knotens in BILDSCHIRM-Pixeln.
 *
 * Vorher galt eine Toleranz von 4 WELT-Einheiten. Beim Herauszoomen schrumpfte
 * die damit mit: bei 20 % Zoom war ein Knoten 5 px gross und die Zugabe 0,8 px —
 * wer nicht exakt die Mitte traf, verschob statt des Knotens die ganze Ansicht.
 * Genau das fuehlt sich an wie "man kann sie nicht ziehen".
 */
const GREIF_PX = 12;
/**
 * Ab dieser Groesse auf dem Bildschirm wird ein Knoten als echte Vektorkugel
 * gezeichnet statt als hochskaliertes Sprite. Ein 128er Sprite auf 300 px
 * gezogen ist sichtbar matschig — beim Heranzoomen sah man nichts anderes mehr.
 */
const VEKTOR_AB_PX = 15;
/**
 * Kleinster Radius eines Knotens auf dem Schirm, in Bildpunkten.
 *
 * Bei sehr grossen Wissensbasen steht die Uebersicht auf wenigen Prozent Zoom.
 * Ohne diese Untergrenze wird ein Knoten dort sub-pixelgross und faellt beim
 * Zeichnen praktisch weg — die Wissensbasis ist vollstaendig im Bild und
 * trotzdem nicht zu sehen.
 */
const MIN_KNOTEN_PX = 1.5;
/**
 * Unter dieser Groesse auf dem Schirm wird ein Knoten als schlichtes Quadrat in
 * der Typfarbe gemalt statt als Sprite. Die Bildkopie kostet bei Zehntausenden
 * voll, waehrend Kugelform und Schattierung nichts mehr beitragen.
 *
 * Zuerst stand hier 4 — und das war sichtbar zu hoch: bei mittlerem Zoom fiel
 * eine Themengruppe knapp unter die Schwelle und erschien als Feld aus
 * Quadraten, waehrend die gleich grosse Gruppe daneben aus Kugeln bestand. Das
 * sah nach Fehler aus, nicht nach Detailstufe. Bei 2,5 Bildpunkten ist ein
 * Quadrat von einem Kreis nicht mehr zu unterscheiden, und betroffen sind nur
 * noch die unverbundenen Einzelpunkte. Auf die Kosten bei voller Auslastung
 * wirkt das nicht: dort steht die Uebersicht bei wenigen Prozent Zoom, und
 * jeder Knoten liegt weit unter dieser Schwelle.
 */
const KLEIN_AB_PX = 2.5;
/**
 * Ab dieser Strecke gilt eine Geste als Ziehen und nicht mehr als Klick.
 * Wer einen Knoten nur antippt, will ihn nicht festnageln.
 */
const ZUG_SCHWELLE_PX = 4;
/**
 * Wissensgraph auf Canvas.
 *
 * Die vorige Fassung malte jeden Knoten als SVG-Gruppe aus sechs Elementen und
 * schrieb bei JEDEM Bild den kompletten Positions-State nach React zurueck. Bei
 * 348 Knoten waren das rund 2000 DOM-Knoten, 60-mal pro Sekunde neu abgeglichen
 * — und weil die Simulation jeden Knoten zusaetzlich in das Sichtfenster
 * klemmte, presste sie sich als Gitter an den Rand. Hier laeuft das Layout in
 * einem Ref (kein Render pro Bild) und das Bild auf einer Leinwand; die Welt ist
 * so gross, wie sie sein muss, und der Ausschnitt richtet sich nach ihr.
 */
export function KnowledgeGraph({ memories: memoriesAusFenster, onSelectMemory, onSelectConcept, onFeldZaehlung, sichtbar = true }: KnowledgeGraphProps & { sichtbar?: boolean }) {
  /**
   * Der ganze Bestand, nicht die Seite, die das Fenster traegt.
   *
   * Die Liste im Programm laedt eine Seite (`GET /api/memories`, 100 Notizen) —
   * fuer 21.000 Zeilen ist das richtig, fuer ein Bild, das sein Gedaechtnis
   * zeigen will, die Haelfte der Wahrheit: gemessen 15.10. 17:22 an Damians
   * Bestand, wo der Graph "19 of 21,066" meldete, weil er nur kannte, was die
   * Liste zufaellig getragen hatte. Die Tuer kennt `?alle=1`; der Gang holt sich
   * den ganzen Bestand einmal je Sitzung, die Liste bleibt leicht.
   */
  const [ganzerBestand, setzeGanzenBestand] = useState<Memory[]>([]);
  useEffect(() => {
    let abgebrochen = false;
    void (async () => {
      try {
        const res = await fetch("/api/memories?alle=1");
        if (!res.ok || abgebrochen) return;
        const daten = await res.json();
        const liste = Array.isArray(daten) ? daten : Array.isArray(daten?.memories) ? daten.memories : [];
        if (!abgebrochen && liste.length > 0) setzeGanzenBestand(liste as Memory[]);
      } catch { /* Tuer nicht erreichbar: die Fensterseite traegt das Bild, bis sie antwortet */ }
    })();
    return () => { abgebrochen = true; };
  }, []);
  const memories = ganzerBestand.length > memoriesAusFenster.length ? ganzerBestand : memoriesAusFenster;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [filter, setFilter] = useState("");
  /**
   * Aehnlichkeitskanten sind eine Anfrage, kein Grundzustand. Aufgenommen am
   * 6.10.: 75 Notizen, 891 Kanten — die Masse davon war Tag- und
   * Titel-Aehnlichkeit, und die echten Verknuepfungen waren darin nicht mehr
   * zu finden. Aus ist also nicht "weniger Graph", sondern "der Graph sagt
   * nur, was jemand behauptet hat".
   */
  const [ahnlichkeit, setAhnlichkeit] = useState(false);
  /**
   * Richtung der Behauptungen — breit am Ausgang, schmal am Ziel. Eine
   * Behauptung ohne Richtung ist halb erzählt: „Elena betreut Nordwind" und
   * „Nordwind betreut Elena" sind zwei Wissensstände, und die Fläche wusste
   * bisher nicht, welcher gemeint war.
   */
  const [richtung, setRichtung] = useState<boolean>(() => {
    try { return localStorage.getItem(RICHTUNG_KEY) !== "0"; } catch { return true; }
  });
  /** Welcher Kanal die Knoten färbt. Gemerkt wie die Ansicht; Art ist der Standard. */
  const [kanal, setKanal] = useState<FarbKanal>(() => {
    try { return localStorage.getItem(FARB_KANAL_KEY) === "herkunft" ? "herkunft" : "typ"; } catch { return "typ"; }
  });
  const wechsleKanal = (v: FarbKanal) => {
    setKanal(v);
    try { localStorage.setItem(FARB_KANAL_KEY, v); } catch { /* ignore */ }
  };
  const wechsleRichtung = () => {
    const v = !richtung;
    setRichtung(v);
    try { localStorage.setItem(RICHTUNG_KEY, v ? "1" : "0"); } catch { /* ignore */ }
  };
  /** Wie viel beschriftet wird — „wenig" ist der Anfang, nie „alle". */
  const [etikettenModus, setEtikettenModus] = useState<EtikettModus>(() => {
    try {
      return leseNamenStufe(localStorage.getItem(ETIKETT_KEY));
    } catch { return "wenig"; }
  });
  const setzeEtiketten = (m: EtikettModus) => {
    setEtikettenModus(m);
    try { localStorage.setItem(ETIKETT_KEY, m); } catch { /* ignore */ }
  };
  const [selbstkaanten, setSelbstkaanten] = useState<boolean>(() => {
    try { return localStorage.getItem(SELBST_KEY) === "1"; } catch { return false; }
  });
  const wechsleSelbstkaanten = () => {
    const v = !selbstkaanten;
    setSelbstkaanten(v);
    try { localStorage.setItem(SELBST_KEY, v ? "1" : "0"); } catch { /* ignore */ }
  };
  /**
   * Zugeklappte Gruppen im Baum. Der Baum startet entfaltet — eine Faltung ist
   * eine Handlung, nie ein Anfangszustand. Nicht gemerkt: ein Merken ueber das
   * Neuladen liess Notizen verschwinden, die niemand mehr vermisst.
   */
  const [gefaltet, setGefaltet] = useState<ReadonlySet<string>>(new Set());
  /**
   * Gruppen, die jemand gegen die automatische Faltung ausgedrückt hat. Die
   * Hand des Menschen gewinnt in beide Richtungen: was er öffnet, bleibt offen,
   * bis er es selbst wieder schließt.
   */
  const [entfaltet, setEntfaltet] = useState<ReadonlySet<string>>(new Set());
  const [dimensions, setDimensions] = useState({ w: 800, h: 500 });
  /**
   * Die Gang-Zahl in ein echtes Blatt spiegeln. Was nur auf dem canvas steht, liest niemand:
   * weder eine Vorlesesoftware noch eine Pruefung an seiner Datei, und seit 11:08 auch nicht
   * die eigene Einpass-Rechnung (#90).
   *
   * Der Spiegel haengt an der Handuebergabe des Layouts, nicht am Mal-Pass: `sim.allein` wird
   * erst im ersten Schritt gesetzt, und ein Spiegel, der vom Bildzyklus abhaengt, ist in
   * einem Pruefstand ohne Bildzyklus leer — gemessen 15.10. 11:22, wo der Knoten stand und
   * sein Text '' war. An der Handuebergabe liegt dieselbe Menge, die der Schritt gleich
   * zaehlt: `alleinKnoten`.
   */
  const [gangInfo, setGangInfo] = useState<{ allein: number; zeilen: number; seiten: number; seite: number; gezeigt: number } | null>(null);
  const gangInfoRef = useRef<{ allein: number; zeilen: number; seiten: number; seite: number; gezeigt: number } | null>(null);
  /** Welche Seite des Gangs das Bild gerade legt. Ein Ref, kein Staat: die Zahl im Blatt folgt ihr. */
  const gangSeiteRef = useRef(0);
  const spiegleGang = (sim: Simulation | null) => {
    const alleinZahl = sim ? alleinKnoten(sim.nodes, sim.edges).length : 0;
    const knoten = sim?.nodes.length ?? 0;
    const greift = !!sim && alleinZahl > 0 && gangGreift(alleinZahl, knoten, knoten - alleinZahl > 0);
    const seiten = greift ? gangSeiten(alleinZahl) : 0;
    const seite = seiten > 0 ? Math.min(Math.max(0, gangSeiteRef.current), seiten - 1) : 0;
    const gezeigt = greift ? Math.min(alleinZahl, gangPlaetzeProSeite()) : 0;
    const naechster = alleinZahl > 0 ? { allein: alleinZahl, zeilen: gangZeilen(alleinZahl), seiten, seite, gezeigt } : null;
    const aktuell = gangInfoRef.current;
    if (aktuell?.allein === naechster?.allein
      && aktuell?.zeilen === naechster?.zeilen
      && aktuell?.seiten === naechster?.seiten
      && aktuell?.seite === naechster?.seite
      && aktuell?.gezeigt === naechster?.gezeigt) return;
    gangInfoRef.current = naechster;
    setGangInfo(naechster);
  };
  const blaettereGang = (schritt: number) => {
    const seiten = gangInfoRef.current?.seiten ?? 0;
    if (seiten <= 1) return;
    const naechste = Math.min(Math.max(0, gangSeiteRef.current + schritt), seiten - 1);
    if (naechste === gangSeiteRef.current) return;
    gangSeiteRef.current = naechste;
    const sim = simRef.current;
    if (sim) { sim.gangSeite = naechste; spiegleGang(sim); }
  };
  const legendenRef = useRef<HTMLDivElement>(null);
  /**
   * Der Rahmen, in den das Bild passt: die Leinwand abzüglich dessen, was die
   * Legende unten über sie legt. „Alles zeigen" hieß bisher, die Unterkante
   * unter den Kasten zu legen — 643 von 700 Bildpunkten.
   */
  const einpassFlaeche = useCallback(
    () => ({
      w: dimensions.w,
      h: Math.max(160, dimensions.h - (legendenRef.current?.offsetHeight || LEGENDE_HOEHE)),
    }),
    [dimensions]
  );
  const [hovered, setHovered] = useState<string | null>(null);
  /**
   * Die Kante unter dem Zeiger — Inhalt und Anfangslage im Zustand, die weitere
   * Lage direkt am DOM.
   *
   * Der Text aendert sich nur, wenn eine andere Kante gewinnt; die Lage
   * aendert sich mit jedem Bild, waehrend das Layout noch laeuft. Eine Lage im
   * Zustand pro Bild heisst: sechzig Re-Renders pro Sekunde fuer einen Satz
   * Text.
   */
  const [kantInfo, setKantInfo] = useState<KantenInfo | null>(null);
  const hoverKanteRef = useRef<LayoutEdge | null>(null);
  // Badges: Nachbarn, die der Kantengrenze zum Opfer fielen. Die Zahlen entstehen
  // einmal je Kantenneubau — nicht pro Bild fuer jeden Knoten.
  const versteckteRef = useRef<Map<string, number>>(new Map());
  /** Die Schlingen des letzten Kantlaufes — gezeichnet und gegriffen aus derselben Liste. */
  const selbstRef = useRef<LayoutEdge[]>([]);
  const kantTooltipRef = useRef<HTMLDivElement | null>(null);
  // Die Groesse der Leinwand brauchte der Zeigerhandler — als Zustand ware er
  // beim ersten Hover noch die Startmasse.
  const masseRef = useRef({ w: 800, h: 500 });
  masseRef.current = dimensions;
  /** Die Zeile am Rand, die sagt, wie viele Knoten einen Titel tragen. */
  const benanntRef = useRef<HTMLDivElement | null>(null);
  /** Die Zeile am Rand, die sagt, wie viele Zuege der Bildflaeche weichen mussten. */
  const kappenRef = useRef<HTMLDivElement | null>(null);
  /** Die Zeile der Zustandszeichen; der Mal-Pass schreibt sie, Bild fuer Bild. */
  const zustandRef = useRef<HTMLDivElement | null>(null);
  /** Die Zeile am Rand, die sagt, wie viele entfaltete Notizen im Bild stehen. */
  const imRahmenRef = useRef<HTMLDivElement | null>(null);
  /** Wie viele Notizen im Bild stehen — gespiegelt, damit der Mal-Pass nicht auf Zustand wartet. */
  const imBildRef = useRef(0);
  /** Wie viele Knoten der Nutzer festgesetzt hat — nur fuer die Anzeige. */
  const [angeheftet, setAngeheftet] = useState(0);
  const zugRef = useRef<{ sx: number; sy: number; bewegt: boolean } | null>(null);
  // Der Reglerwert SELBST ist die Quelle — kein Rueckweg ueber Prozent, kein
  // Kaempfen zwischen Daumen und kontrolliertem Wert (Glitch-Quelle).
  const [sliderWert, setSliderWert] = useState(100);
  // Zwei Stufen: sliderWert folgt der Hand (live, nur das Datum), sliderCommit
  // entscheidet. Ohne diese Trennung hat jede Zwischenstellung (step 0,5 — bis
  // zu 200 pro Streich) das Dendrogramm-Layout neu gebaut und allen Knoten neue
  // Gleit-Ziele gegeben — der Zeitregler wackelte und ruckelte, solange man ihn
  // bewegte. Neu layoutet wird jetzt einmal beim Loslassen.
  const [sliderCommit, setSliderCommit] = useState(100);
  // Merkt sich den letzten ausgelösten Zeit-Commit — unterscheidet ihn von
  // anderen Baum-Neuaufbauten (Filterwechsel), damit der Regler-Wechsel
  // sofort ruhig steht, statt alle Knoten durchs Bild gleiten zu lassen.
  const letzterZeitCommit = useRef(sliderCommit);
  // Datum lokal (kein toISOString — derUTC-Versatz verschiebt den Tag).
  const isoLokal = (epoch: number) => {
    const d = new Date(epoch);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const timeRange = useMemo(() => graphTimeRange(memories), [memories]);
  /**
   * Die Skala des Zeitreglers endet heute.
   *
   * A8-03, nicht als Geschmack, sondern als Falschauskunft gemessen:
   * `graphTimeRange` sammelt startOf, validTo **und** updatedAt — und validTo
   * darf in der Zukunft liegen. Der Regler war Prozent genau dieser Spanne,
   * 100 % hiess per Definition „Now", und der erste Schritt nach links (0,5)
   * zeigte kein Datum in der Vergangenheit, sondern eines **vor** der
   * Gegenwart. Der Nutzer zieht „zurueck in die Zeit" und landet vor ihr; das
   * Datum in Akzentfarbe bestaetigt ihm eine Zahl, die nie eine Vergangenheit
   * beantworten konnte.
   *
   * Also: der Arm der Skala laeuft von dem aeltesten Stand bis heute, und was
   * darueber hinaus gilt, ist ein Zustand an der Linie — die Flaeche sagt ihn
   * als „+N later", nicht als Schritt auf der Achse.
   */
  const zeitAchse = useMemo(() => {
    if (!timeRange) return null;
    const heute = Date.now();
    const spaeter = memories.filter((m) => (m.validTo ?? 0) > heute);
    return {
      min: Math.min(Math.max(0, timeRange.min), heute),
      heute,
      spaeter,
      verschiebt: spaeter.length > 0,
    };
  }, [timeRange, memories]);
  /**
   * Was der Anteil der Skala zeitlich bedeutet. 100 % ist die Gegenwart
   * selbst — null, nicht ein Datum, damit „Now" und „heute" nicht zwei
   * verschiedene Zahlen sind.
   */
  const zeitMs = (anteil: number): number | null => {
    if (!zeitAchse || anteil >= 100) return null;
    const spanne = Math.max(0, zeitAchse.heute - zeitAchse.min);
    return Math.round(zeitAchse.min + (spanne * anteil) / 100);
  };
  const timeFilter = zeitMs(sliderCommit);
  // Nur für die Anzeige während des Ziehens — ein Billig-Rechnen, kein Layout.
  const liveFilter = zeitMs(sliderWert);
  /** Der Stand, den die Leiste zeigt: die Hand zuerst, dann der Commit. */
  const zeitStandMs = liveFilter;
  const setzeSlider = (v: number) => {
    setSliderWert(v >= 100 ? 100 : v);
    setSliderCommit(v >= 100 ? 100 : v);
  };
  /**
   * Ein gewaehlter Tag gilt bis zu seinem Ende — und nur bis heute: das Feld
   * kann heute nicht mehr fragen, als die Skalaantwortete.
   */
  const setzeDatum = (roh: string) => {
    if (!roh || !zeitAchse) {
      setzeSlider(100);
      return;
    }
    const [j, m, t] = roh.split("-").map(Number);
    if (!j || !m || !t) return;
    const epoch = new Date(j, m - 1, t, 23, 59, 59, 999).getTime();
    const spanne = zeitAchse.heute - zeitAchse.min;
    setzeSlider(spanne > 0 ? ((epoch - zeitAchse.min) / spanne) * 100 : 100);
  };
  const datumKurz = (ms: number) =>
    new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const datumLang = (ms: number) =>
    new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  // --- Die Leiste: Plan, Zeichen, Geraete -----------------------------------
  /** Die echte Breite der Zeile; 0 heisst „noch nicht gemessen" → alles bleibt drin. */
  const [leistenBreite, setLeistenBreite] = useState(0);
  const [mehrOffen, setzeMehrOffen] = useState(false);
  const leistenRo = useRef<ResizeObserver | null>(null);
  /**
   * Der Beobachter hängt am Knoten, nicht an einem Effect mit leerer Liste.
   *
   * Grund, gemessen am 10.10. im echten Browser: die Flaeche startet mit leerer
   * Wissensbasis (der Bestand kommt per Fetch), und in diesem Moment gibt es
   * keine Zeile — ein Effect `[]` lief einmal mit `el === null` und kam nie
   * wieder. Die Zeile blieb bei „nicht gemessen", der Plan baute nichts ab und
   * neun Geraete standen bei 1 440 px ausserhalb des Fensters. Ein Callback-Ref
   * laeuft, sobald der Knoten da ist.
   */
  const leistenMessen = useCallback((el: HTMLDivElement | null) => {
    if (leistenRo.current) {
      leistenRo.current.disconnect();
      leistenRo.current = null;
    }
    if (!el || typeof ResizeObserver === "undefined") return;
    // Geplant wird nach dem inneren Mass des Knotens (`clientWidth` minus
    // `px-2`), nicht nach dem contentRect des Beobachters: der Beobachter ist
    // nur der Anlass, die Groesse holt sich die Zeile selbst. Das haelt auch
    // dort, wo jsdom kein Layout kennt — dort bleibt das Mass 0, und 0 heisst
    // „nichts abgebaut": die Zeichen-Wachen finden ihre Knöpfe in der Zeile,
    // die Abbauschicht prueft den Plan als eigene Funktion und setzt das Mass
    // fuer einen Fall von aussen.
    const innen = () => Math.max(0, el.clientWidth - LEISTE_POLSTER);
    const ro = new ResizeObserver(() => setLeistenBreite(innen()));
    ro.observe(el);
    setLeistenBreite(innen());
    leistenRo.current = ro;
  }, []);
  /**
   * Der Plan der Zeile. Ohne Zeitachse gibt es keine Zeitgliede — die Skala
   * faellt nicht aus dem Plan, sie existiert gar nicht erst.
   */
  const plan = useMemo(
    () => leistePlan(leistenBreite, zeitAchse ? RANG_FOLGE : RANG_FOLGE.filter((g) => !ZEIT_GLIED.includes(g))),
    [leistenBreite, zeitAchse]
  );

  const [customTypeColors, setCustomTypeColors] = useState<Record<string, string>>(() => {
    // Nur was die Leiter hält, kommt durch: sonst überschreibt ein Wert, den
    // eine alte Fassung gespeichert hat, bis heute Index-Zahlen und Legende.
    try {
      const gespeichert = JSON.parse(localStorage.getItem("kepta_type_colors") || "{}") as Record<string, string>;
      return Object.fromEntries(Object.entries(gespeichert).filter(([, wert]) => tintetauglich(wert)));
    } catch { return {}; }
  });
  const rollenHexe = useRollenHexe();
  const TYPE_COLORS = useMemo(() => {
    const aus: Record<string, string> = {};
    for (const rolle of [...TYP_FOLGE, "neutral"]) {
      const wert = customTypeColors[rolle] ?? rollenHexe[rolle];
      if (wert) aus[rolle] = wert;
    }
    return aus;
  }, [rollenHexe, customTypeColors]);
  /**
   * Die Herkunft des Bestands — woher die Notizen kommen. Zwei Herkünfte sind
   * eine Auskunft, eine ist keine: dann bleibt der Kanal aus, mit dem Grund auf
   * dem Knopf, statt die ganze Wissensbasis in eine Farbe zu tauchen.
   */
  const herkunft = useMemo(
    () => herkunftsBild(memories.map((m) => ({ id: m.id, tags: m.tags }))),
    [memories]
  );
  const aktiverKanal: FarbKanal = herkunft.verfügbar ? kanal : "typ";
  const notenFarben = useMemo(() => {
    if (aktiverKanal !== "herkunft") return TYPE_COLORS;
    const aus: Record<string, string> = {};
    for (const art of Object.values(HERKUNFT)) if (rollenHexe[art]) aus[art] = rollenHexe[art];
    if (rollenHexe.neutral) aus.neutral = rollenHexe.neutral;
    return aus;
  }, [aktiverKanal, TYPE_COLORS, rollenHexe]);

  // Eine Typ-Farbe wirkt app-weit (Karten-Grat, Typ-Label, Index-Zahlen).
  useEffect(() => {
    for (const t of Object.keys(customTypeColors)) setTypVar(t, customTypeColors[t]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setTypeColor = (t: string, c: string) => {
    // Eine Wahl unter der Leiter wird nicht gemalt: der Regler snappt sichtbar
    // auf den Registerton zurück, weil `value` an TYPE_COLORS hängt.
    if (!tintetauglich(c)) return;
    setTypVar(t, c);
    setCustomTypeColors((prev) => {
      const next = { ...prev, [t]: c };
      try { localStorage.setItem("kepta_type_colors", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // --- Echte Relationen aus der Graph-DB ---
  const [graphApi, setGraphApi] = useState<GraphApi | null>(null);
  const [netzLade, setNetzLade] = useState(0);
  useEffect(() => {
    let abgebrochen = false;
    void (async () => {
      try {
        const res = await fetch("/api/graph?depth=2");
        const data = await res.json();
        if (!abgebrochen && data && Array.isArray(data.relations)) setGraphApi(data as GraphApi);
      } catch { /* Engine nicht erreichbar — Aehnlichkeitskanten bleiben */ }
    })();
    return () => { abgebrochen = true; };
  }, [memories.length, netzLade]);

  /**
   * Der Nachzug (Aufgabe #96): was der Scanner vor dem Begriff-Produzenten
   * hinterliess, steht als Blatt ohne Kante im Bild — am echten Bestand gemessen
   * 4,83 % der Notizen an einem Begriff. Die Tuer zaehlt den Bedarf und fuellt
   * ihn; die Flaece holt ihn, nennt ihn, und liest das Netz neu, wenn er fertig
   * ist. Ein Hintergrundlauf, den niemand sehen kann, ist eine Zahl in einer
   * Datenbank — kein Bild, das sich aendert.
   */
  const [nachzug, setNachzug] = useState<{
    laufen: boolean; gesehen: number; gesamt: number;
    begriffe: number; kanten: number; neuBegriffe: number; neuKanten: number; fehler: string | null;
  } | null>(null);
  useEffect(() => {
    let abgebrochen = false;
    const hole = async (): Promise<Record<string, unknown> | null> => {
      try {
        const res = await fetch("/api/graph/nachzug");
        if (!res.ok) return null;
        const data = (await res.json()) as Record<string, unknown>;
        return typeof data?.needed === "boolean" ? data : null;
      } catch { return null; }
    };
    const zeige = (stand: Record<string, unknown>) => {
      if (abgebrochen) return;
      setNachzug({
        laufen: Boolean(stand.running),
        gesehen: Number(stand.seen ?? 0),
        gesamt: Number(stand.total ?? 0),
        begriffe: Number(stand.concepts ?? 0),
        kanten: Number(stand.edges ?? 0),
        neuBegriffe: Number(stand.addedConcepts ?? 0),
        neuKanten: Number(stand.addedEdges ?? 0),
        fehler: typeof stand.error === "string" ? stand.error : null,
      });
    };
    void (async () => {
      const erster = await hole();
      if (!erster || abgebrochen) return;
      let stand = erster;
      if (!stand.running && stand.needed) {
        let antwort: Response;
        try {
          antwort = await fetch("/api/graph/nachzug", { method: "POST" });
        } catch { return; }
        if (abgebrochen) return;
        if (antwort.status === 503) {
          const grund = (await antwort.json().catch(() => null)) as { error?: string } | null;
          if (!abgebrochen) {
            setNachzug({ laufen: false, gesehen: 0, gesamt: Number(stand.total ?? 0), begriffe: 0, kanten: 0, neuBegriffe: 0, neuKanten: 0, fehler: grund?.error ?? "no backup" });
          }
          return;
        }
        if (antwort.status !== 202) return; // 409: ein Lauf laeuft schon — den verfolgt die Flaeche einfach mit
        const gefoelgt = await hole();
        if (!gefoelgt || abgebrochen) return;
        stand = gefoelgt;
      }
      for (;;) {
        if (!stand.running && !stand.needed) return; // nichts zu tun, nichts zu sagen
        zeige(stand);
        if (!stand.running) {
          if (Number(stand.addedEdges ?? 0) > 0 || Number(stand.addedConcepts ?? 0) > 0) setNetzLade((n) => n + 1);
          return;
        }
        await new Promise((los) => setTimeout(los, NACHZUG_FRAGE_MS));
        if (abgebrochen) return;
        const weiter = await hole();
        if (!weiter) return;
        stand = weiter;
      }
    })();
    return () => { abgebrochen = true; };
  }, []);

  /**
   * Die semantische Karte: Plätze, keine Vektoren.
   *
   * Die Projektion rechnet der Server (P-9). Der Renderer bekommt `{id,x,y}` und
   * die Bilanz der Reduktion — niemals die Einbettungen selbst. Bei dreitausend
   * Notizen à 768 Dimensionen wären das neun Millionen Zahlen durch die Leitung
   * und über den Hauptthread, für ein Bild von gut tausend mal siebenhundert
   * Pixeln.
   */
  const [karte, setKarte] = useState<SemantikKarte | null>(null);
  const [karteFehler, setKarteFehler] = useState(false);

  const filtered = useMemo(() => {
    if (!filter.trim()) return memories;
    const q = filter.toLowerCase();
    return memories.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.content.toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [memories, filter]);

  // Welche Notizen es zum committeten Stand des Reglers schon gab. Das haengt am
  // Regler und an der Filterliste — nicht am Einzelbild: frueher stand die
  // Rechnung mitten in zeichne() und kostete bei dreitausend Notizen und
  // sechzig Bildern ueber eine halbe Million Schritte je Sekunde fuer ein
  // Ergebnis, das sich nur beim Schieben aendert. Sie steht ausserdem frueher
  // als die Kanten, weil das Konzept-Netz unten gegen denselben Stand rechnet —
  // sonst bliebe ein Konzept stehen, dessen ganze Belege Geister sind.
  const zeitAktivIds = useMemo(() => activeIdsAt(filtered, timeFilter), [filtered, timeFilter]);

  /**
   * Das Netz aus Konzepten und Behauptungen — dieselbe Ontologie, die der Baum
   * zeichnet. Vorher faltete die Flaeche jede Behauptung zwischen zwei
   * Entitaeten in das Kreuzprodukt ihrer Notizen und kappte nach 24 Paaren:
   * quadratisch im Preis, und ab dem 25. Beleg still weg. Ausserdem verband sie
   * Notizen, die nichts teilen, und trennte Notizen, die dasselbe Konzept
   * erwaehnen. Jetzt haengt die Notiz am Begriff, und Begriffe sind durch das
   * verbunden, was jemand ueber sie behauptet hat.
   */
  const netzSichtbar = useMemo(() => {
    const ids = new Set<string>();
    for (const m of filtered) if (!zeitAktivIds || zeitAktivIds.has(m.id)) ids.add(m.id);
    return ids;
  }, [filtered, zeitAktivIds]);
  /** Titel je Notiz — nur für eine Frage gebraucht: ist dieser Begriff das Echo
   *  einer Überschrift? Der Schreibweg legt von jeder Notiz auch ihren Titel als
   *  Begriff an, und in einer vollen Basis ist die Hälfte der „Ontologie" genau
   *  das: eine Titelliste mit Kanten. */
  const titelVonId = useMemo(() => new Map(memories.map((m) => [m.id, m.title])), [memories]);
  const netz = useMemo(
    () =>
      entitaetsNetz(
        graphApi?.memoriesByEntity,
        graphApi?.relations,
        netzSichtbar,
        2,
        (id) => titelVonId.get(id)
      ),
    [graphApi, netzSichtbar, titelVonId]
  );
  /**
   * Die Größe des Bestands, wie die Tür sie nennt — nie die Länge der Seite.
   * `null` von der Tür heißt hier: nichts behaupten, sondern die eigene Liste
   * als das nennen, was sie ist (ein Ausschnitt, dessen Größe unbekannt bleibt).
   */
  const bestandNotizen = bestandGroesse() ?? memories.length;
  const geruestIds = useMemo(() => netz.knoten.map((k) => k.id), [netz]);
  /**
   * Wie viele der Notizen im Bild tatsächlich an einem Begriff hängen. Das ist
   * die Zahl auf Damians Frage vom 13.10. („12 000 Notes drauf, ich erkenn gar
   * nix"): sie sagt, ob das Feld ein Netz zeigt oder eine Punktwolke, die nur
   * so tut. Gezaehlt wird ueber die Erwaehnungen — eine Notiz mit drei Begriffen
   * ist eine gedeckte Notiz.
   */
  const notizenMitBegriff = useMemo(
    () => new Set(netz.erwahnungen.map(([notizId]) => notizId)).size,
    [netz]
  );
  /**
   * Die Deckung als Paar aus **derselben Menge** — der eine Satz, den Damian
   * ueber seinem Bestand liest (#16, 16.10.). Zwei Stellungen, keine dritte:
   *
   *   - Die Tuer nennt `deckung`: ihre zwei Zahlen. Die sind am ganzen Bestand
   *     gerechnet (`store.notizenMitBegriff()` gegen `activeCount()`), Zaehler
   *     und Nenner also aus derselben Menge.
   *   - Die Tuer schweigt: nur das Fenster. Der eigene Zaehler kennt ausschliesslich,
   *     was durch die Kappen des Auszugs gekommen ist, und ihn durch
   *     `bestandNotizen` zu teilen unterschaetzt die Deckung an Damians Bestand um
   *     den Faktor drei (gemessen 345 von 21 066 = 1,65 % statt 1 018 = 4,83 %).
   *     Dann heisst der Satz „drawn here", und die Kopfzeile darueber nennt den
   *     Bestand — auf dem Schirm verliert nichts an Information, nur die eine
   *     Klaue behauptet keine Bestandsgroesse mehr.
   *
   * Entschieden so, weil eine zu kleine Deckungszahl Damian eine Luecke in seinem
   * Wissen vorspiegelt, die nicht da ist. Dieselbe Klasse wie die Sicherung (100
   * von 21 066, geheilt in 3.2.13) und der taube Kantenzaehler (#19).
   */
  const deckung = useMemo(() => {
    const d = graphApi?.deckung;
    if (d && Number.isFinite(d.gedeckt) && Number.isFinite(d.notizen) && d.notizen > 0) {
      return { gedeckt: d.gedeckt, notizen: d.notizen, ausDerTuer: true };
    }
    return { gedeckt: notizenMitBegriff, notizen: memories.length, ausDerTuer: false };
  }, [graphApi, notizenMitBegriff, memories.length]);
  /**
   * Was die Faltung im Kraftfeld verdeckt: nur Notizen, die sonst niemand
   * trägt. Gegen `netzSichtbar` gerechnet, damit die Kopfzeile nicht etwas
   * abzieht, was der Suchfilter oder der Zeitregler längst genommen hat.
   */
  const verborgen = useMemo(() => {
    const ro = verborgeneNotizen(graphApi?.memoriesByEntity, gefaltet);
    if (ro.size === 0) return ro;
    const out = new Set<string>();
    for (const id of netzSichtbar) if (ro.has(id)) out.add(id);
    return out;
  }, [graphApi, gefaltet, netzSichtbar]);
  /**
   * Die Detailstufe des Feldes. Hängt die Mehrzahl der Notizen an keinem
   * Begriff, sind 14 702 Punkte kein Netz, sondern ein Schleier — das Feld malt
   * dann nur, was wirklich verbunden ist, und sagt die nicht gemalte Masse.
   *
   * Drei Ausnahmen halten die Fläche erreichbar und nie leer: ein aktiver
   * Suchfilter zeigt immer seine Treffer, eine Basis ohne jeden Begriff wird nie
   * ausgedünnt (sonst stünde ein leeres Bild mit einer Zahl darauf), und unter
   * drei gemalten Dingen bleibt die Ausmalung ganz.
   */
  const feldMassen = useMemo(() => {
    const grund = verborgen.size === 0 ? filtered : filtered.filter((m) => !verborgen.has(m.id));
    if (filter.trim() !== "" || netz.knoten.length === 0 || !punktwolke(bestandNotizen, notizenMitBegriff)) {
      return { notizen: grund, unausgemalt: 0 };
    }
    const gedeckt = new Set<string>();
    for (const [notizId] of netz.erwahnungen) gedeckt.add(notizId);
    const gemalt = grund.filter((m) => gedeckt.has(m.id));
    // Mindestens drei gemalte Dinge, sonst ist das Bild ein einzelner Punkt:
    // Begriffe können ohne sichtbare Träger stehen (Zeitregler), dann wäre die
    // Ausmalmenge null und die Fläche leer.
    if (gemalt.length + netz.knoten.length < 3) return { notizen: grund, unausgemalt: 0 };
    // Der Rest faellt nicht mehr aus dem Bild. Was kein Begriff traegt, ist nicht
    // „unmalbar", sondern **der Gang**: der legt 384 dieser Punkte pro Seite,
    // zaehlt alle und laesst sich durchblaettern. Das alte Tor warf an einem
    // duennen Bestand ~20.000 Notizen hinaus — uebrig blieb ein kleiner Knoten
    // und eine Zeile, die sagte, dass der Rest nicht gemalt wird (Damian 15.10.:
    // „mein graph ist sehr klein, da stimmt etwas nicht").
    const unbedeckt = grund.length - gemalt.length;
    if (gangGreift(unbedeckt, grund.length + netz.knoten.length, true)) {
      return { notizen: grund, unausgemalt: 0 };
    }
    return { notizen: gemalt, unausgemalt: unbedeckt };
  }, [filtered, verborgen, filter, netz, bestandNotizen, notizenMitBegriff]);
  const feldNotizen = feldMassen.notizen;
  /** Wie viele Notizen je gefaltetem Begriff wirklich weg sind — das Malzeichen darf nur das zählen. */
  const verdecktJeKonzept = useMemo(() => {
    const m = new Map<string, number>();
    if (verborgen.size === 0 || !graphApi?.memoriesByEntity) return m;
    for (const [name, ids] of Object.entries(graphApi.memoriesByEntity)) {
      const id = `${ENTITAETS_PRAEFIX}${name}`;
      if (!gefaltet.has(id)) continue;
      let n = 0;
      for (const notiz of new Set(ids)) if (verborgen.has(notiz)) n += 1;
      if (n > 0) m.set(id, n);
    }
    return m;
  }, [verborgen, graphApi, gefaltet]);

  /**
   * Das Schema-Inventar (P-10): ein zweiter Blick auf denselben Payload — was
   * der Bestand an Arten, Begriffen und Behauptungen trägt. Zu, weil die Fläche
   * beim Öffnen das Bild zeigen soll und nicht eine Tabelle.
   */
  const [schemaOffen, setSchemaOffen] = useState(false);
  /** Die gewählte Zeile des Inventars; alles ausserhalb ihrer tritt zurück. */
  const [spot, setSpot] = useState<string | null>(null);
  const spotRef = useRef<Set<string> | null>(null);

  /**
   * Die Regler (P-13): Anziehung zur Mitte, Abstoßung, Link-Abstand,
   * Knotengröße. Sie verstellen ein laufendes Feld — die Welt wird nicht neu
   * gebaut, die Kamera bleibt, wo sie war.
   */
  const [krafte, setzeKrafte_] = useState<KrafteStellung>(liesKrafte);
  const [krafteOffen, setzeKrafteOffen] = useState(false);
  const krafteRef = useRef(krafte);
  krafteRef.current = krafte;
  /** Die Stellung, die dem Feld zuletzt gegeben wurde — gleich heißt: nichts tun. */
  const zuletztGestellt = useRef(krafte);
  /** Was das Feld liest — an jeder Baustelle frisch abgeholt, nicht gemerkt. */
  const krafteFeld = (k: KrafteStellung) => ({ gravitaet: k.gravitaet, abstossung: k.abstossung, link: k.link });
  const groesseRef = useRef(krafte.groesse);
  groesseRef.current = krafte.groesse;
  /**
   * Die Stellung wirklich machen.
   *
   * Nach den Simulations-Effekten deklariert: die bauen das Feld bei einem
   * Filterwechsel ohnehin mit der aktuellen Stellung neu, dieser Regler-Effekt
   * läuft danach und lässt das bestehende Feld unter neuen Kräften sich setzen.
   *
   * Ein neues Objekt ist noch keine neue Stellung: wer „Zurück" drückt, ohne
   * etwas verstellt zu haben, darf das Bild nicht noch einmal anlaufen sehen.
   */
  useEffect(() => {
    const alt = zuletztGestellt.current;
    zuletztGestellt.current = krafte;
    merkeKrafte(krafte);
    if (
      alt.gravitaet === krafte.gravitaet && alt.abstossung === krafte.abstossung &&
      alt.link === krafte.link && alt.groesse === krafte.groesse
    ) return;
    const sim = simRef.current;
    if (!sim) return;
    setzeKrafte(sim, krafteFeld(krafte));
    setzeKnotenGroesse(sim, radiusOf);
    zeichneNoetig.current = true;
  }, [krafte]);

  /**
   * Das Inventar des Bestands, aus demselben Payload wie die Fläche: die
   * Behauptungen aus `relations`, die Erwähnungen aus `memoriesByEntity`, die
   * Arten aus den Notizen selbst. Die Zahl der Begriffe holt sich der Bestand
   * selbst — `bestand.knoten` ist die Totalzahl, nicht die des Ausschnitts.
   *
   * Absichtlich der ganze Bestand und nicht der gefilterte Ausschnitt: die
   * Frage an ein Schema ist „was habe ich", nicht „was sehe ich gerade". Die
   * Kopfzeile daneben beantwortet das zweite, und beide Zahlen stehen für sich.
   */
  const inventar = useMemo(() => {
    const kanten: SchemaKante[] = [];
    for (const r of graphApi?.relations ?? []) {
      kanten.push({
        source: `${ENTITAETS_PRAEFIX}${r.source}`,
        target: `${ENTITAETS_PRAEFIX}${r.target}`,
        real: true,
        relation: r.relation ?? null,
      });
    }
    const träger = graphApi?.memoriesByEntity ?? {};
    for (const [name, ids] of Object.entries(träger)) {
      for (const id of new Set(ids)) {
        kanten.push({ source: id, target: `${ENTITAETS_PRAEFIX}${name}`, real: true });
      }
    }
    return schemaInventar({
      notizen: memories,
      konzepte: graphApi?.bestand?.knoten ?? Object.keys(träger).length,
      kanten,
    });
  }, [memories, graphApi]);

  /**
   * Was die gewählte Zeile des Inventars im Bild lässt. Ohne Zeile wird nichts
   * zurücktreten — das Panel allein verändert das Bild nicht.
   */
  const spotIds = useMemo(() => {
    if (!spot) return null;
    const ids = new Set<string>();
    if (spot === SCHEMA_SCHLUESSEL.begriffe) {
      for (const k of netz.knoten) ids.add(k.id);
      return ids;
    }
    if (spot === SCHEMA_SCHLUESSEL.erwahnung) {
      for (const [name, notizen] of Object.entries(graphApi?.memoriesByEntity ?? {})) {
        ids.add(`${ENTITAETS_PRAEFIX}${name}`);
        for (const id of new Set(notizen)) ids.add(id);
      }
      return ids;
    }
    if (spot.startsWith("knoten:")) {
      const schluessel = spot.slice("knoten:".length);
      for (const m of memories) {
        const typ = typeof m.type === "string" ? m.type.trim() : "";
        if (schluessel === "—" ? !typ : typ === schluessel) ids.add(m.id);
      }
      return ids;
    }
    const wort = spot.slice("kante:".length);
    for (const r of graphApi?.relations ?? []) {
      const name = typeof r.relation === "string" ? r.relation.trim() : "";
      if (wort === "—" ? name : name !== wort) continue;
      ids.add(`${ENTITAETS_PRAEFIX}${r.source}`);
      ids.add(`${ENTITAETS_PRAEFIX}${r.target}`);
    }
    return ids;
  }, [spot, memories, netz, graphApi]);
  spotRef.current = spotIds;

  /**
   * Die Zahl der Behauptungen, die der Bestand trägt: was das Inventar an
   * Behauptungswörtern zählt, und — wenn der Server sie mitliefert — seine
   * eigene Totalzahl. Erwähnungen sind keine Behauptungen und zählen nicht mit.
   */
  const behauptungen =
    graphApi?.bestand?.kanten ??
    inventar.kanten
      .filter((z) => z.schluessel !== SCHEMA_SCHLUESSEL.erwahnung && z.schluessel !== SCHEMA_SCHLUESSEL.ahnlichkeit)
      .reduce((s, z) => s + z.anzahl, 0);
  spotRef.current = spotIds;

  const kantenRapport = useMemo(
    () =>
      kantenBaue(feldNotizen, {
        realPairs: [
          ...netz.erwahnungen,
          ...netz.behauptungen.map(
            (b) =>
              [b.source, b.target, { validFrom: b.validFrom, validTo: b.validTo, relation: b.relation }] as [
                string,
                string,
                Gueltigkeit & { relation: string | null }
              ]
          ),
        ],
        knotenIds: geruestIds,
        ahnlichkeit,
        selbstkaanten,
      }),
    [feldNotizen, netz, geruestIds, ahnlichkeit, selbstkaanten]
  );
  const edges: LayoutEdge[] = kantenRapport.edges;
  versteckteRef.current = kantenRapport.versteckteNachbarn;
  selbstRef.current = kantenRapport.selbst;


  // Groesse = Verbindungsgrad; Huben sind sofort erkennbar.
  const degree = useMemo(() => {
    const d = new Map<string, number>();
    for (const e of edges) {
      d.set(e.source, (d.get(e.source) ?? 0) + 1);
      d.set(e.target, (d.get(e.target) ?? 0) + 1);
    }
    return d;
  }, [edges]);

  const neighborsOf = useMemo(() => {
    const n = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!n.has(e.source)) n.set(e.source, new Set());
      if (!n.has(e.target)) n.set(e.target, new Set());
      n.get(e.source)!.add(e.target);
      n.get(e.target)!.add(e.source);
    }
    return n;
  }, [edges]);

  const byId = useMemo(() => new Map(filtered.map((m) => [m.id, m])), [filtered]);

  // --- Refs, damit das Zeichnen ohne Render auskommt ---
  const simRef = useRef<Simulation | null>(null);
  const transformRef = useRef<Transform>({ x: 0, y: 0, k: 1 });
  const [zoomAnzeige, setZoomAnzeige] = useState(1);
  // Die Zeigerform hing vorher an Refs — die loesen kein Rendern aus, also blieb
  // der Cursor beim Ziehen unveraendert und die Geste fuehlte sich tot an.
  const [greift, setGreift] = useState(false);
  // Zwei Darstellungsarten fuer dasselbe Wissen: das Kraftfeld (Aehnlichkeits-
  // landschaft) und das Dendrogramm (Wurzel -> Typ -> Entitaet/Tag -> Notiz).
  // Seit P-9 die dritte: die Projektion der Einbettungen.
  const [ansicht, setAnsicht] = useState<GraphAnsicht>(() => {
    try {
      const v = localStorage.getItem(ANSICHT_KEY);
      return v === "dendrogram" || v === "semantic" ? v : "force";
    } catch { return "force"; }
  });
  const wechsleAnsicht = (v: GraphAnsicht) => {
    setAnsicht(v);
    try { localStorage.setItem(ANSICHT_KEY, v); } catch { /* ignore */ }
  };
  const zeichneNoetig = useRef(true);
  const autoFitOffen = useRef(true);
  /** Sobald der Nutzer selbst verschoben oder gezoomt hat, faessen wir den Ausschnitt nicht mehr an. */
  const nutzerBewegt = useRef(false);
  const draggingRef = useRef<LayoutNode | null>(null);
  const panRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const hoveredRef = useRef<string | null>(null);
  // Tastatur-Auswahl: der Knoten, den die Pfeiltasten gerade markieren.
  const tastaturIdRef = useRef<string | null>(null);
  const [tastaturId, setTastaturId] = useState<string | null>(null);
  const degreeRef = useRef(degree);
  const nachbarnRef = useRef(neighborsOf);
  const byIdRef = useRef(byId);
  const farbenRef = useRef(TYPE_COLORS);
  /**
   * Die Farben des aktiven Kanals. Art ist der Standardkanal; die Herkunft
   * färbt nur, wenn der Bestand auch zwei Herkünfte hat — sonst malt sie alles
   * in eine Farbe und sagt damit nichts.
   */
  const notenFarbenRef = useRef<Record<string, string>>(TYPE_COLORS);
  const herkunftRef = useRef<Map<string, string>>(new Map());
  const aktiverKanalRef = useRef<FarbKanal>("typ");
  degreeRef.current = degree;
  nachbarnRef.current = neighborsOf;
  byIdRef.current = byId;
  farbenRef.current = TYPE_COLORS;
  notenFarbenRef.current = notenFarben;
  herkunftRef.current = herkunft.träger;
  aktiverKanalRef.current = aktiverKanal;
  // Baum-Ansicht: Hervorhebung und Nachbarn entlang der Eltern-Kind-Kanten.
  const ansichtRef = useRef(ansicht);
  ansichtRef.current = ansicht;
  // Der Zeichencode läuft in einem eigenen Callback — Zustände erreichen ihn
  // nur über Refs.
  const richtungRef = useRef(richtung);
  richtungRef.current = richtung;
  const etikettenModusRef = useRef(etikettenModus);
  etikettenModusRef.current = etikettenModus;
  /**
   * Gelesene Etikette, einer pro Notiz. notizEtikett() zerlegt den Inhalt in
   * Zeilen — gemessen 1,33 ms für ein einziges Bild, wenn 140 Etikette jeweils
   * neu gelesen werden. Ein Etikett gilt einmal pro Notizliste, nicht 60-mal
   * die Sekunde.
   */
  /**
   * Gelesene Etikette, einer pro Notiz — mit der Grenze, für die sie gilt. Die
   * Gang-Kuerzung fragt den Zoom (#17), also ist ein Etikett nur so lange
   * gültig, wie seine Reihe dieselbe Breite hat.
   */
  const etikettVorratRef = useRef<Map<string, { grenze: number; etikett: NotizEtikett }>>(new Map());
  const zielRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  /** Baum→Kraftfeld-Übergang: Ziele, auf die die Knoten gleiten, bevor die Physik übernimmt. */
  const uebergangRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  /** Setzt der Ansichtswechsel: der nächste Kraftfeld-Aufbau gleitet statt zu springen. */
  const uebergangBaumRef = useRef(false);
  /** OS-Einstellung „Bewegung reduzieren“ — dann springen Ansichtswechsel direkt. */
  const reduzierteBewegung = useRef(
    typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const strukturKnotenRef = useRef<Map<string, StrukturKnoten>>(new Map());

  /**
   * Knotengroesse nach Verbindungsgrad — das Gesetz liegt in `knotenRadius`
   * (graphLayout), weil die Physik dieselbe Groesse rechnet wie der Mal-Pass
   * und ein zweites Exemplar davon schon einmal die Spanne totgemacht hat.
   *
   * Hier nur der Multiplikator: der Groesseregler der Flaeche.
   */
  const radiusOf = useCallback(
    (id: string) => knotenRadius(degreeRef.current.get(id) ?? 0) * groesseRef.current,
    []
  );

  /**
   * Live-Rückmeldung beim Ziehen: Im Kraftfeld dimmt der Regler SOFORT, nicht
   * erst beim Loslassen. Das Ziehen veränderte bisher nur das Datums-Label —
   * das Bild stand still bis zum Commit, und genau das fühlte sich kaputt an.
   * Billig ist es, weil im Kraftfeld weder Layout noch Physik angerührt wird:
   * nur Alpha und Kantensichtbarkeit im Canvas. Der Dendrogramm-Neubau bleibt
   * bewusst am Commit (das war die Ruckel-Fixes 16.9.).
   */
  const liveEpoch = ansicht === "force" ? liveFilter : null;
  // Kraftfeld: live während des Ziehens, sonst der committete Stand. Nach dem
  // Loslassen zeigen live und Commit auf denselben Wert — kein Flackern.
  const effektivZeit = liveEpoch ?? timeFilter;
  const effektivAktiv = useMemo(() => activeIdsAt(filtered, effektivZeit), [filtered, effektivZeit]);
  const effektivZeitRef = useRef(effektivZeit);
  const effektivAktivRef = useRef(effektivAktiv);
  effektivZeitRef.current = effektivZeit;
  effektivAktivRef.current = effektivAktiv;

  /**
   * Was zum gewaehlten Zeitpunkt WIRKLICH im Bild steht.
   *
   * Die Kopfzeile nannte bisher immer die vollen Zahlen. Wer den Regler auf
   * Januar 2023 zog, sah eine Handvoll Punkte — und daneben unbeirrt
   * "212 nodes · 1272 edges". Eine Kante zaehlt nur, wenn BEIDE Enden damals
   * schon da waren; das ist dieselbe Regel, nach der sie auch gemalt wird.
   */
  // Der Kopf zählt nur, was nach dem Zeitfilter noch im Bild steht — und
  // trennt Behauptung von Aehnlichkeit. Eine Zahl aus dem Aehnlichkeitsnebel
  // wäre keine Auskunft, sondern ein Verkaufsgespräch.
  const sichtbareKanten = useMemo(
    () => (zeitAktivIds ? edges.filter((e) => edgeVisibleAt(zeitAktivIds, e.source, e.target, e, timeFilter)) : edges),
    [zeitAktivIds, edges, timeFilter]
  );
  const kanten = useMemo(() => kantZaehlung(sichtbareKanten), [sichtbareKanten]);
  const sichtbareAnzahl = useMemo(
    () => ({
      // Gezaehlt wird, was das Feld wirklich malt — nach Detailstufe (§
      // `feldMassen`). Eine Kopfzahl, die 14 702 nennt, waehrend 32 Punkte
      // stehen, ist dieselbe Luege, die die Bilanzzeile bekämpft.
      knoten: zeitAktivIds
        ? feldNotizen.reduce((n, m) => n + (zeitAktivIds.has(m.id) ? 1 : 0), 0)
        : feldNotizen.length,
      kanten: sichtbareKanten.length,
    }),
    [zeitAktivIds, feldNotizen, sichtbareKanten]
  );

  // --- Dendrogramm: Hierarchie und Zielpositionen ---
  //
  // Zum gewaehlten Zeitpunkt nicht existierende Notizen fallen aus dem Baum —
  // der Zeitregler duennt hier die Struktur, statt sie nur abzudunkeln.
  //
  // NUR in der Baum-Ansicht rechnen: das Hierarchie-Layout ueber alle Notizen
  // und Kanten blockiert den Hauptthread bei grossen Wissensbasen spuerbar —
  // und im Kraftfeld wird es nie gelesen. Bis zum Guard lief es bei jedem
  // Zeitregler-Commit auch im Force-View: Sekunden eingefrorenes Fenster,
  // "man kann nichts machen".
  const baumMemories = useMemo(() => {
    if (!zeitAktivIds) return filtered;
    return filtered.filter((m) => zeitAktivIds.has(m.id));
  }, [filtered, zeitAktivIds]);
  const entitaeten = useMemo(() => entitiesByMemory(graphApi?.memoriesByEntity), [graphApi]);
  // Eine Ontologie, eine Schwelle: der Baum baut seine Entitätsebene aus
  // denselben Konzepten, die das Feld zeigt — sonst stehen für dieselbe
  // Wissensbasis zwei Zahlen im Kopf.
  const konzeptNamen = useMemo(() => new Set(netz.knoten.map((k) => k.label)), [netz]);
  const baum = useMemo(
    () => (ansicht === "dendrogram" ? buildHierarchy(baumMemories, entitaeten, konzeptNamen) : null),
    [baumMemories, entitaeten, konzeptNamen, ansicht]
  );
  /**
   * Die Lesung desselben Bestands in zwei Baendern — nur im Baum, nur ueber dem,
   * was der Zeitregler gerade gelten laesst. Der Baum antwortet auf "welcher Art";
   * wenn seine zweite Ebene 90,16 % in ein Fach legt, ist die Art keine Antwort
   * mehr, und dann steht diese hier.
   */
  const regal = useMemo(
    () => (ansicht === "dendrogram" ? baueRegal(baumMemories) : null),
    [baumMemories, ansicht]
  );
  /**
   * Wie viele Zeilen die Leinwand bei lesbarem Abstand hält. Der Rahmen ist der
   * zum Einpassen — dieselbe Fläche, die auch die Legende abzieht.
   */
  const baumRahmen = useMemo(
    () => Math.max(6, Math.floor((einpassFlaeche().h - 128) / ZEILEN_LESEBAR)),
    [einpassFlaeche]
  );
  /** Was der Baum faltet, damit er hineinpasst. Leer, wenn er es nicht muss. */
  const autoFaltung = useMemo(
    () => new Set(baum ? vorschlagFaltung(baum, baumRahmen) : []),
    [baum, baumRahmen]
  );
  /** Was wirklich zu ist: die eigene Hand, und was der Baum selbst schloss. */
  const dicht = useMemo(() => {
    const aus = new Set(gefaltet);
    for (const id of autoFaltung) if (!entfaltet.has(id)) aus.add(id);
    return aus;
  }, [gefaltet, autoFaltung, entfaltet]);
  /**
   * Die Geste auf einer Gruppe — sie kehrt immer das, was im Bild steht.
   *
   * Eine automatische Faltung ist keine Handlung, also braucht sie keinen
   * zweiten Griff: wer sie doppelt nimmt, öffnet sie, und das Öffnen hält, bis
   * er dieselbe Gruppe wieder schließt.
   */
  const falteUm = useCallback((id: string) => {
    if (dicht.has(id)) {
      setGefaltet((v) => {
        if (!v.has(id)) return v;
        const n = new Set(v);
        n.delete(id);
        return n;
      });
      setEntfaltet((v) => (v.has(id) ? v : new Set(v).add(id)));
      return;
    }
    setGefaltet((v) => new Set(v).add(id));
    setEntfaltet((v) => {
      if (!v.has(id)) return v;
      const n = new Set(v);
      n.delete(id);
      return n;
    });
  }, [dicht]);
  /** Wie viele Notizen hinter den automatischen Faltungen liegen, die noch gelten. */
  const autoZiffern = useMemo(() => {
    if (!baum || autoFaltung.size === 0) return 0;
    const zaehle = (k: HierarchieKnoten): number =>
      k.children.length === 0 ? 1 : k.children.reduce((n, c) => n + zaehle(c), 0);
    let n = 0;
    const sammle = (k: HierarchieKnoten) => {
      if (autoFaltung.has(k.id) && !entfaltet.has(k.id) && !gefaltet.has(k.id)) { n += zaehle(k); return; }
      for (const c of k.children) sammle(c);
    };
    sammle(baum);
    return n;
  }, [baum, autoFaltung, entfaltet, gefaltet]);
  /** Wie viele Gruppen noch automatisch zu sind — nicht, wie viele der Mensch schloss. */
  const autoGefaeltet = useMemo(() => {
    let n = 0;
    for (const id of autoFaltung) if (!entfaltet.has(id) && !gefaltet.has(id)) n += 1;
    return n;
  }, [autoFaltung, entfaltet, gefaltet]);
  const baumLayout = useMemo(
    () =>
      baum
        ? layoutDendrogram(baum, { eingeklappt: dicht })
        : { edges: [], nodes: [], struktur: new Map<string, StrukturKnoten>() },
    [baum, dicht]
  );
  // Was der Baum wirklich stellt — nicht, was die Wissensbasis hergibt. Eine
  // gefaltete Gruppe nimmt ihre Kinder aus der SIMULATION, nicht nur aus dem
  // Layout: der Schlüssel unten entscheidet, wann neu aufgebaut wird, und mit
  // den Notizen der Gruppe würden sie trotz Faltung weiter im Bild stehen.
  const baumNotizen = useMemo(() => baumLayout.nodes.filter((n) => !istStruktur(n.id)), [baumLayout]);
  const baumIdsSchluessel = useMemo(() => baumNotizen.map((n) => n.id).join(","), [baumNotizen]);
  /**
   * Was die Kopfzeile zählt. Im Kraftfeld sind das die gefilterten Notizen; im
   * Baum das, was der Baum wirklich stellt — eine gefaltete Gruppe nimmt ihre
   * Notizen aus dem Bild, und die Zeile verspricht, was im Bild steht.
   */
  const bildZaehlung = useMemo(
    () =>
      ansicht === "dendrogram"
        ? { knoten: baumNotizen.length, kanten: sichtbareAnzahl.kanten }
        : sichtbareAnzahl,
    [ansicht, baumNotizen, sichtbareAnzahl]
  );
  imBildRef.current = bildZaehlung.knoten;
  // #101: was der Kopf der Zeile oben zu nennen hat, kommt aus dem Feld — und
  // zwar aus derselben Größe, die die Bilanz malt. Ein Wert pro Änderung, kein
  // Wert pro Bild: der Satz oben darf keine Renderkette an das Layout hängen.
  useEffect(() => {
    onFeldZaehlung?.(bildZaehlung.knoten);
  }, [bildZaehlung.knoten, onFeldZaehlung]);
  /**
   * Die semantische Anordnung: die Plätze der Karte, die Begriffe in der Mitte
   * ihrer Notizen, und die Notizen ohne Vektor am Rand — gestellt, nicht
   * weggelassen. Ohne Karte (noch geladen, oder fehlerhaft) gibt es nichts zu
   * stellen, und die Ansicht erklärt das unten statt ein schwarzes Feld zu zeigen.
   */
  const semantikFeld = useMemo(
    () =>
      ansicht === "semantic" && karte
        ? layoutSemantik(
            karte,
            feldNotizen.map((m) => m.id),
            netz.knoten.map((k) => ({ id: k.id, notizen: k.notizen }))
          )
        : null,
    [ansicht, karte, feldNotizen, netz]
  );
  /**
   * Die ehrliche Bilanz des Ausschnitts: was die Wissensbasis traegt, gegen was
   * in diesem Bild steht. Jede Klausa bleibt weg, solange nichts fehlt — eine
   * Zeile, die eine Luecke behauptet, wo keine ist, macht die Flaeche
   * schlechter, nicht genauer.
   */
  const dichteZeile = useMemo(() => {
    const zahl = (n: number) => n.toLocaleString("en-US");
    const klausaen: string[] = [];
    const offen = bildZaehlung.knoten;
    /**
     * F8-N1, nach der Sichtpruefung am eigenen Bild: „Showing 20 of 400 notes"
     * und darunter „7 of 20 notes carry a title" sind zwei Zahlen mit demselben
     * Wort und zwei verschiedenen Umfaengen — fuer einen Menschen ein
     * Widerspruch, und die Zeile ist das einzige Stueck Text, das ihm erklaert,
     * was das Bild ist. Darum nennt der Baum jetzt seine drei Groessen in einer
     * Klaue: Bestand, was offen steht, was gefaltet ist und wie viele Gruppen
     * es traegt.
     */
    if (ansicht === "dendrogram" && autoZiffern > 0) {
      // „in the store" nur, wenn die Tür den Bestand nennt: 100 von 14 702 als
      // „100 notes" auszugeben ist dieselbe stille Kappe, die dieser Schnitt
      // abschafft. Schweigt die Tür, bleibt die Liste alles, was die Fläche weiß.
      const umfang = bestandGroesse() === null
        ? `${zahl(memories.length)} notes`
        : `${zahl(bestandNotizen)} notes in the store`;
      klausaen.push(
        `${umfang} · ${zahl(offen)} unfolded, ${zahl(autoZiffern)} notes folded under ${zahl(autoGefaeltet)} groups`
      );
    } else if (offen < bestandNotizen) {
      // „in the store" nur, wenn die Tür den Bestand nennt; schweigt sie, ist
      // die größere Zahl die eigene Liste und die Klaue heißt „in this view".
      klausaen.push(
        `Showing ${zahl(offen)} of ${zahl(bestandNotizen)} notes${bestandGroesse() === null ? " in this view" : " in the store"}`
      );
    }
    const geliefert = graphApi?.relations.length ?? 0;
    if (graphApi?.bestand && graphApi.bestand.kanten > geliefert) {
      klausaen.push(`Showing ${zahl(geliefert)} of ${zahl(graphApi.bestand.kanten)} claims in the store`);
    }
    // Die Deckung. Eine Punktwolke und ein Netz sehen gleich aus, solange keine
    // Zahl sagt, wie viel des Bestands überhaupt an einem Begriff hängt. Wenn
    // die Detailstufe schon ausdünnt, sagt die Zahl der Masse, was nicht malt —
    // dieselben zwei Größen, nie zweimal. **Beide Zahlen aus derselben Menge**
    // (`deckung` oben): nennt sie die Tür, stehen Bestand und Bestand; schweigt
    // sie, steht das Fenster da und sagt „drawn here". Ein Fensterszähler vor
    // einem Bestandsnenner war #16 — an Damians Bestand gemessen unterschlug er
    // seine Deckung um den Faktor drei (1,65 % statt 4,83 %).
    if (feldMassen.unausgemalt > 0) {
      klausaen.push(
        `${zahl(feldMassen.unausgemalt)} notes hang under no concept and are not painted — search still finds them`
      );
    } else if (deckung.notizen > 0 && deckung.gedeckt < deckung.notizen) {
      const grund = deckung.ausDerTuer
        ? `${zahl(deckung.gedeckt)} of ${zahl(deckung.notizen)} notes carry a concept`
        : `${zahl(deckung.gedeckt)} of ${zahl(deckung.notizen)} notes in this picture carry a concept`;
      klausaen.push(
        punktwolke(deckung.notizen, deckung.gedeckt)
          ? `${grund} — this field is not a network yet, the tree view groups the rest`
          : grund
      );
    }
    // Was der Titel-Echo (G-1) nicht durchlaesst, bleibt verborgen — aber es
    // steht in der Zeile. Nicht im Umfang der Klaue oben: die zählt den Schnitt
    // aus dem Bestand, diese die Kanten, die im Bild nicht gezeichnet werden,
    // obwohl ihre Notiz zu sehen ist.
    if (netz.vomEchoVerschluckt > 0) {
      const n = netz.vomEchoVerschluckt;
      klausaen.push(`${zahl(n)} claim${n === 1 ? "" : "s"} not drawn — its term is only a note title`);
    }
    if (kantenRapport.verstecktInSumme > 0) {
      klausaen.push(`${zahl(kantenRapport.verstecktInSumme)} neighbours hidden behind badges`);
    }
    if (kantenRapport.selbstInSumme > 0 && !selbstkaanten) {
      const n = kantenRapport.selbstInSumme;
      klausaen.push(`${zahl(n)} self-claim${n === 1 ? "" : "s"} hidden`);
    }
    // Die beiden Klausen der Projektion. Eine Karte, die schweigend die Hälfte
    // des Bestands fallen lässt, wäre schlimmer als keine Ansicht: sie sähe aus
    // wie die Wissensbasis und wäre ein Stichprobenbild davon.
    if (ansicht === "semantic" && karte && karte.gekappt > 0) {
      klausaen.push(
        `${zahl(karte.gekappt)} notes left out — the map holds ${zahl(SEMANTIK_KAPPE)} vectors`
      );
    }
    if (ansicht === "semantic" && semantikFeld && semantikFeld.ohneVektor > 0) {
      const n = semantikFeld.ohneVektor;
      klausaen.push(`${zahl(n)} note${n === 1 ? "" : "s"} without a vector, parked at the rim`);
    }
    // Was der Baum nicht zeigen kann, weil seine Zeilen nicht reichen, steht
    // nicht stillschweigend weg — es ist gefaltet, und die Zahl steht in der
    // Klaue oben (der Baum) oder in der Bilanz des Feldes.
    return klausaen.join(" · ");
  }, [bildZaehlung.knoten, memories.length, bestandNotizen, graphApi, deckung, kantenRapport, selbstkaanten, ansicht, karte, semantikFeld, autoZiffern, autoGefaeltet, netz, feldMassen]);
  const baumNachbarn = useMemo(() => {
    const n = new Map<string, Set<string>>();
    for (const e of baumLayout.edges) {
      if (!n.has(e.source)) n.set(e.source, new Set());
      if (!n.has(e.target)) n.set(e.target, new Set());
      n.get(e.source)!.add(e.target);
      n.get(e.target)!.add(e.source);
    }
    return n;
  }, [baumLayout]);
  // Erst hier, wenn baumNachbarn steht: die Hervorhebung im Baum folgt den
  // Eltern-Kind-Kanten, im Kraftfeld den Aehnlichkeitskanten.
  nachbarnRef.current = ansicht === "dendrogram" ? baumNachbarn : neighborsOf;

  // --- Simulation aufbauen / uebernehmen ---
  //
  // Kraftfeld: nur in der Kraftfeld-Ansicht — der Baum baut seine Simulation im
  // eigenen Effekt darunter. forceHistory bewahrt die letzte KRAFTFELD-
  // Anordnung: Wer aus dem Baum zurueckwechselt, darf die Physik nicht aus den
  // dichten Baum-Positionen starten — daraus explodiert sie.
  // Das Gerüst gehört zur Knotenmenge des Kraftfelds: ein Konzept hat keine
  // Memory, trägt aber die Kanten. Der Schlüssel entscheidet, wann neu
  // aufgebaut wird — und ein neues Konzept IST eine neue Knotenmenge.
  const idsSchluessel = useMemo(
    () => [...feldNotizen.map((m) => m.id), ...geruestIds].join(","),
    [feldNotizen, geruestIds]
  );
  /** Dasselbe Gerüst, das der Baum malt — hier ohne Typ- und Tag-Ebenen. */
  const kraftGeruest = useMemo(() => {
    const m = new Map<string, StrukturKnoten>();
    for (const k of netz.knoten) {
      const verdeckt = verdecktJeKonzept.get(k.id);
      m.set(k.id, {
        label: k.label,
        farbe: null,
        r: 8,
        blaetter: k.notizen.length,
        verdeckt,
        eingeklappt: verdeckt ? true : undefined,
      });
    }
    return m;
  }, [netz, verdecktJeKonzept]);
  const forceHistoryRef = useRef<Simulation | null>(null);
  useEffect(() => {
    if (ansichtRef.current !== "force") return;
    const ids = idsSchluessel ? idsSchluessel.split(",") : [];
    const kommtVomBaum = uebergangBaumRef.current;
    uebergangBaumRef.current = false;
    const alt = simRef.current;
    const sim = reuseSimulation(forceHistoryRef.current, ids, edges, radiusOf, krafteFeld(krafteRef.current));
    strukturKnotenRef.current = kraftGeruest;
    let zielKraft: Map<string, { x: number; y: number }> | null = null;
    if (kommtVomBaum && alt && alt !== sim) {
      // Gleiten statt springen: Start = Baum-Positionen, Ziel = letzte
      // Kraftfeld-Anordnung. Reduced Motion ueberspringt die Reise.
      zielKraft = new Map(sim.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
      for (const n of sim.nodes) {
        const altKnoten = alt.index.get(n.id);
        if (altKnoten) { n.x = altKnoten.x; n.y = altKnoten.y; }
      }
    }
    simRef.current = sim;
    sim.gangSeite = gangSeiteRef.current;
    spiegleGang(sim);
    forceHistoryRef.current = sim;
    // **Ein Schritt vor dem ersten Einpassen.** Erst dieser Schritt setzt, welche
    // Punkte auf keiner Seite des Gangs liegen. Ohne ihn rechnet die Kamera die
    // Startspirale aller 20.000 Verborgenen ein — gemessen 15.10. 18:00 an seinem
    // Bestand: 3 % Zoom, ein 6-px-Punkt wird 0,18 px, und das Bild wirkt leer.
    stepSimulation(sim);
    if (sim.nodes.length > 0) {
      // Der Ausschnitt gehoert zu den ZIEL-Positionen und MUSS sofort gesetzt
      // werden: ein bereits ausgekuehltes Feld bewegt sich nie wieder, der
      // Auto-Fit in der Bildschleife feuert nur, solange sich etwas bewegt.
      if (zielKraft) {
        const punkte = [...zielKraft.values()];
        const grenzen = {
          minX: Math.min(...punkte.map((p) => p.x)) - 70,
          minY: Math.min(...punkte.map((p) => p.y)) - 70,
          maxX: Math.max(...punkte.map((p) => p.x)) + 70,
          maxY: Math.max(...punkte.map((p) => p.y)) + 70,
        };
        transformRef.current = feldTransform(grenzen, punkte);
        setZoomAnzeige(transformRef.current.k);
      } else {
        transformRef.current = feldTransform(layoutBounds(sim.nodes, randFuerAnsicht(sim.nodes)), titelAnker(sim));
        setZoomAnzeige(transformRef.current.k);
      }
      nutzerBewegt.current = false;
      // Der erste Ausschnitt rechnet auf den Positionen, die die Übernahme
      // mitbringt. Bei einer vollen Wissensbasis ist das Feld damit noch nicht
      // fertig — es dehnt sich über hunderte Bilder, und das Bild wanderte nach
      // rechts unten vom Rahmen weg. Also passt sich die Kamera noch einmal an,
      // wenn die Physik wirklich steht. Vom Baum kommt sie bereits mit einem
      // gesetzten Ausschnitt; der bleibt.
      autoFitOffen.current = !kommtVomBaum;
    }
    uebergangRef.current = zielKraft ?? new Map();
    zeichneNoetig.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsSchluessel, edges, radiusOf, ansicht, kraftGeruest]);

  // Dendrogramm: dieselbe Simulation, aber Kanten = Eltern-Kind, und die
  // Strukturknoten (Wurzel/Typ/Entitaet/Tag-Gruppe) kommen hinzu. Positionen
  // gleiten im Render-Loop auf die Zielstellen, die Physik ruht. AUSNAHME der
  // Zeitregler: bei 3 000+ Notizen war das Gleiten nach jedem Loslassen
  // Sekunden wilder Bewegung — der ganze Graph flog hin und her, nichts war
  // bedienbar. Beim Zeit-Wechsel stehen die Knoten deshalb SOFORT auf ihren
  // neuen Platz (instant snap), die Kamera setzt einmal frisch.
  useEffect(() => {
    const zeitWechsel = letzterZeitCommit.current !== sliderCommit;
    letzterZeitCommit.current = sliderCommit;
    if (ansicht !== "dendrogram") return;
    const ids = baumIdsSchluessel ? baumIdsSchluessel.split(",") : [];
    const sim = reuseSimulation(simRef.current, ids, baumLayout.edges, radiusOf, krafteFeld(krafteRef.current));
    for (const n of baumLayout.nodes) {
      if (!n.id.startsWith("__") || sim.index.has(n.id)) continue;
      const kopie: LayoutNode = { ...n };
      sim.nodes.push(kopie);
      sim.index.set(kopie.id, kopie);
    }
    simRef.current = sim;
    spiegleGang(null);
    strukturKnotenRef.current = baumLayout.struktur;
    zielRef.current = new Map(baumLayout.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
    if (zeitWechsel) {
      for (const n of sim.nodes) {
        const ziel = zielRef.current.get(n.id);
        if (ziel) { n.x = ziel.x; n.y = ziel.y; }
      }
    }
    // Der Ausschnitt wartet nicht auf den Gleiter: wer aus dem Kraftfeld in den
    // Baum wechselt, sah bis hierhin mehrere Bilder lang das alte Fenster — bei
    // einem breiten Baum genau den Ausschnitt, in dem nur Stamm und ein Typ
    // standen. Die Zielpositionen des Layouts kennen die Ebene schon jetzt.
    autoFitOffen.current = false;
    fitBaumAnsicht(baumLayout.nodes);
    zeichneNoetig.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baumIdsSchluessel, baumLayout, radiusOf, ansicht, sliderCommit]);

  // Semantische Ansicht: dieselbe Knotenmenge und dieselben Behauptungen wie im
  // Kraftfeld, nur die Plätze kommen aus der Projektion. Physik aus, Gleiter an
  // — derselbe Mechanismus wie im Baum, weil die Zielpositionen schon fest
  // stehen und nichts mehr verhandelt wird. Wer aus dem Kraftfeld kommt, sieht
  // das Feld also in die Karte auseinanderziehen; das ist dieselbe Bewegung,
  // die der Baum macht, und kein neuer Zeichencode.
  useEffect(() => {
    if (ansicht !== "semantic" || !semantikFeld) return;
    const ids = idsSchluessel ? idsSchluessel.split(",") : [];
    const sim = reuseSimulation(simRef.current, ids, edges, radiusOf, krafteFeld(krafteRef.current));
    simRef.current = sim;
    spiegleGang(null);
    strukturKnotenRef.current = kraftGeruest;
    zielRef.current = semantikFeld.ziele;
    autoFitOffen.current = false;
    fitKarte(semantikFeld.ziele);
    zeichneNoetig.current = true;
  }, [ansicht, idsSchluessel, edges, radiusOf, semantikFeld, kraftGeruest]);

  // Ansichtswechsel: Ausschnitt wieder freigeben — ein neues Layout verdient
  // einen frischen Autofit, auch wenn der Nutzer vorher selbst geschoben hat.
  // Und: Wer aus dem Baum kommt, bekommt im Kraftfeld einen Gleit-Übergang.
  const vorherAnsichtRef = useRef<GraphAnsicht>(ansicht);
  useEffect(() => {
    if (vorherAnsichtRef.current === "dendrogram" && ansicht === "force") {
      uebergangBaumRef.current = true;
    }
    vorherAnsichtRef.current = ansicht;
    nutzerBewegt.current = false;
    zeichneNoetig.current = true;
  }, [ansicht]);

  // Die Karte wird geholt, wenn die Ansicht offen wird — und nicht vorher. Im
  // Kraftfeld läge sie unbenutzt im Zustand, und ein Antwortpfad, der nie
  // gefragt wurde, wäre ein Ratfen. Beim Wechsel wird neu gefragt: die
  // Wissensbasis schreibt man mit denselben Händen, die die Ansicht öffnen.
  useEffect(() => {
    if (ansicht !== "semantic") return;
    let abgebrochen = false;
    setKarte(null);
    setKarteFehler(false);
    void (async () => {
      try {
        const res = await fetch("/api/graph/semantik");
        const data = await res.json();
        if (abgebrochen) return;
        if (!data || !Array.isArray(data.punkte)) setKarteFehler(true);
        else setKarte(data as SemantikKarte);
      } catch {
        if (!abgebrochen) setKarteFehler(true);
      }
    })();
    return () => { abgebrochen = true; };
  }, [ansicht, memories.length]);

  // --- Container messen ---
  //
  // Als Rueckruf-Ref, nicht als Effekt mit leerer Abhaengigkeitsliste.
  //
  // Vorher wurde der Beobachter einmal beim Einhaengen eingerichtet — und genau
  // dann gibt es den Container noch gar nicht: beim ersten Rendern sind die
  // Notizen noch nicht geladen, die Komponente zeigt den Leerzustand und die
  // Leinwand fehlt. Der Effekt lief also ins Leere und wurde nie wiederholt.
  // Folge: die Groesse blieb dauerhaft bei den Startwerten 800x500. Die Leinwand
  // wurde in dieser Groesse gezeichnet und vom Browser auf die echte Flaeche
  // hochgezogen (unscharf), "Ansicht anpassen" rechnete mit dem falschen
  // Fenster, und alles jenseits von 800x500 wurde als "ausserhalb des Bildes"
  // gar nicht erst gemalt.
  const beobachterRef = useRef<ResizeObserver | null>(null);
  const containerRef = useCallback((el: HTMLDivElement | null) => {
    beobachterRef.current?.disconnect();
    beobachterRef.current = null;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const cr = e.contentRect;
        if (cr.width < 1 || cr.height < 1) continue; // ausgeblendet — kein sinnvolles Mass
        // A7-08: das GEMESSENE gilt, nicht ein gedeckelter Mindestwert. Die
        // fruehere Untergrenze von 320 px stellte bei 390 px Fensterbreite einen
        // 640 px breiten Puffer in ein 80-px-Feld — der Browser zog die Welt auf
        // ein Achtel zusammen, und der Fit rechnete mit einem Bild, das niemand
        // sah. Ein Puffer unter einem Bildpunkt ist die einzige Grenze, die der
        // Geometrie nichts tut.
        setDimensions({ w: Math.max(1, Math.round(cr.width)), h: Math.max(1, Math.round(cr.height)) });
        zeichneNoetig.current = true;
      }
    });
    ro.observe(el);
    beobachterRef.current = ro;
  }, []);
  useEffect(() => () => beobachterRef.current?.disconnect(), []);

  // --- Kugel-Sprites: einmal malen, dann nur noch kopieren ---
  //
  // Der Zwischenspeicher haengt nicht nur an den Farben, sondern auch am Thema:
  // auf hellem Grund braucht eine Kugel eine DUNKLE Kante, sonst verschwimmt sie
  // im Papierweiss. Genau das ging beim Umstieg von SVG auf Canvas verloren —
  // dort kamen Kante, Schatten und Glanz aus --node-rim/--node-shade/--node-hi,
  // hier standen ploetzlich feste Weisswerte.
  const spriteCache = useRef<{ schluessel: string; bilder: Record<string, HTMLCanvasElement> } | null>(null);
  const holeSprites = useCallback(
    (farben: Record<string, string>, rim: string, hi: number): Record<string, HTMLCanvasElement> => {
      const schluessel = `${JSON.stringify(farben)}|${rim}|${hi.toFixed(2)}`;
      if (spriteCache.current?.schluessel === schluessel) return spriteCache.current.bilder;
      const bilder: Record<string, HTMLCanvasElement> = {};
      // Der Knoten ohne Art hat einen Eintrag in der Palette, kein Bild aus
      // einer Handfarbe: `neutral` steht als Token im Register.
      const eintraege: [string, string][] = Object.keys(farben).map((t) => [t, farben[t]] as [string, string]);
      for (const [name, farbe] of eintraege) {
        const c = document.createElement("canvas");
        c.width = SPRITE_PX;
        c.height = SPRITE_PX;
        const g = c.getContext("2d");
        if (!g) continue;
        const m = SPRITE_PX / 2;
        g.fillStyle = farbe;
        g.beginPath();
        g.arc(m, m, m - 2, 0, Math.PI * 2);
        g.fill();
        const licht = g.createRadialGradient(m * 0.64, m * 0.6, 0, m * 0.64, m * 0.6, m * 0.62);
        licht.addColorStop(0, `rgba(255,255,255,${hi})`);
        licht.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = licht;
        g.fill();
        g.strokeStyle = rim;
        g.lineWidth = SPRITE_PX * 0.03;
        g.stroke();
        bilder[name] = c;
      }
      spriteCache.current = { schluessel, bilder };
      return bilder;
    },
    []
  );

  /**
   * Der Ausschnitt des Feldes, an EINER Stelle gerechnet.
   *
   * #28 — der Zwilling dessen, was der Baum seit F8-N1 tut (`fitBaumAnsicht`):
   * die Kamera darf weniger zeigen, aber nie weniger lesbar. Der Boden ist keine
   * erfundene Zahl, sondern `TITEL_REIHE_PX` — dieselbe Schwelle, die die Flaeche
   * an ihren eignen Gang-Reihen anlegt. Bei 21 066 Punkten presste das Einpassen
   * die Welt auf 4 %: unter dieser Schwelle, und darum trug dort keine der 729
   * Notizen im Bild einen Namen. Was ausserhalb liegt, sagt die Zeile am Rand,
   * und Herauszoomen von Hand bleibt frei.
   *
   * Der Boden allein machte daraus ein Bild, dessen Haelfte leer ist: die Boxmitte
   * der WELT liegt bei einem weiten Feld Vereinzelte neben dem Haufen, nicht in
   * ihm (gemessen 18.10. an 1 500 Notizen: 35 Namen, alle rechts oben, vier Titel
   * vom Rand durchschnitten). Darum sitzt die Kamera auf dem dichtesten Ausschnitt
   * der Knoten, nicht auf der Boxmitte — `dichtesteWeltMitte`, mit dem Titelrand
   * als Luft an beiden Kanten.
   */
  /**
   * Die Punkte, deren Namen die Kamera suchen muss.
   *
   * Der Vereinzelte-Staub liegt in Reihen (Gang) und nennt sich dort nicht
   * einzeln. Zaehlte man ihn mit, setzte die Kamera auf die dichteste Punktwolke
   * und liesse die Nachbarschaft mit den Namen am Rand stehen — gemessen in der
   * Kratzbaum-Kopie: 5 Titel vorher, 2 nachher. Die Rahmen-Zeile am Rand zaehlt
   * laengst dieselbe Menge: die entfalteten Notizen.
   *
   * Der Anker ist die Stelle, an der der Titel haengt (`(y + r) · k`), nicht die
   * Knotenachse: sonst liegt in schmalen Fenstern die halbe Titelzone unter der
   * Bildmitte und die Mitte gilt als leer, waehrend Namen gemalt werden.
   */
  const titelAnker = (sim: Simulation) => {
    const offene = sim.nodes.filter((n) => !n.versteckt && !sim.gangIds?.has(n.id));
    const menge = offene.length > 0 ? offene : sim.nodes.filter((n) => !n.versteckt);
    return menge.map((n) => ({ x: n.x, y: n.y + n.r }));
  };

  const feldTransform = useCallback(
    (grenzen: ReturnType<typeof layoutBounds>, knoten?: readonly { x: number; y: number; versteckt?: boolean }[]) => {      const ein = einpassFlaeche();
      const fit = fitTransform(grenzen, ein);
      const boden = zeilenKMin(TITEL_REIHE_PX, GANG_ABSTAND);
      const k = Math.max(fit.k, boden);
      const mitte =
        dichtesteWeltMitte(knoten ?? [], k, ein, TITEL_KANTEN_PX) ??
        { x: (grenzen.minX + grenzen.maxX) / 2, y: (grenzen.minY + grenzen.maxY) / 2 };
      return { k, x: ein.w / 2 - mitte.x * k, y: ein.h / 2 - mitte.y * k };
    },
    [einpassFlaeche]
  );

  // --- Der Ausschnitt, der alles zeigt ---
  const fitView = useCallback(() => {
    const sim = simRef.current;
    if (!sim || sim.nodes.length === 0) return;
    // OHNE Anker: dieser Knopf heisst „Fit the whole graph into view" und schuldet
    // die ganze Welt, nicht die Gegend mit den meisten Namen. Die Anfangskamera
    // sucht ihren Anker im Gemalten — wer ihn hier durchreichte, machte den Knopf
    // zu einer zweiten Anfangskamera und bräuchte einen andern Wort. (Gemessen
    // 19.10.: mit Anker fielen vier Gang-Faelle, weil sie ueber diesen Knopf
    // zurueck ins Ganze fahren wollen.)
    transformRef.current = feldTransform(layoutBounds(sim.nodes, randFuerAnsicht(sim.nodes)));
    setZoomAnzeige(transformRef.current.k);
    zeichneNoetig.current = true;
  }, [dimensions]);

  /**
   * Baum-Ansicht braucht einen anderen Startausschnitt: Fit-ueber-alles macht
   * einen 3.000-Blatt-Baum zum unlesbaren Strich (Zoom < 1 %). Unterhalb einer
   * Lesbarkeits-Zoomstufe starten wir am Stamm — der Rest ist Pan/Zoom weg.
   */
  const fitBaumAnsicht = useCallback((masse?: readonly LayoutNode[]) => {
    const sim = simRef.current;
    if (!sim || sim.nodes.length === 0) return;
    // Ohne `masse` gelten die aktuellen Positionen — mitten im Gleiter ist das
    // der alte Kraftfeld-Ausschnitt. Der Wechsel in den Baum gibt die
    // Zielpositionen, damit das ERSTE Bild des Baums schon alles zeigt.
    const knoten = masse ?? sim.nodes;
    // F8-N1, im eigenen Bild gesehen: „keine Untergrenze" machte den Baum bei
    // 400 Notizen zu einer Haarlinie — zwei Zeilen 3 px auseinander, weil die
    // Kamera ALLE Zeilen in den Rahmen presst. Der Baum darf ueber den Rahmen
    // hinausgehen (die Flaeche sagt, wie viele Notizen im Bild stehen); er darf
    // sich nicht unter die Lesbarkeit hinauszoomen.
    const grenzen = layoutBounds(knoten, 70);
    const ein = einpassFlaeche();
    const fit = fitTransform(grenzen, ein);
    const boden = zeilenKMin(ZEILEN_LESEBAR, BLATT_ABSTAND);
    const k = Math.max(fit.k, boden);
    // Zentriert, nicht oben verankert: in einem horizontalen Dendrogramm sitzt
    // die Wurzel in der MITTE der Blatthoehe (Eltern zentrieren auf ihre
    // Kinder). Oben verankert haette der Baum gerade seinen Stamm abgeschnitten.
    // Was der Lesbarkeitsboden uebrig laesst, liegt ausserhalb — und die Flaeche
    // sagt es in ihrer Bilanz.
    const mitteX = (grenzen.minX + grenzen.maxX) / 2;
    const mitteY = (grenzen.minY + grenzen.maxY) / 2;
    transformRef.current = { k, x: ein.w / 2 - mitteX * k, y: ein.h / 2 - mitteY * k };
    setZoomAnzeige(k);
    zeichneNoetig.current = true;
  }, [dimensions]);

  /**
   * Projektion einspannen: die Zielpositionen, nicht die aktuellen. Beim
   * Wechsel in die Ansicht stehen die Knoten noch im Kraftfeld — der Ausschnitt
   * würde auf das Feld gerechnet und die Karte läge halbbildschirmweise draussen.
   * Die Randnotizen sitzen schon in `ziele`, also passt die ganze Menge hinein.
   */
  const fitKarte = useCallback((ziele: ReadonlyMap<string, { x: number; y: number }>) => {
    if (ziele.size === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of ziele.values()) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    transformRef.current = fitTransform(
      { minX: minX - 70, minY: minY - 70, maxX: maxX + 70, maxY: maxY + 70 },
      einpassFlaeche()
    );
    setZoomAnzeige(transformRef.current.k);
    zeichneNoetig.current = true;
  }, [dimensions]);

  const zoom = useCallback((faktor: number, sx?: number, sy?: number) => {
    const t = transformRef.current;
    transformRef.current = zoomAt(t, faktor, sx ?? dimensions.w / 2, sy ?? dimensions.h / 2);
    setZoomAnzeige(transformRef.current.k);
    autoFitOffen.current = false;
    nutzerBewegt.current = true;
    zeichneNoetig.current = true;
  }, [dimensions.w, dimensions.h]);

  /**
   * Der Graph wird mitgemountet, waehrend eine andere Ansicht sichtbar ist — das
   * Layout kuehlte also aus, WAEHREND das Fenster noch die Startmasse 800x500
   * hatte, und passte den Ausschnitt darauf an. Beim Umschalten stand der Graph
   * dann verschoben da. Solange der Nutzer nichts selbst eingestellt hat, wird
   * bei jeder Groessenaenderung neu eingepasst.
   */
  useEffect(() => {
    if (nutzerBewegt.current) return;
    const sim = simRef.current;
    if (!sim || sim.nodes.length === 0) return;
    if (ansichtRef.current === "dendrogram") { fitBaumAnsicht(); return; }
    if (ansichtRef.current === "semantic") { fitKarte(zielRef.current); return; }
    transformRef.current = feldTransform(layoutBounds(sim.nodes, randFuerAnsicht(sim.nodes)), titelAnker(sim));
    setZoomAnzeige(transformRef.current.k);
    zeichneNoetig.current = true;
  }, [dimensions, fitBaumAnsicht, fitKarte]);

  // Richtung ist reine Darstellung: kein Neu-Layout, keine Physik, ein Bild.
  useEffect(() => {
    zeichneNoetig.current = true;
  }, [richtung, aktiverKanal]);

  // Auch die Etikett-Stellung ist reine Darstellung — ein Bild, kein Neu-Layout.
  useEffect(() => {
    zeichneNoetig.current = true;
  }, [etikettenModus]);

  // Selbstbehauptungen sind Darstellung, kein neues Layout.
  useEffect(() => {
    zeichneNoetig.current = true;
  }, [selbstkaanten]);

  // Eine neue Notizliste ist eine neue Wissensbasis: was gemerkt wurde, gilt
  // nicht mehr. Ohne diesen Schritt stünde das Etikett der letzten Fassung.
  useEffect(() => {
    etikettVorratRef.current.clear();
  }, [memories]);

  // --- Zeichnen ---
  const zeichne = useCallback(() => {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    const bw = Math.max(1, Math.round(dimensions.w * dpr));
    const bh = Math.max(1, Math.round(dimensions.h * dpr));
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }

    const stil = getComputedStyle(document.documentElement);
    const lies = (name: string, fallback: string) => (stil.getPropertyValue(name).trim() || fallback);
    const textFarbe = lies("--text-1", "#e8e6e1");
    // Das Gerüst des Baums (Ebenenamen) steht hinter dem Inhalt zurück — eine
    // Stufe leiser, aber noch deutlich über der AA-Schwelle auf dem Grund.
    const geruestFarbe = lies("--text-2", "#9b9992");
    const grundFarbe = lies("--bg-panel-solid", "#151515");
    const akzent = lies("--accent", "#c9b785");
    const schwach = lies("--text-3", "#7a7a7a");
    // Thema-abhaengige Kugelwerte — auf hellem Grund ist die Kante dunkel.
    const nodeRim = lies("--node-rim", "rgba(255,255,255,0.2)");
    const nodeShade = lies("--node-shade", "rgba(0,0,0,0.3)");
    const nodeHi = Number(lies("--node-hi", "0.72")) || 0.72;
    // Auf hellem Grund brauchen Kanten mehr Deckkraft, sonst verschwinden sie.
    const hellerGrund = istHell(grundFarbe);
    const kantenVerstaerkung = hellerGrund ? 1.9 : 1;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, dimensions.w, dimensions.h);

    const t = transformRef.current;
    const hov = hoveredRef.current;
    // Was das Schema-Inventar im Bild lässt. `null` = nichts gewählt, das Bild
    // ist unangetastet — das Panel allein verändert keinen Pixel.
    const spot = spotRef.current;
    const nachbarn = hov ? nachbarnRef.current.get(hov) : undefined;
    // Kraftfeld: die LIVE-Zeit (Regler folgt der Hand), sonst der Commit-Stand.
    const zeit = effektivZeitRef.current;
    const index = sim.index;

    // Nur das Sichtbare malen — bei 5000 Knoten liegt das meiste ausserhalb.
    const sicht = {
      x0: -t.x / t.k - 80,
      y0: -t.y / t.k - 80,
      x1: (dimensions.w - t.x) / t.k + 80,
      y1: (dimensions.h - t.y) / t.k + 80,
    };
    const imBild = (n: LayoutNode) => !n.versteckt && n.x >= sicht.x0 && n.x <= sicht.x1 && n.y >= sicht.y0 && n.y <= sicht.y1;
    /**
     * Der Rahmen OHNE den Mal-Margin. `sicht` gibt 80 Welteinheiten zu, damit
     * ein Knoten, der halb über der Kante liegt, noch gemalt wird — richtig zum
     * Malen, falsch zum Sagen. Die Zeile „N of M unfolded notes are in this
     * picture" verspricht einen Rahmen, den man nachzählen kann; wer mit dem
     * Margin zählt, behauptet „alles drin", während Pixels über die Kante laufen
     * (A7-08, gefangen von `:502` in KnowledgeGraph.f8.test.tsx). Gezählt wird
     * die Mitte ZUZÜGLICH des gemalten Halbmessers.
     */
    const kern = { x0: -t.x / t.k, y0: -t.y / t.k, x1: (dimensions.w - t.x) / t.k, y1: (dimensions.h - t.y) / t.k };
    const imRahmen = (n: LayoutNode, halbmesser: number) =>
      n.x - halbmesser >= kern.x0 && n.x + halbmesser <= kern.x1 && n.y - halbmesser >= kern.y0 && n.y + halbmesser <= kern.y1;

    // Welche Knoten gab es zum gewählten Zeitpunkt? (Regel in lib/graphTime)
    // Der effektive Stand: im Kraftfeld live beim Ziehen, sonst committet.
    const zeitAktiv = effektivAktivRef.current;
    // Im Baum sind nicht aktive Notizen bereits aus der Hierarchie gefallen;
    // die Eltern-Kind-Kanten fuehren zu Strukturknoten ohne Memory — die
    // Zeitregel darf sie nicht ausblenden.
    const kantenZeit = ansichtRef.current === "dendrogram" ? null : zeitAktiv;

    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);

    // --- Kanten ---
    const nurEcht = nurEchteKanten(sim.edges.length, t.k);
    ctx.lineCap = "round";
    // Vier Klassen, vier Aussehen. Seit dem 6.10. liegen im Feld zwei Arten
    // echter Kanten: eine Notiz, die einen Begriff erwaehnt, und eine
    // Behauptung zwischen zwei Begriffen. Seit dem 7.10. traegt die Behauptung
    // zusaetzlich ihr Gueltigkeitsfenster — eine erfuellte bleibt sichtbar und
    // wird gestrichelt, genau wie der Ring der abgelaufenen Notiz. Seit dem
    // 7.10. abends hat jede Kante zusaetzlich ein Dickenband: drei Aussagen
    // ueber demselben Paar sind ein dickerer Strich als eine.
    type KantArt = "vermutung" | "erwaehnung" | "abgelaufen" | "behauptung";
    const ARTEN: readonly KantArt[] = ["vermutung", "erwaehnung", "abgelaufen", "behauptung"];
    const jetzt = Date.now();
    const artFuer = (e: LayoutEdge): KantArt => {
      if (ansichtRef.current === "dendrogram") return "behauptung"; // hier ist jede Kante die Hierarchie selbst
      if (!e.real) return "vermutung";
      if (!istStruktur(e.source) || !istStruktur(e.target)) return "erwaehnung";
      // Nur beim Stand „jetzt" wird das Fenster zum Zustand. Ist der Regler
      // gezogen, hat edgeVisibleAt die geschlossenen Aussagen schon aus dem
      // Bild genommen — dort waere ein Strich fuer „galt damals" falsch.
      return kantenZeit === null && !fensterOffen(e, jetzt) ? "abgelaufen" : "behauptung";
    };

    // Ein Durchgang teilt die Kanten in ihre Zeichenklassen: Art, dann Band.
    // Gebuendelt wird pro Klasse EIN Pfad — eine eigene Breite je Kante waere
    // ein eigener Pfad je Kante, und das Bild waere weg.
    const klassen = new Map<string, LayoutEdge[]>();
    for (const e of sim.edges) {
      const art = artFuer(e);
      const band = Math.min(BREITE_PX[art].length - 1, dickeBand(e));
      const schluessel = `${art}|${band}`;
      const liste = klassen.get(schluessel);
      if (liste) liste.push(e);
      else klassen.set(schluessel, [e]);
    }

    const skalar = Math.max(0.4, t.k);
    /**
     * Teilt dieser Bild Durchgang die Linien in Nachbarschaft und Rest?
     *
     * Nur im Feld und nur, waehrend ein Zeiger haelt. Im Baum sind die Linien
     * die Struktur selbst — dort zu dimmen hiesse, die Hierarchie wegzunehmen,
     * um eine Zeile zu zeigen.
     */
    const teilt = hov !== null && ansichtRef.current !== "dendrogram";
    // Etwas gemalte, sichtbare Behauptungen — aus ihnen wird unten das Etikett.
    const etikettenmoeglich: LayoutEdge[] = [];
    /**
     * A7-04 — die Dichte-Kappe des Feldes, nach BILDFLAECHE.
     *
     * Bei 1 500 Notizen gemalt: 1 543 Linien-Stuecke in 1 130 × 668 px, ungekuerzt.
     * Die Erwaehnungen — jede Notiz an ihrem Begriff — standen mit derselben
     * Deckkraft im Bild wie die neun Behauptungen, die jemand gefuehrt hat. Der
     * Baum hatte seine Faltung, das Feld hatte nichts davon.
     *
     * Jetzt: Behauptungen, erfuellte und Vermutungen behalten ihren Platz; was
     * vom Bild uebrig bleibt, ist das Budget fuer die Erwaehnungen. Reicht es
     * nicht, fallen die am schwaechsten belegten Zuege zuerst, und die Zahl der
     * gefallenen steht am Rand — das Bild darf nicht schweigend duenner werden.
     *
     * Waehrend ein Zeiger haelt, gilt die Kappe nicht: dort sind die Erwaehnungen
     * schon auf α 0,08 gestellt, und ein Netz, das beim Anfassen die Haelfte
     * verliert, ist unruhiger als ein voller Schleier.
     */
    const linienFrei = linienBudget(dimensions.w, dimensions.h);
    let andereZuege = 0;
    for (const [schluessel, liste] of klassen) {
      const artDerKlasse = schluessel.slice(0, schluessel.indexOf("|"));
      // Nur Behauptungen und erfuellte Aussagen konkurrieren mit den
      // Erwaehnungen um die Bildflaeche. Vermutungen haben ihre eigene Kappe
      // (`nurEchteKanten`) und treten hinter das Begriffsnetz zurueck —
      // nachgemessen: als die Aehnlichkeiten zugeschaltet waren, standen bei 400
      // Notizen ploetzlich ALLE 390 Erwaehnungen „left out", weil 2 003
      // vermutete Kanten das Budget vorher auffrassen. Wer Aehnlichkeiten ruft,
      // loescht darum nicht die Ontologie.
      if (artDerKlasse === "erwaehnung" || artDerKlasse === "vermutung") continue;
      andereZuege += liste.length;
    }
    const erwaehnungBudget = teilt ? Number.MAX_SAFE_INTEGER : Math.max(0, linienFrei - andereZuege);
    let erwaehnungGemalt = 0;
    let gekappt = 0;
    for (const art of ARTEN) {
      const breiten = BREITE_PX[art];
      for (let band = 0; band < breiten.length; band++) {
        let liste = klassen.get(`${art}|${band}`);
        if (!liste || liste.length === 0) continue;
        // Reicht das Bild nicht fuer alle Erwaehnungen, fallen die am
        // schwaechsten belegten Zuege zuerst. Sortiert wird nur, wenn die Kappe
        // wirklich greift — und nach der Belegzahl, nicht nach der Zeilenordnung
        // der Datenbank.
        if (art === "erwaehnung" && liste.length > erwaehnungBudget - erwaehnungGemalt) {
          liste = [...liste].sort(
            (x, y) =>
              dickeBand(y) - dickeBand(x) ||
              (x.source < y.source ? -1 : x.source > y.source ? 1 : x.target < y.target ? -1 : 1)
          );
        }
        // Erst die Vermutungen (fein gepunktet), dann die Spinnen zum Begriff,
        // dann die erfuellten Aussagen, zuletzt die gueltigen Behauptungen — sie
        // liegen darüber und sind die Aussage.
        if (art === "vermutung" && nurEcht) continue;
        ctx.strokeStyle = art === "erwaehnung" ? textFarbe : art === "vermutung" ? schwach : akzent;
        ctx.lineWidth = breiten[band] / skalar;
        ctx.setLineDash(
          art === "abgelaufen"
            ? [4 / skalar, 3 / skalar]
            : art === "vermutung"
              ? [3 / skalar, 5 / skalar]
              : []
        );
        // --- Zwei Zuege beim Halten (A7-03) ---
        //
        // Vorher galt die Deckkraft je Klasse, nie je Kante: wer eine Notiz
        // anfasste, um zu sehen, was an ihr haengt, liess bei 1 500 Notizen alle
        // 1 534 Erwaehnungszuege bei α 0,34 stehen, waehrend die Behauptungen
        // global auf 0,9 gingen — das Netz wurde lauter statt ruhiger. Jetzt in
        // zwei Zuegen: was ein Ende unter dem Zeiger hat, in voller Staerke, der
        // Rest bei α 0,08. Dasselbe Muster, das die Vermutungen beim Halten
        // schon kannten (`hov !== e.source && hov !== e.target` -> weg).
        const zuege = teilt ? ([false, true] as const) : ([false] as const);
        for (const nahez of zuege) {
        ctx.beginPath();
        // Behauptungen bekommen eine Form, keine Pfeilspitze: breit am Ausgang,
        // schmal am Ziel. Die Spitze säße hinter der Zielscheibe und verschwände
        // in der Dämpfung, der Keil trägt die Richtung durch die ganze Linie.
        const keil = art === "behauptung" && richtungRef.current && t.k >= KEIL_AB_ZOOM;
        if (keil) ctx.fillStyle = akzent;
        let gemalt = 0;
        for (const e of liste) {
          const a = index.get(e.source);
          const b = index.get(e.target);
          if (!a || !b) continue;
          if (!imBild(a) && !imBild(b)) continue;
          if (!edgeVisibleAt(kantenZeit, e.source, e.target, e, zeit)) continue;
          if (hov && hov !== e.source && hov !== e.target && art === "vermutung") continue;
          // Eine Kante, die kein Ende im Spotlight hat, gehört nicht zur Frage.
          // Sie steht nicht gedimmt im Weg — sie ist nicht Teil der Auskunft.
          if (spot && !spot.has(e.source) && !spot.has(e.target)) continue;
          // Die Aufteilung in die zwei Zuege — Nachbarschaft und Rest.
          if (teilt && (hov === e.source || hov === e.target) !== nahez) continue;
          // Die Bildflaeche ist aufgebraucht: dieser Zug faellt, und er wird
          // gezaehlt, nicht verschluckt.
          if (art === "erwaehnung" && erwaehnungGemalt >= erwaehnungBudget) {
            gekappt++;
            continue;
          }
          const dx = b.x - a.x, dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          const off = beulenLenke(len);
          if (keil) {
            const form = KEIL_PX[Math.min(band, KEIL_PX.length - 1)];
            const band2 = richtungsBand(a, b, {
              rQuelle: a.r,
              rZiel: b.r,
              breit: form[0] / skalar,
              duenn: form[1] / skalar,
              beule: off,
            });
            if (band2.length === 0) continue;
            ctx.moveTo(band2[0].x, band2[0].y);
            for (let i = 1; i < band2.length; i++) ctx.lineTo(band2[i].x, band2[i].y);
            ctx.closePath();
            gemalt++;
            // Das Etikett einer Kante wird einmal gesammelt, nicht je Zug —
            // sonst staende dieselbe Aussage zweimal im Vorrat. Ohne Zeiger
            // gibt es nur einen Zug, und der sammelt.
            if ((!teilt || nahez) && kantenEtikett(e)) etikettenmoeglich.push(e);
            continue;
          }
          ctx.moveTo(a.x, a.y);
          if (art === "vermutung" || ansichtRef.current === "dendrogram") {
            // Baum: gerade Verbindung — der Dendrogramm-Look lebt von den klaren
            // Linien zwischen den Ebenen, nicht von Federn.
            ctx.lineTo(b.x, b.y);
          } else {
            ctx.quadraticCurveTo((a.x + b.x) / 2 - (dy / len) * off, (a.y + b.y) / 2 + (dx / len) * off, b.x, b.y);
          }
          gemalt++;
          if (art === "erwaehnung") erwaehnungGemalt++;
          if ((art === "behauptung" || art === "abgelaufen") && (!teilt || nahez)) {
            if (kantenEtikett(e)) etikettenmoeglich.push(e);
          }
        }
        // Der geteilte Zug: die Nachbarschaft des Zeigers in voller Staerke, der
        // Rest bei α 0,08. Im Baum wird nicht geteilt — dort SIND die Linien die
        // Struktur, und wer eine Zeile anfasst, soll nicht den Baum verlieren.
        ctx.globalAlpha = Math.min(
          1,
          (teilt && !nahez
            ? 0.08
            : art === "behauptung"
              ? (hov ? 0.9 : 0.55)
              : art === "abgelaufen"
                ? (hov ? 0.6 : 0.3)
                : art === "erwaehnung"
                  ? (hov ? 0.85 : 0.34)
                  : hov ? 0.5 : 0.22) * kantenVerstaerkung
        );
        if (gemalt > 0) {
          if (keil) ctx.fill();
          else ctx.stroke();
        }
        ctx.globalAlpha = 1;
        }
      }
    }
    ctx.setLineDash([]);

    // --- Selbstbehauptungen: ein Ring am eigenen Knoten ---
    // Dieselbe Zeichenklasse wie die Behauptung — gleiche Farbe, gleiche Dicke
    // nach Belegen. Kein Etikett an der Schlinge: ihr Mittelpunkt ist der
    // Knoten selbst, und dort steht schon sein Name.
    for (const e of selbstRef.current) {
      const knoten = index.get(e.source);
      if (!knoten || knoten !== index.get(e.target) || !imBild(knoten)) continue;
      const s = selbstSchleife(knoten.x, knoten.y, knoten.r);
      const band = Math.min(BREITE_PX.behauptung.length - 1, dickeBand(e));
      ctx.strokeStyle = akzent;
      ctx.lineWidth = BREITE_PX.behauptung[band] / skalar;
      ctx.globalAlpha = Math.min(1, (hov === e.source ? 0.9 : 0.55) * kantenVerstaerkung);
      ctx.beginPath();
      ctx.arc(s.cx, s.cy, s.rad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // --- Knoten ---
    const sp = holeSprites(notenFarbenRef.current, nodeRim, nodeHi);
    const beschriftbar: { n: LayoutNode; m: Memory; r: number; rb: number }[] = [];
    /** Wie viele der gemalten Notizen ausgegraut sind — die vierte Zahl des Titel-Etats. */
    let verblasen = 0;
    /**
     * Sehr kleine Knoten, gesammelt nach Farbe UND Deckkraft: x, y, Kantenlaenge.
     *
     * Ein Sprite ist ein 128er Bild. Solange es auf weniger als einen Bildpunkt
     * schrumpfte, hat der Browser es faktisch weggelassen — der Graph war
     * schnell, WEIL er unsichtbar war. Sobald ein Knoten wirklich sichtbar wird,
     * rastert er 25 000 gefilterte Bildkopien pro Bild, und daraus wurde eine
     * Sekunde je Bild. In dieser Groesse traegt die Schattierung eines Sprites
     * ohnehin nichts bei: ein Quadrat in der Typfarbe sieht genauso aus. Alle
     * gleichfarbigen kommen in EINEN Pfad und werden mit einem fill() gemalt.
     */
    const winzig = new Map<string, number[]>();
    let imRahmenNoten = 0;
    /** Wie viele davon mit ihrer gemalten Ausdehnung im Rahmen stehen — die Zahl der Rahmen-Zeile. */
    let imStrengeNoten = 0;
    // Die drei Zeichen, die einen Stand in der Zeit tragen: der gestrichelte
    // Ring, die leisere Tinte, der Akzentring. A8-05 zahlte sie vor — sie
    // kommen in der Legende nicht vor, und genau sie entscheiden, ob ein
    // abgelaufener Satz fuer gueltig gehalten wird. Gezaehlt wird, was gemalt
    // ist, nicht was die Datenbank traegt.
    let abgelaufenImBild = 0;
    let ersetztImBild = 0;
    let angeheftetImBild = 0;
    for (const n of sim.nodes) {
      if (!imBild(n)) continue;
      const m = byIdRef.current.get(n.id);
      if (!m) continue;
      // Eine Notiz, die im Rahmen steht — die Zahl hinter ihr ist die, die ein
      // Mensch mit eigenen Augen nachzaehlen kann (F8-N1).
      imRahmenNoten += 1;
      const r = n.r;
      const istHov = hov === n.id;
      const gedimmt = (hov !== null && !istHov && !nachbarn?.has(n.id)) || (!!spot && !spot.has(n.id));
      const zeitInaktiv = zeit !== null && !existsAt(m, zeit);
      const ersetzt = !!m.supersededBy;
      if (ersetzt) ersetztImBild++;
      ctx.globalAlpha = zeitInaktiv ? 0.06 : gedimmt ? 0.14 : ersetzt ? 0.55 : 1;

      // Kein Groessendeckel mehr: die Kollision haelt die Knoten auseinander,
      // also darf Heranzoomen wieder einfach groesser bedeuten.
      //
      // Nach unten dagegen SCHON eine Grenze. Bei 25 000 Notizen steht die
      // Uebersicht auf 4 % Zoom, und ein Knoten von 8 Welteinheiten wird dort
      // 0,32 Bildpunkte gross — kleiner als ein Bildpunkt. Der Graph war
      // vollstaendig da und trotzdem fast unsichtbar: ein schwarzes Feld mit
      // ein paar Staubkoernern. Genau das ist gemeint, wenn bei viel Wissen
      // "kein Ueberblick" bleibt. Mit einer Untergrenze auf dem SCHIRM wird
      // aus der Punktwolke wieder eine lesbare Dichte.
      const rrBasis = istHov ? r + 3 / t.k : r;
      const rr = Math.max(rrBasis, MIN_KNOTEN_PX / t.k);
      // Die Rahmen-Auskunft zählt streng: nur was mit seiner gemalten Ausdehnung
      // im Rahmen steht, gilt als „in this picture". Der Umfang der Titel-Bilanz
      // bleibt die Maleihe — beide Zeilen müssen aus derselben Menge rechnen.
      if (imRahmen(n, rr)) imStrengeNoten += 1;
      const herkunftArt = aktiverKanalRef.current === "herkunft" ? herkunftRef.current.get(n.id) : undefined;
      const typ = herkunftArt ?? (m.type && sp[m.type] ? m.type : "neutral");
      const farbe = notenFarbenRef.current[typ];

      // Winzig: sammeln statt einzeln malen.
      //
      // Gebuendelt wird nach Farbe UND Deckkraft. Zuerst nur nach Farbe, und
      // alles Ausgegraute fiel heraus — mit fatalen Folgen genau dort, wo viel
      // ausgegraut ist: der Zeitregler blendet fast alles als Geist aus, und
      // ein ueberfahrener Knoten dimmt den ganzen Rest. Gemessen an 3148
      // Notizen kippte das Bild von 6258 gebuendelten Rechtecken auf ueber
      // 6000 einzelne Bildkopien JE BILD. Das ist das Flackern beim Schieben
      // des Zeitreglers.
      //
      // Ausgenommen bleiben nur die wenigen, die etwas Eigenes tragen: der
      // Knoten unter dem Zeiger, angeheftete (Ring), ersetzte und abgelaufene.
      if (
        rr * t.k < KLEIN_AB_PX &&
        !istHov && !ersetzt && !n.pinned && m.validTo == null
      ) {
        const schluessel = `${farbe}|${ctx.globalAlpha}`;
        const punkte = winzig.get(schluessel);
        if (punkte) punkte.push(n.x - rr, n.y - rr, rr * 2);
        else winzig.set(schluessel, [n.x - rr, n.y - rr, rr * 2]);
        if (!zeitInaktiv && !gedimmt) beschriftbar.push({ n, m, r: rr, rb: rrBasis });
        else verblasen++;
        continue;
      }

      // Genauigkeitsstufe nach Bildschirmgroesse: klein bleibt ein Sprite
      // (schnell, tausendfach), gross wird als echte Kugel gemalt (scharf).
      // Vorher galt ueberall das Sprite — beim Heranzoomen wurde ein 128er
      // Bild auf 300 px gezogen und der Knoten sah matschig aus.
      if (rr * t.k >= VEKTOR_AB_PX) {
        // Kugel mit klarer Kante.
        //
        // Vorher lief der Verlauf ueber den ganzen Radius bis zu einem weichen
        // dunklen Saum — beim Heranzoomen sah der Knoten dadurch verwaschen aus
        // statt rund. Jetzt traegt der Koerper eine flaechige Farbe, das Licht
        // sitzt als kleiner harter Punkt oben links, und die Kante ist eine
        // gezeichnete Linie statt eines auslaufenden Verlaufs.
        ctx.fillStyle = farbe;
        ctx.beginPath();
        ctx.arc(n.x, n.y, rr, 0, Math.PI * 2);
        ctx.fill();
        // Modellierung: nur das aeussere Drittel dunkelt ab.
        const tiefe = ctx.createRadialGradient(n.x, n.y, rr * 0.62, n.x, n.y, rr);
        tiefe.addColorStop(0, "rgba(0,0,0,0)");
        tiefe.addColorStop(1, nodeShade);
        ctx.fillStyle = tiefe;
        ctx.fill();
        // Licht oben links, klein und deutlich begrenzt.
        const licht = ctx.createRadialGradient(
          n.x - rr * 0.36, n.y - rr * 0.4, 0,
          n.x - rr * 0.36, n.y - rr * 0.4, rr * 0.62
        );
        licht.addColorStop(0, `rgba(255,255,255,${nodeHi})`);
        licht.addColorStop(0.55, `rgba(255,255,255,${(nodeHi * 0.16).toFixed(3)})`);
        licht.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = licht;
        ctx.fill();
        // Kante — auf hellem Grund dunkel, auf dunklem hell
        ctx.strokeStyle = nodeRim;
        ctx.lineWidth = Math.max(0.6, 1.4 / t.k);
        ctx.stroke();
        // Glanzpunkt
        ctx.beginPath();
        ctx.ellipse(n.x - rr * 0.34, n.y - rr * 0.4, rr * 0.16, rr * 0.1, -0.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${Math.min(0.9, nodeHi + 0.15).toFixed(2)})`;
        ctx.fill();
        // Der Buchstabe der Art, erst ab der Vektorgroesse: auf einem Sprite
        // (unter 15 Bildpunkten) wäre er ein Fussel, und dieser Pfad malt
        // Zehntausende Knoten — dort darf nichts on top kommen.
        const buchstabe = GLYPH_FUER_ART[m.type ?? ""];
        if (buchstabe) zeichneGlyph(ctx, n.x, n.y, rr, buchstabe, farbe, t.k);
      } else {
        const bild = sp[typ];
        if (bild) {
          ctx.drawImage(bild, n.x - rr, n.y - rr, rr * 2, rr * 2);
        } else {
          ctx.fillStyle = farbe;
          ctx.beginPath();
          ctx.arc(n.x, n.y, rr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Abgelaufen: gestrichelter Ring
      if (m.validTo != null && m.validTo < Date.now()) {
        abgelaufenImBild++;
        ctx.strokeStyle = textFarbe;
        ctx.lineWidth = 1.2 / Math.max(0.4, t.k);
        ctx.setLineDash([4 / Math.max(0.4, t.k), 3 / Math.max(0.4, t.k)]);
        ctx.beginPath();
        ctx.arc(n.x, n.y, rr + 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // Angeheftet: an dieser Stelle hat der Nutzer den Knoten selbst abgelegt.
      // Der Ring beantwortet die Frage, warum ausgerechnet dieser sich nicht
      // mehr mitbewegt. Der Abstand ist in Bildpunkten gerechnet, damit der
      // Ring bei jedem Zoom gleich weit aussen sitzt.
      if (n.pinned) {
        angeheftetImBild++;
        ctx.strokeStyle = akzent;
        ctx.lineWidth = 1.6 / Math.max(0.4, t.k);
        ctx.beginPath();
        ctx.arc(n.x, n.y, rr + 3 / Math.max(0.01, t.k), 0, Math.PI * 2);
        ctx.stroke();
      }
      if (istHov) {
        ctx.strokeStyle = akzent;
        ctx.lineWidth = 2 / Math.max(0.4, t.k);
        ctx.beginPath();
        ctx.arc(n.x, n.y, rr + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (!zeitInaktiv && !gedimmt) beschriftbar.push({ n, m, r: rr, rb: rrBasis });
      else verblasen++;
    }

    // Die gesammelten Winzlinge, nach Farbe gebuendelt.
    //
    // fillRect je Knoten, NICHT ein Pfad mit 25 000 Teilstuecken und einem
    // fill(). Beides gemessen, unter derselben Transformation und auf einer
    // Leinwand dieser Groesse: 25 000 Rechtecke einzeln 5,9 ms, als ein Pfad
    // 18,4 ms, als Sprite-Kopien 29,9 ms. Ein achsenparalleles Rechteck ist
    // fuer den Rasterer ein Sonderfall; ein Pfad mit Tausenden Teilstuecken
    // muss dagegen als Ganzes zerlegt werden.
    if (winzig.size > 0) {
      for (const [schluessel, punkte] of winzig) {
        const trenner = schluessel.lastIndexOf("|");
        ctx.fillStyle = schluessel.slice(0, trenner);
        ctx.globalAlpha = Number(schluessel.slice(trenner + 1)) || 1;
        for (let i = 0; i < punkte.length; i += 3) ctx.fillRect(punkte[i], punkte[i + 1], punkte[i + 2], punkte[i + 2]);
      }
      ctx.globalAlpha = 1;
    }

    // --- Gerüst-Knoten: im Baum Wurzel/Typen/Entitäten, im Feld die Konzepte ---
    // Sie haben keine Memory — der Knoten-Durchgang oben ueberspringt sie, sie
    // tragen aber die Hierarchie und brauchen Farbe, Ring und Hervorhebung.
    // Beide Ansichten nutzen dieselben Schlüssel ("__ent:..."), damit der
    // Übergang zwischen Baum und Feld ein Gleiten ist und kein Umbau.
    const struktur = strukturKnotenRef.current;
    // Die Malzeichen der Faltung werden gesammelt und am Ende IN BILDPIXELN
    // gemalt — ein Zustand, der erst beim Heranzoomen erschiene, wäre keiner.
    const faltBadges: { sx: number; sy: number; text: string }[] = [];
    if (struktur) {
      for (const n of sim.nodes) {
        const s = struktur.get(n.id);
        if (!s || !imBild(n)) continue;
        // Ein Gerüst-Knoten ohne Art trägt die neutrale Rolle desselben
        // Registers, nicht eine Handfarbe: Wurzel, Typ und Entität sind keine
        // Notiz.
        const farbe = (s.farbe && farbenRef.current[s.farbe]) || farbenRef.current.neutral;
        ctx.globalAlpha = 1;
        ctx.fillStyle = farbe;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = nodeRim;
        ctx.lineWidth = Math.max(0.6, 1.2 / t.k);
        ctx.stroke();
        if (hov === n.id) {
          ctx.strokeStyle = akzent;
          ctx.lineWidth = 2 / Math.max(0.4, t.k);
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 4, 0, Math.PI * 2);
          ctx.stroke();
        }
        // Die Zahl der Notizen, die dieser Begriff traegt — dieselbe Auskunft,
        // die das gehaltene Etikett gibt, aber ohne Nachfrage lesbar. Die Eine
        // bleibt weg: sie füllt das Gesicht des Knotens und sagt nichts. Eine
        // vierstellige Zahl passt nicht in eine Scheibe und bleibt ebenfalls.
        if (s.eingeklappt) {
          faltBadges.push({
            sx: n.x * t.k + t.x,
            sy: (n.y - n.r) * t.k + t.y,
            text: `×${s.verdeckt ?? s.blaetter ?? 0}`,
          });
        } else if (n.r * t.k >= VEKTOR_AB_PX && s.blaetter !== undefined && s.blaetter > 1 && s.blaetter < 1000) {
          zeichneGlyph(ctx, n.x, n.y, n.r, String(s.blaetter), farbe, t.k);
        }
      }
    }

    // --- Beschriftung: begrenzt und nach Wichtigkeit ---
    // Die alte Fassung malte jedes Etikett ab Radius 12 — bei 348 Knoten wurde
    // daraus ein unlesbarer Teppich (siehe Aufnahme). Jetzt gilt eine harte
    // Obergrenze, sortiert nach Verbindungsgrad.
    beschriftbar.sort((a, b) => (degreeRef.current.get(b.n.id) ?? 0) - (degreeRef.current.get(a.n.id) ?? 0));
    // Der Grund, Etiketten wegzulassen, ist GEDRAENGE — nicht die Knotengroesse.
    //
    // Vorher hing die Regel allein am Radius (ab 7 px auf dem Schirm). Eine
    // frische Wissensbasis hat aber lauter unverbundene Notizen, also lauter
    // Knoten mit dem Mindestradius: bei zwoelf Notizen wurde KEIN einziger Titel
    // gezeichnet, der Graph zeigte zwoelf namenlose Punkte. Auch die 3 px danach
    // waren so eine Kante: 60 Notizen bei 73 % Zoom lagen als Punkte ohne einen
    // einzigen Titel da. Die Schwelle hält jetzt Staub fern (25 000 Knoten bei
    // 4 % Zoom), nicht die kleine Basis — was im Gedränge sichtbar bleibt,
    // entscheidet das Belegungsraster weiter unten.
    const mindestRadius = 1.5;
    const baumAnsicht = ansichtRef.current === "dendrogram";
    // Was der Zeiger oder die Tastatur haelt, kriegt immer sein Etikett — auch
    // auf „keine". Eine Fläche, die auf Nachfrage schweigt, ist keine Auskunft.
    const gehaltenId = hov ?? tastaturIdRef.current;
    const modus = etikettenModusRef.current;
    const stufe = NAMEN_STUFE[modus];
    // Der Baum traegt mehr Namen als das Feld, weil seine Zeilen schon ein
    // Raster sind: dieselbe Stufe, dreimal so viel Platz (A7-02).
    // Der Gang beschriftet sich erst, wenn seine Reihen Platz fuer eine Titelzeile
    // lassen. Die Reihen stehen in WELTeinheiten (GANG_ABSTAND) und schrumpfen mit
    // dem Zoom: bei 46 % ware eine Reihe 12 Bildpunkte hoch, ein Titel ist 14 hoch
    // und darunter steht noch die Tags-Zeile — die Titel einer Reihe lagen in den
    // Punkten der naechsten und ueber der Zahl am Band (gemessen 15.10. im
    // 820-er Fenster, leitung-bilder/ausschnitt-legende-820.png). Was an Namen
    // fehlt, sagt die Zahl am Band selbst, und beim Hereinzoomen kommen die Titel.
    const gangZuEng = GANG_ABSTAND * t.k < TITEL_REIHE_PX;
    const kandidaten =
      gangZuEng && (sim.gangIds?.size ?? 0) > 0
        ? beschriftbar.filter(({ n }) => !sim.gangIds?.has(n.id) || n.id === gehaltenId)
        : beschriftbar;
    /** Wie viele Kandidaten in zu engen Gang-Reihen standen (fuenfter Grund des Titel-Etats). */
    const reihtenZuEng = beschriftbar.length - kandidaten.length;
    // Zwei Breiten, die nur die Flaeche selbst kennt: was ein Zeichen und was die
    // Auslassung in dem Schnitt kostet, mit dem sie gleich malt. Beides traegt
    // hier eine Rechnung, die vorher eine Konstante war — die Kuerzung des Gangs
    // (#17) und der Etat des Bildes (#29).
    const fs = ETIKETT_PX;
    const schriftDerFlaeche = `600 ${fs}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
    const schriftVorher = ctx.font;
    ctx.font = schriftDerFlaeche;
    const paarBreite = ctx.measureText(GANG_PROBE_PAAR).width;
    const auslassungBreite = ctx.measureText(GANG_PROBE_AUSLASSUNG).width;
    ctx.font = schriftVorher;
    const zeichenBreite = paarBreite / 2;
    /** Eine Rasterzelle: die Titelhoehe plus ihr Atemzug — dieselbe Zahl wie unten. */
    const zellHoehe = fs + 3;
    const gangGrenze = gangKuerzungZeichen(t.k, paarBreite, auslassungBreite);
    // Der Etat ist, was das Fenster fasst: Zellen des Belegungsrasters, geteilt
    // durch die Zellen, die ein Titel dieser Stufe belegt. Der Baum traegt mehr,
    // weil seine Zeilen schon ein Raster sind (A7-02).
    const kapazitaet = titelEtatAusLeinwand(
      dimensions.w,
      dimensions.h,
      stufe.kuerzung * zeichenBreite + auslassungBreite,
      zellHoehe,
    );
    const budget = stufe.grenzenlos ? Number.MAX_SAFE_INTEGER : kapazitaet * (baumAnsicht ? 3 : 1);
    // Die engere Pforte als die breitere Stufe: was im Feld als
    // Kandidat durchfaellt, kann kein Raster und kein Budget der Welt
    // benennen. Bei 400 Notizen auf 27 % Zoom standen dort 0 von 400 —
    // nicht, weil der Platz fehlte, sondern weil die Knoten unter
    // mindestRadius fielen. „Many" offnet diese Pforte auf die
    // Haelfte; das Belegungsraster entscheidet weiterhin, was bleibt.
    const durchDiePforte =
      modus === "keine" || modus === "alle"
        ? kandidaten
        : kandidaten.filter(
            // Die Pforte urteilt ueber die WAHRE Groesse. `r` ist auf dem Bildschirm
            // auf MIN_KNOTEN_PX angehoben, damit man den Knoten sieht; gegen diesen
            // Boden zu pruefen kann nie schlagen — nur die Rundung tat es.
            ({ n, rb }) => hov === n.id || nachbarn?.has(n.id) || rb * t.k >= mindestRadius * stufe.pforte
          );
    /** Wie viele Kandidaten an der Pforte fielen (sechster Grund des Titel-Etats). */
    const pforteFallaeller = kandidaten.length - durchDiePforte.length;
    const etiketten =
      modus === "keine" ? kandidaten.filter(({ n }) => n.id === gehaltenId) : durchDiePforte.slice(0, budget);
    /** Wie viele nach der Pforte am Budget standen (siebter Grund des Titel-Etats). */
    const ueberBudget = modus === "keine" ? 0 : durchDiePforte.length - etiketten.length;
    // „alle" ist die eine Stellung ohne Raster: wer alles will, bekommt alles —
    // genau deshalb ist sie nicht die Einstellung, in der die Flaeche startet.
    const ohneRaster = !stufe.raster;

    // --- Text in BILDPIXELn ---
    //
    // Vorher sass jede Schrift in der Weltn transformation und wurde mit
    // `11 / k` gegen-skaliert — bei 15 Welt-Pixeln zugedeckelt. Bei 12 % Zoom
    // auf dem Schirm gemessen: 1,4 px. Kein Wort war noch zu lesen, die Kopfzeile
    // behauptete derweil „1 500 notes". Der ganze Textauschnitt läuft deshalb
    // ausserhalb der Transformation: feste Bildpixel, bei jedem Zoom, und was
    // nicht passt, entscheidet allein das Belegungsraster.
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.lineJoin = "round";

    // Belegungsraster in BILDSCHIRM-Koordinaten: ein Etikett, das ein bereits
    // gezeichnetes ueberdeckt, wird weggelassen. Ohne das entsteht bei dichten
    // Buendeln der Teppich aus uebereinanderliegenden Titeln, den man in der
    // Aufnahme sieht — lesbar ist dort nichts mehr. Seine Zellhohe ist dieselbe
    // Zahl, aus der oben der Etat gerechnet wird.
    const belegt = new Set<string>();
    const freiUndBelegen = (mx: number, my: number, breite: number): boolean => {
      const halb = breite / 2;
      const c0 = Math.floor((mx - halb) / zellHoehe);
      const c1 = Math.floor((mx + halb) / zellHoehe);
      // Der Text sitzt mit der Oberkante auf my — er belegt zwei Rasterzeilen,
      // sonst rutschen zwei Etiketten mit halbem Zeilenversatz ineinander.
      const z0 = Math.floor(my / zellHoehe);
      const z1 = Math.floor((my + zellHoehe * 0.95) / zellHoehe);
      for (let z = z0; z <= z1; z++) for (let c = c0; c <= c1; c++) if (belegt.has(`${c},${z}`)) return false;
      for (let z = z0; z <= z1; z++) for (let c = c0; c <= c1; c++) belegt.add(`${c},${z}`);
      return true;
    };

    /**
     * Die Kante, an der ein Titel stehen darf.
     *
     * Die Kamera setzt schon auf den dichtesten Ausschnitt (`dichtesteWeltMitte`),
     * aber ein Etikett sitzt auf seinem Knoten und der kann an jeder Kante liegen:
     * gemessen 18.10. im ausgelieferten 3.2.21 waren bei 1440 px vier von 35 Titeln
     * vom Rand durchschnitten („Forschung Datensatz…"). Ein Wort, das die Kante
     * beruehrt, ist eine Haelfte ohne Auskunft — also weicht der Text in das Bild
     * hinein, der Knoten bleibt, wo er ist. `null`, wenn das Wort selbst mittig
     * nicht fasst: dann faellt es, und es hat einen eignen Grund.
     */
    const kantigX = (mx: number, breite: number): number | null => {
      const halb = breite / 2 + TITEL_KANTEN_PX;
      if (halb * 2 > dimensions.w) return null;
      return Math.min(Math.max(mx, halb), dimensions.w - halb);
    };
    /** Dieselbe Luft oben und unten — ein abgeschnittener Kopf ist kein Kopf. */
    const kantigY = (my: number, hoehe: number): number =>
      Math.min(Math.max(my, TITEL_KANTEN_PX), Math.max(TITEL_KANTEN_PX, dimensions.h - hoehe - TITEL_KANTEN_PX));

    // --- Gerüst-Etiketten (nur Baum): zuerst, und sie belegen das Raster ---
    // Vorher liefen sie als einziger Text außerhalb des Rasters und in derselben
    // Schrift wie der Inhalt: die Ebenen standen wie eine zweite Titelspalte im
    // Bild. Jetzt weicht jede Notiz, die in den Namen einer Ebene fiele, und
    // das Gerüst tritt mit --text-2 zurueck. Nicht mit Groesse: die Leiter
    // hat nichts unter 11 px, also unterscheidet hier das Gewicht.
    if (struktur) {
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = `400 ${fs}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
      for (const n of sim.nodes) {
        const s = struktur.get(n.id);
        if (!s || s.keinEtikett || !imBild(n)) continue;
        // Wer über einem Begriff steht oder ihn mit den Pfeiltasten hält,
        // fragt genau dann: was ist das und wie viel trägt es? Für die Antwort
        // gilt die Kürzung nicht — und das gehaltene Etikett weicht nicht mehr
        // weg, es hat Vorrang im Raster.
        const gehalten = hov === n.id || tastaturIdRef.current === n.id;
        // „Keine" meint alle Etiketten — auch die des Gerüsts. Was der Zeiger
        // hält, kommt zurück: eine Fläche, die auf Nachfrage schweigt, ist keine
        // Auskunft.
        if (modus === "keine" && !gehalten) continue;
        const titel = gehalten && s.blaetter !== undefined
          ? `${s.label} · ${s.blaetter} ${s.blaetter === 1 ? "note" : "notes"}`
          : s.label.length > GERUEST_ZEICHEN
            ? `${s.label.slice(0, GERUEST_ZEICHEN)}…`
            : s.label;
        const mitteX = (n.x + n.r) * t.k + t.x + 3;
        const mitteY = n.y * t.k + t.y;
        const breite = ctx.measureText(titel).width;
        // halbe Zeilenhoehe hoch, weil der Text mittig auf der Achse sitzt
        if (!gehalten && !ohneRaster && !freiUndBelegen(mitteX, mitteY - zellHoehe / 2, breite)) continue;
        ctx.lineWidth = 3;
        ctx.strokeStyle = grundFarbe;
        ctx.strokeText(titel, mitteX, mitteY);
        ctx.fillStyle = gehalten ? akzent : geruestFarbe;
        ctx.fillText(titel, mitteX, mitteY);
      }
    }

    ctx.font = `600 ${fs}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    // Wie viele Notizen diesen Bild ein Etikett verdanken — die Bilanzzeile am
    // Rand meldet es, damit „25 von 1 500" nicht als Selbstverstaendnis steht.
    // Die zwei Fortsetzungenzaehler gehoeren dazu: ein Titel, der faellt, faut
    // nicht einfach weg, er hat einen Grund, und der Grund ist eine Zahl.
    let benannt = 0;
    let zuBreit = 0;
    let verdraengt = 0;
    /** Titel, die selbst mittig nicht in das Bild faessen — achter Grund des Etat. */
    let anDerKante = 0;
    for (const { n, m, r } of etiketten) {
      // Der Peek: was der Zeiger oder die Tastatur haelt, wird nicht gekuerzt —
      // genau dann will jemand den ganzen Namen lesen.
      const gehalten = n.id === gehaltenId;
      const vorrat = etikettVorratRef.current;
      // Ein Gang-Titel wohnt in einer Reihe von `GANG_ABSTAND · k` Bildpixeln —
      // er darf nicht länger sein, als die Reihe breit ist. Ausserhalb des
      // Gangs entscheidet allein die Stufe, dort hängt kein Titel an einer Zelle.
      const grenze = sim.gangIds?.has(n.id) ? Math.min(stufe.kuerzung, gangGrenze) : stufe.kuerzung;
      const gespeichert = vorrat.get(n.id);
      let gelesen = gespeichert && gespeichert.grenze === grenze ? gespeichert.etikett : undefined;
      if (!gelesen) {
        gelesen = notizEtikett(m, grenze);
        vorrat.set(n.id, { grenze, etikett: gelesen });
      }
      const { text: titel, platzhalter } = gehalten ? notizEtikett(m, Infinity) : gelesen;
      const mitteX = n.x * t.k + t.x;
      const mitteY = (n.y + r) * t.k + t.y + 2;
      const breite = ctx.measureText(titel).width;
      // #91: die BREITE gegen den Spaltenteil, nicht die Höhe. Ein Gang-Titel,
      // der über seinen Teil spannt, nennt eine Nachbarschaft, der er nicht
      // gehört — gemessen 15.10. im Fall: 149 px Titel über 27 px Teil, also
      // 4,7 Spalten weit. Was der Zeiger hält, bleibt ausgenommen: auf Nachfrage
      // gilt die Kürzung nicht.
      if (!gehalten && sim.gangIds?.has(n.id) && breite > GANG_ABSTAND * t.k) {
        zuBreit++;
        continue;
      }
      // Der Knoten unter dem Zeiger und seine Nachbarn haben Vorrang und
      // ueberschreiben notfalls; alles andere weicht aus.
      const bevorzugt = hov === n.id || nachbarn?.has(n.id) === true;
      // Erst die Kante, dann das Raster: das Etikett soll dort belegen, wo es
      // wirklich steht, nicht dort, wo sein Knoten liegt.
      const xKantig = kantigX(mitteX, breite);
      if (xKantig === null) {
        anDerKante++;
        continue;
      }
      const yKantig = kantigY(mitteY, fs);
      if (!ohneRaster && !freiUndBelegen(xKantig, yKantig, breite) && !bevorzugt) {
        verdraengt++;
        continue;
      }
      ctx.lineWidth = 3;
      ctx.strokeStyle = grundFarbe;
      ctx.strokeText(titel, xKantig, yKantig);
      // Ein Etikett aus dem ersten Satz der Notiz ist ein Platzhalter und sieht
      // aus wie einer — eine Notiz ohne Titel darf nicht so tun, als haette sie
      // einen.
      ctx.fillStyle = platzhalter ? schwach : textFarbe;
      ctx.fillText(titel, xKantig, yKantig);
      benannt++;
      if (hov === n.id && m.tags.length > 0) {
        const tags = m.tags.slice(0, 3).join(" · ");
        ctx.font = `400 ${fs}px ui-sans-serif, system-ui, sans-serif`;
        ctx.strokeText(tags, xKantig, kantigY(yKantig + fs * 1.15, fs));
        ctx.fillStyle = schwach;
        ctx.fillText(tags, xKantig, kantigY(yKantig + fs * 1.15, fs));
        ctx.font = `600 ${fs}px ui-sans-serif, system-ui, sans-serif`;
      }
    }

    // --- Badges: Nachbarn, die der Kantengrenze zum Opfer fielen ---
    //
    // Ein Knoten mit drei Strichen im Bild, während die Wissensbasis sieben
    // Nachbarn kennt, ist eine Luege durch Weglassen. Die Zahl liegt schon im
    // Rapport der Kantengrenze — hier wird sie nur abgelesen, nie gerechnet.
    const versteckte = versteckteRef.current;
    if (versteckte.size > 0) {
      ctx.font = `600 ${fs}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      for (const n of sim.nodes) {
        const zahl = versteckte.get(n.id);
        if (!zahl || !imBild(n)) continue;
        // Auf einem Staubkorn ist eine Zahl Lärm, keine Auskunft.
        if (n.r * t.k < BADGE_AB_PX) continue;
        const m = byIdRef.current.get(n.id);
        // Ein Geist zum gewaehlten Zeitpunkt hat keine verborgenen Nachbarn —
        // die sind schlicht noch nicht da.
        if (m && zeit !== null && !existsAt(m, zeit)) continue;
        const bx = (n.x + n.r * 0.85) * t.k + t.x;
        const by = (n.y - n.r * 0.85) * t.k + t.y;
        ctx.lineWidth = 3;
        ctx.strokeStyle = grundFarbe;
        ctx.strokeText(`+${zahl}`, bx, by);
        ctx.fillStyle = schwach;
        ctx.fillText(`+${zahl}`, bx, by);
      }
      ctx.textBaseline = "top";
      ctx.font = `600 ${fs}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
    }

    // --- Malzeichen der Faltung: ×N ueber der Gruppe ---
    //
    // Eine zugeklappte Gruppe schuldet ihre Zahl — und die Zahl muss lesbar sein,
    // ohne dass jemand erst heranzoomt. Gesammelt im Welt-Durchgang, gemalt in
    // Bildpixeln.
    if (faltBadges.length > 0) {
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.font = `700 ${fs}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
      ctx.lineWidth = 3;
      for (const b of faltBadges) {
        ctx.strokeStyle = grundFarbe;
        ctx.strokeText(b.text, b.sx, b.sy);
        ctx.fillStyle = akzent;
        ctx.fillText(b.text, b.sx, b.sy);
      }
      ctx.textBaseline = "top";
      ctx.font = `600 ${fs}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
    }

    // --- Kanten-Etiketten: der Typ steht an der Linie ---
    //
    // Was eine Behauptung sagt, ist die Auskunft, die im Bild fehlt. Sie kommen
    // nach den Knotentiteln und teilen sich deren Raster: ein Etikett verdraengt
    // nie einen Titel, es fuellt nur, was frei bleibt. Und es erscheint erst,
    // wenn man nah genug am Netz sitzt — weit herausgezoomt ist die Form die
    // Auskunft, nicht der Text.
    if (stufe.kantentext && t.k >= KANTEN_ETIKETT_AB_ZOOM && etikettenmoeglich.length > 0) {
      const gehalten = hoverKanteRef.current;
      // Vorrang: die Kante unter dem Zeiger, dann die mit der meisten Evidenz.
      const rang = (e: LayoutEdge) => (e === gehalten ? 1_000_000 : 0) + (e.belege ?? 1) * 100 - kantenEtikett(e)!.length;
      const kandidaten = [...etikettenmoeglich].sort((x, y) => rang(y) - rang(x)).slice(0, MAX_KANTEN_ETIKETTEN);
      ctx.font = `400 ${fs}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const e of kandidaten) {
        const a = index.get(e.source);
        const b = index.get(e.target);
        if (!a || !b) continue;
        const text = kantenEtikett(e);
        if (!text) continue;
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        // Sechs Bildpunkte ueber der Linie — die Linie selbst soll lesbar
        // bleiben, und unter dem Knoten steht schon der Titel.
        const punkt = kantenMitte(a, b, beulenLenke(len));
        const sx = punkt.x * t.k + t.x;
        const sy = punkt.y * t.k + t.y - 6;
        const breite = ctx.measureText(text).width;
        const eigne = e === gehalten;
        if (!eigne && !freiUndBelegen(sx, sy - zellHoehe / 2, breite)) continue;
        ctx.lineWidth = 3;
        ctx.strokeStyle = grundFarbe;
        ctx.strokeText(text, sx, sy);
        ctx.fillStyle = eigne ? akzent : textFarbe;
        ctx.fillText(text, sx, sy);
      }
      ctx.font = `600 ${fs}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
      ctx.textBaseline = "top";
    }
    // --- Der Gang: die Zeile am Ort der Punkte ------------------------------
    //
    // Was hier liegt, hat in diesem Bild keinen Nachbarn. Die Flaeche hat zwei
    // Antworten schulig: wo sie hingehoeren, und wie viele es sind. Beides
    // steht am Ort — nicht in einem Tooltip, nicht in der Werkzeugleiste
    // (A8-Z6: Erklaerung sitzt am Zeichen).
    if (sim.allein && sim.allein > 0 && sim.alleinAnker) {
      const ankerX = sim.alleinAnker.x * t.k + t.x;
      const ankerY = sim.alleinAnker.y * t.k + t.y;
      const breite = Math.min(dimensions.w - 24, GANG_SPALTEN * GANG_ABSTAND * t.k);
      const x0 = Math.max(12, ankerX - breite / 2);
      // Die letzte Zeile, die das Bild WIRKLICH legt — nicht die, die die Masse
      // haben wollte. Bei 18.500 allein stehenden Notizen war der Satz sonst
      // 3.712 Einheiten unter dem Anker angesetzt und damit nie im Bild.
      const zeileZahl = Math.min(gangZeilen(sim.allein), GANG_REIHEN_PRO_SEITE);
      const letzteZeile = ankerY + (Math.max(1, zeileZahl) - 1) * GANG_ABSTAND * t.k;
      if (ankerY > -40 && letzteZeile < dimensions.h + 80) {
        const seiten = sim.gangSeiten ?? 0;
        const text = `${sim.allein.toLocaleString("en-US")} notes connect to nothing in this picture`
          + (seiten > 1 ? ` · page ${(sim.gangSeite ?? 0) + 1} of ${seiten.toLocaleString("en-US")}` : "");
        ctx.globalAlpha = 0.34;
        ctx.strokeStyle = textFarbe;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, ankerY - 22);
        ctx.lineTo(Math.min(dimensions.w - 12, x0 + breite), ankerY - 22);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.font = `400 ${fs}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        // Die Zeile steht UNTER dem Band, nicht darüber — und sie darf kein
        // Etikett treffen.
        //
        // Der Abstand zum tiefsten Kernknoten ist in WELTeinheiten nicht zu haben:
        // bei 42 % Zoom waren 140 Einheiten genug Luft, bei 28 % (das schmale
        // Fenster) lag der Satz quer über „Werkstatt Werkzeug 0015". Ein Band, das
        // seinen Titel selbst trägt, kann ihn nicht über etwas legen, das schon
        // dort stand. Darum: dasselbe Belegungsraster wie die Etiketten, und wenn
        // die Zeile nicht passt, rueckt sie eine Zeile tiefer — höchstens viermal,
        // sonst faellt sie weg. Gemessen 15.10. 04:5x im schmalen Fenster: der Satz
        // lag ueber drei Bandtiteln und der Trennlinie (leitung-bilder/
        // ausschnitt-legende-820.png).
        const capBreite = ctx.measureText(text).width;
        const capY0 = letzteZeile + GANG_ABSTAND * t.k * 0.5 + 6;
        let capGefunden = false;
        for (let versuch = 0; versuch < 4 && !capGefunden; versuch++) {
          const y = capY0 + versuch * zellHoehe;
          if (y + zellHoehe > dimensions.h - 4) break;
          if (!ohneRaster && !freiUndBelegen(x0 + capBreite / 2, y, capBreite)) continue;
          ctx.lineWidth = 3;
          ctx.strokeStyle = grundFarbe;
          ctx.strokeText(text, x0, y);
          ctx.fillStyle = geruestFarbe;
          ctx.fillText(text, x0, y);
          capGefunden = true;
        }
      }
    }

    ctx.restore();

    // Die Bilanz, was das Bild benennt. Geschrieben direkt an den Rand, nicht
    // ueber den Zustand: ein Wert pro Bild waere eine Rendering-Kette pro Bild,
    // und die Zahl aendert sich mit jedem Schwenk.
    {
      const zeile = benanntRef.current;
      if (zeile) {
        // Der Umfang ist, was das Bild traegt — nicht der Bestand dahinter. Was
        // ausserhalb liegt, sagt die Zeile ueber dem Rahmen; hier geht es um
        // Namen, und ein Grund ausserhalb des Bildes erklaert keinen.
        const umfang = imRahmenNoten;
        // Der selbst gewaehlte Modus „None" versaeumt nichts, also bekommt er
        // keine Begruendung — und ein Bild, das alle benennt, schweigt ganz.
        const gruende: [number, string][] =
          modus === "keine"
            ? []
            : [
                [verblasen, "faded by the filter or the pointer"],
                [reihtenZuEng, "in rows too tight for a title"],
                [pforteFallaeller, "too small for a name at this zoom"],
                [ueberBudget, `over the ${mengenzahl(budget)} names this picture allows`],
                [zuBreit, "a title wider than its row"],
                [verdraengt, "crowded out by a name already there"],
                [anDerKante, "wider than the picture itself"],
              ];
        // Was das Fenster fasst, ist eine Messung des Bildes — keine Klage: der
        // Grund am Satz erscheint nur, wenn etwas am Budget fiel, und ein kleines
        // Fenster benennt oft alles, was es faesst.
        const etatZahl = modus === "keine" || stufe.grenzenlos ? "" : mengenzahl(budget);
        if (zeile.dataset.etat !== etatZahl) zeile.dataset.etat = etatZahl;
        const meldung = titelEtat(benannt, umfang, gruende);
        if (zeile.textContent !== meldung) zeile.textContent = meldung;
        const anzeige = meldung === "" ? "none" : "";
        if (zeile.style.display !== anzeige) zeile.style.display = anzeige;
      }
      // Die Zustandszeichen, erklaert an dem Ort, der sie zeigt — nur wenn
      // etwas von ihnen im Bild steht (dieselbe Zurueckhaltung wie die Bilanz).
      const zustZeile = zustandRef.current;
      if (zustZeile) {
        const klausel: string[] = [];
        if (abgelaufenImBild > 0) klausel.push(`dashed ring — it no longer holds (${abgelaufenImBild})`);
        if (ersetztImBild > 0) klausel.push(`fainter ink — replaced (${ersetztImBild})`);
        if (angeheftetImBild > 0) klausel.push(`accent ring — you set it down here (${angeheftetImBild})`);
        const meldung = klausel.length ? `States here: ${klausel.join(", ")}` : "";
        if (zustZeile.textContent !== meldung) zustZeile.textContent = meldung;
        const anzeige = meldung === "" ? "none" : "";
        if (zustZeile.style.display !== anzeige) zustZeile.style.display = anzeige;
      }
      const kapZeile = kappenRef.current;
      if (kapZeile) {
        const meldung = gekappt > 0
          ? `${mengenzahl(gekappt)} of ${mengenzahl(erwaehnungGemalt + gekappt)} mention links left out for the picture's space`
          : "";
        if (kapZeile.textContent !== meldung) kapZeile.textContent = meldung;
        const anzeige = meldung === "" ? "none" : "";
        if (kapZeile.style.display !== anzeige) kapZeile.style.display = anzeige;
      }
      // Wie viele der entfalteten Notizen wirklich im Bild stehen. Der Baum
      // ueberschreitet seinen Rahmen jetzt bewusst (er zoomt sich nicht unter
      // die Lesbarkeit) — was ausserhalb liegt, sagt die Zeile.
      const rahmenZeile = imRahmenRef.current;
      if (rahmenZeile) {
        const gesamt = imBildRef.current;
        const meldung = imStrengeNoten >= gesamt
          ? ""
          : imStrengeNoten === 0
            ? "no unfolded notes are in this picture — the tree is taller than its frame, pan to read it"
            : `${mengenzahl(imStrengeNoten)} of ${mengenzahl(gesamt)} unfolded notes are in this picture`;
        if (rahmenZeile.textContent !== meldung) rahmenZeile.textContent = meldung;
        const anzeige = meldung === "" ? "none" : "";
        if (rahmenZeile.style.display !== anzeige) rahmenZeile.style.display = anzeige;
      }
    }

    // Der Tooltip haengt an der Kante, nicht am Etikett-Budget: auch weit
    // herausgezoomt und auch ohne freien Platz in der Rasterzelle folgt er der
    // Linie, solange der Zeiger auf ihr steht. Und er verschwindet mit ihr —
    // eine Karte über einer Lücke erzaehlt etwas, das niemand mehr sieht.
    {
      const el = kantTooltipRef.current;
      const gehalten = hoverKanteRef.current;
      // Die Schlinge einer Selbstbehauptung steht nicht in sim.edges — sonst
      // erschiene ihre Karte genau einmal, um im nächsten Bild gelöscht zu werden.
      const nochDa = !!gehalten
        && (sim.edges.includes(gehalten) || selbstRef.current.includes(gehalten))
        && !!index.get(gehalten.source) && !!index.get(gehalten.target);
      if (gehalten && !nochDa) {
        hoverKanteRef.current = null;
        setKantInfo(null);
      } else if (el && gehalten) {
        const a = index.get(gehalten.source)!;
        const b = index.get(gehalten.target)!;
        const gerade = kanteIstGerade(
          gehalten,
          ansichtRef.current === "dendrogram",
          richtungRef.current && t.k >= KEIL_AB_ZOOM
        );
        const punkt = kartenAnker(a, b, gerade);
        const lage = kartenLage(punkt.x * t.k + t.x, punkt.y * t.k + t.y, dimensions, el);
        el.style.transform = `translate(${Math.round(lage.x)}px, ${Math.round(lage.y)}px) translate(-50%, 0)`;
      }
    }

    // Tastatur-Auswahl: ein gepunkteter Zierring in Siegelrot. Er liegt
    // UEBER allem — wer mit Pfeiltasten reist, verliert seinen Knoten nie.
    const takId = tastaturIdRef.current;
    if (takId) {
      const tak = sim.nodes.find((k) => k.id === takId);
      if (tak) {
        ctx.lineWidth = 2 / t.k;
        ctx.setLineDash([5 / t.k, 3.5 / t.k]);
        ctx.strokeStyle = akzent;
        ctx.beginPath();
        ctx.arc(tak.x, tak.y, tak.r + 5 / t.k, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    ctx.restore();
  }, [dimensions, holeSprites]);

  // --- Bildschleife: rechnet nur, solange sich etwas bewegt ---
  /**
   * Die Sichtbarkeit des FENSTERS, nicht der Ansicht.
   *
   * Die Schleife unten durfte nicht anlaufen, wenn `document.hidden` beim ersten
   * Effect-Lauf true war — ein Graph, der in einem verdeckten Fenster geöffnet
   * wurde, malt in diesem Programmzyklus nie wieder. Gemessen 15.10. 19:05 an
   * Damians laufender App: Fenster sichtbar, Leinwand 300x150 (ihr
   * HTML-Default), Zoom 3 %, Feld leer; erst eine Größenänderung holte sie zurück
   * (1940x1384, 9 %). `document.hidden` war weder Abhängigkeit noch hatte es
   * einen Hörer. Also: einmal hören, und die Antwort in den Zustand.
   */
  const [fensterSichtbar, setzeFensterSichtbar] = useState(
    () => typeof document === "undefined" || !document.hidden
  );
  useEffect(() => {
    const melden = () => setzeFensterSichtbar(!document.hidden);
    document.addEventListener("visibilitychange", melden);
    return () => document.removeEventListener("visibilitychange", melden);
  }, []);
  useEffect(() => {
    let laeuft = true;
    let raf = 0;
    const schleife = () => {
      if (!laeuft) return;
      const sim = simRef.current;
      if (sim) {
        if (ansichtRef.current === "dendrogram" || ansichtRef.current === "semantic") {
          // Baum und Projektion: kein Physik-Loop — die Knoten gleiten auf ihre
          // Zielstellen und ruhen dann. Loslassen einer Bewegung = Auto-Fit.
          const bewegt = stepDendrogram(sim.nodes, zielRef.current, reduzierteBewegung.current ? 1 : undefined);
          if (bewegt) zeichneNoetig.current = true;
          if (autoFitOffen.current && !bewegt && sim.nodes.length > 0) {
            autoFitOffen.current = false;
            fitBaumAnsicht();
          }
        } else {
          const uebergang = uebergangRef.current;
          if (uebergang.size > 0) {
            // Baum→Kraftfeld: erst der weiche Übergang auf die letzten
            // Kraftfeld-Positionen, DANACH übernimmt die Physik.
            const gleitet = stepDendrogram(sim.nodes, uebergang, reduzierteBewegung.current ? 1 : undefined);
            if (gleitet) {
              zeichneNoetig.current = true;
            } else {
              uebergangRef.current = new Map();
              zeichneNoetig.current = true;
            }
          } else {
            const bewegt = !isSettled(sim) || draggingRef.current !== null;
            if (bewegt) {
              stepSimulation(sim);
              zeichneNoetig.current = true;
              // Sobald das Layout steht, einmal alles zeigen — statt eines
              // willkuerlichen Ausschnitts mitten im Knaeuel.
              if (autoFitOffen.current && isSettled(sim) && sim.nodes.length > 0) {
                autoFitOffen.current = false;
                transformRef.current = feldTransform(layoutBounds(sim.nodes, randFuerAnsicht(sim.nodes)), titelAnker(sim));
                setZoomAnzeige(transformRef.current.k);
              }
            } else if (refitFaellig(autoFitOffen.current, bewegt, sim.nodes.length)) {
              // A7-09: dasselbe Ruhe-Ereignis, wenn das Feld beim ersten Bild des
              // Loops SCHON stand — ein wiedergenommener, ausgekuehlter Bestand
              // (Filterwechsel) durchlief den Bewegungszweig nie und blieb auf dem
              // Ausschnitt sitzen, der fuer seine Ausgangspositionen gerechnet war.
              autoFitOffen.current = false;
              transformRef.current = feldTransform(layoutBounds(sim.nodes, randFuerAnsicht(sim.nodes)), titelAnker(sim));
              setZoomAnzeige(transformRef.current.k);
              zeichneNoetig.current = true;
            }
          }
        }
      }
      if (zeichneNoetig.current) {
        zeichneNoetig.current = false;
        zeichne();
      }
      raf = requestAnimationFrame(schleife);
    };
    // Das Dashboard haelt alle Ansichten gemountet und versteckt sie nur per
    // CSS — ohne diese Sperre zeichnet der Graph unsichtbar weiter und hielt
    // den Renderer dauerhaft bei 84 % CPU, egal welche Ansicht offen war.
    if (!sichtbar || !fensterSichtbar) {
      zeichneNoetig.current = true; // beim Wiederkommen einmal frisch zeichnen
      return () => { laeuft = false; };
    }
    raf = requestAnimationFrame(schleife);
    return () => { laeuft = false; cancelAnimationFrame(raf); };
  }, [zeichne, dimensions, fitBaumAnsicht, sichtbar, fensterSichtbar]);

  useEffect(() => { zeichneNoetig.current = true; }, [timeFilter, TYPE_COLORS, hovered]);
  // Das Spotlight ist reine Darstellung: kein Neu-Layout, ein Bild.
  useEffect(() => { zeichneNoetig.current = true; }, [spot]);
  // Live-Dimmen: schon während des Ziehens neu zeichnen (billig — nur Alpha im
  // Canvas, kein Layout), nicht erst beim Commit.
  useEffect(() => { zeichneNoetig.current = true; }, [sliderWert]);

  // --- Zeigerbedienung ---
  const weltPunkt = (e: React.PointerEvent | React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return toWorld(transformRef.current, e.clientX - (rect?.left ?? 0), e.clientY - (rect?.top ?? 0));
  };

  /** Knoten unter dem Zeiger — die Zugabe ist immer GREIF_PX auf dem Schirm. */
  const trefferBei = useCallback((w: { x: number; y: number }): LayoutNode | null => {
    const sim = simRef.current;
    if (!sim) return null;
    const k = Math.max(0.01, transformRef.current.k);
    // Zum gewählten Zeitpunkt ausgeblendete Knoten sind auch nicht anfassbar —
    // sonst greift man nach etwas, das man nicht sieht. Derselbe effektive
    // Zeit-Stand wie die Zeichnung (live beim Ziehen, committet danach).
    const zeit = effektivZeitRef.current;
    const kandidaten = zeit === null
      ? sim.nodes
      : sim.nodes.filter((n) => {
          const m = byIdRef.current.get(n.id);
          return !m || existsAt(m, zeit);
        });
    // Derselbe Radius, mit dem gezeichnet wird: er steht am Knoten selbst.
    return nodeAt(kandidaten, (n) => n.r, w.x, w.y, GREIF_PX / k);
  }, []);

  /**
   * Wie eine Kante gerade jetzt gemalt wird — oder gar nicht.
   *
   * Dieselben Regeln wie der Zeichencode, denn der Griff muss der Linie folgen:
   * Aehnlichkeit faellt weg, wenn das Feld voll und der Blick weit ist; der
   * Zeitregler nimmt Kanten, deren Knoten damals noch nicht da waren; und der
   * Baum malt Geraden — solange nicht die Richtung an ist, denn dann wird auch
   * die Hierarchie zum Keil auf einem Bogen. Eine Kante, die nicht im Bild
   * steht, darf keinen Tooltip gewinnen.
   */
  const malweiseFuer = useCallback((e: LayoutEdge): "gerade" | "bogen" | null => {
    const baum = ansichtRef.current === "dendrogram";
    const keilAn = richtungRef.current && transformRef.current.k >= KEIL_AB_ZOOM;
    if (!baum) {
      if (!e.real && nurEchteKanten(simRef.current?.edges.length ?? 0, transformRef.current.k)) return null;
      if (!edgeVisibleAt(effektivAktivRef.current, e.source, e.target, e, effektivZeitRef.current)) return null;
    }
    return kanteIstGerade(e, baum, keilAn) ? "gerade" : "bogen";
  }, []);

  /** Der Name eines Endpunkts — Begriff oder Notiztitel, nie eine interne ID. */
  const nameFuer = useCallback((id: string): string => {
    if (istStruktur(id)) return strukturKnotenRef.current.get(id)?.label ?? id.slice(ENTITAETS_PRAEFIX.length);
    return byIdRef.current.get(id)?.title ?? id;
  }, []);

  /** Was der Zeiger ueber einer Kante erfahrt. */
  const infoFuerKante = useCallback((e: LayoutEdge): KantenInfo => {
    const baum = ansichtRef.current === "dendrogram";
    const art: KantenInfo["art"] = baum
      ? "hierarchy"
      : !e.real
        ? "similar"
        : istStruktur(e.source) && istStruktur(e.target)
          ? "claim"
          : "mention";
    const t = transformRef.current;
    const a = simRef.current?.index.get(e.source);
    const b = simRef.current?.index.get(e.target);
    let x = 0;
    let y = 0;
    if (a && b) {
      const gerade = kanteIstGerade(e, baum, richtungRef.current && t.k >= KEIL_AB_ZOOM);
      const punkt = kartenAnker(a, b, gerade);
      const lage = kartenLage(punkt.x * t.k + t.x, punkt.y * t.k + t.y, masseRef.current);
      x = lage.x;
      y = lage.y;
    }
    return {
      quelle: nameFuer(e.source),
      ziel: nameFuer(e.target),
      art,
      relation: art === "claim" ? e.relation ?? null : null,
      typen: art === "claim" ? e.typen ?? 1 : 0,
      belege: e.belege ?? 0,
      staerke: e.strength,
      validFrom: e.validFrom ?? null,
      validTo: e.validTo ?? null,
      x,
      y,
    };
  }, [nameFuer]);


  const zaehleAngeheftet = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return 0;
    let n = 0;
    for (const k of sim.nodes) if (k.pinned) n++;
    return n;
  }, []);

  /**
   * Alles zurück an die Stelle vor dem ersten Griff.
   *
   * Ohne diesen Weg zurueck waere das Anheften eine Falle: nach ein paar
   * Griffen stuende der halbe Graph still, und niemand koennte ihn loesen.
   *
   * Kein `reheat`: der Knopf verspricht einen Heimweg, kein Neubeleben des
   * ganzen Feldes. Ein ausgekuehltes Bild bleibt stehen, und was sich bewegt,
   * ist genau der Knoten, den die Hand wegggenommen hat.
   */
  const loeseAlle = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    for (const k of sim.nodes) {
      // Ein Knoten ohne gemerkte Stelle hat nichts zurueckzugeben — aber er soll
      // auch nicht festgenagelt bleiben.
      if (k.ursprung) loeseKnoten(sim, k.id);
      else k.pinned = false;
    }
    setAngeheftet(0);
    zeichneNoetig.current = true;
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const sim = simRef.current;
    if (!sim) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const w = weltPunkt(e);
    // Im Baum ist Ziehen Schwenken — die Anordnung gehoert der Hierarchie,
    // nicht der Hand. (Und das Anheften ist Kraftfeld-Sache.)
    const treffer = ansichtRef.current === "force" ? trefferBei(w) : null;
    if (treffer) {
      // Die Stelle des ERSTEN Griffs wird gemerkt, bevor die Hand sie bewegt:
      // genau sie gibt der Loesungsknopf zurueck.
      merkUrsprung(sim, treffer.id);
      treffer.pinned = true;
      draggingRef.current = treffer;
      zugRef.current = { sx: e.clientX, sy: e.clientY, bewegt: false };
      // KEIN globales Anheizen mehr.
      //
      // Frueher hob ein Griff die Kraftstaerke des GANZEN Layouts auf 0,3 —
      // damit ordnete sich bei jedem Zug die komplette Wissensbasis neu und
      // brauchte rund vier Sekunden, bis sie wieder stand. Von aussen sieht das
      // aus, als faenge alles an zu tanzen, und das war es auch: gemessen an
      // 320 Notizen verschoben sich 263 der uebrigen Knoten um im Mittel 91
      // Einheiten, der weiteste um 673.
      //
      // Ohne das Anheizen bewegt sich nur, was der gezogene Knoten auf seinem
      // Weg wirklich beruehrt — die Kollision laeuft ohnehin in jedem Bild und
      // ohne alpha. Dieselbe Geste: mittlere Verschiebung 5,3 statt 91, und der
      // Graph steht sofort wieder still statt nach 236 Bildern.
      //
      // Warm bleibt die Schleife trotzdem: sie rechnet, solange draggingRef
      // gesetzt ist (siehe Bildschleife), unabhaengig von alpha.
    } else {
      panRef.current = { sx: e.clientX, sy: e.clientY, ox: transformRef.current.x, oy: transformRef.current.y };
      autoFitOffen.current = false;
      nutzerBewegt.current = true;
    }
    setGreift(true);
  }, [trefferBei]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const sim = simRef.current;
    if (!sim) return;
    const pan = panRef.current;
    if (pan) {
      transformRef.current = { ...transformRef.current, x: pan.ox + (e.clientX - pan.sx), y: pan.oy + (e.clientY - pan.sy) };
      zeichneNoetig.current = true;
      return;
    }
    const w = weltPunkt(e);
    const gezogen = ansichtRef.current === "force" ? draggingRef.current : null;
    if (gezogen) {
      gezogen.x = w.x;
      gezogen.y = w.y;
      gezogen.vx = 0;
      gezogen.vy = 0;
      // Ein Klick ist kein Zug. Erst ab einer echten Strecke gilt der Knoten
      // als verschoben — sonst bliebe jeder, den man nur anfasst, angeheftet.
      const zug = zugRef.current;
      if (zug && !zug.bewegt && Math.hypot(e.clientX - zug.sx, e.clientY - zug.sy) > ZUG_SCHWELLE_PX) {
        zug.bewegt = true;
      }
      zeichneNoetig.current = true;
      return;
    }
    const treffer = trefferBei(w);
    const id = treffer?.id ?? null;
    if (id !== hoveredRef.current) {
      hoveredRef.current = id;
      setHovered(id);
      zeichneNoetig.current = true;
    }
    // Die Kante kommt erst, wenn kein Knoten greift: sonst streiten Knoten und
    // Linie um denselben Zeiger, und der Knoten verliert ansichtslos.
    const kante = id === null
      ? kanteBei(sim.index, selbstRef.current.length > 0 ? [...sim.edges, ...selbstRef.current] : sim.edges, w.x, w.y, KANTEN_GREIF_PX / Math.max(0.01, transformRef.current.k), malweiseFuer)
      : null;
    if (kante !== hoverKanteRef.current) {
      hoverKanteRef.current = kante;
      setKantInfo(kante ? infoFuerKante(kante) : null);
      zeichneNoetig.current = true;
    }
  }, [trefferBei, malweiseFuer, infoFuerKante]);

  const onPointerUp = useCallback(() => {
    const gezogen = draggingRef.current;
    if (gezogen) {
      // Ein abgelegter Knoten BLEIBT, wo man ihn hingezogen hat.
      //
      // Zwischenzeitlich sprang er zurueck in die Physik, und das war die
      // Antwort auf einen echten Fehler: damals wurde beim Anfassen angeheftet
      // und nie wieder geloest, sodass nach ein paar Griffen der halbe Graph
      // erstarrt war. Der Fehler lag aber nicht im Anheften, sondern darin,
      // dass es keinen Weg zurueck gab. Den gibt es jetzt: angeheftete Knoten
      // tragen einen Ring, und der Knopf in der Leiste loest sie wieder.
      //
      // Ein blosser Klick heftet nicht an — dafuer die Schwelle.
      const bewegt = zugRef.current?.bewegt ?? false;
      gezogen.pinned = bewegt;
      gezogen.vx = 0;
      gezogen.vy = 0;
      if (bewegt) setAngeheftet(zaehleAngeheftet());
      // ein blosser Klick auf ein konzept öffnet sein dossier — für die notiz
      // gilt das nicht, die öffnet erst der doppelklick und bleibt beim
      // einfachen klick liegen, wo sie war.
      if (!bewegt && gezogen.id.startsWith(ENTITAETS_PRAEFIX)) {
        const name = strukturKnotenRef.current.get(gezogen.id)?.label;
        if (name) onSelectConcept?.(name);
      }
    }
    zugRef.current = null;
    draggingRef.current = null;
    panRef.current = null;
    zeichneNoetig.current = true;
    setGreift(false);
  }, [onSelectConcept]);

  /**
   * Verlaesst der Zeiger die Flaeche, muss auch die Hervorhebung enden. Vorher
   * blieb der zuletzt beruehrte Knoten "unter dem Zeiger" — der ganze Rest des
   * Graphen blieb abgedunkelt, bis man wieder hineinfuhr.
   */
  const onPointerLeave = useCallback(() => {
    onPointerUp();
    if (hoveredRef.current !== null) {
      hoveredRef.current = null;
      setHovered(null);
      zeichneNoetig.current = true;
    }
    if (hoverKanteRef.current !== null) {
      hoverKanteRef.current = null;
      setKantInfo(null);
      zeichneNoetig.current = true;
    }
  }, [onPointerUp]);

  /**
   * Die Karte hoert auf zu existieren, wenn ihre Kante aus dem Bild faellt.
   *
   * Filter, Zeitregler und ein Ansichtswechsel nehmen Kanten weg — eine Karte,
   * die weiter über einer Lücke schwebt, erzaehlt dann etwas, das niemand mehr
   * sieht.
   */
  useEffect(() => {
    const gehalten = hoverKanteRef.current;
    if (!gehalten) return;
    if (edges.includes(gehalten)) return;
    hoverKanteRef.current = null;
    setKantInfo(null);
    zeichneNoetig.current = true;
  }, [edges, ansicht]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    zoom(e.deltaY < 0 ? 1.12 : 0.89, e.clientX - (rect?.left ?? 0), e.clientY - (rect?.top ?? 0));
  }, [zoom]);

  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    const sim = simRef.current;
    if (!sim) return;
    const w = weltPunkt(e);
    const treffer = trefferBei(w);
    const m = treffer ? byIdRef.current.get(treffer.id) : undefined;
    if (m) { onSelectMemory(m); return; }
    // Eine Gruppe im Baum falten: die Kinder verschwinden, ihre Zahl bleibt.
    // Die Wurzel ist der Rahmen, keine Gruppe — sie zu falten wäre ein leeres
    // Bild mit einem Klick, der sich nach nichts anfuelt.
    if (treffer && ansichtRef.current === "dendrogram" && istStruktur(treffer.id) && treffer.id !== "__wurzel") {
      falteUm(treffer.id);
    }
  }, [onSelectMemory, trefferBei, falteUm]);

  /** Zeiger, wo eine Handlung wartet: ein Konzept öffnet, eine Gruppe faltet. */
  const zeigerHand = (id: string) =>
    id.startsWith(ENTITAETS_PRAEFIX) || (ansicht === "dendrogram" && istStruktur(id) && id !== "__wurzel");

  // --- Tastaturbedienung ---
  // Pfeiltasten waehlen den naechsten Notiz-Knoten in der jeweiligen Richtung,
  // Enter oeffnet die Notiz, Escape hebt die Auswahl auf. Damit ist der
  // Graph auch ohne Maus voll erreichbar.
  const setzeAuswahl = useCallback((id: string | null) => {
    tastaturIdRef.current = id;
    setTastaturId(id);
    zeichneNoetig.current = true;
    const sim = simRef.current;
    const canvas = canvasRef.current;
    if (!id || !sim || !canvas) return;
    const n = sim.nodes.find((k) => k.id === id);
    if (!n) return;
    // Liegt der Knoten ausserhalb des Sichtfensters, schiebt die Ansicht nach.
    const t0 = transformRef.current;
    const rand = 90;
    const sx = n.x * t0.k + t0.x;
    const sy = n.y * t0.k + t0.y;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    let nx = t0.x;
    let ny = t0.y;
    if (sx < rand) nx += rand - sx;
    if (sx > w - rand) nx -= sx - (w - rand);
    if (sy < rand) ny += rand - sy;
    if (sy > h - rand) ny -= sy - (h - rand);
    if (nx !== t0.x || ny !== t0.y) {
      transformRef.current = { ...t0, x: nx, y: ny };
      zeichneNoetig.current = true;
    }
  }, []);

  /**
   * Die Treffer der Suche: was das Suchwort trifft UND im Bild steht. Die
   * Reihenfolge ist die der Notizliste — dieselbe Frage, dieselbe Antwort, kein
   * drittes Sortieren, das einen Treffer als ersten ausgibt, weil es ihn
   * zufällig zuerst fand.
   */
  const trefferIds = useMemo(() => {
    if (!filter.trim()) return [] as string[];
    const imBild =
      ansicht === "dendrogram"
        ? new Set(baumNotizen.map((n) => n.id))
        : new Set(feldNotizen.map((m) => m.id));
    return filtered.filter((m) => imBild.has(m.id)).map((m) => m.id);
  }, [filter, filtered, ansicht, baumNotizen, feldNotizen]);
  /** Wo im Blättern man steht. -1 = gefunden, aber noch nicht hingesprungen. */
  const [trefferZeiger, setTrefferZeiger] = useState(-1);
  useEffect(() => { setTrefferZeiger(-1); }, [filter]);

  /** Die Kamera auf einen Knoten — ein Sprung aus der Suche soll ankommen. */
  const zentriere = useCallback((id: string) => {
    const sim = simRef.current;
    const canvas = canvasRef.current;
    if (!sim || !canvas) return;
    const n = sim.nodes.find((k) => k.id === id);
    if (!n) return;
    const t = transformRef.current;
    transformRef.current = {
      ...t,
      x: canvas.clientWidth / 2 - n.x * t.k,
      y: canvas.clientHeight / 2 - n.y * t.k,
    };
    // Wer gesprungen ist, will genau diesen Knoten sehen — ein Auto-Fit danach
    // würde das Fenster wieder auf alles ziehen.
    autoFitOffen.current = false;
    nutzerBewegt.current = true;
    zeichneNoetig.current = true;
  }, []);

  /** Enter in der Suche: vorwärts, Shift+Enter rückwärts, und es greift um. */
  const springeTreffer = useCallback((schritt: 1 | -1): boolean => {
    if (trefferIds.length === 0) return false;
    const laenge = trefferIds.length;
    const i = (((trefferZeiger + schritt) % laenge) + laenge) % laenge;
    setTrefferZeiger(i);
    const id = trefferIds[i]!;
    setzeAuswahl(id);
    zentriere(id);
    return true;
  }, [trefferIds, trefferZeiger, setzeAuswahl, zentriere]);

  /** Was Enter tut, wenn nichts gemeint ist als ein Treffer: die Auswahl öffnen. */
  const oeffneAuswahl = useCallback((e: React.KeyboardEvent) => {
    const id = tastaturIdRef.current;
    const m = id ? byIdRef.current.get(id) : undefined;
    if (m) {
      e.preventDefault();
      onSelectMemory(m);
      return;
    }
    // Dasselbe wort wie beim klick: ein konzept öffnet sein dossier.
    if (id && id.startsWith(ENTITAETS_PRAEFIX)) {
      const name = strukturKnotenRef.current.get(id)?.label;
      if (name) {
        e.preventDefault();
        onSelectConcept?.(name);
      }
      return;
    }
    // Eine Typ- oder Tag-Ebene hat kein Dossier. Ohne Handlung wäre Enter
    // dort eine tote Taste — im Baum ist sie der Weg zur Faltung.
    if (id && ansicht === "dendrogram" && /^__(typ|tag):/.test(id)) {
      e.preventDefault();
      falteUm(id);
    }
  }, [onSelectMemory, onSelectConcept, ansicht, falteUm]);

  /**
   * Die Tastatur der Suche. Escape räumt ZUERST das Wort — wer ein Suchfeld
   * schließt, will nicht im selben Atemzug auch noch die Auswahl verlieren.
   * Ohne Wort, aber mit Trefferlosigkeit gilt weiter der alte Fluss: Enter
   * öffnet, was gehalten ist.
   */
  const onSucheKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (springeTreffer(e.shiftKey ? -1 : 1)) {
        e.preventDefault();
        return;
      }
      oeffneAuswahl(e);
      return;
    }
    if (e.key === "Escape") {
      if (filter) {
        e.preventDefault();
        setFilter("");
        return;
      }
      if (tastaturIdRef.current) {
        e.preventDefault();
        setzeAuswahl(null);
      }
    }
  }, [springeTreffer, oeffneAuswahl, filter, setzeAuswahl]);

  const tastaturSchritt = useCallback((richtung: "up" | "down" | "left" | "right") => {
    const sim = simRef.current;
    if (!sim) return;
    // Erreichbar ist, was eine antwort gibt: die Notiz (Enter öffnet sie), das
    // Konzept (Enter öffnet sein Dossier) und — im Baum — die Typ- und
    // Tag-Ebene (Enter faltet sie). Die Wurzel ist der Rahmen, sie tut nichts
    // und bleibt deshalb aus der Reise draußen.
    const imBaum = ansicht === "dendrogram";
    const notizKnoten = sim.nodes.filter(
      (n) => byIdRef.current.has(n.id) || n.id.startsWith(ENTITAETS_PRAEFIX) || (imBaum && /^__(typ|tag):/.test(n.id))
    );
    if (notizKnoten.length === 0) return;
    const aktuell = tastaturIdRef.current
      ? notizKnoten.find((n) => n.id === tastaturIdRef.current)
      : undefined;
    if (!aktuell) {
      // Ohne Auswahl: der Knoten nahe der Bildschirmmitte gewinnt.
      const w = canvasRef.current?.clientWidth ?? 0;
      const h = canvasRef.current?.clientHeight ?? 0;
      const t0 = transformRef.current;
      const cx = (w / 2 - t0.x) / t0.k;
      const cy = (h / 2 - t0.y) / t0.k;
      let bester = notizKnoten[0];
      for (const n of notizKnoten) {
        if (Math.hypot(n.x - cx, n.y - cy) < Math.hypot(bester.x - cx, bester.y - cy)) bester = n;
      }
      setzeAuswahl(bester.id);
      return;
    }
    const dir = richtung === "up" ? [0, -1] : richtung === "down" ? [0, 1] : richtung === "left" ? [-1, 0] : [1, 0];
    const kandidaten = notizKnoten.filter((n) => {
      if (n === aktuell) return false;
      const dx = n.x - aktuell.x;
      const dy = n.y - aktuell.y;
      return dx * dir[0] + dy * dir[1] > 0;
    });
    if (kandidaten.length === 0) return;
    const bewertung = (k: LayoutNode) => {
      const dx = k.x - aktuell.x;
      const dy = k.y - aktuell.y;
      const dist = Math.hypot(dx, dy) || 1e-6;
      return dist - ((dx * dir[0] + dy * dir[1]) / dist) * 80;
    };
    let bester = kandidaten[0];
    for (const n of kandidaten) {
      if (bewertung(n) < bewertung(bester)) bester = n;
    }
    setzeAuswahl(bester.id);
  }, [setzeAuswahl, ansicht]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const richtungen: Record<string, "up" | "down" | "left" | "right"> = {
      ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    };
    const r = richtungen[e.key];
    if (r) {
      e.preventDefault();
      tastaturSchritt(r);
      return;
    }
    if (e.key === "Enter") {
      oeffneAuswahl(e);
      return;
    }
    if (e.key === "Escape" && tastaturIdRef.current) {
      e.stopPropagation();
      setzeAuswahl(null);
    }
  }, [oeffneAuswahl, tastaturSchritt, setzeAuswahl]);

  // Wheel-Zoom darf die Seite nicht mitscrollen — React-onWheel ist passiv.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const stop = (e: Event) => e.preventDefault();
    el.addEventListener("wheel", stop, { passive: false });
    return () => el.removeEventListener("wheel", stop);
  }, []);

  const kantZeilen = kantInfo ? kantenZeilen(kantInfo) : null;

  /**
   * Ob die Projektion etwas zu zeigen hat. Zwei Punkte sind die untere Grenze:
   * eine Achse braucht eine Richtung, und eine Richtung braucht ein Zweites.
   */
  const karteZeigbar =
    ansicht !== "semantic" || (!karteFehler && karte !== null && karte.punkte.length >= 2);

  if (memories.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="hud-label mb-2">Knowledge graph</div>
        <p className="text-sm max-w-sm" style={{ color: "var(--text-2)" }}>
          No notes yet. Write one — its [[wiki links]] become concepts, and concepts are what the graph connects.
        </p>
      </div>
    );
  }

  const drin = (g: Leistenglied) => plan.zeile.includes(g);
  /** Der Punkt ist das eine Zeichen fuer „ein Schalter ist an". */
  const punkt = (an: boolean) => (
    <span
      aria-hidden="true"
      data-testid="graph-schalter-punkt"
      style={{
        width: 6,
        height: 6,
        flex: "0 0 6px",
        borderRadius: 999,
        background: an ? "var(--accent)" : "transparent",
        boxShadow: an ? "none" : "inset 0 0 0 1px var(--border-strong)",
      }}
    />
  );
  /**
   * Die drei Rollen der Leiste, in drei verschiedenen Zeichen (Z-07):
   *
   *   Auswahl  = ein Segment in der geteilten Schiene, das aktive liegt erhaben
   *              darauf — `.apple-seg` ist das Hauszeichen dafuer, der
   *              Index-Gruppierung (`Dashboard.tsx:1541`) nutzt es schon
   *   Schalter = ein Punkt in Akzentfarbe, nie eine Randfarbe
   *   Klappe   = derselbe Punkt, weil „Panel offen" ein Zustand ist und keine
   *              gewaehlte Option
   *
   * Vorher standen Auswahl und Klappe in ein und derselben Akzentkante, und die
   * beiden Schalter „Similar" und „Direction" markierten ihr An stattdessen in
   * `--text-3` — A8-08: zwanzig Knoepfe, eine Zeile, zwei Sprachen fuer „an".
   * Die Etikett-Stellung hatte ueberhaupt kein Zeichen: „Key" war
   * aria-pressed=true und sonst nichts (gemessen 10.10.: Rand
   * rgba(255,255,255,.08), Schrift --text-1 — wie „All" und „Off" aus).
   */
  const segment = (an: boolean, titel: string, onClick: () => void, wort: string, zu = false) => (
    <button
      type="button"
      className="apple-seg-btn text-[11px] font-medium"
      data-on={an ? "true" : "false"}
      aria-pressed={an ? "true" : "false"}
      disabled={zu}
      onClick={onClick}
      title={titel}
    >
      {wort}
    </button>
  );
  const schalter = (an: boolean, titel: string, onClick: () => void, wort: string, zeichen?: ReactNode) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={an ? "true" : "false"}
      className="btn-ghost px-2 py-1.5 rounded-lg text-[11px] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
      title={titel}
    >
      {punkt(an)}
      {zeichen}
      {wort}
    </button>
  );

  const zeitStand = (
    <span
      className="hud-label whitespace-nowrap tnum shrink-0"
      data-testid="graph-zeitstand"
      title={
        zeitAchse
          ? `Knowledge shown as of ${datumLang(zeitStandMs ?? Date.now())} · the scale runs from ${datumLang(zeitAchse.min)} to today`
          : undefined
      }
    >
      <span style={{ color: zeitStandMs !== null || zeitAchse?.verschiebt ? "var(--accent)" : undefined }}>
        {zeitStandMs === null ? "Now" : datumKurz(zeitStandMs)}
      </span>
      {zeitAchse?.verschiebt && (
        <span
          className="ml-1"
          data-testid="graph-zeit-spaeter"
          title={`${zeitAchse.spaeter.length} commitment${zeitAchse.spaeter.length === 1 ? "" : "s"} in this base end${zeitAchse.spaeter.length === 1 ? "" : ""} after today — that is a state on the link, not a step on this scale`}
        >
          +{zeitAchse.spaeter.length} later
        </span>
      )}
      {zeitStandMs !== null && (
        <button
          onClick={() => setzeSlider(100)}
          className="btn-ghost px-1.5 py-1 rounded text-[11px] ml-1"
          title="Back to now"
        >
          Today
        </button>
      )}
    </span>
  );
  /**
   * Der Zeitregler. `imMenue` aendert nur eines: wie die Trefferflaeche
   * entstehen darf.
   *
   * Die Zeichnung ist E1s 16-px-Linie (index.css:777) und bleibt 16 px hoch.
   * Die Box waechst auf 44 px — in der Zeile mit gegenlaeufigem Rand, damit
   * nichts rueckt (gemessen: die Leiste ist 51 px hoch, der Regler faellt
   * exakt in ihre 12-px-Polster, alle vier Saume treffen ihn selbst). Im Menue
   * stehen die Reihen 12 px auseinander; derselbe Gegenrand haette dem
   * Nachbarn die Flaeche gestohlen — gemessen am 11.10.: `unten` traf den
   * Direction-Knopf, `oben` das Suchfeld. Also wachst dort die Reihe, statt
   * dass sie ueberlappt.
   */
  const zeitRegler = (imMenue = false) => (
    <span
      className="inline-flex items-center gap-1.5 shrink-0"
      title={
        zeitAchse
          ? `Scrub the time — left is ${datumKurz(zeitAchse.min)}, right is today`
          : "Scrub the time"
      }
    >
      <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-3)" }} />
      <input
        type="range"
        min={0}
        max={100}
        step={0.5}
        value={sliderWert}
        onChange={(e) => setSliderWert(Number(e.target.value) >= 100 ? 100 : Number(e.target.value))}
        onPointerUp={() => setSliderCommit(sliderWert)}
        onTouchEnd={() => setSliderCommit(sliderWert)}
        onKeyUp={() => setSliderCommit(sliderWert)}
        onBlur={() => setSliderCommit(sliderWert)}
        className="graph-time"
        style={
          imMenue
            ? { boxSizing: "content-box", paddingBlock: "14px" }
            : { boxSizing: "content-box", paddingBlock: "14px", marginBlock: "-14px" }
        }
        /* Der Name bleibt der alte, unverstaendliche Satz ohne Anhaengsel:
           sechs Tests und F8s Messstrasse fassen den Regler ueber ihn. Die
           Skalenenden stehen im `title` derselben Gruppe — Auskunft ja, aber
           nicht auf Kosten des Griffes. */
        aria-label="Time of the knowledge shown"
      />
    </span>
  );
  const datumsFeld = (
    <input
      type="date"
      value={zeitStandMs !== null ? isoLokal(zeitStandMs) : ""}
      min={zeitAchse ? isoLokal(zeitAchse.min) : undefined}
      max={zeitAchse ? isoLokal(zeitAchse.heute) : undefined}
      onChange={(e) => setzeDatum(e.target.value)}
      className="graph-time graph-datum shrink-0"
      aria-label="Knowledge as of date"
      title="An exact moment — the scale never runs past today"
    />
  );
  const zoomReihe = (
    <div className="flex items-center gap-1 shrink-0">
      <span className="hud-label tnum hidden md:inline-block mr-1" title="Current zoom">
        {Math.round(zoomAnzeige * 100)} %
      </span>
      <button onClick={() => zoom(1.25)} className="btn-ghost p-2 rounded-lg" title="Zoom in"><ZoomIn className="w-4 h-4" /></button>
      <button onClick={() => zoom(0.8)} className="btn-ghost p-2 rounded-lg" title="Zoom out"><ZoomOut className="w-4 h-4" /></button>
      <button onClick={fitView} className="btn-ghost p-2 rounded-lg" title="Fit the whole graph into view"><Maximize2 className="w-4 h-4" /></button>
      {angeheftet > 0 && (
        <button
          onClick={loeseAlle}
          className="btn-ghost px-2 py-1 rounded-lg text-[11px] whitespace-nowrap"
          style={{ color: "var(--accent)" }}
          title="Nodes you dragged stay where you put them. This puts each one back where your hand first grabbed it."
        >
          Release {angeheftet} pinned
        </button>
      )}
    </div>
  );
  const sucheBlock = (
    <>
      <div className="relative flex-1 min-w-[150px] max-w-sm" data-testid="graph-suche">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-3)" }} />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={onSucheKeyDown}
          placeholder="Filter the graph…"
          aria-describedby="graph-search-count"
          className="hud-input w-full pl-8 pr-3 py-2 rounded-lg text-sm"
          aria-label="Filter the graph"
        />
      </div>
      {/* Der Zaehler ist ein eigenes Glied der Zeile, nicht ein Kind des
          Feldumrisses: E1s A7-07-Regel (.flaeche-huelle div:has(> #graph-search-count),
          index.css:955) greift auf das Element, das den Zaehler direkt traegt,
          und setzt ihm `min-width: 0` — in einem Umriss um das Feld hat das den
          Suchraum bei 1 440 px auf null Breite gequetscht (gemessen 10.10.:
          rect [285,73,0,38]). Gezahlt wird, was im Bild steht. */}
      <div
        id="graph-search-count"
        data-testid="graph-search-count"
        className="hud-label tnum shrink-0"
        style={{ color: "var(--text-3)" }}
        aria-live="polite"
      >
        {filter.trim() === ""
          ? ""
          : trefferIds.length === 0
            ? "No match"
            : trefferZeiger < 0
              ? `${trefferIds.length} match${trefferIds.length === 1 ? "" : "es"}`
              : `${trefferZeiger + 1} of ${trefferIds.length}`}
      </div>
    </>
  );
  /** Schienen = Auswahl. */
  const schieneAnsicht = (
    <div className="apple-seg shrink-0" role="group" aria-label="Graph layout" data-testid="graph-schiene-ansicht">
      {segment(ansicht === "force", "Force view — the links as they are claimed; similarity only on request", () => wechsleAnsicht("force"), "Force")}
      {segment(ansicht === "dendrogram", "Dendrogram — knowledge as a tree: root → type → entity → note", () => wechsleAnsicht("dendrogram"), "Tree")}
      {segment(ansicht === "semantic", "Semantic map — the same notes placed by their vectors. Distance is meaning, computed once and always the same way.", () => wechsleAnsicht("semantic"), "Semantic")}
    </div>
  );
  const schieneNamen = (
    <div className="apple-seg shrink-0" role="group" aria-label="Density of names" data-testid="graph-schiene-namen">
      {STUFEN_FOLGE.map((m) =>
        segment(etikettenModus === m, NAMEN_STUFE[m].erklaerung, () => setzeEtiketten(m), NAMEN_STUFE[m].wort))}
    </div>
  );
  const schieneKanal = (
    <div className="apple-seg shrink-0" role="group" aria-label="Node colour channel" data-testid="graph-schiene-kanal">
      {segment(aktiverKanal === "typ", `Colour by what each note is made of — ${Object.values(TYP_BESCHREIBUNG).join(", ")}. What the graph starts with.`, () => wechsleKanal("typ"), "Type")}
      {segment(
        aktiverKanal === "herkunft",
        herkunft.verfügbar
          ? `Colour by where notes came from — ${herkunft.arten.length} kinds in this base: ${herkunft.arten.map((a) => HERKUNFT_LABELS[a]).join(", ")}`
          : herkunft.grund,
        () => wechsleKanal("herkunft"),
        "Provenance",
        !herkunft.verfügbar
      )}
    </div>
  );
  const farbenReihe = (
    <div className="flex items-center gap-0.5 shrink-0" title="Node colours — each colour tints its type across the graph, cards and index">
      {TYP_FOLGE.map((t) => (
        <input
          key={t}
          type="color"
          value={TYPE_COLORS[t] ?? ""}
          onChange={(e) => setTypeColor(t, e.target.value)}
          title={`Colour: ${TYP_BESCHREIBUNG[t]} — tints the nodes, their card ridge and the index numbers`}
          className="graph-swatch"
          style={{ color: `var(${TYP_TOKEN[t]})` }}
        />
      ))}
    </div>
  );
  const schalterAehnlichkeit = schalter(ahnlichkeit, "Show similarity links — guesses from shared tags and titles, off by default", () => setAhnlichkeit((v) => !v), "Similar");
  const schalterSelbst = schalter(selbstkaanten, "Self claims — a concept talking about itself, looped at its own node. Off by default.", wechsleSelbstkaanten, "Self");
  const schalterRichtung = schalter(richtung, "Claim direction — each link runs from its wide end to its narrow one. Off shows plain lines.", wechsleRichtung, "Direction", <ChevronRight className="w-3.5 h-3.5" />);
  const schalterSchema = schalter(schemaOffen, "Schema — what the store holds: kinds, concepts, claims. The counts beside the picture stay the picture's.", () => {
    const neu = !schemaOffen;
    setSchemaOffen(neu);
    if (neu) setzeMehrOffen(false);
  }, "Schema");
  const schalterKrafte = schalter(krafteOffen, "Forces — how hard the field gathers, repels and spaces itself, and how big the nodes are. The picture keeps its place while it settles.", () => {
    const neu = !krafteOffen;
    setzeKrafteOffen(neu);
    if (neu) setzeMehrOffen(false);
  }, "Forces", <SlidersHorizontal className="w-3.5 h-3.5" />);

  /** Ein Geraet, gerufen nach dem Glied, das die Zeile nicht trug. */
  const geraet = (g: Leistenglied): ReactNode => {
    switch (g) {
      case "suche": return sucheBlock;
      case "ansicht": return schieneAnsicht;
      case "namen": return schieneNamen;
      case "kanal": return schieneKanal;
      case "farben": return farbenReihe;
      case "aehnlichkeit": return schalterAehnlichkeit;
      case "selbst": return schalterSelbst;
      case "richtung": return schalterRichtung;
      case "schema": return schalterSchema;
      case "krafte": return schalterKrafte;
      case "zeitstand": return zeitStand;
      case "zeitregler": return zeitRegler(true);
      case "datum": return datumsFeld;
      case "zoom": return zoomReihe;
    }
  };
  /**
   * Die Erklaerung neben dem Geraet, sobald es im Menue steht.
   *
   * A8-08 hat gezaehlt: 21 von 22 Erklaerungen der Leiste steckten in einem
   * `title`, also hinter einer Sekunde Schweben. Im Menue sind sie Text — die
   * Auskunft, die die Zeile nicht unterbringen konnte, wird nicht wieder ein
   * Tooltip.
   */
  const erklaerung = (g: Leistenglied): string => {
    switch (g) {
      case "suche": return "Only the matching notes stay in the picture — the rest leaves it.";
      case "ansicht": return "Which picture: claims as a field, knowledge as a tree, meaning as a map.";
      case "namen": return `Density of names. Now: ${NAMEN_STUFE[etikettenModus].wort.toLowerCase()} — ${NAMEN_STUFE[etikettenModus].erklaerung.toLowerCase()}.`;
      case "kanal": return "What the colours mean: kind of knowledge, or where the note came from.";
      case "farben": return "The four kind colours, reused by the cards and the index.";
      case "aehnlichkeit": return "Similarity links are guesses from shared tags and titles. Off, the graph claims nothing.";
      case "selbst": return "A concept talking about itself, looped at its own node.";
      case "richtung": return "Wide end = who claims, narrow end = of whom. Below 50 % zoom the wedge is too small to draw, and the legend says so.";
      case "schema": return "What the store holds: kinds, concepts, claims.";
      case "krafte": return "How hard the field gathers, repels and spaces itself.";
      default: return "";
    }
  };
  return (
    <div className="relative flex flex-col h-full min-h-0">
      {/* Die Leiste: EINE Zeile, und was nicht hineinpasst, ist ein Knopf mit
          einer Zahl — kein seitlicher Rollner, der Bedienelemente ausserhalb
          des Fensters legt (D1-01, Z-03).

          Gemessen am vorher-Stand (400 Notizen, 1 440 px,
          `e2-rohdaten/e2-400-leiste.json`): die Zeile war 1 132 px breit und
          trug 1 680 px. Ausserhalb des Fensters lagen Datumsfeld (+191 px),
          Zeitregler (+333 px) und alle drei Zoom-Knoepfe (+433 bis +509 px);
          auf keinen von ihnen antwortete `elementFromPoint`. Die Flaeche zeigt
          ein Gedaechtnis, das man durch die Zeit blaettern kann, und das Blatt,
          das sagt, welche Zeit eingestellt ist und wie weit man herausgezoomt
          hat, war ausser Reichweite.

          Der Abbau folgt einer Rangfolge, und ihre Ordnung ist die Reihenfolge
          der Fragen, die diese Flaeche beantwortet — nicht die Reihenfolge der
          Knoepfe: wo stehe ich (Zoom), wann (Zeitstand), welches Bild
          (Ansicht), wie viel ist benannt (Dichte), finden. */}
      <div
        ref={leistenMessen}
        data-testid="graph-leiste"
        className="relative flex items-center gap-2 px-2 py-3 shrink-0 flex-nowrap"
        onKeyDown={(e) => {
          if (e.key === "Escape" && mehrOffen) {
            e.stopPropagation();
            setzeMehrOffen(false);
          }
        }}
      >
        {drin("suche") && sucheBlock}
        {drin("ansicht") && schieneAnsicht}
        {drin("namen") && schieneNamen}
        {drin("richtung") && schalterRichtung}
        {drin("aehnlichkeit") && schalterAehnlichkeit}
        {drin("selbst") && schalterSelbst}
        {drin("schema") && schalterSchema}
        {drin("krafte") && schalterKrafte}
        {drin("kanal") && schieneKanal}
        {drin("farben") && farbenReihe}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {zeitAchse && drin("zeitstand") && zeitStand}
          {zeitAchse && drin("datum") && datumsFeld}
          {zeitAchse && drin("zeitregler") && zeitRegler(false)}
          {drin("zoom") && zoomReihe}
          {plan.menue.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const neu = !mehrOffen;
                setzeMehrOffen(neu);
                // Eine Klappe nach der andern: das Bild soll nicht hinter drei
                // Ueberschichten verschwinden.
                if (neu) {
                  setSchemaOffen(false);
                  setzeKrafteOffen(false);
                }
              }}
              aria-expanded={mehrOffen ? "true" : "false"}
              aria-controls="graph-mehr-panel"
              className="btn-ghost px-2 py-1.5 rounded-lg text-[11px] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              title={`${plan.menue.length} controls do not fit this row — they are here, each with its explanation`}
              data-testid="graph-mehr"
            >
              {/* Kein Punkt: der ist das Zeichen eines Schalters, und das hier
                  ist eine Klappe — ihre Antwort ist das Panel selbst. */}
              More ({plan.menue.length})
            </button>
          )}
        </div>
      </div>
      {/* Das Menue: die Geraete vollstaendig, und die Zeile, die vorher nur im
          Schwebetext stand, als Text.

          Es haengt als Schicht unter der Zeile, im Rahmen der Flaeche — nicht im
          Rollner der Zeile selbst (E1s A7-07-Regel, index.css:955, giebt ihr
          `overflow-x: auto`, und der schnitte jede absolute Schicht ab), und
          nicht im Fluss unter ihr: ein Streifen im Fluss macht die Leinwand
          kuerzer, die Leinwand meldet ihren neuen Rahmen, und der Fit rückt die
          Kamera — gemessen 10.10.: das Menue aufgemacht und aus 27 % Zoom wurden
          9 %. Eine Klappe darf nicht umziehen. */}
      {mehrOffen && plan.menue.length > 0 && (
        <div
          id="graph-mehr-panel"
          role="group"
          aria-label="Controls that did not fit the row"
          data-testid="graph-mehr-panel"
          className="hud-panel absolute left-2 right-2 top-[47px] z-30 rounded-lg px-3 py-2 space-y-2 max-h-[55%] overflow-y-auto"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="hud-label" style={{ color: "var(--text-2)" }}>
              {plan.menue.length} out of the row — everything here works the same
            </div>
            <button onClick={() => setzeMehrOffen(false)} className="btn-ghost px-2 py-1 rounded text-[11px]" title="Close">
              Close
            </button>
          </div>
          {plan.menue.map((g) => (
            <div key={g} className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid={`graph-mehr-${g}`}>
              <div className="shrink-0">{geraet(g)}</div>
              {erklaerung(g) && (
                <span className="hud-label" style={{ color: "var(--text-2)" }}>{erklaerung(g)}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div
        ref={containerRef}
        className="flex-1 min-h-[420px] rounded-xl overflow-hidden relative"
        style={{
          background: "var(--glass-panel)",
          backdropFilter: "blur(14px) saturate(1.35)",
          WebkitBackdropFilter: "blur(14px) saturate(1.35)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "inset 0 1px 0 var(--edge-light), var(--shadow-sm)",
        }}
      >
        <p
          data-testid="gang-info"
          role="status"
          className="sr-only"
        >
          {gangInfo
            ? `${gangInfo.allein.toLocaleString("en-US")} notes connect to nothing in this picture · ${gangInfo.zeilen} ${gangInfo.zeilen === 1 ? "row" : "rows"} of ${GANG_SPALTEN}`
              + (gangInfo.seiten > 0
                ? ` · showing ${gangInfo.gezeigt.toLocaleString("en-US")} of ${gangInfo.allein.toLocaleString("en-US")} · page ${gangInfo.seite + 1} of ${gangInfo.seiten.toLocaleString("en-US")}`
                : "")
            : ""}
        </p>
        {gangInfo && gangInfo.seiten > 1 && (
          <div
            data-testid="gang-blaetterer"
            className="absolute right-3 bottom-3 z-10 hud-panel rounded-lg px-1.5 py-1 flex items-center gap-1"
          >
            <button
              type="button"
              data-testid="gang-zurueck"
              onClick={() => blaettereGang(-1)}
              disabled={gangInfo.seite === 0}
              className="btn-ghost p-1.5 rounded-lg disabled:opacity-40"
              title="Earlier notes that connect to nothing"
              aria-label="Previous page of unconnected notes"
            >
              <span aria-hidden="true">‹</span>
            </button>
            <span className="hud-label tnum" style={{ color: "var(--text-2)" }}>
              {`${gangInfo.seite + 1} / ${gangInfo.seiten.toLocaleString("en-US")}`}
            </span>
            <button
              type="button"
              data-testid="gang-weiter"
              onClick={() => blaettereGang(1)}
              disabled={gangInfo.seite >= gangInfo.seiten - 1}
              className="btn-ghost p-1.5 rounded-lg disabled:opacity-40"
              title="More notes that connect to nothing"
              aria-label="Next page of unconnected notes"
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>
        )}
        {(() => {
          // Was der Nachzug tut, ist im Bild zu lesen — sonst fuellt sich das
          // Netz hinter einem Rahmen, der so aussieht, als ware er fertig.
          const zeile = !nachzug
            ? ""
            : nachzug.fehler
              ? `Network not filled: ${nachzug.fehler}`
              : nachzug.laufen
                ? nachzug.gesamt > 0
                  ? `Filling the network — ${nachzug.gesehen.toLocaleString("en-US")} of ${nachzug.gesamt.toLocaleString("en-US")} notes`
                  : "Filling the network…"
                : nachzug.neuBegriffe > 0 || nachzug.neuKanten > 0
                  ? `Network filled: +${nachzug.neuBegriffe.toLocaleString("en-US")} concepts, +${nachzug.neuKanten.toLocaleString("en-US")} links`
                  : "";
          return (
            <div
              data-testid="nachzug-info"
              role="status"
              aria-live="polite"
              className={zeile ? "absolute left-0 right-0 top-0 z-10 h-[3px] pointer-events-none" : "sr-only"}
              style={zeile ? { background: "var(--accent-kante)" } : undefined}
              title={zeile || undefined}
              aria-label={zeile || undefined}
            >
              <span className="sr-only">{zeile}</span>
            </div>
          );
        })()}
        <canvas
          ref={canvasRef}
          data-testid="graph-canvas"
          tabIndex={0}
          role="application"
          aria-label="Knowledge graph. Use the arrow keys to move between notes and concepts, Enter opens the note, or the dossier of a concept, Escape clears the selection."
          onKeyDown={onKeyDown}
          className="absolute inset-0 touch-none select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          data-selection={tastaturId ?? ""}
          style={{
            width: "100%",
            height: "100%",
            // Ein Konzept öffnet beim Klick sein dossier, eine Gruppe im Baum
            // faltet der Doppelklick — der Zeiger sagt, wo eine Handlung wartet.
            // Die Wurzel ist der Rahmen, sie verspricht nichts und bleibt greifbar.
            cursor:
              greift
                ? "grabbing"
                : hovered
                  ? (zeigerHand(hovered) ? "pointer" : "grab")
                  : "grab",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
          onWheel={onWheel}
          onDoubleClick={onDoubleClick}
        />

        {/* Die Projektion hat ein Leer- und ein Fehlerbild, und beide zeigen
            nichts an: eine Ansicht, die einen leeren Rahmen lässt, wo ihre
            Grundlage fehlt, ist ein Defekt, den der Nutzer erst selbst finden
            muss. Eine Leinwand wird hier nicht gemalt — unter der Auskunft
            stünde sonst das Kraftfeld und täte so, als wäre es die Karte. */}
        {!karteZeigbar && (
          <div
            data-testid="graph-semantik-leer"
            className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-6"
          >
            <div className="hud-label mb-1.5">Semantic map</div>
            <p className="text-sm max-w-sm" style={{ color: "var(--text-2)" }}>
              {karteFehler ? (
                <>The vectors could not be read from the engine, so there is nothing to project. Force and Tree need only the notes themselves.</>
              ) : karte === null ? (
                <>Reading the vectors — the projection runs on this machine, once per change.</>
              ) : (
                <>
                  This map needs at least two notes with a vector — {karte.punkte.length} here. One point
                  has no direction to spread along; two or more show what separates them.
                </>
              )}
            </p>
          </div>
        )}

        {filtered.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-6">
            <div className="hud-label mb-1.5">No match</div>
            <p className="text-sm max-w-sm" style={{ color: "var(--text-2)" }}>
              Nothing here matches “{filter.trim().slice(0, 40)}”. Clear the filter to get the whole graph back.
            </p>
          </div>
        )}

        {/* Das Schema-Inventar: was der Bestand trägt. Gezählt wird aus
            demselben Payload, den die Fläche zeichnet — eine zweite Zahl neben
            der ersten ist genau die Sorte Zahl, die in einer Welle dreimal
            falsch war. Eine Zeile ist der Griff: was sie nicht trägt, tritt
            zurück, bis sie noch einmal genommen wird. */}
        {schemaOffen && (
          <div
            data-testid="graph-schema"
            className="hud-panel absolute right-3 top-3 rounded-lg px-3 py-2 space-y-1.5 max-h-[calc(100%-1.5rem)] overflow-y-auto w-[218px] max-w-[calc(100%-1.5rem)]"
          >
            <div className="hud-label">Schema of the store</div>
            <div className="hud-label tnum" style={{ color: "var(--text-3)" }}>
              {memories.length.toLocaleString("en-US")} notes ·{" "}
              {inventar.gesamtKnoten.toLocaleString("en-US")} nodes ·{" "}
              {behauptungen.toLocaleString("en-US")} claims in the store
            </div>
            <div className="pt-0.5">
              <div className="hud-label mb-1" style={{ color: "var(--text-2)" }}>Nodes</div>
              {inventar.knoten.map((z) => (
                <button
                  key={z.schluessel}
                  data-testid="graph-schema-row"
                  aria-pressed={spot === z.schluessel ? "true" : "false"}
                  onClick={() => setSpot((v) => (v === z.schluessel ? null : z.schluessel))}
                  className="w-full flex items-baseline text-left text-[12px] py-0.5 rounded hover:bg-[var(--bg-hover)]"
                  style={spot === z.schluessel ? { color: "var(--accent)" } : { color: "var(--text-1)" }}
                >
                  <span className="truncate">{z.label}</span>{" "}
                  <span className="tnum ml-auto pl-2 shrink-0" style={{ color: "var(--text-2)" }}>
                    {z.anzahl.toLocaleString("en-US")}
                  </span>
                </button>
              ))}
            </div>
            <div>
              <div className="hud-label mb-1" style={{ color: "var(--text-2)" }}>Links</div>
              {inventar.kanten.length === 0 ? (
                <div className="text-[12px]" style={{ color: "var(--text-3)" }}>
                  Nothing claimed yet — links appear when a note names two things together.
                </div>
              ) : (
                inventar.kanten.map((z) => (
                  <button
                    key={z.schluessel}
                    data-testid="graph-schema-row"
                    aria-pressed={spot === z.schluessel ? "true" : "false"}
                    onClick={() => setSpot((v) => (v === z.schluessel ? null : z.schluessel))}
                    className="w-full flex items-baseline text-left text-[12px] py-0.5 rounded hover:bg-[var(--bg-hover)]"
                    style={spot === z.schluessel ? { color: "var(--accent)" } : { color: "var(--text-1)" }}
                  >
                    <span className="truncate">{z.label}</span>{" "}
                    <span className="tnum ml-auto pl-2 shrink-0" style={{ color: "var(--text-2)" }}>
                      {z.anzahl.toLocaleString("en-US")}
                    </span>
                  </button>
                ))
              )}
            </div>
            {spot && (
              <button onClick={() => setSpot(null)} className="hud-label w-full text-left" style={{ color: "var(--accent)" }}>
                Clear spotlight
              </button>
            )}
          </div>
        )}

        {/* Die Kräfte (P-13): vier Regler über demselben Feld. Sie bauen die Welt
            nicht neu — wer dreht, sieht zu, wie dieselbe Anordnung sich unter
            neuen Kräften setzt. Unverstellt steht hier 1,0× und das ist exakt der
            Stand der Konstanten; dann liegt nichts im Speicher. */}
        {krafteOffen && (
          <div
            data-testid="graph-krafte"
            className="hud-panel absolute left-3 top-3 rounded-lg px-3 py-2 space-y-2 w-[236px] max-w-[calc(100%-1.5rem)]"
          >
            <div className="hud-label">Forces in the field</div>
            {REGLER.map((r) => (
              <label key={r.feld} className="block">
                <span className="flex items-baseline text-[12px]" style={{ color: "var(--text-1)" }}>
                  {r.name}
                  <span
                    className="tnum ml-auto pl-2 shrink-0"
                    style={{ color: krafte[r.feld] === 1 ? "var(--text-3)" : "var(--accent)" }}
                  >
                    {krafte[r.feld].toFixed(1)}×
                  </span>
                </span>
                <input
                  type="range"
                  aria-label={r.name}
                  min={r.min}
                  max={r.max}
                  step={0.1}
                  value={krafte[r.feld]}
                  onChange={(e) => {
                    const wert = kraftWert(e.target.value, 1);
                    setzeKrafte_((v) => ({ ...v, [r.feld]: wert }));
                  }}
                  title={r.hinweis}
                  className="graph-regler"
                />
              </label>
            ))}
            <div className="text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
              Repulsion is what separates topics; the rest holds a topic together.
            </div>
            <button
              data-testid="graph-krafte-reset"
              onClick={() => setzeKrafte_({ ...KRAFTE_STAND })}
              className="hud-label w-full text-left"
              style={{ color: "var(--accent)" }}
            >
              Back to the tuned defaults
            </button>
          </div>
        )}

        {/* Die Kante unter dem Zeiger: wer ueber wen, wie oft, und wie lange.
            Der Text kommt aus demselben Stand wie das Bild — eine Kante ohne
            Typ erfindt hier keinen, und eine Aehnlichkeit bleibt ein Reim. */}
        {kantInfo && (
          <div
            ref={kantTooltipRef}
            role="tooltip"
            data-testid="graph-kante-tooltip"
            className="hud-panel absolute left-0 top-0 rounded-lg px-2.5 py-1.5 pointer-events-none space-y-0.5 max-w-[280px]"
            style={{ transform: `translate(${Math.round(kantInfo.x)}px, ${Math.round(kantInfo.y)}px) translate(-50%, 0)` }}
          >
            <div className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-1)" }}>
              <span className="truncate">{kantInfo.quelle}</span>
              <ChevronRight className="w-3 h-3 shrink-0" style={{ color: "var(--accent)" }} />
              <span className="truncate">{kantInfo.ziel}</span>
            </div>
            <div className="hud-label">{kantZeilen!.grund}</div>
            {kantZeilen!.frist && (
              <div className="text-[11px] tnum" style={{ color: "var(--text-3)" }}>
                {kantZeilen!.frist}
              </div>
            )}
          </div>
        )}

        <div
          ref={legendenRef}
          data-testid="graph-legende"
          className="absolute left-3 bottom-3 hud-panel rounded-lg px-3 py-2 pointer-events-none space-y-1"
        >
          {/* Was im Bild steht. Die Zahlengruppe sass bisher am Ende der Leiste
              und war damit das erste, was aus dem Fenster fiel (D1-01), und das
              Umbruchen ihrer laengsten Form nahm der Leinwand 42 px (A7-07).
              Sie gehoert zu dem, was die Flaeche ueber sich selbst sagt — und
              das steht an der Legende, nicht an dem, was man anklicken will.
              Gezaehlt wird, was im Bild steht, nicht was die Datenbank
              hergeben wuerde; beide Ansichten nennen dasselbe Paar, weil sie
              dasselbe Netz meinen. */}
          <div className="hud-label tnum" data-testid="graph-kopf">
            {/* Die gemalte Zahl, und dahinter die Größe des Bestands, wenn die
                Fläche weniger malt, als die Tür hat. Ohne diesen zweiten Teil
                wäre „100 notes" die Behauptung, das Gehirn habe 100 Notizen. */}
            {mengenzahl(bildZaehlung.knoten)} {bildZaehlung.knoten === 1 ? "note" : "notes"}
            {/* Der Zusatz gehört nur der Kappung: schweigt die Tür, ist die
                Liste alles, was die Fläche weiß, und „of …" wäre eine Zahl aus
                der Luft. Filter, Zeitregler und Faltung ändern die gemalte Zahl
                ohnehin — dafür steht die Bilanzzeile darunter. */}
            {bestandGroesse() !== null && bestandNotizen > bildZaehlung.knoten
              ? ` of ${mengenzahl(bestandNotizen)} in the store`
              : ""}{" "}
            ·{" "}
            {mengenzahl(netz.knoten.length)} {netz.knoten.length === 1 ? "concept" : "concepts"} ·{" "}
            {ansicht === "dendrogram"
              ? `${mengenzahl(baumLayout.edges.length)} ${baumLayout.edges.length === 1 ? "link" : "links"}`
              : `${mengenzahl(kanten.echt)} ${kanten.echt === 1 ? "link" : "links"}${aehnlichkeitsZeile(kanten.aehnlichkeit, edges.length, zoomAnzeige)}`}
          </div>
          <div className="flex items-center gap-3 hud-label">
            {/* Die Legende erklärt den Kanal, der gerade färbt — nicht den, den
                man eben abgeschaltet hat. */}
            {aktiverKanal === "herkunft"
              ? herkunft.arten.map((a) => (
                  <span key={a} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: `var(${HERKUNFT_TOKEN[a]})` }} /> {HERKUNFT_LABELS[a]}
                  </span>
                ))
              : TYP_FOLGE.map((t) => (
                  <span key={t} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: `var(${TYP_TOKEN[t]})` }} /> {TYP_BESCHREIBUNG[t]}
                  </span>
                ))}
          </div>
          {/* Was in der Scheibe steht, erklaert an der Stelle, die die Farben nennt. */}
          {/* Prosa ueber das Zeichen, nicht das Zeichen selbst — bei schmaler
              Breite tritt sie hinter die Bild-Erklaerung zurueck (index.css). */}
          <div className="hud-label legende-prosa" style={{ color: "var(--text-2)" }}>{uiT("legend.glyph")}</div>
          {/* Was die drei Geschichtszeichen bedeuten — nur wo eines im Bild
              steht. A8-05: der gestrichelte Ring, die leisere Tinte und der
              Akzentring trugen die ganze Geschichtlichkeit des Bestands und
              kamen in keiner Zeile vor. */}
          <div
            className="hud-label"
            data-testid="graph-zustaende"
            ref={zustandRef}
            style={{ color: "var(--text-2)", display: "none" }}
          />
          <div className="flex items-center gap-3 hud-label">
            <svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="var(--accent)" strokeWidth="2" /></svg>{" "}
            {ansicht === "dendrogram" ? uiT("legend.hierarchy") : uiT("legend.claim")}
            {ansicht !== "dendrogram" && (
              <>
                <svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="var(--text-1)" strokeWidth="1" opacity="0.45" /></svg> {uiT("legend.mention")}
              </>
            )}
            {ansicht !== "dendrogram" && ahnlichkeit && (
              <>
                <svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="var(--text-3)" strokeWidth="1.5" strokeDasharray="3 4" /></svg> {uiT("legend.similarity")}
              </>
            )}
          </div>
          {/* Was die Karte tut, ist eine Reduktion, und eine Reduktion schuldet
              ihre Zahl: zwei Achsen, die 61 % der Unterschiede tragen, sind ein
              anderes Bild als zwei Achsen mit 9 %. Der Modellname gehört dazu —
              Vektoren verschiedener Modelle sind keine Entfernungen. */}
          {ansicht === "semantic" && karte && (
            <div className="hud-label tnum" style={{ color: "var(--text-2)" }}>
              Two axes carry {Math.round(Math.min(1, karte.anteil[0] + karte.anteil[1]) * 100)} % of the differences
              {karte.modell ? ` · ${karte.modell}` : ""}
            </div>
          )}
          {/* Die Bilanz des Ausschnitts — nur wo etwas fehlt. */}
          {dichteZeile && (
            <div className="hud-label tnum legende-prosa" style={{ color: "var(--text-2)" }}>{dichteZeile}</div>
          )}
          {/* Wie viele der entfalteten Notizen wirklich im Bild stehen. Der Baum
              zoomt sich nicht mehr unter die Lesbarkeit, also liegt bei grossen
              Bestaenden ein Teil ausserhalb — und das steht dazu, statt dass die
              Zahl im Kopf des Nutzers still schwindet. */}
          <div
            className="hud-label tnum"
            data-testid="graph-im-bild"
            ref={imRahmenRef}
            style={{ color: "var(--text-2)", display: "none" }}
          />
          {/* Wie viele Knoten im Bild einen Titel tragen. Der Mal-Pass schreibt
              die Zahl, weil sie eine Beobachtung des gemalten Bildes ist, keine
              Rechnung vor dem Bild — und weil sie sich mit jedem Schwenk aendern
              kann, ohne dass die Flaeche dafuer neu zeichnen muss. */}
          <div
            className="hud-label tnum"
            data-testid="graph-benannt"
            ref={benanntRef}
            style={{ color: "var(--text-2)", display: "none" }}
          />
          {/* Was die Bildflaechen-Kappe des Feldes hat fallen lassen. Auch das
              steht am Rand, damit das duenne Bild nicht als volles Bild gilt. */}
          <div
            className="hud-label tnum"
            data-testid="graph-kappen"
            ref={kappenRef}
            style={{ color: "var(--text-2)", display: "none" }}
          />
          {autoZiffern > 0 && (
            <button
              onClick={() => setEntfaltet(new Set(autoFaltung))}
              className="hud-label text-left w-fit pointer-events-auto"
              style={{ color: "var(--accent)" }}
              title="Every gathered group opens — the tree grows past the canvas again, and pan and zoom are yours"
            >
              Show everything
            </button>
          )}
          {/* Die zwei Baender ueber dem Bestand — damit der erste Blick nicht eine
              Klammer um den ganzen Laden ist, sondern seine Groessenordnung. */}
          {regal && <GraphRegal regal={regal} ansichtsName={ansicht === "dendrogram" ? "the tree" : "the field"} />}
          {/* Die Griffe erklaert die Flaeche schon an den Werkzeugen selbst; auf dem
              Telefon sind sie teils nicht einmal vorhanden (kein Hover, kein Rad).
              Bei schmaler Breite tritt die Zeile zurueck — index.css, `.legende-prosa`. */}
          <div className="hud-label legende-prosa">
            {ansicht === "dendrogram"
              ? uiT("hint.tree")
              : ansicht === "semantic"
                ? uiT("hint.semantic")
                : uiT("hint.force")}
          </div>
        </div>
      </div>
    </div>
  );
}
