// Eine Version, fünf Stellen: package.json, server.json (top + Paketeintrag),
// npm/package.json und src/core/version.ts müssen dieselbe Zahl tragen.
//
// Entstanden aus einem echten Vorfall (24.9.): version.ts stand seit 2.13.12
// still — die UI und /api/health zeigten Nutzern drei Releases lang eine
// alte Version, während alle Tests grün blieben, weil sie APP_VERSION nur
// mit sich selbst verglichen. Der hier versprochene Wächter
// (tests/version.test.ts, siehe Kommentar in version.ts) existierte nicht.
// Jetzt existiert er.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { APP_VERSION } from "../src/core/version";

const wurzel = path.resolve(__dirname, "..");
const lies = (relativ: string) => JSON.parse(fs.readFileSync(path.join(wurzel, relativ), "utf8"));

describe("Versions-Parität: eine Zahl an fünf Stellen", () => {
  it("package.json, server.json (top + Paketeintrag), npm/package.json und version.ts tragen dieselbe Version", () => {
    const app = lies("package.json");
    const server = lies("server.json");
    const paket = lies("npm/package.json");
    expect(APP_VERSION).toBe(app.version);
    expect(server.version).toBe(app.version);
    expect(server.packages[0].version).toBe(app.version);
    expect(paket.version).toBe(app.version);
  });

  it("der README-Versions-Badge trägt dieselbe Version", () => {
    const readme = fs.readFileSync(path.join(wurzel, "README.md"), "utf8");
    expect(readme).toContain(`version-${APP_VERSION}-blue`);
  });
});
