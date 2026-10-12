// Das Kraftfeld des Graph-Dienstes: Plaetze in Welteinheiten, nicht in Pixeln.
//
// Der Viertelchen-Baum ist ein Rueckport aus der Desktop-App
// (kepta-app/src/lib/graphLayout.ts:455-549, dort laeuft er seit 3.1.x mit
// theta 0,9 und masse-gewaichtem Schwerpunkt). Die App hatte ihn laengst, der
// veroeffentlichte Kern nie — die Kostenreparatur ist also keine Erfindung.
//
// Die Kraftgesetze sind numerisch die des alten `kraftLayout` (Zentrierung
// 0,012, Abstossung 2600/d², Feder 110/0,015), damit das Bild wiedererkennbar
// bleibt. Was anders ist: der Start kommt aus keim(id) statt aus dem Array-Index,
// die Abstossung läuft im Baum statt ueber allen Paaren, und die Relaxation endet
// bei Abkuehlung — nicht nach 280 festen Ticks.
import { WELT_GROESSE, WELT_RAD } from "./graf-vertrag";

export const WELT_MITTE = WELT_GROESSE / 2;

/** Abstands-Quotient, ab dem eine Ballung als ein Koerper genaehert wird. */
export const THETA = 0.9;
const ZENTRIERUNG = 0.012;
const ABSTOSSUNG = 2600;
const RUHELAENGE = 110;
const FEDER = 0.015;
/** Groesster Schritt je Tick und Achse, in Welteinheiten. */
const BREMSE = 14;
const ALPHA_START = 1;
// 0,963 statt 0,975: die Abkuehlung ist der Ticks-Budget, nicht die Kraft.
// 0,975 laesst die Relaxation immer bis Ticks 210 laufen (gemessen), und der
// Kaufpreis ist Randklemmung — bei 2 000 Knoten 40,7 % der Knoten an der Kante
// nach 210 Ticks gegen 38,0 % nach 140, bei 500 Knoten 23,6 % gegen 21,4 %.
const ALPHA_VERFALL = 0.963;
// 0,005 behalten: staerkere Kuehlung ist NICHT der Weg. Gemessen 12.10. ersetzt
// der Schliff nach der Relaxation die-extra-ticks vollstaendig — bei 427 / 511 /
// 1 527 / 2 027 / 3 000 Knoten je 0 Paare im Endzustand, und das im alten Budget
// von 140 Ticks (71 / 85 / 541 / 872 / 1 886 ms). Dieselbe Relaxation bis zum
// alpha-Boden 1e-7 (428 Ticks) kostet 167 / 199 / 1 087 / 1 748 / 4 092 ms und
// meldet am Ende dasselbe: 0. Also die Kuehlung lassen, wie sie war, und danach
// trennen, bis nichts mehr zu trennen ist.
const ALPHA_ENDE = 0.005;
/** Abbruch, wenn kein Knoten sich noch so weit bewegt. */
// 1,0 Welteinheit: die Feder bei mittlerer Dehnung (500 Knoten: 170 gegen
// Ruhe-Laenge 110) wirkt mit ~0,9 Einheiten pro Tick — bei 0,5 als Schwelle
// ruht das Netz nie und zahlt immer den vollen Ticks-Budget.
const BEWEGUNG_ENDE = 1;
// Obergrenze, gemessen an der Lesbarkeit (median echte Kante / median
// Kontrollpaar): 0,562 bei 140 gegen 0,505 bei 210 Ticks — 24 % weniger Zeit
// fuer 11 % weniger Dehnung, und die Randklemmung sinkt mit.
// 140 behalten, gemessen und begruendet im ALPHA_ENDE-Kommentar direkt darueber.
const TICKS_MAX = 140;
/**
 * Ueberlaeufe der Scheibentrennung je Tick. GEMESSEN, nicht gefuehlt
 * (`e2-code/nacht-12-10/rohdaten/ruhe-pass.json`, dort **ohne** den Schliff unten
 * und bis zum alpha-Boden bei 428 Ticks): bei 3 027 Knoten lassen 2 Ueberlaeufe
 * 37 Paare stehen, 3 trennen 0 / 0 / 0 an allen drei Bestaenden, und 12 kosten
 * gegen 3 das Doppelte (9 863 ms gegen 3 740 ms) fuer dieselbe 0.
 *
 * Der Wert steht heute auf 2, und das ist keine Nachlaessigkeit: dieselbe Tabelle
 * ist vor dem Schliff gemessen. Der Schliff uebernimmt die letzte Beruehrung, und
 * mit 2 je Tick plus begrenztem Schliff steht die Ruhe bei 427 / 1 527 / 3 027 auf
 * 0 / 0 / 0 Paaren — bewiesen von `tests/graf-ruhe.test.ts`, nicht von einem
 * Kostenvergleich. Was an dieser Stelle NICHT gemessen ist: 2 gegen 3 je Tick
 * **mit** Schliff. Die Zahl fehlt, und sie waere ein Preisvergleich, kein
 * Heilungsnachweis. Die Flaeche trennt mit 8, weil ihr Feld pro Bild laeuft; der
 * Kern trennt pro Grundriss.
 */
export const TRENN_DURCHGAENGE = 2;
/**
 * Der Schliff nach der Kuehlung: Ueberlaeufe ohne Kraefte, bis einer keine echte
 * Ueberlappung mehr findet. Noetig, weil die letzten Schnitte ein Patt sind —
 * Federn und Trennung streiten sie jeden Tick erneut, und die Relaxation endet bei
 * alpha-Boden, nicht bei "keine Beruehrung". Begrenzt, weil die zwei Einheiten Luft
 * aus `TRENN_ABSTAND` an dichten Bestaenden nie zugleich mit den Federn zu halten
 * sind; abgebrochen wird deshalb an der Zusage, nicht an der Luft (Gemessenes:
 * siehe `trenne`).
 */
