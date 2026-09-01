<p align="center">
  <img src="public/kepta-logo.svg" width="88" height="88" alt="KEPTA Logo">
</p>
<h1 align="center">KEPTA — Keeps what counts</h1>
<p align="center">
  <strong>The local brain for AI agents. No cloud. No subscription.</strong><br>
  SQLite + hybrid retrieval + knowledge graph + MCP. All on your device.
</p>
<p align="center">
  <a href="https://github.com/DamianTodorovic/kepta/releases"><img alt="Release" src="https://img.shields.io/github/v/release/DamianTodorovic/kepta?label=Download"></a>
  <a href="LICENSE"><img alt="License MIT" src="https://img.shields.io/badge/License-MIT-black"></a>
  <a href="https://github.com/DamianTodorovic/kepta/issues"><img alt="Issues" src="https://img.shields.io/github/issues/DamianTodorovic/kepta"></a>
  <img alt="Platform macOS" src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux-lightgrey">
</p>

---

**KEPTA** is a local-first second brain that your AI agents actually share: one memory store exposed over **MCP** (stdio + Streamable HTTP, protocol `2026-07-28`) and a local HTTP API. It is built agent-native — not a notes app with an API bolted on:

- **Memory types** — semantic (facts), episodic (events), procedural (how-tos)
- **Temporal validity** — `valid_from`/`valid_to`, supersede chains, `memory_forget`; expired facts are down-ranked, not silently served
- **Retention decay** (Oblivion, arXiv:2604.00131) — memories that are never accessed become less accessible, without deletion
- **Hybrid retrieval** — SQLite FTS5 (BM25) + persistent chunk embeddings (Ollama) + entity match, fused via **Reciprocal Rank Fusion**
- **Knowledge graph** — entities & relations (`[[Wiki-Links]]` become graph edges) across all memories
- **Consolidation** — embedding-based duplicate detection; older copies get superseded, never deleted
- **Obsidian interop** — Markdown + frontmatter import/export as first-class citizen

> No login, no cloud. API keys stay in your `localStorage`. Your memory never leaves your device.

**Eval (fixed corpus, 25 queries, lexical-only — no embeddings):** Hit@1 **76% → 92%** and Precision@5 **84% → 92%** versus the v1 substring search. Run it yourself: `npm run eval`. The remaining failures are cross-lingual/stemming cases ("Wissensgraph" vs "Knowledge Graph") — exactly what the vector path fixes when Ollama is running.

### Why KEPTA instead of Obsidian (or Mem0)?

| | Obsidian | Mem0 / Letta | **KEPTA** |
|---|---|---|---|
| Purpose | Human notes | Agent memory SDK/Docker | **Agent memory with a real GUI** |
| Memory types / temporal validity | — | ✓ | **✓** |
| MCP as first-class citizen | via plugins | ✓ | **✓ (stdio + Streamable HTTP, 8 typed tools)** |
| Installable desktop app | ✓ | ✗ | **✓** |
| Local-only, MIT | free, closed source | partly cloud | **✓** |

Obsidian is a great editor for humans; its data model (markdown files) is its agent limit. KEPTA's data model *is* agent memory — and still speaks Markdown.

---

## Download

