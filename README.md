<p align="center"><img src="public/kepta-logo.svg" width="88" alt="KEPTA"></p>
<h1 align="center">KEPTA — Behält, was zählt</h1>
<p align="center"><strong>Das lokale Gehirn für deine KI-Agenten. Ohne Cloud. Ohne Abo.</strong><br>SQLite + hybride Suche + Wissensgraph + MCP.</p>

<p align="center"><a href="https://github.com/DamianTodorovic/kepta/releases"><img alt="Release" src="https://img.shields.io/github/v/release/DamianTodorovic/kepta?label=Download"></a> <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/License-MIT-black"></a> <img alt="Platform" src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux-lightgrey"></p>

## 🎬 So sieht KEPTA aus

**Demo-Video:** [`docs/demo.webm`](docs/demo.webm)

| Index & hybride Suche | Wissensgraph |
|---|---|
| ![Index](docs/screenshots/01-index.png) | ![Graph](docs/screenshots/03-graph.png) |
| **Editor (Typ, Gültigkeit, Konfidenz)** | **System-Status (Setup-Diagnose)** |
| ![Editor](docs/screenshots/04-editor.png) | ![Status](docs/screenshots/05-system-status.png) |

## 🎯 Use Cases

1. **Ein Gehirn für alle KI-Tools** — Claude Desktop, Cursor & Co. teilen dieselbe Wissensbasis per MCP. Was ein Agent lernt, weiß der nächste sofort.
2. **Agenten klug halten statt verrotten lassen** — Typ, Gültigkeit, Konfidenz; Widersprüche werden ersetzt (ERSETZT-Kette), Abgelaufenes markiert.
3. **Second Brain** — Notizen/Projekte/Wissen semantisch auffindbar („was koche ich mit Nudeln" findet das Rezept).
4. **Wissen ohne Friction** — Dateien reinziehen (PDF/MD/TXT), URLs clippen, Inbox-Ordner beobachten, Chat-Antworten speichern.
5. **Obsidian-Brücke** — Vault-Import/-Export (Markdown+Frontmatter); `[[Wiki-Links]]` werden zu Graph-Kanten.
6. **Privat** — alles lokal in `~/.kepta/`, MIT, kein Konto.
7. **Recherche** — Wissensgraph mit echten Verbindungen, Duplikat-Erkennung, Papierkorb mit Undo.
8. **Dev-Setup in 2 Minuten** — MCP-Config kopieren, `POST /mcp` (2026-07-28, 8 Tools), HTTP-API, `npm run eval` (Hit@1 92 %).

## ⚡ Quick-Start

```bash
git clone https://github.com/DamianTodorovic/kepta.git && cd kepta
npm install && npm test && npm run eval
npm run dev        # http://localhost:3000
npm run electron   # Desktop-Shell (optional)
```

Fertige App: [Releases](https://github.com/DamianTodorovic/kepta/releases) (DMG/snap, Node ≥ 22.5). Agent anbinden:

```json
{ "mcpServers": { "kepta": { "command": "node", "args": ["/PFAD/kepta/dist/mcp-server.cjs"] } } }
```

## 🧠 Warum KEPTA?

Obsidian ist großartig für Menschen — aber Markdown ist kein Gedächtnis (keine Typen, Gültigkeit, kein MCP). Mem0/Letta sind SDKs ohne GUI. **KEPTA ist beides**: agent-native Memory-Schicht mit Desktop-App, lokal, MIT. Eval: Hit@1 **76 % → 92 %** vs. v1 (`npm run eval`).

Rollen-Logik: der **Test-Cockpit**-Chat beweist das Retrieval — der Alltag läuft über MCP. [ROADMAP](ROADMAP.md) · [CHANGELOG](CHANGELOG.md)

*EN — local-first brain for AI agents: shared MCP memory (2026-07-28, 8 typed tools), hybrid retrieval with persistent embeddings, knowledge graph, temporal validity, Obsidian interop. MIT, no cloud.*

**KEPTA** — gebaut für Fokus. Behält, was zählt.
