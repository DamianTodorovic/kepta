# Konkurrenz gemessen, nicht verglichen

Punkt 8 heisst: *mit grossem Abstand das Beste*. Dieser Ordner-Teil hält fest, wie
weit wir von dem Abstand entfernt sind, und zwar an Zahlen, die ein Kunde selbst
nachfahren kann. Jede Zahl nennt ihr Artefakt; eine Zahl ohne Artefakt steht hier nicht.

Der Korpus ist auf allen Zeilen derselbe: **58 Notizen, 45 Anfragen, fünf Kategorien**
(`scripts/eval-corpus.ts`, gezaehlt ueber `npx tsx`). Das Mass ist auf allen Zeilen
dasselbe: **Hit@1** — die erste Antwort nennt eine der Ziel-IDs der Anfrage.

| System | Konfiguration | Hit@1 | Artefakt |
|---|---|---|---|
| K3PTA, naive Substring-Suche (v1-Bein) | eigener Eval-Aufbau | **51,1 %** (23/45) | `docs/belege/tag-0311/eval-drei-beine-1352.log.txt` |
| K3PTA, ohne Vektoren (v2-Bein) | BM25 + RRF + Temporal + Entitaeten | **71,1 %** (32/45) | dito |
| K3PTA, **ausgeliefert** (v3-Bein) | dazu Vektoren | **75,6 %** (34/45) | dito |
| mem0 2.2.1, Fakten-Zerlegung, `llama3.2:3b` | 2.11.2026, Leitung | **24,4 %** (11/45) | `docs/belege/konkurrenz-0211/spur-fakten-3b-vollstaendig.jsonl` |
| mem0 2.2.1, **fair gefahren** | ganzes Stueck, `infer=False`, Wort-Suche an, nomic-embed-text lokal | **51,1 %** (23/45) | `docs/belege/konkurrenz-0611/spur-fair-0611.jsonl` und `…-zwei.jsonl` |
| **sqlite-vec 0.1.9**, reines Cosinus-KNN | dieselben Texte, dasselbe Einbett (nomic-embed-text, 768 D), k=5, **nichts** ausser Vektoren | **42,2 %** (19/45) | `docs/belege/konkurrenz-0611b/spur-sqlitevec-0611.jsonl` und `…-zwei.jsonl` |
| **sqlite-vec 0.1.9**, reines Cosinus-KNN, **zweites Einbett** | derselbe Lauf, nur `bge-m3` (1024 D) statt nomic | **66,7 %** (30/45) | `docs/belege/konkurrenz-0611b/spur-sqlitevec-bge-m3.jsonl` und `…-zwei.jsonl` |
| K3PTA, **ausgeliefert** (v3-Bein), **zweites Einbett** | derselbe Aufbau und derselbe Suchweg, nur `bge-m3` (1024 D) statt nomic | **77,8 %** (35/45) | `docs/belege/konkurrenz-0611c/spur-uns-bge-m3-0611.jsonl` und `…-zwei.jsonl` |

## Berichtigung 16:52 MEZ: die Kategorie-Zahl war eine Modell-Aussage, keine Verfahrensaussage

Die erste Fassung dieses Abschnitts schrieb, reines KNN treffe **"0 von 3 Zeitfragen und
0 von 10 Umformulierungen"**, und nannte das die Begruendung fuer BM25, RRF, Zeitstrahl und
Entitaeten. Nachgeprueft mit einem zweiten Einbett (16:52:30 und 16:52:51 MEZ, derselbe
Korpus, dasselbe Skript, nur `bge-m3` statt `nomic-embed-text`): dasselbe reine KNN trifft
**6 von 10 Umformulierungen** und **1 von 3 Zeitfragen**, lexikalisch 20 von 25, und kommt
insgesamt auf **66,7 %** — 8,9 Punkte unter der Auslieferung, nicht 33,4.

