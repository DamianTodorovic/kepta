// Gegenprobe fuer `tests/umwelt-vertrag.test.ts`: eine Datei, die eine Produktgrenze
// lockert und sie NICHT zurueckbaut. Der Vertrag muss diese Datei finden — mit dem
// Schluessel, mit der Zeile, und mit der Datei, die danach davon abhaengt.
// Keine Testdatei (Endung .fixture.ts), also laeuft sie nie mit; sie wird gelesen.
/* eslint-disable */
process.env.KEPTA_MAX_ACTIVE = "3";
process.env.KEPTA_WRITE_GATE = "on";

export const lockerOhneRueckbau = true;
