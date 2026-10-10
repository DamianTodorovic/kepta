// Der Notiz-Graph des Kerns: Notizen als Knoten, [[Links]] als echte Kanten,
// gemessene Aehnlichkeit als vermutete Kanten.
//
// Gebaut wird aus einem Array, nicht aus dem Store: dieselbe Rechnung soll im
// Server-Pfad (/api/graph/bild?sicht=notiz), in der CLI-Statistik und in einem
// Test gegen synthetische Daten laufen. Der Store-Zugriff sitzt in graf-dienst.ts.
//
// Was hier frueher stand und nicht mehr gilt: eine Kantenstaerke, die fuer ein
// Paar erfunden wurde, das durch den Schwellwert fiel (0.3), ein 0.85 auf jedem
// [[Link]], Aehnlichkeit durch Math.min geteilt (ein Tag gegen acht gewann mit
// 1,0), und ein Begriff, der bei 61 Traeger-Notizen komplett verworfen wurde.
// Der Vertrag dazu: src/core/graf-vertrag.ts, die Begriffsrechnung: graf-terms.ts.
import type { KeptaStore } from "../core/store";
import type { MemoryType } from "../core/types";
import { cosineSimilarity } from "../core/embeddings";
import { indexierBegriffe, begriffsIndex, vektor, skalarprodukt, jaccard, type BegriffsIndex } from "../core/graf-terms";
import {
  KAPPE,
  type GrafKante,
  type GrafKnoten,
  type GrafKuerzung,
} from "../core/graf-vertrag";

const LINK_RE = /\[\[([^\[\]]{2,80})\]\]/g;

/** Bis zu so viele Begriffe reisen an einem Knoten mit — Anzeigefeld, keine Indexregel. */
export const MAX_KNOTEN_BEGRIFFE = 12;

/**
 * Ab hier wird eine Aehnlichkeit zur Kante. Die Schwelle sitzt an der Messung
 * (Jaccard/Cosinus), nicht mehr an den alten Multiplikatoren 0,9 und 0,6.
 */
export const SCHWELLWERT_AEHNLICH = 0.1;

// ---------------------------------------------------------------- Eingang

export interface NotizVektor {
  vektor: Float32Array;
  modell: string;
}

/** Eine Notiz, wie der Graph sie braucht. Kein Store, keine Queries. */
export interface NotizKnoten {
  id: string;
  titel: string;
  inhalt?: string;
  tags?: readonly string[];
  art?: string;
  /** Abschnitt-Vektoren; verglichen wird nur innerhalb desselben Modells. */
  vektoren?: readonly NotizVektor[];
  /** Privatheits-Floor: private Notizen erscheinen nicht, ihre Zahl aber schon. */
  privat?: boolean;
  /** Papierkorb: geloeschte Notizen erscheinen nicht, ihre Zahl aber schon. */
  geloescht?: boolean;
}

export interface NotizBildOptionen {
  knoten?: number;
  kanten?: number;
  paarPruefungen?: number;
  schwellwert?: number;
}

export interface NotizBild {
  knoten: GrafKnoten[];
  kanten: GrafKante[];
  kuerzung: GrafKuerzung;
  /** Der Bestand, aus dem dieses Bild gerechnet wurde (nach Floor, vor Kappen). */
  bestand: { knoten: number; kanten: number };
  /** [[Verweise]] insgesamt, auch auf Nicht-Knoten (Kontrollzahl wie bisher). */
  verweise: number;
}

interface KnotenRechnung {
  knoten: NotizKnoten;
  begriffe: string[];
  titelBegriffe: string[];
  tagBegriffe: string[];
  linkZiele: string[];
  /** Dieselben Mengen als Set: ein Paar wird pro Lauf mehrfach verglichen. */
  begriffSet: Set<string>;
  titelSet: Set<string>;
  tagSet: Set<string>;
}

const nachId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function kantenId(sorto: GrafKante["sorte"], a: string, b: string): string {
  const [min, max] = a < b ? [a, b] : [b, a];
  return `${sorto === "echt" ? "l" : "a"}-${min}|${max}`;
}

function begriffeDerNotiz(n: NotizKnoten): { alle: string[]; titel: string[]; tags: string[] } {
  const titel = indexierBegriffe(n.titel ?? "");
  const tags = indexierBegriffe((n.tags ?? []).join(" "));
  return { alle: [...new Set([...tags, ...titel])], titel, tags };
}

