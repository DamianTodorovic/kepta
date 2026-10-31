// Teilzeiten in den lesenden Routen.
//
// Warum das hier steht: die Tuer nannte nie, was innerhalb einer Anfrage passiert. Punkt 6 musste die
// 2 256 ms von `GET /api/health` aus der DIFFERENZ zweier Routen erschliessen (`/api/storage-info` ruft
// dieselbe Zaehlung in einem 161-Byte-Leib und kostet dasselbe) und blieb damit bei "Ursache der Zahl
// nach" haengen, nicht "gemessen". Mit diesem Helfer steckt die Aufteilung in der Antwort selbst — als
// Kopf `x-kepta-teilzeiten`, weil ein neues Feld im Leib den Vertrag der Flaechen aendern wuerde.
//
// Die Marken sind kumulative Abschnitte: jede `marke(name)` misst die Zeit seit der vorigen Marke.
export function zeitnahme() {
  const start = process.hrtime.bigint();
  let bisher = start;
  const marken: Array<[string, number]> = [];
  const ms = (von: bigint, bis: bigint) => Math.round(Number(bis - von) / 1e3) / 1000;
  /** ms je Marke, zuzueglich "gesamt" seit dem Aufruf von zeitnahme().
   *  Mehrere Marken mit demselben Namen werden ZUSAMMENGEZOGEN, nicht ueberschrieben:
   *  der Schreibweg markt pro Notiz ("lesen", "einsetzen", "index", "verknuepfen"), und
   *  ein Objekt, das den letzten Wert behaelt, meldet die Zeit EINES Dateisatzes als die
   *  Zeit des ganzen Batches — gemessen 31.10. 23:04 an 500 Notizen, wo "lesen" mit 0,12
   *  aus dem Kopf kam, waehrend "gesamt" 829,82 nannte. */
  const abschnitte = (): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const [name, wert] of marken) out[name] = (out[name] || 0) + wert;
    out.gesamt = ms(start, process.hrtime.bigint());
    return out;
  };
  return {
    marke(name: string): void {
      const jetzt = process.hrtime.bigint();
      marken.push([name, ms(bisher, jetzt)]);
      bisher = jetzt;
    },
    werte: abschnitte,
    /** Kopf-Wert, z. B. "zaehlung=0.41;einbettung=2.10;gesamt=2.55". Die Marken lassen sich
     *  mitgeben, damit Leib und Kopf DERSSELBE Zahl nennen und nicht zwei, die eine
     *  Mikrosekunde auseinanderliegen. */
    kopf(grund: Record<string, number> = abschnitte()): string {
      return Object.entries(grund)
        .map(([name, wert]) => `${name}=${wert.toFixed(2)}`)
        .join(";");
    },
  };
}

/**
 * Auf dieselbe Kruemmung wie der Kopf: zwei Stellen. Leib und Kopf muessen DIESSELBE Zahl
 * nennen — ohne diesen Griff steht im Kopf `0.05` und im Leib `0.051`, und ein Vergleich
 * der beiden Traeger faellt, obwohl beide recht haben. (Gemessen an diesem Fall, 24.10.
 * 15:31:41 MESZ: erwartet 0.05, erhalten 0.051.)
 */
export function gerundet(werte: Record<string, number>): Record<string, number> {
  const aus: Record<string, number> = {};
  for (const [name, wert] of Object.entries(werte)) aus[name] = Math.round(wert * 100) / 100;
  return aus;
}
