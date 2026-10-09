# kepta

**Python client for [KEPTA](https://github.com/DamianTodorovic/kepta) — local memory for AI agents.**

Your agents forget you after every conversation. KEPTA fixes that — with a SQLite file on your own machine. No account, no cloud, no telemetry.

This package is the **client, not the app**. KEPTA runs as a local server on the same device; here you connect to it.

```bash
pip install kepta
```

## In thirty seconds

A running KEPTA on this machine is the precondition: the desktop app, or `npm run dev` in the [open core](https://github.com/DamianTodorovic/kepta). `pip install kepta` brings the client, never a server.

```python
from kepta import KeptaClient

kepta = KeptaClient()          # finds the running instance on its own

kepta.save("Carbonara", "Guanciale, pecorino, egg yolk. No cream.", tags=["cooking"])

for hit in kepta.search("carbonara without cream"):
    print(f"{hit.score:.2f}  {hit.memory.title}")
```

## How search works

Three tracks, fused by Reciprocal Rank Fusion: **full text** (BM25), **vectors** and the **knowledge graph**.

Full text and graph work immediately. The vector track also finds what is worded differently from the question — for that it needs a local embedding model:

```bash
ollama pull nomic-embed-text
```

Without the model, `hit.vector_score` stays at `0.0` and search remains lexical — not an error, just fewer hits on paraphrased questions. How to tell:

```python
kepta.health()["embeddings"]     # {'total': 128, 'embedded': 128, ...} — or zeros everywhere
```

**What the model does and does not buy you — measured, with `nomic-embed-text` on the note above plus six unrelated ones.** `search("carbonara without cream")` puts the recipe first, vector similarity `0.75`. A paraphrase that shares **no word** with the note is not found: `search("what do I cook with pasta")` leaves the recipe at `0.51`, under the vector floor of `0.58` (`src/core/engine.ts`, `VECTOR_FLOOR`), while a note that merely happens to contain the word "Pasta" wins at `0.59`. In that case the full-text leg answers — it matches the one word question and note do share.

Trying a bigger multilingual model does not rescue this example either: measured with `bge-m3` on the same seven notes, the word-overlap query still ranks first (`0.77`) and the paraphrase still falls below the floor (`0.48`). What changed was the noise — irrelevant notes dropped from `0.58-0.59` to under `0.42`, so the leg returns nothing instead of something wrong. One caveat if you switch: `VECTOR_FLOOR` is calibrated for `nomic-embed-text`, and every model puts its similarities on its own scale.

## Why this is interesting

**The same memory as your agents.** Claude Desktop and Cursor talk to the same database over MCP. What your Python script writes, Claude knows in its next answer.

**Memories age.** Each one has a type, a validity window and a confidence score. When someone moves house, you name the successor: the new address supersedes the old one, the old one stays as history and drops in the ranking. Contradictions do not pile up.

```python
old = kepta.save("Home", "Alex lives in Hamburg.")
new = kepta.save("Home, current", "Alex now lives in Leipzig.")

kepta.forget(old.id, mode="supersede", supersede_by=new.id)

home = next(m for m in kepta.list() if m.id == old.id)   # list() runs by last change, so pick by id
home.is_superseded, home.is_expired                 # True, False — state right on the object
```

Superseding is an act you name, not something the server does on its own. The window on its own is `kepta.update(old.id, valid_to=...)` — a moment in milliseconds, after which `is_expired` reads `True` while `is_superseded` stays `False`. For the pairs you did not name: `consolidate(dry_run=False)`.

**No dependencies.** Standard library only. A memory that promises privacy should not pull foreign code into your process.

## Finding the connection

`KeptaClient()` looks in this order:

1. Environment variable `KEPTA_URL`
2. `~/.kepta/endpoint.json` — the address file the HTTP server writes when it starts (under `KEPTA_DATA_DIR` if you set one)
3. `http://127.0.0.1:3000` as a fallback for development mode

Step 2 is the important one: the app picks a random port, so without that file it could not be found at all. Being explicit works too, of course:

```python
kepta = KeptaClient("http://127.0.0.1:52341")
```

If nothing is running, the client does not dump `urllib` and `socket` at you. What arrives is one sentence naming the address, the reason and what to do:

```text
kepta.client.KeptaError: KEPTA at http://127.0.0.1:3000 is not answering (connection refused). Start the server (the KEPTA app, or npm run dev in the core) or set KEPTA_URL to the running address.
```

Or ask first:

```python
if not kepta.is_alive():
    print("KEPTA is not running — start the server (npm run dev) or set KEPTA_URL.")
```

## What the client can do

| Method | Purpose |
|---|---|
| `health()` · `is_alive()` | Status, version, node count |
| `list(trash=False)` | All memories, or the trash |
| `search(query, top_k, tags, type, scope)` | Hybrid retrieval with temporal weighting |
| `save(title, content, …)` | Create — type, tags, confidence, validity |
| `update(id, **fields)` | Change; use `valid_to=` rather than `validTo=` |
| `delete(id, permanent=False)` | Trash, or permanently if you insist |
| `restore(id)` | Bring it back from the trash |
| `graph()` | Entities and relations |
| `consolidate(dry_run=True, threshold=None)` | Duplicates and contradictions; `dry_run=False` supersedes the older copy |
| `forget(id, mode="expire", valid_to=None, supersede_by=None)` | The `memory_forget` tool: expire, supersede or trash |

`Memory` and `SearchHit` are frozen dataclasses with type annotations. Alongside the overall score, `SearchHit` exposes the individual tracks as `vector_score` and `lexical_score`.

## The server behind it

The client talks to the KEPTA HTTP API on your own machine — start it from the [open core](https://github.com/DamianTodorovic/kepta) (`npm run dev`), or use the desktop app, which runs the same server. It is the same local, encrypted memory the MCP server writes, free with no account and no limits. The one exception: `npx kepta-mcp`, the stdio server Claude Desktop and Cursor start, opens no HTTP port at all — checked in the published 3.2.0 bundle — so it is not what this client connects to. German notes work as well as English ones: the search stopword list covers both languages.

## License

MIT
