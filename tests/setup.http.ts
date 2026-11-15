// Ein Test-Fenster, ein Socket — keine geliehene Verbindung.
//
// Gemessen am 8.10.2026 in `~/kepta-app`: die HTTP-Dateien der Suite fielen im
// Parallel-Lauf mit Antworten, die ihre eigene App gar nicht senden kann —
// „expected 401 to be 403", „expected 404 to be 400", „ETIMEDOUT", „socket hang
// up", und in einer Zähler-Schleife ein 200 ohne den Kopf `x-kepta-remaining`,
// den diese Middleware immer setzt. `git grep 401 -- server src` findet in
// dieser App keine einzige 401-Stelle: diese Antworten kamen nicht von dem
// Server, den der Test eben gebaut hat.
//
// Der Weg dahin: Supertest bindet je Aufruf einen ephemeren Loopback-Port und
// gibt ihn nach der Antwort wieder frei — bei über hundert Test-Workern ein
// ständiges Binden und Schließen. Node hält den globalen HTTP-Agenten seit v19
// auf `keepAlive: true`, also kann ein wärmehaltener Sockel auf dem Port
// landen, den sich gerade ein anderer Worker genommen hat.
//
// Ohne diese Datei fiel ein kleiner Harness aus vier Dateien in 2 von 6 Läufen
// und die Voll-Suite in 2 von 3. Mit ihr — und erst, seit sie wirklich greift:
// der erste Versuch setzte `options.keepAlive` und ging ins Leere, der Agent
// liest die Instanzeigenschaft — waren die letzten vier Voll-Läufe
// hintereinander grün (117 Dateien / 1979 Tests), der CI-Lauf auf Ubuntu ebenso.
//
// Die dauerhafte Sicherung bleibt trotzdem die Regel des Enterprise-Zweigs: nie
// gegen `request(app)` fahren, sondern gegen Server, die je Datei einmal auf
// 127.0.0.1 lauschen — dort hält eine Vertragswache das maschinell fest.
import http from "node:http";

// Der Agent liest beim Socket-Bauen die Instanzeigenschaft, nicht `options`.
(http.globalAgent as unknown as { keepAlive: boolean }).keepAlive = false;
