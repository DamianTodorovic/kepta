import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Memory } from "../types";
import { existsAt, graphTimeRange, activeIdsAt, edgeVisibleAt, istStruktur, fensterOffen, type Gueltigkeit } from "../lib/graphTime";
import { Search, Maximize2, ZoomIn, ZoomOut, Clock, Atom2, Sitemap, Network, ChevronRight } from "../lib/icons";
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
  reheat,
  nurEchteKanten,
  kantZaehlung,
  richtungsBand,
  kantenEtikett,
  notizEtikett,
  type NotizEtikett,
  kantenMitte,
  beulenLenke,
  dickeBand,
  ENTITAETS_PRAEFIX,
  KANTEN_GREIF_PX,
  type LayoutEdge,
  type LayoutNode,
  type Simulation,
  type Transform,
} from "../lib/graphLayout";
import { t as uiT } from "../lib/uiText";
import {
  buildHierarchy,
  entitiesByMemory,
  layoutDendrogram,
  stepDendrogram,
  TYP_LABELS,
  type StrukturKnoten,
} from "../lib/graphHierarchy";

export type GraphAnsicht = "force" | "dendrogram";
const ANSICHT_KEY = "kepta_graph_view";
/** Richtung ist von Haus aus an — sie ist die Aussage, nicht ein Schmuck. */
const RICHTUNG_KEY = "kepta_graph_richtung";
/**
 * Ab diesem Zoom wird aus der Behauptung ein Keil. Darunter wäre die schmale
 * Spitze weniger als ein Pixel — dann bleibt die Linie, was sie ist.
 */
const KEIL_AB_ZOOM = 0.5;
/**
 * Wie viel Beschriftung die Flaeche zeigt. Key ist die Engine: Etikette nach
 * Wichtigkeit, so viele wie ins Gedraenge passen. All ist die ausdrueckliche
 * Entscheidung eines Menschen — alles, egal wie voll. Off laesst nichts stehen
 * und gibt den Titel unter dem Zeiger zurueck.
 */
const ETIKETT_KEY = "kepta_graph_labels";
type EtikettModus = "key" | "all" | "off";
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

const DEFAULT_TYPE_COLORS: Record<string, string> = {
  semantic: "#56749a",
  episodic: "#916b85",
  procedural: "#62866b",
  reference: "#97785b",
};

