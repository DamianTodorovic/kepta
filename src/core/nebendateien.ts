// Verschlüsselte Nebendateien: dieselbe 256-Bit-Stärke für alles, was neben
// der Wissensbasis auf der Platte liegt. Die Datenbank ist seit 2.11
// verschlüsselt (SQLCipher 4); profile.json, scan-config.json und die
// JSONL-Journale lagen daneben im Klartext — SECURITY.md hat das ehrlich
// zugegeben. Seit 2.13.4 gilt: Gleicher Schlüssel (aus dem Schlüsselbund),
// AES-256-GCM je Datei bzw. je Journalzeile, Klartext-Dateien aus älteren
// Versionen werden beim Lesen verstanden und beim nächsten Schreiben
// verschlüsselt.
//
// Bewusste Ausnahmen (dokumentiert in SECURITY.md):
//  - endpoint.json enthält keine Geheimnisse (Port, PID, Startzeit) und ist
//    der Entdeckungs-Mechanismus für lokale Werkzeuge — lesbar ohne Schlüssel.
//  - Der Inbox-Ordner hält vom Nutzer selbst abgelegte Quelldateien (PDFs,
//    Markdown) — Nutzerbesitz wie der Markdown-Export; ihn deckt die
//    Plattform-Verschlüsselung (FileVault/BitLocker/LUKS).
//  - KEPTA_ENCRYPTION=off schaltet dies wie die Datenbank ab (Werkzeug-Modus).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { holeOderErzeugeSchluessel, schluesselbundFuer, standardAusfuehren, type Ausfuehren } from "./schluessel";
import { leseUmwelt } from "./umwelt";
import { PraxissyncJournal, verifyJournal, type SyncJournalEntry } from "./praxissync";
import { defaultAuditDir, type AuditEvent } from "./extensions";

const MAGIE = "KEPTA-NEBEN1\n";
const ZEILEN_PRÄFIX = "K1.";

/**
 * Der Nebendatei-Schlüssel: derselbe 256-Bit-Schlüssel wie für die
 * Wissensbasis — eine Recovery-Story, kein zweites Geheimnis. `null` heißt
 * bewusster Klartext (KEPTA_ENCRYPTION=off).
 *
 * NUR LESEN, NIEMALS ERZEUGEN: `holeOderErzeugeSchluessel` legt bei fehlendem
 * Eintrag einen NEUEN an — auf macOS würde das den echten Keychain-Eintrag
 * (`app.kepta.database`) überschreiben und die verschlüsselte Wissensbasis
 * unwiederbringlich abschneiden (22.9. genau das durch einen Testlauf
 * ausgelöst und über die App-Recovery gerettet). Der Store erzeugt seinen
 * Schlüssel selbst beim Öffnen; die Nebendateien lesen denselben nur. Ohne
 * vorhandenen Eintrag: null → Klartext, ehrlich.
 */
export function nebendateiSchluessel(
  datenordner: string,
  plattform: string = process.platform,
  ausf: Ausfuehren = standardAusfuehren,
  env: Record<string, string | undefined> = process.env,
): Buffer | null {
  if (leseUmwelt("verschluesselung", env).wert === "off") return null;
  // Der Schluessel zuerst aus der Umgebung (beide Namensformen, Meldung in
  // /api/health) — derselbe Schlüssel wie für die Wissensbasis, nur
  // gelesen, nie erzeugt oder überschrieben.
  const ausUmgebung = leseUmwelt("schluessel", env).wert?.trim();
  if (ausUmgebung && /^[0-9a-f]{64}$/i.test(ausUmgebung)) return Buffer.from(ausUmgebung, "hex");
  try {
    const bund = schluesselbundFuer(plattform, datenordner, ausf);
    if (!bund) return null;
    const vorhanden = bund.lesen();
    if (!vorhanden || !/^[0-9a-f]{64}$/i.test(vorhanden)) return null;
    return Buffer.from(vorhanden, "hex");
  } catch {
    return null;
  }
}

function verschluessle(klar: string, schluessel: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const chiffre = crypto.createCipheriv("aes-256-gcm", schluessel, iv);
  const dicht = Buffer.concat([chiffre.update(klar, "utf8"), chiffre.final()]);
  return Buffer.concat([Buffer.from(MAGIE, "utf8"), iv, chiffre.getAuthTag(), dicht]);
}

