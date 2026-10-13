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
import { readFileSync, readdirSync } from "node:fs";
import { get } from "node:http";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import eingeraehmt, { gabelDerSuite } from "../vitest.config";
import { hoererDerDatei } from "./helfer/hoerer";
import { PORT_BASIS, PORT_BEREICH } from "./helfer/port-vergabe";

const wurzel = process.cwd();

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

// Der zweite Arm des Vertrags, 13.10. von der Leitung hinzugeetzt: die Kopfraum-Gabel
// allein heilt die Klasse nicht. Der Nachbau `scripts/nachbau-sockel.mjs` (FALL 1-5,
// Ausgabe als docs/belege/nacht-13-10/sockel-nachbau-1357.log.txt) zeigt, was
// `request(app)` wirklich tut: supertest ruft `app.listen(0)` ohne Host, Node sitzt
// danach auf `::` (IPv6-Wildcard), und ein ausdruecklicher v4-Hoerer eines anderen
// Prozesses kann sich auf dieselbe Zahl setzen und beantwortet dann die Anfragen, die
// fuer unseren Server gedacht waren — im Nachbau mit `401 text/plain`, was in der Suite
// als `Schreiblauf 27: 401 {}` ankam. Dieser Repo wirft keine 401; die Anfrage lief an
// einen Nachbarn. Die Faelle unten halten die Heilung: ein Horcher je Datei, auf
// 127.0.0.1, mit einer Zahl unterhalb der ephemeren Zone.
describe("sockel-vertrag: horchen passiert einmal je Datei, nicht je Anfrage", () => {
  /** Dateien, die noch `request(app)` nutzen. Die Liste darf nur schrumpfen. */
  const SCHULD: string[] = [];

  /** Alle `request(app)`-Stellen unter tests/, ohne die Wache selbst. */
  function fehlendeHorcher(): string[] {
    const funde: string[] = [];
    const durchlauf = (ordner: string) => {
      for (const eintrag of readdirSync(ordner, { withFileTypes: true })) {
        const relativ = path.join(ordner, eintrag.name);
        if (eintrag.isDirectory()) {
          if (eintrag.name !== "node_modules") durchlauf(relativ);
          continue;
        }
        if (!eintrag.name.endsWith(".test.ts") || eintrag.name === "sockel-vertrag.test.ts") continue;
        const zeilen = readFileSync(relativ, "utf8").split("\n");
        const name = path.relative(wurzel, relativ);
        for (let i = 0; i < zeilen.length; i++) {
          if (/request\(\s*app\s*\)/.test(zeilen[i])) funde.push(`${name}:${i + 1}`);
        }
      }
    };
    durchlauf(path.join(wurzel, "tests"));
    return funde;
  }

  it("kein request(app) mehr in den Testdateien — ausser auf der benannten Schuldliste", () => {
    const funde = fehlendeHorcher();
    expect(funde, `${funde.length} Datei horcht je Anfrage: ${funde.join(", ")}`).toEqual(SCHULD);
  });

  it("die Wache sieht ein request(app), das jemand zurueckbringt", () => {
    // Gegenprobe: ohne sie ist der Fall oben ein Kommentar ueber einen leeren Raum.
    const text = 'const r = await request(app).get("/api/health");\n';
    expect(/request\(\s*app\s*\)/.test(text.split("\n")[0]), "der Pruefer sieht die alte Form nicht").toBe(true);
    // Und die neue Form laesst er durch.
    expect(/request\(\s*app\s*\)/.test('await request(URLE).get("/api/health");')).toBe(false);
  });

  it("der Horcher bindet 127.0.0.1 ausdruecklich, nicht den Wildcard", () => {
    const quelltext = readFileSync(path.join(wurzel, "tests/helfer/hoerer.ts"), "utf8");
    expect(quelltext, "der Horcher bindet ohne ausdrueckliche Adresse — das ist die Wildcard-Falle").toMatch(
      /\.listen\(\s*port,\s*"127\.0\.0\.1"/
    );
    // Gegenprobe: dieselbe Zeile ohne die Adresse muss dem Pruefer durch die Lappe gehen.
    const ohneAdresse = quelltext.replace(/\.listen\(\s*port,\s*"127\.0\.0\.1",/, ".listen(port,");
    expect(ohneAdresse.match(/\.listen\(\s*port,\s*"127\.0\.0\.1"/), "die Gegenprobe findet den Fehler nicht").toBeNull();
  });

  it("ein wirklicher Horcher sitzt, wo der Vertrag es sagt", async () => {
    const hoerer = await hoererDerDatei("tests/sockel-vertrag.test.ts#probe");
    try {
      expect(hoerer.bindung.adresse, `sitzt auf ${hoerer.bindung.adresse} statt 127.0.0.1`).toBe("127.0.0.1");
      expect(hoerer.bindung.familie).toBe("IPv4");
      expect(hoerer.port).toBeGreaterThanOrEqual(PORT_BASIS);
      expect(hoerer.port).toBeLessThan(PORT_BASIS + PORT_BEREICH);
      // Das Fenster liegt unterhalb der ephemeren Zone dieses Rechners (49152, gemessen
      // im Nachbau) — die statische Seite davon, weil ein Linux-Runner die Zahl nicht
      // ueber sysctl lesen kann: die Obergrenze des Fensters selbst ist die Behauptung.
      expect(PORT_BASIS + PORT_BEREICH, "das Vergabefenster reicht in die ephemere Zone").toBeLessThan(49152);
      // Vor der App: keine stille Antwort, sondern der Fehler des Tests, beim Namen.
      const leer = await new Promise<{ status: number; leib: string }>((los, fehler) => {
        get(hoerer.url + "/api/health", (res) => {
          let leib = "";
          res.on("data", (d) => (leib += d));
          res.on("end", () => los({ status: res.statusCode ?? 0, leib }));
        }).on("error", fehler);
      });
      expect(leer.status, "ein Horcher ohne App antwortet nicht still").toBe(500);
      expect(leer.leib).toContain("keine App gesetzt");
      // Nach der App: dieselbe Datei, ein echter Stapel, eine echte Antwort. Express,
      // weil der Helfer genau den Stapel verlangt, den die Suite ihm gibt.
      const { default: express } = await import("express");
      const app = express();
      app.get("/api/health", (_req, res) => {
        res.json({ ok: true });
      });
      hoerer.gebeApp(app);
      const antwort = await new Promise<number>((los, fehler) => {
        get(hoerer.url + "/api/health", (res) => {
          res.resume();
          res.on("end", () => los(res.statusCode ?? 0));
        }).on("error", fehler);
      });
      expect(antwort).toBe(200);
    } finally {
      await hoerer.schliesse();
    }
  });
});
