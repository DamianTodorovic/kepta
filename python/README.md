# kepta

**Python client for [KEPTA](https://github.com/DamianTodorovic/kepta) — local memory for AI agents.**

Your agents forget you after every conversation. KEPTA fixes that — with a SQLite file on your own machine. No account, no cloud, no telemetry.

This package is the **client, not the app**. KEPTA runs as a desktop application on the same device; here you connect to it.

```bash
pip install kepta
```

## In thirty seconds

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

Only then does `search("what do I cook with pasta")` find the carbonara recipe, which does not contain the word *pasta* at all. Without the model, `hit.vector_score` stays at `0.0` and search remains lexical — not an error, just fewer hits on paraphrased questions. How to tell:

```python
kepta.health()["embeddings"]     # {'total': 128, 'embedded': 128, ...} — or zeros everywhere
```

## Why this is interesting

**The same memory as your agents.** Claude Desktop and Cursor talk to the same database over MCP. What your Python script writes, Claude knows in its next answer.

**Memories age.** Each one has a type, a validity window and a confidence score. When someone moves house, the new address supersedes the old one — the old one stays as history and drops in the ranking. Contradictions do not pile up.

```python
old = kepta.save("Home", "Alex lives in Hamburg.")
kepta.update(old.id, valid_to=1788400000000)      # expired from this point on
kepta.save("Home, current", "Alex now lives in Leipzig.")

m = kepta.list()[0]
m.is_expired, m.is_superseded                      # state right on the object
```

**No dependencies.** Standard library only. A memory that promises privacy should not pull foreign code into your process.

## Finding the connection

`KeptaClient()` looks in this order:

1. Environment variable `KEPTA_URL`
2. `~/.kepta/endpoint.json` — the address file KEPTA writes on startup
3. `http://127.0.0.1:3000` as a fallback for development mode

Step 2 is the important one: the packaged app picks a random port. Being explicit works too, of course:

```python
kepta = KeptaClient("http://127.0.0.1:52341")
```

If nothing is running you do not get a cryptic network error but a sentence that says what to do:

```python
if not kepta.is_alive():
    print("KEPTA is not running — start the app or set KEPTA_URL.")
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

`Memory` and `SearchHit` are frozen dataclasses with type annotations. Alongside the overall score, `SearchHit` exposes the individual tracks as `vector_score` and `lexical_score`.

## Installing KEPTA

The app is available for macOS, Windows and Linux under [Releases](https://github.com/DamianTodorovic/kepta/releases) — Intel and ARM in each case. MIT licensed, free.

Note: the documentation is English, but **the desktop UI is currently German only**. This client, the HTTP API and MCP are language-neutral.

## License

MIT
