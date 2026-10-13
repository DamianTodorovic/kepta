# Changelog (Fixture: geheilter Stand)

Dieselben Sätze wie in `../schlecht/CHANGELOG.md`, aber mit den Zahlen, die die vier
Artefakte in `beleg/` wirklich hergeben. Die Wache muss hier grün werden — sonst ist sie
ein grüner Nichtstuer, der bloss alles durchwinkt, oder ein Fängnis, das keine Heilung
kennt.

## [Unreleased]

### Fixed
- **Before** (Stand 4 — world clamped to 1000² at every step, no separation), on the very field `tests/graf-ruhe.test.ts` builds (400 / 1 500 / 3 000 nodes at 27 concepts): **37 / 935 / 7 134** pairs intersect by the core's own rule and **15 / 443 / 5 236** by the surface's rule, with **36 / 221 / 818 places** on the world frame, in 65 / 311 / 745 ms; the deepest cut at the largest stock runs **98,6 world units** through a pair (`beleg/vorher-gleich-12-10.log.txt`, 13:07:54).
  The same law measured a day earlier on a *different* corpus, 427 / 1 527 / 3 027 nodes (`beleg/welt-stufe.log.txt`): **50 / 545 / 2 051** own-rule pairs in the shipped 140-tick picture (surface rule 15 / 177 / 1 005, capped 35 / 348 / 1 596) and **147 / 961 / 4 312** in a true cooling run, where **148 / 516 / 1 213 places** sit against the frame.
  **After** (this state, same field, solo run on a machine the probe judged ruhig — `beleg/ruhe-mit-anteil-1444.log.txt`, Start 14:44:20): **0 / 0 / 0 pairs** at 400 / 1 500 / 3 000 nodes. Geometry 57 / 424 / 1 296 ms. Median real edge **283 / 385 / 571** world units against median random pair **427 / 572 / 817**, ratio **0,662 / 0,674 / 0,699** under the 0,8 bar — and the smallest drawn disc must stay at or above **0,3 %** of the picture's world side.
- **How much world the discs need**: sum of disc areas over the world's area = **120,4 %** for Stand 4 at 3 000 nodes against **9,4 / 19,3 / 15,8 %** for this state (`beleg/weltdeckung-1558.log.txt`).
- **Alle drei Glieder einer Serie richtig**: 37 / 935 / 7 134 pairs intersect (`beleg/vorher-gleich-12-10.log.txt`).
- **Ein Querverweis, dazu der echte Beleg**: derselbe Satz steht in `kepta-app/docs/graph-kosten.md`; gemessen ist die Geometrie **57 / 424 / 1 296 ms** in `beleg/ruhe-mit-anteil-1444.log.txt`.
