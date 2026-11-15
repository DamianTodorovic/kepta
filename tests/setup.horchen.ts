// Hängt den Hörer-Puffer an jeden Test-Prozess und hält ihn gefüllt.
//
// Warum überhaupt eine Datei dafür sein muss: Supertest bindet pro Anfrage einen
// neuen Port und gibt ihn sofort wieder frei — die Erklärung und die Messung stehen
// in tests/helfer/hoerer.ts und tests/helfer/horchen.test.ts. Seit dem zweiten
// Messfall derselben Klasse (401 statt 400 in einem Volllauf am 4.11. 21:22 MEZ,
// gruen auf denselben Bytes um 21:26:17 MEZ) bindet der Puffer auf IPv4-Loopback,
// weil ein Hoerer auf `::` den Port fuer einen fremden IPv4-Lauscher frei laesst.
import { afterAll, beforeAll, beforeEach } from "vitest";
import { riegelEinsetzen, hoererSchliessen, vorratAuffuellen, ausgewichenZaehlen } from "./helfer/hoerer";

riegelEinsetzen();

const VORRAT = 8;

// Der Vorrat muss gefüllt sein, BEVOR der erste `request(app)` im selben
// Taktschnitt seine Adresse liest: vorratAuffuellen() wartet auf die Bindung, und
// die beiden Hooks laufen vor jedem Fall — daher braucht keine Datei einen Ausreisser.
beforeAll(() => vorratAuffuellen(VORRAT));
beforeEach(() => vorratAuffuellen(VORRAT));

// Drei Apps in einem einzigen Fall sind gemessen (tests/server-fehler-wortlaut.test.ts:29-41),

afterAll(async () => {
  const n = ausgewichenZaehlen();
  await hoererSchliessen();
  if (n > 0) {
    throw new Error(
      `${n} Test-Hörer mussten auf den Doppelstapel (::) ausweichen, weil der IPv4-Vorrat leer war. ` +
      "Auf einem ::-Hörer kann ein fremder IPv4-Lauscher denselben Port bekommen und die Anfrage " +
      "antworten — genau die Klasse, die hier 401 statt 400 meldet. Ziel erhoehen, nicht durchlassen.",
    );
  }
});
