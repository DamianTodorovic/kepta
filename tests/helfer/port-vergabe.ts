// Portvergabe fuer Testdateien, die einen echten HTTP-Server hochgehen lassen.
//
// Warum eine eigene Datei dafuer noetig war: `vitest.config.ts` hielt die Suite seit
// dieser Welle seriell (`fileParallelism: false`), weil zwei Dateien, die einen Server
// starten, sich ins Gehege gerieten — der Befund sah wie ein Produktfehler aus („POST
// mit ungueltiger ID -> 400" bekam die 401 des *anderen* Servers). Der wahre Grund war
// ein **geschriebener Port**: `tests/server-einstellungs-maske.test.ts:17` band
// `8811` fest, und auf diesem Rechner laufen bis zu neun Baende gleichzeitig — zwei
// Suite-Laeufe, und der zweite traf den ersten. Die Kosten der seriellen Suite sind
// gemessen und real (siehe `tests/port-vertrag.test.ts` und den Bericht 12.10.):
// 25,2 s parallel gegen 46,3 s seriell.
//
// Zwei Regeln, weil „Port 0 und zufaellig" hier keine Antwort ist:
//   1. **Der Port kommt aus dem Dateinamen.** Feste Basis + FNV-1a uber den Pfad,
//      modulo Bereich. Derselbe Name, derselbe Port — in diesem Haus ist eine Zahl,
//      die von einem Lauf zum naechsten wandert, keine Zahl (Zahlenvertrag,
//      `scripts/zahlen-belege.mjs` haelt genau das).
//   2. **Ein Konflikt scheitert hoerbar, er ruft nicht den Nachbarn an.** Bevor eine
//      Datei ihren Server hoert, wird der Port erzwungen: ein zweiter `listen` auf
//      derselben Zahl wirft mit Port, Datei und dem Hinweis, dass ein anderer Lauf
//      denselben Namen traegt.
//
// Der Bereich liegt unterhalb des ephemeren Fensters (49152+ auf diesem Rechner) und
// meidet die bekannten Nachbarn: 3478/3479 (Leitung, Vorschau und App), 3000/3001 und
// 5173 (Standardports von `server.ts` und Vite), 11434 (Ollama), 8811 (die alte feste
// Vergabe, damit ein Altlauf nicht versehentlich mitgelesen wird).
import net from "node:net";

export const PORT_BASIS = 41000;
/** So gross, dass zwei Names nicht leicht zusammenfallen — und unter 49152, damit
 * kein ausgehender Socket der Maschine hierher kann. */
export const PORT_BEREICH = 4000;
/** Belegte oder verbotene Nachbarn — die Vergabe darf hier nie landen. */
export const PORT_AUSNAHME: readonly number[] = [3000, 3001, 3478, 3479, 5173, 8811, 11434];

function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Der Port einer Testdatei — dieselbe Eingabe, dasselbe Ergebnis, ohne Zufall.
 * Der Dateiname ist Teil der Zahl, damit zwei Dateien desselben Laufs sich nicht
 * in die Quere kommen und damit ein Fehlerbericht sagt, WELCHE Datei horcht.
 */
export function portFuerDatei(datei: string): number {
  const h = fnv1a(datei);
  for (let i = 0; i < PORT_AUSNAHME.length; i++) {
    const kandidat = PORT_BASIS + ((h + i * 7919) % PORT_BEREICH);
    if (!PORT_AUSNAHME.includes(kandidat)) return kandidat;
  }
  // Unerreichbar, solange der Bereich groesser ist als die Ausnahmeliste — die
  // Zeile steht trotzdem, weil ein stummer Rueckfall auf einen Nachbarn genau
  // die Klasse Fehler waere, die dieses Modul abschafft.
  throw new Error(`portFuerDatei: kein freier Port fuer ${datei} in ${PORT_BASIS}..${PORT_BASIS + PORT_BEREICH - 1}`);
}

/** true, wenn der Port im Vergabefenster liegt und nicht auf einer Ausnahme. */
export function portZulaessig(port: number): boolean {
  return Number.isInteger(port) && port >= PORT_BASIS && port < PORT_BASIS + PORT_BEREICH && !PORT_AUSNAHME.includes(port);
}

