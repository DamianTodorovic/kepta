// #96 — das Leistenband: der Ueberblick ueber die GEMALTEN Knoten je Gruppe.
//
// Warum es das gibt: am gefitteten Bild traegt die Leinwand einen Ton (gemessen 23./24.10.),
// und ein Buchstabe braucht 15 Bildpunkte Radius. Der Ueberblick braucht deshalb eine Stufe,
// die ohne Zoom lesbar ist: ein Band ueber die volle Breite, 10 px hoch, ein Abschnitt je
// Gruppe, Breite proportional zu den GEMALTEN Knoten — nicht zur Mitgliedschaft. Das ist die
// Lehre aus #90: `json` hat 8 485 Mitglieder und malt 0 Knoten; wer die Mitgliedschaft malt,
// zeigt eine Farbe, die auf keinem Knoten liegt.
//
// Ein Abschnitt unter 1 px waere kein Kanal (#29/#59): darum hat jeder Abschnitt eine
// Mindestbreite, und sein Name steht in `title`/`aria-label` — auch der 30-Knoten-Rest.
export interface BandSegment {
  marke: string;
  /** Die Farbe der Gruppe, wie sie die Leinwand malt. */
  farbe: string;
  /** Knoten, die diesen Ton WIRKLICH tragen (aus `gemalteZahlen`). */
  gemalt: number;
  /** Mitglieder der Gruppe — nur fuer den Titel, nicht fuer die Breite. */
  summe: number;
}

export function GruppenBand({ segmente }: { segmente: readonly BandSegment[] }) {
  const gesamt = segmente.reduce((s, x) => s + x.gemalt, 0);
  if (gesamt <= 0 || segmente.length === 0) return null;
  return (
    <div
      data-testid="graph-gruppenband"
      className="graph-gruppenband"
      aria-label={`Share of painted nodes per group — ${gesamt} painted`}
    >
      {segmente.map((s) => {
        const anteil = s.gemalt / gesamt;
        return (
          <span
            key={s.marke}
            data-testid="graph-gruppenband-segment"
            data-marke={s.marke}
            data-gemalt={s.gemalt}
            data-anteil={anteil.toFixed(6)}
            className="graph-gruppenband-segment"
            style={{ flexGrow: s.gemalt, flexBasis: 0, background: s.farbe }}
            title={`${s.marke} — ${s.gemalt} of ${s.summe} notes painted (${(100 * anteil).toFixed(1)} % of the painted nodes)`}
            aria-label={`${s.marke}: ${s.gemalt} painted of ${gesamt}`}
          />
        );
      })}
      <span data-testid="graph-gruppenband-gesamt" className="sr-only">
        {gesamt}
      </span>
    </div>
  );
}
