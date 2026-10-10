# The words in this repository

The API and the tools speak a small technical language. Here is each word in everyday
language, once, so no document has to guess. Where a term has two meanings in KEPTA, the
second meaning is named — that is where the confusion actually lives.

## What a thing is

| Word in the texts | In everyday language | Note |
|---|---|---|
| **note** | one thing your memory holds — a title, a body, tags, a type | the word to use with people. `node` in an answer means the same thing and should not appear there. |
| **memory** | two things, and the documents must say which: **your memory** = the whole encrypted file; a **memory** in an API field = one note | the tool names (`memory_save`) keep the old word; prose says note |
| **knowledge base / store** | the file itself, `~/.kepta/kepta.db` | one file, one key |
| **entity / concept** | a name that occurs in notes and is linked between them ("Miller", "Kitchen refit") | the graph's dots |
| **relation / claim** | one stated link between two names ("Miller — signs — renewals") | the graph's lines |
| **type** (`semantic`, `episodic`, `procedural`, `reference`) | what kind of thing the note is: a fact, something that happened, how something is done, a pointer to material | saved automatically; correct it with `memory_update` |
| **chunk** | a note is cut into pieces for embedding, because models take a bounded text at a time | roughly two per note in a normal store |

## Two meanings that have burned people

| Word | Meaning 1 | Meaning 2 |
|---|---|---|
| **key** | the **licence key** to unlock a paid tier — KEPTA has none | the **database key**, 64 hex characters, that opens your file. When a document says "no key", it must say which one. |
| **restore** | bringing a **note** back out of the trash (`POST /api/memories/:id/restore`) | putting a **backup file** back in place, e.g. a `pre-replace` snapshot |
| **host** | the machine your KEPTA runs on (network sense) | an app that embeds the engine ("a host that wires in `LocalFileAuditSink`") |
| **UI / interface** | a window you click in — the desktop app, not this repository | what people call the surface of the core: it has none; your AI client *is* the interface |

## How a search works

| Word | In everyday language |
|---|---|
| **full text / BM25 / FTS5** | matching the actual words. FTS5 is SQLite's index, BM25 is how it ranks — no model, no network. |
| **vector / embedding / semantic** | matching meaning: each chunk becomes a list of numbers, similar meanings land near each other. Needs a local model (Ollama) and works only once the chunk is embedded. |
| **graph / entity match** | matching by name: notes that talk about the same person or thing support each other. |
| **RRF (Reciprocal Rank Fusion), k = 60** | how the three lists above become one ranking: each position gives points, `1/(60+rank)`, and the points add up. |
| **rerank** | a local second pass over the merged list — word coverage, phrase, title, tags. Capped at +0.25, no network. |
| **Hit@1 / MRR** | did the right note come first / how far up did the first right note get |
| **Recall@5 (capped)** | of the notes that *should* answer the question, how many arrived in the top five — the denominator is `min(5, how many are relevant)`, which is why it is not called precision |
| **P@5** | hits inside the top five divided by five — what the ablation script reports. Same name family, different denominator, so the two numbers are not comparable. |

## Time and forgetting

| Word | In everyday language |
|---|---|
| **valid from / valid to** | the window in which a note is the truth ("from March 2027 we live in Dresden") — on a note these fields are filled; on a **relation** (`validFrom`/`validTo` in `GET /api/graph`) the core's own write path currently leaves both empty, so an edge carries no window and no drawing may claim an "expired claim" from it |
| **time travel / `asOf`** | "what did I know on 3 March?" — search as of a date |
| **supersede / superseded** | a newer note replaced this one; the old note stays as history and drops in the ranking |
| **expired** | its `valid_to` is in the past |
| **orphan / verwaist** | a node or edge whose carrying note is gone (deleted or never there) — reported as numbers in `kuerzung.verwaiste` |
| **trash** | notes still in the file, invisible to search, restorable |
| **purge / permanent delete** | the row leaves the file; nothing restores it |
| **`dry-run` / `dryRun: true`** | "show me what you would do, change nothing" |
| **scope (`local` / `private`)** | who may see the note: `local` = any channel, `private` = hidden from AI channels, still visible to the owner's own app. It is a disclosure rule toward agents, not protection against a program on your machine. |
| **confidence (0…1)** | how sure the note claims to be; it multiplies the ranking score. 0 = a guess, 1 = confirmed. |
| **epoch milliseconds** | a timestamp as one number: milliseconds since 1 January 1970 UTC (`1762387200000`). Send a date string like `2026-10-09` where the tool accepts one. |
| **write gate / Menschenschleuse** | an opt-in local model that looks at a write before it lands (`KEPTA_WRITE_GATE=on`) |

## Where things sit

| Word | In everyday language |
|---|---|
| **keychain / `ablage`** | the operating system's secret store: macOS Keychain, Windows DPAPI, Linux Secret Service. In a health answer, `ablage` names *where the key was read from* — `KEPTA_DB_KEY` or the keychain's name. |
| **stdio** | the MCP server talks over the terminal's standard input/output — that is how Claude Desktop and Cursor start it |
| **Streamable HTTP / `POST /mcp`** | the same MCP tools over HTTP; only in the server run from this repository |
| **loopback / `127.0.0.1`** | reachable only from this machine. The whole security story rests on it; `KEPTA_HOST` is the way to break it. |
| **headless** | without a window: the npm binary and the container run without an interface |
| **inbox** | the folder `~/.kepta/inbox` whose files are taken into the memory automatically |
| **egress** | what leaves the machine — here: what a prompt carries to whichever model your agent uses |

## License words

| Word | In everyday language |
|---|---|
| **source-available** | you can read and use every line; it is not OSI-approved "open source" |
| **BUSL-1.1** | the licence: use it in your own organisation freely, offer it to third parties as a hosted service only by agreement |
| **Change Date** | four years after each release, that version becomes AGPL-3.0-or-later |
| **`python/`** | MIT — any Python project may embed the client |
