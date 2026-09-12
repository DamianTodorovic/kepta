<p align="center"><img src="docs/kepta-logo.svg" width="88" alt="KEPTA"></p>
<p align="center"><img src="https://img.shields.io/badge/version-2.11.0-blue" alt="v2.11.0"> <img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="AGPL-3.0"> <img src="https://img.shields.io/badge/tests-343%20passing-brightgreen" alt="tests"> <img src="https://img.shields.io/badge/coverage%20gate-%E2%89%A5%2070%25%20of%20lines-brightgreen" alt="coverage gate"> <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" alt="platform"> <img src="https://img.shields.io/badge/encryption-SQLCipher%204-green" alt="encrypted"> <a href="https://www.linkedin.com/in/damian-todorovic-244235434"><img src="https://img.shields.io/badge/LinkedIn-Damian%20Todorovic-0A66C2?logo=linkedin&logoColor=white" alt="Damian Todorovic on LinkedIn"></a></p>

# KEPTA Core

## Your AI assistant forgets everything. Every chat starts from zero.

**KEPTA fixes that — locally, encrypted, without a cloud.**

KEPTA is a local memory for AI assistants. Documents, decisions and client knowledge go into an encrypted knowledge base on your own computer — and your assistant (Claude Desktop, Cursor, any MCP client) recalls it as if it had never forgotten.

