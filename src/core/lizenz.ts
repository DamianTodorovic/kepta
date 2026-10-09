// Lizenzschlüssel — Ed25519-Signaturen, offline geprüft.
//
// Ein Schlüssel trägt seine Lizenznummer (4 Byte), seine Stufe (1 Byte) und die
// Seat-Zahl (2 Byte), signiert über den normalisierten Namen des Käufers, die
// Nummer, die Stufe und die Seats („kepta-lizenz-v3.1") — als Base32 in
// 5er-Gruppen. Ausgestellt und geprüft wird offline, auf einer Maschine ohne
// Netzverkehr dabei.
//
// Es gibt zwei Dinge: KEPTA Core (kostenlos, unbegrenzt, ohne Schlüssel) und
// KEPTA Enterprise (nach Vereinbarung, persönlich ausgestellt). Ein Schlüssel
// gehört nur zu Enterprise. Seit 10.10.2026 hat die herunterladbare App kein
// Schlüssel-Feld mehr und prüft auch keinen — dieser Code ist das Ausstellungs-
// und Prüfwerkzeug für Enterprise (`tools/license-studio`,
// `scripts/generate-license.mjs`, `tools/lizenz-worker`), kein Laufzeitpfad der
// App. Wer hier einen Grenzweg einbaut, baut eine Sperre ein.
//
// Der Stufen-Byte: 2 = Team mit Seats, 3 = Organisation nach Absprache. Nach
// außen heißen beide KEPTA Enterprise, weil es nur diese eine bezahlte Stufe
// gibt. Die 1 war die Einzelstufe der App; ihr Name steht in den Signaturen der
// Schlüssel, die vor dem Umbau ausgeliefert wurden, und bleibt deshalb als
// „alt" zum Prüfen bekannt — ausgestellt wird sie nicht mehr. Auch ein Schlüssel
// ohne Stufen-Byte (68 Byte, die Form davor) zählt als „alt" und prüft weiter.
// Schlüssel der allerersten Form (nur der Name, bis 2.11.0, 64 Byte) gelten
// nicht mehr; an Kunden war keiner ausgegeben.
//
// Gegen Weitergabe (Entscheidung von Damian, 13.9.2026: „der einfache Weg wie
// Sublime Text"): der Name steht sichtbar in der App, jede Lizenz hat ihre
// eigene Nummer, und eine weitergegebene Nummer kommt auf die Sperrliste
// (src/core/sperrliste.ts) — ab dem nächsten Update gilt ihr Schlüssel nicht
// mehr, auch nicht auf Rechnern, die schon aktiviert waren. Eine Bindung an
// den Mac (Kunde schickt einen Rechner-Code) war gebaut, aber nie
// veröffentlicht: sie verlangte vom Kunden einen Schritt und eine Kennung
// seines Rechners — zu viel für eine App, die für lokale Sicherheit steht.
//
// Signiert wird mit Damians privatem Schlüssel, der nur in seinem
// macOS-Schlüsselbund liegt (scripts/license-keypair.mjs legt ihn an;
// KEPTA License Studio und scripts/generate-license.mjs signieren damit). Im
// Ausstellungscode steht nur der ÖFFENTLICHE Schlüssel: mit ihm lässt sich
// prüfen, aber kein Schlüssel erzeugen.
//
// Die erste Fassung (12.9.2026) war ein HMAC mit dem Geheimnis im Quelltext —
// wer die App auspackte, konnte sich beliebige Schlüssel ausstellen.
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
 * Die Stufen, die sich ausstellen lassen. Beide gehören zu KEPTA Enterprise —
 * der Unterschied sitzt im Vertrag (Sitze für ein Team oder Umfang mit einer
 * Organisation), nicht in einer anderen Software.
 */
export type Edition = "business" | "enterprise";
export const EDITIONEN: readonly Edition[] = ["business", "enterprise"];

/**
 * Was ein Schlüssel tragen kann: eine der beiden Stufen, oder „alt" — die
 * Einzelstufe der App, die es seit 10.10.2026 nicht mehr gibt. „alt" lässt sich
 * nicht ausstellen, aber prüfen: sie steht in ausgelieferten Schlüsseln.
 */
export type Stufe = Edition | "alt";

const EDITIONS_CODE: Record<Edition, number> = { business: 2, enterprise: 3 };
const CODE_STUFE: Record<number, Stufe> = { 1: "alt", 2: "business", 3: "enterprise" };
/**
 * Der Name, wie er in die Signatur geschrieben wird. Für „alt" ist das der Name
 * der ehemaligen Einzelstufe — er kann sich nicht ändern, ohne die Schlüssel
 * ungültig zu machen, die mit ihm ausgeliefert wurden.
 */
