/* P113 -- die Berichtigung zu P112, und die Sprache in derselben Einheit.

   Was P111 schrieb und was nicht stimmt: "unsre eigne Rangfolge mit bge-m3 ist **nicht**
   gemessen." Sie war gemessen -- am 3.11.2026 um 13:04:56 UTC (= 14:04 MEZ) auf
   kepta@3.2.125, in `docs/belege/tag-0311/eval-bge-m3-1404.log.txt`, und das Sprach-Artefakt
   desselben Ordners zitiert sie sogar ("hit@1 77,8 % gegen 75,6 %"). P112 hat denselben Lauf
   auf dem heutigen Baum (3.2.189) wiederholt und die Zahlen **punktgenau** getroffen. Das ist
   kein neuer Befund, sondern ein Reproduktionsbeweis ueber 64 Fassungen -- und die Pflicht,
   den irrtuemlichen Satz im Ledger zu berichtigen.

   Zweitens, die Sprache: `npm run eval:sprache` ist 3.11 und heute unter **beiden** Stufen
   gefahren (`sprachuebergriff-nomic-1406`, `sprachuebergriff-bge-m3-1406`, und 6.11.
   17:26:39-17:26:56 MEZ in `docs/belege/konkurrenz-0611d/`). Das mehrsprachige Einbett
   aendert am ausgelieferten Bein **nichts**: englische Hit@1 26,7 % (4 von 15) in beiden
   Stufen, deutsche 60,0 % in beiden. Einziger Unterschied ist das Diagnose-Bein: da faellt
   die deutsche Seite von 73,3 % auf 46,7 % und die englische von 26,7 % auf 20,0 %.

   Genau da sitzt die Falle, die dieser Fall zubaut: der **Sprachpreis** wird bei bge-m3
   kleiner (-46,7 Pp -> -26,7 Pp), aber nur, weil der **Bezugswert mitfaellt**. Ein kleinerer
   Abstand bei schlechterem Absolute ist kein Gewinn -- dieselbe Klasse wie der Nenner, der
   still schrumpft (P104). Also wird hier nicht der Abstand geprueft, sondern beide Seiten
   einzeln, und die Absage steht schriftlich im Ledger. */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const WURZEL = path.resolve(import.meta.dirname, "..");
const ALT = path.join(WURZEL, "docs/belege/tag-0311");
const NEU = path.join(WURZEL, "docs/belege/konkurrenz-0611d");

const ALT_EVAL_NOMIC = path.join(ALT, "eval-drei-beine-1352.log.txt");
const ALT_EVAL_BGE = path.join(ALT, "eval-bge-m3-1404.log.txt");
const ALT_SPRACH_NOMIC = path.join(ALT, "sprachuebergriff-nomic-1406.log.txt");
const ALT_SPRACH_BGE = path.join(ALT, "sprachuebergriff-bge-m3-1406.log.txt");
const NEU_SPRACH_NOMIC = path.join(NEU, "sprache-nomic-0611.txt");
const NEU_SPRACH_BGE = path.join(NEU, "sprache-bge-m3-0611.txt");
const LEDGER = path.join(WURZEL, "docs/konkurrenz.md");

/** Ein Block vom Namen bis zur ersten Leerzeile. Die Ausdruecke trennen ihre Blocke so. */
function block(text: string, name: string): string {
  const i = text.indexOf(name);
  if (i < 0) return "";
  const rest = text.slice(i + name.length);
  const ende = rest.indexOf("\n\n");
  return ende < 0 ? rest : rest.slice(0, ende);
}

function seiteHit(leg: string, seite: "deutsch" | "englisch"): number {
  const m = new RegExp(`${seite}\\s+Hit@1\\s+(\\d+(?:\\.\\d+)?)\\s*%`).exec(leg);
  if (!m) throw new Error(`keine ${seite}-Hit@1-Zeile im Block: ${leg.slice(0, 120)}`);
  return Number(m[1]);
}

function seiteR5(leg: string, seite: "deutsch" | "englisch"): number {
  const m = new RegExp(`${seite}.*?R@5 gekappt\\s+(\\d+(?:\\.\\d+)?)\\s*%`).exec(leg);
  if (!m) throw new Error(`keine ${seite}-R@5-Zeile im Block`);
  return Number(m[1]);
}

function preis(leg: string): number {
  const m = /Sprachpreis Hit@1:\s+(-?[\d.]+)\s*Pp/.exec(leg);
  if (!m) throw new Error("kein Sprachpreis in diesem Block");
  return Number(m[1]);
}

const text = (p: string) => fs.readFileSync(p, "utf8");

