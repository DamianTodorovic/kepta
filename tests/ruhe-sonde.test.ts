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
    const basis = sonde({ stiche: 9 });
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
    // Wenigstens einer der last-sensiblen Beweise muss nennen, was die Medianschwelle
    // allein nicht sieht. (Beide zugleich verlangt waere ein Urteil ueb den
    // Scheduler dieses Laufes, nicht ueber die Regel.)
    expect(urteil.ursachen.join(" | ")).toMatch(/max\/median|node-Prozesse/);
    expect(urteil.ursachen.length).toBeGreaterThan(0);

    // Der gruene Nichtstuer, bewiesen ohne Wetterabhaengigkeit: die Last ist an den
    // Ausreissern und an den Prozessen sichtbar, waehrend der Median nahe an der
    // Vor-Last-Messung bleibt. Ein absolute Medianschwelle hier waere selbst eine
    // Zeitmessung unter Last gewesen — und die ist in diesem Haus kein Urteil.
    const vorLast = basis.medianMs;
    // Was unter gesetzter Last gilt: (a) die Sonde haelt das Urteil zurueck,
    // (b) die Struktur sieht die Last — vier eigene Kinder heben die Zahl der
    // node-Prozesse ueber die Grenze, (c) der Median allein steigt kaum: hier blieb er
    // unter dem Vierfachen der Vorlast-Basis. Genau darum ist die Regel eine ODER-
    // Kette aus drei Zeugen (median, max/median, prozesse): auf diesem Rechner sah
    // beim einen Lauf der Ausreisser die Last (1,26 -> 2,97), beim naechsten blieb er
    // unter seiner Grenze — ein einzelner Zeuge ist keine Sonde, und eine absolute
    // Medianschwelle als beweis ist genau die zeitmessung unter last, die wir nicht
    // als Urteil gelten lassen.
    expect(m!.medianMs).toBeLessThan(vorLast * 4);
    expect(m!.nodeProzesse).toBeGreaterThan(GRENZEN.nodeProzesse);
    const nurMedian = ruedig(m!, {
      medianMs: Math.max(GRENZEN.medianMs, vorLast * 4),
      maxMedianRatio: Number.POSITIVE_INFINITY,
      nodeProzesse: Number.POSITIVE_INFINITY,
      last1ProCpu: Number.POSITIVE_INFINITY,
    });
    expect(nurMedian.ruhig, "der median-zeuge allein haette 'ruhig' gemeldet — die Last war nicht messbar").toBe(true);
  });

  it("traegt das Urteil nicht allein aus dem load average", () => {
    // Auf diesem Rechner blieb load1/cpu bei gesetzter Last unveraendert (~0,5).
    // Die Sonde darf den Wert melden, aber nicht als einzigen Grund verlangen.
    const m = sonde({ stiche: 5 });
    const urteil = ruedig(m);
    if (!urteil.ruhig) {
      expect(urteil.ursachen.some((u) => /medianMs|max\/median|node-Prozesse/.test(u))).toBe(true);
    } else {
      expect(m.maxMedianRatio).toBeLessThanOrEqual(1.8);
    }
  });

  it("kennt seine Schwellen aus der Messung, nicht aus dem Kopf", () => {
    const m = sonde({ stiche: 7 });
    expect(m.medianMs).toBeGreaterThan(1); // der Wurf ist schwer genug, um Messung zu sein
    expect(m.stiche).toBe(7);
  });
});
