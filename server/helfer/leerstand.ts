// P6-105 — wann die Tuer Leerlauf hat, und was sie in ihm tun darf.
//
// Warum diese Datei ueberhaupt existiert: die Vektorspur kostet einen vollen Aufbau ueber dem
// Bestand — gemessen 25.10.2026 an der eignen Kapsel (3.2.57, 20 066 Notizen, 64 164 Abschnitte
// zu 768 Dimensionen) 1 462,26 ms und 1 493,81 ms bei zwei echten Kaltstarts, dazu +475,0 MiB
// und +477,8 MiB Dauer-RSS. An der Boot-Achse darf dieser Lauf nicht haengen: dieselbe Tuer
// lauscht in 0,568 s und 0,654 s, und ein vorgezogener Aufbau haette den Boot auf ~2,1 s gezogen.
// Also: bauen, wenn niemand wartet. Dafuer braucht die Tuer ein Zeugnis ueber ihre eigne Ruhe —
// das hier ist es.
//
// Zwei Felder, nicht eins. `freieSeitMs()` allein luegt, solange eine Antwort noch laeuft: eine
// Seite, die gerade ihre zwanzig Anfragen holt, ist nicht leer, auch wenn die letzte Antwort
// 1,6 s alt ist. Darum zaehlt die Mittelware die offenen Antworten mit, und Stille gilt erst,
// wenn keine Antwort laeuft UND die letzte lange genug her ist.
//
// Die Beruhigung (`ruheAuftrag`) ist die zweite Haelft: `store.datenGeneration()` steigt bei
// JEDEM Schreibfall — auch bei jedem Einbettungs-Nachschub der Hintergrund-Queue, dessen
// `UPDATE ON chunks` einen Trigger ohne WHEN-Klausel hat (src/core/store.ts:969). Ohne die
// Beruhigung wuerde die Vorwaermung in jeder Pause zwischen zwei Queue-Schreibfaellen den
// ganzen Bestand neu lesen: ein 1,5-Sekunden-Aufbau im Sekundentakt, ausgerechnet wenn die
// Maschine am maechtigsten arbeitet.
import type { NextFunction, Request, Response } from "express";

/** So lange muss die Tuer still gewesen sein, bevor ein Vorlauf anfaengt. */
export const LEERLAUF_FENSTER_MS = 1_500;

/** Der Takt, in dem die Ruhe geprueft wird. Bewusst grob: ein enger Takt waert selbst Laerm. */
export const LEERLAUF_PRUEF_MS = 1_000;

let laeuft = 0;
let letzterAbschluss = Number.NaN;
let seitAnfang = Date.now();

/**
 * Eine Mittelware, die nur hinschaut: sie offnet und schliesst die Rechnung ueber die offenen
 * Antworten. Vor ALLEM anderen eingehaengt (server/app.ts), damit auch die Antworten zaehlen,
 * die spaeter im Kettenverlauf stecken bleiben oder abbrechen.
 */
export function leerstandsmittelware(req: Request, res: Response, next: NextFunction): void {
  laeuft += 1;
  let erledigt = false;
  const schliesse = (): void => {
    if (erledigt) return;
    erledigt = true;
    laeuft -= 1;
    letzterAbschluss = Date.now();
  };
  res.once("finish", schliesse);
  res.once("close", schliesse);
  next();
}

/** Millisekunden, die die Tuer schon still ist. Laufende Antworten hoeren die Uhr auf null. */
export function freieSeitMs(now: number = Date.now()): number {
  if (laeuft > 0) return 0;
  // Nie eine Anfrage gesehen: die Tuer wartet seit dem Anfang ihres eigenen Prozesses —
  // sonst baete die Vorwaermung dem ersten Seitenaufruf der Oberflaeche die Tur zu.
  const anker = Number.isNaN(letzterAbschluss) ? seitAnfang : letzterAbschluss;
  return Math.max(0, now - anker);
}

export function laeuftAnfragen(): number {
  return laeuft;
}

/** Nur fuer die Pruefung: die Rechnung von Hand zuruecksetzen, damit Faelle nicht stapeln. */
export function leerstandZuruecksetzen(): void {
  laeuft = 0;
  letzterAbschluss = Number.NaN;
  seitAnfang = Date.now();
}

export interface LeerlaufSteuer {
  abbrechen: () => void;
}

/**
 * Laedt `tun()` beim naechsten Leerlauf, und danach immer wieder beim naechsten Leerlauf,
 * solange `bedarf()` anruft. Ein Wurf waehrend des Vorlaufs beendet den Laeufer — eine
 * Vorwaermung, die gerade nicht gelingt, darf nicht in jeder stillen Sekunde erneut
 * 1,5 Sekunden Rechenarbeit holen; die erste Suche zahlt dann, wie sie heute zahlt.
 */
export function beimLeerstand(opts: {
  bedarf: () => boolean;
  freieSeitMs?: () => number;
  fensterMs?: number;
  pruefMs?: number;
  tun: () => void;
  fehler?: (grund: unknown) => void;
}): LeerlaufSteuer {
  const fensterMs = opts.fensterMs ?? LEERLAUF_FENSTER_MS;
  const pruefMs = opts.pruefMs ?? LEERLAUF_PRUEF_MS;
  const freieSeit = opts.freieSeitMs ?? ((): number => freieSeitMs());
  let marke: ReturnType<typeof setTimeout> | undefined;
  let aus = false;

  const pruefe = (): void => {
    if (aus) return;
    try {
      if (opts.bedarf() && freieSeit() >= fensterMs) {
        opts.tun();
      }
    } catch (grund) {
      aus = true;
      opts.fehler?.(grund);
    }
    if (aus) return;
    marke = setTimeout(pruefe, pruefMs);
    // Ein Laeufer darf einen Process am Beenden hindern: ohne diese Zeile hielte die
    // Ruhepruefung jeden kurzlebigen Start (Test, CLI, MCP-Kanal) offen.
    if (marke && typeof marke === "object" && typeof marke.unref === "function") marke.unref();
  };

  marke = setTimeout(pruefe, pruefMs);
  if (marke && typeof marke === "object" && typeof marke.unref === "function") marke.unref();

  return {
    abbrechen: (): void => {
      aus = true;
      if (marke) clearTimeout(marke);
      marke = undefined;
    },
  };
}

/**
 * Der Auftrag hinter der Beruhigung: er gilt erst, wenn die Datenwelt stillsteht.
 *
 * `stehe()` wird einmal je Prueftakt gelesen. Ruft die Beruhigung denselben Stand zweimal
 * hintereinander und die Spur ist doch veraltet, ist der Auftrag offen. Aendert sich die
 * Generation zwischen zwei Takten (Import, Queue, Reparaturen), bleibt er zu — die Vorwaermung
 * wartet, bis der Schreibstorm vorueber ist, und holt ihn dann nach.
 */
export function ruheAuftrag(opts: {
  stehe: () => { veraltet: boolean; generation: number };
}): () => boolean {
  let letzte = Number.NaN;
  return (): boolean => {
    const stand = opts.stehe();
    const offen = stand.veraltet && stand.generation === letzte;
    letzte = stand.generation;
    return offen;
  };
}
