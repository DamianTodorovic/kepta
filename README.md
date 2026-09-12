<p align="center"><img src="https://img.shields.io/badge/version-2.11.0-blue" alt="v2.11.0"> <img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="AGPL-3.0"> <img src="https://img.shields.io/badge/tests-338%20passing-brightgreen" alt="tests"> <img src="https://img.shields.io/badge/coverage%20gate-%E2%89%A5%2070%25%20of%20lines-brightgreen" alt="coverage gate"> <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" alt="platform"> <img src="https://img.shields.io/badge/encryption-SQLCipher%204-green" alt="encrypted"> <a href="https://www.linkedin.com/in/damian-todorovic-244235434"><img src="https://img.shields.io/badge/LinkedIn-Damian%20Todorovic-0A66C2?logo=linkedin&logoColor=white" alt="Damian Todorovic on LinkedIn"></a></p>

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

| | KEPTA Core<br><sub>this repository</sub> | KEPTA Enterprise<br><sub>desktop app</sub> |
|---|:---:|:---:|
| Encrypted knowledge base — SQLCipher 4, key in the OS keychain | ✅ | ✅ |
| Hybrid search — BM25 + vectors + graph, fused and reranked | ✅ | ✅ |
| MCP server for Claude Desktop, Cursor and every MCP client | ✅ | ✅ |
| HTTP API and Python client | ✅ | ✅ |
| A good interface for your memory — browse, search, edit, trash (`npx -y kepta-mcp ui`, in your browser) | ✅ | ✅ |
| **Native desktop app** for macOS, Windows and Linux | — | ✅ |
| **Knowledge graph you can explore** — Force layout and Tree view, a time slider back to any day; 3 000 nodes and 9 500 edges at 60 fps | — | ✅ |
| **Drag & drop import** — PDF, Markdown, text; Obsidian vaults; web pages with one paste | — | ✅ |
| **Scan this computer** — opt-in, with a preview before a single file is read | — | ✅ |
| **Duplicate review, trash with restore, command palette** (⌘K) | — | ✅ |
| **Chat cockpit** with the model you choose — local (Ollama, LM Studio) or cloud | — | ✅ |
| **Praxis-Sync** — move knowledge between your own devices as an encrypted bundle | — | ✅ |
| **Setup assistant and system status** that tell you what works and what is missing | — | ✅ |

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

**338 tests** with Vitest and v8 coverage. The coverage thresholds are a CI gate: a commit that falls below one of them turns CI red. On top: a retrieval eval (Hit@1, Precision@5, MRR) on a fixed corpus, an ablation test per retrieval leg, an encryption eval and a boundary test on the core architecture.

### Coverage thresholds (enforced by CI)

| Area | Lines | Functions | Branches | Statements |
|---|---|---|---|---|
| everything together | **70 %** | **72 %** | **56 %** | **66 %** |
| `src/core` | **87 %** | **89 %** | **74 %** | **85 %** |

---

## 👋 Who builds KEPTA

KEPTA is built by **Damian Todorovic**. Questions, ideas, a license for your team — or you simply want to follow where this is going: **[find me on LinkedIn](https://www.linkedin.com/in/damian-todorovic-244235434)**.

## 📄 License

[AGPL-3.0-or-later](LICENSE). **KEPTA Enterprise** — the desktop app with the graphical interface, the knowledge graph, the machine scan and Praxis-Sync — is commercial software and licensed separately. The npm package `kepta-mcp` carries the same AGPL as this repository; the Python client under `python/` is MIT. Commercial licensing of the core on request — [write to me on LinkedIn](https://www.linkedin.com/in/damian-todorovic-244235434).

---

<p align="center">
  <sub>KEPTA Core — the open heart of KEPTA. No subscription, no account, no excuses.</sub>
</p>
