// Der Ruhe-Beweis — die Scheibe, an der der Kern hinter der Flaeche zurueck war.
//
// Behauptung: ein Bestand trennt seine eigenen Scheiben, bevor er gezeichnet wird.
// Gemessen wird NACH dem Gesetz des Kerns selbst, ungedeckelt
// (`scheibenRadius(grad, 0)`, die Zahl, die `scripts/graf-bild.mjs` malt und die
// ein beliebiger Client malt), und nach dem Gesetz der Flaeche
// (min(18, 4 + log2(1+grad)*2,2)) — die zweite Zaehlung ist die haertere Probe,
// weil sie ein Bild prueft, das sie nicht selbst gerechnet hat.
//
// Gepruefft wird ausserdem die Lesbarkeit selbst, pro Groessenklasse und mit
// **zwei** Erwartungen: dem Verhaeltnis mediale echte Kante / mediales
// Kontrollpaar < 0,8 (dieselbe Bar wie `tests/ui/graph.test.ts:124`) und dem
// Anteil, den die kleinste Scheibe von der Weltseite bedeckt — mindestens 0,3 %,
// gemessen an unserer eigenen Flaeche (die malt heute 0,414 % am dichtesten
// Feld; `e2-code/nacht-12-10/rohdaten/flaechenanteil-1441.log`). Ohne die zweite
// Zahl waere die 0 als proportional vergroesserte Welt kaufbar: die verworfene
// Klammer x8 hat 0 Paare bei medialer Kante 4 629 WE und liegt mit Verhaeltnis
// 0,721 **unter** der 0,8-Bar. Gedruckt werden beide Zahlen, damit das Urteil und
// sein Grund in derselben Zeile stehen.
//
// Vorher (Stand 4: Welt 1000 mit Rueckklammerung je Schritt, keine Trennung).
// Aus `welt-stufe.json`, gemessen 12.10. 11:49-11:55 mit demselben Feld wie hier:
// 50 / 1 019 / 7 325 Paare bei 427 / 1 527 / 3 027 Knoten im gelieferten 140-Tick-
// Bild, und 147 / 961 / 4 312 in der echten Ruhe (alpha-Boden) — die Klemmung
// liess den Stapel als "ruhig" melden, weil sie die Bewegung auf Null dämpfte.
//
// Laufzeit: 2 522 ms fuer die Datei im Lauf von 12.10. 12:56 (ruhige Maschine,
// Log `e2-code/nacht-12-10/rohdaten/faelle-allein-12-10-1256.log`); die beiden
// vom Reporter gedruckten Faelle kosten 597 ms (1 500 Notizen) und 1 850 ms
// (3 000). Wie sich das auf Relaxation und Nachzaehlung aufteilt, ist hier nicht
// gemessen und wird hier auch nicht behauptet.
import { describe, it, expect } from "vitest";
import { berechneWelt, SCHLIFF_DURCHGAENGE, type KraftKante, type KraftKnoten, type WeltDiagnose } from "../src/core/graf-kraft";
import { scheibenRadius } from "../src/core/graf-vertrag";

const BEGRIFFE = 27;

/** Derselbe dichte Kunstbestand wie die Kosten-Wache: drei Erwaehnungen je Notiz,
 *  jede sechste Notiz vier — bei 3 000 Notizen 9 500 Kanten an 27 Begriffen. */
function cliqueFeld(notizen: number) {
  const knoten: KraftKnoten[] = [];
  const kanten: KraftKante[] = [];
  const grade = new Map<string, number>();
  const begr = (i: number) => `e-b${i}`;
  const zahl = (id: string) => grade.set(id, (grade.get(id) ?? 0) + 1);
  for (let i = 0; i < BEGRIFFE; i++) knoten.push({ id: begr(i), scheibe: 0 });
  for (let n = 0; n < notizen - BEGRIFFE; n++) {
    const id = `k-${String(n).padStart(5, "0")}`;
    knoten.push({ id, scheibe: 0 });
    const wieviel = n % 6 === 5 ? 4 : 3;
    for (let m = 0; m < wieviel; m++) {
      const ziel = begr((n * 3 + m * 7 + (n % 11)) % BEGRIFFE);
      kanten.push({ quelle: id, ziel, sorte: "echt", feder: 0.5 });
      zahl(id);
      zahl(ziel);
    }
  }
  // Der Radius kommt aus dem Vertrag — dieselbe Formel, die gemalt wird, nicht
  // eine zweite fuer den Test erfunden.
  const scheibe = new Map<string, number>();
  const mitScheibe = knoten.map((k) => {
    const r = scheibenRadius(grade.get(k.id) ?? 0, 0);
    scheibe.set(k.id, r);
    return { id: k.id, scheibe: r };
  });
  return { knoten: mitScheibe, kanten, grade, scheibe };
}

