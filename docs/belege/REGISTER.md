# Beleg-Ordner `docs/belege/` — was hier liegt, woher es kommt, und wer es zitiert

Die Regel, die diesen Ordner gibt: **ein Beleg, den ein Kunde nicht oeffnen kann, ist kein
Beleg.** Dieser Repo ignoriert `*.log` (`.gitignore:25`), also liegt jede Messdatei hier als
`.log.txt` — Inhalt byte-identisch zum Lauf, nur die Endung erweitert. Die Wache
(`scripts/zahlen-belege.mjs`, byte-identisch zum Kern) oeffnet jedes Artefakt, das ein Satz
zitiert, und verlangt die Zahl dort; ein Beleg, den `git ls-files` nicht kennt, gilt nicht.

Was in diesem Ordner **nicht** steht: Messlaeufe des Kerns. Die App und die Engine sind zwei
Baeume, und ein Satz nennt seinen Baum. Drei Kopien von Kern-Belegen lagen hier zeitweise
ungetrackt (sie stammen aus der Nacht des 12.10., als dieselben Zahlen in beiden Raeumen
gezogen wurden) — sie sind am 13.10. in die Arbeitsmappe zuruegelegt, nicht geloescht:
`audit-2026-10-09/ablage-app-13-10/` mit einer eigenen Erklaerung. Die rote Fassung dieser
Laeufe liegt, korrekt gekuerzt, im Kern-Repo unter `docs/belege/`.

| Datei im Repo | Bytes | sha256 (16) |
|---|---|---|
| `tag-0311/eval-drei-beine-1352.log.txt` | 6562 B | `e3cff29fc8384b3a…` |
| `tag-0311/eval-bge-m3-1404.log.txt` | 6144 B | `e136f87d902ee5e2…` |
| `tag-0311/sprachuebergriff-nomic-1406.log.txt` | 2623 B | `390c15c2cf839f2c…` |
| `tag-0311/sprachuebergriff-bge-m3-1406.log.txt` | 2631 B | `eb01ff875ec16b39…` |
| `tag-0411/wortschatz-vor-3-2-138-2233.log.txt` | 1648 B | `7cf81827ff35447e…` |
| `tag-0411/wortschatz-nach-3-2-139-0023.log.txt` | 959 B | `92084dce677a6844…` |
| `tag-0411/tuer-48-vor-3-2-139-0123.log.txt` | 4355 B | `31bcebfde0182eb1…` |
| `tag-0411/tuer-48-nach-der-heilung-am-baum-0150.log.txt` | 4388 B | `7428ed38b6e73497…` |
| `tag-0411/tuer-48-landung-3-2-140-0220.log.txt` | 4394 B | `d1ee4f7532d02440…` |
| `tag-0411/spurbau-grundlagen-40000-0136.log.txt` | 2651 B | `48847604a5ff01ac…` |
| `tag-0411/begriffsnamen-form-0159.log.txt` | 783 B | `a31931315d622e1a…` |
| `tag-13-10/eval-korpus-1143.log.txt` | 3419 B | `8b343e7457825fa0…` |
| `tag-13-10/eval-korpus-1413.log.txt` | 4181 B | `dcd3e42dc0021921…` |
| `tag-13-10/ablation-beine-1144.log.txt` | 1904 B | `62d15147e59de149…` |
| `app-abnahme/nachzug-vorher-rot.log.txt` | 6030 B | `1e240e7500dd47b2…` |
| `app-abnahme/nachzug-tuer-gruen.log.txt` | 1008 B | `5bf5486e036c9104…` |
| `app-abnahme/nachzug-flaeche-vorher-rot.log.txt` | 16278 B | `9c0ac4b1640fd829…` |
| `app-abnahme/nachzug-flaeche-gruen.log.txt` | 19204 B | `1e6eb0616a86a748…` |
| `app-abnahme/nachzug-mutation-rot.log.txt` | 22052 B | `1c8a44f87cda8e3a…` |

Summe: **111 358 Bytes in 19 Dateien** (gemessen am 4.11. um 02:21 MEZ mit `wc -c` ueber
`find docs/belege -name '*.log.txt'`). Die fuenf neuen vom 4.11. machen 16 571 Bytes davon aus.

