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
  return {
    marke(name: string): void {
      const jetzt = process.hrtime.bigint();
      marken.push([name, ms(bisher, jetzt)]);
      bisher = jetzt;
    },
    /** ms je Marke, zuzueglich "gesamt" seit dem Aufruf von zeitnahme() */
    werte(): Record<string, number> {
      const out: Record<string, number> = {};
      for (const [name, wert] of marken) out[name] = wert;
      out.gesamt = ms(start, process.hrtime.bigint());
      return out;
    },
    /** Kopf-Wert, z. B. "zaehlung=0.41;einbettung=2.10;gesamt=2.55" */
    kopf(): string {
      return Object.entries(this.werte())
        .map(([name, wert]) => `${name}=${wert.toFixed(2)}`)
        .join(";");
    },
  };
}
