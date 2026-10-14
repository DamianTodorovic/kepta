/**
 * Aufgaben-Kennungen zweisprachig lesen (Aufgabe #64, Leitung 13.10.: „K3PTA wird zu
 * K3PTA, ueberall" — die sichtbaren Woerter macht NA, **die Kennungen macht F12**).
 *
 * Die Regel ist nicht „umbenennen", sondern **zwei Formen lesen, eine melden**. Der
 * Abnahme-Satz rueckwaerts vom Nutzer: niemand, der heute installiert ist, darf nach
 * dem Update eine leere Wissensbasis sehen oder ploetzlich ohne Schluessel dastehen.
 * Ein Satz, der nur `K3PTA_DB_KEY` kennt, laesst jeden bestehenden Start schluessellos
 * auf einer verschluesselten Datei sitzen — genau der Fall, den F7 als „ohne Schluessel
 * keine Datei" closes. Ein Satz, der beide kennt, gewinnt nichts und verliert niemanden.
 *
 * Reihenfolge: der neue Name zuerst, der alte als Rueckfall. Wenn beide gesetzt sind,
 * **sagt die Meldung es** — ein verschwiegener Streit zwischen zwei Namensformen ist
 * eine still Kappe, und die haben wir an der Liste gerade erst abgeschafft.
 *
 * Was hier nicht drin ist: die Datenordnung selbst. Der Datenordner bleibt
 * `~/.kepta` (kein Zug, kein Doppelbestand, kein Rueckweg-Programm) — der
 * Umzugsentwurf gehoert zu einer Auslieferungstatsache und wird vorgeschlagen, nicht
 * gebaut. Ebenso bleibt `app.kepta.desktop` (electron-builder.json:2) und der
 * Keychain-Dienstname `app.kepta.database` (`src/core/schluessel.ts:19`) stehen, bis
 * der Update-Pfad entschieden ist: ein Dienstname, der mit dem Update wechselt,
 * bedeutet fuer jeden Bestandsnutzer „kein Schluessel gefunden".
 */

export type UmweltRolle = "schluessel" | "datenordner" | "sicherungBehalten" | "verschluesselung";

/** Paare von Namensform: der neue zuerst, der alte als Rueckfall. */
export const UMWELT_NAMEN: Record<UmweltRolle, readonly [string, string]> = {
  schluessel: ["K3PTA_DB_KEY", "KEPTA_DB_KEY"],
  datenordner: ["K3PTA_DATA_DIR", "KEPTA_DATA_DIR"],
  sicherungBehalten: ["K3PTA_BACKUP_KEEP", "KEPTA_BACKUP_KEEP"],
  verschluesselung: ["K3PTA_ENCRYPTION", "KEPTA_ENCRYPTION"],
};

export interface UmweltFund {
  rolle: UmweltRolle;
  /** Der Wert, der gilt — der erste nicht-leere Treffer in der Reihenfolge oben. */
  wert?: string;
  /** Der Name, dessen Wert gilt. `undefined`, wenn keine der beiden Formen gesetzt ist. */
  gewonnen?: string;
  /** true, wenn auch die andere Form gesetzt war — dann ist `meldung` nicht leer. */
  auchAlteForm: boolean;
  /** Satz, der den Sieger nennt. Nur bei Streit nicht leer; geht nach aussen (health). */
  meldung?: string;
}

const gespurrt = new Map<UmweltRolle, UmweltFund>();

function nichtLeer(wert: string | undefined): boolean {
  return typeof wert === "string" && wert.trim() !== "";
}

/**
 * Eine Rolle zweisprachig lesen. `env` ist parameterisierbar, weil dieselbe Regel in
 * Tests, im Buendel und im Startpfad gilt — und weil der Startpfad eine eigene
 * Umwelt-Objekt-Instanz durchreicht (`schluessel.ts`, `nebendateien.ts`).
 */
export function leseUmwelt(rolle: UmweltRolle, env: Record<string, string | undefined> = process.env): UmweltFund {
  const [neu, alt] = UMWELT_NAMEN[rolle];
  const hatNeu = nichtLeer(env[neu]);
  const hatAlt = nichtLeer(env[alt]);
  const fund: UmweltFund = {
    rolle,
    gewonnen: hatNeu ? neu : hatAlt ? alt : undefined,
    wert: hatNeu ? env[neu] : hatAlt ? env[alt] : undefined,
    auchAlteForm: hatNeu && hatAlt,
  };
  if (fund.auchAlteForm) {
    fund.meldung = `${neu} wins; ${alt} is also set and ignored — both names are set, and the value that runs is the one named first.`;
  }
  if (fund.gewonnen) gespurrt.set(rolle, fund);
  return fund;
}

/**
 * Was dieser Prozess wirklich las. Die Liste geht in `/api/health` (`kennungen`),
 * damit ein Betreiber ohne Blick in die Umgebung sehen kann, welche Form laeuft —
 * und damit ein Streit zwischen beiden Formen nie unsichtbar bleibt.
 */
export function gewonneneUmweltNamen(): UmweltFund[] {
  return [...gespurrt.values()];
}

/** Die aeusserliche Sicht auf einen Fund: Name und Streit, nie der Wert. */
export interface UmweltMeldung {
  rolle: UmweltRolle;
  gewonnen?: string;
  auchAlteForm: boolean;
  meldung?: string;
}

/**
 * Ein Fund fuer eine Tuere: **welche** Form gilt und ob beide gesetzt waren — aber
 * nicht, **was** darin steht. Ein Schluessel aus der Umgebung ist ein Geheimnis, und
 * `/api/health` haengt an 127.0.0.1, bis `KEPTA_HOST` ihn aufs Netz stellt. Die
 * Meldepflicht aus #64 ist der Name, der gewinnt; sein Wert geht die Tuere nichts an.
 */
export function ohneWert(fund: UmweltFund): UmweltMeldung {
  return { rolle: fund.rolle, gewonnen: fund.gewonnen, auchAlteForm: fund.auchAlteForm, meldung: fund.meldung };
}

/** Fuer Tests: die Spur leeren, damit eine Meldung nicht aus einem frueheren Fall stammt. */
export function vergissUmweltNamen(): void {
  gespurrt.clear();
}
