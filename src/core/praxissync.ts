// KEPTA Praxis-Sync (F4) — E2E-verschlüsselter Geräteabgleich mit Paketmitschnitt.
// Zielbild §203: zwei Geräte tauschen Memories direkt aus — als Datei per USB,
// Ordner-Sync oder verschlüsselter Mail. Das Bundle ist AES-256-GCM-verschlüsselt
// mit einem scrypt-Key aus der Passphrase: der Übertragungsweg kann mitgelesen
// werden, ohne lesbar zu sein; KEPTA selbst sendet nichts.
// Der Paketmitschnitt hält jeden Payload-Hash in einer verketteten JSONL-Kette
// fest (je Zeile sha256 über die Zeile + Hash des Vorgängers) — der nachprüfbare
// Beweis, welche Pakete wann übertragen wurden, ohne deren Inhalt zu kennen.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { KeptaStore } from "./store";
import { indexMemory } from "./engine";
import { defaultAuditDir } from "./extensions";
import type { MemoryType } from "./types";

export const PRAXISSYNC_FORMAT = "kepta-praxissync";
export const PRAXISSYNC_VERSION = 1;

const KDF_SALT_BYTES = 16;
const KEY_LEN = 32;
const IV_BYTES = 12;

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.scryptSync(passphrase, salt, KEY_LEN, { N: 16384, r: 8, p: 1 });
}

function payloadHashOf(payload: string): string {
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export interface SyncBundle {
  format: typeof PRAXISSYNC_FORMAT;
  version: typeof PRAXISSYNC_VERSION;
  createdAt: string;
  scope: string;
  sender: string;
  count: number;
  payloadHash: string;
  salt: string;
  iv: string;
  ciphertext: string;
  authTag: string;
}

export interface ExportOptions {
  passphrase: string;
  /** Mandanten-/Patienten-Trennung: nur dieser Scope geht in das Bundle. */
  scope?: string;
  /** Gerätekennzeichnung für den Mitschnitt. */
  sender?: string;
  journal?: PraxissyncJournal;
}

/**
 * Packt alle aktiven, nicht ersetzten Memories eines Scopes in ein
 * verschlüsseltes Bundle. Klartext verlässt diese Funktion nie.
 */
export function exportBundle(store: KeptaStore, opts: ExportOptions): SyncBundle {
  const scope = opts.scope ?? "local";
  const records = store
    .listMemories()
    .filter((m) => m.scope === scope && !m.supersededBy && m.deletedAt === null);
  const payload = JSON.stringify({ memories: records });
  const salt = crypto.randomBytes(KDF_SALT_BYTES);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(opts.passphrase, salt), iv);
  const ciphertext = Buffer.concat([cipher.update(payload, "utf-8"), cipher.final()]);
  const bundle: SyncBundle = {
    format: PRAXISSYNC_FORMAT,
    version: PRAXISSYNC_VERSION,
    createdAt: new Date().toISOString(),
    scope,
    sender: opts.sender ?? "kepta",
    count: records.length,
    payloadHash: payloadHashOf(payload),
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
  opts.journal?.record({ direction: "export", peer: bundle.sender, scope, count: records.length, payloadHash: bundle.payloadHash });
  return bundle;
}

export interface ImportOptions {
  passphrase: string;
  peer?: string;
  journal?: PraxissyncJournal;
}

export interface ImportResult {
  imported: number;
  skipped: number;
}

/**
 * Entschlüsselt und übernimmt ein Bundle. Idempotent: vorhandene Knoten werden
 * nicht angetastet (skipped), neue werden inkl. Chunk-Index angelegt. Falsche
 * Passphrase oder manipulierte Nutzlast werfen — Import nach Packen des
 * Mitschnitts ist als Beweis gerade gewollt.
 */
export function importBundle(store: KeptaStore, bundle: SyncBundle, opts: ImportOptions): ImportResult {
  if (bundle.format !== PRAXISSYNC_FORMAT) throw new Error(`Unbekanntes Bundle-Format: ${String(bundle.format)}`);
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    deriveKey(opts.passphrase, Buffer.from(bundle.salt, "base64")),
    Buffer.from(bundle.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(bundle.authTag, "base64"));
  let payload: string;
  try {
    payload = Buffer.concat([decipher.update(Buffer.from(bundle.ciphertext, "base64")), decipher.final()]).toString("utf-8");
  } catch {
    throw new Error("Bundle konnte nicht entschlüsselt werden — Passphrase falsch oder Paket unvollständig");
  }
  if (payloadHashOf(payload) !== bundle.payloadHash) {
    throw new Error("Paketmitschnitt weicht ab: Nutzlast-Hash passt nicht (Paket manipuliert?)");
  }

  const { memories } = JSON.parse(payload) as {
    memories: {
      id: string;
      scope: string;
      type?: MemoryType;
      title: string;
      content: string;
      tags?: string[];
      confidence?: number;
      validFrom?: number | null;
      validTo?: number | null;
      updatedAt?: number;
    }[];
  };

  let imported = 0;
  let skipped = 0;
  for (const m of memories) {
    const { created } = store.upsertMemory({
      id: m.id,
      title: m.title,
      content: m.content,
      tags: m.tags ?? [],
      type: m.type,
      scope: m.scope,
      confidence: m.confidence,
      validFrom: m.validFrom ?? undefined,
      validTo: m.validTo ?? undefined,
      updatedAt: m.updatedAt,
    });
    if (created) {
      imported++;
    } else {
      skipped++;
    }
    indexMemory(store, m.id);
  }
  opts.journal?.record({ direction: "import", peer: opts.peer ?? bundle.sender, scope: bundle.scope, count: memories.length, payloadHash: bundle.payloadHash });
  return { imported, skipped };
}

// ---------- Paketmitschnitt (verkettete Hash-Kette) ----------

export interface SyncJournalEntry {
  seq: number;
  at: string;
  direction: "export" | "import";
  peer: string;
  scope: string;
  count: number;
  payloadHash: string;
  prevHash: string | null;
  hash: string;
}

type SyncJournalInput = { direction: "export" | "import"; peer: string; scope: string; count: number; payloadHash: string };

function entryHash(e: Omit<SyncJournalEntry, "hash">): string {
  return crypto.createHash("sha256").update(JSON.stringify(e)).digest("hex");
}

export function verifyJournal(entries: SyncJournalEntry[]): boolean {
  let prevHash: string | null = null;
  for (const e of entries) {
    const { hash, ...rest } = e;
    if (e.prevHash !== prevHash || e.hash !== entryHash(rest as Omit<SyncJournalEntry, "hash">)) return false;
    prevHash = e.hash;
  }
  return true;
}

export class PraxissyncJournal {
  private file: string;

  constructor(file: string = path.join(defaultAuditDir(), "sync-journal.jsonl")) {
    this.file = file;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
    } catch {
      // Mitschnitt-Fehler dürfen den Sync nie blockieren
    }
  }

  record(input: SyncJournalInput): SyncJournalEntry {
    const prev = this.lastEntry();
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
    const full: SyncJournalEntry = { ...entry, hash: entryHash(entry) };
    fs.appendFileSync(this.file, JSON.stringify(full) + "\n", "utf-8");
    return full;
  }

  entries(): SyncJournalEntry[] {
    try {
      return fs
        .readFileSync(this.file, "utf-8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as SyncJournalEntry);
    } catch {
      return [];
    }
  }

  private lastEntry(): SyncJournalEntry | null {
    const all = this.entries();
    return all.length > 0 ? all[all.length - 1]! : null;
  }
}
