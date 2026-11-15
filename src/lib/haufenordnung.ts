// Punkt 124b — die Haufen-Groessenordnung ueber dem ganzen Bestand.
//
// Was der Kern schon konnte: Louvain (`gemeinschaftenBaue`) und das Bild daraus
// (`haufenBildBaue`). Was ihm fehlte, war eine Grundgesamtheit: der einzige Verbraucher war die
// Flaeche, und die bekommt aus der Tuer ein Fenster von 500 Begriffen und 2 000 Kanten
// (`src/core/store.ts:42`). Eine Verteilung, die ueber einem Fenster gerechnet wird, sagt nichts
// ueber die Groesse der Haufen — sie sagt nur, wie das Fenster zufaellt.
//
// Darum diese Datei: sie nimmt das kappen-freie Feld (`store.haufenFeld()`) und antwortet mit
// einer Verteilung. Keine Notiz, keine Kennung, kein Begriff verlaesst sie — was herauskommt, sind
// Haefungen. Der Nenner steht in der Antwort, weil eine Zahl ohne Grundgesamtheit hier als keine
// Auskunft gilt.
//
// Die Gewichtung ist die der Flaeche, nicht eine zweite: eine Erwahnung wiegt 1, eine Behauptung 2
// (`haufenKantenAus`, gemeinschaften.ts:425). Zwei Rechnungen ueber demselben Bestand, die sich
// erlauben, unterschiedliche Haufen zu sehen, waere genau die Krankheit, die dieser Auftrag heilt.
import type { KeptaStore } from "../core/store";
import { gemeinschaftenBaue, haufenKantenAus } from "./gemeinschaften";
import { REGAL_DECKEL_PROZENT } from "./graphHierarchy";

export interface HaufenFeld {
  notizen: string[];
  begriffe: string[];
  erwaehnungen: [string, string][];
  behauptungen: { source: string; target: string }[];
}

export interface HaufenFach {
  notizen: number;
  prozent: number;
}

/** Eine Stufe der Haefung: so viele Haufen halten genau so viele Notizen. */
export interface Haufenstufe {
  notizen: number;
  haufen: number;
}

export interface HaufenOrdnung {
  ok: true;
  grundgesamtheit: {
    notizen: number;
    begriffe: number;
    /** Kanten = Behauptungen im Bestand; `erwaehnungen` ist die zweite Haelfte des Feldes. */
    kanten: number;
    erwaehnungen: number;
    behauptungen: number;
    gerechneteKnoten: number;
    notizenOhneBegriff: number;
  };
  fenster: { begrenzt: false; grund: string };
  haufen: {
    anzahl: number;
    anzahlOhneNotiz: number;
    groesstesFach: HaufenFach;
    median: number;
    groessenVerteilung: Haufenstufe[];
    summenKontrolle: { notizen: number; stimmt: boolean };
  };
  deckel: { latteProzent: number; erfuellt: boolean; grund: string };
  zeit: { ms: number; ausCache: boolean };
  hinweis: string;
}

const NOTIZ = "notiz:";
const BEGRIFF = "begriff:";

const gerundet = (wert: number): number => Number(wert.toFixed(2));

/** Dieselbe Kruemmung wie die Teilzeiten-Koepfe der Tuer (server/helfer/zeitnahme.ts): zwei Stellen. */
const verstrichen = (von: bigint): number => Math.round(Number(process.hrtime.bigint() - von) / 1e3) / 1000;

function median(orden: number[]): number {
  if (orden.length === 0) return 0;
  const sortiert = [...orden].sort((a, b) => a - b);
  const mitte = Math.floor(sortiert.length / 2);
  return sortiert.length % 2 === 1 ? sortiert[mitte] : (sortiert[mitte - 1] + sortiert[mitte]) / 2;
}

/**
 * Die Verteilung aus dem Feld. Rechnerisch kein Zugriff auf die Platte, keinen Cache — zweimal
 * dasselbe Feld ergibt zweimal dieselbe Auskunft. Die Zeit, die sie nennt, ist ihre eigne
 * Rechenzeit, nicht die der Tuer.
 */
