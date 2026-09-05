# Changelog

All notable changes are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versioning follows [SemVer](https://semver.org/).

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
