# K3PTA — Security & Enterprise Deployment Notes

*For procurement, IT departments and security review. App 3.1.5 · engine 3.2.0 on npm, October 2026.*
*German-speaking organizations: the same content applies verbatim — the architecture has no cloud component to audit.*

## 1. Where the data lives

- The entire knowledge base is **one file** (default `~/.kepta/kepta.db`) in **SQLCipher 4 format**: AES-256 plus an HMAC-SHA512 page authentication code, write-ahead log included.
- The database key is generated locally and stored in the **operating system keychain** (macOS Keychain / Credential Manager / Secret Service). It never touches the disk next to the file and is never served to agents or models.
- A **recovery key** (Settings → System status) can be stored in the user's password manager to open the file on a new machine.
- **Cloud exposure is opt-in per request.** The app and its server listen on `127.0.0.1` only. Nothing is uploaded unless the user configures a cloud model in Chat; the **privacy shield** replaces emails, phone numbers, IBANs, card numbers, passwords and keys with placeholders before any such request, and private notes are excluded entirely.

## 2. What leaves the machine — the complete list

1. Chat requests to a model provider **you** configured (content shielded as above), or local models: nothing.
2. Nothing else. No telemetry, no crash reporting, no license phone-home, no update beacon.

## 3. License system

- Licenses are **Ed25519 signatures** over the licensee name, license number, edition and seat count, Base32-encoded. Validation happens **fully offline** in the app; there is no license server and no activation call.
- Revocation: a license number placed on the public revocation list in an update stops working everywhere, including already-activated machines.
- **MDM pre-provisioning:** IT deploys `managed-settings.json` (see §5) containing the license; the app validates it offline at start. Nothing is typed, nothing transmitted.

## 4. Access control and audit

- The desktop shell is hardened: no Node in the renderer, sandbox on, strict Content-Security-Policy, context isolation, no navigation away from the app surface.
- The embedded HTTP server listens on `127.0.0.1` only and accepts requests from this computer only: a request whose `Host` header does not name this machine is refused (protection against DNS rebinding), and a request from another website that would change anything is refused (protection against cross-site requests). It applies rate limiting, Helmet headers and input validation on all routes.
- The HTTP API has **no user authentication**: any program running under the same operating-system account can use it — the same trust boundary as the keychain entry that holds the database key.
- The **sealed audit log** records every access to the knowledge base — by the user, by each AI app, by scripts — with each entry chained to the SHA-256 of its predecessor. *Check integrity* proves whether anything was altered or removed. Export as CSV.
- Write gate (opt-in): a local model classifies every agent write as ADD/UPDATE/DELETE/NOOP before it lands.

## 5. Managed deployment (MDM / air-gapped)

Deploy one file, pre-provision the license and enforce policy:

- macOS: `/Library/Application Support/KEPTA/managed-settings.json`
- Linux: `/etc/kepta/managed-settings.json`
- Windows: `%PROGRAMDATA%\KEPTA\managed-settings.json`
- or point `KEPTA_MANAGED_CONFIG` at any path

```json
{
  "license_name": "Mandels Kanzlei",
  "license_key": "AAAAA-BBBBB-…",
  "richtlinien": {
    "chat_cloud": "deny",
    "machine_scan": "deny",
    "privacy_shield": "force_on"
  }
}
```

Enforcement (verified by the test suite):

| Policy | Effect |
|---|---|
| `chat_cloud: "deny"` | Chat requests to non-local hosts are rejected; local models (Ollama, LM Studio) keep working |
| `machine_scan: "deny"` | The computer scan refuses to start |
| `privacy_shield: "force_on"` | The shield cannot be switched off |

A licence field in this file is **ignored by the downloadable app**, which has had no key to
validate since 09.10.2026: the reader keeps exactly the three policies and the team roles
(`tests/richtlinien.test.ts:106` keeps the policies beside old licence fields, `:122` treats a
key-only file as no policy at all), and no path of the app reads a key
(`tests/keine-grenzen.test.ts:102` — the licence route answers neither read nor write, `:116` —
nothing in the surface calls it). A missing or corrupt file changes nothing; the app falls back to
normal behavior.

Enterprise editions (`business`, `enterprise`) are encoded in the signed license; every tier unlocks the same app today — team features ship as free updates during the license year.

## 6. Supply chain and updates

- Installers are ad-hoc signed. The public release carries the macOS arm64/x64 DMGs and zips together with electron-builder's `latest-mac.yml`, whose **SHA-512 digests** are the published integrity values — there are no separate checksum files, and no Windows or Linux installer is published.
- Source maps never ship: the app build excludes `**/*.map` (`electron-builder.json`), and neither the app bundle nor the npm artifacts contain a `sourceMappingURL`. The app's server bundle is minified.
- The engine (all retrieval, storage, MCP code) is **source-available under BUSL-1.1** and auditable — every line readable, running it free including in production, each release converting to AGPL-3.0-or-later four years after release. It is deliberately not called open source: BUSL-1.1 is not an OSI-approved licence. The desktop application is proprietary.

## 7. Contact

Security questions, review copies and pilot deployments: Damian Todorovic — [LinkedIn](https://www.linkedin.com/in/damian-todorovic-244235434).
