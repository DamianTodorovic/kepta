// Hängt den Hörer-Puffer an jeden Test-Prozess.
//
// Warum überhaupt eine Datei dafür sein muss: Supertest bindet pro Anfrage einen
// neuen Port und gibt ihn sofort wieder frei — die Erklärung und die Messung
// stehen in tests/helfer/hoerer.ts und tests/helfer/horchen.test.ts.
import { afterAll } from "vitest";
import { hoererSchliessen, riegelEinsetzen } from "./helfer/hoerer";

riegelEinsetzen();
afterAll(() => hoererSchliessen());
