## [3.2.18]

### Fixed

- **No control is smaller than the finger that aims at it.** Measured in the delivered
  object 3.2.17 (CDP, own port block, four widths, seven views, hit-test filter): one
  control under 24 px, and every control under 44 px. The 20 px element is the URL field
  in the import bar (`Dashboard.tsx`), not the search field at the top — that one already
  stands 38 px high. One rule now carries the floor: the token `--ziel-boden` at 36 px on
  the desk, 44 px from 440 px down, applied to `button, a[href], summary, select,
  [role="button"], [role="tab"], input` and the row of every switch. The blind 1×1 fields
  behind the switch captions and the real checkboxes and radio buttons are excluded by
  name — their row grows, not their box. Guard: `tests/zielgroesse.test.ts` reads the rule
  out of `src/index.css` (jsdom knows no layout measures) and was red before the rule
  existed (4/4, 16:01:37); it bites on three mutations — a narrowed selector list, a phone
  floor under the desk floor, the floor set in more than one rule.
- **The floor holds in both directions.** The first window run of that rule showed why
  height alone is not a target: buttons stood 36 and 44 px *tall* but 30–42 px *wide*
  („Clear chat 30×36", „Focus mode 36×44", „Scan 39×44", „Send 40×44"). The edge is the
  shorter side, so the same rule now sets `min-width` too — written as a failing case
  first („0 Stellen setzen die Breite"). Measured again over four widths: 390 px went from
  70 controls under 44 px to **0**, 1440 px from 19 under 36 px to **0**.
- **The chat header stops cutting its own button off.** At 820 px „Clear chat" sat at
  793,41 inside a container ending at 809 — 14 px clipped, already in 3.2.17, and 20 px
  once the button grew to 36 px wide. The header now wraps its action group
  (`flex-wrap gap-y-2`); measured again: 36×36 at 624,93 with **0 px clipped by any
  ancestor**.
- **The status panel no longer denies while it is still asking.** `GET /api/health` needs
  2,5 s standing alone (three runs: 2,55 / 2,50 / 2,61) and needed 20,1 s in an open
  window under its own load. Until now an answer that had not arrived counted as an
  answer that said no, so the panel read „Server unreachable", „The knowledge base file
  is not encrypted" and „0 nodes" while the same door reported ok true, key true and
  21 066 nodes — three denials of the truth, in a panel a person reads on its own word.
  The panel now distinguishes *asking*, *answered*, *did not answer*: a pending line
  names itself as unknown and shows no repair instruction, and a real failure is said in
  human words instead of „Start the app with npm run dev". Same class, third line: Ollama
  was „Unreachable" before its probe had replied. Cases: red first at 16:00:06 (2 failed),
  green at 16:00:49 (28/28).
- **The title gate judges the true node size.** The node radius is lifted to
  `MIN_KNOTEN_PX` (1,5 px) so a tiny node stays visible; the gate compared *that* lifted
  value against its own threshold, so it could never reject — only rounding did. It now
  compares the unlifted measure. Case: `tests/components/KnowledgeGraph.pforte.test.tsx`
  places the picture on the half-open „Many" gate, where the two versions part by a
  factor of two, and states its arithmetic on both sides. Mutation: with the lifted value
  the case goes red and the surface says „22 crowded out by a name already there" where
  it must say „too small for a name at this zoom".

### Known

- The four-width sweep above ran against **this frontend bundle served locally**
  (`vite build --outDir`, the door's API proxied), not against the packaged app — the
  package was not built, because the machine held 8,4 Gi free against the 9,85 Gi the
  build needs. The numbers are the surface's, the packaging is still to be proven.
- The title gate has its case and its mutation, but no window proof yet: the graph view
  did not mount in that run (60 s waited, no canvas, while `/api/health` took 37,7 s and
  the machine reported a one-minute load of 72,60 on ten cores).
- `/api/health` answering in 2,5 s is its own finding: the panel is honest about waiting,
  but the wait is the reason the lie was readable for so long. Counting chunks and
  memories over 21 066 notes is the named cost; no query plan was changed here.

## [3.2.17]

### Fixed

- **A closed sidebar can be opened again in every view.** The control lived only in
  the memories header, inside a container that is `hidden` outside that view — so it
  was in the document but had no hit area, and the settings view has no header at all.
  Choosing a view at 390 px closed the drawer (the #27 fix) and left no way back: six
  of seven views were a dead end. The control now sits in the shared frame whenever the
  drawer is closed and the view brings no header of its own; memories keeps its header
  copy, so exactly one is ever reachable. Cases: one per view (today, chat, graph,
  dossier, activity, settings), each asserting the precondition, the count of *hittable*
  controls, and the click that reopens. Mutation: with the strip disabled all six fail
  with "0 hittable open controls (1 in the document)".

### Known

- The reopen path is verified in jsdom only. A presentation change needs a browser
  look at 390 px and — because the strip now also applies at wide widths in manual
  focus mode — at 1440 px, with two images whose sha256 differ.
- One action, two names: the drawer's control is labelled „Focus mode" while its
  title says „Hide sidebar".

## [3.2.16]

### Fixed

- **A save that changed nothing no longer congratulates you.** `ortZuletzt` opened
  with `"anbieter"`, so pressing Save on a pristine form painted a green receipt
  under a provider nobody had touched — and all four earlier cases stayed green
  because every one of them typed first. The ref now starts at `null`, and the
  place resets to `null` after painting, so a second click without a new change
  paints nothing. Witness: red at 19:12:52 (`expected [ 'anbieter' ] to deeply
  equal []`), green at 19:13:39 (42/42), and the mutation re-run by the
  lead at 19:21:33 reproduced the same red line for line.
- **The receipt arrives at the row you edited.** Sections carry `data-abschnitt`
  (connection / models / backup) and the message carries `data-quittung`, and the
  case asserts containment — `meldung.closest('[data-abschnitt]')` must be
  `'verbindung'` while the models section stays empty — not mere presence
  somewhere in the document. The four persistent receipts now live 6 000 ms and
  are proven at both ends (standing at 5 999 ms, gone at 6 001); the clipboard
  confirmation stays at 2 000 ms because it confirms an instant act rather than a
  save.
- **At phone width the sidebar was eating the Save click.** At 390 px the drawer
  covers 256 of the 390 px (`Sidebar.tsx:72` sets `w-64`; the strongest
  brightness step in the before-image sits at x = 255), so the click at
  190,422 landed on `DIV.seiten-kante-oben`, `dirty` was never set, nothing was
  stored and nothing was said. Choosing a view while the window is narrow now
  returns the drawer, and the same click lands on `BUTTON.btn-primary`.
  Red at 18:24:24 (`expected 'sidebar-glass …' to match /w-0/`), green at
  18:28:30.

### Known

- One action still carries two names: the drawer's control is labelled
  „Focus mode" while its title says „Hide sidebar", and the drawer still covers
  the page when it was opened without choosing a view.
- A package older than the commit it should contain cannot contain it — the
  release chain asks about version and encryption, not about content, and that
  is how 3.2.15 shipped without these two fixes for an hour.

## [3.2.15]

### Fixed

- **The door stopped bending its own coverage number.** `server/router/system.ts`
  produced `covered = Math.min(notes, coveredFromEntities())` while both queries
  filter the same set (`store.ts:483` vs `:1287-1294`), so the clamp could never
  fire — and `tests/server-nachzug.test.ts:195` asserted exactly that relation,
  which made a green witness that could never go red. The count is now taken
  unbent and anything exceeding the base is stated in a `widerspruch` field,
  because a sentence carries the message, not a percentage above 100. Red with
  the clamp squeezing 21 down to 14, green after, mutation (clamp back) turns the
  new case red.
- **The status row no longer reports a fact it has not read yet.** It called
  `loadAISettings()` synchronously in the render line and claimed „No key yet —
  chat stays silent until you add one" plus an amber fix instruction for 174 ms
  after a start, while the key was there (measured: lie at +196 ms, truth at
  +370 ms). Unknown is now a third face: a loader, no tick, no cross, and no
  instruction before hydration answers.
- **The promised Ollama probe was an empty `if`.** `src/lib/profile.ts:136-143`
  polled `/api/health` after two direct pings and then held only comment lines, so
  the surface said „Ollama — not found" where the server could see the model list.
  The follow-up now goes through our own door (`POST /api/models`,
  `{protocol:'openai', baseUrl:<target>/v1}`); no address leaves the machine, and a
  refused follow-up makes nothing available.
- **A second save no longer loses its own receipt.** One timer took the
  confirmation away from the next save; it is now a ref, cleared before each new
  timer and on unmount. All four receipts that persist something live 6 000 ms
  (one constant) — the clipboard copy keeps its 2 000 ms, because it confirms a
  moment rather than a save.

### Notes

- `npm run release:beweisen -- <version>` exists now, and the checker derives the
  app bundle from the folder instead of naming a brand: it had been looking for
  `KEPTA.app` since the rename, which silently skipped the only test that sees a
  native binding built for the wrong runtime.

## [3.2.14]

### Fixed

- **The coverage line understated his network by a factor of three.** Over
  21,066 notes the graph read „345 of 21,066 notes carry a concept — this field
  is not a network yet", which told the owner of the base that his memory is
  1,6 % connected. Measured against the running door (05:58, HTTP 200):
  **1,018 of 21,066 = 4,83 %, 2,93× more**. The clause divided a *window*
  numerator (`netz.erwahnungen`, whatever passes the 500-concept cap) by a *stock*
  denominator (`bestandGroesse()`) — while `server/router/system.ts:106-116`
  already computes the honest pair in the very same handler and the surface's
  `GraphApi` type never knew the field existed. One rule now, in two positions:
  **numerator and denominator come from the same set.** With `deckung` the door's
  two numbers; without it only the window, phrased „345 of 1,050 notes **in this
  picture** carry a concept" — the stock stays in the head line above, so nothing
  on screen is lost, but a clause that cannot see the base no longer claims it.
  Red first (three cases, one printed the old number verbatim), 180/180 after,
  and a mutation (numerator back to the window) that turns the stock case red
  while the window case stays green — a discriminating pair, not one case that
  reacts to everything.
- **The pretest guard reported success while 59 of 178 test files died.**
  `scripts/pruefe-native.mjs --node` ran a child that did nothing but
  `require(MODUL)` — and `better-sqlite3-multiple-ciphers` binds its native
  binary **lazily, at `new Database()`**, so a naked require cannot see an ABI
  conflict. The same file already knew better on the Electron side
  (`probelauf()` opens a probe database with cipher, legacy, key, FTS5). Node now
  does the same: an encrypted probe DB, an FTS5 insert and match, verified to
  reach the constructor (a bad path errors), to write no plaintext, and to be
  unreadable without the key. Proven with a **lazy-binding stub** rather than a
  rebuilt binary — three cases, and turning `fehlerBeimLaden()` back into a bare
  require goes red. **The incident it would have caught happened at 04:52: a
  `build:mac` between 04:40 and 04:41 left the module on Electron ABI and a full
  suite lost 529 of its 532 failing cases to one sentence about
  `NODE_MODULE_VERSION 149`.**
- **A security sentence was precise about the wrong thing.** The key field said
  the API key is „sealed … never returned by the settings API" — true of the API
  (`server/router/settings.ts:50-55,156-166`) and silent about
  `src/lib/ai.ts:409-411`, which keeps a working copy in this installation's
  local storage so the model survives a restart. The sentence now says so.
  Nothing was retracted; it was made complete.
- **A sold number named its corpus.** „71 % Hit@1" is now „71 % Hit@1 over the
  58-note, 45-question test corpus that ships with K3PTA", and the doc guard
  refuses any `N % Hit@1` claim whose surrounding text does not name the corpus
  size — **derived from `CORPUS.length`**, the same file `scripts/eval.ts:15`
  imports, not typed in. 71 % on 58 notes and 71 % on 2,000 notes are two
  different claims.
- **The tool list is proven derived, not restated.** Two cases feed the surface
  an **invented** door (`memory_zebra/yeti/quokka`, own titles, two-sentence
  descriptions, a `required` field) and require its order, its first sentence
  only, and `{ q, z? }` field marks — while every hand-written string from the
  old three-tool list must be *absent*. A second case takes a 500 from the tool
  door and shows no name at all, only „tool list could not be read". Had any
  text still been typed into the file, it would have survived the invented door.

- **The privacy preview ignored its own switch.** The box under „Hide personal
  data from cloud AI" promised „Try it — this is what a cloud model would see"
  and then ran `new Schild()` unconditionally (`PrivacyShield.tsx:71-74`), while
  the real path gates on the switch (`server/router/chat.ts:51`
  `schild = aktiv ? new Schild() : null`). Switch off, and the preview kept
  hiding — a privacy panel that showed the opposite of the product. It now
  follows its switch: off means the address is printed exactly as a cloud model
  would get it, with the sentence „The shield is off — a cloud model would see
  this text exactly as it is." Proven both ways in one case: on → `[EMAIL-1]`,
  click → the real address and no `Hidden:` line, click back → masked again.

### Docs

- Three probe traps are in `AGENTS.md` under „Hard-won rules": in jsdom
  `import.meta.url` is an **http** URL, so `fileURLToPath` throws before any
  assertion runs; measure a child against the panel's **content box**, not
  `width − padding` counted twice; and a viewport shot of a section below the
  fold returns **byte-identical** with/without images — hash the set before
  reading it.
- **The privacy preview ignored its own switch.** The box under „Hide personal
  data from cloud AI" promised „Try it — this is what a cloud model would see"
  and then ran `new Schild()` unconditionally (`PrivacyShield.tsx:71-74`), while
  the real path gates on the switch (`server/router/chat.ts:51`
  `schild = aktiv ? new Schild() : null`). Switch off, and the preview kept
  hiding — a privacy panel that showed the opposite of the product. It now
  follows its switch: off means the address is printed exactly as a cloud model
  would get it, with the sentence „The shield is off — a cloud model would see
  this text exactly as it is." Proven both ways in one case: on → `[EMAIL-1]`,
  click → the real address and no `Hidden:` line, click back → masked again.


## [3.2.13]

### Fixed

- **The backup button backed up a page.** „Download every memory node as a JSON
  backup" read `getMemoriesSync()` — the store cache, filled by
  `fetch('/api/memories')` without `alle=1`, capped at `SEITE_STD = 100`
  (`server/helfer/api-form.ts:78`) — and reported „Backup created". On his
  21,066-node base that is 0,47 %; on a fresh start, before anything has
  refreshed the cache, it is **nothing at all**. The button now asks the door for
  `?alle=1`, names the number it wrote („Backup created · 21,066 nodes"), and
  says what failed instead of claiming success. Case red before the fix (100
  against 250), mutation after it (drop `alle=1` → 100 again). The store already
  knew: `seiteIstBegrenzt()` has no consumer anywhere in `src/`. **The same class
  was recorded on 14.10. and left to sit for two days.**
- **The MCP panel listed three of eight tools.** `src/core/mcp.ts` advertises
  eight; the settings surface hand-set three (`memory_search`, `memory_save`,
  `memory_list`) — so `memory_update`, `memory_delete`, `memory_graph`,
  `memory_consolidate` and `memory_forget` were unexplainable to the person
  wiring up their agent, on the very page that configures it, while
  `SystemStatus.tsx` printed „8 tools" two screens away. The list is no longer
  typed out: it is fetched from the running door at load, with its own count, its
  own error state and its own empty state. Verified against the door itself, not
  the source — `tools/list` over `POST /mcp` answers 200 with exactly eight.
  The witness that should have caught this was green while checking three names
  under a case titled „nennt die acht Werkzeuge"; it now derives its expectation
  from `mcp.ts` and refuses to pass on fewer than eight.
- **A sold number was a stale number.** The system panel claimed „62 % Hit@1" for
  lexical search. That was a real measurement once (`CHANGELOG.md:1460`); today
  two independent evaluations measure **71 %** (`docs/belege/tag-13-10/
  eval-korpus-1413.log.txt:17`, `ablation-beine-1144.log.txt:10`). The guard that
  was supposed to protect it accepted *any* number between 45 and 75 — a band
  cannot kill a wrong figure, it can only tolerate one, and it would have
  rejected a correct 76. The allowed values now come out of the evidence file
  itself, and the guard fails loudly if the file stops naming them.
- **One strip, two number dresses.** His own screenshot from 15.10. showed
  „92 Notes **10996** Files **9978** Code" and, one line below, „in the
  **21,066** stored". Five counts in the index strip now go through one helper, so
  the thousands separator is either there for all of them or missing for all.
  2,622 cases never saw this because the fixture counted 100/30/20/150 — below a
  thousand, a separator is invisible. A case whose numbers cannot express the
  defect is not a case.



### Fixed

- **The title budget counts the picture, not the store.** 3.2.11 put the base
  behind the number, and his own window showed what that is worth: „2 of 21,066
  notes carry a title · 21,064 stayed nameless: **20,337 not on this screen**,
  384 in rows too tight for a title, 205 over the 140 names this picture allows,
  138 crowded out by a name already there". The arithmetic closed; 96 % of the
  sentence was a statement about the viewport, which the frame line above already
  makes („729 of 21,066 unfolded notes are in this picture"). The etat now pools
  on what the picture holds and says so — „2 of 729 notes in this picture carry a
  title · 727 stayed nameless: …" — and the off-screen class is gone: a node that
  is not in the picture is not a name the picture refused. Guards: reworded cases
  in `tests/components/KnowledgeGraph.etat.test.ts` (7 cases; 5 red before the
  reword) and the three closure cases in `KnowledgeGraph.f8.test.tsx`.
- **A stage promise is now measured where the stage has a lever.** After the
  square-root law, two long-standing cases flipped between runs on identical
  bytes (once 2 red, once 1 red, once none): they counted the titles of the last
  recorded frame while the field was still moving, and a painted title lands or
  misses on a one-pixel shift. Measured the same base through the surface's own
  line, per density — 60 notes: Few 30 against Many 29; 200: Few 27 against Many
  48; 400: Few 12 against Many 38; 200 notes in a 620 × 420 picture: 7 against 7.
  In a thin field both stages are raster-bound and the difference between them is
  noise; the lever of the stage is its budget, and that binds from ~140 candidates
  up. The case now counts the 200-note field, reads the number the surface writes
  instead of recounting frames, and demands more than ten names of margin. A
  `stabil()` wait (same value three times) guards the three cases that compare
  counts across a stage switch. Beleg: `audit-2026-10-09/belege-15-10/leitung/sonde-few-gegen-many.log.txt`.
- **Counting from the last frame was its own error.** The same probe first
  reported 0 titles at 200 notes where the surface's own line said 63 — the
  recorder had caught a half-painted frame. The line the picture writes is now the
  instrument for these cases.

**Offen und nicht versteckt:** in a *thin* field (60 notes in 1 000 × 700, or 200
notes in a 620 × 420 window) „Many" names no more than „Few" — 30 against 29 and
7 against 7. Both stages are limited by the occupancy grid there, not by their
budget, so the density control is a word without a number at that size. Whether
the grid should give way earlier when the user asks for more names is a shape
decision for GF's market bar, booked as open, not answered here.

## [3.2.11]

### Added

- **The balance now says how many nodes stayed nameless, and why.** The surface
  already reported „21 of 400 notes carry a title" — the question a person asks
  directly after that is about the other 379, and the picture answered nothing.
  The paint pass now partitions them: off this screen, faded by the filter or the
  pointer, rows too tight for a title, under the name gate, over the name budget,
  wider than its row, crowded out by a name already there. The arithmetic closes
  by construction — every node falls into exactly one reason on its way from the
  base into the picture — so the sentence is a budget, not a mood. A chosen
  „None" is not a failure and gets no reasons; a picture that names everything
  stays silent. Measured on the guarded case: „21 of 400 notes carry a title ·
  379 stayed nameless: 260 over the 140 names this picture allows, 119 crowded out
  by a name already there". Guards: `tests/components/KnowledgeGraph.etat.test.ts`
  (6 cases over all seven reason classes) and three cases in
  `tests/components/KnowledgeGraph.f8.test.tsx` (2 of 3 red before; zeroing one
  bucket turns the closure case red again).
- **Node size follows a square root, capped at 26.** Degree 92 and degree 163 were
  the same pixel value — both sat on the old cap of 18, so the biggest hub in a
  knowledge base looked like the second-biggest and the size range existed in name
  only. `knotenRadius` in `src/lib/graphLayout.ts` is now the single law the
  physics and the paint pass share: `min(26, 4 + √grad · 1.6)` — 1 connection 5.6,
  18 → 10.8, 92 → 19.4, 163 → 24.4 image points, the top two hubs 1.26× apart
  instead of 1.10×. The bar is Obsidian's own law, `3·√(weight+1)` clamped 8…30,
  measured 15.10. (`audit-2026-10-09/GF-OBSIDIAN-LATTE-15-10.md`): the same class,
  not a step below. Guards: four cases in `tests/lib/graphLayout.test.ts` (red
  before: `knotenRadius is not a function`), and the two places that had copied the
  old formula into a test now call the law instead of restating it.

### Fixed

- **The 3 000-note separation case names the moment it was measured at.** With
  larger hubs the funnel closes one step later than it did under the old cap:
  measured on the same field, side by side — new law 60 → 1 355, 120 → 958,
  180 → 390, 250 → 14, 310 → 1, 380 → 0; old law 60 → 1 517, 120 → 1 267,
  180 → 619, 250 → 15, 310 → 0. The new curve is lower at every early station and
  rests at zero; the single pair at step 310 is two hubs still sliding apart
  (r 26 + 26, 47.4 apart against 52.0 required). The case now bounds the flight and
  demands the funnel be closed before rest, instead of asserting a step number that
  was calibrated to radii that no longer exist.

**Not hidden:** the reason class „too small for a name at this zoom" cannot fire
today. The paint pass floors every node at 1.5 image points
(`MIN_KNOTEN_PX`, `src/components/KnowledgeGraph.tsx:763`) and the narrow gate
opens at the same 1.5 — so the bucket is permanently zero while the floor holds.
The number is kept because it is true the moment the floor moves, and the floor is
Dichte's #102 subject, not a thing to change under a running wave.

## [3.2.10]

### Fixed

- **The graph header counts the field, not the page the list happens to carry.**
  His screen at 18:34 MESZ held three numbers over one picture: the header said
  „100 of 21,066 in the store", the balance below it „21066 notes · 159 concepts ·
  1061 links", the frame „729 of 21066 unfolded notes are in this picture". The
  header read `memories.length` — the page the list loads — while the field has
  carried his whole base since 3.2.8. The surface now reports its own count upward
  (`onFeldZaehlung`) and the header uses it; one number, derived from the field.
  The same panel also wrote one size two ways („21066 notes" above „345 of 21,066
  notes carry a concept") — every quantity on it now carries the thousands
  separator. Guards: `tests/components/graph-kopf-eine-zahl.test.tsx` (3 cases,
  red before: header 100 against balance 130) and one new case in
  `KnowledgeGraph.bestand.test.tsx` (red before: „1050 notes" against „1,050").
- **A graph opened in a hidden window paints again when the window returns.**
  Measured in his running app over its own debug port: window visible, canvas
  300x150 (its HTML default), zoom 3 %, field empty — and 1940x1384 at 9 % after a
  size change. The paint loop tested `document.hidden` once, when its effect ran,
  with no listener and no dependency, so a graph first opened behind another window
  never drew again in that program cycle and the camera stayed fitted to a 300x150
  surface. The visibility of the window is now state, held by a
  `visibilitychange` listener. Guard: `tests/components/graph-sichtbar-malt.test.tsx`
  (3 cases; the control „hidden does not paint" stays green, removing the listener
  turns two red).
- **An aisle label no longer names a neighbourhood it does not belong to.**
  Measured against his base: median title 114 px against a 26 px column split —
  197 of 200 titles wider than their own cell. The gate compared the row *height*
  with the column split and opened at 93 % zoom, which is exactly the band (93 % to
  438 %) where a title spans four neighbours. An aisle title is now painted when it
  fits its column and not otherwise; the node under the pointer keeps its full
  title, and zooming in brings the names back. Guards: two cases in
  `tests/components/KnowledgeGraph.render.test.tsx` (density setting „All"; red
  before with the number „a 149 px title standing over a 27 px column split"; the
  deep-zoom control proves short and long names still appear once they fit).

## [3.2.9]

### Fixed

- **Clicking empty canvas no longer grabs an invisible node.** Reported 15.10.
  18:0x: „wenn ich auf eine leere Flaeche druecke, habe ich auf einmal einen Knoten
  bei meinem Mauszeiger, was dazu fuehrt, dass ich den Graph nicht bewegen kann."
  The band marks everything outside the current page `versteckt`; the painter and
  the fit honoured that, `nodeAt()` did not. The hand therefore grabbed a point the
  picture never drew, the canvas went to `grabbing`, and panning was gone. `nodeAt`
  now skips hidden points — the rule the time-blend already uses („was ausgeblendet
  ist, ist nicht anfassbar"). Guard: one case in `tests/lib/graphLayout.test.ts`,
  red before the fix.
- **The camera no longer fits the pages it does not show.** With the whole base in
  the field (3.2.8) the first fit ran *before* the first layout step, so `versteckt`
  was still unset and the bounds were the start spiral of 20.000+ points — measured
  in his own window: **3 % zoom**, a 6 px node at 0,18 px, an empty canvas. The
  handoff now takes one step before fitting.

## [3.2.8]

### Fixed

- **The graph now sees the whole memory, not the page the list happens to carry.**
  The window loads one page of notes (`GET /api/memories`, 100 by default) because a
  21.000-row list must stay light — and the graph was built from exactly that page.
  Measured in his own window at 17:22 MESZ: the header said `19 notes of 21,066 in
  the store` and the side rail `counts cover the 100 loaded notes`, so most of a
  person's memory was never a candidate for the picture, no matter how the band or
  the caps were tuned. The graph view now asks the door for the whole base once per
  session (`GET /api/memories?alle=1`, the switch the door already had) and keeps
  the larger set for the field; the list is untouched and still pages. Guard:
  `tests/components/KnowledgeGraph.render.test.tsx` — a 500-note base delivered
  through the door while the window carries 3 must still count 498 lonely notes,
  show 384 of them and offer page 1 of 2.

## [3.2.7]

### Fixed

- **A grey window is now a named failure with a way out.** The app had no error
  boundary at all, so a single throw during render made React unmount the whole
  tree: an empty window, no sentence, no button (reported 15.10. 16:24 while
  switching a retrieval track). `src/components/Fehlerschirm.tsx` wraps the root
  outside `StrictMode`: it names the error and the frame it came from, writes it to
  the console so a log exists, and offers `Try this screen again`, which rebuilds
  the children. Guards: `tests/components/Fehlerschirm.test.tsx` (two cases — the
  panel appears with the message instead of an empty document, and the children
  return after the retry). The three retrieval tracks were then clicked in the real
  app against a 21.066-note base with a debug port open: no exception, page intact
  (`tests/components/Settings.spuren.test.tsx` holds three cases for the toggles
  themselves). What the boundary changes is the class: the next failure reports
  itself instead of going grey.
- **A thin base no longer drops most of itself out of the picture.** The force view
  carried a gate: when under five percent of notes hang on a concept, it painted
  only the covered ones and said `N notes hang under no concept and are not painted`.
  On a real base measured at 4,83 % coverage that meant ~20.000 notes were not in
  the image at all — which is what "my graph is very small" was. The uncovered mass
  is now the band: it enters the field, `GANG_REIHEN_PRO_SEITE` shows 384 of them
  per page, the pager opens the rest, and the same line names the whole count
  (`398 notes connect to nothing in this picture · showing 384 of 398 · page 1 of
  2`). Physics, collision, painting and fit skip the pages not shown, so a 21.000-
  note base still draws ~1.900 points per frame. The gate stays for a small thin
  base (under one page of uncovered notes), where a band would be noise; the two
  density cases that named the old wording now assert the band's.

## [3.2.6]

### Added

- **The band of unconnected notes became a page with a pager.** Its mass is not a
  rounding problem: in the test base 800 of 1.001 notes stand without a neighbour,
  and a real base of 21.066 notes had 1.018 of them reaching a concept (4,83 %,
  door and probe 15.10. 15:00 MESZ) — so most of it stands without one. As a single
  grid the band is 384-unit rows at 26 px pitch, thousands of units tall, so the
  picture either zooms its core into a speck or the sentence lands off-screen.
  `src/lib/graphLayout.ts` now exports `GANG_REIHEN_PRO_SEITE = 12`
  (384 places a page), `gangPlaetzeProSeite()` and `gangSeiten()`. The layout places
  one page, marks the rest `versteckt`, keeps counting every one of them in
  `sim.allein`, and takes hidden points out of repulsion, collision, painting and
  fit-to-view. The surface shows a pager (`data-testid="gang-blaetterer"`, prev and
  next, `1 / 3`) and its screen-reader line names the whole: `N notes connect to
  nothing in this picture · showing 384 of N · page p of s`.
- **The band engages where the mass is the story.** The old ceiling
  (`allein * 2 <= nodes`) switched the band off exactly when most of a base was
  unlinked — and threw the majority back into the ring around the core. The rule is
  now `gangGreift(allein, knoten, kernDa)`: a base without a core stays a field (the
  two guards that say so still pass), but a mass larger than one page next to a real
  core gets the band.
- **The graph door states its own coverage.** `GET /api/graph` answers `deckung`
  (notes, covered, share in percent) from `store.notizenMitBegriff()`. 2.756 concepts
  and 2.726 edges say nothing about how much of a 21.066-note base actually hangs in
  the net, and the door was silent about exactly that.

## [3.2.5]

### Added

- **The graph can fill itself in, and says so while it does.** Saving a note has linked its own
  terms since the parity commit, but the 14,701 notes the computer scan had already indexed were
  written before that rule existed — measured through the door on a real store on 15.10.: 1,018 of
  21,066 notes hang on a concept, 4,83 %. They are not broken, they are simply unlinked, and the
  picture shows exactly that: a ring of lonely points around a small knot. `POST /api/graph/nachzug`
  walks the whole store through `indexMemory` in stacks of 500 (measured 0,21-0,24 ms per note, so a
  five-second job, not an event), `GET` reports how far it got, `POST .../cancel` stops it between
  stacks, and a producer mark decides whether a store still needs the walk — the same stand is never
  filled twice, and raising the mark refills it once. Before the first line is written the run takes a
  database backup (`datenbanksicherung`, the helper that so far only ran before a replacing import) and
  **refuses to touch the store if that backup fails**: 503, nothing written, and the surface shows the
  reason. The graph view starts the walk when the door reports a need, reads progress as a line over
  the canvas, and reloads the network when it ends — growth you can see instead of a number in a table.
  Guards: `tests/server-nachzug.test.ts` (seven cases: refuses and writes nothing without a backup,
  fills the net, door agrees, idempotent on the second run, one run per mark, second call refused while
  the first runs, cancel leaves a valid middle that a full run then finishes to the same end) and three
  cases in `tests/components/KnowledgeGraph.render.test.tsx`. Red before the route existed: 7 of 7, and
  2 of the surface cases. Proofs: `docs/belege/app-abnahme/nachzug-vorher-rot.log.txt`,
  `docs/belege/app-abnahme/nachzug-tuer-gruen.log.txt`,
  `docs/belege/app-abnahme/nachzug-flaeche-vorher-rot.log.txt`,
  `docs/belege/app-abnahme/nachzug-flaeche-gruen.log.txt`,
  `docs/belege/app-abnahme/nachzug-mutation-rot.log.txt`.

## [3.2.4]

### Fixed
-- **The suite can no longer reach the real knowledge base at all.** A full run at 12:08 MESZ on 
  15.10. failed one case with the body `Limit reached: 21066 active nodes, maximum is 5000` — 21,066 
  is a person's own store, not a fixture's, so the route in that run had been served by a store 
  pointed at `~/.kepta`. Nothing was written (the database and its WAL both carried mtimes older 
  than the run, and the capacity gate refuses before writing), but it **read** it — and the two runs 
  before and the one after, on identical bytes, were green: the capsule depended on which file got a 
  process first, not on the code. Task #58 had put a capsule in every file that remembered one; this 
  closes it a level down. `tests/setup.kapsel.ts` now runs before any test module is imported and 
  moves `HOME` (and `USERPROFILE`) into a private empty directory, keeping the real home readable 
  only as `KEPTA_ECHTES_HOME` so a guard can compare against it; `tests/kapsel-pflicht.test.ts` holds 
  three cases — the home is capped before import, the data dir never resolves into the real home, 
  and `~/.kepta` is still the default rule, just somewhere else. Red before: the guard printed 
  `/Users/damiantodorovic/.kepta` as the resolution it was rejecting. The whole suite passes under the 
  pin — 2,572 cases, 172 files, two green runs at 12:28:27 and 12:31:05 MESZ, exit 0 — so no test 
  was relying on his folder to pass.

 **The route table stopped implying a door that is not there.** It listed `/api/memories/:id` with no method, which reads as a documented `GET` — and `GET /api/memories/:id` answers `404`, because the only methods registered on that path are `DELETE` and `POST .../restore`. The row now names every method it lists, the section says in words that there is no single-note GET and where a note's body actually arrives (`GET /api/memories`, or a `GET /api/memories/search` hit — both carry the full `content`), and `tests/doku-plattform.test.ts` parses the table and fails if a named route is not registered on the server. Neither `kepta-core` nor the Enterprise server grew a route in this pass: all three doors already behave the same, so what was wrong here was only the sentence about them.

- **The band of unconnected notes became a page, not only a picture.** Its one sentence —
  `N notes connect to nothing in this picture` — existed only as text drawn onto the canvas, so
  nothing outside the paint loop could read the count: not a screen reader, not a check on a real
  store, not the row-pitch calculation the next slice needs. `src/lib/graphLayout.ts` now exports
  `gangZeilen(alleinZahl, spalten)` (the arithmetic the paint pass was doing inline) and the surface
  mirrors `{ allein, zeilen }` into a real element (`data-testid="gang-info"`, `role="status"`,
  screen-reader text `N notes connect to nothing in this picture · R rows of C`). The mirror sits at
  the layout handoff, not in the animation loop, and that was measured, not assumed: `sim.allein` is
  set by the first simulation step, so a mirror waiting for a frame stood empty where no frame is
  painted (`textContent ''` — zwei rote Laeufe). Held by four cases:
  `tests/lib/graphLayout.test.ts` (0 notes = 0 rows, 176 notes = 6 rows at 32 columns) and
  `tests/components/KnowledgeGraph.render.test.tsx` (the node carries count and rows when a band
  exists; it claims nothing when there is no band). The picture did not move: same caption at the
  same place, same rows — only now someone other than the eye can read it.


## [3.2.3]

### Changed
- **The nine words now stand at every place a person reads them, and a guard counts the places.** The first pass carried them onto cards, the editor and the list; five surfaces still spoke the old four (`Settings.tsx:785`, `DossierView.tsx:231`, `dossier.ts:136`, `uiText.ts:32-34`, and the graph tree). `tests/kategorien-wache.test.ts` now enumerates the surfaces itself instead of trusting a list, and it derives the forbidden words from `TYP_LABELS` — 27 places in 10 files were pulled to the new reading, and the graph tree groups on the carrier row with the four compute kinds kept as colour, not as name. The index cell that read `50 categories` reads `50 tags`, because it counts tags and the surface now has a real category row two lines below it. `src/components/Dashboard.tsx`, `src/lib/graphHierarchy.ts`, `tests/kategorien-wache.test.ts`.
- **A group count is a store number, not a page number.** Clicking `Notes` on a 14,702-note store used to filter the 200 loaded entries, so the chip said 92 and the list said nothing. `GET /api/memories/gruppen` (`server/router/memories.ts:230`) answers the whole store in one pass — measured here at `bestand 97, notes 82, files 9, code 6` in 1-3 ms on a fresh capsule, and 4 ms over a 14,702-note copy — and the strip reads its numbers from that route while the page keeps its own count for what is on screen. Two numbers, two names, one sentence each. `tests/server-gruppen.test.ts`, `tests/components/dashboard-bestand.test.tsx`.
- **The rate limiter guards the door, not the window.** `server/app.ts` put the global limiter in front of *every* route, so the document and its assets spent the same budget as the API — and the surface polls by itself (`Dashboard.tsx:653` every 4 s, `:428` every 12 s). Measured in a real browser: one surface load costs 21-23 `/api` requests, and after twelve quick reloads an 820 px window showed `{"error":"Too many requests — please wait a moment."}` where the graph should have been. Non-data paths are now skipped, and the data edge moved from 180 to 600 per minute — four times what the interface spends while it works, still a hard edge against a loop. `server/helfer/limiter.ts` (`DATEN_KANTE`), `tests/server-limiter-fenster.test.ts` (4 cases, both directions: 200 window requests pass, the door and `/mcp` still refuse).

### Fixed
- **The graph stopped writing its lonely notes into each other.** Notes with no neighbour in the picture lie in rows under the core, and their titles are drawn centred on the dot: at 820 px and 46 % zoom a row is 12 image pixels tall while a title is 14 with its tag line, so the titles of one row landed in the dots of the next and across the caption that counts them. Band titles are now withheld while a row cannot hold a line — the count stays, and zooming in brings the names back — and the caption reserves its cells in the same occupancy grid the labels use. Measured before and after in the same window: `audit-2026-10-09/leitung-bilder/ausschnitt-legende-820.png` against `graph-820x1180.png`. `src/lib/graphLayout.ts` (`gangIds`), `src/components/KnowledgeGraph.tsx`.
- **A header sentence that does not fit is gone rather than chopped.** The graph header carried "… connected through tags, similarity and knowledge entities" behind a `truncate`; at 820 px the box measured 343 px and the sentence 387, so it ended mid-word in front of the user. The box now decides: below the width the sentence needs, only the count stands. `src/components/Dashboard.tsx` (`SATZ_BREITE_MIN`, a `ResizeObserver` on the box itself, silent where no layout exists).
- **The provider line stopped speaking in house words.** It read "No API key — the test cockpit chat cannot answer. Agents over MCP do not need one." — an internal name for our own product on a surface a stranger reads. It now says what is missing and what still works without it. `src/components/SystemStatus.tsx:180`.
- **The text-size control now acts on the first opening.** It stored a value that nothing read until the next view change; the boot path applies it now, with the case written red first over both networks. `src/lib/settings.ts` (`wendeZoomAn` in the boot way), `tests/lib/einstellungen-boot.test.ts` (7 cases).
- **The folder scan refuses K3PTA's own output.** A term that is word-identical to a note of this workspace was arriving as a new concept, because the walk picked up a `markdown-export-…` folder the app had itself written — 68 of the 500 terms in one graph window stood word-for-word in his own folder, one of them in a K3PTA export. The block sits at the entrance and is a signature, not a word: `Export`, `export-2026-04` and `Exports` stay real material. `src/scan/regeln.ts` (`EIGENE_AUSGABE`), `tests/scan-eigene-ausgabe.test.ts` (4 cases).
- **Three test expectations copied a label instead of reading it.** `MachineScan.test.tsx` held the word `documents` and `KnowledgeGraph.render.test.tsx` held `F` and `Events` — every one of them broke the moment the label vocabulary moved, which is a test that punishes the very change it should follow. They now derive from `TRAEGER_LABELS`, `GLYPH_FUER_ART` and `TYP_BESCHREIBUNG`, so a label edit cannot fail a count check. `tests/components/MachineScan.test.tsx:131`, `tests/components/KnowledgeGraph.render.test.tsx:2458,2466,3304`.
- **Suite: 2,562 cases in 171 files, 0 failing**, measured 2026-10-15 (measuring pass, then two consecutive checking passes at exit 0 with `scripts/doku-check.mjs` attesting the same number in `README.md`). Lint exits 0 with 0 errors and 50 warnings; the warnings are open, not fixed.

## [3.2.2]

### Changed
- **The four knowledge types became nine words in two rows.** The old labels sorted by *origin* while every label read like *content*: measured on a real 14,702-note store, 14,610 notes (99.4 %) carry the `machine-scan` mark and 92 are typed by the person, so 91.2 % of the base sat under one label and the other three were nearly empty. Row 1 answers *where it came from* — `Notes` (92) · `Files` (8,622) · `Code` (5,988), exhaustive and non-overlapping, derived from the real source path, so no re-classification pass was needed. Row 2 answers *what it is about* — `People` · `Projects` · `Events` · `Tasks` · `Guides` · `Links` — and fires only inside `Notes` and `Files`, never inside `Code`. Baskets named `Money`, `Numbers`, `Places`, `Accounts` were measured and refused: the first three are code artefacts on a real store (2,970 `price` hits in an e-commerce locale export, 13 of them the person's own), and an `Accounts` shelf advertises credentials. `src/lib/graphHierarchy.ts:88-89`, `src/core/klassifikation.ts`, `tests/lib/gruppen.test.ts` (15 cases).
- **An empty filter is no longer a dead end.** Clicking `Code` (or a thin theme) on a page with no match removed both chip rows from the DOM, leaving no way back, while the strip two rows above still said `2 Notes 2 Files 0 Code`. Both rows now stay reachable, the empty heading names the group and the page scope, and one click returns everything. Reproduced red first in `tests/components/Dashboard.test.tsx`, then measured in a real browser at 1440/1024/820/390 px.

### Fixed
- **The folder scan walked K3PTA's own backups, including the files that hold its configuration.** Four `…datensicherung-vor-…` folders are 7,300 of 13,616 files (53.6 %) of a first walk, and among them `profile.json`, `scan-config.json` and `endpoint.json` — files `server/router/scan.ts:69-72` declares sensitive metadata and encrypts at rest, which the walker would have turned into readable notes for any connected agent. A folder holding a `kepta.db` is now not entered (marker, not name, so a renamed copy is still caught), and `Downloads`/`Movies`/`Pictures`/`Music` are excluded unless the person picks one as the root. Measured over his real home: 32,329 seen / 13,616 taken in 782 ms **before**, 24,738 / **6,243** in **170 ms** after, backup files 0, config notes 0. `src/scan/walker.ts:120-126`, `tests/scan/regeln.test.ts`.
- **Key-shaped secrets are now masked before they can become a memory.** Assignments (`sk-…`, `sk-ant-…`, `ghp_…`, `xox…-`, `AKIA…`, a 64-hex run after a key-like name) collapse to family plus length, and the count per run is shown instead of a silent rewrite. The boundary is the work: over the real working folder the mask touches **15 files / 39 places and leaves 5,906 untouched**, including 111 files carrying 4,033 hex runs that are checksums, not keys; in his store, 132 of 143 hex runs sit in prose and must stay. `src/scan/maskierung.ts`, called at `server/router/scan.ts:336-341`, `tests/scan/maskierung-import.test.ts`.
- **A test asked the product to change a file format, and following it would have emptied a real profile.** `tests/nebendateien.test.ts` expected the sidecar magic `K3PTA-NEBEN1`; the product has written `KEPTA-NEBEN1\n` since `281f5a1`, and his own `~/.kepta/profile.json` begins with exactly those bytes. `leseJsonDatei` (`src/core/nebendateien.ts:98-114`) returns `null` for an unknown magic and `server/router/settings.ts:104` turns that into `{}` — so the next save would have written an empty profile over a real one. The expectation is corrected and pinned in both directions at byte level (`:63-85`): a genuine envelope still decrypts, identical ciphertext with the new prefix yields `null`. A format on disk is not a brand word.
- **Light-theme contrast, measured at pixels rather than at CSS values.** The level words under the graph strip read 3.45-3.49 (16 of 16 legend cases under 4.5:1); they now read **6.75-6.80** at 11 px with full coverage. The nine chips read 5.18 with `Links` at 4.36; they now read **6.65** with the weakest at 5.51 and 0 of 36 under the bar. The drawer's left edge stayed at 1.59 after its token was fixed — a 1 px `border` loses half its strength on an element under `backdrop-filter`, and two pixels of width do not help; painted as an inset line it measures **3.58 / 5.85**, and the guard now checks the line, not the token name. **17 of 63 icons in the series painted blobs; now 0**, with no cell left empty. `src/index.css` (additive: no token repurposed), `scripts/design-wache.mjs`, `tests/design-tokens.test.ts` (18 cases).
- **Suite: 2,507 cases in 163 files, 0 failing**, measured 2026-10-14 19:36:13 UTC (measuring pass, then the checking pass at exit 0 with `scripts/doku-check.mjs` attesting the same number and date in `README.md`). Lint exits 0 with 0 errors and 50 warnings; the warnings are open, not fixed.



## [Unreleased]

### Fixed
- **The eval tool sold a recall as a precision.** `npm run eval` divides the hits inside the top five by `min(5, relevant notes)` — a capped recall — and printed the line as `Precision@5`, while `scripts/ablation.ts` on the same corpus divides by 5 and prints `P@5`. Two metrics under one word, on the same 45 queries: this tool says 81.1 %, that one says 23 %. Renamed in the output and in the README line that advertised it (the core carried this correction on 12.10., the app had not pulled it). `tests/eval-metrik.test.ts` binds the printed word to the denominator of the division, with a Gegenprobe, and refuses a README that calls the eval a precision.
- **`server.json` named an engine npm no longer sold, and the guard that said it checked the registry was a hand-written constant.** `tests/mcp-registry.test.ts` held `VEROEFFENTLICHTE_ENGINE = "3.3.0"` with a dated comment. npm moved to 3.4.0 on 13.10. (tag `v3.4.0`, Publish run 38393092031), and the case stayed green — which is exactly how a guard turns into a comment. The case now asks npm for `kepta-mcp` latest and compares; without a network it checks the two fields of the one file and prints that the outward comparison did not run, instead of pretending. `server.json` names 3.4.0 in both places, and `tests/version.test.ts` no longer freezes a number in its comment.
- **One CHANGELOG line carried five claims and one filename, and the numbers guard read that filename as the proof of the last clause's percentages.** Split into one bullet per claim, each with its own source (13.10.). The LongMemEval series points at `tools/longmemeval/README.md` — a paper of this repository, which says in its own words what the figure counts and that the strict-binary reading is lower.

### Changed
- **Every number the README sells now cites a run that sits in this repository.** The market paragraph sold three percentages whose artefact was never here; `npm run eval` and `npm run ablation` ran again on 2026-10-13, their whole output is kept as `docs/belege/tag-13-10/`, and the paragraph is split so each line names the tool that produced its figure. Two of the three numbers previously advertised came from an earlier run that matches neither leg of the runs quoted here, and are corrected in the open rather than quietly replaced. The numbers console (`scripts/zahlen-belege.mjs`, byte-identical to the core's) exits 0 on this tree and runs as a CI step in `.github/workflows/build.yml` — a console nobody listens to guards nothing.
- **The engine-measurement copies that lay untracked in this tree are gone.** They were core runs, no sentence here cited them (a sentence names its tree), and one carried an unredacted machine path. Laid aside in the working folder rather than deleted: `audit-2026-10-09/ablage-app-13-10/`, with its own note.
- **Suite: 2277 cases in 144 files** (run 13.10.2026; measuring pass, then the checking pass exit 0 with `doku-check` attesting the same number in `README.md`).

## [3.2.1] — 2026-10-12

Why this patch exists, in one line: the released `app-3.2.0` binary was measured to contain `proxy-addr@2.0.7`, the version GitHub flags as critical, and this repository ships its dependencies inside the package — so the only way to hand over the closed version is a new build. Nothing else in the product's behaviour changed; the rest of this entry is checks that were wrong, not features.

### Added
- **A release proof chain: `scripts/release-beweisen.mjs <version> [--fern]`.** Both packaged binaries are **launched**, not inspected: each architecture runs in a throwaway home folder with its own data directory and a fresh 64-character key, and has to answer `/api/health` with this version, encryption on, and a port that really listens. Then `SHA256SUMS.txt` is re-hashed against the bytes on disk, `latest-mac.yml`'s sha512 and size against the real files, and with `--fern` the published asset is downloaded anonymously and must hash equal to the local one. The reason is tonight's two near-misses: a DMG with the Node-ABI module inside looks complete on disk — the window opens, the server never listens — and the first version of this chain proved nothing about the foreign architecture, because reading an ABI number off a binary is not running it. One of its own checks also caught a mistake I had made seconds earlier: the checksum file was generated before the manifest was finished, so it named a hash that no longer matched. Exit is 0 only when every step ran.
- **`scripts/release-hochladen.mjs` (Arbeitsmappe, Leitungswerkzeug)** refuses to send anything while the proof chain is red, never touches a `v*` tag — those fire `publish.yml` and would push to npm — and reads the release back from GitHub afterwards to compare the asset list instead of trusting its own upload log.

### Security
- **The same two advisories, closed here too.** `proxy-addr` **2.0.7 → 2.0.8** (GHSA-jqcg-44mw-7w3h, *critical*, pulled in by `express@5.2.1`) and `source-map-js` **1.2.1 → 1.2.2** (GHSA-68fv-2mgg-jv7q, *high*, reached only through `@tailwindcss/vite`, `jsdom → css-tree` and `vitest → vite → postcss`). Found on the engine repository, where GitHub's Dependabot badge is visible; this repository has alerts disabled, so it was checked here rather than assumed clean. `npm update <paket>` only — lock diff 12 added / 13 removed lines, `package.json` and every range untouched, both target versions confirmed present in the registry before anything was written. Reachability stated instead of implied: the app's server never sets `trust proxy` (no hit outside `node_modules`), so no forwarded-header trust decision exists to spoof, and `source-map-js` does not reach the packaged app.
- **The committed `package-lock.json` still said `3.1.5`.** Both of its version fields (top and `packages[""]`) lagged the released `3.2.0`, and that lock is what `npm ci` installs in CI and what anyone who clones this repository gets. `tests/version.test.ts` reads it now, together with `npm/package.json` — the bundle that travels with the app — while `server.json` deliberately keeps naming the **published engine version** and is guarded against npm by `tests/mcp-registry.test.ts`. Two numbers, two pairs; an equals sign between them would be the bug.

### Fixed
- **The quietness probe's own test stopped putting a verdict on a timing.** Its load case measured twice — the median with four busy loops running, four times the median without them — and demanded the first stay under the second. On this ten-core desk that held; on the CI runner's four cores the same four loops take a larger share of the scheduler, the ratio came out **4,23×** (283,26 ms against 267,96 ms), and the gate turned the release tip red on a commit that had touched nothing but one line of `index.html` (run `38182756836`, red at `c135c43`, while the same tree ran green here at 01:20). The blind spot that case was reaching for is now shown on **set numbers** instead of on the machine: one measurement with a quiet median, a running outlier and eleven node processes reads `ruhig` to a median-only rule and `nicht ruhig` to the OR-chain of three witnesses. What the live load still has to prove, and can: the probe holds its verdict back, names at least one of the three witnesses, and counts its own children above the process limit. Byte-identical with `kepta-core/tests/ruhe-sonde.test.ts`. The guard pair named in 3.2.0 still guards: `tests/platten-wache.test.ts` and `tests/ruhe-sonde.test.ts` run, and the suite stands at **142 files / 2 243 executed cases** after the change — first run 12.10.2026 01:36 as the measurement, second run 01:44 as the judgement, `node scripts/doku-check.mjs` green, case count unchanged by the fix.
- **The number guard no longer falls over midnight.** It compared the date beside the number with the date of the run on disk, so the same tree was green at 23:50 UTC and red at 00:00 UTC — run `38185328804`, the second red X on the release tip, and the number 2 243 was never what disagreed. A stamp now carries one machine-independent bound: it may not name a day after the certified run. (The first cut also demanded „not older than the newest test file", and that one is withdrawn the same night: `actions/checkout@v4` writes every file fresh at `fetch-depth 1`, so on a runner the newest test file is always the run's own day, and an unchanged-but-correct README would have gone red at the next push — the same groundless red this commit removes. The number itself is what holds: it must be this run's number, and a new case changes it. Report-vs-suite freshness stays, where mtimes mean something — on a real machine.) Five cases in `tests/doku-zahlen.test.ts` and the rewritten case in `tests/test-bericht.test.ts` hold the edges. `scripts/test-bericht.mjs` and `tests/test-bericht.test.ts` are byte-identical with the engine repository. Count for this state: **142 files / 2 248 executed cases** (measured 12.10.2026 by `npm test`, judged by the run after it), README badge, prose line and the `npm test` comment carried along.

## [3.2.0] — 2026-10-11

### Changed
- **The graph no longer lets its own discs lie.** The collision pass ran **four** times per frame; on a dense base that was not enough, and the README sold it as „never overlap" while a brute-force count over every pair found **9 pairs at rest out of 3 027 discs** at 3 000 notes and **390 in the moment of opening** (`docs/graph-kosten.md`, `tests/lib/graphLayout.test.ts`). `COLLIDE_ITERATIONEN` is now **8** (`src/lib/graphLayout.ts:168`): **0 intersecting pairs at rest at 400, at 1 500 and at 3 000 notes**, 15 while a 3 000-note field cools, closing to 0 by step 310. The cost is measured, not hoped: **+2,1 ms per physics step** at 3 000 nodes (9,7 → 11,8 ms), which is under the weight of a frame that software-rasters in 30 ms anyway and is invisible at the sizes the app actually serves. **Two sentences died with this fix and are gone from the README:** „3 000 nodes … at 60 fps" (never reproducible from this repository) and „1 500 notes inside the 16,67 ms budget" — after the fix, 1 500 notes need **17,5 ms while cooling**, 234 of 315 painted frames over budget, so the honest ceiling for 60 fps is about **400 notes**. `README.md:37` and `:143` now name the test and its command instead of a millisecond, because the runner that measured the milliseconds refused to publish them on a machine its own after-probe called unquiet.
- **The layout's bar stopped eating the canvas, and the density ladder got real.** The header bar measured **548 px** of the graph area away at 1 440 px; it is **0** now. The density step went from 1 to 19 across the sizes the surface is used at. Measured in a real browser at 1440/1024/820/390 px (chrome-headless-shell + CDP, `getImageData`), not at the source text.
- **The design system moved to the measured ladder, and the scene files followed.** Tokens were pulled to the released surface (`index.css` at `f07002e`), the four archive inks and the sealing wax are one step deeper, and `scripts/design-wache.mjs` grew a `szenen` section that compares the drawing scenes against `index.css` themselves — **42/50 token values equal, 4 radii by the ×2 rule, 4 scene-owned roles, 0 real deviations, 266 measurements, exit 0**. That guard is what caught a film painting its nodes from `DEFAULT_TYPE_COLORS`, a symbol that no longer exists anywhere in `src/`: the delivered pieces showed a disc colour no customer sees (`#56749a` where the app draws `#2d4964`), and the scene now reads `--type-*-hex`.

### Added
- **A disk guard that refuses to start, in both repos, byte-identical.** The machine ran at 99 % with 3,61 Gi free while a suite was writing, and Docker answered „no space left on device". `scripts/platten-wache.mjs` now measures free space **per path** (never per device, so `/` sitting on a full volume cannot mask a spare one), knows two stages — `--leicht` at 2 Gi, `--schwer` at 8 Gi — and exits **75** with the measured value, the threshold and the path it checked. An unreadable number means „kein Lauf", not „durchgelassen": the first cut read `df -k`, got `null` because macOS wraps a long device line, and let everything through. `scripts/ruhe-sonde.mjs` is its twin for CPU: median, max/median ratio and foreign core load, and a measurement taken under load is refused as a publication. Both are guarded by their own tests (`tests/platten-wache.test.ts`, `tests/ruhe-sonde.test.ts`).
- **The app icon set and the mark.** `build/icon.icns` plus the ten `icon.iconset` tiles, `build/icon.svg`, and `public/kepta-logo.svg` wired as the window `icon` in `index.html`; `tests/components/KeptaMark.test.tsx` holds the mark to its shape. The same file briefly also carried `apple-touch-icon` pointing at that SVG — withdrawn before release, because iOS ignores an SVG in that slot and the Electron shell never reads the field. A real 180 px home-screen package would have been the one reason to rebuild the shipped `app-3.2.0`, and it was not worth the claim: the field is gone rather than the picture invented.

### Fixed
- **The four truncated terminal tools now say so.** Suite, corpus counter, help and one more reported a cut list as if it were the whole one; they answer `begrenzt` with the number left behind. Found by measuring the output width, not by reading the code.

### Changed
- **The engine pin follows npm.** The core repo published `kepta-mcp@3.2.0` on 09.10.2026 (run `37921066342`, tag `v3.2.0` = commit `6fe7955`, provenance on, MCP registry answered „Registry-Eintrag aktualisiert"), so `server.json` and the constant in `tests/mcp-registry.test.ts` now name **3.2.0** instead of 3.1.2 — the file tells a buyer which `npx kepta-mcp@…` really exists, and it may not promise one that was never published. `SECURITY-ENTERPRISE.md` also stopped naming the app as 3.1.2. The app itself and its own npm bundle travel together, and this release moves them to **3.2.0**.
- **The test-count guards were rebuilt on the core's one source, byte-identically.** This repository's `scripts/doku-check.mjs` read whatever `test-results/vitest.json` the last `npm run test:cov` had left behind, and on 10.10. it printed "1967 Tests gelaufen, die READMEs nennen eine passende Zahl" for a report from 09.10. that knew 118 of the 131 test files then on disk, with 22 of them changed since — a guard that could not check anything and reported success. Plain `npm test` never wrote a report and never called the script, so the README was held to a source that only existed after a coverage run. `scripts/test-bericht.mjs` (same bytes in `kepta-core`) now decides what the number means: the cases a run executed, skipped ones not counted, and it refuses with a reason when the report is missing, older than the newest test file, or from a partial run. `npm test` and `npm run test:cov` both write that report and end with `node scripts/doku-check.mjs`, which additionally refuses a red run. `tests/doku-zahlen.test.ts` listens to the same module and compares exactly; the static `it(`/`test(` count survives as a floor against invented numbers, with the reason in the file (`it.each(regeln)` counts as one and runs as many, `it.skip` is invisible there while vitest lists it). Measured on this release: **142 files / 2 243 executed cases**, lint 0 errors, 50 warnings (12.10.2026 01:20, `npm run test:cov`, two runs — the first measures, the second is judged). An earlier draft of this sentence named **2 241** at 23:09 — that was the stand one run before the release, not the stand that shipped, and the release body and the README both say 2 243. A test cannot read the report of its own run, so the first `npm test` after a checkout or a suite change is the measurement and the second is the check. **CI keeps that order now:** `build.yml` gained a `Messvorlauf` step (`npm test || true`, `timeout-minutes: 8`, verdict discarded) before the `test:cov` gate, with the reason above it. The timeout question was answered by measurement, not guess, and the two durations and the core count that stood here on 12.10 are withdrawn again: their only carrier was the reporter folder, which `.gitignore` keeps out of the repository and a fresh checkout therefore does not hold, so nobody but the desk that ran them can open them — and a figure nobody can open is not a measurement, which is the rule `scripts/zahlen-belege.mjs` now applies to every other number in this file. What stays is the decision, and it is a bar in a config file rather than a figure from a log: `timeout-minutes` 8 for the measuring pre-run and 12 for the gate, both readable in `.github/workflows/build.yml`, set against the four cores of `ubuntu-latest` from a solo desk run on this machine and left alone since because the gate has never come near them. **The badge is guarded too:** `testbehauptungen()` names kind and line for every count claim (`README.md:7 Abzeichen: nennt 2164 Tests, gelaufen sind 2163`), and `dokuVergleich()` demands a measurement date beside the number — the README says `measured 2026-10-10`, and a stamp from another run fails the check.

### Removed
- **Pro is gone from the key tooling as well** (Damian, 9.10.2026: „Pro gibt es nicht mehr nirgends"). `src/core/lizenz.ts` no longer carries a single-user plan: what can be issued is `business` or `enterprise`, and `EDITIONS_LABEL` names both **K3PTA Enterprise** — the product name never appears beside the dead tier again. `signiere()` now requires the plan instead of defaulting to it, so no call site can quietly issue what nobody sells.
- **The studio's plan picker lost the old tier and its prices.** `tools/license-studio/index.html` offers the two shapes of a K3PTA Enterprise agreement (team with seats, organization by agreement); `main.ts` maps anything unknown to `enterprise` rather than to the plan that no longer exists; `build.mjs` describes the app as issuing K3PTA Enterprise keys.

### Changed
- **A key from before the change still verifies — and is no longer called by the dead name.** The plan byte is part of the signed text, so `1` (and the older 68-byte key without a byte at all) is read as `edition: "alt"`, its signature still checked against the name the plan carried. Displayed, labelled and mailed it is K3PTA Enterprise, with the studio noting „frühere Einzel-Lizenz". Issuing `alt` is refused.
- **The ledger keeps its old entries.** `licenses.json` on this machine holds seven keys, two of them from before the change; reading a stored `edition: "pro"` now migrates it to `"alt"` instead of dropping the row. (The first cut of this migration dropped exactly the entries it had just migrated — caught by `tests/kein-pro-tier.test.ts`, which round-trips the file.)
- **The customer message describes the app that exists.** Since 3.1.5 there is no key field to type into, so the message no longer walks the buyer through activating: it names the contract (name, number, seats where agreed), says K3PTA runs every tool unlimited, and keeps the offline promise. Same for the worker's mail and the CLI's closing line.
- **`scripts/generate-license.mjs`:** `--edition business|enterprise`, default `enterprise`, and a request for the old tier is refused before anything is signed. The key it prints is verified by the same code the studio uses (`tests/kein-pro-tier.test.ts` runs the script and checks the answer).
- **`tools/lizenz-worker`:** only the team price-id issues a key. Any other price returns `ignoriert` with no key and no mail — the old fallback minted a single-user key for whatever the checkout threw at it. `CHECKLISTE.md` is marked as parked, names the two Paddle prices as dead and asks for them to be archived, because a live price that issues nothing would still charge.
- Measured on this commit: **118 files / 1967 tests** green, lint 0 errors. No runtime path of the app changed — the app files touched here are comments — so there is no new build and no new release.

### Added
- **Two guards.** `tests/kein-pro-tier.test.ts` (13 cases): the issuable plans, the legacy keys, the ledger migration, the customer message, the CLI, and a text scan over `src/`, `server/`, `scripts/`, `tools/`, `tests/` and the root docs that fails any file naming the dead tier as a product (dated records — `CHANGELOG.md`, `docs/` — are annotated, not rewritten). `tests/lizenz-worker.test.ts` (3 cases): the worker had no test at all; it now signs a real key through the same verification the app's module performs, refuses an unknown price and rejects a bad Paddle signature.

## [3.1.5] — 2026-10-09

### Removed
- **The key system and every usage limit are gone.** Damian, 9.10.2026: „bei K3PTA gibt es kein Licence Key gar nix … diese Version soll man unbegrenzt nutzen können." Concretely: `server/helfer/freemium.ts` (13 daily-limit rules answering 429 with an upgrade path, `X-KEPTA-Plan`, `X-KEPTA-Remaining`), `server/helfer/probetag.ts` and `server/helfer/planzustand.ts` (the sealed 24-hour first day, the persistent counters, the keychain and hidden-file anchors), `server/router/license.ts` (`GET`/`POST /api/license`, the licensee line in Settings, `licensePreProvisioned` in `/api/policies`), and `src/components/ProUpgrade.tsx` with the sidebar footer that read „Unlimited day · 3 h left" / „A key removes the limits" and the Dashboard toast that announced the day was over. Nothing in the app counts, meters or advertises now, and the MDM schema ignores a `license_name`/`license_key` left in an existing organization file (measured: `tests/richtlinien.test.ts`).
- **What did NOT go, because it was protection rather than payment:** loopback-only binding, Helmet, the 1 MB body cap, the write throttle of 60/min and the chat throttle of 20/min, the 5 000-node cap, the privacy shield, the managed policies (cloud chat off / scan off / shield forced on) and the recovery key with its three doorkeepers. `/api/recovery-key` moved to its own router so the route that carried it could go; it still answers 403 to a request that is not the window, and 404 when nothing is encrypted (`tests/keine-grenzen.test.ts`, `tests/server.test.ts`).

### Changed
- **Team memory is switched on by the organization's roles file, not by a plan.** The scopes and their roles were gated on a business/enterprise edition; with no keys in the app that gate would have locked a working feature forever — a downgrade, which is exactly what this product is not allowed to do. `teamPolicy()` now keys off `managed-settings.json` alone: file present → admins/members write `team:*`, viewers read; no file → `team:*` stays shut and `/api/team` answers `team: null`. The sidebar shows the Team entry only when a file exists, and the view says so plainly instead of offering a purchase.
- **Two operator tools keep the key machinery, detached from the app.** `src/core/lizenz.ts`, `src/core/schluessel.ts`, the revocation list, `tools/license-studio`, `tools/lizenz-worker` and `scripts/generate-license.mjs` stay where they are — they belong to K3PTA Enterprise, where keys are issued personally. No runtime path in the app reaches them any more; the module's own header now says that instead of describing Freemium.
- **The install check and the screenshot run stopped asking for a key.** `scripts/install-app.mjs` step 7 verifies `/api/health` and compares the running version with the build; `scripts/screenshots.mjs` no longer mints a demo key before shooting.

### Notes
- Measured on this commit: **116 files / 1952 tests** green (43 cases that pinned the limits, the trial day and the upgrade panel were deleted with the behaviour, eight new cases pin the opposite), lint 0 errors, HTTP routes 59 → 58.
- Existing installs lose nothing: the old counter fields (`plan_zustand`, `probetag_*`, `license_*`) stay in the database unread and unwritten, and no user data is deleted by this change.

## [3.1.4] — 2026-10-08

### Security
- **The window can no longer fetch a webfont from a stranger.** The content policy allowed `fonts.googleapis.com` and `fonts.gstatic.com` although the app ships no webfont at all — only system fonts through CSS variables. On an app whose promise is that everything happens on this machine, an unused permission is still an open door: one added `<link>` and the first launch pulls type from Google. The hardening test fails if a font host comes back. Measured against this build's own package (`release/mac-arm64/KEPTA.app`, launched with a throwaway data dir): every socket the running app held sat on `127.0.0.1` — fourteen, counting the listener and the renderer's keep-alive connections — and none reached another address; the only peer it contacted was a model server on `127.0.0.1:11434`. An earlier note here said “exactly one socket”, which was a sampling artefact (listeners only). `/api/health` of that same run answers `version: 3.1.4`.

### Changed
- **One listener per app under test, not one per request.** Supertest turns an Express app into a fresh `http.Server` for *every* call, binds an ephemeral port and closes it right after the answer — with 118 workers that is a stream of ports handed to whoever asks next, and the suite has been answering with statuses this app cannot produce (401 where 403 belongs, 404 where 400 belongs, `ETIMEDOUT`, a 200 without the counter header). `tests/setup.horchen.ts` keeps exactly one listener per app for the whole file; `tests/helfer/horchen.test.ts` measures it, and ordinary mock servers stay untouched.
- **Seven scan checks state the status before the body.** One of them read `byFolder.find(…)` out of whatever came back; when the answer was not the expected one, the failure read `Cannot read properties of undefined (reading 'find')` and said nothing about what had actually been sent. Each site now asserts the status first and prints the answer text beside it.
- **The README no longer sells a tier that is gone.** It offered „K3PTA Pro“, a free „Pro day“ and „Buying Pro“ — what exists is K3PTA Core (free) and K3PTA Enterprise (by agreement, the key issued personally). The licensing section says that now, and a docs test fails on any dead-tier wording.
- **The test canvas stopped lying about text width.** The jsdom stand-in measured every string at a fixed 6 px per character, whatever `ctx.font` said. The graph shrinks its labels with the zoom, so labels were up to four times too wide in tests and pushed neighbours out of slots the browser would have kept. It now measures with the font that is set (0.5 × size per character, 12 px as the default), which is exactly the size the label tests were calibrated at — all 154 graph render checks still pass, and `tests/helfer/canvas.test.ts` pins the proportionality.
- **The suite stopped sharing sockets it had no right to reuse.** Node keeps the global HTTP agent on `keepAlive: true`, and `request(app)` binds a fresh ephemeral port for every call, releasing it again straight after the answer. Under 117 workers that is a stream of ports handed to whoever asks next, and the answers that came back were not the ones this app can produce: 401 where 403 belongs, 404 where 400 belongs, `ETIMEDOUT`, and a 200 without the counter header the middleware always sets. `tests/setup.http.ts` turns reuse off. Measured: without this line a four-file harness failed in 2 of 6 runs and the full suite in 2 of 3; with it (and only once it actually took effect — the first attempt set `options.keepAlive`, which the agent ignores) the last four full runs were green, 117 files / 1979 tests, as is the CI runner. The durable guard is still the rule the enterprise suite enforces: never `request(app)`, always a server that listens once per file.
- **A speed promise that survives a busy machine.** The edge-hit check demanded “one pointer move over 12 000 links in under 4 ms“ from a single 20-move average; it fell at 5.85 ms in a parallel run while nothing about the search had changed. It now takes the median of three 60-move series and prints all three.
- **Built is not shipped.** The README named Windows and Linux paths in the policy reader and the key-storage paragraph without saying the app leaves only for macOS. Both sentences now carry the shipping state, and the platform test fails any Windows/Linux claim that does not.
- **The README stops promising installers that are not shipped.** The download table offered Windows files (`K3PTA-<version>-win.exe`, "take this one if unsure") and a Windows first-launch guide, while every published release carries macOS only. The table now says which platforms actually get an app, keeps the self-build route for Windows and Linux as a source build, and a test (`tests/doku-plattform.test.ts`) fails if a published-installer claim comes back.

### Fixed
- **The version bump had corrupted two dependencies in the lockfile.** Counting 3.1.2 → 3.1.3 replaced the string wherever it stood, so `bytes` and `@jridgewell/resolve-uri` ended up on versions that the public registry has never published; a clean `npm ci` (the CI's first step) died with `notarget`. Both entries now name the real published version, and `scripts/pruefe-lock.mjs` — run by `npm test` before the suite — reports every dependency whose lockfile version differs from what is installed.
- **Two outward texts sent people to a repository that answers 404.** The README's download link and the key-mail template in both license tools pointed at `DamianTodorovic/kepta-pro-releases` — not public (measured anonymously: HTTP 404), named after a tier that no longer exists, and the mail line promised “macOS/Windows/Linux” packages while only macOS ships. All three now name the engine repository's releases, and `tests/doku-plattform.test.ts` fails on any download link that points elsewhere, including in the tools.
- **The “run it from source” block cloned the wrong product.** In the desktop app's README it told people to `git clone DamianTodorovic/kepta-enterprise` — that is the tenant server, a different repository and a different product — and then offered `npm run dev` / `npm run electron` as if they were optional halves of another app. It clones this repository now and names the one command that starts both halves (`npm run app`). The sentence above the download table also promised “the file for your system … explained per system”, while one system gets a file; it says macOS now. `tests/doku-plattform.test.ts` fails on either wording.
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
- **Provenance colour.** Written in K3PTA, from a file, from this computer — a second colour channel that switches itself off, with the reason, when the base has nothing to distinguish.
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
- **The real K3PTA mark as app icon** — `build/icon.icns` built from the KeptaMark geometry on the Big Sur grid, replacing the generic electron.icns.

### Fixed
- **`since=0` is the time machine's "everything" window.** The briefing route no longer drops an explicit 0 onto the 24-hour default.
- **The app's own coverage gate was red since 3.1.1.** `src/core/**` demands 100 % function coverage, and the core lift left four functions never executed: `aktiviereSuchCacheDelta` (called only from the bootstrap, which tests do not run), the unsubscribe closure of `onMemorieAenderung`, and `VerschlussteAuditDatei.flush()` together with its swallowed-error branch. Three tests cover them now, and the audit-file test awaits `flush()` instead of sleeping 120 ms and hoping. The run: 1,629 tests over 105 files, `npm run test:cov` green including `doku-check`.
- **The documentation said things the repository does not support.** Each of these was a claim the repository itself contradicted, and each is its own line now — one line, one claim, one proof. (Getrennt am 13.10., weil die Zahlen-Wache einen Dateinamen aus dem ersten Teilsatz als Beleg fuer Prozentzahlen im letzten las.)
  - The npm package inside this repo still claimed MIT while the core is BUSL-1.1 (package, `npm/LICENSE`, `npm/README.md` and the test that pins them moved together)
  - the app's `LICENSE` was titled "K3PTA Enterprise" and pointed at an AGPL core
  - the download and CI badges named `kepta-pro-releases` and `kepta-enterprise`, neither of which exists on GitHub (both 404) — they now name the public core repository, which is where the DMGs and the working CI actually are
  - the security document still called `profile.json`, `scan-config.json` and the journals plaintext although they have carried the database key since 2.13.4
  - and the LongMemEval runner README (`tools/longmemeval/README.md`, die Serie in ihren eigenen Worten — ein Papier dieses Repos, kein Maschinenlauf) stopped at 37,0 % (25.9.) although the 1.10. series reached 61,5 % — it now carries the whole series, the judge A/B (+11,7 pp with the engine untouched), the strict-binary 40,4 % reading and the in-sample caveat
  - `aktiviereSuchCacheDelta`, the tier-free sidebar branding and the license number's disappearance from the UI are checked against the code, not remembered

## [3.1.1] — 2026-10-01

### Changed
- **The app runs on the open core 3.1.1** (build package 1 of the app master plan). `src/core/**` was lifted from kepta-core 3.1.1: search cache keyed on a trigger-fed data generation with delta maintenance (`aktiviereSuchCacheDelta` wired at bootstrap), AND-first FTS, engine/library exports — the engine is identical with the core repository (~/kepta-core, no local forks).
- **Branding is simply K3PTA.** The "K3PTA Pro" claims ("Licensed to …", upgrade banners, Pro pricing) left the UI; the license mechanism itself stays untouched.
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
- **The sidebar no longer shows the version (Damian, 25.9.).** The card names the tier only — K3PTA Core / K3PTA Pro / K3PTA Enterprise — without the number; the version stays available in the system status and over /api/health. Reverses the sidebar part of 2.13.10.

## [2.13.10] — 2026-09-25

### Changed
- **The app shows its version.** The sidebar names the tier with the version (K3PTA Core 2.13.10), and the system status lists it as the first row — previously the number existed only over MCP and /api/health.

## [2.13.9] — 2026-09-24

### Changed
- **Tier naming (Damian, 24.9.): the unlicensed app is K3PTA Core** — the Pro day (24 h, every tool open) belongs to Core; **KEPTA Pro is the license key** that removes the daily limits. The sidebar shows KEPTA Core / KEPTA Pro accordingly. Same binary, one download.

## [2.13.8] — 2026-09-23

### Fixed
- **The Buy button never leads into the void.** Until Paddle goes live the
  upgrade URL falls back to `kepta.pro/upgrade`, which does not exist yet —
  a fresh user clicking "Buy K3PTA Pro" landed on a dead address. The API
  now reports `checkoutLive` (true only when `KEPTA_UPGRADE_URL` is set),
  and the upgrade panel renders accordingly: with a live checkout the real
  buy button; without it, "Get K3PTA Pro — write to Damian on LinkedIn".
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
- Internally labelled "business" editions now display as **K3PTA Enterprise**
  everywhere (sidebar, team view, settings, upgrade panel) — the public tier
  named Business no longer exists.

## [2.13.2] — 2026-09-17

### Security
- **K3PTA answers this computer only.** The app's HTTP server now refuses
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
- Messages about features that need a license now name **K3PTA Pro**.

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
- **Licenses know their tier.** A key now says whether it is for K3PTA Pro
  (personal), K3PTA Business (with its number of seats) or K3PTA Enterprise,
  and the sidebar shows the tier. Every tier unlocks the same app. Keys issued
  before stay valid and count as Pro. The lock screen now simply says
  *Activate K3PTA*. The tier shown updates when the window regains focus.
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
- **Connect your AI apps in one click.** K3PTA finds Claude Desktop, Claude
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
  listed in the app; from the next update on, its key no longer unlocks K3PTA,
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
  only when K3PTA has the file to itself. It copies the file, encrypts the copy,
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
  Without a valid key, what only K3PTA Enterprise can do — chat, model
  discovery, the clipper, opening files, the machine scan and the profile —
  answers 403. Everything the open core can do stays free: notes, search,
  import, sync, export, MCP and the recovery key.
- **Agents connect without Node.js.** *Settings → MCP / API* now offers the
  MCP server that ships inside the app, started by K3PTA itself — no Node.js,
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
- **SQLite engine:** `node:sqlite` could not open an encrypted file, so K3PTA
  now uses `better-sqlite3-multiple-ciphers` (pinned to 12.11.1). The npm
  package `kepta-mcp` has exactly this one dependency; npm installs it
  prebuilt for Node 22, 24 and 26 on macOS, Windows and Linux.
- **A start that fails says why.** If the server cannot start — for instance
  because the key in the keychain does not belong to the database — the window
  shows the reason at once instead of waiting 30 seconds. The error page used
  to be cut off at the first `#` in its own markup; it is encoded now.

### Removed
- **The German interface switch** from 2.10 (*Settings → Display*). K3PTA's
  interface is English; the text size setting stays. German notes and German
  queries keep working — the stopword list is still bilingual.

### Upgrade notes
- **Quit every agent that uses K3PTA over MCP before the first start of 2.11**
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
- `.env.example` said `cp .env.example .env`. K3PTA never read a `.env` file —
  the `dotenv` above was never imported. It now says to set the variables in the
  environment.
- The release notes suggested `node /PATH/kepta/dist/mcp-server.cjs`; they now
  show `npx -y kepta-mcp`, like the README.
- Both READMEs describe the 2.10 features, list all 41 HTTP routes (the English
  table was missing five, the German one eight) and name the real test count and
  the real size of the npm bundle — 81 kB, not 74.
- The Enterprise section described features as "being worked on" for a
  commercial edition that already ship here — Praxis-Sync with its
  tamper-evident ledger among them. K3PTA Enterprise is going to be a product of
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
- **Scan this computer (opt-in).** K3PTA can go through the documents in your home
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
- **K3PTA blamed an agent for its own writes.** The database watcher cannot see
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
  *Annotation 11.10.2026, R1: the sentence above (“3 000 nodes, 9 500 edges,
  60 fps”) was never reproducible from this repository — no runner existed. It is
  now, and it does not hold: measured at 3 000 notes the frame costs 30.4 ms with
  547 intersecting disc pairs. See `docs/graph-kosten.md:65-67` and
  `scripts/fps-laeufer.mjs`. The README lines that carried this number have been
  rewritten to the measurement; this entry is left as written, because it is the
  historical source of the claim.*
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
  K3PTA bug: cosine is normalised, vectors are unit length, dimensions and model
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

  That is worse than unsigned. macOS then tends to report "K3PTA is damaged and
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
- **Claude Desktop could not start K3PTA at all.** The client asked for an older
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
- **K3PTA is listed in the official MCP registry** as
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
  learnable, K3PTA shows a one-off hint — with a button that turns the feature on right
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
- **Platform in the filename:** the scheme is now `K3PTA-<version>-<platform>-<arch>.<ext>`. Without the platform, `K3PTA-<version>-x64.zip` from macOS and from Windows would have been identically named and would have **overwritten each other** in the release — found while adding the Windows job, before it hit anyone.
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
- **Architecture in the filename:** electron-builder only appends it for arm64 by default — the Intel build would have been plain `KEPTA-2.3.0.dmg` and indistinguishable. `artifactName` now enforces `K3PTA-<version>-<arch>.<ext>` for every package.

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

The SOTA release: K3PTA goes from a note store to a full agent memory.

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
