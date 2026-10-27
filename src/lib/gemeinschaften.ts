/**
 * Punkt 117 — Community-Ebene. Der Marktbericht (MARKT-GRAPH-2710.md) fuehrt sechs
 * Luecken; nachgerechnet fallen fuenf, uebrig bleibt die eine: Haufen, die niemand
 * vordefiniert hat. Massstab ist Microsoft GraphRAG (Leiden-Communitys mit einer
 * Summary je Haufen). Hier der Rechenkern — ohne Fremdpaket, ohne Wuerfel:
 * dieselbe Eingabe ergibt dieselbe Zuordnung, in jeder Runde, auf jeder Maschine.
 *
 * Verfahren ist Louvain (Modularitaet, zwei Phasen, niveaustufenweise wiederholt),
 * bewusst nicht Leiden. Leiden ist eine Korrektur an Louvains zerfallenen Haufen;
 * ob uns die betrifft, ist eine Messung am Bestand, keine Annahme. Ein Text, der
 * "Leiden" schriebe, waehrend hier Louvain rechnet, ist eine Behauptung.
 */

export interface Gemeinschaftskante {
  a: string;
  b: string;
  /** Wie fest die Behauptung steht. Fehlend, leer oder null = 1, wie an der Linie. */
  gewicht?: number;
}

export interface Gemeinschaft {
  /** Fortlaufende Nummer im Ergebnis; 0 ist der groesste Haufen. */
  nr: number;
  groesse: number;
  /** Die Kennungen des Haufens, in der Reihenfolge des Eingabe-Bestands. */
  mitglieder: string[];
}

export interface GemeinschaftenErgebnis {
  /** Jede Kennung des Bestands, auch die ohne jede Kante. */
  zuordnung: Map<string, number>;
  gemeinschaften: Gemeinschaft[];
  /** Modularitaet Q des Endschnitts, gegen den urspruenglichen Bestand gerechnet. */
  modulvar: number;
  /** Wie viele Niveaus zusammengefasst wurden, ehe nichts mehr zog. */
  stufen: number;
}

interface Netz {
  n: number;
  /** Nachbarn je Knoten, flach als Paar (index, gewicht). Keine Schlinge. */
  stern: number[][];
  deg: Float64Array;
  /** Summe der Kantengewichte, jede Kante einmal. */
  summe: number;
}

/** Hochstens so viele Niveaus. Ein Bestand, der darueber hinaus zieht, ist kein Wissen. */
const MAX_STUFEN = 12;

/** Hochstens so viele Sweeps je Niveau. Ein Rumpf schmilzt in wenigen zusammen, die Kappe sichert gegen Ausreisser. */
const MAX_SWEEPS = 200;

/**
 * Die Kennungen in fester Reihenfolge: erst der eingegebene Bestand, dann Enden,
 * die eine Kante mitbringt und die Liste nicht nannte. Der Index in dieser Liste
 * ist die Stelle, nach der ueberall aufgeraeumt wird — Ordnung ist angesagt,
 * nicht Einfuegschritt.
 */
function kennungen(knoten: readonly string[], kanten: readonly Gemeinschaftskante[]): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const id of knoten) {
    if (typeof id === "string" && !seen.has(id)) {
      seen.add(id);
      list.push(id);
    }
  }
  for (const k of kanten) {
    if (!k) continue;
    for (const id of [k.a, k.b]) {
      if (typeof id === "string" && !seen.has(id)) {
        seen.add(id);
        list.push(id);
      }
    }
  }
  return list;
}

function gewichtOderEins(w: number | undefined): number {
  return typeof w === "number" && Number.isFinite(w) && w > 0 ? w : 1;
}

function netzBaue(ids: readonly string[], kanten: readonly Gemeinschaftskante[]): Netz {
  const basis = ids.length;
  const index = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 1) index.set(ids[i], i);
  const stern: number[][] = Array.from({ length: Math.max(basis, 1) }, () => []);
  // Paare zusammenfassen: dieselbe Behauptung zweimal ist eine dicke Linie, keine zwei.
  const paar = new Map<number, number>();
  for (const k of kanten) {
    if (!k || typeof k.a !== "string" || typeof k.b !== "string") continue;
    if (k.a === k.b) continue; // Selbstbehaupten ist kein Nachbar
    const i = index.get(k.a);
    const j = index.get(k.b);
    if (i === undefined || j === undefined) continue;
    const schluessel = i < j ? i * basis + j : j * basis + i;
    paar.set(schluessel, (paar.get(schluessel) ?? 0) + gewichtOderEins(k.gewicht));
  }
  let summe = 0;
  for (const [schluessel, w] of paar) {
    const i = Math.floor(schluessel / basis);
    const j = schluessel % basis;
    stern[i].push(j, w);
    stern[j].push(i, w);
    summe += w;
  }
  const deg = new Float64Array(basis);
  for (let i = 0; i < basis; i += 1) {
    let d = 0;
    for (let p = 0; p < stern[i].length; p += 2) d += stern[i][p + 1];
    deg[i] = d;
  }
  return { n: basis, stern, deg, summe };
}