export const SCHLIFF_DURCHGAENGE = 200;
/** Zusatzluft zwischen zwei Scheiben, in Welteinheiten. */
const TRENN_ABSTAND = 2;
/** Halber Rundungsspielraum in zwei Achsen, damit die Meldung nach innen zeigt. */
const MELDE_PUFFER = 0.08;
/**
 * Die Luft, die eine gemeldete Welt um ihre Plaetze laesst: MELDE_PUFFER nach
 * innen (Reichweiten-Puffer) plus 0,05 fuer die Nachkommastelle, mit der die
 * Meldung rundet. Der Welt-Saum selbst ist 30 WE — diese 0,13 sind die Stelle,
 * an der die Zusage "innerhalb des Saums" auf die letzte Nachkommastelle genau
 * gilt statt auf gut Glueck.
 */
const SAUM_LUFT = MELDE_PUFFER + 0.05;
/**
 * Ticks-Budget fuer den Nachtrag (ein Grundriss existiert, eine Notiz kam dazu).
 * Begrenzt, weil die Zahl der noetigen Ticks an dichten Bestaenden streut: gemessen
 * endete der Nachtrag bei 427 Knoten nach 11 Ticks, bei 1 527 nach 54 (4 Ueberlaeufe)
 * und lief bei 8 Ueberlaeufen bis an die Kuehlung. Ein Budget von 60 haelt die
 * Anfrage bezahlbar und laesst den Neuling dennoch draussen landen.
 */
export const NACHTRAG_TICKS = 60;
/** Groesste Zellzahl je Seite im Trennungs-Raster — Notbremse gegen ein duennes Feld. */
const TRENN_RASTER_SEITEN = 2048;
/** Die vier Nachbarzellen "davor": ein Paar wird genau einmal geprueft. */
const NACHBAR_X = [1, -1, 0, 1];
const NACHBAR_Y = [0, 1, 1, 1];
const BAUM_MAX_TIEFE = 26;

export interface KraftKnoten {
  id: string;
  /**
   * Radius der Scheibe, die dieser Knoten im Bild hat, in Welteinheiten — aus
   * `scheibenRadius` im Vertrag, damit das Weltbild genau die Kreise trennt, die
   * ein Client malt. 0 oder fehlend heisst: hier gibt es nichts zu trennen.
   */
  scheibe?: number;
}

export interface KraftKante {
  quelle: string;
  ziel: string;
  sorte: "echt" | "aehnlich";
  /** Layout-Hinweis 0..1 — ausgedruecklich keine Messgroesse. */
  feder: number;
}

/**
 * Wander-Grenze fuer einen bestehenden Knoten, in Welteinheiten je Rechnung:
 * 2 % der Welt-Diagonalen (sqrt(2)*1000). Das ist dieselbe Groessenordnung, die
 * A9 §1 als Messehre verspricht — hier ist sie keine Messlatte mehr, sondern
 * das Baugesetz: ein Knoten, der schon einen Platz hatte, darf sich orientieren,
 * aber nicht ueber die Welt werfen. Ein neuer Knoten hat keine Grenze, sonst
 * faende er keinen Platz an seinen Partnern (gemessen: 459 Einheiten Abstand
 * zur [[Link]]-Zielnote, als alle Bestehenden fest genagelt waren).
 */
export const WANDER_GRENZE = Math.round(Math.SQRT2 * WELT_GROESSE * 0.02 * 10) / 10;

/** Abstand, mit dem ein neuer Knoten neben seiner Nachbarschaft einsteigt. */
const EINSTIEGS_ABSTAND = 40;
/** Wie weit ein neuer Knoten von seinem Einstieg weg darf. */
const EINSTIEG_RADIUS = 120;

/**
 * Reichweite der Abstossung, in Welteinheiten. Ohne sie addiert sich in einem
 * dichten Netz die Last aller fernen Knoten zu einem Druck, der jede Feder
 * ueberstimmt: gemessen blieb ein neuer Knoten 504 WE von seiner eigenen
 * [[Link]]-Zielnote, obwohl er frei war — die Menge hat ihn weggeschoben.
 * Mit Reichweite gewinnen die Bindungen, und die Weltklemmung sinkt (A5-09
 * mass am alten Gesetz 46 % der Knoten am Rahmen fest; genau das ist der
 * Druck ohne Abschneidung). Der Viertelchen-Baum ueberspringt ferne Ballungen
 * vollstaendig, statt sie als einen Koerper zu naehern — das ist der Preis:
 * ein Weltbild kennt seine Nachbarschaft, nicht seine Ferne.
 */
export const ABSCHRECKUNG = 420;
const ABSCHRECKUNG_QUADRAT = ABSCHRECKUNG * ABSCHRECKUNG;

export interface KraftEingang {
  knoten: readonly KraftKnoten[];
  kanten: readonly KraftKante[];
  /** Plaetze des letzten Bildes — der Start der neuen Relaxation. */
  vorher?: ReadonlyMap<string, { x: number; y: number }>;
  /** Knoten mit unveraenderter Kantenmenge: behalten ihren Platz bitgleich. */
  unveraendert?: ReadonlySet<string>;
  ticksMax?: number;
  theta?: number;
}

export interface Weltplatz {
  x: number;
  y: number;
  /** true, wenn der Platz aus dem letzten Bild uebernommen wurde. */
  verankert: boolean;
}

