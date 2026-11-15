// Die Wache ueber den Namen einer Metrik — nicht ueber ihren Wert.
//
// Warum es sie braucht (gemessen 13.10., Leitung): `npm run eval` teilte die Treffer
// innerhalb der ersten fuenf durch `min(5, relevante Notizen)` und nannte das Ergebnis
// `Precision@5`. Geteilt durch 5 haette Precision geheiessen — mit diesem Korpus waere
// dasselbe Wort eine andere Zahl gewesen (81 % gegen 23 % auf demselben Bestand).
// Der Kern hatte die Silbe am 12.10. richtiggestellt; die App hatte sie noch nicht
// nachgezogen. Ein Wert, der richtig ist und falsch heisst, verkauft sich als
// Vergleich, den niemand gezogen hat — und die README der App sagte ausserdem
// "measures Hit@1 and Precision@5".
//
// Diese Datei prueft vier Dinge, alle am Quelltext, weil die Rechenstelle und der Name
// in derselben Datei stehen muessen: (1) die Silbe folgt der Rechnung, (2) die beiden
// Werkzeuge desselben Korpus benutzen nicht dasselbe Wort fuer verschiedene Nenner,
// (3) beide Werkzeuge bauen denselben Korpus auf — seit dem 3.11. aus einer Hand, und
// (4) dieser Aufbau nennt seine Zeit selbst, statt sie vom Kalender zu holen.
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const wurzel = process.cwd();
const lies = (rel: string) => readFileSync(path.join(wurzel, rel), "utf8");

/** Die gedruckte Silbe einer Kennzahl — nur Zeilen, die wirklich ausgegeben werden. */
function gedruckteSilben(text: string, silbe: RegExp): string[] {
  return text
    .split("\n")
    .filter((zeile) => /console\.log\(/.test(zeile) && silbe.test(zeile))
    .map((zeile) => zeile.trim());
}

describe("eval-metrik: der name einer kennzahl folgt ihrer rechnung", () => {
  const evalText = () => lies("scripts/eval.ts");
  const ablationText = () => lies("scripts/ablation.ts");

  it("eval teilt durch min(5, relevante) und sagt Recall@5 (gekappt)", () => {
    const text = evalText();
    // Die Rechnung: der Nenner ist die Kappe, nicht die Fuenf.
    expect(text, "die Rechenstelle ist nicht mehr die gekappte — dann stimmt der Name unten nicht")
      .toMatch(/Math\.min\(\s*5,\s*Math\.max\(\s*1,\s*\w+\.relevant\.length\s*\)\s*\)/);
    // Und der Name, der daraus folgt.
    expect(gedruckteSilben(text, /Recall@5 \(capped\)/).length, "kein ausgegebenes Recall@5 (gekappt)").toBeGreaterThan(0);
    expect(gedruckteSilben(text, /Precision@5/), `die Ausgabe nennt weiter Precision@5: ${gedruckteSilben(text, /Precision@5/).join(" | ")}`)
      .toEqual([]);
  });

  it("die wache sieht eine ausgabe, die precision sagt und recall rechnet", () => {
    // Gegenprobe: ohne sie ist der fall oben ein kommentar ueber einen text, den
    // niemand mehr aendern kann.
    const geraubt = evalText().replace("Recall@5 (capped): ${(p5 * 100)", "Precision@5: ${(p5 * 100)");
    expect(gedruckteSilben(geraubt, /Precision@5/).length, "der pruefer merkt die umbenannte ausgabe nicht").toBeGreaterThan(0);
  });

  it("ablation teilt durch 5 und nennt das P@5 — zwei metriken, zwei namen", () => {
    const text = ablationText();
    expect(text, "die ablation teilt nicht mehr durch 5 — dann ist ihre silbe nicht mehr P@5")
      .toMatch(/\.length\s*\/\s*5\b/);
    expect(gedruckteSilben(text, /P@5/).length, "keine ausgegebenes P@5 in der ablation").toBeGreaterThan(0);
    // Das Wort, das die Verwechslung war: dieselbe Silbe fuer beide Nenner.
    expect(text).not.toMatch(/Recall@5/);
  });

  it("beide werkzeuge bauen denselben korpus — ein aufbau, zwei werkzeuge", () => {
    // Der Selbstblick am 2.11. fand es, die Heilung sitzt seit dem 3.11.: eval.ts baute
    // seinen Store jahrelang selbst (ohne Entitaeten, ohne Index-Spuren), ablation.ts
    // den geteilten mit. Dieselben Woerter, zwei Systeme, zwei Wahrheiten — und die
    // Zahl der Flaeche stammte aus dem schwacheren. Ein eigener Aufbau in einem
    // Messwerkzeug ist kein Detail, er ist die Messung.
    for (const [name, text] of [
      ["eval", evalText()],
      ["ablation", ablationText()],
    ] as const) {
      expect(text, `${name} holt den Aufbau nicht mehr aus scripts/eval-store.ts`).toMatch(/from "\.\/eval-store"/);
      expect(text, `${name} ruft korpusAufbauen nicht auf`).toMatch(/korpusAufbauen\s*\(/);
      expect(text, `${name} baut den Speicher wieder in eigener Regie — dann ist seine Zahl nicht die des anderen Werkzeugs`)
        .not.toMatch(/new KeptaStore\(/);
    }
  });

  it("der geteilte Aufbau setzt die Zeit des Korpus fest, nicht den echten Kalender", () => {
    // src/core/store.ts:759 setzt `Date.now()`, wo ein Aufrufer keine Zeit nennt. Ein
    // Korpus ohne Zeitanker wandert mit dem Tag, an dem jemand `npm run eval` laesst:
    // der Recency-Boost verschiebt sich, und derselbe Commit meldet zwei Zahlen.
    const zeitAnker = /createdAt: m\.updatedAt \?\? EVAL_NOW/;
    const text = lies("scripts/eval-store.ts");
    expect(text, "der geteilte Aufbau nennt keine feste Zeit — das Eval ist nicht wiederholbar").toMatch(zeitAnker);
    // Gegenprobe: ohne sie beschreibt der Fall oben einen Zustand, den niemand aendern kann.
    const ohneAnker = text.replace(zeitAnker, "createdAt: undefined");
    expect(ohneAnker, "der pruefer merkt den verlorenen Zeitanker nicht").not.toMatch(zeitAnker);
  });

  it("die flaeche behauptet keine precision, wo die engine recall meldet", () => {
    const readme = lies("README.md");
    const zeilen = readme.split("\n");
    const treffen = zeilen
      .map((z, i) => ({ z, nr: i + 1 }))
      .filter(({ z }) => /Precision@5/.test(z) && /npm run eval/.test(z));
    expect(treffen, `README nennt eval eine Precision: ${treffen.map((t) => t.nr).join(", ")}`).toEqual([]);
  });
});
