# Security Policy

## Reporting

Please report vulnerabilities privately through GitHub: [Security → Report a vulnerability](https://github.com/DamianTodorovic/kepta/security/advisories/new). No public exploit before a fix exists.

## Hardening in place

- Only this computer: the HTTP API refuses requests whose `Host` header does not name this machine (DNS rebinding) and requests from other websites that would change anything (cross-site requests); changes additionally require the write gate to pass when enabled
- helmet, rate limiting, 1 MB JSON cap, CORS restricted to localhost, SSRF blocking, XSS sanitising, path-traversal checks, ETag + compression
- error answers are JSON only — no stack trace, no absolute path, no echo of the body you sent; from `500` up the real reason goes to the server log, not to the caller
- `GET /api/settings` masks secret-shaped values (`…key`, `…token`, `…secret`, `…password`, `…passphrase`, and the `ai_settings` blob) as `{gesetzt, ende}`; the full value stays inside the encrypted database

## Environment variables

Three switches can undo what the section above promises. They are listed here because a
operator has to be able to find them; the full table with defaults is
[docs/ENVIRONMENT.md](docs/ENVIRONMENT.md).

| Variable | Effect on safety |
|---|---|
| `KEPTA_HOST` | Binds the API to another address. **The API has no authentication.** Set to a network address, the additional `Host` check is dropped by design (`src/herkunft.ts`), and every machine that can reach the port can read every note, write notes, delete them and read the settings — the loopback guarantee below is then over, and malware on your own machine is no longer the only reader. Do not use it to serve KEPTA to another machine: put a reverse proxy in front of `127.0.0.1`, give *it* the TLS, the login and the firewall rule, and keep KEPTA on loopback. |
| `KEPTA_ENCRYPTION=off` | The store gets no key: the database is written in **plaintext**. Since 10.10.2026 this is the *only* way to an unencrypted file, and it is a decision, not a fallback — intended for tooling that must open raw SQLite. It is not a fix for a key problem: on an encrypted file it produces an unreadable error instead. Never the way to get a container started; that is what `KEPTA_DB_KEY` is for. |
| `KEPTA_MAX_ACTIVE` | How many active notes the local API accepts before it answers `429` on a *new* note (default **5000**, read per request, so no restart is needed to raise it). Reads, searches, updates, imports and backups are not refused by it. It is a brake on a runaway agent filling your memory, not a licence limit and not a paywall — the free core has no locked feature. |
| `KEPTA_DB_KEY` | The key for machines without a keychain: 64 hex characters, `openssl rand -hex 32`. Since 10.10.2026 it is the **condition** for creating a database there — no usable key, no file, a non-zero exit and a message naming the variable. An **empty** value is not "unset": it is dropped and the keychain is asked anyway, so on your own machine that reaches the entry you meant to leave alone. Generate once, store it with the rest of your secrets, pass the same value every time; a valid but foreign key on an existing file stops and changes nothing. |

## Encryption at rest

From 2.11 on — and in every fresh install since, out of the box, with no switch to find — the
knowledge base (`~/.kepta/kepta.db`) is encrypted: SQLCipher 4
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

In two sentences, for anyone who does not read the rest of this file: your notes
live in one file that is random bytes without your key, and the key lives in your
operating system's own secret store and leaves it nowhere on its own. While KEPTA
is running, any program under your account can ask the open local API for the
decrypted contents — the same as it can read a document you have open on screen.

**No key, no file — the rule since 10.10.2026.** A container and a headless server have
no keychain, so their key comes from `KEPTA_DB_KEY`. When KEPTA would have to **create** a
knowledge base and has nowhere safe to put the key — no keychain, a denied approval, CI
with an empty environment — it does not create the file: the run stops with a non-zero
exit and the message names the way out. Opening an existing database is unchanged; there
a valid but foreign key stops and changes nothing, as it always did.

The one remaining door to plaintext is the switch that says so out loud,
`KEPTA_ENCRYPTION=off`. Deliberate, because tooling sometimes has to open raw SQLite — but
a decision, not an accident: a database made that way is readable by anyone who can read
the file. What the rule above closes is the accident that came before it: in builds before
10.10.2026 an **unusable** value (a placeholder copied out of an install guide, too short,
not hex) printed one line, created the database in **plaintext** and exited 0. So
"encrypted" in a KEPTA sentence is only a claim about a store whose key really was valid —
check the startup line, or `GET /api/health` on the server run from this repository, and
test an older build instead of trusting this paragraph.

**What it does not protect against:**
- Malware, or another person, using your logged-in account. They can ask the
  keychain for the key the same way KEPTA does.
- A running KEPTA: the local API (`127.0.0.1`, no authentication) serves the
  decrypted knowledge to programs on the same machine, as before. What it no
  longer serves is the AI provider key: secret-shaped settings come back masked
  (`{gesetzt, ende}`), so the file is the reader and the API caller is not handed
  a second credential to carry off.
- The same API reached from outside, if `KEPTA_HOST` was set. See "Environment
  variables" above — that one switch ends the "only this computer" line.
- Files outside the database: the inbox folder, `profile.json`, the sync
  journal (`*.jsonl`) and `endpoint.json`. A host that wires the optional
  `LocalFileAuditSink` adds a plaintext `audit.jsonl` to that list — see
  "Audit" below. Exports you make yourself (Markdown export) are plaintext;
  Device Sync bundles are encrypted separately with their own passphrase.
- Plaintext left behind by versions before 2.11: backups and snapshots of the
  old file, and blocks an SSD has not overwritten yet. Delete old backups, and
  use full-disk encryption (FileVault, BitLocker, LUKS) — it covers everything
  above that sits on the disk. Snapshots the core makes itself before a
  confirmed full replace (`<data folder>/backup/kepta-pre-replace-<timestamp>.db`)
  are encrypted like the database but they stay on disk, one per swap —
  keeping or cleaning that folder is yours.

**Keep a copy of the key.** It never leaves the keychain on its own; if the
keychain is lost (a fresh system, a new Windows account), a restored
`kepta.db` cannot be opened. Store the key in a password manager — the easiest
way is from a terminal:

- macOS: `security find-generic-password -s app.kepta.database -a kepta -w`
- Linux: `secret-tool lookup service app.kepta.database account kepta`
- Windows (PowerShell): `Add-Type -AssemblyName System.Security; [Text.Encoding]::ASCII.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String((Get-Content "$env:USERPROFILE\.kepta\database-key.dpapi")), $null, 'CurrentUser'))`

To restore on a new machine, put the key back before the first start — macOS:
`security add-generic-password -s app.kepta.database -a kepta -w <key>` — or
start KEPTA once with `KEPTA_DB_KEY=<key>`.

**A dialog you were not told about.** The first time KEPTA reaches for the key
after an install — or after a second app starts using the same keychain entry —
macOS can ask whether it may access the item, with the usual *allow once / always
allow / deny* choices. That is not KEPTA phoning home: it is the same `security`
command above, reading KEPTA's own entry. Allow it, and the permanent allow so it
never asks again. Denying is not a safe "no": KEPTA then cannot read the key, and
depending on how the read failed you get the "key exists but unreadable" stop
rather than a working memory. On Linux the same moment can appear as a Secret
Service prompt from `secret-tool`. Nothing in this repository asks for a key it
did not create.

Reading the entry with the commands above needs `-s` for the **service**
(`app.kepta.database`) and `-a` for the **account** (`kepta`) — swapping them finds
nothing and exits 44, which the core reads as "no key yet" and answers by creating
a second one. That is why the failing read is the dangerous one, and why an unreadable
existing entry is never overwritten (`src/core/schluessel.ts`).

Scope: the local server on `localhost:3000` including `POST /mcp`, the file watcher on `~/.kepta/inbox`, and MCP over stdio.

## Scope "private" — disclosure default, not access control

In one sentence, because two documents used to say more than this: **`private`
keeps a note away from AI channels; it does not protect it from programs running
on your machine.**

A memory saved with `scope: "private"` never reaches an agent: not the eight MCP
tools over stdio, not `POST /mcp`, not the four HTTP mirrors
`/api/mcp/{search,save,consolidate,forget}`. On those channels a private note is
indistinguishable from one that does not exist — same wording, same status code,
also when an agent was handed the id some other way.

The owner channels are deliberately not filtered: `GET /api/memories`,
`GET /api/memories/search`, `POST /api/search`, `GET /api/graph`, export and
Device Sync. The same routes feed the desktop app, where the owner reads and
searches their own private notes — filtering below that line would make the app
blind. "private" is therefore an agent/owner separation, **not** protection
against a local process: anything running as your user can open the database
with the system key and see everything, private included. Same boundary as
"Encryption at rest" above.

## Audit

`store.audit()` fires on read, write, update, delete, search, export and egress.
Inside the core it only reaches `KeptaExtensions.audit`, and the free default is
`NOOP_SINK`: the core writes no journal. A plaintext list of titles and access
patterns sitting next to an SQLCipher database would weaken exactly the promise
the database exists to keep.

Journals are the host's decision, and the seam is public:

- `LocalFileAuditSink` (append-only JSONL, plaintext — see "Files outside the
  database" above). Pass it as `extensions.audit` when constructing a `KeptaStore`.
- The desktop app keeps its audit chain in the encrypted database instead, one
  hash over the previous entry per row; the enterprise deployment writes
  per-tenant JSONL chains. Both consume this same event shape.

## Not in scope

KEPTA ships as source and npm package — nothing to code-sign; whatever you run, you can read.