/**
 * Zerlegt den Inhalt in [[Links]]: Ziel-Titel, Teil vor "|", case-insensitive.
 * Zaehlt jeden Verweis — auch die ins Leere und die auf sich selbst.
 */
function linksAus(inhalt: string): string[] {
  if (!inhalt) return [];
  LINK_RE.lastIndex = 0;
  const ziele: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = LINK_RE.exec(inhalt))) {
    const ziel = m[1]!.split("|")[0]!.trim().toLowerCase();
    if (ziel) ziele.push(ziel);
  }
  return ziele;
}

function kuerzungLeeren(kappe: GrafKuerzung["kappe"]): GrafKuerzung {
  return {
    kappe,
    uebrig: { knoten: 0, kanten: 0, paare: 0, begriffe: 0 },
    grund: [],
    gefiltert: { privat: 0, papierkorb: 0 },
    verwaiste: { knoten: 0, kanten: 0 },
    vollstaendig: true,
  };
}

/** Hoechster Cosinus zweier Notizen — nur innerhalb desselben embedding_model. */
function vektorAehnlichkeit(a: NotizKnoten, b: NotizKnoten): number | null {
  const va = a.vektoren;
  const vb = b.vektoren;
  if (!va?.length || !vb?.length) return null;
  let beste: number | null = null;
  for (const x of va) {
    for (const y of vb) {
      if (x.modell !== y.modell) continue;
      const c = cosineSimilarity(x.vektor, y.vektor);
      if (beste === null || c > beste) beste = c;
    }
  }
  return beste;
}

// ---------------------------------------------------------------- Kanten

function echteZuKante(e: { quelle: string; ziel: string; belege: number; ziele: Set<string> }): GrafKante {
  return {
    id: kantenId("echt", e.quelle, e.ziel),
    quelle: e.quelle < e.ziel ? e.quelle : e.ziel,
    ziel: e.quelle < e.ziel ? e.ziel : e.quelle,
    sorte: "echt",
    // Ein [[Link]] ist gesetzt, nicht gemessen: keine Zahl, wo keine Messung sitzt.
    maess: { wert: null, basis: "verlinkt", gemessen: true },
    feder: e.belege / (e.belege + 1),
    belege: e.belege,
    erklaerung: { gemeinsame: [...e.ziele].sort().slice(0, 5), art: "titel" },
    validFrom: null,
    validTo: null,
  };
}

/**
 * Ein Kandidatenpaar, leicht gemessen: drei Kanaele, der staerkste gewinnt.
 * Die volle Kante (Begruendung, Feder, id) entsteht erst fuer die Paare, die im
 * Bild bleiben — bei 2 000 gezeigten Kanten aus 124 750 geprueften Paaren war
 * der Rest Buchhaltung, die der erste Aufruf bezahlt (gemessen: 140 ms Bildbau,
 * davon der groesste Teil Allokation).
 */
interface LichtKante {
  quelle: string;
  ziel: string;
  wert: number;
  basis: GrafKante["maess"]["basis"];
  art: GrafKante["erklaerung"]["art"];
  belege: number;
}

function paarMessung(a: KnotenRechnung, b: KnotenRechnung, schwellenwert: number): LichtKante | null {
  const tagWert = jaccard(a.tagSet, b.tagSet);
  const titelWert = jaccard(a.titelSet, b.titelSet);
  let wert = tagWert;
  let basis: GrafKante["maess"]["basis"] = "jaccard";
  let art: GrafKante["erklaerung"]["art"] = "tag";
  if (titelWert > wert) { wert = titelWert; art = "titel"; }
  const cosinusWert = vektorAehnlichkeit(a.knoten, b.knoten);
  if (cosinusWert !== null && cosinusWert > wert) { wert = cosinusWert; basis = "cosinus"; art = "vektor"; }
  if (wert < schwellenwert) return null;
  const [klein, gross] = a.begriffSet.size <= b.begriffSet.size ? [a.begriffSet, b.begriffSet] : [b.begriffSet, a.begriffSet];
  let belege = 0;
  for (const t of klein) if (gross.has(t)) belege++;
  const [min, max] = a.knoten.id < b.knoten.id ? [a.knoten.id, b.knoten.id] : [b.knoten.id, a.knoten.id];
  return { quelle: min, ziel: max, wert, basis, art, belege: Math.max(1, belege) };
}

