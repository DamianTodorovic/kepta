/* Punkt 8, dritte Mitbewerber-Stufe: chroma, reines Cosinus-KNN, an demselben Korpus.

   Die Frage, die diese Latte hält: ist die Zahl des reinen Vektors eine Zahl — oder eine
   Spanne? P110/P111 hatten sqlite-vec gemessen (19 von 45 mit nomic, 30 von 45 mit bge-m3).
   Ein Kunde, der Chroma fährt, bekommt eine andre Antwort aus demselben Verfahren. Dieser
   Lauf misst das zweite Produkt, gleiche 58 Notiztexte, gleiche 45 Anfragen, gleiche
   Einbett-Stufen, k=5, nur Vektoren, nichts sonst. Gefahren 6.11.2026 18:42:37 bis
   18:43:08 MEZ, chroma 1.5.9 in einer egnen Kapsel (/tmp/konk-chroma-0611), Einbettung aus
   Ollama ausschliesslich auf 127.0.0.1, Fernmeldung abschaltet vor dem ersten Aufruf.

   Der zweite Fund gehört dieser Latte, weil er dieselbe Rechenstelle traf: unsre eigne
   Spur aus P112 (`konkurrenz-0611c`) schreibt ins Feld `erwartet` nur den ERSTEN
   gueltigen Ausweis (`docs/belege/konkurrenz-0611c/spur-leser.ts:36`,
   `erwartet: q.relevant[0]`). Die Zahl in der Ledger-Zeile war nie davon betroffen, denn
   P112 rechnet gegen das Korpus, nicht gegen das Feld. Wer aber das Feld liest, maht
   30 und 31 statt 34 und 35 — vier Anfragen zu niedrig, und die vier liegen genau an den
   sechs Anfragen mit mehreren gueltigen Ausweisen. Die berichtigte Spur liegt hier nebenan
   (`konkurrenz-0611e/spur-uns-*-0611e.jsonl`), und die Faelle unten halten beide Stände
   fest: den Fehler und seine Groesse.

   Gemessen, in derselben Einheit (Anfragen von 45):

     chroma, nomic     Hit@1 19 = 42,2 %   R@5 in den ersten 5 26 = 57,8 %
     chroma, bge-m3    Hit@1 31 = 68,9 %   R@5 in den ersten 5 40 = 88,9 %
     sqlite-vec, nomic Hit@1 19 = 42,2 % (dasselbe)
     sqlite-vec, bge-m3 Hit@1 30 = 66,7 % (eine Anfrage weniger)
     unsre Fusion      Hit@1 34 = 75,6 % (nomic) und 35 = 77,8 % (bge-m3)   */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { QUERIES } from "../scripts/eval-corpus";

const WURZEL = path.resolve(import.meta.dirname, "..");
const NEU = path.join(WURZEL, "docs/belege/konkurrenz-0611e");
const FREMD = path.join(WURZEL, "docs/belege/konkurrenz-0611b");
const ALT = path.join(WURZEL, "docs/belege/konkurrenz-0611c");
const LEDGER = path.join(WURZEL, "docs/konkurrenz.md");

const CHROMA_NOMIC = path.join(NEU, "spur-chroma-nomic-eins.jsonl");
const CHROMA_NOMIC_ZWEI = path.join(NEU, "spur-chroma-nomic-zwei.jsonl");
const CHROMA_BGE = path.join(NEU, "spur-chroma-bge-m3-eins.jsonl");
const CHROMA_BGE_ZWEI = path.join(NEU, "spur-chroma-bge-m3-zwei.jsonl");
const UNS_NOMIC_NEU = path.join(NEU, "spur-uns-nomic-0611e.jsonl");
const UNS_BGE_NEU = path.join(NEU, "spur-uns-bge-m3-0611e.jsonl");
const UNS_NOMIC_ALT = path.join(ALT, "spur-uns-nomic-0611.jsonl");
const UNS_BGE_ALT = path.join(ALT, "spur-uns-bge-m3-0611.jsonl");
const KNN_NOMIC = path.join(FREMD, "spur-sqlitevec-0611.jsonl");
const KNN_BGE = path.join(FREMD, "spur-sqlitevec-bge-m3.jsonl");
const AUSWERTUNG = path.join(NEU, "auswertung-chroma-0611.txt");
const ZENSUS = path.join(NEU, "gleichstands-zensus-0611.txt");

const ANZAHL = QUERIES.length; // 45
const ERWARTUNG = new Map(QUERIES.map((q) => [q.query, new Set(q.relevant)]));

