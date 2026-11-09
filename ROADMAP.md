# 🗺️ K3PTA Roadmap — v2.0 and beyond

> As of September 2026 · Replaces `WHITE-SPACE-ANALYSE.md` (the v1.0 analysis, whose quick wins and big bets are all shipped, held by `tests/doku-zahlen.test.ts:207`).

## ✅ Done in v1.x (from the white-space analysis)

- [x] Backup import (JSON) · streaming answers + stop · Markdown rendering
- [x] Ollama and LM Studio model discovery · source citations in chat
- [x] Storage engine outside localStorage (`memories.json`, atomic writes)
- [x] MCP server (stdio + HTTP) · command palette · token budget · web clipper
- [x] Hybrid search TF-IDF + BM25 (+ optional embeddings)

## 🎯 v2.0 — a state-of-the-art agent brain (✅ released 2026-09-01)

| Building block | Goal |
|---|---|
| **Storage** | SQLite with FTS5 (`node:sqlite` until 2.10, encrypted SQLite3 Multiple Ciphers since 2.11): trash instead of hard delete, memory types (semantic/episodic/procedural), scope (user/agent/session), temporal validity (`valid_from`/`valid_to`), supersede chains |
| **Vectors** | Persistent chunk embeddings via Ollama (`nomic-embed-text`), an embed-on-write queue instead of re-embedding per query |
| **Retrieval** | FTS5 BM25 + vector KNN + entity match → RRF fusion → recency boost + temporal filter → optional reranker. **One** code path for UI, HTTP API and MCP |
| **Knowledge graph** | Entities and relations (from `[[wiki links]]` and auto-extraction), a graph view built on real edges |
| **MCP** | Protocol 2026-07-28 (stateless core, `server/discover`, `_meta` versioning) with legacy compatibility; 8 tools with `outputSchema`/`structuredContent`; Streamable HTTP + stdio |
| **Lifecycle** | Auto-consolidation (embedding duplicates, conflict and supersede detection), auto-tagging, episodic memory from chats |
| **Interop** | Obsidian vault import (frontmatter + wiki links) and Markdown export |
| **Quality** | `strict` TypeScript, vitest tests (storage/engine/MCP/interop), CI with a test job and audit |

## ✅ v2.6.0 — English interface (released 2026-09-03)

Every user-facing string, the MCP tool descriptions, the starter pack and the
native date controls are English (`tests/mcp.test.ts:58` and `tests/doku-plattform.test.ts:35`). German survives where it is a feature, not a
default: the search stopword list stays bilingual, so German notes keep working.
A German switch for the main surfaces came in 2.10 and left again in 2.11:
K3PTA's interface is English, one language done properly.

## ✅ v2.6.15 — September 2026: wave 1, the white-space features

| Feature | What shipped |
|---|---|
| **Time-travel search** | `asOf` on `memory_search` and `POST /api/search` — ask what was known at any moment; time-travelled queries never count as access (`tests/engine.test.ts:254` shows the older note and hides the later one at the asked moment; `:271` reads `accessCount` back at zero after a time-travel search and above zero after an ordinary one) |
| **Write gate** (Mem0, arXiv:2504.19413) | Opt-in via `KEPTA_WRITE_GATE=on`: the local LLM classifies each new memory as ADD/UPDATE/DELETE/NOOP on both save paths; unreachable LLM degrades to ADD |
| **Local reranking** | Deterministic reranker (term coverage, phrase, title, tags) as a bounded boost after RRF, exposed as `rerankScore` — the seam for the cross-encoder below |
| **Device Sync** | Device-to-device scope transfer as an AES-256-GCM bundle (scrypt passphrase) with a tamper-evident hash-chained transfer ledger (`~/.kepta/sync-journal.jsonl`) |
| **Encryption at rest — evaluated** | Honest assessment in `docs/encryption-eval.md`: SQLCipher needs a build switch, `PRAGMA key` silently does nothing on node:sqlite, the KeyProvider seam is free (~0 ms); recommendation: OS-level encryption + wave-2 field encryption design (`tests/encryption-eval.test.ts:15`) |
| **Interface: Die Akte** | True-black dark theme, seal-red accent, serif display type, soft depth layers, Apple-style segmented controls, typographic sidebar with brand plate, type-colour strokes on cards — every surface reworked (supersedes the earlier Onyx pass, held by `tests/components/Dashboard.test.tsx:138`) |