1. Grab the latest from **[Releases](https://github.com/DamianTodorovic/kepta/releases)**
2. **macOS:** `KEPTA-2.0.0-arm64.dmg` → open → drag to Applications · **Linux:** `*.snap` · **Windows:** build from source
3. First start: the onboarding wizard asks for your name/goal and detects local models (Ollama `:11434`, LM Studio `:1234`).

## From source (developers)

Requires **Node 22.5+** (built-in `node:sqlite`) and **npm**.

```bash
git clone https://github.com/DamianTodorovic/kepta.git
cd kepta
npm install
npm test           # vitest suite (42 tests: store, engine, mcp, obsidian, search)
npm run eval       # retrieval eval vs. v1 baseline
npm run dev        # server + Vite (http://localhost:3000)
npm run electron   # second terminal: Electron shell
```

Production build: `npm run build` (Vite + `dist/server.cjs` + `dist/mcp-server.cjs`), `npm run build:mac` for the DMG.

## MCP — one memory for every AI

**MCP protocol `2026-07-28`** (stateless core, `server/discover`, legacy `2025-06-18`/`2024-11-05` compatible). Transports: **stdio** and **Streamable HTTP** (`POST /mcp` on the local server). 8 tools, all with typed schemas and structured outputs:

| Tool | Purpose |
|---|---|
| `memory_search` | hybrid retrieval (query, limit, tags, type, scope) with score components + expired/superseded flags |
| `memory_save` | create/update, `[[wiki-links]]` → entities, optional type/scope/confidence/validity |
| `memory_update` | patch a memory |
| `memory_delete` | trash (default) or permanent |
| `memory_list` | paginated listing, incl. trash |
| `memory_graph` | entities & relations around a node |
| `memory_consolidate` | duplicate detection (dry_run default) → supersede |
| `memory_forget` | temporal invalidation: `expire` / `supersede` / `delete` |

Claude Desktop / Cursor (`mcp.json`):
```json
{
  "mcpServers": {
    "kepta": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/kepta/dist/mcp-server.cjs"]
    }
  }
}
```

HTTP quick check:
```bash
curl http://localhost:3000/api/health | jq
curl -X POST http://localhost:3000/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"server/discover"}' | jq
curl -X POST http://localhost:3000/api/search -H 'Content-Type: application/json' \
  -d '{"query":"deployment","topK":5}' | jq
```

Other endpoints: `GET /api/memories` (ETag, `?trash=1`) · `GET /api/memories/search?q=&limit=&tags=` · `POST /api/memory` · `POST /api/memories/import` (JSON backup) · `POST /api/import/markdown` (Obsidian vault) · `POST /api/export/markdown` (writes `.md` files to `~/.kepta/export/`) · `GET /api/graph` · `DELETE /api/memories/:id` (trash, `?permanent=1`) · `POST /api/memories/:id/restore` · `POST /api/clip` (SSRF-guarded) · `POST /api/chat|/api/chat/stream` · `POST /api/models` · `GET /api/inbox/status`

## Data & privacy

- Memory: **`~/.kepta/kepta.db`** (SQLite, WAL) — automatic one-time migration with backup to `~/.kepta/backup/`
- Vault export: `~/.kepta/export/` · Inbox: `~/.kepta/inbox/` (auto-import → `archive/`)
- Nothing leaves the device. Optional Ollama embeddings run locally too.
- Hardened: helmet, rate limits, localhost-only CORS, SSRF blocking, XSS sanitization, path-traversal checks, sandboxed Electron.

## Security

Local-first, hardened: `helmet`, `express-rate-limit` (global 180/min, chat 20/min, clip 12/min), `express.json 1mb`, `CORS` only localhost, SSRF block (private IPs, `169.254`, `file://`), XSS sanitize, path-traversal checks, Electron `nodeIntegration:false, contextIsolation:true, sandbox:true` + CSP. No keys in logs.

## Entwicklung

```bash
npm run lint          # tsc --noEmit (strict)
npm test              # vitest
npm run eval          # Precision@5 / Hit@1 / MRR
```

Stack: Electron 44, React 19, Vite 6, Tailwind 4, Express 4, SQLite (`node:sqlite`, FTS5). Keine Cloud-SDKs im Runtime-Pfad.

---

# DE — Kurzversion

**KEPTA** ist ein lokales Second Brain für dich **und** deine KI-Agenten: ein gemeinsames Gedächtnis (`~/.kepta/kepta.db`), erreichbar über MCP (stdio + Streamable HTTP, Protokoll `2026-07-28`) und eine lokale HTTP-API. Agenten können suchen, speichern, aktualisieren, vergessen (`memory_forget`), konsolidieren und den Wissensgraph lesen — mit typisierten Schemas statt Freitext-Grep.

Kernfeatures: Memory-Typen (Wissen/Episoden/Abläufe), temporale Gültigkeit mit Ersetzungs-Ketten, Retention-Zerfall (vergessen ohne löschen), hybride Suche (FTS5-BM25 + persistente Embeddings via Ollama + Entitäten → RRF-Fusion), leichter Wissensgraph über `[[Wiki-Links]]`, Obsidian-Import/-Export (Markdown + Frontmatter), 20 KI-Provider + lokale Modelle, Onboarding-Wizard, Inbox-Auto-Import, URL-Clipper, Chat mit Quellen und Token-Budget.

Eval (Fixkorpus, 25 Queries, rein lexikalisch): Hit@1 **76% → 92%**, Precision@5 **84% → 92%** gegenüber der v1-Suche — `npm run eval`. Voraussetzung Node 22.5+. Lizenz MIT.

---

**KEPTA** — gebaut für Fokus. Behält, was zählt.
