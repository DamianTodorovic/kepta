# Security Policy

## Reporting
Bitte melde Sicherheitslücken per Issue (privat) oder E-Mail an den Owner. Kein öffentlicher Exploit vor Fix.

## Gehärtet
- helmet, rate-limit, 1 MB JSON, CORS nur localhost, SSRF-Block, XSS-Sanitize, Path-Traversal-Check, ETag+compression
- Electron: nodeIntegration:false, contextIsolation:true, sandbox:true, CSP

Scope: lokaler Server `localhost:3000`, File-Watcher `~/.kepta/inbox`, MCP stdio.