function schneidendePaare(platze: Map<string, { x: number; y: number }>, radius: (id: string) => number) {
  const ids = [...platze.keys()];
  const paare: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    const a = platze.get(ids[i])!;
    const ra = radius(ids[i]);
    for (let j = i + 1; j < ids.length; j++) {
      const b = platze.get(ids[j])!;
      const soll = ra + radius(ids[j]);
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < soll) paare.push(`${ids[i]}(${ra.toFixed(1)}) x ${ids[j]}(${radius(ids[j]).toFixed(1)}) abstand ${d.toFixed(1)} < ${soll.toFixed(1)}`);
    }
  }
  return paare;
}

describe("never overlap: der Kern trennt seine Scheiben in der Ruhe", () => {
  for (const notizen of [400, 1500, 3000]) {
    it(`trennt ${notizen} Notizen an ${BEGRIFFE} Begriffen — nach eigener Regel UND nach der Regel der Flaeche`, () => {
      const feld = cliqueFeld(notizen);
      const diagnose: WeltDiagnose = { ticks: 0, alpha: 0, besuche: 0 };
      const anfang = performance.now();
      const platze = berechneWelt({ knoten: feld.knoten, kanten: feld.kanten }, diagnose);
      const ms = performance.now() - anfang;

      // Die Abkuehlung muss wirklich zu Ende sein. Seit Stand 5 endet die
      // Relaxation im Ticks-Budget (140) und der Schliff trennt danach weiter:
      // Ruhe heisst hier, dass ein Ueberlauf des Schliffs keine ECHTE Ueberlappung
      // mehr gefunden hat. Die Obergrenze erreicht zu heissen waere das Gegenteil —
      // ein Bild, das nur nach Budget endet, ist ein Abbruch, keine Ruhelage.
      expect(diagnose.ticks, `die Relaxation endete im Budget (${diagnose.ticks})`).toBeLessThan(1000);
      expect(
        diagnose.schliif ?? 0,
        `der Schliff endete an seiner Obergrenze (${diagnose.schliif}) — es lagen noch Paare zusammen`
      ).toBeLessThan(SCHLIFF_DURCHGAENGE);
      expect(diagnose.anDerWand ?? 0, "zu viele Plaetze an den Weltgrenzen — die Klemmung wre wieder da").toBeLessThan(20);

      const eigene = schneidendePaare(platze, (id) => feld.scheibe.get(id) ?? 0);
      const flaeche = schneidendePaare(platze, (id) => Math.min(18, 4 + Math.log2(1 + (feld.grade.get(id) ?? 0)) * 2.2));

      // Die Lesbarkeitskontrolle laeuft MIT, im selben Kanal wie die 0: die mediale
      // echte Kante gegen die mediale Entfernung zufaelliger Paare. Ohne diese
      // zweite Zahl ist eine 0 als Streufeld kaufbar — die verworfene Klammer x8
      // hatte 0 Paare bei medialer Kante 4 629 WE (Verhaeltnis 0,72) und ist damit
      // kein Bild. Dieselbe Groessenordnung, dieselbe Bar wie `tests/ui/graph.test.ts`.
      const med = (x: number[]) => [...x].sort((a, b) => a - b)[Math.floor(x.length / 2)] ?? 0;
      const ort = (id: string) => platze.get(id)!;
      const echte = feld.kanten.map((k) => Math.hypot(ort(k.quelle).x - ort(k.ziel).x, ort(k.quelle).y - ort(k.ziel).y));
      let keim = 11;
      const rnd = () => ((keim = (keim * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      const ids = [...platze.keys()];
      const kontrolle: number[] = [];
      for (let i = 0; i < 400; i++) {
        const a = ids[Math.floor(rnd() * ids.length)]!;
        const b = ids[Math.floor(rnd() * ids.length)]!;
        if (a !== b) kontrolle.push(Math.hypot(ort(a).x - ort(b).x, ort(a).y - ort(b).y));
      }
      const medialeKante = med(echte);
      const kontrollpaar = Math.max(1, med(kontrolle));
      const verhaeltnis = medialeKante / kontrollpaar;

      // Der zweite Halt gegen denselben Betrug, und er ist an unserer eigenen
      // Flaeche gemessen, nicht erfunden. Das Verhaeltnis allein laesst die
      // Klammer x8 durch (**0,721 < 0,8**), weil dort Welt und Kanten *proportional*
      // wachsen — nach der Normierung des Clients sieht beides gleich geordnet aus.
      // Was sich nicht wegnormieren laesst, ist die Groesse einer Scheibe zur
      // Weltseite. Gemessen an `kepta-app` mit denselben drei Feldern
      // (`e2-code/nacht-12-10/skripte/flaechenanteil.mts`, Log
      // `rohdaten/flaechenanteil-1441.log`, 12.10. 14:41): die kleinste von der
      // Flaeche gemalte Notizscheibe ist 8,40 WE (Radiusregel
      // `kepta-app/src/components/KnowledgeGraph.tsx:1418`, Regler auf Stand
      // `:84`; Weltseite `kepta-app/src/lib/graphLayout.ts:521`) bei
      // 901 / 1 557 / 2 031 WE — also **0,932 % / 0,540 % / 0,414 %**. Der
      // kleinste Wert, den unsere Flaeche heute malt, ist 0,414 %; die Kappe steht
      // eine Stufe darunter, auf 0,3 %. Zum Vergleich die verworfene Klammer x8:
      // 10,16 WE bei 19 684 WE Weltseite = 0,052 %, und 0 Paare trotzdem
      // (`rohdaten/trennung-stufe.log:35`).
      const radien = ids.map((id) => feld.scheibe.get(id) ?? 0);
      const notizRadius = Math.min(...radien);
      const weltseite = diagnose.welt ?? 0;
      const anteil = (notizRadius / weltseite) * 100;

      console.log(
        `[ruhe] knoten=${ids.length} kanten=${feld.kanten.length} ms=${ms.toFixed(0)} ticks=${diagnose.ticks} ` +
          `schliff=${diagnose.schliif} weltseite=${weltseite} anDerWand=${diagnose.anDerWand} ` +
          `paareEigen=${eigene.length} paareFlaeche=${flaeche.length} ` +
          `medialeKante=${medialeKante.toFixed(0)} kontrollpaar=${kontrollpaar.toFixed(0)} verhaeltnis=${verhaeltnis.toFixed(3)} ` +
          `notizRadius=${notizRadius.toFixed(2)} anteil=${anteil.toFixed(3)}%`
      );

      expect(eigene, `${eigene.length} Scheibenpaare schneiden sich nach der eigenen Regel: ${eigene.slice(0, 4).join(" | ")}`).toEqual([]);
      expect(flaeche, `${flaeche.length} Paare nach der Regel der Flaeche: ${flaeche.slice(0, 4).join(" | ")}`).toEqual([]);

      // Dieselbe Bar, dieselbe Richtung, dasselbe Mass wie `tests/ui/graph.test.ts:124`
      // (`expect(verhaeltnis).toBeLessThan(0.8)`) — nicht fuer ein 60-Notizen-Bild,
      // sondern hier, pro Groessenklasse. Sie haelt ein Bild fuer geordnet, das
      // sonst wie ein Wuerfen aussieht (ein ungeordnetes Feld waere ~1,0). Allein
      // haelt sie die proportional vergoesserte Welt nicht auf — die verworfene
      // Klammer x8 liegt mit 0,721 unter ihr; dafuer steht die Anteil-Kappe da.
      expect(
        verhaeltnis,
        `${ids.length} Knoten: die 0 ist ein Streufeld, kein Bild — mediale echte Kante ${medialeKante.toFixed(0)} WE gegen Kontrollpaar ${kontrollpaar.toFixed(0)} WE, Verhaeltnis ${verhaeltnis.toFixed(3)} gegen die Bar 0,8`
      ).toBeLessThan(0.8);

      expect(
        anteil,
        `${ids.length} Knoten: die kleinste Scheibe bedeckt ${anteil.toFixed(3)} % der Weltseite (Notizradius ${notizRadius.toFixed(2)} WE bei Weltseite ${weltseite} WE) — die Flaeche malt heute mindestens 0,414 % (kleinster gemessener Wert, ` +
          `e2-code/nacht-12-10/rohdaten/flaechenanteil-1441.log), die Kappe steht eine Stufe darunter auf 0,3 %`
      ).toBeGreaterThanOrEqual(0.3);
    }, 180000);
  }
});
