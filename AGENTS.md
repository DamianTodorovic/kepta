# AGENTS.md — working rules for AI agents in this workspace

## Your memory: KEPTA (MCP server `kepta`)
Use the KEPTA MCP tools as your persistent memory, across sessions:

- **Session start**: `memory_search` on the current topic, before asking or redoing work. Also `memory_list { type: "procedural" }` for project procedures.
- **Session end / important findings**: `memory_save` — pick the type yourself:
  - `semantic` = facts and architecture (e.g. "KEPTA v2.2 uses node:sqlite, not better-sqlite3")
  - `episodic` = events (e.g. "persona test found the wizard re-trigger bug")
  - `procedural` = repeatable procedures (e.g. "release: npm test → eval → build → tag v*")
- **Outdated knowledge**: `memory_forget { mode: "supersede" }` or `expire` — never park a contradicting node indifferently beside the old one.
- Set tags: `kepta`, `project`, plus a topic tag. Set `confidence` honestly (verified = 1.0, guess = 0.5).

## Project layout
- App: repo root (React + Express + Electron — server `server.ts`, core `src/core/`, UI `src/components/`, tests `tests/`, Electron `electron.js`, data `~/.kepta/kepta.db`)
- Python client: `python/` (stdlib only, published to PyPI as `kepta`)
- Quality gates before every commit: `npx tsc --noEmit` (0 errors) + `npx vitest run` (333 tests) + `npm run build` (green, `dist` free of inline scripts) + `npm run eval` (Hit@1 ≥ 92 %) — verify UX changes in the browser as well.
- Language: documentation and code comments in English. Reply to the user in the language they write in — the maintainer writes German.
- UX standard: "brutally good" — test from the persona's perspective, no jargon labels.

## Division of roles
The KEPTA chat is a test cockpit (proving mode). The product is the memory layer for Claude Desktop and Cursor via MCP (`POST /mcp`, 8 tools, protocol 2026-07-28).
