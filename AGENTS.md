# AGENTS.md — Arbeitsregeln für KI-Agenten in diesem Workspace

## Dein Gedächtnis: KEPTA (MCP-Server „kepta")
Nutze die KEPTA-MCP-Tools als dein persistentes Gedächtnis — über Sitzungen hinweg:

- **Session-Start**: `memory_search` mit dem aktuellen Thema, bevor du fragst oder doppelt arbeitest. Zusätzlich `memory_list { type: "procedural" }` für Projekt-Abläufe.
- **Session-Ende / wichtige Erkenntnisse**: `memory_save` — Entscheide selbst den Typ:
  - `semantic` = Fakten & Architektur (z. B. „KEPTA v2.2 nutzt node:sqlite, kein better-sqlite3")
  - `episodic` = Ereignisse (z. B. „Persona-Test fand Wizard-Re-Trigger-Bug")
  - `procedural` = Abläufe, die wiederholt werden (z. B. „Release: npm test → eval → build → tag v*")
- **Veraltetes Wissen**: `memory_forget { mode: "supersede" }` oder `expire` — niemals widersprechende Knoten gleichgültig daneben speichern.
- Tags setzen: `kepta`, `projekt`, plus Themen-Tag. `confidence` ehrlich (verifiziert=1.0, Vermutung=0.5).

## Projekt-Layout
- App: Repo-Root (React+Express+Electron — Server `server.ts`, Core `src/core/`, UI `src/components/`, Tests `tests/`, Electron `electron.js`, Daten `~/.kepta/kepta.db`)
- Quality-Gates vor jedem Commit: `npx tsc --noEmit` (0 Fehler) + `npx vitest run` (274 Tests) + `npm run build` (grün, dist ohne Inline-Scripts) + `npm run eval` (Hit@1 ≥ 92 %) — UX-Änderungen zusätzlich im Browser verifizieren.
- Sprache: Deutsch mit dem Nutzer. UX-Anspruch: „brutal gut" (Persona-Perspektive testen, keine Fachjargon-Labels).

## Rollen-Logik
Der KEPTA-Chat ist Test-Cockpit (Beweis-Modus). Produkt = Memory-Layer für Claude Desktop/Cursor via MCP (`POST /mcp`, 8 Tools, Protokoll 2026-07-28).
