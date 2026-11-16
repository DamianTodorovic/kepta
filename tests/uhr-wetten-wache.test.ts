// @vitest-environment node
//
// Zwei Klassen von Zeit-Erwartungen, die nicht den Code pruefen, sondern das Wetter.
// Beide sind am 16.11.2026 an echten CI-Laeufen gerissen, nicht an einer Vermutung:
//
// A — zwei Wanduhr-Stempel muessen verschieden sein. `tests/server-suche-teilzeiten-zahlen.test.ts`
//     verlangte `expect(kaltZeit).not.toBe(warmZeit)` mit zwei `new Date().toISOString()`.
//     Eine Suche kostet auf CI ~1 ms (gesamt 1.18 / 1.089); drei gruene Laeufe bestanden nur,
//     weil die Stempel zufaellig 1 ms auseinander lagen (.370/.371, .757/.758, .373/.374).
//     Der rote Lauf landete in derselben Millisekunde (.266 zweimal). Geheilt auf die monotone
//     Uhr; diese Wache haelt die Klasse auf null, damit die Wette nicht zurueckkommt.
//
// B — eine Einzelstichprobe gegen eine ms-Latte. `tests/audit-wave1-core-security.test.ts`
//     riss bei 2041 ms gegen 2000 (2 % darueber), lokal kostet derselbe Griff 348 ms.
//     Geheilt auf drei Laeufe, der beste zaehlt, Latte unveraendert. Dieselbe Datei trug
//     eine zweite, die mein Hand-grep uebersehen hatte, weil er dreistellige Zahlen suchte:
//     `toBeLessThan(25)` — ein Sicherheits-Unterscheid (sofort abgewiesen gegen scrypt lief),
//     viermal je Lauf gewettet. Auch sie zaehlt jetzt den besten von zwei Laeufen.
//     Die uebrigen acht Stellen (duplicates, gemeinschaften, graphLayout ×4, schild,
//     widersprueche) sind ebenso geheilt: zwei Laeufe, der beste zaehlt, jede Latte
//     unveraendert. Gemessen 16.11.2026: die fuenf Dateien kosten zusammen 15.40 s vor
//     und 15.58 s nach der Heilung (+0.18 s); die schwerste Stelle (3000 Knoten,
//     20 Schritte) kostet 80 ms im besten von zwei Laeufen gegen eine Latte von 6000.
//     Darum steht hier null Toleranz und kein Bestand, der nur schrumpfen darf.
//
// Die Zaehlung wohnt im Baum, nicht in einem Papier: eine festgeschriebene Liste waere beim
// naechsten Fall schon die Lüge. Darum liest diese Wache den Baum selbst und nennt im Rot
// jede Fundstelle mit Datei und Zeile.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const WURZEL = path.resolve(import.meta.dirname, "..");
const EIGENE_DATEI = "uhr-wetten-wache.test.ts";

/** Alle Testdateien des Baums, in Lesereihenfolge. */
function testDateien(ordner: string): string[] {
  const out: string[] = [];
  for (const eintrag of fs.readdirSync(ordner, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const pfad = path.join(ordner, eintrag.name);
    if (eintrag.isDirectory()) out.push(...testDateien(pfad));
    else if (/\.test\.(ts|tsx|mts)$/.test(eintrag.name)) out.push(pfad);
  }
  return out;
}

function zeile(quell: string, index: number): number {
  return quell.slice(0, index).split("\n").length;
}

/**
 * Klasse A: eine Ungleichheits-Erwartung, deren beide Seiten Wanduhr-Stempel sind.
 * Gelesen wird nach Bauart — erst die Zuweisungen (`const x = Date.now()` /
 * `new Date().toISOString()`), dann die Erwartung auf zwei dieser Namen.
 */
export function wanduhrWetten(quell: string): { zeile: number; text: string }[] {
  const stempel = new Set<string>();
  for (const m of quell.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:new Date\(\)\.toISOString\(\)|Date\.now\(\))\s*;/g)) {
    stempel.add(m[1]!);
  }
  const funde: { zeile: number; text: string }[] = [];
  for (const m of quell.matchAll(/expect\(\s*([A-Za-z_$][\w$]*)\s*(?:,[^)]*)?\)\s*\.not\.toBe\(\s*([A-Za-z_$][\w$]*)\s*\)/g)) {
    if (stempel.has(m[1]!) && stempel.has(m[2]!)) {
      funde.push({ zeile: zeile(quell, m.index ?? 0), text: m[0] });
    }
  }
  return funde;
}

/**
 * Klasse B: eine ms-Latte an einer EINMAL genommenen Dauer — entweder als Differenz
 * zweier Uhrlesungen in der Erwartung selbst oder als eine daraus zugewiesene Variable.
 * `Math.min(...)` und andere Mehrfach-Messungen sind keine Einzelstichprobe und zaehlen
 * nicht; Statuscodes, Laengen und Abstaende ebenso wenig, weil ihre Zuweisung keine
 * Uhrdifferenz ist.
 */
