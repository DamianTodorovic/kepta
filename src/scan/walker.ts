// Der Durchlauf durch die Ordner eines Rechners.
//
// Bewusst ohne direkten Zugriff auf node:fs: das Dateisystem kommt als
// Schnittstelle herein. So laesst sich der Durchlauf mit einem erfundenen Baum
// pruefen — inklusive der Faelle, die man auf einer echten Platte nicht
// herstellen will (ein .ssh-Ordner voller Schluessel zum Beispiel).
import {
  beurteileDatei,
  istKeptaDatenordner,
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

export interface UebersprungenerOrdner {
  ordner: string;
  /** Warum der Ordner zu blieb: systemordner | abgewaehlt | eigene-daten | ausgeschlossen | zu-tief */
  grund: string;
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
  /** Welche das sind — eine Zahl ohne Namen ist keine Auskunft. Begrenzt. */
  uebersprungene: UebersprungenerOrdner[];
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

/** Hoechstens so viele Ordnernamen werden gemeldet — ein Heim kann Tausende haben. */
const NAMEN_KAPPE = 50;

function leererStand(): ScanStand {
  return { funde: [], gesehen: 0, abgelehnt: {}, uebersprungeneOrdner: 0, uebersprungene: [], abgeschnitten: false };
}

function zaehle(stand: ScanStand, grund: Ablehnungsgrund): void {
  stand.abgelehnt[grund] = (stand.abgelehnt[grund] ?? 0) + 1;
}

/** Ein Ordner blieb zu. Zaehlen — und beim Namen melden, solange er nicht untergeht. */
function meldet(stand: ScanStand, pfad: string, grund: string): void {
  stand.uebersprungeneOrdner++;
  if (stand.uebersprungene.length >= NAMEN_KAPPE) return;
  const teile = pfad.split(/[\\/]/).filter(Boolean);
  const name = teile[teile.length - 1];
  if (name) stand.uebersprungene.push({ ordner: name, grund });
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
    if (ausgeschlossen.has(normiert)) { meldet(stand, normiert, "ausgeschlossen"); continue; }
    if (tiefe > maxTiefe) { meldet(stand, normiert, "zu-tief"); continue; }

    const eintraege = fs.lies(pfad);
    // Traegt dieser Ordner K3PTAs eigene Datenbank, ist er ein Datenordner — der
    // lebende oder eine seiner Kopien. Ihn einzulesen haette zwei Folgen: der
    // Scan fuellt das Gehirn mit seiner eigenen Sicherung (gemessen 53,6 % eines
    // Erstlaufs im echten Heim), und er macht aus `scan-config.json` und
    // `profile.json` Notizen — Dateien, die verschluesselt abgelegt werden und
    // ueber MCP an angeschlossene Agenten gehen.
    if (istKeptaDatenordner(eintraege)) { meldet(stand, normiert, "eigene-daten"); continue; }

    for (const eintrag of eintraege) {
      const voll = fs.verbinde(pfad, eintrag.name);
      if (eintrag.istOrdner) {
        const eigenesVeto = (opts.einstellungen?.zusaetzlichAusgelassen ?? [])
          .some((o) => o.toLowerCase() === eintrag.name.toLowerCase());
        if (istUebersprungenerOrdner(eintrag.name)) {
          meldet(stand, voll, "systemordner");
          continue;
        }
        if (eigenesVeto) {
          meldet(stand, voll, "abgewaehlt");
          continue;
        }
        if (ausgeschlossen.has(voll.replace(/[\\/]+$/, ""))) {
          meldet(stand, voll, "ausgeschlossen");
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

/** Verteilung der Funde auf ihre obersten Ordner — fuer die Vorschau. Die
 *  Typen (P202, Mockup-Zeile „14 files · PDF, MD") kommen aus den Endungen
 *  der Funde, höchstens vier je Ordner, groß, wie das Mockup sie druckt. */
export function nachOrdner(funde: readonly Fund[], wurzeln: readonly string[], grenze = 12): { ordner: string; anzahl: number; typen: string[] }[] {
  const zaehler = new Map<string, { n: number; typen: Set<string> }>();
  for (const f of funde) {
    const wurzel = wurzeln.find((w) => f.pfad.startsWith(w)) ?? "";
    const rest = f.pfad.slice(wurzel.length).replace(/^[\\/]+/, "");
    const erster = rest.split(/[\\/]/)[0];
    // Klammern sind hier nicht kosmetisch: ohne sie band das && staerker als das
    // ||, und ein Windows-Pfad ohne ersten Ordner haette "" als Schluessel bekommen.
    const inUnterordner = rest.includes("/") || rest.includes("\\");
    const schluessel = erster && inUnterordner ? erster : "(top level)";
    const eintrag = zaehler.get(schluessel) ?? { n: 0, typen: new Set<string>() };
    eintrag.n += 1;
    const stueck = f.pfad.split(/[\\/]/).pop() ?? "";
    const punkt = stueck.lastIndexOf(".");
    if (punkt > 0 && punkt < stueck.length - 1) eintrag.typen.add(stueck.slice(punkt + 1).toUpperCase());
    zaehler.set(schluessel, eintrag);
  }
  return [...zaehler.entries()]
    .map(([ordner, e]) => ({ ordner, anzahl: e.n, typen: [...e.typen].sort().slice(0, 4) }))
    .sort((a, b) => b.anzahl - a.anzahl)
    .slice(0, grenze);
}
