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
Gegenseite (reines KNN) für `bge-m3`; unsre eigne Rangfolge mit `bge-m3` ist **nicht**
gemessen und steht als nächster Lauf an.

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
