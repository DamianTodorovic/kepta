// Die semantische Karte: die dritte Ansicht des Graphen.
//
// Das Kraftfeld ordnet nach dem, was jemand BEHAUPTET hat, der Baum nach der
// Hierarchie der Arten und Begriffe. Beide zeigen Verknüpfungen. Die
// semantische Ansicht zeigt dagegen, was die Texte selbst bedeuten: jede Notiz
// steht dort, wohin ihr Vektor zeigt, und zwei Notizen, die dasselbe meinen,
// stehen beieinander — auch wenn niemand sie je verbunden hat.
//
// Drei Verträge, ohne die diese Ansicht schlechter wäre als das, was sie
// ersetzt:
//
//   1. DETERMINISTISCH. Dieselbe Wissensbasis ergibt dieselben Koordinaten,
//      bei jedem Aufruf und in jeder Lieferreihenfolge. Kein Zufallsstart,
//      keine Physik, die sich zwischen zwei Bildern einschleicht: eine Karte,
//      die bei jedem Öffnen anders liegt, ist kein Ort, an dem man etwas
//      wiederfindet.
//   2. GEKAPPT UND LAUT. Höchstens SEMANTIK_KAPPE Vektoren kommen in die
//      Rechnung; was draußen bleibt, zählt die Karte mit, damit die Fläche es
//      sagen kann.
//   3. EINE PROJEKTION IST EINE VERRINGERUNG. `anteil` nennt, wie viel von den
//      Unterschieden die zwei Achsen wirklich tragen. Wer 768 Richtungen auf
//      zwei plättet und das verschweigt, verkauft ein Bild für die Wahrheit.

/** So viele Vektoren kommen höchstens in die Rechnung. */
export const SEMANTIK_KAPPE = 2000;
/**
 * Die Ausdehnung der Karte pro √n, in Welteinheiten — derselben Einheit, in der
 * das Kraftfeld seine Knoten legt.
 *
 * Die Karte wächst mit der Wurzel der Zahl, nicht in festen Grenzen: eine Welt
 * fester Größe macht jede Karte kleiner, je mehr Notizen hineinpassen. Gemessen
 * im echten Browser mit zwölf Notizen — da waren die Scheiben Punktemale bei
 * 38 % Zoom und kein Etikett mehr lesbar. Bei konstanter Dichte bleibt die
 * Karte so groß, wie ihr Inhalt sie braucht, und einpasst sie die Fläche
 * ohnehin auf ihren Rahmen.
 */
export const SEMANTIK_ABSTAND = 90;
/** Runden der Potenziteration. Genug für 768 Dimensionen, billig für kleine. */
const RUNDEN = 60;

/** Ein Vektor aus dem Bestand: eine Notiz, ein Abschnitt, ein Modell. */
export interface SemantikRohling {
  id: string;
  vektor: Float32Array | readonly number[];
  modell: string;
}

export interface SemantikPunkt {
  id: string;
  x: number;
  y: number;
}

export interface SemantikKarte {
  punkte: SemantikPunkt[];
  /**
   * Der Vektorraum, aus dem die Karte gebaut ist. Zwei Modelle sind zwei
   * Maßstäbe — ihre Vektoren zu mischen ergäbe eine Wolke, die nichts meint.
   */
  modell: string | null;
  /** Wie viele Notizen in der Karte stehen. */
  getragen: number;
  /** Wie viele Notizen der Bestand überhaupt mit einem Vektor trägt. */
  gesamt: number;
  /** Wie viele Notizen der Kappung zum Opfer fielen. */
  gekappt: number;
  /** Anteil der Unterschiede auf den zwei Achsen: [erste, zweite]. */
  anteil: readonly [number, number];
}

/** Ein Platz im Feld, in Welteinheiten. */
export interface SemantikZiel {
  x: number;
  y: number;
}

