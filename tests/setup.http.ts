// Ein Test-Fenster, ein Socket — keine geliehene Verbindung.
//
// Was gemessen ist (8.10.2026, `~/kepta-app`): die HTTP-Dateien der Suite fallen
// im Parallel-Lauf mit Antworten, die ihre eigene App gar nicht senden kann —
// „expected 401 to be 403" und „expected 404 to be 400", „ETIMEDOUT",
// „socket hang up", und in einer Zähler-Schleife ein 200 OHNE den Kopf
// `x-kepta-remaining`, den dieser Middleware-Zweig sonst immer setzt. Alle
// betroffenen Fälle sind allein grün. `git grep 401 -- server src` findet in
// dieser App keine einzige 401-Stelle: die Antworten stammen nicht von dem
// Server, den der Test eben gebaut hat. Supertest bindet je Aufruf einen
// ephemeren Port und gibt ihn nach der Antwort wieder frei — auf einem Rechner
// mit 117 Test-Workern ist das ein ständiges Binden und Schließen auf dem
// Loopback, und Node hält seinen globalen HTTP-Agenten seit v19 auf
// `keepAlive: true`.
//
// Diese Datei schaltet die Wiederverwendung ab. Gemessen: derselbe Vier-Dateien-Harness fiel ohne diese Zeile in 2
// von 6 Läufen, mit ihr in 2 von 12 — das ist **kein Beleg für eine Heilung**, nur
// der Ausschluss eines Kandidaten. Die Anomalie tritt weiterhin auf, der
// eigentliche Mechanismus ist offen. Der Enterprise-Zweig umgeht die ganze
// Klasse, indem er nie gegen `request(app)` fährt, sondern gegen lauschende
// Server, die je Datei einmal gebunden werden („der geteilte Port ist Teil des
// Vertrags", `tests/suite-vertrag.test.ts`). Nach diesem Muster wäre die App-
// Suite umzubauen; die nächste Messung wäre, jedem Worker eine eigene
// Loopback-Adresse zu geben und den Port-Wettbewerb damit abzuschaffen.
import http from "node:http";

// Der Agent liest beim Socket-Bauen die Instanzeigenschaft, nicht `options`.
(http.globalAgent as unknown as { keepAlive: boolean }).keepAlive = false;
