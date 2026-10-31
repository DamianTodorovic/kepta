// Der Tab, in dem die Hand in den Einstellungen stand — sein Gedaechtnis.
//
// Punkt 4 (Zensus 30.10., Abschnitt 3): `Settings.tsx` hielt den gewaehlten Tab ausschliesslich
// in `useState`. Wer bei "Device Sync" steht, die Seite verlaesst und wiederoeffnet, landet auf
// "AI & data" — als haette er nichts eingestellt. Jeder andre Regler dieser Seite schreibt einen
// Wert, den jemand liest; dieser eine schrieb nirgends hin.
//
// Warum ein eigner Schluessel und kein Sack: der Vorregel in `src/lib/settings.ts:20-25`
// folgend wird alles, was mit `ki_gehirn_` beginnt, beim Schreiben zusaetzlich als eigne Zeile in
// die Datenbank gespiegelt. Ein Name ohne diese Vorregel (oder ein Feld in `ui_prefs`) bliebe im
// Browser des Fensters liegen und verlore den Tab an einem andern Tag — derselbe Grund, warum
// `ki_gehirn_zoom` so gespeichert ist.
//
// Gelesen wird gegen eine benannte Menge, nicht gegen einen beliebigen Text: ein fremder Wert im
// Schluessel (Handarbeit, ein aelteres Programm, ein kaputter Schreibgriff) darf keinen Tab
// oeffnen, den es nicht gibt, und die Seite nicht leer lassen.

const TABS = ["system", "mcp", "sync"] as const;

/** Der Schluessel, unter dem der Tab liegt — auch die Wache auf die Vorregel prueft ihn. */
export const TAB_SCHLUESSEL = "ki_gehirn_einstellungen_tab";

export type EinstellungenTab = (typeof TABS)[number];

function istTab(wert: unknown): wert is EinstellungenTab {
  return typeof wert === "string" && (TABS as readonly string[]).includes(wert);
}

/** Was beim Oeffnen der Seite offensteht; fremde oder fehlende Werte fallen auf den Anfang. */
export function tabLesen(): EinstellungenTab {
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
