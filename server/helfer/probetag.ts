// Der Pro-Tag: jeder frische Download läuft 24 Stunden lang mit allen
// Pro-Funktionen ohne Limiten — kein Panel, kein Knopf, kein Schlüssel.
// Danach gleitet die App in den Free-Plan (Tageslimiten, sperrt nie).
//
// Die Zuständigkeit liegt in planzustand.ts: der Erststart-Anker lebt im
// Schlüsselbund (überlebt die Datenbank), der Zustand ist verschlüsselt und
// authentisiert — Neustart, zurückgedrehte Uhr und DB-Bearbeitung führen
// alle nicht zu einem neuen Tag. Diese Datei ist nur die schmale API für
// App-Start, Lizenz-Route und Freemium-Middleware.
import type { KeptaStore } from "../../src/core/store";
import { PROBETAG_LAENGE_MS, protagStartSichern, probetagVon } from "./planzustand";

export { PROBETAG_LAENGE_MS };

/** Sichert den Erststart einmalig — beim ersten echten Start der App. */
export function ersterStartSichern(store: KeptaStore, datenordner: string, jetzt = Date.now()): number | null {
  return protagStartSichern(store, datenordner, jetzt);
}

export interface Probetag {
  aktiv: boolean;
  /** Wie lange der Tag noch läuft (0, wenn vorbei oder manipuliert). */
  restMs: number;
  /** Der gesicherte Erststart-Zeitstempel (null ohne jeden Bund — Server). */
  start: number | null;
}

/** Läuft der Pro-Tag noch? Persistenter Zustand, Anker-Konsens, Monotonie. */
export function probetagStatus(store: KeptaStore, datenordner: string, jetzt = Date.now()): Probetag {
  return probetagVon(store, datenordner, jetzt);
}