Die Aussage war also **halb richtig und halb Modell-Aussage**: was sie gemessen hat, ist die
Cosinus-Naehe *von nomic-embed-text*, nicht die von Vektorsuche allgemein. Richtig bleibt:
(a) mit dem Einbett, das K3PTA ausliefert (`src/core/embeddings.ts:20` ->
nomic-embed-text), ist der faire Gleich-Stufen-Vergleich 75,6 gegen 42,2; (b) die Fusion
gewinnt gegen reines KNN **auf derselben Einbettstufe** 33,4 Punkte. Neu und offener als
vorher: der Abstand **schrumpft auf 8,9 Punkte**, wenn das Einbett wechselt — und zwar für
beide Seiten. Das ist kein Schönheitsfehler, sondern eine Frage ans Produkt: **welches
Einbett liefert unsre Rangfolge, wenn es nicht das voreingestellte ist?** Gemessen ist die
Gegenseite (reines KNN) für `bge-m3`; unsre eigne Rangfolge mit `bge-m3` war zu dem
Zeitpunkt **nicht** gemessen und stand als nächster Lauf an — **das war falsch**, sie war
schon am 3.11. gemessen (`docs/belege/tag-0311/eval-bge-m3-1404.log.txt`, 14:04 MEZ auf
3.2.125), und auf dem heutigen Baum ist sie 17:09 MEZ punktgenau reproduziert. Siehe
Abschnitt P113.

