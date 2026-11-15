// @vitest-environment jsdom
// P141 — die Stufen des Ergebnisreglers. README.md:128 benennt sie: „the result slider runs
// 5 · 10 · 20 · 50 · 100 · 250 · All". Bis zu diesem Schlag nannte KEIN Fall eine einzige dieser
// Stufen: `grep -rln RESULT_STOPS tests/` lieferte nichts, und der einzige Regler-Fall in
// `tests/components/Dashboard.test.tsx` prüft, dass der Rahmen fahrbar ist (`Number(regler.max)`
// > 0). Ein Regler, dessen Stufen niemand zählt, kann morgen vier haben und die Doku bleibt grün.
//
// Was hier also zählt, sind die drei Dinge, die die Fläche wirklich trägt: die Liste selbst,
// die Rundung, die ein localStorage ohne diese Liste darauf legt, und das Fenster-Event, mit dem
// die zweite Fläche nachzieht.
//
// Biss gemessen 6.11. 00:27 gegen einen Scratch-Patch an `src/lib/searchPrefs.ts` (1,5 s Fenster,
// danach `cp` aus der Sicherung und `cmp` — die Datei ist bytegleich, `git diff` dazu leer):
// `250` aus der Liste genommen ⇒ 3 rot, 4 grün — „der Regler hat genau sieben Positionen", „jede
// der sieben Stufen bleibt sich selbst" und „ein Wert zwischen den Stufen steigt zur nächsten".
// Der zweite Anlauf ist die Lehre daraus: dieselbe Prüfung, über `RESULT_STOPS` selbst geschleift,
// blieb bei demselben Patch grün — eine Schleife über die Liste, die sie selbst misst, vermisst
// kein Fach. Also stehen die sieben Werte unten als Zahlen.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  RESULT_STOPS,
  SUCH_PREFS_EVENT,
  leseTreffer,
  normalisiereTreffer,
  schreibeTreffer,
} from "../../src/lib/searchPrefs";

const KEY = "ki_gehirn_topK"; // derselbe Schlüssel, den Dashboard und Einstellungen teilen

// Die Spiegelung in die DB (prefs.ts) darf in diesem Fall nirgends hin fragen: ein relativer
// URL in Node- fetch wirft, und ein echter Netzwerkzug wäre ein Zufalls-Zeuge. ok:false heisst
// „Spiegelung leer" — die LocalStorage entscheidet hier allein, und das ist die Behauptung.
const fetchStub = vi.fn(async () => ({ ok: false, status: 204, json: async () => ({}) }));

