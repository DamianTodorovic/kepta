// D2-01 / Z1 — der Absturz, den kein Bericht vor D2 hatte: schließt der Leser
// die Pipe früh (`| head`, `less`, `fzf`, ein Skript, das nur Zeile 1 will),
// warf KEPTA einen Node-Stacktrace — bei recall/timeline kam dabei gar keine
// Antwort mehr an. Fundstelle war die Drain-Klammer nach jedem Erlebnis-Befehl.
// Ein Textprodukt, das bei `| head` abstürzt, ist kein Textprodukt.
import { describe, it, expect } from "vitest";
import { laufMitFrueherPipe, notizenSetzen, sandkiste, stackZeilen } from "./kli-helfer";

const WEBER = "Ms. Weber is billed quarterly, never monthly";
const AI = "The AI assistant answers with AI-generated text about AI";

describe("D2-01: die Antwort überlebt jede Pipe", () => {
  it("stats | head -1: Zeile 1 steht, stderr ist leer, der Exit ist 0", async () => {
    const l = await laufMitFrueherPipe(["stats"], sandkiste());
    expect(l.aus.split("\n")[0], `erste Zeile fehlt, stdout war: ${JSON.stringify(l.aus)}`).toBe("KEPTA memory");
    expect(stackZeilen(l.fehl), l.fehl).toEqual([]);
    expect(l.fehl, l.fehl).toBe("");
    expect(l.code, l.fehl).toBe(0);
  });

  it("recall | head -1: der Kopf steht, kein Stack, kein Error-Wort", async () => {
    const k = sandkiste();
    notizenSetzen(k, [WEBER, AI]);
    const l = await laufMitFrueherPipe(["recall", "weber"], k);
    expect(l.aus, `stdout war: ${JSON.stringify(l.aus)}`).toMatch(/match/);
    expect(stackZeilen(l.fehl), l.fehl).toEqual([]);
    expect(l.fehl).not.toMatch(/Error:/);
    expect(l.code, l.fehl).toBe(0);
  });

  it("timeline | head -2: die Antwort beginnt, danach Stille auf stderr", async () => {
    const k = sandkiste();
    notizenSetzen(k, [WEBER]);
    const l = await laufMitFrueherPipe(["timeline", "weber"], k, { zeilen: 2 });
    // Der Kopf, dann die Leerzeile, dann die Einträge — abbestellt wird nach zwei
    // Zeilen, also ist mindestens die Kopfzeile angekommen.
    expect(l.aus, `stdout war: ${JSON.stringify(l.aus)}`).toMatch(/entr(y|ies)/);
    expect(stackZeilen(l.fehl), l.fehl).toEqual([]);
    expect(l.code, l.fehl).toBe(0);
  });

  it("contradict | head -1: auch der dry-run überlebt den Abbruch des Lesers", async () => {
    const k = sandkiste();
    notizenSetzen(k, ["The production server is Hetzner CX42 in Nuremberg", "The production server is Hetzner CX42 in Nuremberg"]);
    const l = await laufMitFrueherPipe(["contradict"], k);
    expect(l.aus, `stdout war: ${JSON.stringify(l.aus)}`).toMatch(/candidate/);
    expect(stackZeilen(l.fehl), l.fehl).toEqual([]);
    expect(l.code, l.fehl).toBe(0);
  });
});