Was die Zeile *nicht* sagt, bleibt: sqlite-vec ist eine Erweiterung, kein
Gedächtnisdienst — kein Speichern, kein Aktualisieren, kein Vergessen, keine Mandanten-Wand.
Die Zeile misst das **Verfahren**, nicht das Produkt. Und derselbe Vorwurf, der am 2.11.
gegen den mem0-Fakten-Lauf erhoben wurde ("eine Konfiguration, die der Mitbewerber so nicht
ausliefert"), gilt hier nicht: eine Vektortabelle mit k-NN *ist* genau das, was sqlite-vec
ausliefert.

Geworden ist die Zeile so: Kapsel `/tmp/konk-sqlitevec-0611` (python 3.14.7, apsw,
sqlite-vec 0.1.9; die sqlite-Bibliothek im apsw ist 3.54.1, nicht die 3.50.4 des Systems),
Korpus und Fragen aus `scripts/eval-corpus.ts` und **gegen die mem0-Kapsel nachgeprueft**
(58 Notiztexte und 45 Anfragen, identisch), Einbettung über Ollama nur auf 127.0.0.1, zwei
Läufe 16:40:55 und 16:40:58 MEZ mit **derselben Rangfolge** in beiden Traces.
Rückgängig: `rm -rf /tmp/konk-sqlitevec-0611`.

## P112, 17:09 MEZ: die eigne Rangfolge mit dem zweiten Einbett, in der richtigen Einheit

**Vorbemerkung P113 (17:30 MEZ):** dieser Abschnitt ist **keine Neufund-Messung**. Dieselben
sieben Zahlen standen schon am 3.11. im Repo (`docs/belege/tag-0311/eval-bge-m3-1404.log.txt`
und `eval-drei-beine-1352.log.txt`, 14:04/13:52 MEZ auf 3.2.125). Was dieser Abschnitt neu
gibt, ist (a) die **Reproduktion auf 3.2.189** -- 64 Fassungen später, jede Kategorie am
gleichen Platz -- und (b) die **Modell-Abhängigkeit in derselben Einheit** gemessen, die vorher
niemand berechnet hatte. Der Irrtum, hier sei die Frage zum ersten Mal beantwortet, ist in
P111s Satz gewurzelt; berichtigt wird er im Abschnitt P113.

Die Berichtigung oben hat eine offene Frage hinterlassen, die hier beantwortet ist: **was
tut die Fusion mit `bge-m3`?** Gefahren 17:09:20 bis 17:09:32 MEZ mit demselben Aufbau, den
`scripts/eval.ts` für sein v3-Bein benutzt (`scripts/eval-store.ts`, `vektoren: true`),
demselben Suchweg (`searchMemories`, limit 10) und denselben Formeln, zwei Läufe je Stufe,
Rangfolge Zeile für Zeile identisch in beiden. Das Aggregat jeder Stufe ist dasselbe wie das
des `npm run eval`-Ausdrucks, der zur selben Uhrzeit voll laufen gelassen wurde
(`auswertung-nomic-0611.txt`, `auswertung-bge-m3-0611.txt`).

| Stufe gewechselt (nomic → bge-m3) | K3PTA, ausgelieferte Fusion | sqlite-vec, reines KNN |
|---|---|---|
| Hit@1 | 75,6 % → **77,8 %** (netto +1 Anfrage) | 42,2 % → **66,7 %** (netto +11 Anfragen) |
| Recall@5 (gekappt) | 91,1 % → **90,0 %** | — |
| Erst-Treffer wechselt die Richtigkeit | **3 von 45** = 6,7 % | **15 von 45** = 33,3 % |
| anderer erster Treffer überhaupt | 7 von 45 = 15,6 % | 25 von 45 = 55,6 % |
| ganze Liste unverändert | 16 von 45 = 35,6 % | **0 von 45** = 0,0 % |

Die Zahl, die die Tabelle trägt, ist nicht der Punktabstand, sondern **der Bruchteil der
Anfragen, dessen Rangfolge das Modell wechselt** — dieselbe Einheit auf beiden Seiten, an
demselben Korpus, mit denselben 45 Anfragen. Beim reinen Vektor hängt die Reihenfolge fast
ganz am Einbett: keine einzige der 45 Listen bleibt unter `bge-m3` so, wie sie unter nomic
war. Bei uns bleibt mehr als ein Drittel unverändert, und die Richtigkeit wechselt in der
Hälfte der Fälle, die der Mitbewerber braucht — auf einem Stand, der vorher schon 33,4
Punkte höher liegt.

Das ist die messbare Lesart von *Robustheit*: Die Fusion holt den Vektor-Gewinn in die
Rangfolge, ohne die Rangfolge an das Modell anzulehnen. **Der Satz gilt nur in dieser
Einheit**: die zwei Punkte Hit@1, die `bge-m3` bei uns holt, sind eine Anfrage von 45, und
dieselbe Stufe **verliert** Recall@5 (91,1 → 90,0) und eine ablenkende Anfrage. Ein
Default-Wechsel wäre damit nicht begründet; `nomic-embed-text` bleibt
(`src/core/embeddings.ts:20`).

Die drei Anfragen, bei denen bei uns die Richtigkeit wechselt, stehen im Protokoll
(`lauf-0611.log.txt`): zwei Umformulierungen kommen hinzu ("Wie fotografiere ich drinnen
richtig?", "Was gibt es an Heiligabend zu essen?"), eine Ablenkung fällt weg ("Was steht zur
Datenbank an?", MRR 1,00 → 0,50).

**Der blinde Fleck auf diesem Weg, und warum die Sonde zuerst da stand:** der erste
Vergleich der beiden Stufen verglich die letzten 22 Zeilen von `npm run eval`. Die sind in
beiden Läufen bytegleich — das letzte Block, das der Ausdruck malt, ist
`Details (v2-Engine)`, also das Bein **ohne Vektoren**, und das berührt kein Einbett. Eine
Schwanzzeilen-Gleichheit war hier kein Beweis, sondern das Erwartete. Deshalb liegt jetzt
die Zeile-für-Zeile-Spur bei den Artefakten, und ihr Aggregat ist gegen den vollen
Ausdruck nachgerechnet (`tests/konkurrenz-einbett-stufen.test.ts`).

## P113, 17:30 MEZ: die Berichtigung -- unsre bge-m3-Rangfolge war schon gemessen, und die Sprache ist kein Modell-Fund

**Was hier zurückgenommen wird.** P111 schrieb um 16:52 MEZ, unsre eigne Rangfolge mit
`bge-m3` sei "**nicht** gemessen", und P112 schrieb denselben Satz als eigne Neuerung. Beide
waren falsch, und die Widerlegung liegt im **eignen Repo**: `docs/belege/tag-0311/eval-bge-m3-1404.log.txt`
(npm run eval, `KEPTA_EMBED_MODEL=bge-m3`, kepta@3.2.125, 2026-11-03 13:04:56 UTC = 14:04 MEZ)
meldet für das v3-Bein **Recall@5 90,0 %, Hit@1 77,8 %, MRR 0,825** und die Kategorien
ablenkung 25 %, graph 100 %, lexikalisch 96 %, temporal 67 %, umschreibung 50 %. Das Sprach-Artefakt
desselben Ordners (`sprachuebergriff-bge-m3-1406.log.txt`) zitiert diese Zahl sogar mit Händen.
Der Lauf von heute (17:09:27 MEZ, 3.2.189) hat **jede einzelne** davon getroffen -- also ist
die korrekte Meldekategorie nicht "neu gemessen", sondern **"über 64 Fassungen reproduziert"**.

**Die Regel, die daraus folgt und die mechanisch zieht:** bevor ein Lauf als Antwort auf eine
offene Frage verkauft wird, gehört die Frage gegen den **Beleg-Ordner** geprüft, nicht nur
gegen die Papiere der eignen Nacht. `tests/konkurrenz-sprachstufen.test.ts` hält das jetzt
fest, indem er die heutigen Zahlen gegen die 3.11-Artefakte rechnet (Fall 3 und Fall 7) --
wer eine Reproduktion als Neufund ausgibt, sieht die alten Artefakte im selben Lauf stehen.

**Zweitens, die Sprache unter beiden Stufen** (`scripts/eval-sprachuebergriff.ts`, 15 Paare,
Ziele geerbt, Richtung englische Frage gegen deutsche Notizen, Gegenrichtung **nicht gemessen**;
3.11 und heute, je Stufe zwei bytegleiche Läufe):

| Bein | Stufe | deutsch Hit@1 | englisch Hit@1 | Sprachpreis |
|---|---|---|---|---|
| v3, ausgeliefertes Retrieval | nomic-embed-text | 60,0 % | **26,7 %** (4/15) | -33,3 Pp |
| v3, ausgeliefertes Retrieval | bge-m3 | 60,0 % | **26,7 %** (4/15) | -33,3 Pp |
| nur das Vektor-Bein (Diagnose) | nomic-embed-text | 73,3 % | 26,7 % | -46,7 Pp |
| nur das Vektor-Bein (Diagnose) | bge-m3 | **46,7 %** | **20,0 %** | -26,7 Pp |

Die Lesung: **das mehrsprachige Einbett ist kein Hebel für die Sprachgrenze.** Am
ausgelieferten Bein ändert es keine einzige Anfrage (26,7 % in beiden Stufen). Am
Diagnose-Bein wird der *Abstand* kleiner (-46,7 → -26,7 Pp) -- und das ist die Falle, die
dieser Abschnitt zubaut: der Abstand schrumpft, weil **beide Seiten fallen** (deutsch
73,3 → 46,7, englisch 26,7 → 20,0). Ein kleinerer Abstand bei niedrigerer englischer
Absolute ist kein Sprachgewinn, sondern ein **Nenner, der still schrumpft** -- dieselbe
Klasse wie P104s "Nenner, der nicht schrumpfen darf". Gemessen und gehalten wird deshalb
jede Seite einzeln, nicht der Preis.

**Was damit für #44 gilt:** die Modell-Hypothese ist geprüft und **widert** (kein Default-
Wechsel, kein Umbau des Bestands -- jeder Knoten müsste neu eingebettet werden,
`src/core/engine.ts:294` filtert nach Modell). Offen bleibt damit ein Mechanismus auf der
**Frage-Seite** (Übersetzung oder zweisprachiger Schlüssel vor dem Einbetten), und der ist
hier weder gebaut noch gemessen; seine Latenz wäre zuerst an `scripts/volllauf`-Art zu messen,
nicht an 58 Notizen.

## Was die letzte Zeile sagt, und was sie nicht sagt

Sie sagt: ein Speicher-Dienst, der gerade verbreitet ist, erreicht auf *unsrem* Korpus
ohne Fakt-Fabrikation **denselben Wert wie unsre eigne naive Baseline** — 23 von 45.
Die Auslieferung liegt 24,5 Punkte darueber.

Sie sagt nicht: dass mem0 schlecht ist. Der Lauf ist eine Konfiguration, kein Produkt:
lokale Einbettung ueber Ollama, kein Cloud-Speicher, kein Reranker, `top_k=5`,
`threshold` ungesetzt, und mem0s eigne Fakt-Fabrikation war **ab** (sonst haette ein LLM
jede Notiz umgeschrieben). mem0s eigene Studie nennt 94,4 auf LongMemEval unter ihrem
eignem Aufbau — das ist eine andere Skala, ein anderer Korpus und ein andrer Richter,
und die Vergleichsseite im Verkaufsordner sagt das auch so.

## Die Latte, die der Repo haelt

`tests/konkurrenz-mem0-latte.test.ts` (7 Faelle) rechnet beide mem0-Zahlen **aus den
Traces neu** und verlangt:

- gegen die Fakten-Zerlegung: **mindestens 30 Punkte** Abstand,
- gegen den fairen Lauf: **mindestens 20 Punkte** Abstand.

Beide Schwellen sind nicht bequem, sondern scharf gewaehlt: unsre *eigne* Baseline
(51,1 %) liegt gegen den fairen Lauf bei Abstand **0** und gegen die Fakten-Konfiguration
bei 26,7 — die Latte faellt also genau dann, wenn das ausgelieferte Retrieval auf
Baseline-Niveau zurueckfaellt. Bewiesen, nicht behauptet: Schwelle probehalber auf 30
gehoben, Fall rot mit `expected 24.5 to be greater than or equal to 30`
(6.11.2026 11:10:56 MEZ), danach zurueck auf 20.

## Die Zahl, die kein Artefakt mehr hat

Das Papier der Leitung vom 2.11. (`audit-2026-10-09/feldzug/P8-MEM0-LAUF-0211.md` in der
Arbeitsmappe) haelt **62,2 % (28/45)** als Haltezahl fest. Ihr Artefakt
`ergebnis-fair.json` lag in `/tmp/konk-mem0-ld/` und existiert nicht mehr; der
dauerhafte Trace des 2.11. ist die Fakten-Konfiguration und sagt 24,4 %. Die 62,2 % sind
hier **nicht** widerlegt — sie sind nicht nachrechenbar. Wer sie brauchen will, muss den
Lauf fahren, dessen Konfiguration sie hatte. Der faire Lauf vom 6.11. ist eine *neue*,
sauber beschriebene Konfiguration; er ersetzt die alte Zahl nicht, er setzt eine zweite
hin, die ein Artefakt hat.

## Nachfahren

    # Kapsel ausserhalb des Projekts, rueckgaengig mit rm -rf
    python3 -m venv /tmp/konk-mem0-fair-0611/venv
    /tmp/konk-mem0-fair-0611/venv/bin/pip install "mem0ai[extras]" ollama
    # Korpus und Anfragen als JSON (liest scripts/eval-corpus.ts):
    npx tsx -e 'import {CORPUS,QUERIES} from "./scripts/eval-corpus"; …'
    /tmp/konk-mem0-fair-0611/venv/bin/python lauf-fair.py

Das Skript liegt bei den Artefakten: `docs/belege/konkurrenz-0611/lauf-fair.py.txt`.
Ergebnis und Protokoll ebenso (`ergebnis-fair-0611*.json`, `lauf-fair.log.txt`).
Dauer 2,4 und 2,6 Sekunden, Spitze 0,15 GiB — kein Netz nach aussen, nur lokale
Ollama-Aufrufe auf 127.0.0.1.
