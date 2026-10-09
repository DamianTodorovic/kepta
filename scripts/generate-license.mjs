// Lizenzschlüssel ausstellen — nur für Damian, offline.
//
//   node scripts/generate-license.mjs --name "Mandels Kanzlei" --nummer 8 --edition business --seats 5
//   node scripts/generate-license.mjs --name "Harbor Advisory GmbH" --nummer 9 --edition enterprise
//
// Der Schlüssel enthält Lizenznummer, Stufe (business/enterprise) und Seats,
// signiert über Namen, Nummer, Stufe und Seats — dasselbe Format wie signiere()
// in src/core/lizenz.ts. Ausgestellt wird nur KEPTA Enterprise (Vertrag,
// persönlich); die kostenlose App hat kein Schlüssel-Feld und läuft unbegrenzt.
// Signiert wird mit dem privaten Schlüssel aus dem macOS-Schlüsselbund (angelegt
// von scripts/license-keypair.mjs); er steht nirgends im Repo und nie in der
// App. Für Tests kann er über KEPTA_LICENSE_PRIVATE_KEY (PKCS#8/DER, base64)
// hereingereicht werden.
//
// Bequemer geht es mit KEPTA License Studio (npm run license-studio): es
// vergibt die Nummern selbst, führt die Liste und sperrt weitergegebene Schlüssel.
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const EDITIONS_CODE = { business: 2, enterprise: 3 };
const EDITIONS_LABEL = { business: "KEPTA Enterprise", enterprise: "KEPTA Enterprise" };
const HOECHSTE_SEATS = 9999;

/** Wie normalisiere() in src/core/lizenz.ts — samt Unicode-Form (NFC). */
function normalisiere(name) {
  return name.toLowerCase().normalize("NFC").trim().replace(/\s+/g, " ");
}

/** Base32 in 5er-Gruppen — dasselbe Format wie alsGruppen() in src/core/lizenz.ts. */
function alsGruppen(bytes) {
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  while (bits.length % 5 !== 0) bits += "0";
  let zeichen = "";
  for (let i = 0; i < bits.length; i += 5) zeichen += ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  return zeichen.match(/.{1,5}/g).join("-");
}

function privaterSchluessel() {
  if (process.env.KEPTA_LICENSE_PRIVATE_KEY) return process.env.KEPTA_LICENSE_PRIVATE_KEY.trim();
  try {
    return execFileSync("/usr/bin/security", ["find-generic-password", "-s", "app.kepta.license-signing", "-a", "kepta", "-w"], { encoding: "utf8" }).trim();
  } catch {
    console.error("Kein Signaturschlüssel im Schlüsselbund — einmalig: node scripts/license-keypair.mjs");
    process.exit(1);
  }
}

const args = process.argv.slice(2);
const wert = (schalter) => { const i = args.indexOf(schalter); return i >= 0 ? args[i + 1] : null; };
const name = wert("--name");
const nummer = Number(wert("--nummer"));
const edition = wert("--edition") ?? "enterprise";
const seats = wert("--seats") === null ? undefined : Number(wert("--seats"));
if (!name || !name.trim() || !Number.isInteger(nummer) || nummer < 1 || nummer > 0xffffffff) {
  console.error('Aufruf: node scripts/generate-license.mjs --name "Name des Kunden" --nummer 7 --edition business|enterprise [--seats 5]');
  process.exit(1);
}
if (!(edition in EDITIONS_CODE)) {
  console.error("Unbekannte Stufe — erlaubt: business, enterprise");
  process.exit(1);
}
// Enterprise wird nach Absprache lizenziert (0), Business trägt die gekauften Seats.
const anzahl = edition === "enterprise" ? 0 : seats;
if (edition === "business" && (!Number.isInteger(anzahl) || anzahl < 1 || anzahl > HOECHSTE_SEATS)) {
  console.error(`Business braucht --seats von 1 bis ${HOECHSTE_SEATS}`);
  process.exit(1);
}

const k = crypto.createPrivateKey({ key: Buffer.from(privaterSchluessel(), "base64"), format: "der", type: "pkcs8" });
const kopf = Buffer.alloc(7);
kopf.writeUInt32BE(nummer);
kopf.writeUInt8(EDITIONS_CODE[edition], 4);
kopf.writeUInt16BE(anzahl, 5);
const signatur = crypto.sign(null, Buffer.from(`kepta-lizenz-v3.1\n${normalisiere(name)}\n${nummer}\n${edition}\n${anzahl}`), k);
const schluessel = alsGruppen(Buffer.concat([kopf, signatur]));

if (args.includes("--nur-schluessel")) {
  process.stdout.write(schluessel);
} else {
  console.log(`\n${EDITIONS_LABEL[edition]} — license key`);
  console.log(`==============================`);
  console.log(`Name:        ${name.trim()}`);
  console.log(`License no.: ${String(nummer).padStart(4, "0")}`);
  console.log(`Edition:     ${edition}${edition === "business" ? ` (${anzahl} seats)` : edition === "enterprise" ? " (terms per agreement)" : ""}`);
  console.log(`Key:         ${schluessel}`);
  console.log(`\nKEPTA läuft ohne Schlüssel — dieser Schlüssel weist den Vertrag aus (Name und Nummer).\n`);
}
