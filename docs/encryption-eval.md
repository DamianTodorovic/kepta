# Encryption at rest (F5) — what is on the disk

As of 11 September 2026 (2.11.0), re-measured 3 October 2026 on 3.1.2 · Evidence: `tests/encryption-eval.test.ts`, `tests/core/store-verschluesselung.test.ts` · Measurement: `npm run eval:crypto`

## The question

Can K3PTA keep its knowledge base encrypted on disk — without a password to
type every morning, without losing search, and without a moment in which data
can get lost? People bound by professional secrecy (§ 203 StGB: practices, law
firms) need an answer that holds up, not a pragma that looks like security.

Until 2.10 the answer was no. The first version of this document (5 September
2026) found that the database lay on disk as plaintext, that `PRAGMA key`
silently did nothing on `node:sqlite`, and that the key seam in the core was
asked but never awaited. Since 2.11 the answer is yes.

## What K3PTA does

| Part | Choice | Why |
|---|---|---|
| Engine | SQLite3 Multiple Ciphers via `better-sqlite3-multiple-ciphers` 12.11.1 (pinned) | `node:sqlite` cannot open an encrypted file, and the cipher cannot be loaded as an extension — it lives inside SQLite's page cache |
| Format | SQLCipher 4 (`cipher = 'sqlcipher'`, `legacy = 4`): AES-256 per page, HMAC-SHA512 per page | Open and documented: with the key, any SQLCipher tool opens the file — no lock-in. Tampered pages fail the HMAC instead of being read |
| Key | 256 random bits, used as a raw key (`x'…'`) | No password, so no key derivation that slows every start; opening costs about 0.1 ms more |
| Key storage | macOS Keychain · Windows DPAPI · Linux Secret Service · `KEPTA_DB_KEY` for headless installs | The key never lies on disk in plaintext; the app and the MCP server read the same entry |
| Scope | The whole file, including the WAL | Search (FTS5, vectors) keeps working — field-level encryption would have broken it |

## Findings

| # | Finding | Evidence |
|---|---|---|
| 1 | Without a key (tests, `KEPTA_ENCRYPTION=off`) the file is plaintext — the marker is readable in the database and the WAL. | test "Befund 1", `eval:crypto` [1] |
| 2 | With a key, neither the file nor the WAL contains the marker, before or after a checkpoint; the file does not start with the SQLite header. | test "Befund 2", `eval:crypto` [2] |
| 3 | A plain SQLite — including K3PTA 2.10 — cannot read the file: "file is not a database". | test "Befund 4" |
| 4 | A wrong key opens nothing and changes nothing (the file's hash is unchanged); a missing key on an encrypted file stops the start instead of opening an empty brain. | `store-verschluesselung.test.ts` |
| 5 | An existing plaintext base is converted only when K3PTA has it to itself; every table keeps its rows, the integrity check says "ok", the search finds everything. If another program has the file open, the file stays as it was and the status says why. | `store-verschluesselung.test.ts` |
| 6 | A program that still held the old file open during the conversion finds only zeros afterwards — it cannot keep writing to an orphaned plaintext file. | `store-verschluesselung.test.ts` |
| 7 | Cost on this machine: opening 0.5 ms without a key, 0.6–0.65 ms with it (median of 30); converting 2,000 notes (1.3 MB) takes 39 ms. The 11.9. run measured 0.48/0.59 ms and 28 ms — the difference is machine load, not the cipher. | `eval:crypto` [3], [4] |

## Limits (honest)

- **Same user account:** malware, or anyone using your logged-in account, can
  ask the keychain for the key exactly as K3PTA does.
- **A running K3PTA** serves decrypted knowledge over its local API, as before.
- **Files next to the database:** since 2.13.4 `profile.json`,
  `scan-config.json` and the sync journal use the same key as the knowledge
  base (AES-256-GCM per file or per line — `src/core/nebendateien.ts`;
  plaintext files from older versions are read and re-encrypted on the next
  write). Two deliberate exceptions stay readable: `endpoint.json` (port, PID,
  start time — no secret, and how local tools find the server) and the inbox
  folder (files the user put there themselves, like the Markdown export).
  Exports the user makes are plaintext by design.
- **Remnants from before 2.11:** old backups, snapshots and SSD blocks of the
  plaintext file. Full-disk encryption (FileVault, BitLocker, LUKS) covers them;
  it is still the recommended layer underneath.
- **Losing the key loses the data.** SECURITY.md shows how to keep a copy.

## Rejected options

1. **Field-level encryption** (encrypting title and content in the app):
   FTS5 and embeddings cannot search ciphertext; searchable encryption would need
   deterministic encryption plus an encrypted index — weaker and much more work
   than encrypting the pages.
2. **Only full-disk encryption:** leaves every copy of the file readable the
   moment it leaves the disk (a backup, a synced folder, an e-mail attachment).
3. **A password:** a daily prompt that people work around, and a key derivation
   that slows every start. A random key in the keychain is stronger than most
   passwords and costs nothing.
