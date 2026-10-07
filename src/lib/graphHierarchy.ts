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

export const TYP_LABELS: Record<string, string> = {
  semantic: "Facts",
  episodic: "Events",
  procedural: "How-tos",
  // Heisst in der App „Document" (Editor-Button) — nicht „Source".
  reference: "Documents",
};

const BEKANNTE_TYPEN = ["semantic", "episodic", "procedural", "reference"];

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
 * Baum: Wurzel -> Typ -> Entitaet/Tag-Gruppe -> Notiz.
 *
 * Notizen OHNE Entitaet werden nach ihrem ersten Tag gruppiert (#tag) — sonst
 * artet der Baum bei Massen-Importen (z. B. Maschinen-Scan) in ein ebenes
 * Fächerung aus tausenden direkten Blaettern aus, die keine Hierarchie zeigt.
 * Notizen ohne Entitaet UND ohne Tag landen unter "Other". Typen ohne Notizen
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
      label: TYP_LABELS[t] ?? t,
      typ: istBekannt ? (t as HierarchieKnoten["typ"]) : undefined,
      children: [],
    };
    const nachEntitaet = new Map<string, Memory[]>();
    const nachTag = new Map<string, Memory[]>();
    const ohne: Memory[] = [];
    for (const m of nachTyp.get(t)!) {
      const e = entitaeten.get(m.id);
      if (e && (!konzepte || konzepte.has(e))) {
        let liste = nachEntitaet.get(e);
        if (!liste) { liste = []; nachEntitaet.set(e, liste); }
        liste.push(m);
        continue;
      }
      const tag = m.tags.find((x) => x.trim());
      if (tag) {
        const k = tag.trim().toLowerCase();
        let liste = nachTag.get(k);
        if (!liste) { liste = []; nachTag.set(k, liste); }
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
        label: `#${nachTag.get(k)![0].tags.find((x) => x.trim())!.trim()}`,
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

const STANDARD: Required<Omit<DendrogrammOptionen, "radien" | "eingeklappt">> & { radien: Record<HierarchieKnoten["kind"], number> } = {
  blattAbstand: 38,
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
export const GLIDE_FAKTOR = 0.22;
/**
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
    }
  }
  return bewegt;
}
