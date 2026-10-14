// Der Durchlauf durch die Ordner eines Rechners.
//
// Bewusst ohne direkten Zugriff auf node:fs: das Dateisystem kommt als
// Schnittstelle herein. So laesst sich der Durchlauf mit einem erfundenen Baum
// pruefen — inklusive der Faelle, die man auf einer echten Platte nicht
// herstellen will (ein .ssh-Ordner voller Schluessel zum Beispiel).
import {
  beurteileDatei,
  istUebersprungenerOrdner,
  MAX_DATEIEN,
  MAX_TIEFE,
  type Ablehnungsgrund,
  type ScanEinstellungen,
} from "./regeln";

export interface Verzeichniseintrag {
  name: string;
  istOrdner: boolean;
  /** Nur fuer Dateien; Ordner duerfen 0 melden. */
  groesse: number;
}

export interface Dateisystem {
  /** Inhalt eines Ordners. Wirft nicht — bei fehlendem Zugriff eine leere Liste. */
  lies(ordner: string): Verzeichniseintrag[];
  /** Pfadtrenner-sichere Verbindung. */
  verbinde(a: string, b: string): string;
}

export interface Fund {
  pfad: string;
  groesse: number;
}

export interface ScanStand {
  /** Dateien, die aufgenommen werden koennen. */
  funde: Fund[];
  /** Wie viele Dateien insgesamt angesehen wurden. */
  gesehen: number;
  /** Wie oft welcher Ablehnungsgrund griff. */
  abgelehnt: Record<string, number>;
  /** Ordner, die gar nicht erst betreten wurden. */
  uebersprungeneOrdner: number;
  /** true, sobald eine Grenze erreicht war — es gaebe also mehr. */
  abgeschnitten: boolean;
}

export interface ScanOptionen {
  maxDateien?: number;
  maxTiefe?: number;
  /** Absolute Pfade, die ausgelassen werden (etwa K3PTAs eigener Datenordner). */
  ausgeschlossen?: readonly string[];
  /** Wird zwischen den Haeppchen gefragt; true bricht ab. */
  abbrechen?: () => boolean;
  /** Was der Nutzer eingestellt hat — schraenkt weiter ein, oeffnet nie. */
  einstellungen?: ScanEinstellungen;
}

function leererStand(): ScanStand {
  return { funde: [], gesehen: 0, abgelehnt: {}, uebersprungeneOrdner: 0, abgeschnitten: false };
}

function zaehle(stand: ScanStand, grund: Ablehnungsgrund): void {
  stand.abgelehnt[grund] = (stand.abgelehnt[grund] ?? 0) + 1;
}

/**
 * Laeuft die Wurzeln ab und meldet nach jeweils `haeppchen` Dateien den Stand.
 * Als Generator, damit der Server zwischendurch atmen kann — ein Heimverzeichnis
 * am Stueck durchzugehen wuerde die Anwendung fuer Sekunden einfrieren.
 */
export function* scanne(
  wurzeln: readonly string[],
  fs: Dateisystem,
  opts: ScanOptionen = {},
  haeppchen = 400
): Generator<ScanStand, ScanStand, void> {
  const maxDateien = opts.maxDateien ?? MAX_DATEIEN;
  const maxTiefe = opts.maxTiefe ?? MAX_TIEFE;
  const ausgeschlossen = new Set((opts.ausgeschlossen ?? []).map((p) => p.replace(/[\\/]+$/, "")));
  const stand = leererStand();
  const besucht = new Set<string>();

  // Die Wurzel wird mitgefuehrt: die Ordnerregeln duerfen nur den Teil
  // UNTERHALB davon bewerten, nicht den Pfad zum Heimverzeichnis selbst.
  const stapel: { pfad: string; tiefe: number; wurzel: string }[] = wurzeln.map((w) => ({ pfad: w, tiefe: 0, wurzel: w }));
  let seitLetzterMeldung = 0;

  while (stapel.length > 0) {
    if (opts.abbrechen?.()) { stand.abgeschnitten = true; return stand; }
    const { pfad, tiefe, wurzel } = stapel.pop()!;
    const normiert = pfad.replace(/[\\/]+$/, "");
    if (besucht.has(normiert)) continue;
    besucht.add(normiert);
    if (ausgeschlossen.has(normiert)) { stand.uebersprungeneOrdner++; continue; }
    if (tiefe > maxTiefe) { stand.uebersprungeneOrdner++; continue; }

    for (const eintrag of fs.lies(pfad)) {
      const voll = fs.verbinde(pfad, eintrag.name);
      if (eintrag.istOrdner) {
        const eigenesVeto = (opts.einstellungen?.zusaetzlichAusgelassen ?? [])
          .some((o) => o.toLowerCase() === eintrag.name.toLowerCase());
        if (istUebersprungenerOrdner(eintrag.name) || eigenesVeto || ausgeschlossen.has(voll.replace(/[\\/]+$/, ""))) {
          stand.uebersprungeneOrdner++;
          continue;
        }
        stapel.push({ pfad: voll, tiefe: tiefe + 1, wurzel });
        continue;
      }
      stand.gesehen++;
      seitLetzterMeldung++;
      const urteil = beurteileDatei(voll, eintrag.groesse, wurzel, opts.einstellungen);
      if (!urteil.aufnehmen) {
        zaehle(stand, urteil.grund!);
      } else if (stand.funde.length < maxDateien) {
        stand.funde.push({ pfad: voll, groesse: eintrag.groesse });
      } else {
        stand.abgeschnitten = true;
      }
      if (seitLetzterMeldung >= haeppchen) {
        seitLetzterMeldung = 0;
        yield stand;
      }
    }
  }
  return stand;
}

/** Bequemlichkeit fuer Aufrufer, die den Fortschritt nicht brauchen. */
export function scanneVollstaendig(
  wurzeln: readonly string[],
  fs: Dateisystem,
  opts: ScanOptionen = {}
): ScanStand {
  const lauf = scanne(wurzeln, fs, opts);
  let schritt = lauf.next();
  while (!schritt.done) schritt = lauf.next();
  return schritt.value;
}

/** Verteilung der Funde auf ihre obersten Ordner — fuer die Vorschau. */
export function nachOrdner(funde: readonly Fund[], wurzeln: readonly string[], grenze = 12): { ordner: string; anzahl: number }[] {
  const zaehler = new Map<string, number>();
  for (const f of funde) {
    const wurzel = wurzeln.find((w) => f.pfad.startsWith(w)) ?? "";
    const rest = f.pfad.slice(wurzel.length).replace(/^[\\/]+/, "");
    const erster = rest.split(/[\\/]/)[0];
    // Klammern sind hier nicht kosmetisch: ohne sie band das && staerker als das
    // ||, und ein Windows-Pfad ohne ersten Ordner haette "" als Schluessel bekommen.
    const inUnterordner = rest.includes("/") || rest.includes("\\");
    const schluessel = erster && inUnterordner ? erster : "(top level)";
    zaehler.set(schluessel, (zaehler.get(schluessel) ?? 0) + 1);
  }
  return [...zaehler.entries()]
    .map(([ordner, anzahl]) => ({ ordner, anzahl }))
    .sort((a, b) => b.anzahl - a.anzahl)
    .slice(0, grenze);
}