export interface SemantikFeld {
  /** Jeder Knoten hat einen Platz — auch der ohne Vektor. */
  ziele: Map<string, SemantikZiel>;
  /** Wie viele Notizen keinen Vektor tragen und deshalb am Rand parken. */
  ohneVektor: number;
  /** Radius des Randkreises, auf dem die Unvermessenen stehen. */
  rand: number;
}

/**
 * Deterministischer Startvektor der Potenziteration.
 *
 * Ein Zufallsvektor würde die Achse bei jedem Lauf ein wenig anders drehen.
 * Dieser hier ist eine reine Funktion von Dimension und Achse — FNV-artig, in
 * 32-Bit-Rechnung, also auf jeder Maschine bitgleich.
 */
function keim(d: number, achse: number): Float64Array {
  const v = new Float64Array(d);
  for (let i = 0; i < d; i++) {
    let h = Math.imul(i + 1, 2166136261) ^ Math.imul(achse + 1, 40503);
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    v[i] = ((h >>> 0) % 100000) / 50000 - 1;
  }
  return v;
}

function normiere(v: Float64Array): Float64Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n);
  if (!(n > 0)) return v;
  const out = new Float64Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

function skalar(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * Die stärkste Richtung einer Punktwolke, per Potenziteration über Xᵀ·X.
 *
 * `lambda` ist der zugehörige Eigenwert — bei zentrierten Zeilen also die
 * Summe der quadrierten Projektionen, und damit der Anteil der Unterschiede,
 * den diese Achse trägt.
 */
function hauptachse(zeilen: readonly Float64Array[], d: number, start: Float64Array): { v: Float64Array; lambda: number } {
  let v = normiere(start);
  let lambda = 0;
  for (let runde = 0; runde < RUNDEN; runde++) {
    const w = new Float64Array(d);
    for (const z of zeilen) {
      const s = skalar(z, v);
      if (s === 0) continue;
      for (let i = 0; i < d; i++) w[i] += s * z[i];
    }
    let norm = 0;
    for (let i = 0; i < d; i++) norm += w[i] * w[i];
    norm = Math.sqrt(norm);
    if (!(norm > 0)) return { v, lambda: 0 };
    const neu = new Float64Array(d);
    for (let i = 0; i < d; i++) neu[i] = w[i] / norm;
    const aenderung = Math.abs(norm - lambda);
    v = neu;
    lambda = norm;
    if (runde > 0 && aenderung < 1e-12 * Math.max(1, lambda)) break;
  }
  return { v, lambda };
}

/**
 * Eine Achse hat kein Vorzeichen an sich: v und −v sind dieselbe Richtung.
 * Festgelegt wird es am weitesten Ausschlag, damit dieselben Daten immer in
 * dieselbe Hälfte der Karte fallen.
 */
function vorzeichen(werte: readonly number[]): number {
  let weitester = 0;
  for (const w of werte) if (Math.abs(w) > Math.abs(weitester)) weitester = w;
  return weitester < 0 ? -1 : 1;
}

/** −0 ist ein eigener Wert in einem Vergleich auf Gleichheit — und sagt nichts. */
function sauber(z: number): number {
  if (!Number.isFinite(z)) return 0;
  return z === 0 ? 0 : z;
}

function anteilVon(lambda: number, gesamtVarianz: number): number {
  if (!(gesamtVarianz > 0) || !Number.isFinite(lambda)) return 0;
  return Math.max(0, Math.min(1, lambda / gesamtVarianz));
}

/**
 * Baut die Karte aus den Vektoren des Bestands.
 *
 * Die Reihenfolge der Eingabe spielt keine Rolle: gewählt wird der Vektorraum
 * mit den meisten Notizen (bei Gleichstand der dem Namen nach erste), und
 * innerhalb des Raums wird nach Notiz-Id sortiert, bevor gerechnet wird. Zwei
 * Läufe über denselben Bestand sind damit bitgleich.
 */
export function semantikKarte(rohlinge: readonly SemantikRohling[], kappe: number = SEMANTIK_KAPPE): SemantikKarte {
  const leer: SemantikKarte = { punkte: [], modell: null, getragen: 0, gesamt: 0, gekappt: 0, anteil: [0, 0] };

  // Ein Vektor gehört zu einem RAUM: Modell und Länge. Beides muss stimmen,
  // sonst ist das Skalarprodukt eine Zahl ohne Bedeutung.
  const raeume = new Map<string, { modell: string; d: number; summen: Map<string, Float64Array>; anzahl: Map<string, number> }>();
  const getragenIds = new Set<string>();

  for (const r of rohlinge) {
    const d = r.vektor.length;
    if (d === 0) continue;
    getragenIds.add(r.id);
    const schluessel = `${r.modell}|${d}`;
    let raum = raeume.get(schluessel);
    if (!raum) {
      raum = { modell: r.modell, d, summen: new Map(), anzahl: new Map() };
      raeume.set(schluessel, raum);
    }
    let summe = raum.summen.get(r.id);
    if (!summe) {
      summe = new Float64Array(d);
      raum.summen.set(r.id, summe);
      raum.anzahl.set(r.id, 0);
    }
    for (let i = 0; i < d; i++) summe[i] += r.vektor[i];
    raum.anzahl.set(r.id, raum.anzahl.get(r.id)! + 1);
  }

  const gesamt = getragenIds.size;
  let raum: { modell: string; d: number; summen: Map<string, Float64Array>; anzahl: Map<string, number> } | null = null;
  for (const kandidat of raeume.values()) {
    if (!raum) { raum = kandidat; continue; }
    if (kandidat.summen.size > raum.summen.size || (kandidat.summen.size === raum.summen.size && kandidat.modell < raum.modell)) {
      raum = kandidat;
    }
  }
  if (!raum) return { ...leer, gesamt };

  const { d, summen, anzahl, modell } = raum;
  // Kanonische Reihenfolge — der einzige Grund, warum dieselbe Wissensbasis
  // zweimal dieselbe Karte ergibt, obwohl die Lieferung aus einer Datenbank
  // kommt, die keine Ordnung verspricht.
  const ids = [...summen.keys()].sort();
  const behalten = ids.slice(0, Math.max(0, kappe));
  const gekappt = ids.length - behalten.length;
  if (behalten.length === 0) return { ...leer, modell, gesamt, gekappt };

  // Schwerpunkt je Notiz: eine Notiz liegt in Abschnitten vor, und die Karte
  // meint Notizen, nicht Abschnitte.
  const zeilen = behalten.map((id) => {
    const summe = summen.get(id)!;
    const n = anzahl.get(id) || 1;
    const mittel = new Float64Array(d);
    for (let i = 0; i < d; i++) mittel[i] = summe[i] / n;
    return mittel;
  });

  if (behalten.length === 1) {
    // Eine einzelne Notiz hat nichts, wovon sie sich unterscheidet: keine
    // Richtung, keine Achse. Sie steht im Ursprung, und die Fläche sagt, dass
    // die Karte erst ab zwei Notizen etwas meint.
    return { punkte: [{ id: behalten[0]!, x: 0, y: 0 }], modell, getragen: 1, gesamt, gekappt, anteil: [0, 0] };
  }

  const mittel = new Float64Array(d);
  for (const z of zeilen) for (let i = 0; i < d; i++) mittel[i] += z[i];
  for (let i = 0; i < d; i++) mittel[i] /= zeilen.length;

  const zentriert = zeilen.map((z) => {
    const c = new Float64Array(d);
    for (let i = 0; i < d; i++) c[i] = z[i] - mittel[i];
    return c;
  });

  let gesamtVarianz = 0;
  for (const c of zentriert) gesamtVarianz += skalar(c, c);

  const eins = hauptachse(zentriert, d, keim(d, 0));
  // Die zweite Achse steht senkrecht auf der ersten: was die erste erklärt,
  // wird abgezogen, der Rest ist die nächste Richtung.
  const entladen = zentriert.map((c) => {
    const s = skalar(c, eins.v);
    const rest = new Float64Array(d);
    for (let i = 0; i < d; i++) rest[i] = c[i] - s * eins.v[i];
    return rest;
  });
  const zwei = hauptachse(entladen, d, keim(d, 1));

  const rohX = zentriert.map((c) => skalar(c, eins.v));
  const rohY = zentriert.map((c) => skalar(c, zwei.v));
  const sx = vorzeichen(rohX);
  const sy = vorzeichen(rohY);

  // Die Ausdehnung folgt der Wurzel der Zahl, das Seitenverhältnis bleibt, wie
  // es ist. Ohne Maßstab wäre jede Karte so groß wie ihr Zufall.
  let weit = 0;
  for (let i = 0; i < rohX.length; i++) weit = Math.max(weit, Math.abs(rohX[i]!), Math.abs(rohY[i]!));
  const skala = weit > 0 ? (SEMANTIK_ABSTAND * Math.sqrt(behalten.length)) / weit : 1;

  const punkte = behalten.map((id, i) => ({
    id,
    x: sauber(rohX[i]! * sx * skala),
    y: sauber(rohY[i]! * sy * skala),
  }));

  return {
    punkte,
    modell,
    getragen: behalten.length,
    gesamt,
    gekappt,
    anteil: [anteilVon(eins.lambda, gesamtVarianz), anteilVon(zwei.lambda, gesamtVarianz)],
  };
}

/**
 * Verteilt die Knoten des Graphen auf die Karte.
 *
 * Notizen ohne Vektor fallen dabei NICHT aus dem Bild — sie parken auf einem
 * Randkreis außerhalb der Karte, gleichmäßig verteilt und in fester
 * Reihenfolge. Eine Ansicht, die junge Notizen verschluckt, bis Ollama sie
 * erreicht hat, wäre ein stiller Verlust; so stehen sie sichtbar daneben, und
 * die Fläche zählt sie.
 *
 * Begriffe haben keinen eigenen Vektor. Sie stehen im Schwerpunkt dessen, was
 * sie tragen — und zwar vorzugsweise im Schwerpunkt der VERMESSENEN Notizen,
 * sonst zieht der Randkreis jeden Begriff nach außen, der zufällig eine junge
 * Notiz hat.
 */
export function layoutSemantik(
  karte: { punkte: readonly SemantikPunkt[] },
  notizen: readonly string[],
  konzepte: readonly { id: string; notizen: readonly string[] }[]
): SemantikFeld {
  const punkte = new Map<string, SemantikZiel>();
  let weit = 0;
  for (const p of karte.punkte) {
    punkte.set(p.id, { x: p.x, y: p.y });
    weit = Math.max(weit, Math.abs(p.x), Math.abs(p.y));
  }
  const rand = weit * 1.3 + 60;

  const ziele = new Map<string, SemantikZiel>();
  const ohne = notizen.filter((id) => !punkte.has(id)).slice().sort();
  ohne.forEach((id, i) => {
    // Oben anfangen, im Uhrzeigersinn: dieselbe Liste ergibt denselben Kreis.
    const winkel = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, ohne.length);
    ziele.set(id, { x: sauber(Math.cos(winkel) * rand), y: sauber(Math.sin(winkel) * rand) });
  });
  for (const id of notizen) {
    const p = punkte.get(id);
    if (p) ziele.set(id, { x: p.x, y: p.y });
  }

  for (const k of konzepte) {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const nid of k.notizen) {
      const p = punkte.get(nid);
      if (!p) continue;
      sx += p.x;
      sy += p.y;
      n += 1;
    }
    if (n === 0) {
      for (const nid of k.notizen) {
        const p = ziele.get(nid);
        if (!p) continue;
        sx += p.x;
        sy += p.y;
        n += 1;
      }
    }
    ziele.set(k.id, n > 0 ? { x: sauber(sx / n), y: sauber(sy / n) } : { x: 0, y: 0 });
  }

  return { ziele, ohneVektor: ohne.length, rand };
}
