// Kapsel-Pflicht — kein Testprozess darf den echten Datenordner des Nutzers erreichen.
//
// Anlass, gemessen 15.10. 12:08 MESZ: der Vollauf `belege-15-10/app-abnahme/app-j2.log.txt`
// fiel in tests/server-permanent.test.ts mit dem Leib
// `{"error":"Limit reached: 21066 active nodes, maximum is 5000 — please delete some first"}`.
// 21.066 ist nicht die Zahl einer Testkapsel, sondern sein Bestand — der Store hinter dieser
// Route zeigte also auf seinen Ordner. Geschrieben ist dabei nichts (Haupt-Datei mtime
// 08:22:55, WAL 09:42, beides aelter als der Lauf; die Abweisung kam vor dem Schreiben),
// aber **gelesen** wurde er, und das verbietet dieses Haus seit Aufgabe #58. Zwei Laeufe
// davor und einer danach (12:04:32, 12:12:50 MESZ) waren auf denselben Bytes gruen: die
// Kapsel hing an der Reihenfolge der Dateien, nicht am Code.
//
// Die Wache prueft deshalb nicht, ob eine Datei an ihre Kapsel gedacht hat, sondern ob der
// Prozess, der gleich importiert, ueberhaupt in eine andere Heimat zeigt (tests/setup.kapsel.ts).
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { defaultDataDir } from "../src/core/store";

describe("Kapsel-Pflicht: die Suite kommt dem echten Ordner nicht nah", () => {
  const echt = process.env.KEPTA_ECHTES_HOME ?? "";

  it("kapselt die Heimat, bevor ein Modul geladen wird", () => {
    expect(echt, "tests/setup.kapsel.ts meldet die echte Heimat nicht").not.toBe("");
    expect(os.homedir(), `HOME zeigt weiterhin in die echte Heimat: ${os.homedir()}`).not.toBe(echt);
    expect(existsSync(os.homedir()), `die Kapsel-Heimat existiert nicht: ${os.homedir()}`).toBe(true);
  });

  it("loest den Datenordner nie in die echte Heimat auf", () => {
    const ordner = path.resolve(defaultDataDir());
    const echtOrdner = path.join(echt, ".kepta");
    expect(
      ordner === echtOrdner || ordner.startsWith(echtOrdner + path.sep),
      `der Testprozess wuerde hier lesen und schreiben: ${ordner}`,
    ).toBe(false);
  });

  it("haelt die Aufloesungsregel trotzdem: ohne Variable ist die Heimat der Anker", () => {
    // Die Kapsel verdeckt nichts: `~/.kepta` bleibt der Default, sie liegt nur in einer
    // anderen Heimat. Ein Test, der die Regel selbst prueft (tests/store.test.ts), darf
    // dafuer nicht die echte Datei sehen — und sieht sie nicht.
    delete process.env.KEPTA_DATA_DIR;
    delete process.env.K3PTA_DATA_DIR;
    const ordner = path.resolve(defaultDataDir());
    expect(ordner).toBe(path.join(path.resolve(os.homedir()), ".kepta"));
    expect(ordner.startsWith(path.resolve(echt))).toBe(false);
  });
});
