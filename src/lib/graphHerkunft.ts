// Die Herkunft als zweiter Farbkanal des Graphen (P-11).
//
// Die Fläche malt eine Notiz bisher in der Farbe ihrer ART. Das ist die
// wichtigste Frage — Fakt, Ereignis, Anleitung, Dokument. Die zweite Frage
// beantwortet kein Kanal: WOHER weiss ich das? Der Posteingang stempelt seine
// Dateien, der Rechner-Scan stempelt seine Funde, und was keinen Stempel trägt,
// hat jemand hier geschrieben.
//
// Die Regel, die diese Datei trägt: Herkunft ist eine Auskunft, kein
// Lückenbüsser. Ein Bestand, in dem alles aus derselben Hand kommt, hat nichts
// zu unterscheiden — dann ist der Kanal abgeschaltet und sagt warum, statt die
// ganze Wissensbasis in ein graues „Unbekannt" zu tauchen.

export const HERKUNFT = {
  geschrieben: "geschrieben",
  datei: "datei",
  rechner: "rechner",
} as const;

export type HerkunftsArt = (typeof HERKUNFT)[keyof typeof HERKUNFT];

export interface HerkunftsNotiz {
  id: string;
  tags: readonly string[];
}

export interface HerkunftsBild {
  /** Notiz-id → Herkunft. Jede Notiz hat eine — es gibt kein „weiss nicht". */
  träger: Map<string, HerkunftsArt>;
  /** Alle drei Arten, auch die mit null — `arten` filtert das auf die, die vorkommen. */
  zahlen: Record<HerkunftsArt, number>;
  /** Die Arten, die im Bestand vorkommen, absteigend nach Zahl, dann nach Name. */
  arten: HerkunftsArt[];
  /** Ob der Kanal etwas zu sagen hat. */
  verfügbar: boolean;
  /** Warum nicht — in der Sprache der Fläche, leer, wenn der Kanal an ist. */
  grund: string;
}

/** Die Stempel, die die Schreibwege wirklich setzen — exakt, nicht enthalten. */
const STEMPEL: readonly [string, HerkunftsArt][] = [
  ["inbox", HERKUNFT.datei],
  ["auto-import", HERKUNFT.datei],
  ["machine-scan", HERKUNFT.rechner],
];

export const HERKUNFT_LABELS: Record<HerkunftsArt, string> = {
  [HERKUNFT.geschrieben]: "Written in KEPTA",
  [HERKUNFT.datei]: "From a file",
  [HERKUNFT.rechner]: "From this computer",
};

/**
 * Drei Farben ausserhalb der Art-Familie (Schiefer, Pflaume, Salbei, Lohe),
 * damit ein Wechsel des Kanals nicht wie ein Wechsel der Arten aussieht.
 *
 * „Written in KEPTA" steht in Stahlgrau — nicht weil die Herkunft unbekannt
 * wäre, sondern weil sie die unaufgeforderte ist: alles, was hier niemand
 * hereingetragen hat, wurde hier aufgeschrieben.
 */
export const HERKUNFT_FARBEN: Record<HerkunftsArt, string> = {
  [HERKUNFT.geschrieben]: "#8b9096",
  [HERKUNFT.datei]: "#b5813a",
  [HERKUNFT.rechner]: "#3d8b86",
};

export function herkunftAusNotiz(notiz: HerkunftsNotiz): HerkunftsArt {
  for (const [stempel, art] of STEMPEL) {
    if (notiz.tags.includes(stempel)) return art;
  }
  return HERKUNFT.geschrieben;
}

export function herkunftsBild(notizen: readonly HerkunftsNotiz[]): HerkunftsBild {
  const träger = new Map<string, HerkunftsArt>();
  const zahlen: Record<HerkunftsArt, number> = {
    [HERKUNFT.geschrieben]: 0,
    [HERKUNFT.datei]: 0,
    [HERKUNFT.rechner]: 0,
  };
  for (const n of notizen) {
    const art = herkunftAusNotiz(n);
    träger.set(n.id, art);
    zahlen[art] += 1;
  }
  const arten = (Object.keys(zahlen) as HerkunftsArt[])
    .filter((a) => zahlen[a] > 0)
    .sort((a, b) => zahlen[b] - zahlen[a] || (a < b ? -1 : a > b ? 1 : 0));

  const verfügbar = arten.length > 1;
  const grund = notizen.length === 0
    ? "No notes yet — there is nothing to have come from anywhere."
    : verfügbar
      ? ""
      : `Everything here was ${HERKUNFT_LABELS[arten[0] ?? HERKUNFT.geschrieben].toLowerCase()} — there is nothing to tell apart.`;

  return { träger, zahlen, arten, verfügbar, grund };
}