## ✅ v2.10 — September 2026: the list and the graph, read by people

| Feature | What shipped |
|---|---|
| **Tree view** | The graph switches between Force and a dendrogram (root → kind → entity or tag group → note); nodes glide between the two |
| **A readable list** | A click opens a preview with the full text and the source; source chips, part badges and *Open file*; grouping by file, kind or period |
| **PDFs as text** | pdf.js with the character maps for embedded fonts, shipped offline; older imports can be read again from Settings → Data |
| **Relevance first** | While a query is active the list is flat and ranked, whatever grouping was chosen |
| **Text size** | 100/115/130 % (a German switch shipped here too and was removed in 2.11, held by `tests/components/Settings-textgroesse-wirkt.test.tsx:36`) |
| **Persona walkthrough** | Ten simulated user profiles over one real run against a 3,330-note base; its knockouts — unreadable PDFs, a ranking lost in groups — were fixed first |

## ✅ v2.11 — September 2026: encryption at rest

| Feature | What shipped |
|---|---|
| **Encrypted knowledge base** | SQLCipher 4 format through SQLite3 Multiple Ciphers: AES-256 and an HMAC-SHA512 over every page, search fully intact — the whole file is encrypted, not single fields, so FTS5 and vectors keep working (`tests/core/store-verschluesselung.test.ts:76` reads the raw file from the first page, WAL included; `:163` reopens with the key and finds notes, search and settings unchanged) |
| **Key in the system keychain** | 256 random bits, created on first start; macOS Keychain, Windows DPAPI, Linux Secret Service, `KEPTA_DB_KEY` for headless installs |
| **Safe conversion** | An existing base is converted only when K3PTA has it to itself: copy, encrypt, verify every table and the integrity check, replace in one step, overwrite the old file with zeros (`tests/core/store-verschluesselung.test.ts:180` leaves a base another program holds open as plaintext, `:210` keeps the original untouched and removes the copy when the swap fails, `:196` finds only zeros in the old file afterwards — that last one is skipped on Windows, where the swap closes and replaces instead) |
| **Settings inside** | The settings, the AI key included, moved from `settings.json` into the encrypted file |
| **English only** | The German interface switch from 2.10 is gone (`tests/doku-plattform.test.ts:35`) |

## ✅ v2.12 — September 2026: licenses with a name

| Feature | What shipped |
|---|---|
| **Name and number** | Activation stays name and key, offline, and every key carries a license number (`docs/belege/p147-0711/zaehler-vor-3-1-5.log.txt` and `tests/keine-grenzen.test.ts:102`). Since 3.1.1 the sidebar shows the licensee's name with no tier label — the number itself is no longer on screen (it travels with the license state and the activation answer, documented in `docs/belege/p147-0711/zaehler-vor-3-1-5.log.txt` and `tests/keine-grenzen.test.ts:116`) |
| **Revocation** | A revoked license number no longer unlocks K3PTA from the next update on — also where it was already activated (`tests/core/boundary.test.ts:75` and `tests/keine-grenzen.test.ts:102`) |
| **Copy buttons** | Chat, recovery key, system status and the MCP block copy again |

## ✅ v2.13 — September 2026: your memory, every day

