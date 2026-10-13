/**
 * Die Wache ueber die Gabel der Suite — den einen Wert, der erclaert, warum diese Suite
 * auf einem geteilten Rechner keine Sockel verliert.
 *
 * Der Befund, gegen den er gebaut wurde (12.10., fuenf Treffer, jeder im Parallel- oder
 * Nebenlastlauf, keiner im Alleinlauf): `request(app)` horcht je Anfrage neu
 * (`node_modules/supertest/lib/test.js:63`), und wenn der Event-Loop des Prozesses nicht
 * geatmet wird, beantwortet macOS das ausbleibende `accept()` nach vier SYN-Versuchen
 * (1+2+4+8 s = 7,8 s) mit ETIMEDOUT — die Bibliothek hebt das ausdruecklich nur fuer
 * `resError.syscall === 'connect'` auf diese Weise (`supertest/lib/test.js:181-186`).
 * Eine Antwort-Vorgabe existiert nirgends (superagent kennt keinen `_timeout` per
 * Default), es gab also keine Zahl, die man haette erhoehen koennen. Gewaehlt wurde
 * headroom: nie mehr Forks als halbe Kerne.
 *
 * Diese Datei haelt drei Dinge: dass die Gabel ueberhaupt verdrahtet ist, dass sie
 * Kopfraum laesst, und dass die Suite nicht auf Serielles zurueckgewichen ist — sonst
 * wäre die Heilung ein Tempomaechtigkeitswechsel mit anderem Etikett.
 */
import { readFileSync } from "node:fs";
import os from "node:os";

import { describe, expect, it } from "vitest";

import eingeraehmt, { gabelDerSuite } from "../vitest.config";

const konfig = () => readFileSync("vitest.config.ts", "utf-8");

/** Steht die Gabel in der Konfiguration, und zwar als diese Zahl? */
function vorgabeInKonfig(text: string): boolean {
  return /maxWorkers:\s*gabelDerSuite\b/.test(text);
}

describe("sockel-vertrag: die Suite laeuft mit Kopfraum, nicht mit Volllast", () => {
  it("die Gabel ist verdrahtet — die Konfiguration nennt sie, nicht eine Kopie", () => {
    expect(vorgabeInKonfig(konfig()), "vitest.config.ts setzt maxWorkers nicht auf gabelDerSuite").toBe(true);
    const imported = gabelDerSuite;
    expect(imported, "gabelDerSuite ist keine Zahl").toBeGreaterThan(0);
  });

  it("die Gabel laesst Kopfraum: mindestens ein Kern atmet, und nie mehr Forks als Kerne", () => {
    const kerne = os.cpus().length;
    expect(gabelDerSuite, `${gabelDerSuite} Forks auf ${kerne} Kernen — mehr Forks als Kerne` ).toBeLessThanOrEqual(kerne);
    if (kerne >= 3) {
      expect(gabelDerSuite, `kein Kopfraum: ${gabelDerSuite} von ${kerne} Kernen besetzt`).toBeLessThan(kerne);
      expect(gabelDerSuite, "weniger als die Haelfte der Kerne — die Suite wird ohne Not langsam").toBeGreaterThanOrEqual(
        Math.floor(kerne / 2)
      );
    }
  });

  it("Dateien laufen weiter parallel — die Heilung ist Kopfraum, keine Rueckkehr zur Serialitaet", () => {
    // Gelesen wird der **Wert**, nicht der Text: die Konfiguration zitiert in ihrem
    // Begruendungskommentar die alte Zeile `fileParallelism: false`, und ein Suchbild auf
    // den Text haette diese Meldung erzeugt.
    const wert = (eingeraehmt as { test?: { fileParallelism?: boolean } }).test?.fileParallelism;
    expect(wert, "fileParallelism ist nicht mehr true — Kopfraum war die Heilung, Serialitaet nicht").toBe(true);
    expect((eingeraehmt as { test?: { maxWorkers?: number } }).test?.maxWorkers, "maxWorkers kommt nicht durch die Konfiguration")
      .toBe(gabelDerSuite);
  });

  it("die Wache findet eine Gabel, die niemand gesetzt hat: dieselbe Pruefung gegen den geraubten Satz", () => {
    // Gegenprobe ohne diese Bedingung ist der Vertrag ein Kommentar: derselbe Pruefer,
    // ein Text ohne die Zeile, und er muss NEIN sagen.
    const geraubt = konfig().replace(/maxWorkers:\s*gabelDerSuite,/, "");
    expect(vorgabeInKonfig(geraubt), "der Pruefer merkt nicht, dass die Gabel fehlt").toBe(false);
    expect(vorgabeInKonfig(konfig())).toBe(true);
  });

  it("der Grund steht daneben, nicht im Kopf eines Menschen", () => {
    const text = konfig();
    expect(text, "die Begruendung fehlt — ohne sie wird die Zahl beim naechsten Tempofall verbogen").toMatch(/ETIMEDOUT/);
    expect(text).toMatch(/syscall === 'connect'/);
  });
});
