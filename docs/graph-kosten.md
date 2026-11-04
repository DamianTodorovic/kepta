# Graph cost at 3 000 notes (GF) — what the frame budget actually holds

As of 11 October 2026, measured on 3.1.5 (working tree, commit `f07002e` + the wave's uncommitted work) · Evidence: `scripts/fps-laeufer.mjs` · Measurement: `node scripts/fps-laeufer.mjs --knoten 3000 --sekunden 8`

## The question

`README.md:37` and `README.md:143` sell the Force layout with one number and one
absolute: *"verified at 3 000 nodes and 9 500 edges at 60 fps"* and *"nodes repel
each other, never overlap"*. R1 re-read the trail on 11 October: the only source
for both was a changelog line (`CHANGELOG.md:931`, "Measured afterwards: 3 000
nodes, 9 500 edges, 60 fps"). No runner in `scripts/` could reproduce it. This
document is that runner's reading, and it is the reason the sentence in the
README has to change.

House rule, the same one that settled the graph-cost case: either the limit is
held by measurement, or the promise stands measured and cited in test and doc.
There is no third option.

## What is measured, and what is not

Headless Chrome has no vsync, so a raw "fps" read there is a property of the
harness, not of the app. "60 fps" means one thing that is measurable anywhere:
**a frame has to be finished in 16.67 ms.** So the runner measures the work, not
the refresh — the duration of every `requestAnimationFrame` callback (physics
plus drawing, everything the area does in a frame), captured by wrapping the
callback in the page itself.

Three phases, each over its own frames:

| Phase | what happens |
|---|---|
| `einschwingen` | the layout is settling — physics and paint together, the worst honest case |
| `ruheNachFit` | after the view rests — the area paints nothing, and 0 ms is the correct answer |
| `knotenZiehen` | a node is grabbed with a real pointer and dragged — the simulation reheats |

Overlap is counted **in world units**, which is the same arithmetic the area's
own collision pass does and which does not depend on how far someone is zoomed:
two discs intersect when the distance between their centres is less than
`r1 + r2`. The discs are read off the drawing itself (`arc`, `fillRect`,
`drawImage` on the graph canvas); a ring around a node is always larger than the
node, so the smallest circle at a centre is the node.

Two guards are part of the number, not comments next to it:

- **The machine has to be quiet.** The runner throws `scripts/ruhe-sonde.mjs`
  before it starts and again after it has released its own browser and server —
  measuring the quiet before the cleanup would only hear itself. A reading above
  the limits (`max/median 1.8`, `5 node processes`, `median 20 ms`) refuses the
  verdict with exit code 3.
- **A phase that did no work is not a green phase.** The drag phase counts the
  frames that actually painted; the first version of this runner reported
  "0 ms median" for a drag that had missed its node, which looked like a
  result and was nothing.

## The reading before the fix — four passes a frame (11 October, 14:17–14:20)

Run 11 October 2026, 14:17–14:20 local, same build, same machine (10 cores),
each size seeded fresh through the app's own import route at
`/tmp/kepta-fps`, own server port 3541, own CDP 3741, own HOME and data dir.
The note, concept and link counts below are **the area's own legend**, not a
count of the generator's text.

| base | links (per the area) | work per frame, settling | over 16.67 ms | frame interval | work per frame, dragging | discs intersecting |
|---|---|---|---|---|---|---|
| 400 notes · 27 concepts | 1 262 | median **4.5 ms**, p95 5.1, max 7.4 | 0 of 238 | 16.7 ms | 3.7 ms | **0 of 427** |
| 1 500 notes · 27 concepts | 4 795 | median **15.5 ms**, p95 17.2, max 22.2 | 31 of 314 (10 %) | 17.2 ms | 15.8 ms | **12 of 1 527** |
| 3 000 notes · 27 concepts | 9 475 | median **30.4 ms**, p95 32.9, max 37.6 | 250 of 253 (99 %) | 32 ms | 22.6 ms | **547 of 3 027**, deepest cut 21 world units |

The 1 500 and 3 000 runs passed the quiet guard on both readings (max/median
1.62 and 1.76). The 400 run's closing reading was 1.99 — one outlier above the
limit — which does not change its result: 4.5 ms is a third of the budget, and
the guard's own noise band is a few milliseconds.

## The reading after the fix — `COLLIDE_ITERATIONEN` 4 → 8 (11 October, 18:16–18:20)

The lead decided on the recalibrating stage (8 passes a frame) with the numbers
above: what we want to claim outward is "holds them apart", and that only holds
if it holds at rest. Same runner, same corpus, same machine, quiet at the start
of each run.

| base | links | work per frame, settling | over 16.67 ms | dragging | discs intersecting, mid-cooling | discs intersecting, **at rest** |
|---|---|---|---|---|---|---|
| 400 notes | 1 262 | median **4.8 ms**, p95 5.5 | 1 of 322 | 3.9 ms | **0 of 427** | **0** |
| 1 500 notes | 4 795 | median **17.5 ms**, p95 19.9, max 27 | 234 of 315 | 17.8 ms | **0 of 1 527** | **0** |
| 3 000 notes | 9 475 | median **33.6 ms**, p95 36.6, max 42.5 | 225 of 230 | 33.6 ms | **11 of 3 027**, deepest cut 5 | **0** |

The resting counts come from the unit test (`tests/lib/graphLayout.test.ts`, no
browser, no raster, brute force over every pair) and are asserted there: 0 pairs
at 400, at 1 500 and at 3 000, and the cooling funnel is pinned at its two
moments — **15 pairs at step 250, 0 by step 310** at 3 000 notes. The full trace
of that field, measured: step 30 → 3 328 pairs, 60 → 1 517, 120 → 1 267,
250 → 15, 310 → 0.

**What the fix costs, stated plainly.** The physics got ~2 ms dearer a frame at
every size (4.5 → 4.8 at 400, 15.5 → 17.5 at 1 500, 30.4 → 33.6 at 3 000). At
1 500 notes that crosses the line: 15.5 ms sat inside the budget, 17.5 ms does
not (234 of 315 painted frames over). The separation was bought partly with the
frame budget of a middle-sized base — the honest ceiling for "60 fps" is now
**~400 notes**, and 1 500 runs at about 55-57 fps while it cools.

## Third reading — R1's own re-run at the 8-pass stand (11 October, 18:35–18:45): refused by its own quiet gate

R1 re-ran all three sizes on this tree (`node scripts/fps-laeufer.mjs --knoten {400,1500,3000}
--sekunden 8`, own bundle, own ports, machine quiet at the start of each run: 4–5 node processes,
load1/cpu 0.28–0.32 on 10 cores).

| base | work per frame, settling | over 16.67 ms | frame interval | dragging | at rest |
|---|---|---|---|---|---|
| 400 | median 4.5 ms, p95 5.3, max 10.6 | 0 of 313 | 16.7 ms | 3.8 ms | 0.1 ms |
| 1 500 | median **16.5 ms**, p95 18.4, max 20.7 | **140 of 315** | 17.8 ms | 12.2 ms | 0.1 ms |
| 3 000 | median **32.4 ms**, p95 35.8, max 43.9 | 233 of 236 | 34 ms | 33.3 ms | 0.1 ms |

**These numbers are not publishable, and the runner said so.** After every run the harness re-probed
the machine and each time returned `nachher: … max/median 1.8x — NICHT RUHIG, Zahl nicht
veröffentlichen`. The start was quiet; the machine was not quiet any more when the measurement
ended. The rule that refuses the number is the reason the number is worth anything, so it stands
here as a refused reading and nowhere in the README.

What it still settles: it corroborates the direction of the 8-pass fix within about one millisecond
per frame (4.5 against 4.8, 16.5 against 17.5, 32.4 against 33.6) and it confirms the important
consequence independently — **1 500 notes is outside the 16.67 ms budget while it cools** (140 of
315 painted frames over). The README lines that sold a millisecond figure therefore do not carry one
anymore: they carry what a test asserts without a machine (`tests/lib/graphLayout.test.ts:2285`) and
point here for timing.


## What this says about the two claims

**"3 000 nodes and 9 500 edges at 60 fps" does not hold — and did not hold
before the fix either.** At 3 000 notes and 9 475 links the area needs 33.6 ms of
work per settling frame (30.4 ms before): the budget is exceeded in 225 of 230
painted frames, the interval is 35.3 ms (≈ 28 fps). Off by a factor of two,
software raster — a floor, not a ceiling.

**"never overlap" now holds where the promise points: at rest.** Zero
intersecting pairs at 400, 1 500 and 3 000 notes, measured in the unit test and
asserted there. What remains is the cooling window, and it is small and closing:
11 pairs of 3 027 in the browser mid-cooling at 3 000 notes (547 before the fix,
12 at 1 500 before, 0 now), deepest cut 5 world units, and the field is clean by
step 310 — before the layout comes to rest, so no picture a person keeps looking
at shows it.

**When the count was taken matters.** At 3 000 notes the area needs ~34 ms a
frame, so the runner's eight-second window covers roughly 230 simulation steps —
the layout is still cooling, not resting. That is why the browser counts 11 and
the resting field counts 0, and why every number in this document names its
moment.

The cause was measured, not guessed: one additional collision pass over the
resting field performed 7 942 corrections, so the cell grid is not blind to
neighbouring cells. What was missing is passes — four per frame do not converge a
clique of ~111 notes on one hub. Eight do, and the change moves the resting
layout of every base: that is the lead's call, and it was made.

**What holds now, and is worth selling:** at rest no two node discs overlap —
0 intersecting pairs at 400, at 1 500 and at 3 000 notes, asserted in the unit
test. 60 fps holds up to about 400 notes (4.8 ms of work a frame, 1 of 322
painted frames over budget); 1 500 notes cool at ~17.5 ms a frame, which is
55-57 fps, not 60; 3 000 notes are a moving picture at ~28 fps while they
settle, and paint nothing at all once they rest.

The sentence this evidence supports is R1's to write, and as of 11 October 19:12 it is this: the
force layout keeps 60 fps up to **about 400 notes** (4.8 ms of work a frame, 1 of 322 painted frames
over budget), **1 500 notes sit outside the 16.67 ms budget while they cool** (17.5 ms a frame, 234
of 315 frames over — R1's refused re-run reads the same direction at 16.5 ms, 140 of 315), and **at
rest no two discs intersect at 400, at 1 500 or at 3 000 notes** (`tests/lib/graphLayout.test.ts:2285`).
An earlier shape of this sentence, written before the 8-pass table above landed, said “60 fps to
roughly fifteen hundred notes”; that is superseded by the numbers it sits next to, and the README
carries neither claim as a millisecond — it carries the test.

## Limits of this measurement

- Software rasterisation (`--disable-gpu`). The measured work is the
  JavaScript and the canvas commands issued per frame; the pixels are rasterised
  without a GPU. The GPU path can only add work, not remove it, so 30.4 ms is a
  floor for the 3 000-note case, not a ceiling.
- One machine, one desktop (10 cores, macOS 25.6). A weaker machine will read
  worse; nobody should quote this as a lower bound for hardware that was not
  measured.
- The corpus is the deterministic four-field generator inside the runner
  (three mentions per note, every sixth a fourth — which is what lands near the
  claimed 9 500 edges at 3 000 notes). A real base with longer titles and more
  concepts per note costs at least as much, not less.
- 60 Hz is the budget assumed here. A 120 Hz display would halve it.

## Reproduce

```
node scripts/fps-laeufer.mjs --knoten 3000 --sekunden 8
node scripts/fps-laeufer.mjs --knoten 1500 --sekunden 6
node scripts/fps-laeufer.mjs --knoten 400  --sekunden 4
node scripts/fps-laeufer.mjs --knoten 3000 --json   # Rohdaten
```

Exit code 3 means the machine was not quiet and no number was printed. Exit code
75 means the disk guard refused the start — that check is the house's central
one, `scripts/platten-wache.mjs` (identical in the app and the core tree), run at
the **light** stage (2 GiB), not the heavy one: a full 3 000-note run of this
runner writes bundle, browser profile and database, measured at 0.115 GiB. The
guard reads the repo *and* `/tmp` and prints the value with the path it checked;
an unreadable number is not a green light.

The runner builds its own bundle under `/tmp/kepta-fps/bundle` and never touches
`dist/`. At the end it removes its own browser profile and data directory
(~110 MB a run); `--behalten` leaves them for inspection, and the bundle stays
either way because it is the reuse.

The overlap claim has a second, browser-free reading — the same field solved to
rest in a unit test, with the pair count taken by brute force:

```
npx vitest run tests/lib/graphLayout.test.ts -t "never overlap"
```

Two of its cases are marked `it.fails` on purpose: they hold the defect open
with its measured number (4 pairs at rest, 390 at step 250) and turn red the day
someone changes the constant, forcing the decision instead of letting it rot in
a comment.

## The sales line, as of 11 October 18:52 — where the ceiling actually is

**Claimed ceiling now: about 400 notes at 60 fps.** 1 500 notes is *outside* the 16.67 ms budget
while the layout cools (E2: 234 of 315 painted frames; R1's refused re-run: 140 of 315), and at rest
no disc pair intersects at 400, 1 500 or 3 000 (`tests/lib/graphLayout.test.ts:2285`). Anything that
sells “inside the budget at 1 500”, or “60 fps at 3 000”, is out of date on this tree.

Places that still say it, on 11 October at 18:52 — file and line, no judgement here:

| wo | Zeile |
|---|---|
| `docs/graph-kosten.md` (this file, its own verdict section) | 163 |
| `CHANGELOG.md` (historical source, annotated 11.10., not rewritten) | 931 |
| `../Desktop/ki gehirn/WHITE-SPACE-ANALYSE-ENTERPRISE-2026-10-01.md` | 111 |
| `../Desktop/ki gehirn/linkedin/LINDENBERG-UND-PROFIL-2026-09-22.md` | 45 |
| `../Desktop/ki gehirn/web-qa/scratch/lat-feldordnung.html` (scratch) | 2820 |
| `../Desktop/ki gehirn/NOTFALL-SICHERUNG-22-9/markdown-export-3644/` — frozen export, ~10 files (`README — 921.md:10`, `README.de — 917.md:10`, `README — 613.md:26`, `K3PTA-FUNKTIONEN — 1229.md:13`, others) | — |

Checked and **clean**: `README.md:37` and `:143` of this repo carry no millisecond claim anymore;
`~/kepta-core/README.md` and `README.de.md` never carried one; the **live** public page
`raw.githubusercontent.com/DamianTodorovic/kepta/main/README.md` (16 138 bytes, fetched 18:5x) has no
“60 fps” and no “never overlap”. A cached copy under `~/.hermes/cache/` still shows the old sentence —
the cache is stale, the page is not.

## The admission gate on a shared machine (12 October, 15:37) — what a verdict is allowed to say

A promised time may only be judged where the machine itself is quiet enough to hold the
promise: since 12 October the core's timed cases run through
`kepta-core/tests/helfer/zeit-zusage.ts`, which refuses a verdict unless the probe's own
throw is **at most half the ordered figure** (15 ms → 7,5 ms, 120 ms → 60 ms), and says so
aloud with both numbers — `kein Urteil — Maschine zu laut fuer diese Zusage`. This is not a
skip: nothing is silenced and no ordered number moved (15, 5, 120, 750 stand where A9 §6 put
them); it is a verdict that only speaks where it can speak. Why it exists, in one measured
line: at 14:49 on this desk the quietness probe reported 11,03 / 10,21 ms and still called
the window *ruhig* (its own ceiling is 20 ms), and the 15 ms case cost 18,9 ms — it fell
through a verdict that could not have been a verdict. The same path cost 10,0 ms in windows
where the probe threw 6,28–6,34 ms. Both directions of the gate are proven on **set**
numbers, not on a loaded run (`kepta-core/tests/helfer/zeit-zusage.test.ts`), because a
measured refusal would itself be a timing under load. One number is deliberately left
outside the gate: the cache-hit promise (5 ms) — measured 0,1 ms at a 6,3 ms baseline and
0,2 ms at a 31,4 ms baseline, so it is invariant to the neighbourhood, and gating it would
only mute a claim that demonstrably holds.

## The same three sizes in the delivered view, on this desk (4 November, 16:12–16:20)

`node scripts/fps-laeufer.mjs` (own ports 3541/3741, own HOME, own profile, own data dir; the
bundle it serves is built from the committed tree, which the window prober had already proved
byte-identical to the installed `app.asar` at 16:01:35 — 5 of 5 artefacts).

| base | discs painted | intersecting pairs | deepest cut | work/frame median | p95 | max | frames over 16.67 ms | frame interval median |
|---|---|---|---|---|---|---|---|---|
| 400 notes | 243 | **0** | 0 | 4.7 ms | 5.4 ms | 10.5 ms | 0 of 275 | 21.5 ms |
| 1 500 notes | 386 | **0** | 0 | 4.9 ms | 9.0 ms | 10.4 ms | 0 of 309 | 16.7 ms |
| 3 000 notes | 707 | **1** | 11 world units | 3.6 ms | 9.6 ms | 13 ms | 0 of 309 | 16.7 ms |

At 3 000 the drag phase (the most expensive path: physics reheats, everything repaints) cost
median 8.5 ms of work per frame with 0 of 98 frames over budget, while the frame *interval*
was 32.2 ms — headless Chrome has no vsync there, so the interval is not a user's rhythm and
only the work figure is read.

**The timing verdict is withheld, by the instrument itself.** Its own machine probe reported
max/median 1.15 before and 2.25 after the 3 000-note run and printed
`NICHT RUHIG, Zahl nicht veröffentlichen`. Three long-running processes that are not mine held
the machine: a `hyperframes preview` up 15 h 42 min, a `playwright-mcp` and a
`chrome-devtools` telemetry watchdog, each around 48 min. None was touched. What is published
here is therefore the **geometry** (pairs, discs, deepest cut) and the work-per-frame as
measured, with the machine state named beside it; no millisecond is claimed as a verdict.

Against the baseline this doc recorded on 11 October in the same browser path — 547 of 3 027
discs intersecting, deepest cut 21 world units — today's 3 000-note field meets **one** pair,
11 units deep. One is not zero, so the README sentence that cites the layout test now also
names the browser number instead of letting the test speak for the product.

Two probe faults surfaced in these runs and are fixed in `scripts/fps-laeufer.mjs`
(commit `23cf484`), both of them the instrument's, not the surface's:

1. The head-row reader matched `(\d+) notes` and read `000` out of the grouped `3,000 notes`,
   printing "0 notes" for a base of 3 000. The surface had been right; the sieve was blind to
   its own house format (#101).
2. The Fit click searched `[title="Fit the whole graph into view"]`. Since 3.2.145 that title
   is a condition, so in exactly the case this run measures the selector found nothing, the
   click was a no-op, and the run reported success. It now grips `data-testid="graph-fit"` and
   prints whether the button was there; the force-view and zoom clicks answer too.

## Nach der Heilung, "am ausgelieferten 3.2.146 gemessen" (19:54 MEZ) — die Ueberschrift ist ueberholt, der Lauf war einer von 3.2.145

**Korrektur 20:52 MEZ, und sie gilt fuer diesen ganzen Abschnitt:** der Sonde ihr Bundle war
gepuffert (`if existsSync server.cjs`), und der gepufferte Bundle stammte von 16:06 MEZ — aus
der Fassung vor dem Nachschlag. Der Lauf von 19:54 MEZ hat also **nicht** die getauschten
3.2.146-Bytes gemessen, sondern dieselben 3.2.145-Bytes wie der Lauf von 19:38 MEZ. Was der
Abschnitt ueber das Bild sagt, gilt damit fuer 3.2.145; was er ueber die Flaeche und ihre
Sonde sagt (Kopfzeile, abgeschnittener Grund, Scheibengeometrie), bleibt gelten, weil es an
denselben Bytes wahr war. Die Heilung ist in diesem Abschnitt **nicht** geprueft worden, und
der Satz "der Nachschlag hat in diesem Lauf nie gebrannt" war eine Deutung von identischen
Bildpunkten, die identische Bytes als Grund hatten.

`node scripts/fps-laeufer.mjs --knoten 3000` gegen den Bund von 16:06 MEZ
(`docs/belege/tag-0411/fps-3000-nach-146.log.txt`):

    Feld steht: ja, nach 1.8 s (693 Scheiben in der letzten Lesung)
    ueberlappung 693 Scheiben, geschnitten: 1 Paar, beruehrend: 1, tiefster Schnitt 5 Einheiten
      Paar bei (2046,150) und (2086,126) — Abstand 47, Radien 26 + 26
    die Flaeche meldet gleichbleibend: 3,000 notes · 0 concepts · 0 links

Der Nachschlag ist gebaut und im Layout-Fall bewiesen (Schritt 308: ein Paar; nach den
Nachlaeufen: null). Im Browser hat er das Paar nicht weggenommen. Zwei Erklaerungen sind
offen und werden nicht geraten: (1) die beiden Laeufe zaehlen **verschiedene Welten** —
19:38 mit sechs Begriffen und 2 379 Kanten, 19:54 ohne Begriff und ohne Kante, und ein Feld
ohne Kanten verankert seine einsigen Knoten, wo die Kollision einem verankerten Paar nicht
ausweichen kann; (2) der Nachschlag koennte in der Flaeche an einer andern Stelle enden als im
Test. Ein dritter Lauf wurde von der Sonde selbst verweigert (`MASCHINE NICHT RUHIG`,
max/median 2.36 ueber ihrer Decke 1,8), und die Verweigerung ist richtig: die Abhol-Runde der
Wache laeuft alle sechs Minuten ueber dieselbe Maschine.

Was der README und diese Datei bis auf weiteres sagen: **ein Paar bei 3 000 Notizen in der
Ruhe, gemessen am ausgelieferten Stueck**, mit dem Befehl und den zwei Laeufen als Zeugen.

## Die zwei Welten waren eine Sonde, und das Paar hat eine Ursache (4.11., 20:09 bis 20:26 MEZ)

**Frage 1 aus dem Abschnitt oben ist gemessen, nicht gedaechtnisst.** Ein neuer Griff ohne
Browser (`Mappe: scripts/graph-begriffskurve.mjs`) startet denselben Build in einer eignen
Kapsel, saet denselben Korpus wie `fps-laeufer.mjs` und fragt die Route selbst
(`docs/belege/tag-0411/begriffskurve-3000-2009.log.txt`, 20:09:12 MEZ):

    Import:  lesen=94.01; einsetzen=393.77; chunksetzen=162.97; begriffekanten=857.71; verknuepfen=490.38; gesamt=2007.35
    +  0 s      46 ms  Begriffsauszug 500  Kantenauszug 2000  ausserhalb 27375  Bestand 3027 Begriffe / 29375 Kanten
    + 24 s      67 ms  Begriffsauszug 500  Kantenauszug 2000  ausserhalb 27375  Bestand 3027 Begriffe / 29375 Kanten
    Abfragen ueber zwei Sekunden: 0 von 7

Begriffe und Kanten entstehen **im Import**, die Tuer antwortet bei null Sekunden in 46 ms,
und der Bestand von 3 027 Begriffen ist dieselbe Zahl, die die Flaeche eine Stunde vorher
nannte. Eine langsame Begriffs-Ebene gibt es nicht.

Was es gibt, ist ein abgeschnittener Satz. Die Sonde las mit einem Muster, das nach der
dritten Zahl endet, und die Flaeche haengt ihren Grund **hinter** die Zahlen. Der volle Kopf
des Laufs von 20:14:55 MEZ (`docs/belege/tag-0411/fps-3000-mit-kopf-und-farbe-2014.log.txt`):

    3,000 notes · 6 concepts of 3,027 in all · 2,379 links — none of these 2,379 lines carries a word you wrote - this is a window, not all of your notes

Ein Lauf, dessen Begriff-Bein nicht ankam, sagt "the entity links did not arrive, so this
picture draws tags and similarity only". Die Sonde zeigte den Anfang und liess das Ende weg —
daraus war "zwei Welten" geworden. Sie druckt jetzt den ganzen Kopf, und ein Feld, das null
Begriffe meldet, **ohne** dass die Flaeche den Grund nennt, bricht den Lauf mit Exit 1 ab:
eine Ueberlappungszahl aus einem Feld, dessen Begriff-Bein nicht entschieden war ist kein Urteil ueber das ausgelieferte
Stueck.

**Frage 2 ist ebenfalls gemessen.** Die Sonde zeichnet zu jeder Scheibe die Farbe mit auf, mit
der sie gemalt wird. Das Paar kam `#acacac` und `#acacac` zurueck — `--type-neutral-hex`, die
Rolle, in der die Flaeche ihre Geruest-Knoten malt (Wurzel, Typ, Entitaet;
`KnowledgeGraph.tsx:4303`), Radius 26 = die Kappe von `knotenRadius`. Begriffe werden mit
`n.r` gemalt (`:4324`), demselben Radius, den die Kollision liest; `pinned` wird auf `false`
geboren (`graphLayout.ts:506`), und in diesem Lauf zog die Sonde keinen Knoten
(`knotenZiehen`: 0 malende Rahmen). Also: echte Simulationsknoten, keine Ringe, keine
Verankerung. Die Erklaerung "(1) verschiedene Welten" aus dem Abschnitt oben ist damit
erledigt, und mit ihr die Hoffnung, dass ein verankertes Paar die Ursache sei.

**Die Ursache ist eine Lesestelle im Quelltext, und ihr Zeuge ist der Quelltext, nicht der
Browser.** 3.2.146 ruestet den Nachschlag an `if (bewegt)` — den Rahmen, in dem die Bewegung
endet. Ein Feld, das ausserhalb des Loops gebaut und fertige uebergeben wird (ein Netznachzug
setzt die Stellen), betrat diesen Zweig nie und stand vom ersten Bild an still. Das ist an den
Zeilen zu lesen und braucht keinen Lauf: die einzige Rueststelle lag im Bewegungszweig. Es ist
dieselbe Falle, vor der A7-09 im gleichen File eine Ebene hoeher warnt — die Zusage haengt am
Ruhe-Ereignis, nicht an der Bewegung — und die Pruefstelle `nachschlagFaellig` ist der Fall
dazu, geschrieben, bevor die Zeile umzog (rot 20:22:09 MEZ, gruen 20:23:24 MEZ).

Was die vier Abendlaeufe ueber das **Bild** behaupten konnten, ist null. Der Bundle der Sonde
war gepuffert und stammte von 16:06 MEZ; 19:38, 19:54, 20:14 und 20:36 MEZ haben
ausschliesslich dieselben 3.2.145-Bytes gemessen. Die Ruhe-Zeit

    ruheNachFit  rame 70 (malende 18)  Arbeit/Bild median 0.1 ms  p95 0.1 ms  max 10.1 ms

ist also die Zeit eines Feldes **ohne** Nachschlag, und das Paar auf denselben Bildpunkten in
zwei "verschiedenen" Fassungen ist kein Beweis dafuer, dass ein Nachschlag nicht brannte,
sondern dafuer, dass dasselbe Programm zweimal lief. Die Sonde baut jetzt jeden Lauf neu und
bricht mit Exit 2 ab, wenn der Server eine andre Fassung nennt als der Baum, aus dem gebaut
wurde.

**Was hier bis zur naechsten Messung steht, ist ein Fall, kein Bild.** Die Pruefstelle
`nachschlagFaellig` (rote Datei um 20:22:09 MEZ, gruen um 20:23:24 MEZ, 22 von 22 in
`tests/components/KnowledgeGraph.f8.test.tsx`) deckt beide Wege in die Ruhe ab und haelt den
Nachschlag pro Stand einmal an. Ob bei 3 000 Notizen in der Auslieferung kein Paar mehr
uebrig bleibt, entscheidet der naechste `fps-laeufer`-Lauf auf den getauschten Bytes. Bis er
da ist, bleibt der Satz oben stehen: **ein Paar bei 3 000 Notizen in der Ruhe, gemessen am
ausgelieferten Stueck** — jetzt mit Grund, und ohne die Behauptung, dass der Grund schon
heilt.

## Am ausgelieferten 3.2.148 gemessen (20:49 bis 20:59 MEZ) — null Paare, fuenf Laeufe, und der Bund ist frisch

Zum ersten Mal misst die Sonde das, was sie beschreibt: sie baut ihren Bund jetzt **jeden**
Lauf und druckt die Fassung vor der ersten Zahl. Der Kopf jedes Laufs lautet `fassung: 3.2.148
(der Baum, aus dem gebaut wurde: 3.2.148)`; nennt der Server eine andre Zahl als der Baum,
bricht der Lauf mit Exit 2 ab. Grund: der Bund auf der Platte war von 16:06 MEZ, und die vier
Abendlaeufe von 19:38 bis 20:36 MEZ haben ihn gelesen, waehrend ihre Papiere 3.2.146 und
3.2.147 nannten.

| Bestand | Scheiben | geschnittene Paare | beruehrend | tiefster Schnitt | Ruhe-Rahmen | malende Ruhe-Rahmen | Arbeit je Bild | Beleg (Dateizeit) |
|---|---|---|---|---|---|---|---|---|
| 3 000 | 621 | **0** | 0 | 0 | 27 | 27 | Median 8,2 ms | `docs/belege/tag-0411/fps-3000-148-2049.log.txt` (20:49:52 MEZ) |
| 3 000 | 646 | **0** | 0 | 0 | 39 | 39 | Median 8,3 ms | `docs/belege/tag-0411/fps-3000-148-2052.log.txt` (20:52:33 MEZ) |
| 3 000 | 625 | **0** | 0 | 0 | 46 | 37 | Median 8,0 ms | `docs/belege/tag-0411/fps-3000-148-2054.log.txt` (20:54:54 MEZ) |
| 400 | 418 | **0** | 0 | 0 | 50 | 50 | Median 4,7 ms | `docs/belege/tag-0411/fps-400-148-2057.log.txt` (20:57:20 MEZ) |
| 1 500 | 528 | **0** | 0 | 0 | 42 | 42 | Median 6,7 ms | `docs/belege/tag-0411/fps-1500-148-2059.log.txt` (20:59:38 MEZ) |

**Der Nachschlag ist im Bild zu sehen, nicht nur im Fall.** Vorher rechnete die Ruhe in 70
Rahmen 6-18 mal etwas, bei Median 0,1 ms; jetzt rechnet sie in 27 von 27, 39 von 39 und 42 von
42 Rahmen, bei 8,0 bis 8,3 ms median. Und das Warten auf die Ruhe ist laenger geworden — der
erste Lauf meldet "Feld steht: ja, nach 6,3 s" gegen 1,8 s in den alten Laeufen, weil die
Flaeche nach der Bewegung noch drei Sekunden an der Kante arbeitet, bevor sie nichts mehr zu
bewegen hat. Die Groessenordnung ist damit am selben Gegenstand gelesen, an dem sie wirkt:
weniger als ein Zehntel Bildzeit pro Rahmen, und der Nachschlag hoert fruher auf, sobald er
nichts mehr bewegt.

**Was damit gilt.** Der README sagt jetzt: null Paare bei 400, 1 500 und 3 000 Notizen im
ausgelieferten Bild, mit den fuenf Laeufen als Zeugen. Der eine Satz aus 3.2.145 (ein Paar bei
3 000, Schnitt 11, 707 Scheiben, `docs/belege/tag-0411/fps-3000-1610.log.txt`, 16:10:38 MEZ)
bleibt als Messung seiner eignen Fassung stehen und ist nicht mehr das Bild, das die Auslieferung
zeigt. Die Zeitfaelle (ms je Phase) bleiben unveroeffentlicht als Urteil: die Maschine war am
Ende jedes Laufs nicht ruhig (max/median 2,7 bis 3,3 ueber der Decke 1,8), und zwei der fuenf
Laeufe koennen ihr Feld nicht fuer ein Zeit-Urteil beanspruchen — Geometrie und Zeit sind zwei
Messungen, und die Sonde haelt sie auseinander.

**Was der Satz nicht deckt.** Das Schleppen ist in diesen Laeufen ein Nichtangriff: der Griff
traf keinen Knoten (`knotenZiehen`: 0 malende Rahmen, in drei von fuenf Laeufen), darum ist die
Wirkung des Nachschlags **nach** einem Zug im Browser weiterhin ungemessen. Im Layout-Fall ist
sie es (`tests/lib/graphLayout.test.ts`, der Browser-Fund vom 4.11. und seine Nachlaeufe). Der
Schlepp-Griff der Sonde zielt auf eine feste Bildstelle und trifft bei 3 000 Notizen oft ins
Leere; das ist die naechste Arbeit an diesem Werkzeug, nicht an der Flaeche.

## Am ausgelieferten 3.2.149, und der Zug ist kein Nichtangriff mehr (21:09 bis 21:19 MEZ)

Die Fassung auf dem Stueck ist die Fassung im Protokoll: jeder Lauf druckt `fassung: 3.2.149
(der Baum, aus dem gebaut wurde: 3.2.149)` und bricht ab, wenn die beiden Zahlen verschieden
sind. Drei Laeufe, alle bei 3 000 Notizen:

| Lauf | Scheiben vor dem Zug | Paare vor dem Zug | Schlepp-Zug | Ruhe nach dem Zug | Scheiben nach dem Zug | Paare nach dem Zug | Beleg (Dateizeit) |
|---|---|---|---|---|---|---|---|
| 1 | 625 | **0** | Kandidat 1 von 8 getroffen, 99 malende Rahmen | — nicht gemessen | — | — | `docs/belege/tag-0411/fps-3000-149-2109.log.txt` (21:09:31 MEZ) |
| 2 | — Abbruch | — | Kandidat 1 von 8, 99 Rahmen | — | — | — | `docs/belege/tag-0411/fps-3000-149-abbruch-2115.log.txt` (21:15:59 MEZ) |
| 3 | 637 | **0** | Kandidat 1 von 8 getroffen | steht nach 7,2 s | 645 | **0** | `docs/belege/tag-0411/fps-3000-149-nachzug-2119.log.txt` (21:19:10 MEZ) |

**Lauf 2 ist ein Eigenfehler der Sonde, gemeldet mit seinem Zeug.** Die neue Nach-zug-Lesung
zaehlte die Scheiben des *ganzen Zuges*: die Sammlung laeuft ueber alle Rahmen seit dem letzten
`an`, und ein Zug malt 637 Scheiben an 99 verschiedenen Mitten. Die Vereinigung wuchs auf
mehrere zehntausend Eintraege, und die Paar-Pruefung warf `RangeError: Set maximum size
exceeded`. Der Lauf endete mit Exit 1 und ohne Urteil — was er nicht tat, war, eine Zahl 0 zu
melden, die kein Feld beschreibt. Heilung: nach dem Loslassen wird die Ruhe abgewartet
(dieselbe Kante aus zwei gleichen Lesungen wie vor dem Zug), und dann wird **ein** Rahmen gesammelt.

**Damit ist der letzte Satz bewiesen, der vorher nur im Fall stand.** Die Flaeche verspricht
"Dragged notes stay put" — dass ein gezogener Knoten liegt bleibt, wenn die Physik weiterrechnet
(`KnowledgeGraph.tsx:5872`). Gemessen am ausgelieferten Stueck: nach dem Zug und nach 7,2 s Ruhe
stehen 645 Scheiben da, **null Paare, null Beruehrungen, tiefster Schnitt null**. Vorher, in drei
von fuenf Laeufen, war die Schlepp-Phase ein Nichtangriff (der Griff traf eine Leerstelle, 0
malende Rahmen), und darum war genau dieser Beweis im Browser nie gefuehrt.

**Zeitfaelle bleiben zurueckgehalten.** Die drei Phasen des Laufs von 21:19:10 MEZ rechnen 3,6 /
8,0 / 8,7 ms median je Bild, und keiner der 448 malenden Rahmen liegt ueber 16,67 ms — aber
dieselbe Maschine meldet am Ende des Laufs max/median 2,33 ueber ihrer Decke 1,8, also ist das
kein Zeit-Urteil, sondern eine Geometrie-Messung, die nebenbei ihre Arbeit zeigt. Ein ruhiger
Wiederholungslauf ist Aufgabe #56 nicht entgangen, sondern nachstehend gehalten.

## Warum das Zeit-Urteil weiter offen ist (21:34 MEZ, ruhiger Versuch an 3.2.149)

Ein Lauf war bestellfrei angesetzt (`docs/belege/tag-0411/fps-3000-149-ruhig-2132.log.txt`, Dateizeit 21:32:20 MEZ): keine eigne Suite, kein Bau, `pgrep` nach vitest/vite/
electron-rebuild gab 0. Die **Vor**-Lesung war ruhig (Median 6,21 ms, max/median 1,23,
load1/cpu 0,20 auf 10 Kernen), und der Lauf brachte die Ruhe-Zeit, die als Urteil dienen
koennte: einschwingen 3,6 ms median an 378 malenden Rahmen, Ruhe nach dem Einpassen 8,0 ms an
39 von 39 Rahmen, Zug 8,8 ms an 97 von 98 Rahmen, und **kein** Rahmen ueber 16,67 ms in allen
drei Phasen. Die **Nach**-Lesung meldete dennoch 2,30 gegen die Decke 1,8, und die Zahl bleibt
zurueckgehalten.

Der Grund ist an der Maschine gelesen, nicht gedaechtnisst: `top` zeigt in dieser Minute
WindowServer mit 38,6 % und die Agenten-Anwendung mit 19,2 + 14,3 + 10,7 % — dasselbe
Programm, das den Lauf befehligt. Die Sonde hoert ihre eigne Umgebung: die Nach-Lesung fällt
in das Fenster, bevor der Agenten-Bildschirm zurueckgeht. Ein Zeit-Urteil auf diesem Rechner
braucht darum einen Lauf ohne Leitungs-Sitzung (nachts, oder aus einer Automations-Runde, die
selbst nichts weiter malt), und nicht eine weichere Decke. Die Geometrie aus demselben Lauf
ist davon unberuehrt und steht fest: 628 Scheiben, null Paare vor dem Zug; 649 Scheiben, null
Paare nach dem Zug; das Feld steht 7,2 s nach dem Loslassen.
