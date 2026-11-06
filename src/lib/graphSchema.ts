// Das Schema-Inventar: was in der Wissensbasis wirklich vorkommt.
//
// Die Fläche malt einzelne Notizen und einzelne Behauptungen. Wer wissen will,
// ob das Netz dünn oder voll ist, fragt nach den ZÄHLUNGEN: wie viele Fakten,
// wie viele Ereignisse, wer über wen was behauptet. Cognee legt das als
// „Schema"-Tab aus; bei K3PTA standen die Zahlen verstreut — die Art-Ziffern
// auf den Dashboard-Kacheln, die Kantenarten in der Legende, die Behauptungs-
// typen an den Linien selbst.
//
// Der eine Vertrag, der diese Datei trägt: das Inventar zählt dieselbe Menge,
// die die Fläche zeichnet. Es nimmt die Notizen und Kanten, die schon im Bild
// liegen, und erfindet nichts hinzu — keine Art, die nicht vorkommt, kein
// Behauptungswort, das niemand geschrieben hat, und keine zweite Zahl neben
// der ersten.

import { istStruktur } from "./graphTime";
import { TYP_BESCHREIBUNG } from "./graphHierarchy";

export interface SchemaNotiz {
  type?: string | null;
}

export interface SchemaKante {
  source: string;
  target: string;
  /** Echte Behauptung oder Aehnlichkeit — dieselbe Unterscheidung wie im Bild. */
  real: boolean;
  /** Was behauptet wird. Fehlend bei Erwähnungen und Aehnlichkeiten. */
  relation?: string | null;
}

export interface SchemaZeile {
  /** Stabiler Schlüssel zum Ansprechen (Spotlight) — nie ein Label. */
  schluessel: string;
  label: string;
  anzahl: number;
}

export interface SchemaEingabe {
  notizen: readonly SchemaNotiz[];
  konzepte: number;
  kanten: readonly SchemaKante[];
}

export interface SchemaInventar {
  knoten: SchemaZeile[];
  kanten: SchemaZeile[];
  gesamtKnoten: number;
  /** Die Begriffe allein: die Flaeche nennt sie concepts, nicht nodes. */
  konzepte: number;
  gesamtKanten: number;
}

/** Eine Notiz ohne Art ist keine der vier bekannten — sie hat keine. */
const OHNE_TYP = "knoten:—";
const BEGRIFFE = "knoten:__begriff";
const ERWAHNUNG = "kante:erwaehnung";
const AehnLICHKEIT = "kante:ahnlichkeit";
const UNBENANNT = "kante:—";

/**
 * Die Schlüssel, unter denen das Inventar seine Zeilen führt. Eine Fläche, die
 * eine Zeile ansprechen will (Spotlight, Verlinkung), kommt hierher — nicht
 * über eine nachgebaut Zeichenkette.
 */
export const SCHEMA_SCHLUESSEL = {
  begriffe: BEGRIFFE,
  ohneTyp: OHNE_TYP,
  erwahnung: ERWAHNUNG,
  ahnlichkeit: AehnLICHKEIT,
  unbenannt: UNBENANNT,
} as const;

function geordnet(zähler: Map<string, { label: string; anzahl: number }>): SchemaZeile[] {
  return [...zähler.entries()]
    .map(([schluessel, z]) => ({ schluessel, label: z.label, anzahl: z.anzahl }))
    .sort((a, b) => b.anzahl - a.anzahl || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
}

function fuege(zähler: Map<string, { label: string; anzahl: number }>, schluessel: string, label: string, anzahl = 1): void {
  const alt = zähler.get(schluessel);
  if (alt) alt.anzahl += anzahl;
  else zähler.set(schluessel, { label, anzahl });
}

export function schemaInventar(eingabe: SchemaEingabe): SchemaInventar {
  const knoten = new Map<string, { label: string; anzahl: number }>();
  for (const m of eingabe.notizen) {
    const typ = typeof m.type === "string" ? m.type.trim() : "";
    if (!typ) fuege(knoten, OHNE_TYP, "No type");
    else fuege(knoten, `knoten:${typ}`, TYP_BESCHREIBUNG[typ] ?? typ);
  }
  if (eingabe.konzepte > 0) fuege(knoten, BEGRIFFE, "Concepts", eingabe.konzepte);

  const kanten = new Map<string, { label: string; anzahl: number }>();
  for (const e of eingabe.kanten) {
    if (!e.real) {
      // Eine Aehnlichkeit ist kein Behauptungswort, auch wenn die Zeile eines
      // mitschleppt: sie ist der Reim, den die Fläche als solchen kennzeichnet.
      fuege(kanten, AehnLICHKEIT, "Similarity");
      continue;
    }
    if (istStruktur(e.source) && istStruktur(e.target)) {
      const wort = typeof e.relation === "string" ? e.relation.trim() : "";
      if (wort) fuege(kanten, `kante:${wort}`, wort);
      else fuege(kanten, UNBENANNT, "Unnamed claim");
      continue;
    }
    fuege(kanten, ERWAHNUNG, "Mention");
  }

  return {
    knoten: geordnet(knoten),
    kanten: geordnet(kanten),
    gesamtKnoten: eingabe.notizen.length + eingabe.konzepte,
    konzepte: eingabe.konzepte,
    gesamtKanten: eingabe.kanten.length,
  };
}
