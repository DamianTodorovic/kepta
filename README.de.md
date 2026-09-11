# KEPTA (Core) — deutsches Readme

Dein KI-Assistent vergisst alles. Jeder Chat beginnt bei null.

KEPTA ändert das — **lokal**. Eine verschlüsselte SQLite-Datei auf deinem Rechner. Keine Cloud, kein Konto, keine Telemetrie. Dein Assistent liest und schreibt sie über **MCP** (Claude Desktop, Cursor, jeder MCP-Client) oder eine kleine **HTTP-API**.

> **Dies ist der Headless-Core** (die offenen 20 %): Memory-Engine, MCP-Server, HTTP-API. Die vollständige Desktop-Anwendung — grafische Oberfläche, Wissensgraph mit Zeitreise, Chat, Rechner-Scan, Sync — liegt im privaten **KEPTA Enterprise**-Repository.

## Schnellstart

**1. MCP-Server** (Claude Desktop / Cursor / jeder MCP-Client):

```json
{
  "mcpServers": {
    "kepta": {
      "command": "npx",
      "args": ["-y", "kepta-mcp"]
    }
  }
}
```

**2. HTTP-API:**

```bash
npm install && npm run dev
# → http://127.0.0.1:3000
```

**3. Docker** (nur MCP-Server): `docker build -t kepta-mcp .`

[![Tests](https://img.shields.io/badge/tests-311%20passing-brightgreen)]()
[![Coverage gate](https://img.shields.io/badge/coverage-70%25-lines-brightgreen)]()

**Zahlen:** **311 tests** · 29 Routen · `npm run eval` — Eval auf 58 Notizen / 45 Anfragen (Hit@1, Precision@5, MRR).

## Verschüsselt at rest

**311 tests**

SQLCipher 4 (AES-256, HMAC-SHA512 je Seite, WAL eingeschlossen). Der Schlüssel liegt im Schlüsselbund des Betriebssystems, nie im Klartext auf der Platte. Details in [SECURITY.md](SECURITY.md).

## Lizenz

[AGPL-3.0-or-later](LICENSE). Kommerzielle Core-Lizenzierung auf Anfrage.

| Bereich | Schwellen (von CI erzwungen) |
|---|---|
| alles zusammen | **70 %** der Zeilen · **72 %** der Funktionen · 56 % Branches · 66 % Statements |
| `src/core` | **87 %** der Zeilen · **89 %** der Funktionen · 74 % Branches · 85 % Statements |
