# 🗺️ KEPTA Roadmap — v2.0 und darüber hinaus

> Stand: September 2026 · Ersetzt die `WHITE-SPACE-ANALYSE.md` (v1.0-Analyse, deren Quick Wins und Big Bets sind umgesetzt).

## ✅ Erreicht in v1.x (aus der White-Space-Analyse)

- [x] Backup-Import (JSON) · Streaming-Antworten + Stop · Markdown-Rendering
- [x] Ollama-/LM-Studio-Modell-Discovery · Quellen-Zitate im Chat
- [x] Speicher-Engine außerhalb localStorage (`memories.json`, atomare Writes)
- [x] MCP-Server (stdio + HTTP) · Command Palette · Token-Budget · Web-Clipper
- [x] Hybrid-Suche TF-IDF + BM25 (+ optionale Embeddings)

## 🎯 v2.0 — SOTA-Agenten-Gehirn (✅ released 2026-09-01)

| Baustein | Ziel |
|---|---|
| **Storage** | SQLite (`node:sqlite`) mit FTS5: Papierkorb statt Hard-Delete, Memory-Typen (semantic/episodic/procedural), Scope (user/agent/session), temporale Gültigkeit (`valid_from`/`valid_to`), Superseded-Ketten |
| **Vektoren** | Persistente Chunk-Embeddings via Ollama (`nomic-embed-text`), Embedding-on-Write-Queue statt Re-Embedding pro Suchanfrage |
| **Retrieval** | FTS5-BM25 + Vektor-KNN + Entity-Match → RRF-Fusion → Recency-Boost + Temporal-Filter → optionaler Reranker. **Ein** Code-Pfad für UI, HTTP-API und MCP |
| **Knowledge Graph** | Entities + Relations (aus `[[Wiki-Links]]` und Auto-Extraktion), Graph-Ansicht auf echten Kanten |
| **MCP** | Protokoll 2026-07-28 (stateless core, `server/discover`, `_meta`-Versioning) mit Legacy-Kompatibilität; 8 Tools mit `outputSchema`/`structuredContent`; Streamable HTTP + stdio |
| **Lifecycle** | Auto-Konsolidierung (Embedding-Duplikate, Konflikt-/Superseded-Erkennung), Auto-Tagging, episodic Memory aus Chats |
| **Interop** | Obsidian-Vault-Import (Frontmatter + Wiki-Links) und Markdown-Export |
| **Qualität** | `strict`-TypeScript, vitest-Tests (Storage/Engine/MCP/Interop), CI mit Test-Job + Audit |

## 🔭 Danach (bewusst geplante Folgearbeiten)

- **Verschlüsselung at rest** — benötigt native Bindings (SQLCipher) oder Feldverschlüsselung; ehrlich bewerten statt halb versprechen
- **Git-basierte Memory-Versionierung** (Letta Context-Repositories-Stil) — jede Änderung als Commit in einem Bare-Repo neben der DB
- **Cross-Encoder-Reranking als Pflicht-Pfad** — Qwen3-Reranker-0.6B (arXiv:2506.05176) über die Top-20-RRF-Kandidaten, sobald Ollama-Rerank-API verfügbar
- **Mem0-Write-Gate** (arXiv:2504.19413): LLM klassifiziert ADD/UPDATE/DELETE/NOOP beim Speichern statt nur Embedding-Dedup
- **Bi-temporale Kanten** (arXiv:2501.13956): zusätzlich zu valid_from/valid_to auch ingested_at/invalidated_at auf Relationen
- **Idle-Time-Konsolidierung** (Sleep-time Compute, arXiv:2504.13171): Hintergrundjob erzeugt Kontext-Prefixe (Contextual Retrieval, arXiv:2504.19754) und vorberechnete Fragen pro Memory
- **Eval-Erweiterung**: LongMemEval-Teilmengen (Knowledge-Update + Abstention, arXiv:2410.10813) als Regressionssuite; bge-m3 tri-modale Vektoren
- **A-MEM-Evolution** (arXiv:2502.12110): Nachbarn beim Insert aktualisieren (Beschreibungen/Tags refreshen)

## 📚 Forschungs-Basis (Auswahl)

- Mem0 — arXiv:2504.19413 · Zep/Graphiti — arXiv:2501.13956 · A-MEM — arXiv:2502.12110
- Oblivion (Decay-Driven Activation) — arXiv:2604.00131 · Sleep-time Compute — arXiv:2504.13171
- HippoRAG 2 — arXiv:2502.14802 · Late Chunking — arXiv:2409.04701 · Qwen3-Embedding — arXiv:2506.05176
- LongMemEval — arXiv:2410.10813 · LoCoMo — arXiv:2402.17753 · Human-Inspired Memory (Microsoft) — arXiv:2605.08538

## ⛔ Anti-Roadmap (bewusst nicht tun)

- **Chat-Feature-Ausbau** — der Chat ist Test-Cockpit (Beweis-Modus: Retrieval trifft, Quellen sichtbar); der Alltag der Nutzer läuft über Claude Desktop/Cursor via MCP. Kein Feature-Magnet.
- Cloud-Zwang, Accounts, Hosting — Kernversprechen bleibt „lokal & privat"
- Eigene Modell-Infrastruktur — Ollama/LM Studio decken das ab
- Social/Collaboration — Single-Player-Wert zuerst maximieren
