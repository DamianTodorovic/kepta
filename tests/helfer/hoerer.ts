// Ein Hörer pro Express-App — nicht einer pro Anfrage.
//
// Supertest macht aus einer Express-App für JEDE Anfrage einen neuen
// `http.Server`, bindet ihn auf einen ephemeren Port und schließt ihn nach der
// Antwort wieder. Über hundert Test-Worker × hundert Anfragen ist das ein
// beständiges Vergeben und Freigeben von Loopback-Ports, und die Suite hat schon
// Antworten von einem fremden Worker bekommen: 401 statt 403, 404 statt 400,
// ETIMEDOUT — Zahlen, die diese App an keiner Stelle selbst sendet. Gemessen und
// gepinnt in tests/helfer/horchen.test.ts.
//
// Der Riegel hängt an genau einer Stelle: `http.createServer(app)`, so wie
// Supertest es ruft. Ein `createServer()` ohne Handler und ein gewöhnlicher
// Request-Listener bleiben unberührt — Mock-Server der Tests können weiter
// selbst lauschen.
//
// Gebunden wird mit `listen(0)` ohne Hostangabe: nur dort liefert Node den Port
// noch im selben Taktschnitt, den Supertest braucht. Mit Hostangabe — auch als
// Objekt — kommt die Adresse erst nach dem `listening`-Ereignis, und Supertest
// läse dann `null`. Der Hörer sitzt damit auf `::` und nimmt die Verbindung über
// die IPv4-gemappte Loopback-Adresse an: wie bisher, nur dass der Port jetzt hält.
import http from "node:http";

const ZEICHEN = Symbol.for("kepta-test-hoerer");

const gepuffert = new WeakMap<object, http.Server>();
const offen = new Set<http.Server>();
const echtErzeugen = http.createServer.bind(http) as typeof http.createServer;

/** Nur Express-Apps treffen, nie einen gewöhnlichen Request-Listener. */
function istExpressApp(kandidat: unknown): kandidat is object {
  if (typeof kandidat !== "function") return false;
  const app = kandidat as unknown as Record<string, unknown>;
  return typeof app.set === "function" && typeof app.use === "function" && typeof app.get === "function";
}

/** Der Hörer einer App — beim ersten Zugriff gebunden, danach wiederverwendet. */
export function hoerer(app: object): http.Server {
  let server = gepuffert.get(app);
  if (!server) {
    server = echtErzeugen(app as unknown as Parameters<typeof echtErzeugen>[0]);
    server.listen(0);
    gepuffert.set(app, server);
    offen.add(server);
  }
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
