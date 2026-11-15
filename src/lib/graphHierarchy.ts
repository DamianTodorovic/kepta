// Hierarchisches Dendrogramm-Layout fuer den Wissensgraphen.
//
// Das Kraftfeld (graphLayout.ts) ordnet Notizen nach Aehnlichkeit — gut fuer
// Landschaften, schlecht fuer Inventuren. Diese lib baut aus denselben Daten
// einen Baum (Wurzel -> Memory-Typ -> Entitaet -> Notiz) und positioniert ihn
// als horizontales Dendrogramm: Blaetter gestapelt, Eltern ueber ihren Kindern
// zentriert, Tiefe von links nach rechts.
//
// Die Ausgabe ist absichtlich dasselbe Format wie graphLayout (LayoutNode/
// LayoutEdge): der Zeichencode in KnowledgeGraph.tsx bleibt unveraendert — nur
// die Positionen kommen hierher statt aus der Physik.
import type { Memory } from "../types";
import { gruppen, quellpfad, type Gruppe, type Traeger, type Thema } from "../core/klassifikation";
import { notizEtikett } from "./graphLayout";
import type { LayoutEdge, LayoutNode, Bounds } from "./graphLayout";

/** Interner Knoten des Baums (Wurzel, Typ, Entitaet) — ohne eigene Memory. */
export interface StrukturKnoten {
  label: string;
  /** Farbe aus der Typ-Palette; Wurzel/Entitaeten erben bzw. sind neutral. */
  farbe: string | null;
  r: number;
  /**
   * true, wenn dieser Knoten nichts sagt, was nicht eines seiner Kinder schon
   * sagt. Im Baum von 3 000 Notizen war das die Regel: Entitaet heisst
   * „elena weiss — tax advisor", ein Kind darunter heisst genauso — und beide
   * Namen standen nebeneinander in derselben Zeile. Der Knoten wird weiter
   * gezeichnet (er traegt die Kante), nur sein Etikett bleibt weg.
   */
  keinEtikett?: boolean;
  /**
   * Wie viele Notizen unter diesem Knoten hängen. Wer über einem Begriff
   * steht, fragt: was ist das, und wie viel trägt es? Der volle Name passt
   * nicht in 16 Zeichen, die Zahl aber schon.
   */
  blaetter?: number;
  /**
   * true, wenn diese Gruppe zugeklappt ist: ihre Kinder liegen nicht im Bild,
   * ihre `blaetter`-Zahl aber bleibt die Wahrheit über das, was dahinter steht.
   */
  eingeklappt?: boolean;
  /**
   * Wie viele Notizen die Faltung WIRKLICH verbirgt. Im Kraftfeld trägt eine
   * Notiz oft zwei Begriffe und bleibt sichtbar, obwohl einer gefaltet ist —
   * dort ist `verdeckt` kleiner als `blaetter`, und nur diese Zahl darf am
   * Malzeichen stehen.
   */
  verdeckt?: number;
}

// ---------- Baum ----------

export interface HierarchieKnoten {
  id: string;
  kind: "root" | "type" | "entity" | "group" | "memory";
  label: string;
  /** Nur bei type: der Memory-Typ, der die Knotenfarbe liefert. */
  typ?: "semantic" | "episodic" | "procedural" | "reference";
  children: HierarchieKnoten[];
}

/**
 * Die Etikette der vier Rechen-Arten. **Nicht fuer Sichttext** — die vier Woerter
 * sind verworfen (Damian, 14.10.: kein Nutzer versteht, was damit gemeint ist).
 * Diese Map bleibt, weil sie der Maschinen-Seite ihre Kurztitel gibt und weil
 * `tests/kategorien-wache.test.ts` aus ihr die verbotenen Woerter ableitet:
 * keine Flaeche darf sie zeigen, und keine Flaeche darf diese Map importieren.
 * Sichttext bekommt `TYP_BESCHREIBUNG` oder die neun Woerter.
 */
export const TYP_LABELS: Record<string, string> = {
  semantic: "Facts",
  episodic: "Events",
  procedural: "How-tos",
  // Heisst in der App „Document" (Editor-Button) — nicht „Source".
  reference: "Documents",
};

/**
 * Was ein Mensch an denselben vier Stellen liest: eine Beschreibung in
 * Alltagssprache, kein Korb-Wort. Die Rechen-Art bleibt das, was sie ist — der
 * Sichttext wandert (Auftrag #84).
 */
export const TYP_BESCHREIBUNG: Record<string, string> = {
  // P197 (Damian, 23:03): die Namen müssen SOFORT sagen, was darunter fällt —
  // benannt nach der Vergabe in `src/core/klassifikation.ts` (formulierter Text
  // ohne Ablauf/Datum; Ereignis-Wort im Titel/Ereignis-Tag; nummerierte Schritte
  // oder Anleitungs-Wort; Datei-Endung, Rechner-Scan, überwiegend Markup).
  semantic: "Facts & knowledge",
  episodic: "Events & dates",
  procedural: "How-tos & instructions",
  reference: "Documents & files",
};

const BEKANNTE_TYPEN = ["semantic", "episodic", "procedural", "reference"];

// ---------- Die Menschenschicht: neun Woerter in zwei Zeilen ----------
//
// TYP_LABELS oben ist die Maschinen-Seite der vier Rechen-Arten: Kurztitel,
// Farb-Token, und der Grund, aus dem die Wache ihre verbotenen Woerter ableitet.
// Was ein Mensch liest, ist TYP_BESCHREIBUNG oder eines der neun Woerter unten.
//
//   Zeile 1 (woher): Notes · Files · Code        erschoepfend, ohne Ueberschneidung
//   Zeile 2 (worum): People · Projects · Events · Tasks · Guides · Links
//                    kombinierbar, und NIE in Code
//
// Die Regeln dazu liegen im Kern (src/core/klassifikation.ts) — hier stehen nur
// die Woerter und ein Duennschicht-Zugriff, damit Flaeche und Graph dieselben
// Antworten geben wie die Tests.
export type { Traeger, Thema, Gruppe } from "../core/klassifikation";

export const TRAEGER_REIHENFOLGE: Traeger[] = ["notes", "files", "code", "daten", "anderes"];
export const THEMA_REIHENFOLGE: Thema[] = ["people", "projects", "events", "tasks", "guides", "links"];

/** Was die Zahl-Route antwortet - nur die Teile, die diese Entscheidung braucht. */
export type AchsenZahlen = {
  traeger: Record<Traeger, number>;
  themen: Record<Thema, number>;
  themenNachTraeger?: Partial<Record<Traeger, Partial<Record<Thema, number>>>>;
};

/**
 * Die Bestandzahl genau der Wahl, die ins Leere laeuft.
 *
 * Die Flaeche filtert Thema und Fach zusammen (`Dashboard.tsx:948-956` sagt das auch), aber
 * die Zahl dazu nannte bis 3.2.108 nur ein Fach allein oder ein Thema allein. Die Kreuztabelle
 * der Route kennt die Zelle, und ein Fach schliesst sich pro Notiz aus - ueber gewaehlte
 * Zeilen zu summieren ist darum exakt, nicht ungefaehr.
 *
 * Zwei Themen sind eine Vereinigung ("irgendeins davon"), und die kann ueber Zeilen doppelt
 * zaehlen. Diese Wahl bleibt stumm: eine Zahl, die fuer ihren Fall per Konstruktion falsch
 * sein muss, ist keine Auskunft.
 */
