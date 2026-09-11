<p align="center"><img src="https://img.shields.io/badge/version-2.11.0-blue" alt="v2.11.0"> <img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="AGPL-3.0"> <img src="https://img.shields.io/badge/tests-319%20passing-brightgreen" alt="tests"> <img src="https://img.shields.io/badge/coverage%20gate-%E2%89%A5%2089%25%20of%20lines-brightgreen" alt="coverage"> <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" alt="platform"> <img src="https://img.shields.io/badge/encryption-SQLCipher%204-green" alt="encrypted"></p>

# KEPTA Core

## Dein KI-Assistent vergisst alles. Jeder Chat beginnt bei null.

**KEPTA ändert das — lokal, verschlüsselt, ohne Cloud.**

KEPTA ist ein lokales Gedächtnis für KI-Assistenten: Alle Dokumente, Entscheidungen und Kundeninformationen wandern in eine verschlüsselte Wissensbasis auf deinem eigenen Rechner — und dein Assistent (Claude Desktop, Cursor, jeder MCP-Client) kann sie abrufen, als hätte er nie etwas vergessen.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Dein Rechner                                                            │
│                                                                          │
│  ┌─────────────┐     MCP / HTTP API     ┌─────────────────────────────┐ │
│  │ Claude      │◄──────────────────────►│                             │ │
│  │ Desktop     │                        │   KEPTA                     │ │
│  │             │                        │   verschlüsselte Wissens-   │ │
│  │ Cursor      │     ┌────────────┐    │   basis (SQLCipher 4)       │ │
│  │             │     │ kepta-mcp  │    │   ~/.kepta/kepta.db         │ │
│  │ dein Code   │◄───►│            │    │                             │ │
│  └─────────────┘     └────────────┘    └─────────────────────────────┘ │
│                                                                          │
│  Kein Abo. Kein Konto. Keine Telemetrie. Keine Cloud.                   │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Schnellstart

### MCP-Server (Claude Desktop, Cursor)

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

8 Tools: `memory_search`, `memory_save`, `memory_update`, `memory_delete`, `memory_list`, `memory_graph`, `memory_consolidate`, `memory_forget`.

### HTTP-API

```bash
git clone https://github.com/DamianTodorovic/kepta.git
cd kepta && npm install && npm run dev
# → http://127.0.0.1:3000

# Notiz speichern
curl -s localhost:3000/api/memory -H 'Content-Type: application/json' \
  -d '{"title":"Client Müller","content":"Quartalsweise Abrechnung.","tags":["client"]}'

# Suchen
curl -s "localhost:3000/api/memories/search?q=how+does+müller+bill"
```

### Docker (nur MCP-Server)

```bash
docker build -t kepta-mcp .
docker run -e KEPTA_DB_KEY=<64-hex> -v kepta-data:/data kepta-mcp
```

---

## ✨ Was drin ist

| | |
|---|---|
| 🔍 **Hybride Suche** | BM25-Volltext + Vektorähnlichkeit (Ollama) + Wissensgraph, per RRF fusioniert, mit lokalem Reranking |
| 🔐 **Verschlüsselt at rest** | SQLCipher 4 (AES-256 + HMAC-SHA512 je Seite, WAL eingeschlossen), Schlüssel im OS-Schlüsselbund |
| 🕐 **Zeitreise** | Bi-temporale Gültigkeit: `valid_from`/`valid_to`, `asOf`-Abfrage („Was wusste ich am 3. März?") |
| ♻️ **Ersetzung statt Widerspruch** | Neue Fakten verdrängen alte (`superseded_by`), die Historie bleibt |
| 🔗 **MCP-first** | 8 Tools, ein Codepfad für API und MCP — Agenten bekommen dieselbe Qualität wie die App |
| 📄 **Datei-Import** | PDF (pdf.js mit CMaps), Markdown mit `[[Wiki-Links]]`, TXT, JSON |
| 🔒 **Verschlüsselung** | Datenbank-Datei und WAL vollständig verschlüsselt; Schlüssel im OS-Schlüsselbund (macOS Keychain / Windows DPAPI / Linux Secret Service) |
| 📊 **Eval** | Hit@1, Precision@5, MRR auf 58 Notizen / 45 Anfragen; Ablation-Test je Retrieval-Bein |

---

## 🖥️ HTTP-API (33 Routen)

| Bereich | Routen |
|---|---|
| Memories | `GET/POST /api/memories`, `GET /api/memories/:id`, `POST /api/memory`, `DELETE /api/memories/:id`, `POST /api/memories/:id/restore`, `POST /api/memories/bulk-delete`, `POST /api/memories/bulk-restore`, `POST /api/memories/reclassify` |
| Suche | `GET /api/memories/search`, `POST /api/search` |
| Import/Export | `POST /api/import/markdown`, `POST /api/export/markdown` |
| Verschlüsselung | `GET /api/health` (inkl. `encryption`-Status), `POST /api/repair/imports` |
| MCP | `POST /mcp`, `GET /mcp`, `GET /api/mcp/tools`, `POST /api/mcp/search`, `POST /api/mcp/save` |
| System | `GET /api/settings`, `PUT /api/settings`, `GET /api/storage-info`, `GET /api/activity` |

Alle Routen nur auf `127.0.0.1`, Rate-Limiting, Helmet, Eingabevalidierung.

---

## 🐍 Python-Client

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

Keine Abhängigkeiten. Nur die Python-Standardbibliothek.

---

## 🏗️ Architektur

```
src/core/           Memory-Engine (Store, Suche, Verschlüsselung, MCP-Protokoll)
server.ts           HTTP-API (Express, 33 Routen)
src/mcp-server.ts   MCP-stdio-Server (npx kepta-mcp)
npm/                npm-Paket-Quelle (kepta-mcp)
Dockerfile          Docker-Container (MCP-Server)
python/             Python-Client (PyPI: kepta)
scripts/            Eval, Benchmark, Reparatur
tests/              319 Tests, Coverage-Gate ≥ 89 % Lines
```

**Ein Codepfad** für HTTP-API und MCP-Server — Agenten bekommen dieselben Ergebnisse wie direkte API-Aufrufe.

---

## 🔐 Verschlüsselung

Die Wissensbasis liegt in einer SQLCipher-4-Datenbank: AES-256, HMAC-SHA512 über jede Seite, WAL eingeschlossen. Der Schlüssel (256 Bit Zufall) liegt im Betriebssystem-Schlüsselbund — macOS Keychain, Windows DPAPI oder Linux Secret Service. Auf Servern ohne Schlüsselbund: `KEPTA_DB_KEY` als 64-stelliger Hex-String.

---

## 🧪 Qualität

**319 Tests** mit Vitest und v8-Coverage. Die Coverage-Schwellen sind ein CI-Gate: Ein Commit, der unter eine Schwelle fällt, wird rot. Dazu: eigener Retrieval-Eval (Hit@1, Precision@5, MRR) mit Fixkorpus, Ablation-Test je Retrieval-Bein, Verschlüsselungs-Eval, Boundary-Test auf der Kern-Architektur.

---

## 📄 Lizenz

[AGPL-3.0-or-later](LICENSE). Die Desktop-Anwendung (grafische Oberfläche, Wissensgraph, Rechner-Scan, Sync) ist die kommerzielle KEPTA Enterprise und separat lizenziert.

---

<p align="center">
  <sub>KEPTA Core — der offene Kern. Kein Abo, kein Konto, keine Ausreden.</sub>
</p>