This repository is the **open core** (AGPL-3.0): the memory engine, the MCP server, the HTTP API — and the Python client, which is MIT so any Python project can embed it. The full desktop application is **[KEPTA Enterprise](#-kepta-enterprise--the-full-desktop-app)**.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Your computer                                                           │
│                                                                          │
│  ┌─────────────┐     MCP / HTTP API     ┌─────────────────────────────┐ │
│  │ Claude      │◄──────────────────────►│                             │ │
│  │ Desktop     │                        │   KEPTA                     │ │
│  │             │                        │   encrypted knowledge       │ │
│  │ Cursor      │     ┌────────────┐    │   base (SQLCipher 4)        │ │
│  │             │     │ kepta-mcp  │    │   ~/.kepta/kepta.db         │ │
│  │ your code   │◄───►│            │    │                             │ │
│  └─────────────┘     └────────────┘    └─────────────────────────────┘ │
│                                                                          │
│  No subscription. No account. No telemetry. No cloud.                   │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 KEPTA Enterprise — the full desktop app

**The engine in this repository is what your agents talk to. KEPTA Enterprise is what _you_ work in.** A native app for macOS, Windows and Linux that turns the same encrypted knowledge base into a second brain you can see, search, shape and trust — every document, every decision, every connection, on your own machine.

| The index — everything you know, grouped by kind | The knowledge graph — every note a node, every link an edge |
|---|---|
| ![KEPTA Enterprise: the index](docs/enterprise/01-index.png) | ![KEPTA Enterprise: the knowledge graph](docs/enterprise/03-graph.png) |
| **The editor — kinds of knowledge, `[[links]]`, validity** | **Set up in a minute — your words, not a menu** |
| ![KEPTA Enterprise: the editor](docs/enterprise/04-editor.png) | ![KEPTA Enterprise: the setup assistant](docs/enterprise/05-setup.png) |

<sub>KEPTA Enterprise 2.11 on an invented demo corpus — nothing in these shots is real.</sub>

**Every feature, side by side.** ✅ available · **API** / **MCP** in the core for agents and scripts, without a screen for it · — only in KEPTA Enterprise

| Feature | KEPTA Core | KEPTA Enterprise |
|---|:---:|:---:|
| **Security & privacy** | | |
| Encrypted at rest — SQLCipher 4, AES-256 and an HMAC-SHA512 over every page, the WAL included | ✅ | ✅ |
| The key is created and kept in the OS keychain automatically — nothing to type, agents never see it | ✅ | ✅ |
| Recovery key in one click, ready for your password manager | ✅ | ✅ |
| Settings — the AI key included — live inside the encrypted file | ✅ | ✅ |
| Loopback only (`127.0.0.1`), no account, no telemetry — nothing leaves your machine unless you pick a cloud AI | ✅ | ✅ |
| Rate limiting, Helmet and input validation on every route | ✅ | ✅ |
| Hardened desktop shell — no Node in the window, sandbox, Content Security Policy | — | ✅ |
| **Notes** | | |
| Create, edit, delete — trash with restore | ✅ | ✅ |
| Four kinds of knowledge — fact, event, how-to, document — assigned by readable rules that state their reason | ✅ | ✅ |
| Sort existing notes by kind afterwards, with a preview first | API | ✅ |
| Tags, confidence 0–1, automatically extracted entities | ✅ | ✅ |
| Scopes — user, agent, session — so a memory knows whom it belongs to | API · MCP | API · MCP |
| Validity windows — expired notes are marked, never quietly hidden | ✅ | ✅ |
| Supersede chains — a new fact displaces the old one, the history stays | ✅ | ✅ |
| Migration from the old `memories.json` — idempotent, with a backup | ✅ | ✅ |
| **Search** | | |
| Hybrid retrieval — BM25 full text + vectors + entities, fused with Reciprocal Rank Fusion | ✅ | ✅ |
| Local reranking — term coverage, phrases, title, tags; no network | ✅ | ✅ |
| Relevance first — results ranked, the best hit on top | ✅ | ✅ |
| Time-travel search — what was known at any moment (`asOf`) | API · MCP | API · MCP |
| Persistent embeddings via Ollama, computed by a background queue | ✅ | ✅ |
| Temporal weighting — expired ×0.5, superseded ×0.4 | ✅ | ✅ |
| Stopwords in German and English | ✅ | ✅ |
| Semantic search switch and a result slider from 5 to all | — | ✅ |
| One code path for interface, HTTP API and MCP — agents get the quality you get | ✅ | ✅ |
| Retrieval eval — `npm run eval` measures Hit@1, Precision@5 and MRR | ✅ | ✅ |
| **Capture & import** | | |
| Drag & drop files — PDF with the character maps of embedded fonts, Markdown, text, JSON — chunked | — | ✅ |
| Inbox folder, watched and imported automatically | API | ✅ |
| Obsidian vault import — frontmatter kept, `[[wiki links]]` become graph edges | API | ✅ |
| JSON import of whole note sets | API | ✅ |
| Re-read files imported with an older extraction — counts first, writes after you confirm | API | ✅ |
| URL clipper — SSRF-protected, strips navigation lines and cookie banners | — | ✅ |
| Scan this computer — opt-in, preview first; keys, credentials, browser profiles and wallets stay blocked | — | ✅ |
| Auto-learn — save the key point of a chat answer (off by default) | — | ✅ |
| Markdown export to a folder | API | ✅ |
| Device Sync — move a scope between your own devices as an AES-256-GCM bundle, with a hash-chained ledger | API | ✅ |
| **Knowledge graph** | | |
| Entities and relations from `[[wiki links]]` and automatic extraction | API · MCP | ✅ |
| Interactive graph with two views — Force (physics) and Tree (dendrogram); nodes glide between them | — | ✅ |
| Unbounded canvas — 3 000 nodes and 9 500 edges at 60 fps; zoom, pan, drag, fit-to-view | — | ✅ |
| Time slider — the graph as it stood on any day | — | ✅ |
| Colour by kind, size by connections, real links told apart from mere similarity; double-click opens the note | — | ✅ |
| **Maintenance** | | |
| Duplicate detection — embedding similarity ≥ 0.92, lexical fallback without Ollama | MCP | ✅ |
| Consolidation supersedes instead of deleting — nothing is lost | MCP | ✅ |
| Duplicate review — groups side by side, keep the richest copy in one click, one undo for the batch | — | ✅ |
| Episodic memories grow out of chat history | — | ✅ |
| Activity feed | API | ✅ |
| **Agents (MCP)** | | |
| MCP 2026-07-28, compatible with 2025-06-18 and 2024-11-05 — stdio and Streamable HTTP | ✅ | ✅ |
| Eight tools — search, save, update, delete, list, graph, consolidate, forget — with `outputSchema` and `structuredContent` | ✅ | ✅ |
| Write gate (opt-in) — a local LLM decides ADD, UPDATE, DELETE or NOOP before a new memory is stored | ✅ | ✅ |
| npm package `kepta-mcp`, listed in the official MCP registry | ✅ | ✅ |
| Python client — `pip install kepta`, standard library only | ✅ | ✅ |
| **Chat cockpit** | | |
| 20 provider presets — Ollama, LM Studio, OpenAI, Anthropic, Gemini, Mistral, Groq, DeepSeek, xAI and more | — | ✅ |
| Model discovery for Ollama and LM Studio in one click | — | ✅ |
| Streaming with a stop button, Markdown rendering | — | ✅ |
| Source citations — every answer shows which memories it used | — | ✅ |
| Date-aware prompting and a visible token budget | — | ✅ |
| **Interface** | | |
| An interface for your memory — browse by kind and tag, search, read, write, trash | ✅ in your browser | ✅ native app |
| Native desktop app for macOS, Windows and Linux | — | ✅ |
| Light and dark | ✅ | ✅ |
| Keyboard first — shortcuts; in Enterprise also a command palette (⌘K) | ✅ | ✅ |
| Tag filter with counts | ✅ | ✅ |
| Knowledge list with readable previews, source chips, part badges, *Open file*, grouping by file, kind or period | — | ✅ |
| Focus mode and text size (100 / 115 / 130 %) | — | ✅ |
| Setup assistant with a starter pack | — | ✅ |
| System status — detects local AI, checks storage, shows diagnostics | — | ✅ |
| **Price** | | |
| License | free · AGPL-3.0 | 14-day free trial, then a license key checked offline |

**Try it for 14 days — full functionality, no account, no internet.** After the trial a license key unlocks it, checked offline on your machine; KEPTA never phones home. For yourself, your practice or your whole team: **[write to me on LinkedIn](https://www.linkedin.com/in/damian-todorovic-244235434)** and I'll get you set up.

---

## ⚡ Quick start

### MCP server (Claude Desktop, Cursor)

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

### Your memory in the browser

```bash
npx -y kepta-mcp ui
```

Opens **KEPTA Core** in your browser on `http://127.0.0.1:4747` — the same encrypted knowledge base your agents write to, now one click away. Browse by kind and tag, search ranked by relevance, open a note and follow its `[[links]]`, write and edit notes with their kind, tags and validity, move them to the trash and bring them back, dark or light. Nothing to install, nothing leaves your machine, and only your own browser tab can change anything. `--port` picks another port, `--no-open` keeps the browser closed.

### HTTP API

```bash
git clone https://github.com/DamianTodorovic/kepta.git
cd kepta && npm install && npm run dev
# → http://127.0.0.1:3000

# save a note
curl -s localhost:3000/api/memory -H 'Content-Type: application/json' \
  -d '{"title":"Client Miller","content":"Billed quarterly.","tags":["client"]}'

# search
curl -s "localhost:3000/api/memories/search?q=how+does+miller+pay"
```

### Docker (MCP server only)

```bash
docker build -t kepta-mcp .
docker run -i -e KEPTA_DB_KEY=<64-hex> -v kepta-data:/data kepta-mcp
```

---

## ✨ What's inside

| | |
|---|---|
| 🔍 **Hybrid search** | BM25 full text + vector similarity (Ollama) + knowledge graph, fused with RRF, with local reranking |
| 🔐 **Encrypted at rest** | SQLCipher 4: AES-256 and an HMAC-SHA512 over every page, the WAL included; the key lives in the OS keychain (macOS Keychain, Windows DPAPI, Linux Secret Service) |
| 🕐 **Time travel** | Validity windows (`valid_from` / `valid_to`) and `asOf` queries — "what did I know on 3 March?" |
| ♻️ **Superseded, not contradicted** | New facts replace old ones (`superseded_by`); the history stays |
| 🔗 **MCP first** | 8 tools, one code path for the API and MCP — agents get the same quality as the app |
| 📄 **File import** | PDF (pdf.js with character maps), Markdown with `[[wiki links]]`, text, JSON |
| 📊 **Eval** | `npm run eval` on a fixed corpus of 58 notes / 45 queries: Hit@1, Precision@5, MRR, plus an ablation test per retrieval leg |

---

## 🖥️ HTTP API (29 routes)

| Area | Routes |
|---|---|
| Memories | `GET/POST /api/memories`, `GET /api/memories/:id`, `POST /api/memory`, `DELETE /api/memories/:id`, `POST /api/memories/:id/restore`, `POST /api/memories/bulk-delete`, `POST /api/memories/bulk-restore`, `POST /api/memories/reclassify` |
| Search | `GET /api/memories/search`, `POST /api/search` |
| Import / export | `POST /api/import/markdown`, `POST /api/export/markdown` |
| Encryption & repair | `GET /api/health` (including the `encryption` status), `POST /api/repair/imports` |
| MCP | `POST /mcp`, `GET /mcp`, `GET /api/mcp/tools`, `POST /api/mcp/search`, `POST /api/mcp/save` |
| System | `GET /api/settings`, `PUT /api/settings`, `GET /api/storage-info`, `GET /api/activity` |

Every route listens on `127.0.0.1` only, with rate limiting, Helmet and input validation.

---

## 🐍 Python client

```bash
pip install kepta
```

```python
from kepta import KeptaClient
kepta = KeptaClient()
kepta.save("Carbonara", "Guanciale, pecorino, egg yolk. No cream.", tags=["cooking"])
for hit in kepta.search("carbonara without cream"):
    print(f"{hit.score:.2f}  {hit.memory.title}")
```

No dependencies — only the Python standard library.

---

## 🏗️ Architecture

```
src/core/           memory engine (store, search, encryption, MCP protocol)
server.ts           HTTP API (Express, 29 routes)
src/mcp-server.ts   MCP stdio server (npx kepta-mcp) and the browser interface (npx kepta-mcp ui)
src/ui/             the interface: a small local server and one page, no framework, no CDN
npm/                source of the npm package (kepta-mcp)
Dockerfile          container for the MCP server
python/             Python client (PyPI: kepta)
scripts/            eval, benchmark, repair
tests/              Vitest suite with CI-enforced coverage thresholds
```

**One code path** for the HTTP API and the MCP server — agents get the same results as direct API calls.

---

## 🔐 Encryption

The knowledge base is a SQLCipher 4 database: AES-256, an HMAC-SHA512 over every page, the WAL included. The key — 256 random bits — lives in the operating system's keychain: the macOS Keychain, Windows DPAPI or the Linux Secret Service. On servers without a keychain, set `KEPTA_DB_KEY` to 64 hexadecimal characters. What it covers, what it does not, and how to keep a copy of the key: [SECURITY.md](SECURITY.md).

---

## 🧪 Quality

**343 tests** with Vitest and v8 coverage. The coverage thresholds are a CI gate: a commit that falls below one of them turns CI red. On top: a retrieval eval (Hit@1, Precision@5, MRR) on a fixed corpus, an ablation test per retrieval leg, an encryption eval and a boundary test on the core architecture.

### Coverage thresholds (enforced by CI)

| Area | Lines | Functions | Branches | Statements |
|---|---|---|---|---|
| everything together | **70 %** | **72 %** | **56 %** | **66 %** |
| `src/core` | **87 %** | **89 %** | **74 %** | **85 %** |

---

## 👋 Who builds KEPTA

KEPTA is built by **Damian Todorovic**. Questions, ideas, a license for your team — or you simply want to follow where this is going: **[find me on LinkedIn](https://www.linkedin.com/in/damian-todorovic-244235434)**.

## 📄 License

[AGPL-3.0-or-later](LICENSE). **KEPTA Enterprise** — the desktop app with the graphical interface, the knowledge graph, the machine scan and Device Sync — is commercial software and licensed separately. The npm package `kepta-mcp` carries the same AGPL as this repository; the Python client under `python/` is MIT. Commercial licensing of the core on request — [write to me on LinkedIn](https://www.linkedin.com/in/damian-todorovic-244235434).

---

<p align="center">
  <sub>KEPTA Core — the open heart of KEPTA. No subscription, no account, no excuses.</sub>
</p>