export function zahlDerAuswahl(
  zahlen: AchsenZahlen | null,
  gewaehlteTraeger: readonly Traeger[],
  gewaehlteThemen: readonly Thema[],
): number | undefined {
  if (!zahlen) return undefined;
  if (gewaehlteThemen.length === 1) {
    const thema = gewaehlteThemen[0];
    const facher = gewaehlteTraeger.length > 0 ? gewaehlteTraeger : TRAEGER_REIHENFOLGE;
    const tabelle = zahlen.themenNachTraeger;
    if (tabelle) return facher.reduce((n, f) => n + (tabelle[f]?.[thema] ?? 0), 0);
    // Eine Tuer ohne Tabelle kennt nur den Rand, und der Rand gilt der ganzen Menge -
    // also nur dann eine Zahl, wenn gar kein Fach gewaehlt ist.
    return gewaehlteTraeger.length === 0 ? zahlen.themen[thema] : undefined;
  }
  if (gewaehlteThemen.length === 0 && gewaehlteTraeger.length === 1) {
    return zahlen.traeger[gewaehlteTraeger[0]];
  }
  return undefined;
}

export const TRAEGER_LABELS: Record<Traeger, string> = {
  notes: "Notes",
  files: "Files",
  code: "Code",
  // Der Name sagt, was drin liegt: 9 860 von 9 978 "Code"-Stuecken an seinem Bestand waren JSON.
  daten: "Data",
  // Das letzte Fach ist die eigne Luecke der beiden Endungslisten — es zeigt sie, statt sie zu
  // verstecken. Ein Fach, das aufnimmt, was sonst nirgends hinguemmt hat, teilt nichts ein.
  anderes: "Other",
};

/**
 * Die Frage hinter den Traeger-Zahlen — ein Wort, eine Achse (Punkt 5, 29.10.).
 *
 * Bis hierher stand ueber "Notes / Files / Code" der Satz "where it came from"
 * (`Dashboard.tsx:1829`), waehrend dasselbe Wort im Graph die HERKUNFT meint
 * (`graphHerkunft.ts:47`: geschrieben, aus einer Datei, von diesem Rechner). Zwei
 * Achsen, ein Wort: der Leser muss raten, welche Zahl was sagt. Die Marktzaehlung
 * von heute (feldzug/belege-2910/markt/MARKT-FUNKTIONEN-GRUPPIERUNG-2910.md,
 * Abschnitt E1) nennt keine einzige Bibliothek, die ihre erste Achse anders benennt
 * als ihre Zahlen zaehlen.
 */
export const TRAEGER_FRAGE = "In what form";
/**
 * Dasselbe Wort am Anfang einer Zeile, wo die Flaeche klein anfängt. Geschrieben,
 * nicht gerechnet: ein `.toLowerCase()` ueber einem Wort mit Marke biegt die Marke
 * (Hausregel 14.10., "written in k3pta"), und hier haengt an dem Wort die Menge.
 */
export const TRAEGER_FRAGE_SATZ = "in what form";
/** Die Frage der zweiten Zeile — dieselbe Regel, ein Wort, eine Achse. */
export const THEMA_FRAGE = "What it is about";

/** Ein Satz, der erklaert, ohne ein Fachwort zu brauchen. */
export const TRAEGER_HINWEISE: Record<Traeger, string> = {
  notes: "typed here — no file behind it",
  files: "a document from your folders",
  code: "programs and sources — something that runs or compiles",
  daten: "settings, exports, tables — read, not run",
  anderes: "no known form — this is the shelf's own gap, not a kind of your knowledge",
};

export const THEMA_LABELS: Record<Thema, string> = {
  people: "People",
  projects: "Projects",
  events: "Events",
  tasks: "Tasks",
  guides: "Guides",
  links: "Links",
};

export const THEMA_HINWEISE: Record<Thema, string> = {
  people: "a name, a role, a way to reach them",
  projects: "something being built or run — a client, a case, a shop",
  events: "it happened at a time: a meeting, a call, a date",
  tasks: "still to do: open point, deadline, next step",
  guides: "how it is done: steps, setup, checklist",
  links: "a web address or a source to read",
};

/**
 * Traeger und Themen einer Notiz — dieselbe Rechnung wie im Kern und in den
 * Tests.
 *
 * Der Puffer dahinter ist keine Bequemlichkeit: ein Klick auf einen Chip laeuft
 * ueber den ganzen Bestand, und ungebuffert kostet das 14.702 x sechs Regexe
 * (~350 ms, gemessen 17:1x am echten Bestand) — eine Flaeche, die bei jedem
 * Klick eine drittel Sekunde haengt. Geschluesselt ist auf id + updatedAt,
 * weil sich Inhalt und Tags nur mit dem Aenderungszeitpunkt aendern; ein
 * umbenannter oder neu getaggter Knoten rechnet also von selbst neu.
 */
const gruppenPuffer = new Map<string, Gruppe>();
export function gruppenVonNotiz(m: { id?: string; title?: string; content?: string; tags?: readonly string[]; updatedAt?: number }): Gruppe {
  const schluessel = m.id ? `${m.id}:${m.updatedAt ?? 0}` : null;
  if (schluessel) {
    const gepuffert = gruppenPuffer.get(schluessel);
    if (gepuffert) return gepuffert;
  }
  const berechnet = gruppen({ title: m.title ?? "", content: m.content ?? "", tags: m.tags ?? [] });
  if (schluessel) {
    if (gruppenPuffer.size > 24_000) gruppenPuffer.clear();
    gruppenPuffer.set(schluessel, berechnet);
  }
  return berechnet;
}

/**
 * Die Faecher, in denen eine Notiz bei der Gruppierung "nach Thema" steht.
 *
 * Punkt 5 / #63, gemessen 5.11. 15:38:17 MEZ an seinem Bestand (21 064 Notizen, durch die
 * eigne Tuer der laufenden Auslieferung): die Themen-Achse teilt in vier Faelle zwischen
 * 7,90 und 48,38 %, und 3 156 Notizen (14,98 %) tragen kein Thema. Die Tuer zaehlt eine
 * Notiz in JEDES ihrer Themen (server/router/memories.ts:299) -- gruppierte die Flaeche
 * nur nach dem ersten, stuenden zwei Zahlen desselben Wortes da, ohne erklaerten
 * Unterschied. Also: jedes Thema ein Fach, und das Fach ohne Thema ist benannt.
 */
export function themenFaecher(m: { title?: string; content?: string; tags?: readonly string[]; id?: string; updatedAt?: number }): string[] {
  const g = gruppenVonNotiz(m);
  if (!g.themen.length) return ["ohne-thema"];
  return g.themen.map((t) => `thema:${t}`);
}

/** Die Menschenschrift fuer eine Notiz: "Files · People, Projects". Code hat keine Themen. */
export function gruppenEtikett(m: { title?: string; content?: string; tags?: readonly string[] }): string {
  const g = gruppenVonNotiz(m);
  const themen = g.themen.length ? ` · ${g.themen.map((t) => THEMA_LABELS[t]).join(", ")}` : "";
  return `${TRAEGER_LABELS[g.traeger]}${themen}`;
}

