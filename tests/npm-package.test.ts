import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Das npm-Paket ist ein Build-Ergebnis, kein Quelltext — deshalb wird es hier
// wirklich gebaut und dann geprueft. Ein Paket, das sich installieren laesst und
// bei niemandem startet, faellt sonst erst dem ersten Nutzer auf.
const wurzel = process.cwd();
const binPfad = path.join(wurzel, "npm", "bin", "kepta.js");
const paketPfad = path.join(wurzel, "npm", "package.json");

let bundle = "";
let paket: Record<string, unknown> = {};

beforeAll(() => {
  execFileSync(process.execPath, [path.join(wurzel, "scripts", "build-npm.mjs")], {
    cwd: wurzel,
    stdio: "pipe",
  });
  bundle = fs.readFileSync(binPfad, "utf-8");
  paket = JSON.parse(fs.readFileSync(paketPfad, "utf-8"));
});

describe("npm-Paket: das Bundle", () => {
  it("hat genau einen Shebang, und zwar in Zeile 1", () => {
    // Die Quelle bringt selbst einen Shebang mit. Ein zusaetzlicher per esbuild-banner
    // landete in Zeile 2 — dort ist "#!" ein Syntaxfehler, und der Server startete nie.
    const zeilen = bundle.split("\n");
    expect(zeilen[0]).toBe("#!/usr/bin/env node");
    expect(zeilen.slice(1).filter((z) => z.startsWith("#!"))).toEqual([]);
  });

  it("ist ausfuehrbares, syntaktisch gueltiges JavaScript", () => {
    expect(() => execFileSync(process.execPath, ["--check", binPfad], { stdio: "pipe" })).not.toThrow();
    expect(fs.statSync(binPfad).mode & 0o111).toBeGreaterThan(0);
  });

  it("braucht ausser Node-Bordmitteln nichts", () => {
    // Das Paket verspricht null Abhaengigkeiten. Zieht das Bundle etwas Fremdes
    // herein, ist dieses Versprechen gebrochen und die Installation kaputt.
    const fremd = [...bundle.matchAll(/require\("([^"]+)"\)/g)]
      .map((m) => m[1])
      .filter((m) => !m.startsWith("node:"));
    expect([...new Set(fremd)]).toEqual([]);
  });
});

describe("npm-Paket: die package.json", () => {
  it("heisst kepta-mcp, installiert aber den Befehl kepta", () => {
    // npm lehnt den blanken Namen "kepta" ab: zu aehnlich zu "keytar". Der
    // Paketname ist damit npm-Buerokratie — der Befehl, den Leute tippen und der
    // in jeder MCP-Konfiguration steht, heisst weiterhin kepta.
    expect(paket.name).toBe("kepta-mcp");
    expect(paket.bin).toEqual({ kepta: "bin/kepta.js" });
    expect(fs.existsSync(binPfad)).toBe(true);
  });

  it("veroeffentlicht Binary, README und Lizenz — sonst nichts", () => {
    expect(paket.files).toEqual(["bin/kepta.js", "README.md", "LICENSE"]);
    // Die Lizenz muss auch wirklich daliegen, sonst behauptet das Paket ein MIT,
    // dessen Text niemand mitbekommt.
    expect(fs.existsSync(path.join(wurzel, "npm", "LICENSE"))).toBe(true);
    expect(paket.license).toBe("MIT");
  });

  it("verlangt Node 22.13 — davor liegt node:sqlite hinter einem Flag", () => {
    // node:sqlite kam zwar in 22.5.0, aber nur hinter --experimental-sqlite.
    // Ohne Flag erst ab 22.13.0 / 23.4.0 (Node-Doku, doc/api/sqlite.md).
    // Mit ">=22.5.0" installierte das Paket auf 22.5–22.12 sauber und stuerzte
    // dann beim Import ab — ein Fehler, den npm nicht abfaengt, weil engines
    // nur warnt.
    expect((paket.engines as Record<string, string>).node).toBe(">=22.13.0");
  });

  it("deklariert keine Abhaengigkeiten", () => {
    expect(paket.dependencies).toBeUndefined();
  });

  it("traegt dieselbe Version wie die App", () => {
    // Ein Nutzer, der `npx kepta` und die Desktop-App nebeneinander betreibt,
    // teilt sich eine Datenbank. Zwei Versionsnummern dafuer waeren eine Falle.
    const app = JSON.parse(fs.readFileSync(path.join(wurzel, "package.json"), "utf-8"));
    expect(paket.version).toBe(app.version);
  });
});

describe("npm-Paket: das Wurzelpaket", () => {
  it("ist private — die Electron-App gehoert nicht auf npm", () => {
    const app = JSON.parse(fs.readFileSync(path.join(wurzel, "package.json"), "utf-8"));
    expect(app.private).toBe(true);
  });
});
