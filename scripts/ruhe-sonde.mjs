// Die Ruhe-Sonde: meldet, ob diese Maschine gerade ein Urteil ueber Zeitfaelle
// erlauben WUERDE — und haelt es zurueck, wenn nicht.
//
// WARUM DREI BEWEISE STATT EINEM: die erste Sonde im Haus (F10) verglich einen
// Median mit einer Schwelle und meldete "ruhig" bei zwei gleichzeitigen vollen
// Suite-Laeufen. Gemessen am 11.10. auf diesem Rechner (10 Kerne), mit vier
// gesetzten Busy-Loop-Kindern:
//
//   ruhig        : median 6,4 ms  max/median 1,26  node-Prozesse 3  load1/cpu 0,48
//   unter last   : median 9,0 ms  max/median 2,97  node-Prozesse 7  load1/cpu 0,48
//   nach kill    : median 6,6 ms  max/median 1,09  node-Prozesse 3  load1/cpu 0,48
//
// Der Median bleibt unter Last fast, wo er war (6,4 -> 9,0 ms): eine Schwellzahl
// darauf allein ist der gruene Nichtstuer. Was die Last sieht, sind die Ausreisser
// (max/median 1,26 -> 2,97) und die Zahl der Node-Prozesse (3 -> 7). Der load
// average reichte hier NICHT als Entscheidungsgrund — er veraenderte sich binnen
// Sekunden nicht; er wird gemeldet, aber nicht verlangt.
//
// Grenzen: aus diesen Messungen, mit Puffer nach oben, nicht gefuehlt.
import os from "node:os";
import { execSync } from "node:child_process";

export const GRENZEN = {
  /** Der Rechenwurf darf im Median nicht ueber diese Zeit kommen (gemessen 6,4 ms). */
  medianMs: 20,
  /** Ausreisser relativ zum Median (ruhig 1,1-1,3; unter Last 2,97). */
  maxMedianRatio: 1.8,
  /** Andere Node-Prozesse auf dem Rechner (ruhig 3; unter Last 7). */
  nodeProzesse: 5,
  /** Stuetzender Wert, nie alleiniger Grund (macOS-Loadmittel traegt hier nicht). */
  last1ProCpu: 2.5,
};

/** Ein Wurf mit bekannter Rechenarbeit — klein genug fuer die Suite, gross genug fuer Messung. */
function wurf(iterationen) {
  const start = process.hrtime.bigint();
  let acc = 0;
  for (let i = 1; i <= iterationen; i++) acc += Math.sqrt(i % 997) * 1.000001;
  if (acc < 0) console.error("unmoeglich");
  return Number(process.hrtime.bigint() - start) / 1e6;
}

function nodeProzesse() {
  try {
    return Number(execSync("pgrep -x node | wc -l", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim());
  } catch {
    return Number.NaN;
  }
}

/**
 * Die Messung. `stiche` klein halten — die Sonde laeuft in der Suite.
 * @param {{stiche?: number, iterationen?: number}} [optionen]
 */
export function sonde({ stiche = 9, iterationen = 9_000_000 } = {}) {
  const dauern = [];
  for (let i = 0; i < stiche; i++) dauern.push(wurf(iterationen));
  const sortiert = [...dauern].sort((a, b) => a - b);
  const median = sortiert[Math.floor(sortiert.length / 2)];
  const maximum = sortiert[sortiert.length - 1];
  const minimum = sortiert[0];
  const cpus = os.cpus().length || 1;
  return {
    stiche,
    iterationen,
    medianMs: Math.round(median * 100) / 100,
    minimumMs: Math.round(minimum * 100) / 100,
    maximumMs: Math.round(maximum * 100) / 100,
    maxMedianRatio: Math.round((maximum / median) * 100) / 100,
    last1ProCpu: Math.round((os.loadavg()[0] / cpus) * 100) / 100,
    cpus,
    nodeProzesse: nodeProzesse(),
  };
}

/**
 * Das Urteil: drei Beweise, einer muss reichen zum Zurueckhalten.
 * @param {object} messung eine Messung aus sonde()
 * @param {Partial<typeof GRENZEN>} [grenzen]
 * @returns {{ruhig: boolean, ursachen: string[], messung: ReturnType<typeof sonde>, grenzen: typeof GRENZEN}}
 */
export function ruedig(messung, grenzen = {}) {
  const g = { ...GRENZEN, ...grenzen };
  const ursachen = [];
  if (!(messung.medianMs <= g.medianMs)) ursachen.push(`Median ${messung.medianMs} ms ueber ${g.medianMs} ms`);
  if (!(messung.maxMedianRatio <= g.maxMedianRatio)) {
    ursachen.push(`Ausreisser: max/median ${messung.maxMedianRatio} ueber ${g.maxMedianRatio} (max ${messung.maximumMs} ms bei Median ${messung.medianMs} ms)`);
  }
  if (Number.isFinite(messung.nodeProzesse) && !(messung.nodeProzesse <= g.nodeProzesse)) {
    ursachen.push(`${messung.nodeProzesse} node-Prozesse ueber ${g.nodeProzesse}`);
  }
  if (!(messung.last1ProCpu <= g.last1ProCpu)) {
    ursachen.push(`load1/cpu ${messung.last1ProCpu} ueber ${g.last1ProCpu} (stuetzender Wert)`);
  }
  return { ruhig: ursachen.length === 0, ursachen, messung, grenzen: g };
}

/** Kurztext fuer Meldungen: eine Zeile, alle Werte, kein Rat. */
export function beschlag(messung) {
  return `Maschine: Median ${messung.medianMs} ms, max/median ${messung.maxMedianRatio}, ${messung.nodeProzesse} node-Prozesse, load1/cpu ${messung.last1ProCpu} auf ${messung.cpus} Kernen`;
}