/**
 * Entitaetszugehoerigkeit je Notiz. Die Graph-DB liefert `memoriesByEntity`
 * (Entitaetsname -> Notiz-IDs); hier invertiert. Eine Notiz mit mehreren
 * Entitaeten bekommt die alphabetisch erste — deterministisch, auch wenn
 * /api/graph die Reihenfolge aendert.
 */
export function entitiesByMemory(
  memoriesByEntity: Record<string, readonly string[]> | undefined
): Map<string, string> {
  const out = new Map<string, string>();
  const namen = Object.keys(memoriesByEntity ?? {}).sort((a, b) => a.localeCompare(b));
  for (const name of namen) {
    for (const id of memoriesByEntity![name]) {
      if (!out.has(id)) out.set(id, name);
    }
  }
  return out;
}

/**
 * Wie oft jede Marke im sichtbaren Bestand vorkommt. Ein Zensus ueber die Liste,
 * damit die zweite Ebene des Baums eine Wahl hat und keine Reihenfolge.
 */
export function markenHaeufigkeit(memories: readonly Memory[]): Map<string, number> {
  const aus = new Map<string, number>();
  for (const m of memories) {
    for (const roh of new Set((m.tags ?? []).map((t) => String(t).trim().toLowerCase()).filter(Boolean))) {
      aus.set(roh, (aus.get(roh) ?? 0) + 1);
    }
  }
  return aus;
}

/**
 * Die trennendste Marke eines Stuecks — nicht die erste.
 *
 * Gemessen 18.10. an Damians echtem Bestand (21 066 Notizen, GET /api/memories?alle=1):
 * 20 974 Stuecke tragen die Marke `machine-scan` als ERSTES Element, und der Scan
 * haengt die Dateiendung dahinter (`md`, `json`, `txt`, `html`). Die erste Marke
 * legt also 99,56 % des Bestands in EIN Fach — ein Fach, das nichts einteilt. Ueber
 * die seltenste Marke derselben Notiz fallen groesstes Fach 43,02 % (md) und 64 Facher.
 * Das ist kein Gewinn, den man kaufen kann, ohne ihn zu sehen: beide Zahlen nennt
 * die Wache in `tests/lib/gruppen-regal.test.ts`.
 *
 * Der Rest bleibt offen benannt: was uebrig bleibt, sind Dateiformate, keine
 * Betreffs. Fuer Betreffs ist `baueRegal` da.
 */
export function trennendsteMarke(
  m: { tags?: readonly string[] },
  haeufigkeit: ReadonlyMap<string, number>,
): string | null {
  let beste: string | null = null;
  let besteZahl = Infinity;
  for (const roh of new Set((m.tags ?? []).map((t) => String(t).trim().toLowerCase()).filter(Boolean))) {
    const n = haeufigkeit.get(roh) ?? 0;
    if (n < besteZahl || (n === besteZahl && beste !== null && roh < beste)) {
      beste = roh;
      besteZahl = n;
    }
  }
  return beste;
}

/**
 * Baum: Wurzel -> Typ -> trennendste Marke / Begriff -> Notiz.
 *
 * Notizen OHNE Entitaet werden nach ihrer trennendsten Marke gruppiert — sonst
 * artet der Baum bei Massen-Importen (z. B. Maschinen-Scan) in ein ebenes
 * Fächerung aus tausenden direkten Blaettern aus, die keine Hierarchie zeigt,
 * oder in EIN Fach namens `#machine-scan` mit 99,56 % des Ladens.
 * Notizen ohne Entitaet UND ohne Marke landen unter "Other". Typen ohne Notizen
 * entfallen; leere Eingabe ergibt eine einzelne Wurzel ohne Kinder.
 */
export function buildHierarchy(
  memories: readonly Memory[],
  entitaeten: ReadonlyMap<string, string> = new Map(),
  /**
   * Die Konzeptmenge aus entitaetsNetz. Wird sie mitgegeben, ist der Baum kein
   * zweites Regelwerk: eine Entität, die das Feld nicht zeigt, wird auch hier
   * kein Knoten. Ohne diese Grenze standen für dieselbe Wissensbasis zwei
   * Zahlen im Kopf — und die Idee war eine Ontologie.
   */
  konzepte?: ReadonlySet<string>
): HierarchieKnoten {
  const wurzel: HierarchieKnoten = { id: "__wurzel", kind: "root", label: "Knowledge", children: [] };
  const haeufigkeit = markenHaeufigkeit(memories);
  const nachTyp = new Map<string, Memory[]>();
  for (const m of memories) {
    // Die API liefert ueber die drei bekannten hinaus auch andere Typen
    // (z. B. "reference" aus dem Maschinen-Scan). Jeder bekommt seine Gruppe —
    // wer hier fallen gelassen wird, bleibt spaeter ohne Ziel im Baum stehen.
    const t = (m.type ?? "semantic") as string;
    let liste = nachTyp.get(t);
    if (!liste) { liste = []; nachTyp.set(t, liste); }
    liste.push(m);
  }
  const bekannt = BEKANNTE_TYPEN.filter((t) => nachTyp.has(t));
  const rest = [...nachTyp.keys()]
    .filter((t) => !bekannt.includes(t))
    .sort((a, b) => a.localeCompare(b));
  for (const t of [...bekannt, ...rest]) {
    const istBekannt = BEKANNTE_TYPEN.includes(t);
    const typKnoten: HierarchieKnoten = {
      id: `__typ:${t}`,
      kind: "type",
      label: TYP_BESCHREIBUNG[t] ?? t,
      typ: istBekannt ? (t as HierarchieKnoten["typ"]) : undefined,
      children: [],
    };
    const nachEntitaet = new Map<string, Memory[]>();
    const nachTag = new Map<string, Memory[]>();
    const markeZeigt = new Map<string, string>();
    const ohne: Memory[] = [];
    for (const m of nachTyp.get(t)!) {
      const e = entitaeten.get(m.id);
      if (e && (!konzepte || konzepte.has(e))) {
        let liste = nachEntitaet.get(e);
        if (!liste) { liste = []; nachEntitaet.set(e, liste); }
        liste.push(m);
        continue;
      }
      const marke = trennendsteMarke(m, haeufigkeit);
      if (marke) {
        if (!markeZeigt.has(marke)) {
          const roh = (m.tags ?? []).map((x) => String(x).trim()).find((x) => x.toLowerCase() === marke);
          markeZeigt.set(marke, roh ?? marke);
        }
        let liste = nachTag.get(marke);
        if (!liste) { liste = []; nachTag.set(marke, liste); }
        liste.push(m);
      } else {
        ohne.push(m);
      }
    }
    for (const e of [...nachEntitaet.keys()].sort((a, b) => a.localeCompare(b))) {
      typKnoten.children.push({
        id: `__ent:${e}`,
        kind: "entity",
        label: e,
        children: nachEntitaet.get(e)!
          .slice()
          .sort((a, b) => (a.title || "").localeCompare(b.title || ""))
          .map((m) => ({ id: m.id, kind: "memory" as const, label: notizEtikett(m).text, children: [] })),
      });
    }
    for (const k of [...nachTag.keys()].sort((a, b) => a.localeCompare(b))) {
      typKnoten.children.push({
        id: `__tag:${k}`,
        kind: "group",
        label: `#${markeZeigt.get(k) ?? k}`,
        children: nachTag.get(k)!
          .slice()
          .sort((a, b) => (a.title || "").localeCompare(b.title || ""))
          .map((m) => ({ id: m.id, kind: "memory" as const, label: notizEtikett(m).text, children: [] })),
      });
    }
    for (const m of ohne) {
      typKnoten.children.push({ id: m.id, kind: "memory", label: notizEtikett(m).text, children: [] });
    }
    wurzel.children.push(typKnoten);
  }
  return wurzel;
}

