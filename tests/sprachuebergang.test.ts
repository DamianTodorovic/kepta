/* P181 (#44): der Sprachpreis am ausgelieferten Baum — eine Einbett-Frage.

   P113 (6.11.) las "das mehrsprachige Einbett ist kein Hebel für die
   Sprachgrenze" — gemessen auf dem kaputten Motor (das Vektor-Bein war an 13
   von 45 bge-Anfragen stumm, P120). Am ausgelieferten 3.2.193 (P176-
   Boden-Flicken gelandet) ist es wach, und die Messung kehrt sich um: nomic
   verliert 33,3 Pp über die Sprachgrenze, bge-m3 GEWINNT 13,3 — der
   Stufen-Unterschied ist 46,6 Ppunkte. Diese Datei haelt die vier Läufe
   (20:53–20:56 MEZ, je Stufe zwei bytegleiche) und die Ledger-Berichtigung
   zusammen, damit die Empfehlung (bge-m3 für mehrsprachige Bestände, Preis:
   Re-Einbettung des Bestands) nicht wieder zu einem Satz ohne Maschine wird. */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CORPUS, QUERIES } from "../scripts/eval-corpus";

const WURZEL = path.resolve(import.meta.dirname, "..");
const BELEG = path.join(WURZEL, "docs/belege/tag-0911");

/** Ein Sprach-Log in zwei Blöcke schneiden: der Abschnitt ab seiner Kopfzeile. */
function block(text: string, start: string): string {
  const i = text.indexOf(start);
  if (i < 0) return "";
  const rest = text.slice(i);
  const j = rest.indexOf("\n\n");
  return j < 0 ? rest : rest.slice(0, j);
}

/** [deutsch Hit@1, englisch Hit@1, Sprachpreis] aus einem Block, sonst null. */
function preis(text: string, start: string): [number, number, number] | null {
  const b = block(text, start);
  const d = /deutsch\s+Hit@1\s+([\d.]+)/.exec(b);
  const e = /englisch\s+Hit@1\s+([\d.]+)/.exec(b);
  const p = /Sprachpreis Hit@1:\s+([+-]?[\d.]+)/.exec(b);
  return d && e && p ? [Number(d[1]), Number(e[1]), Number(p[1])] : null;
}

const log = (modell: string, lauf: string) =>
  fs.readFileSync(path.join(BELEG, `sprache-${modell}-193-${lauf}.log.txt`), "utf8");

describe("P181: der Sprachpreis am ausgelieferten Baum ist eine Einbett-Frage", () => {
  it("nomic verliert -33,3 Pp (v3) — zweimal bytegleich", () => {
    for (const lauf of ["eins", "zwei"] as const) {
      const t = log("nomic-embed-text", lauf);
      expect(preis(t, "v3 Engine mit Vektoren"), `nomic ${lauf}`).toEqual([60, 26.7, -33.3]);
      expect(preis(t, "nur das Vektor-Bein"), `nomic ${lauf}, Diagnose-Bein`).toEqual([73.3, 26.7, -46.7]);
    }
  });

  it("bge-m3 gewinnt +13,3 Pp (v3) — zweimal bytegleich, das wache Vektor-Bein trägt", () => {
    for (const lauf of ["eins", "zwei"] as const) {
      const t = log("bge-m3", lauf);
      expect(preis(t, "v3 Engine mit Vektoren"), `bge ${lauf}`).toEqual([53.3, 66.7, 13.3]);
      expect(preis(t, "nur das Vektor-Bein"), `bge ${lauf}, Diagnose-Bein`).toEqual([66.7, 60, -6.7]);
    }
  });

  it("die Paare sind die des Fixkorpus — dieselben Ziele, nur die Sprache verschoben", () => {
    // Die Messung erbt die Ziele, sie erfindet keine: 15 Paare aus 45 Anfragen.
    expect(QUERIES.length).toBe(45);
    expect(CORPUS.length).toBe(58);
    for (const lauf of ["eins", "zwei"] as const) {
      expect((log("bge-m3", lauf).match(/15 Anfrage-Paare/g) ?? []).length).toBe(1);
    }
  });

  it("die Ledger-Berichtigung nennt beide Stufen-Preise und ihre Zeugnisse", () => {
    const ledger = fs.readFileSync(path.join(WURZEL, "docs/konkurrenz.md"), "utf8");
    // Der Ledger-Abschnitt hat Leerzeilen — bis zur naechsten Ueberschrift schneiden.
    const beginn = ledger.indexOf("P181, 9.11. 20:56 MEZ");
    const reste = ledger.slice(beginn);
    const ende = reste.indexOf("\n## ");
    const abschnitt = ende < 0 ? reste : reste.slice(0, ende);
    expect(abschnitt).toContain("33,3 Pp");
    expect(abschnitt).toContain("+13,3 Pp");
    expect(abschnitt).toContain("sprache-bge-m3-193-eins.log.txt");
    expect(abschnitt).toContain("sprache-nomic-embed-text-193-eins.log.txt");
    // Die Gegenrichtung bleibt ungemessen — die Berichtigung sagt es wieder.
    expect(abschnitt).toContain("Gegenrichtung");
  });
});
