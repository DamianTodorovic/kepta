# KEPTA — Local-first memory for AI agents

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-311%20passing-brightgreen)]()
[![MCP](https://img.shields.io/badge/MCP-8%20tools-purple)]()
[![Coverage gate](https://img.shields.io/badge/coverage%20gate-%E2%89%A5%2092%25%20of%20lines-brightgreen)]()

Your AI assistant forgets you like a goldfish. Every chat starts from zero.

KEPTA fixes that — **locally**. One encrypted SQLite file on your machine. No cloud, no account, no telemetry. Your assistant reads and writes it over **MCP** (Claude Desktop, Cursor, any MCP client) or a small **HTTP API**.

> **This is the headless core** (the open-source 20 %): the memory engine, the MCP server, the HTTP API. The full desktop application — GUI, knowledge graph with time travel, chat cockpit, machine scan, sync — lives in the private **KEPTA Enterprise** repository.

## Quickstart

**1. Run the MCP server** (Claude Desktop / Cursor / any MCP client):

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

8 tools: `memory_search`, `memory_save`, `memory_update`, `memory_delete`, `memory_list`, `memory_graph`, `memory_consolidate`, `memory_forget`.

**2. Or run the HTTP API:**

```bash
npm install && npm run dev
# → http://127.0.0.1:3000
curl -s localhost:3000/api/memory -H 'Content-Type: application/json' \
  -d '{"title":"Client Müller","content":"Quarterly billing, prefers short answers.","tags":["client"]}'
curl -s "localhost:3000/api/memories/search?q=how+does+müller+bill"
```

29 routes serve the memory API — CRUD, hybrid search, settings, repair, MCP.
```

**3. Or Docker** (MCP server only):

```bash
docker build -t kepta-mcp . && docker run -e KEPTA_DB_KEY=<64-hex> -v kepta-data:/data kepta-mcp
```

## What's inside

**311 tests** Every one of them in the repo, guarded by a coverage gate.

- **Encrypted at rest** — SQLCipher 4 (AES-256, HMAC-SHA512 per page, WAL included). The key lives in your OS keychain (macOS Keychain / Windows DPAPI / Secret Service), never on disk. See [SECURITY.md](SECURITY.md).
- **Hybrid search** — BM25 full-text + vectors (Ollama, optional) + entity matches, fused by Reciprocal Rank Fusion.
- **Memory types & time travel** — facts/events/how-tos/documents with validity windows (`valid_from`/`valid_to`), supersede chains instead of contradictions, `asOf` queries ("what did I know back then?").
- **Repair** — `/api/repair/imports` re-extracts documents whose import predates parser fixes.
- **MCP-first** — one code path for the API and the MCP server; agents get exactly what the store has.
- **Benchmark included** — `npm run eval` runs a retrieval eval on a fixed corpus: 58 notes / 45 queries, Hit@1 + Precision@5 + MRR.

## The 80 %

This repository is deliberately small: the memory engine that agents use. The desktop application with the full interface — knowledge graph, preview panels, grouping, chat cockpit, machine scan, sync — is the commercial KEPTA Enterprise build.


| Area | Threshold (enforced by CI) |
|---|---|
| everything together | **92 %** of lines · **95 %** of functions · 78 % branches · 90 % statements |
| `src/core` | **97 %** of lines · **100 %** of functions · 78 % branches · 94 % statements |

## License

[AGPL-3.0-or-later](LICENSE). Commercial licensing for the core is available on request.
