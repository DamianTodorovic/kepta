/* Die drei Ansichten des Wissensgraphen, mit einem Namen pro Sache.

   Der Knopf, sein Titel und die Panelsprache sollen dieselbe Sache heissen. Vorher trugen
   alle drei das Verfahren: "Force", "Tree", "Semantic" -- und ein Knopf hat, wie ein Etikett,
   keinen Raum fuer eine Erklaerung. Die Verfahren bleiben dort, wo ein Satz sie traegen kann:
   in der Erklaerung, die unter dem Zeiger erscheint. */

export const ANSICHT_LABELS = {
  force: "Claims",
  dendrogram: "Tree",
  semantic: "Meaning",
} as const;

export type AnsichtSchluessel = keyof typeof ANSICHT_LABELS;

/** Was die Ansicht mit den Knoten tut -- ein voller Satz, der mit dem Namen der Ansicht
    beginnt. Der Satz muss am Stueck haengen bleiben, weil die Zaehler des Census nur
    zusammenhaengende Wortlaeufer sehen: eine aus zwei Stuecken gesetzte Zeile (Name + Rest)
    faellt aus der Grundgesamtheit der Saetze heraus, und ein Zaehler, der weniger misst,
    meldet Erfolg fuer etwas, das er nicht sieht. Gemessen 12:16:09 MEZ: der Korpus war von
    349 auf 346 Saetze geschrumpft, weil drei Titel zu Laufzeit-Saetzen wurden. */
const ANSICHT_BESCHREIBUNG = {
  force: "Claims view — the links as your notes claim them; meaning only on request",
  dendrogram: "Tree view — knowledge as a tree, from the root down to each note",
  semantic: "Meaning view — placed by what notes mean, not by the words they share",
} as const;

export const ansichtLabel = (schluessel: AnsichtSchluessel): string => ANSICHT_LABELS[schluessel];

/** Der Titel ueber dem Knopf: zuerst der Name, dann die Erklaerung. */
export const ansichtBeschreibung = (schluessel: AnsichtSchluessel): string => ANSICHT_BESCHREIBUNG[schluessel];
