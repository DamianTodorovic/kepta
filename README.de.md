<p align="center"><img src="docs/kepta-logo.svg" width="88" alt="KEPTA"></p>
<p align="center"><img src="https://img.shields.io/badge/tests-343%20passing-brightgreen" alt="Tests"> <img src="https://img.shields.io/badge/coverage%20gate-%E2%89%A5%2070%25%20der%20Zeilen-brightgreen" alt="Coverage-Gate"> <img src="https://img.shields.io/badge/Verschl%C3%BCsselung-SQLCipher%204-green" alt="verschlüsselt"> <a href="https://www.linkedin.com/in/damian-todorovic-244235434"><img src="https://img.shields.io/badge/LinkedIn-Damian%20Todorovic-0A66C2?logo=linkedin&logoColor=white" alt="Damian Todorovic auf LinkedIn"></a></p>

# KEPTA Core — deutsches Readme

Dein KI-Assistent vergisst alles. Jeder Chat beginnt bei null.

KEPTA ändert das — **lokal**. Eine verschlüsselte SQLite-Datei auf deinem Rechner. Keine Cloud, kein Konto, keine Telemetrie. Dein Assistent liest und schreibt sie über **MCP** (Claude Desktop, Cursor, jeder MCP-Client) oder eine kleine **HTTP-API**.

> **Dies ist der offene Kern** (AGPL-3.0): Memory-Engine, MCP-Server, HTTP-API — dazu der Python-Client unter MIT, damit ihn jedes Python-Projekt einbauen kann. Die vollständige Desktop-Anwendung ist **KEPTA Enterprise** — siehe unten. English: [README.md](README.md).

## 🚀 KEPTA Enterprise — die ganze Desktop-App

**Mit diesem Kern sprechen deine Agenten. In KEPTA Enterprise arbeitest _du_.** Eine native App für macOS, Windows und Linux, die dieselbe verschlüsselte Wissensbasis in ein zweites Gehirn verwandelt, das du sehen, durchsuchen, ordnen und dem du vertrauen kannst — jedes Dokument, jede Entscheidung, jede Verbindung, auf deinem eigenen Rechner.

| Der Index — alles, was du weißt, nach Art geordnet | Der Wissensgraph — jede Notiz ein Knoten, jeder Link eine Kante |
|---|---|
| ![KEPTA Enterprise: der Index](docs/enterprise/01-index.png) | ![KEPTA Enterprise: der Wissensgraph](docs/enterprise/03-graph.png) |
| **Der Editor — Wissensart, `[[Links]]`, Gültigkeit** | **In einer Minute eingerichtet — deine Worte, kein Menü** |
| ![KEPTA Enterprise: der Editor](docs/enterprise/04-editor.png) | ![KEPTA Enterprise: der Einrichtungsassistent](docs/enterprise/05-setup.png) |

<sub>KEPTA Enterprise 2.11 mit einem erfundenen Demo-Korpus — nichts auf diesen Bildern ist echt. Die Oberfläche ist englisch.</sub>

**Alle Funktionen im Vergleich.** ✅ vorhanden · **API** / **MCP** im Kern für Agenten und Skripte, ohne eigene Oberfläche dafür · — nur in KEPTA Enterprise