/** Die volle Kante, gerechnet nur fuer die paar hundert, die tatsaechlich zeigen. */
function kanteAusMessung(
  k: LichtKante,
  byId: Map<string, KnotenRechnung>,
  vektoren: Map<string, Map<string, number>>
): GrafKante {
  const a = byId.get(k.quelle)!;
  const b = byId.get(k.ziel)!;
  const [klein, gross] = a.begriffSet.size <= b.begriffSet.size ? [a.begriffSet, b.begriffSet] : [b.begriffSet, a.begriffSet];
  const gemeinsame: string[] = [];
  for (const t of klein) if (gross.has(t)) gemeinsame.push(t);
  gemeinsame.sort();
  const idf = skalarprodukt(vektoren.get(k.quelle) ?? new Map(), vektoren.get(k.ziel) ?? new Map());
  return {
    id: kantenId("aehnlich", k.quelle, k.ziel),
    quelle: k.quelle,
    ziel: k.ziel,
    sorte: "aehnlich",
    maess: { wert: k.wert, basis: k.basis, gemessen: true },
    // `feder` ist der Hinweis ans Zeichnen und an die Physik: der IDF-gewichtete
    // Cosinus. Ausdruecklich keine Messgroesse — die steht in `maess.wert`.
    feder: Math.max(0, Math.min(1, idf)),
    belege: k.belege,
    erklaerung: { gemeinsame: k.art === "vektor" ? [] : gemeinsame.slice(0, 5), art: k.art },
    validFrom: null,
    validTo: null,
  };
}

/** Ordnung der Auswahl: Wert, dann Belege, dann id — der Vertrag sagt das so. */
function besser(a: LichtKante, b: LichtKante): boolean {
  if (a.wert !== b.wert) return a.wert > b.wert;
  if (a.belege !== b.belege) return a.belege > b.belege;
  return a.quelle + a.ziel < b.quelle + b.ziel;
}

/**
 * Gebundene Auswahl: die besten Kantenplaetze, als Haufen mit dem Schwoechsten oben.
 * Ein Kind, das verdraengt wird, ist sofort gezaehlt — der Vertrag verlangt fuer
 * jede Kappzahl einen Griff, der sie einloest (A9 §3.4), nicht eine Liste, die
 * erst voll staubt und dann wegwirft.
 */
class BestenAuswahl {
  private readonly heap: LichtKante[] = [];
  constructor(private readonly kapazitaet: number) {}
  get groesse(): number { return this.heap.length; }
  /** true, wenn das Paar aufgenommen wurde; der Verdraengte, falls einer ging. */
  biete(k: LichtKante): LichtKante | null {
    if (this.heap.length < this.kapazitaet) {
      this.heap.push(k);
      this.aufwaerts(this.heap.length - 1);
      return null;
    }
    if (this.kapazitaet === 0 || !besser(k, this.heap[0]!)) return k;
    const verdraengt = this.heap[0]!;
    this.heap[0] = k;
    this.abwaerts();
    return verdraengt;
  }
  /** Sortiert wie der Vertrag: staerkste zuerst. */
  ended(): LichtKante[] {
    const kopie = [...this.heap];
    kopie.sort((a, b) => (besser(a, b) ? -1 : besser(b, a) ? 1 : 0));
    return kopie;
  }
  private aufwaerts(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!besser(this.heap[p]!, this.heap[i]!)) break;
      [this.heap[p], this.heap[i]] = [this.heap[i]!, this.heap[p]!];
      i = p;
    }
  }
  private abwaerts(): void {
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      if (l >= this.heap.length) break;
      let k = l;
      if (r < this.heap.length && besser(this.heap[l]!, this.heap[r]!)) k = r;
      if (!besser(this.heap[i]!, this.heap[k]!)) break;
      [this.heap[i], this.heap[k]] = [this.heap[k]!, this.heap[i]!];
      i = k;
    }
  }
}

// ---------------------------------------------------------------- Builder

/**
 * Das Notiz-Bild. Reihenfolge: Ordnung nach id, Privatheits-Floor, echte Kanten
 * und Begriffsnormen ueber dem ganzen sichtbaren Bestand, dann die Knotenauswahl
 * nach Beweiskraft, dann die Aehnlichkeitspaare in gebundener Auswahl.
 *
 * Kein Begriff faellt mehr wegen seiner Hauefigkeit weg: seltene Begriffe werden
 * zuerst geprueft, jedes Paar hoechstens einmal, und was das Paar-Budget nicht
 * zu Ende fuehren konnte, steht in `uebrig.begriffe` mit dem Grund `paarBudget`.
 */
