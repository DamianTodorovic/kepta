# 🗺️ KEPTA Roadmap — v2.0 and beyond

> As of September 2026 · Replaces `WHITE-SPACE-ANALYSE.md` (the v1.0 analysis, whose quick wins and big bets are all shipped).

## ✅ Done in v1.x (from the white-space analysis)

- [x] Backup import (JSON) · streaming answers + stop · Markdown rendering
- [x] Ollama and LM Studio model discovery · source citations in chat
- [x] Storage engine outside localStorage (`memories.json`, atomic writes)
- [x] MCP server (stdio + HTTP) · command palette · token budget · web clipper
- [x] Hybrid search TF-IDF + BM25 (+ optional embeddings)

## 🎯 v2.0 — a state-of-the-art agent brain (✅ released 2026-09-01)

| Building block | Goal |
|---|---|
| **Storage** | SQLite (`node:sqlite`) with FTS5: trash instead of hard delete, memory types (semantic/episodic/procedural), scope (user/agent/session), temporal validity (`valid_from`/`valid_to`), supersede chains |
| **Vectors** | Persistent chunk embeddings via Ollama (`nomic-embed-text`), an embed-on-write queue instead of re-embedding per query |
| **Retrieval** | FTS5 BM25 + vector KNN + entity match → RRF fusion → recency boost + temporal filter → optional reranker. **One** code path for UI, HTTP API and MCP |
| **Knowledge graph** | Entities and relations (from `[[wiki links]]` and auto-extraction), a graph view built on real edges |
| **MCP** | Protocol 2026-07-28 (stateless core, `server/discover`, `_meta` versioning) with legacy compatibility; 8 tools with `outputSchema`/`structuredContent`; Streamable HTTP + stdio |
| **Lifecycle** | Auto-consolidation (embedding duplicates, conflict and supersede detection), auto-tagging, episodic memory from chats |
| **Interop** | Obsidian vault import (frontmatter + wiki links) and Markdown export |
| **Quality** | `strict` TypeScript, vitest tests (storage/engine/MCP/interop), CI with a test job and audit |

## ✅ v2.6.0 — English interface (released 2026-09-03)

Every user-facing string, the MCP tool descriptions, the starter pack and the
native date controls are English. German survives where it is a feature, not a
default: the search stopword list stays bilingual, so German notes keep working.
A language switch back to German is possible later — the strings would need
extracting into a catalogue first.

## ✅ v2.6.15 — September 2026: wave 1, the white-space features

| Feature | What shipped |
|---|---|
| **Time-travel search** | `asOf` on `memory_search` and `POST /api/search` — ask what was known at any moment; time-travelled queries never count as access |
| **Write gate** (Mem0, arXiv:2504.19413) | Opt-in via `KEPTA_WRITE_GATE=on`: the local LLM classifies each new memory as ADD/UPDATE/DELETE/NOOP on both save paths; unreachable LLM degrades to ADD |
| **Local reranking** | Deterministic reranker (term coverage, phrase, title, tags) as a bounded boost after RRF, exposed as `rerankScore` — the seam for the cross-encoder below |
| **Praxis-Sync** | Device-to-device scope transfer as an AES-256-GCM bundle (scrypt passphrase) with a tamper-evident hash-chained transfer ledger (`~/.kepta/sync-journal.jsonl`) |
| **Encryption at rest — evaluated** | Honest assessment in `docs/encryption-eval.md`: SQLCipher needs a build switch, `PRAGMA key` silently does nothing on node:sqlite, the KeyProvider seam is free (~0 ms); recommendation: OS-level encryption + wave-2 field encryption design |
| **Interface: Onyx** | True-black dark theme, champagne accent, serif display type, radius hierarchy, local rerank-aware index strip — every surface reworked |

## 🔭 Next (deliberately planned follow-up work)

- **Encryption at rest, wave 2** — the evaluation is done (`docs/encryption-eval.md`); what remains is the field-level encryption design over the existing KeyProvider seam (search trade-off to be solved honestly)
- **Git-based memory versioning** (in the style of Letta context repositories) — every change as a commit in a bare repo next to the DB
- **Cross-encoder reranking as a required path** — Qwen3-Reranker-0.6B (arXiv:2506.05176) over the top-20 RRF candidates, once an Ollama rerank API exists; the deterministic local reranker already ships as the seam
- **Praxis-Sync UI** — the bundle/ledger core ships; an export/import flow with a passphrase dialog is the next step
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
