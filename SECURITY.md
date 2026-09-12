# Security Policy

## Reporting

Please report vulnerabilities through a private issue or by email to the owner. No public exploit before a fix exists.

## Hardening in place

- helmet, rate limiting, 1 MB JSON cap, CORS restricted to localhost, SSRF blocking, XSS sanitising, path-traversal checks, ETag + compression
- Electron: `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, CSP

## Encryption at rest

Since 2.11 the knowledge base (`~/.kepta/kepta.db`) is encrypted: SQLCipher 4
format through SQLite3 Multiple Ciphers — AES-256 for every page, an
HMAC-SHA512 over every page, a random 256-bit key. The key is created on the
first start and stored in the system keychain: the macOS Keychain (service
`app.kepta.database`, account `kepta`), Windows DPAPI (`database-key.dpapi` in
the data folder, readable only under the same Windows account) or the Secret
Service on Linux. Headless installs use `KEPTA_DB_KEY` (64 hex characters),
which is weaker: the key then sits in the process environment. The settings,
including the AI provider key, live inside the encrypted file.

**What it protects against:** anyone who gets the file — a copy, a backup, a
synced folder, a disk taken out of the machine. Without the key the file is
random bytes; SQLite reports "file is not a database".

**What it does not protect against:**
- Malware, or another person, using your logged-in account. They can ask the
  keychain for the key the same way KEPTA does.
- A running KEPTA: the local API (`127.0.0.1`, no authentication) serves the
  decrypted knowledge to programs on the same machine, as before.
- Files outside the database: the inbox folder, `profile.json`,
  `scan-config.json`, the audit and sync journals (`*.jsonl`) and
  `endpoint.json`. Exports you make yourself (Markdown export) are plaintext;
  Device Sync bundles are encrypted separately with their own passphrase.
- Plaintext left behind by versions before 2.11: backups and snapshots of the
  old file, and blocks an SSD has not overwritten yet. Delete old backups, and
  use full-disk encryption (FileVault, BitLocker, LUKS) — it covers everything
  above that sits on the disk.

**Keep a copy of the key.** It never leaves the keychain on its own; if the
keychain is lost (a fresh system, a new Windows account), a restored
`kepta.db` cannot be opened. Store the key in a password manager — the easiest
way is the interface (`npx kepta-mcp ui`): click *Encrypted at rest* in the
sidebar → *Show recovery key* → *Copy*. Or from a terminal:

- macOS: `security find-generic-password -s app.kepta.database -a kepta -w`
- Linux: `secret-tool lookup service app.kepta.database account kepta`
- Windows (PowerShell): `Add-Type -AssemblyName System.Security; [Text.Encoding]::ASCII.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String((Get-Content "$env:USERPROFILE\.kepta\database-key.dpapi")), $null, 'CurrentUser'))`

To restore on a new machine, put the key back before the first start — macOS:
`security add-generic-password -s app.kepta.database -a kepta -w <key>` — or
start KEPTA once with `KEPTA_DB_KEY=<key>`.

Scope: the local server on `localhost:3000`, the file watcher on `~/.kepta/inbox`, and MCP over stdio.

## Not in scope

The release binaries are **not code-signed or notarised**. That is a known and documented gap, not a vulnerability — see the release notes for how to approve the app on first launch.
