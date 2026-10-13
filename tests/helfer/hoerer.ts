// Ein Horcher pro Testdatei, auf dem Port der Datei — nicht ein Horcher je Anfrage.
//
// Warum diese Datei existiert: `request(app)` horcht JE Anfrage neu. supertest wickelt
// eine function-App in `http.createServer(app)` (`node_modules/supertest/lib/test.js:36-42`)
// und ruft `app.listen(0)` (`test.js:63`). Node bindet ohne Host auf `::` — gemessen:
// `listen(0) -> { address: "::", family: "IPv6", port: 55007 }` (FALL 1 des Nachbaus).
// Auf einem dual-stack Rechner folgt daraus zweierlei, und beides ist mit eigenen Augen
// gesehen:
//
//   1. Ein zweiter Hoerer kann sich auf dieselbe Zahl setzen, die schon v4-explizit
//      gehalten wird, weil er v6-Wildcard bindet (FALL 2), und umgekehrt: ein
//      v4-expliziter Hoerer kommt durch, obwohl schon ein v6-Wildcard-Hoerer auf der
//      Zahl sitzt (FALL 3).
//   2. Wenn das passiert ist, beantwortet der FREMDE die Anfragen auf
//      `http://127.0.0.1:<port>` — nicht unser Horcher. FALL 3 und FALL 4 zeigen es mit
//      einer echten Anfrage an einen echten Kindprozess: `status=401`,
//      `content-type: text/plain`, Leib `Unauthorized`. superagent laesst dabei
//      `res.body` leer — und genau so sehen die beiden Roetungen aus, die diese Suite
//      hatte: `Schreiblauf 27: 401 {}` (13.10., `tests/server-mcp-spiegel.test.ts`) und
//      `Schreiblauf 30: 404 {}` (12.10.). Weder `src/` noch `server.ts` wirft eine 401
//      (grep ueber den Produktcode, 13.10.: null Treffer); die einzige 401, die dieser
//      Repo sends, ist die Koeder-Antwort in `scripts/nachbau-sockel.mjs`.
//
// Der Nachbau liegt als Skript UND als Ausgabe im Repo
// (`scripts/nachbau-sockel.mjs`, `docs/belege/nacht-13-10/sockel-nachbau-1357.log.txt`),
// weil ein Protokoll, das nur auf einem Schreibtisch liegt, fuer jeden anderen ein
// toter Link ist. Der Arbeiter, der die Klasse zuerst jagte, sah denselben Erfolg
// dreimal hintereinander; sein Protokoll lag unter `/tmp` und ist fort — die FALLS oben
// sind die Wiederholung von der Leitung, einzeln ausgefuehrt, im Repo nachfuehrbar.
//
// Dieser Horcher schliesst die Klasse, statt ein Symptom zu daempfen:
//   * Horchen passiert EINMAL pro Datei (`beforeAll`), nicht je Anfrage.
//   * Der Port kommt aus `portFuerHorer` (`tests/helfer/port-vergabe.ts`) und liegt im
//     Vergabefenster 41000..44999 — unterhalb des ephemeren Fensters dieses Rechners
//     (`net.inet.ip.portrange.first = 49152`, FALL-Nachbau gemessen), in dem fremde
//     Programme ein- und ausgehen. Kein Programm dieser Maschine alloziert hierher.
//   * Gebunden auf `127.0.0.1`, ausdruecklich. Das ist die dichte Richtung: ein zweiter
//     v4-Hoerer auf derselben Zahl scheitert dann an EADDRINUSE statt durchzukommen
//     (FALL 5), und ein v6-Wildcard-Hoerer, der NACH uns auf derselben Zahl sitzt,
//     gewinnt die Demux nicht (FALL 2: die Antworten blieben bei uns).
//   * Die App wird durchgereicht, nicht neu gehorcht: `gebeApp` entscheidet, welcher
//     Stapel die Anfragen dieser Datei bekommt. Eine Datei, die ihren Bestand je Fall
//     frisch baut (`beforeEach`), behält genau das — der Horcher bleibt, der Stapel
//     wechselt. Kein Verhalten wird verbogen: dieselben Routen, dieselben Schlüssel,
//     dieselben Erwartungen, nur über eine bestehende Verbindung statt je Anfrage eine
//     neue.
import http from "node:http";
import type { Express } from "express";

