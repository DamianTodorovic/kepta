/**
 * Die Klappe am Fuss — ein Fall, der eine Messung haelt, nicht eine Marke.
 *
 * Was der Fall NICHT ist: ein Zahlwerk, das prueft, ob das Wort `56px` irgendwo im Quelltext
 * steht. Das waere eine Marke ueber die Anwesenheit einer Zahl und sagt nichts darueber, ob die
 * Zahl zu dem passt, was sie begrenzen soll.
 *
 * Was der Fall ist: die Kappe der Klappe muss **dieselbe Strecke** abziehen, die ihre eigne
 * Verankerung braucht — den Abstand von der Zeile (`top-[47px]`) und den Abstand zum Fuss
 * (`bottom-2`), plus den Rand dazwischen. Nur dann ist "die Klappe kappt sich am Fuss" eine
 * Groesse und keine Behauptung.
 *
 * Die Zahl unten ist gemessen, nicht gerechnet: 23.10.2026, 18:51:50 MESZ, am AUSGELIEFERTEN
 * Objekt 3.2.44 (`app.asar` 49 102 581 B, mtime 18:05:39), eigne Kapsel (eigne PID 76536,
 * Tuer 59589, 150 Knoten, Baum-Ansicht, zwei Gruppen, Bewegung aus), headless Brave mit eigner
 * PID 76548 und CDP-Port 9388, DPR 2. Belege:
 * `audit-2026-10-09/feldzug/belege-2310/klappe-zwei-richtungen/p2-kappe-56px.json` (4 534 B)
 * und `p2-kappe-56px-protokoll.txt` (1 421 B).
 *
 *   Breite  Element              Kasten y            Kasten unten  Leinwand unten  Abstand
 *   1024    graph-mehr-panel     114 bis 736         736 px        744 px          8 px
 *   390     graph-mehr-panel     170 bis 812         812 px        820 px          8 px
 *
 * Vorher, am gewesenen Stand 3.2.38 (gemessen 22.10. 22:37 MESZ, 390 x 844): Kasten 170 bis
 * 553,9 px bei 820 px Leinwandfuss — **266,1 px Abstand zum Fuss**, weil `max-h-[55%]` die
 * Klappe mitten im Bild enden liess. **Gegen diesen Stand ist der Fall rot.**
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const QUELLE = "src/components/KnowledgeGraph.tsx";

/** Der Klassenstring des More-Panels, gesucht an seiner eignen Kennung, nicht irgendwo in der Datei. */
function klappenKlasse(): string {
  const quelltext = readFileSync(QUELLE, "utf8");
  const anker = quelltext.indexOf('id="graph-mehr-panel"');
  expect(anker, "das More-Panel fehlt an der Flaeche").toBeGreaterThan(-1);
  // die Klasse steht nach der Kennung, spaetestens am ersten grossen JSX-Kind danach
  const schnitt = quelltext.slice(anker, anker + 2200);
  const treffer = schnitt.match(/className="([^"]*)"/);
  expect(treffer, "das More-Panel traegt keine Klasse").toBeTruthy();
  return treffer![1];
}

/** Tailands Default-Rasterskala: 1 Eintrag = 0,25 rem = 4 px bei 16 px Grundgroesse. */
const PX_PRO_EINTRAG = 4;

function zahlAusKlasse(klasse: string, muster: RegExp, name: string): number {
  const m = klasse.match(muster);
  expect(m, `die Klappe hat kein ${name} — die Kappe kann nicht gegen ihre Verankerung gerechnet werden`).toBeTruthy();
  return Number(m![1]);
}

describe("Klappe am Fuss: die Kappe zieht ab, was ihre eigne Verankerung braucht", () => {
  const klasse = klappenKlasse();
  const oben = zahlAusKlasse(klasse, /(?:^|\s)top-\[(\d+(?:\.\d+)?)px\]/, "top-[Npx]");
  const unten = zahlAusKlasse(klasse, /(?:^|\s)bottom-(\d+(?:\.\d+)?)(?:\s|$)/, "bottom-N") * PX_PRO_EINTRAG;
  const kappe = zahlAusKlasse(klasse, /(?:^|\s)max-h-\[calc\(100%-(\d+(?:\.\d+)?)px\)\]/, "max-h-[calc(100%-Npx)]");

  it("die Kappe ist die Summe ihrer eignen Verankerung (gemessen: 8 px bis an den Fuss)", () => {
    // 1 px Rand zwischen Rahmen und Inhalt erklaert die Differenz; die Messung am Objekt sagt,
    // dass der Kasten 8 px ueber der Leinwandkante endet, bei 47 px Anker an der Zeile.
    expect(kappe, `Kappe ${kappe} px gegen Verankerung ${oben} + ${unten} px`).toBe(oben + unten + 1);
  });

  it("die Klappe rollt, weil ihr Inhalt ueber den Fuss hinauswaechst (gemessen: 640 gegen 1 576 px)", () => {
    expect(klasse, "eine Klappe ohne eigne Rolle schneidet den Rest ab").toMatch(/overflow-y-auto/);
  });

  it("ab 820 px traegt ein Raster zwei Spalten; Multicol legt bei Ueberlauf eine dritte an", () => {
    // Befund 24.10. 00:18 MESZ, 1024 x 768: `columns-2` schob `farben` nach x 988..1 317,
    // die Klappe endet bei 985; clientHeight == scrollHeight == 612, also kein Rollweg.
    expect(klasse, "die Klappe traegt kein Raster ab 820").toMatch(/min-\[820px\]:grid/);
    expect(klasse, "das Raster hat keine zwei Spalten").toMatch(/min-\[820px\]:grid-cols-2/);
    expect(klasse, "Multicol kann hinter der rechten Kante eine dritte Spalte anlegen").not.toMatch(/min-\[820px\]:columns-2/);
  });
});
