# Environment variables

Every switch KEPTA reads from the environment, what it does, and what happens if you
touch it. Nothing here is a paid feature: these are the screws of the free core. Where a
switch can hurt, it says so in the same line.

Citations name the file and the function, not a line number — line numbers move with every
commit and a broken reference in install documentation costs someone their evening.

## Where the data lives

| Variable | Default | What it does | Read in |
|---|---|---|---|
| `KEPTA_DATA_DIR` | `~/.kepta` | The folder holding `kepta.db`, `inbox/`, `endpoint.json`, `profile.json` and — after a confirmed full replace — the `backup/` folder. Set before the first start; a running server already has the old path open. | `server.ts` (`DATA_DIR_ROH`), `src/core/store.ts` (`defaultDataDir()`), `src/core/migrate.ts`, `src/core/extensions.ts` |
| `PORT` | `3000` | The port of the HTTP API started from this repository. A packaged server picks a random port instead and writes it to `endpoint.json` — that is why clients read the file rather than guessing. | `server.ts` (`startServer()`) |

## Encryption and the key

| Variable | Default | What it does | Read in |
|---|---|---|---|
| `KEPTA_DB_KEY` | unset | The database key for machines and containers without an OS keychain: **64 hexadecimal characters** (`openssl rand -hex 32`). Generate it once and keep it — it is the only way back into that file. Since 10.10.2026 it is the **condition** for creating a database without a keychain: no usable key, no file, a non-zero exit, and a message naming this variable. An **empty** value is not "unset" — it is dropped and the keychain is asked anyway, which on your own machine means the entry you meant to leave alone. A valid but foreign key on an existing encrypted file stops and changes nothing. | `src/core/schluessel.ts` (`schluesselbundKeyProvider()`) |
| `KEPTA_ENCRYPTION` | on | Set to `off` and the store gets no key at all: the database is written **unencrypted**, without asking twice. Since 10.10.2026 this is the only door left to plaintext, and it is a decision you make on purpose — it exists for tooling that must read raw SQLite (inspectors, migration scripts). It is not a performance switch, not a way to "fix" a key problem (on an encrypted file it produces an unreadable-file error), and never the way to get a container running — that is what `KEPTA_DB_KEY` is for. | `src/core/schluessel.ts` (`schluesselbundKeyProvider()`) |

### CI: no key, no run

A CI runner has no keychain, so the key has to arrive as a secret. The failure mode this
rule removes is the one that used to be silent: an empty or placeholder value building a
plaintext knowledge base, green in the log.

```yaml
# The secret holds 64 hex characters from `openssl rand -hex 32`, generated ONCE.
# Per-job generation gives every run a fresh, unrelated memory.
- run: KEPTA_DB_KEY="${{ secrets.KEPTA_DB_KEY }}" npx -y kepta-mcp stats
```

Three things to check in your own pipeline before you trust it: the variable is **non-empty**
(an empty string takes the keychain path, not the "no key" path); it is not a **placeholder**
copied from a guide; and it never appears in a command line your runner prints, because a
logged key is a published key. When the value is missing entirely the right outcome is the
loud one — no database, non-zero exit, one sentence pointing at `KEPTA_DB_KEY`.

## What the API accepts