// ---------- Layout ----------

export interface DendrogrammOptionen {
  /** Vertikaler Abstand zweier Blaetter in Welt-Einheiten. */
  blattAbstand?: number;
  /** Horizontaler Abstand einer Ebene. */
  ebenenAbstand?: number;
  /** Radius je Knotenart. */
  radien?: Partial<Record<HierarchieKnoten["kind"], number>>;
  /**
   * ids der Gruppen, die zugeklappt liegen. Ein leeres Set ist dasselbe wie
   * keines: der Baum startet entfaltet, die Faltung ist eine Benutzerhandlung.
   */
  eingeklappt?: ReadonlySet<string>;
}

/**
 * Der Abstand zweier Blaetter in Welteinheiten. Steht als Groesse hier, weil
 * die Flaeche daraus ihren Lesbarkeitsboden rechnet (`zeilenKMin`): was eine
 * Zeile hier ist, ist sie auf dem Schirm mal dem Zoom.
 */
export const BLATT_ABSTAND = 38;

const STANDARD: Required<Omit<DendrogrammOptionen, "radien" | "eingeklappt">> & { radien: Record<HierarchieKnoten["kind"], number> } = {
  blattAbstand: BLATT_ABSTAND,
  ebenenAbstand: 190,
  radien: { root: 11, type: 9, entity: 8, group: 8, memory: 7 },
};

export interface DendrogrammLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  bounds: Bounds;
  /** Interne Knoten (Wurzel/Typ/Entitaet) — brauchen eigene Zeichenlogik. */
  struktur: Map<string, StrukturKnoten>;
}

/**
 * Horizontales Tidy-Tree: ein Durchgang unten->oben (Blattstapel), dann
 * x = Tiefe * ebenenAbstand. Eltern zentrieren sich auf der Spanne ihrer
 * Kinder; weil jeder Knoten seine Kinder links-kennt (x ergibt sich rein aus
 * der Tiefe), kann kein Teilbaum mit einem anderen kollidieren — die
 * Blatt-Verteilung ist eindeutig.
 */
export function layoutDendrogram(
  baum: HierarchieKnoten,
  opts: DendrogrammOptionen = {}
): DendrogrammLayout {
  const blattAbstand = opts.blattAbstand ?? STANDARD.blattAbstand;
  const ebenenAbstand = opts.ebenenAbstand ?? STANDARD.ebenenAbstand;
  const radien = { ...STANDARD.radien, ...(opts.radien ?? {}) };
  // Nur eine Gruppe mit Kindern kann gefaltet sein — eine Blattnotiz steht
  // sowieso allein, und ihr ein „zugeklappt" anzuhängen wäre ein Zustand ohne
  // Wirkung und mit Irreführung.
  const gefaltet = (k: HierarchieKnoten) => k.children.length > 0 && !!opts.eingeklappt?.has(k.id);

  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  const struktur = new Map<string, StrukturKnoten>();
  let blattY = 0;

  const besuche = (k: HierarchieKnoten, tiefe: number): number => {
    const r = radien[k.kind];
    if (k.children.length === 0 || gefaltet(k)) {
      const y = blattY * blattAbstand;
      blattY += 1;
      nodes.push({ id: k.id, x: tiefe * ebenenAbstand, y, vx: 0, vy: 0, r, pinned: false });
      return y;
    }
    const kinderY: number[] = [];
    for (const c of k.children) {
      kinderY.push(besuche(c, tiefe + 1));
      edges.push({ source: k.id, target: c.id, strength: 1, real: true });
    }
    const y = (Math.min(...kinderY) + Math.max(...kinderY)) / 2;
    nodes.push({ id: k.id, x: tiefe * ebenenAbstand, y, vx: 0, vy: 0, r, pinned: false });
    return y;
  };
  besuche(baum, 0);

  for (const n of nodes) {
    if (n.id === "__wurzel") struktur.set(n.id, { label: baum.label, farbe: null, r: radien.root });
  }
  // „Elena Weiss — tax advisor" und „elena weiss — tax advisor" sind derselbe
  // Name. Verglichen wird, was ein Mensch liest: Buchstaben und Ziffern, in
  // Gross- oder Kleinschreibung egal, Punkt und Gedankenstrich weg.
  const kennwort = (t: string) => t.toLowerCase().replace(/[^0-9a-zäöüß&]/g, "");
  // Ein Knoten, dessen Namen eines seiner Kinder schon trägt, sagt auf seiner
  // Zeile nichts Neues: links der Ebenenname, rechts derselbe Titel als Notiz.
  // Der Leser weiss dann nicht, was Ebene und was Blatt ist.
  const nurWiederholung = (k: HierarchieKnoten) =>
    k.children.some((c) => kennwort(c.label) === kennwort(k.label));
  // Notizen unter diesem Knoten — ein Blatt ist die Notiz selbst.
  const zaehleBlaetter = (k: HierarchieKnoten): number =>
    k.children.length === 0 ? 1 : k.children.reduce((n, c) => n + zaehleBlaetter(c), 0);
  const sammleStruktur = (k: HierarchieKnoten): void => {
    if (k.kind === "type" || k.kind === "entity" || k.kind === "group") {
      struktur.set(k.id, {
        label: k.label,
        farbe: k.kind === "type" ? k.typ ?? null : null,
        r: radien[k.kind],
        keinEtikett: nurWiederholung(k) || undefined,
        blaetter: zaehleBlaetter(k),
        eingeklappt: gefaltet(k) || undefined,
      });
    }
    // Die Kinder einer gefalteten Gruppe sind nicht im Bild — also bekommen
    // sie auch kein Etikett und keine Farbe, die jemand lesen könnte.
    if (gefaltet(k)) return;
    for (const c of k.children) sammleStruktur(c);
  };
  sammleStruktur(baum);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    if (n.x - n.r < minX) minX = n.x - n.r;
    if (n.y - n.r < minY) minY = n.y - n.r;
    if (n.x + n.r > maxX) maxX = n.x + n.r;
    if (n.y + n.r > maxY) maxY = n.y + n.r;
  }
  const bounds: Bounds =
    nodes.length === 0
      ? { minX: -100, minY: -100, maxX: 100, maxY: 100 }
      : { minX, minY, maxX, maxY };
  return { nodes, edges, bounds, struktur };
}

/**
 * Ein Uebergangsschritt: Knoten gleiten zu ihren Zielpositionen. true, solange
 * noch Bewegung im System — die Schleife in der Komponente ruft auf, bis false
 * kommt. Der Faktor folgt der Daempfungsphilosophie des Kraftfelds: schnell
 * genug, um zuzuordnen, langsam genug, um nicht zu springen.
 */