interface Punkt {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  pinned: boolean;
  /** Startplatz der Rechnung und Wander-Grenze um ihn her. */
  sx: number;
  sy: number;
  radius: number;
  scheibe: number;
}

/**
 * Der Anfangsplatz als reine Funktion der Identitaet: FNV-1a ueber der id,
 * Winkel aus den niedrigen Bits, Radius aus den hoeheren. Eine neue Notiz
 * aendert damit nichts an den Startplaetzen alter Notizen — die Notiz-IDs sind
 * Zeitstempel mit Zufalls-Endung, ihre Streuung ist gut.
 */
function richtung(id: string): { dx: number; dy: number } {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const winkel = ((h % 3600) / 3600) * 2 * Math.PI;
  return { dx: Math.cos(winkel), dy: Math.sin(winkel) };
}

export function keim(id: string): { x: number; y: number } {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const winkel = ((h % 3600) / 3600) * 2 * Math.PI;
  const radius = (0.3 + ((h >>> 9) % 600) / 1000) * WELT_MITTE;
  return {
    x: WELT_MITTE + Math.cos(winkel) * radius,
    y: WELT_MITTE + Math.sin(winkel) * radius,
  };
}

// ---------------------------------------------------------------- Viertelchen-Baum

interface Quad {
  x0: number;
  y0: number;
  size: number;
  cx: number;
  cy: number;
  masse: number;
  kinder: (Quad | null)[] | null;
  blatt: Punkt | null;
}

function neuerQuad(x0: number, y0: number, size: number): Quad {
  return { x0, y0, size, cx: 0, cy: 0, masse: 0, kinder: null, blatt: null };
}

function einfuegen(q: Quad, n: Punkt, tiefe: number): void {
  q.cx = (q.cx * q.masse + n.x) / (q.masse + 1);
  q.cy = (q.cy * q.masse + n.y) / (q.masse + 1);
  q.masse += 1;

  if (q.kinder === null) {
    if (q.blatt === null) { q.blatt = n; return; }
    // Deckelt die Rekursion, wenn zwei Knoten exakt aufeinander liegen.
    if (tiefe >= BAUM_MAX_TIEFE) return;
    const alt = q.blatt;
    q.blatt = null;
    q.kinder = [null, null, null, null];
    platziere(q, alt, tiefe);
  }
  platziere(q, n, tiefe);
}

function platziere(q: Quad, n: Punkt, tiefe: number): void {
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

function baueBaum(punkte: readonly Punkt[]): Quad | null {
  if (punkte.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of punkte) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }
  const size = Math.max(maxX - minX, maxY - minY, 1) * 1.05 + 1;
  const wurzel = neuerQuad(minX - 0.5, minY - 0.5, size);
  for (const n of punkte) einfuegen(wurzel, n, 0);
  return wurzel;
}

/**
 * Abstossungskraft auf einen Knoten. Ferne Ballungen werden als EIN Koerper
 * genaehert — daher O(log n) statt O(n) pro Knoten.
 */
function abstossungAuf(q: Quad | null, n: Punkt, staerke: number, theta: number, out: { fx: number; fy: number }): void {
  if (!q || q.masse === 0) return;
  const dx = n.x - q.cx;
  const dy = n.y - q.cy;
  let distSq = dx * dx + dy * dy;

  if (q.blatt !== null) {
    if (q.blatt === n) return;
    if (distSq < 1) distSq = 1;
    if (distSq > ABSCHRECKUNG_QUADRAT) return;
    const dist = Math.sqrt(distSq);
    const f = (staerke * q.masse) / distSq;
    out.fx += (dx / dist) * f;
    out.fy += (dy / dist) * f;
    return;
  }

  if (distSq < 1) distSq = 1;
  if (distSq - q.size * q.size > ABSCHRECKUNG_QUADRAT) return;
  const dist = Math.sqrt(distSq);
  if (q.size / dist < theta) {
    const f = (staerke * q.masse) / distSq;
    out.fx += (dx / dist) * f;
    out.fy += (dy / dist) * f;
    return;
  }
  if (q.kinder) for (const k of q.kinder) abstossungAuf(k, n, staerke, theta, out);
}


// ---------------------------------------------------------------- Scheibentrennung
//
// Der Grundriss trennt, was der Client malt. Gebaut wie in der Flaeche
// (`kepta-app/src/lib/graphLayout.ts`, `resolveCollisions`): ein Zellraster mit
// der Masche "zwei Radien plus Luft", Paare innerhalb der Zelle und gegen die vier
// Zellen davor — jedes Paar genau einmal, keine Nachbarzelle uebersehen.
// Die Ursache war am 11.10. gemessen ausgeschloessen, dass das Raster blind waere:
// ein einzelner Nachlauf auf der fertigen Ruhelage fand 7 942 Korrekturen fuer vier
// Paare. Es fehlten die Durchgaenge, nicht die Nachbarschaft.
interface Raster {
  /** Je Zelle der erste Knoten, -1 = leer. */
  kopf: Int32Array;
  /** Verkettung: der naechste Knoten derselben Zelle, -1 = Ende. */
  naechster: Int32Array;
  /** Die belegten Zellen — nur die werden abgelaufen, nie das ganze Feld. */
  belegt: Int32Array;
}

/**
 * Das Raster je Rechnung einmal gebaut, je Ueberlauf wieder gefüllt. Kein Objekt
 * faellt im laufenden Tick: gemessen kostete die Map-Fassung mit Array je Ueberlauf
 * 76,5 ms zusaetzlich bei 500 Knoten, die zuteilungsfreie Fassung 57,3 ms, und die
 * Ueberlaeufe sind danach nicht teurer geworden — nur das Bild ist gueltiger.
 */
