# kepta-mcp

**Local memory for AI agents, over MCP.** One SQLite file on your own machine — no cloud, no account, no subscription. The store is never synced anywhere; what an agent then puts into a prompt travels wherever that agent's model runs.

Your assistant forgets you after every chat. KEPTA remembers: Claude Desktop, Cursor and any other client that speaks the Model Context Protocol read and write the same memory, and it never leaves your computer.

## Use it

Add this to your MCP client's configuration. Nothing to clone, nothing to build:

```json
{
  "mcpServers": {
    "kepta": { "command": "npx", "args": ["-y", "kepta-mcp"] }
  }
}
```

For Claude Desktop that file is `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS. In Cursor: *Settings → Features → MCP*. Restart the client afterwards.

That is the whole setup. The memory lives in `~/.kepta/kepta.db` and is created on first use.

## Your memory in the browser

```bash
npx -y kepta-mcp ui
```

Opens KEPTA Core on `http://127.0.0.1:4747`: browse by kind and tag, search ranked by relevance, read notes and follow their `[[links]]`, write and edit notes, trash and restore them — on the same encrypted file your agents use. `--port 5000` picks another port, `--no-open` keeps the browser closed.

## The eight tools your agent gets

| Tool | What it does |
|---|---|
| `memory_search` | Hybrid retrieval: full text, vectors and knowledge graph, fused by Reciprocal Rank Fusion |
| `memory_save` | Store a fact, with type, scope, validity window and confidence |
| `memory_update` | Change an existing memory |
| `memory_delete` | Move to the trash |
| `memory_list` | Filter by type, scope or tags |
| `memory_graph` | Entities and the relations between them |
| `memory_consolidate` | Find near-duplicates and merge them by superseding, never deleting |
| `memory_forget` | Let a memory expire, or mark it replaced by a newer one |

Protocol `2026-07-28`, backwards compatible with `2025-06-18` and `2024-11-05`. Every tool ships an `outputSchema` and returns `structuredContent`.

## Why memories age

Each entry carries a validity window and a confidence score. Move house, and the new address supersedes the old one: the old is downweighted to 40 % and kept as history rather than deleted. Expired facts drop to 50 %. Your agent stops answering with things that stopped being true.

## Docker

```bash
docker build -t kepta-mcp .
docker run --rm -i -v kepta-data:/data kepta-mcp
```

The server speaks stdio, so `-i` is required. The database lives in the `kepta-data` volume and survives restarts. A container has no keychain, so the database stays unencrypted unless you pass a key: `-e KEPTA_DB_KEY=$(openssl rand -hex 32)` — keep that value, it is the only way back into the volume.

## Requirements

**Node 22.13 or newer.** The package has one dependency: SQLite with encryption (`better-sqlite3-multiple-ciphers`), which npm installs prebuilt for Node 22, 24 and 26 on macOS, Windows and Linux — elsewhere it needs a C++ toolchain to build.

The knowledge base is encrypted on disk (SQLCipher 4 format, AES-256). The key is created on the first start and kept in the system keychain — macOS Keychain, Windows DPAPI or the Linux Secret Service (`secret-tool`); the desktop app uses the same one. Without a keychain, set `KEPTA_DB_KEY` to 64 hexadecimal characters. Keep a copy of the key: without it a restored database cannot be opened. [SECURITY.md](https://github.com/DamianTodorovic/kepta/blob/main/SECURITY.md#encryption-at-rest) shows how.

Search works immediately. Install [Ollama](https://ollama.com) and `ollama pull nomic-embed-text` if you also want it to find notes that say the same thing in different words.

## The app and the Python client

This package is the MCP server on its own — enough for an agent, with no window.

**KEPTA Enterprise** is the full desktop app for macOS, Windows and Linux on top of this same encrypted memory: the knowledge graph with Force and Tree views and a time slider, drag & drop import for PDFs, Markdown, Obsidian vaults and web pages, a scan of your own computer with a preview first, and a chat cockpit with the model you choose. 14-day free trial, then an offline license key. Want it? [Write to me on LinkedIn](https://www.linkedin.com/in/damian-todorovic-244235434).

For Python there is `pip install kepta`.

The package is called `kepta-mcp` because npm refuses the bare name `kepta` as too close to an existing package. The command it installs is `kepta`.

Both share the same `~/.kepta/kepta.db`. What one writes, the others see.

## License

[AGPL-3.0-or-later](https://github.com/DamianTodorovic/kepta/blob/main/LICENSE) — the same license as the source at [github.com/DamianTodorovic/kepta](https://github.com/DamianTodorovic/kepta). Using the server for your own agents is free and needs nothing from you. If you change it and offer it to others — as a service, too — share your changes under the same license. A commercial license is available: [write to me on LinkedIn](https://www.linkedin.com/in/damian-todorovic-244235434).