/**
 * Welche Gruppen der Baum falten muss, damit er in eine Zahl Zeilen passt.
 *
 * Der Baum war immer so groß, wie sein Bestand Zeilen braucht: 400 Notizen sind
 * 425 Zeilen. Die Leinwand hält bei lesbarem Abstand etwa vierunddreißig aus.
 * Bisher entschied das die Kamera — sie band den Ausschnitt bei 0,35 an, und der
 * Baum wurde oben und unten abgeschnitten (gemessen: 59 von 129 Zeilen waren
 * überhaupt gemalt, eine lag bei y = −18). Der Knopf „alles zeigen" ließ eine
 * 42 px breite Haarlinie. Beides zeigt einen Baum, den niemand liest.
 *
 * Gefaltet wird von unten. Der größte Brocken wäre oben — einen Typ zu falten
 * spart mehr Zeilen als eine Gruppe, und der Baum hört dann über seinen Begriffen
 * auf: übrig bleibt eine Zahl, keine Struktur. Von unten bleiben die Ebenen
 * erhalten, die jemand als Landkarte braucht, und nur die Massen dahinter treten
 * hinter ein Malzeichen.
 *
 * Die Wurzel ist kein Kandidat: ein Baum, der sich selbst verschließt, ist kein
 * Bild mehr. Reicht auch die tiefste Faltung nicht, bleibt die Struktur an der
 * obersten Ebene stehen, und die Fläche sagt das.
 *
 * Zwei Grenzen gegen die Gier desselben Verfahrens (A7-01, gemessen am echten
 * Bestand): die Typ-Ebene ist kein Kandidat, und die Faltung nimmt nie die
 * letzte Notiz. Bei 60 Notizen falte sie alle 15 Gruppen und ließ „Showing 0 of
 * 60 notes" zurück — eine Ansicht, die nur noch Zahlen zeigt, ist keine Ansicht,
 * und der eine Knopf darunter war nicht zu treffen. Was die Zeilen dann über den
 * Rahmen stehen, sagt die Bilanz; die Kamera nimmt sie mit.
 */
/** Eine Gruppe, die nur ein oder zwei Notizen verbirgt, wird nicht gefaltet. */
export const FALTUNG_MIN_NOTIZEN = 3;
/**
 * So viele Notizen muss die automatische Faltung immer im Bild lassen.
 *
 * Eins ist die Untergrenze, nicht drei: die Zusage ist „die Ansicht zeigt Inhalt",
 * und wer bei 1 500 Notizen drei einzelne Blaetter offen laesst, erzaehlt eine
 * Geschichte, die keine ist. Was hinter den Malzeichen liegt, sagt die Bilanz.
 */
export const FALTUNG_HALTE_NOTIZEN = 1;

export function vorschlagFaltung(baum: HierarchieKnoten, zeilen: number): string[] {
  if (zeilen <= 0) return [];
  /** Sichtbare Zeilen unter diesem Knoten — wird mit jeder Faltung nachgezogen. */
  const zeilenUnter = new Map<string, number>();
  /** Notizen (Blätter) unter diesem Knoten — die Zahl, die eine Faltung kostet. */
  const notizenUnter = new Map<string, number>();
  const aelter = new Map<string, string | null>();
  const ebenen = new Map<number, { id: string; art: HierarchieKnoten["kind"] }[]>();
  let tiefste = 0;
  const zaehle = (k: HierarchieKnoten, wer: string | null, tiefe: number): { zeilen: number; notizen: number } => {
    let n = 1;
    let blaetter = k.children.length === 0 ? 1 : 0;
    for (const c of k.children) {
      const unten = zaehle(c, k.id, tiefe + 1);
      n += unten.zeilen;
      blaetter += unten.notizen;
    }
    zeilenUnter.set(k.id, n);
    notizenUnter.set(k.id, blaetter);
    aelter.set(k.id, wer);
    // Kandidat ist jede Ebene mit Kindern ausser der Typ-Ebene: die Typen sind
    // die Landkarte des Baums, und eine Klammer um „Facts" verbirgt den halben
    // Bestand hinter einer Zahl (A7-01, gemessen: „Showing 0 of 60 notes").
    if (k.children.length > 0 && tiefe > 0 && k.kind !== "type") {
      if (!ebenen.has(tiefe)) ebenen.set(tiefe, []);
      ebenen.get(tiefe)!.push({ id: k.id, art: k.kind });
      tiefste = Math.max(tiefste, tiefe);
    }
    return { zeilen: n, notizen: blaetter };
  };
  const gesamt = zaehle(baum, null, 0).zeilen;
  if (gesamt <= zeilen) return [];

  const halteNotizen = Math.min(FALTUNG_HALTE_NOTIZEN, notizenUnter.get(baum.id) ?? 0);
  let sichtbareNotizen = notizenUnter.get(baum.id) ?? 0;
  const gewaehlt = new Set<string>();
  let uebrig = gesamt;
  for (let tiefe = tiefste; tiefe >= 1 && uebrig > zeilen; tiefe--) {
    // Innerhalb einer Ebene ändert eine Faltung die Gewinne ihrer Nachbarn
    // nicht — Väter liegen immer eine Ebene höher. Also genügt ein Sortieren
    // je Ebene statt eines Neubewertens je Zug.
    const kandidaten = (ebenen.get(tiefe) ?? [])
      .map(({ id }) => ({ id, gewinnt: (zeilenUnter.get(id) ?? 1) - 1, notizen: notizenUnter.get(id) ?? 0 }))
      .filter((k) => k.notizen >= FALTUNG_MIN_NOTIZEN && k.gewinnt > 0)
      .sort((a, b) => b.gewinnt - a.gewinnt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const k of kandidaten) {
      if (uebrig <= zeilen) break;
      // Die letzte Notiz bleibt liegen: was unter der Haltezahl liegt, ist eine
      // Zeile ohne Inhalt. Überspringen, nicht abbrechen — eine kleinere Gruppe
      // weiter unten im Sortierungsfeld ist noch zu haben.
      if (sichtbareNotizen - k.notizen < halteNotizen) continue;
      gewaehlt.add(k.id);
      uebrig -= k.gewinnt;
      sichtbareNotizen -= k.notizen;
      for (let p: string | null = k.id; p; p = aelter.get(p) ?? null) {
        zeilenUnter.set(p, (zeilenUnter.get(p) ?? 1) - k.gewinnt);
      }
    }
  }
  return [...gewaehlt];
}

/**
 * Der Zoom-Boden des Baums: die kleinste Darstellung, bei der zwei Zeilen auf
 * dem Schirm noch `lesbarPx` auseinanderstehen.
 *
 * F8-N1, im eigenen Bild gesehen: nachdem die Faltung nicht mehr die letzte
 * Notiz frisst, ist der Baum hoehher als sein Rahmen — und die Kamera hat ihn
 * trotzdem komplett hinein gepresst. Bei 400 Notizen standen zwei Zeilen 3 px
 * auseinander: eine Haarlinie, in der weder Titel noch ×N-Badges zu lesen sind.
 * Der Baum darf ueber den Rahmen hinausgehen (die Flaeche sagt, was im Bild
 * steht); er darf sich nicht auf Lesbarkeit hinauszoomen lassen.
 */