export function haufenOrdnung(feld: HaufenFeld): HaufenOrdnung {
  const start = process.hrtime.bigint();
  const notizKeys = feld.notizen.map((id) => `${NOTIZ}${id}`);
  const begriffKeys = feld.begriffe.map((name) => `${BEGRIFF}${name}`);
  const maske = new Set<string>([...notizKeys, ...begriffKeys]);
  const kanten = haufenKantenAus(
    maske,
    feld.erwaehnungen.map(([notiz, begriff]) => [`${NOTIZ}${notiz}`, `${BEGRIFF}${begriff}`] as [string, string]),
    feld.behauptungen.map((r) => ({ source: `${BEGRIFF}${r.source}`, target: `${BEGRIFF}${r.target}` }))
  );

  const ergebnis = gemeinschaftenBaue([...notizKeys, ...begriffKeys], kanten);

  const notizenJeHaufen: number[] = [];
  let ohneNotiz = 0;
  let mitNotiz = 0;
  for (const haufen of ergebnis.gemeinschaften) {
    let n = 0;
    for (const mitglied of haufen.mitglieder) if (mitglied.startsWith(NOTIZ)) n += 1;
    if (n === 0) {
      ohneNotiz += 1;
      continue;
    }
    notizenJeHaufen.push(n);
    mitNotiz += n;
  }
  const gross = [...notizenJeHaufen].sort((a, b) => b - a);
  const groesstes = gross[0] ?? 0;
  const bestand = feld.notizen.length;
  const prozent = bestand > 0 ? gerundet((100 * groesstes) / bestand) : 0;

  // Die Haefung ist verlustfrei: jeder Haufen steht einmal drin, mit seiner Notiz-Zahl. Eine
  // Kappe der Liste (die ersten zehn Groessen) waere dieselbe Suede, die der Auftrag abschafft.
  const haefung = new Map<number, number>();
  for (const n of notizenJeHaufen) haefung.set(n, (haefung.get(n) ?? 0) + 1);
  const groessenVerteilung: Haufenstufe[] = [...haefung.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([notizen, haufen]) => ({ notizen, haufen }));
  const summe = notizenJeHaufen.reduce((s, n) => s + n, 0);

  const gedeckteNotizen = new Set(feld.erwaehnungen.map((paar) => paar[0]));
  const ohneBegriff = Math.max(0, bestand - gedeckteNotizen.size);
  const mittlere = median(notizenJeHaufen);

  let erfuellt: boolean;
  let grund: string;
  if (bestand === 0) {
    erfuellt = false;
    grund = "the base holds no notes — nothing was measured, so nothing can pass";
  } else if (mitNotiz < 2) {
    // Ein Haufen ist keine Teilung, auch nicht, wenn er klein ist. Dieselbe Begruendung wie
    // `unterscheidetVonArt` (gemeinschaften.ts:526): eine Farbe malt keine Ordnung.
    erfuellt = false;
    grund = `one cluster over ${bestand} notes is not a division — ${mitNotiz} clusters carry a note`;
  } else {
    erfuellt = prozent <= REGAL_DECKEL_PROZENT;
    // Die Latte zu erfuellen, indem alles Staub ist, ist kein Erfolg. Gemessen 13:12:48 UTC an
    // einem Bestand in seiner Form (1 016 Notizen mit Begriff, 19 984 ohne): groesstes Fach 4
    // Notizen = 0,02 %, Latte erfuellt, Median 1. Ohne diesen Zusatz verkauft sich die Zahl als
    // Teilung, und genau das ist der Befund nicht.
    grund = !erfuellt
      ? `the largest cluster holds ${groesstes} of ${bestand} notes — over the ${REGAL_DECKEL_PROZENT} % lid, so this axis is a basket, not a division`
      : mittlere <= 1
        ? `no cluster holds more than ${REGAL_DECKEL_PROZENT} % of ${bestand} notes, but the median cluster holds ${mittlere} and ${ohneBegriff} notes carry no concept — the lid is met as dust, not as a division`
        : `no cluster holds more than ${REGAL_DECKEL_PROZENT} % of ${bestand} notes; the largest holds ${groesstes} and the median cluster holds ${mittlere}`;
  }

  return {
    ok: true,
    grundgesamtheit: {
      notizen: bestand,
      begriffe: feld.begriffe.length,
      kanten: feld.behauptungen.length,
      erwaehnungen: feld.erwaehnungen.length,
      behauptungen: feld.behauptungen.length,
      gerechneteKnoten: notizKeys.length + begriffKeys.length,
      notizenOhneBegriff: ohneBegriff,
    },
    fenster: {
      begrenzt: false,
      grund: "every active note and every concept in the base is fed to the run; the 500-concept and 2000-edge window of /api/graph does not apply here",
    },
    haufen: {
      anzahl: notizenJeHaufen.length,
      anzahlOhneNotiz: ohneNotiz,
      groesstesFach: { notizen: groesstes, prozent },
      median: mittlere,
      groessenVerteilung,
      summenKontrolle: { notizen: summe, stimmt: summe === bestand },
    },
    deckel: { latteProzent: REGAL_DECKEL_PROZENT, erfuellt, grund },
    zeit: { ms: verstrichen(start), ausCache: false },
    hinweis:
      `${groesstes} of ${bestand} notes sit in the largest cluster (${prozent} % of the base) across ` +
      `${notizenJeHaufen.length} clusters, and the median cluster holds ${mittlere}; ${ohneBegriff} of ` +
      `${bestand} notes carry no concept at all and can reach no cluster. The base holds ` +
      `${feld.begriffe.length} concepts and ${feld.behauptungen.length} assertions over ` +
      `${feld.erwaehnungen.length} mentions.`,
  };
}

const CacheSchluessel = new WeakMap<KeptaStore, { generation: number; ordnung: HaufenOrdnung }>();

/**
 * Die Auskunft ueber dem Bestand, der gerade offen ist — mit einem Cache, der an derselben
 * Generation haengt wie die semantische Karte (`server/helfer/semantik.ts:17`): jede Mutation an
 * Notizen, Begriffen oder Kanten wirft sie, und ohne Mutation kostet das Oeffnen nichts.
 * Ein Cache ohne Generationssiegel waere die Zahl von gestern unter der Uhrzeit von heute.
 */
export function haufenOrdnungVomBestand(store: KeptaStore): HaufenOrdnung {
  const generation = store.datenGeneration();
  const alt = CacheSchluessel.get(store);
  if (alt && alt.generation === generation) {
    return { ...alt.ordnung, zeit: { ms: alt.ordnung.zeit.ms, ausCache: true } };
  }
  const ordnung = haufenOrdnung(store.haufenFeld());
  CacheSchluessel.set(store, { generation, ordnung });
  return ordnung;
}
