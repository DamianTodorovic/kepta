// Die Zusage-Pforte: wann ein Zeit-Urteil sprechen darf.
//
// Ein Fall, der „<= 15 ms" verspricht, misst auf derselben Maschine, die gerade
// FensterServer, IDE und die Laeufe von acht anderen Leuten bedient. Die
// Ruhe-Sonde (`scripts/ruhe-sonde.mjs`) wehrt Groblast ab — ihre eigene Grenze
// liegt aber bei 20 ms Median, und damit **weiter als das engste Budget, das
// diese Suite verspricht**. Gemessen am 12.10.: bei Sonde-Medianen von
// 6,28-6,34 ms kostete die Mutation 10,0 ms (gehalten, 5 ms Luft); bei
// 10,21-11,03 ms kostete sie 18,9 ms und **fiel durch ein Urteil, das die
// Sonde fuer „ruhig" hielt** (`tests/graf-kosten.test.ts`, Log
// `audit-2026-10-09/e2-code/nacht-12-10/rohdaten/anteil-kosten-allein-144944.log`).
// Der Fall kostet etwa das 1,75-Fache dessen, was der Wurf der Maschine selbst
// braucht — die Zahl sagt also mindestens so viel ueber die Nachbarschaft wie
// ueber den Pfad.
//
// Die Pforte schliesst daraus: **ein Zeit-Urteil spricht nur, wo die Maschine
// hoechstens die Haelfte der Zusage selbst braucht.** Sie aendert keine einzige
// bestellte Zahl (15, 120, 5, 750 bleiben, wo sie sind) und ueberspringt nichts
// still — sie verweigert ein Urteil, das in diesem Fenster gar keins sein kann,
// und nennt dabei beide Zahlen: Zusage und gemessene Baseline.
//
// Alles hier ist eine reine Funktion auf Zahlen. Der Nachweis beider Richtungen
// (gesetze Sonde => kein Urteil, ruhige Sonde => Urteil) laeuft ohne Lastlauf —
// eine belegte Messung *ist* kein Beweis dafuer, dass die Pforte greift, sie
// waere wieder eine Zeitmessung unter Last.

/** Der Bruch der Zusage, den die Maschine highestens selbst brauchen darf. */
export const ZUSAGE_TEIL = 2;

/** Die groesste Baseline, bei der ein Urteil zu dieser Zusage sprechen darf. */
export function hoechsteZulaessigeBaseline(zusageMs: number): number {
  return zusageMs / ZUSAGE_TEIL;
}

export interface Pforte {
  /** true heisst: dieses Fenster darf fuer diese Zusage ein Urteil faellen. */
  urteilbar: boolean;
  /** Was zu drucken ist, wenn sie schliesst — hoerbar, nicht still. */
  meldung: string;
  zusageMs: number;
  /** Die strengste der gemeldeten Baselines (vor und nach der Messung). */
  baselineMs: number | null;
  grenzeMs: number;
}

/**
 * @param fall    Name des Falls, hoert sich in der Meldung wieder.
 * @param zusageMs Die bestellte Zahl — ungeaendert, hier nur als Mass.
 * @param baselinesMs Die Mediane der Sonde, vorher und nachher.
 */
export function zeitZusagePforte(fall: string, zusageMs: number, baselinesMs: readonly number[]): Pforte {
  const grenzeMs = hoechsteZulaessigeBaseline(zusageMs);
  const zahlen = baselinesMs.filter((b) => Number.isFinite(b));
  if (zahlen.length === 0) {
    return {
      urteilbar: false,
      meldung: `kein Urteil — keine Baseline gemessen: ${fall} verspricht <= ${zusageMs.toFixed(0)} ms, aber die Sonde hat in diesem Fenster keinen Median gemeldet. Ohne Baseline darf kein Zeit-Urteil sprechen.`,
      zusageMs,
      baselineMs: null,
      grenzeMs,
    };
  }
  const baselineMs = Math.max(...zahlen);
  if (baselineMs <= grenzeMs) {
    return { urteilbar: true, meldung: "", zusageMs, baselineMs, grenzeMs };
  }
  return {
    urteilbar: false,
    meldung:
      `kein Urteil — Maschine zu laut fuer diese Zusage: ${fall} verspricht <= ${zusageMs.toFixed(0)} ms, ` +
      `die Sonde meldet als Baseline ${baselineMs.toFixed(2)} ms (die strengste aus ${zahlen.map((b) => b.toFixed(2)).join(", ")}), ` +
      `und die Pforte laesst ein Urteil nur bis ${grenzeMs.toFixed(1)} ms — die Haelfte der Zusage. Keine Kappe angehoben, nichts uebersprungen: ` +
      `gemessen wird wieder, wenn die Maschine ruhiger ist.`,
    zusageMs,
    baselineMs,
    grenzeMs,
  };
}