export function zeilenKMin(lesbarPx: number, blattAbstand: number): number {
  return lesbarPx / Math.max(1, Math.abs(blattAbstand) || 1);
}

export const GLIDE_FAKTOR = 0.22;/**
 * Ab welcher Restdistanz ein Knoten AUF DAS ZIEL geschnappt wird. Ohne das
 * kriecht der Schweif der asymptotischen Annaeherung minutenlang mit
 * subpixelgenauen Bewegungen weiter — unabhaengig vom Zoom lesbar: 1 Welt-
 * Einheit ist bei typischen 0.35er Zoom ein Drittel Pixel.
 */
export const GLIDE_EPSILON = 1.5;

export function stepDendrogram(
  nodes: readonly LayoutNode[],
  ziel: ReadonlyMap<string, { x: number; y: number }>,
  faktor = GLIDE_FAKTOR
): boolean {
  let bewegt = false;
  for (const n of nodes) {
    const t = ziel.get(n.id);
    if (!t) continue;
    const dx = t.x - n.x;
    const dy = t.y - n.y;
    if (Math.abs(dx) > GLIDE_EPSILON || Math.abs(dy) > GLIDE_EPSILON) {
      n.x += dx * faktor;
      n.y += dy * faktor;
      bewegt = true;
    } else if (n.x !== t.x || n.y !== t.y) {
      n.x = t.x;
      n.y = t.y;
      // Der Sprung ist Bewegung, auch wenn er unter dem Epsilon liegt: die
      // Bildschleife zeichnet nur, was ihr diese Funktion zurückgibt, und
      // meldete hier Ruhe — das stehende Bild blieb bis zu einem Epsilon
      // hinter der Rechnung zurück.
      bewegt = true;
    }
  }
  return bewegt;
}

// ---------- Das Regal: zwei Bänder, nicht vier Körbe ----------
//
// Der Baum antwortet auf die Frage "welcher Art ist das Stueck". Die Antwort ist
// an einem echten Bestand aus dem Maschinen-Scan keine Antwort mehr: 19 283 von
// 21 066 Notizen (91,54 %) liegen in EINEM Typ-Fach, und die zweite Ebene — die
// erste Marke — faesst 99,56 % in `#machine-scan`. Was der Leser sieht, ist eine
// Klammer um seinen ganzen Laden.
//
// Das Regal fragt anders und in zwei Bändern, die sich nicht in die Quere kommen:
//
//   Band 1 "woher"  — Traeger, in echten Proportionen (notes 92 / files 10 996 / code 9 978)
//   Band 2 "worum"  — ein Fach je Stueck: Betreff wo einer greift, sonst der
//                     Ordnerzweig, sonst ein ehrliches Restfach
//
// Gemessen 18.10. an denselben 21 066: Band 2 nennt den ganzen Bestand in 12 Zeilen,
// groesstes Fach 33,69 %, und die Zeilen halten bei 390 px Breite — weil ein Fach
// hier ein Name ist und kein Pfad, der am Rand abgeschnitten wird. Die Richtung mit
// dem vollen Ordnerpfad trennt feiner (groesstes Fach 10,47 %) aber braucht 38 Zeilen,
// wiederholt `Desktop / ki gehirn` in 20 davon und verliert am Telefon genau das
// Ende des Pfads, das die Zeile unterscheidet. Sie bleibt der Griff IN ein Fach
// hinein, nicht das Bild obendrauf.
//
// Was das Regal nicht versteckt: 12 153 Stuecke (57,69 %) haben keinen Betreff, und
// `events` (4 496) ist ein Datum im Text, kein Ereignis. Beide Zahlen stehen in
// `luecken` und muessen in der Flaeche dastehen, sonst verkauft das Regal eine
// Trennschaerfe, die die Regexe nicht haben.

/** Ein Fach ueber dieser Schwelle bekommt keine eigene Zeile, sondern eine Zahl. */
export const REGAL_SCHWELLE_PROZENT = 1;
/** Ein Fach ueber diesem Anteil teilt das Regal nicht — es ist ein Korb. */
export const REGAL_DECKEL_PROZENT = 10;

export interface RegalFach {
  /** Was der Leser sieht — kein Schluessel, kein Pfad, kein Fachwort. */
  name: string;
  notizen: number;
  prozent: number;
  /** Wo das Fach herkommt: Betreff, Ordner, Netzadresse oder gar keines von beiden. */
  herkunft: "betreff" | "ordner" | "netz" | "ohne beides" | "schwanz";
}

export interface Regal {
  bestand: number;
  woher: RegalFach[];
  worum: RegalFach[];
  /** Wann das Stueck geschrieben wurde, in Koerben, die ein Mensch sagt ("this week",
   *  "2–4 weeks ago"). Eigene, schmale Form: die Achse hat nie eine Herkunft, weil sie
   *  keine Fundstelle ist, und `RegalFach["herkunft"]` bleibt unangetastet. */
  wann: {
    name: string;
    notizen: number;
    prozent: number;
    /** Die Stuecke des Korbs, hoechstens `REGAL_SEITEN_LAENGE`, neueste zuerst. */
    stuecke: KoerbStueck[];
    /** Was die Seite nicht zeigt — als Zahl, nicht als Schweigen. */
    uebrig: number;
  }[];
  /** Die Luecken, die das Regal laesst — als Zahlen, nicht als Schweigen. */
  luecken: { ohneBetreff: number; ohnePfad: number; ohneMarke: number };
  groesstesFachProzent: number;
  /** Wie viel Bestand in Faechern unter REGAL_DECKEL_PROZENT liegt. */
  unterDeckelProzent: number;
  /** Zeilen, die das Regal braucht — die Flaeche muss sie nicht falten. */
  zeilen: number;
}

/**
 * Der Vorspann, den die Maschine setzt — nicht der, an dem sich Wissen unterscheidet.
 *
 * Ein hartcodierter Heimordner wäre Damians privater Pfad im ausgelieferten Code,
 * ein strikt gemeinsamer Prefix funktioniert nicht: ein einziger Pfad ausserhalb
 * seines Kontos (im echten Bestand waren es fuenf) macht den Vorspann leer und das
 * groesste Fach heisst "Users / damiantodorovic" mit 57,43 %. Also: eine Stufe faellt,
 * solange sie praktisch ALLE teilen (Schwelle 95 %). Im echten Bestand fallen damit
 * `Users` und `damiantodorovic`, `Desktop` (63,51 %) bleibt stehen — es ist schon
 * eine Antwort und nicht mehr die Maschine.
 */
export function maschinenVorspann(pfade: readonly string[], schwelleProzent = 95): string[] {
  const teile = pfade.map((p) => p.split("/").filter(Boolean));
  const gesamt = teile.length;
  if (gesamt === 0) return [];
  const vorspann: string[] = [];
  for (let i = 0; ; i++) {
    const zaehler = new Map<string, number>();
    for (const t of teile) if (t[i]) zaehler.set(t[i], (zaehler.get(t[i]) ?? 0) + 1);
    const [name, n] = [...zaehler].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? [];
    if (!name || !n || (100 * n) / gesamt < schwelleProzent) break;
    vorspann.push(name);
  }
  return vorspann;
}