function leeresRaster(anzahl: number): Raster {
  return {
    kopf: new Int32Array(4096),
    naechster: new Int32Array(Math.max(2, anzahl)),
    belegt: new Int32Array(Math.max(2, anzahl)),
  };
}

/**
 * Ein Knoten bleibt in seiner Reichweite um den Startplatz: die Reichweite ist
 * Vertrag (A9 §1 — Bestehende wandern nur innerhalb WANDER_GRENZE, Neue nur
 * innerhalb EINSTIEG_RADIUS), und die Trennung darf ihn nicht daraus werfen.
 * Ohne diese Klemmung mass die Nachbarschafts-Wache 28,33 gegen 28,28 Einheiten.
 */
function klemmeReichweite(p: Punkt): void {
  if (!Number.isFinite(p.radius)) return;
  const wx = p.x - p.sx;
  const wy = p.y - p.sy;
  const abst = Math.hypot(wx, wy);
  if (abst > p.radius) {
    p.x = p.sx + (wx / abst) * p.radius;
    p.y = p.sy + (wy / abst) * p.radius;
  }
}

/**
 * Ein Scheibenpaar auseinanderschieben. Gibt die groesste Bewegung eines Endes in
 * Welteinheiten zurueck, 0 wo nichts rueckte.
 *
 * `zaehler` ist die einzige Stelle, an der die Zusage von der Gute getrennt wird:
 * gezahlt wird ein Paar, wenn es sich ECHT schneidet (Abstand unter Summe der
 * Radien) — nicht, wenn ihm die zwei Einheiten Luft fehlen, die `TRENN_ABSTAND`
 * dazu legt. Der Schliff unten tritt ab, wenn ein Ueberlauf keine echte
 * Ueberlappung mehr findet; alles andere waere eine Passzahl, die ein Bild
 * verlassen meldet, das den Vertrag schon haelt.
 */
function schiebe(a: Punkt, b: Punkt, zaehler?: { echte: number }): number {
  const echt = a.scheibe + b.scheibe;
  const soll = echt + TRENN_ABSTAND;
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let d = Math.hypot(dx, dy);
  if (d >= soll) return 0;
  if (zaehler && d < echt) zaehler.echte++;
  if (d < 1e-9) {
    // Exakter Zusammenfall: die Richtung kommt aus der Identitaet, nicht aus einem
    // Zufall — derselbe Bestand muss dasselbe Bild geben, auch im Ruecklauf.
    const r = richtung(a.id < b.id ? a.id : b.id);
    dx = r.dx;
    dy = r.dy;
    d = 1;
  }
  const weg = ((soll - d) / d) * 0.5;
  let bewegt = 0;
  // Ein verankerter Knoten behaelt seinen Platz bitgleich — das ist Vertrag
  // (`verankert`), nicht ein Wunsch: sein Anteil geht vollstaendig an das freie Ende.
  const anteilA = b.pinned ? 2 : 1;
  const anteilB = a.pinned ? 2 : 1;
  if (!a.pinned) {
    const nx = a.x - dx * weg * anteilA;
    const ny = a.y - dy * weg * anteilA;
    bewegt = Math.max(bewegt, Math.abs(nx - a.x), Math.abs(ny - a.y));
    a.x = nx;
    a.y = ny;
    klemmeReichweite(a);
  }
  if (!b.pinned) {
    const nx = b.x + dx * weg * anteilB;
    const ny = b.y + dy * weg * anteilB;
    bewegt = Math.max(bewegt, Math.abs(nx - b.x), Math.abs(ny - b.y));
    b.x = nx;
    b.y = ny;
    klemmeReichweite(b);
  }
  return bewegt;
}