export function baueNotizBild(notizen: readonly NotizKnoten[], opts: NotizBildOptionen = {}): NotizBild {
  const kappe = {
    knoten: Math.min(2000, Math.max(1, Math.floor(opts.knoten ?? KAPPE.knoten))),
    kanten: Math.min(8000, Math.max(0, Math.floor(opts.kanten ?? KAPPE.kanten))),
    paarPruefungen: Math.max(0, Math.floor(opts.paarPruefungen ?? KAPPE.paarPruefungen)),
  };
  const schwellenwert = opts.schwellwert ?? SCHWELLWERT_AEHNLICH;
  const kuerzung = kuerzungLeeren(kappe);

  // 1) Ordnung und Floor — vor jeder Zahl, damit nichts Privates mitreisst.
  const sichtbar: KnotenRechnung[] = [];
  for (const n of [...notizen].sort(nachId)) {
    if (n.privat) { kuerzung.gefiltert.privat++; continue; }
    if (n.geloescht) { kuerzung.gefiltert.papierkorb++; continue; }
    const { alle, titel, tags } = begriffeDerNotiz(n);
    sichtbar.push({
      knoten: n,
      begriffe: alle,
      titelBegriffe: titel,
      tagBegriffe: tags,
      linkZiele: linksAus(n.inhalt ?? ""),
      begriffSet: new Set(alle),
      titelSet: new Set(titel),
      tagSet: new Set(tags),
    });
  }
  if (kuerzung.gefiltert.privat > 0) kuerzung.grund.push("privat");
  if (kuerzung.gefiltert.papierkorb > 0) kuerzung.grund.push("papierkorb");
  const byId = new Map(sichtbar.map((r) => [r.knoten.id, r]));
  const nachRechnungId = (a: KnotenRechnung, b: KnotenRechnung) => nachId(a.knoten, b.knoten);

  // 2) Titel aufloesen — ueber dem ganzen sichtbaren Bestand, nicht nur dem Fenster.
  const titelZuId = new Map<string, string>();
  for (const r of sichtbar) {
    const t = (r.knoten.titel ?? "").trim().toLowerCase();
    if (t && !titelZuId.has(t)) titelZuId.set(t, r.knoten.id);
  }

  // 3) Echte Kanten: [[Link]] auf den Titel einer anderen Notiz, Belege zaehlen.
  const stelle = new Map<string, number>();
  sichtbar.forEach((r, i) => stelle.set(r.knoten.id, i));
  const menge = sichtbar.length;
  const echte = new Map<number, { quelle: string; ziel: string; belege: number; ziele: Set<string> }>();
  const leereZiele = new Set<string>();
  let verweise = 0;
  for (const r of sichtbar) {
    verweise += r.linkZiele.length;
    const eigene = stelle.get(r.knoten.id)!;
    for (const zielTitel of r.linkZiele) {
      const ziel = titelZuId.get(zielTitel);
      if (!ziel) { leereZiele.add(zielTitel); continue; }
      if (ziel === r.knoten.id) continue;
      const andere = stelle.get(ziel)!;
      const schluessel = eigene < andere ? eigene * menge + andere : andere * menge + eigene;
      const fund = echte.get(schluessel);
      if (fund) { fund.belege++; fund.ziele.add(zielTitel); continue; }
      echte.set(schluessel, { quelle: r.knoten.id, ziel, belege: 1, ziele: new Set([zielTitel]) });
    }
  }
  kuerzung.verwaiste.knoten = leereZiele.size;

  // 4) Begriffsnormen ueber dem ganzen sichtbaren Bestand: df, g(t), duenne Vektoren.
  const index = begriffsIndex(sichtbar.map((r) => ({ id: r.knoten.id, begriffe: r.begriffe })));
  const vektoren = new Map<string, Map<string, number>>(
    sichtbar.map((r) => [r.knoten.id, vektor(r.begriffSet, index)])
  );

  // 5) Der Rang der Knoten: Beweiskraft der echten Belege zuerst, dann
  //    Begriffszahl, dann id. Die Aehnlichkeitsgrade zaehlen hier nicht mehr
  //    mit — sie werden gebunden ausgewaehlt, nicht voll gesammelt, und eine
  //    Auswahl, die von ihrem eigenen Budget abhaengte, waere keine Zusage.
  const echtGrad = new Map<string, number>();
  for (const e of echte.values()) {
    echtGrad.set(e.quelle, (echtGrad.get(e.quelle) ?? 0) + e.belege);
    echtGrad.set(e.ziel, (echtGrad.get(e.ziel) ?? 0) + e.belege);
  }
  const rang = [...sichtbar].sort(
    (a, b) =>
      (echtGrad.get(b.knoten.id) ?? 0) - (echtGrad.get(a.knoten.id) ?? 0) ||
      b.begriffe.length - a.begriffe.length ||
      nachRechnungId(a, b)
  );
  const fenster = rang.slice(0, kappe.knoten).sort(nachRechnungId);
  kuerzung.uebrig.knoten = rang.length - fenster.length;
  if (kuerzung.uebrig.knoten > 0) kuerzung.grund.push("knoten");
  const imFenster = new Set(fenster.map((r) => r.knoten.id));

  // 6) Echte Kanten im Fenster ueberleben jede Kuerzung; was draussen liegt, ist
  //    gemeldete Differenz und ein versteckter Nachbar des Endes, das im Bild ist.
  const alleEchten = [...echte.values()].map(echteZuKante).sort(nachId);
  const echteImFenster = alleEchten.filter((k) => imFenster.has(k.quelle) && imFenster.has(k.ziel));
  const versteckteNachbarn = new Map<string, number>();
  const verberge = (id: string): void => {
    if (imFenster.has(id)) versteckteNachbarn.set(id, (versteckteNachbarn.get(id) ?? 0) + 1);
  };
  for (const k of alleEchten) {
    if (imFenster.has(k.quelle) && imFenster.has(k.ziel)) continue;
    verberge(k.quelle);
    verberge(k.ziel);
  }

  // 7) Kandidatenpaare: Kuebel nach g(t) absteigend (seltene zuerst), das Budget
  //    begrenzt die Arbeit — nicht die Hauefigkeit eines Begriffs.
  const kuebel = new Map<string, number[]>();
  sichtbar.forEach((r, i) => {
    for (const t of r.begriffe) {
      const liste = kuebel.get(t);
      if (liste) liste.push(i); else kuebel.set(t, [i]);
    }
  });
  const geordnet = [...kuebel.entries()]
    .filter(([, stellen]) => stellen.length >= 2)
    .map(([begriff, stellen]) => ({ begriff, stellen, gewicht: index.gewicht.get(begriff) ?? 0 }))
    .sort((a, b) => b.gewicht - a.gewicht || (a.begriff < b.begriff ? -1 : a.begriff > b.begriff ? 1 : 0));

  const platz = Math.max(0, kappe.kanten - echteImFenster.length);
  const besten = new BestenAuswahl(platz);
  const bewertet = new Set<number>();
  let pruefungen = 0;
  let kandidatenGezaehlt = 0;
  let budgetErschoepft = false;
  for (const { stellen } of geordnet) {
    if (budgetErschoepft) { kuerzung.uebrig.begriffe++; continue; }
    for (let i = 0; i < stellen.length && !budgetErschoepft; i++) {
      for (let j = i + 1; j < stellen.length; j++) {
        const a = stellen[i]!, b = stellen[j]!;
        const schluessel = a * menge + b;
        if (bewertet.has(schluessel)) continue;
        bewertet.add(schluessel);
        // Ein echtes Paar braucht keine Aehnlichkeitsrechnung und kein Budget.
        if (echte.has(schluessel)) continue;
        if (pruefungen >= kappe.paarPruefungen) {
          budgetErschoepft = true;
          kuerzung.uebrig.begriffe++;
          break;
        }
        pruefungen++;
        const links = byId.get(sichtbar[a]!.knoten.id)!;
        const rechts = byId.get(sichtbar[b]!.knoten.id)!;
        const messung = paarMessung(links, rechts, schwellenwert);
        if (!messung) { kuerzung.uebrig.paare++; continue; }
        kandidatenGezaehlt++;
        if (!imFenster.has(messung.quelle) || !imFenster.has(messung.ziel)) {
          verberge(messung.quelle);
          verberge(messung.ziel);
          continue;
        }
        const verdraengt = besten.biete(messung);
        if (verdraengt) {
          verberge(verdraengt.quelle);
          verberge(verdraengt.ziel);
        }
      }
    }
  }
  if (budgetErschoepft) kuerzung.grund.push("paarBudget");

  // 8) Kantenkappe: echte ueberleben, Aehnlichkeiten nach Wert, Belegen, id.
  const vermuteten = besten.ended().map((k) => kanteAusMessung(k, byId, vektoren));
  const gezeigte = [...echteImFenster, ...vermuteten].sort(nachId);
  // Gebaut minus gemalt — dieselbe Identitaet, die der Vertrag verlangt.
  kuerzung.uebrig.kanten = alleEchten.length + kandidatenGezaehlt - gezeigte.length;
  if (kuerzung.uebrig.kanten > 0) kuerzung.grund.push("kanten");

  // 9) Grade — aus dem, was wirklich im Bild steht.
  const gradEcht = new Map<string, number>();
  const gradVermutet = new Map<string, number>();
  for (const k of gezeigte) {
    if (k.sorte === "echt") {
      gradEcht.set(k.quelle, (gradEcht.get(k.quelle) ?? 0) + k.belege);
      gradEcht.set(k.ziel, (gradEcht.get(k.ziel) ?? 0) + k.belege);
    } else {
      gradVermutet.set(k.quelle, (gradVermutet.get(k.quelle) ?? 0) + 1);
      gradVermutet.set(k.ziel, (gradVermutet.get(k.ziel) ?? 0) + 1);
    }
  }
  const knoten: GrafKnoten[] = fenster.map((r) => {
    const begriffe = [...r.begriffe]
      .sort((a, b) => (index.gewicht.get(b) ?? 0) - (index.gewicht.get(a) ?? 0) || (a < b ? -1 : 1))
      .slice(0, MAX_KNOTEN_BEGRIFFE);
    return {
      id: r.knoten.id,
      titel: r.knoten.titel ?? "",
      art: r.knoten.art ?? "semantic",
      gradEcht: gradEcht.get(r.knoten.id) ?? 0,
      gradVermutet: gradVermutet.get(r.knoten.id) ?? 0,
      versteckteNachbarn: versteckteNachbarn.get(r.knoten.id) ?? 0,
      begriffe,
    };
  });

  // 10) Bilanz schliessen. `vollstaendig` heisst nach Vertrag: uebrig ist leer.
  kuerzung.vollstaendig =
    kuerzung.uebrig.knoten === 0 &&
    kuerzung.uebrig.kanten === 0 &&
    kuerzung.uebrig.paare === 0 &&
    kuerzung.uebrig.begriffe === 0;

  return {
    knoten,
    kanten: gezeigte,
    kuerzung,
    bestand: { knoten: sichtbar.length, kanten: alleEchten.length + kandidatenGezaehlt },
    verweise,
  };
}

