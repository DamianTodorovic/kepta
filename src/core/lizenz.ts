// Lizenzschlüssel für KEPTA — Ed25519-Signaturen, offline geprüft.
//
// Ein Schlüssel enthält die Lizenznummer (4 Byte) und die Ed25519-Signatur
// über „kepta-lizenz-v3“, den normalisierten Namen des Käufers und diese
// Nummer — als Base32 in 5er-Gruppen. Der Kunde gibt nur Namen und Schlüssel
// ein; nichts verlässt seinen Rechner.
//
// Seit v3.1 (September 2026, Neuausrichtung auf Pro/Business/Enterprise)
// trägt der Schlüssel zusätzlich seine Stufe: 71 Byte = Nummer (4) + Stufe
// (1 Byte, 1=Pro 2=Business 3=Enterprise) + Seats (2 Byte) + Signatur (64),
// signiert über „kepta-lizenz-v3.1“ samt Stufe und Seats. Pro schaltet
// dieselbe App frei wie jede andere Stufe — die Stufe sagt dem Kunden (und
// der Fußzeile), was sein Vertrag umfasst; Team-Funktionen kommen mit
// Business später dazu. Schlüssel der Form v3 (68 Byte) bleiben gültig und
// gelten als Pro.
//
// Gegen Weitergabe (Entscheidung von Damian, 13.9.2026: „der einfache Weg wie
// Sublime Text“): der Name steht sichtbar in der App, jede Lizenz hat ihre
// eigene Nummer, und eine weitergegebene Nummer kommt auf die Sperrliste
// (src/core/sperrliste.ts) — ab dem nächsten Update gilt ihr Schlüssel nicht
// mehr, auch nicht auf Rechnern, die schon aktiviert waren. Eine Bindung an
// den Mac (Kunde schickt einen Rechner-Code) war gebaut, aber nie
// veröffentlicht: sie verlangte vom Kunden einen Schritt und eine Kennung
// seines Rechners — zu viel für eine App, die für lokale Sicherheit steht.
//
// Signiert wird mit Damians privatem Schlüssel, der nur in seinem
// macOS-Schlüsselbund liegt (scripts/license-keypair.mjs legt ihn an;
// KEPTA License Studio und scripts/generate-license.mjs signieren damit). In
// der App steht nur der ÖFFENTLICHE Schlüssel: mit ihm lässt sich prüfen, aber
// kein Schlüssel erzeugen. Schlüssel der ersten Form (nur der Name, bis
// 2.11.0) sind 64 Byte lang und gelten nicht mehr; an Kunden war keiner
// ausgegeben.
//
// Die erste Fassung (12.9.2026) war ein HMAC mit dem Geheimnis im Quelltext —
// wer die App auspackte, konnte sich beliebige Schlüssel ausstellen.
//
// Eine Testphase als SPERR-Modus gab es nie (Entscheidung von Damian,
// 13.9.2026). Einmal gab es Freemium: Tageslimiten und ein gratis erster Tag.
// Seit 10.10.2026 ist das ersatzlos weg — die herunterladbare App läuft
// unbegrenzt und hat kein Schlüssel-Feld (`server/helfer/freemium.ts` und der
// Pro-Tag sind gelöscht). Was bleibt, ist das Ausstellen und Prüfen von
// Schlüsseln als WERKZEUG für KEPTA Enterprise, das ausschließlich von
// `tools/license-studio` und `scripts/generate-license.mjs` benutzt wird. Kein
// Weg durch die App führt mehr hierher.
import crypto from "node:crypto";
import { GESPERRTE_LIZENZEN } from "./sperrliste";

/**
 * Öffentlicher Prüfschlüssel (Ed25519, SPKI/DER, base64). Trägt
 * scripts/license-keypair.mjs ein. Solange hier der Platzhalter steht, ist
 * kein Schlüssel gültig — und die App bleibt gesperrt.
 */
export const OEFFENTLICHER_SCHLUESSEL = "MCowBQYDK2VwAyEAuzFdqgmHs24UN1prj6UAEU/EzQRr8knyyz6rxwUMLgY=";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const NUMMER_BYTES = 4;
const SIGNATUR_BYTES = 64;
const FORM = "kepta-lizenz-v3";
/** v3.1: Nummer (4) + Stufe (1) + Seats (2) + Signatur (64). */
const STUFE_BYTES = 1;
const SEATS_BYTES = 2;
const FORM_V31 = "kepta-lizenz-v3.1";
export const HOECHSTE_NUMMER = 0xffffffff;

/**
 * Die Stufen der Neuausrichtung (September 2026): Pro für Einzelpersonen,
 * Business für Teams, Enterprise für Organisationen. Alle schalten dieselbe
 * App frei — die Stufe gehört zum Vertrag, nicht zu einer anderen Software.
 */
