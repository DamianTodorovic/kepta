# Security Policy

## Reporting

Please report vulnerabilities through a private issue or by email to the owner. No public exploit before a fix exists.

## Hardening in place

- helmet, rate limiting, 1 MB JSON cap, CORS restricted to localhost, SSRF blocking, XSS sanitising, path-traversal checks, ETag + compression
- Electron: `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, CSP

Scope: the local server on `localhost:3000`, the file watcher on `~/.kepta/inbox`, and MCP over stdio.

## Not in scope

The release binaries are **not code-signed or notarised**. That is a known and documented gap, not a vulnerability — see the release notes for how to approve the app on first launch.
