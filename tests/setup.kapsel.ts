// Kapsel fuer jeden Testprozess — bevor irgendetwas importiert wird.
//
// Warum eine globale Datei und nicht die Kapsel jeder Testdatei selbst: gemessen
// 15.10. 12:08 MESZ (`belege-15-10/app-abnahme/app-j2.log.txt`) fiel ein einziger Fall mit
// dem Leib `Limit reached: 21066 active nodes, maximum is 5000` — 21.066 ist sein Bestand,
// nicht der einer Kapsel. Eine Datei, die ihr `HOME` zu spaetzt setzt (oder eine, die
// nach einem `afterEach` in den echten Ordner zurueckfaellt), landet bei `~/.kepta`.
// Zwei Laeufe davor und einer danach waren auf denselben Bytes gruen: die Kapsel hing an
// der Reihenfolge, nicht am Code.
//
// Die Kapsel liegt eine Ebene tiefer als die Ordner-Variable: `HOME` zeigt auf ein eigenes,
// leeres Verzeichnis, damit `~/.kepta` fuer diesen Prozess ein anderer Ort ist, die
// Aufloesungsregel selbst aber ungeaendert getestet werden kann. Das echte HOME bleibt
// sichtbar (`KEPTA_ECHTES_HOME`), damit die Wache unten nicht gegen sich selbst prueft.
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

const echt = homedir();
const kapsel = mkdtempSync(join(tmpdir(), "kepta-kapsel-"));

process.env.KEPTA_ECHTES_HOME = echt;
process.env.HOME = kapsel;
process.env.USERPROFILE = kapsel; // dieselbe Geste in der Windows-Pfadform

if (!existsSync(kapsel)) throw new Error(`Kapsel nicht angelegt: ${kapsel}`);
