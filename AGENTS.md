# AGENTS.md — working rules for AI agents in this workspace

## Your memory: K3PTA (MCP server `kepta`)
Use the K3PTA MCP tools as your persistent memory, across sessions:

- **Session start**: `memory_search` on the current topic, before asking or redoing work. Also `memory_list { type: "procedural" }` for project procedures.
- **Session end / important findings**: `memory_save` — pick the type yourself:
  - `semantic` = facts and architecture (e.g. "K3PTA 2.11 stores its knowledge base encrypted, via better-sqlite3-multiple-ciphers")
  - `episodic` = events (e.g. "persona test found the wizard re-trigger bug")
  - `procedural` = repeatable procedures (e.g. "release: npm test → eval → build → tag v*")
- **Outdated knowledge**: `memory_forget { mode: "supersede" }` or `expire` — never park a contradicting node indifferently beside the old one.
- Set tags: `kepta`, `project`, plus a topic tag. Set `confidence` honestly (verified = 1.0, guess = 0.5).

## Project layout
- App: repo root (React + Express + Electron — server `server.ts`, core `src/core/`, UI `src/components/`, tests `tests/`, Electron `electron.js`, data `~/.kepta/kepta.db`)
- Python client: `python/` (stdlib only, published to PyPI as `kepta`)
- Quality gates before every commit: `npx tsc --noEmit` (0 errors) + `npm run test:cov` (the whole suite, the coverage gate, then a check that the test count in the README matches the run — `npx vitest run` alone skips both, and `.github/workflows/build.yml` runs exactly `test:cov`) + `npm run build` (green, `dist` free of inline scripts) + `npm run eval` (Hit@1 ≥ 60 %; the 58-note / 45-query corpus currently measures **71.1 %** for the engine against **51.1 %** for naive substring search, deterministic and without vectors) — verify UX changes in the browser as well.
- A version bump moves the app and its npm bundle together: `package.json`, `package-lock.json` (both via `npm version <x.y.z> --no-git-tag-version`), `src/core/version.ts`, `npm/package.json` (the bundle is published as `kepta-mcp`) — plus a `## [x.y.z]` section in `CHANGELOG.md`. The release page is built from that section; a test fails without it. **`server.json` is a different number:** it names the engine version *published on npm* and is measured against the npm registry by `tests/mcp-registry.test.ts` — never sweep it along.
- Language: documentation and code comments in English. Reply to the user in the language they write in — the maintainer writes German.
- UX standard: "brutally good" — test from the persona's perspective, no jargon labels.

