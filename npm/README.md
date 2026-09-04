# kepta-mcp

**Local memory for AI agents, over MCP.** One SQLite file on your own machine — no cloud, no account, no subscription.

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

## Requirements

**Node 22.5 or newer.** The package has no dependencies at all — it uses `node:sqlite`, which arrived in 22.5.

Search works immediately. Install [Ollama](https://ollama.com) and `ollama pull nomic-embed-text` if you also want it to find notes that say the same thing in different words.

## The app and the Python client

This package is the MCP server on its own — enough for an agent, with no window.

The **desktop app** for macOS, Windows and Linux adds a UI, the knowledge graph with its time slider, file and Obsidian import, and a chat: [Releases](https://github.com/DamianTodorovic/kepta/releases).

For Python there is `pip install kepta`.

The package is called `kepta-mcp` because npm refuses the bare name `kepta` as too close to an existing package. The command it installs is `kepta`.

Both share the same `~/.kepta/kepta.db`. What one writes, the others see.

## License

MIT — the whole source is at [github.com/DamianTodorovic/kepta](https://github.com/DamianTodorovic/kepta).
