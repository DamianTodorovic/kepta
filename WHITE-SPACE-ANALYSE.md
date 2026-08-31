# 🔬 White-Space-Analyse — KEPTA v2.0

> Analyse vom 30.08.2026 · Bezieht sich auf den Stand nach dem Redesign (Neural OS) und der Multi-Modell-Anbindung.

---

## 1. Ist-Zustand (was die App heute kann)

| Bereich | Status |
|---|---|
| Lokale Knowledge Base | ✅ Einträge mit Titel, Inhalt, Tags — gespeichert im `localStorage` |
| KI-Chat mit Kontext | ✅ Gefilterte Einträge werden als System-Prompt in die Anfrage injiziert |
| Multi-Provider | ✅ OpenAI, Claude, Gemini, OpenRouter, Mistral, Groq, DeepSeek, xAI, Ollama, LM Studio, eigene Endpunkte |
| Modell-Erkennung | ✅ „Laden"-Button ruft `/models` des Anbieters ab |
| Login-frei | ✅ Kein Firebase, keine Cloud, keine Konten |
| Backup | ✅ JSON-Export manuell |
| UI | ✅ Neural-OS-Look, Dark/Light, Fokus-Modus, Tag-Filter, Volltextsuche |

**Kernlimitierung heute:** Das KEPTA ist ein *passiver Kontext-Speicher*. Der Nutzer entscheidet manuell, welche Knoten (per Suche/Tags) in den Prompt wandeln, und die App fügt einfach alles zusammen. Intelligenz steckt nur im externen Modell — nicht im KEPTA selbst.

---

## 2. White-Space-Felder

### A. Intelligenz im KEPTA (größter Hebel) 🧠

