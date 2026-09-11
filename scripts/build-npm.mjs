// Baut das npm-Paket: ein einziges Bundle mit Shebang und genau EINER
// Abhaengigkeit. Seit 2.11 ist die Datenbank verschluesselt; das kann nur eine
// SQLite-Fassung mit Verschluesselung (SQLite3 Multiple Ciphers). Sie ist nativ,
// passt nicht ins Bundle und kommt beim Installieren mit — als Vorab-Build fuer
// Node 22, 24 und 26 auf macOS, Windows und Linux.
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";

const ERLAUBT = new Set(["better-sqlite3-multiple-ciphers"]);
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
  external: [...ERLAUBT],
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

// Nur Node-Bordmittel und die eine erlaubte Abhaengigkeit? Alles andere waere
// eine stille Zusage, die die package.json nicht macht.
const fremd = [...geprueft.join("\n").matchAll(/require\("([^"]+)"\)/g)]
  .map((m) => m[1])
  .filter((m) => !m.startsWith("node:") && !ERLAUBT.has(m));
if (fremd.length) {
  console.error("Fremde Abhaengigkeiten im Bundle:", [...new Set(fremd)].join(", "));
  process.exit(1);
}

// Die Abhaengigkeit muss im npm-Paket stehen — exakt so gepinnt wie in der App,
// damit npx dieselbe SQLite-Fassung installiert, die hier getestet wurde.
const npmPaket = JSON.parse(fs.readFileSync("npm/package.json", "utf8"));
const wurzelPaket = JSON.parse(fs.readFileSync("package.json", "utf8"));
for (const name of ERLAUBT) {
  const version = wurzelPaket.dependencies?.[name];
  if (!version || npmPaket.dependencies?.[name] !== version) {
    console.error(`npm/package.json muss ${name}@${version} als dependency tragen (gefunden: ${npmPaket.dependencies?.[name]}).`);
    process.exit(1);
  }
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
console.log(`npm/bin/kepta.js geschrieben (${kb} kB, eine Abhaengigkeit: ${[...ERLAUBT].join(", ")}, syntaktisch geprueft)`);