/** So viele Beschriftungen zeigt der Graph hoechstens gleichzeitig. */
const MAX_LABELS = 140;
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
 * Ist der Hintergrund hell? Entscheidet ueber Kantenstaerken.
 * Versteht #rgb, #rrggbb und rgb(...) — mehr kommt aus den Theme-Variablen nicht.
 */
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
export function KnowledgeGraph({ memories, onSelectMemory, onSelectConcept, sichtbar = true }: KnowledgeGraphProps & { sichtbar?: boolean }) {
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
  const wechsleRichtung = () => {
    const v = !richtung;
    setRichtung(v);
    try { localStorage.setItem(RICHTUNG_KEY, v ? "1" : "0"); } catch { /* ignore */ }
  };
  /** Wie viel beschriftet wird — Key ist der Anfang, nie All. */
  const [etikettenModus, setEtikettenModus] = useState<EtikettModus>(() => {
    try {
      const v = localStorage.getItem(ETIKETT_KEY);
      return v === "all" || v === "off" ? v : "key";
    } catch { return "key"; }
  });
  const setzeEtiketten = (m: EtikettModus) => {
    setEtikettenModus(m);
    try { localStorage.setItem(ETIKETT_KEY, m); } catch { /* ignore */ }
  };
  const [dimensions, setDimensions] = useState({ w: 800, h: 500 });
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
  const kantTooltipRef = useRef<HTMLDivElement | null>(null);
  // Die Groesse der Leinwand brauchte der Zeigerhandler — als Zustand ware er
  // beim ersten Hover noch die Startmasse.
  const masseRef = useRef({ w: 800, h: 500 });
  masseRef.current = dimensions;
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
  const timeFilter = timeRange && sliderCommit < 100
    ? Math.round(timeRange.min + ((timeRange.max - timeRange.min) * sliderCommit) / 100)
    : null;
  // Nur für die Anzeige während des Ziehens — ein Billig-Rechnen, kein Layout.
  const liveFilter = timeRange && sliderWert < 100
    ? Math.round(timeRange.min + ((timeRange.max - timeRange.min) * sliderWert) / 100)
    : null;

  const [customTypeColors, setCustomTypeColors] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("kepta_type_colors") || "{}"); } catch { return {}; }
  });
  const TYPE_COLORS = useMemo(() => ({ ...DEFAULT_TYPE_COLORS, ...customTypeColors }), [customTypeColors]);

  // Eine Typ-Farbe wirkt app-weit (Karten-Grat, Typ-Label, Index-Zahlen).
  useEffect(() => {
    for (const t of Object.keys(customTypeColors)) {
      document.documentElement.style.setProperty(`--type-${t}`, customTypeColors[t]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setTypeColor = (t: string, c: string) => {
    document.documentElement.style.setProperty(`--type-${t}`, c);
    setCustomTypeColors((prev) => {
      const next = { ...prev, [t]: c };
      try { localStorage.setItem("kepta_type_colors", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // --- Echte Relationen aus der Graph-DB ---
  const [graphApi, setGraphApi] = useState<GraphApi | null>(null);
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
  }, [memories.length]);

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
  const netz = useMemo(
    () => entitaetsNetz(graphApi?.memoriesByEntity, graphApi?.relations, netzSichtbar),
    [graphApi, netzSichtbar]
  );
  const geruestIds = useMemo(() => netz.knoten.map((k) => k.id), [netz]);

  const kantenRapport = useMemo(
    () =>
      kantenBaue(filtered, {
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
      }),
    [filtered, netz, geruestIds, ahnlichkeit]
  );
  const edges: LayoutEdge[] = kantenRapport.edges;
  versteckteRef.current = kantenRapport.versteckteNachbarn;


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
  const [ansicht, setAnsicht] = useState<GraphAnsicht>(() => {
    try {
      const v = localStorage.getItem(ANSICHT_KEY);
      return v === "dendrogram" ? "dendrogram" : "force";
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
  degreeRef.current = degree;
  nachbarnRef.current = neighborsOf;
  byIdRef.current = byId;
  farbenRef.current = TYPE_COLORS;
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
  const etikettVorratRef = useRef<Map<string, NotizEtikett>>(new Map());
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
   * Knotengroesse nach Verbindungsgrad.
   *
   * Die vorige Formel (7 + log2(1+grad) * 4.5, gedeckelt bei 24) war schon bei
   * einem Dutzend Verbindungen am Anschlag — in einer normalen Wissensbasis
   * hatten damit FAST ALLE Knoten dieselbe Maximalgroesse. Das Ergebnis war eine
   * Wand gleich grosser Kugeln ohne jede Rangfolge, und weil sie so gross waren,
   * passte kaum etwas auf den Schirm. Flacher und kleiner: die Spanne wird
   * wirklich genutzt, Huben bleiben erkennbar, und es ist wieder Luft dazwischen.
   */
  const radiusOf = useCallback(
    (id: string) => Math.min(18, 4 + Math.log2(1 + (degreeRef.current.get(id) ?? 0)) * 2.2),
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
  const liveEpoch = timeRange && sliderWert < 100 && ansicht === "force"
    ? Math.round(timeRange.min + ((timeRange.max - timeRange.min) * sliderWert) / 100)
    : null;
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
    () => ({ knoten: zeitAktivIds ? zeitAktivIds.size : filtered.length, kanten: sichtbareKanten.length }),
    [zeitAktivIds, filtered.length, sichtbareKanten]
  );

  /**
   * Die ehrliche Bilanz des Ausschnitts: was die Wissensbasis traegt, gegen was
   * in diesem Bild steht. Drei Klausaen, und jede von ihnen bleibt weg, solange
   * nichts fehlt — eine Zeile, die eine Luecke behauptet, wo keine ist, macht
   * die Flaeche schlechter, nicht genauer.
   */
  const dichteZeile = useMemo(() => {
    const zahl = (n: number) => n.toLocaleString("en-US");
    const klausaen: string[] = [];
    if (sichtbareAnzahl.knoten < memories.length) {
      klausaen.push(`Showing ${zahl(sichtbareAnzahl.knoten)} of ${zahl(memories.length)} notes`);
    }
    const geliefert = graphApi?.relations.length ?? 0;
    if (graphApi?.bestand && graphApi.bestand.kanten > geliefert) {
      klausaen.push(`Showing ${zahl(geliefert)} of ${zahl(graphApi.bestand.kanten)} claims in the store`);
    }
    if (kantenRapport.verstecktInSumme > 0) {
      klausaen.push(`${zahl(kantenRapport.verstecktInSumme)} neighbours hidden behind badges`);
    }
    return klausaen.join(" · ");
  }, [sichtbareAnzahl.knoten, memories.length, graphApi, kantenRapport]);

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
  const baumLayout = useMemo(
    () =>
      ansicht === "dendrogram"
        ? layoutDendrogram(buildHierarchy(baumMemories, entitaeten, konzeptNamen))
        : { edges: [], nodes: [], struktur: new Map<string, StrukturKnoten>() },
    [baumMemories, entitaeten, konzeptNamen, ansicht]
  );
  const baumIdsSchluessel = useMemo(() => baumMemories.map((m) => m.id).join(","), [baumMemories]);
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
    () => [...filtered.map((m) => m.id), ...geruestIds].join(","),
    [filtered, geruestIds]
  );
  /** Dasselbe Gerüst, das der Baum malt — hier ohne Typ- und Tag-Ebenen. */
  const kraftGeruest = useMemo(() => {
    const m = new Map<string, StrukturKnoten>();
    for (const k of netz.knoten) m.set(k.id, { label: k.label, farbe: null, r: 8, blaetter: k.notizen.length });
    return m;
  }, [netz]);
  const forceHistoryRef = useRef<Simulation | null>(null);
  useEffect(() => {
    if (ansichtRef.current !== "force") return;
    const ids = idsSchluessel ? idsSchluessel.split(",") : [];
    const kommtVomBaum = uebergangBaumRef.current;
    uebergangBaumRef.current = false;
    const alt = simRef.current;
    const sim = reuseSimulation(forceHistoryRef.current, ids, edges, radiusOf);
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
    forceHistoryRef.current = sim;
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
        transformRef.current = fitTransform(grenzen, dimensions);
        setZoomAnzeige(transformRef.current.k);
      } else {
        transformRef.current = fitTransform(layoutBounds(sim.nodes, randFuerAnsicht(sim.nodes)), dimensions);
        setZoomAnzeige(transformRef.current.k);
      }
      nutzerBewegt.current = false;
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
    const sim = reuseSimulation(simRef.current, ids, baumLayout.edges, radiusOf);
    for (const n of baumLayout.nodes) {
      if (!n.id.startsWith("__") || sim.index.has(n.id)) continue;
      const kopie: LayoutNode = { ...n };
      sim.nodes.push(kopie);
      sim.index.set(kopie.id, kopie);
    }
    simRef.current = sim;
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
        setDimensions({ w: Math.max(320, Math.round(cr.width)), h: Math.max(320, Math.round(cr.height)) });
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
      const eintraege: [string, string][] = [
        ...Object.keys(farben).map((t) => [t, farben[t]] as [string, string]),
        ["neutral", "#9a9a9a"],
      ];
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

  // --- Der Ausschnitt, der alles zeigt ---
  const fitView = useCallback(() => {
    const sim = simRef.current;
    if (!sim || sim.nodes.length === 0) return;
    transformRef.current = fitTransform(layoutBounds(sim.nodes, randFuerAnsicht(sim.nodes)), dimensions);
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
    const fit = fitTransform(layoutBounds(knoten, 70), dimensions);
    const minBaumZoom = 0.35;
    if (fit.k < minBaumZoom) {
      const grenzen = layoutBounds(knoten);
      const wurzel = sim.index.get("__wurzel");
      const zentrum = wurzel ?? { x: (grenzen.minX + grenzen.maxX) / 2, y: (grenzen.minY + grenzen.maxY) / 2 };
      fit.k = minBaumZoom;
      // Der Stamm gehoert an den linken Rand — die Ebenen wachsen nach rechts.
      fit.x = dimensions.w * 0.12 - zentrum.x * fit.k;
      fit.y = dimensions.h / 2 - zentrum.y * fit.k;
    }
    transformRef.current = fit;
    setZoomAnzeige(fit.k);
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
    transformRef.current = fitTransform(layoutBounds(sim.nodes, randFuerAnsicht(sim.nodes)), dimensions);
    setZoomAnzeige(transformRef.current.k);
    zeichneNoetig.current = true;
  }, [dimensions, fitBaumAnsicht]);

  // Richtung ist reine Darstellung: kein Neu-Layout, keine Physik, ein Bild.
  useEffect(() => {
    zeichneNoetig.current = true;
  }, [richtung]);

  // Auch die Etikett-Stellung ist reine Darstellung — ein Bild, kein Neu-Layout.
  useEffect(() => {
    zeichneNoetig.current = true;
  }, [etikettenModus]);

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
    const bw = Math.round(dimensions.w * dpr);
    const bh = Math.round(dimensions.h * dpr);
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
    const imBild = (n: LayoutNode) => n.x >= sicht.x0 && n.x <= sicht.x1 && n.y >= sicht.y0 && n.y <= sicht.y1;

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
    // Etwas gemalte, sichtbare Behauptungen — aus ihnen wird unten das Etikett.
    const etikettenmoeglich: LayoutEdge[] = [];
    for (const art of ARTEN) {
      const breiten = BREITE_PX[art];
      for (let band = 0; band < breiten.length; band++) {
        const liste = klassen.get(`${art}|${band}`);
        if (!liste || liste.length === 0) continue;
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
            if (kantenEtikett(e)) etikettenmoeglich.push(e);
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
          if (art === "behauptung" || art === "abgelaufen") {
            if (kantenEtikett(e)) etikettenmoeglich.push(e);
          }
        }
        ctx.globalAlpha = Math.min(
          1,
          (art === "behauptung"
            ? (hov ? 0.9 : 0.55)
            : art === "abgelaufen"
              ? (hov ? 0.6 : 0.3)
              : art === "erwaehnung"
                ? 0.34
                : hov ? 0.5 : 0.22) * kantenVerstaerkung
        );
        if (gemalt > 0) {
          if (keil) ctx.fill();
          else ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }
    ctx.setLineDash([]);

    // --- Knoten ---
    const sp = holeSprites(farbenRef.current, nodeRim, nodeHi);
    const beschriftbar: { n: LayoutNode; m: Memory; r: number }[] = [];
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
    for (const n of sim.nodes) {
      if (!imBild(n)) continue;
      const m = byIdRef.current.get(n.id);
      if (!m) continue;
      const r = n.r;
      const istHov = hov === n.id;
      const gedimmt = hov !== null && !istHov && !nachbarn?.has(n.id);
      const zeitInaktiv = zeit !== null && !existsAt(m, zeit);
      const ersetzt = !!m.supersededBy;
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
      const typ = m.type && sp[m.type] ? m.type : "neutral";
      const farbe = farbenRef.current[m.type ?? "semantic"] ?? "#9a9a9a";

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
        if (!zeitInaktiv && !gedimmt) beschriftbar.push({ n, m, r: rr });
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
      if (!zeitInaktiv && !gedimmt) beschriftbar.push({ n, m, r: rr });
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
    if (struktur) {
      for (const n of sim.nodes) {
        const s = struktur.get(n.id);
        if (!s || !imBild(n)) continue;
        const farbe = (s.farbe && farbenRef.current[s.farbe]) || "#9a9a9a";
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
    // gezeichnet, der Graph zeigte zwoelf namenlose Punkte. Die Schwelle liegt
    // jetzt so tief, dass sie nur noch Unlesbares fernhaelt; ueber das Gedraenge
    // entscheidet das Belegungsraster weiter unten.
    const mindestRadius = 3;
    // Im Baum macht die Hierarchie lesbar, was das Kraftfeld nur durch Zoomen
    // zeigen kann — dort duerfen alle Etiketten mit (bis zur harten Grenze),
    // waehrend der 140er-Cap Kraftfeld-Sache bleibt.
    const baumAnsicht = ansichtRef.current === "dendrogram";
    // Was der Zeiger oder die Tastatur haelt, kriegt immer sein Etikett — auch
    // auf „aus". Eine Fläche, die auf Nachfrage schweigt, ist keine Auskunft.
    const gehaltenId = hov ?? tastaturIdRef.current;
    const modus = etikettenModusRef.current;
    const etiketten =
      modus === "off"
        ? beschriftbar.filter(({ n }) => n.id === gehaltenId)
        : modus === "all"
          ? beschriftbar
          : baumAnsicht
            ? beschriftbar.slice(0, MAX_LABELS * 3)
            : beschriftbar
                .filter(({ n, r }) => hov === n.id || nachbarn?.has(n.id) || r * t.k >= mindestRadius)
                .slice(0, MAX_LABELS);
    // „All" ist die eine Stellung ohne Raster: wer alles will, bekommt alles —
    // genau deshalb ist sie nicht die Einstellung, in der die Flaeche startet.
    const ohneRaster = modus === "all";

    const fs = Math.min(15, 11 / Math.max(0.4, t.k));
    ctx.lineJoin = "round";

    // Belegungsraster in BILDSCHIRM-Koordinaten: ein Etikett, das ein bereits
    // gezeichnetes ueberdeckt, wird weggelassen. Ohne das entsteht bei dichten
    // Buendeln der Teppich aus uebereinanderliegenden Titeln, den man in der
    // Aufnahme sieht — lesbar ist dort nichts mehr.
    const zellHoehe = Math.max(10, fs * t.k + 3);
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

    // --- Gerüst-Etiketten (nur Baum): zuerst, und sie belegen das Raster ---
    // Vorher liefen sie als einziger Text außerhalb des Rasters und in derselben
    // Schrift wie der Inhalt: die Ebenen standen wie eine zweite Titelspalte im
    // Bild. Jetzt weicht jede Notiz, die in den Namen einer Ebene fiele, und
    // das Gerüst tritt mit --text-2 und kleinerer Schrift zurück.
    if (struktur) {
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = `600 ${fs * 0.82}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
      for (const n of sim.nodes) {
        const s = struktur.get(n.id);
        if (!s || s.keinEtikett || !imBild(n)) continue;
        // Wer über einem Begriff steht oder ihn mit den Pfeiltasten hält,
        // fragt genau dann: was ist das und wie viel trägt es? Für die Antwort
        // gilt die Kürzung nicht — und das gehaltene Etikett weicht nicht mehr
        // weg, es hat Vorrang im Raster.
        const gehalten = hov === n.id || tastaturIdRef.current === n.id;
        // „Aus" meint alle Etiketten — auch die des Gerüsts. Was der Zeiger
        // hält, kommt zurück: eine Fläche, die auf Nachfrage schweigt, ist keine
        // Auskunft.
        if (modus === "off" && !gehalten) continue;
        const titel = gehalten && s.blaetter !== undefined
          ? `${s.label} · ${s.blaetter} ${s.blaetter === 1 ? "note" : "notes"}`
          : s.label.length > GERUEST_ZEICHEN
            ? `${s.label.slice(0, GERUEST_ZEICHEN)}…`
            : s.label;
        const mitteX = (n.x + n.r + 3) * t.k + t.x;
        const mitteY = n.y * t.k + t.y;
        const breite = ctx.measureText(titel).width * t.k;
        // halbe Zeilenhoehe hoch, weil der Text mittig auf der Achse sitzt
        if (!gehalten && modus !== "all" && !freiUndBelegen(mitteX, mitteY - zellHoehe / 2, breite)) continue;
        ctx.lineWidth = 3 / Math.max(0.4, t.k);
        ctx.strokeStyle = grundFarbe;
        ctx.strokeText(titel, n.x + n.r + 3, n.y);
        ctx.fillStyle = gehalten ? akzent : geruestFarbe;
        ctx.fillText(titel, n.x + n.r + 3, n.y);
      }
    }

    ctx.font = `500 ${fs}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    for (const { n, m, r } of etiketten) {
      // Der Peek: was der Zeiger oder die Tastatur haelt, wird nicht gekuerzt —
      // genau dann will jemand den ganzen Namen lesen.
      const gehalten = n.id === gehaltenId;
      const vorrat = etikettVorratRef.current;
      let gelesen = vorrat.get(n.id);
      if (!gelesen) {
        gelesen = notizEtikett(m, 26);
        vorrat.set(n.id, gelesen);
      }
      const { text: titel, platzhalter } = gehalten ? notizEtikett(m, Infinity) : gelesen;
      const mitteX = n.x * t.k + t.x;
      const mitteY = (n.y + r + 2) * t.k + t.y;
      const breite = ctx.measureText(titel).width * t.k;
      // Der Knoten unter dem Zeiger und seine Nachbarn haben Vorrang und
      // ueberschreiben notfalls; alles andere weicht aus.
      const bevorzugt = hov === n.id || nachbarn?.has(n.id) === true;
      if (!ohneRaster && !freiUndBelegen(mitteX, mitteY, breite) && !bevorzugt) continue;
      ctx.lineWidth = 3 / Math.max(0.4, t.k);
      ctx.strokeStyle = grundFarbe;
      ctx.strokeText(titel, n.x, n.y + r + 2);
      // Ein Etikett aus dem ersten Satz der Notiz ist ein Platzhalter und sieht
      // aus wie einer — eine Notiz ohne Titel darf nicht so tun, als haette sie
      // einen.
      ctx.fillStyle = platzhalter ? schwach : textFarbe;
      ctx.fillText(titel, n.x, n.y + r + 2);
      if (hov === n.id && m.tags.length > 0) {
        const tags = m.tags.slice(0, 3).join(" · ");
        ctx.font = `400 ${fs * 0.85}px ui-sans-serif, system-ui, sans-serif`;
        ctx.strokeText(tags, n.x, n.y + r + 2 + fs * 1.15);
        ctx.fillStyle = schwach;
        ctx.fillText(tags, n.x, n.y + r + 2 + fs * 1.15);
        ctx.font = `500 ${fs}px ui-sans-serif, system-ui, sans-serif`;
      }
    }

    // --- Badges: Nachbarn, die der Kantengrenze zum Opfer fielen ---
    //
    // Ein Knoten mit drei Strichen im Bild, während die Wissensbasis sieben
    // Nachbarn kennt, ist eine Luege durch Weglassen. Die Zahl liegt schon im
    // Rapport der Kantengrenze — hier wird sie nur abgelesen, nie gerechnet.
    const versteckte = versteckteRef.current;
    if (versteckte.size > 0) {
      ctx.font = `600 ${fs * 0.78}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
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
        const bx = n.x + n.r * 0.85;
        const by = n.y - n.r * 0.85;
        ctx.lineWidth = 3 / skalar;
        ctx.strokeStyle = grundFarbe;
        ctx.strokeText(`+${zahl}`, bx, by);
        ctx.fillStyle = schwach;
        ctx.fillText(`+${zahl}`, bx, by);
      }
      ctx.textBaseline = "top";
      ctx.font = `500 ${fs}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
    }

    // --- Kanten-Etiketten: der Typ steht an der Linie ---
    //
    // Was eine Behauptung sagt, ist die Auskunft, die im Bild fehlt. Sie kommen
    // nach den Knotentiteln und teilen sich deren Raster: ein Etikett verdraengt
    // nie einen Titel, es fuellt nur, was frei bleibt. Und es erscheint erst,
    // wenn man nah genug am Netz sitzt — weit herausgezoomt ist die Form die
    // Auskunft, nicht der Text.
    if (t.k >= KANTEN_ETIKETT_AB_ZOOM && etikettenmoeglich.length > 0) {
      const gehalten = hoverKanteRef.current;
      // Vorrang: die Kante unter dem Zeiger, dann die mit der meisten Evidenz.
      const rang = (e: LayoutEdge) => (e === gehalten ? 1_000_000 : 0) + (e.belege ?? 1) * 100 - kantenEtikett(e)!.length;
      const kandidaten = [...etikettenmoeglich].sort((x, y) => rang(y) - rang(x)).slice(0, MAX_KANTEN_ETIKETTEN);
      ctx.font = `600 ${fs * 0.82}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
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
        const anY = punkt.y - 6 / t.k;
        const sx = punkt.x * t.k + t.x;
        const sy = anY * t.k + t.y;
        const breite = ctx.measureText(text).width * t.k;
        const eigne = e === gehalten;
        if (!eigne && !freiUndBelegen(sx, sy - zellHoehe / 2, breite)) continue;
        ctx.lineWidth = 3 / Math.max(0.4, t.k);
        ctx.strokeStyle = grundFarbe;
        ctx.strokeText(text, punkt.x, anY);
        ctx.fillStyle = eigne ? akzent : textFarbe;
        ctx.fillText(text, punkt.x, anY);
      }
      ctx.font = `500 ${fs}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
      ctx.textBaseline = "top";
    }

    // Der Tooltip haengt an der Kante, nicht am Etikett-Budget: auch weit
    // herausgezoomt und auch ohne freien Platz in der Rasterzelle folgt er der
    // Linie, solange der Zeiger auf ihr steht. Und er verschwindet mit ihr —
    // eine Karte über einer Lücke erzaehlt etwas, das niemand mehr sieht.
    {
      const el = kantTooltipRef.current;
      const gehalten = hoverKanteRef.current;
      if (gehalten && (!sim.edges.includes(gehalten) || !index.get(gehalten.source) || !index.get(gehalten.target))) {
        hoverKanteRef.current = null;
        setKantInfo(null);
      } else if (el && gehalten) {
        const a = index.get(gehalten.source)!;
        const b = index.get(gehalten.target)!;
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const gerade = kanteIstGerade(
          gehalten,
          ansichtRef.current === "dendrogram",
          richtungRef.current && t.k >= KEIL_AB_ZOOM
        );
        const punkt = kantenMitte(a, b, gerade ? 0 : beulenLenke(len));
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
  useEffect(() => {
    let laeuft = true;
    let raf = 0;
    const schleife = () => {
      if (!laeuft) return;
      const sim = simRef.current;
      if (sim) {
        if (ansichtRef.current === "dendrogram") {
          // Baum: kein Physik-Loop — die Knoten gleiten auf ihre Tidy-Tree-
          // Positionen und ruhen dann. Loslassen einer Bewegung = Auto-Fit.
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
                transformRef.current = fitTransform(layoutBounds(sim.nodes, randFuerAnsicht(sim.nodes)), dimensions);
                setZoomAnzeige(transformRef.current.k);
              }
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
    if (!sichtbar || document.hidden) {
      zeichneNoetig.current = true; // beim Wiederkommen einmal frisch zeichnen
      return () => { laeuft = false; };
    }
    raf = requestAnimationFrame(schleife);
    return () => { laeuft = false; cancelAnimationFrame(raf); };
  }, [zeichne, dimensions, fitBaumAnsicht, sichtbar]);

  useEffect(() => { zeichneNoetig.current = true; }, [timeFilter, TYPE_COLORS, hovered]);
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
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const gerade = kanteIstGerade(e, baum, richtungRef.current && t.k >= KEIL_AB_ZOOM);
      const punkt = kantenMitte(a, b, gerade ? 0 : beulenLenke(len));
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
   * Alles wieder der Physik ueberlassen.
   *
   * Ohne diesen Weg zurueck waere das Anheften eine Falle: nach ein paar
   * Griffen stuende der halbe Graph still, und niemand koennte ihn loesen.
   */
  const loeseAlle = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    for (const k of sim.nodes) k.pinned = false;
    reheat(sim, 0.5);
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
      ? kanteBei(sim.index, sim.edges, w.x, w.y, KANTEN_GREIF_PX / Math.max(0.01, transformRef.current.k), malweiseFuer)
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
    if (m) onSelectMemory(m);
  }, [onSelectMemory, trefferBei]);

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

  const tastaturSchritt = useCallback((richtung: "up" | "down" | "left" | "right") => {
    const sim = simRef.current;
    if (!sim) return;
    // Erreichbar ist, was eine antwort gibt: die notiz (Enter öffnet sie) und
    // das konzept (Enter öffnet sein dossier). Typ-, tag- und wurzelknoten des
    // baums sind wege, kein inhalt — sie bleiben aus der reise draußen, sonst
    // hält man auf einem knoten, der auf Enter nichts tut.
    const notizKnoten = sim.nodes.filter((n) => byIdRef.current.has(n.id) || n.id.startsWith(ENTITAETS_PRAEFIX));
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
  }, [setzeAuswahl]);

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
      }
      return;
    }
    if (e.key === "Escape" && tastaturIdRef.current) {
      e.stopPropagation();
      setzeAuswahl(null);
    }
  }, [onSelectMemory, onSelectConcept, tastaturSchritt, setzeAuswahl]);

  // Wheel-Zoom darf die Seite nicht mitscrollen — React-onWheel ist passiv.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const stop = (e: Event) => e.preventDefault();
    el.addEventListener("wheel", stop, { passive: false });
    return () => el.removeEventListener("wheel", stop);
  }, []);

  const kantZeilen = kantInfo ? kantenZeilen(kantInfo) : null;

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

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-2 py-3 shrink-0 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-3)" }} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter the graph…"
            className="hud-input w-full pl-8 pr-3 py-2 rounded-lg text-sm"
          />
        </div>
        {/* Gezaehlt wird, was im Bild steht — nicht, was die Datenbank hergeben
            wuerde. „edges" war hier eine Zahl aus dem Aehnlichkeitsnebel.
            Seit dem 6.10. liegen im Feld auch Konzepte: zwei Notizen und drei
            Punkte im Bild mit der Aufschrift „2 nodes" wäre keine Auskunft.
            Beide Ansichten nennen dasselbe Paar — weil sie dasselbe Netz
            meinen, nicht zwei verschiedene Auszählungen. */}
        <div className="hud-label hidden sm:block">
          {sichtbareAnzahl.knoten} {sichtbareAnzahl.knoten === 1 ? "note" : "notes"} ·{" "}
          {netz.knoten.length} {netz.knoten.length === 1 ? "concept" : "concepts"} ·{" "}
          {ansicht === "dendrogram"
            ? `${baumLayout.edges.length} ${baumLayout.edges.length === 1 ? "link" : "links"}`
            : `${kanten.echt} ${kanten.echt === 1 ? "link" : "links"}${kanten.aehnlichkeit ? ` · +${kanten.aehnlichkeit} similar` : ""}`}
        </div>
        <div className="flex items-center gap-0.5 ml-1" role="group" aria-label="Graph layout">
          <button
            onClick={() => wechsleAnsicht("force")}
            className="btn-ghost px-2.5 py-1.5 rounded-lg flex items-center gap-1.5"
            style={ansicht === "force" ? { border: "1px solid var(--accent)", color: "var(--accent)" } : undefined}
            title="Force view — the links as they are claimed; similarity only on request"
          >
            <Atom2 className="w-4 h-4" />
            <span className="hidden md:inline text-[11px]">Force</span>
          </button>
          <button
            onClick={() => wechsleAnsicht("dendrogram")}
            className="btn-ghost px-2.5 py-1.5 rounded-lg flex items-center gap-1.5"
            style={ansicht === "dendrogram" ? { border: "1px solid var(--accent)", color: "var(--accent)" } : undefined}
            title="Dendrogram — knowledge as a tree: root → type → entity → note"
          >
            <Sitemap className="w-4 h-4" />
            <span className="hidden md:inline text-[11px]">Tree</span>
          </button>
          <button
            onClick={() => setAhnlichkeit((v) => !v)}
            aria-pressed={ahnlichkeit ? "true" : "false"}
            className="btn-ghost px-2.5 py-1.5 rounded-lg flex items-center gap-1.5"
            style={ahnlichkeit ? { border: "1px solid var(--text-3)", color: "var(--text-2)" } : undefined}
            title="Show similarity links — guesses from shared tags and titles, off by default"
          >
            <Network className="w-4 h-4" />
            <span className="hidden md:inline text-[11px]">Similar</span>
          </button>
          <button
            onClick={() => setzeEtiketten("key")}
            aria-pressed={etikettenModus === "key" ? "true" : "false"}
            className="btn-ghost px-2 py-1.5 rounded-lg text-[11px]"
            title="Key labels — the busiest nodes first, as many as fit without overlap"
          >
            Key
          </button>
          <button
            onClick={() => setzeEtiketten("all")}
            aria-pressed={etikettenModus === "all" ? "true" : "false"}
            className="btn-ghost px-2 py-1.5 rounded-lg text-[11px]"
            title="All labels — every node, however crowded. A choice, not a starting point."
          >
            All
          </button>
          <button
            onClick={() => setzeEtiketten("off")}
            aria-pressed={etikettenModus === "off" ? "true" : "false"}
            className="btn-ghost px-2 py-1.5 rounded-lg text-[11px]"
            title="No labels — hover or arrow-key to a node and its full title comes back"
          >
            Off
          </button>
          <button
            onClick={wechsleRichtung}
            aria-pressed={richtung ? "true" : "false"}
            className="btn-ghost px-2.5 py-1.5 rounded-lg flex items-center gap-1.5"
            style={richtung ? { border: "1px solid var(--text-3)", color: "var(--text-2)" } : undefined}
            title="Claim direction — each link runs from its wide end to its narrow one. Off shows plain lines."
          >
            <ChevronRight className="w-4 h-4" />
            <span className="hidden md:inline text-[11px]">Direction</span>
          </button>
        </div>
        <div className="flex items-center gap-1.5 ml-2" title="Node colours — each colour tints its type across the graph, cards and index">
          {(["semantic", "episodic", "procedural", "reference"] as const).map((t) => (
            <input
              key={t}
              type="color"
              value={TYPE_COLORS[t]}
              onChange={(e) => setTypeColor(t, e.target.value)}
              title={`Colour: ${TYP_LABELS[t]} — tints the nodes, their card ridge and the index numbers`}
              className="graph-swatch"
              style={{ color: TYPE_COLORS[t] }}
            />
          ))}
        </div>
        {timeRange && (
          <div className="flex items-center gap-2.5 ml-3" title="Time travel — knowledge at the chosen moment. Pick a date for an exact moment, or scrub the slider.">
            <Clock className="w-3.5 h-3.5" style={{ color: "var(--text-3)" }} />
            <input
              type="date"
              value={liveFilter !== null ? isoLokal(liveFilter) : ""}
              min={isoLokal(timeRange.min)}
              max={isoLokal(timeRange.max)}
              onChange={(e) => {
                // Datumsgenau: ein gewählter Tag gilt bis zu seinem Ende.
                if (!e.target.value) { setSliderWert(100); setSliderCommit(100); return; }
                const [j, m, t] = e.target.value.split("-").map(Number);
                if (!j || !m || !t) return;
                const epoch = new Date(j, m - 1, t, 23, 59, 59, 999).getTime();
                const spanne = timeRange.max - timeRange.min;
                const anteil = Math.max(0, Math.min(100, ((epoch - timeRange.min) / spanne) * 100));
                setSliderWert(anteil);
                setSliderCommit(anteil);
              }}
              className="graph-time graph-datum"
              aria-label="Knowledge as of date"
            />
            <input
              type="range"
              min={0}
              max={100}
              step={0.5}
              value={sliderWert}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSliderWert(v >= 100 ? 100 : v);
              }}
              onPointerUp={() => setSliderCommit(sliderWert)}
              onTouchEnd={() => setSliderCommit(sliderWert)}
              onKeyUp={() => setSliderCommit(sliderWert)}
              onBlur={() => setSliderCommit(sliderWert)}
              className="graph-time"
              aria-label="Time of the knowledge shown"
            />
            <span className="hud-label whitespace-nowrap tnum" style={liveFilter !== null ? { color: "var(--accent)" } : undefined}>
              {liveFilter === null ? "Now" : new Date(liveFilter).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </span>
            {liveFilter !== null && (
              <button onClick={() => { setSliderWert(100); setSliderCommit(100); }} className="btn-ghost px-1.5 py-0.5 rounded text-[10px]">Today</button>
            )}
          </div>
        )}
        <div className="flex items-center gap-1 ml-auto">
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
              title="Nodes you dragged stay where you put them. This releases them back into the layout."
            >
              Release {angeheftet} pinned
            </button>
          )}
        </div>
      </div>

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
            // Ein Konzept öffnet beim Klick sein dossier — der Zeiger sagt es.
            // Die übrigen Gerüstknoten (typ, tag-gruppe, wurzel) sind nur
            // wege, kein inhalt: sie versprechen nichts und bleiben greifbar.
            cursor:
              greift
                ? "grabbing"
                : hovered
                  ? (hovered.startsWith(ENTITAETS_PRAEFIX) ? "pointer" : "grab")
                  : "grab",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
          onWheel={onWheel}
          onDoubleClick={onDoubleClick}
        />

        {filtered.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-6">
            <div className="hud-label mb-1.5">No match</div>
            <p className="text-sm max-w-sm" style={{ color: "var(--text-2)" }}>
              Nothing here matches “{filter.trim().slice(0, 40)}”. Clear the filter to get the whole graph back.
            </p>
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
              <div className="text-[10px] tnum" style={{ color: "var(--text-3)" }}>
                {kantZeilen!.frist}
              </div>
            )}
          </div>
        )}

        <div className="absolute left-3 bottom-3 hud-panel rounded-lg px-3 py-2 pointer-events-none space-y-1">
          <div className="flex items-center gap-3 hud-label">
            {(["semantic", "episodic", "procedural", "reference"] as const).map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: TYPE_COLORS[t] }} /> {TYP_LABELS[t]}
              </span>
            ))}
          </div>
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
          {/* Die Bilanz des Ausschnitts — nur wo etwas fehlt. */}
          {dichteZeile && (
            <div className="hud-label tnum" style={{ color: "var(--text-2)" }}>{dichteZeile}</div>
          )}
          <div className="hud-label">
            {ansicht === "dendrogram"
              ? uiT("hint.tree")
              : uiT("hint.force")}
          </div>
        </div>
      </div>
    </div>
  );
}