| Funktion | KEPTA Core | KEPTA Enterprise |
|---|:---:|:---:|
| **Sicherheit & Privatsphäre** | | |
| Verschlüsselt auf der Platte — SQLCipher 4, AES-256 und HMAC-SHA512 über jede Seite, WAL eingeschlossen | ✅ | ✅ |
| Der Schlüssel entsteht und liegt automatisch im Schlüsselbund — nichts einzutippen, Agenten sehen ihn nie | ✅ | ✅ |
| Wiederherstellungsschlüssel mit einem Klick, bereit für den Passwort-Manager | ✅ | ✅ |
| Einstellungen — samt KI-Schlüssel — in der verschlüsselten Datei | ✅ | ✅ |
| Nur `127.0.0.1`, kein Konto, keine Telemetrie — nichts verlässt den Rechner, außer du wählst eine Cloud-KI | ✅ | ✅ |
| Rate-Limiting, Helmet und Eingabeprüfung auf jeder Route | ✅ | ✅ |
| Gehärtete Desktop-Hülle — kein Node im Fenster, Sandbox, Content Security Policy | — | ✅ |
| **Notizen** | | |
| Anlegen, bearbeiten, löschen — Papierkorb mit Wiederherstellen | ✅ | ✅ |
| Vier Wissensarten — Fakt, Ereignis, Anleitung, Dokument — nach lesbaren Regeln mit Begründung zugeordnet | ✅ | ✅ |
| Bestehende Notizen nachträglich nach Art sortieren, mit Vorschau | API | ✅ |
| Tags, Konfidenz 0–1, automatisch erkannte Entitäten | ✅ | ✅ |
| Scopes — Nutzer, Agent, Sitzung — damit eine Erinnerung weiß, wem sie gehört | API · MCP | API · MCP |
| Gültigkeitsfenster — Abgelaufenes wird markiert, nie still versteckt | ✅ | ✅ |
| Ersetzungsketten — ein neuer Fakt verdrängt den alten, die Historie bleibt | ✅ | ✅ |
| Übernahme aus dem alten `memories.json` — wiederholbar, mit Sicherung | ✅ | ✅ |
| **Suche** | | |
| Hybride Suche — BM25-Volltext + Vektoren + Entitäten, per Reciprocal Rank Fusion vereint | ✅ | ✅ |
| Lokales Reranking — Begriffsabdeckung, Phrasen, Titel, Tags; ohne Netz | ✅ | ✅ |
| Relevanz zuerst — Treffer nach Rang, der beste oben | ✅ | ✅ |
| Zeitreise-Suche — was zu jedem Zeitpunkt bekannt war (`asOf`) | API · MCP | API · MCP |
| Dauerhafte Embeddings über Ollama, berechnet von einer Hintergrund-Warteschlange | ✅ | ✅ |
| Zeitliche Gewichtung — abgelaufen ×0,5, ersetzt ×0,4 | ✅ | ✅ |
| Stoppwörter auf Deutsch und Englisch | ✅ | ✅ |
| Schalter für semantische Suche und ein Trefferregler von 5 bis alle | — | ✅ |
| Ein Codepfad für Oberfläche, HTTP-API und MCP — Agenten bekommen dieselbe Qualität wie du | ✅ | ✅ |
| Such-Eval — `npm run eval` misst Hit@1, Precision@5 und MRR | ✅ | ✅ |
| **Aufnehmen & importieren** | | |
| Dateien per Drag & Drop — PDF mit den Zeichentabellen eingebetteter Schriften, Markdown, Text, JSON — in Teilen | — | ✅ |
| Inbox-Ordner, beobachtet und automatisch übernommen | API | ✅ |
| Obsidian-Vault-Import — Frontmatter bleibt, `[[Wiki-Links]]` werden Graph-Kanten | API | ✅ |
| JSON-Import ganzer Notizsammlungen | API | ✅ |
| Alte Importe neu einlesen — erst zählen, erst nach deiner Bestätigung schreiben | API | ✅ |
| URL-Clipper — gegen SSRF geschützt, entfernt Navigationszeilen und Cookie-Banner | — | ✅ |
| Diesen Rechner durchsuchen — freiwillig, mit Vorschau; Schlüssel, Zugangsdaten, Browserprofile und Wallets bleiben gesperrt | — | ✅ |
| Auto-Lernen — den Kern einer Chat-Antwort speichern (standardmäßig aus) | — | ✅ |
| Markdown-Export in einen Ordner | API | ✅ |
| Praxis-Sync — einen Scope zwischen den eigenen Geräten verschieben, als AES-256-GCM-Bundle mit Hash-Ketten-Protokoll | API | ✅ |
| **Wissensgraph** | | |
| Entitäten und Beziehungen aus `[[Wiki-Links]]` und automatischer Erkennung | API · MCP | ✅ |
| Interaktiver Graph mit zwei Ansichten — Kräfte-Layout und Baum (Dendrogramm); die Knoten gleiten hinüber | — | ✅ |
| Unbegrenzte Fläche — 3 000 Knoten und 9 500 Kanten bei 60 fps; zoomen, verschieben, ziehen, alles einpassen | — | ✅ |
| Zeitregler — der Graph, wie er an jedem Tag aussah | — | ✅ |
| Farbe nach Art, Größe nach Verbindungen, echte Links von bloßer Ähnlichkeit unterschieden; Doppelklick öffnet die Notiz | — | ✅ |
| **Pflege** | | |
| Duplikate erkennen — Embedding-Ähnlichkeit ≥ 0,92, lexikalischer Ersatz ohne Ollama | MCP | ✅ |
| Konsolidierung ersetzt statt zu löschen — nichts geht verloren | MCP | ✅ |
| Duplikat-Prüfung — Gruppen nebeneinander, die reichste Fassung mit einem Klick behalten, ein Rückgängig für alles | — | ✅ |
| Episodische Erinnerungen wachsen aus dem Chatverlauf | — | ✅ |
| Aktivitäts-Feed | API | ✅ |
| **Agenten (MCP)** | | |
| MCP 2026-07-28, kompatibel mit 2025-06-18 und 2024-11-05 — stdio und Streamable HTTP | ✅ | ✅ |
| Acht Werkzeuge — suchen, speichern, ändern, löschen, auflisten, Graph, konsolidieren, vergessen — mit `outputSchema` und `structuredContent` | ✅ | ✅ |
| Schreib-Schleuse (optional) — ein lokales LLM entscheidet ADD, UPDATE, DELETE oder NOOP, bevor Neues gespeichert wird | ✅ | ✅ |
| npm-Paket `kepta-mcp`, eingetragen in der offiziellen MCP-Registry | ✅ | ✅ |
| Python-Client — `pip install kepta`, nur Standardbibliothek | ✅ | ✅ |
| **Chat-Cockpit** | | |
| 20 Anbieter-Vorlagen — Ollama, LM Studio, OpenAI, Anthropic, Gemini, Mistral, Groq, DeepSeek, xAI und mehr | — | ✅ |
| Modelle von Ollama und LM Studio mit einem Klick finden | — | ✅ |
| Streaming mit Stopp-Knopf, Markdown-Darstellung | — | ✅ |
| Quellenangaben — jede Antwort zeigt, welche Erinnerungen sie genutzt hat | — | ✅ |
| Datumsbewusste Prompts und ein sichtbares Token-Budget | — | ✅ |
| **Oberfläche** | | |
| Eine Oberfläche für dein Gedächtnis — nach Art und Tag stöbern, suchen, lesen, schreiben, Papierkorb | ✅ im Browser | ✅ eigene App |
| Native Desktop-App für macOS, Windows und Linux | — | ✅ |
| Hell und dunkel | ✅ | ✅ |
| Mit der Tastatur — Kürzel; in Enterprise zusätzlich eine Befehlspalette (⌘K) | ✅ | ✅ |
| Tag-Filter mit Zählern | ✅ | ✅ |
| Wissensliste mit lesbarer Vorschau, Quellen-Chips, Teil-Angaben, *Open file*, Gruppierung nach Datei, Art oder Zeitraum | — | ✅ |
| Fokus-Modus und Textgröße (100 / 115 / 130 %) | — | ✅ |
| Einrichtungsassistent mit Startpaket | — | ✅ |
| Systemstatus — erkennt lokale KI, prüft den Speicher, zeigt Diagnosen | — | ✅ |
| **Preis** | | |
| Lizenz | kostenlos · AGPL-3.0 | 14 Tage kostenlos testen, danach ein offline geprüfter Lizenzschlüssel |

