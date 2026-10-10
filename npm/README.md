# kepta-mcp

**Local memory for AI agents, over MCP.** One SQLite file on your own machine — no cloud, no account, no subscription. The store is never synced anywhere; what an agent then puts into a prompt travels wherever that agent's model runs.

Your assistant forgets you after every chat. KEPTA remembers: Claude Desktop, Cursor and any other client that speaks the Model Context Protocol read and write the same memory, and it never leaves your computer.

**The licence, up front: BUSL-1.1, source-available, not OSI-approved open source.** Run it in production inside your own company, for as many agents as you like, free, with no key and nothing to report — the one thing reserved is offering this server itself to third parties as a hosted or managed service, and every version turns into AGPL-3.0-or-later four years after it ships.

**Encrypted on disk, and the check takes ten seconds.** One note written with `kepta-mcp` 3.2.0 from the registry into a throwaway `HOME`, on 10.10.2026: the file at `~/.kepta/kepta.db` does not begin with the bytes `SQLite format 3` (its first sixteen are `85 95 55 36 a3 ab f4 02 4c 6c f0 5c 0f 0b 4c 69`), and neither the title of the note nor the amount it names appears anywhere in the file. Run `head -c 16 ~/.kepta/kepta.db` against your own store and see for yourself.

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

```text
  your agents                     your apps
┌──────────────┐    MCP    ┌────────────────────┐
│ Claude       ├──────────►│  kepta-mcp         │
│ Cursor       │           │  8 tools           │
│ Gemini CLI   │   HTTP    │  local server      │
│ your scripts ├──────────►│  hybrid retrieval  │
└──────────────┘           └─────────┬──────────┘
                                     │
                     one encrypted file, your machine
                     ~/.kepta/kepta.db
                     SQLCipher 4 · AES-256 · no cloud
```

## What it answers

Not a rendering of what it might say. Node 22.13, `kepta-mcp` 3.2.0 from the registry, 10.10.2026, a
throwaway `HOME` and an empty memory — the two commands, then what came back:

```text
$ npx -y kepta-mcp remember "Client Miller signs renewals in December."
✓ remembered — Client Miller signs renewals in December.
  type: semantic · id: k-mv2mghs9-fdf75c17

$ npx -y kepta-mcp recall "who signs renewals"
1 match — ranked by relevance

1. Client Miller signs renewals in December. · semantic · today
  Client Miller signs renewals in December.
  #remember
```

The second command shares no word with the note it found: that is the hybrid retrieval — full text,
vectors and the graph, fused — answering in the terminal, before any AI client is connected.

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
git clone https://github.com/DamianTodorovic/kepta.git && cd kepta
docker build -t kepta-mcp .

# A container has no keychain: the key is not optional, it is the condition.
# Generate once, keep it — it is the only way back into the volume.
KEPTA_DB_KEY=$(openssl rand -hex 32)

docker run --rm -i -e KEPTA_DB_KEY="$KEPTA_DB_KEY" -v kepta-data:/data kepta-mcp
```

The server speaks stdio, so `-i` is required; `--rm` keeps the container from piling up on the host. The database lives in the `kepta-data` volume and survives restarts.

**No key, no file.** A container cannot reach a keychain, so `KEPTA_DB_KEY` — 64 hexadecimal characters from `openssl rand -hex 32` — is what makes a new knowledge base possible at all. Without it KEPTA does not create the database: it stops with a non-zero exit and names the variable. Pass the **same** value on every start (a new one means a key that does not fit the volume, and that stops too, with nothing changed), and keep it where your other secrets live — it is the only way back into that volume. `KEPTA_ENCRYPTION=off` is the single door to a plaintext file; it exists for tools that must read raw SQLite and is never the way to get a container running. [SECURITY.md](https://github.com/DamianTodorovic/kepta/blob/main/SECURITY.md#encryption-at-rest) has the rule in full.

*If you run a build older than 10.10.2026:* that one still created the database in plaintext and exited 0 when the value was unusable. Test the file rather than trusting this sentence — a plaintext database begins with the bytes `SQLite format 3`.

## Requirements

**Node 22.13 or newer.** The package has one dependency: SQLite with encryption (`better-sqlite3-multiple-ciphers`), which npm installs prebuilt for Node 22, 24 and 26 on macOS, Windows and Linux — elsewhere it needs a C++ toolchain to build.

The knowledge base is encrypted on disk (SQLCipher 4 format, AES-256). On a machine with a keychain the key is created on the first start and kept there — macOS Keychain, Windows DPAPI or the Linux Secret Service (`secret-tool`); the local server uses the same one. Wherever there is no keychain, `KEPTA_DB_KEY` (64 hexadecimal characters, `openssl rand -hex 32`) is not a fallback you can skip: **without a place to put a key, a new knowledge base is not created** — the run stops with a non-zero exit instead of writing an unencrypted file. Keep a copy of the key either way: without it a restored database cannot be opened. [SECURITY.md](https://github.com/DamianTodorovic/kepta/blob/main/SECURITY.md#encryption-at-rest) shows how.

Search works immediately. Install [Ollama](https://ollama.com) and `ollama pull nomic-embed-text` if you also want it to find notes that say the same thing in different words.

## The Python client and the HTTP API

This package is the MCP server on its own — enough for an agent, with no window.

**KEPTA is one local, encrypted memory for every AI — €0, forever, no account, no licence key, nothing locked.** This package is the door for agents without a window (MCP over stdio); the [source-available core](https://github.com/DamianTodorovic/kepta) adds the HTTP API, the Python client and the CLI on the same encrypted file, and the free desktop app is the one with an interface. Teams and organizations that want shared team memory, central policies and MDM get **KEPTA Enterprise by request**: [write to me on LinkedIn](https://www.linkedin.com/in/damian-todorovic-244235434).

One capacity number instead of the word "unlimited": on a machine run from that repository, the local API stops taking new notes at `KEPTA_MAX_ACTIVE` active notes (default 5000) — a brake on a runaway agent, not a paywall, and one environment variable to raise. Read, search, update, import and backup are not refused by it.

For Python there is `pip install kepta`.

The package is called `kepta-mcp` because npm refuses the bare name `kepta` as too close to an existing package. The command it installs is `kepta`.

Both share the same `~/.kepta/kepta.db`. What one writes, the others see.

## License

[BUSL 1.1](https://github.com/DamianTodorovic/kepta/blob/main/LICENSE) — the same license as the source at [github.com/DamianTodorovic/kepta](https://github.com/DamianTodorovic/kepta). Using the server for your own agents, on your own hardware, is free and needs nothing from you. Offering this server (or a modified version) to third parties as a hosted or managed service requires a separate commercial license — and each version converts to AGPL-3.0-or-later four years after its release. A commercial license is available: [write to me on LinkedIn](https://www.linkedin.com/in/damian-todorovic-244235434).
