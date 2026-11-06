// Kapsel fuer jeden Testprozess — bevor irgendetwas importiert wird.
//
// Warum eine globale Datei und nicht die Kapsel jeder Testdatei selbst: gemessen
// 15.10. 12:08 MESZ (`belege-15-10/app-abnahme/app-j2.log.txt`) fiel ein einziger Fall mit
// dem Leib `Limit reached: 21066 active notes, maximum is 5000` — 21.066 ist sein Bestand,
// nicht der einer Kapsel. Eine Datei, die ihr `HOME` zu spaetzt setzt (oder eine, die
// nach einem `afterEach` in den echten Ordner zurueckfaellt), landet bei `~/.kepta`.
// Zwei Laeufe davor und einer danach waren auf denselben Bytes gruen: die Kapsel hing an
// der Reihenfolge, nicht am Code.
//
// Die Kapsel liegt eine Ebene tiefer als die Ordner-Variable: `HOME` zeigt auf ein eigenes,
// leeres Verzeichnis, damit `~/.kepta` fuer diesen Prozess ein anderer Ort ist, die
// Aufloesungsregel selbst aber ungeaendert getestet werden kann. Das echte HOME bleibt
// sichtbar (`KEPTA_ECHTES_HOME`), damit die Wache unten nicht gegen sich selbst prueft.
import { mkdtempSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, basename } from "node:path";

const echt = homedir();
const kapsel = mkdtempSync(join(tmpdir(), "kepta-kapsel-"));

// Aufgabe #112, gemeldet statt halb geheilt: eine Kapsel je Testdatei bleibt liegen —
// gemessen 26.10. 21:27 unter $TMPDIR: 104 922 Ordner, 16,66 GiB Platte, und zwei
// Volllaeufe legten 1 729 Ordner neu an. Ein `process.on("exit")`-Handler hier wurde
// 22:28 Uhr gefahren und nachgemessen: die Kapseln blieben stehen (1 199 vor zwei
// Dateien, 1 201 nachher), weil der Fork-Pool seine Kinder mit einem Signal beendet und
// ein Exit-Handler dann nicht laeuft. Eine Kapsel, die dem laufenden Prozess den Boden
// unter HOME wegzieht, waere dazu ein Defekt — zurueckgeben laesst sie sich nur
// ausserhalb eines Laufs: scripts/raeume-stapel.mjs, mit Altersschwelle, Zaehlung vor
// und nachher und `df`-Beleg.

process.env.KEPTA_ECHTES_HOME = echt;
process.env.HOME = kapsel;
process.env.USERPROFILE = kapsel; // dieselbe Geste in der Windows-Pfadform

if (!existsSync(kapsel)) throw new Error(`Kapsel nicht angelegt: ${kapsel}`);

// Die eigene Adresse ins Manifest dieses Laufs schreiben, damit der Parent sie
// zurueckgibt, wenn dieser Prozess langst per Signal geendet hat
// (`tests/kapsel-rueckgabe.mts`). Kein Manifest-Feld heisst: ein Teillauf ausserhalb
// von vitest — dann bleibt die Kapsel liegen, und `scripts/raeume-stapel.mjs` holt
// sie mit Altersschwelle. Ein Fehler hier darf keinen Lauf kosten: die Kapsel selbst
// ist die Isolation, das Manifest nur ihre Rueckgabe.
const markt = process.env.KEPTA_KAPSEL_MANIFEST;
if (markt) {
  try {
    writeFileSync(join(markt, basename(kapsel)), kapsel + "\n");
  } catch { /* ohne Manifest wird die Kapsel nur nicht zurueckgegeben */ }
}