/**
 * Der Pfad, den ein Mensch lesen kann — oder null.
 *
 * `quellpfad` holt, was der Scan anhaengt. Ein Teil davon ist kein Pfad: 122 von
 * 21 066 Stuecken nennen Prosa, weil die Regel eine Zeile nach "Source:" sucht und
 * nicht prueft, ob eine Zeile wie ein Pfad aussieht. Diese Funktion prueft es —
 * sonst gruppiert sie bald "): 4336" als Ordner.
 */
export function lesePfad(m: { title?: string; content?: string; tags?: readonly string[]; quelle?: string }): string | null {
  const roh = quellpfad({ title: m.title ?? "", content: m.content ?? "", tags: m.tags ?? [], quelle: m.quelle }).trim();
  if (!roh) return null;
  if (/^https?:\/\//i.test(roh)) return `netz://${roh.replace(/^https?:\/\//, "").split("/")[0]}`;
  if (!roh.startsWith("/")) return null;
  return roh;
}

/** Ein Stueck, wie die Flaeche es hat: mit den Feldern, die der Puffer sieht. */
interface RegalEingang {
  id?: string;
  title?: string;
  content?: string;
  tags?: readonly string[];
  quelle?: string;
  updatedAt?: number;
}

/**
 * Das Worum-Fach aus dem, was schon gerechnet ist.
 *
 * Ausgelagert, damit `baueRegal` Traeger, Betreff und Pfad je Stueck nur EINMAL
 * rechnen muss. An seinem Bestand (21 066) war die Kette: ungebuffert und in drei
 * Runden 1 485 ms, gepuffert 551 ms, gepuffert in einer Runde 511 ms kalt / 40 ms
 * warm. Der Puffer hat also mehr gebracht als die Passzahl — beide zusammen sind es,
 * weil ein Memo bei jeder Aenderung des Zeitreglers neu faellt.
 */
function fachAus(
  g: Gruppe,
  pfad: string | null,
  vorspann: readonly string[],
): { name: string; herkunft: RegalFach["herkunft"] } {
  if (g.themen.length > 0) {
    const betreff = [...g.themen].sort((a, b) => a.localeCompare(b))[0];
    return { name: THEMA_LABELS[betreff] ?? betreff, herkunft: "betreff" };
  }
  if (!pfad) return { name: "Unfiled", herkunft: "ohne beides" };
  if (pfad.startsWith("netz://")) return { name: pfad.slice(7), herkunft: "netz" };
  const teile = pfad.split("/").filter(Boolean);
  // Der letzte Teil ist die Datei selbst, kein Ordner. Wer ihn mitnimmt, macht aus
  // jedem Stueck ein eignes Fach — im Nachweislauf passierte genau das: 200 Fächer zu
  // einer Notiz, alle unter der Schwelle, und das Regal endete in EINER Zeile
  // "200 smaller shelves" mit 100 % des Bestands.
  const ordner = teile.slice(0, -1);
  let i = 0;
  while (i < vorspann.length && i < ordner.length && ordner[i] === vorspann[i]) i++;
  const zweig = ordner.slice(i, i + 2).filter(Boolean);
  if (zweig.length) return { name: zweig.join(" / "), herkunft: "ordner" };
  return { name: ordner[ordner.length - 1] ?? "Unfiled", herkunft: "ordner" };
}

/**
 * Das Worum-Fach eines einzelnen Stuecks: Betreff, sonst Ordnerzweig, sonst ein
 * ehrliches Restfach.
 *
 * Rechnet ueber den Puffer (`gruppenVonNotiz`, schluessel id + updatedAt), nicht
 * direkt durch `gruppen`: ein Lauf ueber 21 066 Stuecke kostet ungebuffert bei
 * jedem Ansatz 1 485 ms gegen 511 ms kalt und 40 ms warm — gemessen 18.10. an
 * seinem Bestand, unter Last (load 4,76). Ein umbenanntes oder neu getaggtes Stueck
 * rechnet hier also von selbst neu, und die Flaeche haengt nicht an jedem Klick.
 */
export function regalFach(
  m: RegalEingang,
  vorspann: readonly string[] = [],
): { name: string; herkunft: RegalFach["herkunft"] } {
  return fachAus(gruppenVonNotiz(m), lesePfad(m), vorspann);
}

function zaehleFaecher(
  faecher: readonly { name: string; herkunft: RegalFach["herkunft"] }[],
  /** false = jedes Fach bekommt seine Zeile. Fuer eine Achse, die nur drei Werte
   *  haben kann und die ein Mensch nach exactly diesen drei fragt. */
  mitSchwelle = true,
): RegalFach[] {
  const koerbe = new Map<string, { n: number; herkunft: RegalFach["herkunft"] }>();
  for (const f of faecher) {
    const alt = koerbe.get(f.name);
    if (alt) alt.n += 1;
    else koerbe.set(f.name, { n: 1, herkunft: f.herkunft });
  }
  const gesamt = faecher.length || 1;
  const schwelle = mitSchwelle ? (REGAL_SCHWELLE_PROZENT / 100) * gesamt : 0;
  const sortiert = [...koerbe].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]));
  const grosse = sortiert.filter(([, v]) => v.n >= schwelle);
  const klein = sortiert.filter(([, v]) => v.n < schwelle);
  const aus: RegalFach[] = grosse.map(([name, v]) => ({
    name,
    notizen: v.n,
    prozent: Number(((100 * v.n) / gesamt).toFixed(2)),
    herkunft: v.herkunft,
  }));
  if (klein.length) {
    const n = klein.reduce((s, [, v]) => s + v.n, 0);
    aus.push({ name: `${klein.length} smaller shelves`, notizen: n, prozent: Number(((100 * n) / gesamt).toFixed(2)), herkunft: "schwanz" });
  }
  return aus;
}

/**
 * Die dritte Achse: wann. Ein Mensch fragt nicht nach einem Schluessel, sondern
 * "was habe ich vor zwei Wochen geschrieben" — also Koerbe in seiner Sprache, und
 * eine einzige Funktion, die ein Test an einer gepinnten Uhr pruefen kann.
 * `null` ist kein Datum, sondern eine Notiz ohne Zeitangabe; sie faellt in ein
 * eigenes Fach und wird nicht unter "aelter" versteckt.
 */
export const WANN_KOERBE = ["today", "this week", "1–2 weeks ago", "2–4 weeks ago", "older", "no date"] as const;

/** Wie viele Stuecke ein geoeffneter Korb zeigen darf. Der Rest wird gezahlt, nicht
 *  verschluckt — eine Liste ohne ihre eigene Zahl ist dieselbe Luege wie ein Band,
 *  das nur Mengen kennt. */
export const REGAL_SEITEN_LAENGE = 50;
export type WannKoerb = (typeof WANN_KOERBE)[number];

export function wannKoerb(alterTage: number | null): WannKoerb {
  if (alterTage === null || !Number.isFinite(alterTage)) return "no date";
  if (alterTage < 1) return "today";
  if (alterTage < 7) return "this week";
  if (alterTage < 14) return "1–2 weeks ago";
  if (alterTage < 28) return "2–4 weeks ago";
  return "older";
}

