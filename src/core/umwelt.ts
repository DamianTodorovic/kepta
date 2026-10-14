/**
 * Aufgaben-Kennungen zweisprachig lesen (#64, Leitung 14.10.: „Kern zweisprachig
 * machen — dieselbe Regel, dieselbe Meldung").
 *
 * Die Regel ist nicht „umbenennen", sondern **zwei Formen lesen, eine melden**. Der
 * Abnahme-Satz rueckwaerts vom Nutzer: *niemand, der heute installiert ist, darf nach
 * dem Update eine leere Wissensbasis sehen oder ploetzlich ohne Schluessel dastehen.*
 * Ein Satz, der nur `K3PTA_DB_KEY` kennt, laesst jeden bestehenden Start schluessellos
 * auf einer verschluesselten Datei sitzen — und `pruefeLesbar` wirft mit Recht
 * („ohne Schluessel keine Datei"), ohne dass der Nutzer seinen Schluessel verloren haette.
 * Ein Satz, der beide kennt, gewinnt nichts und verliert niemanden.
 *
 * Reihenfolge: der neue Name zuerst, der alte als Rueckfall. Sind beide gesetzt,
 * **sagt die Antwort es** — ein verschwiegener Streit zwischen zwei Namensformen ist
 * dieselbe Suende wie eine stille Kappe, und die hat `KEPTA_BACKUP_KEEP` gerade erst
 * verlassen (Zeile 131ff in `server.ts`: eine Zahl still zu ignorieren war der Fehler).
 *
 * Dieselbe Datei, gleiche Regel, gleiche Wortmelodie wie in der App
 * (`kepta-app/src/core/umwelt.ts`) — Paritaet ist der Grund, warum das hier im Kern
 * steht und nicht nur dort. Nicht gebaut und absichtlich offen: `app.kepta.database`
 * (der Bund-Dienstname, Zeile 19) und `~/.kepta` als Default-Ordner. Beides ist eine
 * Auslieferungstatsache, kein Texttausch: ein neuer Dienstname heisst fuer jeden
 * Bestandsnutzer „kein Schluessel gefunden".
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
  /** true, wenn beide Formen gesetzt waren — dann ist `meldung` nicht leer. */
  auchAlteForm: boolean;
  /** Satz, der den Sieger nennt. Nur bei Streit nicht leer; geht nach aussen (health, CLI). */
  meldung?: string;
}

const gespurrt = new Map<UmweltRolle, UmweltFund>();

function nichtLeer(wert: string | undefined): boolean {
  return typeof wert === "string" && wert.trim() !== "";
}

/**
 * Eine Rolle zweisprachig lesen. `env` ist parameterisierbar, weil dasselbe Lesen in
 * Tests, im Buendel und im Startpfad gilt — der Schluesselanbieter und die Nebendateien
 * reichen ihre Umwelt-Instanz durch, `server.ts` und `store.ts` lesen die echte.
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
 * Was dieser Prozess wirklich las. Geht in `/api/health` (`kennungen`) und in die
 * CLI-Ausgabe, damit ein Betreiber ohne Blick in die Umgebung sieht, welche Form
 * laeuft — und ein Streit zwischen beiden Formen nie unsichtbar bleibt.
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