**14 Tage kostenlos testen — voller Funktionsumfang, kein Konto, kein Internet.** Danach schaltet ein Lizenzschlüssel die App frei, geprüft offline auf deinem Rechner; KEPTA ruft nirgends an. Für dich, deine Praxis oder dein ganzes Team: **[schreib mir auf LinkedIn](https://www.linkedin.com/in/damian-todorovic-244235434)**.

## ⚡ Schnellstart

**1. MCP-Server** (Claude Desktop / Cursor / jeder MCP-Client):

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

**2. Dein Gedächtnis im Browser:** `npx -y kepta-mcp ui` öffnet **KEPTA Core** auf `http://127.0.0.1:4747` — dieselbe verschlüsselte Wissensbasis, in die deine Agenten schreiben. Nach Art und Tag stöbern, nach Relevanz suchen, Notizen samt `[[Links]]` öffnen, schreiben und bearbeiten (Art, Tags, Gültigkeit), in den Papierkorb legen und zurückholen, hell oder dunkel. Nichts zu installieren, nichts verlässt den Rechner.

**3. HTTP-API:**

```bash
npm install && npm run dev
# → http://127.0.0.1:3000
```

**4. Docker** (nur MCP-Server): `docker build -t kepta-mcp .`

**Zahlen:** **343 Tests** · 29 Routen · `npm run eval` — Eval auf 58 Notizen / 45 Anfragen (Hit@1, Precision@5, MRR).

## 🔐 Verschlüsselt auf der Platte

SQLCipher 4 (AES-256, HMAC-SHA512 je Seite, WAL eingeschlossen). Der Schlüssel liegt im Schlüsselbund des Betriebssystems, nie im Klartext auf der Platte. Details und wie du eine Kopie des Schlüssels aufbewahrst: [SECURITY.md](SECURITY.md).

## 🧪 Von der CI erzwungene Schwellen

| Bereich | Schwellen |
|---|---|
| alles zusammen | **70 %** der Zeilen · **72 %** der Funktionen · 56 % Branches · 66 % Statements |
| `src/core` | **87 %** der Zeilen · **89 %** der Funktionen · 74 % Branches · 85 % Statements |

## 👋 Wer KEPTA baut

KEPTA baut **Damian Todorovic**. Fragen, Ideen, eine Lizenz für dein Team — oder du willst einfach mitverfolgen, wohin das geht: **[finde mich auf LinkedIn](https://www.linkedin.com/in/damian-todorovic-244235434)**.

## 📄 Lizenz

[AGPL-3.0-or-later](LICENSE). **KEPTA Enterprise** — die Desktop-App mit grafischer Oberfläche, Wissensgraph, Rechner-Scan und Praxis-Sync — ist kommerzielle Software und separat lizenziert. Das npm-Paket `kepta-mcp` trägt dieselbe AGPL wie dieses Repository; der Python-Client unter `python/` ist MIT. Kommerzielle Lizenzierung des Kerns auf Anfrage — [schreib mir auf LinkedIn](https://www.linkedin.com/in/damian-todorovic-244235434).