/**
 * Das Regal ueber einem Bestand. Drei Bänder, ein Fach je Stueck je Band, und die
 * Luecken als Zahlen. Kein Baum, keine Faltung: die Zeilenzahl ist die Wahrheit
 * der Achse, nicht das Ergebnis eines Kampfs mit dem Rahmen.
 */
export function baueRegal(memories: readonly Memory[]): Regal {
  // Erste und einzige Runde ueber die teure Arbeit: Traeger, Betreff und Pfad werden
  // je Stueck EINMAL gerechnet. Die drei Runden davor kosteten an seinem Bestand
  // 1 485 ms bei jedem Ansatz, diese zwei Schleifen 511 ms kalt und 40 ms warm
  // (21 066 Stuecke, load 4,76, `regal-kosten2.json`). Was an 511 ms bleibt, ist die
  // Regex-Runde selbst — dieselbe Arbeit, die die Traeger-Chips der Kartenliste tun,
  // und ueber `gruppenVonNotiz` geteilt: wer zuerst rendert, zahlt sie einmal.
  const eingang: { gruppe: Gruppe; pfad: string | null }[] = new Array(memories.length);
  const absolutePfade: string[] = [];
  let ohneBetreff = 0, ohnePfad = 0, ohneMarke = 0;
  const jetzt = Date.now();
  const wannKoerbe = new Map<WannKoerb, number>();
  for (let i = 0; i < memories.length; i++) {
    const m = memories[i];
    const gruppe = gruppenVonNotiz(m);
    const pfad = lesePfad(m);
    eingang[i] = { gruppe, pfad };
    if (gruppe.themen.length === 0) ohneBetreff += 1;
    if (!pfad) ohnePfad += 1;
    else if (!pfad.startsWith("netz://")) absolutePfade.push(pfad);
    if (!(m.tags ?? []).some((t) => String(t).trim())) ohneMarke += 1;
    // Dieselbe Runde, kein zweiter Durchgang: die Achse "wann" braucht nur die
    // Erstellungszeit, und die liegt schon in der Hand, die gerade gelesen wurde.
    const at = typeof m.createdAt === "number" && m.createdAt > 0 ? m.createdAt : null;
    const koerb = wannKoerb(at === null ? null : (jetzt - at) / 86_400_000);
    wannKoerbe.set(koerb, (wannKoerbe.get(koerb) ?? 0) + 1);
  }
  const vorspann = maschinenVorspann(absolutePfade);
  const gesamt = memories.length || 1;
  const woher = zaehleFaecher(
    eingang.map(({ gruppe }) => ({ name: TRAEGER_LABELS[gruppe.traeger], herkunft: "ordner" as RegalFach["herkunft"] })),
    // Ohne Schwelle: die Achse hat drei Werte, und nach genau diesen dreien fragt
    // ein Mensch. Am echten Bestand (18.10.) haette die Schwelle die 92 Notes —
    // 0,44 % — in eine Schwanzzeile "1 smaller shelves" gestellt. Das ist die Zahl,
    // mit der dieser Auftrag anfing: ein Screenshot "92 Notes / 10 996 Files /
    // 9 978 Code". Eine Gruppierung, die das kleinste Fach ihres eigenen Belegs
    // verschluckt, darf nicht bauen.
    false,
  );
  const worum = zaehleFaecher(eingang.map(({ gruppe, pfad }) => fachAus(gruppe, pfad, vorspann)));
  // In der Reihenfolge der Achse, nicht der Groesse: "today" steht vorn, weil der
  // Leser nach heute sucht und nicht nach dem groesten Korb. **Leer ist kein Grund zu
  // schweigen:** ein Korb, den die Flaeche nicht zeigt, kann auch nicht geklickt werden,
  // und die ehrliche Antwort auf den leeren Korb waere sonst ein Raten.
  const wann = WANN_KOERBE.map((k) => {
    const n = wannKoerbe.get(k) ?? 0;
    const seite = stueckeAusKoerb(memories, k, REGAL_SEITEN_LAENGE);
    return {
      name: k,
      notizen: n,
      prozent: Number(((100 * n) / gesamt).toFixed(2)),
      stuecke: seite.stuecke,
      uebrig: seite.uebrig,
    };
  });
  const groesstes = worum.reduce((n, f) => Math.max(n, f.notizen), 0);
  const unterDeckel = worum
    .filter((f) => (100 * f.notizen) / gesamt < REGAL_DECKEL_PROZENT)
    .reduce((s, f) => s + f.notizen, 0);
  return {
    bestand: memories.length,
    woher,
    worum,
    wann,
    luecken: { ohneBetreff, ohnePfad, ohneMarke },
    groesstesFachProzent: Number(((100 * groesstes) / gesamt).toFixed(2)),
    unterDeckelProzent: Number(((100 * unterDeckel) / gesamt).toFixed(2)),
    zeilen: woher.length + worum.length,
  };
}

/** Ein Stueck, das ein Korb hergibt: Kennung, Titel, Alter in Tagen (null, wenn die
 *  Notiz keine Zeit traegt). */
export interface KoerbStueck {
  kennung: string;
  titel: string;
  alterTage: number | null;
}

/**
 * Ein Korb der Wann-Achse oeffnet seine Stuecke — der Schritt von der Zahl zur Liste.
 *
 * Warum als eigener Griff und nicht in `baueRegal` hinein: das Regal nennt bis heute nur
 * Mengen je Korb, und eine Menge fuehrt kein Stueck beim Namen. Diese Funktion braucht
 * keinen zweiten Durchgang durch den Bestand und keine neue Tuer-Route — sie rechnet mit
 * derselben Achse, die das Band schon malt (`wannKoerb`, dieselben Kanten).
 *
 * Neueste zuerst, hoechstens `seitenLaenge` Stuecke, **und der Rest wird gezahlt statt
 * verschluckt**: eine Liste, die 30 Stuecke zeigt und nicht sagt, wie viele noch dahinter
 * liegen, ist dieselbe Luege wie ein Band, das nur Zahlen kennt. Stuecke ohne Zeit stehen
 * hinten, in der Reihenfolge des Bestands — `sort` ist stabil, also faellt das nicht um.
 */
export function stueckeAusKoerb(
  memories: readonly Memory[],
  koerb: WannKoerb,
  seitenLaenge = 50,
): { koerb: WannKoerb; gesamt: number; uebrig: number; stuecke: KoerbStueck[] } {
  const jetzt = Date.now();
  const kante = Math.max(0, seitenLaenge);
  const treffer: { at: number | null; stueck: KoerbStueck }[] = [];
  for (const m of memories) {
    const at = typeof m.createdAt === "number" && m.createdAt > 0 ? m.createdAt : null;
    const alterTage = at === null ? null : (jetzt - at) / 86_400_000;
    if (wannKoerb(alterTage) !== koerb) continue;
    treffer.push({
      at,
      stueck: {
        kennung: m.id,
        titel: (m.title ?? "").trim() || "(ohne Betreff)",
        alterTage: alterTage === null ? null : Number(alterTage.toFixed(3)),
      },
    });
  }
  treffer.sort((a, b) => (b.at ?? -1) - (a.at ?? -1));
  const stuecke = treffer.slice(0, kante).map((t) => t.stueck);
  return { koerb, gesamt: treffer.length, uebrig: treffer.length - stuecke.length, stuecke };
}
