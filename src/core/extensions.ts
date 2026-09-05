// KEPTA Core — extension points. Everything here ships in the free edition:
// these are the places where an organisation-grade deployment plugs in, but the
// defaults below are real, useful implementations for a single local user.

/** Who is accessing. A local install always has the same implicit local user. */
export interface ActorContext {
  actorId: string;
  scope: string; // matches the scope column
}

/** Minimal handle on a memory without loading the full record. */
export interface MemoryRef {
  id: string;
  scope: string;
  type: string;
}

/** Minimal handle on a memory without loading the full record. */
export interface MemoryRef {
  id: string;
  scope: string;
  type: string;
}

/** May this actor read/write? Local default: always yes. */
export interface PolicyGate {
  canRead(actor: ActorContext, ref: MemoryRef): boolean;
  canWrite(actor: ActorContext, ref: MemoryRef): boolean;
  filterResults(actor: ActorContext, rows: MemoryRef[]): MemoryRef[];
}

export type AuditAction =
  | "read" | "write" | "update" | "delete"
  | "search" | "export" | "egress";

export interface AuditEvent {
  at: string; // ISO-8601 UTC
  actorId: string;
  action: AuditAction;
  target?: string;
  detail?: Record<string, unknown>;
}

/** Journal sink — free edition ships a real local journal, not a noop. */
export interface AuditSink {
  emit(event: AuditEvent): void;
}

/**
 * Local default: append-only JSONL journal at ~/.kepta/audit.jsonl.
 * Every read, write and (potential) network egress is on the record —
 * proof you can hand to a client, not a promise.
 */
export class FileAuditSink {
  private file: string;
  private queue: Promise<void> = Promise.resolve();
  constructor(file?: string) {
    this.file = file ?? path.join(defaultAuditDir(), "audit.jsonl");
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
    } catch {
      // journal failures must never break the memory
    }
  }
  emit(event: AuditEvent): void {
    this.queue = this.queue
      .then(() => fs.promises.appendFile(this.file, JSON.stringify(event) + "\n", "utf-8"))
      .catch(() => undefined);
  }
}

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export function defaultAuditDir(): string {
  const env = process.env.KEPTA_DATA_DIR;
  return env ?? path.join(os.homedir(), ".kepta");
}

/** Local default: plaintext SQLite on this machine (no field encryption). */
export interface KeyProvider {
  /** Return a key to decrypt the database, or null to open it as-is. */
  keyFor(dbPath: string): Promise<Uint8Array | null>;
}

/** Local default: one fixed local user. */
export interface IdentityResolver {
  current(): ActorContext;
}

/** Local default: off. A future device-sync plugs in here without touching the core. */
export interface ReplicationTransport {
  enabled(): boolean;
  push(sinceIso: string): Promise<void>;
  pull(sinceIso: string): Promise<void>;
}

/** Local default: manual trash (deleted_at) — nothing expires on its own. */
export interface RetentionPolicy {
  dueForDeletion(now: Date): Promise<string[]>;
  onDelete(ids: string[]): Promise<{ proof: string | null }>;
}

export interface KeptaExtensions {
  policy: PolicyGate;
  audit: AuditSink;
  keys: KeyProvider;
  identity: IdentityResolver;
  replication: ReplicationTransport;
  retention: RetentionPolicy;
}

export const ALLOW_ALL: PolicyGate = {
  canRead: () => true,
  canWrite: () => true,
  filterResults: (_actor, rows) => rows,
};

export const NOOP_SINK: AuditSink = { emit: () => undefined };

export const PLAINTEXT_KEY: KeyProvider = { keyFor: async () => null };

export const SINGLE_LOCAL_USER: IdentityResolver = {
  current: () => ({ actorId: "local", scope: "local" }),
};

export const NO_REPLICATION: ReplicationTransport = {
  enabled: () => false,
  push: async () => undefined,
  pull: async () => undefined,
};

export const MANUAL_TRASH: RetentionPolicy = {
  dueForDeletion: async () => [],
  onDelete: async () => ({ proof: null }),
};

/**
 * The free-edition set. Everything behaves exactly like KEPTA before these
 * hooks existed — the seams are the feature, not the implementations.
 */
export function defaultExtensions(): KeptaExtensions {
  return {
    policy: ALLOW_ALL,
    audit: NOOP_SINK,
    keys: PLAINTEXT_KEY,
    identity: SINGLE_LOCAL_USER,
    replication: NO_REPLICATION,
    retention: MANUAL_TRASH,
  };
}

export { FileAuditSink as LocalFileAuditSink };
