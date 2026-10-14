// Installiert die frisch gebaute K3PTA-App nach /Applications — der Weg, um
// „immer die neueste Version" zu haben, mit einem Befehl:
//
//   npm run app:installieren
//
// Schritte (in dieser Reihenfolge, jede hat einen Grund):
//   1. App-Bundle bauen (vite + esbuild)
//   2. Das native SQLite-Verschlüsselungsmodul für ELECTRON bauen — nach einem
//      Studio-Windows-Build oder npm-Testlauf steht es sonst auf dem falschen
//      ABI und die App startet ohne Datenbank (die Falle vom 16.9.)
//   3. arm64-App packen (npmRebuild aus — das Modul ist schon richtig)
//   4. Verschlüsselung + Volltextsuche im Paket probelaufen lassen
//   5. Laufennde App beenden, alte Installation ersetzen, Signatur prüfen
//   6. Das Modul für NODE zurückbauen, damit die Test-Batterie weiterläuft
//   7. App starten und Versions-/Lizenzanzeige gegen die laufende API prüfen
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit", cwd: root, shell: "/bin/bash" });

console.log("— 1/7 App-Bundle bauen");
sh("npm", ["run", "build"]);

console.log("— 2/7 Natives Modul für Electron bauen");
sh("npx", ["@electron/rebuild", "-f", "-o", "better-sqlite3-multiple-ciphers", "-v", JSON.parse(fs.readFileSync(path.join(root, "node_modules", "electron", "package.json"), "utf8")).version]);

console.log("— 3/7 arm64-App packen");
fs.rmSync(path.join(root, "release", "mac-arm64"), { recursive: true, force: true });
sh("npx", ["electron-builder", "--mac", "--arm64", "--config", "electron-builder.json", "-c.electronVersion=" + JSON.parse(fs.readFileSync(path.join(root, "node_modules", "electron", "package.json"), "utf8")).version, "-c.npmRebuild=false"]);

console.log("— 4/7 Verschlüsselung im Paket prüfen");
sh("node", ["scripts/pruefe-native.mjs", "release"]);

const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
console.log(`— 5/7 Installieren (K3PTA ${version})`);
// pkill ist exit 1, wenn gerade nichts läuft — kein Fehler.
try {
  execFileSync("pkill", ["-x", "K3PTA"], { stdio: "ignore" });
} catch {
  // keine laufende App — nichts zu beenden
}
await new Promise((r) => setTimeout(r, 2000));
const ziel = "/Applications/KEPTA.app";
fs.rmSync(ziel, { recursive: true, force: true });
// ditto statt fs.cpSync: kopiert Codesignaturen/Permissions MAC-korrekt.
sh("ditto", [path.join(root, "release", "mac-arm64", "KEPTA.app"), ziel]);
sh("codesign", ["--verify", "--deep", "--strict", ziel]);

console.log("— 6/7 Modul für Node zurückbauen (Tests bleiben lauffähig)");
sh("npm", ["rebuild", "better-sqlite3-multiple-ciphers"]);

console.log("— 7/7 Starten und Versionsanzeige prüfen");
sh("open", ["-a", "K3PTA"]);
await new Promise((r) => setTimeout(r, 6000));
// Die Build-Staging-Kopien entfernen — sonst tauchen sie im Launcher/Spotlight
// als weitere „K3PTA"-Versionen auf (das Versionen-Chaos vom 17.9.). Der
// Launcher soll GENAU EINE K3PTA zeigen: /Applications.
for (const staging of ["release/mac-arm64", "release/mac"]) {
  fs.rmSync(path.join(root, staging), { recursive: true, force: true });
}
let gesund = null;
for (let i = 0; i < 5 && !gesund; i++) {
  try {
    const endpoint = JSON.parse(fs.readFileSync(path.join(process.env.HOME, ".kepta", "endpoint.json"), "utf8"));
    const res = await fetch(`${endpoint.url}/api/health`);
    gesund = await res.json();
  } catch {
    await new Promise((r) => setTimeout(r, 2000));
  }
}
if (!gesund) {
  console.error("App läuft, aber die Health-API antwortete nicht — bitte Fenster prüfen.");
  process.exit(1);
}
console.log(`\nInstalliert: K3PTA ${version} (${process.arch})`);
// Die App meldet ihre Version, sonst nichts: ein Schlüssel-System gibt es in
// dieser App nicht mehr (09.10.2026), also prüft auch niemand einen Schlüssel.
console.log(`Anzeige in der App: K3PTA ${gesund.version} · unbegrenzt`);
if (gesund.version !== version) {
  console.error(`ACHTUNG: die laufende App meldet ${gesund.version}, gebaut wurde ${version}.`);
  process.exit(1);
}