/**
 * Ein Niveau, erste Phase: jeder Knoten zieht in die nachste Umgebung, die ihm
 * mehr bringt als sie ihm kostet. Kein Zug um null — ein Zug, der nichts aendert,
 * aendert die Folge und damit die Wiederholbarkeit.
 */
function schiebeNetz(netz: Netz): { schnitt: Int32Array; zog: boolean } {
  const { n, stern, deg, summe } = netz;
  const zweiM = 2 * summe;
  const schnitt = Int32Array.from({ length: n }, (_, i) => i);
  if (zweiM <= 0) return { schnitt, zog: false };
  const sigma = Float64Array.from(deg);
  let zog = false;

  for (let sweep = 0; sweep < MAX_SWEEPS; sweep += 1) {
    let bewegte = 0;
    for (let i = 0; i < n; i += 1) {
      const eig = schnitt[i];
      const nachbarGewicht = new Map<number, number>();
      for (let p = 0; p < stern[i].length; p += 2) {
        const c = schnitt[stern[i][p]];
        nachbarGewicht.set(c, (nachbarGewicht.get(c) ?? 0) + stern[i][p + 1]);
      }
      sigma[eig] -= deg[i];
      // Bleiben ist eine Option mit eigner Rechnung, nicht die Null. Ohne sie
      // zieht ein Knoten zwischen zwei gleich dichten Nachbarn auf Lebenszeit
      // hin und her: jeder Zug bringt etwas gegen null, keiner bringt Ruhe.
      const bleiben = (nachbarGewicht.get(eig) ?? 0) - (deg[i] * sigma[eig]) / zweiM;
      let beste = bleiben;
      let besteC = eig;
      nachbarGewicht.forEach((kante, c) => {
        if (c === eig) return;
        const gewinn = kante - (deg[i] * sigma[c]) / zweiM;
        if (gewinn > beste + 1e-12) {
          // Ein Zug braucht einen echten Vorteil: die Reihenfolge, in der die Map
          // ihre Schluessel traegt, darf nicht ueber das Ergebnis entscheiden.
          beste = gewinn;
          besteC = c;
        }
      });
      if (besteC !== eig) {
        schnitt[i] = besteC;
        sigma[besteC] += deg[i];
        bewegte += 1;
        zog = true;
      } else {
        sigma[eig] += deg[i];
      }
    }
    if (bewegte === 0) break;
  }
  return { schnitt, zog };
}

/**
 * Ein Niveau, zweite Phase: jeder Haufen wird ein Knoten des naechsten. Was innen
 * lag, wird die eigne Last des neuen Knotens und faellt in `deg` mit ein — sonst
 * verliert der Haufen beim Abstieg seinen inneren Halt und zerfaellt.
 */
function zusammenfassen(netz: Netz, schnitt: Int32Array): { netz: Netz; super: Int32Array } {
  const { n, stern } = netz;
  const nummern: number[] = [];
  const neu = new Map<number, number>();
  for (let i = 0; i < n; i += 1) {
    if (!neu.has(schnitt[i])) {
      neu.set(schnitt[i], nummern.length);
      nummern.push(schnitt[i]);
    }
  }
  const superNode = new Int32Array(n);
  for (let i = 0; i < n; i += 1) superNode[i] = neu.get(schnitt[i]) as number;

  const m = nummern.length;
  const sternNeu: number[][] = Array.from({ length: m }, () => []);
  const innen = new Float64Array(m);
  const paar = new Map<number, number>();
  for (let i = 0; i < n; i += 1) {
    const ci = superNode[i];
    for (let p = 0; p < stern[i].length; p += 2) {
      const cj = superNode[stern[i][p]];
      const w = stern[i][p + 1];
      if (ci === cj) {
        innen[ci] += w;
        continue;
      }
      const schluessel = ci < cj ? ci * m + cj : cj * m + ci;
      paar.set(schluessel, (paar.get(schluessel) ?? 0) + w);
    }
  }
  let summe = 0;
  for (const [schluessel, w] of paar) {
    const a = Math.floor(schluessel / m);
    const b = schluessel % m;
    sternNeu[a].push(b, w);
    sternNeu[b].push(a, w);
    summe += w;
  }
  const degNeu = new Float64Array(m);
  for (let c = 0; c < m; c += 1) {
    let d = 0;
    for (let p = 0; p < sternNeu[c].length; p += 2) d += sternNeu[c][p + 1];
    degNeu[c] = d + 2 * innen[c];
  }
  return { netz: { n: m, stern: sternNeu, deg: degNeu, summe }, super: superNode };
}

