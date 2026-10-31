// Der Tab, in dem die Hand in den Einstellungen stand — sein Gedaechtnis.
//
// Punkt 4 (Zensus 30.10., Abschnitt 3): `Settings.tsx` hielt den gewaehlten Tab ausschliesslich
// in `useState`. Wer bei "Device Sync" steht, die Seite verlaesst und wiederoeffnet, landet auf
// "AI & data" — als haette er nichts eingestellt. Jeder andre Regler dieser Seite schreibt einen
// Wert, den jemand liest; dieser eine schrieb nirgends hin.
//
// Warum ein eigner Schluessel und kein Sack: der Vorregel in `src/lib/settings.ts` folgend wird
// alles, was mit `kepta_` oder `ki_gehirn_` beginnt, beim Schreiben zusaetzlich als eigne Zeile in
// die Datenbank gespiegelt. Ein Name ohne diese Vorregel (oder ein Feld in `ui_prefs`) bliebe im
// Browser des Fensters liegen und verlore den Tab an einem andern Tag — derselbe Grund, warum
// `ki_gehirn_zoom` so gespeichert ist.
//
// Der Name selbst traegt seit 31.10. das Hauspraefix `kepta_` statt `ki_gehirn_`: der Workspace
// heisst so, die Vorregel kennt beide Praefixe, und eine neue Kennung nennt die Familie, die sie
// schon beim Anlegen haette tragen sollen. Der alte Name ist nicht still ersetzt — er liegt bei
// Installationen, die ihn geschrieben haben, und `wandeAlteKennung()` hebt ihn einmal herueber
// und loescht ihn dann auch in der Datenbank.
//
// Gelesen wird gegen eine benannte Menge, nicht gegen einen beliebigen Text: ein fremder Wert im
// Schluessel (Handarbeit, ein aelteres Programm, ein kaputter Schreibgriff) darf keinen Tab
// oeffnen, den es nicht gibt, und die Seite nicht leer lassen.

const TABS = ["system", "mcp", "sync"] as const;

/** Der Schluessel, unter dem der Tab liegt — auch die Wache auf die Vorregel prueft ihn. */
export const TAB_SCHLUESSEL = "kepta_einstellungen_tab";

/** Der Name von 3.2.101 und 3.2.102, aus dem der Wert einmal herueberkommt. */
export const ALT_SCHLUESSEL = "ki_gehirn_einstellungen_tab";

export type EinstellungenTab = (typeof TABS)[number];

function istTab(wert: unknown): wert is EinstellungenTab {
  return typeof wert === "string" && (TABS as readonly string[]).includes(wert);
}

/**
 * Hebt den Wert vom alten Namen herueber und raeumt den alten Namen weg.
 *
 * Der Grund ist keine Ordnungsliebe: waere die Kennung nur getauscht, staende bei jedem, der sie
 * geschrieben hat, ein Wert unter einem Namen, den niemand mehr liest — der Schirm fiele zurueck
 * auf "system", als waere die Einstellung verloren. `removeItem` laeuft durch die Huelle in
 * `settings.ts`, darum verschwindet der alte Name auch aus der gespiegelten Zeile in der
 * Datenbank und kommt beim naechsten Start nicht zurueck.
 */
function wandeAlteKennung(): void {
  try {
    const alt = localStorage.getItem(ALT_SCHLUESSEL);
    if (alt === null) return;
    if (localStorage.getItem(TAB_SCHLUESSEL) === null && istTab(alt)) {
      localStorage.setItem(TAB_SCHLUESSEL, alt);
    }
    localStorage.removeItem(ALT_SCHLUESSEL);
  } catch {
    /* Speicher abgelehnt — lesen kann der Fall darunter immer noch */
  }
}

/** Was beim Oeffnen der Seite offensteht; fremde oder fehlende Werte fallen auf den Anfang. */
export function tabLesen(): EinstellungenTab {
  wandeAlteKennung();
  try {
    const roh = localStorage.getItem(TAB_SCHLUESSEL);
    return istTab(roh) ? roh : "system";
  } catch {
    return "system";
  }
}

/** Merkt sich den Tab. Ein voller oder verbotener Speicher ist kein Grund fuer einen Wurf. */
export function tabSetzen(id: EinstellungenTab): void {
  try {
    localStorage.setItem(TAB_SCHLUESSEL, id);
  } catch {
    /* Speicher abgelehnt — der Tab bleibt fuer diesen Lauf offen, die Seite nicht leer */
  }
}