function entschlüssle(roh: Buffer, schluessel: Buffer): string {
  if (!roh.subarray(0, MAGIE.length).equals(Buffer.from(MAGIE, "utf8"))) {
    throw new Error("Keine verschlüsselte Nebendatei (Magie fehlt).");
  }
  const iv = roh.subarray(MAGIE.length, MAGIE.length + 12);
  const tag = roh.subarray(MAGIE.length + 12, MAGIE.length + 28);
  const dicht = roh.subarray(MAGIE.length + 28);
  const entschl = crypto.createDecipheriv("aes-256-gcm", schluessel, iv);
  entschl.setAuthTag(tag);
  return Buffer.concat([entschl.update(dicht), entschl.final()]).toString("utf8");
}

/** JSON-Objekt verschlüsselt schreiben (ganze Datei). */
export function schreibeJsonDatei(pfad: string, wert: unknown, schluessel: Buffer | null): void {
  const klar = JSON.stringify(wert, null, 2);
  if (!schluessel) {
    fs.writeFileSync(pfad, klar, "utf-8");
    return;
  }
  fs.writeFileSync(pfad, verschluessle(klar, schluessel));
}

/**
 * JSON-Datei lesen: verschlüsselt (Magie vorhanden) oder Klartext aus einer
 * älteren Version. Fehlende Datei und unlesbarer Inhalt liefern `null` —
 * dieselbe Nachsicht wie die bisherigen try/catch-Reader.
 */
export function leseJsonDatei<T>(pfad: string, schluessel: Buffer | null): T | null {
  let roh: Buffer;
  try {
    roh = fs.readFileSync(pfad);
  } catch {
    return null;
  }
  try {
    if (roh.subarray(0, MAGIE.length).equals(Buffer.from(MAGIE, "utf8"))) {
      if (!schluessel) throw new Error("Verschlüsselte Nebendatei ohne Schlüssel (KEPTA_ENCRYPTION=off?).");
      return JSON.parse(entschlüssle(roh, schluessel)) as T;
    }
    return JSON.parse(roh.toString("utf-8")) as T;
  } catch {
    return null;
  }
}

/** Eine Journalzeile verschlüsseln: `K1.<iv>.<dicht+tag>` in Base64. */
export function journalZeile(objekt: unknown, schluessel: Buffer | null): string {
  const klar = JSON.stringify(objekt);
  if (!schluessel) return klar;
  const iv = crypto.randomBytes(12);
  const chiffre = crypto.createCipheriv("aes-256-gcm", schluessel, iv);
  const dicht = Buffer.concat([chiffre.update(klar, "utf8"), chiffre.final()]);
  return ZEILEN_PRÄFIX + iv.toString("base64") + "." + Buffer.concat([chiffre.getAuthTag(), dicht]).toString("base64");
}

/**
 * Journalzeilen lesen. `K1.`-Zeilen werden entschlüsselt — eine kaputte
 * verschlüsselte Zeile WIRFT: ein Mitschnitt, den man nicht lesen kann, ist
 * ein Manipulationsverdacht, kein Grund still zu heilen. Andere Zeilen sind
 * Klartext aus einer älteren Version und werden unverändert verstanden.
 */
export function journalLesen<T>(pfad: string, schluessel: Buffer | null): T[] {
  let inhalt: string;
  try {
    inhalt = fs.readFileSync(pfad, "utf-8");
  } catch {
    return [];
  }
  const raus: T[] = [];
  for (const zeile of inhalt.split("\n")) {
    const klar = zeile.trim();
    if (!klar) continue;
    if (klar.startsWith(ZEILEN_PRÄFIX)) {
      if (!schluessel) throw new Error(`Verschlüsselte Journalzeile ohne Schlüssel: ${pfad}`);
      const [, ivB64, dichtB64] = klar.split(".");
      if (!ivB64 || !dichtB64) throw new Error(`Kaputte Journalzeile: ${pfad}`);
      const entschl = crypto.createDecipheriv("aes-256-gcm", schluessel, Buffer.from(ivB64, "base64"));
      const paket = Buffer.from(dichtB64, "base64");
      entschl.setAuthTag(paket.subarray(0, 16));
      raus.push(JSON.parse(Buffer.concat([entschl.update(paket.subarray(16)), entschl.final()]).toString("utf8")) as T);
    } else {
      raus.push(JSON.parse(klar) as T);
    }
  }
  return raus;
}

// ---------- App-Varianten der Kern-Journale (verschlüsselt) ----------
//
// Der offene Kern (3.1.x) schreibt Sync-Mitschnitt und Audit-Datei als
// Klartext-JSONL (PraxissyncJournal / FileAuditSink). Die App hält an der
// Kanzlei-Regel fest: Sync-Metadaten und Audit-Zeilen liegen verschlüsselt
// auf der Platte (journalZeile/journalLesen, derselbe 256-Bit-Schlüssel wie
// die Wissensbasis). Die Hash-Kette ist Zeichen für Zeichen die Kern-Logik
// (src/core/praxissync.ts, entryHash/verifyJournal) — nur der Platten-IO
// läuft hier verschlüsselt. Bewusst KEIN Kern-Fork: der Kern bleibt 1:1.

