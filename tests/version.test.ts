import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { APP_VERSION } from "../src/core/version";
import { SERVER_INFO } from "../src/core/mcp";

const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf-8")) as { version: string; license: string };
const bundel = JSON.parse(fs.readFileSync(new URL("../npm/package.json", import.meta.url), "utf-8")) as { version: string; license: string };
const sperre = JSON.parse(fs.readFileSync(new URL("../package-lock.json", import.meta.url), "utf-8")) as {
  version: string;
  packages: Record<string, { version?: string; license?: string }>;
};
const lizenzText = fs.readFileSync(new URL("../LICENSE", import.meta.url), "utf-8");

// Es gibt EINE Versions-Quelle: src/core/version.ts. Health-Endpoint und MCP SERVER_INFO
// importieren sie; dieser Test verhindert Versions-Drift zur package.json.
//
// Das Sperrschema kam erst am 12.10. dazu, und der Grund ist ein Fund: der
// eingecheckte package-lock.json trug in beiden Versionsfeldern noch "3.1.5",
// während package.json längst 3.2.0 sagte — und genau dieser Lock ist es, den
// `npm ci` in der CI und jeder Käufer eines Clons bekommt. Nichts las das Feld,
// also lag es da, ohne jemals Widerspruch zu ernten.
//
// server.json gehört bewusst NICHT hierher: sie nennt die auf npm
// veröffentlichte Engine-Version (der Register sagt sie, seit 13.10. fragt der
// Fall npm selbst), nicht die App-Version, und ein Gleichheitszeichen zwischen
// beiden Zahlen wäre der Fehler. Zwei Zahlen,
// zwei Paare — ein Gleichheitszeichen zwischen ihnen wäre der Fehler.
describe("Versions-Quelle", () => {
  it("package.json, APP_VERSION, MCP SERVER_INFO, das npm-Bündel und das Sperrschema stimmen überein", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.version).toBe(APP_VERSION);
    expect(SERVER_INFO.version).toBe(APP_VERSION);
    expect(bundel.version, "npm/package.json").toBe(APP_VERSION);
    expect(sperre.version, "package-lock.json (oben)").toBe(APP_VERSION);
    expect(sperre.packages[""].version, 'package-lock.json (packages[""])').toBe(APP_VERSION);
  });
});

// Die Lizenz hat dieselbe Falle wie die Version damals, nur eine Etage tiefer — und sie
// ist am 15.11.2026 wirklich zugeschnappt: a1ee382 stellte package.json und LICENSE auf
// BUSL-1.1, das eingecheckte Sperrschema behielt "UNLICENSED" (zuletzt angefasst 12.11.
// in 854dfa5), und der Desktop-Bau, der 34 Minuten VOR der Umstellung lief, trug dasselbe
// Feld in jedes ausgelieferte app.asar. Gelesen hat es niemand: dieses Blatt pinnte vier
// Versionsfelder und kein einziges Lizenzfeld, scripts/pruefe-lock.mjs hat keinen
// Lizenz-Griff. Eine Lizenz, die an vier Orten steht und an einem nicht, ist keine
// Aussage — sie ist ein Widerspruch, den erst ein Käufer findet.
const LIZENZ = "BUSL-1.1";

describe("Lizenz-Quelle", () => {
  it("package.json, das Sperrschema, das npm-Bündel und der LICENSE-Text nennen dieselbe Lizenz", () => {
    expect(pkg.license).toBe(LIZENZ);
    expect(sperre.packages[""].license, 'package-lock.json (packages[""])').toBe(LIZENZ);
    expect(bundel.license, "npm/package.json").toBe(LIZENZ);
    expect(lizenzText.split("\n")[0].trim(), "LICENSE (erste Zeile)").toBe("Business Source License 1.1");
  });
});
