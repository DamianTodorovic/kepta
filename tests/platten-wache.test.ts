import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { STUFEN, freiGi, meldung, pruefe } from "../scripts/platten-wache.mjs";

// Die Maschine stand um 02:0x bei 99 %: 3,61 Gi frei, Docker meldete "no space left
// on device". Ein Lauf, der MITTEN im Schreiben voll laeuft, ist der teuerste Fehler
// des Tages — Arbeit, die hier nicht zurueckzuholen ist (kein git checkout, keine
// Ablage). Also: eine Wache, die vor dem Start fragt, nicht nach dem Schaden.
//
// Die Schwellen hier sind GESETZT, nicht erfühlt: derselbe gemessene freie Platz,
// einmal gegen eine Schwelle knapp darueber (muss "kein Start" sagen), einmal knapp
// darunter (muss frei melden). Die Default-Schwelle selbst wird nicht getestet — sie
// ist eine Begruendung, keine Rechnung.

describe("Die Platten-Wache haelt schwere Laeufe zurueck, bevor sie anfangen", () => {
  const hier = process.cwd();
  const jetzt = freiGi(hier);

  it("misst den freien Platz ueber den Pfad, nicht ueber ein Geraet", () => {
    expect(Number.isFinite(jetzt), `statfs ueber ${hier} lieferte keine Zahl`).toBe(true);
    expect(jetzt).toBeGreaterThan(0);
    const messung = pruefe({ pfade: [hier], schwelleGi: jetzt - 1 });
    expect(messung.gemessen[0].pfad).toBe(hier);
    expect(messung.gemessen[0].freiGi).toBeCloseTo(jetzt, 1);
    expect(messung.gemessen[0].gesamtGi).toBeGreaterThan(jetzt);
  });

  it("sagt KEIN START, wenn die Schwelle ueber dem echten Frei liegt", () => {
    const gesetzt = jetzt + 1;
    const m = pruefe({ pfade: [hier], schwelleGi: gesetzt });
    expect(m.genug).toBe(false);
    expect(m.exitCode).toBe(75);
    expect(m.ursachen.join(" ")).toMatch(/frei/);
    // Die Meldung traegt den WERT, den die Wache selbst gemessen hat, und die
    // Schwelle — beides aus demselben Objekt. Gegen `gesetzt` mit zwei Dezimalen
    // zu vergleichen war eine Zufallspforte: die Meldung schreibt die Schwelle ohne
    // Dezimalen, und der gemessene Wert ist eine spaetere Lesung als `jetzt`
    // (gemessen 11.10.: jetzt 46,00, gemeldet 46,00, erwartet 47,00 — rot).
    expect(meldung(m)).toContain(m.wertGi.toFixed(2));
    expect(meldung(m)).toContain(`Schwelle ${gesetzt} Gi`);
    expect(meldung(m)).toContain(hier);
  });

  it("meldet frei, wenn die Schwelle unter dem echten Frei liegt", () => {
    const m = pruefe({ pfade: [hier], schwelleGi: Math.max(0.05, jetzt - 1) });
    expect(m.genug).toBe(true);
    expect(m.exitCode).toBe(0);
    expect(m.ursachen).toEqual([]);
  });

  it("prueft /tmp mit — auf Linux-Runnern ist das ein anderes Volume", () => {
    const m = pruefe({ pfade: [hier, os.tmpdir()], schwelleGi: Math.max(0.05, jetzt - 1) });
    const pfade = m.gemessen.map((g) => g.pfad);
    expect(pfade).toContain(hier);
    expect(pfade).toContain(os.tmpdir());
    // temp dir in a private dir must also be measurable (statfs walks up to the volume)
    expect(Number.isFinite(freiGi(path.join(os.tmpdir(), "g1-platten-wache")))).toBe(true);
  });

  it("nimmt den schlechtesten Pfad, nicht den besten", () => {
    // Ein Pfad mit mehr Platz darf den schlechteren nicht zudecken.
    const m = pruefe({ pfade: [hier, hier], schwelleGi: Math.max(0.05, jetzt - 1) });
    expect(m.wertGi).toBeCloseTo(jetzt, 1);
    const streng = pruefe({ pfade: [hier, os.tmpdir()], schwelleGi: jetzt + 1 });
    expect(streng.gemessen.length).toBe(2);
    expect(streng.genug).toBe(false);
    expect(streng.wertGi).toBeCloseTo(jetzt, 1);
  });

  it("gibt dem Aufrufer den Exit-Code 75 mit, nicht nur einen Text", () => {
    const streng = spawnSync("node", ["scripts/platten-wache.mjs", `--schwelle=${(jetzt + 1).toFixed(2)}`], {
      cwd: hier,
      encoding: "utf8",
    });
    expect(streng.status, `CLI meldete ${streng.status}: ${streng.stderr || streng.stdout}`).toBe(75);
    expect(`${streng.stdout}${streng.stderr}`).toMatch(/KEIN START/);

    const milde = spawnSync("node", ["scripts/platten-wache.mjs", `--schwelle=${Math.max(0.05, jetzt - 1).toFixed(2)}`], {
      cwd: hier,
      encoding: "utf8",
    });
    expect(milde.status, `CLI meldete ${milde.status}: ${milde.stderr || milde.stdout}`).toBe(0);
    expect(`${milde.stdout}${milde.stderr}`).toMatch(/frei/);
  });

  it("kennt zwei Stufen, und die Stufe ist das Argument, nicht die Zahl", () => {
    expect(STUFEN.leicht).toBe(2);
    expect(STUFEN.schwer).toBe(8);
    // Eine Render-Serie darf nicht durch eine Suite-Schwelle schluepfen — und eine
    // Suite nicht an einer Bilder-Schwelle haengen bleiben.
    const leicht = pruefe({ pfade: [hier], stufe: "leicht" });
    const schwer = pruefe({ pfade: [hier], stufe: "schwer" });
    expect(leicht.schwelleGi).toBe(2);
    expect(schwer.schwelleGi).toBe(8);
    // Auf dieser Maschine (gemessen ~12 Gi frei) muss leicht frei melden, und schwer
    // darf erst ab 8 Gi frei starten — beides wird hier gegen die echte Messung
    // geprueft, nicht gegen eine erwartete Meldung.
    expect(leicht.genug).toBe(jetzt >= 2);
    expect(schwer.genug).toBe(jetzt >= 8);
    expect(meldung(schwer)).toMatch(/schwer/);
    expect(meldung(leicht)).toMatch(/leicht/);
  });

  it("nennt den GEPRUEFTEN PFAD, nicht das Geraet, auf dem / zufaellig sitzt", () => {
    const m = pruefe({ pfade: [hier], stufe: "schwer" });
    const text = meldung(m);
    expect(text).toContain(hier);
    expect(text).not.toMatch(/frei auf \/$/m);
  });

  it("meldet den gemessenen Wert, auch wenn er unter der Schwelle liegt — nie als 0", () => {
    const unter = pruefe({ pfade: [hier], schwelleGi: jetzt + 1 });
    const text = meldung(unter);
    // Die Meldung nennt den Wert, den die Wache SELBST gemessen hat — und der ist
    // nicht `jetzt`: `pruefe` liest die Platte erneut, und freie Plaetze bewegen
    // sich zwischen zwei Lesungen. Gegen `jetzt` zu vergleichen machte den Fall von
    // der Maschine abhaengig (gemessen 11.10.: 46,25 gelesen, 46,24 gemeldet).
    expect(text).toContain(unter.wertGi.toFixed(2));
    expect(text).not.toMatch(/: 0\.00 Gi/);
    expect(unter.wertGi).toBeCloseTo(jetzt, 1);
  });

  it("sagt offen, wenn es ueber einen Elternpfad messen musste", () => {
    const nirgends = path.join(os.tmpdir(), "g1-platten-wache", "tiefer", "ordner");
    const m = pruefe({ pfade: [nirgends], stufe: "leicht" });
    expect(m.gemessen[0].pfad).toBe(nirgends);
    expect(m.gemessen[0].gemessenUeber).toBeTruthy();
    expect(meldung(m)).toContain(nirgends);
    expect(meldung(m)).toContain(m.gemessen[0].gemessenUeber);
  });

  it("die CLI kennt --leicht und --schwer, und der Exit-Code bleibt 75 beim Halt", () => {
    const leicht = spawnSync("node", ["scripts/platten-wache.mjs", "--leicht"], { cwd: hier, encoding: "utf8" });
    expect([0, 75], `CLI leicht meldete ${leicht.status}: ${leicht.stderr || leicht.stdout}`).toContain(leicht.status);
    const schwer = spawnSync("node", ["scripts/platten-wache.mjs", "--schwer"], { cwd: hier, encoding: "utf8" });
    expect([0, 75], `CLI schwer meldete ${schwer.status}: ${schwer.stderr || schwer.stdout}`).toContain(schwer.status);
    expect(`${schwer.stdout}${schwer.stderr}`).toMatch(/Schwelle 8|schwere/);
    const widerspruch = spawnSync("node", ["scripts/platten-wache.mjs", "--leicht", "--schwer"], { cwd: hier, encoding: "utf8" });
    expect(widerspruch.status, "beide Stufen zugleich duerfen nicht still schweigen").not.toBe(0);
  });
});
