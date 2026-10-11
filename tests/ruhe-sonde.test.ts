import { describe, it, expect } from "vitest";
import { ChildProcess, spawn } from "node:child_process";
import { GRENZEN, ruedig, sonde } from "../scripts/ruhe-sonde.mjs";

// F10s Ruhe-Sonde hat bei zwei gleichzeitigen vollen Suite-Laeufen "ruhig" gemeldet.
// Eine Sonde, die nur einen Median gegen eine Schwelle prüft, sieht genau das nicht:
// unter Last bleibt der Median nahe beieinander, die Ausreisser laufen weg. Diese
// Faelle setzen die Last selbst — und verlangen von der Sonde, dass sie das URTEIL
// zurueckhaelt, statt es zu faellen.

/** Vier Busy-Loop-Kinder, die die Maschine belegen. */
function lastSetzen(anzahl = 4): ChildProcess[] {
  return Array.from({ length: anzahl }, () => spawn(process.execPath, ["-e", "while(true){Math.random();}"], { stdio: "ignore" }));
}
function lastLoesen(kinder: ChildProcess[]) {
  for (const kind of kinder) {
    try {
      kind.kill("SIGKILL");
    } catch {
      /* schon weg */
    }
  }
}

describe("Die Ruhe-Sonde haelt ihr Urteil zurueck, wenn die Maschine belegt ist", () => {
  it("misst sieben Groessen, und zwar als Zahlen", () => {
    const m = sonde({ stiche: 5 });
    const felder = ["medianMs", "minimumMs", "maximumMs", "maxMedianRatio", "last1ProCpu", "nodeProzesse", "stiche"] as const;
    for (const feld of felder) {
      expect(Number.isFinite(Number(m[feld])), `${feld} ist keine Zahl: ${JSON.stringify(m)}`).toBe(true);
    }
    expect(m.stiche).toBe(5);
  });

  it("ueberspringt bei gesetzter Last — und die Medianschwelle allein haette 'ruhig' gesagt", () => {
    const kinder = lastSetzen();
    let m: ReturnType<typeof sonde> | null = null;
    try {
      // kurz warten, damit die Kinder wirklich Rechenscheiben belegen
      const bis = Date.now() + 1200;
      while (Date.now() < bis) {
        /* warten */
      }
      m = sonde({ stiche: 9 });
    } finally {
      lastLoesen(kinder);
    }
    const urteil = ruedig(m!);
    expect(urteil.ruhig, `Sonde meldet ruhig trotz vier Busy-Loops: ${JSON.stringify(m)}`).toBe(false);
    // Welcher der drei Zeugen an einem laufenden Prozess die fuehrende Ursache ist,
    // entscheidet dessen Scheduler. Verlangt waere hier eine bestimmte — also ein
    // Urteil ueb den Lauf, nicht ueb die Regel. Deshalb das ODER im Muster.
    expect(urteil.ursachen.join(" | ")).toMatch(/Median \d|Ausreisser|node-Prozesse/);
    expect(urteil.ursachen.length).toBeGreaterThan(0);
    // Vier eigene Kinder heben die Zahl der node-Prozesse ueber die Grenze: eine
    // Zaehlung ueb die eigene Prozessgruppe, keine Zeitmessung.
    expect(m!.nodeProzesse).toBeGreaterThan(GRENZEN.nodeProzesse);

    // Der blinde Fleck der Medianschwelle, bewiesen an gesetzten Zahlen statt an
    // diesem Rechner. Vorher war der Beweiss ein Verhaeltnis zweier Live-Messungen
    // (Median unter Last < 4x Median vor Last). Auf dem 4-Kern-Runner war es 4,23x —
    // vier Busy-Loops stehlen dort einen groesseren Teil der Rechenscheiben als auf
    // einem 10-Kern-Rechner, wo die Sonde gruen aussah. Damit entschied die Maschine
    // ueber die Regel, und eine Zeitmessung unter Last ist in diesem Haus kein Urteil
    // (F10, Befund der Leitung am 12.10. aus dem roten Lauf 38182756836).
    const lastOhneMedian = {
      stiche: 9,
      iterationen: 9_000_000,
      medianMs: 12,
      minimumMs: 10,
      maximumMs: 40,
      maxMedianRatio: 3.33,
      last1ProCpu: 0.4,
      cpus: 4,
      nodeProzesse: 11,
    };
    const nurMedian = ruedig(lastOhneMedian, {
      maxMedianRatio: Number.POSITIVE_INFINITY,
      nodeProzesse: Number.POSITIVE_INFINITY,
      last1ProCpu: Number.POSITIVE_INFINITY,
    });
    expect(
      nurMedian.ruhig,
      "der Median-zeuge allein haette 'ruhig' gemeldet, obwohl Ausreisser und Prozesse die Last sehen"
    ).toBe(true);
    const alleZeugen = ruedig(lastOhneMedian);
    expect(alleZeugen.ruhig, "die ODER-Kette muss dieselbe Messung als Last sehen").toBe(false);
    expect(alleZeugen.ursachen.join(" ")).toMatch(/Ausreisser/);
    expect(alleZeugen.ursachen.join(" ")).toMatch(/node-Prozesse/);
  });

  it("traegt das Urteil nicht allein aus dem load average", () => {
    // Auf diesem Rechner blieb load1/cpu bei gesetzter Last unveraendert (~0,5).
    // Die Sonde darf den Wert melden, aber nicht als einzigen Grund verlangen —
    // der Fund der Leitung (12.10. 00:18): beschriftet als "stuetzender Wert",
    //zaehlte der load in dieselbe Liste wie die Zeugen und wurde damit zur
    // veto-Kante. Auf einem 4-Kerner-Runner ist ein hoher load1/cpu bei ruhiger
    // Messei Normalbetrieb; die Sonde haette gruene Laeufe abgelehnt.
    const m = sonde({ stiche: 5 });
    const urteil = ruedig(m);
    if (!urteil.ruhig) {
      expect(urteil.ursachen.some((u) => /Median \d|Ausreisser|node-Prozesse/.test(u))).toBe(true);
    } else {
      expect(m.maxMedianRatio).toBeLessThanOrEqual(1.8);
    }

    // derselbe Anspruch an einem gesetzen Wert: nur load fuehrt kein Urteil
    const messung = {
      stiche: 9,
      iterationen: 9_000_000,
      medianMs: 5,
      minimumMs: 4,
      maximumMs: 5,
      maxMedianRatio: 1,
      last1ProCpu: 9,
      cpus: 10,
      nodeProzesse: 0,
    };
    const nurLast = ruedig(messung);
    expect(nurLast.ruhig, "load allein darf keinen Lauf aufhalten").toBe(true);
    expect(nurLast.ursachen).toEqual([]);
    expect(nurLast.meldungen.join(" ")).toMatch(/load1\/cpu 9 ueber .*stuetzender Wert/);

    // zusammen mit einem echten Zeugen ist er Begruendung, nicht Grund
    const mitZeuge = ruedig({ ...messung, nodeProzesse: 12 });
    expect(mitZeuge.ruhig).toBe(false);
    expect(mitZeuge.ursachen.join(" ")).toMatch(/node-Prozesse/);
    expect(mitZeuge.ursachen.join(" ")).toMatch(/load1\/cpu/);
  });

  it("kennt seine Schwellen aus der Messung, nicht aus dem Kopf", () => {
    const m = sonde({ stiche: 7 });
    expect(m.medianMs).toBeGreaterThan(1); // der Wurf ist schwer genug, um Messung zu sein
    expect(m.stiche).toBe(7);
  });
});
