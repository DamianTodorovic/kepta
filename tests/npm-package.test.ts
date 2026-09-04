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
  it("verweist mit bin auf die gebaute Datei", () => {
    expect(paket.bin).toEqual({ kepta: "bin/kepta.js" });
    expect(fs.existsSync(binPfad)).toBe(true);
  });

  it("veroeffentlicht nur Binary und README", () => {
    expect(paket.files).toEqual(["bin/kepta.js", "README.md"]);
  });

  it("verlangt Node 22.5 — davor gibt es node:sqlite nicht", () => {
    expect((paket.engines as Record<string, string>).node).toBe(">=22.5.0");
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
