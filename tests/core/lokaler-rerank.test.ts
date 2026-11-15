import { describe, it, expect, afterEach, vi } from "vitest";
import { localRerankScore } from "../../src/core/engine";

// README.md:123 behauptet ueber den lokalen Reranker dreierlei: er ist deterministisch,
// er braucht kein Netz, und er ist immer an. Die bestehenden Faelle in
// tests/engine.test.ts:448-467 pruefen die Spanne (0..1) und die Reihenfolge zweier
// Treffer — nicht die Bedingungen, unter denen diese Zahl entsteht. Ein Satz nach
// aussen, der "no network, always on" sagt, braucht genau die.

type Notiz = { title: string; content: string; tags: string[] };

const NOTIZ: Notiz = {
  title: "Rust Backend",
  content: "Speichersicherheit und Performance ohne Garbage Collector",
  tags: ["rust", "backend"],
};

const FRAGEN = [
  "rust",
  "Speichersicherheit",
  "garbage collector",
  "performance ohne",
  "backend",
  "Rust oder Go",
  "schweiz kaese",
  "RURST",
  "  ",
];

// Der Dienst ist tot, bevor ein Fall beginnt: genau die Lage eines Rechners ohne
// Ollama — und genau die Lage, in der der Satz "no network, always on" gelten muss.
function dienstTot() {
  const stub = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));
  vi.stubGlobal("fetch", stub);
  return stub;
}

afterEach(() => vi.unstubAllGlobals());

describe("der lokale Reranker haelt ohne Netz", () => {
  it("gibt eine Zahl, obwohl kein Embedding-Dienst antwortet", () => {
    dienstTot();
    const zahl = localRerankScore("rust", NOTIZ);
    expect(zahl, "ohne Dienst bleibt kein Wert uebrig — dann ist 'always on' gelogen").not.toBeNull();
    expect(Number.isFinite(zahl!)).toBe(true);
    expect(zahl!).toBeGreaterThanOrEqual(0);
    expect(zahl!).toBeLessThanOrEqual(1);
  });

  it("ruft das Netz waehrend der Berechnung kein einziges Mal auf", () => {
    const stub = dienstTot();
    for (const frage of FRAGEN) for (const notiz of [NOTIZ, { ...NOTIZ, title: "Carbonara", tags: [] }]) {
      localRerankScore(frage, notiz);
    }
    expect(stub.mock.calls.length, `der Reranker hat ${stub.mock.calls.length} Anfragen ans Netz geschickt`).toBe(0);
  });

  it("liefert fuer dieselbe Frage an dieselbe Notiz auf die Stelle denselben Wert", () => {
    dienstTot();
    for (const frage of FRAGEN) {
      const a = localRerankScore(frage, NOTIZ);
      const b = localRerankScore(frage, NOTIZ);
      expect(Object.is(a, b), `"${frage}" liefert zweimal verschieden: ${a} gegen ${b}`).toBe(true);
    }
  });

  it("verraet sich nicht, wenn Uhr und Zufall zwischen den Aufrufen weiterlaufen", () => {
    dienstTot();
    const vorher = FRAGEN.map((f) => localRerankScore(f, NOTIZ));
    // Wer je eine Abklingzeit oder ein Los in die Punktzahl mischt, faellt hier um —
    // der Fall prueft also die Ansage "deterministic", nicht nur sich selbst.
    let tick = 0;
    vi.spyOn(Date, "now").mockImplementation(() => 1_700_000_000_000 + tick++ * 86_400_000);
    vi.spyOn(Math, "random").mockImplementation(() => tick++ / 1_000);
    const nachher = FRAGEN.map((f) => localRerankScore(f, NOTIZ));
    expect(nachher).toEqual(vorher);
  });
});