export type Edition = "pro" | "business" | "enterprise";
export const EDITIONEN: readonly Edition[] = ["pro", "business", "enterprise"];
const EDITIONS_CODE: Record<Edition, number> = { pro: 1, business: 2, enterprise: 3 };
const EDITION_VON_CODE: Record<number, Edition> = { 1: "pro", 2: "business", 3: "enterprise" };
/** Anzeigename der Stufe — in der Fußzeile der App und in der Kunden-Nachricht. */
export const EDITIONS_LABEL: Record<Edition, string> = {
  pro: "KEPTA Pro",
  // Die interne Edition „business“ zeigt KEPTA Enterprise — die öffentliche
  // Stufe Business gibt es nicht mehr; Team-Features sind Enterprise.
  business: "KEPTA Enterprise",
  enterprise: "KEPTA Enterprise",
};
/** Höchste Seat-Zahl, die ein Business-Schlüssel tragen kann (2 Byte). */
export const HOECHSTE_SEATS = 9999;

/** Die gesperrten Nummern aus src/core/sperrliste.ts. */
export const GESPERRT: ReadonlySet<number> = new Set(GESPERRTE_LIZENZEN);

export interface Lizenzpruefung {
  gueltig: boolean;
  /** Die Lizenznummer — nur, wenn die Signatur echt ist. */
  nummer: number | null;
  /** Echt, aber auf der Sperrliste. */
  gesperrt: boolean;
  /** Die Stufe des Schlüssels — v3-Schlüssel (ohne Stufe) gelten als Pro. */
  edition: Edition;
  /** Business: Seat-Zahl. Pro: 1. Enterprise: 0 (Umfang nach Absprache). */
  seats: number;
}

/**
 * Normalisierter Name: Groß-/Kleinschreibung und Leerzeichen sind egal — und
 * die Unicode-Form: „ü“ kann ein Zeichen sein oder „u“ + Trema (so kommt es
 * oft aus PDFs). Ohne NFC passte ein Schlüssel für „Müller“ dann nicht mehr.
 */
export function normalisiere(name: string): string {
  return name.toLowerCase().normalize("NFC").trim().replace(/\s+/g, " ");
}

/** Lizenznummer zum Anzeigen: mindestens vierstellig, z. B. 0007. */
export function formatiereNummer(nummer: number): string {
  return String(nummer).padStart(4, "0");
}

/** Base32 in 5er-Gruppen (RFC 4648, ohne Auffüllung). */
export function alsGruppen(bytes: Uint8Array): string {
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  while (bits.length % 5 !== 0) bits += "0";
  let zeichen = "";
  for (let i = 0; i < bits.length; i += 5) zeichen += ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  return zeichen.match(/.{1,5}/g)!.join("-");
}

/** Zurück in Bytes; Leerzeichen, Trennstriche und Kleinschreibung sind egal. Ungültig → null. */
export function ausGruppen(text: string): Buffer | null {
  const rein = text.toUpperCase().replace(/[\s-]/g, "");
  if (!rein || /[^A-Z2-7]/.test(rein)) return null;
  let bits = "";
  for (const z of rein) bits += ALPHABET.indexOf(z).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  // Only the canonical spelling counts: what is left after the last full byte
  // is padding and must be zero. 68 bytes are 544 bits, the key carries 545 —
  // without this check its last character had a second spelling (A ↔ B) that
  // decoded to the same key.
  const rest = bits.slice(bytes.length * 8);
  if (rest.length >= 5 || rest.includes("1")) return null;
  return Buffer.from(bytes);
}

function signaturText(name: string, nummer: number, edition?: Edition, seats?: number): Buffer {
  const kopf = `${FORM}\n${normalisiere(name)}\n${nummer}`;
  if (!edition) return Buffer.from(kopf);
  return Buffer.from(`${FORM_V31}\n${normalisiere(name)}\n${nummer}\n${edition}\n${seats}`);
}

const istNummer = (n: number) => Number.isInteger(n) && n >= 1 && n <= HOECHSTE_NUMMER;

/**
 * Wie viele Seats dieser Stufe entsprechen: Pro ist persönlich (1), Business
 * trägt die gekaufte Seat-Zahl (muss beim Ausstellen genannt werden),
 * Enterprise wird nach Absprache mit Damian lizenziert (0 = Umfang steht im
 * Vertrag, nicht im Schlüssel).
 */
export function seatsFuer(edition: Edition, seats?: number): number {
  if (edition === "pro") return 1;
  if (edition === "enterprise") return 0;
  if (!Number.isInteger(seats) || (seats as number) < 1 || (seats as number) > HOECHSTE_SEATS) {
    throw new Error(`Business-Lizenzen brauchen 1 bis ${HOECHSTE_SEATS} Seats`);
  }
  return seats as number;
}