Die Zeile war zwei Dateien hinterher: sie schrieb am 3.11. **"92 036 Bytes in 12 Dateien"**,
waehrend `find` am 4.11. vor den neuen Laeufen **94 787 Bytes in 14 Dateien** meldete — die
beiden Wortschatz-Laeufe von 3.2.139 (2 607 Bytes) erklaeren den groessten Teil davon; wo die
restlichen 144 Bytes herkommen, ist nicht nachgesehen. Nichts in diesem Repo prüft diese
Zahl (`scripts/zahlen-belege.mjs` liest das Register nur nach
Zitaten), also gilt die Regel von Hand: **wer hier eine Datei ergaenzt, zieht die Summe im
selben Schritt nach**, und zwar aus dem Befehl, nicht aus dem Gefuehl.

## Die zwei Eval-Laeufe sind derselbe Lauf mit zwei Etiketten

`eval-korpus-1143.log.txt` meldet seine erste Zahl als `Precision@5: 62.2 %` / `81.1 %`.
Die Rechenstelle teilt durch `min(5, relevante Notizen)` — das ist ein Recall, gekappt, keine
Precision. Am 13.10. ist die Ausgabe der App auf `Recall@5 (capped)` umbenannt worden (der
Kern trug die Korrektur schon seit 12.10.), und `eval-korpus-1413.log.txt` ist derselbe Lauf
nach der Umbenennung: **alle Zahlen unveraendert** (`62.2 / 51.1 / 0.559` fuer die v1-Grundlage,
`81.1 / 71.1 / 0.758` fuer die Engine), die drei Zeilen heissen jetzt so, wie die Rechnung ist.
Die README zitiert den Laeuft mit dem richtigen Etikett; der aeltere bleibt liegen, weil er die
Korrektur selbst zeigt — nicht weil jemand die alte Zahl verkauft sehen wollte.

Haelt die Verwechslung nicht mehr zusammen: `scripts/ablation.ts` teilt durch 5 und meldet auf
demselben Korpus `P@5` — 23 % gegen die 81 % des Eval-Laufs. Zwei Metriken, zwei Namen, kein
Vergleich zwischen ihnen. Gewacht von `tests/eval-metrik.test.ts` (sechs Faelle, mit Gegenprobe:
ein Text, der `Precision@5` druckt, wo er durch `min(5, relevante)` teilt, wird gefunden).

## Der dritte Beleg: eval und ablation bauen denselben Korpus (3.11.)

`tag-0311/eval-drei-beine-1352.log.txt` ist derselbe Korpus (58 Notizen, 45 Anfragen, Zeitanker
2026-09-01T12:00 UTC) zum ersten Mal aus dem **geteilten** Aufbau `scripts/eval-store.ts` und mit
einem dritten Bein. Was der Selbstblick am 2.11. gefunden hatte: `eval.ts` baute seinen Speicher
in eigener Regie — ohne Entitaeten, ohne Index-Spuren —, waehrend `ablation.ts` den geteilten
Aufbau mit allen drei Spuren benutzte. Zwei Werkzeuge, ein Wort, zwei Systeme, und die Zahl auf
der Flaeche stammte aus dem schwacheren.

Gemessen, in drei Beinen:

| Bein | Recall@5 (gekappt) | Hit@1 | MRR |
|---|---|---|---|
| v1 naive Substring-Suche | 62,2 % | 51,1 % | 0,559 |
| v2 Engine ohne Vektoren | 81,1 % | 71,1 % | 0,758 |
| v3 Engine **mit** Vektoren — ausgeliefertes Retrieval | 91,1 % | 75,6 % | 0,812 |

v1 und v2 sind **wortgleich** zu `eval-korpus-1413.log.txt` (die sechs Zeilen der beiden Blöcke
sind per `diff` identisch): der geteilte Aufbau hat die zwei alten Beine nicht verschoben, obwohl
er Entitaeten und zwei weitere supersede-Ketten mitbringt. v3 bestaetigt unabhaengig die 76 %,
die `ablation-beine-1144.log.txt` seit 13.10. fuer "volle fusion" meldet — zwei Werkzeuge, ein
Ergebnis. Die Flaeche nennt weiterhin 71 % (den Wortlaut der README nachlesen): dieser Ast der
Zustands-Tafel laeuft genau dann, wenn **kein** Ollama antwortet, also ohne Vektor-Bein.