| Feature | What shipped |
|---|---|
| **Today** | What is new since the last visit and who added it, open to-dos, what expires soon |
| **Contradictions** | Two notes that name a different time, date, amount, percentage or quantity for the same thing, side by side — keep the newer, the older or both |
| **Dossier** | Everything about a person, a project or a topic on one page — copy as Markdown or keep as a note |
| **AI apps** | Connect Claude Desktop, Claude Code, Cursor, Windsurf and VS Code in one click; live activity with names; a sealed, checkable audit log |
| **Privacy** | The privacy shield before cloud models and for AI apps; private notes |
| **Tiers and deployment (2.13.1)** | Licenses carry the tier and seats; import of ChatGPT and Claude history; centrally managed policies the app enforces (`src/lib/richtlinien.ts`: `chat_cloud`, `machine_scan`, `privacy_shield`); Windows installers. (2.13.3 folded the public Business tier into Enterprise — team memory ships with Enterprise. SSO, the workspaces UI and MDM enrolment did not: they are sold as roadmap, see README.) |
| **This computer only (2.13.2)** | The HTTP server refuses foreign `Host` headers and write requests from other websites (`tests/herkunft.test.ts:76` reads nothing at all behind a foreign Host, live stream included; `:101` allows a network Host only after `KEPTA_HOST` asks for it and keeps foreign websites blocked) |
| **Files next to the database (2.13.4)** | `profile.json`, `scan-config.json` and the sync journal get the same 256-bit key as the knowledge base (AES-256-GCM, `src/core/nebendateien.ts`); older plaintext files are read and re-encrypted on the next write. Readable by design: `endpoint.json` (no secret, it is how local tools find the port) and the inbox with the user's own source files (`tests/testkapsel.test.ts:111` and `tests/scan/walker.test.ts:226`) |

## 🔭 Next (deliberately planned follow-up work)

- **Encrypting the files next to the database** — done in 2.13.4 for the settings and the journals (see the v2.13 table); what is left is the sealed audit *file* sink: it ships as the encrypted `VerschlussteAuditDatei` class in `src/core/nebendateien.ts` and is tested, but the running app keeps its audit trail in the database, so nothing wires the file sink yet
- **Git-based memory versioning** (in the style of Letta context repositories) — every change as a commit in a bare repo next to the DB (`tests/server-stand-wiederherstellen.test.ts:103`)
- **Cross-encoder reranking as a required path** — Qwen3-Reranker-0.6B (arXiv:2506.05176) over the top-20 RRF candidates, once an Ollama rerank API exists; the deterministic local reranker already ships as the seam
- **Bi-temporal edges** (arXiv:2501.13956): `ingested_at`/`invalidated_at` on relations in addition to `valid_from`/`valid_to`
- **Idle-time consolidation** (sleep-time compute, arXiv:2504.13171): a background job produces context prefixes (contextual retrieval, arXiv:2504.19754) and precomputed questions per memory
- **Eval expansion**: LongMemEval subsets (knowledge update + abstention, arXiv:2410.10813) as a regression suite; bge-m3 tri-modal vectors
- **A-MEM evolution** (arXiv:2502.12110): update neighbours on insert (refresh descriptions and tags)

## 📚 Research basis (selection)

- Mem0 — arXiv:2504.19413 · Zep/Graphiti — arXiv:2501.13956 · A-MEM — arXiv:2502.12110
- Oblivion (decay-driven activation) — arXiv:2604.00131 · Sleep-time compute — arXiv:2504.13171
- HippoRAG 2 — arXiv:2502.14802 · Late chunking — arXiv:2409.04701 · Qwen3-Embedding — arXiv:2506.05176
- LongMemEval — arXiv:2410.10813 · LoCoMo — arXiv:2402.17753 · Human-inspired memory (Microsoft) — arXiv:2605.08538

## ⛔ Anti-roadmap (deliberately not doing)

- **Growing the chat into a product** — the chat is a test cockpit (proving mode: retrieval hits, sources visible); day-to-day use runs through Claude Desktop or Cursor via MCP. Not a feature magnet.
- Forced cloud, accounts, hosting — the core promise stays "local and private"
- Our own model infrastructure — Ollama and LM Studio cover it
- Social and collaboration features — maximise single-player value first
