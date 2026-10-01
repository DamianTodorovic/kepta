// Baut KEPTA License Studio — das Werkzeug, mit dem Damian Lizenzschlüssel
// ausstellt — als eigene Mac-App. Es wird nie mit KEPTA ausgeliefert: das
// Kundenpaket enthält nur dist/, electron.js und package.json.
//
//   npm run license-studio                    # bauen → tools/license-studio/release/
//   npm run license-studio -- --installieren  # dazu nach /Applications legen
//
// Eine ältere Fassung in /Applications wandert dabei in den Papierkorb.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const hier = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.resolve(hier, "..", "..");
const appOrdner = path.join(hier, "app");
const NAME = "KEPTA License Studio";

// app/ ist reines Bauergebnis (in .gitignore) — jedes Mal frisch.
fs.rmSync(appOrdner, { recursive: true, force: true });
fs.mkdirSync(appOrdner, { recursive: true });

await build({
  entryPoints: [path.join(hier, "main.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  outfile: path.join(appOrdner, "main.cjs"),
  logLevel: "warning",
});
for (const datei of ["preload.cjs", "index.html"]) fs.copyFileSync(path.join(hier, datei), path.join(appOrdner, datei));
fs.writeFileSync(path.join(appOrdner, "package.json"), JSON.stringify({
  name: "kepta-license-studio",
  productName: NAME,
  version: "1.0.0",
  description: "Issue license keys for KEPTA Pro, Business and Enterprise",
  author: "Damian Todorovic",
  main: "main.cjs",
  private: true,
}, null, 2) + "\n");

const electronVersion = JSON.parse(fs.readFileSync(path.join(wurzel, "node_modules", "electron", "package.json"), "utf8")).version;
const release = path.join(hier, "release");
execFileSync(path.join(wurzel, "node_modules", ".bin", "electron-builder"), [
  "--mac", "dir", `--${process.arch}`,
  "--config", path.join(hier, "electron-builder.json"),
  `-c.electronVersion=${electronVersion}`,
], { cwd: wurzel, stdio: "inherit", env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" } });

const ausgabe = fs.readdirSync(release).filter((d) => d.startsWith("mac")).map((d) => path.join(release, d, `${NAME}.app`)).find((p) => fs.existsSync(p));
if (!ausgabe) throw new Error(`Kein ${NAME}.app unter ${release} gefunden.`);
console.log(`\nGebaut: ${ausgabe}`);

if (process.argv.includes("--installieren")) {
  const ziel = `/Applications/${NAME}.app`;
  if (fs.existsSync(ziel)) {
    const papierkorb = path.join(os.homedir(), ".Trash", `${NAME} ${new Date().toISOString().replace(/[:.]/g, "-")}.app`);
    fs.renameSync(ziel, papierkorb);
    console.log(`Alte Fassung in den Papierkorb: ${papierkorb}`);
  }
  execFileSync("/usr/bin/ditto", [ausgabe, ziel], { stdio: "inherit" });
  execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", ziel], { stdio: "inherit" });
  console.log(`Installiert: ${ziel}`);
}
