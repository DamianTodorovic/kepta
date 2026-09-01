# 🗺️ KEPTA Roadmap — v2.0 und darüber hinaus

> Stand: September 2026 · Ersetzt die `WHITE-SPACE-ANALYSE.md` (v1.0-Analyse, deren Quick Wins und Big Bets sind umgesetzt).

## ✅ Erreicht in v1.x (aus der White-Space-Analyse)

- [x] Backup-Import (JSON) · Streaming-Antworten + Stop · Markdown-Rendering
- [x] Ollama-/LM-Studio-Modell-Discovery · Quellen-Zitate im Chat
- [x] Speicher-Engine außerhalb localStorage (`memories.json`, atomare Writes)
- [x] MCP-Server (stdio + HTTP) · Command Palette · Token-Budget · Web-Clipper
- [x] Hybrid-Suche TF-IDF + BM25 (+ optionale Embeddings)

## 🎯 v2.0 — SOTA-Agenten-Gehirn (2026-07-28-Standard)

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
- **Reranking als Pflicht-Pfad** (Cross-Encoder via Ollama), heute optionaler Schalter
- **Windows-CI-Build** (electron-builder win) — Windows aktuell build-from-source
- **Evals ausbauen** — Precision@5-Subset erweitern Richtung LoCoMo/LongMemEval-Teilmengen

## ⛔ Anti-Roadmap (bewusst nicht tun)

- Cloud-Zwang, Accounts, Hosting — Kernversprechen bleibt „lokal & privat"
- Eigene Modell-Infrastruktur — Ollama/LM Studio decken das ab
- Social/Collaboration — Single-Player-Wert zuerst maximieren
