// @vitest-environment node
//
// Punkt 5, Brief 78 — der Fuss hebt die Kappe mit, sonst kreuzt die Legende die Leinwand.
//
// Die Zahl, um die diese Datei schreibt, ist nicht gerechnet, sondern gefahren: am
// ausgelieferten 3.2.42 (Kopf `64263c9`, Tuer 62055, Bestand 21 066, Baum-Ansicht, zwei Gruppen,
// 13:01:27–13:02:42 MESZ, eignes Profil, CDP 9394 — Protokoll
// `feldzug/belege-2310/p5-fuss-2310/fuss-130242.txt`) liegt die Oberkante der Legende bei
// **390, 439 und 440 px um 28 px ueber** der Oberkante der Leinwand (Legende y 164, Leinwand
// y 192), bei **441 px und 1024 px nicht** (−12 px). Die Hebung wohnt in
// `@media (max-width: 440px)`, also ist die Kante 440 gegen 441 — Punkt 2s Messung, hier
// nachgefahren, nicht uebernommen.
//
// Der Grund ist eine Rechnung mit zwei Zahlen: der Fuss hebt mit **3,25rem** (52 px), die Kappe
// zog **1,5rem** (24 px) ab, und 52 − 24 = **28 px**. Seit dieser Runde ist es eine Zahl: der Fuss
// ist `--panel-fuss`, und die Kappe zieht sein Zweifaches ab — oben wie unten derselbe Atemzug.
// Nach demselben Lauf gemessen: Kreuzung **−52 px** bei 390/439/440, und bei 441 und 1024 px
// **unveraendert** (die Bilder sind bytegleich, sha `184c6a67…` und `dde7e828…`).
//
// Was diese Datei **nicht** kann: jsdom legt keine Kasten aus. Sie prueft die Arithmetik der
// zwei Erklaerungen, die am Fenster gemessen ist, und dass beide dieselbe Zahl lesen. Die
// Fenster-Messung selbst liegt als Protokoll und Bild paar bei den Belegen.
//
// **Vorher rot, gemessen:** gegen `64263c9` ohne diesen Koerper — Fall 1 auf der Kreuzung
// +28 px, Fall 2 auf der kahlen Kappe, Fall 3 auf dem Literal `bottom: 3.25rem`.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const CSS = readFileSync("src/index.css", "utf8");
const KAPPE = readFileSync("src/lib/kappe.ts", "utf8");
const GANG = readFileSync("src/components/KnowledgeGraph.tsx", "utf8");
const REM = 16;

/**
 * Kommentare sind Prosa, keine Erklaerung: die Marke `@media (max-width: 440px)` steht seit
 * dieser Runde auch in einem Kommentar ueber der Hebung, und eine Sonde, die Prosa fuer CSS
 * haelt, waehlt den falschen Block. Also alles zwischen `/*` und `*\/` heraus, bevor gelesen wird.
 */
const REGELN = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * Der Fuss in Pixeln, je Zustand. Vor dem Koerper war er keine Zahl an einer Stelle: die Basis
 * kam aus der Tailwind-Klasse `bottom-3` am Knoten, die Hebung aus `bottom: 3.25rem` in der
 * Telefon-Regel. Beides wird hier gelesen, damit Fall 1 gegen den gewesenen Stand **die Kreuzung**
 * meldet und nicht einen Sonde-Fehler — eine Sonde, die bei der alten Form frueher abbricht als
 * sie misst, ist kein Zeuge.
 */
function fussBreiten(): { basis: number; telefon: number } {
  // Es gibt **zwei** Blöcke mit derselben Schwelle in `src/index.css`: Zeile 773 (die
  // Zielgroessen-Latte auf 44 px) und Zeile 1523 (die Legende). Ein `indexOf` auf die Schwelle
  // erwischt den ersten und liesse die Legende-Regel ungesehen -- eine Sonde, die ihr Ziel nie
  // oeffnet, meldet Sauberkeit fuer etwas, das sie nie gelesen hat. Also: der Block, in dem die
  // Legende wirklich steht.
  const MARKE = "@media (max-width: 440px)";
  let anfang = -1;
  for (let i = REGELN.indexOf(MARKE); i !== -1; i = REGELN.indexOf(MARKE, i + 1)) {
    if (REGELN.slice(i, i + 1500).includes(".graph-legende")) { anfang = i; break; }
  }
  expect(anfang, "kein 440er-Block traegt eine Legende-Regel — die Hebung ist umgezogen").toBeGreaterThan(-1);
  const vorher = REGELN.slice(0, anfang);
  const block = REGELN.slice(anfang, anfang + 1500);
  const legende = GANG.match(/className="(graph-legende[^"]*)"/);
  expect(legende, "die Legende hat keine Klasse mehr, an der der Fuss wohnen koennte").toBeTruthy();
  const klassenFuss: Record<string, number> = { "bottom-3": 0.75 * REM, "bottom-2": 0.5 * REM };
  const ausKlasse = klassenFuss[(legende![1].split(/\s+/).find((k) => k.startsWith("bottom-")) || "")] ?? 0;
  const basisVar = vorher.match(/\.graph-legende\s*\{[^}]*--panel-fuss:\s*([0-9.]+)rem/);
  const telefonVar = block.match(/\.graph-legende\s*\{[^}]*--panel-fuss:\s*([0-9.]+)rem/);
  const telefonAlt = block.match(/\.graph-legende\s*\{[^}]*bottom:\s*([0-9.]+)rem/);
  expect(telefonVar || telefonAlt, "im Legende-Block steht weder eine Fuss-Variable noch ein kahles bottom — der Fall prueft nichts").toBeTruthy();
  return {
    basis: basisVar ? Number(basisVar[1]) * REM : ausKlasse,
    telefon: telefonVar ? Number(telefonVar[1]) * REM : Number(telefonAlt![1]) * REM,
  };
}

