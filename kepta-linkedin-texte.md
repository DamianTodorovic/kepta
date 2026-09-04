# LinkedIn Profil - KEPTA - Fertige Texte
Erstellt 2026-09-04 aus kepta v2.6.14

## Headline Empfehlung
Gründer @ KEPTA — Behält, was zählt. Lokales Gedächtnis für KI-Agenten | Open Source · Ohne Cloud · Ohne Konto

## Info Deutsch (für LinkedIn About)
Dein KI-Assistent vergisst dich nach jedem Chat. KEPTA nicht.

Ich baue KEPTA — ein lokales Wissenssystem, das auf deinem eigenen Rechner läuft und sich merkt, was zählt. In einer einzigen Datei. Ohne Cloud, ohne Konto, ohne Abo.

Das Problem: Du erklärst ChatGPT oder Claude dein Projekt, deinen Kunden, deine Abläufe. Am nächsten Tag ist alles weg und du fängst wieder bei Null an.

KEPTA löst das: Ein kleines Programm (macOS/Windows/Linux), das dein Assistent selbst bedienen kann. Was ein Agent lernt, weiß der nächste sofort — via MCP (Model Context Protocol). Nichts verlässt deinen Rechner, gespeichert wird nur in ~/.kepta/kepta.db.

Was KEPTA kann:
→ Ein Gehirn für alle Tools: Claude Desktop, Cursor & Co. teilen dieselbe Wissensbasis (8 MCP-Tools, stdio + POST /mcp)
→ Hybride Suche, die wirklich findet: FTS5/BM25 + Vektor-Suche (Ollama, optional) + Wissensgraph → Fusion via RRF k=60
→ Wissen mit Ablaufdatum: Jede Erinnerung hat Typ, Gültigkeit und Konfidenz. Widersprüche werden via Supersede-Kette ersetzt, Abgelaufenes nur markiert — nie heimlich ausgeblendet
→ Capture ohne Reibung: Drag & Drop (PDF/MD/TXT), URL-Clipper, Inbox-Ordner, Obsidian-Import/Export mit [[Wiki-Links]] als Graph-Kanten
→ Wissensgraph mit Zeitregler: „Was wusste ich im November?“ — der Graph lässt sich zurückspulen
→ Privat & prüfbar: Open Source MIT, kein Tracking, 23 lokale API-Routen auf 127.0.0.1. Wer beweisen muss, dass nichts leakt, kann den Code lesen.

Stack: TypeScript, React 19, Electron, SQLite + FTS5, Vite, Vitest (345 Tests).

Für wen: Wer täglich mit KI-Agenten arbeitet und es leid ist, sich zu wiederholen — und wem Datenschutz wichtiger ist als ein weiterer Cloud-Service.

Offen für Austausch zu Local-first AI, RAG, MCP und Privacy-by-Design.

→ GitHub: github.com/DamianTodorovic/kepta
→ Download: github.com/DamianTodorovic/kepta/releases
→ npx: npx -y kepta-mcp | pip: pip install kepta