| Variable | Default | What it does | Read in |
|---|---|---|---|
| `KEPTA_MAX_ACTIVE` | `5000` | How many **active notes** the local HTTP API accepts. Above it, creating a new single note answers `429`; reading, searching and updating stay open, and imports and backups are never refused on this count. The number is read on every request, so raising it needs no restart. It is a brake on a runaway agent writing your memory full — not a licence limit, and not a wall you have to pay to pass. | `server.ts` (`maxActiveMemories()`) |
| `KEPTA_HOST` | `127.0.0.1` | The address the HTTP API binds to. **Setting this to a network address is the one switch that can expose your memory**: the API has no authentication, and with a non-loopback bind the additional `Host` check is switched off — because the owner chose to serve the network. Then anyone who can reach that port reads every note, writes notes, deletes them and reads the settings, and the loopback guarantee in [SECURITY.md](../SECURITY.md) is over. The way to serve KEPTA to another machine is a reverse proxy in front of `127.0.0.1` that carries its own authentication, TLS and network rules — KEPTA deliberately ships none of that. | `server.ts` (`startServer()`, `nurDieserRechner({ bindHost })`), `src/herkunft.ts` |
| `KEPTA_WRITE_GATE` | off | Set to `on` and a local model reviews each write before it lands (`src/core/engine.ts`, `writeGateEnabled()`); reviews are logged, and the gate is opt-in because it costs a model call per save. | `src/core/engine.ts` (`writeGateEnabled()`) |
| `KEPTA_WRITE_GATE_MODEL` | `llama3.2` | The model the write gate asks. Needs that model locally. | `src/core/engine.ts` |

## Embeddings — the semantic leg

| Variable | Default | What it does | Read in |
|---|---|---|---|
| `KEPTA_EMBED_MODEL` | `nomic-embed-text` | The model the engine embeds with. Changing it changes the meaning of every stored vector: the vector floor (`src/core/engine.ts`, `VECTOR_FLOOR = 0.58`) is calibrated **for this model**, and similarity scores of other models sit on a different scale. Measured with `bge-m3` on the carbonara example in [python/README.md](../python/README.md): the word-overlap query still ranks first (0.77), the paraphrase still falls below the floor. | `src/core/embeddings.ts` (`DEFAULT_EMBED_MODEL`) |
| `KEPTA_OLLAMA_URL` | `http://127.0.0.1:11434` | Where Ollama answers, for the engine and the background queue. | `src/core/embeddings.ts` (`ollamaBaseUrl()`) |
| `OLLAMA_HOST`, `OLLAMA_EMBED_MODEL` | `http://localhost:11434`, `nomic-embed-text` | **Not the same pair as above.** These two belong to the chat-proxy route in `server.ts` and do not steer the embedding queue. Three near-identical names for two different settings is a trap; if you rename either pair, do it in both places and in this file. | `server.ts` (chat proxy) |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | The judge endpoint for the LongMemEval harness in `tools/` only. No effect on a running KEPTA. | `tools/longmemeval/harness.ts` |

## For tests and tooling

| Variable | Default | What it does | Read in |
|---|---|---|---|
| `KEPTA_NO_AUTOSTART` | unset | `1` = importing `server.ts` no longer starts a server. Used by every HTTP test file so suites can open the app on their own port. A test helper, not an operator switch. | `server.ts` (bottom of file) |
| `KEPTA_DEMO_FAST` | unset | `1` = `npx -y kepta-mcp demo` without the pauses between scenes (`--fast` does the same). | `src/demo-show.ts` |
| `KEPTA_URL` | unset | Not read by the core — this one belongs to the **Python client**, which uses it to find a running KEPTA instead of `endpoint.json`. See [python/README.md](../python/README.md). | `python/src/kepta/client.py` |

`NODE_ENV` is read by Express and by nothing in the core that changes security behaviour; the
JSON error responses work with it set or unset. `APPDATA` and `ELECTRON_RUN_AS_NODE` appear in
path resolution and are the platform's own variables, not KEPTA's screws.

## Limits that are not variables

Fixed by code, documented here so nobody hunts for a switch:

- Request bodies: 1 MB globally; the import routes accept more by design, `POST /api/repair/imports` accepts 16 KB.
- Rate limits on the local API (`server.ts`, all per minute, all answered with `429`): 180 requests globally, 20 on the search and chat routes, 60 on writes. None of them is a licence limit; there is no variable for them today.
- `GET /api/graph` returns at most 500 entities and 2000 relations (`src/core/store.ts`, `getGraph()`), and neither query sorts before it cuts — which entries survive is decided by row order, not importance.
- A single note: 60 KB per create/update request, content capped at 50 000 characters.