const STUFEN_DRAHTNAME: Record<Stufe, string> = { alt: "pro", business: "business", enterprise: "enterprise" };
/** Was der Käufer für seine Stufe bekommt — nach außen gibt es einen Produktnamen. */
export const EDITIONS_LABEL: Record<Stufe, string> = {
  alt: "KEPTA Enterprise",
  business: "KEPTA Enterprise",
  enterprise: "KEPTA Enterprise",
};
/** Höchste Seat-Zahl, die ein Schlüssel tragen kann (2 Byte). */
export const HOECHSTE_SEATS = 9999;

/** Die gesperrten Nummern aus src/core/sperrliste.ts. */
export const GESPERRT: ReadonlySet<number> = new Set(GESPERRTE_LIZENZEN);

export interface Lizenzpruefung {
  gueltig: boolean;
  /** Die Lizenznummer — nur, wenn die Signatur echt ist. */
  nummer: number | null;
  /** Echt, aber auf der Sperrliste. */
  gesperrt: boolean;
  /** Die Stufe des Schlüssels; „alt" = Einzelstufe oder Form ohne Stufen-Byte. */
  edition: Stufe;
  /** Business: die Seat-Zahl. Enterprise: 0 (Umfang im Vertrag). Alt: 1. */
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

function signaturText(name: string, nummer: number, stufe?: Stufe, seats?: number): Buffer {
  const kopf = `${FORM}\n${normalisiere(name)}\n${nummer}`;
  if (!stufe) return Buffer.from(kopf);
  return Buffer.from(`${FORM_V31}\n${normalisiere(name)}\n${nummer}\n${STUFEN_DRAHTNAME[stufe]}\n${seats}`);
}

const istNummer = (n: number) => Number.isInteger(n) && n >= 1 && n <= HOECHSTE_NUMMER;

/**
 * Wie viele Seats einer Stufe entsprechen: die Altstufe war persönlich (1),
 * Business trägt die gekaufte Seat-Zahl (muss beim Ausstellen genannt werden),
 * Enterprise wird nach Absprache mit Damian lizenziert (0 = Umfang steht im
 * Vertrag, nicht im Schlüssel).
 */
export function seatsFuer(edition: Stufe, seats?: number): number {
  if (edition === "alt") return 1;
  if (edition === "enterprise") return 0;
  if (!Number.isInteger(seats) || (seats as number) < 1 || (seats as number) > HOECHSTE_SEATS) {
    throw new Error(`Business-Lizenzen brauchen 1 bis ${HOECHSTE_SEATS} Seats`);
  }
  return seats as number;
}

/** Die zulässige Seat-Zahl einer Stufe — oder null, wenn die Kombination nicht existiert. */
function akzeptierteSeats(edition: Stufe, seats: number): number | null {
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
export function leseSchluessel(schluessel: string): { nummer: number; signatur: Buffer; edition?: Stufe; seats?: number } | null {
  const bytes = ausGruppen(schluessel);
  if (!bytes || bytes.length !== NUMMER_BYTES + SIGNATUR_BYTES) {
    if (!bytes || bytes.length !== NUMMER_BYTES + STUFE_BYTES + SEATS_BYTES + SIGNATUR_BYTES) return null;
    const nummer = bytes.readUInt32BE(0);
    if (!istNummer(nummer)) return null;
    const edition = CODE_STUFE[bytes[NUMMER_BYTES]];
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
  edition: Edition,
  seats?: number,
): string {
  if (!istNummer(nummer)) throw new Error("Ungültige Lizenznummer");
  if (!normalisiere(name)) throw new Error("Kein Name");
  if (!EDITIONEN.includes(edition)) throw new Error(`Unbekannte Stufe — es gibt nur ${EDITIONEN.join(" und ")}`);
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
  const ungueltig: Lizenzpruefung = { gueltig: false, nummer: null, gesperrt: false, edition: "alt", seats: 1 };
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
  const edition = teile.edition ?? "alt";
  if (gesperrt.has(teile.nummer)) return { gueltig: false, nummer: teile.nummer, gesperrt: true, edition, seats: teile.seats ?? 1 };
  return { gueltig: true, nummer: teile.nummer, gesperrt: false, edition, seats: teile.seats ?? 1 };
}

/** Kurzform: gültig und nicht gesperrt. */
export function validiereSchluessel(name: string, schluessel: string, oeffentlich: string = OEFFENTLICHER_SCHLUESSEL): boolean {
  return pruefeSchluessel(name, schluessel, oeffentlich).gueltig;
}