/** Bis zu `durchgaenge` Ueberlaeufe; der Abbruch haengt an der Lesart (siehe unten). */
function trenne(punkte: Punkt[], schar: Raster, durchgaenge: number, nurEchteUeberlappung = false): number {
  const anzahl = punkte.length;
  if (anzahl < 2 || durchgaenge < 1) return 0;
  const { naechster, belegt } = schar;
  let ueberlaeufe = 0;
  for (; ueberlaeufe < durchgaenge; ueberlaeufe++) {
    let bx = Infinity, by = Infinity, bx2 = -Infinity, by2 = -Infinity, grosste = 0;
    for (let i = 0; i < anzahl; i++) {
      const p = punkte[i];
      if (p.x < bx) bx = p.x;
      if (p.x > bx2) bx2 = p.x;
      if (p.y < by) by = p.y;
      if (p.y > by2) by2 = p.y;
      if (p.scheibe > grosste) grosste = p.scheibe;
    }
    if (grosste <= 0) break;
    // Das Raster entsteht aus der WIRKLICHEN Ausdehnung, nicht aus der Welt:
    // ohne Rueckklammerung waere die Welt ein Rand, den niemand gesetzt hat, und
    // ein Raster daraus haette eine einzige Zelle fuer das ganze Bild (gemessen:
    // 2 248 ms fuer 427 Knoten, weil jede Pruefung damit brute force war).
    const span = Math.max(1, Math.max(bx2 - bx, by2 - by));
    const zelle = Math.max((grosste + TRENN_ABSTAND) * 2, span / TRENN_RASTER_SEITEN);
    const seiten = Math.max(1, Math.min(TRENN_RASTER_SEITEN, Math.ceil(span / zelle) + 1));
    let kopf = schar.kopf;
    if (kopf.length < seiten * seiten) {
      kopf = new Int32Array(seiten * seiten);
      schar.kopf = kopf;
    }
    kopf.fill(-1, 0, seiten * seiten);
    let belegtAnzahl = 0;
    for (let i = 0; i < anzahl; i++) {
      const p = punkte[i];
      let cx = Math.floor((p.x - bx) / zelle);
      let cy = Math.floor((p.y - by) / zelle);
      if (cx < 0) cx = 0;
      else if (cx >= seiten) cx = seiten - 1;
      if (cy < 0) cy = 0;
      else if (cy >= seiten) cy = seiten - 1;
      const z = cy * seiten + cx;
      if (kopf[z] === -1) belegt[belegtAnzahl++] = z;
      naechster[i] = kopf[z];
      kopf[z] = i;
    }
    let korrekturen = 0;
    const zaehler = nurEchteUeberlappung ? { echte: 0 } : undefined;
    for (let b = 0; b < belegtAnzahl; b++) {
      const k = belegt[b];
      const zx = k % seiten;
      const zy = (k - zx) / seiten;
      for (let i = kopf[k]; i >= 0; i = naechster[i]) {
        for (let j = naechster[i]; j >= 0; j = naechster[j]) {
          if (schiebe(punkte[i], punkte[j], zaehler) > 0) korrekturen++;
        }
        for (let t = 0; t < 4; t++) {
          const nx = zx + NACHBAR_X[t];
          const ny = zy + NACHBAR_Y[t];
          if (nx < 0 || nx >= seiten || ny < 0 || ny >= seiten) continue;
          const anfang = kopf[ny * seiten + nx];
          if (anfang < 0) continue;
          for (let j = anfang; j >= 0; j = naechster[j]) {
            if (schiebe(punkte[i], punkte[j], zaehler) > 0) korrekturen++;
          }
        }
      }
    }
    // Fruehausstieg. Zwei Lesarten, weil hier zwei Dinge stehen: die Zusage
    // ("keine zwei Scheiben schneiden sich") und die gute Luft (TRENN_ABSTAND
    // Welteinheiten zwischen jedem Paar). In der Relaxation zaehlt jede Korrektur —
    // dort ist Luft der Wunsch, den der naechste Tick ohnehin erneuert. Im Schliff
    // zaehlt nur eine echte Ueberlappung: die Luft laesst sich an dichten Bestaenden
    // nie zugleich mit den Federn halten (gemessen: 200 von 200 Umlaeufen bei
    // 1 527 und 3 027 Knoten, obwohl die Nachzaehlung 0 Paare meldet), und ein
    // Abbruch, der eine erfuellte Zusage als "nicht fertig" meldet, ist kein
    // Ruhe-Urteil, sondern ein Zahlendreher.
    if (zaehler ? zaehler.echte === 0 : korrekturen === 0) break;
  }
  return ueberlaeufe;
}

// ---------------------------------------------------------------- Relaxation

const rnd = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Ein Weltbild aus Bestand und Anker: gleiche Eingabe, gleiches Ergebnis —
 * unabhaengig davon, in welcher Reihenfolge die Listen ankamen.
 */
export interface WeltDiagnose {
  ticks: number;
  alpha: number;
  besuche: number;
  /** Seite der Welt, die zu diesem Bild gehört — die Zahl, die `welt.groesse` traegt. */
  welt?: number;
  /**
   * Untere linke Ecke derselben Welt — die Zahl, die `welt.nullpunkt` traegt.
   * Null auf dem ersten Rahmen eines Bestands (der setzt das Bild bei WELT_RAD
   * an), negativ, sobald ein Nachtrag ueber den alten Untergrund hinauswaechst.
   */
  nullpunkt?: { x: number; y: number };
  /** Gegangene Trennungs-Ueberlaeufe je Tick; zaehlt den Fruehausstieg. */
  ueberlaeufe?: number;
  /**
   * Gegangene Ueberlaeufe des Schliffs. Die Zahl ist das Ruhe-Urteil der Trennung:
   * einer weniger als `SCHLIFF_DURCHGAENGE` heisst, dass ein Ueberlauf keine echte
   * Ueberlappung mehr gefunden hat — die Zusage erfuellt, bevor der Budgetrand kam.
   * Genau die Obergrenze heisst, dass nach 200 Umlaeufen Paare zusammenliegen, und
   * ist ein Abbruch, keine Ruhelage.
   */
  schliif?: number;
  /** Wie viele Knoten die Weltwaende beruehren — die Zahl hinter dem Ruhe-Urteil. */
  anDerWand?: number;
}