Neu an der Ausgabe: jede Kategorie des Korpus (lexikalisch, umschreibung, graph, temporal,
ablenkung) steht jetzt als eigne Zeile da, und das dritte Bein benennt seinen Grund, wenn der
Embedder nicht antwortet, statt still zwei Beine zu zeigen. Die schwachsten Kategorien sind
`umschreibung` (3 Hit@1 von 10, auch mit Vektoren) und `temporal` (2 von 3; die eine Anfrage
"Bis wann muss die Umsatzsteuer abgegeben werden?" faellt, weil die Notiz abgelaufen ist).

## Der Sprachuebergriff: die Flaeche hat zu viel versprochen (3.11.)

Zwei Saetze behaupteten, das Vektor-Bein finde auch ueber eine Sprachgrenze hinweg
(`Settings.tsx` "Semantic similarity across languages", `SystemStatus.tsx` "with vectors it
is stronger across languages too"). Beide standen ohne jeden Messlauf da. `npm run
eval:sprache` (Skript: `scripts/eval-sprachuebergriff.ts`) misst das auf 15 Paaren —
dasselbe Ziel wie im Fixkorpus, nur die Sprache der Frage verschoben, die Ziele geerbt statt
erfunden, in beiden Sprachen gemessen und mit dem Vektor-Bein auch allein:

| Lauf | deutsch Hit@1 | englisch Hit@1 | nur Vektor-Bein, englisch |
|---|---|---|---|
| `sprachuebergriff-nomic-1406` (Standard-Embedder) | 60,0 % | **26,7 %** = 4 von 15 | 26,7 % |
| `sprachuebergriff-bge-m3-1406` (mehrsprachig) | 60,0 % | **20,0 %** = 3 von 15 | 20,0 % |

Drei Folgen, aufgeschrieben, weil sie die Zahl nicht schoener machen:

1. Die Behauptung ist falsch. Ohne Vektoren treffen die englischen Fragen 13,3 %, mit
   Vektoren 26,7 % — der Zugriff verdoppelt sich und bleibt bei einer von vier Fragen.
2. Das mehrsprachige Modell, das die README deutschen Notizen seit 13.9. empfiehlt, loest es
   nicht: 20,0 % gegen 26,7 %, und auf dem deutschen Korpus bettet es im Vektor-Bein allein
   *schlechter* ein (46,7 % gegen 73,3 % Hit@1, siehe die Spalte oben). Ein Modelltausch waere
   kein Gewinn und muesste trotzdem jeden vorhandenen Knoten neu einbetten — die Vektor-Spur
   filtert die Abschnitte nach ihrem Modell (`src/core/engine.ts:294`), also liegen nach einem
   Wechsel alle vorhandenen Knoten ohne passende Spur da.
3. Fusion und reines Vektor-Bein melden dasselbe Ergebnis, also liegt es am Einbettner und
   nicht an der Rangfusion. Das ist der offene Punkt, nicht die Formel.

Der volle Eval-Lauf mit `bge-m3` auf dem deutschen Korpus liegt daneben
(`eval-bge-m3-1404.log.txt`: Hit@1 77,8 %, Recall@5 90,0 %, MRR 0,825; der Standardlauf in
`eval-drei-beine-1352.log.txt` meldet demgegenueber 75,6 / 91,1 / 0,812 — gemischt, kein Grund
fuer einen Umbau). Die Wortwahl der Flaeche haelt
jetzt `tests/components/flaeche-sprach-behauptung.test.ts`: jede Zeile, die von *language* redet,
muss ihre Zahl dabeihaben, und die beiden Belege muessen im Repo liegen und ihre Hit@1-Zeile
nennen. Die Saetze selbst sind auf das Messbare zurueckgesetzt ("Meaning, not only the exact
words").

## Was sich nachbauen laesst und was nicht

`npm run eval` laeuft in zwei Beinen deterministisch offline (v1, v2) und zieht das dritte
(v3, ausgeliefertes Retrieval) ueber ein lokales Ollama mit `nomic-embed-text`; antwortet der
Dienst nicht, steht der Grund benannt in der Ausgabe und der Lauf bleibt zweibeinig.
`npm run ablation` und `npm run eval:sprache` brauchen denselben Dienst fuer ihr Vektor-Bein.
Die Belege hier sind Laeufe **mit** Vektor-Bein (der Dienst stand 12.10. nachts, 13.10. um
12:14 UTC und am 3.11. um 13:06 UTC), und die Zeile in der README nennt diesen Pfad, damit ein
Leser weiss, was er sieht, wenn er es selbst versucht.

## Die fuenf Laeufe vom 4.11.: wo die 129 ms her kamen

`tag-0411/tuer-48-vor-3-2-139-0123.log.txt` und
`tag-0411/tuer-48-nach-der-heilung-am-baum-0150.log.txt` sind derselbe Griff an derselben
Kapsel (40 000 Notizen, 160 Vektoren) vor und nach der Heilung: die Bitte nach einem
Schreibfall meldet dort `ms: 157` mit `vektor=134.74` und `ms: 193` mit `vektor=134.57`,
meldet hier `ms: 31` mit `vektor=5.82` und `ms: 34` mit `vektor=5.96`. Der Nachtrag der Spur
steht in beiden Laeufen (`deltapatches` 1 und 2), das Vektor-Bein ging in beiden mit — die
beiden Zeilen vergleichen also dieselbe Arbeit. Der hintere Lauf ist am **gebauten Baum**
gemessen (3.2.139 stand noch in `package.json`, die Heilung schon in `src/`). Nach der Landung
fuehrt dieselbe Sonde denselben Griff am **ausgelieferten Stueck**
(`tag-0411/tuer-48-landung-3-2-140-0220.log.txt`): 33 ms mit `vektor=5.79` und 39 ms mit
`vektor=6.21`, beide Schreibfaelle sichtbar gelandet, `deltapatches` 1 und 2. Der dafuer
benutzte Bund ist bytegleich zum Objekt - `dist/server.cjs` und die aus dem installierten
`app.asar` ausgepackte Datei tragen dieselbe sha256 (`ddf76cd9f2c23fc5…`); gemessen wird also
das ausgelieferte Programm, nur gegen die Kapsel statt gegen den Bestand des Rechners.

`tag-0411/spurbau-grundlagen-40000-0136.log.txt` nennt die Grundgesamtheit und die einzelnen
Lesungen: `entities: 40008`, `memory_entities: 160000`, `relations: 360000`, und die
Rangfolge der Begriffe (`store.entityNamen()`) mit `123.41` / `63.90` / `65.12 ms` ueber drei
Laeufe — dieselbe Zusammenrechnung, die vor der Heilung in jeder ersten Anfrage nach einem
Schreibfall steckte. Dasselbe Blatt zeigt, dass die uebrigen Lesungen unschuldig waren:
`store.chunksFuerMemories([1 Notiz])` mit `0.12` / `0.02` / `0.09 ms`,
`store.allEmbeddableChunks()` mit `28.32` / `1.36` / `1.24 ms`.

`tag-0411/begriffsnamen-form-0159.log.txt` ist die Form der Namen und der Preis des neuen
Wegs: eine indizierte Lesung mit 400 Stuecken `0.20 ms`, mit 4000 Stuecken `2.22 ms`, gegen
`7.11 ms` fuer die ganze Namensliste und 63.90 ms fuer deren Rangfolge. Gebildet haben diese
Zahlen zwei Einmal-Laeufe in der Kapsel (`/tmp/tuerkontrolle`, eigener Schluessel, eigener
Port 3951); die Blaetter daneben liegen in der Arbeitsmappe
(`audit-2026-10-09/feldzug/belege-0411/spurbau-*.mts`), weil sie an diesen einen Bestand
gekoepft sind und keine Dauerwache des Repos sind. Die Tuer-Laeufe fährt
`audit-2026-10-09/pf1/tuerkontrolle.mjs --nur-messen --mit-ollama`.
