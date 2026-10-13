# LESEFADEN — wie eine Zahl in einem Kern-Papier die Wache passiert

Geschrieben von Scheibe W für die README-Scheibe (und die Graph-Scheibe), 12.10.2026, 23:1x UTC.
Grundlage ist `scripts/zahlen-belege.mjs` im selben Ordner-Baum; jede Zeile hier ist an dem
Papier gemessen, das sie nennt. Dieser Ordner (`docs/belege/`) ist die Tragform der Beweise —
siehe `REGISTER.md`.

## §10 Zitiergrammatik

### Die eine Zeile, die es richtig macht

Aus `tools/latenz/README.md`, Zeile 19 — von der Wache **bestaetigt**, drei Zahlen, ohne Flag, ohne Ausrede:

```markdown
| 1.10.2026 | Cache + vorgerechnete Vektornormen (`latenz-100k-cache2-2026-10-01.json`) | 100k | 72,0 ms | 85,0 ms | 92,4 ms | 5.136/s |
```

Drei Dinge machen sie grün, und alle drei sind mechanisch pruefbar:

1. **Das Zitat steht auf derselben Zeile wie die Zahl**, in Backticks, und nennt **eine Datei mit
   Mess-Endung**: `.log`, `.log.txt`, `.json`, `.txt`, `.csv`. Ein Ordner ist kein Beleg, ein
   Quelltext ist kein Beleg (Regel 3 unten).
2. **Die Datei liegt im Repo** — hier `tools/latenz/ergebnisse/latenz-100k-cache2-2026-10-01.json`.
   Die Wache loest ein Zitat zuerst im eigenen Baum, dann (auf meinem Rechner) in der
   Arbeitsmappe und in den Nachbarbaeumen; **was nur ausserhalb des Baums existiert, ist seit heute
   ein eigener Befund**: `beleg-nicht-im-repo`. GitHub sieht den Schreibtisch nicht, ein Kunde auch nicht.
3. **Die Zahl steht in der Datei** — nach denselben zwei Normalisierungen, die die Wache kennt:
   `72,0 ms` → `72` gegen `72.0` im JSON, und Rundung auf die Stellenzahl des Papiers
   (`p50: 6986.42` ist im Papier `6.986 ms`, `p95: 7155.84` ist `7.16 s`).

### Regel 1: Ein Beleg ist eine Datei, nicht ein Ordner und kein Quelltext

`tools/latenz/README.md` ist das Vorbild, `README.md:347` der Gegenfall — und der ist **zu Recht
beanstandet**, obwohl dort fast alles steht, was man brauchen koennte:

```markdown
Median search times on one laptop (Apple M4), every run committed in [`tools/latenz/ergebnisse/`](tools/latenz/ergebnisse/): **46.6 ms** median at 100,000 memories (p95 87.6 ms), **276.5 ms** median at **1,000,000 memories**.
```

- `tools/latenz/ergebnisse/` endet auf `/`: das ist ein **Ordner**. Die Wache kann einen Ordner
  nicht oeffnen und erthaelt keine Zahl — also traegt er nicht als Beleg.
- `bench.ts:38` (eine Zeile weiter, im selben Absatz) ist ein **Quellverweis**. Er erklaert, *wie*
  gemessen wird; er beweist nicht, *was* herauskam. Dafuer gibt es in dieser Wache keine
  Freifahrt — und die soll es nicht geben, denn "steht im Code" war noch nie ein Messwert.
- Die Werte existieren langst: `46.6` und `87.6` stehen in
  `tools/latenz/ergebnisse/latenz-100k-fts-2026-10-01.json`, `276.5` in
  `tools/latenz/ergebnisse/latenz-1m-fts-2026-10-01.json` (beide geoeffnet, beide getrackt).

**Die Heilung ist ein Pfad, kein neuer Text.** Auf Zeile 347 selbst, hinter den Zahlen:

```markdown
… **46.6 ms** median at 100,000 memories (p95 87.6 ms, `tools/latenz/ergebnisse/latenz-100k-fts-2026-10-01.json`), **276.5 ms** median at **1,000,000 memories** (`tools/latenz/ergebnisse/latenz-1m-fts-2026-10-01.json`).
```

