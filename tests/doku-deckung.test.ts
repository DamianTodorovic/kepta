import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// README.md:448 erzaehlt nach aussen, was die Deckungs-Rechnung auslaesst. Bis P133 sagte der
// Satz: "the only exclusion is the bootstrap". Die Konfiguration sagt etwas anderes — und ein
// Satz, der eine Liste beschreibt, ohne sie zu lesen, altert still. Diese Wache koppelt den
// Satz an die Liste, damit er nicht noch einmal behauptet, was die Datei nicht tut.

const WURZEL = process.cwd();
const KONFIG = fs.readFileSync(path.join(WURZEL, "vitest.config.ts"), "utf8");
const README = fs.readFileSync(path.join(WURZEL, "README.md"), "utf8");

/** Ein Array-Block (`exclude: [...]` / `include: [...]`) ohne Kommentare, in rohen Eintraegen.
    Die Suche beginnt erst hinter der Deckungs-Sektion — `include:` steht in dieser Datei
    zweimal, und das erste ist der Test-Glob, nicht die Rechnung. */
function blok(text: string, schluessel: string): string[] {
  const deckung = text.indexOf("coverage: {");
  if (deckung < 0) throw new Error("vitest.config.ts hat keine coverage-Sektion — die Wache sieht nichts");
  const anfang = text.indexOf(`${schluessel}: [`, deckung);
  if (anfang < 0) throw new Error(`die Deckungs-Sektion kennt kein "${schluessel}: ["`);
  const ende = text.indexOf("]", anfang);
  const leib = text.slice(anfang + schluessel.length + 3, ende);
  return leib
    .split("\n")
    .map((z) => z.trim())
    .filter((z) => z && !z.startsWith("//"))
    .map((z) => z.replace(/,\s*$/, ""))
    .map((z) => z.replace(/^["']|["']$/g, ""))
    .filter((z) => z.length > 0);
}

const AUSNAHMEN = blok(KONFIG, "exclude");
const MITGEZAHLT = blok(KONFIG, "include");
const ZEILEN = (README.split(/\n/) as string[]).filter((z) => /coverage gate/i.test(z));
// Nur der Teil, der eine Ausnahme *behauptet*, wird auf erfundene Namen prueft. Ein Satz, der
// `server.ts` als Einstiegspunkt beschreibt, nennt keine Ausnahme.
const AUSNAHME_TEIL = ZEILEN.join(" ")
  .split(/(?<=\.)\s+/)
  .filter((s) => /exclusion|excluded|exclude\b|ausgelassen|Ausnahme/i.test(s));

describe("README: die Deckungs-Ausnahmen sind die der Konfiguration", () => {
  it("der Satz ueber die Deckungs-Rechnung steht noch im README", () => {
    expect(ZEILEN.length, "der Satz ist verschwunden — die Wache sieht nichts mehr").toBeGreaterThan(0);
  });

  it("jede Ausnahme, die die Konfiguration macht, wird beim Namen genannt", () => {
    for (const ausnahme of AUSNAHMEN) {
      const genannt = ZEILEN.some((z) => z.includes(ausnahme));
      expect(genannt, `die Konfiguration laesst "${ausnahme}" aus, der README-Satz kennt den Namen nicht`).toBe(true);
    }
  });

  it("der Satz erfindet keine Ausnahme, die die Konfiguration nicht macht", () => {
    // Beide Richtungen, damit der Fall nicht leer durchläuft: jeder Pfad, den der Ausnahmeteil
    // zwischen Backticks nennt, muss in der Liste stehen — und der Teil muss mindestens einen
    // nennen. Ein Satz, der eine Ausnahmeliste beschreibt, ohne einen einzigen Namen zu nennen,
    // ist keine Beschreibung.
    expect(AUSNAHME_TEIL.length, "kein Teilsatz redet von einer Ausnahme — die Wache sieht nichts").toBeGreaterThan(0);
    const nannt = AUSNAHME_TEIL.join(" ")
      .match(/`[^`]+`/g)
      ?.map((t) => t.replace(/`/g, ""))
      .filter((t) => /[/.]/.test(t))
      // Ein Verweis auf ein Pruefblatt oder auf die Konfiguration selbst ist keine behauptete
      // Ausnahme — alles, was nach gemessenem Quellcode aussieht, muss in der Liste stehen.
      .filter((t) => !t.startsWith("tests/") && !t.startsWith("scripts/") && !t.startsWith("docs/") && t !== "vitest.config.ts") ?? [];
    expect(nannt.length, "der Ausnahmeteil nennt keinen einzigen Dateinamen").toBeGreaterThan(0);
    for (const k of nannt) {
      expect(AUSNAHMEN, `"${k}" wird als Ausnahme genannt, steht aber nicht in vitest.config.ts`).toContain(k);
    }
  });

  it("der Bootstrap wird nicht als Ausnahme erzaehlt — er zaehlt mit", () => {
    expect(MITGEZAHLT, "server.ts ist nicht in der Liste, die mitzaehlt").toContain("server.ts");
    expect(AUSNAHMEN, "server.ts waere ausgenommen — der Satz darf das nicht verschweigen").not.toContain("server.ts");
    const alt = ZEILEN.filter((z) => /only exclusion/i.test(z));
    expect(alt.length, `der Satz behauptet weiter eine einzige Ausnahme:\n  ${alt.join("\n  ").slice(0, 200)}`).toBe(0);
  });

  it("die Biss-Kontrolle: der Leser sieht eine vierte Ausnahme, wo eine steht", () => {
    const pos = KONFIG.indexOf("exclude: [", KONFIG.indexOf("coverage: {"));
    const gefaelscht = KONFIG.slice(0, pos) + 'exclude: [\n        "src/lib/erfunden.ts",\n        ' + KONFIG.slice(pos + 'exclude: ['.length);
    expect(blok(gefaelscht, "exclude").length, "der Leser zaehlt die Ausnahmen nicht — die Wache ist taub").toBe(AUSNAHMEN.length + 1);
    expect(blok(gefaelscht, "exclude")).toContain("src/lib/erfunden.ts");
  });

  it("die Liste ist nicht leer gelesen", () => {
    expect(AUSNAHMEN.length, "keine einzige Ausnahme gelesen — die Wache prueft eine Null").toBeGreaterThan(0);
    expect(MITGEZAHLT.length).toBeGreaterThan(0);
  });
});