function journalEintragsHash(e: Omit<SyncJournalEntry, "hash">): string {
  // 1:1 die Kern-Formel (entryHash in praxissync.ts) — sonst würde
  // verifyJournal aus dem Kern die App-Zeilen verwerfen.
  return crypto.createHash("sha256").update(JSON.stringify(e)).digest("hex");
}

/** Form des Kern-Record-Eingangs (praxissync.ts, dort nicht exportiert). */
export type SyncJournalEingang = { direction: "export" | "import"; peer: string; scope: string; count: number; payloadHash: string };

/**
 * App-Variante des Kern-PraxissyncJournal: derselbe Paketmitschnitt mit
 * derselben Hash-Kette — aber jede Zeile verschlüsselt. `null`-Schlüssel
 * (= KEPTA_ENCRYPTION=off) schreibt Klartext wie der Kern. Erbt vom
 * Kern-Journal, damit exportBundle/importBundle es annehmen.
 */
export class VerschlusstesSyncJournal extends PraxissyncJournal {
  /** Nicht-null: jede Zeile verschlüsselt (derselbe Schlüssel wie die Wissensbasis). null = Klartext (Tests, KEPTA_ENCRYPTION=off). */
  private schluessel: Buffer | null;
  /** Spiegel des privaten Basis-Felds `file` — die Subklasse braucht den Pfad für ihren verschlüsselten IO. */
  private pfad: string;

  constructor(file: string, schluessel: Buffer | null = null) {
    super(file);
    this.pfad = file;
    this.schluessel = schluessel;
  }

  /** Prüft die gesamte Kette. Leerer Mitschnitt gilt als unversehrt; ein Mitschnitt, der sich nicht entschlüsseln lässt, ist gebrochen. */
  override verify(): boolean {
    try {
      return verifyJournal(this.entries());
    } catch {
      return false;
    }
  }

  override record(input: SyncJournalEingang): SyncJournalEntry {
    // 1:1 die Kern-Logik: erst die bestehende Kette prüfen — eine gebrochene
    // Kette heilt sich nie still weg (Manipulationsverdacht bricht ab).
    const bestehende = this.entries();
    if (bestehende.length > 0 && !verifyJournal(bestehende)) {
      throw new Error(
        `Paketmitschnitt ist gebrochen (${this.pfad}) — die Kette wurde nachträglich verändert. ` +
          `Die Datei muss archiviert und bewusst neu begonnen werden; ein Anhängen würde die Manipulation verdecken.`
      );
    }
    const prev = bestehende.length > 0 ? bestehende[bestehende.length - 1]! : null;
    const entry: Omit<SyncJournalEntry, "hash"> = {
      seq: prev ? prev.seq + 1 : 1,
      at: new Date().toISOString(),
      direction: input.direction,
      peer: input.peer,
      scope: input.scope,
      count: input.count,
      payloadHash: input.payloadHash,
      prevHash: prev ? prev.hash : null,
    };
    const full: SyncJournalEntry = { ...entry, hash: journalEintragsHash(entry) };
    fs.appendFileSync(this.pfad, journalZeile(full, this.schluessel) + "\n", "utf-8");
    return full;
  }

  override entries(): SyncJournalEntry[] {
    // Eine kaputte verschlüsselte Zeile wirft — Manipulationsverdacht, kein
    // Grund still zu heilen. Nur eine fehlende Datei ist leer.
    return journalLesen<SyncJournalEntry>(this.pfad, this.schluessel);
  }
}

/**
 * App-Variante des Kern-FileAuditSink: die Audit-Zeile geht verschlüsselt auf
 * die Platte (K1.-Präfix). `null`-Schlüssel schreibt Klartext wie der Kern.
 */
export class VerschlussteAuditDatei {
  private file: string;
  private queue: Promise<void> = Promise.resolve();
  private schluessel: Buffer | null;
  constructor(file: string = path.join(defaultAuditDir(), "audit.jsonl"), schluessel: Buffer | null = null) {
    this.file = file;
    this.schluessel = schluessel;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
    } catch {
      // journal failures must never break the memory
    }
  }
  emit(event: AuditEvent): void {
    this.queue = this.queue
      .then(() => fs.promises.appendFile(this.file, journalZeile(event, this.schluessel) + "\n", "utf-8"))
      .catch(() => undefined);
  }
  /** Wartet, bis alle eingereichten Einträge wirklich in der Datei stehen. */
  flush(): Promise<void> {
    return this.queue;
  }
}