import { portErzwingen, portFuerHorer } from "./port-vergabe";

export interface DateiHoerer {
  /** Die Kennung, aus der der Port folgt — meist der Pfad der Testdatei, mit `#slot` für eine zweite Tür. */
  readonly kennung: string;
  readonly port: number;
  /** Die URL, an die alle Anfragen dieser Datei gehen: `http://127.0.0.1:<Port>`. */
  readonly url: string;
  /**
   * Wie der Horcher wirklich sitzt, nach dem Bind: Addresse und Familie. Die Wache in
   * `tests/sockel-vertrag.test.ts` verlangt `127.0.0.1` — ausdrucklich, nicht `::`.
   * Der Grund ist gemessen (`scripts/nachbau-sockel.mjs`, FALL 2 und FALL 5): ein fremder v4-expliziter
   * Horcher auf derselben Zahl laesst unseren v4-Bind mit EADDRINUSE scheitern, ein
   * v6-Wildcard-Bind geht dagegen durch, und dann beantwortet der FREMDE die
   * Anfragen auf `http://127.0.0.1:<Port>`.
   */
  readonly bindung: { adresse: string; familie: string; port: number };
  /** Welchem Stapel der Horcher gerade spricht. Vor der ersten Anfrage zu setzen. */
  gebeApp(app: Express | null): void;
  /** Zu in `afterAll`: connections herzfertig schliessen, damit ein offener Stream die Datei nicht hält. */
  schliesse(): Promise<void>;
}

/**
 * Der langlebige Horcher dieser Datei. `kennung` ist der Pfad der Testdatei; Dateien,
 * die zwei Bestände gleichzeitig brauchen (die Zwei-Türen-Spiegel), rufen ein zweites
 * Mal mit einem Slot auf: `tests/server-mcp-spiegel.test.ts#b`.
 */
export async function hoererDerDatei(kennung: string): Promise<DateiHoerer> {
  const port = portFuerHorer(kennung);
  let aktuelleApp: Express | null = null;

  const hoerer = http.createServer((req, res) => {
    if (!aktuelleApp) {
      // Kein stummer 500er, der wie ein Produktfehler aussieht: hier hat die Datei
      // ihren Stapel nicht eingetragen — ein Fehler im Test, nicht im Pfad.
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: `Test-Hoerer ${kennung} (127.0.0.1:${port}): keine App gesetzt — gebeApp() vor der ersten Anfrage aufrufen.` }));
      return;
    }
    aktuelleApp(req, res);
  });

  // Der Zahl-Vertrag: ein belegter Port scheitert hoerbar, er ruft den Nachbarn an.
  try {
    await portErzwingen(port, kennung);
  } catch (e) {
    throw new Error(`${(e as Error).message} — ein zweiter Lauf desselben Baums laeuft; nicht zwei Suiten auf einem Baum.`);
  }

  await new Promise<void>((los, fehler) => {
    hoerer.once("error", (e: NodeJS.ErrnoException) =>
      fehler(new Error(`${kennung}: Horcher auf 127.0.0.1:${port} nicht erreichbar (${e.code ?? e.message})`))
    );
    hoerer.listen(port, "127.0.0.1", () => los());
  });

  const sitz = hoerer.address() as { address: string; family: string; port: number };

  return {
    kennung,
    port,
    url: `http://127.0.0.1:${port}`,
    bindung: { adresse: sitz.address, familie: sitz.family, port: sitz.port },
    gebeApp: (app) => {
      aktuelleApp = app;
    },
    schliesse: async () => {
      // Ein offener Live-Stream darf das Datei-Ende nicht halten: zuerst die
      // Verbindungen nehmen, dann den Horcher schliessen, beides mit Frist —
      // ein haengender afterAll ist hier ein schlechterer Deal als ein verlorener Socket.
      hoerer.closeAllConnections?.();
      await Promise.race([
        new Promise<void>((los) => hoerer.close(() => los())),
        new Promise<void>((los) => setTimeout(los, 3_000).unref()),
      ]);
    },
  };
}
