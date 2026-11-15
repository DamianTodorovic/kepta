// Das Urteil ueber eine gemeldete Bildkante -- die Zahl, nicht das Pixel, ist ihr Grund.
//
// WARUM ES DIESE DATEI GIBT. Der Fenster-Pruefer verlangte bis 5.11. von jeder Kante, die die
// Flaeche als Beschnitt meldet, dass ihre aeussere Pixelreihe Tinte traegt. Gemessen am
// ausgelieferten 3.2.158 bei 390 x 844 (Laeufe 13:58:33 und 14:01:26 MEZ, je ein FEHLT):
// die aeussersten zwei Spalten des Bildes tragen null Tinte, Spalte 2 bis 7 tragen 99,7 % --
// und Spalte 2 bis 7 sind die Kantenmarke selbst. Die Flaeche malt das Band bei CSS x=1 mit
// drei CSS-Pixeln Breite (`KnowledgeGraph.tsx:4865-4868`), in Geraete-Pixeln bei doppeltem
// Zoom also bei 2 bis 7. Eine Kante, die ihr Wort haelt, kann die nullte Spalte darum nie
// beruehren: die Latte mass an einem Koerper, den das Produkt gar nicht malt, und fiel
// zweimal rot auf zwei gruenen Staenden.
//
// WAS IHRE LATTE WIRKLICH VERLANGT. Die Kante sagt: hier laeuft etwas ueber den Rand. Den
// Beweis dafuer traegt die Flaeche schon in einem andern Koerper -- die Bilanzzeile
// ("33 of 34 unfolded notes are in this picture"), dieselbe Menge und dieselbe Schwelle wie
// die Kante (`kantenBeschnitt`, KnowledgeGraph.tsx:933-954). Also wird Wort gegen Zahl
// gehalten, in beide Richtungen: eine gemeldete Kante ohne eine einzige Zahl ausserhalb ist
// erfunden, und Zahlen ausserhalb ohne gemeldete Kante sind verschwiegen.
//
// SCHWEIGEN IST EIN BENANNTER ZWEIG. `rahmenZeilentext` liefert den leeren Satz, wenn der
// Rahmen alles haelt -- gemeldet, gefaehrt und gewacht bei 1268-1270 des Pruefers. Silence
// heisst hier "null ausserhalb", nicht "keine Lesung", und faellt darum nicht als Ausfall.

const SEITEN = ["oben", "unten", "links", "rechts"];

/**
 * @param {{gemeldete?: readonly string[], im?: number | null, von?: number | null}} stand
 *   `gemeldete` die Seiten, die die Flaeche als Beschnitt meldet (ihr `data-kanten`-Wert,
 *   in Worte gespalten); `im` und `von` die zwei Zahlen der Bilanzzeile, null wenn sie schweigt.
 * @returns {{fehl: string[], aussen: number, begruendung: string}}
 *   `fehl` listet die Seiten (oder den einen Satz), an denen Wort und Zahl nicht zusammengehen.
 */
export function kantenUrteil({ gemeldete = [], im = null, von = null } = {}) {
  const unbekannteSeiten = gemeldete.filter((s) => !SEITEN.includes(s));
  // Silence is "everything in the frame": the surface writes no line when the frame holds all.
  const aussen = im === null || von === null ? 0 : Math.max(0, von - im);
  const fehl = [];
  if (unbekannteSeiten.length) {
    fehl.push(...unbekannteSeiten.map((s) => `${s}: meldet eine Kante, die das Haus nicht kennt`));
  }
  for (const seite of gemeldete.filter((s) => SEITEN.includes(s))) {
    if (aussen === 0) fehl.push(`${seite}: Kante gemeldet, aber es faellt keine einzige Zahl aus dem Bild`);
  }
  if (!gemeldete.length && aussen > 0) {
    fehl.push(`keine Kante gemeldet, aber ${aussen} von ${von} Zahlen liegen ausserhalb des Bildes`);
  }
  const begruendung = `gemeldete Kanten ${JSON.stringify(gemeldete)}, ausserhalb ${aussen}`;
  return { fehl, aussen, begruendung };
}
