<p align="center">
  <img src="public/kepta-logo.svg" width="88" height="88" alt="KEPTA Logo">
</p>
<h1 align="center">KEPTA — Behält, was zählt</h1>
<p align="center">
  <strong>Lokales Wissenssystem. Ohne Cloud. Ohne Abo. Ohne KI-Touch.</strong><br>
  Electron + React + Vite + Express. Privat auf deinem Gerät.
</p>
<p align="center">
  <a href="https://github.com/Damian2212/kepta/releases"><img alt="Release" src="https://img.shields.io/github/v/release/Damian2212/kepta?label=Download"></a>
  <a href="LICENSE"><img alt="License MIT" src="https://img.shields.io/badge/License-MIT-black"></a>
  <a href="https://github.com/Damian2212/kepta/issues"><img alt="Issues" src="https://img.shields.io/github/issues/Damian2212/kepta"></a>
  <img alt="Platform macOS" src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux-lightgrey">
</p>

---

**KEPTA** ist ein lokales Second Brain. Notizen, Wissen und Kategorien bleiben als Knoten auf deinem Gerät (`~/.kepta/memories.json` bzw. legacy `~/.ki-gehirn/`), werden mit hybrider Suche (TF-IDF + BM25 + Cosine) gefunden und per MCP + HTTP-API von jeder KI genutzt. Besonderheit: Jeder Download passt sich per Onboarding an dich an (Name, Fokus, lokale Modelle) und erweitert sich danach selbst (Inbox-Watcher + Auto-Learn).

> Kein Login, keine Cloud. Keys bleiben in deinem `localStorage`.

---

## Download (empfohlen)

1. Auf **[Releases](https://github.com/Damian2212/kepta/releases)** die neuste Version öffnen
2. **macOS:** `KEPTA-1.0.0-arm64.dmg` laden → öffnen → in Programme ziehen  
   **Linux:** `*.snap` oder `linux-unpacked`  
   **Windows:** aus Source bauen (siehe unten)
3. Starten. Beim ersten Start fragt der Wizard nach Name/Ziel und erkennt lokale Modelle (Ollama `11434`, LM Studio `1234`).

## Aus Source starten (Entwickler)

Voraussetzung: **Node 18+** und **npm**.

```bash
git clone https://github.com/Damian2212/kepta.git
cd kepta
npm install
npm run dev        # startet Server + Vite (http://localhost:3000)
# in zweitem Terminal (optional Electron):
npm run electron
```

Build für Produktion:

```bash
npm run build              # Vite + Express (dist/)
npm run build:mac          # + DMG/ZIP nach release/ (macOS)
npm start                  # nur Server: node dist/server.cjs (PORT=3000)
```

## Nutzung

- **Wissen:** Knoten anlegen, Tags vergeben, per Suche filtern. Drag&Drop für `PDF/MD/TXT/JSON` (2000-Zeichen Chunks), URL-Clipper (`POST /api/clip`), Inbox `~/.kepta/inbox` wird automatisch importiert (nach Import → `archiv/`).
- **Suche:** Hybrid `cosine 0.5 + BM25 (k1=1.2,b=0.75)` — Schalter *Semantik* + *Top-k 1-20* + Tag-Filter. Cache (Index + LRU 64, TTL 60s) für <5ms bei 500 Knoten.
- **Chat:** SSE-Stream `/api/chat/stream`, Token-Budget 1k–16k, Quellen-Chips, Stop-Button, Kosten-Schätzung. Auto-Learn (an/aus in System) extrahiert aus jeder Antwort >60 Zeichen einen Knoten (`auto-learn` Tag).
- **Graph:** Force-Graph + `⌘K` Command Palette.
- **System:** Import/Export JSON, Inbox-Status, Duplikat-Erkennung (Jaccard >82%).

## MCP & HTTP-API — Ein Speicher für alle KIs

Alle Zugänge teilen `~/.kepta/memories.json`:

```
┌──────────┐   ┌──────────────┐   ┌────────────────┐
│  KEPTA   │   │  MCP stdio   │   │ Lokale HTTP-API│
│   App    │──▶│  npx tsx     │──▶│ localhost:3000 │
└──────────┘   └──────────────┘   └────────────────┘
```

**HTTP (CORS nur localhost, Rate-Limit 180/min, helmet):**
`GET /api/health` · `GET /api/memories` (ETag) · `GET /api/memories/search?q=&limit=&tags=` · `POST /api/memory` · `POST /api/memories/import` · `POST /api/clip` (SSRF-block) · `POST /api/chat|/api/chat/stream` · `POST /api/models` · `GET /api/inbox/status`

**MCP (stdio):** `memory_search {query,limit,tags}` · `memory_save {title,content,tags,id?}` · `memory_list {limit,offset}`

Cursor / Claude Desktop `mcp.json`:
```json
{
  "mcpServers": {
    "kepta": {
      "command": "npx",
      "args": ["tsx", "src/mcp-server.ts"],
      "cwd": "/ABSOLUTER/PFAD/ZU/kepta"
    }
  }
}
```
fertig gebaut: `node /ABSOLUTER/PFAD/ZU/kepta/dist/mcp-server.cjs`

Schnelltest:
```bash
curl http://localhost:3000/api/health | jq
curl "http://localhost:3000/api/memories/search?q=angeln" | jq
```

## Sicherheit

Lokal-first, gehärtet: `helmet`, `express-rate-limit` (global 180/min, chat 20/min, clip 12/min), `express.json 1mb`, `CORS` nur `localhost`, SSRF-Block (private IPs, `169.254`, `file://`), XSS-Sanitize (`<script>`/`on*` strip), Path-Traversal Check (`isSafeFilename` + `startsWith(inbox)`), `ETag`+`compression`, Electron `nodeIntegration:false, contextIsolation:true, sandbox:true` + CSP. Keine Keys im Log. Siehe `server.ts` + `electron.js`.

## Daten

- Standard: `~/.kepta/memories.json` (neu) — fällt zurück auf `~/.ki-gehirn/memories.json` (Bestand, wird automatisch erkannt)
- Profil: `~/.kepta/profile.json` + Spiegel `localStorage:ki_gehirn_adaptive_profile` (Name/Ziel/Provider)
- Inbox: `~/.kepta/inbox/` (+ `archiv/`)
- Export: System → JSON Backup

## Entwicklung

```bash
npm run lint          # tsc --noEmit
npm run build         # Vite 3240 Module, vendor 440k + index 163k (gzip 47k)
```

Stack: Electron 44, React 19, Vite 6, Tailwind 4, Express 4, motion, react-markdown. Keine Cloud-SDKs im Runtime-Pfad.

## Lizenz

MIT — siehe [LICENSE](LICENSE). Logo `public/kepta-logo.svg` ist originale Vektorarbeit (keine Fremdrechte).

---

**KEPTA** — gebaut für Fokus. Behält, was zählt.