/**
 * Die Kennungen, die in DIESER Suite einen Horcher setzen: der Pfad der Datei, und für
 * eine Datei, die zwei Bestände gleichzeitig vergleichen muss, der Pfad mit `#slot`.
 *
 * Die Liste ist nicht Dekoration. Zwei Namen können in 4 000 Plaetzen zusammenfallen —
 * und das ist hier keine Kollisionsstatistik, sondern ein echter Fund:
 * `tests/server.test.ts` und `tests/server-repair-limit.test.ts` hashes beide auf 42085.
 * Mit `request(app)` fiel das nie auf, weil jede Anfrage sich einen flüchtigen Port
 * nahm; mit einem langlebigen Horcher würden die beiden Dateien einander den Port
 * zuschlagen. Also: keine Portjagd im Lauf, sondern eine **einmalige, gleiche
 * Zuteilung** — der Reihe nach nimmt jeder Namen seinen nächsten freien Kandidaten.
 * Dieselbe Liste, dieselbe Sortierung, auf jedem Rechner dieselben Zahlen.
 *
 * Gewacht von `tests/port-vertrag.test.ts`: wer neu horcht, ohne hier zu stehen, macht
 * die Wache rot; ein Eintrag ohne Horcher macht sie ebenso rot. Die Liste darf also nur
 * mit der Suite wachsen und schrumpfen, nicht im Verborgenen.
 */
export const HORCHENDE_KENNUNGEN: readonly string[] = [
  "tests/graf-bilanz.test.ts",
  "tests/graf-doku.test.ts",
  "tests/graf-kosten.test.ts",
  "tests/herkunft.test.ts",
  "tests/server-einstellungs-maske.test.ts",
  "tests/server-fehler.test.ts",
  "tests/server-herkunftsdecke.test.ts",
  "tests/server-import-ersatz.test.ts",
  "tests/server-import-ersatz.test.ts#zweitstapel",
  "tests/server-inbox-symlink.test.ts",
  "tests/server-mcp-spiegel.test.ts",
  "tests/server-mcp-spiegel.test.ts#b",
  "tests/server-permanent.test.ts",
  "tests/server-repair-limit.test.ts",
  "tests/server-settings-geheim.test.ts",
  "tests/sockel-vertrag.test.ts#probe",
  "tests/server.test.ts",
];

/** Die Kandidatenfolge eines Namens: erst die Eigenzahl, dann die Sprünge des Bereichs. */
function kandidaten(name: string): number[] {
  const h = fnv1a(name);
  const out: number[] = [];
  for (let i = 0; i < PORT_BEREICH; i++) {
    const kandidat = PORT_BASIS + ((h + i * 7919) % PORT_BEREICH);
    if (!PORT_AUSNAHME.includes(kandidat)) out.push(kandidat);
  }
  return out;
}

/**
 * Der Port eines Horchers — dieselbe Zuteilung in jedem Lauf, Kollisionen ausgeschlossen.
 * `portFuerDatei` ist die reine Eigenzahl (davon handelt der Zahl-Vertrag dieser Datei);
 * diese Funktion hier ist die, die der Horcher benutzt, weil zwei Dateien sich den
 * Port nicht teilen können.
 */
export function portFuerHorer(kennung: string): number {
  if (!HORCHENDE_KENNUNGEN.includes(kennung)) {
    throw new Error(
      `portFuerHorer: ${kennung} steht nicht in HORCHENDE_KENNUNGEN (tests/helfer/port-vergabe.ts). ` +
        `Neue Horcher tragen sich dort ein — die Liste ist die einzige Stelle, an der die Suite weiss, wer horcht.`
    );
  }
  const vergeben = new Set<number>();
  for (const name of [...HORCHENDE_KENNUNGEN].sort()) {
    const port = kandidaten(name).find((k) => !vergeben.has(k));
    if (port === undefined) {
      throw new Error(`portFuerHorer: kein freier Port für ${name} im Fenster ${PORT_BASIS}..${PORT_BASIS + PORT_BEREICH - 1}`);
    }
    vergeben.add(port);
    if (name === kennung) return port;
  }
  // Unerreichbar: die Mitgliedschaft ist oben geprüft. Die Zeile steht, weil ein
  // stummer Rueckfall genau die Klasse waere, die dieses Modul abschafft.
  throw new Error(`portFuerHorer: ${kennung} wurde zugeteilt, aber nicht erreicht`);
}

/**
 * Ein Port, der frei ist — oder ein Wurf, der sagt, dass er es nicht ist.
 * Binden, sofort schliessen, weitergeben: der Testlauf hoert danach selbst auf
 * dieser Zahl, und ein zweiter Lauf auf demselben Baum trifft ihn statt an
 * einen fremden Server zu schreiben.
 */
export function portErzwingen(port: number, datei: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const pruefer = net.createServer();
    pruefer.once("error", (fehler: NodeJS.ErrnoException) => {
      reject(
        new Error(
          `Port ${port} ist belegt — ${datei} weicht nicht still auf einen andern aus. ${fehler.code ?? "Fehler"}; ` +
            `ein zweiter Lauf desselben Baums horcht schon darauf (Vergabe: portFuerDatei, Basis ${PORT_BASIS}, Bereich ${PORT_BEREICH}).`
        )
      );
    });
    pruefer.listen(port, "127.0.0.1", () => {
      pruefer.close(() => resolve());
    });
  });
}