/** Die Kappe, wie `KAPPE_PANEL` sie schreibt: entweder ein kahles rem, oder ein Vielfaches des
 *  Fusses. Ein kahles rem ist die alte Form — und diejenige, die die Kreuzung ermoeglicht. */
function kappenAbzug(fussPx: number): { abzugPx: number; liestDenFuss: boolean } {
  const zeile = KAPPE.match(/maxHeight:\s*"([^"]+)"/);
  expect(zeile, "KAPPE_PANEL hat keine maxHeight — der Fall prueft nichts").toBeTruthy();
  const wert = zeile![1];
  const variabel = wert.match(/calc\(100%\s*-\s*([0-9.]+)\s*\*\s*var\(--panel-fuss/);
  if (variabel) return { abzugPx: Number(variabel[1]) * fussPx, liestDenFuss: true };
  const kahl = wert.match(/calc\(100%\s*-\s*([0-9.]+)rem/);
  expect(kahl, `die Kappe zieht weder den Fuss noch ein rem ab: ${wert}`).toBeTruthy();
  return { abzugPx: Number(kahl![1]) * REM, liestDenFuss: false };
}

describe("Brief 78 — der Fuss und die Kappe lesen dieselbe Zahl", () => {
  it("bei der Telefon-Hebung kreuzt die Legende die Oberkante der Leinwand nicht (gemessen: 28 px)", () => {
    const fuss = fussBreiten();
    const kappe = kappenAbzug(fuss.telefon);
    const kreuzungPx = fuss.telefon - kappe.abzugPx;
    expect(kreuzungPx, `Fuss ${fuss.telefon} px gegen Kappe-Abzug ${kappe.abzugPx} px — die Kreuzung` +
      ` waere ${kreuzungPx} px; am Objekt gemessen +28 px bei 390, 439 und 440 px`).toBeLessThanOrEqual(0);
  });

  it("die Kappe liest den Fuss, und der Fuss ist keine kahl gesetzte Bodenkante mehr", () => {
    const fuss = fussBreiten();
    const kappe = kappenAbzug(fuss.basis);
    expect(kappe.liestDenFuss, "die Kappe fuehrt eine eigne Zahl statt der Fuss-Variable").toBe(true);
    expect(KAPPE).toContain("var(--panel-fuss");
    expect(REGELN).toMatch(/\.graph-legende\s*\{[^}]*bottom:\s*var\(--panel-fuss\)/);
    expect(REGELN, "der Telefon-Fuss steht weiter als kahles `bottom` — keine Zahlstelle liest ihn").not.toMatch(/\.graph-legende\s*\{[^}]*bottom:\s*[0-9.]+rem/);
    expect(GANG, "die Legende traegt weiter ein eignes `bottom-3` neben der Variablen").not.toMatch(/graph-legende[^"]*bottom-3/);
  });

  it("der Fuss ist an genau einer Stelle je Zustand gesetzt, und die Hebung bleibt bei 3,25rem", () => {
    const fuss = fussBreiten();
    expect(fuss.basis, "der Basis-Fuss ist nicht mehr 0,75rem (= die alte `bottom-3`)").toBe(12);
    expect(fuss.telefon, "die #54-Hebung ist geaendert — sie haelt des Blaetterers 36,5 px plus 12 px Kante").toBe(52);
    expect(REGELN.match(/--panel-fuss:\s*[0-9.]+rem/g)?.length ?? 0, "eine Zahlstelle mehr fuer denselben Abstand").toBe(2);
  });
});