export function einzelstichprobenLatten(quell: string): { zeile: number; text: string }[] {
  const dauer = new Set<string>();
  for (const m of quell.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:performance\.now\(\)|Date\.now\(\))\s*-\s*[A-Za-z_$][\w$]*\s*;/g)) {
    dauer.add(m[1]!);
  }
  const funde: { zeile: number; text: string }[] = [];
  const Uhr = "(?:performance\\.now\\(\\)|Date\\.now\\(\\))";
  const muster = new RegExp(
    `expect\\(\\s*(?:([A-Za-z_$][\\w$]*)|(${Uhr}\\s*-\\s*[A-Za-z_$][\\w$]*))\\s*(?:,[^)]*)?\\)\\s*\\.toBeLessThan\\(\\s*([0-9_]+)\\s*\\)`,
    "g",
  );
  for (const m of quell.matchAll(muster)) {
    if (m[2] || (m[1] && dauer.has(m[1]))) {
      funde.push({ zeile: zeile(quell, m.index ?? 0), text: m[0] });
    }
  }
  return funde;
}

/** Ein gebautes Exemplar beider Klassen plus die geheilten Formen, die NICHT zaehlen duerfen. */
const EXEMPLAR = [
  'const kaltZeit = new Date().toISOString();',
  'const warmZeit = new Date().toISOString();',
  'expect(kaltZeit).not.toBe(warmZeit);',
  'const a = Date.now();',
  'const b = Date.now();',
  'expect(a, "mit Meldung").not.toBe(b);',
  'const t0 = performance.now();',
  'const ms = performance.now() - t0;',
  'expect(ms).toBeLessThan(2000);',
  'const start = Date.now();',
  'expect(Date.now() - start).toBeLessThan(3000);',
  'const t1 = performance.now();',
  'const kurz = performance.now() - t1;',
  'expect(kurz).toBeLessThan(25);',
  // geheilte und fremde Formen — keine von ihnen ist eine Wette:
  'const u1 = performance.now();',
  'const u2 = performance.now();',
  'expect(u2).toBeGreaterThan(u1);',
  'const samples = [1, 2, 3];',
  'expect(Math.min(...samples), "drei Laeufe").toBeLessThan(2000);',
  'let best = Infinity;',
  'best = Math.min(best, 1);',
  'expect(best, "zwei Laeufe").toBeLessThan(25);',
  'const d = Math.hypot(3, 4);',
  'expect(d).toBeLessThan(600);',
  'expect(res.status).toBeLessThan(500);',
].join("\n");

describe("Die Uhr-Wetten-Wache: der Griff selbst", () => {
  it("findet beide Klassen am gebauten Exemplar — ein Fund von null waere ein kaputter Griff", () => {
    const a = wanduhrWetten(EXEMPLAR);
    const b = einzelstichprobenLatten(EXEMPLAR);
    expect(a.length, `Klasse A am Exemplar: ${JSON.stringify(a)}`).toBe(2);
    expect(b.length, `Klasse B am Exemplar: ${JSON.stringify(b)}`).toBe(3);
    expect(a.map((f) => f.zeile)).toEqual([3, 6]);
    // Die zweistellige Latte muss mitgefunden werden: mein Hand-grep hatte sie uebersehen,
    // weil er dreistellige Zahlen suchte — der Griff darf keine Ziffern-Zaehlung sein.
    expect(b.map((f) => f.zeile)).toEqual([9, 11, 14]);
  });

  it("zaehlt die geheilten und fremden Formen nicht mit", () => {
    const nurGeheilt = EXEMPLAR.split("\n").slice(15).join("\n");
    expect(wanduhrWetten(nurGeheilt)).toEqual([]);
    expect(einzelstichprobenLatten(nurGeheilt)).toEqual([]);
  });

  it("liest den ganzen Baum, nicht eine leere Liste", () => {
    const dateien = testDateien(path.join(WURZEL, "tests"));
    expect(dateien.length, "der Griff hat keine Testdateien gefunden — dann ist jede Klasse null").toBeGreaterThan(300);
    expect(dateien.filter((d) => path.basename(d) === EIGENE_DATEI).length).toBe(1);
  });
});

describe("Die Uhr-Wetten-Wache: der Bestand im Baum", () => {
  // Die eigne Datei traegt die Exemplare oben als Quelltext und wird darum ausgenommen —
  // genau eine, damit die Ausnahme nicht still wachsen kann.
  const dateien = testDateien(path.join(WURZEL, "tests")).filter((d) => path.basename(d) !== EIGENE_DATEI);
  const lies = (d: string) => fs.readFileSync(d, "utf8");
  const nenn = (f: { zeile: number; text: string }, d: string) => `${path.relative(WURZEL, d)}:${f.zeile} ${f.text}`;

  it("Klasse A: keine Ungleichheit zweier Wanduhr-Stempel mehr im Baum", () => {
    const funde = dateien.flatMap((d) => wanduhrWetten(lies(d)).map((f) => nenn(f, d)));
    expect(funde, `${funde.length} Wanduhr-Wetten — die Millisekunde ist keine Eigenschaft:\n${funde.join("\n")}`).toEqual([]);
  });

  it("Klasse B: keine Einzelstichproben-Latte mehr im Baum", () => {
    const funde = dateien.flatMap((d) => einzelstichprobenLatten(lies(d)).map((f) => nenn(f, d)));
    // Bestand 16.11.2026: 10 gemessen, 10 geheilt — zwei in audit-wave1-core-security
    // (2000 ms als best-of-3, 25 ms als best-of-2), acht in duplicates/gemeinschaften/
    // graphLayout/schild/widersprueche als best-of-2 mit unveraenderter Latte. Darum
    // null Toleranz statt eines Zaehlers: jede Fundstelle steht im Rot mit Datei und
    // Zeile, und der Griff findet auch zweistellige Latten.
    expect(funde, `${funde.length} Einzelstichproben-Latten — eine Stichprobe misst den Runner, nicht die Arbeit:\n${funde.join("\n")}`).toEqual([]);
  });
});