### Regel 2: Das Zitat gilt pro ZEILE, nicht pro Absatz

Die Wache erbt ein Zitat nicht nach oben und nicht nach unten. Das ueberrascht, weil der
Mensch Absatz liest: in `README.md` steht das Log-Zitat auf Zeile 252, die Aufzaehlung der
Zahlen aber auf Zeile 254 — und die ist ohne Beleg. **Was auf Zeile 252 steht, beglaubigt
Zeile 254 nicht.** Fuer die README-Scheibe heisst das: pro Aufzaehrungszeile ein Zitat, oder
die Zahlen in die Zeile mit dem Zitat holen. (Grund, gemessen: als die Wache noch absatzweise
erbte, waren 52 von 55 Befunden falsch-rot — eine Wache, die richtige Papiere rot macht,
wird abgeschaltet.)

### Regel 3: Serien werden gliedweise gewertet, ein fehlendes Glied genuegt

`37 / 935 / 7 044` gegen ein Log, das `paareEigen=37/935/7134` sagt: **ein** falsches Glied
machte die Zeile rot und meldete genau dieses (12.10., Fundstelle 1). Sind alle Glieder
falsch, meldet die Wache alle Glieder einzeln (Fixtur `11 / 22 / 33` → drei Befunde). Fuer
die Praxis: eine Serie mit zwei richtigen und einer abgeschriebenen Zahl ist eine
beanstandete Zeile, keine halbe.

### Regel 4: Was ein Soll ist, ist keine Messung

`must stay at or above **0,3 %**`, `its **750 ms** ceiling`, `pinned at ≤ **40 pairs**` — Latten
haelt ein `expect` im Quelltext, kein Log. Die Wache erkennt sie an einem Marks-Wort **zwischen**
der vorigen Zahl und dieser (max. 60 Zeichen): `bar|Latte|Soll|bestell|ordered|ceiling|Budget|must|muss|soll|at or above|mindestens|at most|pins|assert|expected|≤|≥|by step`.
Ein Satz, der eine Latte als Messwert ausgibt, ist ein Befund; ein Satz, der eine Latte als
Latte nennt, wird zaehlt (`Soll`) und nicht rot.

### Regel 5: Ein Papier-Zitat braucht eine Stelle

`kepta-app/docs/graph-kosten.md` als Verweis ("the same sentence stands in …") ist ein
**Querverweis**, kein Beleg — die Zahl bleibt ohne Beleg. Als Beleg zweiter Hand zaehlt ein
`.md` nur mit Stellenangabe: `` `audit-…/E2-GRAPH-FLAEche.md`, Zeile 1150-1153 ``. Selbst dann
ist es zweite Hand: die Wache oeffnet das Papier und verlangt die Zahl darin, aber der
eigentliche Beleg bleibt ein Mess-Artefakt. Fuer neue Zitate gilt: **Log zuerst.**

### Regel 6: Der Beleg muss im Commit sein, nicht nur auf der Platte

Der Beweis ist die saubere Auspackung, nicht der eigene Lauf:

```sh
git ls-files | cpio -pdm /tmp/wache-beweis
node scripts/zahlen-belege.mjs --wurzel=/tmp/wache-beweis
```

Ein Artefakt, das nur im Arbeitsbaum liegt (neu, uncommittet — oder schlicht von
`.gitignore:22 *.log` verschluckt), ist in dieser Auspackung weg. Das ist kein
Parser-Problem: es ist derselbe Defekt, den ein Kunde sieht. **Deshalb liegt jeder
Mess-Beweis dieses Ordners als `.log.txt`** — Inhalt byte-identisch, nur die Endung
erweitert; die Ignore-Regel bleibt intakt. Was davon abweicht (zwei gekuerzte
Maschinenzeilen, ein Papier-Auszug statt eines Laufs) steht begruendet und mit
Groesse und sha256 in `REGISTER.md`, nicht als Stillschweigen.

### Regel 7: Die beiden Flaechenpapiere werden haerter gemessen