type Zeile = {
  art: string;
  i: number;
  kategorie?: string;
  frage: string;
  erwartet?: unknown;
  anzahl_erwartet?: number;
  top: string | null;
  liste: string[];
  treffer?: boolean;
  dim?: number;
  k?: number;
  raum?: string;
  werkzeug?: string;
  einbett?: string;
  vektoren_im_feld?: number;
  index?: Record<string, number>;
};

const lesen = (pfad: string) =>
  fs.readFileSync(pfad, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Zeile);

const suchen = (pfad: string) => lesen(pfad).filter((z) => z.art === "suche");
const start = (pfad: string) => lesen(pfad).find((z) => z.art === "start")!;

/** Hit@1, gerechnet gegen das Korpus — nie gegen das Feld einer Spur. */
const hit1 = (zeilen: Zeile[]) =>
  zeilen.filter((z) => z.top !== null && (ERWARTUNG.get(z.frage)?.has(z.top as string) ?? false)).length;
const in5 = (zeilen: Zeile[]) =>
  zeilen.filter((z) => z.liste.slice(0, 5).some((x) => ERWARTUNG.get(z.frage)?.has(x))).length;
const prozent = (n: number) => Math.round((100 * n) / ANZAHL * 10) / 10;

/** Hit@1, wie ihn ein Leser bekommt, der das erwartet-Feld fuer die Ganze Erwartung haelt. */
const hit1_aus_feld = (zeilen: Zeile[]) =>
  zeilen.filter((z) => {
    const e = z.erwartet;
    const menge = new Set(Array.isArray(e) ? e : e ? [String(e)] : []);
    return z.top !== null && menge.has(z.top as string);
  }).length;

const vergleich = (a: Zeile[], b: Zeile[]) => {
  const um = new Map(b.map((x) => [x.frage, x]));
  let listen = 0;
  let tops = 0;
  const gekippt: string[] = [];
  for (const x of a) {
    const y = um.get(x.frage);
    expect(y, `Frage in der zweiten Spur nicht gefunden: ${x.frage}`).toBeDefined();
    if (x.liste.slice(0, 5).join(",") !== y!.liste.slice(0, 5).join(",")) listen++;
    if (x.top !== y!.top) tops++;
    const traf_a = x.top !== null && (ERWARTUNG.get(x.frage)?.has(x.top as string) ?? false);
    const traf_b = y!.top !== null && (ERWARTUNG.get(y!.frage)?.has(y!.top as string) ?? false);
    if (traf_a !== traf_b) gekippt.push(x.frage);
  }
  return { listen, tops, gekippt };
};