export function berechneWelt(eingang: KraftEingang, diagnose?: WeltDiagnose): Map<string, Weltplatz> {
  const knoten = [...eingang.knoten].sort(rnd);
  const kanten = [...eingang.kanten]
    .filter((k) => k.quelle !== k.ziel)
    .sort((a, b) => {
      const ka = a.quelle < a.ziel ? `${a.quelle}|${a.ziel}` : `${a.ziel}|${a.quelle}`;
      const kb = b.quelle < b.ziel ? `${b.quelle}|${b.ziel}` : `${b.ziel}|${b.quelle}`;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
  if (knoten.length === 0) return new Map();

  const vorher = eingang.vorher;
  const unveraendert = eingang.unveraendert;
  // Nachbarschaft je Knoten, damit ein NEUER Knoten dort einsteigt, wo seine
  // Bindungen schon liegen. Ein neuer Knoten, der aus dem Leeren (keim) startet,
  // wird in einem dichten Netz von der Menge abgestossen und erreicht seinen
  // Partner nie — gemessen: 504 WE Abstand zur eigenen [[Link]]-Zielnote bei
  // freier Bewegung und 140 Ticks. Der Nutzer erwartet das Gegenteil: eine neue
  // Notiz taucht dort auf, wo sie hingehoert. keim bleibt der Start fuer den
  // ersten Aufbau ohne Geruest.
  const nachbarn = new Map<string, string[]>();
  for (const k of kanten) {
    for (const [ende, other] of [[k.quelle, k.ziel] as const, [k.ziel, k.quelle] as const]) {
      const liste = nachbarn.get(ende);
      if (liste) liste.push(other); else nachbarn.set(ende, [other]);
    }
  }
  const nachbarnMitPlatz = new Map<string, number>();
  // Die bereits gesetzten Scheiben, in einem groben Raster: ein Startplatz gilt
  // als frei, wenn keine gelegte Scheibe naeher ist als zwei Radien plus Luft.
  // Ohne das hier faengt ein Neuling mitten in seiner Clique an, und die Trennung
  // muss den Streit mit lauter unveraenderlichen Nachbarn ausfechten — gemessen
  // 428 Ticks und 958 ms bei 1 527 Knoten gegen 11 Ticks und 2-3 ms, wenn er
  // draussen anfängt.
  const gesetzt: { x: number; y: number; r: number }[] = [];
  const gesetztRaster = new Map<number, number[]>();
  const RASTER_KANTE = 64;
  const rasterSchluessel = (x: number, y: number) => ((Math.floor(y / RASTER_KANTE) << 12) + Math.floor(x / RASTER_KANTE)) | 0;
  const frei = (x: number, y: number, r: number): boolean => {
    const zx = Math.floor(x / RASTER_KANTE), zy = Math.floor(y / RASTER_KANTE);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const eimer = gesetztRaster.get((((zy + dy) << 12) + (zx + dx)) | 0);
        if (!eimer) continue;
        for (const j of eimer) {
          const q = gesetzt[j];
          if (Math.hypot(x - q.x, y - q.y) < r + q.r + TRENN_ABSTAND) return false;
        }
      }
    }
    return true;
  };
  const setze = (x: number, y: number, r: number): { x: number; y: number } => {
    gesetzt.push({ x, y, r });
    const k = rasterSchluessel(x, y);
    const eimer = gesetztRaster.get(k);
    if (eimer) eimer.push(gesetzt.length - 1);
    else gesetztRaster.set(k, [gesetzt.length - 1]);
    return { x, y };
  };
  /**
   * Eine feste Spirale, kein Zufall: acht Richtungen um den Anflugvektor,
   * Schritttiefe zwei Radien je Ring. Derselbe Bestand muss dasselbe Bild geben,
   * unabhaengig davon, in welcher Reihenfolge die Listen ankamen.
   */
  const platzAusserhalb = (basis: { x: number; y: number }, id: string, r: number): { x: number; y: number } => {
    if (gesetzt.length === 0 || frei(basis.x, basis.y, r)) return basis;
    const { dx, dy } = richtung(id);
    const grund = Math.atan2(dy, dx);
    for (let ring = 1; ring <= 24; ring++) {
      const weite = (r + TRENN_ABSTAND) * 2 * ring;
      for (let winkel = 0; winkel < 8; winkel++) {
        const a = grund + (Math.PI / 4) * winkel;
        const x = basis.x + Math.cos(a) * weite;
        const y = basis.y + Math.sin(a) * weite;
        if (frei(x, y, r)) return { x, y };
      }
    }
    return basis;
  };
  const startPlatz = (id: string): { x: number; y: number } => {
    const keimPunkt = keim(id);
    if (!vorher) return keimPunkt;
    const platzierte = (nachbarn.get(id) ?? []).map((n) => vorher.get(n)).filter((p): p is { x: number; y: number } => !!p);
    nachbarnMitPlatz.set(id, platzierte.length);
    if (platzierte.length === 0) return keimPunkt;
    const sx = platzierte.reduce((a, p) => a + p.x, 0) / platzierte.length;
    const sy = platzierte.reduce((a, p) => a + p.y, 0) / platzierte.length;
    const { dx, dy } = richtung(id);
    return { x: sx + dx * EINSTIEGS_ABSTAND, y: sy + dy * EINSTIEGS_ABSTAND };
  };
  const punkte: Punkt[] = knoten.map((k) => {
    const alt = vorher?.get(k.id);
    const roh = alt ?? startPlatz(k.id);
    const scheibe = Math.max(0, k.scheibe ?? 0);
    // Ein uebernommener Platz bleibt, wo er ist — auch wenn er sich mit einem
    // Nachbarn schneidet: die Verankerung ist Vertrag, und ein Schnitt zwischen
    // zwei verankerten Knoten wird nicht repariert, sondern bleiben.
    // Der klare Start gilt NUR fuer den Nachtrag an einen bestehenden Grundriss.
    // Fuer den ersten Rahmen schaet er: gemessen 12.10. bleiben bei 3 027 Knoten
    // 76 Paare stehen, wenn jeder Knoten draussen eingesetzt wird, und 0, wenn er
    // aus keim(id) startet und die Trennung im Lauf ordnet. (Der Grund ist die
    // Spirale selbst: sie setzt Nachbarn auf feste Ringaeste, und ein Ringabstand
    // von zwei Radien ist genau die Stelle, an der sich zwei Scheiben beruehren —
    // der Start erzeugt Kontakt, statt ihn zu vermeiden.)
    const start = alt ?? (vorher ? platzAusserhalb(roh, k.id, scheibe) : roh);
    if (!alt) setze(start.x, start.y, scheibe);
    const pinned = alt !== undefined && (unveraendert?.has(k.id) ?? false);
    const frei = alt === undefined;
    return {
      id: k.id,
      x: start.x,
      y: start.y,
      vx: 0,
      vy: 0,
      pinned,
      sx: start.x,
      sy: start.y,
      // Ein neuer Knoten ist frei, aber nichtgrenzenlos: wer neben seiner
      // Nachbarschaft einsteigt, darf dort sitzen, nicht an den Rand der
      // Abstossungsreichweite geworfen werden (gemessen: 479 WE Abstand zum
      // eigenen [[Link]]-Ziel, weil die Feder bei 40 Einheiten selbst abstoesst
      // und die Menge den Rest besorgte). Ohne platzierte Nachbarn — erster
      // Aufbau, oder ein Knoten fuer sich — bleibt er frei.
      radius: pinned ? 0 : !frei ? WANDER_GRENZE : nachbarnMitPlatz.get(k.id) ? EINSTIEG_RADIUS : Number.POSITIVE_INFINITY,
      scheibe,
    };
  });
  const byId = new Map(punkte.map((p) => [p.id, p]));
  const paare = kanten
    .map((k) => [byId.get(k.quelle), byId.get(k.ziel), k] as const)
    .filter((p): p is [Punkt, Punkt, KraftKante] => p[0] !== undefined && p[1] !== undefined);

  const ticksMax = Math.max(1, Math.floor(eingang.ticksMax ?? TICKS_MAX));
  const theta = eingang.theta ?? THETA;
  const kraft = { fx: 0, fy: 0 };

  const schar = leeresRaster(punkte.length);
  const trennt = punkte.some((p) => p.scheibe > 0);
  let ueberlaeufe = 0;
  let alpha = ALPHA_START;
  let besuche = 0;
  let ticks = 0;
  for (let tick = 0; tick < ticksMax; tick++) {
    ticks = tick + 1;
    // Zentrierung als Ausgangsgeschwindigkeit, dann wirken Abstossung und
    // Federn auf BEIDE Enden — derselbe Bau wie im alten Layout, damit der
    // Schwerpunkt nicht in eine Ecke wandert.
    for (const p of punkte) {
      p.vx = (p.x - WELT_MITTE) * ZENTRIERUNG;
      p.vy = (p.y - WELT_MITTE) * ZENTRIERUNG;
    }
    const baum = baueBaum(punkte);
    for (const p of punkte) {
      if (p.pinned) continue;
      kraft.fx = 0; kraft.fy = 0;
      abstossungAuf(baum, p, ABSTOSSUNG, theta, kraft);
      p.vx += kraft.fx;
      p.vy += kraft.fy;
    }
    for (const [u, v] of paare) {
      const dx = u.x - v.x, dy = u.y - v.y;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const k = (d - RUHELAENGE) * FEDER;
      u.vx -= (dx / d) * k;
      u.vy -= (dy / d) * k;
      v.vx += (dx / d) * k;
      v.vy += (dy / d) * k;
    }
    let spannung = 0;
    for (const p of punkte) {
      if (p.pinned) continue;
      const sx = Math.max(-BREMSE, Math.min(BREMSE, p.vx));
      const sy = Math.max(-BREMSE, Math.min(BREMSE, p.vy));
      // Die Abkuehlung dämpft den Schritt, aber sie ist nicht das Urteil ueber
      // den Zustand: geendet wird nach der ROHEN Spannung. Sonst meldet ein Netz
      // mit 400 Einheiten weiten Federn "ruhig", weil alpha die Bewegung klein
      // macht, waehrend die Kraefte noch ziehen — und verbundene Knoten bleiben
      // weit auseinander (gemessen: h-a 116, h-b 392 bei Ruhe-Laenge 110).
      // Die Abkuehlung ist der Abbruch, nicht die Kraft: der Schritt bleibt der
      // des alten Gesetzes (clamp 14), sonst haengt die zuruecklegbare Strecke an
      // Σalpha = 40 Schritte, und ferne Federn erreichen ihre Ruhe-Laenge nie —
      // gemessen vor der Umstellung: h-a 116 (erreicht), h-b 383 und h-c 303
      // (uebrig geblieben, weil der Weg nicht reichte, nicht weil die Kraft stritt).
      let nx = p.x + sx;
      let ny = p.y + sy;
      // Reichweite um den Startplatz — dieselbe Klemmung, die die Trennung nutzt.
      if (Number.isFinite(p.radius)) {
        const wx = nx - p.sx, wy = ny - p.sy;
        const abst = Math.hypot(wx, wy);
        if (abst > p.radius) {
          nx = p.sx + (wx / abst) * p.radius;
          ny = p.sy + (wy / abst) * p.radius;
        }
      }
      // Stand 5: keine Rueckklammerung. Die Klemmung war die Hauptursache der
      // Ueberlappung — gemessen liess sie in der Ruhe 148 / 516 / 1 213 Plaetze an
      // der Wand liegen und 147 / 961 / 4 312 Paare uebereinander, und weil ein
      // geklemmter Knoten keine Bewegung mehr meldet, las `BEWEGUNG_ENDE` den
      // Stapel als Ruhe. Die Weltgrenze entsteht jetzt aus der Ausdehnung des
      // Bildes, nicht umgekehrt.
      besuche += 1;
      // Geendet wird nach der tatsaechlichen Bewegung, nicht nach der Kraft:
      // die Zentrierung (0,012) gibt einem Knoten an der Weltkante eine Kraft von
      // ueber fuenf Einheiten, die nie verschwindet — nach Kraefen gemessen laeuft
      // die Relaxation immer bis zur alpha-Grenze (gemessen: 210 Ticks bei 2 000
      // Knoten, 384 ms). Seit der Schritt nicht mehr gedaempft wird, ist die
      // Bewegung wieder das ehrliche Ruhe-Urteil.
      spannung = Math.max(spannung, Math.abs(nx - p.x), Math.abs(ny - p.y));
      p.x = nx; p.y = ny;
    }
    if (trennt) ueberlaeufe += trenne(punkte, schar, TRENN_DURCHGAENGE);
    alpha *= ALPHA_VERFALL;
    if (alpha < ALPHA_ENDE || spannung < BEWEGUNG_ENDE) break;
  }
  // Der Rahmen setzt sich als STARRE Uebersetzung in den Rand: eine Uebersetzung
  // aendert keine einzige Paar-Entfernung, sie ist ein Bezugspunkt, keine Rechnung
  // an der Lage. Nur beim ersten Rahmen eines Bestands — ein Nachtrag erbt das
  // Koordinatensystem seines Vorgaengers, sonst waere "bitgleich verankert" leer.
  let x = Infinity, y = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const pt of punkte) {
    if (pt.x < x) x = pt.x;
    if (pt.y < y) y = pt.y;
    if (pt.x > x2) x2 = pt.x;
    if (pt.y > y2) y2 = pt.y;
  }
  if (!vorher) {
    const vx = WELT_RAD - x, vy = WELT_RAD - y;
    for (const pt of punkte) {
      pt.x += vx;
      pt.y += vy;
      pt.sx += vx;
      pt.sy += vy;
    }
    x = WELT_RAD;
    y = WELT_RAD;
    x2 += vx;
    y2 += vy;
  }
  // Die Welt ist ein Rechteck um dieses Bild, nicht ein Rechteck bei Null. Der
  // Untergrund ist eine gemeldete Zahl, weil das Feld hier offen liegt: ein
  // Neuling darf 120 Welteinheiten weit ausserhalb seiner Saat landen, und auf
  // dem Nachtrag-Pfad wird das Bild nicht verschoben — eine Verschiebung um einen
  // konstanten Betrag wuerde alle bitgleich verankerten Knoten bewegen und die
  // Wander-Grenze von 28,3 WE reissen (gemessen 12.10. 13:09: ein Neuling bei
  // x = -128,2 in einem 90-Knoten-Bild, waehrend 77 von 77 Anker ihren Platz
  // hielten). Ohne diese Zahl waere die Zusage "Plaetze liegen in 0..groesse"
  // eine Zahl, die nur beim ersten Rahmen eines Bestands gilt.
  // Die SAUM_LUFT darunter ist die Luft, die die Meldung selbst braucht: ein
  // Platz wird um bis zu MELDE_PUFFER nach innen gezogen (sein Reichweiten-Puffer)
  // und um 0,05 durch die Nachkommastelle. Ohne diese Luft ist "innerhalb des
  // Saums" ein Glueckswurf auf die letzte Stelle statt einer Zusage.
  const weltUnter = { x: Math.floor(x - WELT_RAD - SAUM_LUFT), y: Math.floor(y - WELT_RAD - SAUM_LUFT) };
  // Die Seite wird aus dem UNTERGRUND gerechnet, nicht aus der Ausdehnung allein:
  // nur so ist `nullpunkt + groesse - WELT_RAD` beweisbar oberhalb des hoechsten
  // Platzes. Ein `ceil(Ausdehnung) + 2*WELT_RAD` neben einem `floor(min - WELT_RAD)`
  // kann die Obergrenze bis zu zwei Einheiten unter den hoechsten Platz legen —
  // die Rundungsluft der zwei Grenzen verliert sich nicht, sie wandert auf eine Seite.
  const weltSeite = Math.max(
    WELT_GROESSE,
    Math.ceil(Math.max(x2 - weltUnter.x, y2 - weltUnter.y) + 2 * WELT_RAD + SAUM_LUFT)
  );
  let schliif = 0;
  if (schar && trennt) {
    schliif = trenne(punkte, schar, SCHLIFF_DURCHGAENGE, true);
  }
  if (diagnose) {
    diagnose.ticks = ticks;
    diagnose.alpha = alpha;
    diagnose.besuche = besuche;
    diagnose.welt = weltSeite;
    diagnose.nullpunkt = weltUnter;
    diagnose.ueberlaeufe = ueberlaeufe;
    diagnose.schliif = schliif;
    let wand = 0;
    for (const pt of punkte) if (pt.x <= x + 0.05 || pt.x >= x2 - 0.05 || pt.y <= y + 0.05 || pt.y >= y2 - 0.05) wand++;
    diagnose.anDerWand = wand;
  }

  const welt = new Map<string, Weltplatz>();
  for (const p of punkte) {
    if (p.pinned) {
      welt.set(p.id, { x: p.x, y: p.y, verankert: true });
      continue;
    }
    // Gemeldet wird auf eine Nachkommastelle — und die Rundung zeigt nach INNEN:
    // ein Platz darf durch die Meldung nicht weiter kommen als seine Reichweite.
    // Ohne das sind aus der erlaubten Wanderung von 28,3 Einheiten schnell 28,33
    // gemessene, und die Zusage "Bestehende wandern nur innerhalb WANDER_GRENZE"
    // waere eine Frage der letzten Nachkommastelle. 0,08 ist der halbe
    // Rundungsspielraum in zwei Achsen (0,05 * sqrt(2) = 0,0707).
    let x = p.x, y = p.y;
    if (Number.isFinite(p.radius)) {
      const dx = x - p.sx, dy = y - p.sy;
      const d = Math.hypot(dx, dy);
      const erlaubt = Math.max(0, p.radius - MELDE_PUFFER);
      if (d > erlaubt) {
        x = p.sx + (dx / d) * erlaubt;
        y = p.sy + (dy / d) * erlaubt;
      }
    }
    welt.set(p.id, { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, verankert: false });
  }
  return welt;
}
