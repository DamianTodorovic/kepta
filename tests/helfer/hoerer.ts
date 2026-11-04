// Ein Hörer pro Express-App — und er sitzt auf IPv4-Loopback.
//
// Supertest macht aus einer Express-App für JEDE Anfrage einen neuen
// `http.Server`, bindet ihn auf einen ephemeren Port und schließt ihn nach der
// Antwort wieder. Über hundert Test-Worker × hundert Anfragen ist das ein
// beständiges Vergeben und Freigeben von Loopback-Ports, und die Suite hat schon
// Antworten von einem Server bekommen, der nicht der eigene war: 401 statt 403,
// 404 statt 400, ETIMEDOUT — Zahlen, die diese App an keiner Stelle selbst sendet
// (`git grep 401 -- server src` findet keine einzige 401-Stelle).
//
// Der Riegel hängt an genau einer Stelle: `http.createServer(app)`, so wie
// Supertest es in seinem Konstruktor ruft (node_modules/supertest/lib/test.js:42).
// Ein `createServer()` ohne Handler und ein gewöhnlicher Request-Listener bleiben
// unberührt — Mock-Server der Tests können weiter selbst lauschen.
//
// WARUM IPv4 UND NICHT `::` (Ursache 9, zum zweiten Mal gemessen, 4.11. 21:47 MEZ):
// Supertest verbindet hart `http://127.0.0.1:<port>` (desselben Datei Zeile 69). Ein
// Hörer auf `::` nimmt diese Verbindung zwar über die IPv4-gemappte Adresse an, aber
// er allein ist sie nicht: ein Versuch auf diesem Rechner (/tmp/v4v6-race.mjs, und
// als Fall in tests/helfer/horchen.test.ts) zeigte, dass ein IPv4-Hörer auf
// 127.0.0.1:45991 und ein Doppelstapel-Hörer auf :::45991 **gleichzeitig** sitzen
// können, und die Anfrage an 127.0.0.1 beantwortete der IPv4-Inländer. Einem Hörer,
// der selbst auf 127.0.0.1 sitzt, verwehrt der Kernel denselben Port dagegen.
//
// Das eine Problem dabei: Supertest liest `app.address()` IM KONSTRUKTOR, im selben
// Taktschnitt nach `listen(0)` (Zeile 63-66). Eine Bindung MIT Hostangabe liefert
// Node aber erst nach dem `listening`-Ereignis — also würde ein direkter
// `listen(0, "127.0.0.1")` im Moment des Aufrufs `null` geben und Supertest auf die
// Idee bringen, selbst ein `listen(0)` (Doppelstapel!) zu rufen. Darum liegt der
// IPv4-Bund VOR dem Test: `vorratAuffuellen()` bindet wartende Hörer auf
// 127.0.0.1, und `hoerer()` gibt einen davon weiter. Der Vorrat wird in
// tests/setup.horchen.ts vor jeder Datei und vor jedem Fall gefüllt; ist er trotzdem
// einmal leer, zählt die Datei ein Ausweichen und meldet es am Ende — still auf den
// Doppelstapel zurückzufallen wäre genau der alte Fehler mit neuer Verkleidung.
import http from "node:http";

const ZEICHEN = Symbol.for("kepta-test-hoerer");

const gepuffert = new WeakMap<object, http.Server>();
const offen = new Set<http.Server>();
const echtErzeugen = http.createServer.bind(http) as typeof http.createServer;

/** Ein fertig gebundener IPv4-Hörer, der auf seine App wartet. */
type Platz = { hoerer: http.Server; nimm: (app: object) => void; frei: boolean };

const vorrat: Platz[] = [];
let ausgewichen = 0;

/** Nur Express-Apps treffen, nie einen gewöhnlichen Request-Listener. */
function istExpressApp(kandidat: unknown): kandidat is object {
  if (typeof kandidat !== "function") return false;
  const app = kandidat as unknown as Record<string, unknown>;
  return typeof app.set === "function" && typeof app.use === "function" && typeof app.get === "function";
}

/**
 * Ein Hörer auf 127.0.0.1, der seine App erst spät kennt: der Handler liest ein
 * Feld, das `nimm` setzt. So kann die Bindung fertig sein, bevor Supertest die App
 * durchreicht — und `address()` liefert im selben Taktschnitt, den Supertest braucht.
 */
async function neuenPlatz(): Promise<Platz> {
  let app: object | null = null;
  const hoerer = echtErzeugen((req, res) => {
    const handler = app as unknown as ((a: http.IncomingMessage, b: http.ServerResponse) => void) | null;
    if (!handler) {
      res.statusCode = 503;
      res.end();
      return;
    }
    handler(req, res);
  });
  await new Promise<void>((resolve, reject) => {
    hoerer.once("error", reject);
    hoerer.listen(0, "127.0.0.1", () => resolve());
  });
  return { hoerer, nimm: (a) => { app = a; }, frei: true };
}

/** Haelt `ziel` freie Hörer bereit; wartet auf jede neue Bindung. */
export async function vorratAuffuellen(ziel = 2): Promise<void> {
  let freie = vorrat.reduce((n, p) => n + (p.frei ? 1 : 0), 0);
  while (freie < ziel) {
    vorrat.push(await neuenPlatz());
    freie += 1;
  }
}

/** Der Hörer einer App — aus dem Vorrat, und nie einer pro Anfrage. */
export function hoerer(app: object): http.Server {
  let server = gepuffert.get(app);
  if (server) return server;
  const platz = vorrat.find((p) => p.frei);
  if (platz) {
    platz.frei = false;
    platz.nimm(app);
    server = platz.hoerer;
  } else {
    // Ausweichen auf den alten Weg: richtig fuers Bild, falsch fuer die Familie —
    // dieser Hoerer sitzt auf `::`. Gezaehlt und gemeldet in setup.horchen.ts.
    ausgewichen += 1;
    server = echtErzeugen(app as unknown as Parameters<typeof echtErzeugen>[0]);
    server.listen(0);
  }
  gepuffert.set(app, server);
  offen.add(server);
  return server;
}

/** Derselbe Hörer, den die Suite benutzt — für die Messung, `undefined` ohne ihn. */
export function horcherVon(app: object): http.Server | undefined {
  return gepuffert.get(app);
}

/** `true`, wenn der Riegel sitzt — ohne ihn liefe die Suite gegen wandernde Ports. */
export function geriegelt(): boolean {
  return Boolean((http as unknown as Record<symbol, unknown>)[ZEICHEN]);
}

/** Wie oft der Vorrat nicht reichte; ein Wert ueber null ist ein Befund, kein Detail. */
export function ausgewichenZaehlen(): number {
  return ausgewichen;
}

/** Supertest ist CommonJS: der Riegel muss auf das Objekt, das `require("http")` gibt. */
export function riegelEinsetzen(): void {
  if (geriegelt()) return;
  (http as unknown as Record<symbol, unknown>)[ZEICHEN] = true;
  http.createServer = ((...args: Parameters<typeof http.createServer>) => {
    const handler = args[0];
    if (istExpressApp(handler) && args.length === 1) return hoerer(handler);
    return (echtErzeugen as unknown as (...a: unknown[]) => http.Server)(...args);
  }) as typeof http.createServer;
}

/** Alle Hörer dieser Datei schließen, damit nach dem letzten Fall keiner offen bleibt. */
export function hoererSchliessen(): Promise<void> {
  const die = [...offen];
  offen.clear();
  return Promise.all(die.map((h) => new Promise<void>((resolve) => h.close(() => resolve())))).then(() => undefined);
}
