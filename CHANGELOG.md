# Changelog

Alle Änderungen werden in dieser Datei dokumentiert. Format orientiert an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/), Versionierung nach [SemVer](https://semver.org/).

## [Unreleased]

### Tests & Qualität
- Test-Suite von 42 auf **231 Tests** ausgebaut; Gesamt-Coverage **~91 %** (Kern `src/core` **100 % der Funktionen**)
- Vitest v8-Coverage mit Schwellen als **CI-Gate** (`npm run test:cov`) — Regressionen der Abdeckung brechen die CI
- Neue Testabdeckung: `migrate.ts` (Legacy-JSON-Migration, vorher 0 %), `embeddings.ts` (Chunking/Cosine/Queue), `src/lib/*` unter jsdom (Provider, Profil, SSE, fetch-Client, Tokenizer), `server.ts` (HTTP + `/mcp` + Chat-Proxy via supertest), UI-Kernkomponenten (Testing-Library)
- `server.ts`: `createApp(store)` als testbarer Export ausgelagert (Bootstrap/`listen` getrennt)
- CI: `build.yml` um Coverage-Gate, Retrieval-Eval und GitHub-nativen Coverage-Job-Summary erweitert; Coverage-/CI-/Tests-Badges im README

## [2.0.0] — 2026-09-01

Der SOTA-Release: KEPTA wird vom Notizspeicher zum vollwertigen Agenten-Gedächtnis.

### Storage (Breaking: JSON → SQLite)
- SQLite via `node:sqlite` (kein nativer Build, FTS5 inklusive), WAL-Modus, Datei `~/.kepta/kepta.db`
- Automatische, idempotente Migration aus `memories.json` mit Backup nach `~/.kepta/backup/`
- Memory-Modell v2: `scope` (user/agent/session), `type` (semantic/episodic/procedural), `confidence`, `valid_from`/`valid_to`, `superseded_by`, `deleted_at` (Papierkorb statt Hard-Delete), Retention-Spalten (`last_access_at`, `access_count`, `utility`)
- Entitäten + Relationen (leichter Wissensgraph) mit eigener Gültigkeit

### Retrieval
- Eine Engine für UI, HTTP-API und MCP (vorher 3 duplizierte Suchpfade; Agenten bekamen die schlechteste Suche)
- Pipeline: FTS5-BM25 + Vektor-KNN (persistente Chunk-Embeddings, Float32-BLOBs) + Entity-Match → RRF-Fusion (k=60) → Recency/Konfidenz-Boosts → temporale Abwertung (abgelaufen ×0.5, ersetzt ×0.4) → Oblivion-Retention-Faktor
- Embedding-Hintergrund-Queue via Ollama (`nomic-embed-text` Default, konfigurierbar); ohne Ollama läuft alles rein lexikalisch
- Konsolidierung: Dubletten über Embedding-Ähnlichkeit (≥0.92) + lexikalischer Fallback → supersede statt löschen

### MCP
- Protokoll `2026-07-28` (stateless core, `server/discover`, `_meta`-Versioning), kompatibel zu `2025-06-18` und `2024-11-05`
- 8 Tools mit `outputSchema` + `structuredContent`: `memory_search`, `memory_save`, `memory_update`, `memory_delete`, `memory_list`, `memory_graph`, `memory_consolidate`, `memory_forget`
- Neuer Transport: Streamable HTTP (`POST /mcp`) neben stdio
- `[[Wiki-Links]]` beim Speichern → Entitäten + `mentions`-Relationen

### Interop & UI
- Obsidian-Import (Markdown + YAML-Frontmatter, Wiki-Links → Graph) und -Export (`.md`-Dateien nach `~/.kepta/export/`)
- Dashboard-Suche jetzt gegen die Server-Engine (lokal instant, Server asynchron); Papierkorb-Ansicht mit Wiederherstellen
- MemoryCard: Typ-Badges + ABGELAUFEN/ERSETZT-Marker; KnowledgeGraph nutzt echte Relationen
- Chat: date-aware Prompting (Heute-Datum + Gültigkeits-Marker im Kontext)

### Qualität
- TypeScript `strict: true`; 42 vitest-Tests (Store, Engine, MCP-Protokoll, Obsidian-Interop, Suche)
- CI: Node 22, `npm test` + `npm audit` im Build-Job
- Eval-Harness (`npm run eval`): Fixkorpus mit 25 Queries → Hit@1 76% → 92%, Precision@5 84% → 92% (vs. v1-Substring-Suche, rein lexikalisch)

### Entfernt
- Tote `firebase`-Dependency (AuthContext war bereits lokaler No-Op-Stub) und Firestore-Reste
- Doppeltes Lockfile (`bun.lock`), Repo-Artefakt `project.tar.gz`
- Duplizierte Suchimplementierungen in `server.ts`/`mcp-server.ts`

## [1.0.0 – 1.0.4] — 2026-08-31

- Erste öffentliche Version: lokale Knoten mit Tags, hybride TF-IDF+BM25-Suche, 20 KI-Provider + Ollama/LM Studio, SSE-Streaming, MCP-stdio-Server (3 Tools), JSON-Export, Inbox-Watcher, URL-Clipper, Onboarding-Wizard, macOS-DMG + Linux-snap.
