/**
 * Die Umwelt-Grundlage dieser Suite — ein Vertrag, keine Gewohnheit.
 *
 * Warum: Vitest faehrt Testdateien in **wiederverwendeten Forks** (`pool: "forks"`,
 * `fileParallelism: true`). Eine Datei, die eine Produkt-Umwelt lockert und nicht
 * zurueckbaut, gibt sie an die naechste Datei weiter, die in denselben Fork faellt. Am
 * 12.10. zweimal gemessen, an demselben Fall: `tests/server-mcp-spiegel.test.ts`
 * verglich zwei Tueren, waehrend `KEPTA_MAX_ACTIVE` aus einem fremden Nachlauf noch auf
 * einem kleinen Wert stand — die Antwort war ein 429, den der Helfer wegwarf, und der
 * Streit erschien drei Aufrufe spaeter als Regelunterschied (`applied 3` gegen
 * `applied 2`; Logs `spiegel-kappe-3-2047.log` als Gegenprobe,
 * `spiegel-geimpft-2049.log` als Heilungsnachweis).
 *
 * Die Regel, die hierdurecht gilt: **keine Datei erbt eine Umwelt, die eine andere
 * gelockert hat.** Jede Datei startet auf der Grundlage unten; was eine Datei waehrend
 * ihres Laufs lockert, gilt hochstens bis zu ihrem Ende. Ausnahmen sind nicht vorgesehen,
 * und `KEPTA_NO_AUTOSTART` ist keine Lockerung, sondern die Sicherung gegen einen
 * echten Server auf Port 3000 — sie wird gesetzt und nie geloescht.
 */

/** Schluessel, die eine Datei fuer ihren Lauf lockern kann, und ihr Grundwert. */
export const UMWELT_GRUND: Record<string, string | undefined> = {
  // Produktgrenzen: ohne Angabe gilt der ausgelegte Wert, nie ein Rest aus einem Nachbar.
  KEPTA_MAX_ACTIVE: undefined,
  KEPTA_WRITE_GATE: undefined,
  KEPTA_BACKUP_KEEP: undefined,
  KEPTA_OLLAMA_URL: undefined,
  KEPTA_ENCRYPTION: undefined,
  KEPTA_DB_KEY: undefined,
  KEPTA_HOST: undefined,
  KEPTA_DATA_DIR: undefined,
  // Wo der Richter und das Einbettmodell stehen — gelesen wird KEPTA_EMBED_MODEL schon
  // beim Modul-Import (`src/core/embeddings.ts:6: DEFAULT_EMBED_MODEL = process.env.… ||
  // "nomic-embed-text"`), ein Wert aus der Schale des Betreibers erreicht also jede Datei,
  // ohne dass eine ihn je gesetzt hat. Ollama lief auf diesem Rechner am 12.10. die ganze
  // Zeit (11434 war offen, `llama-server` stand mit 7 830 ms in einem Messfenster) — ein
  // Testlauf, der unbeabsichtigt einen echten Richter fragt, ist kein Testlauf mehr.
  KEPTA_EMBED_MODEL: undefined,
  KEPTA_WRITE_GATE_MODEL: undefined,
  OLLAMA_HOST: undefined,
  OLLAMA_EMBED_MODEL: undefined,
  // Der Port des Bootstraps. Mit der Autostart-Sicherung hoert hier niemand, aber ein
  // Wert aus einer Nachbardatei waere der naechste geteilte Rahmen.
  PORT: undefined,
  // Die Sicherung, die jede Datei braucht: `server.ts` startet beim Import sonst auf 3000.
  KEPTA_NO_AUTOSTART: "1",
};

/** Die Schluessel, deren Lockerung die Wache einer Datei ansieht (`tests/umwelt-vertrag.test.ts`). */
export const UMWELT_GRENZEN = Object.keys(UMWELT_GRUND).filter((k) => k !== "KEPTA_NO_AUTOSTART");

/**
 * Laufzeit-Schluessel, die der Kern oder Express liest, die aber **keine Produktgrenze**
 * sind: sie zu loeschen veraendert die Betriebsart des Prozesses, nicht das Verhalten des
 * Produkts. Genannt statt weggelassen — die Vollstaendigkeit der Wache haelt sich an
 * dieser Liste auf, nicht an einer Luecke.
 */
export const UMWELT_LAUFZEIT: Record<string, string> = {
  NODE_ENV: "Betriebsart des Prozesses (express-Verhalten, CI-Erkennung); die Suite setzt ihn nicht",
  ELECTRON_RUN_AS_NODE: "Sagt Node, dass es als Node laeuft — kommt aus dem Start, nicht aus einer Datei",
};

/**
 * Setzt die Grundlage und gibt die Zurueckbau-Funktion zurueck. Der Zurueckbau ist kein
 * Schmuck: `afterAll` in `umwelt-setup.ts` stellt die Werte wieder her, die vor dieser
 * Datei galten — derselbe Satz gilt also auch, wenn jemals zwei Laeufe einen Prozess
 * teilen, ohne dass die Grundlage sie trennt.
 */
export function umweltGrundlegen(
  umgebung: Record<string, string | undefined> = process.env
): () => void {
  const vorher = new Map<string, string | undefined>();
  for (const schluessel of Object.keys(UMWELT_GRUND)) vorher.set(schluessel, umgebung[schluessel]);
  for (const [schluessel, grund] of Object.entries(UMWELT_GRUND)) {
    if (grund === undefined) delete umgebung[schluessel];
    else umgebung[schluessel] = grund;
  }
  return () => {
    for (const [schluessel, wert] of vorher) {
      if (wert === undefined) delete umgebung[schluessel];
      else umgebung[schluessel] = wert;
    }
  };
}