// ---------------------------------------------------------------- Legacy-Projektion

export interface GraphKnoten {
  id: string;
  titel: string;
  type: MemoryType;
  /** Beweis und Vermutung in einer Zahl — das alte Feld, nur fuer CLI und Demo. */
  grad: number;
}

export interface GraphKante {
  quelle: string;
  ziel: string;
  /** true = [[Link]] (durchzogen); false = Aehnlichkeit (gestrichelt). */
  real: boolean;
  /** 0..1 Layout-Hinweis. Die Messgroesse liegt im Vertrag an `maess.wert`. */
  staerke: number;
}

export interface GraphDaten {
  nodes: GraphKnoten[];
  edges: GraphKante[];
  verweise: number;
}

/**
 * Abwaertskompatible Projektion fuer CLI-Statistik und Demo: dasselbe Bild, die
 * alten Feldnamen, dieselbe Fenster-Kappe. Nur die Zahlen an den Kanten sind
 * keine Erfuellungsgroessen mehr.
 */
export function baueGraph(store: KeptaStore, maxKnoten = 400): GraphDaten {
  const notizen = store
    .listMemories({ limit: maxKnoten })
    .map((n) => ({ id: n.id, titel: n.title, inhalt: n.content, tags: n.tags, art: n.type as string }));
  const bild = baueNotizBild(notizen, {
    knoten: maxKnoten,
    kanten: Math.min(12_000, Math.max(1200, maxKnoten * 6)),
  });
  return {
    nodes: bild.knoten.map((k) => ({
      id: k.id,
      titel: k.titel,
      type: k.art as MemoryType,
      grad: k.gradEcht + k.gradVermutet,
    })),
    edges: bild.kanten.map((k) => ({ quelle: k.quelle, ziel: k.ziel, real: k.sorte === "echt", staerke: k.feder })),
    verweise: bild.verweise,
  };
}