/** Die zulässige Seat-Zahl einer Stufe — oder null, wenn die Kombination nicht existiert. */
function akzeptierteSeats(edition: Edition, seats: number): number | null {
  try {
    return seatsFuer(edition, seats);
  } catch {
    return null;
  }
}

/**
 * Nummer und Signatur aus einem Schlüssel — oder null, wenn er nicht diese
 * Form hat. v3.1-Schlüssel tragen zusätzlich Stufe und Seats.
 */
export function leseSchluessel(schluessel: string): { nummer: number; signatur: Buffer; edition?: Edition; seats?: number } | null {
  const bytes = ausGruppen(schluessel);
  if (!bytes || bytes.length !== NUMMER_BYTES + SIGNATUR_BYTES) {
    if (!bytes || bytes.length !== NUMMER_BYTES + STUFE_BYTES + SEATS_BYTES + SIGNATUR_BYTES) return null;
    const nummer = bytes.readUInt32BE(0);
    if (!istNummer(nummer)) return null;
    const edition = EDITION_VON_CODE[bytes[NUMMER_BYTES]];
    if (!edition) return null;
    const seats = bytes.readUInt16BE(NUMMER_BYTES + STUFE_BYTES);
    return { nummer, signatur: bytes.subarray(NUMMER_BYTES + STUFE_BYTES + SEATS_BYTES), edition, seats };
  }
  const nummer = bytes.readUInt32BE(0);
  if (!istNummer(nummer)) return null;
  return { nummer, signatur: bytes.subarray(NUMMER_BYTES) };
}

/** Einen Schlüssel ausstellen — nur mit dem privaten Schlüssel (PKCS#8/DER, base64). */
export function signiere(
  name: string,
  nummer: number,
  privaterSchluessel: string,
  edition: Edition = "pro",
  seats?: number,
): string {
  if (!istNummer(nummer)) throw new Error("Ungültige Lizenznummer");
  if (!normalisiere(name)) throw new Error("Kein Name");
  if (!EDITIONEN.includes(edition)) throw new Error("Unbekannte Stufe");
  const anzahl = seatsFuer(edition, seats);
  const k = crypto.createPrivateKey({ key: Buffer.from(privaterSchluessel, "base64"), format: "der", type: "pkcs8" });
  const kopf = Buffer.alloc(NUMMER_BYTES + STUFE_BYTES + SEATS_BYTES);
  kopf.writeUInt32BE(nummer);
  kopf.writeUInt8(EDITIONS_CODE[edition], NUMMER_BYTES);
  kopf.writeUInt16BE(anzahl, NUMMER_BYTES + STUFE_BYTES);
  return alsGruppen(Buffer.concat([kopf, crypto.sign(null, signaturText(name, nummer, edition, anzahl), k)]));
}

/** Prüft Name und Schlüssel mit dem öffentlichen Schlüssel der App — und gegen die Sperrliste. */
export function pruefeSchluessel(
  name: string,
  schluessel: string,
  oeffentlich: string = OEFFENTLICHER_SCHLUESSEL,
  gesperrt: ReadonlySet<number> = GESPERRT,
): Lizenzpruefung {
  const ungueltig: Lizenzpruefung = { gueltig: false, nummer: null, gesperrt: false, edition: "pro", seats: 1 };
  const teile = leseSchluessel(schluessel);
  if (!teile || !normalisiere(name)) return ungueltig;
  let echt = false;
  try {
    const k = crypto.createPublicKey({ key: Buffer.from(oeffentlich, "base64"), format: "der", type: "spki" });
    echt = crypto.verify(null, signaturText(name, teile.nummer, teile.edition, teile.seats), k, teile.signatur);
  } catch {
    return ungueltig; // Platzhalter oder kaputter Prüfschlüssel: dann ist nichts gültig
  }
  if (!echt) return ungueltig;
  // Die Stufe steht im Klartext im Schlüssel: nur die zulässigen Kombinationen gelten.
  if (teile.edition && akzeptierteSeats(teile.edition, teile.seats ?? -1) !== teile.seats) return ungueltig;
  const edition = teile.edition ?? "pro";
  if (gesperrt.has(teile.nummer)) return { gueltig: false, nummer: teile.nummer, gesperrt: true, edition, seats: teile.seats ?? 1 };
  return { gueltig: true, nummer: teile.nummer, gesperrt: false, edition, seats: teile.seats ?? 1 };
}

/** Kurzform: gültig und nicht gesperrt. */
export function validiereSchluessel(name: string, schluessel: string, oeffentlich: string = OEFFENTLICHER_SCHLUESSEL): boolean {
  return pruefeSchluessel(name, schluessel, oeffentlich).gueltig;
}
