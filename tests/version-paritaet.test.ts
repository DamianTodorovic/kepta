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

// 26.9.-Lektion: das Python-Paket trug eine zweite, hart codierte Version
// (python/src/kepta/__init__.py stand auf 0.1.3, während pyproject 0.1.7
// baute). Zwei Regeln verhindern die Wiederholung: pyproject nennt eine
// gültige semver-Zahl, und __init__.py codiert GAR KEINE Version mehr hart —
// sie kommt aus den Paket-Metadaten (importlib.metadata).
describe("Versions-Parität: das Python-Paket hat keine zweite Version", () => {
  it("python/pyproject.toml nennt eine gültige semver-Version", () => {
    const pyproject = fs.readFileSync(path.join(wurzel, "python", "pyproject.toml"), "utf8");
    const version = /^version\s*=\s*"(\d+\.\d+\.\d+)"/m.exec(pyproject);
    expect(version, "pyproject.toml: keine version-Zeile im Format x.y.z").toBeTruthy();
    expect(version![1]).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("python/src/kepta/__init__.py codiert keine Version mehr hart", () => {
    const init = fs.readFileSync(path.join(wurzel, "python", "src", "kepta", "__init__.py"), "utf8");
    expect(init).not.toMatch(/^__version__\s*=\s*"\d+\.\d+\.\d+"/m);
    expect(init).toContain('importlib.metadata');
  });
});
