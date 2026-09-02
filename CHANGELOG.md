# Changelog

Alle Änderungen werden in dieser Datei dokumentiert. Format orientiert an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/), Versionierung nach [SemVer](https://semver.org/).

## [2.4.0] — 2026-09-03

Windows kommt dazu. Damit sind alle gaengigen Systeme abgedeckt — vorher war Windows nur ueber den Selbstbau erreichbar.

### Neu
- **Windows:** NSIS-Installer und ZIP fuer `x64` und `arm64`, gebaut im neuen Job `release-windows` auf `windows-latest`. Der Installer laesst den Zielordner waehlen und installiert pro Benutzer, ohne Administratorrechte.
- **Plattform im Dateinamen:** Das Schema heisst jetzt `KEPTA-<version>-<plattform>-<arch>.<ext>`. Ohne die Plattform waeren `KEPTA-<version>-x64.zip` von macOS und von Windows namensgleich gewesen und haetten sich im Release **gegenseitig ueberschrieben** — gefunden beim Hinzufuegen des Windows-Jobs, bevor es jemanden getroffen hat.
- **Erststart-Anleitung fuer Windows** in Release-Notes und README: Der Installer ist ebenfalls unsigniert, SmartScreen blockiert den ersten Start.

### Geaendert
- README-Badge nennt jetzt macOS, Windows und Linux — vorher fehlte Windows trotz vorhandener Absicht.
- ROADMAP: Der Punkt „Windows-CI-Build" ist erledigt und daher aus den Folgearbeiten entfernt.

## [2.3.0] — 2026-09-03

Vertriebs-Release: Bis 2.2.1 konnten nur Macs mit Apple Silicon die App herunterladen. Jetzt sind Intel-Macs und Linux dabei.

### Neu
- **Intel-Macs (x64):** `electron-builder.json` hatte keine `arch`-Angabe, gebaut wurde deshalb nur die Architektur des CI-Runners — arm64. Ab jetzt entstehen DMG und ZIP fuer `arm64` **und** `x64`.
- **Linux:** AppImage und deb, jeweils fuer `x64` und `arm64`. Eigener Workflow-Job `release-linux` auf `ubuntu-latest`, da sich Linux-Pakete auf einem macOS-Runner nicht bauen lassen. Neues Skript `npm run build:linux`.
- **Architektur im Dateinamen:** electron-builder haengt sie standardmaessig nur bei arm64 an — der Intel-Build hiesse blosz `KEPTA-2.3.0.dmg` und waere nicht unterscheidbar. `artifactName` erzwingt jetzt `KEPTA-<version>-<arch>.<ext>` fuer alle Pakete.

### Fixes
- **Falsches Plattform-Versprechen:** README und Badge kuendigten „macOS | Linux" und „DMG/snap" an; ein Linux-Paket gab es nie und snap war nie konfiguriert. README nennt jetzt exakt die Dateien, die es wirklich gibt, samt Erststart-Anleitung fuer Linux.

### Dokumentation
- Release-Notes liegen in `.github/release-notes.md` und werden von **beiden** Release-Jobs per `body_path` eingebunden — eine Quelle statt zwei driftender Kopien, und die Reihenfolge der Jobs ist damit egal.
- Tabelle „Welche Datei brauche ich?" in README und Release-Notes, inklusive Hinweis, wie man die eigene Mac-Architektur feststellt.

## [2.2.1] — 2026-09-03

Hotfix: 2.2.0 liess sich nicht starten. Wer 2.2.0 installiert hat, sollte auf 2.2.1 wechseln.

### Fixes
- **App startet wieder (Regression aus 2.2.0):** In `electron.js` stand `srv.address.port` statt `srv.address().port`. `address` ist eine Methode — als Eigenschaft gelesen liefert sie `undefined`. `getFreePort()` hat daraufhin nicht abgelehnt, sondern `undefined` aufgeloest, wodurch der `catch`-Zweig nie griff und dabei den Standardport 3000 ueberschrieb. Zwei Zeilen spaeter warf `serverPort.toString()` einen `TypeError`, und zwar **ausserhalb** des `try`-Blocks — `createWindow()` wurde deshalb nie erreicht. Symptom: Der Prozess lief, aber ohne Fenster, ohne belegten Port und ohne Absturzbericht.
- **Startsequenz gehaertet:** `getFreePort()` lehnt jetzt ab, wenn kein Port ermittelbar ist; der `catch`-Zweig stellt den Standardport 3000 tatsaechlich wieder her; vor `process.env.PORT` prueft `Number.isInteger` auf einen brauchbaren Wert, und `String(...)` ersetzt `.toString()`. Ein fehlender Port kann die App damit nicht mehr fensterlos machen.

### Tests
- Neu: `tests/electron.test.ts` mit 5 Regressionstests. Da `electron.js` als ESM-Einstiegspunkt beim Import die App starten wuerde, loest der Test `getFreePort()` aus der **echten Quelldatei** heraus und fuehrt sie gegen das echte `net`-Modul aus — geprueft wird der ausgelieferte Code, keine Kopie. Dazu Wachen gegen den Eigenschaftszugriff `.address.port` und fuer den 3000-Fallback.
- Gesamtstand: **279 Tests** (vorher 274), Coverage-Gate unveraendert gruen, Retrieval-Eval unveraendert (Hit@1 92 %, Precision@5 92 %).

## [2.2.0] — 2026-09-02

Security- & Robustheits-Release: Code-Review-Fixes an Server, Core, Electron und Protokoll.

### Security
- **Bind-Adresse:** der Server lauscht jetzt nur auf `127.0.0.1` statt `0.0.0.0` (die API hat keine Auth); Override bewusst via `KEPTA_HOST`
- **SSRF-Schutz (URL-Clipper):** IP-Literale in allen Schreibweisen (Dezimal/Hex/Oktal/IPv4-mapped IPv6) werden normiert geprüft, DNS wird via `node:dns` aufgelöst und ALLE resultierenden IPs (v4+v6) gegen Loopback/Privat/Link-Local/CGNAT/Unique-Local geprüft; Redirects werden manuell gefolgt (max. 5 Hops, jeder Hop voll geprüft); toter Port-Check entfernt; `clearTimeout` im `finally`
- **Body-Limit-Reihenfolge:** Import-Routen sind jetzt vor dem globalen 1mb-Limit registriert — `/api/memories/import` (2mb) und `/api/import/markdown` (10mb) werfen für große Backups kein 413 mehr; das globale 1mb-Limit bleibt für alle übrigen Routen aktiv
- **Chat-Proxy:** fehlendes `messages`-Array → sauberes 400 statt TypeError; Client-Disconnect bricht den Upstream-Request ab (AbortController)

### Retrieval & Embeddings
- **Embedding-Modellmix behoben:** der Vektorvergleich läuft nur noch zwischen Query und Chunks desselben Modells; nach einem Modellwechsel wählt `chunksNeedingEmbedding` Modell-Mismatches und die Hintergrund-Queue re-embeddet (nicht blockierend)
- FTS-Tokenizer nutzt Unicode-Klassen (`\p{L}\p{N}`) — kyrillische und CJK-Queries finden jetzt Treffer

### Server & Core
- **Store-Kappe 1000 → 5000:** `/api/memories`, Markdown-Export und Replace-Import listen vollständig (Paginierung statt stiller Abschneidung bei >1000 Knoten)
- Replace-Import mit doppelten IDs antwortet sauber mit 409 statt 500; doppelte IDs in Backups werden dedupliziert
- Tag-Filter escaped LIKE-Wildcards (`%`, `_`, `\`) mit `ESCAPE`-Klausel — `a_b` matcht nicht mehr `axb` (API + MCP `memory_list`)
- MCP-Protokoll (2026-07-28): fehlendes `jsonrpc`-Feld wird toleriert, falscher Wert → `-32600`; Notifications für unbekannte Methoden bleiben unbeantwortet; Batch-Requests → ein Error-Objekt (Batching wurde in 2026-07-28 gestrichen); nicht-numerisches `limit` → sauberer Default statt NaN
- Import behält `createdAt`/`updatedAt` aus der Backup-Datei (optionaler Timestamp-Parameter); Obsidian-Resync überspringt unveränderte Notizen, statt das Frontmatter-Datum zu überschreiben
- Sanitizing entschärft: Steuerzeichen/NUL werden überall bereinigt, HTML-Stripping nur noch beim Roh-HTML-Ingest (URL-Clipper) — Code-Beispiele in Memories bleiben unversehrt (Frontend rendert via react-markdown)
- DB-Change-Watcher vergleicht Zähler/Zeitstempel getrennt statt `parseInt` auf einem Fingerprint-String
- `npm start` ohne `NODE_ENV` liefert jetzt zuverlässig das statische `dist/` statt des Vite-Dev-Servers (Vite nur noch ohne Build und außerhalb der Produktion)
- MCP-stdio: Antworten werden serialisiert auf stdout geschrieben (Verarbeitung bleibt parallel)
- Listen-Fehler (z. B. EADDRINUSE) beenden den Server mit klarer Logausgabe

### Electron
- Server startet VOR dem Fenster; Lade-Logik pollt `/api/health` (30 s statt blindem 5×-TCP-Retry)
- CSP ohne `'unsafe-inline'` für Scripts im gepackten Build (dist/index.html hat keine Inline-Scripts); Dev-Modus mit Vite-Refresh bleibt funktionsfähig
- `NODE_ENV=production` nur noch für gepackte Apps

### Wartbarkeit
- Neue Versions-Quelle `src/core/version.ts` (v2.2.0): Health-Endpoint, MCP `SERVER_INFO` und package.json teilen sich `APP_VERSION` (Test gegen Drift)
- Build-Only-Dependencies (vite, @vitejs/plugin-react, @tailwindcss/vite, tailwindcss, autoprefixer) in `devDependencies` — das gepackte App-Bundle braucht sie zur Laufzeit nicht
- CI: Release-Job auf Node 22, `electron-builder`-Build bricht die CI bei Fehlern (kein `|| true` mehr)
- `src/lib/semantic.ts`: Embedding-Suche POSTet den Bestand in Batches (max 100 Items bzw. ~700k Zeichen pro Request) statt alles in einem Payload
- Dokumentation aufgeräumt (AGENTS.md, README, `.env.example` mit den wirklich gelesenen Variablen, AI-Studio-Reste entfernt); Testsuite: 270 Tests

## [2.1.0] — 2026-09-02

### Fixes (UI)
- **Chat-Header:** zeigt jetzt den echten KI-Verbindungsstatus statt fälschlich „OpenAI (GPT) · gpt-4o-mini". Ohne verbundene KI → „Keine KI verbunden" (grauer Status-Dot). Lokale KI (Ollama/LM Studio) wird automatisch erkannt und per Ein-Klick verbunden (neue Funktion `resolveAIConnection`, 5 Unit-Tests).
- **Wissens-Karten:** Tag-Footer überlappt den Inhaltstext nicht mehr — `MemoryCard` auf 3-Zeilen-Grid umgestellt, Layout-Animation entschärft (`layout="position"`).

### Tests & Qualität
- Test-Suite von 42 auf **236 Tests** ausgebaut; Gesamt-Coverage **~91 %** (Kern `src/core` **100 % der Funktionen**)
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