describe("P113: was schon gemessen war, und die Sprache unter beiden Stufen", () => {
  it("die sechs Artefakte existieren: vier vom 3.11., zwei von heute", () => {
    for (const p of [ALT_EVAL_NOMIC, ALT_EVAL_BGE, ALT_SPRACH_NOMIC, ALT_SPRACH_BGE, NEU_SPRACH_NOMIC, NEU_SPRACH_BGE])
      expect(fs.existsSync(p), path.basename(p)).toBe(true);
  });

  it("P111s Satz war falsch: unsre Rangfolge mit bge-m3 stand schon am 3.11. im Repo", () => {
    const alt = block(text(ALT_EVAL_BGE), "v3-Engine (BM25");
    expect(alt).toContain("77.8 %");
    expect(alt).toContain("90.0 %");
    expect(/MRR:\s+0\.825/.test(alt), "MRR-Zeile des alten Laufs").toBe(true);
  });

  it("der heutige Lauf trifft den alten auf die Punktstelle -- Reproduktion, nicht Neufund", () => {
    const alt = block(text(ALT_EVAL_BGE), "v3-Engine (BM25");
    const altNomic = block(text(ALT_EVAL_NOMIC), "v3-Engine (BM25");
    // Dieselben vier Zeilen, die P112 heute aus den Spuren gerechnet hat.
    for (const [zeile, zahl] of [["umschreibung", "50 %"], ["ablenkung", "25 %"]] as const) {
      expect(new RegExp(`${zeile}\\s+\\d+\\s+${zahl}`).test(alt), `${zeile} bge alt`).toBe(true);
    }
    for (const [zeile, zahl] of [["umschreibung", "30 %"], ["ablenkung", "50 %"]] as const) {
      expect(new RegExp(`${zeile}\\s+\\d+\\s+${zahl}`).test(altNomic), `${zeile} nomic alt`).toBe(true);
    }
  });

  it("die Sprache: das ausgelieferte Bein trifft englisch 4 von 15 -- in BEIDEN Stufen gleich", () => {
    for (const p of [ALT_SPRACH_NOMIC, ALT_SPRACH_BGE, NEU_SPRACH_NOMIC, NEU_SPRACH_BGE]) {
      const v3 = block(text(p), "v3 Engine mit Vektoren \u2014 ausgeliefertes Retrieval");
      expect(seiteHit(v3, "englisch"), path.basename(p)).toBe(26.7);
      expect(seiteHit(v3, "deutsch"), path.basename(p)).toBe(60);
      expect(seiteR5(v3, "englisch"), path.basename(p)).toBe(33.3);
    }
  });

  it("das mehrsprachige Einbett ist kein Hebel: die englische Seite steigt nicht, sie faellt", () => {
    const nurNomic = block(text(NEU_SPRACH_NOMIC), "nur das Vektor-Bein (ohne BM25, ohne Graph)");
    const nurBge = block(text(NEU_SPRACH_BGE), "nur das Vektor-Bein (ohne BM25, ohne Graph)");
    expect(seiteHit(nurBge, "englisch")).toBeLessThan(seiteHit(nurNomic, "englisch"));
    expect(seiteHit(nurNomic, "englisch")).toBe(26.7);
    expect(seiteHit(nurBge, "englisch")).toBe(20);
    expect(seiteHit(nurNomic, "deutsch")).toBe(73.3);
    expect(seiteHit(nurBge, "deutsch")).toBe(46.7);
  });

  it("die Nenner-Falle: der Sprachpreis schrumpft, weil die deutsche Seite mitfaellt", () => {
    const nurNomic = block(text(NEU_SPRACH_NOMIC), "nur das Vektor-Bein (ohne BM25, ohne Graph)");
    const nurBge = block(text(NEU_SPRACH_BGE), "nur das Vektor-Bein (ohne BM25, ohne Graph)");
    // Der Abstand wird kleiner (-46,7 -> -26,7 Pp)...
    expect(preis(nurNomic)).toBe(-46.7);
    expect(preis(nurBge)).toBe(-26.7);
    expect(Math.abs(preis(nurBge))).toBeLessThan(Math.abs(preis(nurNomic)));
    // ...und zwar NUR, weil beide Seiten fallen. Ein kleinerer Abstand bei niedrigerer
    // englischer Absolute ist kein Sprachgewinn: genau das verbietet dieser Fall.
    expect(seiteHit(nurBge, "deutsch")).toBeLessThan(seiteHit(nurNomic, "deutsch"));
    expect(seiteHit(nurBge, "englisch")).toBeLessThan(seiteHit(nurNomic, "englisch"));
  });

  it("wiederholt: die zwei heutigen Sprachlaeufe treffen die von 3.11 auf jede Zahl", () => {
    for (const [alt, neu] of [
      [ALT_SPRACH_NOMIC, NEU_SPRACH_NOMIC] as const,
      [ALT_SPRACH_BGE, NEU_SPRACH_BGE] as const,
    ]) {
      const a = text(alt), b = text(neu);
      for (const name of [
        "v1 naive Substring-Suche",
        "v2 Engine ohne Vektoren (BM25 + Entitaeten + temporal)",
        "v3 Engine mit Vektoren \u2014 ausgeliefertes Retrieval",
        "nur das Vektor-Bein (ohne BM25, ohne Graph)",
      ]) {
        const leg = block(a, name);
        expect(seiteHit(leg, "deutsch"), `${path.basename(alt)} ${name} deutsch`).toBe(seiteHit(block(b, name), "deutsch"));
        expect(seiteHit(leg, "englisch"), `${path.basename(alt)} ${name} englisch`).toBe(seiteHit(block(b, name), "englisch"));
        expect(preis(leg), `${path.basename(alt)} ${name} Preis`).toBe(preis(block(b, name)));
      }
    }
  });

  it("der Biss: ein Block ohne diese Zeilen wirft, statt eine Null zu melden", () => {
    expect(() => seiteHit("gar nichts", "englisch")).toThrow(/keine englisch-Hit@1-Zeile/);
    expect(() => preis("kein Preis hier")).toThrow(/kein Sprachpreis/);
    expect(block("  v3 Engine mit Vektoren -- ausgeliefertes Retrieval\n", "v3 Engine mit Vektoren \u2014 ausgeliefertes Retrieval")).toBe("");
  });

  it("das Ledger berichtigt P111s Satz und nennt den aelteren Traeger", () => {
    const t = text(LEDGER);
    const schnitt = t.split("\n## ").find((x) => x.startsWith("P113")) ?? "";
    expect(schnitt).toContain("eval-bge-m3-1404.log.txt");
    expect(schnitt).toContain("26,7");
    expect(schnitt).toContain("nicht gemessen");
    // Der verbotene Satz: der kleinere Sprachpreis als Sprachgewinn.
    expect(schnitt).toContain("Nenner");
  });
});
