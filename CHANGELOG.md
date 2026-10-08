## [Unreleased]

## [3.1.4] — 2026-10-08

### Security
- **The window can no longer fetch a webfont from a stranger.** The content policy allowed `fonts.googleapis.com` and `fonts.gstatic.com` although the app ships no webfont at all — only system fonts through CSS variables. On an app whose promise is that everything happens on this machine, an unused permission is still an open door: one added `<link>` and the first launch pulls type from Google. The hardening test fails if a font host comes back. Measured against this build's own package (`release/mac-arm64/KEPTA.app`, launched with a throwaway data dir): every socket the running app held sat on `127.0.0.1` — fourteen, counting the listener and the renderer's keep-alive connections — and none reached another address; the only peer it contacted was a model server on `127.0.0.1:11434`. An earlier note here said “exactly one socket”, which was a sampling artefact (listeners only). `/api/health` of that same run answers `version: 3.1.4`.

### Changed
- **One listener per app under test, not one per request.** Supertest turns an Express app into a fresh `http.Server` for *every* call, binds an ephemeral port and closes it right after the answer — with 118 workers that is a stream of ports handed to whoever asks next, and the suite has been answering with statuses this app cannot produce (401 where 403 belongs, 404 where 400 belongs, `ETIMEDOUT`, a 200 without the counter header). `tests/setup.horchen.ts` keeps exactly one listener per app for the whole file; `tests/helfer/horchen.test.ts` measures it, and ordinary mock servers stay untouched.
- **Seven scan checks state the status before the body.** One of them read `byFolder.find(…)` out of whatever came back; when the answer was not the expected one, the failure read `Cannot read properties of undefined (reading 'find')` and said nothing about what had actually been sent. Each site now asserts the status first and prints the answer text beside it.
- **The README no longer sells a tier that is gone.** It offered „KEPTA Pro“, a free „Pro day“ and „Buying Pro“ — what exists is KEPTA Core (free) and KEPTA Enterprise (by agreement, the key issued personally). The licensing section says that now, and a docs test fails on any dead-tier wording.
- **The test canvas stopped lying about text width.** The jsdom stand-in measured every string at a fixed 6 px per character, whatever `ctx.font` said. The graph shrinks its labels with the zoom, so labels were up to four times too wide in tests and pushed neighbours out of slots the browser would have kept. It now measures with the font that is set (0.5 × size per character, 12 px as the default), which is exactly the size the label tests were calibrated at — all 154 graph render checks still pass, and `tests/helfer/canvas.test.ts` pins the proportionality.
- **The suite stopped sharing sockets it had no right to reuse.** Node keeps the global HTTP agent on `keepAlive: true`, and `request(app)` binds a fresh ephemeral port for every call, releasing it again straight after the answer. Under 117 workers that is a stream of ports handed to whoever asks next, and the answers that came back were not the ones this app can produce: 401 where 403 belongs, 404 where 400 belongs, `ETIMEDOUT`, and a 200 without the counter header the middleware always sets. `tests/setup.http.ts` turns reuse off. Measured: without this line a four-file harness failed in 2 of 6 runs and the full suite in 2 of 3; with it (and only once it actually took effect — the first attempt set `options.keepAlive`, which the agent ignores) the last four full runs were green, 117 files / 1979 tests, as is the CI runner. The durable guard is still the rule the enterprise suite enforces: never `request(app)`, always a server that listens once per file.
- **A speed promise that survives a busy machine.** The edge-hit check demanded “one pointer move over 12 000 links in under 4 ms“ from a single 20-move average; it fell at 5.85 ms in a parallel run while nothing about the search had changed. It now takes the median of three 60-move series and prints all three.
- **Built is not shipped.** The README named Windows and Linux paths in the policy reader and the key-storage paragraph without saying the app leaves only for macOS. Both sentences now carry the shipping state, and the platform test fails any Windows/Linux claim that does not.
- **The README stops promising installers that are not shipped.** The download table offered Windows files (`KEPTA-<version>-win.exe`, "take this one if unsure") and a Windows first-launch guide, while every published release carries macOS only. The table now says which platforms actually get an app, keeps the self-build route for Windows and Linux as a source build, and a test (`tests/doku-plattform.test.ts`) fails if a published-installer claim comes back.

