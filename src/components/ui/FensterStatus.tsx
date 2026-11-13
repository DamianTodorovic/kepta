// P202, Mockup-Grammatik (k3pta-app-fenster .statuszeile): die Statuszeile
// läuft über die volle Fensterbreite UNTER dem Körper — ein Ort pro Fenster,
// nicht eine Zeile je Fläche. Die Flächen melden ihren Inhalt an diesen Slot;
// der Slot zeigt die Zeile der AKTIVEN Fläche. So bleibt „local · private“
// ein einziges Blatt im Baum (Lehre 33) und die Zeile steht fix am Fenster,
// egal wie die Fläche rollt.
import { createContext, useContext } from 'react';

export interface FensterStatusZeile {
  /** Der linke Teil — zustandsgetragene Wörter, bereits ohne Klassen-Rahmen. */
  links?: React.ReactNode;
  /** Die rechte Zelle (margin-left auto im Slot). */
  rechts?: React.ReactNode;
}

const FensterStatusKontext = createContext<(zeile: FensterStatusZeile) => void>(() => {});

export function FensterStatusAnbieter({ melde, kinder, children }: { melde: (zeile: FensterStatusZeile) => void; kinder?: React.ReactNode; children?: React.ReactNode }) {
  return <FensterStatusKontext.Provider value={melde}>{kinder ?? children}</FensterStatusKontext.Provider>;
}

/** Die Fläche meldet ihre Statuszeile — einmal je Render der gemeldeten Teile. */
export function benutzeFensterStatus(): (zeile: FensterStatusZeile) => void {
  return useContext(FensterStatusKontext);
}
