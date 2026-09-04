// Baut das npm-Paket: ein einziges Bundle mit Shebang, ohne Abhaengigkeiten.
// Der MCP-Server braucht nur Node-Bordmittel (node:sqlite ab 22.5), deshalb
// bleibt das Paket eine Datei — nichts, was beim Installieren nachgezogen wird.
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";

const ziel = path.resolve("npm/bin/kepta.js");
fs.mkdirSync(path.dirname(ziel), { recursive: true });

await build({
  entryPoints: ["src/mcp-server.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  outfile: ziel,
  legalComments: "none",
});

// Genau ein Shebang, und zwar in Zeile 1. Die Quelle bringt selbst einen mit;
// ein per banner ergaenzter zweiter landete in Zeile 2, wo "#!" ein Syntaxfehler
// ist — das Paket liess sich installieren und startete bei niemandem.
const zeilen = fs.readFileSync(ziel, "utf8").split("\n");
const ohne = zeilen.filter((z) => !z.startsWith("#!"));
fs.writeFileSync(ziel, "#!/usr/bin/env node\n" + ohne.join("\n"));
fs.chmodSync(ziel, 0o755);

const geprueft = fs.readFileSync(ziel, "utf8").split("\n");
if (geprueft[0] !== "#!/usr/bin/env node" || geprueft.slice(1).some((z) => z.startsWith("#!"))) {
  console.error("Shebang nicht genau einmal in Zeile 1.");
  process.exit(1);
}

// Nur Node-Bordmittel? Sonst braeuchte das Paket dependencies, und das waere
// eine stille Zusage, die die package.json nicht macht.
const fremd = [...geprueft.join("\n").matchAll(/require\("([^"]+)"\)/g)]
  .map((m) => m[1])
  .filter((m) => !m.startsWith("node:"));
if (fremd.length) {
  console.error("Fremde Abhaengigkeiten im Bundle:", [...new Set(fremd)].join(", "));
  process.exit(1);
}

// Das Bundle muss laufen, nicht nur aussehen wie Code.
const { execFileSync } = await import("node:child_process");
try {
  execFileSync(process.execPath, ["--check", ziel], { stdio: "pipe" });
} catch (e) {
  console.error("Bundle ist syntaktisch kaputt:", String(e.stderr ?? e).slice(0, 500));
  process.exit(1);
}

const kb = (fs.statSync(ziel).size / 1024).toFixed(0);
console.log(`npm/bin/kepta.js geschrieben (${kb} kB, keine Abhaengigkeiten, syntaktisch geprueft)`);
