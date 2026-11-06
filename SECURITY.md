# Security Policy

## Reporting

Please report vulnerabilities privately to Damian Todorovic via [LinkedIn](https://www.linkedin.com/in/damian-todorovic-244235434). No public exploit before a fix exists.

## Hardening in place

- Only this computer: the HTTP API refuses requests whose `Host` header does not name this machine (DNS rebinding) and requests from other websites that would change anything (cross-site requests) — `tests/herkunft.test.ts:66` smuggles a note from a sandboxed frame and nothing lands, `:76` reads behind a foreign `Host` and gets nothing, live stream included, while `:85` keeps the window, local dev servers, scripts and MCP clients working and `:101` allows a network `Host` only once `KEPTA_HOST` asks for it
- helmet, rate limiting, 1 MB JSON cap, CORS restricted to localhost, SSRF blocking, XSS sanitising, path-traversal checks, ETag + compression
- Electron: `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, CSP

## Encryption at rest

Since 2.11 the knowledge base (`~/.kepta/kepta.db`) is encrypted: SQLCipher 4
format through SQLite3 Multiple Ciphers — AES-256 for every page, an
HMAC-SHA512 over every page, a random 256-bit key (`tests/core/store-verschluesselung.test.ts:76` reads the raw file and finds ciphertext from the first page, WAL included; `:91` demands exactly 256 bits — a shorter key opens nothing). The key is created on the
first start and stored in the system keychain: the macOS Keychain (service
`app.kepta.database`, account `kepta`), Windows DPAPI (`database-key.dpapi` in
the data folder, readable only under the same Windows account) or the Secret
Service on Linux. Headless installs use `KEPTA_DB_KEY` (64 hex characters),
which is weaker: the key then sits in the process environment. The settings,
including the AI provider key, live inside the encrypted file. The three keychain paths are covered by
`tests/core/schluessel.test.ts` — `:101` reads a Windows entry through the injected command runner
with the path passed in the environment, `:111` proves the key never sits in the argument list, `:152`
checks that a `win32` host is handed "Windows DPAPI". Those cases replace the system command, so what
is proven here is K3PTA's own side of the call; the round-trip against a real Keychain, DPAPI or
Secret Service runs only on that operating system.

**What it protects against:** anyone who gets the file — a copy, a backup, a
synced folder, a disk taken out of the machine. Without the key the file is
random bytes; SQLite reports "file is not a database".

**What it does not protect against:**
- Malware, or another person, using your logged-in account. They can ask the
  keychain for the key the same way K3PTA does.
- A running K3PTA: the local API (`127.0.0.1`, no authentication) serves the
  decrypted knowledge to programs on the same machine, as before.
- Files outside the database: since 2.13.4, `profile.json`,
  `scan-config.json` and the sync journal are encrypted with the same
  256-bit key as the knowledge base (AES-256-GCM; plaintext files from older
  versions are understood on read and encrypted on the next write). Two
  deliberate exceptions: `endpoint.json` (port, PID, start time — no secret,
  and the discovery mechanism for local tools) and the inbox folder with its
  archive (files you dropped there yourself — user property, like the
  Markdown export; full-disk encryption covers them). The sealed audit log
  lives inside the encrypted database. Exports you make yourself are
  plaintext; Device Sync bundles are encrypted separately with their own
  passphrase.
- Plaintext left behind by versions before 2.11: backups and snapshots of the
  old file, and blocks an SSD has not overwritten yet. Delete old backups, and
  use full-disk encryption (FileVault, BitLocker, LUKS) — it covers everything
  above that sits on the disk.

**Keep a copy of the key.** It never leaves the keychain on its own — what that
means is checked, not promised: `tests/core/schluessel.test.ts:111` reads the
argument list of every launch and finds the key absent there (it travels in the
child's environment, never in argv), and `tests/keine-telemetrie.test.ts` counts
the addresses that ship at all: 26 over 20 hosts, each either a provider endpoint
you chose yourself or a named placeholder in a comment. If the keychain is lost
(a fresh system, a new Windows account), a restored `kepta.db` cannot be opened.
Store the key in a password manager — the easiest
way is *Settings → System status → Show recovery key → Copy* in the app. Or
from a terminal:

- macOS: `security find-generic-password -s app.kepta.database -a kepta -w`
- Linux: `secret-tool lookup service app.kepta.database account kepta`
- Windows (PowerShell): `Add-Type -AssemblyName System.Security; [Text.Encoding]::ASCII.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String((Get-Content "$env:USERPROFILE\.kepta\database-key.dpapi")), $null, 'CurrentUser'))`

To restore on a new machine, put the key back before the first start — macOS:
`security add-generic-password -s app.kepta.database -a kepta -w <key>` — or
start K3PTA once with `KEPTA_DB_KEY=<key>`.

Scope: the local server on `localhost:3000`, the file watcher on `~/.kepta/inbox`, and MCP over stdio.

## Not in scope

The release binaries are **not code-signed or notarised**. That is a known and documented gap, not a vulnerability — see the release notes for how to approve the app on first launch.
