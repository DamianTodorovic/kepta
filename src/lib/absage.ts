// Punkt 4 (P4-2310 c, P48/#47) — ein fester Satz nach aussen, der Grund bleibt beim Betreiber.
//
// Der Ausloeser war ein Bild, kein Quelltext-Blick: der Fensterlauf
// `scripts/pfade-im-fenster.mjs` warf beim Lesen einer Datei, und ihr Wortlaut
// (`QuotaExceededError: the quota has been exceeded — /Users/a/.kepta/kepta.db`, Pfad
// inklusive) stand als Knopfbeschriftung mitten im Fenster. Eine Bibliothek, ein Betriebssystem
// oder ein Browser-Dialog erzaehlt Dinge, die ein Nutzer nicht lesen soll: Pfade, Ordnernamen,
// Interna seines eignen Rechners.
//
// Die Kante ist nicht "nie eine Meldung", sondern die HERKUNFT: `ApiFehler` (src/lib/api.ts)
// traegt Saetze, die diese App oder ihre eigne Tuer geschrieben haben — die Tuer haelt ihre
// Ausgaette unter `EXPOSE_TEXTE` zusammen, und `tuerSatz` laesst nur einzeilige, kurze Texte
// durch. Ein fremder Hoerer ohne unsre Unterschrift (3.2.128) wird dort zur Zahl `HTTP <status>`.
//
// Alles andere, was werfen kann, geht ins Protokoll und von dort nie auf die Flaeche.

import { ApiFehler } from "./api";

/**
 * Ein Satz fuer die Flaeche, einer fuer das Protokoll.
 *
 * Die Flaeche nennt immer, WAS nicht geschah. Kennt die eigne Tuer zusaetzlich einen Grund,
 * steht er in Klammern dahinter — dasselbe Paar, das Settings seit P4-15 an der
 * Verbindungsmeldung nutzt ("refused it (HTTP 503)" gegen "did not answer"). Alles, was eine
 * Bibliothek, ein Betriebssystem oder ein Browser wirft, bleibt im Protokoll: sein Wortlaut
 * traegt Pfade und Interna (3.2.130, im Fenster bei 820 px gefunden).
 *
 * @param satz  der feste, menschenlesliche Satz — englisch, wie alle Flaechen der App
 * @param e     das, was geworfen wurde; nur ein `ApiFehler` kommt auf die Flaeche
 */
export function absage(satz: string, e: unknown): string {
  if (e instanceof ApiFehler && e.satz.trim()) {
    const grund = e.satz.trim();
    console.warn(`kepta: ${satz} — ${grund}`);
    return `${satz} (${grund})`;
  }
  console.error(`kepta: ${satz}`, e);
  return satz;
}

/**
 * Der Grund, der auf der Flaeche stehen darf — oder null, wenn etwas andres warf.
 *
 * Dasselbe Recht wie `absage`, aber als Wert statt als Satz: manche Flaeche baut den Grund in
 * einen laengeren Text ein oder merkt ihn sich, bevor sie malt. Die Kante bleibt die HERKUNFT:
 * ein `ApiFehler` traegt unsre Unterschrift. Alless andre — die TypeError des Browsers, der
 * SyntaxError der Laufzeit, ein Bibliotheks-Dialog — geht ins Protokoll und wird hier zu null.
 * Sein Wortlaut traegt Pfade und Interna (P48/#47, im Fenster bei 820 px gefunden).
 *
 * Die Wache `tests/absage-statt-ausnahmewort.test.ts` verbietet diesem Modul den Zugriff auf
 * den Wortlaut einer Ausnahme. Darum wirft die eigne Spiegelung seit 3.2.152 einen `ApiFehler`
 * und nicht mehr einen kahlen Error (src/lib/ai.ts:507): die Zahl ist unsre Form und darf auf
 * die Flaeche, und die Kante braucht keine Sonderstellung fuer eine Wortfolge. Wer einen
 * beliebigen String in einen `ApiFehler` wickelt, dreht die Regel um und gibt jedem Fremden
 * Passier-Recht — im Fehler-Feger #31 an Dashboard.tsx:692 gefunden und dort zurueckgenommen.
 */
export function flaechenGrund(e: unknown): string | null {
  if (e instanceof ApiFehler && e.satz.trim()) return e.satz.trim();
  if (e !== null && e !== undefined) console.error("kepta: the wording of this thrower stays in the log", e);
  return null;
}

/**
 * Der Halbsatz hinter einer Feststellung ueber die eigne Tuer, getrennt nach Herkunft und Antwort:
 * `refused it (HTTP 413)` — die Tuer hat gesprochen und lehnte ab — gegen `did not answer` — es warf
 * ein Fremder, und was er sagte, steht nur im Protokoll. Dasselbe Paar, das P4-15/16 an den
 * Einstellungs-Zeilen trennt; hier schliesst es die Klammer, die bisher beiden Faellen den
 * Ausnahmewortlaut gab (Settings.tsx:477 und :933, 4.11.).
 */
export function antwortKlausel(e: unknown): string {
  const grund = flaechenGrund(e);
  return grund === null ? "did not answer" : `refused it (${grund})`;
}
