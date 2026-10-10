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
const ALPHA_ENDE = 0.005;
/** Abbruch, wenn kein Knoten sich noch so weit bewegt. */
// 1,0 Welteinheit: die Feder bei mittlerer Dehnung (500 Knoten: 170 gegen
// Ruhe-Laenge 110) wirkt mit ~0,9 Einheiten pro Tick — bei 0,5 als Schwelle
// ruht das Netz nie und zahlt immer den vollen Ticks-Budget.
const BEWEGUNG_ENDE = 1;
// Obergrenze, gemessen an der Lesbarkeit (median echte Kante / median
// Kontrollpaar): 0,562 bei 140 gegen 0,505 bei 210 Ticks — 24 % weniger Zeit
// fuer 11 % weniger Dehnung, und die Randklemmung sinkt mit.
const TICKS_MAX = 140;
const BAUM_MAX_TIEFE = 26;

export interface KraftKnoten {
  id: string;
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

// ---------------------------------------------------------------- Relaxation

const rnd = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Ein Weltbild aus Bestand und Anker: gleiche Eingabe, gleiches Ergebnis —
 * unabhaengig davon, in welcher Reihenfolge die Listen ankamen.
 */
export interface WeltDiagnose { ticks: number; alpha: number; besuche: number }

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
    const start = alt ?? startPlatz(k.id);
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
    };
  });
  const byId = new Map(punkte.map((p) => [p.id, p]));
  const paare = kanten
    .map((k) => [byId.get(k.quelle), byId.get(k.ziel), k] as const)
    .filter((p): p is [Punkt, Punkt, KraftKante] => p[0] !== undefined && p[1] !== undefined);

  const ticksMax = Math.max(1, Math.floor(eingang.ticksMax ?? TICKS_MAX));
  const theta = eingang.theta ?? THETA;
  const min = WELT_RAD;
  const max = WELT_GROESSE - WELT_RAD;
  const kraft = { fx: 0, fy: 0 };

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
      if (Number.isFinite(p.radius)) {
        const wx = nx - p.sx, wy = ny - p.sy;
        const abst = Math.hypot(wx, wy);
        if (abst > p.radius) {
          nx = p.sx + (wx / abst) * p.radius;
          ny = p.sy + (wy / abst) * p.radius;
        }
      }
      nx = Math.max(min, Math.min(max, nx));
      ny = Math.max(min, Math.min(max, ny));
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
    alpha *= ALPHA_VERFALL;
    if (alpha < ALPHA_ENDE || spannung < BEWEGUNG_ENDE) break;
  }
  if (diagnose) { diagnose.ticks = ticks; diagnose.alpha = alpha; diagnose.besuche = besuche; }

  const welt = new Map<string, Weltplatz>();
  for (const p of punkte) {
    welt.set(p.id, {
      x: p.pinned ? p.x : Math.round(p.x * 10) / 10,
      y: p.pinned ? p.y : Math.round(p.y * 10) / 10,
      verankert: p.pinned,
    });
  }
  return welt;
}
