import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Der Signaturschritt wurde bisher nur als Text geprueft — ob er laeuft, sah
// niemand. Er lief auch nicht: eine Protokollzeile las den Rueckgabewert von
// execFileSync (stdout) so, als waere es stderr, bekam null und warf. Der
// macOS-Build brach ab, Windows und Linux gingen durch, und aufgefallen ist es
// erst am fehlenden Artefakt im fertigen Release.
const hook = require(path.join(process.cwd(), "scripts/adhoc-sign.cjs")) as {
  default: (ctx: unknown) => Promise<void>;
};

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-sign-"));
});

/** Baut ein minimales, aber echtes .app-Buendel, das codesign akzeptiert. */
function appBuendelAnlegen(name: string): string {
  const app = path.join(dir, `${name}.app`);
  fs.mkdirSync(path.join(app, "Contents", "MacOS"), { recursive: true });
  fs.writeFileSync(
    path.join(app, "Contents", "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>${name}</string>
<key>CFBundleIdentifier</key><string>app.kepta.test</string>
<key>CFBundleName</key><string>${name}</string>
<key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>`
  );
  // Eine echte Mach-O-Datei ist noetig — /bin/echo tut es.
  fs.copyFileSync("/bin/echo", path.join(app, "Contents", "MacOS", name));
  fs.chmodSync(path.join(app, "Contents", "MacOS", name), 0o755);
  return app;
}

const kontext = (name: string) => ({
  electronPlatformName: "darwin",
  appOutDir: dir,
  packager: { appInfo: { productFilename: name } },
});

describe.runIf(process.platform === "darwin")("Ad-hoc-Signatur: der Schritt laeuft wirklich", () => {
  it("signiert ein Buendel und wirft dabei nicht", async () => {
    appBuendelAnlegen("Pruefling");
    await expect(hook.default(kontext("Pruefling"))).resolves.toBeUndefined();
  });

  it("hinterlaesst eine Signatur, die codesign akzeptiert", async () => {
    const app = appBuendelAnlegen("Pruefling2");
    await hook.default(kontext("Pruefling2"));

    expect(fs.existsSync(path.join(app, "Contents", "_CodeSignature"))).toBe(true);
    // Genau die Pruefung, die am ausgelieferten v2.6.8 fehlschlug.
    expect(() =>
      execFileSync("codesign", ["--verify", "--deep", "--strict", app], { stdio: "pipe" })
    ).not.toThrow();
  });

  it("traegt die eigene Kennung, nicht die von Electron", async () => {
    const app = appBuendelAnlegen("Pruefling3");
    await hook.default(kontext("Pruefling3"));
    const aus = execFileSync("codesign", ["-dv", "--verbose=2", app], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    } as never);
    const text = String(aus ?? "");
    expect(text.includes("Electron")).toBe(false);
  });
});

describe("Ad-hoc-Signatur: andere Plattformen", () => {
  it("tut auf Windows und Linux nichts", async () => {
    await expect(
      hook.default({ electronPlatformName: "win32", appOutDir: dir, packager: { appInfo: { productFilename: "X" } } })
    ).resolves.toBeUndefined();
    await expect(
      hook.default({ electronPlatformName: "linux", appOutDir: dir, packager: { appInfo: { productFilename: "X" } } })
    ).resolves.toBeUndefined();
  });
});
