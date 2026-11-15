// Einmalig: das Ed25519-Schlüsselpaar für die Lizenzschlüssel anlegen.
//
//   node scripts/license-keypair.mjs
//
// Der PRIVATE Schlüssel kommt in den macOS-Schlüsselbund (Dienst
// app.kepta.license-signing) — nirgends sonst, nie ins Repo, nie in die App.
// Der ÖFFENTLICHE wird in src/core/lizenz.ts eingetragen; mit ihm prüft die App.
//
// Gibt es den Eintrag schon, passiert nichts: ein neues Paar machte jeden
// bereits ausgestellten Schlüssel ungültig.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DIENST = "app.kepta.license-signing";
const datei = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "core", "lizenz.ts");

try {
  execFileSync("/usr/bin/security", ["find-generic-password", "-s", DIENST, "-a", "kepta"], { stdio: "ignore" });
  console.error(`Im Schlüsselbund gibt es schon einen ${DIENST}-Eintrag — nichts geändert.`);
  process.exit(1);
} catch {
  // noch keiner — gut
}

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const privat = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
const oeffentlich = publicKey.export({ type: "spki", format: "der" }).toString("base64");

execFileSync("/usr/bin/security", ["add-generic-password", "-s", DIENST, "-a", "kepta", "-l", "K3PTA license signing key (Ed25519, private)", "-w", privat]);
const zurueck = execFileSync("/usr/bin/security", ["find-generic-password", "-s", DIENST, "-a", "kepta", "-w"], { encoding: "utf8" }).trim();
if (zurueck !== privat) {
  console.error("Der Schlüssel ließ sich nicht aus dem Schlüsselbund zurücklesen — nichts eingetragen.");
  process.exit(1);
}

const quelle = fs.readFileSync(datei, "utf8");
const neu = quelle.replace(/export const OEFFENTLICHER_SCHLUESSEL = "[^"]*";/, `export const OEFFENTLICHER_SCHLUESSEL = "${oeffentlich}";`);
if (neu === quelle) {
  console.error("OEFFENTLICHER_SCHLUESSEL in src/core/lizenz.ts nicht gefunden.");
  process.exit(1);
}
fs.writeFileSync(datei, neu);

console.log("Fertig.");
console.log(`- Privater Schlüssel: im Schlüsselbund (${DIENST}).`);
console.log("- Öffentlicher Schlüssel: in src/core/lizenz.ts eingetragen.");
console.log(`\nBewahre eine Kopie des privaten Schlüssels im Passwort-Manager auf. Anzeigen mit:\n  security find-generic-password -s ${DIENST} -a kepta -w\n`);
