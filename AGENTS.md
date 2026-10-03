# AGENTS.md — working rules for AI agents in this workspace

## Your memory: KEPTA (MCP server `kepta`)
Use the KEPTA MCP tools as your persistent memory, across sessions:

- **Session start**: `memory_search` on the current topic, before asking or redoing work. Also `memory_list { type: "procedural" }` for project procedures.
- **Session end / important findings**: `memory_save` — pick the type yourself:
  - `semantic` = facts and architecture (e.g. "KEPTA 2.11 stores its knowledge base encrypted, via better-sqlite3-multiple-ciphers")
  - `episodic` = events (e.g. "persona test found the wizard re-trigger bug")
  - `procedural` = repeatable procedures (e.g. "release: npm test → eval → build → tag v*")
- **Outdated knowledge**: `memory_forget { mode: "supersede" }` or `expire` — never park a contradicting node indifferently beside the old one.
- Set tags: `kepta`, `project`, plus a topic tag. Set `confidence` honestly (verified = 1.0, guess = 0.5).

## Project layout
- App: repo root (React + Express + Electron — server `server.ts`, core `src/core/`, UI `src/components/`, tests `tests/`, Electron `electron.js`, data `~/.kepta/kepta.db`)
- Python client: `python/` (stdlib only, published to PyPI as `kepta`)
- Quality gates before every commit: `npx tsc --noEmit` (0 errors) + `npm run test:cov` (the whole suite, the coverage gate, then a check that the test count in the README matches the run — `npx vitest run` alone skips both, and `.github/workflows/build.yml` runs exactly `test:cov`) + `npm run build` (green, `dist` free of inline scripts) + `npm run eval` (Hit@1 ≥ 60 %; the 58-note / 45-query corpus currently measures **71.1 %** for the engine against **51.1 %** for naive substring search, deterministic and without vectors) — verify UX changes in the browser as well.
- A version bump touches five places: `package.json`, `package-lock.json` (both via `npm version <x.y.z> --no-git-tag-version`), `src/core/version.ts`, `server.json` (twice) and `npm/package.json` — plus a `## [x.y.z]` section in `CHANGELOG.md`. The release page is built from that section; a test fails without it.
- Language: documentation and code comments in English. Reply to the user in the language they write in — the maintainer writes German.
- UX standard: "brutally good" — test from the persona's perspective, no jargon labels.

## Current state (2026-10-02) — read before you start
- **Repositories:** `DamianTodorovic/kepta` is the only public repo — the headless Core, source-available under **BUSL-1.1** (converts to AGPL-3.0-or-later four years after each version), local copy `~/kepta-core`. It also carries the app downloads: the latest public release **v3.1.2** holds the macOS arm64/x64 DMGs and zips. There is no `kepta-pro-releases` and no `kepta-website` on GitHub — both 404. This repo (`~/kepta-app`, `main`) is the desktop application: **proprietary, no git remote, local only**, and marketed simply as **KEPTA** — the "KEPTA Pro" labels left the UI in 3.1.1, the license mechanism itself stayed. `~/kepta-enterprise` is the coordination layer on top, also local; `kepta-license-studio` holds only the License Studio builds.
- **Versions:** the app is **3.1.2** (package.json, package-lock, `src/core/version.ts`, `server.json` twice, `npm/package.json`, `CHANGELOG.md`) — the same number the public release and the npm package use. `kepta-mcp` **3.1.2** is live on npm (published 2026-10-02, license BUSL-1.1). `~/kepta-core` is at **3.2.0** with the tag still local: nothing here has been pushed or published by this work.
- **Both HTTP APIs answer this computer only** (`src/lib/herkunft.ts` here, `src/herkunft.ts` in Core): a foreign `Host` header and write requests from other websites get 403. It is the first middleware in `createApp` — never register a route before it, never loosen it without a test.
- **Never** force-push or rewrite public history. The old clone `~/kepta` shares no history with the public Core repo (it is still on 2.11.0 under MIT, diverged) — do not work or push there.
- Binding a license to one Mac was tried and dropped — do not bring it back. Licenses are name + key, offline, with a license number.

## Hard-won rules
- **Local packaging:** delete `node_modules/better-sqlite3-multiple-ciphers/build/Release/.forge-meta` before every `electron-builder` run, check the result with `node scripts/pruefe-native.mjs release`, then `npm rebuild better-sqlite3-multiple-ciphers` so Node can load the module again.
- **Check heuristics against real data before a release** — contradictions, classification, the privacy shield. Clean test data hides false alarms: the first contradiction detector passed every test and still raised 17 false alarms on a real knowledge base.
- **Never open the maintainer's database directly** and never load `dist/server.cjs` to inspect it — it starts a server against the real data. Read through the running app's API (the port is in `~/.kepta/endpoint.json`; the app allows 180 requests a minute).
- Never delete notes for good — the trash, with a backup and a list of ids to restore.

## Division of roles
The KEPTA chat is a test cockpit (proving mode). The product is the memory layer for Claude Desktop and Cursor via MCP (`POST /mcp`, 8 tools, protocol 2026-07-28).
