/**
 * Die Faltkante der More-Klappe - ein Fall, der eine Messung haelt, keine Marke.
 *
 * Was der Fall nicht ist: eine Suche nach dem Wort `sticky`, die gruen wird,
 * sobald irgendwo eine Zeile klebt. Was er ist: die Klappe muss ihren eignen
 * Fuss kennen. Sie verankert sich an `bottom-2` (8 px) und polstert mit `py-2`
 * (8 px); ein Hinweis, der am Rollrand kleben soll, muss genau diese 8 px
 * zuruecknehmen - sonst schwebt er 8 px ueber der Kante, die er anzeigt.
 *
 * Die Zahlen, gegen die hier gerechnet wird, sind gemessen: 23.10.2026,
 * 18:51:50 MESZ, am AUSGELIEFERTEN Objekt 3.2.44 (`app.asar` 49 102 581 B,
 * mtime 18:05:39), eigne Kapsel, 390 x 844, Klappe offen: Kasten 170,0 bis
 * 812,0, `clientHeight` 640 gegen `scrollHeight` 1 576 -> **11 von 17 Reihen
 * unter der Kante, 10 ganz draussen**; bei 820 sind es 0 von 17. Belege:
 * `audit-2026-10-09/feldzug/belege-2310/klappe-zwei-richtungen/p2-kappe-56px.json`.
 *
 * **Gegen den Stand 3.2.44 (Kopf 87b952d) ist der Fall rot:** es gibt weder das
 * Element (`grep -rn "graph-mehr-draussen" src/` = 0, 23.10. 20:03 und 20:08
 * MESZ) noch eine Rechnung, die die Reihen gegen die Oeffnung misst.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const QUELLE = "src/components/KnowledgeGraph.tsx";

/** Der Abschnitt der Klappe, von ihrer Kennung bis zum Rahmen der Leinwand. */
function klappenBlock(): string {
  const quelltext = readFileSync(QUELLE, "utf8");
  const anker = quelltext.indexOf('id="graph-mehr-panel"');
  expect(anker, "das More-Panel fehlt an der Flaeche").toBeGreaterThan(-1);
  const ende = quelltext.indexOf("ref={containerRef}", anker);
  expect(ende, "der Rahmen nach der Klappe fehlt").toBeGreaterThan(anker);
  return quelltext.slice(anker, ende);
}

/** Die erste Klasse nach einer Stelle - der Karton, der dort beginnt. */
function klassenAb(block: string, ab: number): string {
  const treffer = block.slice(ab).match(/className="([^"]*)"/);
  expect(treffer, "hier traegt kein Karton eine Klasse").toBeTruthy();
  return treffer![1];
}

describe("More-Klappe: die Faltkante nennt den Rest und deckt den Kopf nicht", () => {
  const block = klappenBlock();
  const kasten = block.indexOf('className="hud-panel');
  const hinweis = block.indexOf('data-testid="graph-mehr-draussen"');

  it("der Hinweis steht in der Klappe, hinter ihren Reihen (gemessen: 11 von 17 unter der Kante)", () => {
    expect(hinweis, "die Klappe nennt den Rest nicht").toBeGreaterThan(-1);
    expect(block.indexOf("plan.menue.map("), "der Hinweis steht vor den Reihen").toBeLessThan(hinweis);
  });

  it("er deckt den Kopf nicht: er liegt hinter dem Close-Knopf und klebt am untern Rand", () => {
    expect(block.indexOf('title="Close"'), "der Close-Knopf fehlt").toBeGreaterThan(-1);
    expect(block.indexOf('title="Close"'), "der Hinweis liegt vor dem Close-Knopf").toBeLessThan(hinweis);
    const klasse = klassenAb(block, hinweis);
    expect(klasse, "der Hinweis klebt nicht").toMatch(/\bsticky\b/);
    expect(klasse, "der Hinweis klebt nicht an der Unterkante").toMatch(/\bbottom-0\b/);
    // ein Hinweis, der Klicks frisst, deckt am Ende doch etwas zu
    expect(klasse, "der Hinweis faengt Klicks").toMatch(/\bpointer-events-none\b/);
  });

  /**
   * 24.10., gemessen am Bau 3.2.48 in eigner Grube (23:16 MESZ): der Balken endete auf
   * 803,0, die Klappe auf 812,0 - in den 8 px dazwischen stand der angeschnittene
   * `Motion`-Knopf (Pixel 7,7,8 gegen Panel-Grund 37,37,38). Die Reparatur nimmt der
   * Klappe den Polster (`pb-0`) und dem Balken die negative Untermargin; dann deckt er
   * bis 811,0, und der Streifen traegt ueberall den Balken-Grund (56,56,58).
   */
  it("sein Fuss ist der Fuss der Klappe: kein Polster unten, keine negative Untermargin, Schwelle 1 px", () => {
    const klappe = klassenAb(block, kasten);
    expect(klappe, "die Klappe polstert unten noch - der Streifen bleibt").toMatch(/\bpb-0\b/);
    expect(klappe, "die Klappe hat oben kein pt-2 mehr").toMatch(/\bpt-2\b/);
    expect(klappe, "die Klappe haengt nicht an bottom-2").toMatch(/\bbottom-2\b/);
    const klasse = klassenAb(block, hinweis);
    expect(klasse, "der Balken zieht sich mit negativer Untermargin vom Fuss weg").not.toMatch(/(?:^|\s)-mb-/);
    const quelltext = readFileSync(QUELLE, "utf8");
    expect(quelltext, "die Messung rechnet noch mit 9 px (Rand + altes py-2) statt mit dem 1 px Rand").toMatch(/getBoundingClientRect\(\)\.bottom - 1;/);
  });

  it("seine Zahl ist gemessen, nicht abgeschrieben: Reihen gegen die Oeffnung", () => {
    const quelltext = readFileSync(QUELLE, "utf8");
    expect(block, "keine Reihe nennt sich der Rechnung").toContain("data-mehr-reihe");
    // Die Messung steht im Rumpf, nicht im JSX: sie muss in EINEM Block Reihen
    // zaehlen, Rechtecke lesen und die Zahl setzen - ein Muster weit ueber die
    // Datei wuerde auch die Rechtecke der Legende als Beweis nehmen.
    const rechnung = quelltext.match(/const messen = \(\) => \{[\s\S]{0,900}?kasten\.addEventListener\("scroll", messen/);
    expect(rechnung, "die Zahl kommt aus keiner Messung").toBeTruthy();
    expect(rechnung![0], "die Messung zaehlt keine Reihen").toContain("data-mehr-reihe");
    expect(rechnung![0], "die Messung liest keine Rechtecke").toMatch(/getBoundingClientRect\(\)\.bottom/);
    expect(rechnung![0], "die Messung lauscht nicht am Rollen").toMatch(/addEventListener\("scroll"/);
    expect(block, "der Hinweis erscheint auch ohne Rest").toMatch(/mehrDraussen > 0 &&/);
  });

  it("er sagt nie die Zahl der Glieder: das waere 17 bei 390, nicht 11", () => {
    const ende = block.indexOf("</div>", hinweis);
    expect(ende, "der Hinweis hat kein Ende").toBeGreaterThan(hinweis);
    expect(block.slice(hinweis, ende), "der Hinweis zitiert die Zahl der Glieder").not.toContain("plan.menue.length");
  });
});