describe("Punkt 8 / P118: chroma als zweite reine Vektor-Stufe", () => {
  it("die vier chroma-Spuren existieren und tragen je 45 Anfragen", () => {
    for (const p of [CHROMA_NOMIC, CHROMA_NOMIC_ZWEI, CHROMA_BGE, CHROMA_BGE_ZWEI]) {
      expect(fs.existsSync(p), path.basename(p)).toBe(true);
      expect(suchen(p)).toHaveLength(ANZAHL);
    }
  });

  it("die Start-Zeile nennt Werkzeug, Cosinus-Raum, Dimension und k — nicht mein Versprechen", () => {
    for (const [pfad, dim] of [[CHROMA_NOMIC, 768], [CHROMA_BGE, 1024]] as [string, number][]) {
      const z = start(pfad);
      expect(z.werkzeug).toBe("chroma 1.5.9");
      expect(z.raum).toBe("cosine");
      expect(z.dim).toBe(dim);
      expect(z.k).toBe(5);
      expect(z.vektoren_im_feld).toBe(58);
      expect(z.einbett).toBeTruthy();
    }
    expect(start(CHROMA_NOMIC).einbett).toBe("nomic-embed-text");
    expect(start(CHROMA_BGE).einbett).toBe("bge-m3");
  });

  it("unter der Index-Schwelle ist chroms Antwort exakt, und die Schwelle ist in der Spur", () => {
    const z = start(CHROMA_NOMIC);
    expect(z.index!.sync_threshold).toBe(1000);
    expect(z.vektoren_im_feld!).toBeLessThan(z.index!.sync_threshold);
  });

  it("Hit@1 aus den Zeilen gerechnet: 19 von 45 mit nomic, 31 von 45 mit bge-m3", () => {
    expect(hit1(suchen(CHROMA_NOMIC))).toBe(19);
    expect(hit1(suchen(CHROMA_BGE))).toBe(31);
    expect(prozent(hit1(suchen(CHROMA_NOMIC)))).toBe(42.2);
    expect(prozent(hit1(suchen(CHROMA_BGE)))).toBe(68.9);
  });

  it("Recall@5 in den ersten fuenf: 26 von 45 (nomic), 40 von 45 (bge-m3)", () => {
    expect(in5(suchen(CHROMA_NOMIC))).toBe(26);
    expect(in5(suchen(CHROMA_BGE))).toBe(40);
  });

  it("zwei Laeufe je Stufe: keine Treffer-Kippe, und die Reihenfolge krauselt hoechstens einmal", () => {
    const n = vergleich(suchen(CHROMA_NOMIC), suchen(CHROMA_NOMIC_ZWEI));
    expect(n.listen).toBe(0);
    expect(n.tops).toBe(0);
    expect(n.gekippt).toEqual([]);
    expect(hit1(suchen(CHROMA_NOMIC_ZWEI))).toBe(hit1(suchen(CHROMA_NOMIC)));
    const b = vergleich(suchen(CHROMA_BGE), suchen(CHROMA_BGE_ZWEI));
    expect(b.tops).toBe(0);
    expect(b.gekippt).toEqual([]);
    expect(b.listen).toBeLessThanOrEqual(1);
    expect(hit1(suchen(CHROMA_BGE_ZWEI))).toBe(31);
  });

  it("an der nomic-Stufe sind sich beide Werkzeuge bis auf die Reihenfolge gleich — 19 in beiden", () => {
    const v = vergleich(suchen(CHROMA_NOMIC), suchen(KNN_NOMIC));
    expect(hit1(suchen(CHROMA_NOMIC))).toBe(19);
    expect(hit1(suchen(KNN_NOMIC))).toBe(19);
    expect(v.tops).toBe(0);
    expect(v.gekippt).toEqual([]);
    expect(v.listen).toBe(5);
  });

  it("an der bge-Stufe ist die Zahl des reinen Vektors eine Spanne: 31 gegen 30, eine Anfrage", () => {
    expect(hit1(suchen(CHROMA_BGE))).toBe(31);
    expect(hit1(suchen(KNN_BGE))).toBe(30);
    const v = vergleich(suchen(CHROMA_BGE), suchen(KNN_BGE));
    expect(v.gekippt).toEqual(["Hetzner"]);
    expect(v.tops).toBe(1);
  });

  it("die gekippte Anfrage hat mehrere gueltige Ausweise, und beide Werkzeuge nennen einen davon", () => {
    const erwartet = ERWARTUNG.get("Hetzner")!;
    expect([...erwartet].sort()).toEqual(["m01", "m16", "m36", "m37"]);
    const c = suchen(CHROMA_BGE).find((z) => z.frage === "Hetzner")!;
    const s = suchen(KNN_BGE).find((z) => z.frage === "Hetzner")!;
    expect(c.top).toBe("m16");
    expect(s.top).toBe("m17");
    expect(erwartet.has(c.top as string)).toBe(true);
    expect(erwartet.has(s.top as string)).toBe(false);
  });

  it("unsre Fusion fuehrt an beiden Stufen gegen beide Werkzeuge, und der Fuehrungs-Abstand haelt", () => {
    expect(hit1(suchen(UNS_NOMIC_NEU))).toBe(34);
    expect(hit1(suchen(UNS_BGE_NEU))).toBe(35);
    // nomic-Stufe: 34 - 19 = 15 Anfragen in beiden Produkten
    expect(hit1(suchen(UNS_NOMIC_NEU)) - hit1(suchen(CHROMA_NOMIC))).toBe(15);
    expect(hit1(suchen(UNS_NOMIC_ALT)) - hit1(suchen(KNN_NOMIC))).toBe(15);
    // bge-Stufe: 35 - 31 gegen chroma, 35 - 30 gegen sqlite-vec
    expect(hit1(suchen(UNS_BGE_NEU)) - hit1(suchen(CHROMA_BGE))).toBe(4);
    expect(hit1(suchen(UNS_BGE_ALT)) - hit1(suchen(KNN_BGE))).toBe(5);
  });

  it("die berichtigte eigne Spur traegt erwartet als Liste, und ihre Laenge ist anzahl_erwartet", () => {
    for (const pfad of [UNS_NOMIC_NEU, UNS_BGE_NEU]) {
      expect(fs.existsSync(pfad), path.basename(pfad)).toBe(true);
      const zeilen = suchen(pfad);
      expect(zeilen).toHaveLength(ANZAHL);
      for (const z of zeilen) {
        expect(Array.isArray(z.erwartet), z.frage).toBe(true);
        expect((z.erwartet as string[]).length).toBe(z.anzahl_erwartet);
        expect(new Set(z.erwartet as string[])).toEqual(ERWARTUNG.get(z.frage));
      }
    }
  });

  it("die berichtigte Spur zeigt dieselbe Rangfolge wie P112 — zwei Stunden, gleiche erste Stelle", () => {
    for (const [neu, alt] of [[UNS_NOMIC_NEU, UNS_NOMIC_ALT], [UNS_BGE_NEU, UNS_BGE_ALT]] as [string, string][]) {
      const a = suchen(neu);
      const b = suchen(alt);
      expect(a.map((z) => z.frage)).toEqual(b.map((z) => z.frage));
      expect(a.map((z) => z.top)).toEqual(b.map((z) => z.top));
    }
  });

  it("das verlorene Feld der aeltern Spur maht vier Anfragen zu niedrig — die Groesse des Fehlers steht fest", () => {
    expect(hit1(suchen(UNS_NOMIC_ALT))).toBe(34);
    expect(hit1_aus_feld(suchen(UNS_NOMIC_ALT))).toBe(30);
    expect(hit1(suchen(UNS_BGE_ALT))).toBe(35);
    expect(hit1_aus_feld(suchen(UNS_BGE_ALT))).toBe(31);
    const mehrere = QUERIES.filter((q) => q.relevant.length > 1);
    expect(mehrere).toHaveLength(6);
  });

  it("die Auswertung liegt als Text bei und nennt die Spanne ueber die Werkzeuge", () => {
    expect(fs.existsSync(AUSWERTUNG)).toBe(true);
    const t = fs.readFileSync(AUSWERTUNG, "utf8");
    expect(t).toContain("chroma Hit@1 19/45");
    expect(t).toContain("sqlite-vec 19/45");
    expect(t).toContain("chroma Hit@1 31/45");
    expect(t).toContain("sqlite-vec 30/45");
    expect(t).toContain("gekippt: 'Hetzner'");
  });

  it("der Gleichstands-Zensus entscheidet die Frage, ob die Zahl des Mitbewerbers wuerfelt", () => {
    expect(fs.existsSync(ZENSUS), path.basename(ZENSUS)).toBe(true);
    const t = fs.readFileSync(ZENSUS, "utf8");
    expect(t).toContain("A. Gleichstand auf Platz 1: 0 von 45 Anfragen");
    expect(t).toContain("A. Gleichstand auf Platz 1: 1 von 45 Anfragen");
    expect(t).toContain("B. davon haengt Treffer oder Fehlgriff daran: 1");
    expect(t).toContain("'Hetzner' [graph] Gruppe ['m16', 'm17'] | gueltige ['m16']");
  });

  it("auf der einen Gleichstands-Anfrage steht unsre erste Stelle ausserhalb der Gruppe", () => {
    const t = fs.readFileSync(ZENSUS, "utf8");
    expect(t).toContain("unsre erste Stelle m36 (treffer=True)");
    expect(t).toContain("D. unsre Fusion auf den Platz-1-Gleichstands-Anfragen: 1 von 1 getroffen");
    // Und die Gruppe selbst: m36 ist ein gueltiger Ausweis, gehoert aber nicht zur Gleichstand-Gruppe.
    expect(t).not.toContain("Gruppe ['m16', 'm17', 'm36']");
  });

  it("der Ledger nennt chroma mit Stufe und Werkzeug, und die Zahl steht in seiner Zeile", () => {    const t = fs.readFileSync(LEDGER, "utf8");
    // Die Regel gilt fuer die Zeilen, die eine Zahl ausliefern -- nicht fuer jeden
    // erwaehnenden Satz. Ein Prosa-Satz ueber chroma darf keine Stufe enthalten.
    const zahlenzeilen = t
      .split("\n")
      .filter((z) => z.startsWith("|") && z.includes("chroma") && z.includes("%"));
    expect(zahlenzeilen.length).toBeGreaterThanOrEqual(2);
    for (const z of zahlenzeilen) {
      expect(z, `Zeile liefert eine Zahl ohne Stufe: ${z}`).toMatch(/nomic|bge-m3|zweites Einbett/);
    }
    expect(t).toContain("42,2 %");
    expect(t).toContain("68,9 %");
  });
});
