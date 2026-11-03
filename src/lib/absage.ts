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