beforeEach(() => {
  fetchStub.mockClear();
  vi.stubGlobal("fetch", fetchStub as unknown as typeof fetch);
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("Ergebnisregler: die sieben Stufen, die die Doku nennt", () => {
  it("der Regler hat genau sieben Positionen, und die letzte heisst alles", () => {
    // README.md:128 nennt diese sieben Werte in genau dieser Reihenfolge. 0 ist nicht „nichts",
    // sondern das letzte Fach („All" im Dashboard, siehe ALL_RESULTS dort).
    expect([...RESULT_STOPS]).toEqual([5, 10, 20, 50, 100, 250, 0]);
    expect(RESULT_STOPS.length).toBe(7);
    // Ein `input type=range` mit min 0 und max length-1 hat genau so viele Halte wie die Liste.
    expect(RESULT_STOPS.length - 1).toBe(6);
  });

  it("jede der sieben Stufen bleibt beim Normalisieren sich selbst — auch 0, das alles heisst", () => {
    // Absichtlich NICHT `for (const stufe of RESULT_STOPS)`: eine Schleife ueber der Liste, die
    // selbst geprueft wird, kann ein entferntes Fach nicht vermissen. Der Bisslauf hat genau das
    // gezeigt — 250 aus der Liste genommen, dieser Fall blieb grün. Die sieben Werte stehen hier
    // als Zahlen, weil die Doku sie als Zahlen nennt.
    for (const stufe of [5, 10, 20, 50, 100, 250, 0]) {
      // Die 0 darf nicht hochgerundet werden: sie ist die Entscheidung „nichts abschneiden".
      expect(normalisiereTreffer(stufe), `Stufe ${stufe} wurde verfälscht`).toBe(stufe);
    }
  });

  it("ein Wert zwischen den Stufen steigt zur nächsten", () => {
    expect(normalisiereTreffer(1)).toBe(5);
    expect(normalisiereTreffer(6)).toBe(10);
    expect(normalisiereTreffer(11)).toBe(20);
    expect(normalisiereTreffer(21)).toBe(50);
    expect(normalisiereTreffer(51)).toBe(100);
    expect(normalisiereTreffer(101)).toBe(250);
  });

  it("was der Regler nicht zeigen kann, fällt auf die erste Stufe zurück — nie auf alles", () => {
    // Die Richtung ist die Behauptung: 251 ist weder eine Stufe noch weniger als 250. Aufrunden
    // auf „All" wäre ein Fehler mit Folgen — eine Anfrage, die nichts abschneidet, nur weil ein
    // Wert von Hand eingetragen wurde. Ein nicht-stufiger Wert muss also nach UNTEN fallen.
    expect(normalisiereTreffer(251)).toBe(5);
    expect(normalisiereTreffer(5000)).toBe(5);
    expect(normalisiereTreffer(-3)).toBe(5);
    expect(normalisiereTreffer(Number.NaN)).toBe(5);
    expect(normalisiereTreffer(Number.POSITIVE_INFINITY)).toBe(5);
    expect(normalisiereTreffer(Number.NEGATIVE_INFINITY)).toBe(5);
  });

  it("geschrieben und gelesen ist dieselbe Stufe: der Speicher hält nur Stufen", () => {
    schreibeTreffer(0);
    expect(localStorage.getItem(KEY)).toBe("0");
    expect(leseTreffer()).toBe(0);

    schreibeTreffer(37);
    expect(localStorage.getItem(KEY), "ein Zwischenwert wird als Stufe abgelegt, nicht als 37").toBe("50");
    expect(leseTreffer()).toBe(50);
  });

  it("ein Speicher mit einer Zahl, die keine Stufe ist, wird beim Lesen auf eine Stufe gesetzt", () => {
    // Die Falle, gegen die dieser Fall schreibt: der Regler steht per `indexOf` auf der Stufe.
    // Läge dort eine 7, fände der Regler sie nicht (indexOf = -1), zeigte die erste Stufe — und
    // die Anfrage schnitte trotzdem 7 ab. Etikett und Grenze wären zwei verschiedene Zahlen.
    localStorage.setItem(KEY, "7");
    expect(leseTreffer()).toBe(10);
    localStorage.setItem(KEY, "abc");
    expect(leseTreffer()).toBe(5);
    localStorage.removeItem(KEY);
    expect(leseTreffer(), "kein Speicher ist der Anfang, nicht die erste Anfrage").toBe(5);
  });

  it("die zweite Fläche zieht nach, ohne neu geladen zu werden", () => {
    // Einstellungen und Dashboard teilen denselben Schlüssel und horchen auf dasselbe Event.
    // Ohne dieses Event blieb in der App die eine Fläche auf der alten Stufe stehen, während die
    // andere schon umbenannte — der Satz „both move together" in Settings.tsx hängt hier.
    const gesehen: number[] = [];
    const hoeren = () => gesehen.push(leseTreffer());
    window.addEventListener(SUCH_PREFS_EVENT, hoeren);
    try {
      schreibeTreffer(100);
      schreibeTreffer(0);
    } finally {
      window.removeEventListener(SUCH_PREFS_EVENT, hoeren);
    }
    expect(gesehen, "die andere Fläche erfuhr von keiner der beiden Bewegungen").toEqual([100, 0]);
  });
});