In `README.md` und `README.de.md` ist eine Messzahl **ohne** Zitat auf ihrer Zeile ein Befund
(`pflicht-ohne-zitat`), nicht nur eine Zahl in einer Statistik. In allen anderen Papieren ist
es Erfassung. Erfassung ansehen ohne zu urteilen: `--inventar` oder `--ohne-pflicht` — beide
gehen mit 0 raus.

Stand 13.10.2026: `CHANGELOG.md` ist von der Pflichtliste herunter, und der Grund steht im
Quelltext der Wache bei `AUFPFLICHTUNGEN` — die Regel der Leitung nennt die beiden Flaechen,
und eine Wache, die an der Geschichte eines Changelogs fuer jeden Stand rot ist, wird
abgeschaltet statt angehoert. **Unveraendert bleibt die strengere Haelfte:** jede Zahl MIT
Zitat wird auch in der CHANGELOG gegen ihr zitiertes Artefakt gemessen; ein toter, mehrdeutiger
oder ungetrackter Pfad und ein Wert, den die Datei nicht hergibt, sind dort dieselben Befunde
wie in jedem andern Papier. Haelt der Fall "misst die CHANGELOG weiter an ihren Zitaten" in
`tests/zahlen-belege.test.ts`.

### Kurzliste fuer die Zeilen, die die Wache heute an euch meldet

| Papier | Zeile | Was fehlt | Wo der Beleg langst liegt |
|---|---|---|---|
| `README.md` | 143 | Zitat fuer 189 MB / 19 MB | Bundle-Bau-Log oder Groessenlauf — ein Lauf, der die Zahl druckt, ist der Beleg |
| `README.md` | 211 · `README.de.md` | 133 | 71 %, 78 %, 11 % ohne Zitat | Ablation-Lauf (`scripts/ablation.ts`), Ausgabe als `.txt` hierher |
| `README.md` | 254 · `README.de.md` | 153 | 283/385/571, 427/572/817, 0,662/0,674/0,699 | `docs/belege/nacht-12-10/ruhe-mit-anteil-1444.log.txt` (im Repo, bereit) |
| `README.md` | 338/339 · `README.de.md` | 182/183 | 70/72/56/66 %, 87/89/74/85 % | LongMemEval-Records in `tools/longmemeval/ergebnisse/` — beachte: Qualitaetszahlen brauchen einen Record vom **ausgelieferten** Stand (`scripts/benchmark-belege.mjs`), 61,5 % bleibt als Aussen-Aussage gesperrt |
| `README.md` | 347 · `README.de.md` | 191 | 46,6 / 87,6 / 276,5 ms | `tools/latenz/ergebnisse/latenz-100k-fts-2026-10-01.json` (46,6 und 87,6) und `tools/latenz/ergebnisse/latenz-1m-fts-2026-10-01.json` (276,5) — beide im Repo, Zeile 347 selbst zitieren |
| `README.md` | 355 · `README.de.md` | 199 | 29,8 %, 63,8 % | ein Lauf, der diese Prozente druckt — sonst hat die Zahl keinen |

Und fuer die Graph-Scheibe, reiner Pfadtusch, erledigt am 13.10.2026: `CHANGELOG.md` zitierte
einmal `e2-code/nacht-12-10/rohdaten/*.log` — Arbeitsmappe, also Befund `beleg-nicht-im-repo`,
auf einem Runner `pfad-existiert-nicht`. Dieselben Dateien liegen **byte-identisch** in
`docs/belege/nacht-12-10/` als `.log.txt`, und die Papiere zeigen jetzt auf diese Wege:
`vorher-gleich-12-10.log.txt`, `welt-stufe.log.txt`, `weltdeckung-1558.log.txt`,
`ruhe-mit-anteil-1444.log.txt`, `kleinste-scheibe-2007.log.txt`. Dazu seit demselben Tag der
Einzelllauf `sockel-halb-1-230627.log.txt` (zwei Maschinenzeilen gekuerzt, siehe REGISTER) und
in `nacht-11-10/` der erste Papier-Auszug — ein ueberlebendes Protokoll zweiter Hand, als
solches gekennzeichnet, weil sein Lauf mit `/tmp` verloren ist.