/** Modularitaet des Schnitts, gegen den Bestand von einst — nicht gegen ein Niveau. */
function modulvarMessen(netz: Netz, schnitt: Int32Array): number {
  const zweiM = 2 * netz.summe;
  if (zweiM <= 0) return 0;
  const innen = new Map<number, number>();
  const gesamt = new Map<number, number>();
  for (let i = 0; i < netz.n; i += 1) {
    const c = schnitt[i];
    gesamt.set(c, (gesamt.get(c) ?? 0) + netz.deg[i]);
    let d = 0;
    for (let p = 0; p < netz.stern[i].length; p += 2) {
      if (schnitt[netz.stern[i][p]] === c) d += netz.stern[i][p + 1];
    }
    innen.set(c, (innen.get(c) ?? 0) + d);
  }
  let q = 0;
  gesamt.forEach((tot, c) => {
    const drin = innen.get(c) ?? 0;
    q += drin / zweiM - (tot / zweiM) ** 2;
  });
  return q;
}

/**
 * Die Communitys eines Bestands. `knoten` ist die Grundgesamtheit: ein Knoten ohne
 * Kante ist ein Haufen von einem, kein Anhaengsel — ein Verfahren, das ihn
 * verschluckt, meldet eine Ordnung, die das Bild nicht hat.
 */
export function gemeinschaftenBaue(
  knoten: readonly string[],
  kanten: readonly Gemeinschaftskante[],
): GemeinschaftenErgebnis {
  const ids = kennungen(knoten, kanten);
  const bestand = netzBaue(ids, kanten);
  if (ids.length === 0) return { zuordnung: new Map(), gemeinschaften: [], modulvar: 0, stufen: 0 };

  const ebenen: Int32Array[] = [];
  let netz = bestand;
  let schnittTief: Int32Array | null = null;
  let stufen = 0;

  while (stufen < MAX_STUFEN) {
    const { schnitt, zog } = schiebeNetz(netz);
    if (!zog) {
      schnittTief = schnitt;
      break;
    }
    const naechstes = zusammenfassen(netz, schnitt);
    // gemerkt wird der Hochstieg (Knoten -> Knoten des naechsten Niveaus), nicht der
    // Schnitt selbst: die Haufen-Nummern eines Niveaus sind keine Indizes des naechsten.
    ebenen.push(naechstes.super);
    netz = naechstes.netz;
    stufen += 1;
    schnittTief = null;
    if (netz.n <= 1) break;
  }
  if (schnittTief === null) schnittTief = schiebeNetz(netz).schnitt;

  // von unten nach oben aufloesen: jede Ebene schiebt ihre Knoten in den Haufen der Tiefe
  let schnitt0 = schnittTief;
  for (let e = ebenen.length - 1; e >= 0; e -= 1) {
    const Ebene = ebenen[e];
    const er = new Int32Array(Ebene.length);
    for (let i = 0; i < Ebene.length; i += 1) er[i] = schnitt0[Ebene[i]];
    schnitt0 = er;
  }

  const haufen = new Map<number, number[]>();
  for (let i = 0; i < bestand.n; i += 1) {
    const c = schnitt0[i];
    const liste = haufen.get(c);
    if (liste) liste.push(i);
    else haufen.set(c, [i]);
  }
  const ordnung = [...haufen.values()].sort(
    (x, y) => y.length - x.length || x[0] - y[0],
  );
  const zuordnung = new Map<string, number>();
  const gemeinschaften: Gemeinschaft[] = ordnung.map((liste, nr) => {
    const mitglieder = liste.map((i) => ids[i]);
    for (const id of mitglieder) zuordnung.set(id, nr);
    return { nr, groesse: liste.length, mitglieder };
  });

  return {
    zuordnung,
    gemeinschaften,
    modulvar: modulvarMessen(bestand, schnitt0),
    stufen,
  };
}
