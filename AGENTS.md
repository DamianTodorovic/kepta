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
- Quality gates before every push: `npx tsc --noEmit` (0 errors) + `npm run test:cov` (the whole suite, the coverage gate, then a check that the test count in the READMEs matches the run — `npx vitest run` alone skips both, and CI runs exactly `test:cov`) + `npm run build` (green, `dist` free of inline scripts) + `npm run eval` (Hit@1 ≥ 60 %; the 58-note corpus currently measures 62 % for the engine against 51 % for naive substring search) — verify UX changes in the browser as well.
- A version bump touches five places: `package.json`, `package-lock.json` (both via `npm version <x.y.z> --no-git-tag-version`), `src/core/version.ts`, `server.json` (twice) and `npm/package.json` — plus a `## [x.y.z]` section in `CHANGELOG.md`. The release page is built from that section; a test fails without it.
- Language: documentation and code comments in English. Reply to the user in the language they write in — the maintainer writes German.
- UX standard: "brutally good" — test from the persona's perspective, no jargon labels.

## Current state (2026-09-17) — read before you start
- **Repositories:** `DamianTodorovic/kepta` is public (AGPL, the headless Core, local copy `~/kepta-core`). `DamianTodorovic/kepta-enterprise` is this repo — private, the desktop app, marketed as **KEPTA Pro** (the tiers Free / Pro / Enterprise live in the license key and unlock the same app; Business is not offered anymore — team features moved into Enterprise). `DamianTodorovic/kepta-pro-releases` is public and holds downloads only (README, LICENSE, installers) — never source code. `kepta-license-studio` holds only the License Studio builds; `kepta-website` is private and offline.
- **2.13.2** is on `main`. The latest public release is **2.13.1** (macOS arm64/x64 DMGs built locally, Windows x64/arm64 installers from the CI job via workflow_dispatch). A release is published by the maintainer with a prepared script.
- **Both HTTP APIs answer this computer only** (`src/lib/herkunft.ts` here, `src/herkunft.ts` in Core): a foreign `Host` header and write requests from other websites get 403. It is the first middleware in `createApp` — never register a route before it, never loosen it without a test.
- **npm is current again:** `kepta-mcp` 2.12.0 went live on 17 September 2026 (19:15) from the Core repo's Publish workflow, after months stuck at 2.10.3. `npx -y kepta-mcp` now gets a version that has `setup`/`ui` and opens an encrypted knowledge base.
- **Never** force-push or rewrite public history. The old clone `~/kepta` shares no history with the public Core repo — do not work or push there.
- Binding a license to one Mac was tried and dropped — do not bring it back. Licenses are name + key, offline, with a license number.

## Hard-won rules
- **Local packaging:** delete `node_modules/better-sqlite3-multiple-ciphers/build/Release/.forge-meta` before every `electron-builder` run, check the result with `node scripts/pruefe-native.mjs release`, then `npm rebuild better-sqlite3-multiple-ciphers` so Node can load the module again.
- **Check heuristics against real data before a release** — contradictions, classification, the privacy shield. Clean test data hides false alarms: the first contradiction detector passed every test and still raised 17 false alarms on a real knowledge base.
- **Never open the maintainer's database directly** and never load `dist/server.cjs` to inspect it — it starts a server against the real data. Read through the running app's API (the port is in `~/.kepta/endpoint.json`; the app allows 180 requests a minute).
- Never delete notes for good — the trash, with a backup and a list of ids to restore.

## Division of roles
The KEPTA chat is a test cockpit (proving mode). The product is the memory layer for Claude Desktop and Cursor via MCP (`POST /mcp`, 8 tools, protocol 2026-07-28).
