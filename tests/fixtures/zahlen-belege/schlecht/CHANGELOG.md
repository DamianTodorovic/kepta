# Changelog (Fixture: bekannt schlechter Stand)

Diese Datei ist eine Fixture von `tests/zahlen-belege.test.ts` — sie ist kein Papiervorrat
und gehört keinem Scheiben-Bericht. Sie stellt die vier Fundstellen des 12.10. in ihrer
damaligen falschen Fassung dar: die Zahlen stehen so in keinem der vier Kopien-Artefakte in
`beleg/`. Der Gegenstück-Ordner `../gut/` enthält dieselben Sätze mit den gemessenen Werten.

## [Unreleased]

### Fixed
- **Before** (Stand 4 — world clamped to 1000² at every step, no separation), on the very field `tests/graf-ruhe.test.ts` builds (400 / 1 500 / 3 000 nodes at 27 concepts): **37 / 935 / 7 044** pairs intersect by the core's own rule and **15 / 443 / 614** by the surface's rule, with **36 / 221 / 818 places** on the world frame, in 65 / 311 / 743 ms; the deepest cut at the largest stock runs **98,6 world units** through a pair (`beleg/vorher-gleich-12-10.log`, 13:07:54).
  The same law measured a day earlier on a *different* corpus, 427 / 1 527 / 3 027 nodes (`beleg/welt-stufe.log`): **50 / 1 019 / 7 325** own-rule pairs in the shipped 140-tick picture (surface rule 15 / 177 / 1 005, capped 35 / 348 / 1 596) and **147 / 961 / 4 312** in a true cooling run, where **148 / 516 / 1 213 places** sit against the frame.
  **After** (this state, same field, solo run on a machine the probe judged ruhig — `beleg/ruhe-mit-anteil-1444.log`, Start 14:44:20): **0 / 0 / 0 pairs** at 400 / 1 500 / 3 000 nodes. Geometry 58 / 427 / 1 289 ms. Median real edge **283 / 385 / 571** world units against median random pair **427 / 572 / 817**, ratio **0,662 / 0,674 / 0,699** under the 0,8 bar — and the smallest drawn disc must stay at or above **0,3 %** of the picture's world side.
- **How much world the discs need**: sum of disc areas over the world's area = **120,4 %** for Stand 4 at 3 000 nodes against **9,4 / 19,3 / 15,8 %** for this state (`beleg/weltdeckung-1558.log`).
- Eine Zahl ohne jeden Beleg: der Lauf brachte **1 234 Treffer** in **42 ms**.
- **Alle drei Glieder einer Serie falsch**: 11 / 22 / 33 pairs intersect (`beleg/vorher-gleich-12-10.log`).
- **Die Zahl steht in der Datei, aber in einer anderen Zeile und für ein anderes Feld**: 427 pairs at rest (`beleg/welt-stufe.log`).
- **Ein Querverweis ist kein Beleg**: derselbe Satz steht in `kepta-app/docs/graph-kosten.md`, und die dort genannte **13,4 ms** Medianzeit wird hier nur wiederholt.
- Ein zitiertes Artefakt, das es nicht gibt: gemessen in `beleg/fehlt-1234.log`: **15 ms**.
