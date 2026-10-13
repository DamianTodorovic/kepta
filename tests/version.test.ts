import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { APP_VERSION } from "../src/core/version";
import { SERVER_INFO } from "../src/core/mcp";

const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf-8")) as { version: string };
const bundel = JSON.parse(fs.readFileSync(new URL("../npm/package.json", import.meta.url), "utf-8")) as { version: string };
const sperre = JSON.parse(fs.readFileSync(new URL("../package-lock.json", import.meta.url), "utf-8")) as {
  version: string;
  packages: Record<string, { version?: string }>;
};

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