## Current state (2026-10-10) — read before you start
- **The app has no key and no limits** (Damian, 9.10.2026, shipped in 3.1.5 / `c7cde55`): no license field, no activation, no daily counters, no upgrade panel, no "first day" — in the UI, in the API and in every outward text. `tests/keine-grenzen.test.ts` fails if any of it comes back. Licence keys belong to **K3PTA Enterprise** only (a contract, issued personally) and live in this repo as operator tooling: `tools/license-studio`, `tools/lizenz-worker`, `scripts/generate-license.mjs`. No runtime path of the app reaches `src/core/lizenz.ts`.
- **Repositories:** `DamianTodorovic/kepta` is the public repo — the headless Core, source-available under **BUSL-1.1** (converts to AGPL-3.0-or-later four years after each version), local copy `~/kepta-core`. It also carries the desktop installers: each app build arrives as a `app-x.y.z` tag with a `SHA256SUMS.txt`, and `releases/latest` is the rolling download address the README and the site use. `v*` tags there fire `publish.yml` (npm + MCP registry) and `py-v*` fires PyPI — so never tag blindly. This repo (`~/kepta-app`, `main`) is the desktop application, proprietary (UNLICENSED), on the **private** remote `DamianTodorovic/kepta-app` — the source has lived there since 8.10.2026, not only on this machine. `~/kepta-enterprise` is the coordination layer on top; `kepta-license-studio` holds only the License Studio builds. There is no `kepta-pro-releases` and no `kepta-website` on GitHub — both 404.
- **Versions:** the app and its npm bundle are **3.1.5** (`package.json`, `package-lock.json`, `src/core/version.ts`, `npm/package.json`, `CHANGELOG.md`). The engine on npm is **3.2.0** (`kepta-mcp`, published 09.10.2026 by the core repo's `publish.yml` from tag `v3.2.0` = commit `6fe7955`) — `server.json` names *that* number, not the app's, and `tests/mcp-registry.test.ts` holds the constant. `~/kepta-core` is at 3.2.0 on `main` too.
- **Both HTTP APIs answer this computer only** (`src/lib/herkunft.ts` here, `src/herkunft.ts` in Core): a foreign `Host` header and write requests from other websites get 403. It is the first middleware in `createApp` — never register a route before it, never loosen it without a test.
- **Never** force-push or rewrite public history. The old clone `~/kepta` shares no history with the public Core repo (it is still on 2.11.0 under MIT, diverged) — do not work or push there.
- Binding a licence to one Mac was tried and dropped — do not bring it back. Licences are name + key, offline, with a licence number.

## Hard-won rules
- **Local packaging:** delete `node_modules/better-sqlite3-multiple-ciphers/build/Release/.forge-meta` before every `electron-builder` run, check the result with `node scripts/pruefe-native.mjs release`, then `npm rebuild better-sqlite3-multiple-ciphers` so Node can load the module again.
- **Check heuristics against real data before a release** — contradictions, classification, the privacy shield. Clean test data hides false alarms: the first contradiction detector passed every test and still raised 17 false alarms on a real knowledge base.
- **Never open the maintainer's database directly** and never load `dist/server.cjs` to inspect it — it starts a server against the real data. Read through the running app's API (the port is in `~/.kepta/endpoint.json`; the app allows 180 requests a minute).
- Never delete notes for good — the trash, with a backup and a list of ids to restore.
- **Probe checklist before the first shot (three traps, each found the hard way in `~/kepta-app` on 16.10):**
  1. In jsdom, `import.meta.url` is an **http** URL — `fileURLToPath(import.meta.url)` throws `TypeError: The URL must be of scheme file`, and the red you are looking at is your own probe, not the surface. Resolve against `process.cwd()` instead (the house way: `lies()` in `tests/doku-zahlen.test.ts`). *Tell: a TypeError from inside your helper, before any assertion ran.*
  2. Measure a child's right edge against the panel's **content box**: `kante = rect.right − paddingRight`. Both wrong forms have been measured on this tree — `width − padding` counted twice, and a bound taken from `rect.left + (width − padL − padR)`, which forgets the left padding and inflates every child by exactly that (measured again 16.10. 06:12: 30 px at 1440, 22 px at 390, with the padding itself measured `[32,32]` / `[24,24]`). *Tell: the same number at every viewport width while `scrollWidth − clientWidth` says 0.*
  3. A viewport screenshot of a section sitting below the fold returns **byte-identical "with" and "without" images** — hash the whole set before reading any of it. *Tell: two names, one sha256.* Then `scrollIntoView` (or `captureBeyondViewport`) and shoot again.
  4. **A log saying the guard did not fire proves less than a screenshot that could not exist without the fix.** Prefer the artefact that requires the change; name the channel when you must report absence. Measured 16.10.: the release chain printed `OK läuft, version 3.2.15` for a package written an hour before the commit it was supposed to contain — the runtime question was answered, the content question nobody had asked.
- **Before any local run: `pgrep -f electron-rebuild`, plus the binding size** (`ls -la` on the file the loader actually dlopens — `build/Release/better_sqlite3.node` under Node = 2 217 808 B / ABI 147; `bin/darwin-arm64-149/…` under Electron = 2 217 744 B / ABI 149; `lib/better_sqlite3.node` does not exist, so a `ls` on it proves nothing). Two hands reached for the same tree at 17:40 and 18:19 on 16.10; two seconds on the plate would have told both.
- **A timeout under foreign load is neither a defect nor an acceptance.** 80 cases of one file (untouched since 05:53) timed out at 60 s while 44 node processes ran; the same file was green 25 minutes before (19:24:54–19:47:59 red, 19:51:49–19:54:09 green, 2 653 / 0). Do not count it as red, and do not count the next run as a verdict on your change unless you can name what the machine was doing.

## Division of roles
The K3PTA chat is a test cockpit (proving mode). The product is the memory layer for Claude Desktop and Cursor via MCP (`POST /mcp`, 8 tools, protocol 2026-07-28).