### Fixed
- **The version bump had corrupted two dependencies in the lockfile.** Counting 3.1.2 → 3.1.3 replaced the string wherever it stood, so `bytes` and `@jridgewell/resolve-uri` ended up on versions that the public registry has never published; a clean `npm ci` (the CI's first step) died with `notarget`. Both entries now name the real published version, and `scripts/pruefe-lock.mjs` — run by `npm test` before the suite — reports every dependency whose lockfile version differs from what is installed.
- **Two outward texts sent people to a repository that answers 404.** The README's download link and the key-mail template in both license tools pointed at `DamianTodorovic/kepta-pro-releases` — not public (measured anonymously: HTTP 404), named after a tier that no longer exists, and the mail line promised “macOS/Windows/Linux” packages while only macOS ships. All three now name the engine repository's releases, and `tests/doku-plattform.test.ts` fails on any download link that points elsewhere, including in the tools.
- **A release build no longer fakes a broken test suite.** Packaging rebuilds the native SQLite module for Electron; the next `npm test` then failed hundreds of tests whose visible message was a trailing `afterEach` line, not the cause. `npm test` now checks the module loads under the running Node first and, if it does not, names the one remedy instead of drowning the run.


## [3.1.3] — 2026-10-08

The knowledge graph got finished. Before this, the picture showed notes and the lines between them; it now shows **what is claimed, by whom, how much sits behind it, and whether it still holds** — and it gives you the levers to read a large base.

### Added
- **Claim direction.** Each link runs from its wide end to its narrow one: who says what about whom. Off shows plain lines.
- **Link text, weight and card.** A line names its relation, is drawn thicker when several claims sit on the same pair, and hovering it opens who-over-whom, how often, and for how long.
- **Validity on the edge.** A claim that has expired is drawn dashed, the same way an expired note is ringed. The time slider and the picture agree.
- **What the picture is missing.** A badge counts the neighbours a node has but the picture could not draw; a balance line names every gap — clipped edges, hidden neighbours, self-claims, vectors left out of the semantic map. Nothing is dropped quietly.
- **Labels are a decision, not a carpet.** Three settings (Key / All / Off), a crowding grid that keeps titles from lying on each other, and the full name under the pointer even on Off.
- **A sign inside the node that reads without colour** — a letter for its kind, a number for what a concept carries. Colour-blind safe by construction.
- **Groups fold, in both views.** Double-click a group in the tree and it steps behind a `×N` badge that keeps counting; the force view obeys the same state and hides only what nothing else carries.
- **A claim about itself is not a neighbour** — it gets a loop, and a switch.
- **The third view: Semantic.** Notes placed by the meaning of their own texts, from a deterministic projection computed on the server, so no embedding travels into the view. It says how much of the difference its two axes carry and where the notes without a vector were parked.
- **Schema inventory.** A second look at the same payload: which kinds, concepts and claims the store actually holds. Choosing a row spotlights it in the picture.
- **Provenance colour.** Written in KEPTA, from a file, from this computer — a second colour channel that switches itself off, with the reason, when the base has nothing to distinguish.
- **Search counts its hits and leads you through them.** How many notes match, which one you are on; Enter jumps, Shift+Enter returns, Escape clears the word first.
- **Forces you can set.** Center force, repel strength, link distance, node size. Turning a slider does not rebuild the world: the picture keeps its place and settles under the new forces, and one click returns the tuned defaults.
- **Concepts are nodes in the force field too**, and an agent writing a memory is visible in the dashboard's own number.
- **Keyboard parity**: arrow keys reach concepts, Enter opens what a click opens.

### Changed
- **A term must be more than the title of the one note carrying it.** Repeating your own filing is an echo, not knowledge, and the graph leaves it out — on a 400-note base that turned 420 "concepts" and 1 400 lines into 20 concepts and 500. The write path is unchanged; what you stored stays stored.
- **Repulsion is weighted against the link springs, not against nothing.** The repelling force carried a stray integration factor and delivered a sixtieth of its own constant, so topics pressed together like petals and the knob moved nothing. On the same 400-note base the topics now stand apart as islands with white space between them.
- **The tree folds itself to fit its canvas.** 400 notes are 425 rows and no screen holds that; the deepest groups now step behind a `×N` badge, the balance line says how many notes are gathered, and one click opens everything again. The old behaviour clipped rows off the canvas in silence.
- **Fit-to-view really frames the whole graph** — including the strip the legend takes at the bottom, which used to sit on top of the lowest notes.
- Similarity is on request, and the head line counts only what is in the picture.

### Fixed
- **A base of ~400 notes opened as a black canvas.** The spring net diverged: a concept with twenty leaves threw itself further out every frame, the world ended at 4,5e13 units and the view fitted to 2 % of an empty field. A speed limit of three rest-lengths per frame stops the fall; collision stays uncapped.
- **A filter left the camera where it was**: the head line said eight notes while the picture showed nothing. The view now returns everything to the frame and centres it.
- **A partial response from the file-scan preview threw the whole dialog away** (twice: the list and the status route).
- **At phone width the graph was given an 80-pixel strip**; the shell now collapses its side rail instead.
- The supply-chain section of the security notes named hashes, a licence and a version that did not match what is published; it now describes the artefacts that actually exist (electron-builder `latest-mac.yml` with SHA-512, BUSL-1.1 source-available engine, macOS arm64/x64 installers).

### Security
- **Private notes are no longer readable or deletable through the id paths.** An agent — or anything talking to the MCP door — can neither see nor remove a memory marked private; the check sits in front of the store, not in the UI.

## [3.1.2] — 2026-10-02

The app becomes publicly downloadable — and this finishes the release cut the previous commit started: `3.1.2` landed in `package.json` alone, while the version module, `server.json` and the npm package still carried 3.1.1 and `package-lock.json` had drifted to 2.13.14. Four tests were red on exactly that (`version`, `mcp-registry`, `npm-package`, `doku-zahlen`); the number is one again at every place.

### Added
- **Search section in Settings** (build package 2). Retrieval depth, the three retrieval tracks and the result count are settable in the UI and travel with every search call — no config file needed.
- **Trace provenance per hit, measured search time, and a "brain warm" indicator** (package 2). Each hit names which leg saw it; the dashboard measures the response time itself and shows the core's delta cache as a state instead of an invisible speedup.
- **Brain status on the dashboard** (package 2): version, node counters, encryption with its key storage, embedding model and vector counters — `/api/health` is now visible on the main surface.
- **Today 2.0** (package 3): the time-machine slider and a consolidated truth movement — new, updated, superseded (with successor), deleted.
- **Dossier 2.0** (package 3): contradictions resolve in the flow (newer wins, both-valid windows, editor); the resolve route grew a `window: true` option.
- **Chat with full memory** (package 3): the engine question carries retrieval depth and track switches, hits get source-provenance badges, the answer pane shows search duration and warm state.
- **The real KEPTA mark as app icon** — `build/icon.icns` built from the KeptaMark geometry on the Big Sur grid, replacing the generic electron.icns.

### Fixed
- **`since=0` is the time machine's "everything" window.** The briefing route no longer drops an explicit 0 onto the 24-hour default.
- **The app's own coverage gate was red since 3.1.1.** `src/core/**` demands 100 % function coverage, and the core lift left four functions never executed: `aktiviereSuchCacheDelta` (called only from the bootstrap, which tests do not run), the unsubscribe closure of `onMemorieAenderung`, and `VerschlussteAuditDatei.flush()` together with its swallowed-error branch. Three tests cover them now, and the audit-file test awaits `flush()` instead of sleeping 120 ms and hoping. The run: 1,629 tests over 105 files, `npm run test:cov` green including `doku-check`.
- **The documentation said things the repository does not support.** The npm package inside this repo still claimed MIT while the core is BUSL-1.1 (package, `npm/LICENSE`, `npm/README.md` and the test that pins them moved together); the app's `LICENSE` was titled "KEPTA Enterprise" and pointed at an AGPL core; the download and CI badges named `kepta-pro-releases` and `kepta-enterprise`, neither of which exists on GitHub (both 404) — they now name the public core repository, which is where the DMGs and the working CI actually are; the security document still called `profile.json`, `scan-config.json` and the journals plaintext although they have carried the database key since 2.13.4; and the LongMemEval runner README stopped at 37,0 % (25.9.) although the 1.10. series reached 61,5 % — it now carries the whole series, the judge A/B (+11,7 pp with the engine untouched), the strict-binary 40,4 % reading and the in-sample caveat. `aktiviereSuchCacheDelta`, the tier-free sidebar branding and the license number's disappearance from the UI are checked against the code, not remembered.

## [3.1.1] — 2026-10-01

### Changed
- **The app runs on the open core 3.1.1** (build package 1 of the app master plan). `src/core/**` was lifted from kepta-core 3.1.1: search cache keyed on a trigger-fed data generation with delta maintenance (`aktiviereSuchCacheDelta` wired at bootstrap), AND-first FTS, engine/library exports — the engine is identical with the core repository (~/kepta-core, no local forks).
- **Branding is simply KEPTA.** The "KEPTA Pro" claims ("Licensed to …", upgrade banners, Pro pricing) left the UI; the license mechanism itself stays untouched.
- Version parity 3.1.1 across package.json, server.json, npm package and the core version module.
- The License Studio tools directory was restored from history (tests/license-studio*.ts had lost their subject in the copy).

### Fixed
- The encrypted sync journal and audit-file sinks (K1.-encrypted, same key as the knowledge base) exist in the app layer as documented app variants of the core classes (`VerschlusstesSyncJournal` / `VerschlussteAuditDatei`, `src/core/nebendateien.ts`) — the source-available core 3.1.x writes these files in plaintext. They are the seam an integrator wires and are covered by `tests/nebendateien.test.ts`; the app's own running audit trail is the sealed log inside the encrypted database (`src/lib/pruefprotokoll.ts`), not one of these files.
- `saveWithIndex` keeps the app-era explicit-timestamp pass-through (LongMemEval ingest), documented as an app extension against core 3.1.1.
- The Plan-State keychain adapter (`server/helfer/plan-schluesselbund.ts`) keeps the separate `app.kepta.plan` entries after core 3.1.x removed the target parameter from `schluesselbundFuer`.

## [2.13.14] — 2026-09-26

### Fixed
- **Every preference survives the restart.** Semantic-search toggle, result slider, grouping, wizard choice, auto-learn, the adaptive profile and the scan wish all lived in the port-scoped browser storage and reverted to defaults at every start (same audit finding as the AI connection). They now mirror into the encrypted database and are rehydrated at boot — only filling keys that are missing, so fresher local choices win.
### Security
- **SSRF guard hardened:** multicast (224/4, ff00::/8), reserved (240/4), benchmark (198.18/15) and 192.0.0.0/24 are now blocked too, and the DNS-rebinding comment states what actually holds.

## [2.13.13] — 2026-09-26

### Fixed
- **The AI connection survives the restart.** The browser storage hangs on the app's random-port origin — and the port changes at every start, so provider, model and API key were gone after every restart (audit evidence: ten orphaned origins in the app profile). Every save now mirrors into the encrypted database, and the app rehydrates from that mirror at boot when the storage is empty. Four new tests.

## [2.13.12] — 2026-09-26

### Fixed
- **The `chat_cloud=deny` organization policy could be bypassed through the streaming endpoint.** The check lived only in the blocking /api/chat route — /api/chat/stream still reached api.openai.com. Both chat routes now run the same guard, and a regression test proves: stream + cloud host = 403, stream + local model = open. Found in the 26.9. line-by-line audit.
- The license module's comment described the old lock model; it now states the freemium truth (Core, Pro day, daily limits, never locks).

# Changelog

All notable changes are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versioning follows [SemVer](https://semver.org/).

## [2.13.11] — 2026-09-25

### Changed
- **The sidebar no longer shows the version (Damian, 25.9.).** The card names the tier only — KEPTA Core / KEPTA Pro / KEPTA Enterprise — without the number; the version stays available in the system status and over /api/health. Reverses the sidebar part of 2.13.10.

## [2.13.10] — 2026-09-25

### Changed
- **The app shows its version.** The sidebar names the tier with the version (KEPTA Core 2.13.10), and the system status lists it as the first row — previously the number existed only over MCP and /api/health.

## [2.13.9] — 2026-09-24

### Changed
- **Tier naming (Damian, 24.9.): the unlicensed app is KEPTA Core** — the Pro day (24 h, every tool open) belongs to Core; **KEPTA Pro is the license key** that removes the daily limits. The sidebar shows KEPTA Core / KEPTA Pro accordingly. Same binary, one download.

## [2.13.8] — 2026-09-23

### Fixed
- **The Buy button never leads into the void.** Until Paddle goes live the
  upgrade URL falls back to `kepta.pro/upgrade`, which does not exist yet —
  a fresh user clicking "Buy KEPTA Pro" landed on a dead address. The API
  now reports `checkoutLive` (true only when `KEPTA_UPGRADE_URL` is set),
  and the upgrade panel renders accordingly: with a live checkout the real
  buy button; without it, "Get KEPTA Pro — write to Damian on LinkedIn".
  Key activation beside it is untouched.

## [2.13.7] — 2026-09-23

### Security
- **The nuke path is closed.** Deleting the database and the keychain
  entries used to look like a fresh install and grant a second trial day.
  The first-start anchor now lives in **two independent local proof
  places**: the keychain entry and a hidden anchor file outside the data
  folder (`…/Application Support/KEPTA/trial-anchor` and equivalents). The
  two are read as a consensus — wiping one leaves the other, and forging or
  corrupting either (garbage content, mismatched timestamps) is an anomaly
  that forfeits the trial day. Still fully local: nothing phones home, and
  license holders run ahead of every check. Two new attack tests cover
  "delete everything" and "forge the anchor file".

## [2.13.6] — 2026-09-23

### Security
- **The free limits can no longer be talked out of the app.** The daily
  counters and the trial day used to live in process memory (a restart reset
  the counters) and as a plaintext timestamp (a rolled-back clock extended
  the day). Both now live in a **sealed plan state**: AES-256-GCM encrypted
  and authenticated with a dedicated keychain entry that is separate from
  the database key and never displayed, plus a first-start anchor in the
  keychain that survives the database. Concretely: an app restart resets
  nothing; a clock that falls behind the highest seen time forfeits the
  trial day; editing, forging or deleting the state is detected (the
  authentication fails or the anchor proves an earlier install) and costs
  the trial day — never the data, and license holders are unaffected.
  Every attack has a failing test in `tests/probetag.test.ts`.

### Fixed
- The 429 limit response now carries the `X-KEPTA-Plan` header like every
  other answer of the middleware.

## [2.13.5] — 2026-09-22

### Added
- **Every download comes with one free Pro day.** A fresh install runs 24
  hours with every Pro tool, unlimited — no panel, no account, no key. The
  first-start timestamp lives in the encrypted database (`probetag_start`),
  so a restart is not a new day, and nothing phones home. The free plan
  takes over afterwards exactly as before: the same features with generous
  daily limits, never a lock. The sidebar footer shows the running day
  ("Pro day · 21 h left"), the upgrade panel names the clock while it runs,
  and the day's end arrives once as a plain toast — a sentence, not a wall.

### Fixed
- The license-route header comment still described the pre-freemium world
  ("locked from the first start, no trial") — it now describes what the app
  actually does.

## [2.13.4] — 2026-09-22

### Security
- **The files next to the database are now encrypted too.** `profile.json`,
  `scan-config.json` and the sync journal sat in plaintext next to an
  encrypted knowledge base — the same 256-bit key now protects them
  (AES-256-GCM), and plaintext files from older versions are understood on
  read and encrypted on the next write. Deliberate plaintext exceptions are
  documented in SECURITY.md: `endpoint.json` (no secret — it is how local
  tools find the app) and the inbox folder (files you dropped there yourself).
- **The keychain can no longer silently destroy your key.** Creating a
  database key used `security add-generic-password -U` on macOS — an update
  in place. If a read failed transiently (keychain ACL, a hanging `security`
  call), a key creation looked like "no entry yet" and overwrote the real
  key: the encrypted knowledge base became unopenable. Now: the key is read
  twice before anything is created, an existing entry is never overwritten
  (creating against an existing entry fails loudly with recovery
  instructions), and a regression test pins all of it.

### Fixed
- **Device-Sync export no longer truncates silently.** The bundle took the
  default page of 100 memories — a "full" export of a larger base was
  incomplete. It paginates now; a test exports 137 notes and expects all of
  them.

## [2.13.3] — 2026-09-22

### Added
- **Team memory, first slice (Enterprise).** Team scopes and roles arrive in the
  app: `team:*` scopes are available on Enterprise editions only, with roles
  read from the managed file — admins and members can write, viewers read
  (Pro stays exactly as it was). A new **Team view** shows edition, seats,
  roles and per-team note counts; on Free/Pro it renders as an upgrade card
  instead of a dead end.
- A **LongMemEval benchmark harness** ships under `tools/longmemeval/` — the
  measuring stick for the retrieval engine. First published baseline:
  29.2 % on LongMemEval-S with the lexical-only path, reported with full
  per-question results.

### Fixed
- **Search keeps its footing on large knowledge bases.** The search engine
  re-read every note on every query (page-by-page over the whole store) — now
  it holds a per-store inventory cache that invalidates on any write. On a
  200 000-note corpus this took a query from over a minute down to
  milliseconds; the 3 000-note daily reality stops paying that tax too.
- Internally labelled "business" editions now display as **KEPTA Enterprise**
  everywhere (sidebar, team view, settings, upgrade panel) — the public tier
  named Business no longer exists.

## [2.13.2] — 2026-09-17

### Security
- **KEPTA answers this computer only.** The app's HTTP server now refuses
  requests whose `Host` header does not name this computer — a website using
  DNS rebinding could otherwise read the notes — and refuses requests from any
  other website that would change something: before, an ordinary web page
  open in the browser could write a note into the knowledge base through a
  form. The app window, AI apps over MCP and scripts work as before.
- express 4.22.3 with qs 6.16.0: a crafted query string can no longer stall
  the server (GHSA-4mjr-xmp4-gh2g) or slip past the array limit
  (GHSA-x5fp-wj9c-mxmx).

### Changed
- **Codebase modernised, no behaviour change.** The server — formerly one
  2 300-line file — is now organised as `server/app.ts` plus one router module
  per feature area, with shared helpers under `server/helfer/`; the stack
  moved to Express 5.2, Vite 8, Vitest 5, TypeScript 5.9 and Electron 44.4
  (keeping the qs fixes from 4.22.3), `npm run lint` now also runs ESLint
  (flat config, zero errors required), and the front end talks to the API
  through one typed client instead of scattered `fetch` calls. 1 486 tests,
  coverage gates unchanged.
- **Time travel, rebuilt.** The knowledge-graph time filter is now
  **date-exact**: pick a day in the date field (or scrub the slider) and the
  graph shows exactly that moment — no more whole-layout rebuilds while you
  drag, no seconds of frozen window on large knowledge bases. Layouts only
  recompute in the view that actually shows them, and a chosen moment stands
  still instead of sliding.
- Messages about features that need a license now name **KEPTA Pro**.

### Fixed
- *Settings → MCP / API* shows where Claude Desktop keeps its config file on
  Windows too, not only on macOS.

## [2.13.1] — 2026-09-16

The installers published as 2.13.1 were built on 16 September and contain
everything below.

### Added
- **Import your AI history.** *Settings → Data management → Import your AI
  history* turns a ChatGPT or Claude data export (`conversations.json`) into
  notes; importing the same export again updates instead of duplicating.
- **Managed deployment and central policies.** An organization places one
  `managed-settings.json` (macOS `/Library/Application Support/KEPTA/`, Linux
  `/etc/kepta/`, Windows `%PROGRAMDATA%\KEPTA\`, or `KEPTA_MANAGED_CONFIG`):
  it can pre-provision the license — validated offline like any key — and
  enforce `chat_cloud: deny`, `machine_scan: deny` and
  `privacy_shield: force_on` on the server. *Settings* shows an Organization
  panel with the tier, seats and active policies. `SECURITY-ENTERPRISE.md`
  describes it for procurement.
- **Windows installers** for x64 and arm64, built in CI.

### Changed
- **Licenses know their tier.** A key now says whether it is for KEPTA Pro
  (personal), KEPTA Business (with its number of seats) or KEPTA Enterprise,
  and the sidebar shows the tier. Every tier unlocks the same app. Keys issued
  before stay valid and count as Pro. The lock screen now simply says
  *Activate KEPTA*. The tier shown updates when the window regains focus.
- The app package contains no source maps at all, dependencies included.
- **The graph's time slider moves smoothly.** The layout is rebuilt once when
  you let go instead of at every step, and in the tree view the notes stand in
  their new place at once instead of gliding for seconds.

### Fixed
- **Dossier sentences stay whole.** A key fact no longer ends after an
  abbreviation — „The signed Lumen & Co.“ is now the whole sentence, and the
  same goes for „Dr.“, „z. B.“, „etc.“ and initials. A name that ends in a
  period no longer leaves two of them behind („Lumen & Co..“).

## [2.13.0] — 2026-09-14

### Added
- **Today.** One page for the start of the day: what is new since your last
  visit and who added it — you, an import or which AI app —, what changed, the
  open to-dos from your notes, what expires soon and what your AI apps did.
  Read straight from the local database: no AI involved, nothing leaves the
  computer. ⌘5.
- **Contradictions, side by side.** Two notes that name a different time,
  date, amount, percentage or quantity for the same thing appear next to each
  other, the differing value in bold: *Keep the newer*, *Keep the older* (the
  other is marked as replaced, never deleted) or *Both are right* (never asked
  again). Careful on purpose — only facts and how-tos are compared, both
  sentences must share their meaningful words, notes from the same file stay
  out, and so do the parts of a split file („README — 5/17“), the source line
  of a note and ranges like „2–4 days“. On a real knowledge base of 3 491
  notes, the first version raised 17 alarms — all from split files, source
  lines or ranges; with these rules it raises none.
- **Dossier.** Everything about a person, a project or a topic on one page:
  key facts, a timeline, how-tos, documents, open to-dos, contradictions and
  related topics. *Copy as Markdown* or *Save as note*. ⌘6.
- **Connect your AI apps in one click.** KEPTA finds Claude Desktop, Claude
  Code, Cursor, Windsurf and VS Code and adds itself to their MCP settings —
  pointing to the server inside the app, no Node and no npm. A backup of the
  old file sits right next to it, every other entry stays, and a file that is
  not plain JSON is never touched.
- **Live activity, with names.** Which AI app is active right now and what it
  searched, saved or changed — and a message the moment it happens: *Claude
  saved “…”*. ⌘7.
- **Audit log.** Every access to the knowledge base — by you, by each AI app
  and by scripts —, with exactly the notes an app got to see. Every entry is
  sealed with the SHA-256 of the one before it; *Check integrity* shows whether
  anything was changed, removed or cut off. Export as CSV, safe against
  spreadsheet formulas. A note's preview says which app read it and when.
- **Privacy shield.** Before a question goes to a cloud model, email
  addresses, phone numbers, IBANs, card numbers, passwords and keys become
  placeholders like `[EMAIL-1]` — the answer shows the real values again, even
  while it streams. AI apps read your notes without passwords, keys, card
  numbers and IBANs, and if one writes such a note back, the real values stay.
  Both protections are on by default, and every request to a cloud model is in
  the audit log. Settings → AI & data shows a live preview of what a cloud
  model would see.
- **Private notes.** One switch in the editor: a private note is never shown
  to an AI app and never sent to a cloud model — whatever the other switches
  say.

### Changed
- **The Obsidian import files notes by their content** instead of making a
  whole vault „facts“, and titles are the file name without folders, as in
  Obsidian; a re-import finds notes under their old folder title.
- Messages about AI apps name the app — *Claude saved “…”* — instead of *An
  agent saved a node*.

### Fixed
- **A license key has exactly one spelling.** Its last character carries one
  padding bit, and a key that differed only there was accepted as the same
  key. Issued keys are unaffected.

## [2.12.0] — 2026-09-13

### Changed
- **Every license has its own number, and the name shows in the app.** The
  sidebar says *Licensed to …*; the license number sits in its tooltip.
  Activation stays as simple as before — name and key, offline, once — and
  nothing leaves the Mac.
- **Keys that are passed on can be revoked.** A revoked license number is
  listed in the app; from the next update on, its key no longer unlocks KEPTA,
  also on Macs where it was already activated. The activation window says so.
- **Keys of the 2.11 form (without a number) are no longer accepted.** None
  had been handed to customers.
- **Names match in either Unicode form** — an „ü“ typed as one character or as
  „u“ plus a combining diaeresis (as it often comes out of a PDF) is the same
  name.

### Fixed
- **Copy buttons work again** — in the chat, for the recovery key, in the
  system status and for the MCP block. The window was denied every browser
  permission, writing to the clipboard included; now exactly that one is
  allowed, reading stays blocked.
- The activation window sent every activation twice (the button's click and
  the form's submit both triggered it). One click, one request.

## [2.11.0] — 2026-09-11

### Changed
- **Praxis-Sync is now called Device Sync** — in the settings tab, its
  messages, the activity feed and the export file name
  (`kepta-device-sync_…json`); its last German messages are English now. The
  bundle format stays the same, so bundles exported earlier still import.

### Added
- **The knowledge base is encrypted on disk.** `kepta.db` is stored in the
  SQLCipher 4 format (AES-256, an HMAC-SHA512 over every page) through SQLite3
  Multiple Ciphers. The key is 256 random bits, created on the first start and
  kept in the system keychain — the macOS Keychain, Windows DPAPI (bound to
  your Windows account) or the Secret Service on Linux. There is no password
  to type; the app and the MCP server read the same key. On a machine without
  a keychain (a server, a container) set `KEPTA_DB_KEY` to 64 hexadecimal
  characters. Not a word of a note, a title or the search index is readable in
  the file, in its write-ahead log, or in any copy or backup of it.
- **An existing knowledge base is converted on the first start of 2.11** —
  only when KEPTA has the file to itself. It copies the file, encrypts the copy,
  checks it (the same rows in every table, SQLite's integrity check) and puts
  it in place in one step; the old file is then overwritten with zeros. If an
  AI agent still has the file open, the conversion waits for the next start
  and *Settings → System status* says why.
- **Settings live in the encrypted database**, the AI provider key included.
  The `settings.json` of earlier versions is taken over once and then removed —
  after every value came back out of the database unchanged, and after the file
  was overwritten with zeros.
- **System status shows *Encryption at rest*** — where the key lives, or why
  the file is not encrypted yet. `/api/health` reports the same as `encryption`.
- **A license key from the first launch.** There is no trial: without a valid
  key the app shows the lock screen. A license key is an
  Ed25519 signature over the buyer's name: the app carries only the public key
  and checks it offline, so nobody can issue a key by unpacking the app. Keys
  are issued with `scripts/generate-license.mjs`, which signs with a private
  key that lives only in the maintainer's keychain. The lock screen is in
  English.
- **The app's own server checks the license too, not only the window.**
  Without a valid key, what only KEPTA Enterprise can do — chat, model
  discovery, the clipper, opening files, the machine scan and the profile —
  answers 403. Everything the open core can do stays free: notes, search,
  import, sync, export, MCP and the recovery key.
- **Agents connect without Node.js.** *Settings → MCP / API* now offers the
  MCP server that ships inside the app, started by KEPTA itself — no Node.js,
  no npm, and no stumbling over an npm release that cannot open the encrypted
  file. `/api/health` reports the exact command as `mcp.stdio`.
- **The app no longer ships its server source.** The package contained
  `dist/server.cjs.map` with the original code of 17 files; source maps now
  stay on the build machine, and the server bundle is minified (names kept).

- **Recovery key in one click.** *Settings → System status → Show recovery key*
  shows the key with a *Copy* button — paste it into a password manager once,
  no terminal needed. Day to day nobody needs it: the app and the MCP server
  fetch the key from the keychain by themselves.

### Changed
- **SQLite engine:** `node:sqlite` could not open an encrypted file, so KEPTA
  now uses `better-sqlite3-multiple-ciphers` (pinned to 12.11.1). The npm
  package `kepta-mcp` has exactly this one dependency; npm installs it
  prebuilt for Node 22, 24 and 26 on macOS, Windows and Linux.
- **A start that fails says why.** If the server cannot start — for instance
  because the key in the keychain does not belong to the database — the window
  shows the reason at once instead of waiting 30 seconds. The error page used
  to be cut off at the first `#` in its own markup; it is encoded now.

### Removed
- **The German interface switch** from 2.10 (*Settings → Display*). KEPTA's
  interface is English; the text size setting stays. German notes and German
  queries keep working — the stopword list is still bilingual.

### Upgrade notes
- **Quit every agent that uses KEPTA over MCP before the first start of 2.11**
  (Claude Desktop, Cursor, …), so the app has the file to itself, and start
  them again afterwards. An older `kepta-mcp` cannot read the encrypted file:
  it stops with "file is not a database" and changes nothing. `npx -y
  kepta-mcp` picks up 2.11 on its next start.
- **Keep a copy of the key** (SECURITY.md shows how). Without it, a restored
  backup of `kepta.db` on a new system cannot be opened — by anyone, including you.
- Backups of `kepta.db` made *before* 2.11 are still plaintext. SECURITY.md
  lists what the encryption covers and what it does not.

## [2.10.3] — 2026-09-11

### Fixed
- **Reading an imported file could freeze the whole app.** The server runs in
  the app's main process and read user files synchronously. Right after the
  update to 2.10.2, a preview of the import repair on a real installation never
  answered — and neither did anything else: the main thread sat in `open()` on a
  file in the Desktop or Downloads folder, at 0 % CPU, with no dialog on screen.
  The likely cause is macOS asking for permission to access a protected folder
  (every new, ad-hoc signed build counts as a new app), while the thread that
  would have to show that question was the one waiting for the answer. User
  files are now read asynchronously wherever the app reads them — imports, the
  repair, *Open file* — so the app stays responsive. The repair gives each file
  30 seconds and stops at the first one it cannot read, pointing to *Privacy &
  Security → Files and Folders*, instead of waiting forever.

## [2.10.2] — 2026-09-11

### Fixed
- **The repair in 2.10.1 could delete for good.** It removed surplus parts
  permanently, and it read HTML files again as well as PDFs. On a real knowledge
  base its preview said 70 files, 433 parts updated and 580 removed — nearly all
  of it code-coverage reports that the machine scan had picked up and that
  rewrite themselves on every test run, so "reading again" meant replacing the
  parts with a different file. The repair reads PDFs again, as in 2.10.0, and
  surplus parts go to the trash, where they can be restored. The preview says so.
- **The machine scan read generated test reports.** `coverage/`, `lcov-report/`
  and `htmlcov/` are now skipped like `build/` and `dist/` — source views with
  line numbers, not knowledge. On the same base 950 parts from 62 such pages had
  come in.

## [2.10.1] — 2026-09-10

### Fixed
- **The import repair lost where a part came from.** 2.10.0 added
  `POST /api/repair/imports` to re-read PDFs that the old raw-byte extraction
  had stored as glyph names and binary blocks. It wrote back only the new text.
  The parts were readable afterwards — and without their source line: no longer
  grouped under their file, no *Open file* button, and invisible to a second
  run, which finds parts by exactly that line. On the real knowledge base it ran
  against, that was 36 parts from 8 PDFs. The repair now appends the source line
  to every part, keeps the title form of the import it repairs (`— 2/5` from the
  machine scan instead of a blanket `— Teil 2/5`), leaves unchanged parts alone
  — a second run writes nothing — and never deletes the parts of a file whose
  extraction comes back empty.
- **The repair was only reachable as an API call.** Settings → Data now has
  *Re-read imported files*. It counts first and writes only after you confirm,
  the same pattern as sorting notes by kind. It reads PDFs and HTML files again
  from where they came from and takes menu lines out of web clips (next point).
  Files that no longer exist stay as they are.
- **Web clips kept their menu lines.** 2.10.0 strips "Skip to main content",
  menus and cookie banners from new imports; clips made before kept them, and one
  of them was the first card a new user saw. The repair now cleans existing
  clips by the same rule, locally — nothing is fetched again.
- **Clearing the browser storage reset nothing.** Since 2.9.0 the settings live
  in `settings.json` next to the knowledge base, mirrored through a wrapper
  around `localStorage`. The wrapper forwarded `setItem` and `removeItem`, but
  not `clear()` — so the next start restored every value from the data folder:
  the old grouping came back, and the setup assistant stayed away because
  "dismissed" came back with it. `clear()` now clears the data folder too. A
  change made in the last 400 ms before the window closed was lost the same way,
  because the batched write had not left yet; it is now sent the moment the page
  is hidden, with `keepalive`.
- **The English interface showed German labels.** The grouping buttons read
  "Alle / Nach Datei / Nach Typ / Zeitraum", and the group without a source said
  "Ohne Quelle", with the interface set to English; the period groups ignored the
  language switch altogether. All of them now come from the translation table,
  and a test fails as soon as an English entry turns out to be German.
- **Part badges were missing on dropped and inbox files.** Those imports title
  their parts `— Teil 2/5`; the badge only recognised `— 2/5`.

### Changed
- `POST /api/repair/imports` previews by default and writes only with
  `{ "apply": true }`. The answer says how many files were checked
  (`geprueft`), how many would change, and how many web clips (`clips`).
- The READMEs state the coverage gates — what CI actually enforces — instead
  of a snapshot: at least 89 % of lines overall, 100 % of functions in
  `src/core` and `src/scan`. The snapshot they replace ("~91 %") was higher than
  the measured 89.0 %. A test keeps the stated gates equal to `vitest.config.ts`.

### Added
- **A guard for the test count.** The READMEs claimed 1106 tests while 1183
  ran. The existing guard compared against a static count, which sits below the
  real one because `it.each` and loops create more cases than the source shows.
  `npm run test:cov` now ends with `scripts/doku-check.mjs`, which compares the
  READMEs with the run itself.
- **A guard for this file.** 2.10.0 shipped without a section here, so its
  release page listed no changes — the page is built from this file. A test now
  fails when the version in `package.json` has no section.

### Removed
- Six dependencies nothing imported: `@anthropic-ai/sdk`, `@google/genai`,
  `dotenv`, `express-validator`, `framer-motion` (it still arrives through
  `motion`) and `lucide-react`. Every dependency ships inside the desktop app,
  so they only made the download bigger.
- `metadata.json`, a leftover from the project template that described a
  different product.

### Documentation
- `.env.example` said `cp .env.example .env`. KEPTA never read a `.env` file —
  the `dotenv` above was never imported. It now says to set the variables in the
  environment.
- The release notes suggested `node /PATH/kepta/dist/mcp-server.cjs`; they now
  show `npx -y kepta-mcp`, like the README.
- Both READMEs describe the 2.10 features, list all 41 HTTP routes (the English
  table was missing five, the German one eight) and name the real test count and
  the real size of the npm bundle — 81 kB, not 74.
- The Enterprise section described features as "being worked on" for a
  commercial edition that already ship here — Praxis-Sync with its
  tamper-evident ledger among them. KEPTA Enterprise is going to be a product of
  its own; the section now says that, and that nothing in this repository moves
  into it.

## [2.10.0] — 2026-09-09

### Added
- **The graph has a second view: Tree.** A switch in the toolbar changes
  between Force — the physics layout — and Tree, a horizontal dendrogram: root →
  kind of knowledge → entity or tag group → note. Nodes glide between the two;
  with reduced motion they jump. The force layout keeps its own history, so
  switching back no longer restarts the physics from the dense tree positions,
  where it used to explode. The legend names all four kinds of knowledge.
- **A click on a card opens a readable preview** — the full text, the source as
  a clickable chip, a *Copy text* button. The editor opens from there.
- **Every card shows where it came from.** A source chip and a part badge
  (`2/5`) are read from the conventions the imports already wrote — no schema
  change. A file source opens in its default application through
  `POST /api/open`, which accepts only absolute paths to existing files under
  the home folder. Files dropped into the desktop app now remember their path.
- **The list can be grouped** — all, by file, by kind or by period. Grouped by
  file, all parts of a document sit under its name with an *Open file* button;
  *Load more* never cuts a group in half. The choice is kept.
- **Interface language and text size.** Settings → Display switches the main
  surfaces — navigation, search, list, legend, preview, graph hints — to German,
  and the text to 100, 115 or 130 %.
- `POST /api/repair/imports`, to re-read PDFs stored by the old extraction —
  see 2.10.1: this first version lost each part's source line.

### Fixed
- **PDFs arrived as glyph names and binary blocks.** Text was pulled from the
  raw bytes; for PDFs with embedded fonts that produced `/uni2219/space/hyphen…`
  and stretches of `◆◆F6g◆◆`. It surfaced in a persona walkthrough — ten
  simulated user profiles over one real run of the app against a real knowledge
  base of 3,330 notes: four of the five parts of one form were unreadable, nine
  of the ten profiles ran into it, and for three it was the reason to say no.
  PDFs are now read with pdf.js, on the server and in the window, with the
  character maps for embedded fonts shipped in the app and served locally from
  `/cmaps` — no CDN. A PDF that yields no text says so instead of storing noise.
- **A search inside a grouped list lost its ranking.** With "by file" active,
  the best hit sat somewhere inside a group. While a query is active the list is
  now flat and ordered by relevance; the grouping switch waits until the query is
  cleared.
- **Web pages brought their navigation along.** "Skip to main content", menu
  entries and cookie banners are removed on import.
- **The setup assistant recommended a local AI it had not found.**
- **The index strip showed bare numbers.** "2975 / 2 / 8" now carries labels and
  counts documents as well.

## [2.9.1] — 2026-09-07

### Fixed
- **The classifier only ran on the machine scan.** Found minutes after shipping
  2.9.0, by installing the published package and saving through MCP: a note
  titled "Drucker einrichten" with four numbered steps still landed as a fact.
  Everything written through MCP, the HTTP API, the inbox watcher or an Obsidian
  import kept falling back to "semantic". The decision now sits in
  `store.createMemory`, the one place every path goes through — an explicit type
  from the caller still wins. The classifier moved from `src/lib` to `src/core`
  for it, because the core is shared with the MCP server and a boundary test
  rightly refuses imports that leave it.

## [2.9.0] — 2026-09-07

### Fixed
- **Cleaning up duplicates looked like it was deleting everything.** The
  detection was never the problem — it was the deleting. The panel fired one
  HTTP request per note, one toast per note and one list refresh per note, and
  from the sixty-first the write limiter (60/min) answered 429. Because the
  caller discarded the error, the interface still reported success. On a real
  knowledge base three batches of exactly 60 sit in the trash — the limiter's
  fingerprint. And since only part of each pass got through, cleaning up took
  attempt after attempt, and the note count kept collapsing. Now one call
  (`POST /api/memories/bulk-delete`), one message, and one Undo that takes the
  whole action back (`bulk-restore`). Measured on that base: 155 duplicates gone
  in a single pass, exactly 155, nothing left to clean up afterwards.
- **Settings did not survive a restart.** `electron.js` asks the operating
  system for a *free* port (`listen(0)`) and loads the window from
  `http://127.0.0.1:<port>`. That port differs every launch, and `localStorage`
  is keyed by origin — so every start opened an empty store. Eleven settings
  were affected: theme, node colours, AI credentials, topK, auto-learn,
  dismissed duplicates, profile. They now live in `settings.json` next to the
  knowledge base.
- **A drag stirred up the whole graph.** Grabbing a node raised the force
  strength of the entire layout to 0.3, so the whole base rearranged for about
  four seconds. Measured on 320 notes: 263 of the other nodes moved, by 91 units
  on average. Without the reheat only what the dragged node actually touches
  moves — 5.3 units on average, and the graph stands still immediately.
- **The time slider made the picture flicker.** The slider itself was fine; the
  drawing was not. Tiny nodes were batched *by colour only*, so everything
  greyed out fell out of the batch — and with a time filter almost everything is
  greyed out. Measured on 3148 notes: a frame went from 6258 batched rectangles
  to over 12000 individual sprite blits. The same hit applied to simply hovering
  a node, which dims all the others. Batching now keys on colour *and* opacity.

### Added
- **Knowledge is sorted by kind, with a reason.** Nothing ever assigned a type:
  it came from the caller alone, and the machine scan set none at all, so
  everything fell back to "fact" — 3071 of 3148 notes on a real base. A rule
  based classifier (`src/lib/klassifikation.ts`) now decides on import and
  states why ("3 numbered steps found"). Rules, not a model: they run without a
  network, they are readable, and they are tested.
- **A fourth kind: Document.** Without it every imported file lands as a "fact".
  It cost a rebuild of the SQLite table, because CHECK constraints cannot be
  altered — and `chunks` and `memory_entities` cascade-delete from `memories`,
  so the rebuild runs with foreign keys off and the FTS row ids preserved.
  Verified on a real 65 MB base: 3260 notes, 9777 chunks and the full text index
  all intact, 72 ms.
- **Sort existing notes** (`POST /api/memories/reclassify`, with a preview and a
  button under Settings → Data). On the real base: 3144 "fact" became 68 facts,
  3091 documents, 97 how-tos, 4 events.
- **Junk no longer gets in.** 448 notes on that base consisted of nothing but
  HTML line numbers — the gutter of a source view, without a single meaningful
  word. HTML is now converted to text before import, and `istUnbrauchbar()`
  turns away what carries no knowledge. Checked against the real base: 727 of
  3071 scanned notes rejected, and **zero** of the 77 hand-written ones.
- **You decide what is read and from where** (`GET/PUT /api/scan/config`,
  `GET /api/scan/policy`, controls in the scan dialog). File types can be
  unticked, folder names excluded, roots chosen. The declaration comes from the
  same source as the decision, so it cannot drift. What settings can never do is
  *open* anything: keys, credentials, browser profiles, keychains and wallets
  stay blocked, size limits stay capped, and roots outside the home folder are
  refused.

## [2.8.0] — 2026-09-06

### Fixed
- **After a drag the whole graph kept twitching.** Reported from use: pull one
  node away and "all the coloured nodes in the middle start dancing around". The
  cause was a floor under the force scaling — below 0.22 the forces stopped
  weakening. That turned the layout into a system of *constant energy*: damping
  takes energy out, the forces at 0.22 put exactly as much back in, and the
  motion never dies. Measured on 320 notes in tag groups: after release the
  kinetic energy levelled off around 28,000 and sat there unchanged for four
  hundred frames. It was invisible at rest only because the frame loop skips the
  computation once `isSettled` is true — the tremor was there the whole time,
  frozen. The floor is gone; all forces now decay with `alpha`, the way
  d3-force does it. Same measurement after: 72,374 right after the gesture,
  19,461 after 40 frames, 1,468 after 120, **27 after 400**. What the floor was
  meant to protect — that a cooled layout still separates nodes pushed on top of
  each other — is the collision constraint's job, and that runs at full strength
  in every frame, independent of `alpha`.

### Changed
- **A node you drag now stays where you drop it.** It used to spring back into
  the physics on release. That was the answer to a real bug — back then a node
  was pinned when *touched* and never released, so after a few grabs half the
  graph stood frozen. But the fault was never the pinning; it was that there was
  no way back. Now there is one: a pinned node wears a ring in the accent colour
  (offset in screen pixels, so it sits the same distance out at any zoom), the
  toolbar grows a "Release N pinned" button while any node is held, and that
  button hands everything back to the layout and re-heats it. A plain click does
  not pin — only a gesture that actually travels more than four pixels counts as
  a drag, so tapping a node to look at it leaves it free.

### Performance
- **The graph under full load: 25,000 notes.** One simulation step cost 104 ms
  there — against a budget of 16.7 ms for 60 frames. Broken down, 73 ms of that
  sat in collision resolution, and not in the geometry but in strings: the grid
  was a `Map` keyed `${cx},${cy}`, and every node looked up nine of them. At
  25,000 nodes over three passes that is 675,000 string allocations per frame,
  plus a text comparison of node ids in the innermost loop. The grid now carries
  integer keys, and the solver walks cells instead of nodes: with the four
  "forward" neighbours it meets each pair exactly once instead of twice. That
  needs one more pass before a dense clique settles and is still a fraction of
  the cost. Measured, one step:

  | Notes | before | after |
  |---|---|---|
  | 3,000 | 10.0 ms | 3.4 ms |
  | 8,000 | 28.5 ms | 11.9 ms |
  | 15,000 | 59.6 ms | 25.6 ms |
  | 25,000 | 104.3 ms | 47.0 ms |
  | 40,000 | 171.9 ms | 75.3 ms |

  The ceiling for a smooth 60 frames moves from about 4,000 notes to about
  10,000. At rest the simulation still sleeps and costs nothing.

### Fixed
- **With very many notes the graph was invisible — and fast because of it.**
  Fit view lands at 4 % zoom for 25,000 notes, where a node of eight world units
  is 0.32 pixels across. The browser effectively dropped the sprite blits at that
  size: the whole knowledge base was on screen and still just a black field with
  a little dust. That is exactly what "no overview" means with a lot of
  knowledge. A node is now at least 1.5 pixels on screen. To keep that
  affordable there is a third level of detail: below four pixels nothing is
  copied any more, one rectangle per type colour is filled instead. All three
  routes measured, 25,000 nodes under the same transform — `fillRect` 5.9 ms,
  a single path of 25,000 subpaths 18.4 ms, sprite blits 29.9 ms. Roundness and
  shading are not visible at three pixels anyway.
- **The canvas had been drawing at 800×500 the whole time.** The graph measures
  its container with a `ResizeObserver`, installed by an effect with an empty
  dependency list — that is, exactly once, at mount. But at mount the notes have
  not arrived yet, so the component is showing its empty state and the canvas
  does not exist. The effect found nothing to observe and was never repeated, so
  the size stayed at its initial values forever. Three consequences, all of them
  visible: the canvas was drawn small and stretched to the real size by the
  browser (this is the soft, "baggy" look reported from use); *fit view* framed
  for a viewport that did not exist; and the visibility culling used the same
  wrong size, so nodes in the right and bottom strip beyond 800×500 were never
  painted at all. The observer now attaches through a callback ref, so it starts
  the moment the canvas actually appears, and a report of 0×0 (a hidden
  container) is ignored rather than adopted.
- **Fit view left a small knowledge base sitting in the middle as a postage
  stamp.** The margin around the nodes was a fixed 70 *world* units, but a margin
  is seen on *screen*: with few notes the view zooms in hard, and those 70 units
  became over a hundred pixels on every side. The margin is now the radius of the
  largest node — which is precisely what sticks out past a centre point — and the
  breathing room for labels is counted in screen pixels, where it belongs. The
  ceiling on fit zoom went from 2.5 to 4 for the same reason: it was meant as a
  backstop against the degenerate "two notes" case, but it was binding at ordinary
  sizes. Twelve notes now fill 52 % of the width and 83 % of the height instead of
  37 % and 58 %, and the nodes are 8.5 px instead of 6.2 px across.
- **The header counted the database, not the picture.** Pulling the time slider
  back to January 2023 showed a handful of points next to an unmoved
  "212 nodes · 1272 edges". Both numbers now follow the slider, an edge counting
  only when both of its ends already existed — the same rule by which it is drawn.
  Also: "1 node · 0 edges", not "1 nodes".
- **The time filter was recomputed on every frame.** Which notes existed at the
  chosen moment depends on the slider and the filter list, not on the frame; it
  was being rebuilt inside the draw call — a map, a filter and a set over every
  node, sixty times a second. At three thousand notes that is over half a million
  steps per second for an answer that changes only when the slider moves.

## [2.7.0] — 2026-09-06

### Added
- **Scan this computer (opt-in).** KEPTA can go through the documents in your home
  folder and turn them into notes. Everything stays on the machine — there is no
  cloud and the core has no network access. Three things are wired in, not
  optional: keys, credentials, browser profiles, keychains, wallets, system,
  cache and build folders are never read; the preview shows exactly what would be
  imported and writes nothing; and `POST /api/scan/start` refuses without an
  explicit `confirmed: true`. The dialog says out loud what is easy to miss — an
  imported document becomes a normal note, and notes are readable by every agent
  connected over MCP. Offered once in the setup wizard and always available from
  the import bar. Everything lands under the tag `machine-scan`.
  New routes: `/api/scan/preview`, `/api/scan/start`, `/api/scan/status`,
  `/api/scan/cancel`.

### Fixed
- **The graph had lost its physics.** Three faults together, reported from use
  ("you can't pull them apart any more, they don't push each other away, it's
  all one heap"):
  - *Every* force was multiplied by `alpha`, and `alpha` decays to 0.006 — a
    settled graph had effectively no repulsion left. Nodes shoved on top of one
    another simply stayed there. Repulsion now has a floor and stays noticeable;
    `alpha` still governs how much the whole layout re-arranges.
  - `pinned` was set on every pointer-down and never cleared, so every node you
    touched was permanently frozen out of the simulation. A node is now held only
    while it is being dragged and rejoins the physics on release, and the
    simulation stays warm for as long as the finger is down instead of being
    heated once.
  - There was no collision constraint and the link force ignored node degree, so
    a bundle of 40 notes sharing a tag pulled itself together with 780 springs.
    Nodes now never overlap — a hard position constraint that runs at full
    strength in every frame, independent of `alpha` — and spring strength is
    divided by the smaller degree, as in d3-force.
- **Node size had no range left.** `7 + log2(1 + degree) × 4.5`, capped at 24,
  reached the cap at about a dozen connections — in a normal base nearly every
  node was drawn at maximum size, a wall of identical spheres filling the screen.
  Flatter and smaller, so the scale is actually used and there is air between
  nodes again.
- **Zoomed-in nodes looked soft.** The gradient ran across the whole radius into
  a dark fringe. The body is flat colour now, the light is a small hard spot and
  the edge is a drawn line. The screen-size cap introduced with the previous fix
  is gone again — with collision in place, zooming in can simply mean bigger.
- **The time slider left the whole edge web standing.** It dimmed the nodes but
  not the links, so "February 2023" showed a grey mesh with almost no nodes — the
  structure of knowledge that did not exist yet. An edge is now drawn only when
  both of its ends already existed, and notes hidden by the slider can no longer
  be grabbed either. The rule lives in `lib/graphTime` and is tested there.
- **A filter with no matches showed a silent void.** It now says so.
- **The graph was unusable in the light theme.** The SVG version took its sphere
  edge, shadow and highlight from `--node-rim` / `--node-shade` / `--node-hi`,
  which are dark on a light background. The canvas rewrite replaced them with
  fixed white values, so on the light theme the graph became a beige mush: white
  highlights on light spheres against a light ground, with no visible edge. The
  theme tokens are back, and links get more opacity on a light background.
- **The dimming stuck.** Moving the pointer off the canvas left the last node
  marked as hovered, so the rest of the graph stayed dimmed until you moved back in.
- **Graph nodes could barely be grabbed.** The hit tolerance was 4 units of
  *world* space, so it shrank with the zoom: at 20 % a node was 5 px wide with a
  0.8 px margin — miss the exact centre and you panned the view instead of moving
  the node. The grab radius is now 12 px on screen at any zoom.
- **Zoomed-in nodes looked bad.** They were 128 px sprites scaled up — at 600 %
  a node was drawn 300 px wide from a 128 px image, and the inner shadow that
  gave depth at thumbnail size read as a stain. Nodes above 15 px on screen are
  now drawn as real vector spheres, and their screen size is capped: zooming in
  spreads the nodes apart instead of inflating them.
- **The graph was framed for the wrong window.** It is mounted while another view
  is visible, so the layout cooled down and fitted itself to the initial 800×500
  — switching to the graph then showed it off-centre. It re-fits on every size
  change until the user pans or zooms themselves.
- **KEPTA blamed an agent for its own writes.** The database watcher cannot see
  who wrote, only that the count changed, so it announced every change as "The
  brain was updated from outside" — including imports the user had just started.
  It now stays quiet for changes the app announced itself; a foreign process
  (MCP over stdio) still surfaces.
- The mouse cursor never changed while dragging in the graph — it was bound to a
  ref, which does not re-render.
- Both READMEs said "23 routes"; there are 33, and the number had been stale for
  ten routes before this change. It now has a guard, like the test count.

### Fixed
- **The graph had a wall.** Every tick clamped each node into the visible window
  (`Math.max(r + 10, Math.min(width - r - 10, x))`), so beyond roughly 150 notes
  the nodes pressed themselves against the edge as a regular lattice — reported
  from a base of 348 notes, reproduced at 411. The layout now lives in an
  unbounded world and the *view* adjusts to it, not the other way round.
  Rendering moved from SVG (six elements per node, the whole position state
  written back to React 60 times a second) to a canvas; repulsion from
  all-against-all to a Barnes-Hut quadtree; edges from all n²/2 pairs to an
  inverted index. Measured afterwards: 3 000 nodes, 9 500 edges, 60 fps, and
  the whole graph framed on opening. Node labels no longer pile into an
  unreadable carpet — they yield to one another.
- **Density no longer collapses as the base grows.** With a constant central
  force the equilibrium radius scales as N^(1/3) while constant density needs
  N^(1/2); the force now scales with 1/sqrt(n). Node spacing stays at ~92 px
  from 50 to 2 000 nodes instead of packing tighter with every note.
- **Search could not return everything on a topic.** Four caps in a row, none of
  them visible: the slider ended at 20, the app requested at most 20, the engine
  clamped at 100, and the BM25 track only ever pulled 100 candidates. The slider
  now runs 5 · 10 · 20 · 50 · 100 · 250 · All, and the index states how many
  notes match in total — with one click to show them all.
- **The total was wrong.** The vector track was documented as a KNN but returned
  *every* note ranked by cosine: a base of 409 notes reported 409 matches for
  "kanzlei" (40 contain the word) and 267 for "carbonara" (there was not a single
  recipe). Candidates now have to lie within a band around the best match, with a
  floor for the case where nothing matches at all. Word and entity matches are
  untouched, so search never goes blind. Retrieval quality is unchanged
  (Hit@1 62.2 %).
- **Duplicates were a number without a list.** The index showed "9 duplicates"
  and a button that opened the first affected note in the editor; which notes
  were meant was never stated, and nothing could be removed. There is now a
  review panel: every group side by side with its reason, a suggested keeper
  (the richest copy), delete per note or per group, "not a duplicate" that
  sticks, and a confirmed bulk clean-up. Deleting moves to the trash, so it is
  reversible.
- **Duplicate detection was both incomplete and far too eager.** It stopped after
  eight findings — so the number itself was not the truth — and ran as an O(n²)
  double loop in the browser on every change. On templated notes (generated
  paths, entries differing in a single number) word-set similarity flagged 396 of
  411 notes. Detection now runs on word pairs (shingling) with a length guard, a
  sound prefix filter for blocking, and a cap on similarity chains: 5 groups and
  6 redundant notes out of 411, no false positives, in 8 ms.
- The hit counter beside the results showed the local ranking (150) while the
  list beside it showed the server's (261), and its "best %" printed a raw RRF
  value as a percentage ("best 2 %").
- Chat context is no longer tied to the display slider — showing every match must
  not push hundreds of notes into a paid LLM call.

## [2.6.17] — 2026-09-05

### Added
- **Praxis-Sync is reachable.** The encrypted device exchange existed in the core
  but nothing imported it — as a feature it did not exist. Now: `POST /api/sync/export`,
  `POST /api/sync/import`, `GET /api/sync/journal`, and a third tab in Settings with
  passphrase, scope field and the tamper-evident ledger.

### Changed
- **Setup asks for your own topics instead of offering eight fixed categories.**
  The first two were the author's own domains ("Fishing — Bait, rods, spots",
  "Dropshipping"), and every category wrote foreign notes into the user's database.
  A memory that promises "your knowledge" must not start with someone else's.
  Existing profiles keep their choice: `useCases` is migrated to plain-text topics.
- KDF for sync bundles raised from scrypt N=2^14 to 2^17, parameters stored in the
  bundle so older packages stay readable. Minimum passphrase length on export.
- The sync ledger refuses to append onto a broken chain — appending would have
  healed the tampering away.
- `KEPTA_DATA_DIR`, when set explicitly, no longer falls back to the home directory.

### Fixed
- The core boundary test stayed green while the core reached outside: a relative
  specifier like `../lib/ai` counted as an own module. Specifiers are resolved now.
- READMEs claimed 333, then 463 tests; both were stale.

## [2.6.16] — 2026-09-05

The wave-1 white-space features ship, and the interface is rebuilt: dark mode is
true onyx with a champagne accent instead of blue.

### Added
- **Time-travel search** — `asOf` on `memory_search` and `POST /api/search`: ask
  what was known at any moment. Time-travelled queries never count as access.
- **Write gate** (Mem0, arXiv:2504.19413) — opt-in via `KEPTA_WRITE_GATE=on`:
  the local LLM classifies each *new* memory as ADD/UPDATE/DELETE/NOOP on both
  save paths (MCP `memory_save` and `POST /api/memories`). UPDATE rewrites the
  closest existing node instead of creating a duplicate; an unreachable LLM
  always degrades to ADD, so the gate can never block.
- **Local reranking** — a deterministic reranker (term coverage, phrase hits,
  title, tags) refines the fused ranking as a bounded boost and is exposed as
  `components.rerankScore`. Eval-neutral on Hit@1, structurally stronger on
  phrase-style queries; the seam for a future cross-encoder.
- **Praxis-Sync** — move a memory scope between your own devices as an
  AES-256-GCM bundle (scrypt passphrase, mandant/patient separation, idempotent
  import), with every transfer recorded in a tamper-evident hash-chained ledger
  (`~/.kepta/sync-journal.jsonl`).
- **Encryption-at-rest evaluation** — `npm run eval:crypto` +
  `docs/encryption-eval.md`: three reproducible findings (plaintext DB/WAL,
  `PRAGMA key` silently does nothing on node:sqlite, the KeyProvider seam costs
  ~0 ms) and an honest recommendation.
- **Graph controls** — the time slider and the three type colour pickers are
  redesigned; each type colour now applies app-wide (graph nodes, card ridges,
  type labels, index numbers) via the `--type-*` variables.

### Changed
- **The interface: Onyx.** Dark mode is true black (`#030304`) with warm-white
  text and a champagne accent — no blue cast. Light mode is warm porcelain. A
  radius hierarchy replaces the one-radius-fits-all, the dashboard has a serif
  display line and a single index strip instead of four identical cards, chat
  answers are prose on a hairline ridge, the command palette is a lens, and the
  graph glass adapts to the theme.
- **Repository documentation** re-recorded: new screenshots, a new demo GIF and
  a new graph-time GIF from 2.6.15 (the old ones showed the blue interface from
  2.6.0/2.6.3), badges corrected (458 tests, 92 % coverage), ROADMAP gained the
  wave-1 section.

### Fixed
- **The CI coverage gate no longer hangs.** Root cause was a test touching
  `/proc`: `fs.mkdirSync` on procfs blocks the event loop synchronously and
  forever on Linux, so no vitest timeout could ever fire. The fail-fast test
  uses a file as the parent directory now.
- **Trashed nodes stayed visible in the grid** until some later refresh — the
  delete path refreshes the list immediately now.

### Tests
458, up from 427. `src/core` holds 100 % function coverage.

## [2.6.15] — 2026-09-05

### Fixed
- **The README still quoted the old corpus.** Rebuilding the evaluation in 2.6.14
  changed it from 30 notes and 25 queries to 58 and 45 — and made it harder. The
  documentation kept claiming `Hit@1 92 %`, which was true of the corpus that no
  longer exists. On the current one `npm run eval` reports **62 %** for the
  engine and **51 %** for the v1 substring search it replaced, and
  `npm run ablation` puts full fusion at **64 %** against 62 % for BM25 alone.

  Nobody lied; the documentation simply lagged the measurement. That is exactly
  the kind of number that gets found in a comment thread, so a test now compares
  the corpus sizes named in both READMEs against the corpus itself, and refuses
  any Hit@1 figure of 92 % — both failure modes checked against the guard.

### Added
- `Dockerfile` — directories such as Glama start MCP servers through one and
  check that they answer introspection. Built from this repo's source rather than
  the published package, so the check tests what is here. The first attempt did
  not answer: `VOLUME` creates `/data` as root while the process runs as `node`,
  and startup died on "unable to open database file". Five tests hold that in
  place, including the order of `chown` and `USER`.

### Tests
399, up from 393.

## [2.6.14] — 2026-09-04

The evaluation could not answer the question it was built to answer, so it was
rebuilt. Then it answered a question nobody had asked.

### Changed
- **The eval corpus can now tell the retrieval legs apart.** It was 30 notes and
  25 queries phrased in the same words as the notes — conditions under which BM25
  cannot lose and the measurement cannot inform. It is now 58 notes and 45
  queries across five labelled categories: lexical, paraphrase, graph, temporal
  and distractor. Notes are linked through `[[wiki links]]`, so the graph leg has
  something to work with, and distractors share vocabulary with queries that do
  not mean them.

  With a corpus that can separate them, fusion earns its keep after all:

  ```
  BM25 alone       62 % Hit@1   MRR 0.65   36/45 queries return a hit
  Vector alone     58 %         MRR 0.66   45/45
  Graph alone      11 %         MRR 0.11    5/45
  All three (RRF)  64 %         MRR 0.70   45/45
  ```

  +2 points and full coverage. On distractor queries it goes from 0 % to 25 %.
  `npm run ablation` prints this and the per-category table.

### Found while measuring
- **Semantic search does not work in German with the default model.** The
  paraphrase category scores 10 % with the vector leg on or off. That is not a
  KEPTA bug: cosine is normalised, vectors are unit length, dimensions and model
  are right. It is the model. `npm run embed:sprachtest` puts four notes and four
  paraphrase questions to `nomic-embed-text` in both languages:

  ```
  English  4/4 correct
  German   1/4 correct
  ```

  The README's own example — *"what do I cook with pasta"* finds the carbonara
  recipe — works in English and fails in German. Both READMEs now say so, and
  point to a multilingual model such as `bge-m3` for German notes. Two other
  explanations were tested and ruled out first: nomic's `search_query:` /
  `search_document:` prefixes changed nothing, and the vectors are already
  normalised.

### Tests
388.

## [2.6.13] — 2026-09-04

### Added
- **`npm run ablation`** — measures what each retrieval leg actually contributes.
  `SearchParams.tracks` can switch the BM25, vector and graph legs off
  individually; omitted, all three run, so nothing changes in normal use.

### Changed
- **The headline retrieval number was attributed to the wrong thing.** README and
  launch copy said 92 % Hit@1 for "three engines fused with Reciprocal Rank
  Fusion". The ablation says otherwise, on our own corpus:

  ```
  BM25 alone        92 % Hit@1   MRR 0.92   23/25 queries return a hit
  Vector alone      92 %         MRR 0.93   25/25
  Graph alone        8 %         MRR 0.08    2/25
  All three (RRF)   92 %         MRR 0.93   25/25
  ```

  Fusion adds **zero** percentage points on Hit@1 here. What it does add is
  coverage — two more queries return anything at all — and MRR 0.93 against 0.92.
  The graph leg is near-useless on this corpus because the corpus has almost no
  entities in it, which is a property of the corpus, not a verdict on the graph.

  This does not mean the fusion is worthless. It means our corpus is too small
  and too easy to tell the legs apart, and that a number we were quoting could
  not carry the claim attached to it. Both READMEs now say so, and the number now
  comes with the command that reproduces it.

### Tests
388, up from 384.

## [2.6.12] — 2026-09-04

Both fixes below came from putting the launch copy in front of ten adversarial
reviewers. Neither was a wording problem.

### Fixed
- **The package declared the wrong Node version and would crash after a clean
  install.** `engines` said `>=22.5.0` because that is when `node:sqlite`
  appeared — but it appeared behind `--experimental-sqlite`. Node's own docs put
  the unflagged release at 22.13.0 / 23.4.0. On Node 22.5 through 22.12 the
  install succeeded and the first `require("node:sqlite")` threw. `engines` only
  warns, so npm let it through. Now `>=22.13.0`.

- **The privacy claim was stronger than the code.** The README said "the server
  binds to 127.0.0.1 and nothing else", while `server.ts` reads
  `process.env.KEPTA_HOST || "127.0.0.1"`, and `src/lib/ai.ts` carries thirteen
  external provider endpoints for the desktop chat. Both READMEs now say what is
  actually true: the store is never synced anywhere and there is no server of
  ours to reach, the bind address holds unless you set `KEPTA_HOST` yourself, and
  the optional chat sends whatever you send it to the provider whose key you
  entered.

  The promise is not weaker for being exact. It is the difference between a claim
  that survives a packet capture and one that does not.

## [2.6.11] — 2026-09-04

### Fixed
- **The macOS builds of 2.6.10 never got built.** The signing step added in that
  version threw on a logging line: it read the return value of `execFileSync`
  (stdout) as if it were stderr, got `null`, and called `.match` on it. The mac
  job died; Windows and Linux went through. The 2.6.10 release therefore has no
  `.dmg` and no mac `.zip` — **use 2.6.11 on macOS**.

  The signing itself was never the problem, and the test suite could not see the
  difference: it checked the script as *text*. There is now a test that actually
  runs the hook against a real `.app` bundle and verifies the result with
  `codesign`. Both failure modes — the null read and removing the signing call —
  were checked against it.

  Verified on the finished artifacts of a full local build, both architectures:
  `Identifier=app.kepta.desktop`, `_CodeSignature` present, `codesign --verify
  --deep --strict` clean inside both DMGs.

### Tests
384, up from 380.

## [2.6.10] — 2026-09-04

### Fixed
- **The macOS builds were not signed at all — not even ad-hoc.** The bundle
  shipped without a `_CodeSignature` directory; its only signature was the
  linker-signed one inside the Electron binary, still carrying
  `Identifier=Electron`. `codesign --verify` failed on it outright.

  That is worse than unsigned. macOS then tends to report "KEPTA is damaged and
  can't be opened" instead of "developer cannot be verified" — and *damaged* has
  no "Open Anyway". Anyone downloading the app met a message that reads like a
  corrupt file or malware, with no way forward. 26 downloads across 21 releases
  is the shape of that.

  `CSC_IDENTITY_AUTO_DISCOVERY=false` in CI switched off certificate discovery
  and, with it, signing. The build now signs the bundle ad-hoc in an `afterPack`
  step and verifies the result, failing the build if verification does not pass.
  Measured on a real build: `Identifier=app.kepta.desktop`, `_CodeSignature`
  present, `codesign --verify --deep --strict` reports *valid on disk* and
  *satisfies its Designated Requirement*.

  This is not notarisation and the Gatekeeper warning stays — that needs the
  99 EUR certificate. What changes is which warning you get: one you can approve,
  instead of a flat refusal.

- **The first-launch instructions told people to do something that no longer
  works.** "Right-click → Open" was removed by Apple in macOS 15; on current
  systems it does nothing. README, German README and the release notes now lead
  with `xattr -dr com.apple.quarantine`, which works on every version, and name
  System Settings as the route without a terminal.

### Tests
380, up from 370. The new ones hold the signing step in place and refuse a
right-click instruction that is not marked as obsolete.

## [2.6.9] — 2026-09-04

### Changed
- **One tag now publishes everything.** `publish.yml` runs on `v*` tags and
  releases the npm package and the MCP registry entry, both over OIDC — no
  tokens, and none of the browser confirmations that shipping 2.6.4 through
  2.6.8 needed half a dozen times. The desktop artifacts continue to come from
  `build.yml` on the same tag, independently.

  `npm.yml` is gone. Two workflows that can both run `npm publish` are a trap:
  npm's Trusted Publishing binds to exactly one workflow filename, so the other
  path fails silently. A test now asserts there is exactly one.

  The workflow refuses to publish when the tag and the four version fields
  disagree, and waits for the new npm version to become visible before asking
  the registry to verify ownership — the registry reads `mcpName` from the
  published package, and would otherwise reject the entry on a propagation
  delay.

### Tests
370, up from 361. Nine of them parse every workflow file and check the
publishing order, because a workflow with a typo does not fail — it simply never
runs, and nobody notices until someone asks where the release is.

## [2.6.8] — 2026-09-04

### Fixed
- **Consolidation could point a live memory at a dead one.** `pickKeep` ranks by
  `updatedAt`, and superseding a memory sets `updatedAt` — so a memory that had
  just been retired outranked its live duplicate and was chosen as the one to
  keep. The live note would then be downweighted to 40 % with a successor that
  was itself already superseded: a chain into nothing, and a note that quietly
  stops winning searches it should win.

  Consolidation now only considers memories that are not superseded, and the
  apply step checks both sides — a successor that is itself retired is refused.
  Found while cleaning a real database of 45 notes: the reversed pair showed up
  in the dry run, and only the existing guard on the duplicate side kept it from
  landing.

### Tests
361, up from 358.

## [2.6.7] — 2026-09-04

### Fixed
- **Claude Desktop could not start KEPTA at all.** The client asked for an older
  protocol version, and the server answered with its newest —
  `Server's protocol version is not supported: 2026-07-28` — so the connection
  was refused before a single tool was offered. Version negotiation now never
  answers with something newer than what was asked for: it picks the highest
  supported version that is not newer than the request, and only a client newer
  than everything we know gets our latest. A client older than everything we
  support gets our oldest, which is at least the nearest thing it might accept.

  The old test asserted the broken behaviour as if it were correct
  ("unknown version → latest"), which is why 352 green tests said nothing. It
  now asserts the rule that matters: never newer than asked. Checked against
  eight requested versions on the built binary, including the `2025-03-26` that
  Claude Desktop actually sends.

### Tests
358, up from 352.

## [2.6.6] — 2026-09-04

### Added
- **KEPTA is listed in the official MCP registry** as
  `io.github.DamianTodorovic/kepta` — the place where people go looking for MCP
  servers on purpose rather than by accident. `server.json` declares the entry;
  the npm package proves ownership through its `mcpName` field.

### Fixed
- The registry compares the GitHub namespace **byte for byte**:
  `io.github.damiantodorovic` was refused with 403 although GitHub usernames are
  otherwise case-blind. Since the ownership proof lives inside a published npm
  package and published versions are immutable, correcting it cost a version.
  A test now derives the correct spelling from the repository URL — the only
  place in the repo that knows it — so this cannot happen twice.

### Tests
352, up from 345. Seven new ones hold the registry entry together: the schema
(validated against a local copy of the official one, so the test needs no
network), the 100-character description limit, the reverse-DNS name, the
ownership field, the package reference, the namespace spelling, and the single
version across four files. Each was checked against its own failure case.

## [2.6.5] — 2026-09-04

Superseded within the hour by 2.6.6 — see above for why.

## [2.6.4] — 2026-09-04

Found while packaging the MCP server for npm — by doing the one thing a new user
does first: starting the app and their agent at the same time.

### Added
- **`npx -y kepta-mcp`** — the MCP server as an npm package. It is called
  `kepta-mcp` because npm rejects the bare name `kepta` as too similar to the
  existing `keytar`; the command it installs is still `kepta`. One file, 20 kB, no
  dependencies at all, because the bundle needs nothing but Node built-ins. It
  gives an agent a memory without the desktop app, on the same
  `~/.kepta/kepta.db`. Needs Node 22.5, which is when `node:sqlite` arrived.
  This replaces the worst step in the setup: an absolute path to a file you had
  to build yourself, which no client reports as wrong — it simply never appears.

### Fixed
- **Two processes opening the same database at once could kill one of them.**
  `PRAGMA journal_mode = WAL` needs an exclusive lock, and SQLite does not call
  the busy handler for it, so `busy_timeout` could not help: the second process
  got "database is locked" and died before serving a single tool. On a first-ever
  start with the app and the MCP server coming up together, **7 of 12 attempts
  failed**. The switch now retries briefly and, if it still cannot get the lock,
  continues without WAL — slower under concurrent access, but usable, and the
  other process is setting WAL for the file anyway. **20 of 20** simultaneous
  cold starts now come up clean.
  This was never an npm problem. It was in the store all along, and it hit
  exactly the promise the README makes: one database for every tool.
- `busy_timeout` is set before the statements that can block, not after.
- One German string left over from the interface translation: `Verbindungsfehler`
  in the system status.

### Changed
- README, `mcp.json`, `mcp-config.json` and the config block inside the app all
  show the `npx` one-liner instead of a path into your own checkout.
- The root package is `private` — the Electron app cannot be published to npm by
  accident. Only `npm/` is publishable.

### Tests
345, up from 333. The new ones guard what the eye does not catch: exactly one
shebang in line 1 of the bundle (a second one, in line 2, is a syntax error — the
package installed cleanly and started for nobody), zero foreign dependencies,
valid syntax, and a second process opening the database while a first one writes.

## [2.6.3] — 2026-09-04

Found by loading a fresh clone with 6,500 notes and watching what happens.

### Fixed
- **The 5,000-node limit applied to one route and not the other.** Creating a
  single note was refused with 429 above the limit, but `/api/memories/import`
  sailed past it without a word — 6,500 nodes went in with HTTP 200. A person
  could cross the line through a supported path and only learn about it later,
  when the next note they typed was rejected with "please delete some old ones".
  Import is still never refused, because refusing a backup restore loses data.
  It now returns a `warning` naming the actual count and limit.
- The refusal message quoted a hard-coded 5,000 even when the real count and the
  configured limit were different. It now states both.

### Changed
- The limit is `KEPTA_MAX_ACTIVE`, read per request so an operator can change it
  without a restart. Default unchanged at 5,000. It was three separate literal
  5,000s in the code, each meaning something different.

### Measured, not assumed
At 6,500 nodes nothing is hidden: `/api/memories` returns all 6,500, the Markdown
export writes 6,500 files, and search stays at 162 ms. At 2,000 nodes search runs
at a 31 ms median.

### Tests
- Three for the limit: import warns when it crosses, stays silent when it does
  not, and the refusal names the real numbers. **333 tests.**

## [2.6.2] — 2026-09-03

Found by auditing every feature against a fresh install rather than trusting the
feature list.

### Fixed
- **The HTTP API silently dropped `scope` and `supersededBy`.** Both belong to the
  data model and MCP has always accepted them, but the REST handler validates
  against an allowlist that did not include them. A client sending
  `scope: "agent:coder"` got a memory scoped `local` back, with no error. Both
  fields are now accepted on create and update, with the scope normalised to 64
  characters and the id checked like every other id.
- **Migration read only one of the two file shapes.** The legacy store is a bare
  array; the backup export writes `{ memories: [...] }`. Putting a backup where the
  legacy file belongs migrated zero nodes — while still reporting that a backup had
  been made. Both shapes are read now.
- Fourteen German strings survived the 2.6.0 translation, in places the running app
  never shows: HTTP error bodies, MCP error messages, two zoom tooltips and the
  graph filter placeholder. My earlier scan looked at rendered text; these live in
  attributes and error paths. Found with an exhaustive search over string literals.

### Changed
- The inbox archive folder is called `archive` instead of `archiv`. Where `archiv`
  already exists it stays in use, so nothing that was archived moves or disappears.
  `/api/inbox/status` returns `archiveCount` and keeps `archivCount` for now.

### Tests
- **330 tests.** Four for the two API fields, one for the migration shape.

### Verified, not assumed
Everything below was exercised against a fresh instance: the 23 HTTP routes, all
8 MCP tools over `POST /mcp` including protocol hardening, Obsidian import and
export, the inbox watcher, embeddings through Ollama, duplicate consolidation,
temporal expiry and supersede chains, trash and restore, migration and its
idempotence, the chat proxy blocking and streaming, auto-learn end to end through
the shipped parser, six SSRF cases, the command palette and the theme switch.

## [2.6.1] — 2026-09-03

Filler words no longer decide what you find.

### Fixed
- **Query stopwords entered the BM25 leg.** `ftsSearch` split the query and OR-ed
  every token longer than one character, so a note matched merely for containing
  "with" or "die" — and through RRF fusion that borrowed rank displaced the real
  answer. Measured on an 18-note corpus, the query *"what do I cook with pasta"*
  returned "RAG — retrieval augmented generation" and "New laptop — 64 GB" above
  the carbonara recipe, because both contain "with". After the fix the recipe
  moves from fourth place to second and the two unrelated notes drop out of the
  top results.
- A query made only of stopwords still searches, using the original words. A
  silent search would be worse than an imprecise one.

### Changed
- The bilingual stopword list moved from `src/lib/semantic.ts` to
  `src/core/stopwords.ts`. It lived in the browser path only, which is exactly
  why the engine never applied it. Both paths now share one source, so they
  cannot drift apart again.

### Tests
- `tests/core/stopwords.test.ts` (9 tests) and two regression tests at search
  level in `tests/store.test.ts`: filler words must not produce hits, and a
  query of nothing but filler words must still return something. **325 tests.**
- Retrieval eval unchanged at Hit@1 92 %, Precision@5 92 % — the fixed corpus
  uses short keyword queries, where stopwords barely occur. The defect showed
  itself only on natural-language questions, which is why the eval never caught it.

## [2.6.0] — 2026-09-03

The interface speaks English.

### Changed
- **Every user-facing string is English.** The desktop UI, the MCP tool titles and
  descriptions that agents read, server error messages, the onboarding wizard, the
  starter pack and the notifications. Roughly 300 strings across 20 files.
- **Native controls follow.** `app.commandLine.appendSwitch('lang', 'en-US')` in
  `electron.js`: without it Chromium inherits the system language and a date field
  renders "tt.mm.jjjj" in the middle of an English form on a German Mac.
- **Dates and numbers** now format with `en-GB` instead of `de-DE`, and relative
  times drop the `date-fns` German locale.
- **The starter pack was rewritten**, not machine-translated. Its welcome node also
  pointed at `~/.ki-gehirn/memories.json` — a path that has not existed since 2.0.
  It now names `~/.kepta/kepta.db`.
- The card badge for a semantic memory reads **Fact**, not "Knowledge" — the sidebar
  already uses Knowledge for the index view, and two different things sharing one
  word in the same screen is a bug in the wording.

### Fixed
- **A translated message could change an HTTP status.** The clip route decided
  400-versus-500 by matching German substrings in the error text (`"nicht auflösbar"`).
  Renaming the message silently turned DNS failures into 500s — caught by the test
  suite during this change. Status now hangs on a `ClipClientError` type, so no
  wording can move it again.

### Unchanged on purpose
- **The search stopword list stays bilingual.** German notes keep working; the eval
  runs on a German corpus and still scores Hit@1 92 %, Precision@5 92 %.
- German documentation lives on in [README.de.md](README.de.md).

### Tests
- 314 tests green. Seven asserted on German UI strings and were updated with the
  strings they cover.

## [2.5.1] — 2026-09-03

Auto-learn no longer runs without being asked.

### Changed (deliberate behaviour change)
- **Auto-learn is now opt-in.** Up to 2.5.0 it was on by default (`!== 'false'`), even
  though it fires a second model call per chat answer — with a cloud provider that means
  costs nobody had knowingly agreed to. It is now `=== 'true'`. Anyone who used it in
  2.5.0 can switch it back on under *Settings*.
- **So that it is still discoverable:** the first time an answer would have been
  learnable, KEPTA shows a one-off hint — with a button that turns the feature on right
  there. Never again after that (`ki_gehirn_autolearn_hint`).

### Tests
- `isAutoLearnEnabled` and `shouldShowHint` are pure functions with an injected read
  interface, which makes them testable without browser storage. **314 tests** (was 307).

## [2.5.0] — 2026-09-03

Auto-learn works again — and now says so when it doesn't.

### Fixes
- **Auto-learn failed silently with reasoning models.** Extraction sliced from the first
  `{` to the last `}`. Models like Qwen3 or DeepSeek-R1 prepend a `<think>` block or prose
  to their answer; if that contained braces, the slice grabbed the wrong span and
  `JSON.parse` threw. The error went nowhere but `console.warn` — the feature advertised
  "the brain extends itself" and did nothing. Now: strip reasoning blocks, then read the
  first **fully balanced** object, respecting braces inside strings and escaped quotes.
- **No time limit.** The background call ran unbounded. Measured on a machine with a 12 GB
  reasoning model: **2 min 40 s for five tokens** — the call never came back. It now aborts
  after 45 seconds.
- **Failures were invisible.** Success and abort now both surface as a notification, with
  the reason and what to do about it.

### Added
- **Separate extraction model** (`extractModel`, optional): a 3B model that answers in
  seconds is plenty for a title and three tags. Leaving it empty keeps using the chat
  model. Configurable under *Settings → Learn automatically*.
- Auto-learn is documented in the README for the first time — until now the feature
  appeared nowhere, despite running unasked.

### Tests
- New: `src/lib/autolearn.ts` as a testable module, `tests/lib/autolearn.test.ts` with
  **28 tests** covering reasoning blocks, braces inside strings, escaped quotes,
  incomplete JSON and tag normalisation.
- Overall: **307 tests** (was 279), `autolearn.ts` at 100 % of functions.

## [2.4.0] — 2026-09-03

Windows joins in. That covers every common system — before this, Windows was only reachable by building it yourself.

### Added
- **Windows:** NSIS installer and ZIP for `x64` and `arm64`, built by the new `release-windows` job on `windows-latest`. The installer lets you pick the target folder and installs per user, without administrator rights.
- **Platform in the filename:** the scheme is now `KEPTA-<version>-<platform>-<arch>.<ext>`. Without the platform, `KEPTA-<version>-x64.zip` from macOS and from Windows would have been identically named and would have **overwritten each other** in the release — found while adding the Windows job, before it hit anyone.
- **First-launch instructions for Windows** in the release notes and README: the installer is unsigned too, and SmartScreen blocks the first run.

### Changed
- The README badge now names macOS, Windows and Linux — Windows was missing despite the intent being there.
- ROADMAP: "Windows CI build" is done and therefore removed from the follow-up work.

### Documentation corrected
- The filenames in the README and release notes were wrong for Linux: electron-builder
  normalises `${arch}` per target format — `x64` becomes `amd64` for deb and `x86_64` for
  AppImage. What was documented, `-x64.deb` and `-x64.AppImage`, were files that do not
  exist. Noticed while comparing against the real artifacts from the 2.3.0 build; the
  tables now name what is actually produced.

## [2.3.0] — 2026-09-03

A distribution release: up to 2.2.1 only Apple Silicon Macs could download the app. Intel Macs and Linux are now included.

### Added
- **Intel Macs (x64):** `electron-builder.json` had no `arch` entry, so only the CI runner's own architecture was built — arm64. From now on DMG and ZIP are produced for `arm64` **and** `x64`.
- **Linux:** AppImage and deb, each for `x64` and `arm64`. A separate workflow job `release-linux` on `ubuntu-latest`, because Linux packages cannot be built on a macOS runner. New script `npm run build:linux`.
- **Architecture in the filename:** electron-builder only appends it for arm64 by default — the Intel build would have been plain `KEPTA-2.3.0.dmg` and indistinguishable. `artifactName` now enforces `KEPTA-<version>-<arch>.<ext>` for every package.

### Fixes
- **A false platform promise:** the README and badge announced "macOS | Linux" and "DMG/snap"; a Linux package never existed and snap was never configured. The README now names exactly the files that do exist, including first-launch instructions for Linux.

### Documentation
- The release notes live in `.github/release-notes.md` and are pulled in by **both** release jobs via `body_path` — one source instead of two drifting copies, which also makes the job order irrelevant.
- A "Which file do I need?" table in the README and release notes, including how to work out your own Mac's architecture.

## [2.2.1] — 2026-09-03

Hotfix: 2.2.0 would not start. Anyone on 2.2.0 should move to 2.2.1.

### Fixes
- **The app starts again (regression from 2.2.0):** `electron.js` read `srv.address.port` instead of `srv.address().port`. `address` is a method — read as a property it yields `undefined`. `getFreePort()` therefore did not reject but resolved `undefined`, so the `catch` branch never ran and overwrote the default port 3000 on the way. Two lines later `serverPort.toString()` threw a `TypeError`, and it did so **outside** the `try` block — which meant `createWindow()` was never reached. Symptom: the process ran, but with no window, no bound port and no crash report.
- **Startup sequence hardened:** `getFreePort()` now rejects when no port can be determined; the `catch` branch genuinely restores the default port 3000; `Number.isInteger` checks for a usable value before `process.env.PORT`, and `String(...)` replaces `.toString()`. A missing port can no longer leave the app windowless.

### Tests
- New: `tests/electron.test.ts` with 5 regression tests. Since `electron.js` is an ESM entry point that would launch the app on import, the test extracts `getFreePort()` from the **real source file** and runs it against the real `net` module — what is tested is the shipped code, not a copy. Plus guards against the `.address.port` property access and for the 3000 fallback.
- Overall: **279 tests** (was 274), coverage gate still green, retrieval eval unchanged (Hit@1 92 %, Precision@5 92 %).

## [2.2.0] — 2026-09-02

A security and robustness release: code-review fixes across the server, core, Electron and protocol.

### Security
- **Bind address:** the server now listens on `127.0.0.1` only, instead of `0.0.0.0` (the API has no auth); deliberate override via `KEPTA_HOST`
- **SSRF protection (URL clipper):** IP literals in every notation (decimal/hex/octal/IPv4-mapped IPv6) are normalised before checking, DNS is resolved via `node:dns` and ALL resulting IPs (v4 and v6) are checked against loopback/private/link-local/CGNAT/unique-local; redirects are followed manually (max. 5 hops, every hop fully checked); a dead port check was removed; `clearTimeout` in `finally`
- **Body limit ordering:** import routes are now registered before the global 1 MB limit — `/api/memories/import` (2 MB) and `/api/import/markdown` (10 MB) no longer throw a 413 for large backups; the global 1 MB limit stays active for every other route
- **Chat proxy:** a missing `messages` array now yields a clean 400 instead of a TypeError; a client disconnect aborts the upstream request (AbortController)

### Retrieval & embeddings
- **Embedding model mixing fixed:** vector comparison now only happens between the query and chunks from the same model; after a model switch, `chunksNeedingEmbedding` picks up the mismatches and the background queue re-embeds them (non-blocking)
- The FTS tokenizer uses Unicode classes (`\p{L}\p{N}`) — Cyrillic and CJK queries now return hits

### Server & core
- **Store cap 1000 → 5000:** `/api/memories`, Markdown export and replace-import now list completely (pagination instead of silently truncating above 1000 nodes)
- A replace-import with duplicate IDs answers cleanly with 409 instead of 500; duplicate IDs in backups are deduplicated
- The tag filter escapes LIKE wildcards (`%`, `_`, `\`) with an `ESCAPE` clause — `a_b` no longer matches `axb` (API and MCP `memory_list`)
- MCP protocol (2026-07-28): a missing `jsonrpc` field is tolerated, a wrong value gives `-32600`; notifications for unknown methods stay unanswered; batch requests return a single error object (batching was dropped in 2026-07-28); a non-numeric `limit` falls back to a clean default instead of NaN
- Import preserves `createdAt`/`updatedAt` from the backup file (optional timestamp parameter); an Obsidian resync skips unchanged notes instead of overwriting the frontmatter date
- Sanitising relaxed: control characters and NUL are cleaned everywhere, HTML stripping now only on raw HTML ingest (URL clipper) — code samples in memories survive intact (the frontend renders via react-markdown)
- The DB change watcher compares counters and timestamps separately instead of running `parseInt` over a fingerprint string
- `npm start` without `NODE_ENV` now reliably serves the static `dist/` instead of the Vite dev server (Vite only without a build and outside production)
- MCP stdio: responses are written to stdout serialised (processing stays parallel)
- Listen errors (e.g. EADDRINUSE) terminate the server with a clear log line

### Electron
- The server starts BEFORE the window; the loading logic polls `/api/health` (30 s instead of a blind 5× TCP retry)
- CSP without `'unsafe-inline'` for scripts in the packaged build (`dist/index.html` has no inline scripts); dev mode with Vite refresh keeps working
- `NODE_ENV=production` only for packaged apps

### Maintainability
- New version source `src/core/version.ts` (v2.2.0): the health endpoint, MCP `SERVER_INFO` and package.json share `APP_VERSION` (with a test against drift)
- Build-only dependencies (vite, @vitejs/plugin-react, @tailwindcss/vite, tailwindcss, autoprefixer) moved to `devDependencies` — the packaged app bundle does not need them at runtime
- CI: release job on Node 22, and an `electron-builder` build failure now fails CI (no more `|| true`)
- `src/lib/semantic.ts`: embedding search POSTs the corpus in batches (max 100 items or ~700k characters per request) instead of one payload
- Documentation tidied (AGENTS.md, README, `.env.example` listing the variables actually read, AI Studio leftovers removed); test suite: 270 tests

## [2.0.3] — 2026-09-01
- Liquid-Glass-Knoten im Wissensgraph, individuelles Positionieren (Pinning), Zeitregler, Farb-Picker

## [2.0.2] — 2026-09-01
- Fremde Agent-Schreibprozesse (MCP) erscheinen sofort in der App (DB-Change-Watcher + SSE)

## [2.0.1] — 2026-09-01
- CI-Fix: Release-Job Needs-Referenz; v2.0.1-Tag fuer frische DMG

## [2.1.0] — 2026-09-02

### Fixes (UI)
- **Chat header:** now shows the real AI connection status instead of falsely claiming "OpenAI (GPT) · gpt-4o-mini". With no AI connected → "No AI connected" (grey status dot). Local AI (Ollama/LM Studio) is detected automatically and connected in one click (new function `resolveAIConnection`, 5 unit tests).
- **Knowledge cards:** the tag footer no longer overlaps the body text — `MemoryCard` moved to a 3-row grid, layout animation toned down (`layout="position"`).

### Tests & quality
- Test suite grown from 42 to **236 tests**; overall coverage **~91 %** (core `src/core` at **100 % of functions**)
- Vitest v8 coverage with thresholds as a **CI gate** (`npm run test:cov`) — coverage regressions break CI
- New coverage: `migrate.ts` (legacy JSON migration, previously 0 %), `embeddings.ts` (chunking/cosine/queue), `src/lib/*` under jsdom (providers, profile, SSE, fetch client, tokenizer), `server.ts` (HTTP + `/mcp` + chat proxy via supertest), core UI components (Testing Library)
- `server.ts`: `createApp(store)` extracted as a testable export (bootstrap and `listen` separated)
- CI: `build.yml` extended with the coverage gate, retrieval eval and a GitHub-native coverage job summary; coverage/CI/tests badges in the README

## [2.0.0] — 2026-09-01

The SOTA release: KEPTA goes from a note store to a full agent memory.

### Storage (breaking: JSON → SQLite)
- SQLite via `node:sqlite` (no native build, FTS5 included), WAL mode, file `~/.kepta/kepta.db`
- Automatic, idempotent migration from `memories.json` with a backup to `~/.kepta/backup/`
- Memory model v2: `scope` (user/agent/session), `type` (semantic/episodic/procedural), `confidence`, `valid_from`/`valid_to`, `superseded_by`, `deleted_at` (trash instead of hard delete), retention columns (`last_access_at`, `access_count`, `utility`)
- Entities and relations (a lightweight knowledge graph) with their own validity

### Retrieval
- One engine for the UI, the HTTP API and MCP (previously 3 duplicated search paths; agents got the worst search)
- Pipeline: FTS5 BM25 + vector KNN (persistent chunk embeddings, Float32 BLOBs) + entity match → RRF fusion (k=60) → recency/confidence boosts → temporal downweighting (expired ×0.5, superseded ×0.4) → Oblivion retention factor
- Embedding background queue via Ollama (`nomic-embed-text` by default, configurable); without Ollama everything runs purely lexically
- Consolidation: duplicates by embedding similarity (≥0.92) plus a lexical fallback → supersede rather than delete

### MCP
- Protocol `2026-07-28` (stateless core, `server/discover`, `_meta` versioning), compatible with `2025-06-18` and `2024-11-05`
- 8 tools with `outputSchema` + `structuredContent`: `memory_search`, `memory_save`, `memory_update`, `memory_delete`, `memory_list`, `memory_graph`, `memory_consolidate`, `memory_forget`
- New transport: Streamable HTTP (`POST /mcp`) alongside stdio
- `[[Wiki links]]` on save → entities plus `mentions` relations

### Interop & UI
- Obsidian import (Markdown + YAML frontmatter, wiki links → graph) and export (`.md` files to `~/.kepta/export/`)
- Dashboard search now runs against the server engine (instant locally, server asynchronously); trash view with restore
- MemoryCard: type badges plus EXPIRED/SUPERSEDED markers; KnowledgeGraph uses real relations
- Chat: date-aware prompting (today's date and validity markers in the context)

### Quality
- TypeScript `strict: true`; 42 vitest tests (store, engine, MCP protocol, Obsidian interop, search)
- CI: Node 22, `npm test` + `npm audit` in the build job
- Eval harness (`npm run eval`): fixed corpus of 25 queries → Hit@1 76 % → 92 %, Precision@5 84 % → 92 % (against the v1 substring search, purely lexical)

### Removed
- The dead `firebase` dependency (AuthContext was already a local no-op stub) and Firestore leftovers
- A duplicate lockfile (`bun.lock`) and the repo artifact `project.tar.gz`
- Duplicated search implementations in `server.ts` and `mcp-server.ts`

## [1.0.0 – 1.0.4] — 2026-08-31

- First public version: local nodes with tags, hybrid TF-IDF + BM25 search, 20 AI providers plus Ollama/LM Studio, SSE streaming, MCP stdio server (3 tools), JSON export, inbox watcher, URL clipper, onboarding wizard, macOS DMG and Linux snap.
