// Die Kapsel-Rueckgabe ausserhalb eines Laufs — Aufgabe #112, zweite Haelfte.
//
// Warum hier und nicht in der Kapsel selbst: `tests/setup.kapsel.ts` legt pro
// Testdatei ein eigenes HOME an (gemessen 26.10.: 104 922 Ordner, 16,66 GiB unter
// $TMPDIR; zwei Volllaeufe legten 1 729 neue an). Ein Exit-Handler darin wurde
// 22:28 Uhr gefahren und nachgemessen — die Ordner blieben stehen (1 199 vor zwei
// Dateien, 1 201 nachher), weil der Fork-Pool seine Kinder mit einem Signal beendet
// und `exit` dann nicht laeuft. Der einzige Prozess, der diesen Lauf ueberlebt und
// alle seine Kinder kennt, ist der Parent, der ihn gestartet hat: das ist diese
// Datei.
//
// Was sie tut: vor dem Lauf ein Manifest-Ordner fuer genau diesen Lauf anlegen und
// seinen Pfad in die Umgebung stellen, damit jedes Kind seine Kapsel dort eintragen
// kann; nach dem Lauf jede Kapsel zurueckgeben, die (a) im Manifest steht, (b) ein
// unmittelbares Kind von $TMPDIR ist und (c) mit `kepta-kapsel-` beginnt. Eine
// Liste, die einen andern Pfad nennt, wird nicht angefasst — geloescht wird nur,
// was dieser Lauf selbst ausgewuerfelt hat.
//
// Zwei Laeufe kommen sich nicht in die Quere: das Manifest traegt Lauf-Marke und
// Parent-Pid, und ein Lauf liest ausschliesslich seine eigne Liste.
import { mkdirSync, readdirSync, rmSync, writeFileSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const KAPSEL_PRAEFIX = "kepta-kapsel-";

export default async function kapselRueckgabe() {
  const markt = join(tmpdir(), "kepta-kapseln", `${Date.now()}-${process.pid}`);
  const grund = tmpdir();
  let tragfahig = true;
  try {
    mkdirSync(markt, { recursive: true });
    process.env.KEPTA_KAPSEL_MANIFEST = markt;
  } catch {
    // Kein Manifest: die Kapseln werden weiter angelegt (sie sind die Isolation
    // selbst), aber niemand raehmt sie hinterher. Das ist der Stand vor diesem
    // Schlag — meldepflichtig, nicht schweigend hingenommen.
    tragfahig = false;
    console.warn("[kapsel-rueckgabe] Manifest nicht anlegbar — Kapseln bleiben in dieser Runde liegen");
  }

  return async function rueckgabe() {
    if (!tragfahig) return;
    let geloescht = 0;
    let verschont = 0;
    let fehler = 0;
    let eintraege: string[];
    try {
      eintraege = readdirSync(markt);
    } catch {
      console.warn("[kapsel-rueckgabe] Manifest nicht lesbar — nichts geloescht");
      return;
    }
    for (const eintrag of eintraege) {
      // Ein unmittelbares Kind von $TMPDIR, mit dem eignen Präfix, sonst nichts.
      if (!eintrag.startsWith(KAPSEL_PRAEFIX) || eintrag.includes("/") || eintrag.includes("..")) {
        verschont++;
        continue;
      }
      const pfad = join(grund, eintrag);
      try {
        if (!existsSync(pfad)) continue;
        if (!statSync(pfad).isDirectory()) { verschont++; continue; }
        rmSync(pfad, { recursive: true, force: true });
        geloescht++;
      } catch {
        fehler++;
      }
    }
    try {
      rmSync(markt, { recursive: true, force: true });
    } catch {
      fehler++;
    }
    const zeit = new Date().toLocaleTimeString("en-GB", { hour12: false, timeZone: "Europe/Berlin" });
    console.log(`[kapsel-rueckgabe] ${geloescht} Kapseln zurueckgegeben, ${verschont} verschont, ${fehler} Fehler — ${zeit}`);
  };
}
