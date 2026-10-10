// docs/HILFE.md ist das Papier derselben Tafel, die `kepta --help` malt. Zwei
// Stellen, die einander nicht kennen, sind in diesem Repo schon dreimal
// auseinandergedriftet (A6, F5, D2-24). Diese Wache vergibt den Auftrag, die
//README spiegelt: der Pfad ist die Quelle, gespiegelt wird daraus — und ein
// Befehl oder Schalter, den nur eine der beiden Seiten kennt, wirft rot.
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { BEFEHLE, FLAG_LISTE, hilfeText } from "../src/cli-erlebnis";
import { ohneFarbe } from "./kli-helfer";

const pfad = path.join(process.cwd(), "docs", "HILFE.md");
const papier = fs.existsSync(pfad) ? fs.readFileSync(pfad, "utf8") : "";
const tafel = ohneFarbe(hilfeText().join("\n"));

/** `kepta <wort>` — nur die Befehlsköpfe, Argumente und Shell-Wörter bleiben draussen. */
function befehlskopfe(text: string): Set<string> {
  return new Set([...text.matchAll(/\bkepta\s+([a-z][a-z0-9-]*)/g)].map((m) => m[1]!));
}

/** Schalter: ein oder zwei Bindestriche, aber nur an einem Wortanfang — sonst frisst „six-act" mit. */
function schalter(text: string): Set<string> {
  return new Set([...text.matchAll(/(?:^|[\s(`])(-{1,2}[a-z][a-z0-9-]*)/gm)].map((m) => m[1]!.split("=")[0]!));
}

const köpfe = new Set(BEFEHLE.map(([befehl]) => befehl.split(" ")[0]!));

describe("docs/HILFE.md und die Tafel kennen dasselbe", () => {
  it("die Vergleiche laufen nicht ins Leere", () => {
    expect(papier.length, "docs/HILFE.md fehlt oder ist leer").toBeGreaterThan(400);
    expect(köpfe.size).toBeGreaterThanOrEqual(9);
    expect(befehlskopfe(papier).size).toBeGreaterThanOrEqual(9);
    expect(schalter(papier).size).toBeGreaterThanOrEqual(5);
  });

  it("jeder Befehl der Tafel steht im Papier", () => {
    for (const befehl of köpfe) {
      expect(befehlskopfe(papier).has(befehl), `docs/HILFE.md nennt ${befehl} nicht`).toBe(true);
    }
  });

  it("das Papier erfindet keinen Befehl, den es nicht gibt", () => {
    const erfunden = [...befehlskopfe(papier)].filter((wort) => !köpfe.has(wort));
    expect(erfunden, `docs/HILFE.md nennt Befehle, die der Kern nicht kennt: ${erfunden.join(", ")}`).toEqual([]);
  });

  it("das Papier erfindet keinen Schalter, und die Tafel kennt jeden, den sie nennt", () => {
    // Der Satz, was eine frühe Pipe tut, ist keine Ausrede für einen unbekannten
    // Schalter: --json ist der einzige Maschinenweg.
    const erlaubt = new Set([...schalter(FLAG_LISTE), ...schalter(tafel), "--"]);
    const erfunden = [...schalter(papier)].filter((s) => !erlaubt.has(s));
    expect(erfunden, `docs/HILFE.md nennt Schalter, die es nicht gibt: ${erfunden.join(", ")}`).toEqual([]);
    for (const schalterDerTafel of schalter(FLAG_LISTE)) {
      expect(schalter(papier).has(schalterDerTafel), `die Tafel bietet ${schalterDerTafel}, das Papier verschweigt ihn`).toBe(true);
    }
  });

  it("keine Zeile des Papiers ist länger als 80 Zeichen (R2, D2-38)", () => {
    for (const [i, z] of papier.split("\n").entries()) {
      expect([...z].length, `${i + 1}: ${[...z].length} Zeichen — ${z}`).toBeLessThanOrEqual(80);
    }
  });

  it("die Exit-Zahlen des Papiers sind die des Codes", () => {
    for (const code of ["0", "1", "2", "130"]) {
      expect(papier, `docs/HILFE.md erklärt Exit ${code} nicht`).toMatch(new RegExp(`^\\s*${code}\\s{2,}`, "m"));
      expect(tafel, `die Tafel erklärt Exit ${code} nicht`).toMatch(new RegExp(`${code}\\s`));
    }
  });
});
