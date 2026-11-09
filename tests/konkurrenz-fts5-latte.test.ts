/* Punkt 8, die FTS5-Latte (P179): das Lexik-Verfahren, das die lokalen
   Gedächtnis-Produkte unter der Haube fahren — SQLite FTS5, der Index, der in
   better-sqlite3(-multiple-ciphers) eingebaut ist.

   Gemessen 9.11.2026 20:22–20:25 MEZ, derselbe Korpus wie alle Konkurrenz-Zeilen
   (`korpus-aus-repo.json`, 58 Notizen, 45 Anfragen), dasselbe Mass (Hit@1).
   Drei Konfigurationen, alle vom Schachtel-FTS5 getragen:

   - roh  (implizites UND, kein Stemming, keine Stoppwörter): 3 von 45 = 6,7 %,
     42 leere Listen — zweimal identisch. Befund: das UND stirbt an den
     Fragenwörtern UND an der deutschen Beugung ("Produktion" vs "produktions").
   - stopp (UND + Funktionswörter entfernt): dieselben 3 von 45 — die
     Beugung, nicht die Fragenwörter, ist der Killer.
   - oder (ODER über die Begriffe + bm25-Rang, die übliche Fallback-Praxis):
     20 von 45 = 44,4 %, zweimal identisch.

   Die Latte sitzt bei 10 Punkten über der ODER-Praxis: sie fällt, wenn die
   ausgelieferte Fusion auf FTS5-Niveau absinkt. Die Gegenprobe hält: unsre
   eigne v1-Baseline (51,1 %) schafft die Latte NICHT (Abstand 6,7 Punkte) —
   sie trennt also die Fusion vom Schachtel-Verfahren und lässt die Baseline
   durch. */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CORPUS, QUERIES } from "../scripts/eval-corpus";

const WURZEL = path.resolve(import.meta.dirname, "..");
const BELEG = path.join(WURZEL, "docs/belege/konkurrenz-0911c");
const DREIBEIN = path.join(WURZEL, "docs/belege/tag-0311/eval-drei-beine-1352.log.txt");

const LATTE_PUNKTE = 10;

type Zeile =
  | { art: "suche"; kategorie: string; erwartet: string[]; top: string | null; treffer: boolean; liste: string[] }
  | { art: string };

const spur = (name: string) =>
  fs.readFileSync(path.join(BELEG, name), "utf8").split("\n").filter(Boolean)
    .map((l) => JSON.parse(l) as Zeile)
    .filter((z): z is Extract<Zeile, { art: "suche" }> => z.art === "suche");
const masse = (name: string) => {
  const s = spur(name);
  return {
    n: s.length,
    hit1: s.filter((z) => z.treffer).length,
    in5: s.filter((z) => z.liste.slice(0, 5).some((id) => z.erwartet.includes(id))).length,
    leere: s.filter((z) => z.liste.length === 0).length,
    kat: (k: string) => ({ treffer: s.filter((z) => z.kategorie === k && z.treffer).length, n: s.filter((z) => z.kategorie === k).length }),
  };
};
const prozent = (treffer: number, n: number) => Math.round((100 * treffer) / n * 10) / 10;

function hit1AusBeleg(text: string, legbe: string) {
  const schnitt = text.split("── ").find((t) => t.startsWith(legbe)) ?? "";
  const m = /Hit@1:\s+(\d+(?:[.,]\d+)?)\s*%/.exec(schnitt);
  return m ? Number(m[1].replace(",", ".")) : NaN;
}

describe("Punkt 8, die FTS5-Latte: das Schachtel-Lexik-Verfahren der lokalen Produkte", () => {
  it("die ODER-Praxis ist wiederholbar: zwei frische DBs, dieselbe Zahl", () => {
    const a = masse("spur-fts5-0911-oder-eins.jsonl");
    const b = masse("spur-fts5-0911-oder-zwei.jsonl");
    expect([a.n, b.n], "die Spuren fahren nicht unsren Korpus").toEqual([QUERIES.length, QUERIES.length]);
    expect([a.hit1, b.hit1], `Lauf eins ${a.hit1}, Lauf zwei ${b.hit1}`).toEqual([20, 20]);
    expect([a.in5, b.in5]).toEqual([24, 24]);
    expect(prozent(a.hit1, a.n)).toBe(44.4);
  });

  it("die Schachtel selbst (UND, roh und mit Stoppwörtern) bleibt bei 3 von 45 — der Beugungs-Befund", () => {
    for (const name of ["spur-fts5-0911-roh-eins.jsonl", "spur-fts5-0911-roh-zwei.jsonl", "spur-fts5-0911-stopp-eins.jsonl", "spur-fts5-0911-stopp-zwei.jsonl"]) {
      const m = masse(name);
      expect([m.hit1, m.leere], `${name}: hit1 ${m.hit1}, leer ${m.leere}`).toEqual([3, 42]);
    }
    // Die Diagnose am Artefakt: temporal und ablenkung bleiben auch mit ODER leer.
    const oder = masse("spur-fts5-0911-oder-eins.jsonl");
    expect([oder.kat("temporal"), oder.kat("ablenkung")]).toEqual([{ treffer: 0, n: 3 }, { treffer: 0, n: 4 }]);
    expect(oder.kat("umschreibung")).toEqual({ treffer: 1, n: 10 });
  });

  it("die ausgelieferte Fusion bleibt deutlich über der ODER-Praxis — und unsre Baseline schafft die Latte nicht", () => {
    const belegt = fs.readFileSync(DREIBEIN, "utf8");
    const fts5 = prozent(masse("spur-fts5-0911-oder-eins.jsonl").hit1, QUERIES.length);
    const ausgeliefert = hit1AusBeleg(belegt, "v3-Engine");
    const baseline = hit1AusBeleg(belegt, "v1-Baseline");
    expect(ausgeliefert, "der Drei-Beine-Beleg nennt keine v3-Legbe").not.toBeNaN();
    expect(ausgeliefert - fts5, `ausgeliefert ${ausgeliefert} % gegen FTS5-ODER ${fts5} %`).toBeGreaterThanOrEqual(LATTE_PUNKTE);
    // Die Gegenprobe: 51,1 - 44,4 = 6,7 Punkte — die naive Baseline schafft die
    // Latte nicht, sie trennt also wirklich Fusion von Schachtel-Verfahren.
    expect(baseline - fts5, "die Latte laesst unsre naive Baseline durch").toBeLessThan(LATTE_PUNKTE);
  });

  it("das Ergebnis-Protokoll nennt Konfiguration und Korpus", () => {
    const e = JSON.parse(fs.readFileSync(path.join(BELEG, "ergebnis-fts5-0911-oder-eins.json"), "utf8")) as { konfiguration: Record<string, unknown>; korpus: { notizen: number; anfragen: number }; hit1_prozent: number; leere_listen: number };
    expect(e.konfiguration.tokenizer).toBe("unicode61 (Standard)");
    expect(e.konfiguration.modus).toBe("oder");
    expect(e.korpus).toEqual({ notizen: CORPUS.length, anfragen: QUERIES.length });
    expect(e.hit1_prozent).toBe(44.4);
  });
});