| Lücke | Idee | Warum White-Space |
|---|---|---|
| **Semantische Suche** | Lokale Embeddings (z. B. `all-MiniLM` via Ollama/Transformers.js), Chunking + Vektor-Suche statt Keyword-Match | Heute findet „Auto" nichts zu „Fahrzeug".(Jeder Cloud-RAG-Dienst kann das — lokal fast niemand.) |
| **Automatisches Retrieval** | Statt „alle gefilterten Knoten" → Top-k relevanteste Knoten pro Frage automatisch wählen | Hebt die mentale Last vom Nutzer; Token-Kosten sinken drastisch bei großen Basen |
| **Auto-Tagging & Zusammenfassung** | Beim Speichern schlägt das verbundene Modell Tags/Zusammenfassung vor | Entwertet heute manuelle Pflege |
| **Duplikat- & Konflikt-Erkennung** | Ähnliche Knoten beim Anlegen markieren, veraltete Versionen kennzeichnen | Wissen verrottet sonst |
| **Quellen-Zitate im Chat** | Antwort markiert, welche Knoten (ID/Titel) verwendet wurden | Vertrauen + Nachprüfbarkeit |
| **Wissens-Graph** | Knoten-Verknüpfungen („siehe auch", explizite Kanten) als 2D-Graph-Ansicht | Optisch stark, heute nur flache Liste |

### B. Aufnahme — Wissen rein bekommen 📥

| Lücke | Idee |
|---|---|
| **Datei-Import** | PDF, Markdown, TXT, Code-Dateien per Drag&Drop → automatisch gechunkte Knoten |
| **Import aus anderen Tools** | Obsidian-Vault, Notion-Export, ChatGPT-/Claude-Export einlesen |
| **Chat → Wissen automatisch** | Nach jeder Antwort: „Kernaussage als Knoten extrahieren" mit einem Klick (vorherige App-Version hatte den Knopf schon — als *echte* KI-Extraktion ausbauen) |
| **Web-Clipper / URL-Pull** | URL einfügen → Text extrahieren → Knoten |
| **Spracheingabe** | macOS-Diktat oder Whisper lokal |

### C. Integration — das KEPTA für *andere* KIs öffnen 🔌 (Alleinstellungs-Chance)

| Lücke | Idee | Warum besonders |
|---|---|---|
| **MCP-Server** | Das KEPTA als lokaler MCP-Server (`memory.search`, `memory.save`) | Claude Desktop, ZCode, Cursor & jede MCP-fähige KI könnte *denselben* KEPTA-Speicher nutzen — „ein KEPTA für alle KI-Modelle" wörtlich genommen, auch außerhalb der App |
| **Lokale HTTP-API** | `GET/POST /api/memory` dokumentieren | Scripting, Automations, Shortcuts |
| **Browser-Extension** | Markierten Text direkt als Knoten speichern | Capture-Loop schließen |
| **Streaming-Antworten** | SSE/Chunked statt „Generiere Antwort..."-Warteblock | Wirkt sofort viel schneller & intelligenter |

### D. Datenarchitektur & Sicherheit 🗄️

| Lücke | Warum dringend |
|---|---|
| **localStorage verlassen** | ~5 MB Limit, bei Base64/Dokumenten erreicht; Risiko beim Cache-Leeren. → SQLite (better-sqlite3) oder JSON-Datei im `userData`-Ordner der Electron-App |
| **Verschlüsselung at rest** | OS-Keychain-Key + AES für den Speicher → „Verschl.-bereit"-Versprechen im UI einlösen |
| **Backup-Import** | Export existiert — **Import fehlt!** Gerade-Jetzt-Datenverlust-Risiko |
| **Versionierung & Papierkorrb** | Knoten-Historie, Löschen rückgängig |
| **Mehrere KEPTAe** | Workspaces/Projekte umschaltbar („Arbeit", „Privat", „Projekt X") |
| **Optionale E2E-Sync** | Nur opt-in, z. B. über eigenen iCloud-Ordner/WebDAV — Cloud-Zwang bleibt aus |

### E. UX & Bediengefühl ✨

| Lücke | Idee |
|---|---|
| **Command Palette** (⌘K) | Schnellsuche + Aktionen (neuer Knoten, Provider wechseln…) |
| **Markdown-Rendering im Chat** | Code-Blöcke, Listen, fett — Antworten sind heute Plain-Text |
| **Token-Budget-Regler** | „Max. Kontext: 4k Tokens" mit automatischer Knoten-Auswahl |
| **Kosten-/Nutzungsanzeige** | Pro Antwort geschätzte Tokens/Kosten je Provider |
| **Tastatur-Shortcuts** | ⌘N neu, ⌘F suchen, ⌘1/2/3 Views |
| **Antwort-Regenerieren / Vergleichen** | Zwei Modelle nebeneinander („Model-Duell") |

### F. Modell-Layer 🤖

| Lücke | Idee |
|---|---|
| **Streaming + Abbruch** | Fetch-Streaming, Stop-Button |
| **Vision/Bilder** | Bild-Upload an multimodale Modelle (GPT-4o, Gemini, Claude) |
| **Agent-Modus / Tool-Calls** | Modell darf Knoten anlegen/suchen (Function Calling ist bei OpenAI-kompatiblen APIs bereits standardisiert → machbar) |
| **Fallback-Kette** | „Wenn Ollama down → OpenAI" |
| **Ollama-Modell-Discovery** | Lokale Modelle automatisch listen (`/api/tags`), statt Tippfeld |

---

## 3. Priorisierung (Impact × Aufwand)

### 🟢 Quick Wins (hocher Impact, wenig Aufwand — als nächstes)
1. **Backup-Import** (Datenverlust-Risiko schließen) — ~1 Stunde
2. **Streaming-Antworten + Stop-Button** — größtes „Gefühl-Upgrade"
3. **Markdown-Rendering im Chat** (z. B. `react-markdown`)
4. **Ollama-Modell-Discovery** (`/api/tags` in `/api/models`-Route)
5. **Quellen-Zitate** (Knoten-IDs der Antwort mitgeben — Backend ändert nur den Prompt)

### 🟡 Big Bets (hoher Impact, höherer Aufwand)
6. **Speicher auf SQLite/Datei umstellen** (Basis für alles Weitere: >5 MB, Verschlüsselung, Versionierung)
7. **Semantisches Retrieval** (lokale Embeddings + Top-k) — *das* Feature, das aus dem Notizbuch ein KEPTA macht
8. **MCP-Server-Modus** — Alleinstellung: „Ein KEPTA für alle KIs" auch außerhalb der App

### 🔵 Später / Nice-to-have
9. Wissens-Graph · Datei-Import (PDF) · Command Palette · Multi-Modell-Duell · Web-Clipper · E2E-Sync

### ⛔ Anti-Roadmap (bewusst nicht tun)
- **Cloud-Zwang / Account-Systeme** — Kernversprechen ist „lokal & privat"
- **Eigene Modell-Hosting-Infrastruktur** — Ollama/LM Studio-Integration deckt das ab
- **Social/Collaboration-Features** — erst wenn Single-Player-Wert maximiert ist

---

## 4. Empfohlene Reihenfolge (nächste 3 Schritte)

1. **Backup-Import + Streaming** — Sicherheit und Gefühl sofort verbessern.
2. **Speicher-Migration auf lokale Datei/SQLite** — Fundament für Verschlüsselung, große Basen und MCP.
3. **Semantisches Retrieval (lokal)** — damit beantwortet das KEPTA Fragen, die *kein* Schlüsselwort trifft. Erst dann fühlt es sich wirklich wie ein zweites KEPTA an.

---

*Die Analyse ist bewusst lokal-first: Jedes White-Space-Feld ist ohne Konto, ohne Cloud und ohne laufende Kosten realisierbar — außer optionaler Sync.*
